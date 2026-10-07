'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h1 className="text-xl font-bold text-slate-900">Conceptual Lighting Budget</h1>
        <p className="text-sm text-slate-500 mt-1 mb-5">
          This tool is in a private preview. Enter the password ILC Studios gave you.
        </p>
        <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="cb-password">Password</label>
        <input
          id="cb-password"
          type="password"
          autoFocus
          autoComplete="off"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password.trim()}
          className="mt-4 w-full px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
