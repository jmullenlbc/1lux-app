import { prisma } from '@/lib/db';
import { fetchAllFeeds, fetchArticleText } from './rss-fetcher.js';
import { extractFromArticle } from './entity-extractor.js';
import { matchCandidates } from './fuzzy-matcher.js';
import { matchProject } from './project-matcher.js';
import { saveSignalTags, attachSignalToClient } from './tags.js';
import { pollAllPermits } from './permits.js';
import { estimateUnits } from './permitRules.js';

// Migration 0131 (Mike 10-14): an article about housing that gives a gross SF
// but no unit count gets about one unit per 1,000 gross SF, marked estimated.
// Only the headline and the reader's summary are read, never the whole page,
// so a second project's figure is not picked up.
const articleUnits = (extracted, title, summary) =>
  estimateUnits({ unitCount: extracted.unitCount || null, buildingKind: [title, summary].filter(Boolean).join(' '), what: extracted.projectType || '' });
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

  // Not about a project (Mike 10-8: "if it's not project related we don't
  // need it"). The row is still saved, because the poller dedupes by URL and
  // would otherwise fetch and re-read the same article every run, but it is
  // saved hidden: no matching, no tags, projectRelated false. Nothing shows it.
  if (extracted.projectRelated === false) {
    await prisma.marketSignal.create({
      data: {
        sourceId:       item.sourceId,
        title:          item.title,
        summary:        extracted.summary || null,
        url:            item.url          || null,
        publishedAt:    item.publishedAt  || null,
        signalType:     extracted.signalType || 'NEWS',
        projectType:    extracted.projectType || null,
        projectRelated: false,
        developerNames: '[]',
        taggedAt:       new Date(),
        reviewStatus:   'UNREVIEWED',
      },
    });
    return { screenedOut: true };
  }

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

  const est = articleUnits(extracted, item.title, extracted.summary);
  const signal = await prisma.marketSignal.create({
    data: {
      sourceId:       item.sourceId,
      title:          item.title,
      summary:        extracted.summary   || null,
      url:            item.url            || null,
      publishedAt:    item.publishedAt    || null,
      signalType:     extracted.signalType || 'NEWS',
      projectType:    extracted.projectType || null,
      // null = the reader did not answer; shown, and screened again later.
      projectRelated: extracted.projectRelated ?? null,
      unitCount:      est.unitCount ?? null,
      grossSf:        est.grossSf,
      unitsEstimated: est.unitsEstimated,
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

  // The reader never answered: leave taggedAt empty so Screen articles reads
  // it once the model call works again, instead of filing it as "tagged".
  if (extracted.failed) return { readFailed: true, error: extracted.error };

  // Tag rows (0122). An auto-linked client inherits the article's place tags.
  await saveSignalTags(signal.id, extracted, { matches });
  if (autoLink) {
    await attachSignalToClient(signal.id, autoLink.clientId, { companyNames: [autoLink.candidateName] }).catch(() => {});
  }
  return {};
}

// Articles the reader has not yet screened for "is this about a project"
// (0125), or that have no tags yet (0122). Permits are never read here.
export const UNSCREENED = { kind: 'ARTICLE', OR: [{ projectRelated: null }, { taggedAt: null }] };

/**
 * Screen and re-read older articles (the "Screen articles" button). Each
 * article is read once more from title plus summary (its body was never
 * kept): the reader says whether it is about a project at all (0125) and,
 * when it is, which companies, place and unit count it names (0122). An
 * article that is not about a project is marked and loses nothing else; it
 * simply stops showing. Runs in small slices so one call stays well under
 * the 30 second read wall.
 */
export async function retagUntagged({ limit = 25, deadline = Date.now() + 22000, concurrency = 5 } = {}) {
  const log = { tagged: 0, screenedOut: 0, readFailed: 0, readError: null, errors: [] };
  const signals = await prisma.marketSignal.findMany({
    where:   UNSCREENED,
    orderBy: { publishedAt: 'desc' },
    take:    limit,
    select:  { id: true, title: true, summary: true, url: true, linkedClientId: true, matchStatus: true, developerNames: true, taggedAt: true, projectRelated: true, unitCount: true, unitsEstimated: true },
  });
  const remaining = Math.max(0, (await prisma.marketSignal.count({ where: UNSCREENED })) - signals.length);
  let skipped = 0;

  async function readOne(s) {
    try {
      // The article page itself when it answers (Mike 10-9: headline-only
      // tags are thin); the stored summary otherwise.
      const page      = await fetchArticleText(s.url);
      const extracted = await extractFromArticle(s.title, page || s.summary || '');
      // The model call itself failed (key, model id, credit). Leave the row
      // untouched so it is asked again later.
      if (extracted.failed) {
        log.readFailed++;
        log.readError = log.readError || extracted.error;
        return;
      }
      // A reader that answered but left the question blank gets the benefit
      // of the doubt. A row a person already kept ("Keep it" on a screened out
      // article sets projectRelated true and clears taggedAt) stays kept.
      const related = s.projectRelated === true ? true : (extracted.projectRelated ?? true);
      await prisma.marketSignal.update({
        where: { id: s.id },
        data:  {
          projectRelated: related,
          signalType:     extracted.signalType || 'NEWS',
          ...(extracted.projectType ? { projectType: extracted.projectType } : {}),
          ...(page && extracted.summary ? { summary: extracted.summary } : {}),
          ...(related ? {} : { taggedAt: s.taggedAt || new Date() }),
        },
      });
      if (!related) { log.screenedOut++; return; }
      const matches   = s.linkedClientId && ['AUTO_LINKED', 'CONFIRMED'].includes(s.matchStatus)
        ? (() => { try { return JSON.parse(s.developerNames || '[]').map(n => ({ candidateName: n, clientId: s.linkedClientId, status: 'AUTO_LINKED' })); } catch { return []; } })()
        : [];
      await saveSignalTags(s.id, extracted, { matches });
      const est = articleUnits(extracted, s.title, extracted.summary || s.summary);
      if (est.unitCount && (!est.unitsEstimated || !s.unitCount || s.unitsEstimated)) {
        await prisma.marketSignal.update({ where: { id: s.id }, data: { unitCount: est.unitCount, unitsEstimated: est.unitsEstimated, grossSf: est.grossSf } }).catch(() => {});
      }
      if (matches.length) {
        await attachSignalToClient(s.id, s.linkedClientId, { companyNames: matches.map(m => m.candidateName) }).catch(() => {});
      }
      log.tagged++;
    } catch (err) {
      log.errors.push({ id: s.id, error: err.message });
      // Mark it so a broken article does not block the queue forever.
      await prisma.marketSignal.update({ where: { id: s.id }, data: { taggedAt: new Date(), projectRelated: true } }).catch(() => {});
    }
  }

  // Five at a time, inside the slice (Amplify cuts a request at ~30 s).
  for (let i = 0; i < signals.length; i += concurrency) {
    if (Date.now() > deadline) { skipped = signals.length - i; break; }
    await Promise.all(signals.slice(i, i + concurrency).map(readOne));
    // Three failed calls and nothing read: the reader is down, stop spending.
    if (log.readFailed >= 3 && log.tagged + log.screenedOut === 0) { skipped = signals.length - i - concurrency; break; }
  }
  // Rows the reader could not read are still waiting.
  log.remaining = remaining + log.readFailed + Math.max(0, skipped);
  return log;
}

/**
 * `deadline` (ms epoch): Amplify cuts any request at ~30 s with an empty 504,
 * so a big first run is done in slices. Past the deadline the loop stops,
 * `log.more` is true, and the page presses again; articles already saved are
 * skipped by URL, so nothing is done twice.
 */
export async function runPoll({ deadline = Infinity } = {}) {
  const log = { fetched: 0, skipped: 0, inserted: 0, errors: [], more: false };

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
  let done = 0;
  for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
    // Always do the first batch: fetching the feeds can eat most of the slice,
    // and a slice that saves nothing would never finish.
    if (i > 0 && Date.now() > deadline) { log.more = true; break; }
    const batch = newItems.slice(i, i + BATCH_SIZE);
    done += batch.length;
    await Promise.all(
      batch.map(item =>
        processItem(item, projects).then(r => {
          // Saved, but the reader never answered: counted so the Sources page
          // can say "the reader is failing" instead of "all done" (10-8).
          if (r?.readFailed) { log.readFailed = (log.readFailed || 0) + 1; log.readError = log.readError || r.error; }
        }).catch(err => {
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
  log.inserted = done - log.errors.length;
  log.remaining = newItems.length - done;

  if (!log.more) {
    await prisma.marketSource.updateMany({
      where: { isActive: true, sourceType: 'RSS' },
      data:  { lastPolledAt: new Date() },
    });
  }

  // City permit feeds (0123) ride the same poll. One bad city must not stop the news.
  try {
    const permits = await pollAllPermits({ deadline });
    log.permits = permits.logs;
    if (permits.more) log.more = true;
  } catch (err) {
    log.errors.push({ url: 'permits', error: err.message });
  }

  return log;
}
