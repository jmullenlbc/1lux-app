import { prisma } from '@/lib/db';
import { matchCandidates } from './fuzzy-matcher';
import { saveSignalTags, attachSignalToClient } from './tags';
import { PERMIT_SOURCE_TYPE, profileForSource, permitQueryUrl, permitRows, permitToSignal } from './permitRules';
import { fetchHoustonRows } from './houstonFeed';
import { walkAccela } from './accelaFeed';
import { normalizeTagName } from './tagRules';
import { featuresOf, suppressedBy } from './feedbackRules';

/**
 * Pull one city's permit feed into MarketSignal rows (migration 0123).
 *
 * No AI call: the city already tells us the contractor, the address, the
 * unit count and the value. The contractor goes through the same matcher the
 * articles use, so a permit pulled by a client shows up on that client.
 *
 * A source row with sourceType ARCGIS_PERMITS and market = a profile key is a
 * permit feed. First run looks back 18 months; after that, 14 days before the
 * last poll so a late-published row is not missed. Rows are keyed on the
 * city's permit number, so re-running never duplicates.
 */
export async function pollPermitSource(source, { limit = 500, now = new Date(), deadline = Infinity } = {}) {
  const log = { source: source.name, fetched: 0, kept: 0, inserted: 0, updated: 0, errors: [], partial: false };
  const profile = profileForSource(source);
  if (!profile) { log.errors.push({ error: `no permit profile for market ${source.market}` }); return log; }

  const since = source.lastPolledAt
    ? new Date(new Date(source.lastPolledAt).getTime() - 14 * 86400e3)
    : new Date(now.getTime() - (profile.firstLookbackDays || 548) * 86400e3);

  if (profile.api === 'accela') return pollAccelaSource(source, profile, since, { now, deadline, log });

  let rows = [];
  try {
    if (profile.api === 'houston') {
      rows = await fetchHoustonRows(profile, since, now);
    } else {
      const res  = await fetch(permitQueryUrl(profile, since, { limit }), { headers: { 'User-Agent': 'ILC-Studios-MarketIntel/1.0', ...(profile.headers || {}) }, signal: AbortSignal.timeout(20000) });
      const json = await res.json();
      rows = permitRows(profile, json);
    }
  } catch (err) {
    log.errors.push({ error: `fetch failed: ${err.message}` });
    return log;
  }
  log.fetched = rows.length;

  // One case number, one row: a council agenda lists the same rezoning once
  // per body (Mesa: council ordinance and P&Z), so keep the first (newest),
  // unless a later copy says it passed.
  const byCase = new Map();
  for (const s of rows.map(a => permitToSignal(profile, a)).filter(Boolean)) {
    const prior = byCase.get(s.permitNumber);
    if (!prior || (/approved/i.test(s.title) && !/approved/i.test(prior.title))) byCase.set(s.permitNumber, s);
  }
  const signals = [...byCase.values()];
  log.kept = signals.length;
  if (!signals.length) return log;

  await saveSignals(source, signals, log, deadline);

  if (!log.partial) await prisma.marketSource.update({ where: { id: source.id }, data: { lastPolledAt: now } }).catch(() => {});
  return log;
}

/**
 * A portal that is walked page by page (Accela). Each window is saved as soon
 * as it is read and `pullCursorAt` moves to the end of it, so a run cut by
 * the deadline resumes where it stopped instead of starting over. When the
 * walk reaches now, the cursor clears and lastPolledAt is set like any feed.
 */
async function pollAccelaSource(source, profile, since, { now, deadline, log }) {
  const start = source.pullCursorAt ? new Date(source.pullCursorAt) : since;
  const saved = await prisma.marketSignal.findMany({ where: { sourceId: source.id, permitNumber: { not: null } }, select: { permitNumber: true } });
  const known = new Set(saved.map(r => r.permitNumber));
  let cursor = source.pullCursorAt ? new Date(source.pullCursorAt) : null;
  try {
    for await (const w of walkAccela(profile, start, now, { known, deadline })) {
      log.fetched += w.rows.length;
      const signals = w.rows.map(a => permitToSignal(profile, a)).filter(Boolean);
      log.kept += signals.length;
      if (signals.length) await saveSignals(source, signals, log, deadline);
      if (w.complete && !log.partial) cursor = w.end;
      else { log.partial = true; break; }
    }
  } catch (err) {
    log.errors.push({ error: `fetch failed: ${err.message}` });
    log.partial = true;
  }
  const data = log.partial ? { pullCursorAt: cursor } : { lastPolledAt: now, pullCursorAt: null };
  await prisma.marketSource.update({ where: { id: source.id }, data }).catch(() => {});
  return log;
}

/** Insert new signals, revise changed ones; stops at the deadline and marks the log partial. */
async function saveSignals(source, signals, log, deadline = Infinity) {
  const existing = await prisma.marketSignal.findMany({
    where:  { sourceId: source.id, permitNumber: { in: signals.map(s => s.permitNumber) } },
    select: { id: true, permitNumber: true, unitCount: true, valuation: true, contractorName: true, neighborhood: true },
  });
  const byNumber = new Map(existing.map(e => [e.permitNumber, e]));
  // Learned rules (0130): a rule an admin applied skips matching new rows.
  const rules = await prisma.suppressionRule.findMany({ where: { status: 'APPLIED', archivedAt: null } }).catch(() => []);
  log.suppressed = log.suppressed || 0;

  for (const s of signals) {
    // Amplify cuts any request at ~30 s with an empty 504. A first pull of a
    // city is hundreds of rows, each a handful of DB round trips, so the work is
    // done in slices: stop at the deadline, say so, and the page presses again.
    // lastPolledAt stays unset on a partial run so the next slice looks back
    // the same 18 months; rows already saved are skipped by permit number.
    if (Date.now() > deadline) { log.partial = true; break; }
    try {
      const { extracted, ...data } = s;
      const prior = byNumber.get(s.permitNumber);
      if (prior) {
        // The city revises rows (a change of contractor, a corrected count).
        // A council case moves body to body ("Planning Commission: Approved"
        // then "City Council: Passed"), carried in neighborhood.
        const changed = prior.unitCount !== data.unitCount || prior.valuation !== data.valuation || prior.contractorName !== data.contractorName
          || (data.neighborhood !== undefined && prior.neighborhood !== data.neighborhood);
        if (changed) {
          await prisma.marketSignal.update({ where: { id: prior.id }, data: { unitCount: data.unitCount, valuation: data.valuation, contractorName: data.contractorName, neighborhood: data.neighborhood, title: data.title, summary: data.summary } });
          log.updated += 1;
        }
        continue;
      }
      const rule = rules.length ? suppressedBy(rules, featuresOf({ ...data, sourceId: source.id, city: data.city, tags: (extracted.companies || []).map(c => ({ role: c.role, tag: { kind: 'COMPANY', normalized: normalizeTagName(c.name, 'COMPANY') } })) })) : null;
      if (rule) {
        log.suppressed += 1;
        await prisma.suppressionRule.update({ where: { id: rule.id }, data: { hits: { increment: 1 } } }).catch(() => {});
        continue;
      }
      const matches  = await matchCandidates(extracted.developerNames);
      const autoLink = matches.find(m => m.status === 'AUTO_LINKED');
      const best     = autoLink || matches.find(m => m.status === 'SUGGESTED');
      const signal   = await prisma.marketSignal.create({
        data: {
          sourceId:       source.id,
          ...data,
          projectType:    null,
          developerNames: JSON.stringify(extracted.developerNames),
          linkedClientId: autoLink ? autoLink.clientId : null,
          matchScore:     best ? best.score : null,
          matchStatus:    autoLink ? 'AUTO_LINKED' : best ? 'SUGGESTED' : 'UNREVIEWED',
          reviewStatus:   'UNREVIEWED',
        },
      });
      await saveSignalTags(signal.id, extracted, { matches });
      if (autoLink) await attachSignalToClient(signal.id, autoLink.clientId, { companyNames: [autoLink.candidateName] }).catch(() => {});
      log.inserted += 1;
    } catch (err) {
      log.errors.push({ permitNumber: s.permitNumber, error: err.message });
    }
  }
}

/**
 * Every active permit feed. Called from runPoll and from the Permits tab button.
 * Returns `{ logs, more }`; `more` is true when the deadline cut the run short
 * and the caller should run it again to finish.
 */
export async function pollAllPermits(opts = {}) {
  const deadline = opts.deadline ?? Infinity;
  const sources  = await prisma.marketSource.findMany({ where: { isActive: true, sourceType: PERMIT_SOURCE_TYPE } });
  const logs = [];
  let more = false;
  for (const s of sources) {
    if (Date.now() > deadline) { more = true; break; }
    const log = await pollPermitSource(s, opts);
    logs.push(log);
    if (log.partial) more = true;
  }
  return { logs, more };
}
