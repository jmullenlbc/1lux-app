/**
 * Merging extracted unit-matrix proposals — pure, and client-safe.
 *
 * This lives apart from `drawingExtract.js` for one structural reason: the
 * intake dropzone is a client component and needs this function, while
 * `drawingExtract.js` reaches the model and (through the injection boundary)
 * `node:crypto`. Keeping them in one file meant a browser bundle pulling in
 * server-only machinery — which webpack refuses outright for `node:` imports,
 * and which would have been wrong even if it had silently succeeded.
 *
 * Nothing here touches IO, the network, or a model. Given proposals, it returns
 * a merged proposal.
 *
 * `drawingExtract.js` re-exports this so existing server-side importers and
 * scripts/tests/drawingExtract.test.mjs keep working unchanged.
 */

/**
 * Merge proposals from several uploaded drawings into one.
 *
 * Mike's requirement is multiple drawings per submission, which the old
 * single-file flow never had to handle. Two rules, both chosen to fail safe:
 *
 * 1. Unit types are merged by `code`. When the same code appears in two
 *    documents we keep the row with the HIGHER confidence rather than summing
 *    quantities — the common real case is the same matrix appearing on several
 *    sheets, and summing would silently double the unit count. Under-counting
 *    is visible to a reviewer; double-counting looks plausible and is not.
 *    Since 2026-09-16 ONE file is the counted schedule and other files can
 *    only agree or disagree with it — see scoreSchedule below.
 * 2. Project totals take the first non-null value, in upload order, and every
 *    disagreement is recorded in `conflicts` so a human can settle it.
 * 3. Site-plan reads (`kind: 'site_data'` proposals from the vision path) merge
 *    field-by-field under the same first-non-null-plus-conflicts rule. Before
 *    this existed, a parsed site plan was silently dropped here and the visitor
 *    was told their drawing was read when its numbers went nowhere.
 */

// The numeric fields a site-plan read can carry (mirrors SITE_VISION_SYSTEM in
// siteVision.js). Listed for the same reason as `totals` below: a new field in
// the vision schema must be a deliberate decision here too.
const SITE_DATA_KEYS = [
  'lotAcres', 'lotSf', 'totalUnits', 'parkingProvided', 'parkingRequired', 'parkingRatioRequired',
  'surfaceParking', 'surfaceParkingCounted', 'garages', 'carports', 'buildingCount', 'clubhouseSf',
  'amenitySf', 'grossSf', 'stories', 'storiesCounted', 'egressStairwells',
  'egressStairwellsCounted', 'exitDoors', 'exitDoorsCounted',
  'buildingFootprintSf', 'lotCoveragePct', 'buildingType', 'driveLengthFtMeasured',
];

/**
 * The gross-SF verdict fields, carried together as one unit.
 * Produced by `attachAreaBasis` in drawingExtract.js.
 */
const GROSS_SF_META = [
  'grossSfStated', 'grossSfBasis', 'grossSfConfidence', 'grossSfAdjusted',
  'grossSfNeedsReview', 'grossSfNote', 'grossSfSummary', 'grossSfLabel', 'grossSfSheet',
  'grossSfUnreadable',
  // The per-building addends behind a summed total (attachAreaBasis) — they
  // explain the number, so they travel with it, never mixed across files.
  'perBuildingGross', 'grossSfSummed',
];

/**
 * A stand-in key for a unit row whose type code did not come through.
 *
 * Built from the numbers that make the row what it is, so the same unnamed row
 * printed on two sheets collapses to one (rule 1: never sum the same matrix
 * twice) while two genuinely different unnamed types both survive. A real unit
 * code cannot contain '#', so this can never collide with code.toLowerCase().
 */
function blankKey(row) {
  const part = v => (v === null || v === undefined || v === '' ? '' : String(Number(v)));
  return `#unnamed#${part(row.qty ?? row.count)}:${part(row.unitSf)}:${part(row.bedrooms)}`
       + `:${part(row.bathrooms)}:${part(row.balconies)}:${String(row.label ?? '').trim().toLowerCase()}`;
}

const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = v => String(v ?? '').trim().toLowerCase();

/**
 * Same code, but is it really the same unit type?
 *
 * The model chooses the code, and on Lone Tree Ranch Test v1 (2026-09-15, live)
 * it wrote the BEDROOM COUNT as the code — "2BR", "3BR", "3BR", "3BR", "4BR" —
 * for seven rows the drawings name "Unit 2-1", "Unit 2-1 Type A", "Unit 3-1",
 * "Unit 3-2", ... Keyed on code alone, rule 1 (never sum the same matrix twice)
 * folded them into three rows and threw away 60 units, then reported the four
 * missing rows as "disagreements between files" that never happened.
 *
 * Rule 1 is about the SAME row printed on several sheets. A second row with the
 * same code is a different type, not a repeat, when the quantity differs AND:
 *   - it came from the same file (one matrix never lists one type twice with
 *     two quantities), or
 *   - its unit SF, bedroom count or label differs where both are stated.
 * Same quantity means it is the same row seen again, which rule 1 handles.
 * Different quantity across files with nothing else to tell them apart is the
 * genuine disagreement the conflicts list exists for.
 */
function isDifferentType(existing, row, fileName) {
  if (num(row.qty) === num(existing.qty)) return false;
  if (existing._sources.includes(fileName)) return true;
  const a = existing, b = row;
  if (num(a.unitSf) != null && num(b.unitSf) != null && num(a.unitSf) !== num(b.unitSf)) return true;
  if (num(a.bedrooms) != null && num(b.bedrooms) != null && num(a.bedrooms) !== num(b.bedrooms)) return true;
  if (txt(a.label) && txt(b.label) && txt(a.label) !== txt(b.label)) return true;
  return false;
}

/**
 * Which file's unit schedule is COUNTED.
 *
 * Lone Tree Ranch Test v2, live, 2026-09-16 (Mike's screenshot): the GEN sheet
 * set carried the real unit matrix — seven types, 168 units, and the drawing's
 * own printed total of 168. The ARCH set has no matrix at all; the model
 * ESTIMATED its rows from a typical floor times three levels times four
 * buildings, at 0.4 confidence, and spelled the codes a little differently
 * ("Unit 2-1 - Type A" against GEN's "Unit 2-1 Type A") with unit areas a foot
 * or two off (1,219 against 1,218). Keyed on code, four of its six rows matched
 * nothing and were ADDED, so the project came back with 188 units, 535
 * bedrooms and a units-SF total larger than the building. Every number after
 * that was wrong, and the only visible symptom was a small "drawings say 168".
 *
 * So the merge no longer unions unit rows across files on the strength of a
 * code mismatch. One file is the schedule:
 *
 *   1. a file whose rows add up to its own printed total is complete — the
 *      drawing itself says so — and beats any file that is not;
 *   2. otherwise the most confident read, then the one with the most units.
 *
 * When that file prints a total, or when any other file shares a unit code
 * with it (so they are describing the same schedule), the other files can
 * only DISAGREE: a same-code row with a different quantity is recorded as a
 * conflict, and the rows they carry that the schedule does not are listed as
 * one summary disagreement and set aside in `uncountedUnitTypes`, never added.
 * Only when files share no codes and none states a total — two buildings'
 * matrices in two files — are they still unioned, as before.
 *
 * The 2026-09-15 rule that rows from ONE file sharing a code are all kept
 * (`isDifferentType`) is untouched: it is about one matrix, not two files.
 */
function scoreSchedule(fileName, proposal) {
  const rows = (proposal?.unitTypes ?? []).filter(r => r && typeof r === 'object');
  if (!rows.length) return null;
  const sum = rows.reduce((a, r) => a + (num(r.qty) ?? 0), 0);
  const stated = num(proposal.projectTotals?.statedTotalUnits);
  const codes = new Set(rows.map(r => txt(r.code)).filter(Boolean));
  return {
    fileName, rows, sum, stated, codes,
    complete: stated != null && stated > 0 && sum === stated,
    conf: Number(proposal.overallConfidence ?? 0) || 0,
  };
}

function pickSchedule(scored) {
  // Stable sort: ties keep upload order, so the first-dropped file wins them.
  return [...scored].sort((a, b) =>
    (Number(b.complete) - Number(a.complete)) || (b.conf - a.conf) || (b.sum - a.sum))[0];
}

/** One line a reviewer can read, for the summary disagreement. */
function describeRows(rows) {
  const units = rows.reduce((a, r) => a + (num(r.qty) ?? 0), 0);
  return `${rows.length} type${rows.length === 1 ? '' : 's'} / ${units} unit${units === 1 ? '' : 's'}`;
}

export function mergeProposals(results) {
  const byCode = new Map();
  // Keys are listed rather than copied so a new field in the extraction schema
  // is a deliberate decision here too. `statedTotalUnits` is what the auto-check
  // reconciles row quantities against — dropping it silently would turn that
  // check into a permanent SKIP without anything appearing to break.
  const totals = { grossInteriorSf: null, garageSf: null, corridorSf: null, bohSf: null, statedTotalUnits: null, buildingType: null };
  let siteData = null;
  // The gross-SF verdict travels as a BUNDLE, not as independent fields — see
  // GROSS_SF_META below.
  let grossBundle = null;
  const conflicts = [];
  const sources = [];
  // The sheets we kept a picture of, gathered across every file in the drop so
  // a reviewer can see what each number was read off. Carried by reference
  // (a storage key and a page number), never by content — these ride in the
  // submission payload, which has a size ceiling measured in kilobytes.
  const keptSheets = [];
  let confSum = 0, confCount = 0;

  // ── Unit rows: one file is the schedule (see scoreSchedule) ──────────────
  const scored = results
    .map(({ fileName, proposal }) => scoreSchedule(fileName, proposal))
    .filter(Boolean);
  const schedule = scored.length ? pickSchedule(scored) : null;
  const others = scored.filter(s => s !== schedule);
  const anchored = !!schedule && (
    schedule.stated != null
    || others.some(o => [...o.codes].some(c => schedule.codes.has(c)))
  );
  const uncounted = [];

  /** Today's within-a-file merge (rule 1 + isDifferentType); also the union path. */
  function addRow(row, fileName) {
    // A row with no type code used to be dropped outright, which silently
    // deleted its units from the project (Mike, 2026-09-15: the unit count
    // came back far under on Lone Tree Ranch Test v1). A blank code is a
    // LABELLING failure, not a reason to discard the quantity — quantities.js
    // counts a row by its qty and never looks at its code.
    //
    // It still cannot de-duplicate itself the way a real code does, and rule 1
    // above exists because the same matrix printed on several sheets must not
    // be counted twice. So an unnamed row is keyed by its CONTENT instead.
    // Both failure modes stay closed: nothing is deleted, nothing is doubled.
    const code = String(row.code ?? '').trim();
    let key = code
      ? code.toLowerCase()
      : blankKey(row);
    let existing = byCode.get(key);
    // A different type wearing the same code (see isDifferentType) gets its
    // own bucket, keyed by code PLUS content, so it survives instead of being
    // "reconciled" out of existence. The same content-keyed bucket then
    // dedupes it correctly if a second file prints the same row again.
    if (existing && code && isDifferentType(existing, row, fileName)) {
      key = `${key}|${blankKey(row)}`;
      existing = byCode.get(key);
    }
    if (!existing) {
      byCode.set(key, { ...row, _sources: [fileName] });
      return;
    }
    existing._sources.push(fileName);
    if (Number(row.qty) !== Number(existing.qty)) {
      conflicts.push({
        field: `unit type ${row.code} qty`,
        values: [
          { value: existing.qty, file: existing._sources[0] },
          { value: row.qty, file: fileName },
        ],
      });
    }
    // Higher-confidence row wins; never sum.
    if ((row.confidence ?? 0) > (existing.confidence ?? 0)) {
      byCode.set(key, { ...row, _sources: existing._sources });
    }
  }

  /**
   * A row from a file that is NOT the schedule, when the schedule is settled:
   * it can confirm a row, dispute a row's quantity, or be set aside. It never
   * adds units and never replaces the schedule's own figure.
   */
  function checkRow(row, fileName, extras) {
    const code = txt(row.code);
    const buckets = code
      ? [...byCode.entries()].filter(([k]) => k === code || k.startsWith(`${code}|`)).map(([, v]) => v)
      : [];
    if (!buckets.length) { extras.push(row); return; }
    const same = buckets.find(b => num(b.qty) === num(row.qty));
    if (same) { same._sources.push(fileName); return; }
    const first = buckets[0];
    first._sources.push(fileName);
    conflicts.push({
      field: `unit type ${row.code} qty`,
      values: [
        { value: first.qty, file: first._sources[0] },
        { value: row.qty, file: fileName },
      ],
    });
  }

  if (schedule) {
    for (const row of schedule.rows) addRow(row, schedule.fileName);
    for (const o of others) {
      if (!anchored) { for (const row of o.rows) addRow(row, o.fileName); continue; }
      const extras = [];
      const before = conflicts.length;
      for (const row of o.rows) checkRow(row, o.fileName, extras);
      if (extras.length) {
        // Ahead of this file's row-by-row disagreements: the dropzone shows
        // only the first few, and the summary is the one worth seeing.
        conflicts.splice(before, 0, {
          field: 'unit types',
          values: [
            { value: `${describeRows(schedule.rows)} (counted)`, file: schedule.fileName },
            { value: `${describeRows(extras)} not in ${schedule.fileName} (not counted)`, file: o.fileName },
          ],
        });
        for (const row of extras) uncounted.push({ ...row, file: o.fileName });
      }
    }
  }

  /**
   * Which file speaks first for a single figure (a total, a site number).
   *
   * Mike 2026-09-16: "just because it read one first doesn't mean it should
   * use that data." Upload order — and, worse, the order the reads happened
   * to finish in — used to decide every first-non-null figure. Now the order
   * is: the file the unit count came from (it is the real set), then the
   * more confident read, then upload order as the final tie-break. The
   * dropzone only calls this once every file is read, so "first" is a
   * decision, not a race.
   */
  function byPriority(confOf) {
    return results
      .map((r, i) => ({
        r, i,
        sched: schedule && r.fileName === schedule.fileName ? 1 : 0,
        conf: Number.isFinite(confOf(r.proposal)) ? confOf(r.proposal) : 0,
      }))
      .sort((a, b) => (b.sched - a.sched) || (b.conf - a.conf) || (a.i - b.i))
      .map(x => x.r);
  }
  const totalsFrom = {};
  const siteFrom = {};

  for (const { fileName, proposal } of byPriority(p => p?.overallConfidence)) {
    if (!proposal) continue;
    for (const field of Object.keys(totals)) {
      if (field === 'grossInteriorSf') continue;   // handled as a bundle below
      const val = proposal.projectTotals?.[field];
      if (val == null) continue;
      if (totals[field] == null) {
        totals[field] = val;
        totalsFrom[field] = fileName;
      } else if (Number.isFinite(num(totals[field])) && Number.isFinite(num(val)) && num(totals[field]) !== num(val)) {
        // Only two NUMBERS can disagree. `buildingType` here is the model's
        // free-text description of the code data ("Occupancy R-2, Type VA…"),
        // which two files never word the same way; comparing those produced
        // a "buildingType: NaN vs NaN" disagreement on Lone Tree v2.
        conflicts.push({ field, values: [{ value: totals[field], file: totalsFrom[field] }, { value: val, file: fileName }] });
      }
    }
  }

  for (const { fileName, proposal } of byPriority(p => p?.siteData?.confidence ?? p?.overallConfidence)) {
    if (!proposal?.siteData) continue;
    if (!siteData) siteData = { _sources: [] };
    // bedMix is an object, so the scalar loop below can't referee it — the
    // highest-priority drawing that states a mix wins, whole. Splicing studio
    // counts from one file with 2BR counts from another would build a mix no
    // drawing actually says.
    if (siteData.bedMix == null && proposal.siteData.bedMix && typeof proposal.siteData.bedMix === 'object') {
      const mix = proposal.siteData.bedMix;
      if (Object.values(mix).some(v => v != null)) siteData.bedMix = mix;
    }
    for (const field of SITE_DATA_KEYS) {
      const val = proposal.siteData[field];
      if (val == null) continue;
      if (siteData[field] == null) {
        siteData[field] = val;
        siteFrom[field] = fileName;
      } else if (siteData[field] !== val) {
        conflicts.push({ field: `site ${field}`, values: [{ value: siteData[field], file: siteFrom[field] }, { value: val, file: fileName }] });
      }
    }
  }

  for (const { fileName, proposal } of results) {
    if (!proposal) continue;
    sources.push(fileName);

    for (const sheet of proposal.keptSheets ?? []) {
      if (sheet?.key) keptSheets.push({ ...sheet, file: fileName });
    }

    // Gross SF: best-confidence wins, not first-non-null.
    //
    // The other totals are single numbers, so first-non-null is fine. This one
    // is a number plus the verdict about what the number MEANS, and those must
    // stay attached to each other. Merging them field-by-field would happily
    // pair file A's square footage with file B's basis and confidence — a number
    // and an explanation of a different number, which is worse than either alone.
    //
    // Best-confidence rather than first also gets the right answer for free in
    // the common multi-file upload: drop the whole set plus the architect's area
    // sheet, and the area sheet's explicit "BUILDING GROSS SF" (high confidence)
    // beats the code summary the big set happened to be scanned from.
    const pt = proposal.projectTotals ?? {};
    if (pt.grossInteriorSf != null) {
      const incoming = { file: fileName, conf: pt.grossSfConfidence ?? 0, totals: pt };
      if (!grossBundle) {
        grossBundle = incoming;
      } else {
        if (grossBundle.totals.grossInteriorSf !== pt.grossInteriorSf) {
          conflicts.push({
            field: 'grossInteriorSf',
            values: [
              { value: grossBundle.totals.grossInteriorSf, file: grossBundle.file },
              { value: pt.grossInteriorSf, file: fileName },
            ],
          });
        }
        if (incoming.conf > grossBundle.conf) grossBundle = incoming;
      }
    }

    // Site figures were settled above in priority order; the source list
    // stays in upload order so it reads like the file list on screen.
    if (proposal.siteData) siteData._sources.push(fileName);

    if (proposal.overallConfidence != null) { confSum += proposal.overallConfidence; confCount++; }
    else if (proposal.siteData?.confidence != null) { confSum += proposal.siteData.confidence; confCount++; }
  }

  if (siteData) {
    const { _sources, ...fields } = siteData;
    siteData = { ...fields, sources: _sources };
  }

  if (grossBundle) {
    for (const k of GROSS_SF_META) totals[k] = grossBundle.totals[k] ?? null;
    totals.grossInteriorSf = grossBundle.totals.grossInteriorSf;
    totals.grossSfFile = grossBundle.file;
  }

  return {
    unitTypes: [...byCode.values()].map(({ _sources, ...r }) => ({ ...r, sources: _sources })),
    // Rows another file carried that the counted schedule does not (see
    // scoreSchedule). Kept so a reviewer can see them; never priced.
    uncountedUnitTypes: uncounted,
    // Which file the unit count came from, and why.
    unitSchedule: schedule
      ? { file: schedule.fileName, units: schedule.sum, stated: schedule.stated, complete: schedule.complete, anchored }
      : null,
    projectTotals: totals,
    siteData,
    conflicts,
    sources,
    keptSheets: keptSheets.length ? keptSheets : null,
    overallConfidence: confCount ? confSum / confCount : null,
  };
}
