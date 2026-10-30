'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import StatTile from '@/components/ui/StatTile';
import AlertMark from '@/components/ui/AlertMark';
import { planImport, batches, DEFAULT_START, IMPORT_BATCH, PREVIEW_TYPES } from '@/lib/calendar/icsImport';

// Admin > Calendar Upload (Mike 10-29: "upload the calendar to show sales
// activity"). The .ics is read here in the browser; only the kept meetings
// are sent, in batches. Past meetings become published notes on the day they
// happened, with no follow ups. Future ones become drafts like the live sync.

const TYPE_WORD = {
  COFFEE: 'Coffee', MEAL: 'Meal', GOLF: 'Golf', HAPPY_HOUR: 'Happy hour', SITE_VISIT: 'Site visit',
  TRAVEL: 'Travel', CALL: 'Call', EMAIL: 'Email', EVENT: 'Event', OTHER: 'Meeting',
};
// The recorder reads the whole CRM per meeting, so future ones go in small batches.
const FUTURE_BATCH = 20;

async function call(method, body) {
  const res = await fetch('/api/admin/calendar-import', {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
  }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res) return { error: 'No signal reaching our server. Meetings already saved are kept. Check the connection and press Continue. (CAL_IMPORT_OFFLINE)' };
  if (!res.ok) return { error: d?.error || `Our server said no (${res.status}). Meetings already saved are kept. Press Continue to retry. (CAL_IMPORT_${res.status})` };
  return d;
}

const day = iso => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const newImportId = () => `cal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function Problem({ children }) {
  return <p className="flex items-start gap-2 text-sm text-red-600 mt-3"><AlertMark size={16} className="mt-0.5 shrink-0" /><span>{children}</span></p>;
}

export default function CalendarImportClient() {
  const [info, setInfo] = useState(null);       // { me, staff, imports }
  const [ownerId, setOwnerId] = useState('');
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [file, setFile] = useState(null);       // { name, text }
  const [picked, setPicked] = useState(new Set());
  const [err, setErr] = useState('');
  const [run, setRun] = useState(null);         // { done, total, totals, stopped, finished, importId, queue }
  const [busy, setBusy] = useState(false);
  const [undone, setUndone] = useState(null);

  const refresh = useCallback(async () => {
    const d = await call('GET');
    if (d.error) { setErr(d.error); return; }
    setInfo(d);
    setOwnerId(o => o || d.me);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const mailbox = info?.staff.find(u => u.id === ownerId)?.email || '';
  const plan = useMemo(() => {
    if (!file) return null;
    try { return planImport(file.text, { startDate, mailbox }); }
    catch { return { failed: true }; }
  }, [file, startDate, mailbox]);

  // A new file, date or person ticks every kept meeting again.
  useEffect(() => { setPicked(new Set(plan?.kept?.map(k => k.ref) || [])); setRun(null); }, [plan]);

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(''); setRun(null); setUndone(null);
    if (!/\.ics$/i.test(f.name)) {
      setFile(null);
      setErr(`${f.name} is not a calendar file. Nothing was read. In the Google Takeout zip, open the Calendar folder and pick the .ics file for your own calendar. (CAL_IMPORT_TYPE)`);
      return;
    }
    setFile({ name: f.name, text: await f.text() });
  }

  const years = plan?.byYear ? Object.keys(plan.byYear).sort() : [];
  const allPicked = plan?.kept?.length > 0 && picked.size === plan.kept.length;
  const toggle = ref => setPicked(p => { const n = new Set(p); n.has(ref) ? n.delete(ref) : n.add(ref); return n; });
  const chosen = plan?.kept?.filter(k => picked.has(k.ref)) || [];
  const futureChosen = chosen.filter(k => !k.isPast).length;

  async function go({ from }) {
    setBusy(true); setErr(''); setUndone(null);
    const importId = from?.importId || newImportId();
    const queue = from?.queue || [
      ...batches(chosen.filter(k => k.isPast), IMPORT_BATCH),
      ...batches(chosen.filter(k => !k.isPast), FUTURE_BATCH),
    ];
    const totals = { ...(from?.totals || { created: 0, restored: 0, alreadyIn: 0, refused: 0, futureDrafts: 0, futureSkipped: 0, refusals: [] }) };
    for (let i = from?.done || 0; i < queue.length; i++) {
      setRun({ done: i, total: queue.length, totals, importId, queue });
      const r = await call('POST', { action: 'import', importId, ownerUserId: ownerId, events: queue[i] });
      if (r.error) {
        setErr(r.error);
        setRun({ done: i, total: queue.length, totals, importId, queue, stopped: true });
        setBusy(false);
        return;
      }
      for (const k of ['created', 'restored', 'alreadyIn', 'refused', 'futureDrafts', 'futureSkipped']) totals[k] += r[k] || 0;
      totals.refusals = [...totals.refusals, ...(r.refusals || [])].slice(0, 20);
    }
    setRun({ done: queue.length, total: queue.length, totals, importId, queue, finished: true });
    setBusy(false);
    refresh();
  }

  async function archive(imp) {
    if (!window.confirm(`Archive the ${imp.live} notes this upload made? They are archived, not deleted, and a later upload of the same file brings them back.`)) return;
    setBusy(true); setErr('');
    const r = await call('POST', { action: 'archive', importId: imp.importId });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setUndone({ ...r, importId: imp.importId });
    refresh();
  }

  const pct = run ? Math.round((run.done / Math.max(1, run.total)) * 100) : 0;
  const t = run?.totals;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/admin" className="hover:underline">Admin</Link><span>/</span><span className="text-slate-600">Calendar Upload</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Calendar Upload</h1>
        <p className="text-slate-500 text-sm mt-1">
          Turn a calendar export into sales activity. Past meetings become published notes on the day they happened,
          with no follow ups, drafts or emails. Personal events, internal meetings and declined invites are left out.
          Uploading the same file again adds nothing twice.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader title="1. Pick the calendar" />
          <CardBody>
            <div className="grid sm:grid-cols-3 gap-4">
              <label className="text-sm text-slate-700">
                <span className="block font-semibold mb-1">Whose calendar</span>
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} disabled={busy || !info}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {(info?.staff || []).map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-700">
                <span className="block font-semibold mb-1">Start date</span>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value || DEFAULT_START)} disabled={busy}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-sm text-slate-700">
                <span className="block font-semibold mb-1">Calendar file (.ics)</span>
                <input type="file" accept=".ics,text/calendar" onChange={onFile} disabled={busy}
                  className="block w-full text-sm text-slate-700 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:text-sm file:font-semibold" />
              </label>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              From Google Takeout: unzip it, open Takeout, then Calendar, and pick the .ics named for the work email.
              The file is read in your browser; nothing is saved until you press Upload.
              The person picked owns the notes, unless a salesperson was on the invite.
            </p>
            {plan?.failed && <Problem>We could not read {file?.name} as a calendar. Nothing was saved. Export it again from Google Takeout and pick the new .ics. (CAL_IMPORT_READ)</Problem>}
            {!plan && err && <Problem>{err}</Problem>}
          </CardBody>
        </Card>

        {plan?.kept && (
          <Card>
            <CardHeader title="2. Preview: nothing is saved yet" />
            <CardBody>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="Meetings kept" value={plan.kept.length} sub={`${plan.past} past, ${plan.future} still to come`} />
                <StatTile label="Travel days" value={plan.travelDays} />
                <StatTile label="Personal left out" value={plan.personal} sub="never sent to the app" />
                <StatTile label="Other skipped" value={Object.values(plan.skipped).reduce((a, b) => a + b, 0)} sub={`${plan.beforeStart} before the start date`} />
              </div>

              <div className="overflow-x-auto mt-5">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-3">Year</th>
                      {PREVIEW_TYPES.map(p => <th key={p.key} className="py-2 px-2 text-right">{p.label}</th>)}
                      <th className="py-2 px-2 text-right">In person</th>
                      <th className="py-2 px-2 text-right">Travel days</th>
                      <th className="py-2 pl-2 text-right">All kept</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map(y => {
                      const r = plan.byYear[y];
                      return (
                        <tr key={y} className="border-b border-slate-100">
                          <td className="py-1.5 pr-3 font-semibold text-slate-800">{y}</td>
                          {PREVIEW_TYPES.map(p => <td key={p.key} className="py-1.5 px-2 text-right">{r[p.key]}</td>)}
                          <td className="py-1.5 px-2 text-right font-semibold">{r.inPerson}</td>
                          <td className="py-1.5 px-2 text-right">{r.travelDays}</td>
                          <td className="py-1.5 pl-2 text-right">{r.total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {Object.keys(plan.skipped).length > 0 && (
                <p className="text-sm text-slate-600 mt-4">
                  Skipped: {Object.entries(plan.skipped).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}.
                  {plan.collapsed > 0 && ` ${plan.collapsed} overlapping in person meetings were folded into one.`}
                </p>
              )}

              <div className="flex items-center justify-between mt-5 mb-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={allPicked} disabled={busy}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(plan.kept.map(k => k.ref)))} />
                  Select all
                </label>
                <span className="text-sm text-slate-500 tabular-nums">{picked.size} of {plan.kept.length} picked</span>
              </div>
              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {plan.kept.map(k => (
                  <label key={k.ref} className="flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={picked.has(k.ref)} onChange={() => toggle(k.ref)} disabled={busy} />
                    <span className="w-28 shrink-0 text-slate-500 tabular-nums">{day(k.startAt)}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-800">{k.title || 'Untitled'}</span>
                    <span className="shrink-0 text-xs text-slate-500">{TYPE_WORD[k.activityType] || 'Meeting'}{k.isInPerson ? ', in person' : ''}{k.isPast ? '' : ', to come'}</span>
                  </label>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {plan?.kept && (
          <Card>
            <CardHeader title="3. Upload" />
            <CardBody>
              {futureChosen > 0 && (
                <p className="text-sm text-slate-600 mb-3">
                  {futureChosen} picked meetings are still to come. They become drafts, as the live calendar sync makes them, and wait to be published.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={busy || !chosen.length || !ownerId || (run && !run.finished)} loading={busy && !run?.stopped} onClick={() => go({})}>
                  Upload {chosen.length} meetings
                </Button>
                {run?.stopped && <Button variant="secondary" disabled={busy} onClick={() => go({ from: run })}>Continue</Button>}
              </div>
              {run && (
                <div className="mt-4">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-2 bg-orange-500 transition-all" style={{ width: `${pct}%` }} /></div>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">{run.finished ? 'Done.' : `Batch ${run.done + 1} of ${run.total}`}</p>
                  <p className="text-sm text-slate-700 mt-1">
                    {t.created} notes added, {t.restored} brought back, {t.alreadyIn} already in the app and left alone.
                    {(t.futureDrafts + t.futureSkipped) > 0 && ` Still to come: ${t.futureDrafts} drafts made, ${t.futureSkipped} left as they were.`}
                    {t.refused > 0 && ` ${t.refused} refused by the server check.`}
                  </p>
                  {t.refusals.length > 0 && (
                    <ul className="mt-1 ml-4 list-disc text-xs text-slate-500 space-y-0.5">{t.refusals.map(r => <li key={r}>{r}</li>)}</ul>
                  )}
                </div>
              )}
              {err && <Problem>{err}</Problem>}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Recent uploads" />
          <CardBody>
            {!info ? <p className="text-sm text-slate-500">Loading…</p> : !info.imports.length ? (
              <p className="text-sm text-slate-500">No calendar uploads yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {info.imports.map(imp => (
                  <li key={imp.importId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="flex-1 min-w-0 text-slate-700">
                      {day(imp.at)} by {imp.by || 'someone'}: <span className="tabular-nums">{imp.live}</span> notes in the app
                      {imp.notes !== imp.live && <span className="text-slate-400"> ({imp.notes - imp.live} archived)</span>}
                    </span>
                    {imp.live > 0 && <Button variant="secondary" size="sm" disabled={busy} onClick={() => archive(imp)}>Archive this import</Button>}
                  </li>
                ))}
              </ul>
            )}
            {undone && (
              <p className="text-sm text-slate-700 mt-3">
                Archived {undone.archived} notes.{undone.kept > 0 && ` ${undone.kept} drafts someone has since published were kept.`}
              </p>
            )}
            {plan?.failed && err && <Problem>{err}</Problem>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
