/**
 * "Does the drawing read look trustworthy?" — plain-English warnings computed
 * from the merged drawing data on a submission, shown to the ILC reviewer and
 * included in the notification email.
 *
 * The point is Mike's rule: the drawings should build the numbers into the
 * tool before a human ever sees it, AND the tool should say when it isn't
 * confident. So every check here produces a sentence a non-engineer can act
 * on, not a metric.
 *
 * Input is the mergeProposals() output stored in rawPayload.drawings:
 * { unitTypes, projectTotals, siteData, conflicts, sources, overallConfidence }
 */

import { computeQuantities } from './quantities.js';
import { answersToEngine } from './questionnaire.js';
import { figureAlert, ROW_FIELD } from '../calibration/figureNorms.js';

const LOW_CONFIDENCE = 0.7;

export function computeReviewFlags(drawings) {
  const flags = [];
  if (!drawings || !drawings.sources?.length) {
    flags.push('No drawings were uploaded — every number below is unverified.');
    return flags;
  }

  // The payload arrives verbatim from an unauthenticated browser — every shape
  // assumption here is an assumption about hostile input.
  const site = (drawings.siteData && typeof drawings.siteData === 'object') ? drawings.siteData : null;
  const unitTypes = Array.isArray(drawings.unitTypes) ? drawings.unitTypes : [];
  // The extraction schema calls the column `qty` — `count` kept as a fallback
  // for early payloads, since flags are recomputed on view over old rows.
  const matrixUnits = unitTypes.reduce((s, t) => s + (Number(t?.qty ?? t?.count) || 0), 0);
  const siteUnits = site?.totalUnits != null ? Number(site.totalUnits) : null;

  const rawConf = drawings.overallConfidence ?? site?.confidence ?? null;
  const conf = rawConf != null && Number.isFinite(Number(rawConf)) ? Number(rawConf) : null;
  if (conf != null && conf < LOW_CONFIDENCE) {
    flags.push(`The AI read has low confidence (${Math.round(conf * 100)}%) — verify the numbers against the drawings.`);
  }

  // The two reads disagreeing about the unit count is the single best tell
  // that one of them read the wrong table.
  if (matrixUnits > 0 && siteUnits != null && siteUnits > 0) {
    const diff = Math.abs(matrixUnits - siteUnits) / Math.max(matrixUnits, siteUnits);
    if (diff > 0.1) {
      flags.push(`Unit counts disagree: the unit matrix totals ${matrixUnits} but the site plan says ${siteUnits}. One of them is wrong — check which.`);
    }
  }

  if (matrixUnits === 0 && siteUnits == null) {
    flags.push('No unit count was found in any drawing — ask the submitter or count by hand.');
  }
  const totals = (drawings.projectTotals && typeof drawings.projectTotals === 'object') ? drawings.projectTotals : null;
  if (site?.grossSf == null && totals?.grossInteriorSf == null) {
    flags.push('No gross square footage was found — the $/SF math has nothing to stand on until this is filled in.');
  }
  if (site && site.parkingProvided == null && site.surfaceParking == null) {
    flags.push('No parking counts were found — site lighting cannot be sized yet.');
  }
  if (site?.surfaceParking != null && site?.parkingProvided != null
      && Number(site.surfaceParking) > Number(site.parkingProvided)) {
    flags.push(`Parking numbers conflict: ${site.surfaceParking} surface stalls but only ${site.parkingProvided} total provided.`);
  }

  // mergeProposals records cross-file disagreements it already had to referee:
  // { field, values: [{ value, file? }, ...] }
  const conflicts = Array.isArray(drawings.conflicts) ? drawings.conflicts : [];
  for (const c of conflicts) {
    if (!c?.field) continue;
    const vals = (Array.isArray(c.values) ? c.values : [])
      .map(v => (v?.file ? `${v.value} (${v.file})` : String(v?.value)))
      .join(' vs ');
    flags.push(`The uploaded files disagree on ${c.field}: ${vals}.`);
  }

  return flags;
}

/**
 * Every figure on a request that is far off what our real jobs of that
 * building type run (Mike, 2026-09-24). Reviewer-only — the sentences name our
 * ranges and job counts, which never go to the public page. `norms` is
 * loadFigureNorms(), `adopted` loadAdoptedGuesses(); the page or route that
 * has the database passes them in. A stand-in the tool worked out itself is
 * never checked against its own guess.
 */
export function figureReviewFlags(drawings, answers, norms, adopted = null) {
  let q;
  try { q = computeQuantities(drawings, answers, null, adopted); } catch { return []; }
  const rows = q || [];
  const val = (k) => rows.find(r => r.key === k)?.value ?? null;
  const site = (drawings?.siteData && typeof drawings.siteData === 'object') ? drawings.siteData : null;
  const ctx = {
    buildingType: answersToEngine(answers).buildingTypeKey ?? site?.buildingType ?? null,
    units: val('totalUnits'), grossSf: val('grossSf'),
  };
  const out = [];
  for (const r of rows) {
    const field = ROW_FIELD[r.key];
    if (!field || r.value == null || r.source === 'derived') continue;
    const a = figureAlert(field, r.value, ctx, norms, adopted);
    if (a) out.push(a.text);
  }
  return out;
}
