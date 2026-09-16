'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { computeReviewFlags } from '@/lib/intake/reviewFlags';
import { computeQuantities } from '@/lib/intake/quantities';
import { INTAKE_QUESTIONS } from '@/lib/intake/questionnaire';
import { draftStage, reachedLabel } from '@/lib/intake/drafts';

const STATUS_CONFIG = {
  PENDING: { color: 'bg-amber-100 text-amber-700 border border-amber-200', label: 'Pending' },
  APPROVED: { color: 'bg-green-100 text-green-700 border border-green-200', label: 'Approved' },
  REJECTED: { color: 'bg-red-100 text-red-700 border border-red-200', label: 'Rejected' },
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Budgets started on the public page and never sent (migration 0087). Each
 * one is a lead: a name, a work email and a project, saved the moment the
 * About You page was passed. "Still working" for the first day, "Abandoned"
 * after that (Mike, 2026-09-15: "Yes we should see it abandoned"). Put away
 * archives the row — nothing is deleted.
 */
function UnfinishedBudgets({ drafts, onArchived }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  async function putAway(id) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intake/drafts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not put that away');
      }
      onArchived(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden mt-6">
      <div className="px-4 py-3 border-b border-slate-200 flex items-baseline justify-between gap-3">
        <h2 className="font-bold text-slate-900">Unfinished budgets ({drafts.length})</h2>
        <p className="text-xs text-slate-500">
          Started on the public budget page and not sent yet. Each is a lead worth a call.
        </p>
      </div>
      {error && <p className="px-4 py-2 text-xs text-red-600" role="alert">{error}</p>}
      {drafts.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          Nobody has a budget half-finished right now. When a visitor gets past the first page and stops, they show up here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Last saved</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Reached</th>
                <th className="px-4 py-2 text-right">Units / Gross SF</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drafts.map(d => {
                const stage = draftStage(d.lastSavedAt);
                const where = [d.city, d.state].filter(Boolean).join(', ');
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {fmtDateTime(d.lastSavedAt)}
                      {d.saveCount > 1 && <span className="block text-[10px] text-slate-400">{d.saveCount} saves</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{d.firstName} {d.lastName}</span>
                      <a href={`mailto:${d.email}`} className="block text-xs text-blue-600 hover:underline">{d.email}</a>
                      {d.company && <span className="block text-xs text-slate-500">{d.company}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-900">{d.projectName}</span>
                      <span className="block text-xs text-slate-500">
                        {[where, d.buildingType].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{reachedLabel(d)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                      {d.unitCount ? d.unitCount.toLocaleString() : '—'} / {d.grossSf ? d.grossSf.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        stage === 'working'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {stage === 'working' ? 'Still working' : 'Abandoned'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => putAway(d.id)}
                        disabled={busyId === d.id}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50"
                        title="Move this off the list. Nothing is deleted."
                      >
                        {busyId === d.id ? 'Putting away…' : 'Put away'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * The drawings a submitter sent are stored as JSON text written by the public
 * intake page, so nothing here may assume a shape. A bad payload must show as
 * "no drawings", never as a crashed review screen.
 */
function drawingsOf(submission) {
  try {
    return JSON.parse(submission?.rawPayload || '{}')?.drawings || null;
  } catch {
    return null;
  }
}

/**
 * "Verify before trusting" warnings — recomputed here from the stored drawing
 * data rather than stored at submit time, so tightening a rule immediately
 * applies to old submissions too.
 */
function ReviewFlags({ submission }) {
  const flags = computeReviewFlags(drawingsOf(submission));
  if (!flags.length) return null;
  return (
    <div className="border-t border-slate-200 pt-4">
      <label className="block text-sm font-semibold text-amber-700 mb-2">
        ⚠ Verify before trusting ({flags.length})
      </label>
      <ul className="space-y-1.5">
        {flags.map((f, i) => (
          <li key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The full quantity takeoff — every count and square footage the budget math
 * needs, each with where-it-came-from and a ⚠ when it should be verified.
 * Recomputed on view (same reasoning as ReviewFlags): a rule fix in
 * quantities.js immediately applies to every past submission.
 */
function QuantityTakeoff({ submission }) {
  const drawings = drawingsOf(submission);
  // A no-drawings submission still has a full takeoff — typed figures plus
  // the stand-in guesses — so it gets the panel too.
  const typedIn = (submission?.answers || []).some(a => a?.questionKey === 'noDrawings' && a?.answer === 'yes');
  if (!drawings && !typedIn) return null;
  let quantities;
  try {
    quantities = computeQuantities(drawings, submission?.answers);
  } catch {
    return null;
  }
  if (!quantities?.length) return null;
  const found = quantities.filter(q => q.value != null).length;
  return (
    <div className="border-t border-slate-200 pt-4">
      <label className="block text-sm font-semibold text-slate-900 mb-2">
        Quantity takeoff ({found} of {quantities.length} found)
      </label>
      <div className="space-y-0.5">
        {quantities.map(q => (
          <div key={q.key} className={`rounded-lg px-2 py-1 ${q.flag ? 'bg-amber-50 border border-amber-200' : ''}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-slate-500">{q.flag ? '⚠ ' : ''}{q.label}</span>
              <span className={`text-xs font-semibold text-right shrink-0 font-mono ${q.value == null ? 'text-slate-300' : 'text-slate-800'}`}>
                {q.value == null ? 'not found' : q.value.toLocaleString('en-US')}
                {q.value != null && q.source === 'derived' && <span className="ml-1 text-[10px] font-sans font-normal text-indigo-500">derived</span>}
                {q.value != null && q.source === 'questionnaire' && <span className="ml-1 text-[10px] font-sans font-normal text-emerald-600">questionnaire</span>}
              </span>
            </div>
            <p className={`text-[10px] leading-snug ${q.flag ? 'text-amber-800' : 'text-slate-400'}`}>
              {q.flag || q.how}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Questionnaire answers, grouped by section in the questionnaire's own order.
 * Answers matching the question's default are dimmed — the interesting ones
 * are the choices the submitter actively made.
 */
function QuestionnaireAnswers({ submission }) {
  const answers = Array.isArray(submission?.answers) ? submission.answers : [];
  if (!answers.length) return null;
  const byKey = new Map(answers.map(a => [a.questionKey, a]));
  const sections = [];
  for (const q of INTAKE_QUESTIONS) {
    const a = byKey.get(q.key);
    if (!a) continue;
    let s = sections.find(x => x.name === q.section);
    if (!s) { s = { name: q.section, rows: [] }; sections.push(s); }
    s.rows.push({ ...a, isDefault: q.default != null && a.answer === q.default });
  }
  // Answers whose question key we no longer recognize still deserve a row.
  for (const a of answers) {
    if (INTAKE_QUESTIONS.some(q => q.key === a.questionKey)) continue;
    let s = sections.find(x => x.name === a.section);
    if (!s) { s = { name: a.section, rows: [] }; sections.push(s); }
    s.rows.push({ ...a, isDefault: false });
  }
  return (
    <div className="border-t border-slate-200 pt-4">
      <label className="block text-sm font-semibold text-slate-900 mb-2">
        Questionnaire ({answers.length} answers)
      </label>
      <div className="space-y-3">
        {sections.map(sec => (
          <div key={sec.name}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{sec.name}</p>
            {sec.rows.map(a => (
              <div key={a.questionKey} className="flex items-baseline justify-between gap-3 py-0.5">
                <span className="text-xs text-slate-500">{a.question}</span>
                <span className={`text-xs font-semibold text-right shrink-0 ${a.isDefault ? 'text-slate-400' : 'text-slate-800'}`}>
                  {a.answer}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function keptSheetsOf(submission) {
  try {
    const sheets = JSON.parse(submission?.rawPayload || '{}')?.drawings?.keptSheets;
    return Array.isArray(sheets) ? sheets.filter(s => s && typeof s.key === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The sheets we actually read, kept so a reviewer can check the numbers against
 * the drawing instead of taking the parser's word for it.
 *
 * These are compressed images of a handful of pages — the site plan, the code
 * summary, the unit matrix — not the GC's original 400 MB set, which is deleted
 * as soon as it has been read. Each thumbnail is fetched through a link that
 * expires in five minutes, so the links are requested when the submission is
 * opened rather than baked into the page.
 */
function KeptSheets({ submission }) {
  const sheets = keptSheetsOf(submission);
  const [urls, setUrls] = useState({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!sheets.length) return;
    let live = true;              // a reviewer can click through the list faster
    setUrls({});                  // than the links come back; late answers for a
    setFailed(false);             // submission we have left must be dropped.
    (async () => {
      const pairs = await Promise.all(sheets.map(async s => {
        try {
          const res = await fetch(`/api/admin/sheets?key=${encodeURIComponent(s.key)}`);
          if (!res.ok) return null;
          const { url } = await res.json();
          return url ? [s.key, url] : null;
        } catch {
          return null;
        }
      }));
      if (!live) return;
      const got = pairs.filter(Boolean);
      setUrls(Object.fromEntries(got));
      setFailed(got.length === 0);
    })();
    return () => { live = false; };
    // Keyed on the submission, not on `sheets` — a fresh array every render
    // would re-fetch every link forever.
  }, [submission.id]);                              // eslint-disable-line react-hooks/exhaustive-deps

  if (!sheets.length) return null;

  return (
    <div className="border-t border-slate-200 pt-4">
      <label className="block text-sm font-semibold text-slate-900 mb-1">
        Sheets we read ({sheets.length})
      </label>
      <p className="text-xs text-slate-500 mb-2">
        Compressed copies of the pages the parser looked at. The original upload is not kept.
      </p>
      {failed ? (
        <p className="text-xs text-slate-500">These sheets are no longer available.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {sheets.map(s => (
            <a
              key={s.key}
              href={urls[s.key] || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`block border border-slate-200 rounded overflow-hidden bg-slate-50 ${urls[s.key] ? 'hover:border-orange-400' : 'pointer-events-none opacity-60'}`}
            >
              {urls[s.key]
                ? <img src={urls[s.key]} alt={`Page ${s.page}`} className="w-full h-24 object-cover object-top" />
                : <div className="w-full h-24" />}
              <span className="block px-2 py-1 text-xs text-slate-600">
                Page {s.page}{s.file ? ` · ${s.file}` : ''}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SortIcon({ col, sortCol, sortDir }) {
  const active = sortCol === col;
  return (
    <span className="inline-flex flex-col ml-1 opacity-40 group-hover:opacity-70">
      <svg className={`w-2.5 h-2.5 -mb-0.5 ${active && sortDir === 'asc' ? 'opacity-100 text-amber-500' : ''}`} viewBox="0 0 10 6" fill="currentColor">
        <path d="M5 0L10 6H0z" />
      </svg>
      <svg className={`w-2.5 h-2.5 ${active && sortDir === 'desc' ? 'opacity-100 text-amber-500' : ''}`} viewBox="0 0 10 6" fill="currentColor">
        <path d="M5 6L0 0h10z" />
      </svg>
    </span>
  );
}

/** Is there a live "looks like" guess on this request? */
function activeSuggestion(s) {
  return s?.suggestedProject && !s.suggestionDismissedAt && !s.duplicateMatchId ? s.suggestedProject : null;
}

function placeOf(p) {
  return [p?.city, [p?.state, p?.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

/**
 * Is this web request a job we already have?
 *
 * Mike, 2026-09-12: flag likely duplicates with one click to confirm or
 * dismiss, never merge on our own, and never overwrite. So "link" always goes
 * through the side-by-side: blanks on the job fill in from the request, and
 * where the two disagree the job's answer is kept unless a person picks the
 * request's. The visitor is never told any of this.
 */
function JobLinkPanel({ submission, projects, onUpdated }) {
  const suggestion = activeSuggestion(submission);
  const [pickId, setPickId] = useState('');
  const [merge, setMerge] = useState(null);          // { project, plan } from the server
  const [choices, setChoices] = useState({});
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function call(url, opts) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}). Please try again.`);
      return data;
    } catch (e) {
      setErr(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function compare(projectId) {
    const data = await call(`/api/admin/intake/${submission.id}/link?projectId=${encodeURIComponent(projectId)}`);
    if (data) { setMerge(data); setChoices({}); }
  }

  async function link() {
    const data = await call(`/api/admin/intake/${submission.id}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: merge.project.id, choices }),
    });
    if (data) { setMerge(null); onUpdated(data.submission); }
  }

  async function dismiss() {
    const data = await call(`/api/admin/intake/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissSuggestion: true }),
    });
    if (data) onUpdated(data.submission);
  }

  async function createNew() {
    const data = await call(`/api/admin/intake/${submission.id}/create-project`, { method: 'POST' });
    if (data) { setConfirmCreate(false); onUpdated(data.submission); }
  }

  if (submission.duplicateMatchId) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        ✓ Linked to{' '}
        <Link href={`/project/${submission.duplicateMatchId}`} className="font-semibold underline">
          {submission.duplicateMatch?.name || 'the project'}
        </Link>
      </div>
    );
  }

  if (merge) {
    const rows = merge.plan.filter(r => r.kind !== 'empty');
    const anyChange = rows.some(r => r.kind === 'fill' || (r.kind === 'conflict' && choices[r.field] === 'request'));
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Link to {merge.project.name}</p>
          <p className="text-xs text-slate-600 mt-0.5">
            Blank spots on the job fill in from this request. Where they disagree, the job keeps its own answer unless you pick the request&apos;s. The job&apos;s name never changes.
          </p>
        </div>
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.field} className="rounded-md bg-white border border-slate-200 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">{r.label}</span>
                {r.kind === 'fill' && <span className="text-[10px] font-bold uppercase text-green-700">Will fill in</span>}
                {r.kind === 'same' && <span className="text-[10px] font-bold uppercase text-slate-400">Already matches</span>}
                {r.kind === 'conflict' && <span className="text-[10px] font-bold uppercase text-amber-700">They disagree</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                <div>
                  <p className="text-[10px] text-slate-400">The job has</p>
                  <p className={r.projectShown ? 'text-slate-800' : 'text-slate-300 italic'}>{r.projectShown || 'blank'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">The request says</p>
                  <p className={r.requestShown ? 'text-slate-800' : 'text-slate-300 italic'}>{r.requestShown || 'blank'}</p>
                </div>
              </div>
              {r.kind === 'conflict' && (
                <div className="flex gap-3 mt-1.5 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name={`c-${r.field}`} checked={choices[r.field] !== 'request'}
                      onChange={() => setChoices(c => ({ ...c, [r.field]: 'project' }))} />
                    Keep the job&apos;s
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name={`c-${r.field}`} checked={choices[r.field] === 'request'}
                      onChange={() => setChoices(c => ({ ...c, [r.field]: 'request' }))} />
                    Use the request&apos;s
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
        {!anyChange && <p className="text-xs text-slate-500">Nothing on the job will change — this just connects the two.</p>}
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button onClick={link} disabled={busy}
            className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50">
            {busy ? 'Linking…' : 'Link to this job'}
          </button>
          <button onClick={() => setMerge(null)} disabled={busy}
            className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold py-2 rounded-lg">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suggestion && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 p-3">
          <p className="text-sm text-slate-900">
            Looks like a job we already have:{' '}
            <Link href={`/project/${suggestion.id}`} className="font-semibold text-sky-700 underline" target="_blank">
              {suggestion.name}
            </Link>
            {placeOf(suggestion) ? <span className="text-slate-500"> · {placeOf(suggestion)}</span> : null}
          </p>
          {submission.suggestedMatchReason && (
            <p className="text-xs text-slate-600 mt-0.5">Why we think so: {submission.suggestedMatchReason}</p>
          )}
          <div className="flex gap-2 mt-2">
            <button onClick={() => compare(suggestion.id)} disabled={busy}
              className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
              Same job — compare and link
            </button>
            <button onClick={dismiss} disabled={busy}
              className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
              Not the same
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 p-3 space-y-2">
        <p className="text-sm font-semibold text-slate-900">Is this a job we already have?</p>
        <div className="flex gap-2">
          <select value={pickId} onChange={e => setPickId(e.target.value)}
            className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Pick a project…</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.city ? ` — ${[p.city, p.state].filter(Boolean).join(', ')}` : ''}</option>
            ))}
          </select>
          <button onClick={() => compare(pickId)} disabled={!pickId || busy}
            className="px-3 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold disabled:opacity-40">
            Compare
          </button>
        </div>
        <div className="pt-2 border-t border-slate-100">
          {confirmCreate ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-700 flex-1">Make a new project called “{submission.proposedName}”?</span>
              <button onClick={createNew} disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold disabled:opacity-50">
                {busy ? 'Creating…' : 'Yes, create it'}
              </button>
              <button onClick={() => setConfirmCreate(false)} disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">
                No
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmCreate(true)} disabled={busy}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700">
              No — it&apos;s a new job. Create a project from this request →
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

export default function IntakeClient({ submissions: initialSubmissions, drafts = [], clients, projects, currentUser, canInvite = false, initialSelectedId = null }) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [draftList, setDraftList] = useState(drafts);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const selected = submissions.find(s => s.id === selectedId);
  const [status, setStatus] = useState(selected?.status || 'PENDING');
  const [reviewNote, setReviewNote] = useState(selected?.reviewNote || '');
  const [clientId, setClientId] = useState(selected?.clientId || '');
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteError, setInviteError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [statusFilter, setStatusFilter] = useState('ALL');

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const filtered = submissions.filter(s => statusFilter === 'ALL' || s.status === statusFilter);
  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    switch (sortCol) {
      case 'createdAt': av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); break;
      case 'name': av = (a.submitterName || '').toLowerCase(); bv = (b.submitterName || '').toLowerCase(); break;
      case 'status': av = a.status; bv = b.status; break;
      default: av = ''; bv = '';
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/intake/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          reviewNote,
          clientId: clientId || null,
          // No duplicateMatchId: linking a project only happens through the
          // compare-and-link panel, so a plain Save can never unlink or re-link.
        }),
      });
      if (!res.ok) throw new Error('Failed to save');

      setSubmissions(subs => subs.map(s => s.id === selected.id ? { ...s, status, reviewNote, clientId } : s));
      setSelectedId(null);
      router.refresh();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendInvite() {
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/admin/intake/${selected.id}/invite`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setInviteResult(data);
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  }

  // A link, a dismiss or a new project comes back as the updated request. Keep
  // the answers already loaded (the routes don't send them) and pick up a status
  // change — creating a project approves the request.
  function applyUpdate(u) {
    setSubmissions(subs => subs.map(s => s.id === u.id ? { ...s, ...u } : s));
    if (u.id === selectedId) {
      setStatus(u.status);
      setReviewNote(u.reviewNote || '');
    }
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <Link href={canInvite ? '/admin' : '/crm'} className="text-xs text-slate-400 hover:text-amber-600 transition-colors mb-4 inline-block">
          ← {canInvite ? 'Admin' : 'Pipeline'}
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Conceptual Submissions</h1>

        <div className="grid grid-cols-3 gap-6">
          {/* List */}
          <div className="col-span-2">
            <div className="flex gap-2 mb-4 pb-4 border-b border-slate-200">
              {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    statusFilter === s
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th onClick={() => toggleSort('createdAt')} className="px-4 py-3 text-left font-semibold text-slate-700 cursor-pointer select-none group hover:text-slate-900">
                      Submitted <SortIcon col="createdAt" sortCol={sortCol} sortDir={sortDir} />
                    </th>
                    <th onClick={() => toggleSort('name')} className="px-4 py-3 text-left font-semibold text-slate-700 cursor-pointer select-none group hover:text-slate-900">
                      Name <SortIcon col="name" sortCol={sortCol} sortDir={sortDir} />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Project</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Location</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                    <th onClick={() => toggleSort('status')} className="px-4 py-3 text-left font-semibold text-slate-700 cursor-pointer select-none group hover:text-slate-900">
                      Status <SortIcon col="status" sortCol={sortCol} sortDir={sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-12 text-center text-slate-500">
                        <p className="text-sm mb-3">{statusFilter === 'ALL' ? 'No submissions yet.' : 'No ' + statusFilter.toLowerCase() + ' submissions.'}</p>
                        {statusFilter === 'ALL' && (
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/start`;
                              navigator.clipboard.writeText(url);
                              alert('Copied: ' + url);
                            }}
                            className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded"
                          >
                            Copy /start link
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : sorted.map(s => (
                    <tr
                      key={s.id}
                      onClick={() => {
                        setSelectedId(s.id);
                        setStatus(s.status);
                        setReviewNote(s.reviewNote || '');
                        setClientId(s.clientId || '');
                        setInviteResult(null);
                        setInviteError(null);
                        setCopied(false);
                      }}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedId === s.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-3 text-slate-600 text-xs">{fmtDate(s.createdAt)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.submitterName}</td>
                      <td className="px-4 py-3 text-slate-600">{s.submitterEmail}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {s.proposedName}
                        {activeSuggestion(s) && (
                          <span className="block mt-0.5 text-[10px] font-semibold text-sky-700">
                            Looks like: {activeSuggestion(s).name}
                          </span>
                        )}
                        {s.duplicateMatchId && (
                          <span className="block mt-0.5 text-[10px] font-semibold text-green-700">
                            ✓ Linked{s.duplicateMatch?.name ? ` to ${s.duplicateMatch.name}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{s.buildingType || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_CONFIG[s.status].color}`}>
                          {STATUS_CONFIG[s.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <UnfinishedBudgets
              drafts={draftList}
              onArchived={id => setDraftList(list => list.filter(d => d.id !== id))}
            />
          </div>

          {/* Detail Panel */}
          {selected && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Review Submission</h2>

              <div className="mb-4">
                <JobLinkPanel key={selected.id} submission={selected} projects={projects} onUpdated={applyUpdate} />
              </div>

              <div className="space-y-4">
                {/* Fields */}
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Name</label>
                  <p className="text-slate-600">{selected.submitterName}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Email</label>
                  <a href={`mailto:${selected.submitterEmail}`} className="text-blue-600 hover:underline text-sm">
                    {selected.submitterEmail}
                  </a>
                </div>

                {/* proposedName is the PROJECT name (see /api/intake/submit);
                    it was labelled "Company" here by mistake. */}
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Project</label>
                  <p className="text-slate-600">{selected.proposedName}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Location</label>
                  <p className="text-slate-600">
                    {[selected.city, selected.state].filter(Boolean).join(', ') || '—'}
                    {selected.zip ? ` ${selected.zip}` : ''}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Building Type</label>
                  <p className="text-slate-600">{selected.buildingType || '—'}</p>
                </div>

                <ReviewFlags submission={selected} />

                <QuantityTakeoff submission={selected} />

                <QuestionnaireAnswers submission={selected} />

                <KeptSheets submission={selected} />

                <div className="border-t border-slate-200 pt-4">
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Link Client</label>
                  <select
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">None</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-1">Review Note</label>
                  <textarea
                    value={reviewNote}
                    onChange={e => setReviewNote(e.target.value)}
                    placeholder="Internal notes..."
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>

                <div className="flex gap-2 pt-4 border-t border-slate-200">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedId(null);
                      setStatus('PENDING');
                      setReviewNote('');
                      setClientId('');
                      setInviteResult(null);
                      setInviteError(null);
                      setCopied(false);
                    }}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>

                {selected.status === 'APPROVED' && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                      Portal Access
                    </p>

                    {/* Part A: which project. Linking happens in the panel at
                        the top, which never overwrites the job's answers. */}
                    <p className="text-xs text-slate-500 mb-3">
                      {selected.duplicateMatchId
                        ? `The invite gives ${selected.submitterEmail} access to ${selected.duplicateMatch?.name || 'the linked project'}.`
                        : 'Link this request to a project at the top of this panel first.'}
                    </p>

                    {/* Part B: Send invite */}
                    <div>
                      {inviteResult?.alreadyAccepted ? (
                        <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                          ✓ {inviteResult.submitterEmail} already has portal access for this project.
                        </p>
                      ) : inviteResult?.inviteUrl ? (
                        <div>
                          <p className="text-xs text-slate-600 mb-1">
                            Invite ready — copy this link and send it to {inviteResult.submitterEmail}:
                          </p>
                          <div className="flex gap-2">
                            <input
                              readOnly
                              value={inviteResult.inviteUrl}
                              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono bg-slate-50"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(inviteResult.inviteUrl);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              }}
                              className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold whitespace-nowrap"
                            >
                              {copied ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          disabled={!canInvite || !selected.duplicateMatchId || inviting}
                          onClick={handleSendInvite}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            canInvite && selected.duplicateMatchId && !inviting
                              ? 'bg-amber-500 hover:bg-amber-400 text-white'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {inviting ? 'Sending…' : 'Send Portal Invite'}
                        </button>
                      )}

                      {inviteError && (
                        <p className="text-xs text-red-500 mt-2">{inviteError}</p>
                      )}
                      {!canInvite && (
                        <p className="text-xs text-slate-400 mt-1">
                          Only an admin can send portal invites.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
