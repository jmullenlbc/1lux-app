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
import { lotSquareFeet, ACRE_SF } from '../siteFields.js';
import { PRICING } from '../pricing.js';
import { estimateStairLandings } from '../stairLandings.js';
import { answersToEngine } from './questionnaire.js';

/** A stated, usable number — or null. Number(null) is 0, hence the dance. */
function stated(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
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

/**
 * Units-sum → building-gross blow-up, the LAST-RESORT gross estimate.
 * The number lives in the master pricing sheet (PRICING.estimation), not
 * here — Mike set it to 1.25 (2026-09-04). Only used when no total is
 * stated, no per-building totals exist, the visitor typed nothing, and no
 * footprint × stories is available.
 */
const UNITS_TO_GROSS = PRICING.estimation.unitsToGross;

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
    const v = Number(raw);
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
 * @returns {Array} quantity rows, in the order the review panel shows them
 */
export function computeQuantities(drawings, answers, pricing = null) {
  const unitsToGross = Number(pricing?.estimation?.unitsToGross) > 0
    ? Number(pricing.estimation.unitsToGross)
    : UNITS_TO_GROSS;
  const rows = safeRows(drawings);
  const site = (drawings?.siteData && typeof drawings.siteData === 'object') ? drawings.siteData : null;
  const totals = (drawings?.projectTotals && typeof drawings.projectTotals === 'object') ? drawings.projectTotals : null;
  const ans = answersToMap(answers);
  const out = [];
  const add = (key, label, unit, value, source, how, flag = null) =>
    out.push({ key, label, unit, value, source: value == null ? null : source, how, flag });

  // ── UNITS ──────────────────────────────────────────────────────────────────
  const matrixUnits = rows.reduce((s, r) => s + qtyOf(r), 0);
  const statedUnits = stated(totals?.statedTotalUnits);
  const siteUnits   = stated(site?.totalUnits);
  const mix         = bedroomsFromMix(site?.bedMix);

  let unitCount = null, unitHow = 'Not found on any drawing.', unitSource = null, unitFlag = null;
  if (matrixUnits > 0) {
    unitCount = matrixUnits; unitSource = 'drawing';
    unitHow = `Sum of the unit matrix rows (${rows.filter(qtyOf).length} unit types).`;
    if (statedUnits != null && statedUnits !== matrixUnits) {
      unitFlag = `The document's own stated total is ${fmt(statedUnits)} but its rows sum to ${fmt(matrixUnits)} — one of them was misread.`;
    } else if (siteUnits != null && siteUnits > 0 && Math.abs(siteUnits - matrixUnits) / Math.max(siteUnits, matrixUnits) > 0.1) {
      unitFlag = `The site plan says ${fmt(siteUnits)} units — more than 10% off the matrix. Check which is right.`;
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
  add('totalUnits', '# Units', 'count', unitCount, unitSource, unitHow, unitFlag);

  // ── BEDROOMS / BATHROOMS / VANITIES ────────────────────────────────────────
  const beds = sumPerUnit(rows, 'bedrooms');
  if (beds) {
    add('bedrooms', '# Bedrooms', 'count', beds.sum, 'drawing',
      'Bedrooms per unit type × unit quantities, from the unit matrix.',
      partialFlag(beds, 'a bedroom count'));
  } else if (mix) {
    add('bedrooms', '# Bedrooms', 'count', mix.bedrooms, 'drawing',
      'From the site plan bed mix (1× one-beds + 2× two-beds + 3× three-beds).',
      null);
  } else {
    add('bedrooms', '# Bedrooms', 'count', null, null, 'No bedroom counts found in any drawing.');
  }

  const baths = sumPerUnit(rows, 'bathrooms');
  add('bathrooms', '# Bathrooms', 'count', baths ? baths.sum : null,
    'drawing',
    baths ? 'Bathrooms per unit type × unit quantities, from the unit matrix.' : 'No bathroom counts found — unit matrices often omit them.',
    partialFlag(baths, 'a bathroom count'));

  add('vanities', '# Vanities', 'count', baths ? baths.sum : null,
    'derived',
    baths ? 'One vanity per bathroom.' : 'Follows the bathroom count, which was not found.',
    partialFlag(baths, 'a bathroom count'));

  // ── BALCONIES ──────────────────────────────────────────────────────────────
  const balc = sumPerUnit(rows, 'balconies');
  const noBalconies = ans.balconyLighting === 'No balconies';
  if (balc && balc.sum > 0 && noBalconies) {
    add('balconies', '# Balconies', 'count', balc.sum, 'drawing',
      'Balconies per unit type × unit quantities, from the unit matrix.',
      `The questionnaire says there are no balconies, but the unit matrix lists ${fmt(balc.sum)}. Check which is right.`);
  } else if (noBalconies) {
    add('balconies', '# Balconies', 'count', 0, 'questionnaire', 'The questionnaire says the project has no balconies.');
  } else if (balc) {
    add('balconies', '# Balconies', 'count', balc.sum, 'drawing',
      'Balconies per unit type × unit quantities, from the unit matrix.',
      partialFlag(balc, 'a balcony count'));
  } else if (statedAnswer(ans.figureBalconies) != null) {
    // Without a count, the balcony-lighting answer prices to $0 no matter what
    // the visitor picks (Mike, 2026-09-04: "Why does none ... not change the
    // budget?") — so the wizard now asks for the count when drawings lack it.
    add('balconies', '# Balconies', 'count', statedAnswer(ans.figureBalconies), 'questionnaire',
      'Entered on the questionnaire — no balcony counts were found on the drawings.');
  } else {
    add('balconies', '# Balconies', 'count', null, null, 'No balcony counts found in any drawing, and the questionnaire did not rule them out.');
  }

  // ── CEILING FANS ───────────────────────────────────────────────────────────
  const fansAnswer = ans.ceilingFans || 'None';
  const bedroomTotal = beds ? beds.sum : (mix ? mix.bedrooms : null);
  // Units with at least N bedrooms — "Master + Secondary" means one fan in
  // every unit with a bedroom plus a second in every unit with two or more.
  const unitsWithBedAtLeast = (min) => beds
    ? rows.reduce((s, r) => s + (Number(r.bedrooms) >= min ? qtyOf(r) : 0), 0)
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
  const unitSf = sumPerUnit(rows, 'unitSf');
  add('unitsSf', 'Residential Units SF', 'sf', unitSf ? unitSf.sum : null, 'derived',
    unitSf ? 'Unit SF per type × unit quantities, from the unit matrix.' : 'The unit matrix did not list square footage per type.',
    partialFlag(unitSf, 'a unit SF'));

  const garageSf = stated(totals?.garageSf);
  add('garageSf', 'Garage SF', 'sf', garageSf, 'drawing',
    garageSf != null ? 'Stated on the drawings.' : 'Not stated on any drawing.');

  const corridorSf = stated(totals?.corridorSf);
  add('corridorSf', 'Corridors & Stairwells SF', 'sf', corridorSf, 'drawing',
    corridorSf != null ? 'Stated on the drawings.' : 'Not stated on any drawing.');

  const interiorAmenitySf = stated(site?.clubhouseSf);
  add('interiorAmenitySf', 'Interior Amenity SF', 'sf', interiorAmenitySf, 'drawing',
    interiorAmenitySf != null ? 'From the clubhouse figure on the site plan.' : 'Not stated on any drawing.');

  const exteriorAmenitySf = stated(site?.amenitySf);
  add('exteriorAmenitySf', 'Exterior Amenity SF', 'sf', exteriorAmenitySf, 'drawing',
    exteriorAmenitySf != null
      ? 'From the amenity-area figure on the site plan — usually the outdoor programme (pool deck, courtyards).'
      : 'Not stated on any drawing.');

  // Gross SF ladder: a drawing-stated (or per-building-summed) total wins,
  // then a figure the visitor typed. Two derived estimates (footprint ×
  // stories, then unit-SF blow-up) are patched in at the END of this function
  // because their ingredients are computed below this section.
  const grossStated = stated(totals?.grossInteriorSf) ?? stated(site?.grossSf);
  const grossFigure = grossStated == null ? statedAnswer(ans.figureGrossSf) : null;
  const grossSf = grossStated ?? grossFigure;
  add('grossSf', 'Total Building Gross SF', 'sf', grossSf,
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

  // Back of house is the remainder — what's left of the stated gross after
  // the categories the drawings itemized. Only computable when the two big
  // numbers (gross and total unit SF) both exist, and always flagged as
  // arithmetic rather than a reading.
  if (grossSf != null && unitSf && !unitSf.partial) {
    const itemized = unitSf.sum + (corridorSf ?? 0) + (interiorAmenitySf ?? 0);
    const remainder = grossSf - itemized;
    const skipped = [corridorSf == null && 'corridors', interiorAmenitySf == null && 'interior amenity'].filter(Boolean);
    if (remainder >= 0) {
      // Mike's cap (2026-09-04): BOH is never more than 5% of gross SF. The
      // remainder also holds corridors/walls when those weren't stated, and
      // uncapped it overprices BOH badly (Fulshear: 63,953 SF ≈ 15.6% of gross).
      const bohMaxPct = Number(pricing?.boh?.maxPctOfGross) > 0
        ? Number(pricing.boh.maxPctOfGross)
        : (PRICING.boh.maxPctOfGross ?? 0.05);
      const bohCap = Math.round(grossSf * bohMaxPct);
      const capped = remainder > bohCap;
      add('bohSf', 'Back of House SF (remainder)', 'sf', capped ? bohCap : Math.round(remainder), 'derived',
        `Gross ${fmt(grossSf)} minus units ${fmt(unitSf.sum)}${corridorSf != null ? `, corridors ${fmt(corridorSf)}` : ''}${interiorAmenitySf != null ? `, interior amenity ${fmt(interiorAmenitySf)}` : ''}${capped ? ` = ${fmt(Math.round(remainder))}, capped at ${Math.round(bohMaxPct * 100)}% of gross` : ''}.`,
        capped
          ? `The raw remainder (${fmt(Math.round(remainder))} SF) exceeded the ${Math.round(bohMaxPct * 100)}%-of-gross BOH cap${skipped.length ? ` — it likely still contains ${skipped.join(' and ')}` : ''}.`
          : (skipped.length ? `No ${skipped.join(' or ')} SF was stated, so this remainder still contains ${skipped.join(' and ')}.` : null));
    } else {
      add('bohSf', 'Back of House SF (remainder)', 'sf', null, null,
        'Could not be computed.',
        `The itemized areas (${fmt(itemized)} SF) sum to MORE than the stated gross (${fmt(grossSf)} SF) — one of them was misread, or the gross figure is net.`);
    }
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
  const stories = storiesStated ?? storiesCounted ?? storiesTyped;
  add('stories', '# Stories', 'count', stories,
    storiesTyped != null ? 'questionnaire' : 'drawing',
    storiesStated != null ? 'Stated on the drawings (code summary or title block).'
      : storiesCounted != null ? 'Counted off the building elevation (floor levels / window rows).'
      : storiesTyped != null ? 'Entered on the questionnaire — not found on the drawings.'
      : 'Not stated on any sheet that was read.',
    storiesStated == null && storiesCounted != null
      ? 'Counted off the elevation, not stated in writing — confirm against the code summary.' : null);

  const stairsStated = stated(site?.egressStairwells);
  const stairsCounted = stated(site?.egressStairwellsCounted);
  const stairsTyped = stairsStated == null && stairsCounted == null ? statedAnswer(ans.figureStairwells) : null;
  const stairs = stairsStated ?? stairsCounted ?? stairsTyped;
  add('egressStairwells', '# Egress Stairwells', 'count', stairs,
    stairsTyped != null ? 'questionnaire' : 'drawing',
    stairsStated != null ? 'Stated on the drawings (exit-stair line in a code summary).'
      : stairsCounted != null ? 'Counted as stair shafts on the floor plan (a switchback pair is one stairwell).'
      : stairsTyped != null ? 'Entered on the questionnaire — not found on the drawings.'
      : 'Not stated on any sheet that was read.',
    stairsStated == null && stairsCounted != null
      ? 'Counted off the floor plan, not stated in writing — confirm the shaft count.' : null);

  // A visitor-typed landings count wins over the 2N−1 derivation — the wizard
  // asks for LANDINGS directly (Mike, 2026-09-04: '"# Egress stairwells"
  // should be "# Egress stairwell landings"'), matching the internal Project
  // Data field, and the ask card offers this as the override on a derived row.
  //
  // Otherwise the shared estimator (src/lib/stairLandings.js) does the
  // 2N−1 arithmetic and adds Mike's 10% contingency. When the drawings never
  // stated the stair count, the building-code fallback is patched in at the
  // END of this function, once the footprint and gross rows it needs exist.
  const landingsTyped = statedAnswer(ans.figureStairLandings);
  if (landingsTyped != null) {
    add('stairLandings', '# Stair Landings', 'count', landingsTyped, 'questionnaire',
      'Entered on the questionnaire — count every landing, including the half-landing between floors.');
  } else if (stories != null && stairs != null && stories >= 1) {
    const est = estimateStairLandings({ stories, stairs }, pricing);
    const typed = storiesTyped != null || stairsTyped != null;
    const counted = !typed && (storiesStated == null || stairsStated == null);
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
      : 'Not stated on any sheet that was read.',
    exitsStated == null && exitsCounted != null
      ? 'Counted off the plan, not stated in writing — confirm against the code summary.' : null);

  // ── PARKING ────────────────────────────────────────────────────────────────
  const surfaceStated = stated(site?.surfaceParking);
  const provided = stated(site?.parkingProvided);
  const surfaceTyped = surfaceStated == null ? statedAnswer(ans.figureSurfaceParking) : null;
  const surface = surfaceStated ?? surfaceTyped;
  add('surfaceParking', '# Surface Parking Stalls', 'count', surface,
    surfaceTyped != null ? 'questionnaire' : 'drawing',
    surfaceStated != null ? 'Stated on the site plan.'
      : surfaceTyped != null ? 'Entered on the questionnaire — not found on the site plan.'
      : provided != null ? `Only a total of ${fmt(provided)} provided stalls was stated, without a surface/structured split.`
      : 'Not stated on the site plan.',
    surface != null && provided != null && surface > provided
      ? `More surface stalls (${fmt(surface)}) than total provided (${fmt(provided)}) — one was misread.` : null);

  add('carports', '# Carports', 'count', stated(site?.carports), 'drawing',
    stated(site?.carports) != null ? 'Stated on the site plan.' : 'Not stated on the site plan.');

  add('garages', '# Garages', 'count', stated(site?.garages), 'drawing',
    stated(site?.garages) != null
      ? 'Stated on the site plan. Drawings rarely split attached from detached — confirm the mix.'
      : 'Not stated on the site plan.');

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
  if (footprintStated != null) {
    add('buildingFootprintSf', 'Building Footprint SF', 'sf', footprintStated, 'drawing',
      'Stated on the drawings.');
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
      buildings:   stated(site?.buildingCount),
      footprintSf: fpRow?.value ?? null,
      grossSf:     grossRow?.value ?? null,
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

  return out;
}

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
