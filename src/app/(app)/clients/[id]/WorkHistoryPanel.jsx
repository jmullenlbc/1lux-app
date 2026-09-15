'use client';
/**
 * Work history for one person, opened from the People tab (migration 0083).
 * LinkedIn is never read by the app: copy the Experience section off their
 * profile, paste it here, and "Read it" turns it into jobs. Jobs can also be
 * typed in by hand. Meeting Prep reads these rows. Archive only — nothing is
 * deleted.
 */
import { useState, useEffect } from 'react';
import { describeJob, MAX_PASTE_CHARS } from '@/lib/workHistory';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EMPTY_JOB = { company: '', title: '', startMonth: '', startYear: '', endMonth: '', endYear: '', isCurrent: false };

const inputCls = 'border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';

export default function WorkHistoryPanel({ clientId, contactId, name }) {
  const url = `/api/clients/${clientId}/contacts/${contactId}/work-history`;
  const [jobs, setJobs]       = useState(null);
  const [paste, setPaste]     = useState('');
  const [adding, setAdding]   = useState(null); // null | job draft
  const [busy, setBusy]       = useState('');   // '' | 'read' | 'add' | row id
  const [error, setError]     = useState('');
  const [notice, setNotice]   = useState('');

  useEffect(() => {
    let live = true;
    fetch(url)
      .then(r => (r.ok ? r.json() : { jobs: [] }))
      .then(d => { if (live) setJobs(d.jobs || []); })
      .catch(() => { if (live) setJobs([]); });
    return () => { live = false; };
  }, [url]);

  async function send(method, body, which) {
    setBusy(which); setError(''); setNotice('');
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Could not save that (error ${r.status}).`);
      setJobs(d.jobs || []);
      return d;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy('');
    }
  }

  async function readPaste() {
    const d = await send('POST', { text: paste }, 'read');
    if (d) { setPaste(''); setNotice(`Read ${d.read} job${d.read === 1 ? '' : 's'}. Check them below.`); }
  }

  async function addJob() {
    const n = v => (v === '' ? null : Number(v));
    const d = await send('POST', { row: {
      company: adding.company, title: adding.title,
      startYear: n(adding.startYear), startMonth: n(adding.startMonth),
      endYear: adding.isCurrent ? null : n(adding.endYear), endMonth: adding.isCurrent ? null : n(adding.endMonth),
      isCurrent: adding.isCurrent,
    } }, 'add');
    if (d) setAdding(null);
  }

  const set = (k, v) => setAdding(a => ({ ...a, [k]: v }));
  const monthSelect = (k) => (
    <select value={adding[k]} onChange={e => set(k, e.target.value)} className={inputCls}>
      <option value="">Month</option>
      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
    </select>
  );

  return (
    <div className="mt-2 ml-1 border-l-2 border-amber-200 pl-3 py-1 space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">Work history</p>

      {jobs === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : jobs.length ? (
        <ul className="space-y-0.5">
          {jobs.map(j => (
            <li key={j.id} className="group/job flex items-center gap-2 text-sm text-slate-700">
              <span>{describeJob(j)}</span>
              {j.source === 'linkedin_paste' && <span className="text-[10px] text-slate-400">from LinkedIn paste</span>}
              <button type="button" onClick={() => send('PATCH', { id: j.id, archived: true }, j.id)} disabled={busy === j.id}
                className="text-[11px] text-slate-300 hover:text-amber-600 opacity-0 group-hover/job:opacity-100 disabled:opacity-50"
                title="Archive this job. It can be restored later.">
                {busy === j.id ? 'Archiving…' : 'Archive'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Nothing on file for {name || 'this person'} yet.</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {notice && <p className="text-xs text-green-700">{notice}</p>}

      <div>
        <textarea
          value={paste}
          onChange={e => setPaste(e.target.value)}
          maxLength={MAX_PASTE_CHARS}
          rows={3}
          placeholder="Open their LinkedIn profile, copy the Experience section, and paste it here."
          className={`${inputCls} w-full text-xs`}
        />
        <div className="flex items-center gap-3 mt-1">
          <button type="button" onClick={readPaste} disabled={!paste.trim() || busy === 'read'}
            className="px-3 py-1 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
            {busy === 'read' ? 'Reading…' : 'Read it'}
          </button>
          <span className="text-[11px] text-slate-400">Reading a new paste replaces the jobs from the last paste. Jobs typed in by hand stay.</span>
        </div>
      </div>

      {adding === null ? (
        <button type="button" onClick={() => { setAdding({ ...EMPTY_JOB }); setError(''); }}
          className="text-xs text-amber-600 hover:text-amber-500">+ Add a job by hand</button>
      ) : (
        <div className="space-y-2 bg-slate-50 rounded-lg p-2">
          <div className="flex flex-wrap gap-2">
            <input autoFocus value={adding.company} onChange={e => set('company', e.target.value)} placeholder="Company *" className={`${inputCls} flex-1 min-w-[10rem]`} />
            <input value={adding.title} onChange={e => set('title', e.target.value)} placeholder="Job title" className={`${inputCls} flex-1 min-w-[10rem]`} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>From</span>
            {monthSelect('startMonth')}
            <input type="number" value={adding.startYear} onChange={e => set('startYear', e.target.value)} placeholder="Year" className={`${inputCls} w-20`} />
            <span>to</span>
            {adding.isCurrent ? <span className="text-slate-700">now</span> : (
              <>
                {monthSelect('endMonth')}
                <input type="number" value={adding.endYear} onChange={e => set('endYear', e.target.value)} placeholder="Year" className={`${inputCls} w-20`} />
              </>
            )}
            <label className="flex items-center gap-1 ml-1">
              <input type="checkbox" checked={adding.isCurrent} onChange={e => set('isCurrent', e.target.checked)} />
              Works here now
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={addJob} disabled={!adding.company.trim() || busy === 'add'}
              className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {busy === 'add' ? 'Adding…' : 'Add job'}
            </button>
            <button type="button" onClick={() => setAdding(null)} className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
