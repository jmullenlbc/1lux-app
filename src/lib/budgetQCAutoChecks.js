// Auto-check logic for the Budget QC checklist.
// Runs server-side on every GET. Results are not cached.
// Returns { [itemKey]: { status: 'pass'|'warn', detail: string } }

import { NOT_CO_VERSION } from '@/lib/budgetVersions';

const DRIFT_THRESHOLD = 0.15; // 15%

export async function runAutoChecks(projectId, prisma) {
  const results = {};

  // Load latest matrix items
  const matrix = await prisma.designBidMatrix.findFirst({
    where:   { projectId, ...NOT_CO_VERSION },
    orderBy: { version: 'desc' },
    include: { items: { where: { isArchived: false } } },
  });

  const items = matrix?.items ?? [];

  // ── 1. Emergency / life safety fixtures ──────────────────────────────────
  const emergencyTypes = items.filter(i =>
    /emergency|exit sign|life safety|egress/i.test(i.description || '')
  );
  results['auto_emergency'] = emergencyTypes.length > 0
    ? { status: 'pass', detail: `${emergencyTypes.length} emergency/life safety type${emergencyTypes.length !== 1 ? 's' : ''} found` }
    : { status: 'warn', detail: 'No emergency or life safety fixtures found, verify scope' };

  // ── 2. Controls & commissioning line ─────────────────────────────────────
  const controlsTypes = items.filter(i =>
    /control|dimm|commission|switch|sensor|daylight/i.test(i.description || '') ||
    i.locationTag === 'Controls'
  );
  results['auto_controls'] = controlsTypes.length > 0
    ? { status: 'pass', detail: `Controls line found (${controlsTypes.length} item${controlsTypes.length !== 1 ? 's' : ''})` }
    : { status: 'warn', detail: 'No controls or commissioning line found, click to acknowledge if out of scope' };

  // ── 3. Quantity drift vs previous version ─────────────────────────────────
  if (matrix && matrix.version > 1) {
    const prev = await prisma.designBidMatrix.findFirst({
      where:   { projectId, version: { lt: matrix.version }, ...NOT_CO_VERSION },
      orderBy: { version: 'desc' },
      include: { items: { where: { isArchived: false } } },
    });
    if (prev?.items?.length) {
      let maxDrift = 0;
      let maxDriftType = '';
      for (const item of items) {
        const prevItem = prev.items.find(p => p.type === item.type);
        if (prevItem?.qty && item.qty) {
          const drift = Math.abs((item.qty - prevItem.qty) / prevItem.qty);
          if (drift > maxDrift) { maxDrift = drift; maxDriftType = item.type; }
        }
      }
      results['auto_qty_drift'] = maxDrift > DRIFT_THRESHOLD
        ? { status: 'warn', detail: `${maxDriftType} qty changed ${Math.round(maxDrift * 100)}% vs v${prev.version}, review before sending` }
        : { status: 'pass', detail: maxDrift > 0 ? `Max qty delta ${Math.round(maxDrift * 100)}% (${maxDriftType}), within 15%` : 'No qty changes vs last version' };
    } else {
      results['auto_qty_drift'] = { status: 'pass', detail: 'No previous version to compare' };
    }
  } else {
    results['auto_qty_drift'] = { status: 'pass', detail: 'First version, no drift check needed' };
  }

  // ── 4. Price drift vs previous version ───────────────────────────────────
  if (matrix && matrix.version > 1) {
    const prev = await prisma.designBidMatrix.findFirst({
      where:   { projectId, version: { lt: matrix.version }, ...NOT_CO_VERSION },
      orderBy: { version: 'desc' },
      include: { items: { where: { isArchived: false } } },
    });
    if (prev?.items?.length) {
      let maxDrift = 0;
      let maxDriftType = '';
      for (const item of items) {
        const prevItem = prev.items.find(p => p.type === item.type);
        if (prevItem?.cnPerUnit && item.cnPerUnit) {
          const drift = Math.abs((item.cnPerUnit - prevItem.cnPerUnit) / prevItem.cnPerUnit);
          if (drift > maxDrift) { maxDrift = drift; maxDriftType = item.type; }
        }
      }
      results['auto_price_drift'] = maxDrift > DRIFT_THRESHOLD
        ? { status: 'warn', detail: `${maxDriftType} price changed ${Math.round(maxDrift * 100)}% vs v${prev.version}, review before sending` }
        : { status: 'pass', detail: maxDrift > 0 ? `Max price delta ${Math.round(maxDrift * 100)}% (${maxDriftType}), within 15%` : 'No price changes vs last version' };
    } else {
      results['auto_price_drift'] = { status: 'pass', detail: 'No previous version to compare' };
    }
  } else {
    results['auto_price_drift'] = { status: 'pass', detail: 'First version, no drift check needed' };
  }

  return results;
}
