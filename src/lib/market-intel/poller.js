import { prisma } from '@/lib/db';
import { fetchAllFeeds } from './rss-fetcher.js';
import { extractFromArticle } from './entity-extractor.js';
import { matchCandidates } from './fuzzy-matcher.js';
import { matchProject } from './project-matcher.js';
import { saveSignalTags, attachSignalToClient } from './tags.js';
import { createId } from '@paralleldrive/cuid2';

// Process in batches to avoid Claude rate limits on the initial bulk run
const BATCH_SIZE = 10;

/**
 * Our jobs, for name-matching against article text. Loaded once per poll rather
 * than once per article — a poll reads hundreds of items and the list does not
 * change while it runs.
 *
 * ── Every job, including the ones we lost ──
 * This used to skip LOST and ABANDONED on the reasoning that a dead job is not
 * news. Mike's call, 2026-08-24: include them. A job we lost is a building that
 * is still going up with somebody else's fixtures in it, and finding out it
 * broke ground — or stalled, or changed hands — is worth more than finding out
 * about a job we already have. The bid being over does not make the building
 * uninteresting.
 *
 * The cost is a longer list to match against, which is a false-positive risk;
 * project-matcher.js is what holds that line, by refusing names too short or
 * too generic to claim an article on their own.
 */
async function loadProjectsForMatching() {
  return prisma.project.findMany({
    select: { id: true, name: true, clientId: true },
  }).catch(() => []);
}

async function processItem(item, projects = []) {
  const extracted = await extractFromArticle(item.title, item.rawContent);
  // Every company the article names goes to the matcher, not only the
  // developer: a GC or an architect is a client too (Mike 10-7).
  const allNames  = [...new Set([...(extracted.companies || []).map(c => c.name), ...(extracted.developerNames || [])])];
  const matches   = await matchCandidates(allNames);

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

  const signal = await prisma.marketSignal.create({
    data: {
      sourceId:       item.sourceId,
      title:          item.title,
      summary:        extracted.summary   || null,
      url:            item.url            || null,
      publishedAt:    item.publishedAt    || null,
      signalType:     extracted.signalType || 'NEWS',
      projectType:    extracted.projectType || null,
      unitCount:      extracted.unitCount ?? null,
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

  // Tag rows (0122). An auto-linked client inherits the article's place tags.
  await saveSignalTags(signal.id, extracted, { matches });
  if (autoLink) {
    await attachSignalToClient(signal.id, autoLink.clientId, { companyNames: [autoLink.candidateName] }).catch(() => {});
  }
}

/**
 * Re-read tags for signals that have none yet (0122 backfill). Older articles
 * never kept their body, so this reads title plus summary: enough for the
 * company, the place and usually the unit count. Runs in small slices so one
 * call stays well under the 30 second read wall.
 */
export async function retagUntagged({ limit = 25 } = {}) {
  const log = { tagged: 0, errors: [] };
  const signals = await prisma.marketSignal.findMany({
    where:   { taggedAt: null },
    orderBy: { publishedAt: 'desc' },
    take:    limit,
    select:  { id: true, title: true, summary: true, linkedClientId: true, matchStatus: true, developerNames: true },
  });
  const remaining = Math.max(0, (await prisma.marketSignal.count({ where: { taggedAt: null } })) - signals.length);
  for (const s of signals) {
    try {
      const extracted = await extractFromArticle(s.title, s.summary || '');
      const matches   = s.linkedClientId && ['AUTO_LINKED', 'CONFIRMED'].includes(s.matchStatus)
        ? (() => { try { return JSON.parse(s.developerNames || '[]').map(n => ({ candidateName: n, clientId: s.linkedClientId, status: 'AUTO_LINKED' })); } catch { return []; } })()
        : [];
      await saveSignalTags(s.id, extracted, { matches });
      if (extracted.unitCount) {
        await prisma.marketSignal.update({ where: { id: s.id }, data: { unitCount: extracted.unitCount } }).catch(() => {});
      }
      if (matches.length) {
        await attachSignalToClient(s.id, s.linkedClientId, { companyNames: matches.map(m => m.candidateName) }).catch(() => {});
      }
      log.tagged++;
    } catch (err) {
      log.errors.push({ id: s.id, error: err.message });
      // Mark it so a broken article does not block the queue forever.
      await prisma.marketSignal.update({ where: { id: s.id }, data: { taggedAt: new Date() } }).catch(() => {});
    }
  }
  log.remaining = remaining;
  return log;
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
