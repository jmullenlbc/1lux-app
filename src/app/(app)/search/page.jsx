'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Search (phone bottom bar, Mike 9-26): one box for people, companies and
// projects. People get tap-to-call and tap-to-email right in the list.
export default function SearchPage() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes(null); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Search failed.');
        setRes(d); setErr('');
      } catch (e) { setErr(e.message === 'Failed to fetch' ? 'No signal. Try again in a moment.' : e.message); }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  const none = res && !res.people.length && !res.companies.length && !res.projects.length;
  const row = 'block min-h-[48px] px-3 py-2.5 hover:bg-amber-50';

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <input autoFocus type="search" value={q} onChange={e => setQ(e.target.value)} enterKeyHint="search"
        placeholder="Search people, companies, projects"
        className="w-full min-h-[48px] rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none focus:border-amber-400" />
      {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
      {none && <p className="mt-6 text-sm text-slate-400 text-center">Nothing found for "{q.trim()}".</p>}

      {res?.people.length > 0 && (
        <Group title="People">
          {res.people.map(p => (
            <li key={p.id} className="flex items-center gap-2 pr-2">
              <Link href={p.client ? `/clients/${p.client.id}` : '/crm/contacts'} className={`${row} flex-1 min-w-0`}>
                <span className="block text-sm font-medium text-slate-800 truncate">{p.name}</span>
                <span className="block text-xs text-slate-400 truncate">{[p.title, p.client?.name].filter(Boolean).join(', ')}</span>
              </Link>
              {p.phone && <a href={`tel:${p.phone}`} className="shrink-0 min-h-[40px] px-3 flex items-center rounded-lg border border-slate-200 text-xs font-medium text-slate-600">Call</a>}
              {p.email && <a href={`mailto:${p.email}`} className="shrink-0 min-h-[40px] px-3 flex items-center rounded-lg border border-slate-200 text-xs font-medium text-slate-600">Email</a>}
            </li>
          ))}
        </Group>
      )}
      {res?.companies.length > 0 && (
        <Group title="Companies">
          {res.companies.map(c => (
            <li key={c.id}><Link href={`/clients/${c.id}`} className={row}><span className="text-sm font-medium text-slate-800">{c.name}</span></Link></li>
          ))}
        </Group>
      )}
      {res?.projects.length > 0 && (
        <Group title="Projects">
          {res.projects.map(p => (
            <li key={p.id}>
              <Link href={`/project/${p.id}`} className={row}>
                <span className="block text-sm font-medium text-slate-800 truncate">{p.name}</span>
                {p.client?.name && <span className="block text-xs text-slate-400 truncate">{p.client.name}</span>}
              </Link>
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }) {
  return (
    <section className="mt-5">
      <h2 className="px-1 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">{children}</ul>
    </section>
  );
}
