/**
 * Web budget request → project hand-off.
 *
 * Mike, 2026-09-16: "Anything that comes through the conceptual budget should
 * input into the project. Shouldn't those fields really be the same really?"
 *
 * They are the same. The public estimate already builds a `projectData` object
 * whose keys ARE the ProjectData columns, a `sections` object in the shape the
 * internal wizard saves, and site features in the shape of SiteFeature rows.
 * "This is a new job" simply never wrote them down — the new project opened
 * blank and somebody retyped the request. This does the writing.
 *
 * planHandoff() is pure (no database) so the mapping is unit-tested;
 * applyHandoff() does the writes. Staff-only, server-side: it uses the FULL
 * estimate, never the public projection.
 */
import { computeIntakeEstimate } from './estimate.js';
import { SITE_FEATURE_ROW_KEYS } from '../siteFeatureWords.js';
import { parseLooseNumber } from '../numberInput.js';

/** ProjectData columns the estimate's projectData object carries, as-is. */
const FLOAT_COLUMNS = [
  'grossSf', 'unitsSf', 'corridorSf', 'interiorAmenitySf', 'exteriorAmenitySf',
  'garageSf', 'bohSf', 'lotSf', 'buildingFootprintSf',
];
const INT_COLUMNS = [
  'numUnits', 'numBuildings', 'numBalconies', 'numVanities', 'numBathrooms', 'numFans',
  'numEgressStairwells', 'numSurfaceParking', 'numCarports', 'numGarages',
];
/** Takeoff rows that have a ProjectData column but are not engine inputs. */
const EXTRA_INT_ROWS = { bedrooms: 'numBedrooms', stories: 'numFloors', exitDoors: 'numExteriorDoors' };
/** Homes site lengths (0114): read or typed only, never a guess. */
const EXTRA_FLOAT_ROWS = { driveLengthFt: 'driveLengthFt', walkwayLengthFt: 'walkwayLengthFt' };

/** Columns the wizard's Project Data step mirrors as questionnaire rows. */
const NOT_MIRRORED = new Set(['numFloors']);

/** ProjectData column → the takeoff row it came from (estimate.js projectData). */
const COLUMN_ROW = {
  grossSf: 'grossSf', unitsSf: 'unitsSf', numUnits: 'totalUnits', numBalconies: 'balconies',
  numVanities: 'vanities', numBathrooms: 'bathrooms', numFans: 'ceilingFans', corridorSf: 'corridorSf',
  interiorAmenitySf: 'interiorAmenitySf', exteriorAmenitySf: 'exteriorAmenitySf', garageSf: 'garageSf',
  bohSf: 'bohSf', numEgressStairwells: 'stairLandings', numBuildings: 'buildings',
  numSurfaceParking: 'surfaceParking', numCarports: 'carports', numGarages: 'garages',
  lotSf: 'lotSf', buildingFootprintSf: 'buildingFootprintSf',
  numBedrooms: 'bedrooms', numFloors: 'stories', numExteriorDoors: 'exitDoors',
  driveLengthFt: 'driveLengthFt', walkwayLengthFt: 'walkwayLengthFt',
};
/**
 * Where a figure came from, for ProjectFigureSource (Mike 2026-09-24: learn
 * only from real numbers). Read off the drawings = drawing; typed by the
 * visitor = client (learned from only when in the normal range); worked out
 * by the tool = guess (never learned from).
 */
const ROW_SOURCE = { drawing: 'drawing', questionnaire: 'client', derived: 'guess' };

const finite = v => { const n = parseLooseNumber(v); return Number.isFinite(n) ? n : null; };

/**
 * What to write for one request.
 * @returns {{ready: boolean, data: object, sources: object, features: Array, responses: Array, total: ?number}}
 *   data      — ProjectData columns (only figures we actually have)
 *   sources   — { column: 'drawing' | 'client' | 'guess' } for each of data
 *   features  — [{type, count, lengthFt, source: 'drawing'|'typed'}]
 *   responses — [{section, questionKey, answerValue}] for QuestionnaireResponse
 *   buildingTypeKey — the project's own building-type key ('garden', 'podium', …)
 *   total     — the budget the visitor was shown, for the activity line
 */
export function planHandoff({ answers, drawings, pricing = null, adopted = null }) {
  const est = computeIntakeEstimate({ answers, drawings, pricing, adopted });
  if (!est.projectData) return { ready: false, data: {}, sources: {}, features: [], responses: [], buildingTypeKey: null, total: null };

  const bySource = {};
  const byValue = {};
  const byAssumed = {};
  for (const r of est.quantities) { bySource[r.key] = r.source; byValue[r.key] = r.value; byAssumed[r.key] = r.assumed === true; }

  const data = {};
  for (const col of FLOAT_COLUMNS) {
    const v = finite(est.projectData[col]);
    if (v !== null && v >= 0) data[col] = v;
  }
  for (const col of INT_COLUMNS) {
    const v = finite(est.projectData[col]);
    if (v !== null && v >= 0) data[col] = Math.round(v);
  }
  for (const [rowKey, col] of Object.entries(EXTRA_INT_ROWS)) {
    const v = finite(byValue[rowKey]);
    if (v !== null && v > 0) data[col] = Math.round(v);
  }
  for (const [rowKey, col] of Object.entries(EXTRA_FLOAT_ROWS)) {
    const v = finite(byValue[rowKey]);
    if (v !== null && v > 0 && (bySource[rowKey] === 'drawing' || bySource[rowKey] === 'questionnaire')) data[col] = v;
  }
  // 0 fans means "the engine decides from the fan answer", not "no fans".
  if (data.numFans === 0) delete data.numFans;

  const sources = {};
  for (const col of Object.keys(data)) sources[col] = ROW_SOURCE[bySource[COLUMN_ROW[col]]] || 'guess';

  const features = (est.projectData.siteFeatures || []).map(f => ({
    type: f.type, count: f.count ?? null, lengthFt: f.lengthFt ?? null,
    source: bySource[SITE_FEATURE_ROW_KEYS[f.type]] === 'drawing' ? 'drawing' : 'typed',
    ...(byAssumed[SITE_FEATURE_ROW_KEYS[f.type]] ? { lengthAssumed: true } : {}),
  }));

  // The questionnaire answers, in the wizard's own (section, key, value) rows,
  // plus the Project Data figures the wizard mirrors under 'project-data'.
  const responses = [];
  for (const [section, fields] of Object.entries(est.sections || {})) {
    for (const [questionKey, value] of Object.entries(fields || {})) {
      if (value === null || value === undefined || value === '') continue;
      responses.push({ section, questionKey, answerValue: String(value) });
    }
  }
  for (const [col, v] of Object.entries(data)) {
    if (NOT_MIRRORED.has(col)) continue;
    responses.push({ section: 'project-data', questionKey: col, answerValue: String(v) });
  }

  return { ready: true, data, sources, features, responses, buildingTypeKey: est.projectData.buildingTypeKey || null, total: finite(est.budget?.totalWithControls) };
}

/** The drawings read stored on a submission, or null. Never throws. */
export function drawingsFromSubmission(submission) {
  try {
    const d = JSON.parse(submission?.rawPayload || 'null')?.drawings;
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
}

/**
 * Write a plan onto a (new) project. One transaction — all of it lands or none.
 * `writeSiteFeature` is passed in so this file stays importable by plain-node tests.
 */
export async function applyHandoff(prisma, projectId, plan, { writeSiteFeature }) {
  if (!plan?.ready) return { fields: 0, features: 0, answers: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.projectData.upsert({
      where: { projectId },
      update: plan.data,
      create: { projectId, ...plan.data },
    });
    for (const r of plan.responses) {
      await tx.questionnaireResponse.upsert({
        where: { projectId_section_questionKey: { projectId, section: r.section, questionKey: r.questionKey } },
        update: { answerValue: r.answerValue },
        create: { projectId, ...r },
      });
    }
    for (const f of plan.features) await writeSiteFeature(tx, projectId, f);
    for (const [field, source] of Object.entries(plan.sources || {})) {
      await tx.projectFigureSource.upsert({
        where: { projectId_field: { projectId, field } },
        update: { source, setById: null, setAt: new Date(), confirmedAt: null, confirmedById: null },
        create: { projectId, field, source },
      });
    }
  }, { timeout: 20_000 });
  return { fields: Object.keys(plan.data).length, features: plan.features.length, answers: plan.responses.filter(r => r.section !== 'project-data').length };
}
