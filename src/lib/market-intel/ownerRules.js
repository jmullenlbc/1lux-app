/**
 * Pure rules for the permit owner lookup (0126). No database, no network, so
 * the prompt and the answer reader are testable on their own.
 *
 * Mike 10-8: "if the permit doesn't say a client, our system should be smart
 * enough to quickly search the web because there is almost always something
 * about that address." A city permit names the contractor of record; the
 * developer behind it is in the local business journal, Connect CRE, Bisnow,
 * the city's planning docs. The model searches for the address and answers
 * with the companies a page ties to it, plus the page.
 */
import { COMPANY_ROLES, DEVELOPER_ROLES, unitCountFrom } from './tagRules.js';

export const MAX_OWNER_SEARCHES = 4;

const isUrl = u => /^https?:\/\/\S+$/i.test(String(u || ''));
const str = (v, n) => (v == null || v === '' ? null : String(v).trim().slice(0, n) || null);
// No em dash, en dash or double dash in anything the app shows (Mike 9-26).
const plain = s => (s == null ? s : String(s).replace(/\s*(—|–|--)\s*/g, ', '));

function money(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** What the model is asked, built from the permit's own fields. */
export function ownerPrompt(signal = {}) {
  const facts = [
    signal.address        ? `Address: ${signal.address}`                    : null,
    signal.neighborhood   ? `Neighborhood: ${signal.neighborhood}`          : null,
    signal.metro          ? `Metro: ${signal.metro}`                        : null,
    signal.state          ? `State: ${signal.state}`                        : null,
    signal.unitCount      ? `Units on the permit: ${signal.unitCount}`      : null,
    signal.valuation      ? `Declared value: ${money(signal.valuation)}`    : null,
    signal.permitClass    ? `Permit class: ${signal.permitClass}`           : null,
    signal.permitNumber   ? `Permit number: ${signal.permitNumber}`         : null,
    signal.contractorName ? `Contractor of record: ${signal.contractorName} (the builder, not the owner)` : null,
    signal.publishedAt    ? `Issued: ${new Date(signal.publishedAt).toISOString().slice(0, 10)}` : null,
    signal.title          ? `Permit title: ${signal.title}`                 : null,
  ].filter(Boolean).join('\n');

  return `You research building permits for ILC Studios, a lighting design and supply company that sells to multifamily, affordable, student, senior and hospitality developers and their general contractors.

A city issued this building permit. The permit names the contractor but not the owner or developer. Find out who is behind the project.

${facts}

Today is ${new Date().toISOString().slice(0, 10)}. Use web search, at most ${MAX_OWNER_SEARCHES} searches. Search the street address first (with the city), then the address with words like apartments, development, multifamily. Local business journals, Connect CRE, Bisnow, Multi-Housing News, The Real Deal, the city's planning or council documents and the developer's own site are the usual places.

Rules:
- Name a company only when a page ties it to THIS address or this project. The same street name in another city, or a different building on the same street, does not count.
- The owner or developer matters most. Also give the architect, general contractor, investor or lender when the page names them.
- Give the project name when the page gives one (the marketing name of the building).
- If nothing on the web is about this address, say so: found false, no companies.
- Write plainly. Never use an em dash, en dash or double dash.

When you are done searching, reply with ONLY this JSON object, nothing before or after it:
{
  "found": true or false,
  "projectName": "marketing name of the building, or null",
  "unitCount": number of residential units, keys or beds in THIS building, or null,
  "companies": [{ "name": "company name", "role": "DEVELOPER | OWNER | GC | ARCHITECT | INVESTOR | LENDER | OTHER" }],
  "note": "one or two plain sentences: what the page says about the project (size, stage, timing)",
  "source": { "url": "https://... the page that names the owner", "title": "page title" }
}`;
}

/**
 * Read the model's answer. Returns null when there is no JSON object in it;
 * otherwise a cleaned object with only the fields the app stores. A company
 * with an unknown role becomes OTHER, a bad URL is dropped, and "found" is
 * true only when at least one company survived.
 */
export function readOwnerAnswer(text) {
  const raw = String(text || '');
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let obj;
  try { obj = JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;

  const seen = new Set();
  const companies = [];
  for (const c of Array.isArray(obj.companies) ? obj.companies : []) {
    const name = str(typeof c === 'string' ? c : c?.name, 200);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const role = COMPANY_ROLES.includes(c?.role) ? c.role : 'OTHER';
    companies.push({ name, role });
  }
  const source = obj.source && isUrl(obj.source.url)
    ? { url: String(obj.source.url).slice(0, 1000), title: plain(str(obj.source.title, 300)) }
    : null;

  return {
    found:       companies.length > 0,
    projectName: plain(str(obj.projectName, 200)),
    // Mike 10-9: units go in the card's Units field, not only the note.
    unitCount:   unitCountFrom(obj.unitCount),
    companies,
    note:        plain(str(obj.note, 1000)),
    source,
  };
}

/** The answer in the shape saveSignalTags / tagsFromExtraction expect. */
export function ownerExtraction(answer, signal = {}) {
  if (!answer?.found) return { companies: [], projectNames: [] };
  return {
    companies:    answer.companies,
    projectNames: answer.projectName ? [answer.projectName] : [],
    // Keep the permit's place tags on it: tagsFromExtraction adds them when given.
    metro:        signal.metro || null,
    state:        signal.state || null,
  };
}

/** The names that can be a client match: developer, owner, investor. */
export function ownerCandidateNames(answer) {
  return (answer?.companies || []).filter(c => DEVELOPER_ROLES.includes(c.role)).map(c => c.name);
}

/** Merge new names into the permit's developerNames JSON (legacy column, kept for the matcher). */
export function mergeDeveloperNames(existingJson, answer) {
  let names = [];
  try { names = JSON.parse(existingJson || '[]'); } catch { names = []; }
  if (!Array.isArray(names)) names = [];
  const seen = new Set(names.map(n => String(n).trim().toLowerCase()));
  for (const n of ownerCandidateNames(answer)) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(n);
  }
  return JSON.stringify(names);
}
