'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// The strip across the top of an archived company or project. Archived
// records drop out of every list, but a bookmark or an old link still opens
// the page — this says why it is missing everywhere else, and puts it back.
const RESTORE_URL = {
  client:  id => `/api/clients/${id}`,
  project: id => `/api/projects/${id}`,
};
const WORD = { client: 'company', project: 'project' };

export default function ArchivedBanner({ kind, id, archivedAt, archivedBy, canRestore = true }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  const when = archivedAt
    ? new Date(archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  async function restore() {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(RESTORE_URL[kind](id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error || 'Could not restore it.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-6xl mx-auto px-6 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        <span className="text-amber-900">
          <strong>This {WORD[kind]} is archived</strong>
          {when && <> on {when}</>}
          {archivedBy && <> by {archivedBy}</>}
          . It is hidden from every list, picker and dashboard. Nothing about it was deleted.
        </span>
        <div className="ml-auto flex items-center gap-3">
          {err && <span className="text-xs text-red-600">{err}</span>}
          <Link href="/archive" className="text-xs text-amber-700 hover:text-amber-900 transition-colors">
            Archive page
          </Link>
          {canRestore && (
            <button
              type="button"
              onClick={restore}
              disabled={busy}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-60"
            >
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
