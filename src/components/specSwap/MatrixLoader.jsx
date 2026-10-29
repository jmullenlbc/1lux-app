'use client';

// Admin > Users and settings > Peer review matrices (Mike 10-19).
// Pick the matrix files; each is read here in the browser and sent one job at
// a time, so the "we suggest" step learns from them. Same rows as
// scripts/loadSpecSwaps.mjs. Only CN columns are sent, never DN.

import { useEffect, useRef, useState } from 'react';
import { CARD, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, H2, HELPER, TH } from '@/components/ui/tokens';
import { WidgetLoading, WidgetError } from '@/components/ui/WidgetFrame';
import { readMatrixSheets, newestLines, jobNameFromFile } from '@/lib/matrixImport/readMatrix';

const SEND = ['type', 'description', 'location', 'sheetName', 'origMfr', 'origCatalog', 'propMfr', 'propCatalog', 'qty', 'uom', 'unitCn'];
const OUTCOMES = [['SWAPPED', 'Swapped'], ['KEPT', 'Kept'], ['PLACEHOLDER', 'Placeholder'], ['ADDED', 'Added']];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '');

async function readLines(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const tables = readMatrixSheets(wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true }),
  })));
  return newestLines(tables).map((l) => Object.fromEntries(SEND.map((k) => [k, l[k] ?? null])));
}

// One file per job: "X MATRIX (1).xlsx" is a copy of "X MATRIX.xlsx", newer wins.
function pickJobs(files) {
  const byJob = new Map();
  for (const f of files) {
    if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) continue;
    const job = jobNameFromFile(f.name);
    const prev = byJob.get(job);
    if (!prev || f.lastModified > prev.file.lastModified) byJob.set(job, { job, file: f });
  }
  return [...byJob.values()].sort((a, b) => a.job.localeCompare(b.job));
}

export default function MatrixLoader() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState([]); // { job, file, status, note }
  const [running, setRunning] = useState(false);
  const [showJobs, setShowJobs] = useState(false);
  const [removing, setRemoving] = useState('');
  const inputRef = useRef(null);

  const loadSummary = () => fetch('/api/admin/spec-swaps')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(setSummary)
    .catch(() => setError("Couldn't load what is loaded now."));

  useEffect(() => { loadSummary(); }, []);

  const choose = (fileList) => {
    if (running) return;
    setQueue(pickJobs([...(fileList || [])]).map((j) => ({ ...j, status: 'waiting', note: '' })));
  };

  const setRow = (i, patch) => setQueue((q) => q.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  // Take a job out of the learning set. Loading its file again brings it back.
  const remove = async (job) => {
    if (!window.confirm(`Take "${job}" out? "We suggest" stops learning from it. Loading its file again brings it back.`)) return;
    setRemoving(job);
    try {
      const res = await fetch('/api/admin/spec-swaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job, remove: true }),
      });
      if (!res.ok) throw new Error();
      await loadSummary();
    } catch {
      setError(`Couldn't take out ${job}.`);
    } finally {
      setRemoving('');
    }
  };

  const run = async () => {
    setRunning(true);
    for (let i = 0; i < queue.length; i++) {
      const { job, file } = queue[i];
      setRow(i, { status: 'working', note: 'Reading' });
      try {
        const lines = await readLines(file);
        if (!lines.length) { setRow(i, { status: 'skipped', note: 'No fixture table found' }); continue; }
        const res = await fetch('/api/admin/spec-swaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job, sheetDate: new Date(file.lastModified).toISOString(), lines }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
        setRow(i, { status: 'done', note: `${d.rows} rows (${d.SWAPPED} swapped, ${d.KEPT} kept)`, result: d });
      } catch (e) {
        setRow(i, { status: 'error', note: e.message || 'Failed' });
      }
    }
    setRunning(false);
    loadSummary();
  };

  const done = queue.filter((r) => r.status === 'done');
  const totals = done.reduce((t, r) => {
    for (const k of ['rows', 'SWAPPED', 'KEPT', 'PLACEHOLDER', 'ADDED', 'linked']) t[k] = (t[k] || 0) + (r.result?.[k] || 0);
    return t;
  }, {});
  const finished = queue.filter((r) => r.status !== 'waiting' && r.status !== 'working').length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} px-6 py-5`}>
        <h2 className={H2}>Peer review matrices</h2>
        <p className={`${HELPER} mt-1`}>
          The &quot;We suggest&quot; step on Bid Leveling learns from these. Pick every matrix file at once
          (the Peer Review Matrices folder in Software engineering). Each job uses its newest tab; loading a
          job again replaces its earlier rows. Only CN prices are read.
        </p>
        {error && <WidgetError className="mt-3">{error}</WidgetError>}
        {!summary && !error && <WidgetLoading className="mt-3" />}
        {summary && (
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-700">
            <div><span className="font-semibold tabular-nums">{summary.jobs.length}</span> jobs</div>
            <div><span className="font-semibold tabular-nums">{summary.rows}</span> lines</div>
            {OUTCOMES.map(([k, label]) => (
              <div key={k}><span className="font-semibold tabular-nums">{summary.outcomes[k] || 0}</span> {label.toLowerCase()}</div>
            ))}
            {summary.lastLoadedAt && <div className="text-slate-500">Last loaded {fmtDate(summary.lastLoadedAt)}</div>}
          </div>
        )}
        <div
          className="mt-4 rounded-lg border-2 border-dashed border-slate-300 px-6 py-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files); }}
        >
          <p className="text-sm text-slate-600">Drop matrix files here, or</p>
          <button type="button" className={`${BTN_SECONDARY} mt-2`} disabled={running} onClick={() => inputRef.current?.click()}>
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xlsm,.xls"
            className="hidden"
            onChange={(e) => { choose(e.target.files); e.target.value = ''; }}
          />
        </div>
      </div>

      {queue.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-600 flex-1">
              {running
                ? `Loading ${Math.min(finished + 1, queue.length)} of ${queue.length}`
                : finished
                  ? `${done.length} of ${queue.length} loaded: ${totals.rows || 0} lines, ${totals.SWAPPED || 0} swapped, ${totals.KEPT || 0} kept, ${totals.linked || 0} matched to our products.`
                  : `${queue.length} ${queue.length === 1 ? 'job' : 'jobs'} picked. Copies of the same job keep the newer file.`}
            </p>
            <button type="button" className={BTN_PRIMARY} disabled={running || finished === queue.length} onClick={run}>
              {running ? 'Loading' : `Load ${queue.length} ${queue.length === 1 ? 'matrix' : 'matrices'}`}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={`${TH} px-6 py-3`}>Job</th>
                <th className={`${TH} px-4 py-3`}>File</th>
                <th className={`${TH} px-4 py-3`}>Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {queue.map((r) => (
                <tr key={r.job}>
                  <td className="px-6 py-2 font-medium text-slate-800">{r.job}</td>
                  <td className="px-4 py-2 text-slate-500">{r.file.name} <span className="text-xs">({fmtDate(r.file.lastModified)})</span></td>
                  <td className={`px-4 py-2 ${r.status === 'error' ? 'text-red-600' : r.status === 'done' ? 'text-slate-700' : 'text-slate-500'}`}>
                    {r.status === 'waiting' ? 'Waiting' : r.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary?.jobs.length > 0 && (
        <div className={`${CARD} overflow-hidden`}>
          <button
            type="button"
            className="w-full px-6 py-4 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
            onClick={() => setShowJobs((v) => !v)}
          >
            {showJobs ? 'Hide' : 'Show'} the {summary.jobs.length} loaded jobs
          </button>
          {showJobs && (
            <table className="w-full text-sm border-t border-slate-100">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={`${TH} px-6 py-3`}>Job</th>
                  <th className={`${TH} text-right px-4 py-3`}>Lines</th>
                  <th className={`${TH} px-4 py-3`}>File date</th>
                  <th className={`${TH} px-4 py-3`}>Loaded</th>
                  <th className={`${TH} px-4 py-3`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {summary.jobs.map((j) => (
                  <tr key={j.job}>
                    <td className="px-6 py-2 text-slate-800">{j.job}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{j.rows}</td>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(j.fileDate)}</td>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(j.loadedAt)}</td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" className={BTN_COMPACT} disabled={running || !!removing} onClick={() => remove(j.job)}>
                        {removing === j.job ? 'Removing' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
