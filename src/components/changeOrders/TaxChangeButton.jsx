'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { CARD_PADDED } from '@/components/ui/tokens';

const usd = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const INPUT = 'w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white';
const LABEL = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

/** Opens a small form that makes a tax only change order from a new rate and the day it started. */
export default function TaxChangeButton({ projectId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState('');
  const [date, setDate] = useState('');
  const [base, setBase] = useState('');
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreview(null);
    setErr('');
    if (!open || rate === '' || !date) return undefined;
    let live = true;
    const q = new URLSearchParams({ newPct: String(Number(rate) / 100), date, base });
    fetch(`/api/projects/${projectId}/change-orders/tax-change?${q}`)
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.ok) setPreview(d);
        else setErr(d.error || 'The server could not work out this change. Nothing was saved. Try again.');
      })
      .catch(() => live && setErr('Could not reach the server. Nothing was saved. Check your connection and try again.'));
    return () => { live = false; };
  }, [open, projectId, rate, date, base]);

  async function create() {
    setBusy(true);
    setErr('');
    const res = await fetch(`/api/projects/${projectId}/change-orders/tax-change`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPct: Number(rate) / 100, date, base: base === '' ? null : base }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok) router.push(`/project/${projectId}/change-orders/${d.id}`);
    else setErr(d.error || 'The change order was not made. Nothing was saved. Try again.');
  }

  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Tax rate change</Button>;

  return (
    <div className={`${CARD_PADDED} w-full space-y-3`}>
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Tax rate change</h3>
        <p className="text-xs text-slate-500">Every change order keeps the tax it printed. This makes one new change order for the difference on goods not delivered by that date.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={LABEL}>New rate %</label>
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Rate date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Goods not delivered</label>
          <input type="number" step="0.01" value={base} onChange={(e) => setBase(e.target.value)} placeholder={preview ? String(preview.undelivered) : 'From the Ship Schedule'} className={INPUT} />
        </div>
      </div>
      {preview && (
        <div className="text-xs text-slate-600 space-y-0.5">
          <p>{usd(preview.total)} on the job, {usd(preview.delivered)} delivered by that date.</p>
          {preview.lines.map((l) => <p key={l.description}>{l.description}: {usd(l.dollars)}</p>)}
          <p className="font-semibold text-slate-800">Change order total: {usd(preview.lines[0].dollars + preview.lines[1].dollars)}</p>
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2">
        <Button onClick={create} disabled={busy || !preview}>Make change order</Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
