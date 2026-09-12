'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const SECTIONS = [
  { key: 'clients',  title: 'Companies', empty: 'No archived companies.' },
  { key: 'projects', title: 'Projects',  empty: 'No archived projects.' },
  { key: 'contacts', title: 'People',    empty: 'No archived people.' },
  { key: 'notes',    title: 'Notes',     empty: 'No archived notes.' },
  { key: 'files',    title: 'Files',           empty: 'No archived files.' },
  { key: 'drawings', title: 'Drawing sets',    empty: 'No archived drawing sets.' },
  { key: 'budgets',  title: 'Budget versions', empty: 'No archived budget versions.' },
  { key: 'products', title: 'Products',        empty: 'No archived products.' },
];

function fmt(iso) {
  return iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
}

export default function ArchiveClient({ sections }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);
  const [errors, setErrors] = useState({});

  async function restore(row) {
    setBusyId(row.id);
    setErrors(e => ({ ...e, [row.id]: '' }));
    try {
      const res = await fetch(row.restoreUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors(e => ({ ...e, [row.id]: data.error || 'Could not restore it.' }));
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const total = SECTIONS.reduce((n, s) => n + (sections[s.key]?.length || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Archive</h1>
        <p className="text-slate-500 text-sm mt-1">
          Companies, projects, people, notes, files, drawing sets, budget versions and products
          are never deleted. Archived ones are hidden from every list, picker and dashboard, and
          everything linked to them is kept. Restore puts one back exactly as it was.
        </p>
      </div>

      {total === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-10 text-center text-sm text-slate-500">
          Nothing has been archived yet.
        </div>
      )}

      {total > 0 && SECTIONS.map(s => {
        const rows = sections[s.key] || [];
        return (
          <section key={s.key} className="mb-8">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">
              {s.title} <span className="font-normal text-slate-400">({rows.length})</span>
            </h2>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {rows.length === 0 && (
                <p className="px-5 py-3 text-sm text-slate-400">{s.empty}</p>
              )}
              {rows.map(row => (
                <div key={row.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="min-w-0 flex-1">
                    {row.href ? (
                      <Link href={row.href} className="text-sm font-medium text-slate-800 hover:text-amber-600 transition-colors">
                        {row.label}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-slate-800">{row.label}</span>
                    )}
                    {row.sub && <p className="text-xs text-slate-500 truncate">{row.sub}</p>}
                  </div>
                  <span className="text-xs text-slate-400">
                    Archived {fmt(row.archivedAt)}{row.archivedBy ? ` by ${row.archivedBy}` : ''}
                  </span>
                  {errors[row.id] && <span className="text-xs text-red-600 w-full sm:w-auto">{errors[row.id]}</span>}
                  {row.restoreUrl ? (
                    <button
                      type="button"
                      onClick={() => restore(row)}
                      disabled={busyId === row.id}
                      className="px-3 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-semibold transition-colors disabled:opacity-60"
                    >
                      {busyId === row.id ? 'Restoring…' : 'Restore'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Cannot be restored here</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
