/**
 * Server-only: stamp where ProjectData figures came from (ProjectFigureSource),
 * so the tool learns only from real numbers (Mike 2026-09-24). A new value
 * clears any earlier "It's right" — the person checked the old number.
 * Never throws: losing a tag must not lose the save it rides on.
 */
import { FIGURES } from '@/lib/calibration/figureNorms';

export async function recordFigureSources(db, projectId, fields, source, userId = null) {
  const list = [...new Set(fields || [])].filter(f => FIGURES[f]);
  if (!projectId || !list.length) return;
  try {
    for (const field of list) {
      await db.projectFigureSource.upsert({
        where: { projectId_field: { projectId, field } },
        update: { source, setById: userId, setAt: new Date(), confirmedAt: null, confirmedById: null },
        create: { projectId, field, source, setById: userId },
      });
    }
  } catch (e) {
    console.error('[figure sources] tag failed (non-fatal):', e?.message ?? e);
  }
}
