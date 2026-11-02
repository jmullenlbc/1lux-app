'use client';
import { useEffect, useState } from 'react';
import ExpenseForm, { todayInput } from '@/components/sales/ExpenseForm';
import { centsToInput, normalizeCategory } from '@/lib/sales/expenses';
import { receiptState } from '@/lib/sales/receipts';
import { readReceipt } from '@/lib/sales/receiptClient';
import { BTN_COMPACT, CARD_PADDED, CARD_TITLE, HELPER } from '@/components/ui/tokens';

const NO_SIGNAL = 'No signal reaching our server. Nothing changed. Check your connection and try again.';

const STATE_WORDS = {
  READ: 'Read by AI. Check every box, then press OK.',
  READING: 'Reading now…',
  WAITING: 'Not read yet. Press Try again, or type it in.',
  STUCK: 'The read never finished. Press Try again, or type it in.',
};

function formFrom(r, me) {
  return {
    userId: me || '',
    spentOn: r.aiSpentOn ? String(r.aiSpentOn).slice(0, 10) : todayInput(),
    amount: r.aiAmountCents == null ? '' : centsToInput(r.aiAmountCents),
    category: normalizeCategory(r.aiCategory),
    vendor: r.aiVendor || '',
    clientId: '', projectId: '', description: '',
  };
}

function Receipt({ receipt, me, users, clients, projects, onChanged }) {
  const [form, setForm] = useState(() => formFrom(receipt, me));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // A read that lands after the card opened fills the boxes, unless a person already typed.
  useEffect(() => { if (!touched) setForm(formFrom(receipt, me)); }, [receipt, me, touched]);

  const state = receiptState(receipt, Date.now());
  const canRetry = state !== 'READ' && state !== 'READING';

  async function confirm(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/sales/expenses/receipts/${receipt.id}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `The expense did not save on our server. Try again. (HTTP ${res.status})`);
      await onChanged(true);
    } catch (e2) {
      setErr(e2 instanceof TypeError ? 'No signal reaching our server. The expense was not saved. Check your connection and try again.' : e2.message);
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true); setErr('');
    try {
      await readReceipt(receipt.id);
    } catch (e2) {
      setErr(e2 instanceof TypeError ? NO_SIGNAL : e2.message);
    }
    await onChanged(false);
    setBusy(false);
  }

  async function dismiss() {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/sales/expenses/receipts/${receipt.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `The receipt did not change on our server. Try again. (HTTP ${res.status})`);
      await onChanged(false);
    } catch (e2) {
      setErr(e2 instanceof TypeError ? NO_SIGNAL : e2.message);
      setBusy(false);
    }
  }

  return (
    <li className="border border-slate-200 rounded-lg p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
        <a href={`/api/sales/expenses/receipts/${receipt.id}/file`} target="_blank" rel="noreferrer"
          className="text-sm font-medium text-orange-600 hover:underline break-all">View {receipt.fileName}</a>
        <span className={state === 'FAILED' ? 'text-xs text-red-600' : HELPER}>
          {state === 'FAILED' ? receipt.aiError : STATE_WORDS[state]}
        </span>
      </div>
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
      <ExpenseForm value={form} onChange={v => { setTouched(true); setForm(v); }}
        users={users} clients={clients} projects={projects}
        onSubmit={confirm} busy={busy} submitLabel="OK, save expense"
        extraActions={<>
          {canRetry && <button type="button" disabled={busy} onClick={retry} className={BTN_COMPACT}>Try again</button>}
          <button type="button" disabled={busy} onClick={dismiss} className={BTN_COMPACT}>Not an expense</button>
        </>} />
    </li>
  );
}

// Nothing here counts as money until a person presses OK. Hidden when empty.
export default function ReceiptsToConfirm({ receipts, me, users, clients, projects, onChanged, className }) {
  if (!receipts.length) return null;
  return (
    <div className={`${CARD_PADDED} ${className || ''}`}>
      <h2 className={`${CARD_TITLE} mb-1`}>Needs your OK <span className="font-normal text-slate-500 tabular-nums">({receipts.length})</span></h2>
      <p className={`${HELPER} mb-3`}>These do not count in any total until you press OK.</p>
      <ul className="space-y-3">
        {receipts.map(r => (
          <Receipt key={r.id} receipt={r} me={me} users={users} clients={clients} projects={projects} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}
