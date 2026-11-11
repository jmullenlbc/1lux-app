'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BTN_PRIMARY, CARD, H1, HELPER, INPUT } from '@/components/ui/tokens';

export default function PortalLoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [errMsg,   setErrMsg]   = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setErrMsg('');
    setLoading(true);

    const res  = await fetch('/api/portal/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setErrMsg(data.error || 'Login failed');
    } else {
      router.replace('/portal/projects');
    }
  }

  return (
    <div className="max-w-sm mx-auto pt-8">
      <div className={`${CARD} p-8`}>
        <div className="mb-6 text-center">
          <h1 className={H1}>Portal Login</h1>
          <p className={`${HELPER} mt-1`}>Sign in to view your project updates</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={INPUT}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={INPUT}
            />
          </div>

          {errMsg && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`${BTN_PRIMARY} w-full`}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className={`${HELPER} text-center mt-5`}>
          Need access? Contact your project manager.
        </p>
      </div>
    </div>
  );
}
