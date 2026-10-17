/**
 * project-matcher.js, deciding which of OUR jobs a news article is about.
 *
 * ── Why this is not the fuzzy matcher ──
 * Developer names are distinctive ("Zocalo Community Development"), so fuzzy
 * matching them is safe. Project names are the opposite: "Trailhead",
 * "Creekside", "The Approach", "Lowell" are ordinary English, and a fuzzy match
 * on them against arbitrary industry news would tag half the feed. A false link
 * here is worse than no link, it puts a stranger's groundbreaking on our job's
 * record, and nobody re-reads a record they believe is already correct.
 *
 * So this does not fuzzy-match. It asks a narrower question: does the article
 * actually CONTAIN this project's name, as whole words? Containment is a much
 * stronger claim than similarity, and the news names a job the way its
 * developer names it.
 *
 * ── The three guards ──
 * 1. A project only counts if its name is distinctive enough to mean something
 *    on its own. One short word is not, however exactly it matches.
 * 2. A project belonging to the client the article ALREADY matched gets a lower
 *    bar, because the coincidence has to be much larger to be a coincidence.
 * 3. Names on the stop list never match alone, every developer has a "Phase 2"
 *    and a "The Residences".
 *
 * Pure and dependency-free apart from the shared normalizer, so it can be
 * tested without a database.
 */
import { normalizeName } from './normalizer.js';

/**
 * Names that are true of half the industry. A project actually called one of
 * these can still be linked by hand; what it cannot do is claim an article on
 * its own.
 */
export const TOO_GENERIC = new Set([
  'the residences', 'the reserve', 'the commons', 'the village', 'the lofts',
  'the flats', 'the apartments', 'the heights', 'the landing', 'the yards',
  'phase 1', 'phase 2', 'phase 3', 'phase i', 'phase ii', 'phase iii',
  'building a', 'building b', 'building 1', 'building 2',
  'senior living', 'affordable housing', 'student housing', 'market rate',
  'north tower', 'south tower', 'east tower', 'west tower', 'main street',
]);

/** A distinctive name is two or more words, or one long uncommon one. */
const MIN_CHARS_MULTI_WORD  = 8;   // "trailhead" alone is 9 and still risky
const MIN_CHARS_SINGLE_WORD = 10;  // one word has to be genuinely unusual
const MIN_CHARS_SAME_CLIENT = 6;   // the client already matched; the bar drops

/** Whole-word containment. Guards against "Lowell" matching "Lowellville". */
function containsPhrase(haystack, needle) {
  if (!haystack || !needle) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? ' ' : haystack[at - 1];
    const afterAt = at + needle.length;
    const after = afterAt >= haystack.length ? ' ' : haystack[afterAt];
    if (before === ' ' && after === ' ') return true;
    from = at + 1;
  }
}

/**
 * Is this project name allowed to claim an article by itself?
 *
 * @param {string}  normalized  the normalized project name
 * @param {boolean} sameClient  the article already matched this project's client
 */
export function isDistinctiveEnough(normalized, sameClient = false) {
  if (!normalized) return false;
  if (TOO_GENERIC.has(normalized)) return false;
  const words = normalized.split(' ').filter(Boolean);
  const min = sameClient ? MIN_CHARS_SAME_CLIENT
            : words.length > 1 ? MIN_CHARS_MULTI_WORD
            : MIN_CHARS_SINGLE_WORD;
  return normalized.length >= min;
}

/**
 * Which of our projects is this article about?
 *
 * @param {string} articleText          title + summary + body, in any order
 * @param {Array}  projects             [{ id, name, clientId }]
 * @param {object} [opts]
 * @param {string} [opts.matchedClientId]  the client the article already matched
 * @returns {{projectId, projectName, status, score}|null}
 *
 * `status` is AUTO_LINKED when the article names a job belonging to the client
 * it already matched, two independent things agreeing, and SUGGESTED when the
 * name alone carried it, which is a claim a human should confirm.
 */
export function matchProject(articleText, projects, { matchedClientId = null } = {}) {
  if (!articleText || !projects?.length) return null;

  // Normalize the article the same way the names are normalized, so "Trailhead
  // Apartments, LLC" in the text and "Trailhead Apartments" in our database
  // reduce to the same string before they are compared.
  const haystack = normalizeName(articleText);
  if (!haystack) return null;

  const hits = [];
  for (const project of projects) {
    const normalized = normalizeName(project.name);
    const sameClient = Boolean(matchedClientId && project.clientId === matchedClientId);
    if (!isDistinctiveEnough(normalized, sameClient)) continue;
    if (!containsPhrase(haystack, normalized)) continue;
    hits.push({
      projectId:   project.id,
      projectName: project.name,
      status:      sameClient ? 'AUTO_LINKED' : 'SUGGESTED',
      // Longer names matching are stronger evidence; a client agreeing is
      // stronger still. Not a probability, a ranking, used to break ties.
      score: Math.min(1, (sameClient ? 0.6 : 0.3) + normalized.length / 100),
      _len: normalized.length,
      _sameClient: sameClient,
    });
  }

  if (!hits.length) return null;

  // Two of our jobs named in one article is possible and rare. Prefer the one
  // whose client already matched, then the longer name, "Trailhead Apartments"
  // beats "Trailhead" when the article contains both, because it is the more
  // specific claim rather than a substring of the other.
  hits.sort((a, b) =>
    (b._sameClient - a._sameClient) || (b._len - a._len) || a.projectName.localeCompare(b.projectName));

  const { _len, _sameClient, ...best } = hits[0];
  return best;
}
