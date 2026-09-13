/**
 * Project location on the public conceptual-budget form (Mike, 2026-09-12:
 * "we need a city and state and zip code. We need location for data
 * tracking"). Shared by the browser form and /api/intake/submit so both sides
 * run the same rule. Pure, no dependencies.
 */

/** The 50 states plus DC, as [code, name]. The form sends the code. */
export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
  ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
  ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

const CODES = new Set(US_STATES.map(([code]) => code));

/**
 * Check and tidy a project location.
 *
 * @returns {{ ok, missing, city, state, zip }} `missing` names each bad or
 *   blank part in plain words; the cleaned values are null when invalid.
 *   A zip is 5 digits, or ZIP+4 stored as 12345-6789.
 */
export function checkLocation({ city, state, zip } = {}) {
  const c = String(city ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const s = String(state ?? '').trim().toUpperCase();
  const z = /^(\d{5})(?:-?(\d{4}))?$/.exec(String(zip ?? '').trim());

  const cityOk = /[a-z]/i.test(c);
  const missing = [];
  if (!cityOk) missing.push('City');
  if (!CODES.has(s)) missing.push('State');
  if (!z) missing.push('Zip code');

  return {
    ok: missing.length === 0,
    missing,
    city: cityOk ? c : null,
    state: CODES.has(s) ? s : null,
    zip: z ? z[1] + (z[2] ? `-${z[2]}` : '') : null,
  };
}
