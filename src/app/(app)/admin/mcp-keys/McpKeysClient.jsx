'use client';

/**
 * The AI Access Keys screen.
 *
 * Two things this screen has to get right, and they are both about the moment a
 * key is created:
 *
 *   1. The key is shown ONCE. There is no stored copy to come back for, so the
 *      panel that shows it is deliberately loud, sticky, and does not disappear
 *      on its own. The person dismisses it when they have the key, not before.
 *   2. Revoking is not deleting. The row stays with a "Revoked" stamp so the
 *      audit trail still explains itself months later.
 */

import { useCallback, useEffect, useState } from 'react';
import { WidgetLoading } from '@/components/ui/WidgetFrame';

const ROLE_LABEL = {
  SUPER_ADMIN: 'Super Admin',
  ILC_ADMIN: 'Super Admin',
  COMPANY_ADMIN: 'Admin',
  ADMIN: 'Admin',
  USER: 'Team member',
  CLIENT_VIEWER: 'Client (outside ILC)',
};

function when(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function McpKeysClient({ users }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState(null); // { token, name, who }
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/mcp-keys');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not load the keys.');
      setKeys(data.keys || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!name.trim() || !userId) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/mcp-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not create the key.');
      const owner = users.find(u => u.id === userId);
      setFreshToken({ token: data.token, name: name.trim(), who: owner?.name || owner?.email || '' });
      setCopied(false);
      setName('');
      setUserId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function setRevoked(key, revoked) {
    // Asked out loud, because the key stops working the instant this returns and
    // whatever was using it will start failing.
    const verb = revoked ? 'Turn off' : 'Turn back on';
    if (!window.confirm(`${verb} "${key.name}"? ${revoked
      ? 'Anything using this key stops working immediately. The key cannot be recovered, a replacement has to be issued.'
      : 'This key will start working again straight away.'}`)) return;
    try {
      const res = await fetch(`/api/admin/mcp-keys/${key.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not change the key.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(freshToken.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const live = keys.filter(k => !k.revokedAt);
  const off = keys.filter(k => k.revokedAt);

  return (
    <div className="px-6 py-6 space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {freshToken && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <h2 className="font-semibold text-green-900">
            Key created for {freshToken.who}
          </h2>
          <p className="text-sm text-green-800 mt-1">
            Copy it now. This is the only time it will ever be shown &mdash; nobody,
            including you, can look it up again afterwards.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg border border-green-200 bg-white text-xs font-mono break-all text-slate-800">
              {freshToken.token}
            </code>
            <button
              type="button"
              onClick={copy}
              className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 whitespace-nowrap"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFreshToken(null)}
            className="mt-3 text-sm text-green-800 underline"
          >
            I have saved it &mdash; hide this
          </button>
        </div>
      )}

      <form onSubmit={create} className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <h2 className="font-semibold text-slate-900">Issue a new key</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">What is it for?</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Mike's laptop assistant"
              className="w-full px-3 py-2 rounded border border-slate-300 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Who does it belong to?</span>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="w-full px-3 py-2 rounded border border-slate-300 text-sm bg-white"
            >
              <option value="">Choose a person…</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {(u.name || u.email)}, {ROLE_LABEL[u.role] || u.role}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={creating || !name.trim() || !userId}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-40 whitespace-nowrap"
          >
            {creating ? 'Creating…' : 'Create key'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          The key shows whoever holds it exactly what that person can see in the app.
          Give one to a client viewer and it stays inside the client view.
        </p>
      </form>

      <section>
        <h2 className="font-semibold text-slate-900 mb-2">Active keys</h2>
        {loading ? (
          <WidgetLoading />
        ) : live.length === 0 ? (
          <p className="text-sm text-slate-500">No keys yet.</p>
        ) : (
          <KeyTable rows={live} onToggle={k => setRevoked(k, true)} actionLabel="Turn off" />
        )}
      </section>

      {off.length > 0 && (
        <section>
          <h2 className="font-semibold text-slate-900 mb-2">Turned off</h2>
          <p className="text-xs text-slate-500 mb-2">
            Kept on purpose, so old records still say which key asked what.
          </p>
          <KeyTable rows={off} onToggle={k => setRevoked(k, false)} actionLabel="Turn back on" muted />
        </section>
      )}
    </div>
  );
}

function KeyTable({ rows, onToggle, actionLabel, muted }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Name</th>
            <th className="text-left px-4 py-2 font-medium">Belongs to</th>
            <th className="text-left px-4 py-2 font-medium">Key</th>
            <th className="text-left px-4 py-2 font-medium">Created</th>
            <th className="text-left px-4 py-2 font-medium">Last used</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(k => (
            <tr key={k.id} className={muted ? 'text-slate-500' : 'text-slate-700'}>
              <td className="px-4 py-2 font-medium">{k.name}</td>
              <td className="px-4 py-2">
                {k.user?.name || k.user?.email || 'Unknown'}
                <span className="block text-xs text-slate-500">
                  {ROLE_LABEL[k.user?.role] || k.user?.role || ''}
                </span>
              </td>
              <td className="px-4 py-2 font-mono text-xs">{k.prefix}…</td>
              <td className="px-4 py-2">{when(k.createdAt)}</td>
              <td className="px-4 py-2">{k.lastUsedAt ? when(k.lastUsedAt) : 'Never'}</td>
              <td className="px-4 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onToggle(k)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 underline whitespace-nowrap"
                >
                  {actionLabel}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
