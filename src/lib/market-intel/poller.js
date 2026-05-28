import { prisma } from '@/lib/db';
import { fetchAllFeeds } from './rss-fetcher.js';
import { extractFromArticle } from './entity-extractor.js';
import { matchCandidates } from './fuzzy-matcher.js';
import { createId } from '@paralleldrive/cuid2';

// Process in batches to avoid Claude rate limits on the initial bulk run
const BATCH_SIZE = 10;

async function processItem(item) {
  const extracted = await extractFromArticle(item.title, item.rawContent);
  const matches   = await matchCandidates(extracted.developerNames || []);

  const autoLink  = matches.find(m => m.status === 'AUTO_LINKED');
  const suggested = !autoLink ? matches.find(m => m.status === 'SUGGESTED') : null;
  const bestMatch = autoLink || suggested;

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

  // Process in batches of 10 with 500 ms pause between batches
  for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
    const batch = newItems.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(item =>
        processItem(item).catch(err => {
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
