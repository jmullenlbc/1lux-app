'use client';
import { useEffect, useState } from 'react';
import { CARD_PADDED, CARD_TITLE, HELPER, INPUT, BTN_PRIMARY } from '@/components/ui/tokens';

// The freight percent for a rep quote with no dollar figure and no brand history (Mike 11-1).
export default function RfqFreightCard() {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch('/api/admin/rfq-freight')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load'))))
      .then((d) => setDraft(String(d.percent)))
      .catch(() => setMsg('We could not load this setting. Reload the page.'));
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/rfq-freight', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percent: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'We could not save this. Nothing changed. Try again.');
      setDraft(String(data.percent));
      setMsg('Saved. Quotes use this percent from now on.');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`mb-6 ${CARD_PADDED}`}>
      <h2 className={CARD_TITLE}>Starting freight</h2>
      <p className={`${HELPER} mt-0.5`}>
        The percent of product used to estimate freight when a rep quote gives no dollars and the brand has no history yet.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input className={`${INPUT} w-24`} value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="decimal" aria-label="Starting freight percent" />
        <span className="text-sm text-slate-500">%</span>
        <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy || draft === ''}>{busy ? 'Saving...' : 'Save'}</button>
      </div>
      {msg && <p className="text-xs text-slate-600 mt-2">{msg}</p>}
    </div>
  );
}
