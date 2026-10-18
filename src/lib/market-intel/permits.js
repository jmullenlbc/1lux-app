import { prisma } from '@/lib/db';
import { matchCandidates } from './fuzzy-matcher';
import { saveSignalTags, attachSignalToClient } from './tags';
import { PERMIT_SOURCE_TYPE, profileForSource, permitQueryUrl, permitQueryBody, permitRows, permitToSignal, houstonProjects } from './permitRules';
import { fetchHoustonRows } from './houstonFeed';
import { walkAccela } from './accelaFeed';
import { normalizeTagName, signalBuildingTags } from './tagRules';
import { featuresOf, suppressedBy } from './feedbackRules';
import { matchProject } from './project-matcher';
import { noticeTypes, MUNICIPAL_KINDS } from './stages';

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
      // One project, many building permits: fold them before the $10M floor.
      rows = houstonProjects(await fetchHoustonRows(profile, since, now));
    } else {
      const body = permitQueryBody(profile, since, { now });
      const res  = await fetch(permitQueryUrl(profile, since, { limit, now }), {
        ...(body ? { method: 'POST', body } : {}),
        headers: { 'User-Agent': 'ILC-Studios-MarketIntel/1.0', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(profile.headers || {}) },
        signal: AbortSignal.timeout(20000),
      });
      const json = await res.json();
      rows = permitRows(profile, json);
      // A case filed as several rows (Phoenix rezonings) becomes one.
      if (profile.fold) rows = profile.fold(rows);
    }
  } catch (err) {
    log.errors.push({ error: `fetch failed: ${err.message}` });
    return log;
  }
  log.fetched = rows.length;
  // A list whose numbers live on each record's page (TDLR TABS): open the new big ones.
  if (profile.detail) rows = await withDetails(source, profile, rows, { deadline, log });

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
/**
 * Rows worth a look (profile.worthDetail) that are not saved yet, each merged
 * with its own page (profile.parseDetail). Saved rows are dropped: without
 * their page they would blank the saved counts. Four pages at a time; rows
 * left when the deadline nears wait for the next slice (log.partial).
 */
async function withDetails(source, profile, rows, { deadline, log }) {
  const keyOf = (r) => profile.map(r).permitNumber;
  const want = rows.filter(r => profile.worthDetail(r));
  const saved = await prisma.marketSignal.findMany({ where: { sourceId: source.id, permitNumber: { in: want.map(keyOf) } }, select: { permitNumber: true } });
  const known = new Set(saved.map(s => s.permitNumber));
  const todo = want.filter(r => !known.has(keyOf(r)));
  const out = [];
  for (let i = 0; i < todo.length; i += 4) {
    if (Date.now() > deadline - 8000) { log.partial = true; break; }
    const batch = await Promise.all(todo.slice(i, i + 4).map(async (r) => {
      try {
        const res = await fetch(profile.detailUrl(r), { headers: { 'User-Agent': 'ILC-Studios-MarketIntel/1.0', ...(profile.headers || {}) }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        return { ...r, ...profile.parseDetail(await res.text()) };
      } catch { return null; }
    }));
    out.push(...batch.filter(Boolean));
  }
  return out;
}

async function saveSignals(source, signals, log, deadline = Infinity) {
  const existing = await prisma.marketSignal.findMany({
    where:  { sourceId: source.id, permitNumber: { in: signals.map(s => s.permitNumber) } },
    select: { id: true, permitNumber: true, unitCount: true, unitsEstimated: true, grossSf: true, valuation: true, contractorName: true, neighborhood: true },
  });
  const byNumber = new Map(existing.map(e => [e.permitNumber, e]));
  // Learned rules (0130): a rule an admin applied skips matching new rows.
  const rules = await prisma.suppressionRule.findMany({ where: { status: 'APPLIED', archivedAt: null } }).catch(() => []);
  log.suppressed = log.suppressed || 0;
  // Our jobs, for the project match (Mike 10-14: city filings match our project names too).
  const projects = await loadProjects();

  for (const s of signals) {
    // Amplify cuts any request at ~30 s with an empty 504. A first pull of a
    // city is hundreds of rows, each a handful of DB round trips, so the work is
    // done in slices: stop at the deadline, say so, and the page presses again.
    // lastPolledAt stays unset on a partial run so the next slice looks back
    // the same 18 months; rows already saved are skipped by permit number.
    if (Date.now() > deadline) { log.partial = true; break; }
    try {
      const { extracted, accumulate, ...data } = s;
      const prior = byNumber.get(s.permitNumber);
      if (prior) {
        // A Houston project row is the sum of its building permits; a later
        // poll sees only the newest buildings, so a smaller fold leaves the
        // saved row alone (a bigger one, from a longer look-back, replaces it).
        if (accumulate && (data.valuation || 0) < (prior.valuation || 0)) continue;
        // The city revises rows (a change of contractor, a corrected count).
        // A council case moves body to body ("Planning Commission: Approved"
        // then "City Council: Passed"), carried in neighborhood.
        const changed = prior.unitCount !== data.unitCount || prior.unitsEstimated !== !!data.unitsEstimated || prior.grossSf !== (data.grossSf ?? null) || prior.valuation !== data.valuation || prior.contractorName !== data.contractorName
          || (data.neighborhood !== undefined && prior.neighborhood !== data.neighborhood);
        if (changed) {
          await prisma.marketSignal.update({ where: { id: prior.id }, data: { unitCount: data.unitCount, unitsEstimated: !!data.unitsEstimated, grossSf: data.grossSf ?? null, valuation: data.valuation, contractorName: data.contractorName, neighborhood: data.neighborhood, title: data.title, summary: data.summary } });
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
      // Every named company is checked against clients, not only the owner:
      // an applicant, GC or architect on the filing can be ours too.
      const matches  = await matchCandidates(companyNamesOf(extracted));
      const autoLink = matches.find(m => m.status === 'AUTO_LINKED');
      const best     = autoLink || matches.find(m => m.status === 'SUGGESTED');
      const tagged   = { ...extracted, noticeTypes: noticeTypes(data), ...signalBuildingTags(data, extracted.projectNames || []) };
      const projectHit = matchProject(matchText(data, extracted), projects, { matchedClientId: autoLink ? autoLink.clientId : null });
      const signal   = await prisma.marketSignal.create({
        data: {
          sourceId:       source.id,
          ...data,
          projectType:    null,
          developerNames: JSON.stringify(extracted.developerNames),
          linkedClientId: autoLink ? autoLink.clientId : null,
          matchScore:     best ? best.score : null,
          matchStatus:    autoLink ? 'AUTO_LINKED' : best ? 'SUGGESTED' : 'UNREVIEWED',
          linkedProjectId:    projectHit ? projectHit.projectId : null,
          projectMatchStatus: projectHit ? projectHit.status : 'UNREVIEWED',
          projectMatchScore:  projectHit ? projectHit.score : null,
          reviewStatus:   'UNREVIEWED',
        },
      });
      await saveSignalTags(signal.id, tagged, { matches });
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
  // Older city filings get notice tags and a fresh client/job match (10-14).
  if (!more && Date.now() < deadline) {
    const r = await retagMunicipal({ deadline }).catch(() => ({ done: 0, more: false }));
    if (r.more) more = true;
    if (r.done) logs.push({ source: 'Retag older city filings', fetched: r.done, kept: r.done, inserted: 0, updated: r.done, errors: [] });
  }
  // Building type tags (Mike 10-17) on every older row, filings and articles.
  if (!more && Date.now() < deadline) {
    const r = await retagBuildingTypes({ deadline }).catch(() => ({ done: 0, more: false }));
    if (r.more) more = true;
    if (r.done) logs.push({ source: 'Building type tags on older rows', fetched: r.done, kept: r.done, inserted: 0, updated: r.done, errors: [] });
  }
  return { logs, more };
}

/**
 * Backfill (Mike 10-17) for rows saved before building type tags: every
 * project related row with no BUILDING tag gets them, plus Affordable or
 * Market rate on housing, by rules, no AI.
 * Screened out articles are skipped (nothing shows them), and so are articles
 * the reader has not tagged yet (taggedAt empty): Screen articles adds
 * theirs. Every row gets at least "Other", so the batches end.
 */
export async function retagBuildingTypes({ deadline = Infinity, batch = 200 } = {}) {
  const rows = await prisma.marketSignal.findMany({
    where:  { taggedAt: { not: null }, OR: [{ projectRelated: null }, { projectRelated: true }], tags: { none: { tag: { kind: 'BUILDING' } } } },
    select: { id: true, permitClass: true, title: true, summary: true, unitCount: true, projectType: true, tags: { select: { tag: { select: { kind: true, name: true } } } } },
    take:   batch,
  });
  let done = 0;
  for (const r of rows) {
    if (Date.now() > deadline) return { done, more: true };
    const projectNames = r.tags.map(l => l.tag).filter(t => t.kind === 'PROJECT').map(t => t.name);
    try {
      await saveSignalTags(r.id, signalBuildingTags(r, projectNames));
      done += 1;
    } catch { /* one bad row does not stop the batch */ }
  }
  return { done, more: rows.length === batch };
}

/** Every company a filing names (owner, applicant, contractor), deduped. */
function companyNamesOf(extracted = {}) {
  const names = [...(extracted.companies || []).map(c => (typeof c === 'string' ? c : c?.name)), ...(extracted.developerNames || [])];
  const seen = new Set();
  return names.filter(n => n && !seen.has(n.trim().toLowerCase()) && seen.add(n.trim().toLowerCase()));
}

/** The text a filing is matched against our project names with. */
function matchText(data, extracted = {}) {
  return [data.title, data.summary, ...(extracted.projectNames || [])].filter(Boolean).join(' ');
}

async function loadProjects() {
  return prisma.project.findMany({ select: { id: true, name: true, clientId: true } }).catch(() => []);
}

/**
 * Backfill (Mike 10-14) for city filings saved before notice tags, the
 * all-company client match and the project match existed. A row with no
 * NOTICE tag gets its notice tags; if nobody has ruled on its client or job
 * yet, the matchers run again on its saved company tags and text. Runs in
 * batches inside the Pull deadline; `more` is true while rows remain.
 */
export async function retagMunicipal({ deadline = Infinity, batch = 100 } = {}) {
  const rows = await prisma.marketSignal.findMany({
    where:  { kind: { in: MUNICIPAL_KINDS }, tags: { none: { tag: { kind: 'NOTICE' } } } },
    select: {
      id: true, kind: true, permitClass: true, title: true, summary: true,
      linkedClientId: true, matchStatus: true, linkedProjectId: true, projectMatchStatus: true,
      tags: { select: { tag: { select: { kind: true, name: true } } } },
    },
    take: batch,
  });
  if (!rows.length) return { done: 0, more: false };
  const projects = await loadProjects();
  let done = 0;
  for (const r of rows) {
    if (Date.now() > deadline) return { done, more: true };
    const names    = r.tags.map(l => l.tag).filter(t => t.kind === 'COMPANY').map(t => t.name);
    const projNames = r.tags.map(l => l.tag).filter(t => t.kind === 'PROJECT').map(t => t.name);
    const data = {};
    let autoLink = null;
    if (!r.linkedClientId && r.matchStatus === 'UNREVIEWED' && names.length) {
      const matches = await matchCandidates(names).catch(() => []);
      autoLink = matches.find(m => m.status === 'AUTO_LINKED');
      const best = autoLink || matches.find(m => m.status === 'SUGGESTED');
      if (best) Object.assign(data, { linkedClientId: autoLink ? autoLink.clientId : null, matchScore: best.score, matchStatus: autoLink ? 'AUTO_LINKED' : 'SUGGESTED' });
    }
    if (!r.linkedProjectId && (!r.projectMatchStatus || r.projectMatchStatus === 'UNREVIEWED')) {
      const hit = matchProject(matchText(r, { projectNames: projNames }), projects, { matchedClientId: autoLink ? autoLink.clientId : r.linkedClientId });
      if (hit) Object.assign(data, { linkedProjectId: hit.projectId, projectMatchStatus: hit.status, projectMatchScore: hit.score });
    }
    try {
      if (Object.keys(data).length) await prisma.marketSignal.update({ where: { id: r.id }, data });
      // Notice tags only: the company tags are already on (with their roles),
      // and attachSignalToClient below writes the client onto the matched one.
      await saveSignalTags(r.id, { noticeTypes: noticeTypes(r) });
      if (autoLink) await attachSignalToClient(r.id, autoLink.clientId, { companyNames: [autoLink.candidateName] }).catch(() => {});
      done += 1;
    } catch { /* one bad row does not stop the batch */ }
  }
  return { done, more: rows.length === batch };
}
