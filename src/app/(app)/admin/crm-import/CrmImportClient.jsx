'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import StatTile from '@/components/ui/StatTile';
import { readWorkbook, buildImport, matchUser, chunks, BATCH, CONFIRM_WORDS } from '@/lib/crmImport';

// Admin > CRM upload (Mike 10-28). Read the final clean up sheet, show what
// would load, then on a typed go: DELETE every project, company and person
// (Mike 10-28; manufacturers, products and everything else stay) and load the
// sheet in small batches. The wipe and every batch can be repeated safely, so
// Continue is always safe.

const STEPS = ['companies', 'people', 'projects'];
const LABEL = { companies: 'Companies', people: 'People', projects: 'Projects' };

async function call(method, body) {
  const res = await fetch('/api/admin/crm-import', {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
  }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res) return { error: 'No signal reaching our server. Rows already saved are kept. Check the connection and press Continue. (CRM_IMPORT_OFFLINE)' };
  if (!res.ok) return { error: d?.error || `Our server said no (${res.status}). Rows already saved are kept. Press Continue to retry. (CRM_IMPORT_${res.status})` };
  return d;
}

function List({ title, items, tone = 'text-slate-600' }) {
  if (!items?.length) return null;
  return (
    <details className="mt-3">
      <summary className="text-sm font-semibold text-slate-700 cursor-pointer">{title} <span className="text-slate-400 tabular-nums">{items.length}</span></summary>
      <ul className={`mt-1 ml-4 list-disc text-sm ${tone} space-y-0.5`}>{items.map(i => <li key={i}>{i}</li>)}</ul>
    </details>
  );
}

export default function CrmImportClient() {
  const [now, setNow] = useState(null);
  const [plan, setPlan] = useState(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState('');
  const [run, setRun] = useState(null); // { step, done, total, wiped, results, finished }
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const d = await call('GET');
    if (d.error) setErr(d.error); else setNow(d);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(''); setPlan(null); setRun(null); setFileName(f.name);
    try {
      const read = readWorkbook(XLSX, new Uint8Array(await f.arrayBuffer()));
      if (read.error) { setErr(read.error); return; }
      setPlan(buildImport(read.rows));
    } catch {
      setErr('Could not read that file. It may not be an Excel file. Nothing was loaded. Upload the .xlsx clean up sheet. (CRM_IMPORT_READ)');
    }
  }

  // Wipe in steps until nothing is left (unless resuming past it), then every
  // batch in order. Stops on the first error and keeps its place so Continue
  // picks up from there.
  async function go({ from }) {
    setBusy(true); setErr('');
    const results = { ...(from?.results || {}) };
    let wiped = from?.wiped || null;
    if (!wiped?.done) {
      const gone = { ...(wiped?.gone || { project: 0, contact: 0, client: 0 }) };
      for (;;) {
        setRun({ wiping: true, gone, done: 0, total: 1, results });
        const w = await call('POST', { action: 'wipe', confirm: CONFIRM_WORDS });
        if (w.error) {
          setErr(w.error);
          setRun({ wiping: true, gone, done: 0, total: 1, results, wiped: { gone }, stopped: true });
          setBusy(false);
          return;
        }
        if (w.done) break;
        gone[w.model] += w.deleted;
      }
      wiped = { gone, done: true };
    }
    const all = STEPS.map(step => ({ step, batches: chunks(plan[step], BATCH[step]) }));
    const total = all.reduce((n, s) => n + s.batches.length, 0);
    let done = 0;
    for (const { step, batches } of all) {
      for (let i = 0; i < batches.length; i++, done++) {
        if (from && done < from.done) continue;
        setRun({ step, done, total, wiped, results });
        const r = await call('POST', { action: step, rows: batches[i] });
        if (r.error) {
          setErr(r.error);
          setRun({ step, done, total, wiped, results, stopped: true });
          setBusy(false);
          return;
        }
        const t = results[step] || { created: 0, skipped: 0, branches: 0, missingCompany: [] };
        results[step] = {
          created: t.created + (r.created || 0), skipped: t.skipped + (r.skipped || 0),
          branches: t.branches + (r.branches || 0), missingCompany: [...t.missingCompany, ...(r.missingCompany || [])],
        };
      }
    }
    setRun({ done: total, total, wiped, results, finished: true });
    setConfirm(''); setBusy(false);
    refresh();
  }

  const s = plan?.summary;
  const owners = s?.owners.map(o => ({ o, u: now ? matchUser(now.users, o) : null })) || [];
  const ready = plan && confirm === CONFIRM_WORDS && !busy;
  const pct = run ? Math.round((run.done / Math.max(1, run.total)) * 100) : 0;
  const gone = run?.wiped?.gone || run?.gone;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/admin" className="hover:underline">Admin</Link><span>/</span><span className="text-slate-600">CRM upload</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">CRM upload</h1>
        <p className="text-slate-500 text-sm mt-1">
          Load the final CRM clean up sheet. Wipe and load deletes every project, company and person now in the app,
          archived ones too, then loads the sheet. This cannot be undone. Files, budgets and matrices on those projects
          go with them. Notes, manufacturers, products and everything else stay.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader title="In the app now" />
          <CardBody>
            {now ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatTile label="Projects" value={now.projects} sub="deleted on wipe" />
                <StatTile label="Companies" value={now.clients} sub="deleted on wipe" />
                <StatTile label="People" value={now.contacts} sub="deleted on wipe" />
                <StatTile label="Manufacturers" value={now.manufacturers} sub="kept" tone="success" />
                <StatTile label="Products" value={now.products} sub="kept" tone="success" />
              </div>
            ) : <p className="text-sm text-slate-500">Loading…</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="1. Upload the sheet" />
          <CardBody>
            <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy}
              className="block text-sm text-slate-700 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:text-sm file:font-semibold" />
            <p className="text-xs text-slate-500 mt-1">The file is read in your browser. Nothing is saved until you press Wipe and load.</p>
          </CardBody>
        </Card>

        {plan && (
          <Card>
            <CardHeader title={`2. Dry run: what ${fileName} would load`} />
            <CardBody>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="Companies" value={s.companies} sub={`${s.branches} branches, ${s.aliases} other spellings`} />
                <StatTile label="People" value={s.people} sub={`${s.peopleWithCompany} with a company`} />
                <StatTile label="Projects" value={s.projects} sub={`${s.projectsWithCompany} with a company`} />
                <StatTile label="Tagged people" value={Object.values(s.tagged).reduce((a, b) => a + b, 0)} sub={Object.keys(s.tagged).join(', ') || 'none'} />
              </div>
              <p className="text-sm text-slate-600 mt-4">
                <b>Project status:</b> {Object.entries(s.byStatus).map(([k, v]) => `${k.replace('_', ' ').toLowerCase()} ${v}`).join(', ')}.{' '}
                <b>Service type:</b> {Object.entries(s.byService).map(([k, v]) => `${k === 'blank' ? 'none' : k} ${v}`).join(', ')}.
              </p>
              <p className="text-sm text-slate-600 mt-1">
                <b>Owners:</b> {owners.map(({ o, u }) => (
                  <span key={o} className={u ? '' : 'text-red-600'}>{o} {u ? `= ${u.name}` : '(no login with that name, loads with no owner)'}; </span>
                ))}
              </p>
              <List title="Projects whose company is not on the Companies tab (load with no company)" items={plan.unmatched.projectNoCompany} tone="text-amber-700" />
              <List title="People whose company is not on the Companies tab" items={plan.unmatched.peopleNoCompany} tone="text-amber-700" />
              <List title="Companies with no type yet" items={plan.warnings} tone="text-amber-700" />
            </CardBody>
          </Card>
        )}

        {plan && (
          <Card className="border-red-200">
            <CardHeader title="3. Wipe and load" />
            <CardBody>
              <p className="text-sm text-slate-700">
                Deletes {now?.projects ?? '…'} projects, {now?.clients ?? '…'} companies and {now?.contacts ?? '…'} people for good, then loads the sheet.
                There is no undo. Type <b>{CONFIRM_WORDS}</b> to go ahead.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <input value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} placeholder={CONFIRM_WORDS}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-56" />
                <Button variant="danger" disabled={!ready || (run && !run.finished)} loading={busy && !run?.stopped} onClick={() => go({})}>
                  Wipe and load
                </Button>
                {run?.stopped && <Button variant="secondary" disabled={busy} onClick={() => go({ from: run })}>Continue</Button>}
              </div>
              {run && (
                <div className="mt-4">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-2 bg-orange-500 transition-all" style={{ width: `${pct}%` }} /></div>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {run.finished ? 'Done.' : run.wiping ? 'Deleting what is in the app now.' : `${LABEL[run.step]}: batch ${run.done + 1} of ${run.total}`}
                    {gone && ` Deleted ${gone.project} projects, ${gone.client} companies, ${gone.contact} people.`}
                  </p>
                  {STEPS.filter(k => run.results?.[k]).map(k => (
                    <p key={k} className="text-sm text-slate-700">
                      {LABEL[k]}: {run.results[k].created} loaded{k === 'companies' ? ` plus ${run.results[k].branches} branches` : ''}, {run.results[k].skipped} already there.
                    </p>
                  ))}
                  <List title="People whose company did not load" items={run.results?.people?.missingCompany} tone="text-red-600" />
                </div>
              )}
              {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
            </CardBody>
          </Card>
        )}
        {!plan && err && <p className="text-sm text-red-600">{err}</p>}

        {now?.lastWipe && (
          <p className="text-xs text-slate-500">Last wipe {new Date(now.lastWipe.stamp).toLocaleString()} by {now.lastWipe.by}.</p>
        )}
      </div>
    </div>
  );
}
