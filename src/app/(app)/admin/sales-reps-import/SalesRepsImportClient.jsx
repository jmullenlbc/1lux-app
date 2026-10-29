'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import StatTile from '@/components/ui/StatTile';
import { kindOf, readCsv, buildRepLoad, chunks, BATCH } from '@/lib/salesReps/trackvia';

// Admin > Sales Rep upload (Mike 10-29, 0144). Read the three Trackvia exports
// (Sales Reps, Manufacturer Reps, Project Reps) in the browser, show what would
// load, then load reps and links in small batches. Nothing is deleted; a second
// load updates the same reps by their Trackvia number, so Continue is safe.

const KINDS = { reps: 'Sales Reps', mfrReps: 'Manufacturer Reps', projectReps: 'Project Reps' };
const STEPS = ['reps', 'links'];

async function call(method, body) {
  const res = await fetch('/api/admin/sales-reps-import', {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
  }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res) return { error: 'No signal reaching our server. Rows already saved are kept. Check the connection and press Continue. (REP_IMPORT_OFFLINE)' };
  if (!res.ok) return { error: d?.error || `Our server said no (${res.status}). Rows already saved are kept. Press Continue to retry. (REP_IMPORT_${res.status})` };
  return d;
}

function List({ title, items, tone = 'text-slate-600' }) {
  if (!items?.length) return null;
  return (
    <details className="mt-3">
      <summary className="text-sm font-semibold text-slate-700 cursor-pointer">{title} <span className="text-slate-400 tabular-nums">{items.length}</span></summary>
      <ul className={`mt-1 ml-4 list-disc text-sm ${tone} space-y-0.5`}>{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </details>
  );
}

export default function SalesRepsImportClient() {
  const [now, setNow] = useState(null);
  const [sheets, setSheets] = useState({});
  const [err, setErr] = useState('');
  const [run, setRun] = useState(null); // { done, total, results, stopped, finished }
  const [busy, setBusy] = useState(false);
  const [cleaned, setCleaned] = useState(null);

  const refresh = useCallback(async () => {
    const d = await call('GET');
    if (d.error) setErr(d.error); else setNow(d);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setErr(''); setRun(null);
    const next = { ...sheets };
    const unknown = [];
    for (const f of files) {
      try {
        const rows = readCsv(XLSX, await f.text());
        const kind = kindOf(Object.keys(rows[0] || {}));
        if (!kind) { unknown.push(f.name); continue; }
        next[kind] = { name: f.name, rows };
      } catch {
        unknown.push(f.name);
      }
    }
    setSheets(next);
    if (unknown.length) setErr(`Could not tell which Trackvia export ${unknown.join(', ')} is. Nothing was loaded. Upload the Sales Reps, Manufacturer Reps and Project Reps CSV exports. (REP_IMPORT_KIND)`);
  }

  const plan = sheets.reps && sheets.mfrReps
    ? buildRepLoad({ reps: sheets.reps.rows, mfrReps: sheets.mfrReps.rows, projectReps: sheets.projectReps?.rows || [] })
    : null;
  const s = plan?.summary;

  // Reps first (links find their rep by name), then links. Stops on the first
  // error and keeps its place so Continue picks up from there.
  async function go({ from }) {
    setBusy(true); setErr('');
    const results = { ...(from?.results || {}) };
    const all = STEPS.map((step) => ({ step, batches: chunks(plan[step], BATCH[step]) }));
    const total = all.reduce((n, x) => n + x.batches.length, 0);
    let done = 0;
    for (const { step, batches } of all) {
      for (let i = 0; i < batches.length; i++, done++) {
        if (from && done < from.done) continue;
        setRun({ step, done, total, results });
        const r = await call('POST', { action: step, rows: batches[i] });
        if (r.error) {
          setErr(r.error);
          setRun({ step, done, total, results, stopped: true });
          setBusy(false);
          return;
        }
        const t = results[step] || { created: 0, updated: 0, newMfrs: [], noRep: [] };
        results[step] = {
          created: t.created + (r.created || 0), updated: t.updated + (r.updated || 0),
          newMfrs: [...t.newMfrs, ...(r.newMfrs || [])], noRep: [...t.noRep, ...(r.noRep || [])],
        };
      }
    }
    setRun({ done: total, total, results, finished: true });
    setBusy(false);
    refresh();
  }

  async function cleanup() {
    if (!window.confirm('Delete every Logiq and AMPS rep, and every Logiq and AMPS manufacturer with no products? This cannot be undone.')) return;
    setBusy(true); setErr('');
    const r = await call('POST', { action: 'cleanup' });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setCleaned(r);
    refresh();
  }

  const pct = run ? Math.round((run.done / Math.max(1, run.total)) * 100) : 0;
  const left = now?.leftovers;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/admin" className="hover:underline">Admin</Link><span>/</span><span className="text-slate-600">Sales Rep upload</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Sales Rep upload</h1>
        <p className="text-slate-500 text-sm mt-1">
          Load reps and who they quote for, by office, from the Trackvia exports. Logiq and AMPS are left out.
          Nothing is deleted. Loading again updates the same reps, so it is safe to repeat.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader title="In the app now" />
          <CardBody>
            {now ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="Active reps" value={now.reps} />
                <StatTile label="Rep links" value={now.links} sub="manufacturer, rep, office" />
                <StatTile label="Defaults" value={now.defaults} sub="rep an RFQ goes to" />
                <StatTile label="Manufacturers" value={now.manufacturers} />
              </div>
            ) : <p className="text-sm text-slate-500">Loading…</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="1. Upload the Trackvia exports" />
          <CardBody>
            <input type="file" accept=".csv" multiple onChange={onFiles} disabled={busy}
              className="block text-sm text-slate-700 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:text-sm file:font-semibold" />
            <p className="text-xs text-slate-500 mt-1">Pick all three CSVs at once. They are read in your browser. Nothing is saved until you press Load.</p>
            <ul className="mt-3 text-sm space-y-0.5">
              {Object.entries(KINDS).map(([k, label]) => (
                <li key={k} className={sheets[k] ? 'text-slate-700' : 'text-slate-400'}>
                  {label}: {sheets[k] ? `${sheets[k].name} (${sheets[k].rows.length} rows)` : k === 'projectReps' ? 'not picked (optional, picks the default rep from past jobs)' : 'not picked'}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {plan && (
          <Card>
            <CardHeader title="2. Dry run: what would load" />
            <CardBody>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="Reps" value={s.reps} sub={`${s.skipped.reps.length} Logiq or AMPS left out`} />
                <StatTile label="Rep links" value={s.links} sub={`${s.inactiveLinks} inactive`} />
                <StatTile label="Defaults" value={s.defaults} sub={sheets.projectReps ? 'from past job counts' : 'single rep only'} />
                <StatTile label="Manufacturers" value={s.manufacturers} sub="new ones are added" />
              </div>
              <List title="Ties: more than one rep with the same job count. No default is set; pick one on the manufacturer page" items={s.ties} tone="text-amber-700" />
              <List title="Links whose rep is not on the Sales Reps export (left out)" items={s.skipped.noRep} tone="text-amber-700" />
              <List title="Reps left out (Logiq or AMPS)" items={s.skipped.reps} />
              {s.skipped.links > 0 && <p className="text-sm text-slate-500 mt-3">{s.skipped.links} Logiq or AMPS links left out.</p>}
            </CardBody>
          </Card>
        )}

        {plan && (
          <Card>
            <CardHeader title="3. Load" />
            <CardBody>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={busy || (run && !run.finished)} loading={busy && !run?.stopped} onClick={() => go({})}>Load reps and links</Button>
                {run?.stopped && <Button variant="secondary" disabled={busy} onClick={() => go({ from: run })}>Continue</Button>}
              </div>
              {run && (
                <div className="mt-4">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-2 bg-orange-500 transition-all" style={{ width: `${pct}%` }} /></div>
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    {run.finished ? 'Done.' : `${run.step === 'reps' ? 'Reps' : 'Links'}: batch ${run.done + 1} of ${run.total}`}
                  </p>
                  {run.results?.reps && <p className="text-sm text-slate-700">Reps: {run.results.reps.created} added, {run.results.reps.updated} updated.</p>}
                  {run.results?.links && <p className="text-sm text-slate-700">Links: {run.results.links.created} added, {run.results.links.updated} updated.</p>}
                  <List title="Manufacturers added (were in Trackvia, not in the app)" items={run.results?.links?.newMfrs} tone="text-slate-700" />
                  <List title="Links whose rep could not be found" items={run.results?.links?.noRep} tone="text-red-600" />
                </div>
              )}
              {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
            </CardBody>
          </Card>
        )}
        {!plan && err && <p className="text-sm text-red-600">{err}</p>}

        {(left?.reps.length > 0 || left?.manufacturers.length > 0 || cleaned) && (
          <Card>
            <CardHeader title="Logiq and AMPS clean up" />
            <CardBody>
              {left && (left.reps.length > 0 || left.manufacturers.length > 0) && (
                <>
                  <p className="text-sm text-slate-700">
                    Still in the app: {left.reps.length} reps, {left.manufacturers.length} manufacturers.
                    Manufacturers with products are kept so no budget line loses its product.
                  </p>
                  <List title="Manufacturers" items={left.manufacturers.map((m) => `${m.name} (${m.products} products)`)} />
                  <List title="Reps" items={left.reps.map((r) => r.name)} />
                  <div className="mt-3"><Button variant="danger" size="sm" disabled={busy} onClick={cleanup}>Delete Logiq and AMPS</Button></div>
                </>
              )}
              {cleaned && (
                <p className="text-sm text-slate-700 mt-3">
                  Deleted {cleaned.removed?.reps.length ?? 0} reps and {cleaned.removed?.manufacturers.length ?? 0} manufacturers.
                  {cleaned.kept?.length > 0 && ` Kept: ${cleaned.kept.join('; ')}.`}
                </p>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
