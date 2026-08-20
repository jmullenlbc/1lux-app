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
  'lotAcres', 'lotSf', 'totalUnits', 'parkingProvided', 'parkingRequired',
  'surfaceParking', 'garages', 'carports', 'buildingCount', 'clubhouseSf',
  'amenitySf', 'buildingType',
];

/**
 * The gross-SF verdict fields, carried together as one unit.
 * Produced by `attachAreaBasis` in drawingExtract.js.
 */
const GROSS_SF_META = [
  'grossSfStated', 'grossSfBasis', 'grossSfConfidence', 'grossSfAdjusted',
  'grossSfNeedsReview', 'grossSfNote', 'grossSfSummary', 'grossSfLabel', 'grossSfSheet',
  'grossSfUnreadable',
];

export function mergeProposals(results) {
  const byCode = new Map();
  // Keys are listed rather than copied so a new field in the extraction schema
  // is a deliberate decision here too. `statedTotalUnits` is what the auto-check
  // reconciles row quantities against — dropping it silently would turn that
  // check into a permanent SKIP without anything appearing to break.
  const totals = { grossInteriorSf: null, garageSf: null, corridorSf: null, statedTotalUnits: null, buildingType: null };
  let siteData = null;
  // The gross-SF verdict travels as a BUNDLE, not as independent fields — see
  // GROSS_SF_META below.
  let grossBundle = null;
  const conflicts = [];
  const sources = [];
  let confSum = 0, confCount = 0;

  for (const { fileName, proposal } of results) {
    if (!proposal) continue;
    sources.push(fileName);

    for (const row of proposal.unitTypes ?? []) {
      const key = String(row.code ?? '').trim().toLowerCase();
      if (!key) continue;
      const existing = byCode.get(key);
      if (!existing) {
        byCode.set(key, { ...row, _sources: [fileName] });
        continue;
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

    for (const field of Object.keys(totals)) {
      if (field === 'grossInteriorSf') continue;   // handled as a bundle below
      const val = proposal.projectTotals?.[field];
      if (val == null) continue;
      if (totals[field] == null) {
        totals[field] = val;
      } else if (totals[field] !== val) {
        conflicts.push({ field, values: [{ value: totals[field] }, { value: val, file: fileName }] });
      }
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

    if (proposal.siteData) {
      if (!siteData) siteData = { _sources: [] };
      siteData._sources.push(fileName);
      for (const field of SITE_DATA_KEYS) {
        const val = proposal.siteData[field];
        if (val == null) continue;
        if (siteData[field] == null) {
          siteData[field] = val;
        } else if (siteData[field] !== val) {
          conflicts.push({ field: `site ${field}`, values: [{ value: siteData[field] }, { value: val, file: fileName }] });
        }
      }
    }

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
    projectTotals: totals,
    siteData,
    conflicts,
    sources,
    overallConfidence: confCount ? confSum / confCount : null,
  };
}
