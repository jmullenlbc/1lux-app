/**
 * The quantity takeoff: every count and square footage the budget math needs,
 * computed from what the drawings said plus what the questionnaire answered —
 * before a human ever opens the submission.
 *
 * This is Mike's rule made code: "I want the drawing to pull all the square
 * footage, unit counts, egress door counts, parking space counts, etc. and
 * build that into the tool before it ever gets to us — and alert us if they
 * think something doesn't have a high likelihood of being right."
 *
 * Every quantity is a ROW, not a bare number, because "48" is useless to a
 * reviewer without "where did that come from":
 *
 *   { key, label, unit, value, source, how, flag }
 *
 *   value  — the number, or null when nothing on the drawings answers it.
 *            Null is a first-class answer here (same doctrine as siteFields:
 *            "the drawing did not say" must never become "the drawing said
 *            zero"). A null row still renders, marked as needing a human.
 *   source — 'drawing' (read off a sheet), 'derived' (computed from read
 *            numbers by a stated rule), 'questionnaire' (follows from an
 *            answer), or null (not found).
 *   how    — one plain-English sentence showing the arithmetic or the sheet
 *            the number came from. The reviewer sees the work, not just the
 *            result.
 *   flag   — a verify-before-trusting sentence when the number is shaky
 *            (partial coverage, disagreeing sources, negative remainders),
 *            or null when it is clean.
 *
 * Pure: no IO, no model, no clock. The submit route computes these for the
 * notification email; the admin panel recomputes them on view so a rule fix
 * here applies to every past submission retroactively.
 *
 * Input `drawings` is the mergeProposals() output stored in
 * rawPayload.drawings — which arrives verbatim from an unauthenticated
 * browser, so every shape assumption below is an assumption about hostile
 * input and is guarded accordingly.
 *
 * @see src/lib/siteVision.js       — where the stated site numbers come from
 * @see src/lib/intake/questionnaire.js — the answers some rows derive from
 * @see src/lib/intake/reviewFlags.js   — drawing-level trust; this is field-level
 */
import { perUnitRule, bathsFromBedrooms } from '../unitRules.js';
import { lotSquareFeet, ACRE_SF } from '../siteFields.js';
import { parseLooseNumber } from '../numberInput.js';
import { PRICING } from '../pricing.js';
import { estimateStairLandings } from '../stairLandings.js';
import { answersToEngine, NO_DRAWINGS_KEY, CLUBHOUSE_KEY, POOL_KEY, GARAGE_TYPE_KEYS, CARPORT_TYPE_KEYS } from './questionnaire.js';
import { NO_DRAWING_GUESSES } from './noDrawingGuesses.js';
import { SITE_FEATURE_TYPES, SITE_FEATURE_LABELS, SITE_FEATURE_ROW_KEYS, SITE_FEATURE_FOLD, LINEAR_SITE_FEATURES, COURTYARD_FT_EACH, normalizeSiteFeatures } from '../siteFeatureWords.js';

/** A stated, usable number — or null. Number(null) is 0, hence the dance. */
function stated(v) {
  const n = parseLooseNumber(v);            // "1,250" typed by a visitor
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function fmt(n) { return Number(n).toLocaleString('en-US'); }

/**
 * A figure the VISITOR typed — "364,029" included — or null. These arrive as
 * questionnaire answer strings (figureGrossSf, figureTotalUnits, figureStories,
 * figureStairwells, figureExitDoors, figureSurfaceParking): the wizard asks
 * for them only when the drawings answered nothing, so a drawing-stated or
 * counted value always outranks them.
 */
function statedAnswer(v) {
  if (typeof v !== 'string') return stated(v);
  const n = stated(v.replace(/[,\s]/g, ''));
  return n != null && n > 0 ? n : null;
}

// Same, but 0 is a real answer — "no surface lot" (required on the
// no-drawings form since 2026-09-12, so a typed 0 must not read as blank).
function statedCount(v) {
  return typeof v === 'string' ? stated(v.replace(/[,\s]/g, '')) : stated(v);
}

/**
 * A figure a human typed to OVERRULE what the drawings were read as saying:
 * `correctTotalUnits`, `correctBedrooms`, `correctBohSf` — one per row key.
 *
 * Deliberately a separate namespace from the figure* answers above, because
 * the two mean different things. A figure* answer means "the drawings didn't
 * say, here is the number", and stays BELOW a drawing. A correct* answer means
 * "the drawings were read wrong", and is the only thing that outranks one — a
 * person looking at the plans beats a machine that read them. Keeping them
 * apart means the existing ladders keep their rule that a written number beats
 * a typed one (pinned by parkingLadder.test.mjs).
 *
 * 0 is a real correction ("there is no exterior amenity area"), so this reads
 * through statedCount; a negative figure is nonsense and is ignored.
 */
export function correctionKeyFor(key) {
  return `correct${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}
function correctionFor(ans, key) {
  const n = statedCount(ans[correctionKeyFor(key)]);
  return n != null && n >= 0 ? n : null;
}

/**
 * Units-sum → building-gross blow-up, the LAST-RESORT gross estimate.
 * The number lives in the master pricing sheet (PRICING.estimation), not
 * here — Mike set it to 1.25 (2026-09-04). Only used when no total is
 * stated, no per-building totals exist, the visitor typed nothing, and no
 * footprint × stories is available.
 */
const UNITS_TO_GROSS = PRICING.estimation.unitsToGross;

/**
 * Building types that park mostly inside a structure. A site-wide stall total
 * (provided or code-required) says nothing about how many of their stalls are
 * out in the open, so the parking ladder skips its total-based rungs for them.
 */
const STRUCTURED_PARKING_TYPES = new Set(['wrap', 'podium', 'midRise', 'highRise']);

/** Answers however they arrive — DB rows, validated rows, or a plain map. */
export function answersToMap(answers) {
  const m = {};
  if (Array.isArray(answers)) {
    for (const a of answers) {
      if (a && typeof a.questionKey === 'string' && typeof a.answer === 'string') m[a.questionKey] = a.answer;
    }
  } else if (answers && typeof answers === 'object') {
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v === 'string') m[k] = v;
    }
  }
  return m;
}

function safeRows(drawings) {
  const arr = Array.isArray(drawings?.unitTypes) ? drawings.unitTypes : [];
  return arr.filter(r => r && typeof r === 'object');
}

function qtyOf(row) {
  // The extraction schema says `qty`; `count` is accepted because one early
  // payload shape used it and old submissions are recomputed on view.
  const n = Number(row.qty ?? row.count);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Sum a per-unit-type column across the matrix, weighted by quantity.
 * Reports how many units the column actually covered, because a matrix where
 * only half the rows list bathrooms yields a sum that UNDERCOUNTS — a partial
 * answer a reviewer must see labelled as partial.
 */
function sumPerUnit(rows, field) {
  let covered = 0, total = 0, sum = 0;
  for (const r of rows) {
    const q = qtyOf(r);
    if (!q) continue;
    total += q;
    // Number(null) is 0 — a row that omits the column is "not stated", never
    // "stated zero" (the same doctrine as stated() in siteFields.js).
    const raw = r[field];
    if (raw === null || raw === undefined || raw === '') continue;
    const v = perUnitRule(field, raw);
    if (Number.isFinite(v) && v >= 0) { covered += q; sum += q * v; }
  }
  if (!total || !covered) return null;
  return { sum, covered, total, partial: covered < total };
}

function partialFlag(r, what) {
  return r?.partial
    ? `Only ${fmt(r.covered)} of ${fmt(r.total)} units list ${what} — this total undercounts. Fill in the rest by hand.`
    : null;
}

/**
 * Lift a per-unit column onto the project's REAL unit count.
 *
 * Mike, 2026-09-15: "# of units cant be off. it affects so much and also
 * affected the # of corridor unit entry socnces." On Lone Tree Ranch Test v1
 * the matrix that was read covered only part of the project, and every figure
 * hanging off it came back short by the same fraction — bedrooms, balconies,
 * unit SF, and (through the gross-minus-itemized remainder) back of house.
 *
 * When the unit count is settled at a HIGHER number than the matrix rows sum
 * to, those rows describe a sample, not the whole project. Pro-rating the
 * sample to the full count is an assumption — that the units nobody read
 * resemble the ones somebody did — so it is always flagged and always shows
 * its arithmetic. The alternative is the thing that actually went wrong: a
 * silent undercount that prices the job low and looks perfectly plausible.
 */
function scaledToUnits(col, unitCount) {
  if (!col) return null;
  const covers = col.total;
  if (!(unitCount > 0) || !(covers > 0) || unitCount <= covers) {
    return { ...col, value: col.sum, scaled: false };
  }
  return {
    ...col,
    value: Math.round(col.sum * (unitCount / covers)),
    scaled: true,
    factor: unitCount / covers,
    matrixUnits: covers,
    unitCount,
  };
}

/** The verify-this sentence for a column that was pro-rated, partial, or both. */
function columnFlag(col, what) {
  const parts = [];
  if (col?.scaled) {
    parts.push(`The unit matrix covers only ${fmt(col.matrixUnits)} of the project's ${fmt(col.unitCount)} units, so this was scaled up from ${fmt(col.sum)} at the same rate per unit. Confirm it against the drawings.`);
  }
  const p = partialFlag(col, what);
  if (p) parts.push(p);
  return parts.length ? parts.join(' ') : null;
}

/** Bedrooms implied by a site plan's D.U. mix, when there is no matrix. */
function bedroomsFromMix(mix) {
  if (!mix || typeof mix !== 'object') return null;
  const s = stated(mix.studio), b1 = stated(mix.oneBed), b2 = stated(mix.twoBed), b3 = stated(mix.threeBed);
  if (s == null && b1 == null && b2 == null && b3 == null) return null;
  return {
    bedrooms: (b1 ?? 0) * 1 + (b2 ?? 0) * 2 + (b3 ?? 0) * 3,
    unitsWithBedroom: (b1 ?? 0) + (b2 ?? 0) + (b3 ?? 0),
    units: (s ?? 0) + (b1 ?? 0) + (b2 ?? 0) + (b3 ?? 0),
  };
}

/**
 * Compute the full takeoff.
 * @param {object|null} drawings  mergeProposals() output (rawPayload.drawings)
 * @param {Array|object|null} answers  questionnaire answers, any shape
 * @param {object|null} pricing  loadPricing() output — estimation factors come
 *                               from the master pricing sheet; falls back to
 *                               the static PRICING defaults when not passed.
 * @param {object|null} adopted  loadAdoptedGuesses() output — stand-in
 *                             figures a person adopted from what our real jobs
 *                             say ({ vanitiesPerUnit: { garden: 1.45 } }).
 *                             Anything not adopted uses NO_DRAWING_GUESSES.
 * @returns {Array} quantity rows, in the order the review panel shows them
 */
export function computeQuantities(drawings, answers, pricing = null, adopted = null) {
  const unitsToGross = Number(pricing?.estimation?.unitsToGross) > 0
    ? Number(pricing.estimation.unitsToGross)
    : UNITS_TO_GROSS;
  const rows = safeRows(drawings);
  const site = (drawings?.siteData && typeof drawings.siteData === 'object') ? drawings.siteData : null;
  const totals = (drawings?.projectTotals && typeof drawings.projectTotals === 'object') ? drawings.projectTotals : null;
  const ans = answersToMap(answers);
  // No-drawings budget (Mike, 2026-09-11): the visitor said "no drawings" and
  // typed the figures in. Only then do blanks get a stand-in guess from
  // noDrawingGuesses.js; a drawing-read budget asks for its blanks instead.
  const manual = ans[NO_DRAWINGS_KEY] === 'yes'
    && !(Array.isArray(drawings?.sources) && drawings.sources.length > 0);
  const typeKey = answersToEngine(answers).buildingTypeKey ?? null;
  // A stand-in figure: one a person adopted on the Pre-Con dashboard (Mike
  // 2026-09-24: "suggest, but let humans confirm"), else the master guess.
  const standIn = (table, t) => {
    const a = Number(adopted?.[table]?.[t]);
    return Number.isFinite(a) ? a : NO_DRAWING_GUESSES[table]?.[t] ?? null;
  };
  const guess = table => (manual && typeKey ? standIn(table, typeKey) : null);
  // The building type's typical share of gross, with or without drawings.
  // Unlike guess() this is not gated on the no-drawings form: corridors are
  // estimated as a share of gross on a drawing-read job too when no corridor
  // line was printed (Mike 2026-09-16).
  const typeShare = table => (typeKey ? standIn(table, typeKey) : null);
  const GUESS_FLAG = 'ESTIMATED — no drawings were uploaded and this was left blank. Enter the real figure if you have it.';
  // A blank row on the no-drawings form should not talk about sheets that
  // were never uploaded (Mike 2026-09-16: blanks belong on the same grid,
  // highlighted, with the reason).
  const NOT_STATED = manual ? NOT_STATED_MANUAL : 'Not stated on any sheet that was read.';
  const out = [];
  // ── MANUAL CORRECTIONS ─────────────────────────────────────────────────────
  // Mike, 2026-09-15: "We need to be able to manually update any field about
  // the project we see off. None of that can be updated now."
  //
  // Every ladder in this file reads `stated ?? counted ?? typed`, so a typed
  // figure was only ever consulted when the drawings said NOTHING. That made a
  // misread number uncorrectable: you could see the takeoff claim 108 units
  // against a project with 173 and have no way to say so.
  //
  // The correction lands inside add() so it covers EVERY row without twenty
  // separate patches — and because the priced projectData is built from these
  // same rows (estimate.js), correcting a figure moves the BUDGET rather than
  // just repainting the screen. A corrected row drops its flag (the human has
  // already answered the question the flag was asking) but keeps what we read
  // in `wasValue`, so a reviewer can always see what was overruled.
  // RETURNS the figure that was actually settled on — the correction when there
  // is one, otherwise what we read. Callers that feed a later calculation must
  // use this return value rather than the local they passed in: a correction
  // lands on the ROW, so a local captured beforehand still holds the misread
  // number. That is how a corrected gross SF could sit on screen while back of
  // house was still being taken off the old total.
  const add = (key, label, unit, value, source, how, flag = null) => {
    const fixed = correctionFor(ans, key);
    if (fixed != null) {
      out.push({
        key, label, unit, value: fixed, source: 'questionnaire', corrected: true,
        wasValue: value == null ? null : value,
        how: value == null || value === fixed
          ? 'Entered by you.'
          : `Corrected by you to ${fmt(fixed)}. We read ${fmt(value)} — ${how}`,
        flag: null,
      });
      return fixed;
    }
    out.push({ key, label, unit, value, source: value == null ? null : source, how, flag });
    return value;
  };

  // ── UNITS ──────────────────────────────────────────────────────────────────
  //
  // The unit count is the most load-bearing figure in the whole takeoff — it
  // drives corridor unit-entry sconces, kitchen pendants, ceiling fans, living
  // room and entry disks, and pathway lighting (Mike, 2026-09-15: "# of units
  // cant be off. it affects so much and also affected the # of corridor unit
  // entry socnces"). So the rule is: the HIGHEST credible whole-project total
  // wins, and any disagreement is always shown.
  //
  // Why "highest" rather than "the matrix": a matrix that sums BELOW a total
  // printed on the document means rows were missed — sheets that didn't get
  // read, a second building's matrix, rows the merge collapsed. A matrix can
  // never legitimately cover fewer units than the project has. The reverse
  // (matrix above the printed total) is legitimate — a per-building total on a
  // multi-building set — so the matrix keeps its win there, flagged.
  //
  // This is only safe because of the extraction contract: statedTotalUnits is
  // defined as the total AS PRINTED, never one the reader added up itself
  // (see EXTRACT_SYSTEM in drawingExtract.js). A computed total could not
  // check anything; a printed one can.
  const matrixUnits = rows.reduce((s, r) => s + qtyOf(r), 0);
  const noQtyRows   = rows.filter(r => !qtyOf(r)).length;
  const statedUnits = stated(totals?.statedTotalUnits);
  const siteUnits   = stated(site?.totalUnits);
  const mix         = bedroomsFromMix(site?.bedMix);

  // The best whole-project total stated anywhere, and what to call it.
  let projectTotal = null, projectTotalWhere = null;
  if (statedUnits != null && (siteUnits == null || statedUnits >= siteUnits)) {
    projectTotal = statedUnits; projectTotalWhere = "the document's own stated total";
  } else if (siteUnits != null) {
    projectTotal = siteUnits; projectTotalWhere = 'the site plan data block';
  }

  let unitCount = null, unitHow = 'Not found on any drawing.', unitSource = null, unitFlag = null;
  if (matrixUnits > 0) {
    unitSource = 'drawing';
    if (projectTotal != null && projectTotal > matrixUnits) {
      // Rows were missed. Trust the printed project total.
      unitCount = projectTotal;
      unitHow = `${fmt(projectTotal)} units stated on the drawings (${projectTotalWhere}). The unit matrix that was read only sums to ${fmt(matrixUnits)}, so it does not cover the whole project.`;
      unitFlag = `The unit matrix rows sum to ${fmt(matrixUnits)} but the drawings state ${fmt(projectTotal)} units — ${fmt(projectTotal - matrixUnits)} units are missing from the matrix that was read. The stated total is being used. Everything counted per unit (bedrooms, bathrooms, balconies, unit SF) was scaled up to match, so confirm those against the drawings.`;
    } else {
      unitCount = matrixUnits;
      unitHow = `Sum of the unit matrix rows (${rows.filter(qtyOf).length} unit types).`;
      // EVERY whole-project total that disagrees gets named, not just the one
      // the ladder happened to pick. The drawings can state two (the document's
      // own total and the site plan data block); comparing only the higher of
      // them meant a printed total below the matrix went unmentioned whenever
      // the site plan agreed with the matrix — the disagreement was real and
      // the reviewer never heard about it.
      const disagrees = [];
      if (statedUnits != null && statedUnits !== matrixUnits) disagrees.push(`${fmt(statedUnits)} on the document`);
      if (siteUnits   != null && siteUnits   !== matrixUnits) disagrees.push(`${fmt(siteUnits)} on the site plan data block`);
      if (disagrees.length > 0) {
        unitFlag = `The rows sum to ${fmt(matrixUnits)} but the drawings also state ${disagrees.join(' and ')}. The higher figure is being used — on a multi-building set a stated total is often for one building only, but confirm it.`;
      }
    }
    if (noQtyRows > 0) {
      const note = `${fmt(noQtyRows)} unit-type row${noQtyRows > 1 ? 's were' : ' was'} read with no quantity, so ${noQtyRows > 1 ? 'they are' : 'it is'} not counted anywhere above. Check the matrix for rows whose quantity did not come through.`;
      unitFlag = unitFlag ? `${unitFlag} ${note}` : note;
    }
  } else if (statedUnits != null) {
    unitCount = statedUnits; unitSource = 'drawing';
    unitHow = 'Stated total on the document (no per-type matrix was found).';
  } else if (siteUnits != null) {
    unitCount = siteUnits; unitSource = 'drawing';
    unitHow = 'Stated on the site plan data block.';
  } else if (statedAnswer(ans.figureTotalUnits) != null) {
    unitCount = statedAnswer(ans.figureTotalUnits); unitSource = 'questionnaire';
    unitHow = 'Entered on the questionnaire — no unit count was found on the drawings.';
  }
  // A corrected unit count has to be settled HERE, before the per-unit columns
  // below are scaled onto it. Left to add() alone, bedrooms, bathrooms,
  // balconies and unit SF would go on being spread across the count we read
  // while the corridor sconces priced off the corrected one — the two halves
  // of the takeoff would quietly disagree, which is the exact failure Mike
  // reported ("# of units cant be off. it affects so much").
  const unitRead = unitCount;
  const unitFix  = correctionFor(ans, 'totalUnits');
  if (unitFix != null && unitFix > 0) unitCount = unitFix;
  // add() is handed what we READ, not the correction, so the row it emits can
  // show both ("Corrected by you to 472. We read 294 — …"). `unitCount` stays
  // corrected for the per-unit columns below.
  add('totalUnits', '# Units', 'count', unitRead, unitSource, unitHow, unitFlag);

  // ── BEDROOMS / BATHROOMS / VANITIES ────────────────────────────────────────
  // Every column below is scaled onto the settled unit count above, so a
  // matrix that covered only part of the project doesn't drag all of these
  // down with it. See scaledToUnits().
  const beds = scaledToUnits(sumPerUnit(rows, 'bedrooms'), unitCount);
  if (beds) {
    add('bedrooms', '# Bedrooms', 'count', beds.value, 'drawing',
      beds.scaled
        ? `Bedrooms per unit type × unit quantities from the unit matrix (${fmt(beds.sum)} across ${fmt(beds.matrixUnits)} units), scaled to all ${fmt(beds.unitCount)} units.`
        : 'Bedrooms per unit type × unit quantities, from the unit matrix.',
      columnFlag(beds, 'a bedroom count'));
  } else if (mix) {
    add('bedrooms', '# Bedrooms', 'count', mix.bedrooms, 'drawing',
      'From the site plan bed mix (1× one-beds + 2× two-beds + 3× three-beds).',
      null);
  } else {
    add('bedrooms', '# Bedrooms', 'count', null, null,
      manual ? 'Not entered. The bedroom mix sets the fan count.' : 'No bedroom counts found in any drawing.');
  }

  const baths = scaledToUnits(sumPerUnit(rows, 'bathrooms'), unitCount);
  // No bathroom column (Mike 2026-09-24): the drawings' count → the bedroom
  // mix (studio/1BR/2BR = 1 bath, 3BR/4BR = 2 minimum) → vanities per unit
  // learned from our jobs (1.4 to start).
  // Townhouse / single-family forms with no bedroom info keep their type
  // guess (2.5 per home) further down — a house is almost never one bath.
  let bathEst = null;
  if (!baths && unitCount > 0) {
    const bedRows = rows.filter(r => qtyOf(r) && r.bedrooms != null && r.bedrooms !== '');
    if (bedRows.length) {
      const est = scaledToUnits(sumPerUnit(rows.map(r => ({ ...r, bathrooms: bathsFromBedrooms(r.bedrooms) })), 'bathrooms'), unitCount);
      if (est) bathEst = { value: est.value, how: 'Estimated from the bedroom mix: studio, 1- and 2-bed units at 1 bath, 3- and 4-bed units at 2. No bathroom count was found on the drawings.' };
    } else if (mix && mix.units > 0) {
      const b3 = stated(site?.bedMix?.threeBed) ?? 0;
      const v = Math.round((mix.units + b3) * (unitCount / mix.units));
      bathEst = { value: v, how: 'Estimated from the site plan bed mix: 1 bath per unit, 2 for three-beds. No bathroom count was found on the drawings.' };
    } else {
      // Nothing to go on: the vanities-per-unit stand-in (Mike 2026-09-24:
      // 1.4 per apartment). What our real jobs say is only a suggestion on
      // the Pre-Con dashboard until a person adopts it. A townhouse form keeps
      // its 2.5-per-home vanity guess further down.
      const bt = typeKey ?? site?.buildingType ?? null;
      const house = bt === 'townHouses' || bt === 'singleFamily';
      if (!(manual && house)) {
        const per = standIn('vanitiesPerUnit', bt) ?? 1.4;
        bathEst = { value: Math.round(unitCount * per), how: `${fmt(unitCount)} units × ${per} vanities per unit — typical for this building type. No bathroom count or bedroom mix was found.` };
      }
    }
  }
  const bathVal = baths ? baths.value : bathEst?.value ?? null;
  const bathSettled = add('bathrooms', '# Bathrooms', 'count', bathVal,
    baths ? 'drawing' : bathEst ? 'derived' : 'drawing',
    baths
      ? (baths.scaled
          ? `Bathrooms per unit type × unit quantities from the unit matrix (${fmt(baths.sum)} across ${fmt(baths.matrixUnits)} units), scaled to all ${fmt(baths.unitCount)} units.`
          : 'Bathrooms per unit type × unit quantities, from the unit matrix.')
      : bathEst ? bathEst.how
      : manual ? 'Not entered. It sets the vanity count.' : 'No bathroom counts found — unit matrices often omit them.',
    baths ? columnFlag(baths, 'a bathroom count')
      : bathEst ? 'ESTIMATED — no bathroom count on the drawings. Enter the real count if you have it.' : null);

  add('vanities', '# Vanities', 'count', bathSettled ?? null,
    'derived',
    bathSettled != null ? 'One vanity per bathroom (half baths count as whole).' : 'Follows the bathroom count, which was not found.',
    baths ? columnFlag(baths, 'a bathroom count') : null);

  // ── BALCONIES ──────────────────────────────────────────────────────────────
  // Never more balconies than units (Mike, 2026-09-24): 0 or 1 per unit, so
  // a balcony SF column misread as a count (Modera Town Lake came back 23,488
  // for 245) still counts each unit type once — see perUnitRule. The cap below
  // catches typed and guessed totals.
  const balcRaw = scaledToUnits(sumPerUnit(rows, 'balconies'), unitCount);
  const overUnits = v => unitCount > 0 && v > unitCount;
  const capBalc = v => (overUnits(v) ? unitCount : v);
  const capFlag = v => (overUnits(v)
    ? `We read ${fmt(v)} balconies, more than the ${fmt(unitCount)} units. Capped at one per unit — check the drawings.`
    : null);
  const balc = balcRaw ? { ...balcRaw, value: capBalc(balcRaw.value), read: balcRaw.value } : null;
  const balcHow = balc && balc.scaled
    ? `Balconies per unit type × unit quantities from the unit matrix (${fmt(balc.sum)} across ${fmt(balc.matrixUnits)} units), scaled to all ${fmt(balc.unitCount)} units.`
    : 'Balconies per unit type × unit quantities, from the unit matrix.';
  const noBalconies = ans.balconyLighting === 'No balconies';
  if (balc && balc.value > 0 && noBalconies) {
    add('balconies', '# of Balconies', 'count', balc.value, 'drawing', balcHow,
      `The questionnaire says there are no balconies, but the unit matrix lists ${fmt(balc.value)}. Check which is right.`);
  } else if (noBalconies) {
    add('balconies', '# of Balconies', 'count', 0, 'questionnaire', 'The questionnaire says the project has no balconies.');
  } else if (balc) {
    add('balconies', '# of Balconies', 'count', balc.value, 'drawing', balcHow,
      capFlag(balc.read) || columnFlag(balc, 'a balcony count'));
  } else if (statedCount(ans.figureBalconies) != null) {
    // Without a count, the balcony-lighting answer prices to $0 no matter what
    // the visitor picks (Mike, 2026-09-04: "Why does none ... not change the
    // budget?") — so the wizard now asks for the count when drawings lack it.
    const typed = statedCount(ans.figureBalconies);
    add('balconies', '# of Balconies', 'count', capBalc(typed), 'questionnaire',
      'Entered on the questionnaire — no balcony counts were found on the drawings.', capFlag(typed));
  } else if (guess('balconiesPerUnit') != null && unitCount > 0) {
    const est = capBalc(Math.round(unitCount * guess('balconiesPerUnit')));
    add('balconies', '# of Balconies', 'count', est, 'derived',
      `${fmt(unitCount)} units × ${guess('balconiesPerUnit')} balcony per unit — a typical figure for this building type.`, GUESS_FLAG);
  } else {
    add('balconies', '# of Balconies', 'count', null, null, 'No balcony counts found in any drawing, and the questionnaire did not rule them out.');
  }

  // ── CEILING FANS ───────────────────────────────────────────────────────────
  const fansAnswer = ans.ceilingFans || 'None';
  const bedroomTotal = beds ? beds.value : (mix ? mix.bedrooms : null);
  // Units with at least N bedrooms — "Master + Secondary" means one fan in
  // every unit with a bedroom plus a second in every unit with two or more.
  // Scaled by the same factor as the bedroom column, so fan counts track the
  // real unit count rather than the slice of it the matrix happened to cover.
  const unitsWithBedAtLeast = (min) => beds
    ? Math.round(rows.reduce((s, r) => s + (Number(r.bedrooms) >= min ? qtyOf(r) : 0), 0)
        * (beds.scaled ? beds.factor : 1))
    : (mix ? [null,
        mix.unitsWithBedroom,
        (stated(site?.bedMix?.twoBed) ?? 0) + (stated(site?.bedMix?.threeBed) ?? 0),
        stated(site?.bedMix?.threeBed) ?? 0,
      ][min] ?? null : null);
  const unitsWithBed = unitsWithBedAtLeast(1);

  let fans = null, fansHow = '', fansFlag = null;
  if (fansAnswer === 'None') {
    fans = 0; fansHow = 'The questionnaire asked for no ceiling fans.';
  } else if (fansAnswer === 'Master bed only') {
    fans = unitsWithBed ?? unitCount;
    fansHow = unitsWithBed != null
      ? 'One fan per unit that has at least one bedroom ("Master bed only").'
      : 'One fan per unit ("Master bed only") — bedroom counts were not found, so studios could not be excluded.';
    if (unitsWithBed == null && fans != null) fansFlag = 'Assumes every unit has a master bedroom. If there are studios, this overcounts.';
  } else if (fansAnswer === 'All bedrooms') {
    fans = bedroomTotal; fansHow = 'One fan per bedroom ("All bedrooms").';
    if (fans == null) fansHow = 'One fan per bedroom was requested, but no bedroom counts were found.';
  } else if (fansAnswer === 'Bedrooms and living room') {
    fans = (bedroomTotal != null && unitCount != null) ? bedroomTotal + unitCount : null;
    fansHow = fans != null
      ? `One fan per bedroom (${fmt(bedroomTotal)}) plus one per living room (${fmt(unitCount)} units).`
      : 'Bedrooms plus living rooms was requested, but the bedroom or unit count is missing.';
  } else if (fansAnswer === 'Living room only') {
    fans = unitCount; fansHow = fans != null ? 'One fan per unit living room.' : 'One per living room was requested, but the unit count is missing.';
  } else {
    // The current questionnaire's combination answers ("Master bed + Living
    // room", "Master bed/Secondary bed/Tertiary bed + Living room", ...).
    // Bedrooms counted = one fan per unit with >= N bedrooms per named bed;
    // "+ Living room" adds one per unit. The earlier literals above stay for
    // old submissions, which are recomputed on view.
    const bedTiers   = (fansAnswer.match(/Master bed/) ? 1 : 0)
                     + (fansAnswer.match(/Secondary bed/) ? 1 : 0)
                     + (fansAnswer.match(/Tertiary bed/) ? 1 : 0);
    const livingRoom = /Living room/.test(fansAnswer);
    if (bedTiers > 0 || livingRoom) {
      const parts = [];
      let total = 0, missing = false;
      for (let t = 1; t <= bedTiers; t++) {
        const c = unitsWithBedAtLeast(t);
        if (c == null) { missing = true; break; }
        total += c;
        parts.push(`${fmt(c)} units with ${t}+ bedroom${t > 1 ? 's' : ''}`);
      }
      if (livingRoom && !missing) {
        if (unitCount == null) { missing = true; }
        else { total += unitCount; parts.push(`${fmt(unitCount)} living rooms`); }
      }
      if (!missing) {
        fans = total;
        fansHow = `One fan per room requested ("${fansAnswer}"): ${parts.join(' + ')}.`;
        if (bedTiers > 0 && !beds && mix) {
          fansFlag = 'Bedroom mix came from the site plan D.U. mix, not a unit matrix — spot-check the per-bedroom counts.';
        }
      } else {
        fansHow = `"${fansAnswer}" was requested, but the bedroom mix or unit count needed to place the fans was not found on the drawings.`;
      }
    }
  }
  add('ceilingFans', '# Ceiling Fans', 'count', fans, fansAnswer === 'None' ? 'questionnaire' : 'derived', fansHow, fansFlag);

  // ── SQUARE FOOTAGE BY CATEGORY ─────────────────────────────────────────────
  const unitSf = scaledToUnits(sumPerUnit(rows, 'unitSf'), unitCount);
  const avgUnitTyped = statedAnswer(ans.figureAvgUnitSf);
  const grossTypedEarly = statedAnswer(ans.figureGrossSf);
  if (unitSf) {
    add('unitsSf', 'Residential Units SF', 'sf', unitSf.value, 'derived',
      unitSf.scaled
        ? `Unit SF per type × unit quantities from the unit matrix (${fmt(unitSf.sum)} SF across ${fmt(unitSf.matrixUnits)} units), scaled to all ${fmt(unitSf.unitCount)} units.`
        : 'Unit SF per type × unit quantities, from the unit matrix.',
      columnFlag(unitSf, 'a unit SF'));
  } else if (avgUnitTyped != null && unitCount > 0) {
    add('unitsSf', 'Residential Units SF', 'sf', Math.round(unitCount * avgUnitTyped), 'questionnaire',
      `${fmt(unitCount)} units × ${fmt(avgUnitTyped)} SF average unit size (entered on the questionnaire).`);
  } else if (manual && grossTypedEarly != null) {
    // Without a unit size the engine would price the WHOLE building as unit
    // area — the inverse of the units→gross factor is the better stand-in.
    add('unitsSf', 'Residential Units SF', 'sf', Math.round(grossTypedEarly / unitsToGross), 'derived',
      `Building ${fmt(grossTypedEarly)} SF ÷ ${unitsToGross} — the rest is corridors, walls and back of house.`,
      'ESTIMATED from the building total — enter the average unit size if you know it.');
  } else {
    add('unitsSf', 'Residential Units SF', 'sf', null, null, 'The unit matrix did not list square footage per type.');
  }

  // Gross SF ladder: a drawing-stated (or per-building-summed) total wins,
  // then a figure the visitor typed. Two derived estimates (footprint ×
  // stories, then unit-SF blow-up) are patched in at the END of this function
  // because their ingredients are computed below this section. It sits above
  // the area rows because the corridor estimate below is a share of it.
  const grossStated = stated(totals?.grossInteriorSf) ?? stated(site?.grossSf);
  const grossFigure = grossStated == null ? statedAnswer(ans.figureGrossSf) : null;
  // `grossSf` is what add() SETTLED on, so every later use of it — corridors
  // and back of house below, the footprint checks further down — prices off
  // a corrected building total rather than the one we misread.
  const grossRead = grossStated ?? grossFigure;
  const grossSf = add('grossSf', 'Total Building Gross SF', 'sf', grossRead,
    grossStated != null ? 'drawing' : 'questionnaire',
    grossStated == null
      ? (grossFigure != null
          ? 'Entered on the questionnaire — no stated total was found on the drawings.'
          : 'No stated building total was found.')
      : totals?.grossSfSummed && totals?.grossSfSummary
        ? String(totals.grossSfSummary)
        : totals?.grossSfLabel
          ? `Read from the "${totals.grossSfLabel}" line on the drawings.`
          : 'Stated total on the drawings.',
    grossStated != null && totals?.grossSfNeedsReview
      ? String(totals.grossSfNote || 'The gross-SF read needs review — confirm which total was read.') : null);

  // Stated on the drawings wins; a figure typed on the questionnaire (the
  // no-drawings form) is next; otherwise not found.
  const areaRow = (key, label, statedVal, statedHow, figureKey) => {
    // A typed 0 is a real answer, "there is none" (Mike 10-14); only a blank
    // box is estimated.
    const typed = statedVal == null ? statedCount(ans[figureKey]) : null;
    // add()'s return, not `statedVal ?? typed` — so a corrected area is the one
    // the remainder below is taken off, and so a corrected exterior amenity SF
    // clears the "this $/SF cannot move the budget" flag instead of keeping it.
    return add(key, label, 'sf', statedVal ?? typed, statedVal != null ? 'drawing' : 'questionnaire',
      statedVal != null ? statedHow
        : typed != null ? 'Entered on the questionnaire — not found on the drawings.'
        : 'Not stated on any drawing.');
  };
  areaRow('garageSf', 'Garage SF', stated(totals?.garageSf), 'Stated on the drawings.', 'figureGarageSf');

  // Corridors. Mike 2026-09-16: "We need to figure out some calculation off
  // corridor SF with a cap like BOH because it's also a very typical % range
  // of the overall gross SF … If it isn't stated somewhere in a breakdown/
  // matrix and could be called circulation, corridors, hallways, etc."
  // Ladder: a corridor / circulation line printed in an area table (taken as
  // printed; the cap only trims a figure above it) → typed by the visitor →
  // the building type's typical share of gross, flagged as an estimate →
  // blank with an ask. Before this a drawing-read job never estimated
  // corridors, and the back-of-house remainder quietly absorbed them.
  const corridorMaxPct = Number(pricing?.corridors?.maxPctOfGross) > 0
    ? Number(pricing.corridors.maxPctOfGross)
    : (PRICING.corridors.maxPctOfGross ?? 0.15);
  const corridorPctLabel = `${Math.round(corridorMaxPct * 100)}%`;
  const corridorStated = stated(totals?.corridorSf);
  const corridorTyped  = corridorStated == null ? statedCount(ans.figureCorridorSf) : null;
  const corridorShare  = typeShare('corridorPctOfGross');
  const corridorCap    = grossSf != null ? Math.round(grossSf * corridorMaxPct) : null;
  let corridorSf;
  if (corridorStated != null) {
    const capped = corridorCap != null && corridorStated > corridorCap;
    corridorSf = add('corridorSf', 'Corridors & Stairwells SF', 'sf', capped ? corridorCap : Math.round(corridorStated), 'drawing',
      capped
        ? `The drawings state ${fmt(Math.round(corridorStated))} SF of corridors, capped at ${corridorPctLabel} of gross (${fmt(corridorCap)} SF).`
        : 'Stated on the drawings (a corridor / circulation line in an area table).',
      capped
        ? `The drawings state ${fmt(Math.round(corridorStated))} SF of corridors, which is above the ${corridorPctLabel}-of-gross corridor cap — check whether that line also includes lobbies, amenity or stairs.`
        : null);
  } else if (corridorTyped != null) {
    corridorSf = add('corridorSf', 'Corridors & Stairwells SF', 'sf', corridorTyped, 'questionnaire',
      'Entered on the questionnaire — not found on the drawings.');
  } else if (corridorShare != null && grossSf != null) {
    corridorSf = add('corridorSf', 'Corridors & Stairwells SF', 'sf', Math.round(grossSf * corridorShare), 'derived',
      corridorShare > 0
        ? `${Math.round(corridorShare * 100)}% of the ${fmt(grossSf)} SF building — a typical corridor share for this building type; no corridor / circulation line was printed on the drawings.`
        : 'This building type has open breezeways or private entries, so no interior corridors are assumed.',
      corridorShare > 0
        ? (manual ? GUESS_FLAG
            : 'ESTIMATED as a typical share of gross — no corridor / circulation area was printed on any drawing. Enter the corridor SF if you have it.')
        : null);
  } else {
    corridorSf = add('corridorSf', 'Corridors & Stairwells SF', 'sf', null, null,
      manual ? 'Not entered.' : 'No corridor / circulation line was found on any drawing — enter it.');
  }
  // Amenity by level (Mike 2026-09-24, Modera Town Lake): high-rise and podium
  // sets print a gross-area-by-level table with AMENITY and AMENITY DECK
  // columns. The reader lists each level's printed figures; THIS code adds
  // them up, so the row shows which levels it came from.
  const amenityLevels = Array.isArray(totals?.amenityLevels)
    ? totals.amenityLevels.filter(l => l && (stated(l.interiorSf) > 0 || stated(l.exteriorSf) > 0)) : [];
  const levelSum = (k) => {
    const hits = amenityLevels.filter(l => stated(l[k]) > 0);
    return hits.length ? { sf: hits.reduce((a, l) => a + stated(l[k]), 0),
      words: hits.map(l => `${String(l.level || 'level').trim()} ${fmt(stated(l[k]))}`).join(' + ') } : null;
  };
  const intLevels = levelSum('interiorSf');
  const extLevels = levelSum('exteriorSf');
  const intTable  = intLevels ? null : stated(totals?.interiorAmenitySf);
  const extTable  = extLevels ? null : stated(totals?.exteriorAmenitySf);
  const interiorAmenitySf = areaRow('interiorAmenitySf', 'Interior Amenity SF',
    intLevels?.sf ?? intTable ?? stated(site?.clubhouseSf),
    intLevels ? `From the area-by-level table: ${intLevels.words} SF.`
      : intTable != null ? "From the amenity line in the drawings' area table."
      : 'From the clubhouse figure on the site plan.', 'figureInteriorAmenitySf');
  // Exterior amenity SF is the multiplicand for the exterior amenity $/SF
  // question. Mike, 2026-09-15: "Exterior amenity math in the conceptual
  // budgeting tool isn't working. I click a different $/sf and nothing
  // changes." The rate was never the problem — SF × rate is zero at every
  // rate when the SF is zero, so the control looked dead. Nothing here
  // invents an amenity area (there is no honest way to guess one); instead
  // the row says plainly that the $/SF choice cannot move the budget until
  // the figure is filled in, and the wizard now asks for it.
  //
  // Ladder (Mike 2026-09-16): a figure PRINTED on a sheet → a figure the
  // reader MEASURED off a scaled site or landscape plan (pool enclosure plus
  // the hardscape touching the clubhouse) → typed → $0 with the flag above.
  // A measurement is flagged with how the scale was found, so a reviewer can
  // see it is arithmetic off a drawing rather than something the drawing said.
  const printedExtSf  = extLevels?.sf ?? extTable ?? stated(site?.amenitySf);
  const measuredExtSf = printedExtSf == null ? stated(site?.exteriorAmenitySfMeasured) : null;
  const extAmenitySf = areaRow('exteriorAmenitySf', 'Exterior Amenity SF',
    printedExtSf ?? (measuredExtSf > 0 ? measuredExtSf : null),
    extLevels ? `From the area-by-level table (amenity / pool decks): ${extLevels.words} SF.`
      : extTable != null ? "From the amenity-deck line in the drawings' area table."
      : printedExtSf != null
      ? 'From the amenity-area figure on the site plan — usually the outdoor programme (pool deck, courtyards).'
      : 'Measured off the scaled site / landscape plan — the pool enclosure plus the hardscape touching the clubhouse.',
    'figureExteriorAmenitySf');
  const extTypedZero = extAmenitySf === 0 && out[out.length - 1]?.source === 'questionnaire';
  if (!(extAmenitySf > 0) && !extTypedZero) {
    const extRow = out[out.length - 1];
    extRow.flag = 'No exterior amenity area was found, so the exterior amenity $/SF you pick cannot change the budget — this line prices at $0 until a square footage is entered. Enter the outdoor amenity area (pool deck, courtyards, plazas) if the project has one.';
  } else if (printedExtSf == null && measuredExtSf > 0) {
    const extRow = out[out.length - 1];
    if (!extRow.corrected) {
      extRow.flag = `Measured off the drawing, not printed on it (scale from ${SCALE_BASIS_WORDS[site?.scaleBasis] || 'an unstated basis'}) — confirm.`;
    }
  }

  // Back of house is the remainder — what's left of the stated gross after
  // the categories the drawings itemized. Only computable when the two big
  // numbers (gross and total unit SF) both exist, and always flagged as
  // arithmetic rather than a reading. A figure the visitor typed (the
  // no-drawings form) beats the arithmetic.
  //
  // Mike's cap (2026-09-04): BOH is never more than 5% of gross SF. The
  // remainder also holds corridors/walls when those weren't stated, and
  // uncapped it overprices BOH badly (Fulshear: 63,953 SF ≈ 15.6% of gross).
  const bohMaxPct = Number(pricing?.boh?.maxPctOfGross) > 0
    ? Number(pricing.boh.maxPctOfGross)
    : (PRICING.boh.maxPctOfGross ?? 0.05);
  // Unit SF is read back off its ROW for the same reason as gross above: a
  // hand-corrected figure has to be the one the remainder is taken off.
  // `partial` records how much of the unit matrix we managed to read, and a
  // person who has typed the real number has already overruled that doubt —
  // so a corrected figure counts as complete coverage.
  const unitsSfRow   = out.find(r => r.key === 'unitsSf');
  const unitsSfFinal = unitsSfRow?.value ?? null;
  const unitsSfWhole = unitsSfFinal != null
    && (unitsSfRow.corrected === true || (!!unitSf && !unitSf.partial));
  const bohTyped  = statedCount(ans.figureBohSf);
  // Mike 2026-09-16: "Keep the 5% cap but the system should always take what
  // the drawings say, not add to it to hit the cap. It's only if the drawings
  // say something above the cap or there is no info at all." So a printed BOH
  // figure is used as printed; the cap only trims a printed figure that is
  // above it, and the remainder arithmetic below runs only when nothing was
  // printed. The remainder path never rounds UP to the cap either.
  const bohStated = stated(totals?.bohSf);
  if (bohStated != null) {
    const bohCap = grossSf != null ? Math.round(grossSf * bohMaxPct) : null;
    const capped = bohCap != null && bohStated > bohCap;
    add('bohSf', 'Back of House SF', 'sf', capped ? bohCap : Math.round(bohStated), 'drawing',
      capped
        ? `The drawings state ${fmt(Math.round(bohStated))} SF of back of house, capped at ${Math.round(bohMaxPct * 100)}% of gross (${fmt(bohCap)} SF).`
        : 'Stated on the drawings (mechanical, storage, trash, bike rooms).',
      capped
        ? `The drawings state ${fmt(Math.round(bohStated))} SF of back of house, which is above the ${Math.round(bohMaxPct * 100)}%-of-gross BOH cap — check whether that figure includes corridors or amenity.`
        : null);
  } else if (bohTyped != null) {
    add('bohSf', 'Back of House SF', 'sf', bohTyped, 'questionnaire', 'Entered on the questionnaire.');
  } else if (grossSf != null && unitsSfWhole && corridorSf != null) {
    // The remainder is only honest once the corridors are out of it. Mike
    // 2026-09-16 asked why corridors were landing in BOH: before this the
    // remainder ran with corridors "?? 0" and the whole corridor area got
    // priced at the BOH rate. Now the corridor row above always settles first
    // (printed → typed → typical share), and the remainder never runs without
    // it. Interior amenity still defaults to 0 with a note — there is no
    // typical share to estimate it from.
    const itemized = unitsSfFinal + corridorSf + (interiorAmenitySf ?? 0);
    const remainder = grossSf - itemized;
    const skipped = interiorAmenitySf == null ? 'interior amenity' : null;
    if (remainder >= 0) {
      const bohCap = Math.round(grossSf * bohMaxPct);
      const capped = remainder > bohCap;
      add('bohSf', 'Back of House SF (remainder)', 'sf', capped ? bohCap : Math.round(remainder), 'derived',
        `Gross ${fmt(grossSf)} minus units ${fmt(unitsSfFinal)}, corridors ${fmt(corridorSf)}${interiorAmenitySf != null ? `, interior amenity ${fmt(interiorAmenitySf)}` : ''}${capped ? ` = ${fmt(Math.round(remainder))}, capped at ${Math.round(bohMaxPct * 100)}% of gross` : ''}.`,
        capped
          ? `The raw remainder (${fmt(Math.round(remainder))} SF) exceeded the ${Math.round(bohMaxPct * 100)}%-of-gross BOH cap${skipped ? ` — it likely still contains ${skipped}` : ' — walls and shafts make up the rest'}.`
          : (skipped ? `No ${skipped} SF was stated, so this remainder still contains ${skipped}.` : null));
    } else {
      add('bohSf', 'Back of House SF (remainder)', 'sf', null, null,
        'Could not be computed.',
        `The itemized areas (${fmt(itemized)} SF) sum to MORE than the stated gross (${fmt(grossSf)} SF) — one of them was misread, or the gross figure is net.`);
    }
  } else if (grossSf != null && unitsSfWhole) {
    add('bohSf', 'Back of House SF (remainder)', 'sf', null, null,
      'Needs the corridor SF first — without it the remainder of gross minus units would still contain the corridors.');
  } else {
    add('bohSf', 'Back of House SF (remainder)', 'sf', null, null,
      'Needs both a stated building gross SF and a complete per-unit SF column to compute.');
  }

  // ── STAIRS & EGRESS ────────────────────────────────────────────────────────
  // Stated wins; a COUNTED figure (read off a drawn view, the one deliberate
  // exception to the no-counting rule) fills in only when nothing was stated,
  // and always arrives flagged so a reviewer knows it was counted, not read.
  // A VISITOR-TYPED figure is the last rung — the wizard asks for it only
  // when the drawings answered nothing.
  const storiesStated = stated(site?.stories);
  const storiesCounted = stated(site?.storiesCounted);
  const storiesTyped = storiesStated == null && storiesCounted == null ? statedAnswer(ans.figureStories) : null;
  const storiesGuess = storiesStated == null && storiesCounted == null && storiesTyped == null
    ? guess('storiesByType') : null;
  const stories = storiesStated ?? storiesCounted ?? storiesTyped ?? storiesGuess;
  add('stories', '# Stories', 'count', stories,
    storiesTyped != null ? 'questionnaire' : storiesGuess != null ? 'derived' : 'drawing',
    storiesStated != null ? 'Stated on the drawings (code summary or title block).'
      : storiesCounted != null ? 'Counted off the building elevation (floor levels / window rows).'
      : storiesTyped != null ? 'Entered on the questionnaire — not found on the drawings.'
      : storiesGuess != null ? 'A typical story count for this building type.'
      : NOT_STATED,
    storiesStated == null && storiesCounted != null
      ? 'Counted off the elevation, not stated in writing — confirm against the code summary.'
      : storiesGuess != null ? GUESS_FLAG : null);

  // Residential buildings: stated in a site data block → counted from the
  // building labels on the site plan (flagged) → typed by the visitor. Drives
  // the stair multiply just below and the engine's wallpack model.
  const buildingsStated  = stated(site?.buildingCount);
  const buildingsCounted = buildingsStated == null ? stated(site?.buildingsCounted) : null;
  const buildingsTyped   = buildingsStated == null && buildingsCounted == null
    ? statedAnswer(ans.figureBuildings) : null;
  const buildings = add('buildings', '# Residential Buildings', 'count',
    buildingsStated ?? buildingsCounted ?? buildingsTyped,
    buildingsTyped != null ? 'questionnaire' : 'drawing',
    buildingsStated != null ? 'Stated on the drawings (site data block or code summary).'
      : buildingsCounted != null ? 'Counted from the building labels on the site plan ("BLDG 1", "BUILDING A" …) — clubhouse and garages excluded.'
      : buildingsTyped != null ? 'Entered on the questionnaire — not found on the drawings.'
      : NOT_STATED,
    buildingsCounted != null
      ? 'Counted off the site plan, not stated in writing — confirm the number of residential buildings.' : null);

  // Egress stairs. What the drawings state or show is for ONE building — a
  // code summary or a floor plan describes one building — so the project
  // total is that figure × the building count. Mike 2026-09-16 on Lone Tree:
  // "We were way off on egress stairwell landings. We counted 48, you
  // counted 17." Four buildings × 3 stairs each = 12 stairs, not 3. A count
  // typed by the visitor is taken as the whole-project total.
  const stairsStated  = stated(site?.egressStairwells);
  const stairsCounted = stated(site?.egressStairwellsCounted);
  const stairsPerBldg = stairsStated ?? stairsCounted;
  const stairsTyped   = stairsPerBldg == null ? statedAnswer(ans.figureStairwells) : null;
  const bldgMult      = Math.max(1, Math.round(buildings ?? 1));
  const stairsMultiply = stairsPerBldg != null && bldgMult > 1
    ? `: ${fmt(stairsPerBldg)} per building × ${fmt(bldgMult)} buildings = ${fmt(stairsPerBldg * bldgMult)}`
    : '';
  const stairs = add('egressStairwells', '# Egress Stairwells', 'count',
    stairsPerBldg != null ? stairsPerBldg * bldgMult : stairsTyped,
    stairsTyped != null ? 'questionnaire' : 'drawing',
    stairsStated != null ? `Stated on the drawings (exit-stair line in a code summary)${stairsMultiply}.`
      : stairsCounted != null ? `Counted as stair shafts on one building's floor plan (a switchback pair is one stairwell)${stairsMultiply}.`
      : stairsTyped != null ? 'Entered on the questionnaire — the total for the whole project.'
      : NOT_STATED,
    stairsStated == null && stairsCounted != null
      ? 'Counted off the floor plan, not stated in writing — confirm the per-building shaft count and the building count.'
      : stairsPerBldg != null && buildings == null && !manual
      ? 'No building count was found, so this assumes ONE building — enter the number of buildings if there are more.'
      : null);
  const stairsRowRef = out[out.length - 1];

  // A visitor-typed landings count wins over the 2N−1 derivation — the wizard
  // asks for LANDINGS directly (Mike, 2026-09-04: '"# Egress stairwells"
  // should be "# Egress stairwell landings"'), matching the internal Project
  // Data field, and the ask card offers this as the override on a derived row.
  //
  // Otherwise the shared estimator (src/lib/stairLandings.js) does the
  // 2N−1 arithmetic and adds Mike's 10% contingency. When the drawings never
  // stated the stair count, the building-code fallback is patched in at the
  // END of this function, once the footprint and gross rows it needs exist.
  // Mike 10-2: "It should be 1 or the other and the math comes from there."
  // The stair count is the one input; landings always follow it. A typed
  // landings figure (older drafts asked for it) only counts when there is no
  // stair count at all.
  const landingsTyped = stairs == null ? statedAnswer(ans.figureStairLandings) : null;
  if (landingsTyped != null) {
    add('stairLandings', '# Stair Landings', 'count', landingsTyped, 'questionnaire',
      'Entered on the questionnaire — count every landing, including the half-landing between floors.');
  } else if (stories != null && stairs != null && stories >= 1) {
    // The per-building form is handed over when the stair row is still the
    // drawings' own figure, so the explanation shows the multiply ("4
    // buildings × 3 exit stairs each = 12 stairs"); a hand-corrected total
    // is passed as the total it is.
    const est = stairsPerBldg != null && stairsRowRef?.corrected !== true
      ? estimateStairLandings({ stories, stairsPerBuilding: stairsPerBldg, buildings: bldgMult }, pricing)
      : estimateStairLandings({ stories, stairs }, pricing);
    const typed = storiesTyped != null || stairsTyped != null;
    const counted = !typed && (storiesStated == null || stairsStated == null || buildingsCounted != null);
    add('stairLandings', '# Stair Landings', 'count', est.landings, 'derived', est.how,
      typed
        ? 'Built on a figure the visitor typed (see the story / stair rows). Assumes switchback stairs in enclosed shafts.'
        : counted
        ? 'Built on a COUNTED story or stair figure (see those rows) — confirm them before trusting this. Assumes switchback stairs in enclosed shafts.'
        : 'Assumes switchback stairs in enclosed shafts. Open or straight-run stairs land differently — confirm on the plans.');
  } else {
    add('stairLandings', '# Stair Landings', 'count', null, null,
      'Needs the story count and the egress stair count (landings = stairs × (2 × stories − 1)), a building-code estimate, or a landings count typed on the questionnaire.');
  }

  const exitsStated = stated(site?.exitDoors);
  const exitsCounted = stated(site?.exitDoorsCounted);
  const exitsTyped = exitsStated == null && exitsCounted == null ? statedAnswer(ans.figureExitDoors) : null;
  const exits = exitsStated ?? exitsCounted ?? exitsTyped;
  add('exitDoors', '# Egress/Exit Doors', 'count', exits,
    exitsTyped != null ? 'questionnaire' : 'drawing',
    exitsStated != null ? 'Stated on the drawings (exits-provided line in a code summary).'
      : exitsCounted != null ? 'Counted as marked exits on the ground-floor / life-safety plan.'
      : exitsTyped != null ? 'Entered on the questionnaire — not found on the drawings.'
      : NOT_STATED,
    exitsStated == null && exitsCounted != null
      ? 'Counted off the plan, not stated in writing — confirm against the code summary.' : null);

  // ── PARKING ────────────────────────────────────────────────────────────────
  // Mike's ladder (2026-09-11): "it says number spaces you find it and put it
  // in. then do units times the minimum required number of spaces ... and if
  // those don't work then you count it." So: the stall number WRITTEN on the
  // drawings → units × the code-required rate → the stalls COUNTED off the
  // site plan. A figure typed on the questionnaire outranks every estimate
  // (it is a human answering), but never a written number.
  //
  // The total-based rungs subtract garages and carports (they are lit by their
  // own lines) and are skipped outright for structured-parking buildings,
  // where most stalls are inside the garage and a site total says nothing
  // about how many are out in the open.
  const surfaceStated  = stated(site?.surfaceParking);
  const provided       = stated(site?.parkingProvided);
  const requiredTotal  = stated(site?.parkingRequired);
  const ratio          = stated(site?.parkingRatioRequired);
  const surfaceCounted = stated(site?.surfaceParkingCounted);
  const surfaceTyped   = surfaceStated == null ? statedCount(ans.figureSurfaceParking) : null;
  const parkingType    = answersToEngine(answers).buildingTypeKey ?? site?.buildingType ?? totals?.buildingType ?? null;
  const structuredParking = STRUCTURED_PARKING_TYPES.has(parkingType);
  const covered   = (stated(site?.garages) ?? 0) + (stated(site?.carports) ?? stated(site?.carportsCounted) ?? 0);
  const lessCovered = covered ? `, less ${fmt(covered)} garage and carport stalls` : '';
  const openAir   = total => (total - covered > 0 ? total - covered : null);

  let surface = null, surfaceSource = null, surfaceHow = 'Not stated on the site plan.', surfaceFlag = null;
  if (surfaceStated != null) {
    surface = surfaceStated; surfaceSource = 'drawing';
    surfaceHow = 'Stated on the site plan.';
    if (provided != null && surface > provided) {
      surfaceFlag = `More surface stalls (${fmt(surface)}) than total provided (${fmt(provided)}) — one was misread.`;
    }
  } else if (surfaceTyped != null) {
    surface = surfaceTyped; surfaceSource = 'questionnaire';
    surfaceHow = 'Entered on the questionnaire — not found on the site plan.';
  } else if (provided != null && openAir(provided) != null && (!structuredParking || covered > 0)) {
    // A stated provided-stall total, less the stalls lit by the garage and
    // carport lines. On a structured-parking building this subtraction is only
    // meaningful when the covered count is actually known — otherwise the
    // total says nothing about how many stalls are out in the open, and the
    // ask-the-visitor branch further down handles it.
    //
    // Mike, 2026-09-15: "It is not grabbing the number of parking stalls even
    // if it reads that in the drawings it seems." Before this, a wrap/podium/
    // mid-rise/high-rise job threw away a stated total outright and produced
    // no stall figure at all, so the site-lighting line came in at zero.
    surface = openAir(provided); surfaceSource = 'derived';
    surfaceHow = `The site plan states ${fmt(provided)} stalls provided${lessCovered}.`;
    surfaceFlag = structuredParking
      ? `This building parks mostly in a garage, so this is the ${fmt(provided)} stated stalls less the ${fmt(covered)} garage and carport stalls on file. If the garage holds more than that, this overcounts the open-air stalls — confirm the split.`
      : 'Only a total was stated, with no surface / garage split — confirm how many stalls are open-air.';
  } else if (!structuredParking && (requiredTotal != null || (ratio != null && unitCount > 0))
             && openAir(requiredTotal ?? Math.ceil(unitCount * ratio)) != null) {
    const total = requiredTotal ?? Math.ceil(unitCount * ratio);
    surface = openAir(total); surfaceSource = 'derived';
    surfaceHow = requiredTotal != null
      ? `The drawings give no stall count, so this uses the ${fmt(requiredTotal)} stalls code requires${lessCovered}.`
      : `The drawings give no stall count, so this is ${fmt(unitCount)} units × ${ratio} required spaces per unit = ${fmt(total)}${lessCovered}.`;
    surfaceFlag = 'Estimated from the code-required parking — the drawings do not state a stall count.';
  } else if (surfaceCounted != null) {
    surface = surfaceCounted; surfaceSource = 'drawing';
    surfaceHow = 'Counted as striped surface stalls on the site plan — no stall number was written anywhere.';
    surfaceFlag = 'Counted off the site plan, not stated in writing — confirm the count.';
  } else if (guess('surfaceParkingPerUnit') != null && unitCount > 0) {
    // No drawings at all: units × a typical surface-stall rate for the type.
    const perUnit = guess('surfaceParkingPerUnit');
    surface = Math.ceil(unitCount * perUnit); surfaceSource = 'derived';
    surfaceHow = perUnit > 0
      ? `${fmt(unitCount)} units × ${perUnit} surface stalls per unit — a typical figure for this building type.`
      : 'This building type parks in its own garage, so no surface lot is assumed.';
    surfaceFlag = GUESS_FLAG;
  } else if (structuredParking && provided != null) {
    surfaceHow = `Only a total of ${fmt(provided)} provided stalls was stated, and this building type parks mostly in a garage — how many are surface stalls?`;
  }
  // The count is also a cross-check on an estimate: a big gap means the
  // estimate's inputs (rate, garage count) deserve a second look.
  if (surfaceSource === 'derived' && surfaceCounted != null
      && Math.abs(surfaceCounted - surface) / Math.max(surfaceCounted, surface) > 0.2) {
    surfaceFlag += ` The site plan shows about ${fmt(surfaceCounted)} striped stalls.`;
  }
  add('surfaceParking', '# Surface Parking Stalls', 'count', surface, surfaceSource, surfaceHow, surfaceFlag);

  // Garages and carports (Mike, 2026-09-13): garages only on single-family,
  // townhouse, stacked-flat and garden jobs; carports on those plus wraps. Any
  // other type prices neither, even when the site plan shows some. Ladder:
  // written on the site plan → counted off the site plan (carports only,
  // flagged — Mike 2026-09-16: "If something says covered parking or carport
  // it should pull that from a matrix. If not, can you not figure it out
  // from a site drawing?") → typed by the visitor → townhomes 1 garage per
  // home (no-drawings only). A typed 0 is a real "none".
  const coverType = typeKey || site?.buildingType || null;
  const coveredRow = (key, label, noun, allowed, siteVal, countedVal, typedRaw, statedHow) => {
    const fromSite = stated(siteVal);
    const counted  = fromSite == null ? stated(countedVal) : null;
    if (coverType && !allowed.includes(coverType)) {
      const shown = fromSite ?? counted;
      add(key, label, 'count', null, 'drawing',
        `This building type gets no ${noun} lights.`,
        shown ? `The site plan shows ${fmt(shown)} ${noun} — not priced for this building type.` : null);
      return;
    }
    const typed = fromSite == null && counted == null ? statedCount(typedRaw) : null;
    const perUnit = key === 'garages' ? guess('garagesPerUnit') : null;
    if (fromSite != null) {
      add(key, label, 'count', fromSite, 'drawing', statedHow);
    } else if (counted != null) {
      add(key, label, 'count', counted, 'drawing',
        `Counted off the site plan — ${noun} bays under the canopy symbols, or the printed canopy areas ÷ 189 SF a stall.`,
        `Counted off the site plan, not stated in writing — confirm the ${noun} stall count.`);
    } else if (typed != null) {
      add(key, label, 'count', typed, 'questionnaire', 'Entered by the submitter — not found on the site plan.');
    } else if (perUnit > 0 && unitCount > 0) {
      add(key, label, 'count', Math.ceil(unitCount * perUnit), 'derived',
        `${fmt(unitCount)} homes × ${perUnit} garage per home — typical for this building type.`, GUESS_FLAG);
    } else {
      add(key, label, 'count', null, 'drawing', 'Not stated on the site plan.');
    }
  };
  coveredRow('carports', '# Carports', 'carport', CARPORT_TYPE_KEYS, site?.carports, site?.carportsCounted,
    ans.figureCarports, 'Stated on the site plan (a carport / covered-parking line in the parking table).');
  coveredRow('garages', '# Detached/Attached Garages', 'garage', GARAGE_TYPE_KEYS, site?.garages, null, ans.figureGarages,
    'Stated on the site plan. Drawings rarely split attached from detached — confirm the mix.');

  // ── SITE ───────────────────────────────────────────────────────────────────
  const lot = site ? lotSquareFeet(site) : null;
  add('lotSf', 'Lot Size Gross SF', 'sf', lot ? lot.sf : null, 'drawing',
    !lot ? 'Not stated on the site plan.'
      : lot.from === 'lotAcres'
        ? `Converted from ${lot.acres} acres × ${ACRE_SF.toLocaleString('en-US')} SF.`
        : 'Stated in SF on the site plan.',
    lot?.from === 'lotAcres' ? 'Hand-lettered acreage is the most misread figure on a site plan — confirm it.' : null);

  // Footprint: stated wins; otherwise derived from the stated lot-coverage
  // percentage × the lot size. The model reports the written percentage and
  // this code does the arithmetic — never the other way round. Site plans
  // print coverage either way ("28%" or "0.28"), so >1 means percent.
  const footprintStated = stated(site?.buildingFootprintSf);
  const coverage = stated(site?.lotCoveragePct);
  // Mike 10-2 ("scale the page, measure 1 floor"): the reader measures the
  // residential outlines off the scaled site plan. Ranks after the written
  // figures and ahead of the gross ÷ stories guess.
  const footprintMeasured = stated(site?.buildingFootprintSfMeasured);
  const coverageUsable = coverage != null && coverage > 0 && lot?.sf && (coverage > 1 ? coverage / 100 : coverage) <= 1;
  if (footprintStated != null) {
    add('buildingFootprintSf', 'Building Footprint SF', 'sf', footprintStated, 'drawing',
      'Stated on the drawings.');
  } else if (footprintMeasured != null && !coverageUsable) {
    const basis = { scale: 'the drawing scale', dimension: 'a printed dimension', stall: '9 ft parking stalls', door: '3 ft doors' }[site?.scaleBasis] || 'the sheet';
    add('buildingFootprintSf', 'Building Footprint SF', 'sf', footprintMeasured, 'derived',
      `Measured off the site plan using ${basis}: ground floor of every residential building, added together = ${fmt(footprintMeasured)} SF.`,
      `MEASURED off the site plan (scale from ${basis}), not written on the drawings. Confirm it.`);
  } else if (coverage != null && coverage > 0 && lot?.sf) {
    const fraction = coverage > 1 ? coverage / 100 : coverage;
    if (fraction <= 1) {
      const derived = Math.round(lot.sf * fraction);
      add('buildingFootprintSf', 'Building Footprint SF', 'sf', derived, 'derived',
        `Lot coverage ${coverage > 1 ? `${coverage}%` : `${Math.round(fraction * 100)}%`} × lot ${fmt(lot.sf)} SF = ${fmt(derived)} SF.`,
        'Derived from the stated lot-coverage percentage, not read directly — confirm the coverage figure includes only buildings (some sites lump in paving).');
    } else {
      add('buildingFootprintSf', 'Building Footprint SF', 'sf', null, null,
        'Could not be computed.',
        `The stated lot coverage reads as ${fmt(coverage)}% — over 100%, so it was misread.`);
    }
  } else {
    add('buildingFootprintSf', 'Building Footprint SF', 'sf', null, null,
      'Not stated — footprint is rarely printed; a stated lot-coverage % plus the lot size would let it be derived.');
  }

  // ── GROSS SF, DERIVED (last resorts) ───────────────────────────────────────
  // Patched in at the end because the ingredients — footprint and stories —
  // are computed after the SF section. Mike's validated backup ranks first:
  // on the Trailhead reconciliation (2026-08-18), footprint × stories landed
  // within 0.8% of the true gross. The unit-SF blow-up is a rougher estimate
  // and its flag says so. Back of house stays uncomputed either way — a
  // remainder off an estimated gross would be an estimate of an estimate.
  const grossRow = out.find(r => r.key === 'grossSf');
  if (grossRow && grossRow.value == null) {
    const fp = out.find(r => r.key === 'buildingFootprintSf');
    if (fp?.value != null && stories != null && stories >= 1) {
      const est = Math.round(fp.value * stories);
      grossRow.value = est;
      grossRow.source = 'derived';
      grossRow.how = `Footprint ${fmt(fp.value)} SF × ${fmt(stories)} stories = ${fmt(est)} SF — no stated total was found, so this is estimated.`;
      grossRow.flag = 'ESTIMATED from footprint × stories, not read off the drawings. Upper floors that step back, or a footprint that includes garages, will move this — enter the real gross SF if you have it.';
    } else if (unitSf && !unitSf.partial && unitSf.sum > 0) {
      const est = Math.round(unitSf.sum * unitsToGross);
      grossRow.value = est;
      grossRow.source = 'derived';
      grossRow.how = `Residential unit SF ${fmt(unitSf.sum)} × ${unitsToGross} = ${fmt(est)} SF — no stated total and no footprint, so the unit areas are scaled up to cover corridors, walls, and back of house.`;
      grossRow.flag = `ROUGH ESTIMATE from unit areas alone (×${unitsToGross}, the master pricing sheet's units→gross factor). Enter the real gross SF if you have it.`;
    } else if (!unitSf && avgUnitTyped != null && unitCount > 0) {
      const unitsTotal = Math.round(unitCount * avgUnitTyped);
      const est = Math.round(unitsTotal * unitsToGross);
      grossRow.value = est;
      grossRow.source = 'derived';
      grossRow.how = `${fmt(unitCount)} units × ${fmt(avgUnitTyped)} SF average = ${fmt(unitsTotal)} SF of units, × ${unitsToGross} for corridors, walls and back of house = ${fmt(est)} SF.`;
      grossRow.flag = `ESTIMATED from the average unit size (×${unitsToGross}). Enter the real building SF if you have it.`;
    }
  }

  // ── FOOTPRINT, ESTIMATED (Mike 10-2) ──────────────────────────────────────
  // No footprint and no lot coverage, but a real gross SF and a story count:
  // footprint ≈ gross ÷ stories (all buildings together). Only from a gross
  // that was read or typed, never one we derived from the footprint itself.
  const fpRowEst = out.find(r => r.key === 'buildingFootprintSf');
  if (fpRowEst && fpRowEst.value == null && grossRow?.value != null && grossRow.source !== 'derived'
      && stories != null && stories >= 1) {
    const est = Math.round(grossRow.value / Math.round(stories));
    fpRowEst.value  = est;
    fpRowEst.source = 'derived';
    fpRowEst.how    = `Gross ${fmt(grossRow.value)} SF ÷ ${fmt(Math.round(stories))} stories = ${fmt(est)} SF, all buildings together. Not stated on the drawings, so this is estimated.`;
    // Keep any earlier alert (e.g. a misread coverage over 100%) in front.
    fpRowEst.flag   = `${fpRowEst.flag ? fpRowEst.flag + ' ' : ''}ESTIMATED from gross ÷ stories. Buildings that step back on upper floors make the real footprint larger; enter it if you have it.`;
  }

  // ── NO-DRAWINGS AREA GUESSES ───────────────────────────────────────────────
  // Every blank on a typed-in budget would otherwise price at $0. Mike
  // (2026-09-12): "we have to get all these percentages within 10% in the
  // conceptual budget" — each figure below is calibrated against ten real ILC
  // budgets (see noDrawingGuesses.js). A figure the visitor typed always wins.
  if (manual) {
    const fill = (row, value, how, flag = GUESS_FLAG, source = 'derived') => {
      row.value = value; row.source = source; row.how = how; row.flag = flag;
    };
    const perUnitRow = (key, table, sayWhat, sayNone) => {
      const row = out.find(r => r.key === key);
      const per = guess(table);
      if (row && row.value == null && per != null && unitCount > 0) {
        fill(row, Math.round(unitCount * per),
          per > 0 ? `${fmt(unitCount)} units × ${per} ${sayWhat} per unit — typical for this building type.` : sayNone);
      }
      return row;
    };

    const corrRow = out.find(r => r.key === 'corridorSf');
    const pct = guess('corridorPctOfGross');
    if (corrRow && corrRow.value == null && pct != null && grossRow?.value) {
      fill(corrRow, Math.round(grossRow.value * pct), pct > 0
        ? `${Math.round(pct * 100)}% of the ${fmt(grossRow.value)} SF building — a typical corridor share for this building type.`
        : 'This building type has open breezeways or private entries, so no interior corridors are assumed.');
    }

    // Clubhouse (Mike, 2026-09-12: "Can we somehow read if there is a
    // clubhouse or not?"). The visitor's yes/no answer beats the type's usual:
    // "no" is $0; "yes" on a townhouse community is one clubhouse building,
    // on an apartment type the per-unit share.
    const amenRow = out.find(r => r.key === 'interiorAmenitySf');
    const club = ans[CLUBHOUSE_KEY];
    if (amenRow && amenRow.value == null && club === 'no') {
      fill(amenRow, 0, 'No clubhouse, leasing or fitness space — per the questionnaire.', null, 'questionnaire');
    } else if (amenRow && amenRow.value == null && club === 'yes'
        && NO_DRAWING_GUESSES.clubhouseSfWhenYes[typeKey] != null) {
      fill(amenRow, NO_DRAWING_GUESSES.clubhouseSfWhenYes[typeKey],
        `One ${fmt(NO_DRAWING_GUESSES.clubhouseSfWhenYes[typeKey])} SF clubhouse — the questionnaire says there is one but gave no size.`);
    } else {
      perUnitRow('interiorAmenitySf', 'interiorAmenitySfPerUnit', 'SF of clubhouse / leasing / fitness',
        'No shared clubhouse is assumed for this building type. Enter the interior amenity SF if there is one.');
    }

    perUnitRow('garageSf', 'garageSfPerUnit', 'SF of structured parking garage',
      'This building type parks on the surface or in private garages, so no parking structure is assumed.');
    // Pool answer (Mike 10-14): see poolDeckMinSf / noPoolExteriorShare.
    const extRow = out.find(r => r.key === 'exteriorAmenitySf');
    const pool = ans[POOL_KEY];
    const extPer = guess('exteriorAmenitySfPerUnit');
    if (extRow && extRow.value == null && extPer != null && unitCount > 0 && (pool === 'yes' || pool === 'no')) {
      const usual = Math.round(unitCount * extPer);
      if (pool === 'yes') {
        const min = NO_DRAWING_GUESSES.poolDeckMinSf;
        fill(extRow, Math.max(usual, min), usual >= min
          ? `${fmt(unitCount)} units × ${extPer} SF of pool deck / courtyards / outdoor amenity per unit, typical for this building type with a pool.`
          : `There is a pool: ${fmt(min)} SF of pool deck and outdoor amenity, the least we assume with a pool.`);
      } else {
        const share = NO_DRAWING_GUESSES.noPoolExteriorShare[typeKey] ?? 1;
        fill(extRow, Math.round(usual * share), share < 1
          ? `No pool: half the usual ${fmt(usual)} SF (${fmt(unitCount)} units × ${extPer} SF), since most outdoor space on this building type is pool deck.`
          : usual > 0
            ? `${fmt(unitCount)} units × ${extPer} SF of courtyards / outdoor amenity per unit, typical for this building type.`
            : 'No pool and no lit outdoor amenity area is assumed for this building type.');
      }
    } else {
      perUnitRow('exteriorAmenitySf', 'exteriorAmenitySfPerUnit', 'SF of pool deck / courtyards / outdoor amenity',
        'No lit outdoor amenity area is assumed for this building type.');
    }
    perUnitRow('vanities', 'vanitiesPerUnit', 'bathroom vanities', 'No vanities assumed.');

    // Drive-lane area lights moved below the no-drawings block (2026-09-13) —
    // they now run with drawings too.

    // Back of house (Mike, 2026-09-11: "how much BOH based on gross SF"): the
    // type's usual share of the building, never more than the master sheet's
    // cap and never more than what's left after units, corridors and amenity.
    // The building total here is the visitor's own figure, or their units ×
    // unit size — a drawing-read budget still never takes a remainder off an
    // estimated gross.
    const bohRow   = out.find(r => r.key === 'bohSf');
    const unitsRow = out.find(r => r.key === 'unitsSf');
    if (bohRow && bohRow.value == null && grossRow?.value && unitsRow?.value != null) {
      const g = grossRow.value;
      const corr = corrRow?.value ?? 0;
      const amen = amenRow?.value ?? 0;
      const remainder = Math.max(0, Math.round(g - unitsRow.value - corr - amen));
      const share = Math.min(guess('bohPctOfGross') ?? bohMaxPct, bohMaxPct);
      const cap = Math.round(g * share);
      const pctText = `${Math.round(share * 1000) / 10}%`;
      fill(bohRow, Math.min(remainder, cap), remainder > cap
        ? `${pctText} of the ${fmt(g)} SF building — typical back of house for this building type (mechanical, storage, trash, bike rooms).`
        : `Building ${fmt(g)} SF minus units ${fmt(unitsRow.value)}${corr ? `, corridors ${fmt(corr)}` : ''}${amen ? `, interior amenity ${fmt(amen)}` : ''}.`);
    }
  }

  // ── STAIR LANDINGS, ESTIMATED (code-minimum fallback) ─────────────────────
  // Mike's ladder (2026-09-05): drawings first, then the building code, then
  // a human. When the drawings gave no stair count (or no story count), the
  // estimator fills in from code minimums — ≥2 exit stairs per building, more
  // on a long floor plate, stories from gross ÷ footprint — and the rows it
  // leaned on are patched to show the assumption, so a reviewer sees "2
  // stairs (estimated)" rather than a landing count that came from nowhere.
  const landingsRow = out.find(r => r.key === 'stairLandings');
  if (landingsRow && landingsRow.value == null && landingsTyped == null) {
    const fpRow = out.find(r => r.key === 'buildingFootprintSf');
    // The building type steers the per-stair plate size: breezeway walk-ups
    // (garden/gurban/stacked flats) pack far more stairs onto a plate than a
    // corridor building, and townhouses have no shared stairs at all.
    const { buildingTypeKey } = answersToEngine(answers);
    const est = estimateStairLandings({
      stories, stairs,
      buildings,
      footprintSf: fpRow?.value ?? null,
      grossSf:     grossRow?.value ?? null,
      units:       unitCount,
      buildingTypeKey,
    }, pricing);
    if (est) {
      landingsRow.value  = est.landings;
      landingsRow.source = 'derived';
      landingsRow.how    = est.how;
      landingsRow.flag   = est.flag;
      if (est.stairsEstimated) {
        const stairsRow = out.find(r => r.key === 'egressStairwells');
        if (stairsRow && stairsRow.value == null) {
          stairsRow.value  = est.stairs;
          stairsRow.source = 'derived';
          stairsRow.how    = est.privateStairs
            ? 'Townhouse-style — stairs are private, inside each unit, so no shared egress stairs.'
            : est.stories <= 1
            ? 'Single-story — no interior exit stairs assumed.'
            : est.unitsBased
            ? `Open breezeway stairs counted off the units: ${fmt(unitCount)} units ÷ ${fmt(est.unitsPerStair)} per stair ≈ ${fmt(est.stairs)} stairs.`
            : `Building-code estimate: ${fmt(est.buildings)} building${est.buildings === 1 ? '' : 's'} × ${fmt(est.stairsPerBuilding)} exit stairs — nothing on the drawings stated it.`;
          stairsRow.flag   = 'ESTIMATED from code minimums, not read off the drawings — confirm on the plans.';
        }
      }
      if (est.storiesEstimated) {
        const storiesRow = out.find(r => r.key === 'stories');
        if (storiesRow && storiesRow.value == null) {
          storiesRow.value  = est.stories;
          storiesRow.source = 'derived';
          storiesRow.how    = `Gross ${fmt(grossRow.value)} SF ÷ footprint ${fmt(fpRow.value)} SF ≈ ${fmt(est.stories)} — nothing on the drawings stated it.`;
          storiesRow.flag   = 'ESTIMATED from gross ÷ footprint, not read off the drawings — confirm on the elevations or code summary.';
        }
      }
    }
  }

  // ── DRIVE-LANE AREA LIGHTS (townhouse / single-family) ────────────────────
  // These communities light their private drive with the same area light +
  // pole a parking lot uses. Mike 2026-09-13: "correlate it to the width of 9
  // spaces ... and measure the drive" — one light per 81 ft (9 stalls × 9 ft).
  // Ladder: a length the visitor typed → a length measured off a scaled site
  // plan → ½ light per home, less the poles the parking lot already carries.
  // Runs with or without drawings; a drawing-read townhouse budget used to
  // get no drive-lane lights at all.
  const laneType = typeKey || site?.buildingType || null;
  const lanePer = laneType ? NO_DRAWING_GUESSES.driveLaneLightsPerUnit[laneType] : null;
  if (lanePer > 0) {
    const ftPer = Number(pricing?.exterior?.surfaceParking?.driveLaneFtPerLight)
      || PRICING.exterior.surfaceParking.driveLaneFtPerLight || 81;
    const typedRaw = statedAnswer(ans.figureDriveLengthFt);
    const typedFt = typedRaw > 0 ? typedRaw : null;
    const measuredFt = stated(site?.driveLengthFtMeasured);
    const ft = typedFt ?? (measuredFt > 0 ? measuredFt : null);
    if (ft != null) {
      const perHome = unitCount > 0 ? ft / unitCount : null;
      const odd = perHome != null && (perHome < 10 || perHome > 150)
        ? `${fmt(Math.round(perHome))} ft of drive per home is unusual — check the length.` : null;
      if (typedFt != null) {
        add('driveLengthFt', 'Private drive length', 'ft', ft, 'questionnaire',
          'Entered by the submitter.', odd);
      } else {
        add('driveLengthFt', 'Private drive length', 'ft', ft, 'drawing',
          'Measured along the centerline of every private drive aisle on the scaled site plan, parking along it or not.',
          ['Measured off the site plan, not written on it — confirm.', odd].filter(Boolean).join(' '));
      }
      add('driveLaneLights', '# Drive-Lane Area Lights', 'count', Math.ceil(ft / ftPer), 'derived',
        `${fmt(ft)} ft of private drive aisles (parking along them or not) ÷ ${fmt(ftPer)} ft per light. These poles light the stalls along the drives too, so they replace the stall count rather than add to it.`, null);
    } else if (unitCount > 0) {
      const perFixture = Number(pricing?.exterior?.surfaceParking?.stallsPerFixture)
        || PRICING.exterior.surfaceParking.stallsPerFixture || 9;
      const stalls = Number(out.find(r => r.key === 'surfaceParking')?.value) || 0;
      const lotPoles = Math.ceil(stalls / perFixture);
      // Mike 2026-10-02: with no drive length, the stall count stands in for it
      // at the same one pole per 81 ft (9 stalls × 9 ft). Those lot poles are
      // the drive lights, so nothing is added on top. No stalls either → ½ per home.
      const lane = lotPoles > 0 ? 0 : Math.ceil(unitCount * lanePer);
      add('driveLaneLights', '# Drive-Lane Area Lights', 'count', lane, 'derived',
        lotPoles > 0
          ? `No drive length, so the ${fmt(stalls)} stalls stand in for it: ${fmt(stalls)} ÷ ${fmt(perFixture)} = ${fmt(lotPoles)} poles, one per ${fmt(ftPer)} ft. Those are the drive lights; none are added on top.`
          : `${fmt(unitCount)} units × ${lanePer} area lights per unit along the private drive (no drive length and no stalls).`,
        manual ? GUESS_FLAG : 'ESTIMATED — the drawings gave no private drive length. Enter it if you know it.');
    }
  }

  // ── WALKWAY LENGTH (townhouse / single-family) ───────────────────────────
  // Mike 2026-10-02: "It should read it or estimate but not ask. Just record
  // and estimate in the background." The site read measures the shared walks;
  // the engine puts one bollard / pedestrian pole every 40 ft. Nothing read →
  // no row, and the engine uses its per-home estimate. Never a question.
  if (laneType === 'townHouses' || laneType === 'singleFamily') {
    const walkFt = stated(site?.walkwayLengthFtMeasured);
    if (walkFt > 0) {
      add('walkwayLengthFt', 'Walkway length', 'ft', walkFt, 'drawing',
        'Measured along every shared walking path and sidewalk inside the property line on the scaled site plan.',
        'Measured off the site plan, not written on it. Confirm.');
    }
  }

  // ── SITE FEATURES (Mike 2026-09-16) ───────────────────────────────────────
  // Dog parks, courtyards, playgrounds, tennis / pickleball courts, turf play
  // areas — found by their printed words on the site or landscape plan, each
  // priced as its own fixture package on its own budget line. One row per
  // kind: a count for the per-feature kinds, feet (longest dimension) for the
  // linear ones. Ladder: drawing → typed → absent. NOTHING is guessed; a kind
  // the drawings don't name and nobody typed is simply not on the job.
  // Tennis + pickleball courts and dog parks + playgrounds are one question
  // and one row each (Mike 10-14); normalizeSiteFeatures() folds what the
  // drawings name, and an old draft's dog park or pickleball box adds in.
  const found = new Map(normalizeSiteFeatures(site?.siteFeatures).map(f => [f.type, f]));
  const figureKeyOf = t => { const k = SITE_FEATURE_ROW_KEYS[t]; return `figure${k[0].toUpperCase()}${k.slice(1)}`; };
  const typedFolded = type => {
    const vals = [type, ...Object.keys(SITE_FEATURE_FOLD).filter(k => SITE_FEATURE_FOLD[k] === type)]
      .map(t => statedCount(ans[figureKeyOf(t)])).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  for (const type of SITE_FEATURE_TYPES) {
    if (SITE_FEATURE_FOLD[type]) continue;
    const rowKey = SITE_FEATURE_ROW_KEYS[type];
    const linear = LINEAR_SITE_FEATURES.has(type);
    const name = SITE_FEATURE_LABELS[type];
    const label = linear ? `${name} length` : `# ${name}s`;
    const unit = linear ? 'ft' : 'count';
    const f = found.get(type);
    // Courtyards are asked as a COUNT (Mike 10-1: nobody knows the length);
    // each counts as COURTYARD_FT_EACH feet. The old feet answer still reads.
    const typedCourtyards = type === 'courtyard' ? statedCount(ans.figureCourtyards) : null;
    const typed = typedCourtyards != null ? typedCourtyards * COURTYARD_FT_EACH
      : typedFolded(type);
    const drawn = f ? (linear ? f.lengthFt : f.count) : null;
    const where = f?.sheet ? ` (sheet ${f.sheet})` : '';
    // Courtyard at the standard 60 ft each, not measured (0115): the row says
    // so and the hand-off tags the SiteFeature. A correction is a real figure.
    const markAssumed = () => { const r = out[out.length - 1]; if (r?.key === rowKey && !r.corrected) r.assumed = true; };
    if (drawn != null && drawn > 0) {
      add(rowKey, label, unit, drawn, 'drawing',
        linear
          ? (f.lengthAssumed
              ? `${f.count} ${name.toLowerCase()}${f.count === 1 ? '' : 's'} labelled on the drawing${where}; no length is printed, so each is counted at a standard length.`
              : `${f.count} ${name.toLowerCase()}${f.count === 1 ? '' : 's'} labelled on the drawing${where}; longest dimension measured off the sheet.`)
          : `Labelled on the drawing${where}${f.label ? ` as "${f.label}"` : ''}.`,
        linear ? (f.lengthAssumed ? 'Standard length, not measured. Confirm the number of courtyards.' : 'Length measured off the drawing, not printed on it. Confirm.') : null);
      if (linear && f.lengthAssumed) markAssumed();
    } else if (f && linear) {
      // Named but not measurable: the row exists so the grid asks for a length.
      add(rowKey, label, unit, typed, typed != null ? 'questionnaire' : null,
        typed != null ? 'Entered by the submitter.' : `A ${name.toLowerCase()} is labelled on the drawing${where} but no length could be measured.`,
        typed != null ? null : `${name} found on the drawing but its length is unknown. Enter the longest dimension in feet or it prices at $0.`);
      if (typedCourtyards != null) markAssumed();
    } else if (typed != null) {
      add(rowKey, label, unit, typed, 'questionnaire',
        typedCourtyards != null
          ? `${typedCourtyards} courtyard${typedCourtyards === 1 ? '' : 's'} entered by the submitter, counted at ${COURTYARD_FT_EACH} ft each (not measured).`
          : 'Entered by the submitter.', null);
      if (typedCourtyards != null) markAssumed();
    }
    // Absent on the drawings and not typed: no row. Nothing is guessed, and a
    // blank row here would read as "we could not find it" when the honest
    // answer is "the project does not appear to have one".
  }

  if (manual) for (const r of out) noDrawingsWording(r);
  return out;
}

// No drawings were uploaded, so "not found on the drawings" is noise (Mike
// 10-14: the no-drawings form should not talk about drawings or site plans).
const NOT_STATED_MANUAL = 'Not entered. Type it in.';
const DRAWING_WORDS = /\b(drawings?|site plan|sheets?)\b/i;
function noDrawingsWording(r) {
  if (r.corrected || typeof r.how !== 'string' || !DRAWING_WORDS.test(r.how)) {
    if (r.how === NOT_STATED_MANUAL) r.how = 'Not entered.';
    return;
  }
  if (r.source === 'questionnaire') { r.how = 'Entered on the questionnaire.'; return; }
  if (r.value == null) { r.how = 'Not entered.'; return; }
  // Drop a clause (after ';' or a dash) or a whole sentence that names a drawing.
  const how = r.how
    .replace(/(;| \u2014)[^.;\u2014]*\b(drawings?|site plan|sheets?)\b[^.;\u2014]*/gi, '')
    .replace(/(^|\.\s+)[^.]*\b(drawings?|site plan|sheets?)\b[^.]*\./gi, '$1')
    .trim();
  r.how = how || 'Estimated.';
}

/** Plain words for the scale a measured figure was taken with. */
const SCALE_BASIS_WORDS = {
  scale:     'the printed scale',
  dimension: 'a printed dimension',
  stall:     'a standard 9 ft parking stall',
  door:      'a 3 ft door — the weakest rung, check it',
};

/**
 * The takeoff's contribution to the verify-before-trusting list: one sentence
 * per flagged row, plus one roll-up for everything that could not be found.
 */
export function quantityFlags(quantities) {
  const flags = [];
  const qs = Array.isArray(quantities) ? quantities : [];
  for (const q of qs) {
    if (q?.flag) flags.push(`${q.label}: ${q.flag}`);
  }
  const missing = qs.filter(q => q && q.value == null && !q.flag).map(q => q.label);
  if (missing.length) {
    flags.push(`Not found in the drawings (needs a human): ${missing.join(', ')}.`);
  }
  return flags;
}
