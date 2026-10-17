'use client';
import { useState } from 'react';

export default function NewSubmissionModal({ projectId, tracker, onClose, onCreated }) {
  const [name,   setName]   = useState('');
  const [date,   setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Per-item spec overrides, optional
  const [specs, setSpecs] = useState(() =>
    (tracker?.items || []).map(item => {
      // Default to latest known version's spec
      const versions = [...(item.versions || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const latest = versions[0];
      return {
        itemId:       item.id,
        typeCode:     item.typeCode,
        manufacturer: latest?.manufacturer || '',
        modelNumber:  latest?.modelNumber  || '',
        include:      true, // whether this type is in this submission
      };
    })
  );

  function updateSpec(idx, field, value) {
    setSpecs(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');

    const includedSpecs = specs
      .filter(s => s.include)
      .map(s => ({ itemId: s.itemId, manufacturer: s.manufacturer, modelNumber: s.modelNumber }));

    const res = await fetch(`/api/projects/${projectId}/tracker/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), submittedDate: date, notes, specs: includedSpecs }),
    });

    if (!res.ok) { setError('Failed to create submission'); setSaving(false); return; }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">New Submission</h2>
            <p className="text-xs text-slate-500 mt-0.5">Records what was submitted and when, reviews are added separately</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">
            {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            {/* Submission meta */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Submission Name *</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. 265100-001.0, Aug 2025, or Submission 1"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Date Submitted</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes (optional)</label>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any context about this submission"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Per-type specs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fixture Specs in This Submission</p>
                <p className="text-xs text-slate-500">Update if spec changed from prior submission</p>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 w-8"><input type="checkbox" checked className="accent-amber-500" readOnly /></th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-16">Type</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Manufacturer</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Catalog / Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specs.map((s, i) => (
                      <tr key={s.itemId} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={s.include}
                            onChange={e => updateSpec(i, 'include', e.target.checked)}
                            className="accent-amber-500"
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{s.typeCode}</td>
                        <td className="px-3 py-2">
                          <input
                            value={s.manufacturer}
                            onChange={e => updateSpec(i, 'manufacturer', e.target.value)}
                            disabled={!s.include}
                            className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-500 disabled:bg-slate-50 disabled:text-slate-300"
                            placeholder="Manufacturer"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={s.modelNumber}
                            onChange={e => updateSpec(i, 'modelNumber', e.target.value)}
                            disabled={!s.include}
                            className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-500 disabled:bg-slate-50 disabled:text-slate-300"
                            placeholder="Catalog #"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between sticky bottom-0 bg-white">
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-600">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors shadow-sm disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create Submission'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
