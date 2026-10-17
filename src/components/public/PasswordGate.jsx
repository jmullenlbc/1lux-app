'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BTN_PRIMARY, CARD, H1, INPUT, LABEL } from '@/components/ui/tokens';
import { PublicBugLink } from '@/components/public/PublicBugButton';
import { classifyIntakeEmail } from '@/lib/intake';
import { readRememberedEmail, rememberEmail } from '@/lib/publicVisitor';

/**
 * The password screen in front of the public conceptual budget tool
 * (Mike 10-7). On success the server sets a cookie and the page reloads into
 * the tool at the same URL, so a saved-budget link still lands on the draft.
 *
 * The work email (Mike 10-17) is asked here too. It stays in this browser
 * (publicVisitor.js) and fills About You and the company portal; the server
 * also records it on a right password (ConceptualSignIn, 0133). The
 * username + current-password pair lets the browser offer to save both.
 */
export default function PasswordGate() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setEmail(readRememberedEmail()); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!password.trim() || busy) return;
    const check = classifyIntakeEmail(email.trim());
    if (!check?.ok) { setError(check?.message || 'Type your work email.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/intake/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That password is not right.');
      rememberEmail(email);
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
          This tool is in a private preview. Sign in with your work email and the password ILC Studios gave you.
        </p>
        <label className={`${LABEL} block mb-1`} htmlFor="cb-email">Work email</label>
        <input
          id="cb-email"
          name="username"
          type="email"
          autoComplete="username"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="jane@yourcompany.com"
          className={`${INPUT} mb-3`}
        />
        <label className={`${LABEL} block mb-1`} htmlFor="cb-password">Password</label>
        <input
          id="cb-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className={INPUT}
        />
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password.trim() || !email.trim()}
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
