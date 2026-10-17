/**
 * "Looks like [Project X]", does a new web request look like a job we already
 * have?
 *
 * Mike, 2026-09-12: match on the name, the city/state and the email domain;
 * show it in the review queue with one click to confirm or dismiss; never tell
 * the visitor; never merge anything on our own. This file only makes the guess.
 * A person decides.
 *
 * Pure: rows in, answer out. No Prisma, so it runs in the submit route, on the
 * Things Needing a Look card and in the unit tests the same way.
 */

// Words that say what KIND of building it is rather than WHICH one. "Trailhead
// Apartments" and "Trailhead" are the same job; "The Apartments" is nothing.
const FILLER = new Set([
  'the', 'a', 'an', 'at', 'of', 'on', 'and', 'by',
  'apartments', 'apartment', 'apts', 'apt', 'residences', 'residence',
  'residential', 'lofts', 'flats', 'homes', 'townhomes', 'townhouses',
  'living', 'senior', 'multifamily', 'multi', 'family', 'mf', 'mixed', 'use',
  'community', 'communities', 'project', 'development', 'phase', 'building',
  'bldg', 'tower', 'llc', 'inc', 'lp', 'ltd',
]);

/** Names too plain to mean anything on their own, even after cleaning. */
const TOO_PLAIN = new Set(['main', 'north', 'south', 'east', 'west', 'central', 'park', 'station', 'place']);

/** "Trailhead Apartments, Phase II" → "trailhead ii" */
export function cleanJobName(raw) {
  if (!raw) return '';
  const words = String(raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w && !FILLER.has(w));
  return words.join(' ');
}

/** Whole-word containment, so "Lowell" never matches "Lowellville". */
function containsWords(hay, needle) {
  if (!hay || !needle) return false;
  return ` ${hay} `.includes(` ${needle} `);
}

/** Enough letters that a match on it alone is not a coincidence. */
function distinctive(clean) {
  if (!clean || TOO_PLAIN.has(clean)) return false;
  const letters = clean.replace(/ /g, '');
  return clean.includes(' ') ? letters.length >= 7 : letters.length >= 6;
}

function domainOf(email) {
  const at = String(email || '').lastIndexOf('@');
  return at === -1 ? '' : String(email).slice(at + 1).trim().toLowerCase();
}

function samePlace(a, b) {
  const city  = (x) => String(x.city || '').trim().toLowerCase();
  const state = (x) => String(x.state || '').trim().toUpperCase();
  if (!city(a) || !city(b) || !state(a) || !state(b)) return false;
  return city(a) === city(b) && state(a) === state(b);
}

/**
 * The one job this request most looks like, or null.
 *
 * @param {object} request  { proposedName, city, state, submitterDomain | submitterEmail, clientId }
 * @param {Array}  projects [{ id, name, city, state, clientId, contactEmail }]
 * @returns {{ projectId, projectName, reason, score } | null}
 *
 * A name match is required, two jobs in the same city from the same company
 * are just two jobs. On top of the name, one more thing has to agree (same city,
 * same company, same email domain), unless the names are identical AND unusual
 * enough that a coincidence is unlikely.
 */
export function findLikelyProject(request, projects) {
  const want = cleanJobName(request?.proposedName);
  if (!want || !Array.isArray(projects) || !projects.length) return null;
  const reqDomain = (request.submitterDomain || domainOf(request.submitterEmail) || '').toLowerCase();

  let best = null;
  for (const p of projects) {
    const have = cleanJobName(p?.name);
    if (!have) continue;

    let nameScore = 0;
    let nameWords = '';
    if (have === want) {
      nameScore = 3;
      nameWords = 'same name';
    } else {
      // Either name inside the other: "Trailhead" inside "Trailhead North".
      // The shorter one has to be distinctive, or "Park" would match half of
      // Denver.
      const [short, long] = have.length <= want.length ? [have, want] : [want, have];
      if (distinctive(short) && containsWords(long, short)) {
        nameScore = 2;
        nameWords = 'similar name';
      }
    }
    if (!nameScore) continue;

    const signals = [];
    if (samePlace(request, p)) signals.push(`same city (${p.city}, ${String(p.state).toUpperCase()})`);
    if (request.clientId && p.clientId && request.clientId === p.clientId) signals.push('same company');
    const projDomain = domainOf(p.contactEmail);
    if (reqDomain && projDomain && reqDomain === projDomain) signals.push(`same email domain (@${reqDomain})`);

    const exactAndRare = nameScore === 3 && distinctive(want);
    if (!signals.length && !exactAndRare) continue;

    const score = nameScore + signals.length;
    if (!best || score > best.score) {
      best = {
        projectId:   p.id,
        projectName: p.name,
        reason:      [nameWords, ...signals].join(', '),
        score,
      };
    }
  }
  return best;
}
