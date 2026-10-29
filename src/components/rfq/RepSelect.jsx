'use client';
import { useEffect, useState } from 'react';
import { rfqApi } from './rfqApi';

// Pick the rep for one or more manufacturers on this job (Mike 10-29). Used on
// the RFQs tab, the bid matrix and the quote screen. Reps who already sell the
// manufacturer come first; any other rep can be picked too, and the app links
// them to the manufacturer for this job's office.

let repsOnce = null;
function allReps() {
  repsOnce ||= fetch('/api/sales-reps').then((r) => (r.ok ? r.json() : { reps: [] })).then((d) => d.reps || []).catch(() => { repsOnce = null; return []; });
  return repsOnce;
}

export const SELECT = 'border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white';

export default function RepSelect({ projectId, manufacturerIds, linked = [], directName, placeholder = 'Change rep for this job…', onState, setErr, className = SELECT }) {
  const [reps, setReps] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { allReps().then(setReps); }, []);

  const linkedIds = new Set(linked.map((r) => r.id));
  const others = (reps || []).filter((r) => !linkedIds.has(r.id));

  async function pick(v) {
    setBusy(true); setErr?.('');
    const body = v === 'default' ? { action: 'pick', manufacturerIds, clear: true }
      : { action: 'pick', manufacturerIds, salesRepId: v === 'direct' ? null : v };
    const d = await rfqApi(`/api/projects/${projectId}/rfqs`, { method: 'POST', body, what: 'The rep pick' });
    setBusy(false);
    if (d.error) setErr?.(d.error); else onState?.(d);
  }

  return (
    <select className={className} value="" disabled={busy || !manufacturerIds.length} onChange={(e) => e.target.value && pick(e.target.value)} aria-label={placeholder}>
      <option value="">{busy ? 'Saving…' : placeholder}</option>
      {linked.length > 0 && (
        <optgroup label="Sells this manufacturer">
          {linked.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </optgroup>
      )}
      <optgroup label={reps ? 'Every other rep (links them)' : 'Loading reps…'}>
        {others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </optgroup>
      <option value="direct">{directName ? `Buy direct from ${directName}` : 'Buy direct'}</option>
      <option value="default">Back to the default</option>
    </select>
  );
}
