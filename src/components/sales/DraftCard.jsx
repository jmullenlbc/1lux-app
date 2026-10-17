'use client';
import { useState, useEffect } from 'react';
import AlertMark from '@/components/ui/AlertMark';
import { CARD, BTN_COMPACT, BTN_COMPACT_PRIMARY, INPUT, LABEL } from '@/components/ui/tokens';

// One email draft for review (recap, check-in, "still waiting"). Shared by the
// Bot Queue and My Desk so a draft looks and works the same in both.
// Nothing sends on its own: Dismiss cancels, edits save, sending is by hand.

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusPill({ status }) {
  const map = {
    PENDING_REVIEW:  ['bg-amber-50 text-amber-700 border-amber-200',  'Pending Review'],
    SENT:            ['bg-green-50 text-green-700 border-green-200',   'Sent'],
    MANUALLY_SENT:   ['bg-green-50 text-green-700 border-green-200',   'Sent (Manual)'],
    CANCELLED:       ['bg-slate-100 text-slate-500 border-slate-200',  'Cancelled'],
    CONFIRMED:       ['bg-green-50 text-green-700 border-green-200',   'Confirmed'],
    AWAITING_CONFIRM:['bg-slate-50 text-slate-700 border-slate-200',   'Awaiting Confirm'],
  };
  const [cls, label] = map[status] || ['bg-slate-100 text-slate-500 border-slate-200', status];
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-lg border ${cls}`}>
      {label}
    </span>
  );
}

function CountdownTimer({ expiresAt }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    function calc() {
      const diff = Math.floor((new Date(expiresAt) - Date.now()) / 1000);
      setRemaining(diff);
    }
    calc();
    const t = setInterval(calc, 10000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (remaining === null) return null;
  if (remaining <= 0) return <span className="text-xs font-semibold text-red-600">Sending now…</span>;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const cls = remaining < 300 ? 'text-red-600' : remaining < 600 ? 'text-amber-600' : 'text-slate-500';
  return (
    <span className={`text-xs font-semibold tabular-nums ${cls} flex items-center gap-1`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {mins}m {secs.toString().padStart(2,'0')}s
    </span>
  );
}

// A shared note's email with no sender yet (0108): pick one before anything
// else. The card stays locked (no edit, no copy) until somebody does.
function SenderPicker({ draft, onPicked }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  async function pick(userId) {
    if (!userId) return;
    setSaving(true); setErr('');
    const res = await fetch(`/api/bot/drafts/${draft.id}/sender`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
    }).catch(() => null);
    setSaving(false);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) { setErr(d?.error || 'Could not save that. Try again.'); return; }
    onPicked(d.draft);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
      <AlertMark label="Pick who sends this before it can go out" />
      <span className="text-xs font-semibold text-red-700">Sender:</span>
      {draft.senders?.length ? (
        <select defaultValue="" disabled={saving} onChange={e => pick(e.target.value)}
          className={`${INPUT} w-auto text-xs px-2 py-1 border-red-200`}>
          <option value="" disabled>Pick who sends it</option>
          {draft.senders.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ) : (
        <span className="text-xs text-red-700">Pick who sends it on My Desk.</span>
      )}
      <span className="text-xs text-red-600">This note has more than one owner. It can not go out until someone is picked.</span>
      {err && <span className="text-xs text-red-700 font-semibold">{err}</span>}
    </div>
  );
}

export default function DraftCard({ draft, onCancel, onUpdate, currentUserId }) {
  const [cancelling,  setCancelling]  = useState(false);
  const [expanded,    setExpanded]    = useState(false);
  const [editSubject, setEditSubject] = useState(draft.subject);
  const [editBody,    setEditBody]    = useState(draft.body);
  const [saving,      setSaving]      = useState(false);
  const [copied,      setCopied]      = useState(false);

  const isPending = draft.status === 'PENDING_REVIEW';
  const needsSender = isPending && draft.senderPending;

  function handlePicked(nd) {
    // Picked somebody else: it is their email now and leaves this desk.
    if (currentUserId && nd.userId !== currentUserId) { onCancel(nd.id); return; }
    setEditBody(nd.body);
    onUpdate({ ...nd, senders: undefined });
  }

  async function handleCancel() {
    if (!confirm('Cancel this draft?')) return;
    setCancelling(true);
    await fetch(`/api/bot/drafts/${draft.id}/cancel`, { method: 'POST' }).catch(() => {});
    onCancel(draft.id);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/bot/drafts/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: editSubject, body: editBody }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      const d = await res.json();
      onUpdate(d.draft || { ...draft, subject: editSubject, body: editBody });
      setExpanded(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(`Subject: ${editSubject}\n\n${editBody}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`${CARD} transition-colors ${isPending ? 'border-amber-200' : ''}`}>
      {/* Card header — always visible */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-mono font-bold text-slate-700 truncate">
                {draft.project?.name || 'No project linked'}
              </span>
              {draft.project?.serviceType && (
                <span className="text-xs text-slate-500 shrink-0">{draft.project.serviceType}</span>
              )}
              {draft.classificationReason && (
                <span className="text-xs text-slate-500 shrink-0 italic">{draft.classificationReason}</span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">
              To: {draft.toName ? `${draft.toName} <${draft.toEmail}>` : draft.toEmail}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill status={draft.status} />
            {isPending && draft.reviewExpiresAt && <CountdownTimer expiresAt={draft.reviewExpiresAt} />}
          </div>
        </div>

        {needsSender && <SenderPicker draft={draft} onPicked={handlePicked} />}

        <div className="bg-slate-50 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs font-semibold text-slate-700 mb-0.5">{draft.subject}</p>
          <p className={`text-xs text-slate-500 ${expanded ? '' : 'line-clamp-2'}`}>{draft.body}</p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 tabular-nums">{fmtDate(draft.createdAt)}</span>
          {isPending && (
            <div className="flex gap-2">
              <button
                onClick={() => { setEditSubject(draft.subject); setEditBody(draft.body); setExpanded(v => !v); }}
                disabled={needsSender}
                title={needsSender ? 'Pick who sends it first' : undefined}
                className={`${BTN_COMPACT_PRIMARY} disabled:cursor-not-allowed`}
              >
                {expanded ? 'Close' : 'Edit & Review'}
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className={BTN_COMPACT}
              >
                {cancelling ? 'Cancelling…' : 'Dismiss'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit panel — expanded */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/50 rounded-b-xl">
          <div className="mb-3">
            <label className={`block ${LABEL} mb-1`}>Subject</label>
            <input
              value={editSubject}
              onChange={e => setEditSubject(e.target.value)}
              className={`${INPUT} text-xs`}
            />
          </div>
          <div className="mb-3">
            <label className={`block ${LABEL} mb-1`}>Body</label>
            <textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              rows={8}
              className={`${INPUT} text-xs resize-y font-mono leading-relaxed`}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className={BTN_COMPACT_PRIMARY}
            >
              {saving ? 'Saving…' : 'Save edits'}
            </button>
            <button
              onClick={handleCopy}
              className={BTN_COMPACT}
            >
              {copied ? '✓ Copied!' : 'Copy to clipboard'}
            </button>
            <span className="text-xs text-slate-500 ml-1 italic">
              Email sending via M365 coming in Phase E
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
