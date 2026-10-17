'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// "Same person? Same company? Same job?" from a web budget (0117). Shown on
// My Desk, on a company's page and on the Contacts list (Mike 10-4: "yes and
// yes"). Nothing is joined or made until somebody answers.

export const REVIEW_WORDS = {
  contact: { ask: 'Same person?', same: 'Same person', different: 'Different person' },
  client:  { ask: 'Same company?', same: 'Same company', different: 'Different company' },
  project: { ask: 'Same job?', same: 'Same job', different: 'Different job' },
};

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => null);
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

export function ReviewRow({ r, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const words = REVIEW_WORDS[r.kind] || REVIEW_WORDS.contact;
  const typed = [[r.firstName, r.lastName].filter(Boolean).join(' '), r.email, r.companyName].filter(Boolean).join(' · ');
  const have = r.kind === 'contact' && r.existingContact
    ? { text: [r.existingContact.name, r.existingContact.email, r.existingContact.client?.name || r.existingContact.company].filter(Boolean).join(' · ') }
    : r.kind === 'client' && r.existingClient
      ? { text: [r.existingClient.name, r.existingClient.website].filter(Boolean).join(' · '), href: `/clients/${r.existingClient.id}` }
      : r.existingProject
        ? { text: [r.existingProject.name, r.existingProject.budgetNumber, [r.existingProject.city, r.existingProject.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '), href: `/project/${r.existingProject.id}` }
        : { text: 'A record we already have' };
  async function answer(a) {
    setBusy(true); setErr('');
    try { await post(`/api/sales/desk/review/${r.id}`, { answer: a }); await onDone(a === 'same' ? 'Joined to the one we already have.' : 'Kept apart. A new one was made.'); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <li className="rounded-xl border border-amber-200 bg-white p-3">
      <div className="text-sm font-semibold text-slate-800">{words.ask}</div>
      <p className="text-xs text-slate-500 mb-2">{r.reason}</p>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm mb-2">
        <dt className="text-slate-500">Web budget</dt>
        <dd className="text-slate-700 min-w-0 break-words">{typed}{r.projectName ? <span className="text-slate-400"> · {r.projectName}</span> : null}</dd>
        <dt className="text-slate-500">We have</dt>
        <dd className="text-slate-700 min-w-0 break-words">{have.href ? <Link href={have.href} className="hover:underline">{have.text}</Link> : have.text}</dd>
      </dl>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn tone="go" disabled={busy} onClick={() => answer('same')}>{words.same}</Btn>
        <Btn disabled={busy} onClick={() => answer('different')}>{words.different}</Btn>
      </div>
    </li>
  );
}

/**
 * The open questions about one company (its own look alikes and its people's),
 * or every open "Same person?" when given kind="contact". Shows nothing when
 * there is nothing to answer.
 */
export default function LookAlikeReviews({ clientId, kind, title = 'Same person? Same company?' }) {
  const [reviews, setReviews] = useState(null);
  const [note, setNote] = useState('');
  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (clientId) q.set('clientId', clientId);
    if (kind) q.set('kind', kind);
    const d = await fetch(`/api/sales/desk/review?${q}`).then(r => r.json()).catch(() => ({}));
    setReviews(d.reviews || []);
  }, [clientId, kind]);
  useEffect(() => { load(); }, [load]);
  if (!reviews?.length && !note) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 md:p-4 shadow-sm">
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {reviews?.length ? <span className="text-xs text-slate-500 tabular-nums">{reviews.length}</span> : null}
      </div>
      {note && <p className="text-xs text-green-700 mb-2">{note}</p>}
      {reviews?.length ? (
        <>
          <p className="text-xs text-slate-500 mb-2">A web budget looks like one we already have. Nothing is joined or made until somebody answers.</p>
          <ul className="space-y-2">{reviews.map(r => <ReviewRow key={r.id} r={r} onDone={async t => { setNote(t); await load(); }} />)}</ul>
        </>
      ) : null}
    </section>
  );
}
