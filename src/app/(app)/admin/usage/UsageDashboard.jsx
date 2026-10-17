'use client';

import { useEffect, useState } from 'react';
import StatTile from '@/components/ui/StatTile';
import WidgetFrame, { WidgetEmpty, WidgetLoading, WidgetError } from '@/components/ui/WidgetFrame';
import { CARD, TH, TD, TAB_ACTIVE, TAB_INACTIVE } from '@/components/ui/tokens';

const WINDOWS = [7, 30, 90];

function bytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

const num = n => (n ?? 0).toLocaleString();
const pct = n => `${((n || 0) * 100).toFixed(1)}%`;

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
  if (!rows?.length) return <WidgetEmpty>{empty}</WidgetEmpty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map(c => (
              <th key={c.key} className={`${TH} px-4 ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {columns.map(c => (
                <td key={c.key} className={`${TD} px-4 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className || ''}`}>
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
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {note && <span className="text-xs text-slate-500">{note}</span>}
      </div>
      <div className={CARD}>{children}</div>
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

  if (loading && !data) return <WidgetLoading className="px-6 py-12">Loading metrics...</WidgetLoading>;
  if (err) return <WidgetError className="px-6 py-12">Could not load metrics: {err}</WidgetError>;
  if (!data) return null;

  const { users, uploads, errors, ai, history } = data;

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-1">
        {WINDOWS.map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${days === d ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            {d}d
          </button>
        ))}
        {loading && <span className="ml-2 text-xs text-slate-500">refreshing...</span>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Active users" value={num(users.activeCount)} sub={`of ${num(users.registered)} registered`} />
        <StatTile label="Uploads" value={num(uploads.projectFiles)} sub={bytes(uploads.bytes)} />
        <StatTile label="Open bugs" value={num(errors.bugsOpen)} sub={`${num(errors.bugsReported)} reported`}
              tone={errors.bugsOpen ? 'warning' : 'default'} />
        <StatTile label="AI errors" value={num(errors.agentErrors)} sub={`${pct(errors.agentErrorRate)} of ${num(ai.runs)} runs`}
              tone={errors.agentErrors ? 'danger' : 'default'} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <WidgetFrame title="Activity" bodyClassName="px-4 py-3">
          <Spark series={users.daily} />
        </WidgetFrame>
        <WidgetFrame title="Uploads" bodyClassName="px-4 py-3">
          <Spark series={uploads.daily} color="#1d4ed8" />
        </WidgetFrame>
        <WidgetFrame title="AI runs" bodyClassName="px-4 py-3">
          <Spark series={ai.daily} color="#7c3aed" />
        </WidgetFrame>
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
              render: r => (r.lastSeen ? new Date(r.lastSeen).toLocaleString() : 'never') },
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

      <Section title="Recent AI errors" note="message only, never parameters or output">
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

      <Section title="History" note="from the nightly rollup: gaps mean the job did not run, not zero activity">
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
