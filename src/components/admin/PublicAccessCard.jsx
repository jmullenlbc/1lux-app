'use client';

import { useEffect, useState } from 'react';
import { CARD_PADDED, CARD_TITLE, HELPER, INPUT, BTN_PRIMARY, BTN_SECONDARY } from '@/components/ui/tokens';

/**
 * Admin control for the password on the public /conceptual_budget tool
 * (Mike 10-7). Shows the current password, lets an admin change it or clear
 * it. Clearing opens the tool to everyone; changing it signs every visitor
 * out at once (their cookie no longer matches).
 */
export default function PublicAccessCard() {
  const [current, setCurrent] = useState(null);   // null = loading
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch('/api/admin/intake/access')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load'))))
      .then(d => { setCurrent(d.password || ''); setDraft(d.password || ''); })
      .catch(() => setCurrent(''));
  }, []);

  async function save(value) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/intake/access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setCurrent(data.password);
      setDraft(data.password);
      setMsg(data.password ? 'Saved. Visitors must enter the new password.' : 'Password removed. The tool is open to everyone.');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const changed = current !== null && draft.trim() !== current;

  return (
    <div className={`mb-6 ${CARD_PADDED}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={CARD_TITLE}>Public budget tool password</h2>
          <p className={`${HELPER} mt-0.5`}>
            Visitors to the public conceptual budget page must type this before they can start.
            {current === '' && <span className="ml-1 font-semibold text-amber-700">No password set: the tool is open to everyone.</span>}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={draft}
            disabled={current === null || busy}
            onChange={e => setDraft(e.target.value)}
            placeholder="Leave empty to open the tool to everyone"
            className={`${INPUT} pr-16`}
          />
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-800">
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <button type="button" onClick={() => save(draft)} disabled={!changed || busy}
          className={BTN_PRIMARY}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        {current && (
          <button type="button" onClick={() => save('')} disabled={busy}
            className={BTN_SECONDARY}>
            Remove password
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-slate-600 mt-2">{msg}</p>}
    </div>
  );
}
