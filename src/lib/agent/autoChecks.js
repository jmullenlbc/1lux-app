/**
 * Deterministic auto-checks — Step 16 of the Governed AI Layer, Slice 4b.
 *
 * The judge in this layer is not a model. It is arithmetic and lookups — things
 * that cannot be talked into anything. `humanErrorRadar.js`, the three-engine
 * reconciliation the app already owns, is exactly that, so it is wired in here
 * rather than reimplemented.
 *
 * ── pass / fail / null, and why null is not pass ─────────────────────────────
 * A check returns one of three things, and the third one is the important one:
 *
 *   true  — the output reconciles. It may still be wrong, but not detectably.
 *   false — the output contradicts something we can compute. Forces review at
 *           EVERY trust tier; no accuracy record earns the right to skip a
 *           deterministic contradiction.
 *   null  — no check exists for this task type, or the check could not run
 *           because the data it reconciles against was not supplied.
 *
 * `null` must never be treated as a pass. A task type with no check is not a
 * task type that passed — it is one we cannot mark, and its autonomy has to come
 * from human verdicts instead. Collapsing null into true is how a check that
 * silently stopped running (a renamed field, a missing takeoff) becomes an
 * unbroken record of success.
 *
 * That is also why `checkFailedToRun` is reported rather than swallowed: a check
 * that cannot run is a fact about our data pipeline, and it should be visible in
 * the queue instead of quietly downgrading to "no opinion" forever.
 *
 * ── Lookups are injected, not imported ───────────────────────────────────────
 * Two checks need to consult Master Pricing and the knowledge base. Those come
 * in through `context` as functions rather than being imported here, so this
 * module stays pure, stays unit-testable without a database, and cannot become a
 * second place that knows how pricing resolution works.
 *
 * @see src/lib/humanErrorRadar.js  — the reconciliation engine
 * @see src/lib/agentTrust.js       — `autoCheckPass === false` overrides the tier
 * @see scripts/tests/autoChecks.test.mjs
 * @see scripts/tests/agentReview.test.mjs — the end-to-end decision path
 */
import { runHumanErrorRadar } from '../humanErrorRadar.js';
// From `siteFields.js`, never `siteVision.js` — the latter statically pulls in
// @napi-rs/canvas, and a native binary has no business being loaded by the
// checks module or by a unit test that only wants to do arithmetic.
// `stated()` rather than Number(): Number(null) is 0 and reads as a real
// reading, which would turn "the drawing did not say" into a passed check.
import { lotSquareFeet, stallBreakdown, stated, SURFACE_STALL_SF, ACRE_SF } from '../siteFields.js';

/** One check result. `status` is PASS | FAIL | SKIP. */
function result(key, status, detail) { return { key, status, detail }; }

const PASS = 'PASS', FAIL = 'FAIL', SKIP = 'SKIP';

// ── Shared checks ────────────────────────────────────────────────────────────

/**
 * Every claim carries a citation.
 *
 * The plan states this for the sales bot and code lookups, but it generalises:
 * an extraction that cannot say WHERE it read something is an extraction nobody
 * can check, and "nobody can check it" is the property this whole layer exists
 * to remove.
 */
function citationsPresent(items, { requireCoordinates = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return result('citations', SKIP, 'No items to check.');
  }
  const uncited = items.filter(i => {
    const c = i?.citation ?? i?.citations ?? i?.source;
    if (!c) return true;
    if (requireCoordinates) {
      const one = Array.isArray(c) ? c[0] : c;
      // A sheet name alone is not a citation on a drawing set — "it's on E-101"
      // is unverifiable on a sheet with four hundred symbols.
      return !(one?.sheet && (one?.x != null || one?.coordinates || one?.bbox));
    }
    return Array.isArray(c) ? c.length === 0 : false;
  });

  return uncited.length
    ? result('citations', FAIL,
        `${uncited.length} of ${items.length} item(s) carry no ${requireCoordinates ? 'sheet + coordinate ' : ''}citation.`)
    : result('citations', PASS, `All ${items.length} item(s) cited.`);
}

// ── Unit matrix — the budget arithmetic ──────────────────────────────────────
//
// The unit matrix sits upstream of every dollar in a conceptual budget: unit
// count drives fixture counts, unit SF drives the interior package, bedroom
// count drives the per-room math. That makes a bad extraction here uniquely
// expensive, and uniquely quiet — miss one unit type and the budget is not
// obviously broken, it is plausible and wrong by that type's whole
// contribution, and nothing downstream ever contradicts it.
//
// So every check below is arithmetic on the extraction itself. None of them
// asks a second model whether the first one did well.

/** Plausible envelope for ONE residential unit, in SF. */
const UNIT_SF_MIN = 150;
const UNIT_SF_MAX = 6000;

/**
 * Net unit SF below this share of gross interior means rows are missing.
 * Real multifamily lands around 0.75–0.90 net-to-gross; corridors, BOH and
 * amenity make up the rest. Half is generous, and it is meant to be — this
 * check should fire on "the model found 3 of 12 unit types", not on an
 * unusually corridor-heavy building.
 */
const MIN_NET_TO_GROSS = 0.5;

/**
 * Net above gross is arithmetically impossible, but allow a sliver: the prompt
 * accepts NRSF as a gross figure, and net rentable can legitimately sit within
 * rounding distance of the unit sum.
 */
const NET_OVER_GROSS_TOLERANCE = 0.02;

/**
 * Bedroom count implied by a type code, or null when the code does not say.
 *
 * Deliberately conservative. "S-1" and "B2" are building/stack codes as often
 * as they are unit descriptors, and a check that guesses wrong teaches people
 * to ignore it.
 */
export function bedroomsFromCode(code) {
  const s = String(code ?? '').toUpperCase();
  if (/\b(STUDIO|STU|EFF|EFFICIENCY)\b/.test(s)) return 0;
  const m = s.match(/(\d+)\s*(?:BR|BED|BEDROOM)S?\b/);
  return m ? Number(m[1]) : null;
}

function unitMatrixChecks(output) {
  const rows = Array.isArray(output?.unitTypes) ? output.unitTypes : [];
  const totals = output?.projectTotals || {};

  // An empty matrix is not "no opinion" — it is an extraction that produced
  // nothing to price, which is always wrong for a document worth uploading.
  if (!rows.length) {
    return [result('rows', FAIL, 'The extraction found no unit types. There is nothing here to build a budget from.')];
  }

  const checks = [];

  // 1 ── Every row has a code and a positive whole quantity.
  const badQty = rows.filter(r => {
    const q = Number(r?.qty);
    return !Number.isFinite(q) || q <= 0 || !Number.isInteger(q);
  });
  const noCode = rows.filter(r => !String(r?.code ?? '').trim());
  checks.push(
    badQty.length || noCode.length
      ? result('rows', FAIL,
          [badQty.length && `${badQty.length} row(s) have a quantity that is not a whole number above zero`,
           noCode.length && `${noCode.length} row(s) have no type code`]
            .filter(Boolean).join('; ') + '.')
      : result('rows', PASS, `All ${rows.length} row(s) have a type code and a whole quantity.`)
  );

  // 2 ── No duplicate codes. Two rows sharing a code is a roll-up that
  //      double-counts those units, and a double-count reads as plausible.
  const seen = new Map();
  for (const r of rows) {
    const key = String(r?.code ?? '').trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  checks.push(dupes.length
    ? result('duplicate-codes', FAIL, `Type code(s) appear more than once: ${dupes.slice(0, 5).join(', ')}. Those units would be counted twice.`)
    : result('duplicate-codes', PASS, 'No repeated type codes.'));

  // 3 ── Unit SF inside a plausible envelope. The classic failure is a gross
  //      building total landing in a per-unit cell.
  const sfRows = rows.filter(r => r?.unitSf != null);
  if (!sfRows.length) {
    checks.push(result('unit-sf-range', SKIP, 'No unit SF was extracted.'));
  } else {
    const outliers = sfRows.filter(r => {
      const sf = Number(r.unitSf);
      return !Number.isFinite(sf) || sf < UNIT_SF_MIN || sf > UNIT_SF_MAX;
    });
    checks.push(outliers.length
      ? result('unit-sf-range', FAIL,
          `${outliers.length} row(s) have a unit SF outside ${UNIT_SF_MIN}–${UNIT_SF_MAX.toLocaleString()}: ` +
          outliers.slice(0, 4).map(r => `${r.code} = ${r.unitSf}`).join(', ') + '.')
      : result('unit-sf-range', PASS, `All ${sfRows.length} unit SF value(s) are plausible for a single unit.`));
  }

  // 4 ── The row quantities have to add up to the total printed on the drawing.
  //      This is the highest-value check in the set: it is the model's own row
  //      sum against a number the model read off the cover sheet, so a missed
  //      unit type shows up as a contradiction rather than as a smaller budget.
  const rowUnits = rows.reduce((n, r) => n + (Number(r?.qty) || 0), 0);
  const stated = Number(totals.statedTotalUnits);
  if (!Number.isFinite(stated) || stated <= 0) {
    checks.push(result('stated-total', SKIP, 'The document did not state a total unit count to reconcile against.'));
  } else if (rowUnits !== stated) {
    checks.push(result('stated-total', FAIL,
      `Rows add up to ${rowUnits} units but the document states ${stated}. ` +
      `That is ${Math.abs(stated - rowUnits)} unit(s) ${rowUnits < stated ? 'missing from' : 'extra in'} the matrix.`));
  } else {
    checks.push(result('stated-total', PASS, `Rows add up to ${rowUnits} units, matching the stated total.`));
  }

  // 5 ── Net unit SF against gross interior SF.
  const netSf = rows.reduce((n, r) => n + (Number(r?.qty) || 0) * (Number(r?.unitSf) || 0), 0);
  const gross = Number(totals.grossInteriorSf);
  if (!netSf || !Number.isFinite(gross) || gross <= 0) {
    checks.push(result('sf-reconcile', SKIP, 'Need both unit SF and a gross interior SF to reconcile; one is missing.'));
  } else if (netSf > gross * (1 + NET_OVER_GROSS_TOLERANCE)) {
    checks.push(result('sf-reconcile', FAIL,
      `Unit SF adds up to ${Math.round(netSf).toLocaleString()} but gross interior is ${Math.round(gross).toLocaleString()}. ` +
      'The units cannot occupy more space than the building.'));
  } else if (netSf < gross * MIN_NET_TO_GROSS) {
    checks.push(result('sf-reconcile', FAIL,
      `Unit SF adds up to ${Math.round(netSf).toLocaleString()}, only ${Math.round((netSf / gross) * 100)}% of the ` +
      `${Math.round(gross).toLocaleString()} gross interior. Unit types are probably missing.`));
  } else {
    checks.push(result('sf-reconcile', PASS,
      `Unit SF is ${Math.round((netSf / gross) * 100)}% of gross interior — in the normal range.`));
  }

  // 6 ── The bedroom count must not contradict the type code.
  const claimed = rows
    .map(r => ({ code: r?.code, said: r?.bedrooms, implied: bedroomsFromCode(r?.code) }))
    .filter(r => r.said != null && r.implied != null);
  if (!claimed.length) {
    checks.push(result('bedroom-code', SKIP, 'No row has both a bedroom count and a code that states one.'));
  } else {
    const clash = claimed.filter(r => Number(r.said) !== r.implied);
    checks.push(clash.length
      ? result('bedroom-code', FAIL,
          `${clash.length} row(s) contradict their own type code: ` +
          clash.slice(0, 4).map(r => `${r.code} says ${r.said} bedroom(s)`).join(', ') + '.')
      : result('bedroom-code', PASS, `All ${claimed.length} row(s) agree with their type code.`));
  }

  return checks;
}

// ── Site & parking — the fields that silently price at zero ──────────────────
//
// These are not arbitrary fields to extract next. Three of the six inputs on
// `projectInputChecks.js`'s critical list — lot SF, surface parking stalls,
// exterior amenity SF — are site-plan fields, and that list exists because of a
// measured failure: on 2026-06-18 a budget landed 37% under the source
// spreadsheet because those fields were left blank and the engine read blank as
// zero. So this extraction feeds precisely the fields whose absence is invisible.
//
// The checks below are geometry and arithmetic. The one that matters most is
// `units-vs-project`: it reconciles the site plan against a unit matrix a human
// already signed off on, which makes it the first check in the app that grades
// one AI reading against another AI reading a person has already accepted.

/** Below this, a "square feet" figure is almost certainly acres in the wrong box. */
const LOT_SF_MIN = 4000;
/** Above this, an "acres" figure is almost certainly square feet in the wrong box. */
const LOT_ACRES_MAX = 500;
/** Stated acreage and stated SF should agree this closely if both were read right. */
const LOT_AGREEMENT_TOLERANCE = 0.03;

function isWholeNonNegative(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n);
}

function siteParkingChecks(output, ctx = {}) {
  const checks = [];

  // 0 ── Something has to have been read. A site plan that yielded nothing is a
  //      failed extraction, not a modest one — there is nothing here to apply.
  const READ_FIELDS = ['lotAcres', 'lotSf', 'totalUnits', 'parkingProvided', 'parkingRequired',
                       'surfaceParking', 'garages', 'carports', 'buildingCount', 'clubhouseSf', 'amenitySf'];
  const readCount = READ_FIELDS.filter(f => Number.isFinite(stated(output?.[f]))).length;
  if (!readCount) {
    return [result('read-anything', FAIL,
      'The drawing yielded no site figures at all — no lot area, no unit count, no parking. Nothing here can be applied to a project.')];
  }

  // 1 ── Counts are counts. Half a parking stall means a digit was misread or a
  //      dimension landed in a count field.
  const countFields = [
    ['surfaceParking', 'surface stalls'], ['garages', 'garages'], ['carports', 'carports'],
    ['parkingProvided', 'parking provided'], ['parkingRequired', 'parking required'],
    ['totalUnits', 'total units'], ['buildingCount', 'building count'],
  ];
  const present = countFields.filter(([f]) => output?.[f] != null);
  if (!present.length) {
    checks.push(result('counts', SKIP, 'The drawing stated no counts to check.'));
  } else {
    const bad = present.filter(([f]) => !isWholeNonNegative(output[f]));
    checks.push(bad.length
      ? result('counts', FAIL,
          `${bad.length} count(s) are not whole numbers: ` +
          bad.map(([f, label]) => `${label} = ${output[f]}`).join(', ') + '.')
      : result('counts', PASS, `All ${present.length} count(s) are whole numbers.`));
  }

  // 2 ── Acres and square feet must not be sitting in each other's boxes, and if
  //      the drawing stated both they have to agree. This is the single most
  //      common site-data failure: a lot is written "16.50 AC" and 16.5 lands in
  //      a field the app then prices as 16.5 square feet.
  const acres = stated(output?.lotAcres);
  const statedSf = stated(output?.lotSf);
  const lotErrors = [];
  if (Number.isFinite(statedSf) && statedSf > 0 && statedSf < LOT_SF_MIN) {
    lotErrors.push(`lot SF reads ${statedSf.toLocaleString()}, which is smaller than a single building pad — that looks like an acreage figure in the square-feet field`);
  }
  if (Number.isFinite(acres) && acres > LOT_ACRES_MAX) {
    lotErrors.push(`lot acreage reads ${acres.toLocaleString()}, which would be ${Math.round(acres / 640)} square miles — that looks like a square-feet figure in the acres field`);
  }
  if (Number.isFinite(acres) && acres > 0 && Number.isFinite(statedSf) && statedSf > 0) {
    const implied = acres * ACRE_SF;
    const off = Math.abs(implied - statedSf) / implied;
    if (off > LOT_AGREEMENT_TOLERANCE) {
      lotErrors.push(`${acres} acres works out to ${Math.round(implied).toLocaleString()} SF but the drawing also states ${statedSf.toLocaleString()} SF — ${Math.round(off * 100)}% apart, so one of the two was misread`);
    }
  }
  if (!Number.isFinite(acres) && !Number.isFinite(statedSf)) {
    checks.push(result('lot-area', SKIP, 'The drawing stated no lot area.'));
  } else {
    checks.push(lotErrors.length
      ? result('lot-area', FAIL, lotErrors.join('; ') + '.')
      : result('lot-area', PASS, 'Lot area is a plausible size and its units are consistent.'));
  }

  // 3 ── The parking breakdown cannot exceed the parking total. Surface stalls
  //      plus carports plus garages is what MAKES UP "provided" — if the parts
  //      outrun the whole, one of them was read off the wrong row.
  const parts = stallBreakdown(output);
  const provided = stated(output?.parkingProvided);
  if (!parts || !Number.isFinite(provided) || provided <= 0) {
    checks.push(result('parking-breakdown', SKIP, 'Need both a parking total and at least one stall type broken out; the drawing gave one or neither.'));
  } else if (parts.total > provided) {
    checks.push(result('parking-breakdown', FAIL,
      `The stall types (${parts.kinds.join(' + ')}) add up to ${parts.total.toLocaleString()}, but the drawing states ${provided.toLocaleString()} provided. The parts cannot exceed the total.`));
  } else if (parts.complete && parts.total !== provided) {
    checks.push(result('parking-breakdown', FAIL,
      `All three stall types were read and they add up to ${parts.total.toLocaleString()}, but the drawing states ${provided.toLocaleString()} provided — ${(provided - parts.total).toLocaleString()} stall(s) are unaccounted for.`));
  } else {
    checks.push(result('parking-breakdown', PASS,
      parts.complete
        ? `Surface, carport and garage stalls add up to the stated ${provided.toLocaleString()} provided.`
        : `The ${parts.kinds.join(' + ')} stalls read (${parts.total.toLocaleString()}) fit inside the stated ${provided.toLocaleString()} provided.`));
  }

  // 4 ── Surface stalls need land to sit on. This is pure geometry and it is the
  //      check that catches a square-footage figure being read as a stall count.
  const lot = lotSquareFeet(output);
  const surface = stated(output?.surfaceParking);
  if (!lot || !Number.isFinite(surface) || surface <= 0) {
    checks.push(result('parking-fits', SKIP, 'Need both a lot area and a surface stall count to check whether the parking fits.'));
  } else {
    const needed = surface * SURFACE_STALL_SF;
    checks.push(needed > lot.sf
      ? result('parking-fits', FAIL,
          `${surface.toLocaleString()} surface stalls need roughly ${Math.round(needed).toLocaleString()} SF of paving, but the whole site is ${lot.sf.toLocaleString()} SF. They cannot physically fit — before any building.`)
      : result('parking-fits', PASS,
          `${surface.toLocaleString()} surface stalls need about ${Math.round((needed / lot.sf) * 100)}% of the site — that fits.`));
  }

  // 5 ── The bed mix has to add up to the unit count. This is the failure that
  //      was actually measured at 1600px: totalUnits read 264 while the model's
  //      own bed mix summed to 319.
  const mix = output?.bedMix || {};
  const mixParts = ['studio', 'oneBed', 'twoBed', 'threeBed']
    .map(k => stated(mix[k])).filter(Number.isFinite);
  const totalUnits = stated(output?.totalUnits);
  if (!mixParts.length || !Number.isFinite(totalUnits) || totalUnits <= 0) {
    checks.push(result('bed-mix', SKIP, 'Need both a bed mix and a total unit count to reconcile.'));
  } else {
    const sum = mixParts.reduce((a, b) => a + b, 0);
    checks.push(sum !== totalUnits
      ? result('bed-mix', FAIL,
          `The bed mix adds up to ${sum} units but the drawing states ${totalUnits}. One of the two was misread.`)
      : result('bed-mix', PASS, `The bed mix adds up to the stated ${totalUnits} units.`));
  }

  // 6 ── The reconciliation this whole extraction is worth doing for: the site
  //      plan's unit count against the matrix a human already accepted. Two
  //      independent readings of the same building agreeing is real evidence;
  //      disagreeing means one of them is in a budget and wrong.
  const projectUnits = stated(ctx?.projectUnits);
  if (!Number.isFinite(projectUnits) || projectUnits <= 0 || !Number.isFinite(totalUnits) || totalUnits <= 0) {
    checks.push(result('units-vs-project', SKIP,
      Number.isFinite(projectUnits) && projectUnits > 0
        ? 'The drawing did not state a unit count to compare against the project.'
        : 'The project has no confirmed unit count yet to compare against.'));
  } else {
    checks.push(totalUnits !== projectUnits
      ? result('units-vs-project', FAIL,
          `This drawing says ${totalUnits} units; the project already has ${projectUnits} confirmed from the unit matrix. ` +
          'Two readings of the same building disagree — one of them is wrong, and the confirmed one is already priced.')
      : result('units-vs-project', PASS, `${totalUnits} units — matches the unit matrix already confirmed on this project.`));
  }

  // 7 ── Stalls per unit. Wide band on purpose: this fires on a missing or extra
  //      digit, not on an unusually parked site.
  if (!Number.isFinite(provided) || provided <= 0 || !Number.isFinite(totalUnits) || totalUnits <= 0) {
    checks.push(result('parking-ratio', SKIP, 'Need both a parking total and a unit count to check the ratio.'));
  } else {
    const ratio = provided / totalUnits;
    checks.push(ratio < 0.3 || ratio > 4
      ? result('parking-ratio', FAIL,
          `Parking works out to ${ratio.toFixed(2)} stalls per unit, outside the 0.3–4 range every multifamily site falls in. A digit is missing or added in one of the two numbers.`)
      : result('parking-ratio', PASS, `${ratio.toFixed(2)} stalls per unit — normal for multifamily.`));
  }

  // 8 ── Amenity areas are on the site, so they cannot be bigger than it.
  const amenity = ['clubhouseSf', 'amenitySf']
    .map(k => stated(output?.[k])).filter(n => Number.isFinite(n) && n > 0);
  if (!lot || !amenity.length) {
    checks.push(result('amenity-fits', SKIP, 'Need both a lot area and an amenity area to compare.'));
  } else {
    const totalAmenity = amenity.reduce((a, b) => a + b, 0);
    checks.push(totalAmenity > lot.sf
      ? result('amenity-fits', FAIL,
          `Amenity area adds up to ${totalAmenity.toLocaleString()} SF on a ${lot.sf.toLocaleString()} SF site. The amenities cannot be larger than the property.`)
      : result('amenity-fits', PASS, `Amenity area is ${Math.round((totalAmenity / lot.sf) * 100)}% of the site.`));
  }

  return checks;
}

// ── Per-task-type checks ─────────────────────────────────────────────────────

const CHECKS = {
  /**
   * The unit matrix — the extraction every conceptual budget is built on.
   * Pure arithmetic; needs no context and therefore can never SKIP wholesale.
   */
  'extract.unitMatrix': (output) => unitMatrixChecks(output),

  /**
   * The site plan — lot area, parking and amenity, read off a drawing image.
   *
   * `context.projectUnits` is the unit count already confirmed on the project.
   * Supplying it turns on the strongest check in the set; leaving it out
   * degrades that one check to SKIP rather than to a pass.
   */
  'extract.siteParking': (output, ctx) => siteParkingChecks(output, ctx),

  /**
   * Detected fixture counts must reconcile against the unit matrix, and every
   * detection must point at a sheet AND a location on it.
   */
  'vision.fixtureTagDetect': (output, ctx) => {
    const checks = [citationsPresent(output?.detections || output?.items, { requireCoordinates: true })];

    const items   = output?.scheduleItems || output?.items || [];
    const takeoff = ctx?.takeoffData;
    if (!takeoff || !items.length) {
      checks.push(result('reconcile', SKIP, 'No takeoff data supplied — counts could not be reconciled.'));
    } else {
      const radar = runHumanErrorRadar(items, takeoff, ctx?.bidMatrix || null);
      checks.push(result('reconcile',
        radar.overallStatus === 'FLAG' ? FAIL : PASS,
        `Human Error Radar: ${radar.overallStatus}.`));
    }
    return checks;
  },

  /** Manufacturer + model must resolve against Master Pricing, or be flagged. */
  'extract.cutSheetSpec': async (output, ctx) => {
    const items = output?.items || output?.fixtures || [];
    if (!items.length) return [result('resolve', SKIP, 'No fixtures in the output.')];
    if (typeof ctx?.resolveProduct !== 'function') {
      return [result('resolve', SKIP, 'No product resolver supplied — could not check against Master Pricing.')];
    }

    const unresolved = [];
    for (const it of items) {
      const hit = await ctx.resolveProduct(it.manufacturer, it.model ?? it.catalogNumber);
      // Unresolved is not automatically a failure — a genuinely new product will
      // not be in Master Pricing. It is a failure only if the extraction ALSO
      // claimed confidence in it without flagging it for a human.
      if (!hit && !it.aiFlagged) unresolved.push(`${it.manufacturer || '?'} ${it.model || it.catalogNumber || '?'}`);
    }
    return [unresolved.length
      ? result('resolve', FAIL, `${unresolved.length} unresolved and unflagged: ${unresolved.slice(0, 5).join(', ')}`)
      : result('resolve', PASS, `All ${items.length} fixture(s) resolved or flagged.`)];
  },

  /** Every factual claim carries a KB citation. Zero uncited claims. */
  'draft.salesBotAnswer': (output) => [citationsPresent(output?.claims || output?.facts)],

  /** The cited code section has to actually exist. */
  'lookup.codeRequirement': async (output, ctx) => {
    const cites = output?.citations || output?.sections || [];
    if (!Array.isArray(cites) || !cites.length) {
      return [result('code-section', FAIL, 'A code answer with no cited section is not an answer.')];
    }
    if (typeof ctx?.codeSectionExists !== 'function') {
      return [result('code-section', SKIP, 'No code-section resolver supplied.')];
    }
    const missing = [];
    for (const c of cites) {
      const ref = typeof c === 'string' ? c : (c.section || c.ref);
      if (!(await ctx.codeSectionExists(ref))) missing.push(ref);
    }
    return [missing.length
      ? result('code-section', FAIL, `Cited section(s) not found in the knowledge base: ${missing.slice(0, 5).join(', ')}`)
      : result('code-section', PASS, `All ${cites.length} cited section(s) exist.`)];
  },
};

/**
 * Run whatever deterministic checks exist for a task type.
 *
 * Never throws: a check that blows up must not take down the extraction it was
 * grading. A thrown check reports FAIL rather than SKIP — a check that crashed
 * on this output is evidence about this output, and routing it to a human is the
 * safe reading.
 *
 * @returns {{ran: boolean, pass: boolean|null, checks: Array}}
 */
export async function runAutoChecks(taskType, output, context = {}) {
  const fn = CHECKS[taskType];
  if (!fn) return { ran: false, pass: null, checks: [], note: `No deterministic check defined for "${taskType}".` };

  let checks;
  try {
    checks = await fn(output, context);
  } catch (err) {
    return {
      ran: true, pass: false,
      checks: [result('check-error', FAIL, `The check itself failed: ${err?.message || err}`)],
    };
  }

  const graded = checks.filter(c => c.status !== SKIP);
  return {
    ran: true,
    // All-SKIP means the check could not run, which is `null` — no opinion —
    // never a pass.
    pass: graded.length ? graded.every(c => c.status === PASS) : null,
    checks,
    skipped: checks.filter(c => c.status === SKIP).length,
  };
}

/** Task types that have a deterministic check, for the queue to display. */
export function checkedTaskTypes() { return Object.keys(CHECKS); }
