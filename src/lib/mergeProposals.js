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
 */
export function mergeProposals(results) {
  const byCode = new Map();
  const totals = { grossInteriorSf: null, garageSf: null, corridorSf: null, buildingType: null };
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
      const val = proposal.projectTotals?.[field];
      if (val == null) continue;
      if (totals[field] == null) {
        totals[field] = val;
      } else if (totals[field] !== val) {
        conflicts.push({ field, values: [{ value: totals[field] }, { value: val, file: fileName }] });
      }
    }

    if (proposal.overallConfidence != null) { confSum += proposal.overallConfidence; confCount++; }
  }

  return {
    unitTypes: [...byCode.values()].map(({ _sources, ...r }) => ({ ...r, sources: _sources })),
    projectTotals: totals,
    conflicts,
    sources,
    overallConfidence: confCount ? confSum / confCount : null,
  };
}
