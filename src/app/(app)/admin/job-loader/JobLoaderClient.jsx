'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import StatTile from '@/components/ui/StatTile';
import { uploadDirect } from '@/lib/uploadClient';
import {
  FILE_WORKERS, STEPS, STOP_AFTER_FAILS, batchesFor, fileRefs, folderIndex, planFiles, readLoadSheet, stepCounts, withFiles,
} from '@/lib/jobLoader';

const API = '/api/admin/job-loader';
const INPUT_FILE = 'block text-sm text-slate-700 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:text-sm file:font-semibold';
const mb = n => `${Math.round(n / 1048576).toLocaleString()} MB`;

async function call(url, options) {
  const res = await fetch(url, options).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res) return { error: 'No signal reaching our server. What already saved is kept. Check the connection and press Continue.' };
  if (!res.ok) return { error: d?.error || d?.message || `Our server said no (${res.status}). What already saved is kept. Press Continue to try again.` };
  return d;
}
const send = body => call(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function List({ title, items, tone = 'text-slate-600' }) {
  if (!items.length) return null;
  return (
    <details className="mt-3">
      <summary className="text-sm font-semibold text-slate-700 cursor-pointer">
        {title} <span className="text-slate-400 font-normal tabular-nums">{items.length.toLocaleString()}</span>
      </summary>
      <ul className={`mt-1 ml-4 list-disc text-sm ${tone} space-y-0.5 max-h-64 overflow-y-auto`}>
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </details>
  );
}

function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-2 bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500 mt-1 tabular-nums">{done.toLocaleString()} of {total.toLocaleString()}</p>
    </div>
  );
}

// One file: straight to Amazon when the app can, otherwise in the form (dev).
async function sendFile(projectId, item) {
  const { file, ...row } = item;
  let slip = null;
  try {
    slip = await uploadDirect(file, { scope: 'project', presignUrl: `${API}/presign`, completeUrl: `${API}/complete` });
  } catch (e) {
    return { error: e?.message || `${row.name} did not reach Amazon. Nothing was saved for it.` };
  }
  if (slip) return send({ step: 'file', projectId, row: { ...row, uploadKey: slip.key } });
  const form = new FormData();
  form.append('file', file);
  form.append('meta', JSON.stringify({ projectId, row }));
  return call(API, { method: 'POST', body: form });
}

export default function JobLoaderClient() {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [project, setProject] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [index, setIndex] = useState(null);
  const [held, setHeld] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState(null);
  const [records, setRecords] = useState(null);
  const stopRef = useRef(false);

  useEffect(() => {
    call(API).then(d => (d.error ? setErr(d.error) : setProjects(d.projects)));
  }, []);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? projects.filter(p => (p.name || '').toLowerCase().includes(q)) : projects).slice(0, 20);
  }, [projects, search]);

  async function refreshHeld(id) {
    const d = await call(`${API}?projectId=${encodeURIComponent(id)}`);
    if (d.error) { setErr(d.error); return null; }
    setHeld(d);
    return d;
  }

  async function pickProject(p) {
    setProject(p);
    setErr('');
    setFiles(null);
    setRecords(null);
    await refreshHeld(p.id);
  }

  async function onSheet(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr('');
    const read = readLoadSheet(XLSX, new Uint8Array(await f.arrayBuffer()));
    if (read.error) { setErr(read.error); setSheet(null); return; }
    setSheet(read);
    setSheetName(f.name);
  }

  const plan = useMemo(
    () => (sheet && index && held ? planFiles(sheet.files, index, held) : null),
    [sheet, index, held],
  );
  const toSend = plan?.toLoad.reduce((sum, r) => sum + r.size, 0) || 0;

  // Three at a time. A bad file goes on the list and the run carries on, unless
  // they fail in a row, which means the connection or the server is the problem.
  async function loadFiles() {
    setBusy(true);
    setErr('');
    stopRef.current = false;
    const queue = [...plan.toLoad];
    const total = queue.length;
    let done = 0;
    let failsInRow = 0;
    const problems = [];
    setFiles({ done, total, problems: [], finished: false });

    async function worker() {
      while (queue.length && !stopRef.current) {
        const item = queue.shift();
        const res = await sendFile(project.id, item);
        if (res.error) {
          problems.push(`${item.name}: ${res.error}`);
          failsInRow += 1;
          if (failsInRow >= STOP_AFTER_FAILS) stopRef.current = true;
        } else {
          failsInRow = 0;
        }
        done += 1;
        setFiles({ done, total, problems: [...problems], finished: false });
      }
    }
    await Promise.all(Array.from({ length: FILE_WORKERS }, worker));

    const stopped = stopRef.current;
    setFiles({ done, total, problems: [...problems], finished: !stopped && !problems.length, stopped });
    await refreshHeld(project.id);
    setBusy(false);
  }

  async function loadRecords() {
    setBusy(true);
    setErr('');
    const now = await refreshHeld(project.id);
    if (!now) { setBusy(false); return; }
    const ref = fileRefs(sheet.files, now);
    const counts = stepCounts(sheet.records);
    const results = [];
    const problems = [];
    setRecords({ step: '', done: 0, total: 0, results, problems, finished: false });

    for (const st of STEPS) {
      const { rows, missed } = withFiles(st.key, sheet.records[st.key] || [], ref);
      problems.push(...missed);
      const tally = { key: st.key, label: st.label, created: 0, skipped: 0 };
      let done = 0;
      for (const batch of batchesFor(st.key, rows)) {
        const d = await send({ step: st.key, projectId: project.id, rows: batch });
        if (d.error) {
          setErr(`${st.label}: ${d.error}`);
          setRecords({ step: st.label, done, total: counts[st.key], results: [...results, tally], problems: [...problems], finished: false });
          setBusy(false);
          return;
        }
        tally.created += d.created;
        tally.skipped += d.skipped;
        problems.push(...d.problems);
        done += batch.length;
        setRecords({ step: st.label, done, total: counts[st.key], results: [...results, tally], problems: [...problems], finished: false });
      }
      results.push(tally);
    }
    setRecords({ step: '', done: 0, total: 0, results, problems, finished: true });
    setBusy(false);
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">Admin</Link>
        <h1 className="text-2xl font-bold text-slate-900">Job Loader</h1>
        <p className="text-slate-500 text-sm mt-1">
          Brings a finished job into one project from a load sheet and the job&apos;s folder. Files go first, then the records that point at them. Anything already there is skipped, so a stopped run is finished by pressing the same button again.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader title="1. Pick the project" />
          <CardBody>
            {project ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-700 font-semibold">{project.name}</p>
                <Button variant="secondary" disabled={busy} onClick={() => { setProject(null); setHeld(null); }}>Change</Button>
              </div>
            ) : (
              <>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search projects"
                  className="w-full sm:w-96 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <ul className="mt-2 divide-y divide-slate-100">
                  {matches.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => pickProject(p)} className="w-full text-left text-sm text-slate-700 hover:text-orange-600 py-1.5">
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="2. Upload the load sheet" />
          <CardBody>
            <input type="file" accept=".xlsx" onChange={onSheet} className={INPUT_FILE} />
            {sheet && <p className="text-xs text-slate-500 mt-1">{sheetName}: {sheet.files.length.toLocaleString()} file rows. Nothing has been changed yet.</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="3. Pick the job folder" />
          <CardBody>
            <input
              type="file"
              webkitdirectory=""
              multiple
              onChange={e => setIndex(folderIndex(e.target.files || []))}
              className={INPUT_FILE}
            />
            <p className="text-xs text-slate-500 mt-1">Pick the job&apos;s top folder itself. Your browser will ask to confirm. This step only reads the file list, nothing is sent yet.</p>
            {plan && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <StatTile label="To load" value={plan.toLoad.length.toLocaleString()} sub={mb(toSend)} />
                  <StatTile label="Already in the app" value={plan.already.length.toLocaleString()} />
                  <StatTile label="Not found" value={plan.missing.length.toLocaleString()} tone={plan.missing.length ? 'warning' : undefined} />
                  <StatTile label="Changed since the sheet" value={plan.changed.length.toLocaleString()} tone={plan.changed.length ? 'warning' : undefined} />
                </div>
                <List title="On the sheet, not in the folder" items={plan.missing.map(r => r.path)} tone="text-red-600" />
                <List title="Different size from the sheet, left out" items={plan.changed.map(r => r.path)} tone="text-red-600" />
                <List title="In the folder, not on the sheet" items={plan.notOnSheet} />
                <List title="Set to Skip on the sheet" items={plan.skipped.map(r => r.path)} />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="4. Load the files" />
          <CardBody>
            <Button disabled={busy || !plan?.toLoad.length} onClick={loadFiles}>
              {files && !files.finished ? 'Continue' : 'Load files'}
            </Button>
            {files && <Progress done={files.done} total={files.total} />}
            {files?.finished && <p className="text-sm text-slate-700 mt-2">Every file is in.</p>}
            {files?.stopped && <p className="text-sm text-red-600 mt-2">Stopped after {STOP_AFTER_FAILS} failures in a row, so this looks like the connection or the server, not one file. Files already sent are kept. Press Continue to send the rest.</p>}
            {files && <List title="Files that did not load" items={files.problems} tone="text-red-600" />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="5. Load the records" />
          <CardBody>
            <p className="text-sm text-slate-500 mb-3">RFQs, quotes, RFIs, change orders and the rest. Load the files first, so each record can link to its file.</p>
            <Button disabled={busy || !sheet || !held} onClick={loadRecords}>
              {records && !records.finished ? 'Continue' : 'Load records'}
            </Button>
            {records?.step && (
              <>
                <p className="text-sm text-slate-700 mt-3">{records.step}</p>
                <Progress done={records.done} total={records.total} />
              </>
            )}
            {records?.results.length > 0 && (
              <ul className="text-sm text-slate-700 mt-3 space-y-0.5">
                {records.results.map(r => (
                  <li key={r.key} className="tabular-nums">{r.label}: {r.created} created, {r.skipped} skipped</li>
                ))}
              </ul>
            )}
            {records?.finished && <p className="text-sm text-slate-700 mt-2">Every record step is done.</p>}
            {records && <List title="Needs a look" items={records.problems} tone="text-red-600" />}
          </CardBody>
        </Card>

        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}
