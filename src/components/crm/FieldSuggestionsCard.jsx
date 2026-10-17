'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// "Email signatures say..." (0118). A signature said something different from
// what the person's card says. Blanks were already filled; these are the
// differences. Accept writes the value; Keep ours leaves the card alone.
//
// Props: { title?, limit?, onChange?(count) }. Drop it into My Desk as
// <FieldSuggestionsCard />; it renders nothing when there is nothing to answer.

const FIELD_WORDS = {
  phone: 'work phone', mobile: 'mobile', title: 'title', company: 'company',
  linkedInUrl: 'LinkedIn', website: 'website',
};

async function patch(url, body) {
  const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(d?.error || (res ? 'Could not save.' : 'No signal. Try again in a moment.'));
  return d;
}

function Btn({ children, onClick, tone = 'plain', disabled }) {
  const cls = tone === 'go'
    ? 'bg-green-600 text-white hover:bg-green-700'
    : 'border border-slate-300 text-slate-700 bg-white hover:bg-slate-50';
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`min-h-[40px] px-3 rounded-lg text-sm font-semibold disabled:opacity-40 ${cls}`}>{children}</button>
  );
}

export function FieldSuggestionRow({ s, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const who = s.contact
    ? [s.contact.name, s.contact.client?.name].filter(Boolean).join(' at ')
    : 'Someone';
  const field = FIELD_WORDS[s.field] || s.field;

  async function act(what) {
    setBusy(true); setErr('');
    try {
      await patch(`/api/sales/field-suggestions/${s.id}`, { do: what });
      await onDone(what === 'accept' ? `Updated their ${field}.` : 'Kept ours.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <li className="rounded-xl border border-amber-200 bg-white p-3">
      <div className="text-sm font-semibold text-slate-800">
        {s.contact?.clientId
          ? <Link href={`/clients/${s.contact.clientId}`} className="hover:underline">{who}</Link>
          : who}
        <span className="text-slate-500 font-normal">: {field}</span>
      </div>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm my-2">
        <dt className="text-slate-500">Signature says</dt>
        <dd className="text-slate-700 min-w-0 break-words">{s.suggestedValue}</dd>
        <dt className="text-slate-500">We have</dt>
        <dd className="text-slate-700 min-w-0 break-words">{s.currentValue || 'Nothing'}</dd>
      </dl>
      {s.sourceMessage?.subject && (
        <p className="text-xs text-slate-500 mb-2">From "{s.sourceMessage.subject}"</p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn tone="go" disabled={busy} onClick={() => act('accept')}>Accept</Btn>
        <Btn disabled={busy} onClick={() => act('reject')}>Keep ours</Btn>
      </div>
    </li>
  );
}

export default function FieldSuggestionsCard({ title = 'Email signatures say...', limit = 20, onChange }) {
  const [rows, setRows] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/sales/field-suggestions?status=PENDING').catch(() => null);
    const d = await res?.json().catch(() => ({}));
    const list = res?.ok ? (d.suggestions || []) : [];
    setRows(list);
    onChange?.(list.length);
  }, [onChange]);

  useEffect(() => { load(); }, [load]);

  if (!rows?.length) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-800 mb-1">{title}</h2>
      <p className="text-xs text-slate-500 mb-3">A signature said something different from the person's card. Blanks were filled already; these need a decision.</p>
      {note && <p className="text-sm text-green-700 mb-2">{note}</p>}
      <ul className="space-y-2">
        {rows.slice(0, limit).map(s => <FieldSuggestionRow key={s.id} s={s} onDone={async m => { setNote(m); await load(); }} />)}
      </ul>
      {rows.length > limit && <p className="text-xs text-slate-500 mt-2">{rows.length - limit} more after these.</p>}
    </section>
  );
}
