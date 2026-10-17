/**
 * The GC portal's grouping (Mike 10-16): every web budget from one email
 * domain, grouped by project, and the "Is X the same project as Y?" questions
 * the person who made the newer budget gets to answer.
 *
 * Rules Mike set:
 *   "lone tree ranch" and "lone ranch"               -> ASK
 *   "lone tree ranch phase 1" and "... phase 2"      -> DIFFERENT, no ask
 *   identical names (after cleaning)                 -> SAME, no ask
 *   an answered pair                                 -> never asked again
 *   same city raises confidence; different cities (both typed) -> no ask
 *
 * Pure: rows in, groups and questions out. No Prisma, so the unit tests run it
 * without a database and the portal route stays thin.
 */
import { cleanJobName } from './duplicateMatch.js';

/** "1", "ii", "7a": the part of a name that says WHICH phase, lot or building. */
const NUMBERISH = /^(\d+[a-z]?|[ivx]{1,4})$/;
const ROMAN = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };

/** "Lone Tree Ranch Phase 2" -> { clean: 'lone tree ranch 2', names: [lone,tree,ranch], numbers: ['2'] } */
export function nameParts(raw) {
  // "Phase II" and "Phase 2" are the same phase.
  const clean = cleanJobName(raw).split(' ').map(w => ROMAN[w] || w).join(' ');
  const words = clean ? clean.split(' ') : [];
  return {
    clean,
    numbers: words.filter(w => NUMBERISH.test(w)),
    names: words.filter(w => !NUMBERISH.test(w)),
  };
}

/**
 * How two budget names relate.
 * @returns {{ verdict: 'same'|'ask'|'different', reason: string }}
 */
export function compareNames(a, b) {
  const A = nameParts(a);
  const B = nameParts(b);
  if (!A.clean || !B.clean) return { verdict: 'different', reason: 'a name is blank' };
  if (A.clean === B.clean) return { verdict: 'same', reason: 'same name' };
  if (A.numbers.length && B.numbers.length && A.numbers.join(' ') !== B.numbers.join(' ')) {
    return { verdict: 'different', reason: `different phase or building numbers (${A.numbers.join(' ')} vs ${B.numbers.join(' ')})` };
  }
  const setA = new Set(A.names);
  const setB = new Set(B.names);
  const shared = [...setA].filter(w => setB.has(w));
  if (!shared.length || !shared.some(w => w.length >= 4)) {
    return { verdict: 'different', reason: 'no real word in common' };
  }
  if (A.names.join(' ') === B.names.join(' ')) {
    return { verdict: 'ask', reason: 'same words, one of them carries a phase or building number' };
  }
  const score = shared.length / Math.max(setA.size, setB.size);
  if (score >= 0.5) return { verdict: 'ask', reason: `share the word${shared.length > 1 ? 's' : ''} "${shared.join('", "')}"` };
  return { verdict: 'different', reason: 'too few words in common' };
}

function placeOf(r) {
  const city = String(r?.city || '').trim().toLowerCase();
  const state = String(r?.state || '').trim().toUpperCase();
  return city && state ? `${city}, ${state}` : '';
}

/**
 * Groups and open questions for one company's budgets.
 *
 * @param {Array}  rows       [{ id, projectName, city, state, email, createdAt }]
 * @param {Array}  decisions  [{ draftId, otherDraftId, same }] answered pairs
 * @returns {{ groups: Array<{ key, name, budgets }>, asks: Array<{ draftId, otherDraftId, newerName, olderName, askEmail, reason }> }}
 *
 * A group is one project. Two budgets land in the same group when their
 * cleaned names are identical or someone answered "Yes, same project". A "No"
 * keeps them apart. Every other near match becomes a question for the maker
 * of the newer budget (its `email`), one question per other project.
 */
export function groupBudgets(rows, decisions = []) {
  const list = (Array.isArray(rows) ? rows : []).filter(r => r && r.id);
  const parent = new Map(list.map(r => [r.id, r.id]));
  const find = id => {
    let p = parent.get(id);
    while (p !== parent.get(p)) p = parent.get(p);
    parent.set(id, p);
    return p;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const byId = new Map(list.map(r => [r.id, r]));

  // Identical names first, then the "yes" answers.
  const byClean = new Map();
  for (const r of list) {
    const clean = cleanJobName(r.projectName);
    if (!clean) continue;
    if (byClean.has(clean)) union(r.id, byClean.get(clean));
    else byClean.set(clean, r.id);
  }
  // A copy made with the Copy button is its source's project, no question.
  for (const r of list) {
    const src = r.copiedFrom?.id || r.copiedFromId;
    if (src && byId.has(src)) union(r.id, src);
  }
  const decided = new Map(); // "a|b" -> same
  for (const d of Array.isArray(decisions) ? decisions : []) {
    if (!d || !byId.has(d.draftId) || !byId.has(d.otherDraftId)) continue;
    decided.set(`${d.draftId}|${d.otherDraftId}`, Boolean(d.same));
    decided.set(`${d.otherDraftId}|${d.draftId}`, Boolean(d.same));
    if (d.same) union(d.draftId, d.otherDraftId);
  }

  // Questions: near matches across groups with no answer yet.
  const time = r => new Date(r.createdAt || 0).getTime() || 0;
  const asks = [];
  const askedFor = new Set(); // `${newerId}|${root of other}`
  const sorted = [...list].sort((a, b) => time(a) - time(b));
  for (let j = 1; j < sorted.length; j++) {
    const newer = sorted[j];
    for (let i = 0; i < j; i++) {
      const older = sorted[i];
      if (find(newer.id) === find(older.id)) continue;
      if (decided.has(`${newer.id}|${older.id}`)) continue;
      // A "No" between either budget and the other's project settles it.
      let settled = false;
      for (const r of list) {
        if (find(r.id) === find(older.id) && decided.get(`${newer.id}|${r.id}`) === false) settled = true;
        if (find(r.id) === find(newer.id) && decided.get(`${r.id}|${older.id}`) === false) settled = true;
      }
      if (settled) continue;
      const c = compareNames(newer.projectName, older.projectName);
      if (c.verdict !== 'ask') continue;
      const pa = placeOf(newer), pb = placeOf(older);
      if (pa && pb && pa !== pb) continue; // two typed cities that differ: two jobs
      const key = `${newer.id}|${find(older.id)}`;
      if (askedFor.has(key)) continue;
      askedFor.add(key);
      asks.push({
        draftId: newer.id,
        otherDraftId: older.id,
        newerName: newer.projectName,
        olderName: older.projectName,
        askEmail: String(newer.email || '').toLowerCase(),
        reason: pa && pa === pb ? `${c.reason}, same city` : c.reason,
      });
    }
  }

  // Groups, oldest budget names the project, newest budget first inside.
  const groupsByRoot = new Map();
  for (const r of sorted) {
    const root = find(r.id);
    if (!groupsByRoot.has(root)) groupsByRoot.set(root, { key: root, name: r.projectName, budgets: [] });
    groupsByRoot.get(root).budgets.push(r);
  }
  const groups = [...groupsByRoot.values()];
  for (const g of groups) g.budgets.sort((a, b) => time(b) - time(a));
  groups.sort((a, b) => time(b.budgets[0]) - time(a.budgets[0]));
  return { groups, asks };
}

/** The stage words the portal shows for one budget row. */
export function portalStage(row, stepIndexOf) {
  const r = row || {};
  if (r.projectId) return { code: 'reviewed', label: 'Being reviewed by ILC' };
  if (r.submissionId) return { code: 'sent', label: 'Sent to ILC' };
  const idx = typeof stepIndexOf === 'function' ? stepIndexOf(r) : null;
  return { code: 'working', label: idx ? `In progress, step ${idx.step} of ${idx.of}` : 'In progress' };
}
