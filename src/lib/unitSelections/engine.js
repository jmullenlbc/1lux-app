/**
 * Unit Selections, the five decorative fixtures everybody argues about.
 *
 * Island pendant (p1), bath vanity (v1), balcony sconce (ew1), unit-entry
 * corridor sconce (w1) and the ceiling fan (f1). This file answers three
 * questions and nothing else:
 *
 *   deriveFacts(...)                 what has this job already decided?
 *   eligibleOptions(category, facts) which fixtures may a person even see?
 *   reconcileCategory(...)           did the three of them agree?
 *
 * It is PURE, no database, no @/ aliases, so every awkward branch can be run
 * under plain Node in scripts/tests/unitSelections.test.mjs. The one function
 * that needs rows, resolveFacts(), lives next door in index.js.
 *
 * ── Where the facts come from (the question the build plan left open) ────────
 * Nothing new had to be invented. Every fact already exists somewhere:
 *
 *   finish level (low / medium / high)
 *       The design questionnaire answer itself carries it. "1 sconce (Medium
 *       finish)" is stored as `medium`; "Illuminated mirror (High finish)" as
 *       `illuminatedMirrorHigh`. There is no separate tier field and there does
 *       not need to be one.
 *
 *   the dollar target for ONE fixture
 *       Highest wins:
 *         1. an override typed on this survey
 *         2. the per-question price box the design wizard already offers
 *            (kitchenPendantsPrice, vanityPrice, balconyPrice, fansPrice,
 *            unitSconcePrice), blank means "use the master sheet"
 *         3. the master pricing sheet price for the answer that was chosen,
 *            divided by how many fixtures that answer buys
 *         4. ClientStandardFixture.priceTarget for the matching type code
 *         5. nothing on record
 *
 *   islandLength
 *       Read off the pendant answer. One large pendant means a short island;
 *       two mediums a mid one; three smalls or a linear, a long one.
 *
 *   entryMountHigh (is the unit-entry sconce above 6'-8"?)
 *       Genuinely nowhere in the app. It is asked once on step 1 of the survey
 *       and written to that survey's factsSnapshot. Unit Selections NEVER
 *       writes back to the design questionnaire.
 *
 * ── The one rule about money ────────────────────────────────────────────────
 * Targets and cnPrice are sell figures. dnPrice is never read in this file, and
 * never travels with an option to a screen anyone outside ILC can open.
 */
import { PRICING } from '../pricing.js';

/** The five categories, in the order a survey walks them. */
export const CATEGORIES = Object.freeze([
  { key: 'p1',  typeCode: 'P1',  label: 'Kitchen island pendant',
    section: 'units',     answerKey: 'kitchenPendants', priceKey: 'kitchenPendantsPrice', family: 'kitchenPendants' },
  { key: 'v1',  typeCode: 'V1',  label: 'Bath vanity',
    section: 'units',     answerKey: 'vanity',          priceKey: 'vanityPrice',          family: 'vanity' },
  { key: 'ew1', typeCode: 'EW1', label: 'Balcony sconce',
    section: 'units',     answerKey: 'balcony',         priceKey: 'balconyPrice',         family: 'balcony' },
  { key: 'w1',  typeCode: 'W1',  label: 'Unit entry sconce',
    section: 'corridors', answerKey: 'unitSconce',      priceKey: 'unitSconcePrice',      family: 'corridorSconce' },
  { key: 'f1',  typeCode: 'F1',  label: 'Ceiling fan with light kit',
    section: 'units',     answerKey: 'fans',            priceKey: 'fansPrice',            family: 'fans' },
]);

export const CATEGORY_KEYS = Object.freeze(CATEGORIES.map(c => c.key));

/** Ratings a category demands of any fixture shown for it. */
const RATING_REQUIRED = Object.freeze({
  ew1: 'wet',   // a balcony is outdoors
  v1:  'damp',  // a bathroom is not
});

/**
 * Every questionnaire answer, turned into (level, how many fixtures it buys).
 * `skip: true` means the job has already said it does not want this fixture at
 * all, so the category never appears in the survey.
 */
const ANSWERS = Object.freeze({
  p1: {
    none:             { skip: true },
    threeSmallLow:    { level: 'low',    count: 3 },
    threeSmallMedium: { level: 'medium', count: 3 },
    twoMediumLow:     { level: 'low',    count: 2 },
    twoMediumMedium:  { level: 'medium', count: 2 },
    oneLarge:         { level: 'medium', count: 1 },
    oneLinear:        { level: 'medium', count: 1 },
  },
  v1: {
    bathBarLow:              { level: 'low',    count: 1 },
    bathBarMedium:           { level: 'medium', count: 1 },
    bathBarHigh:             { level: 'high',   count: 1 },
    illuminatedMirrorLow:    { level: 'low',    count: 1 },
    illuminatedMirrorMedium: { level: 'medium', count: 1 },
    illuminatedMirrorHigh:   { level: 'high',   count: 1 },
  },
  ew1: {
    none:         { skip: true },
    // A 5in disk is not a decorative sconce. There is nothing to choose.
    disk5inch:    { skip: true },
    sconcelow:    { level: 'low',    count: 1 },
    sconceMedium: { level: 'medium', count: 1 },
    sconceHigh:   { level: 'high',   count: 1 },
  },
  w1: {
    none:       { skip: true },
    low:        { level: 'low',    count: 1 },
    medium:     { level: 'medium', count: 1 },
    high:       { level: 'high',   count: 1 },
    integrated: { level: 'medium', count: 1 },
  },
  f1: {
    none:                          { skip: true },
    masterOnly:                    { level: 'medium', count: 1 },
    livingRoomOnly:                { level: 'medium', count: 1 },
    masterAndLiving:               { level: 'medium', count: 2 },
    masterAndSecondary:            { level: 'medium', count: 2 },
    masterSecondaryLiving:         { level: 'medium', count: 3 },
    masterSecondaryTertiary:       { level: 'medium', count: 3 },
    masterSecondaryTertiaryLiving: { level: 'medium', count: 4 },
  },
});

/** What the questionnaire falls back to when nobody answered. */
const HOUSE_DEFAULT_ANSWER = Object.freeze({
  p1: 'none', v1: 'bathBarLow', ew1: 'none', w1: 'low', f1: 'none',
});

/**
 * The answer a skipped fixture runs on once somebody adds it back from the
 * survey ("Not in this job, add it?"). Medium finish, the smallest count,
 * so the target reads off the master sheet like any other answer.
 */
const ADDED_ANSWER = Object.freeze({
  p1: 'twoMediumMedium', v1: 'bathBarMedium', ew1: 'sconceMedium', w1: 'medium', f1: 'masterOnly',
});

/** The island length a pendant answer implies. */
const ISLAND_LENGTH = Object.freeze({
  oneLarge: 'short',
  twoMediumLow: 'mid', twoMediumMedium: 'mid',
  threeSmallLow: 'long', threeSmallMedium: 'long', oneLinear: 'long',
});

const LEVEL_TO_TIER = Object.freeze({ low: 'value', medium: 'standard', high: 'elevated' });
const TIER_RANK = Object.freeze({ value: 1, standard: 2, elevated: 3 });

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  // A comma is always a thousands separator in this app.
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * The master-sheet gross price for ONE fixture of this answer.
 *
 * Two families need a word of explanation:
 *   v1 bathBarLow, priced at 0 because a low-finish bath bar is already inside
 *                   the base $/SF. The fixture is still worth the credit, so
 *                   the credit is the target. A target of $0 would hide every
 *                   option there is.
 *   f1, one price per fan, straight off the master sheet, gross.
 *                   Mike, 2026-09-16: there is never a coded fan price.
 */
function sheetPricePerFixture(catKey, answer, pricing, count) {
  const P = pricing || PRICING;
  if (catKey === 'f1') {
    return num(P.fans?.conceptualPerFan) ?? num(PRICING.fans.conceptualPerFan);
  }
  if (catKey === 'v1' && answer === 'bathBarLow') {
    return num(P.vanityBathBarCredit) ?? num(PRICING.vanityBathBarCredit);
  }
  const family = CATEGORIES.find(c => c.key === catKey)?.family;
  const gross = num(P[family]?.[answer]?.product);
  if (gross === null || !count) return null;
  return round2(gross / count);
}

/**
 * Turn what a project already said into the facts a survey runs on. Pure, no
 * database, so the awkward branches (the 6'-8" rule, the budget cut) can be
 * tested on their own.
 *
 * @param {object}  input
 * @param {object}  input.answers         {units:{...}, corridors:{...}} questionnaire values
 * @param {object} [input.pricing]        this project's pricing snapshot; falls back to the master sheet
 * @param {object} [input.clientTargets]  {P1: 240, ...} from ClientStandardFixture.priceTarget
 * @param {object} [input.overrides]      typed on this survey: {targets:{}, entryMountHigh, islandLength, include:[]}
 *                                        `include` = skipped fixtures added back from the survey screen
 */
export function deriveFacts({ answers = {}, pricing = null, clientTargets = {}, overrides = {} } = {}) {
  const targets = {};
  const levels  = {};
  const counts  = {};
  const source  = {};
  const skipped = [];

  for (const cat of CATEGORIES) {
    const raw = answers?.[cat.section]?.[cat.answerKey];
    let answer = raw || HOUSE_DEFAULT_ANSWER[cat.key];
    let spec = ANSWERS[cat.key][answer];
    // Added back on this survey although the questionnaire said no. The
    // questionnaire itself is never written, the survey remembers it.
    const added = (!spec || spec.skip) && (overrides?.include || []).includes(cat.key);
    if (added) { answer = ADDED_ANSWER[cat.key]; spec = ANSWERS[cat.key][answer]; }

    if (!spec || spec.skip) {
      skipped.push(cat.key);
      levels[cat.key]  = null;
      counts[cat.key]  = 0;
      targets[cat.key] = null;
      source[cat.key]  = 'not wanted on this job';
      continue;
    }

    levels[cat.key] = spec.level;
    counts[cat.key] = spec.count;

    // 1. typed on this survey
    const surveyOverride = num(overrides?.targets?.[cat.key]);
    if (surveyOverride !== null && surveyOverride > 0) {
      targets[cat.key] = surveyOverride;
      source[cat.key] = 'typed on this survey';
      continue;
    }

    // 2. the price box on the design questionnaire. It is a per-unit figure,
    //    same as the master price it replaces, so it divides the same way.
    const projectOverride = num(answers?.[cat.section]?.[cat.priceKey]);
    if (projectOverride !== null && projectOverride > 0) {
      targets[cat.key] = round2(projectOverride / (spec.count || 1));
      source[cat.key] = 'the price typed on the design questionnaire';
      continue;
    }

    // 3. the master sheet price for the answer chosen
    const sheet = sheetPricePerFixture(cat.key, answer, pricing, spec.count);
    if (sheet !== null && sheet > 0) {
      targets[cat.key] = sheet;
      source[cat.key] = added ? 'added on this survey, at a medium finish' : 'the answer on the design questionnaire';
      continue;
    }

    // 4. what this client normally targets for this type
    const clientTarget = num(clientTargets?.[cat.typeCode]);
    if (clientTarget !== null && clientTarget > 0) {
      targets[cat.key] = clientTarget;
      source[cat.key] = 'this client’s standards';
      continue;
    }

    // 5. nothing anywhere. Every option stays visible rather than none of them.
    targets[cat.key] = null;
    source[cat.key] = 'no target on record';
  }

  // The tier is a summary of the five levels, not a field anyone set. Most
  // common wins; a tie breaks to the higher one, because a job with one High
  // fixture in it is not a value job.
  const tally = {};
  for (const key of CATEGORY_KEYS) {
    const lvl = levels[key];
    if (lvl) tally[lvl] = (tally[lvl] || 0) + 1;
  }
  let tier = 'standard';
  let best = 0;
  for (const [lvl, n] of Object.entries(tally)) {
    const t = LEVEL_TO_TIER[lvl];
    if (n > best || (n === best && TIER_RANK[t] > TIER_RANK[tier])) { tier = t; best = n; }
  }

  const pendantAnswer = answers?.units?.kitchenPendants;
  const islandLength = overrides?.islandLength ?? (ISLAND_LENGTH[pendantAnswer] || null);
  const entryMountHigh = overrides?.entryMountHigh ?? null;

  return { tier, targets, levels, counts, skipped, islandLength, entryMountHigh, source };
}

/**
 * Which options a person may see for one category, and which were taken away.
 *
 * The order of the cuts is deliberate, the reason a fixture is missing should
 * be the most fundamental one that applies, so a wet-rating failure is reported
 * as a wet-rating failure even if the fixture is also too expensive.
 *
 * Nothing over target is ever rendered, not even greyed out. Showing somebody a
 * fixture they cannot have is how a settled budget gets reopened.
 *
 * @param {string} category  p1 | v1 | ew1 | w1 | f1
 * @param {object} facts     from deriveFacts / resolveFacts
 * @param {Array}  options   DecorativeOption rows, each with its `finishes`
 * @returns {{eligible: Array, hidden: Array<{option: object, reason: string}>}}
 */
export function eligibleOptions(category, facts, options = []) {
  const eligible = [];
  const hidden = [];
  const drop = (option, reason) => hidden.push({ option, reason });

  const target = facts?.targets?.[category] ?? null;
  const needs = RATING_REQUIRED[category];

  for (const option of options) {
    // 1. the right category, still offered
    if (option.category !== category) continue;
    if (option.isActive === false) { drop(option, 'retired from the pool'); continue; }

    // 2. rating. A balcony is outdoors; a bathroom is damp. A wet-rated
    //    fixture is always acceptable somewhere only damp is required.
    if (needs === 'wet' && !option.wetRated) { drop(option, 'not wet rated'); continue; }
    if (needs === 'damp' && !option.dampRated && !option.wetRated) {
      drop(option, 'not damp rated');
      continue;
    }

    // 3. projection. A sconce beside a unit door mounted at or below 6'-8"
    //    reaches into the corridor; anything over 4in gets caught by a shoulder
    //    and fails the accessible-route rule.
    if (category === 'w1' && facts?.entryMountHigh === false
        && option.projectionIn != null && option.projectionIn > 4) {
      drop(option, 'sticks out more than 4in, and it mounts below 6’-8”');
      continue;
    }

    // 4. geometry. A linear pendant over a short island looks wrong and
    //    usually does not fit.
    if (category === 'p1' && facts?.islandLength === 'short' && option.shape === 'linear') {
      drop(option, 'linear fixture, short island');
      continue;
    }

    // 5. budget. Measured against the cheapest finish still offered, if any
    //    finish lands inside the target, the fixture is buyable.
    if (target !== null) {
      const prices = (option.finishes || [])
        .filter(f => f.isActive !== false && f.cnPrice != null)
        .map(f => f.cnPrice);
      if (prices.length) {
        const cheapest = Math.min(...prices);
        if (cheapest > target) {
          drop(option, `over the $${target.toLocaleString()} target`);
          continue;
        }
      }
    }

    eligible.push(option);
  }

  eligible.sort((a, b) =>
    ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || String(a.name).localeCompare(String(b.name)));
  return { eligible, hidden };
}

/**
 * The finish one person's answers point at.
 *
 * Fans are left out of the tally on purpose: a fan is picked for its blade span
 * and its light kit, and a white fan is normal in a building whose metalwork is
 * black. When the pendant is in the running a tie breaks to it, because the
 * kitchen is the room people look at.
 */
export function deriveFinish(response) {
  if (response?.finishOverride) return response.finishOverride;

  const choices = (response?.choices || [])
    .filter(c => c.kind === 'PICK' && c.category !== 'f1' && c.finishKey);
  const tally = {};
  for (const c of choices) tally[c.finishKey] = (tally[c.finishKey] || 0) + 1;

  const entries = Object.entries(tally);
  if (!entries.length) return null;

  const top = Math.max(...entries.map(([, n]) => n));
  const tied = entries.filter(([, n]) => n === top).map(([k]) => k);
  if (tied.length === 1) return tied[0];

  const pendant = choices.find(c => c.category === 'p1' && tied.includes(c.finishKey));
  return pendant ? pendant.finishKey : tied.slice().sort()[0];
}

/** The finish a fan should be, given the finish everything else landed on. */
export function fanFinish(response, derived) {
  return response?.fanHoldWhite === false ? (derived || 'white') : 'white';
}

/**
 * Three people's answers for one category, turned into one result row.
 *
 * Nothing is averaged. If they disagree the row SAYS they disagree and a person
 * decides, that is the whole reason this feature exists.
 */
export function reconcileCategory(category, responses = []) {
  const picks = [];
  const rejects = [];
  for (const r of responses) {
    for (const c of (r.choices || [])) {
      if (c.category !== category) continue;
      const row = {
        respondentName: r.respondentName,
        role: r.respondentRole,
        optionId: c.optionId,
        kind: c.kind,
        finishKey: c.finishKey || null,
      };
      (c.kind === 'REJECT' ? rejects : picks).push(row);
    }
  }
  if (!picks.length) return null;

  const tally = {};
  for (const p of picks) tally[p.optionId] = (tally[p.optionId] || 0) + 1;
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const [winnerId] = entries[0];

  // Everybody who wanted something else, plus anybody who explicitly rejected
  // the one that leads. This is what a person reads before they break the tie.
  const divergence = [
    ...picks.filter(p => p.optionId !== winnerId),
    ...rejects.filter(r => r.optionId === winnerId),
  ];

  // Somebody who only said no is still somebody who took part, a rejection is
  // a disagreement, and counting only the pickers would report it as SINGLE.
  const participants = new Set([...picks, ...rejects].map(r => r.respondentName)).size;
  let agreement;
  if (divergence.length) agreement = 'DIVERGENT';
  else if (participants === 1) agreement = 'SINGLE';
  else agreement = 'UNANIMOUS';

  const finishKey = picks.find(p => p.optionId === winnerId && p.finishKey)?.finishKey || null;
  return { category, optionId: winnerId, finishKey, agreement, divergence };
}
