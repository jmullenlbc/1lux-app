'use client';
/**
 * Project People, the people attached to one job, and the one who owns it.
 *
 * Mike, 2026-09-09, on what he wanted: "you can just kind of choose people are
 * you want connected." Maram, on the same call, on why one of them is special:
 * "there always has to be like the one main point person and that's the only
 * person that's going to be considered for those fields." Their own won / lost
 * record follows the jobs they are the main contact on, so marking the wrong
 * person moves credit for the job onto them.
 *
 * These are OUR side's people, the ones on a client record. They are not the
 * outside guests on the Contacts tab, who get a portal login instead.
 */
import { useState, useEffect, useCallback } from 'react';
import { companyLink } from '@/lib/crmClient';

/** Who somebody works for, saying so out loud when we do not know. */
function Employer({ contact }) {
  const { state, label } = companyLink(contact);
  if (state === 'linked') return <span className="text-slate-500">{label}</span>;
  if (state === 'typed') {
    return (
      <span className="text-slate-500">
        {label}
        <span className="ml-1.5 text-[11px] text-amber-700" title="Typed by hand, not linked to a client record">
          not linked
        </span>
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      No company
    </span>
  );
}

export default function ProjectPeopleCard({ projectId }) {
  const [links,   setLinks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(null);   // contactId currently saving
  const [error,   setError]   = useState(null);

  const [search,  setSearch]  = useState('');
  const [results, setResults] = useState([]);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/projects/${projectId}/people`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setLinks(data.links || []);
      else setError(data.error || 'Could not load the people on this project.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Search runs a short beat after typing stops, so one keystroke is not one
  // round trip.
  useEffect(() => {
    const q = search.trim();
    if (!q) { setResults([]); return; }
    let alive = true;
    const timer = setTimeout(() => {
      fetch(`/api/crm/contacts?search=${encodeURIComponent(q)}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (alive && d) setResults(d.contacts || []); })
        .catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [search]);

  async function post(contactId, isLead) {
    setBusy(contactId);
    setError(null);
    const res  = await fetch(`/api/projects/${projectId}/people`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, isLead }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error || 'That did not save.'); return; }
    await load();
  }

  async function add(contact) {
    // The first person on a job is the main contact until somebody says
    // otherwise, a project with people but no owner helps nobody.
    await post(contact.id, links.length === 0);
    setSearch('');
    setResults([]);
    setPicking(false);
  }

  async function remove(contactId) {
    setBusy(contactId);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/people?contactId=${encodeURIComponent(contactId)}`, {
      method: 'DELETE',
    });
    setBusy(null);
    if (!res.ok) { setError('Could not take that person off the project.'); return; }
    await load();
  }

  const attachedIds = new Set(links.map(l => l.contactId ?? l.contact?.id));
  const candidates  = results.filter(c => !attachedIds.has(c.id));
  const hasLead     = links.some(l => l.isLead);

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 md:px-6 py-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Project People</p>
          {!loading && links.length > 0 && !hasLead && (
            <span
              className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"
              title="Nobody is marked as the main contact, so this job counts towards no one's record"
            >
              ⚠ no main contact
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPicking(v => !v)}
          className="text-xs font-semibold text-orange-600 hover:text-orange-700"
        >
          {picking ? 'Cancel' : '+ Add person'}
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {picking && (
        <div className="mb-4">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search people by name, email or title…"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {search.trim() && (
            <div className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  {results.length ? 'Everyone matching is already on this project.' : 'Nobody matches that yet.'}
                </p>
              ) : candidates.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => add(c)}
                  className="w-full text-left px-3 py-2 hover:bg-amber-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                  {c.title && <span className="ml-2 text-xs text-slate-500">{c.title}</span>}
                  <span className="ml-2 text-xs"><Employer contact={c} /></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-300 italic">Loading…</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-slate-300 italic">Nobody is on this project yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {links.map(link => {
            const c = link.contact || {};
            const saving = busy === c.id;
            return (
              <li key={link.id ?? c.id} className="py-2.5 flex flex-col md:flex-row md:items-start gap-2 md:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                    {link.isLead && (
                      <span
                        className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"
                        title="The one person responsible for this job. Only their record counts it as won or lost."
                      >
                        ★ Main contact
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                    {c.title && <span>{c.title}</span>}
                    <Employer contact={c} />
                    {c.email && <span className="truncate">{c.email}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {saving ? (
                    <span className="text-xs text-amber-500">Saving…</span>
                  ) : (
                    <>
                      {!link.isLead && (
                        <button
                          type="button"
                          onClick={() => post(c.id, true)}
                          className="text-xs font-semibold text-slate-500 hover:text-green-700"
                          title="Make this the one person responsible for the job"
                        >
                          Make main
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="text-xs font-semibold text-slate-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
        Anyone here is connected to the job. The main contact is the one it counts
        for, their own won and lost numbers come from the jobs they are main
        contact on, and nobody else's.
      </p>
    </div>
  );
}
