'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLE_LABELS = {
  SUPER_ADMIN:    'Super Admin',
  ILC_ADMIN:      'Super Admin',
  COMPANY_ADMIN:  'Company Admin',
  ADMIN:          'Company Admin',
  USER:           'User',
  CLIENT_VIEWER:  'Client Viewer',
};

export default function ProfileClient({ user }) {
  const router = useRouter();

  // ── Name editing ──────────────────────────────────────────────────────────
  const [name,        setName]        = useState(user?.name || '');
  const [savingName,  setSavingName]  = useState(false);
  const [nameMsg,     setNameMsg]     = useState(null);

  async function handleSaveName() {
    setSavingName(true);
    setNameMsg(null);
    try {
      const res = await fetch('/api/admin/users/' + user.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setNameMsg({ type: 'success', text: 'Name updated.' });
      router.refresh();
    } catch (err) {
      setNameMsg({ type: 'error', text: err.message });
    } finally {
      setSavingName(false);
    }
  }

  // ── Password change ────────────────────────────────────────────────────────
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg,    setPwMsg]    = useState(null);

  async function handleChangePw() {
    if (pw.next.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return; }
    if (pw.next !== pw.confirm) { setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return; }
    setSavingPw(true);
    setPwMsg(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message });
    } finally {
      setSavingPw(false);
    }
  }

  const initials = (user?.name || user?.email || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account information and password.</p>
      </div>

      {/* Avatar + role card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {initials}
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-800">{user?.name || user?.email}</div>
            <div className="text-sm text-slate-500">{user?.email}</div>
            <span className="inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {ROLE_LABELS[user?.role] || user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Display name */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Display Name</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your full name"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          <button
            onClick={handleSaveName}
            disabled={savingName || !name.trim() || name.trim() === (user?.name || '')}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-40"
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
        {nameMsg && (
          <p className={`text-xs mt-2 ${nameMsg.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
            {nameMsg.text}
          </p>
        )}
      </div>

      {/* Change password */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Change Password</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Current password</label>
            <input
              type="password"
              value={pw.current}
              onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">New password</label>
            <input
              type="password"
              value={pw.next}
              onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Confirm new password</label>
            <input
              type="password"
              value={pw.confirm}
              onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              autoComplete="new-password"
            />
          </div>
        </div>
        {pwMsg && (
          <p className={`text-xs mt-2 ${pwMsg.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
            {pwMsg.text}
          </p>
        )}
        <button
          onClick={handleChangePw}
          disabled={savingPw || !pw.current || !pw.next || !pw.confirm}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-900 text-white transition-colors disabled:opacity-40"
        >
          {savingPw ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </div>
  );
}
