'use client';
import { useState } from 'react';
import { statusMeta } from './SubmittalTrackerClient';

const ROLE_LABELS = {
  ILC: 'ILC Studios', Developer: 'Developer', Architect: 'Architect',
  LA: 'Landscape Architect', ID: 'Interior Designer', EE: 'Electrical Engineer',
  GC: 'General Contractor', EC: 'Electrical Contractor',
};

const STATUS_OPTIONS = [
  { value: 'Approved',        label: '✅ Approved' },
  { value: 'ApprovedAsNoted', label: '✅ Approved as Noted' },
  { value: 'Resubmit',        label: '🔴 Resubmit' },
  { value: 'NoAction',        label: '⬜ No Action' },
];

function StatusPill({ status }) {
  const m = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// Inline form to add a review
function AddReviewForm({ versionId, roles, onAdd, onCancel }) {
  const [role,     setRole]     = useState(roles[0] || 'ILC');
  const [name,     setName]     = useState('');
  const [status,   setStatus]   = useState('Approved');
  const [date,     setDate]     = useState(new Date().toISOString().split('T')[0]);
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const ok = await onAdd(versionId, { reviewerRole: role, reviewerName: name, status, dateNoted: date, notes });
    if (ok) { setNotes(''); setName(''); }
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5 mt-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Reviewer</label>
          <select value={role} onChange={e => setRole(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400 bg-white">
            {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400 bg-white">
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Name (optional)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Reviewer name"
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400" />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="Comments, conditions, questions…"
          className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400 resize-none" />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
        <button type="submit" disabled={saving}
          className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : 'Add Review'}
        </button>
      </div>
    </form>
  );
}

export default function TrackerPanel({ item, submissions, roles, projectId, onClose, onAddReview, onDeleteReview }) {
  const [addingToVersionId, setAddingToVersionId] = useState(null);

  // Sort versions newest-first
  const allVersions = [...(item.versions || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  // Detect spec changes between adjacent versions (oldest first for comparison)
  const chronological = [...allVersions].reverse();
  const specChangedAt = new Set();
  for (let i = 1; i < chronological.length; i++) {
    const prev = chronological[i - 1];
    const curr = chronological[i];
    if (prev.manufacturer !== curr.manufacturer || prev.modelNumber !== curr.modelNumber) {
      specChangedAt.add(curr.id);
    }
  }

  function fmtDate(str) {
    if (!str) return '';
    return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  return (
    <div className="w-[400px] shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold text-slate-800">{item.typeCode}</p>
          {item.description && (
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>
          )}
          {item.location && (
            <p className="text-[10px] text-slate-300 uppercase tracking-wide mt-1">{item.location}</p>
          )}
        </div>
        <button onClick={onClose}
          className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 mt-0.5">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Submission history — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {allVersions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <p className="text-sm text-slate-400">No submissions yet</p>
            <p className="text-xs text-slate-300 mt-1">Create a submission to start tracking reviews</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {allVersions.map((ver, idx) => {
              const isLatest  = idx === 0;
              const changed   = specChangedAt.has(ver.id);
              const isAdding  = addingToVersionId === ver.id;

              return (
                <div key={ver.id} className="px-5 py-4 space-y-3">
                  {/* Submission label + spec */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-700">
                        {ver.submission?.name || 'Submission'}
                      </span>
                      {ver.submission?.submittedDate && (
                        <span className="text-xs text-slate-400">· {fmtDate(ver.submission.submittedDate)}</span>
                      )}
                      {isLatest && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-600">
                          Latest
                        </span>
                      )}
                      {changed && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-600">
                          ⚠ Spec changed
                        </span>
                      )}
                    </div>
                    {(ver.manufacturer || ver.modelNumber) && (
                      <p className="text-xs text-slate-500 mt-1">
                        <span className="font-medium">{ver.manufacturer}</span>
                        {ver.modelNumber && <span className="text-slate-400"> · {ver.modelNumber}</span>}
                      </p>
                    )}
                  </div>

                  {/* Reviews */}
                  {ver.reviews.length > 0 ? (
                    <div className="space-y-2">
                      {[...ver.reviews]
                        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                        .map(rev => (
                          <div key={rev.id} className="flex items-start gap-2 group">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-slate-600">
                                  {ROLE_LABELS[rev.reviewerRole] || rev.reviewerRole}
                                </span>
                                {rev.reviewerName && (
                                  <span className="text-xs text-slate-400">· {rev.reviewerName}</span>
                                )}
                                {rev.dateNoted && (
                                  <span className="text-xs text-slate-300">· {fmtDate(rev.dateNoted)}</span>
                                )}
                              </div>
                              <div className="mt-0.5">
                                <StatusPill status={rev.status} />
                              </div>
                              {rev.notes && (
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                  "{rev.notes}"
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => { if (confirm('Delete this review entry?')) onDeleteReview(rev.id); }}
                              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all shrink-0 mt-0.5"
                              title="Delete review"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300 italic">No reviews yet</p>
                  )}

                  {/* Add review for this version */}
                  {isAdding ? (
                    <AddReviewForm
                      versionId={ver.id}
                      roles={roles}
                      onAdd={onAddReview}
                      onCancel={() => setAddingToVersionId(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingToVersionId(ver.id)}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-600 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add review
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
