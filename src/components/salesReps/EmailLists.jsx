'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';

// Quotes and Orders email lists for a rep or a buy direct manufacturer (0144).
// RFQs go to Quotes; POs will go to Orders. One address per line, or commas.

const join = (emails, purpose) => emails.filter((e) => e.purpose === purpose).map((e) => e.email).join('\n');

export default function EmailLists({ emails = [], onSave, hint }) {
  const [quotes, setQuotes] = useState(join(emails, 'QUOTES'));
  const [orders, setOrders] = useState(join(emails, 'ORDERS'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dirty = quotes !== join(emails, 'QUOTES') || orders !== join(emails, 'ORDERS');

  async function save() {
    setBusy(true); setErr('');
    const e = await onSave({ QUOTES: quotes, ORDERS: orders });
    if (e) setErr(e);
    setBusy(false);
  }

  const box = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono min-h-[5.5rem]';
  return (
    <div className="space-y-3">
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quotes emails (RFQs go here)</span>
          <textarea className={box} value={quotes} onChange={(e) => setQuotes(e.target.value)} placeholder="quotes@rep.com" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Orders emails (POs go here)</span>
          <textarea className={box} value={orders} onChange={(e) => setOrders(e.target.value)} placeholder="orders@rep.com" />
        </label>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {dirty && (
        <div className="flex gap-2">
          <Button size="sm" onClick={save} loading={busy}>Save emails</Button>
          <Button size="sm" variant="secondary" onClick={() => { setQuotes(join(emails, 'QUOTES')); setOrders(join(emails, 'ORDERS')); setErr(''); }}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
