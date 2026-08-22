'use client';

import { useState, useEffect } from 'react';

const STATUS_CONFIG = {
  PENDING: { color: 'bg-amber-100 text-amber-700 border border-amber-200', label: 'Pending' },
  APPROVED: { color: 'bg-green-100 text-green-700 border border-green-200', label: 'Approved' },
  REJECTED: { color: 'bg-red-100 text-red-700 border border-red-200', label: 'Rejected' },
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The drawings a submitter sent are stored as JSON text written by the public
 * intake page, so nothing here may assume a shape. A bad payload must show as
 * "no drawings", never as a crashed review screen.
 */
function keptSheetsOf(submission) {
  try {
    const sheets = JSON.parse(submission?.rawPayload || '{}')?.drawings?.keptSheets;
    return Array.isArray(sheets) ? sheets.filter(s => s && typeof s.key === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The sheets we actually read, kept so a reviewer can check the numbers against
 * the drawing instead of taking the parser's word for it.
 *
 * These are compressed images of a handful of pages — the site plan, the code
 * summary, the unit matrix — not the GC's original 400 MB set, which is deleted
 * as soon as it has been read. Each thumbnail is fetched through a link that
 * expires in five minutes, so the links are requested when the submission is
 * opened rather than baked into the page.
 */
function KeptSheets({ submission }) {
  const sheets = keptSheetsOf(submission);
  const [urls, setUrls] = useState({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!sheets.length) return;
    let live = true;              // a reviewer can click through the list faster
    setUrls({});                  // than the links come back; late answers for a
    setFailed(false);             // submission we have left must be dropped.
    (async () => {
      const pairs = await Promise.all(sheets.map(async s => {
        try {
          const res = await fetch(`/api/admin/sheets?key=${encodeURIComponent(s.key)}`);
          if (!res.ok) return null;
          const { url } = await res.json();
          return url ? [s.key, url] : null;
        } catch {
          return null;
        }
      }));
      if (!live) return;
      const got = pairs.filter(Boolean);
      setUrls(Object.fromEntries(got));
      setFailed(got.length === 0);
    })();
    return () => { live = false; };
    // Keyed on the submission, not on `sheets` — a fresh array every render
    // would re-fetch every link forever.
  }, [submission.id]);                              // eslint-disable-line react-hooks/exhaustive-deps

  if (!sheets.length) return null;

  return (
    <div className="border-t border-slate-200 pt-4">
      <label className="block text-sm font-semibold text-slate-900 mb-1">
        Sheets we read ({sheets.length})
      </label>
      <p className="text-xs text-slate-500 mb-2">
        Compressed copies of the pages the parser looked at. The original upload is not kept.
      </p>
      {failed ? (
        <p className="text-xs text-slate-500">These sheets are no longer available.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {sheets.map(s => (
            <a
              key={s.key}
              href={urls[s.key] || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`block border border-slate-200 rounded overflow-hidden bg-slate-50 ${urls[s.key] ? 'hover:border-orange-400' : 'pointer-events-none opacity-60'}`}
            >
              {urls[s.key]
                ? <img src={urls[s.key]} alt={`Page ${s.page}`} className="w-full h-24 object-cover object-top" />
                : <div className="w-full h-24" />}
              <span className="block px-2 py-1 text-xs text-slate-600">
                Page {s.page}{s.file ? ` · ${s.file}` : ''}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IntakeClient({ submissions, clients, currentUser }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = submissions.find(s => s.id === selectedId);
  const [status, setStatus] = useState(selected?.status || 'PENDING');
  const [reviewNote, setReviewNote] = useState(selected?.reviewNote || '');
  const [clientId, setClientId] = useState(selected?.clientId || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/intake/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          reviewNote,
          clientId: clientId || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      
      setSelectedId(null);
      window.location.reload();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Conceptual Submissions</h1>

        <div className="grid grid-cols-3 gap-6">
          {/* List */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Submitted</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Company</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.map(s => (
                    <tr
                      key={s.id}
                      onClick={() => {
                        setSelectedId(s.id);
                        setStatus(s.status);
                        setReviewNote(s.reviewNote || '');
                        setClientId(s.clientId || '');
                      }}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedId === s.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-3 text-slate-600 text-xs">{fmtDate(s.createdAt)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.submitterName}</td>
                      <td className="px-4 py-3 text-slate-600">{s.submitterEmail}</td>
                      <td className="px-4 py-3 text-slate-600">{s.proposedName}</td>
                      <td className="px-4 py-3 text-slate-600">{s.buildingType || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_CONFIG[s.status].color}`}>
                          {STATUS_CONFIG[s.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Panel */}
          {selected && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Review Submission</h2>

              <div className="space-y-4">
                {/* Fields */}
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Name</label>
                  <p className="text-slate-600">{selected.submitterName}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Email</label>
                  <p className="text-slate-600">{selected.submitterEmail}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Company</label>
                  <p className="text-slate-600">{selected.proposedName}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Building Type</label>
                  <p className="text-slate-600">{selected.buildingType || '—'}</p>
                </div>

                <KeptSheets submission={selected} />

                <div className="border-t border-slate-200 pt-4">
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Link Client</label>
                  <select
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">None</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Review Note</label>
                  <textarea
                    value={reviewNote}
                    onChange={e => setReviewNote(e.target.value)}
                    placeholder="Internal notes..."
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>

                <div className="flex gap-2 pt-4 border-t border-slate-200">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
