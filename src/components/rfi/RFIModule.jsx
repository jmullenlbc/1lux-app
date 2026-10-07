'use client';
import { useState, useEffect, useCallback } from 'react';
import { PersonOptions } from '@/components/people/PeopleOptions';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(rfi) {
  return rfi.dateDue && rfi.status !== 'CLOSED' && new Date(rfi.dateDue) < new Date();
}

const STATUS_BADGE = {
  OPEN:       'bg-amber-50 text-amber-700 border-amber-200',
  IN_REVIEW:  'bg-blue-50 text-blue-700 border-blue-200',
  RESPONDED:  'bg-purple-50 text-purple-700 border-purple-200',
  CLOSED:     'bg-slate-100 text-slate-500 border-slate-200',
};
const TYPE_LABELS = {
  DIMENSION:             'Dimension',
  CLASH_RELOCATION:      'Clash / Reloc.',
  CONTROLS:              'Controls',
  DRAWING_CLARIFICATION: 'Drawing Clarif.',
  SUBSTITUTION:          'Substitution',
  MULTI_QUESTION:        'Multi-Question',
  ILC_INITIATED:         'ILC Initiated',
  OTHER:                 'Other',
};
const DRAFT_BADGE = {
  NONE:       { cls: 'bg-slate-100 text-slate-400 border-slate-200',  label: 'No Draft' },
  GENERATING: { cls: 'bg-blue-50 text-blue-600 border-blue-200',      label: 'Drafting…' },
  READY:      { cls: 'bg-amber-50 text-amber-700 border-amber-200',   label: '⚡ Draft Ready' },
  REVIEWED:   { cls: 'bg-violet-50 text-violet-700 border-violet-200',label: 'Reviewed' },
  SENT:       { cls: 'bg-green-50 text-green-700 border-green-200',   label: 'Sent' },
};

// ── RFI List ──────────────────────────────────────────────────────────────────

function RFIList({ rfis, selectedId, onSelect }) {
  if (!rfis.length) {
    return (
      <div className="text-center py-16 text-slate-400">
        <div className="text-3xl mb-3">📋</div>
        <p className="text-sm font-medium text-slate-600 mb-1">No RFIs yet</p>
        <p className="text-xs">Log an inbound RFI using the button above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0 border border-slate-200 rounded-xl overflow-hidden">
      {rfis.map((rfi, i) => {
        const db = DRAFT_BADGE[rfi.draftStatus] ?? DRAFT_BADGE.NONE;
        const over = isOverdue(rfi);
        return (
          <div
            key={rfi.id}
            onClick={() => onSelect(rfi.id)}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${
              selectedId === rfi.id ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-50'
            }`}
          >
            {/* Ship flag */}
            {rfi.shipFlag && !rfi.shipFlagAcknowledged && (
              <span className="text-amber-500 text-[11px] shrink-0" title="Active shipment">⚠</span>
            )}

            {/* RFI # */}
            <span className="text-[11px] font-mono font-bold text-slate-700 shrink-0 w-20 truncate">{rfi.rfiNumber}</span>

            {/* Subject */}
            <span className="flex-1 text-sm text-slate-700 truncate">{rfi.subject}</span>

            {/* Type */}
            <span className="text-[10px] text-slate-400 shrink-0 hidden lg:block">{TYPE_LABELS[rfi.rfiType] ?? rfi.rfiType}</span>

            {/* Received from */}
            <span className="text-[11px] text-slate-500 shrink-0 hidden xl:block w-24 truncate">{rfi.receivedFrom}</span>

            {/* Due date */}
            <span className={`text-[11px] shrink-0 w-20 text-right ${over ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
              {rfi.dateDue ? fmtDate(rfi.dateDue) : '—'}
            </span>

            {/* Status */}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${STATUS_BADGE[rfi.status] ?? STATUS_BADGE.OPEN}`}>
              {rfi.status}
            </span>

            {/* Draft status */}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${db.cls}`}>
              {db.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Intake Drawer ─────────────────────────────────────────────────────────────

function IntakeDrawer({ projectId, allUsers, onCreated, onClose }) {
  const [form, setForm] = useState({
    rfiNumber: '', subject: '', receivedFrom: '', rfiType: 'DIMENSION',
    dateDue: '', assignedToId: '', bodyText: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    if (!form.rfiNumber || !form.subject || !form.receivedFrom) {
      setError('RFI #, Subject, and Received From are required.');
      return;
    }
    setSaving(true);
    try {
      const res  = await fetch(`/api/projects/${projectId}/rfis`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onCreated(data.rfi);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const RFI_TYPES = [
    'DIMENSION','CLASH_RELOCATION','CONTROLS','DRAWING_CLARIFICATION',
    'SUBSTITUTION','MULTI_QUESTION','ILC_INITIATED','OTHER',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg h-full flex flex-col shadow-2xl border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Log Inbound RFI</h2>
            <p className="text-xs text-slate-400 mt-0.5">Create RFI + first activity in one step</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">RFI # *</label>
              <input value={form.rfiNumber} onChange={e => set('rfiNumber', e.target.value)}
                placeholder="RFI #116"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Due Date</label>
              <input type="date" value={form.dateDue} onChange={e => set('dateDue', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Subject *</label>
            <input value={form.subject} onChange={e => set('subject', e.target.value)}
              placeholder="Type G1 mounting height at garage entry"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Received From *</label>
              <input value={form.receivedFrom} onChange={e => set('receivedFrom', e.target.value)}
                placeholder="Shaw Construction"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
              <select value={form.rfiType} onChange={e => set('rfiType', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                {RFI_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Assign To</label>
            <select value={form.assignedToId} onChange={e => set('assignedToId', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">— Unassigned —</option>
              <PersonOptions users={allUsers} picker="rfiAssignee" />
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Question Text <span className="text-slate-400 font-normal">(from inbound RFI)</span></label>
            <textarea value={form.bodyText} onChange={e => set('bodyText', e.target.value)}
              rows={5} placeholder="Paste the full question from the GC/EC here — this feeds the AI draft engine."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{error}</div>}
        </form>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button type="button" onClick={onClose} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Log RFI'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RFI Detail ────────────────────────────────────────────────────────────────

function RFIDetail({ rfiId, projectId, currentUserName, onClose }) {
  const [rfi,          setRfi]          = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [draftStatus,  setDraftStatus]  = useState(null);
  const [editing,      setEditing]      = useState(false);
  const [editText,     setEditText]     = useState('');
  const [sending,      setSending]      = useState(false);
  const [shipModal,    setShipModal]    = useState(false);
  const [pendingFinal, setPendingFinal] = useState(null);

  const load = useCallback(async () => {
    const res  = await fetch(`/api/projects/${projectId}/rfis/${rfiId}`);
    const data = await res.json();
    setRfi(data.rfi);
    setDraftStatus(data.rfi?.draftStatus);
    setLoading(false);
  }, [rfiId, projectId]);

  useEffect(() => { load(); }, [load]);

  // Auto-trigger draft on first open
  useEffect(() => {
    if (!rfi || rfi.draftStatus !== 'NONE') return;
    setDraftStatus('GENERATING');
    fetch(`/api/projects/${projectId}/rfis/${rfiId}/generate-draft`, { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        // Poll until not GENERATING
        const poll = setInterval(async () => {
          const r    = await fetch(`/api/projects/${projectId}/rfis/${rfiId}`);
          const data = await r.json();
          if (data.rfi?.draftStatus !== 'GENERATING') {
            clearInterval(poll);
            setRfi(data.rfi);
            setDraftStatus(data.rfi.draftStatus);
          }
        }, 2000);
        setTimeout(() => clearInterval(poll), 60000); // safety stop after 60s
      })
      .catch(() => setDraftStatus('NONE'));
  }, [rfi?.id, rfi?.draftStatus]);

  async function handleApprove(finalText) {
    if (!finalText?.trim()) return;
    setSending(true);
    const res  = await fetch(`/api/projects/${projectId}/rfis/${rfiId}/approve-draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ finalText, designerName: currentUserName }),
    });
    const data = await res.json();
    if (data.code === 'SHIP_FLAG_UNACKNOWLEDGED') {
      setPendingFinal(finalText);
      setShipModal(true);
      setSending(false);
      return;
    }
    if (res.ok) await load();
    setSending(false);
    setEditing(false);
  }

  async function acknowledgeShip() {
    await fetch(`/api/projects/${projectId}/rfis/${rfiId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipFlagAcknowledged: true }),
    });
    setShipModal(false);
    if (pendingFinal) await handleApprove(pendingFinal);
    setPendingFinal(null);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-slate-200 border-t-amber-500 rounded-full animate-spin" /></div>;
  }
  if (!rfi) return null;

  const CONF_CLS = { HIGH: 'bg-green-50 text-green-700 border-green-200', MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200', LOW: 'bg-slate-100 text-slate-500 border-slate-200', SUBSTITUTION: 'bg-violet-50 text-violet-700 border-violet-200' };
  const confCls = CONF_CLS[rfi.draftConfidence] ?? CONF_CLS.LOW;

  const draftToShow = editing ? editText : (rfi.draftText ?? '');

  return (
    <div className="flex gap-5 h-full">
      {/* Ship flag modal */}
      {shipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-slate-900 mb-2">Shipment in Progress</h3>
            <p className="text-sm text-slate-500 mb-6">An active shipment is associated with this RFI. Confirm you have discussed a hold or cancellation with the rep before approving this substitution.</p>
            <div className="flex gap-3">
              <button onClick={() => setShipModal(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg">Cancel</button>
              <button onClick={acknowledgeShip} className="flex-1 py-2 text-sm bg-amber-500 text-white font-semibold rounded-lg">I've confirmed — proceed</button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT — Thread */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-mono font-bold text-slate-700">{rfi.rfiNumber}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${STATUS_BADGE[rfi.status] ?? STATUS_BADGE.OPEN}`}>{rfi.status}</span>
              {rfi.shipFlag && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">⚠ ACTIVE SHIPMENT</span>}
            </div>
            <h2 className="text-base font-bold text-slate-900">{rfi.subject}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{TYPE_LABELS[rfi.rfiType]} · From {rfi.receivedFrom}{rfi.dateDue ? ` · Due ${fmtDate(rfi.dateDue)}` : ''}</p>
          </div>
          {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">← Back</button>}
        </div>

        {/* Thread activities */}
        <div className="space-y-3">
          {rfi.activities.map(act => (
            <div key={act.id} className={`rounded-xl p-4 border ${act.direction === 'INBOUND' ? 'bg-slate-50 border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${act.direction === 'INBOUND' ? 'bg-slate-200 text-slate-600' : 'bg-slate-600 text-slate-200'}`}>{act.direction}</span>
                <span className={`text-xs font-medium ${act.direction === 'INBOUND' ? 'text-slate-600' : 'text-slate-300'}`}>{act.authoredBy}</span>
                <span className={`text-[10px] ml-auto ${act.direction === 'INBOUND' ? 'text-slate-400' : 'text-slate-500'}`}>{fmtDate(act.sentAt)}</span>
              </div>
              <p className={`text-sm whitespace-pre-wrap leading-relaxed ${act.direction === 'INBOUND' ? 'text-slate-700' : 'text-slate-200'}`}>{act.bodyText}</p>
              {act.attachments?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {act.attachments.map(att => (
                    <span key={att.id} className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">📎 {att.fileName}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Draft Zone ── */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {/* Draft zone header */}
          <div className={`px-4 py-3 border-b flex items-center gap-3 ${
            draftStatus === 'READY'    ? 'bg-amber-50 border-amber-200' :
            draftStatus === 'REVIEWED' ? 'bg-violet-50 border-violet-200' :
            draftStatus === 'SENT'     ? 'bg-green-50 border-green-200' :
            draftStatus === 'GENERATING' ? 'bg-blue-50 border-blue-200' :
            'bg-slate-50 border-slate-200'
          }`}>
            {draftStatus === 'GENERATING' && (
              <>
                <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-sm font-semibold text-blue-700">Drafting response…</span>
                <span className="text-xs text-blue-500 ml-auto">Assembling fixture context + writing in ILC voice</span>
              </>
            )}
            {draftStatus === 'READY' && (
              <>
                <span className="text-sm font-bold text-amber-700">⚡ AI Draft — Pending Your Review</span>
                {rfi.draftConfidence && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ml-auto ${confCls}`}>{rfi.draftConfidence}</span>
                )}
              </>
            )}
            {draftStatus === 'REVIEWED' && (
              <span className="text-sm font-bold text-violet-700">Draft edited — ready to send</span>
            )}
            {draftStatus === 'SENT' && (
              <span className="text-sm font-bold text-green-700">✓ Response sent {fmtDate(rfi.draftReviewedAt)} by {rfi.draftReviewedBy}</span>
            )}
            {(draftStatus === 'NONE' || !draftStatus) && (
              <span className="text-sm text-slate-500">No draft yet — open RFI to generate</span>
            )}
          </div>

          {/* Draft body */}
          <div className="p-4">
            {draftStatus === 'GENERATING' && (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-slate-200 rounded w-5/6" />
                <div className="h-3 bg-slate-200 rounded w-full" />
                <div className="h-3 bg-slate-200 rounded w-4/5" />
              </div>
            )}

            {draftStatus === 'NONE' && !rfi.draftText && (
              <p className="text-sm text-slate-400 italic">
                {rfi.draftConfidence === 'LOW'
                  ? 'This RFI requires your judgment — fixture type not found in schedule or scope is out-of-bounds. Write your response below.'
                  : 'Opening the RFI detail will trigger draft generation automatically.'}
              </p>
            )}

            {(draftStatus === 'READY' || draftStatus === 'REVIEWED') && (
              <>
                {editing ? (
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={10}
                    className="w-full text-sm font-mono border border-blue-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50"
                  />
                ) : (
                  <pre className="text-sm font-mono whitespace-pre-wrap text-slate-700 leading-relaxed bg-slate-50 rounded-lg px-3 py-2">
                    {rfi.draftText || '(LOW confidence — write response manually below)'}
                  </pre>
                )}

                <div className="flex gap-2 mt-3 flex-wrap">
                  {editing ? (
                    <>
                      <button onClick={() => handleApprove(editText)} disabled={sending} className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-60">
                        {sending ? 'Sending…' : 'Approve & Send'}
                      </button>
                      <button onClick={() => { setEditing(false); }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleApprove(rfi.draftText ?? '')} disabled={sending || !rfi.draftText} className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-60">
                        {sending ? 'Sending…' : 'Approve & Send'}
                      </button>
                      <button onClick={() => { setEditing(true); setEditText(rfi.draftText ?? ''); }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Edit Draft</button>
                      <button onClick={() => {
                        setDraftStatus('GENERATING');
                        fetch(`/api/projects/${projectId}/rfis/${rfiId}/generate-draft`, { method: 'POST' })
                          .then(() => {
                            const poll = setInterval(async () => {
                              const r = await fetch(`/api/projects/${projectId}/rfis/${rfiId}`);
                              const d = await r.json();
                              if (d.rfi?.draftStatus !== 'GENERATING') { clearInterval(poll); setRfi(d.rfi); setDraftStatus(d.rfi.draftStatus); }
                            }, 2000);
                          });
                      }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50">↺ Regenerate</button>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Manual compose for LOW confidence */}
            {(draftStatus === 'READY' || draftStatus === 'NONE') && !rfi.draftText && (
              <div className="mt-3">
                <textarea
                  value={editText}
                  onChange={e => { setEditText(e.target.value); if (!editing) setEditing(true); }}
                  rows={6}
                  placeholder="Write your response here…"
                  className="w-full text-sm font-mono border border-slate-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button onClick={() => handleApprove(editText)} disabled={sending || !editText.trim()} className="mt-2 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-60">
                  {sending ? 'Sending…' : 'Send Response'}
                </button>
              </div>
            )}

            {draftStatus === 'SENT' && (
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                Response recorded in the thread above.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT — Context panel */}
      <div className="w-72 shrink-0 space-y-3">
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Details</span>
          </div>
          <div className="p-3 space-y-2 text-xs text-slate-600">
            <div className="flex justify-between"><span className="text-slate-400">Type</span><span>{TYPE_LABELS[rfi.rfiType]}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Routing</span><span>{rfi.routingMode}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Assigned</span><span>{rfi.assignedTo?.name ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Received</span><span>{fmtDate(rfi.dateReceived)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Due</span><span className={isOverdue(rfi) ? 'text-red-600 font-semibold' : ''}>{fmtDate(rfi.dateDue)}</span></div>
          </div>
        </div>

        {rfi.impactItems?.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Impact Items ({rfi.impactItems.length})</span>
            </div>
            <div className="p-3 space-y-2">
              {rfi.impactItems.map(item => (
                <div key={item.id} className="text-xs text-slate-600 border border-slate-100 rounded-lg p-2">
                  <div className="font-medium">{item.itemNumber}. {item.fixtureTypeFrom ?? 'TBD'}{item.fixtureTypeTo ? ` → ${item.fixtureTypeTo}` : ''}</div>
                  {item.itemDraftText && <p className="text-slate-400 mt-1 font-mono text-[10px] truncate">{item.itemDraftText}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${CONF_CLS[item.itemConfidence] ?? CONF_CLS.LOW}`}>{item.itemConfidence}</span>
                    <span className="text-[9px] text-slate-400">{item.impactStatus}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rfi.changeOrder && (
          <div className="border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">Change Order</div>
            <div className="font-bold">{rfi.changeOrder.coNumber}</div>
            <div className="text-slate-400">{rfi.changeOrder.status}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main RFI Module ───────────────────────────────────────────────────────────

export default function RFIModule({ projectId, allUsers, currentUserName }) {
  const [rfis,        setRfis]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showIntake,  setShowIntake]  = useState(false);
  const [selectedId,  setSelectedId]  = useState(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/rfis`)
      .then(r => r.json())
      .then(d => { setRfis(d.rfis || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  function handleCreated(rfi) {
    setRfis(prev => [rfi, ...prev]);
    setShowIntake(false);
    setSelectedId(rfi.id);
  }

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-slate-200 border-t-amber-500 rounded-full animate-spin" /></div>;

  const selectedRFI = rfis.find(r => r.id === selectedId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">RFIs</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {rfis.length} total
            {rfis.filter(r => r.draftStatus === 'READY').length > 0 &&
              ` · ⚡ ${rfis.filter(r => r.draftStatus === 'READY').length} draft${rfis.filter(r => r.draftStatus === 'READY').length !== 1 ? 's' : ''} ready`}
          </p>
        </div>
        <button onClick={() => setShowIntake(true)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors flex items-center gap-1.5">
          + Log RFI
        </button>
      </div>

      {/* Detail view (inline when selected) */}
      {selectedId && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <RFIDetail
            rfiId={selectedId}
            projectId={projectId}
            currentUserName={currentUserName}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* List */}
      {!selectedId && (
        <>
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="w-20">RFI #</span>
            <span className="flex-1">Subject</span>
            <span className="hidden lg:block w-24">Type</span>
            <span className="hidden xl:block w-24">From</span>
            <span className="w-20 text-right">Due</span>
            <span className="w-16">Status</span>
            <span className="w-24">Draft</span>
          </div>
          <RFIList rfis={rfis} selectedId={selectedId} onSelect={setSelectedId} />
        </>
      )}

      {/* Intake drawer */}
      {showIntake && (
        <IntakeDrawer
          projectId={projectId}
          allUsers={allUsers}
          onCreated={handleCreated}
          onClose={() => setShowIntake(false)}
        />
      )}
    </div>
  );
}
