/**
 * SiteFeature rows ⇄ the engine's `projectData.siteFeatures` seam.
 *
 * SERVER-ONLY (talks to Prisma). The pure pricing / shape helpers live in
 * siteFeatures.js; this file is the plumbing between the SiteFeature table
 * (migration 0089) and the places that call calculateBudget.
 *
 * Every reader of a project that prices it must:
 *   1. include `SITE_FEATURE_INCLUDE` (or `SITE_FEATURE_SELECT` on a select),
 *   2. build its projectData with `engineProjectData(project)`.
 * The archive filter in src/lib/archive.js does NOT reach nested includes, so
 * the `archivedAt: null` lives here, once, rather than in fifteen call sites.
 *
 * Writes go through `writeSiteFeature`: archive the live row(s) of that kind,
 * then create the new one. A value of 0 archives and creates nothing, that is
 * how "none" is recorded (Mike: no guess when absent; 0 unless found or typed).
 */
import {
  SITE_FEATURE_TYPES, LINEAR_SITE_FEATURES, SITE_FEATURE_LABELS,
  SITE_FEATURE_TYPE_BY_ROW_KEY, SITE_FEATURE_ROW_KEYS, LEGACY_COURTYARD_FT_KEY, courtyardsFromFt,
} from './siteFeatures.js';
import { parseLooseNumber } from './numberInput.js';

const LIVE = { where: { archivedAt: null }, orderBy: { createdAt: 'asc' } };

export const SITE_FEATURE_INCLUDE = { siteFeatures: LIVE };
export const SITE_FEATURE_SELECT  = {
  siteFeatures: { ...LIVE, select: { type: true, count: true, lengthFt: true, lengthAssumed: true, sheet: true, source: true, label: true } },
};

/** Live SiteFeature rows → the engine array. Tolerates a project loaded without the include. */
export function siteFeaturesForEngine(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(r => r && !r.archivedAt && SITE_FEATURE_TYPES.includes(r.type))
    .map(r => ({
      type: r.type,
      count: r.count ?? null,
      lengthFt: r.lengthFt ?? null,
      sheet: r.sheet ?? null,
      source: r.source ?? null,
      label: r.label ?? null,
      ...(r.lengthAssumed === true ? { lengthAssumed: true } : {}),
    }));
}

/** The projectData object every calculateBudget caller builds, with site features attached. */
export function engineProjectData(project) {
  return {
    ...(project?.projectData || {}),
    buildingTypeKey: project?.buildingType,
    siteFeatures: siteFeaturesForEngine(project?.siteFeatures),
  };
}

/** Load the live rows for one project (for routes that did not include them). */
export async function loadSiteFeatures(client, projectId) {
  return client.siteFeature.findMany({ where: { projectId, archivedAt: null }, orderBy: { createdAt: 'asc' } });
}

/**
 * Turn a flat grid/commit value into the row shape for its kind.
 * The linear kind (turf play) takes feet; the rest, courtyards included, take a count.
 * @returns {{ type, count, lengthFt } | null} null when the key is not a site feature.
 */
export function siteFeatureFromFlat(key, value) {
  const type = SITE_FEATURE_TYPE_BY_ROW_KEY[key];
  if (!type) return null;
  const raw = parseLooseNumber(value);        // "1,200" ft is fine
  if (!Number.isFinite(raw) || raw < 0) return null;
  // The old courtyard box sent feet; courtyards are a count now (Mike 10-14).
  const n = key === LEGACY_COURTYARD_FT_KEY ? courtyardsFromFt(raw) : raw;
  return LINEAR_SITE_FEATURES.has(type)
    ? { type, count: n > 0 ? 1 : 0, lengthFt: Math.round(n) }
    : { type, count: Math.round(n), lengthFt: null };
}

/** Is this a flat site-feature row key (`dogParks`, `courtyardFt`, …)? */
export function isSiteFeatureRowKey(key) {
  return Object.prototype.hasOwnProperty.call(SITE_FEATURE_TYPE_BY_ROW_KEY, key);
}

/**
 * Archive the live row(s) of this kind and write the new one.
 * `client` may be a transaction. Returns the created row, or null when the
 * value was 0 (archived only, "none").
 */
export async function writeSiteFeature(client, projectId, { type, count = null, lengthFt = null, source, sheet = null, label = null, lengthAssumed = false }) {
  if (!SITE_FEATURE_TYPES.includes(type)) throw new Error(`Unknown site feature type: ${type}`);
  await client.siteFeature.updateMany({
    where: { projectId, type, archivedAt: null },
    data:  { archivedAt: new Date() },
  });
  const linear = LINEAR_SITE_FEATURES.has(type);
  const present = linear ? Number(lengthFt) > 0 : Number(count) > 0;
  if (!present) return null;
  return client.siteFeature.create({
    data: {
      projectId, type, source,
      count:    linear ? 1 : Math.round(Number(count)),
      lengthFt: linear ? Math.round(Number(lengthFt)) : null,
      lengthAssumed: linear && lengthAssumed === true,
      sheet:    Number.isFinite(Number(sheet)) && sheet !== null ? Math.round(Number(sheet)) : null,
      label:    label ? String(label).slice(0, 200) : SITE_FEATURE_LABELS[type],
    },
  });
}

/** Activity-log wording for a change to one kind: "# Dog Parks: 0 → 1". */
export function describeSiteFeatureChange(type, before, after) {
  const linear = LINEAR_SITE_FEATURES.has(type);
  const was = linear ? (before?.lengthFt ?? 0) : (before?.count ?? 0);
  const now = linear ? (after?.lengthFt ?? 0)  : (after?.count ?? 0);
  const unit = linear ? ' ft' : '';
  return { type, key: SITE_FEATURE_ROW_KEYS[type], was, now, text: `${SITE_FEATURE_LABELS[type]}: ${was}${unit} → ${now}${unit}` };
}
