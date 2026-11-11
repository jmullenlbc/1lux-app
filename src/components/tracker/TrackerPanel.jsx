'use client';
import { useState } from 'react';
import { statusMeta } from './SubmittalTrackerClient';
import { REVIEW_STATUSES } from '@/lib/submittalStatus';

// Category badge colors + labels
const CATEGORY_META = {
  FINISH:       { bg: 'bg-orange-50 text-orange-700 border-orange-200',   label: 'Finish' },
  MODEL:        { bg: 'bg-purple-50 text-purple-700 border-purple-200',   label: 'Model' },
  ACCESSORY:    { bg: 'bg-blue-50 text-blue-700 border-blue-200',         label: 'Accessory' },
  VOLTAGE:      { bg: 'bg-red-50 text-red-700 border-red-200',            label: 'Voltage' },
  LUMEN:        { bg: 'bg-amber-50 text-amber-700 border-amber-200',   label: 'Lumen' },
  WET_LOCATION: { bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',         label: 'Wet Location' },
  DRAWING_SYNC: { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',   label: 'Drawing Sync' },
  DISCONTINUED: { bg: 'bg-slate-100 text-slate-600 border-slate-300',     label: 'Discontinued' },
  LED_TAPE:     { bg: 'bg-pink-50 text-pink-700 border-pink-200',         label: 'LED Tape' },
  CODE:         { bg: 'bg-red-50 text-red-700 border-red-200',         label: 'Code' },
  CRI:          { bg: 'bg-teal-50 text-teal-700 border-teal-200',         label: 'CRI' },
};

function CategoryBadge({ category }) {
  if (!category || category === 'BOILERPLATE' || category === 'OTHER') return null;
  const meta = CATEGORY_META[category];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded border ${meta.bg}`}>
      {meta.label}
    </span>
  );
}

// ILC Response block, shows draft, allows editing + approving
function ResponseBlock({ review, projectId }) {
  const [resp,      setResp]      = useState(review.response || null);
  const [editing,   setEditing]   = useState(false);
  const [editBody,  setEditBody]  = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');

  // Don't show response block for BOILERPLATE notes
  if (review.noteCategory === 'BOILERPLATE') return null;

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
      if (!res.ok) throw new Error(d.error || 'The response did not save on our side. Your text is still in the box. Try Save again. (TRACKER_RESPONSE_SAVE)');
      setResp(d.response);
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  // DRAFT, APPROVED or SENT. Sent is marked by hand once it goes out (0146).
  async function setStatus(status) {
    setErr('');
    const res = await fetch(`/api/projects/${projectId}/tracker/reviews/${review.id}/respond`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setResp(d.response);
    else setErr(d.error || 'That status did not save on our side. Nothing changed. Try again. (TRACKER_RESPONSE_STATUS)');
  }
  const approve   = () => setStatus('APPROVED');
  const unapprove = () => setStatus('DRAFT');
  const markSent  = () => setStatus('SENT');

  // No response yet: write one by hand, or let AI draft one from the note.
  if (!resp && editing) {
    return (
      <div className="mt-2">
        <textarea
          value={editBody}
          onChange={e => setEditBody(e.target.value)}
          rows={3}
          placeholder="ILC response…"
          className="w-full text-[11px] text-slate-700 border border-slate-300 rounded px-2 py-1 bg-white outline-none resize-none focus:border-orange-500"
        />
        <div className="flex gap-2 mt-1">
          <button onClick={saveEdit} disabled={saving || !editBody.trim()}
            className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)}
            className="text-[11px] text-slate-500 hover:text-slate-600">Cancel</button>
        </div>
        {err && <p className="text-[11px] text-red-500 mt-1">{err}</p>}
      </div>
    );
  }

  if (!resp) {
    return (
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        {err && <p className="w-full text-[11px] text-red-500">{err}</p>}
        <button onClick={() => { setEditBody(''); setEditing(true); }}
          className="text-[11px] font-semibold text-slate-600 hover:text-orange-600 transition-colors">
          Write response
        </button>
        {review.notes && <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 transition-colors disabled:opacity-50"
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
              Draft with AI
            </>
          )}
        </button>}
      </div>
    );
  }

  const isSent     = resp.status === 'SENT';
  const isApproved = resp.status === 'APPROVED' || isSent;

  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-2 ${isApproved ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] font-bold uppercase tracking-wide ${isApproved ? 'text-green-700' : 'text-amber-700'}`}>
          {isSent ? `ILC Response, sent${resp.sentAt ? ` ${new Date(resp.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}` : isApproved ? 'ILC Response, approved' : 'Draft ILC Response'}
        </span>
        <div className="flex items-center gap-2">
          {!editing && !isApproved && (
            <>
              <button onClick={() => { setEditBody(resp.body); setEditing(true); }}
                className="text-[11px] text-slate-500 hover:text-slate-600 transition-colors">Edit</button>
              <button onClick={approve}
                className="text-[11px] font-semibold text-green-700 hover:text-green-800 transition-colors">Approve</button>
            </>
          )}
          {isApproved && !isSent && (
            <button onClick={markSent}
              className="text-[11px] font-semibold text-green-700 hover:text-green-800 transition-colors">Mark sent</button>
          )}
          {isApproved && (
            <button onClick={unapprove}
              className="text-[11px] text-slate-500 hover:text-slate-600 transition-colors">Revert to draft</button>
          )}
          {!isApproved && review.notes && (
            <button onClick={generate} disabled={generating}
              className="text-[11px] text-slate-500 hover:text-orange-600 transition-colors disabled:opacity-50"
              title="Draft again with AI">
              {generating ? '…' : '↺'}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div>
          <textarea
            value={editBody}
            onChange={e => setEditBody(e.target.value)}
            rows={3}
            className="w-full text-[11px] text-slate-700 border border-amber-300 rounded px-2 py-1 bg-white outline-none resize-none focus:border-orange-500"
          />
          <div className="flex gap-2 mt-1">
            <button onClick={saveEdit} disabled={saving}
              className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
              className="text-[11px] text-slate-500 hover:text-slate-600">Cancel</button>
          </div>
        </div>
      ) : (
        <p className={`text-[11px] leading-relaxed ${isApproved ? 'text-green-800' : 'text-amber-800'}`}>
          {resp.body}
        </p>
      )}
      {err && <p className="text-[11px] text-red-500 mt-1">{err}</p>}
    </div>
  );
}

const ROLE_LABELS = {
  ILC: '1LUX', Developer: 'Developer', Architect: 'Architect',
  LA: 'Landscape Architect', ID: 'Interior Designer', EE: 'Electrical Engineer',
  GC: 'General Contractor', EC: 'Electrical Contractor',
};

// Approved, Approved as noted, Rejected, Not reviewed (Mike 10-29)
const STATUS_OPTIONS = REVIEW_STATUSES.map(s => ({ value: s.code, label: s.label }));

function StatusPill({ status }) {
  const m = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// Inline form to add a review, or fix one when `review` is passed
function AddReviewForm({ versionId, roles, onAdd, onCancel, review, onSave }) {
  const [role,     setRole]     = useState(review?.reviewerRole || roles[0] || 'ILC');
  const [name,     setName]     = useState(review?.reviewerName || '');
  const [status,   setStatus]   = useState(review?.status || 'Approved');
  const [date,     setDate]     = useState(review ? (review.dateNoted || '') : new Date().toISOString().split('T')[0]);
  const [notes,    setNotes]    = useState(review?.notes || '');
  const [saving,   setSaving]   = useState(false);
  const roleChoices = review && !roles.includes(review.reviewerRole) ? [review.reviewerRole, ...roles] : roles;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const data = { reviewerRole: role, reviewerName: name, status, dateNoted: date, notes };
    const ok = review ? await onSave(review.id, data) : await onAdd(versionId, data);
    if (ok && !review) { setNotes(''); setName(''); }
    setSaving(false);
    if (ok && review) onCancel();
  }

  return (
    <form onSubmit={submit} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5 mt-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Reviewer</label>
          <select value={role} onChange={e => setRole(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500 bg-white">
            {roleChoices.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500 bg-white">
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Name (optional)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Reviewer name"
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500" />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="Comments, conditions, questions…"
          className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500 resize-none" />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-600">Cancel</button>
        <button type="submit" disabled={saving}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : review ? 'Save review' : 'Add Review'}
        </button>
      </div>
    </form>
  );
}

export default function TrackerPanel({ item, submissions, roles, projectId, onClose, onAddReview, onEditReview, onDeleteReview }) {
  const [addingToVersionId, setAddingToVersionId] = useState(null);
  const [editingReviewId,   setEditingReviewId]   = useState(null);

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
    <div className="fixed inset-0 z-50 w-full md:static md:inset-auto md:z-auto md:w-[400px] shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
      {/* Panel header. Phones: panel opens full screen (Mike 10-29) */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold text-slate-800">{item.typeCode}</p>
          {item.description && (
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>
          )}
          {item.location && (
            <p className="text-[11px] text-slate-500 uppercase tracking-wide mt-1">{item.location}</p>
          )}
        </div>
        <button onClick={onClose}
          className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 mt-0.5">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Submission history, scrollable */}
      <div className="flex-1 overflow-y-auto">
        {allVersions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <p className="text-sm text-slate-500">No submissions yet</p>
            <p className="text-xs text-slate-500 mt-1">Create a submission to start tracking reviews</p>
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
                        <span className="text-xs text-slate-500">· {fmtDate(ver.submission.submittedDate)}</span>
                      )}
                      {isLatest && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-600">
                          Latest
                        </span>
                      )}
                      {changed && (
                        <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-600">
                          ⚠ Spec changed
                        </span>
                      )}
                    </div>
                    {(ver.manufacturer || ver.modelNumber) && (
                      <p className="text-xs text-slate-500 mt-1">
                        <span className="font-medium">{ver.manufacturer}</span>
                        {ver.modelNumber && <span className="text-slate-500"> · {ver.modelNumber}</span>}
                      </p>
                    )}
                  </div>

                  {/* Reviews */}
                  {ver.reviews.length > 0 ? (
                    <div className="space-y-2">
                      {[...ver.reviews]
                        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                        .map(rev => editingReviewId === rev.id ? (
                          <AddReviewForm key={rev.id} review={rev} roles={roles}
                            onSave={onEditReview} onCancel={() => setEditingReviewId(null)} />
                        ) : (
                          <div key={rev.id} className="group">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                {/* Reviewer + date header */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-slate-600">
                                    {ROLE_LABELS[rev.reviewerRole] || rev.reviewerRole}
                                  </span>
                                  {rev.reviewerName && (
                                    <span className="text-xs text-slate-500">· {rev.reviewerName}</span>
                                  )}
                                  {rev.dateNoted && (
                                    <span className="text-xs text-slate-300">· {fmtDate(rev.dateNoted)}</span>
                                  )}
                                  {rev.pageNumber && (
                                    <span className="text-[11px] text-slate-500">p.{rev.pageNumber}</span>
                                  )}
                                </div>
                                {/* Status + category + AI badges */}
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  <StatusPill status={rev.status} />
                                  <CategoryBadge category={rev.noteCategory} />
                                  {rev.isExtracted && (
                                    <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
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
                              <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0 mt-0.5">
                                <button onClick={() => setEditingReviewId(rev.id)}
                                  className="text-[11px] text-slate-500 hover:text-orange-600">Edit</button>
                                <button
                                  onClick={() => { if (confirm('Archive this review? It moves to Archived and can be restored.')) onDeleteReview(rev.id); }}
                                  className="text-[11px] text-slate-500 hover:text-red-500"
                                >
                                  Archive
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No reviews yet</p>
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
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-orange-600 transition-colors"
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
