'use client';
/**
 * Sales tax on the summary page.
 *
 * Mike 2026-09-05: "add a sales tax field to the final summary page to allow the
 * user to add it in manually."
 *
 * The rate lives on ProjectData.salesTaxPct as a DECIMAL (0.0825 = 8.25%), the
 * same field the Project Data step and the peer-review matrix already read, so
 * setting it here changes the budget everywhere. The engine applies it to the
 * lighting and controls product subtotals (never to freight/warehousing).
 *
 * Manual entry only. A look-up-by-ZIP helper was built and then pulled the same
 * day (Mike: "Forget the sales tax lookup for now. Put in the roadmap."), see
 * ROADMAP.md → Budget Summary → Sales Tax Rate Lookup.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

function pctLabel(decimal) {
  const p = Math.round((decimal || 0) * 10000) / 100;
  return `${p}%`;
}

export default function SalesTaxWidget({ projectId, initialPct, taxAmount }) {
  const router = useRouter();
  const [pct, setPct]         = useState(initialPct ?? 0);        // decimal
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(initialPct ? String(Math.round(initialPct * 10000) / 100) : '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const raw = String(draft).trim();
      const val = raw === '' ? 0 : parseFloat(raw);
      if (isNaN(val) || val < 0 || val > 25) {
        setError('Sales tax must be 0 to 25%');
        setSaving(false);
        return;
      }
      const decimal = Math.round(val * 10000) / 1000000;
      const res = await fetch(`/api/projects/${projectId}/data`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesTaxPct: decimal }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      setPct(decimal);
      setEditing(false);
      router.refresh();   // the totals above are server-rendered, pull the new budget
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(pct ? String(Math.round(pct * 10000) / 100) : '');
    setEditing(false);
    setError(null);
  }

  return (
    <div className="print:hidden">
      {!editing && pct === 0 ? (
        <button
          onClick={() => { setEditing(true); setDraft(''); }}
          className="text-right text-xs text-slate-500 hover:text-slate-700 font-semibold transition-colors"
        >
          + Add sales tax %
        </button>
      ) : !editing ? (
        <div className="text-sm text-slate-600">
          Sales tax ({pctLabel(pct)}) +${Number(taxAmount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          <span className="text-xs text-slate-400">, included in the totals above</span>
          <button
            onClick={() => { setEditing(true); setDraft(String(Math.round(pct * 10000) / 100)); }}
            className="ml-2 text-xs text-slate-500 hover:text-slate-700 font-semibold transition-colors"
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min="0"
              max="25"
              step="0.01"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="8.25"
              autoFocus
              className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <span className="text-xs text-slate-500">% sales tax</span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg disabled:opacity-40 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleCancel} className="text-xs text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      )}
    </div>
  );
}
