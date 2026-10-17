/**
 * Server-only: the rows figureNorms() learns from, and the stand-in figures a
 * person has adopted. Kept out of figureNorms.js so a browser screen can import
 * the pure half without reaching the database (the 9-23 crash).
 *
 * Where each figure came from is ProjectFigureSource. A figure written before
 * that table existed (no row) is trusted as staff-entered, unless the project
 * was made from a web request, where it counts only if staff changed that
 * field afterwards (the project_data activity log's `changed` list).
 */
import { prisma } from '@/lib/db';
import { FIGURES, figureNorms, confirmedGuessMap } from './figureNorms.js';

const FIELDS = Object.keys(FIGURES);
const parse = (s) => { try { return JSON.parse(s || 'null'); } catch { return null; } };

export async function loadFigureRows() {
  const select = { numUnits: true };
  for (const f of FIELDS) select[f] = true;
  const projects = await prisma.project.findMany({
    where: { buildingType: { not: null } },
    select: {
      id: true, buildingType: true,
      projectData: { select },
      figureSources: { select: { field: true, source: true, confirmedAt: true } },
    },
  });
  const live = projects.filter(p => p.projectData?.numUnits > 0);

  const acts = await prisma.projectActivity.findMany({
    where: { projectId: { in: live.map(p => p.id) }, type: 'project_data', metadata: { not: null } },
    select: { projectId: true, metadata: true },
  });
  const fromWeb = new Set();
  const edited = new Map();
  for (const a of acts) {
    const m = parse(a.metadata);
    if (m?.source === 'intake') fromWeb.add(a.projectId);
    if (Array.isArray(m?.changed)) {
      if (!edited.has(a.projectId)) edited.set(a.projectId, new Set());
      for (const f of m.changed) edited.get(a.projectId).add(typeof f === 'string' ? f : f?.key ?? f?.field);
    }
  }

  return live.map(p => {
    const pd = p.projectData;
    const tagged = new Map(p.figureSources.map(s => [s.field, s]));
    const figures = {};
    for (const f of FIELDS) {
      if (pd[f] == null) continue;
      const t = tagged.get(f);
      const source = t ? t.source
        : !fromWeb.has(p.id) || edited.get(p.id)?.has(f) ? 'staff' : 'guess';
      figures[f] = { value: pd[f], source, confirmed: !!t?.confirmedAt };
    }
    return { id: p.id, buildingType: p.buildingType, units: pd.numUnits, grossSf: pd.grossSf, figures };
  });
}

// Five minutes of staleness is nothing next to how slowly finished jobs arrive.
const TTL_MS = 5 * 60 * 1000;
let normsCache = null;
let adoptedCache = null;

/** Stand-in figures people adopted: { [guessKey]: { [buildingType]: value } }. Never throws. */
export async function loadAdoptedGuesses() {
  if (adoptedCache && Date.now() - adoptedCache.at < TTL_MS) return adoptedCache.map;
  try {
    const rows = await prisma.confirmedGuess.findMany({ where: { archivedAt: null } });
    const map = confirmedGuessMap(rows);
    adoptedCache = { at: Date.now(), map };
    return map;
  } catch (e) {
    console.error('[adopted guesses] load failed (non-fatal):', e?.message ?? e);
    return adoptedCache?.map ?? {};
  }
}

/** figureNorms() over loadFigureRows(), cached. Never throws, {} on failure. */
export async function loadFigureNorms() {
  if (normsCache && Date.now() - normsCache.at < TTL_MS) return normsCache.norms;
  try {
    const norms = figureNorms(await loadFigureRows(), await loadAdoptedGuesses());
    normsCache = { at: Date.now(), norms };
    return norms;
  } catch (e) {
    console.error('[figure norms] load failed (non-fatal):', e?.message ?? e);
    return normsCache?.norms ?? {};
  }
}

/** Drop both caches, after a figure is adopted or marked right. */
export function forgetFigureCaches() { normsCache = null; adoptedCache = null; }
