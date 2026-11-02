/**
 * tagRules.js: the pure side of Market Intel tags (migration 0122, Mike 10-7).
 * No Prisma, no network, so the unit tests and the browser can both read it.
 *
 * An article names companies, buildings and places. Each becomes a tag row
 * keyed by (kind, normalized) so "Lincoln Avenue Communities" and "Lincoln
 * Avenue Communities, Inc." land on the same row, and "Denver, CO" written
 * three ways is one metro.
 */

// NOTICE (Mike 10-14): the type of city notification, from stages.noticeTypes.
// BUILDING (Mike 10-17): the building type, from buildingTypes below.
// AFFORDABILITY (Mike 10-17): Affordable or Market rate, a second tag on housing.
export const TAG_KINDS = ['COMPANY', 'PROJECT', 'METRO', 'STATE', 'NOTICE', 'BUILDING', 'AFFORDABILITY'];

/**
 * Building type tags (Mike 10-17: "Hotels need to be tagged just like
 * anything else. Condos ... separately from multifamily ... rental
 * apartments, senior living and student housing ... build to rent or single
 * family for rent"). Read by rules off the filing or article words, no AI.
 * A row can carry more than one ("condo hotel"). Rental apartments is the
 * multifamily fallback when no condo, senior, student or build to rent
 * words show. Every row gets at least one, "Other" when nothing fits, so
 * the backfill knows the row was read.
 */
export const BUILDING_OTHER = 'Other';
const BUILDING_RULES = [
  ['Hotel',            /\bhotels?\b|\bmotels?\b|hospitality|\bresorts?\b|\bkeys\b|\binn\b|\bsuites\b|marriott|hilton|hyatt|holiday inn|home2|\baloft\b|courtyard by/i],
  ['Condo',            /\bcondo|condominium/i],
  ['Senior living',    /senior (?:living|housing|apartments|communit|residen|care|citizen)|\bseniors\b|assisted.?living|independent.?living|memory care|\b55\s?\+|age.?restricted|retirement (?:communit|home|living|village)|\bCCRC\b|continuing care/i],
  ['Student housing',  /student (?:housing|living|apartments|residen|beds?|communit)|\bstudents\b|\bdorm|residence hall|university housing|campus housing|purpose.?built student/i],
  ['Build to rent',    /build.?to.?rent|built.?to.?rent|\bBTR\b|single.?family (?:for )?rent|\bSFR\b|rental homes|homes for rent|for.?rent (?:homes|community|communities)|horizontal (?:multifamily|apartments)/i],
  ['Townhomes',        /town.?ho(?:me|use)s?|\browhomes?\b/i],
];
const APARTMENT_RE = /apartment|\bapts?\b|multi.?family|\bR-?2\b|dwelling units|residential units|mixed.?use[^,;:]{0,20}\bresidential|\b(?:two|three|four|five|2|3|4|5)\b[^,;:]{0,15}\bfamily\b/i;
// The article reader's project type (SignalCard PROJECT_TYPE_LABELS) counts too.
const PROJECT_TYPE_BUILDING = { STUDENT_HOUSING: 'Student housing', SENIOR_LIVING: 'Senior living', BUILD_TO_RENT: 'Build to rent', HOSPITALITY: 'Hotel' };
export const BUILDING_TYPE_OPTIONS = ['Rental apartments', ...BUILDING_RULES.map(([label]) => label), BUILDING_OTHER];

export function buildingTypes(text = '', { units = 0, projectType = null } = {}) {
  const out = BUILDING_RULES.filter(([, re]) => re.test(text)).map(([label]) => label);
  const fromType = PROJECT_TYPE_BUILDING[projectType];
  if (fromType && !out.includes(fromType)) out.push(fromType);
  const hotel = out.includes('Hotel');
  const apartments = APARTMENT_RE.test(text) || projectType === 'MARKET_RATE' || projectType === 'AFFORDABLE' || (!hotel && (units || 0) >= 5);
  // "Apartments and condos" is both; a bare unit count on a condo is the condo.
  const rentalNamed = /apartment|\bapts?\b/i.test(text);
  const other = out.some(l => ['Senior living', 'Student housing', 'Build to rent'].includes(l));
  if (apartments && !other && (rentalNamed || !out.includes('Condo'))) out.unshift('Rental apartments');
  return out.length ? out : [BUILDING_OTHER];
}

/**
 * Affordable or Market rate (Mike 10-17: "Yes but as a secondary tag. Which
 * should be affordable or market rate"). Only on housing (any building type
 * but Hotel and Other); a housing row with no affordable words is Market rate.
 */
export const AFFORDABILITY_OPTIONS = ['Affordable', 'Market rate'];
const AFFORDABLE_RE = /affordable|workforce (housing|apartments|rental|units)|\bLIHTC\b|tax credit|low.?income|income.?restricted|\bAMI\b|section 8|\bHUD\b|public housing|housing authority|public facility corp|housing finance corp|\bPFC\b|\bHFC\b/i;
export function affordability(text = '', buildings = [], { projectType = null } = {}) {
  if (!buildings.some(l => l !== 'Hotel' && l !== BUILDING_OTHER)) return [];
  // Mixed income (only some units affordable) is Market rate (Mike 10-17).
  if (/mixed.?income/i.test(text)) return ['Market rate'];
  if (projectType === 'AFFORDABLE' || AFFORDABLE_RE.test(text)) return ['Affordable'];
  return ['Market rate'];
}

/** buildingTypes off a saved signal row (permit class, title, summary, project names). */
export function signalBuildingTypes(signal = {}, projectNames = []) {
  return buildingTags([signal.permitClass, signal.title, signal.summary, ...projectNames].filter(Boolean).join(' | '), { units: signal.unitCount, projectType: signal.projectType }).buildingTypes;
}

/** Both tags at once, shaped for tagsFromExtraction. */
export function buildingTags(text = '', opts = {}) {
  const buildings = buildingTypes(text, opts);
  return { buildingTypes: buildings, affordability: affordability(text, buildings, opts) };
}

export function signalBuildingTags(signal = {}, projectNames = []) {
  return buildingTags([signal.permitClass, signal.title, signal.summary, ...projectNames].filter(Boolean).join(' | '), { units: signal.unitCount, projectType: signal.projectType });
}

// BUYER (Mike 10-9): a company asking to rezone land it does not own yet,
// so it likely has the land under contract. See likelyLandBuyer in permitRules.
export const COMPANY_ROLES = ['DEVELOPER', 'OWNER', 'INVESTOR', 'BUYER', 'GC', 'ARCHITECT', 'LENDER', 'OTHER'];

// Roles that count as "the developer" for client matching, same set the
// extractor used before tags existed.
export const DEVELOPER_ROLES = ['DEVELOPER', 'OWNER', 'INVESTOR', 'BUYER'];

const STATE_CODES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};
const CODE_SET = new Set(Object.values(STATE_CODES));

/**
 * Lower, trimmed, punctuation stripped; company names also lose their corporate
 * suffix. Places keep every word ("Denver, CO" must not lose its "CO").
 * Empty when nothing is left.
 */
export function normalizeTagName(name, kind = 'COMPANY') {
  let s = String(name || '')
    .toLowerCase()
    .replace(/[.,'"()\\]/g, ' ')
    .replace(/&/g, ' and ');
  if (kind === 'COMPANY') s = s.replace(/\b(inc|llc|lp|llp|ltd|corp|corporation|company|co|group|holdings|partners)\b/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** "Colorado", "co", " CO " all become "CO". Anything unknown returns null. */
export function stateCode(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (CODE_SET.has(upper)) return upper;
  return STATE_CODES[v.toLowerCase()] || null;
}

/**
 * "Denver, CO" from whatever the model wrote: "Denver", "Denver, Colorado",
 * "denver co", "Denver metro". The state falls back to the article's state.
 * Returns { name, state } or null when there is no city.
 */
export function metroTag(metro, fallbackState) {
  const raw = String(metro || '').replace(/\b(metro|metropolitan|area|region)\b/gi, '').trim();
  if (!raw) return null;
  const parts = raw.split(/[,/]/).map(s => s.trim()).filter(Boolean);
  let city  = parts[0] || '';
  let state = parts.length > 1 ? stateCode(parts[parts.length - 1]) : null;
  if (!state) {
    // "Denver CO" with no comma
    const m = city.match(/^(.*?)\s+([A-Za-z]{2})$/);
    if (m && stateCode(m[2])) { city = m[1]; state = stateCode(m[2]); }
  }
  if (!state) state = stateCode(fallbackState);
  city = city.replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
  if (!city) return null;
  return { name: state ? `${city}, ${state}` : city, state };
}

/** Whole positive integer or null. "342 units" and "1,200" both read. */
export function unitCountFrom(value) {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseInt(String(value).replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n) || n <= 0 || n > 50000) return null;
  return Math.round(n);
}

/**
 * Turn the extractor's answer into tag rows ready to save. Deduped by
 * (kind, normalized). Companies keep their role on the link.
 */
export function tagsFromExtraction(extracted = {}) {
  const out  = [];
  const seen = new Set();
  const push = (kind, name, role = null) => {
    const normalized = normalizeTagName(name, kind);
    if (!normalized || normalized.length < 2) return;
    const key = `${kind}|${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, name: String(name).replace(/\\/g, '').trim(), normalized, role });
  };

  for (const c of extracted.companies || []) {
    const name = typeof c === 'string' ? c : c?.name;
    const role = typeof c === 'string' ? null : (COMPANY_ROLES.includes(c?.role) ? c.role : 'OTHER');
    push('COMPANY', name, role);
  }
  // Older extractions carry only developerNames.
  for (const name of extracted.developerNames || []) push('COMPANY', name, 'DEVELOPER');
  for (const name of extracted.projectNames || []) push('PROJECT', name);
  for (const name of extracted.noticeTypes || []) push('NOTICE', name);
  for (const name of extracted.buildingTypes || []) push('BUILDING', name);
  for (const name of extracted.affordability || []) push('AFFORDABILITY', name);

  const state = stateCode(extracted.state);
  const metro = metroTag(extracted.metro, state);
  if (metro) push('METRO', metro.name);
  const finalState = state || metro?.state;
  if (finalState) push('STATE', finalState);

  return out;
}

/**
 * The city and state columns (0127) a signal gets from its tag rows: METRO
 * "Austin, TX" gives both, a lone STATE tag gives the state only. Missing
 * pieces stay as they were (undefined), so a thin re-tag never blanks them.
 */
export function placeColumns(rows = []) {
  const metro = rows.find(r => r.kind === 'METRO')?.name || '';
  const [city = '', metroState = ''] = metro.split(',').map(s => s.trim());
  const state = rows.find(r => r.kind === 'STATE')?.name || metroState;
  const out = {};
  if (city)  out.city  = city;
  if (state) out.state = state;
  return out;
}

/** Developer names for the client matcher: the roles that used to be the only names kept. */
export function developerNamesFrom(extracted = {}) {
  const names = [];
  for (const c of extracted.companies || []) {
    if (typeof c === 'string') names.push(c);
    else if (c?.name && (!c.role || DEVELOPER_ROLES.includes(c.role))) names.push(c.name);
  }
  for (const n of extracted.developerNames || []) names.push(n);
  return [...new Set(names.map(n => String(n).trim()).filter(Boolean))];
}
