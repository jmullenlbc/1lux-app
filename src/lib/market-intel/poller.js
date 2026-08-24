import { prisma } from '@/lib/db';
import { fetchAllFeeds } from './rss-fetcher.js';
import { extractFromArticle } from './entity-extractor.js';
import { matchCandidates } from './fuzzy-matcher.js';
import { matchProject } from './project-matcher.js';
import { createId } from '@paralleldrive/cuid2';

// Process in batches to avoid Claude rate limits on the initial bulk run
const BATCH_SIZE = 10;

/**
 * Our jobs, for name-matching against article text. Loaded once per poll rather
 * than once per article — a poll reads hundreds of items and the list does not
 * change while it runs. Only live jobs: a project we finished two years ago
 * appearing in the news is not something anyone needs told about.
 */
async function loadProjectsForMatching() {
  return prisma.project.findMany({
    where:  { procurementStatus: { notIn: ['LOST', 'ABANDONED'] } },
    select: { id: true, name: true, clientId: true },
  }).catch(() => []);
}

async function processItem(item, projects = []) {
  const extracted = await extractFromArticle(item.title, item.rawContent);
  const matches   = await matchCandidates(extracted.developerNames || []);

  const autoLink  = matches.find(m => m.status === 'AUTO_LINKED');
  const suggested = !autoLink ? matches.find(m => m.status === 'SUGGESTED') : null;
  const bestMatch = autoLink || suggested;

  // Which of OUR jobs is this about? Run after the client match on purpose:
  // a job belonging to the client the article already named is a far stronger
  // claim than the same name matching on its own, so the client result feeds in.
  const projectHit = matchProject(
    [item.title, extracted.summary, item.rawContent].filter(Boolean).join(' '),
    projects,
    { matchedClientId: autoLink ? autoLink.clientId : null },
  );

  await prisma.marketSignal.create({
    data: {
      sourceId:       item.sourceId,
      title:          item.title,
      summary:        extracted.summary   || null,
      url:            item.url            || null,
      publishedAt:    item.publishedAt    || null,
      signalType:     extracted.signalType || 'NEWS',
      projectType:    extracted.projectType || null,
      developerNames: JSON.stringify(extracted.developerNames || []),
      linkedClientId: autoLink ? autoLink.clientId : null,
      matchScore:     bestMatch ? bestMatch.score  : null,
      matchStatus:    autoLink  ? 'AUTO_LINKED'
                    : suggested ? 'SUGGESTED'
                    : 'UNREVIEWED',
      // The id is stored for a suggestion too — a suggestion with no pointer to
      // what was suggested is not reviewable. What keeps a guess from reading as
      // a fact is projectMatchStatus, which anything showing this on a project's
      // own record must filter on.
      linkedProjectId:    projectHit ? projectHit.projectId : null,
      projectMatchStatus: projectHit ? projectHit.status : 'UNREVIEWED',
      projectMatchScore:  projectHit ? projectHit.score  : null,
      reviewStatus:   'UNREVIEWED',
    },
  });
}

export async function runPoll() {
  const log = { fetched: 0, skipped: 0, inserted: 0, errors: [] };

  const sources  = await prisma.marketSource.findMany({ where: { isActive: true } });
  const rawItems = await fetchAllFeeds(sources);
  log.fetched    = rawItems.length;

  // Deduplicate by URL
  const existingUrls = new Set(
    (await prisma.marketSignal.findMany({
      select: { url: true },
      where:  { url: { not: null } },
    })).map(s => s.url)
  );

  const newItems  = rawItems.filter(item => item.url && !existingUrls.has(item.url));
  log.skipped     = rawItems.length - newItems.length;

  const projects  = await loadProjectsForMatching();

  // Process in batches of 10 with 500 ms pause between batches
  for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
    const batch = newItems.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(item =>
        processItem(item, projects).catch(err => {
          log.errors.push({ url: item.url, error: err.message });
        })
      )
    );
    log.inserted += batch.length - log.errors.filter((_, j) => j >= log.inserted).length;
    if (i + BATCH_SIZE < newItems.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Re-count inserted accurately
  log.inserted = newItems.length - log.errors.length;

  await prisma.marketSource.updateMany({
    where: { isActive: true },
    data:  { lastPolledAt: new Date() },
  });

  return log;
}
