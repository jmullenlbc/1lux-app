'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// "Someone new was introduced" (0118). A person we do not know who was on an
// email or an invite with someone we do know, at a company we work with.
// "Add to CRM" makes the contact and confirms; "Not an intro" dismisses.
//
// Props: { title?, limit?, onChange?(count) }. Drop it into My Desk as
// <IntroductionsCard />; it renders nothing when there is nothing to answer.

async function patch(url, body) {
  const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(d?.error || (res ? 'Could not save.' : 'No signal. Try again in a moment.'));
  return d;
}

function Btn({ children, onClick, tone = 'plain', disabled }) {
  const cls = tone === 'go'
    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'border border-slate-200 text-slate-600 bg-white hover:bg-slate-50';
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`min-h-[40px] px-3 rounded-lg text-sm font-medium disabled:opacity-40 ${cls}`}>{children}</button>
  );
}

const when = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export function IntroductionRow({ r, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const person = [r.introducedName, r.introducedEmail].filter(Boolean).join(' · ');
  const by = r.introducedByContact
    ? [r.introducedByContact.name, r.introducedByContact.client?.name].filter(Boolean).join(' at ')
    : r.introducedByUser?.name || null;
  const source = r.kind === 'calendar'
    ? `Calendar invite, ${when(r.detectedAt)}`
    : [r.sourceMessage?.subject ? `"${r.sourceMessage.subject}"` : 'Email', when(r.sourceMessage?.sentAt || r.detectedAt)].filter(Boolean).join(', ');

  async function act(what) {
    setBusy(true); setErr('');
    try {
      const d = await patch(`/api/sales/introductions/${r.id}`, { do: what });
      await onDone(what === 'confirm' ? (d.created ? 'Added to the CRM.' : 'Already in the CRM; linked.') : 'Dismissed.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <li className="rounded-xl border border-sky-200 bg-white p-3">
      <div className="text-sm font-medium text-slate-800">{person}</div>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm my-2">
        <dt className="text-slate-400">Company</dt>
        <dd className="text-slate-700 min-w-0 break-words">
          {r.client ? <Link href={`/clients/${r.client.id}`} className="hover:underline">{r.client.name}</Link> : 'Not sure'}
          {r.client ? <span className="text-slate-400"> (same email domain)</span> : null}
        </dd>
        <dt className="text-slate-400">Introduced by</dt>
        <dd className="text-slate-700 min-w-0 break-words">{by || 'Someone on the email'}</dd>
        <dt className="text-slate-400">Where</dt>
        <dd className="text-slate-700 min-w-0 break-words">{source}</dd>
      </dl>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn tone="go" disabled={busy} onClick={() => act('confirm')}>Add to CRM</Btn>
        <Btn disabled={busy} onClick={() => act('dismiss')}>Not an intro</Btn>
      </div>
    </li>
  );
}

export default function IntroductionsCard({ title = 'Someone new was introduced', limit = 20, onChange }) {
  const [rows, setRows] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/sales/introductions?status=NEW').catch(() => null);
    const d = await res?.json().catch(() => ({}));
    const list = res?.ok ? (d.introductions || []) : [];
    setRows(list);
    onChange?.(list.length);
  }, [onChange]);

  useEffect(() => { load(); }, [load]);

  if (!rows?.length) return null;
  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
      <h2 className="text-base font-semibold text-slate-800 mb-1">{title}</h2>
      <p className="text-xs text-slate-500 mb-3">On an email or an invite with someone we know, from a company we work with. Add them or say it was not an intro.</p>
      {note && <p className="text-sm text-emerald-700 mb-2">{note}</p>}
      <ul className="space-y-2">
        {rows.slice(0, limit).map(r => <IntroductionRow key={r.id} r={r} onDone={async m => { setNote(m); await load(); }} />)}
      </ul>
      {rows.length > limit && <p className="text-xs text-slate-400 mt-2">{rows.length - limit} more after these.</p>}
    </section>
  );
}
