// Quotes and Orders email lists for a rep or a buy direct manufacturer (0144).
// Server only. RFQs go to QUOTES; POs will go to ORDERS.

export const PURPOSES = ['QUOTES', 'ORDERS'];
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** "a@x.com; b@y.com" or ["a@x.com"] -> cleaned unique list, and the bad ones. */
export function cleanEmailList(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[\s,;]+/);
  const good = [];
  const bad = [];
  for (const r of raw) {
    const e = String(r || '').trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL_RE.test(e)) bad.push(e);
    else if (!good.includes(e)) good.push(e);
  }
  return { good, bad };
}

/**
 * Replace one owner's lists. owner = { salesRepId } or { manufacturerId };
 * emails = { QUOTES: [...], ORDERS: [...] } (a purpose left out is not touched).
 * Returns history changes { 'Quotes emails': [old, new] }.
 */
export async function replaceEmails(tx, owner, emails) {
  const changes = {};
  for (const purpose of PURPOSES) {
    if (!emails || !(purpose in emails)) continue;
    const { good } = cleanEmailList(emails[purpose]);
    const before = await tx.repEmail.findMany({ where: { ...owner, purpose }, orderBy: { sortOrder: 'asc' } });
    const oldText = before.map((e) => e.email).join(', ');
    const newText = good.join(', ');
    if (oldText === newText) continue;
    await tx.repEmail.deleteMany({ where: { ...owner, purpose } });
    if (good.length) await tx.repEmail.createMany({ data: good.map((email, i) => ({ ...owner, purpose, email, sortOrder: i })) });
    changes[purpose === 'QUOTES' ? 'Quotes emails' : 'Orders emails'] = [oldText, newText];
  }
  return changes;
}

/** Bad addresses across both lists, for a plain 400. */
export function badEmails(emails) {
  if (!emails) return [];
  return PURPOSES.flatMap((p) => (p in emails ? cleanEmailList(emails[p]).bad : []));
}
