/**
 * Personal things a contact has mentioned (Mike 9-26: "That person has 2 kids
 * who play soccer or they like golf or hiking or cold brew").
 *
 * Read out of sales notes by the same AI call that finds next steps, or typed
 * on the contact by hand. Stored one fact per row (ContactPersonalFact), never
 * deleted, only put away. Staff only: never shown to clients.
 *
 * Pure: no imports, safe in the browser.
 */

export const PERSONAL_CATEGORIES = ['FAMILY', 'SPORTS', 'HOBBY', 'FOOD_DRINK', 'TRAVEL', 'PETS', 'OTHER'];

export const PERSONAL_LABEL = {
  FAMILY: 'Family', SPORTS: 'Sports', HOBBY: 'Hobbies', FOOD_DRINK: 'Food and drink',
  TRAVEL: 'Travel', PETS: 'Pets', OTHER: 'Other',
};

export const MAX_FACT = 200;

export function cleanCategory(c) {
  const k = String(c || '').trim().toUpperCase().replace(/[\s/&-]+/g, '_');
  if (k === 'FOOD' || k === 'DRINK' || k === 'FOOD_AND_DRINK') return 'FOOD_DRINK';
  return PERSONAL_CATEGORIES.includes(k) ? k : 'OTHER';
}

export function cleanFact(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  return t.slice(0, MAX_FACT);
}

/** Same fact twice, worded the same apart from case and punctuation. */
export function factKey(text) {
  return cleanFact(text).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Facts not already on the contact, and not repeated inside the list itself. */
export function newFacts(incoming, existing = []) {
  const seen = new Set(existing.map(f => factKey(f.fact ?? f)));
  const out = [];
  for (const f of incoming) {
    const fact = cleanFact(f.fact);
    const key = factKey(fact);
    if (key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...f, fact, category: cleanCategory(f.category) });
  }
  return out;
}

/** One short line for the email writers: at most a few facts, newest first. */
export function personalLine(facts = [], max = 3) {
  const list = facts.filter(f => !f.archivedAt).slice(0, max).map(f => cleanFact(f.fact)).filter(Boolean);
  return list.length ? list.join('; ') : '';
}

/** The prompt lines for an email writer. Empty when nothing is on file. */
export function personalSection(line, name) {
  if (!line) return '';
  return `\nThings ${name || 'they'} mentioned outside work: ${line}.
You MAY add one short, warm line touching on ONE of these if it fits naturally (for example asking how the soccer season is going). It is optional; skip it on a formal email. Never invent anything beyond what is written here, and never say you keep notes on them.\n`;
}
