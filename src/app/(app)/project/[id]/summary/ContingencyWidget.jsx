'use client';

import { useState } from 'react';

export default function ContingencyWidget({ projectId, baseBudget, initialPct }) {
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
        setError('Contingency must be 0–50%');
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

  const contingencyAmount = baseBudget * (pct / 100);
  const totalWithContingency = baseBudget + contingencyAmount;

  return (
    <div className="print:hidden">
      {pct === 0 && !editing ? (
        <button
          onClick={() => {
            setEditing(true);
            setDraft('');
          }}
          className="text-right text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
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
            className="ml-2 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
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
            className="w-16 px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <span className="text-xs text-slate-500">%</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1 bg-slate-800 text-white rounded disabled:opacity-40 transition-opacity"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      ) : null}
    </div>
  );
}
