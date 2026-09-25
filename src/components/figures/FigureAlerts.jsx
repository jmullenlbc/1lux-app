'use client';
// On-screen alerts when a budget figure is far off what our real jobs of that
// building type run (Mike 2026-09-24: "alert notifications at a line level …
// on screen or it will be overwhelming"). Staff only — the API 404s for a
// contractor, and then nothing shows. Never on the public page, PDF or portal.
import { useCallback, useEffect, useState } from 'react';
import { figureAlert, FIGURES } from '@/lib/calibration/figureNorms';
import { parseLooseNumber } from '@/lib/numberInput';

/**
 * alertFor(field, value, ctx) → alert or null. ctx = { buildingType, units, grossSf }.
 * markRight(field) posts "It's right" — only for a saved figure.
 */
export function useFigureAlerts(projectId) {
  const [data, setData] = useState(null);
  const [confirmed, setConfirmed] = useState(() => new Set());

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    fetch(`/api/projects/${projectId}/figures`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (live && j) { setData(j); setConfirmed(new Set(j.confirmed || [])); } })
      .catch(() => {});
    return () => { live = false; };
  }, [projectId]);

  const alertFor = useCallback((field, value, ctx) => {
    if (!data || !FIGURES[field] || confirmed.has(field)) return null;
    const n = parseLooseNumber(value);
    if (!Number.isFinite(n)) return null;
    const c = {
      buildingType: ctx?.buildingType || data.buildingType,
      units: parseLooseNumber(ctx?.units), grossSf: parseLooseNumber(ctx?.grossSf),
    };
    return figureAlert(field, n, c, data.norms, data.adopted);
  }, [data, confirmed]);

  const markRight = useCallback(async (field) => {
    setConfirmed(s => new Set(s).add(field));
    const res = await fetch(`/api/projects/${projectId}/figures`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field }),
    }).catch(() => null);
    if (!res?.ok) setConfirmed(s => { const n = new Set(s); n.delete(field); return n; });
  }, [projectId]);

  // A changed figure has not been checked yet — the server clears it on save too.
  const forget = useCallback((field) => {
    setConfirmed(s => { if (!s.has(field)) return s; const n = new Set(s); n.delete(field); return n; });
  }, []);

  return { ready: !!data, alertFor, markRight, forget };
}

/** The amber note under one field. `saved` false = typed but not saved yet. */
export function FigureAlertNote({ alert, saved = true, onRight }) {
  if (!alert) return null;
  return (
    <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
      <span aria-hidden>⚠</span>
      <span className="flex-1">{alert.text}</span>
      {saved ? (
        <button type="button" onClick={onRight}
          className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-700 hover:bg-amber-100">
          It&apos;s right
        </button>
      ) : (
        <span className="shrink-0 italic text-amber-600">Save, then confirm</span>
      )}
    </div>
  );
}

/** "N figures look off" at the top of a form. */
export function FigureAlertSummary({ count }) {
  if (!count) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      ⚠ {count} figure{count === 1 ? '' : 's'} look{count === 1 ? 's' : ''} off against our past jobs — see the notes below each one.
    </div>
  );
}
