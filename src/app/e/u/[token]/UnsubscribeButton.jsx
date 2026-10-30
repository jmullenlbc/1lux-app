'use client';
import { useState } from 'react';
import { BTN_COMPACT_PRIMARY } from '@/components/ui/tokens';

export default function UnsubscribeButton({ token, email, already }) {
  const [done, setDone] = useState(already);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/e/u/${token}`, { method: 'POST' }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok) setDone(true);
    else setError(data.error || 'We could not reach our server, so nothing changed. Try again in a minute. (CAMPAIGN_UNSUB_NETWORK)');
  }

  if (done) return <p className="mt-3 text-sm text-gray-700">Done. {email} will not get these emails again.</p>;
  return (
    <div className="mt-3">
      <p className="text-sm text-gray-600">Stop marketing emails to <span className="font-medium text-gray-900">{email}</span>?</p>
      <button type="button" onClick={go} disabled={busy} className={`${BTN_COMPACT_PRIMARY} mt-4`}>
        {busy ? 'Working...' : 'Unsubscribe'}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
