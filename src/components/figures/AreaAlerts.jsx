'use client';
// On-screen alerts per building area of the budget (Mike 2026-09-24: "do it
// by area of the building … out of whack or totally off from the
// questionnaire they answered originally"). Staff only — the API 404s for a
// contractor, and then nothing shows. Never on the public form, PDF or portal:
// BudgetSidebar only renders what it is handed and imports none of this.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { areaAlerts, areaDollars } from '@/lib/calibration/areaNorms';

/** Returns { notes: { [area]: <AreaAlertNote/> }, summary: <AreaAlertSummary/> | null }. */
export function useAreaAlerts(projectId, budget, ctx) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    fetch(`/api/projects/${projectId}/areas`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (live && j) setData(j); })
      .catch(() => {});
    return () => { live = false; };
  }, [projectId]);

  const dollars = useMemo(() => areaDollars(budget), [budget]);
  const units = Number(ctx?.units) || 0;
  const buildingType = ctx?.buildingType || data?.buildingType;
  const alerts = useMemo(
    () => (data ? areaAlerts(dollars, { buildingType, units }, data.norms, data.checks) : {}),
    [data, dollars, buildingType, units],
  );

  const markRight = useCallback(async (area) => {
    const amount = dollars[area];
    const prev = data?.checks?.[area];
    setData(d => ({ ...d, checks: { ...d.checks, [area]: { ...d.checks?.[area], okAmount: amount } } }));
    const res = await fetch(`/api/projects/${projectId}/areas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area, amount }),
    }).catch(() => null);
    if (!res?.ok) setData(d => ({ ...d, checks: { ...d.checks, [area]: prev } }));
  }, [projectId, dollars, data]);

  const notes = {};
  for (const [area, list] of Object.entries(alerts)) {
    notes[area] = <AreaAlertNote alerts={list} onRight={() => markRight(area)} />;
  }
  const count = Object.keys(alerts).length;
  return { notes, summary: count ? <AreaAlertSummary count={count} /> : null };
}

export function AreaAlertNote({ alerts, onRight }) {
  if (!alerts?.length) return null;
  return (
    <div className="mb-1.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
      <span aria-hidden>⚠</span>
      <div className="flex-1 space-y-1">
        {alerts.map(a => <p key={a.kind}>{a.text}</p>)}
      </div>
      <button type="button" onClick={onRight}
        className="shrink-0 rounded-md border border-amber-300 bg-white px-1.5 py-0.5 font-semibold text-amber-700 hover:bg-amber-100">
        It&apos;s right
      </button>
    </div>
  );
}

export function AreaAlertSummary({ count }) {
  return (
    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
      ⚠ {count} area{count === 1 ? '' : 's'} look{count === 1 ? 's' : ''} off — against our past jobs or the original questionnaire. Notes below.
    </div>
  );
}
