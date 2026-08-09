'use client';

import { useEffect, useState } from 'react';

const WINDOWS = [7, 30, 90];

function bytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

const num = n => (n ?? 0).toLocaleString();
const pct = n => `${((n || 0) * 100).toFixed(1)}%`;

function Card({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900',
    red:   'text-red-600',
    amber: 'text-amber-600',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tones[tone] || tones.slate}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/**
 * A dependency-free sparkline.
 *
 * Deliberately not a charting library: this is one admin page, and the chart
 * needs to show a shape, not support zoom and tooltips. Adding a chart bundle to
 * the client for it would cost every user of the app the download.
 */
function Spark({ series, valueKey = 'count', color = '#0f766e' }) {
  const values = series.map(d => d[valueKey] || 0);
  const max    = Math.max(...values, 1);
  const w = 100, h = 28;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * h).toFixed(2)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full" role="img"
         aria-label={`Trend, peak ${max}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Table({ columns, rows, empty }) {
  if (!rows?.length) return <div className="px-4 py-6 text-sm text-slate-400">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            {columns.map(c => (
              <th key={c.key} className={`px-4 py-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {columns.map(c => (
                <td key={c.key} className={`px-4 py-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className || ''}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, note, children }) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
        {note && <span className="text-xs text-slate-400">{note}</span>}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">{children}</div>
    </section>
  );
}

export default function UsageDashboard() {
  const [days,    setDays]    = useState(30);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/admin/metrics?days=${days}`)
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        return res.json();
      })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  if (loading && !data) return <div className="px-6 py-12 text-sm text-slate-400">Loading metrics…</div>;
  if (err) return <div className="px-6 py-12 text-sm text-red-600">Could not load metrics: {err}</div>;
  if (!data) return null;

  const { users, uploads, errors, ai, history } = data;

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-1">
        {WINDOWS.map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded px-3 py-1 text-sm font-medium transition ${
              days === d ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {d}d
          </button>
        ))}
        {loading && <span className="ml-2 text-xs text-slate-400">refreshing…</span>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Active users"  value={num(users.activeCount)} sub={`of ${num(users.registered)} registered`} />
        <Card label="Uploads"       value={num(uploads.projectFiles)} sub={bytes(uploads.bytes)} />
        <Card label="Open bugs"     value={num(errors.bugsOpen)} sub={`${num(errors.bugsReported)} reported`}
              tone={errors.bugsOpen ? 'amber' : 'slate'} />
        <Card label="AI errors"     value={num(errors.agentErrors)} sub={`${pct(errors.agentErrorRate)} of ${num(ai.runs)} runs`}
              tone={errors.agentErrors ? 'red' : 'slate'} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Activity</div>
          <Spark series={users.daily} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Uploads</div>
          <Spark series={uploads.daily} color="#1d4ed8" />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">AI runs</div>
          <Spark series={ai.daily} color="#7c3aed" />
        </div>
      </div>

      <Section title="Users" note={`${users.perUser.length} active in the last ${days} days`}>
        <Table
          empty="No recorded activity in this window."
          rows={users.perUser}
          columns={[
            { key: 'name',    label: 'User',    render: r => r.name || r.email || r.userId },
            { key: 'email',   label: 'Email',   className: 'text-slate-500' },
            { key: 'actions', label: 'Actions', align: 'right', render: r => num(r.actions) },
            { key: 'lastSeen', label: 'Last seen', align: 'right',
              render: r => (r.lastSeen ? new Date(r.lastSeen).toLocaleString() : '—') },
          ]}
        />
      </Section>

      {users.dormant.length > 0 && (
        <Section title="Dormant accounts" note="active seats with no recorded activity in this window">
          <Table
            empty=""
            rows={users.dormant}
            columns={[
              { key: 'name',  label: 'User', render: r => r.name || r.email },
              { key: 'email', label: 'Email', className: 'text-slate-500' },
              { key: 'role',  label: 'Role',  align: 'right' },
            ]}
          />
        </Section>
      )}

      <Section title="Uploads"
               note={`${num(uploads.drawingFiles)} drawing files · ${num(uploads.pipelineUploads)} pipeline uploads`}>
        <Table
          empty="No uploads in this window."
          rows={uploads.byTab}
          columns={[
            { key: 'name',  label: 'Tab' },
            { key: 'count', label: 'Files', align: 'right', render: r => num(r.count) },
          ]}
        />
      </Section>

      <Section title="AI usage" note="tokens are counted, prompts and completions are never stored">
        <Table
          empty="No model calls recorded in this window."
          rows={ai.byTask}
          columns={[
            { key: 'task',         label: 'Task' },
            { key: 'runs',         label: 'Runs',   align: 'right', render: r => num(r.runs) },
            { key: 'inputTokens',  label: 'In',     align: 'right', render: r => num(r.inputTokens) },
            { key: 'outputTokens', label: 'Out',    align: 'right', render: r => num(r.outputTokens) },
            { key: 'avgMs',        label: 'Avg',    align: 'right', render: r => `${num(r.avgMs)} ms` },
            { key: 'errorRate',    label: 'Errors', align: 'right',
              render: r => <span className={r.errorRate ? 'text-red-600' : ''}>{pct(r.errorRate)}</span> },
          ]}
        />
      </Section>

      <Section title="Recent AI errors" note="message only — never parameters or output">
        <Table
          empty="No model errors in this window."
          rows={errors.recentAgentErrors}
          columns={[
            { key: 'at',    label: 'When',  render: r => new Date(r.at).toLocaleString() },
            { key: 'task',  label: 'Task' },
            { key: 'error', label: 'Error', className: 'text-red-600' },
          ]}
        />
      </Section>

      <Section title="Bugs reported" note="by module">
        <Table
          empty="No bug reports in this window."
          rows={errors.bugsByModule}
          columns={[
            { key: 'name',  label: 'Module' },
            { key: 'count', label: 'Reports', align: 'right', render: r => num(r.count) },
          ]}
        />
      </Section>

      <Section title="History" note="from the nightly rollup — gaps mean the job did not run, not zero activity">
        <Table
          empty="No snapshots recorded yet. The nightly rollup writes the first one after it runs."
          rows={[...(history || [])].reverse()}
          columns={[
            { key: 'day',          label: 'Day' },
            { key: 'activeUsers',  label: 'Users',   align: 'right', render: r => num(r.activeUsers) },
            { key: 'uploads',      label: 'Uploads', align: 'right', render: r => num(r.uploads) },
            { key: 'agentRuns',    label: 'AI runs', align: 'right', render: r => num(r.agentRuns) },
            { key: 'agentErrors',  label: 'AI err',  align: 'right', render: r => num(r.agentErrors) },
            { key: 'bugsReported', label: 'Bugs',    align: 'right', render: r => num(r.bugsReported) },
          ]}
        />
      </Section>
    </div>
  );
}
