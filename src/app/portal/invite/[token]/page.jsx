'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BTN_PRIMARY, CARD, H1, INPUT } from '@/components/ui/tokens';

export default function InvitePage({ params }) {
  const router = useRouter();
  const [step,     setStep]     = useState('loading'); // loading | form | error | done
  const [info,     setInfo]     = useState(null);
  const [errMsg,   setErrMsg]   = useState('');
  const [name,     setName]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    fetch(`/api/portal/invite/${params.token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          if (d.alreadyAccepted) {
            setStep('already-accepted');
          } else {
            setErrMsg(d.error);
            setStep('error');
          }
        } else {
          setInfo(d);
          setName(d.contact.name || '');
          setStep('form');
        }
      })
      .catch(() => { setErrMsg('Something went wrong. Please try again.'); setStep('error'); });
  }, [params.token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setErrMsg('Passwords do not match'); return; }
    if (password.length < 8)  { setErrMsg('Password must be at least 8 characters'); return; }
    setErrMsg('');
    setSaving(true);

    const res  = await fetch(`/api/portal/invite/${params.token}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, password }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setErrMsg(data.error || 'Something went wrong');
    } else {
      router.replace(`/portal/projects/${data.projectId}`);
    }
  }

  if (step === 'loading') {
    return <div className="text-center py-20 text-sm text-slate-500">Validating your invite link…</div>;
  }

  if (step === 'error') {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Invite Link Issue</h2>
        <p className="text-sm text-slate-500 mb-6">{errMsg}</p>
        <a href="/portal/login" className="text-orange-600 hover:text-orange-700 text-sm font-semibold">
          Go to Portal Login →
        </a>
      </div>
    );
  }

  if (step === 'already-accepted') {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Already Accepted</h2>
        <p className="text-sm text-slate-500 mb-6">You&apos;ve already set up your account. Log in to access your project portal.</p>
        <a href="/portal/login"
          className={BTN_PRIMARY}>
          Go to Login
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className={`${CARD} p-8`}>
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className={H1}>Welcome to your Project Portal</h1>
          <p className="text-sm text-slate-500 mt-1">
            You&apos;ve been invited to view <strong>{info?.project?.name}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className={INPUT}
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={info?.contact?.email || ''}
              readOnly
              className={INPUT}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Create Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              className={INPUT}
            />
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className={INPUT}
            />
          </div>

          {errMsg && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errMsg}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className={`${BTN_PRIMARY} w-full`}
          >
            {saving ? 'Setting up your account…' : 'Accept Invitation'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          Already have an account?{' '}
          <a href="/portal/login" className="text-orange-600 hover:underline">Log in</a>
        </p>
      </div>
    </div>
  );
}
