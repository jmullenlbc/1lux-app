'use client';
import { useState, useEffect } from 'react';
import { CARD_PADDED, CARD_TITLE, HELPER, INPUT, BTN_COMPACT, BTN_COMPACT_PRIMARY } from '@/components/ui/tokens';
import { Modal } from '@/components/salesDocs/SalesDocsUi';

// Shared pieces for Campaigns and Email lists (0147).

export const CAMPAIGN_STATUS_LABEL = { DRAFT: 'Draft', SENDING: 'Sending', SENT: 'Sent' };
const STATUS_TONE = { DRAFT: 'bg-slate-100 text-slate-700', SENDING: 'bg-amber-100 text-amber-800', SENT: 'bg-emerald-100 text-emerald-800' };

export function StatusPill({ status }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status] || STATUS_TONE.DRAFT}`}>{CAMPAIGN_STATUS_LABEL[status] || status}</span>;
}

export const SEND_STATUS_LABEL = { QUEUED: 'Waiting', SENT: 'Sent', FAILED: 'Failed', SKIPPED: 'Skipped', BOUNCED: 'Bounced', COMPLAINED: 'Marked spam' };

export async function jsonCall(url, method, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (res?.ok) return { data };
  return { error: data.error || 'We could not reach our server, so nothing changed. Try again in a minute. (CAMPAIGN_NETWORK)', data };
}

/** Sending service status plus the footer mailing address (sales admins edit it). */
export function SendingSetup() {
  const [s, setS] = useState(null);
  const [addr, setAddr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/campaigns/settings').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setS(d); setAddr(d.footerAddress || ''); } }).catch(() => {});
  }, []);
  if (!s) return null;
  async function save() {
    setBusy(true); setMsg('');
    const { data, error } = await jsonCall('/api/campaigns/settings', 'PATCH', { footerAddress: addr });
    setBusy(false);
    if (error) setMsg(error);
    else { setS({ ...s, footerAddress: data.footerAddress }); setMsg('Saved.'); }
  }
  const sender = s.sender;
  return (
    <div className={CARD_PADDED}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className={CARD_TITLE}>Sending service</p>
          <p className={`${HELPER} mt-1`}>
            {sender.mode === 'dryrun' ? 'Test mode on this computer: sends are recorded but no email leaves.' : sender.ready ? `Connected. Emails come from ${sender.from.name}${sender.from.email ? ` <${sender.from.email}>` : ''}.` : 'No sending service connected yet. You can build lists and campaigns now; Send waits until one is picked.'}
          </p>
        </div>
        <div>
          <p className={CARD_TITLE}>Footer mailing address</p>
          <p className={`${HELPER} mt-1`}>The law asks for a real postal address at the bottom of every marketing email.</p>
          {s.canEdit ? (
            <div className="mt-2 flex gap-2">
              <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Street, city, state, zip" className={INPUT} />
              <button type="button" onClick={save} disabled={busy} className={BTN_COMPACT}>{busy ? 'Saving...' : 'Save'}</button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-700">{s.footerAddress || 'Not set yet. A sales admin adds it.'}</p>
          )}
          {msg && <p className={`mt-1 text-xs ${msg === 'Saved.' ? 'text-emerald-700' : 'text-red-600'}`}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}

export function NameModal({ title, url, field, extra, children, onClose, onMade }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { data, error } = await jsonCall(url, 'POST', { name, ...(extra || {}) });
    setBusy(false);
    if (error) setErr(error);
    else onMade(data[field]);
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={INPUT} />
        {children}
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button type="submit" disabled={busy || !name.trim()} className={BTN_COMPACT_PRIMARY}>{busy ? 'Saving...' : 'Create'}</button>
      </form>
    </Modal>
  );
}
