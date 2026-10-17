'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BTN_PRIMARY, CARD, H1, INPUT, LABEL } from '@/components/ui/tokens';
import { PublicBugLink } from '@/components/public/PublicBugButton';

/**
 * The password screen in front of the public conceptual budget tool
 * (Mike 10-7). On success the server sets a cookie and the page reloads into
 * the tool at the same URL, so a saved-budget link still lands on the draft.
 */
export default function PasswordGate() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/intake/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That password is not right.');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form onSubmit={submit} className={`${CARD} w-full max-w-sm p-5`}>
        <h1 className={H1}>Conceptual Lighting Budget</h1>
        <p className="text-sm text-slate-500 mt-1 mb-5">
          This tool is in a private preview. Enter the password ILC Studios gave you.
        </p>
        <label className={`${LABEL} block mb-1`} htmlFor="cb-password">Password</label>
        <input
          id="cb-password"
          type="password"
          autoFocus
          autoComplete="off"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className={INPUT}
        />
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password.trim()}
          className={`${BTN_PRIMARY} mt-4 w-full`}
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <div className="mt-4 flex justify-center">
          <PublicBugLink />
        </div>
      </form>
    </div>
  );
}
