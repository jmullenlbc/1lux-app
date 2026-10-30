'use client';
import { useState, useEffect, useCallback } from 'react';
import { CARD_PADDED, CARD_TITLE, HELPER, INPUT, TD, BTN_COMPACT } from '@/components/ui/tokens';
import { WidgetEmpty } from '@/components/ui/WidgetFrame';
import { formatWhen } from '@/components/salesDocs/SalesDocsUi';
import { jsonCall } from './CampaignUi';

// The do-not-email list (0147). Unsubscribes land here by themselves; staff
// can add someone who asked by phone or reply. Only a sales admin can take
// someone off, and the row stays.

const REASON = { UNSUBSCRIBE: 'Unsubscribed', BOUNCE: 'Bounced', COMPLAINT: 'Marked spam', MANUAL: 'Added by staff' };

export default function DoNotEmail() {
  const [rows, setRows] = useState(null);
  const [canLift, setCanLift] = useState(false);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const res = await fetch('/api/campaign-suppressions');
    const d = res.ok ? await res.json() : { suppressions: [] };
    setRows(d.suppressions);
    setCanLift(!!d.canLift);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setErr('');
    const r = await jsonCall('/api/campaign-suppressions', 'POST', { email });
    if (r.error) setErr(r.error); else { setEmail(''); load(); }
  }
  async function lift(id) {
    const r = await jsonCall('/api/campaign-suppressions', 'PATCH', { id, lifted: true });
    if (r.error) setErr(r.error); else load();
  }

  return (
    <div className={CARD_PADDED}>
      <p className={CARD_TITLE}>Do not email</p>
      <p className={`${HELPER} mt-0.5`}>No campaign ever goes to these addresses. Unsubscribes land here by themselves.</p>
      <form onSubmit={add} className="mt-3 flex gap-2 max-w-md">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Add an email address" className={INPUT} />
        <button type="submit" disabled={!email.trim()} className={BTN_COMPACT}>Add</button>
      </form>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      <div className="mt-3 overflow-x-auto">
        {!rows?.length ? <WidgetEmpty>Nobody yet.</WidgetEmpty> : (
          <table className="min-w-full">
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className={TD}>{s.email}{s.contact && <div className="text-xs text-slate-500">{s.contact.name}</div>}</td>
                  <td className={TD}>{REASON[s.reason] || s.reason}{s.campaign && <div className="text-xs text-slate-500">From {s.campaign.name}</div>}</td>
                  <td className={`${TD} text-xs text-slate-500`}>{formatWhen(s.createdAt)}</td>
                  <td className={`${TD} text-right`}>{canLift && <button type="button" onClick={() => lift(s.id)} className={BTN_COMPACT}>They asked back in</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
