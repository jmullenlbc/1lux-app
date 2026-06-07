'use client';
import { useState } from 'react';
import { statusMeta } from './SubmittalTrackerClient';

// Category badge colors + labels
const CATEGORY_META = {
  FINISH:       { bg: 'bg-orange-50 text-orange-700 border-orange-200',   label: 'Finish' },
  MODEL:        { bg: 'bg-purple-50 text-purple-700 border-purple-200',   label: 'Model' },
  ACCESSORY:    { bg: 'bg-blue-50 text-blue-700 border-blue-200',         label: 'Accessory' },
  VOLTAGE:      { bg: 'bg-red-50 text-red-700 border-red-200',            label: 'Voltage' },
  LUMEN:        { bg: 'bg-yellow-50 text-yellow-700 border-yellow-200',   label: 'Lumen' },
  WET_LOCATION: { bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',         label: 'Wet Location' },
  DRAWING_SYNC: { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',   label: 'Drawing Sync' },
  DISCONTINUED: { bg: 'bg-slate-100 text-slate-600 border-slate-300',     label: 'Discontinued' },
  LED_TAPE:     { bg: 'bg-pink-50 text-pink-700 border-pink-200',         label: 'LED Tape' },
  CODE:         { bg: 'bg-rose-50 text-rose-700 border-rose-200',         label: 'Code' },
  CRI:          { bg: 'bg-teal-50 text-teal-700 border-teal-200',         label: 'CRI' },
};

function CategoryBadge({ category }) {
  if (!category || category === 'BOILERPLATE' || category === 'OTHER') return null;
  const meta = CATEGORY_META[category];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${meta.bg}`}>
      {meta.label}
    </span>
  );
}

// ILC Response block — shows draft, allows editing + approving
function ResponseBlock({ review, projectId }) {
  const [resp,      setResp]      = useState(review.response || null);
  const [editing,   setEditing]   = useState(false);
  const [editBody,  setEditBody]  = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');

  // Don't show response block for BOILERPLATE notes
  if (review.noteCategory === 'BOILERPLATE') return null;
  // Don't show if no notes text (nothing to respond to)
  if (!review.notes) return null;

  async function generate() {
    setGenerating(true);
    setErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}/tracker/reviews/${review.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Generation failed');
      setResp(d.response);
    } catch (e) { setErr(e.message); }
    finally { setGenerating(false); }
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tracker/reviews/${review.id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseBody: editBody }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Save failed');
      setResp(d.response);
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function approve() {
    const res = await fetch(`/api/projects/${projectId}/tracker/reviews/${review.id}/respond`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    const d = await res.json();
    if (res.ok) setResp(d.response);
  }

  async function unapprove() {
    const res = await fetch(`/api/projects/${projectId}/tracker/reviews/${review.id}/respond`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DRAFT' }),
    });
    const d = await res.json();
    if (res.ok) setResp(d.response);
  }

  if (!resp) {
    return (
      <div className="mt-2">
        {err && <p className="text-[10px] text-red-500 mb-1">{err}</p>}
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:text-amber-700 transition-colors disabled:opacity-50"
        >
          {generating ? (
            <>
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              Drafting response…
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Draft ILC Response
            </>
          )}
        </button>
      </div>
    );
  }

  const isApproved = resp.status === 'APPROVED';

  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-2 ${isApproved ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] font-bold uppercase tracking-wide ${isApproved ? 'text-green-700' : 'text-amber-700'}`}>
          {isApproved ? '✓ ILC Response' : 'Draft ILC Response'}
        </span>
        <div className="flex items-center gap-2">
          {!editing && !isApproved && (
            <>
              <button onClick={() => { setEditBody(resp.body); setEditing(true); }}
                className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors">Edit</button>
              <button onClick={approve}
                className="text-[10px] font-semibold text-green-700 hover:text-green-800 transition-colors">Approve</button>
            </>
          )}
          {isApproved && (
            <button onClick={unapprove}
              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors">Revert to draft</button>
          )}
          <button onClick={generate} disabled={generating}
            className="text-[10px] text-slate-300 hover:text-amber-600 transition-colors disabled:opacity-50"
            title="Regenerate with AI">
            {generating ? '…' : '↺'}
          </button>
        </div>
      </div>

      {editing ? (
        <div>
          <textarea
            value={editBody}
            onChange={e => setEditBody(e.target.value)}
            rows={3}
            className="w-full text-[11px] text-slate-700 border border-amber-300 rounded px-2 py-1 bg-white outline-none resize-none focus:border-amber-400"
          />
          <div className="flex gap-2 mt-1">
            <button onClick={saveEdit} disabled={saving}
              className="text-[10px] font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
              className="text-[10px] text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        </div>
      ) : (
        <p className={`text-[11px] leading-relaxed ${isApproved ? 'text-green-800' : 'text-amber-800'}`}>
          {resp.body}
        </p>
      )}
      {err && <p className="text-[10px] text-red-500 mt-1">{err}</p>}
    </div>
  );
}

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
                          <div key={rev.id} className="group">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                {/* Reviewer + date header */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-slate-600">
                                    {ROLE_LABELS[rev.reviewerRole] || rev.reviewerRole}
                                  </span>
                                  {rev.reviewerName && (
                                    <span className="text-xs text-slate-400">· {rev.reviewerName}</span>
                                  )}
                                  {rev.dateNoted && (
                                    <span className="text-xs text-slate-300">· {fmtDate(rev.dateNoted)}</span>
                                  )}
                                  {rev.pageNumber && (
                                    <span className="text-[10px] text-slate-300">p.{rev.pageNumber}</span>
                                  )}
                                </div>
                                {/* Status + category + AI badges */}
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  <StatusPill status={rev.status} />
                                  <CategoryBadge category={rev.noteCategory} />
                                  {rev.isExtracted && (
                                    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-yellow-50 text-yellow-700 border-yellow-200">
                                      ✦ AI
                                    </span>
                                  )}
                                </div>
                                {/* Review note text */}
                                {rev.notes && (
                                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                    "{rev.notes}"
                                  </p>
                                )}
                                {/* ILC Response block */}
                                <ResponseBlock review={rev} projectId={projectId} />
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
