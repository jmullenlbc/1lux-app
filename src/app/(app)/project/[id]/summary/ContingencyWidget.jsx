'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// The amount and total come from the engine (5% of the lighting product
// subtotal, same as the breakdown and the PDF); saving refreshes the page so
// every number moves together (Mike 10-17: this used to change nothing).
export default function ContingencyWidget({ projectId, initialPct, amount = 0, total = 0 }) {
  const router = useRouter();
  const [pct, setPct] = useState(initialPct ?? 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(pct));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const val = parseFloat(draft);
      if (isNaN(val) || val < 0 || val > 50) {
        setError('Contingency must be 0 to 50%');
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/data`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contingencyPct: val }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      setPct(val);
      setDraft(String(val));
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(String(pct));
    setEditing(false);
    setError(null);
  }

  const contingencyAmount = amount;
  const totalWithContingency = total;

  return (
    <div className="print:hidden">
      {pct === 0 && !editing ? (
        <button
          onClick={() => {
            setEditing(true);
            setDraft('');
          }}
          className="text-right text-xs text-slate-500 hover:text-slate-700 font-semibold transition-colors"
        >
          + Add contingency %
        </button>
      ) : pct > 0 && !editing ? (
        <div className="text-sm text-slate-600">
          Contingency ({pct}%) +${contingencyAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })} → Total: ${totalWithContingency.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          <button
            onClick={() => {
              setEditing(true);
              setDraft(String(pct));
            }}
            className="ml-2 text-xs text-slate-500 hover:text-slate-700 font-semibold transition-colors"
          >
            Edit
          </button>
        </div>
      ) : editing ? (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <span className="text-xs text-slate-500">%</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg disabled:opacity-40 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      ) : null}
    </div>
  );
}
