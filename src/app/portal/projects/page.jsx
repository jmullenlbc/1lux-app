'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function PortalProjectsPage() {
  const router = useRouter();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/auth/me')
      .then(r => {
        if (r.status === 401) { router.replace('/portal/login'); return null; }
        return r.json();
      })
      .then(d => { if (d) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading…</div>;
  if (!data)   return null;

  // If only one project, redirect immediately
  if (data.projects.length === 1) {
    router.replace(`/portal/projects/${data.projects[0].projectId}`);
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">My Projects</h1>
        <p className="text-sm text-slate-400 mt-1">Welcome back, {data.user.name}</p>
      </div>

      {data.projects.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">No active projects. Contact your ILC project manager.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.projects.map(p => (
            <Link
              key={p.projectId}
              href={`/portal/projects/${p.projectId}`}
              className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-amber-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                  </svg>
                </div>
                <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-800 group-hover:text-amber-700 transition-colors">{p.projectName}</h3>
              <p className="text-xs text-slate-400 mt-1">{p.role}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
