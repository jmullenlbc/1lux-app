'use client';

import { useEffect, useState } from 'react';

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
    <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Public budget tool password</h2>
          <p className="text-xs text-slate-500 mt-0.5">
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
            className="w-full px-3 py-2 pr-16 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-slate-50"
          />
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-800">
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <button type="button" onClick={() => save(draft)} disabled={!changed || busy}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50">
          {busy ? 'Saving…' : 'Save password'}
        </button>
        {current && (
          <button type="button" onClick={() => save('')} disabled={busy}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-colors disabled:opacity-50">
            Remove password
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-slate-600 mt-2">{msg}</p>}
    </div>
  );
}
