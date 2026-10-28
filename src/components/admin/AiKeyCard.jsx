'use client';

import { useEffect, useState } from 'react';
import { CARD_PADDED, CARD_TITLE, HELPER, INPUT, BTN_PRIMARY, BTN_SECONDARY } from '@/components/ui/tokens';

/**
 * Admin control for the AI key (Mike 10-28: change it without AWS). The key is
 * tested with Anthropic before it is saved and is never shown again, not even
 * in part. Removing it falls back to the server's own key.
 */
const SOURCE_TEXT = {
  app: 'Using the key saved here',
  server: 'Using the server key (set in AWS)',
  none: 'No key set',
};

export default function AiKeyCard() {
  const [info, setInfo] = useState(null);   // null = loading
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  function load() {
    fetch('/api/admin/ai-key')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load'))))
      .then(setInfo)
      .catch(() => setInfo({ failed: true }));
  }
  useEffect(load, []);

  async function save(value) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/ai-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save. Nothing was changed. Try again. (AIKEY-SAVE)');
      setDraft('');
      setMsg(value ? 'Saved and working. Every AI feature uses it within a minute.' : 'Removed. The server key is used again.');
      load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (info?.failed) return null; // not a super admin

  return (
    <div className={`mb-6 ${CARD_PADDED}`}>
      <h2 className={CARD_TITLE}>AI key</h2>
      <p className={`${HELPER} mt-0.5`}>
        The Anthropic key every AI feature uses. Paste a new one here instead of changing it in AWS. It is tested before it is saved and is never shown again.
      </p>
      {info && (
        <p className="text-sm mt-2">
          <span className="font-semibold">{SOURCE_TEXT[info.source] || ''}</span>
          {info.savedAt && <span className="text-slate-500">, saved {new Date(info.savedAt).toLocaleDateString()}{info.savedBy ? ` by ${info.savedBy}` : ''}</span>}
          {'. '}
          {info.working
            ? <span className="text-green-700 font-semibold">Working.</span>
            : <span className="text-amber-700 font-semibold">Not working{info.status ? ` (Anthropic said ${info.status})` : ''}. AI features will fail until a working key is saved.</span>}
          {info.unreadable && <span className="text-amber-700"> The saved key could not be read; save it again.</span>}
        </p>
      )}
      <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          type="password"
          autoComplete="off"
          value={draft}
          disabled={info === null || busy}
          onChange={e => setDraft(e.target.value)}
          placeholder="Paste a new key (starts with sk-ant-)"
          className={`${INPUT} flex-1`}
        />
        <button type="button" onClick={() => save(draft)} disabled={!draft.trim() || busy} className={BTN_PRIMARY}>
          {busy ? 'Testing…' : 'Test and save'}
        </button>
        {info?.source === 'app' && (
          <button type="button" onClick={() => save('')} disabled={busy} className={BTN_SECONDARY}>
            Use the server key
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-slate-600 mt-2">{msg}</p>}
    </div>
  );
}
