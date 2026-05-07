'use client';
import { useMemo } from 'react';
import FileDropZone from '@/components/files/FileDropZone';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PHASE_KEYWORDS = [
  // Check multi-word / more-specific first
  'IFC VE', 'CD VE', 'DD VE', 'SD VE',
  '100DD', '90DD', '60DD',
  'BUYOUT', 'GMP', 'IFC', 'CD', 'DD', 'SD', 'CONCEPT',
];

function labelFromName(name) {
  const upper = name.toUpperCase().replace(/\.PDF$/i, '');
  for (const p of PHASE_KEYWORDS) {
    if (upper.includes(p)) return p;
  }
  return name
    .replace(/^\d{2}\.\d{2}\.\d{2}\s+/, '')
    .replace(/^ILC\s*[-–]+\s*/i, '')
    .replace(/^Budget\s*[-–]+\s*/i, '')
    .replace(/\.pdf$/i, '')
    .trim()
    .slice(0, 18);
}

function dateFromName(name) {
  // "YY.MM.DD …"
  const m = name.match(/^(\d{2})\.(\d{2})\.(\d{2})\b/);
  if (!m) return null;
  return new Date(2000 + parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

function fmtDate(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function fmtCurrency(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

const BAR_H    = 140; // max bar height px
const BAR_W    = 56;  // bar width px
const BAR_GAP  = 28;  // gap between bars px

function BudgetBarChart({ entries }) {
  if (!entries.length) return null;

  const max = Math.max(...entries.map(e => e.amount));
  const totalW = entries.length * (BAR_W + BAR_GAP) - BAR_GAP;

  return (
    <div className="overflow-x-auto pb-1">
      <div style={{ minWidth: totalW }} className="flex items-end gap-0">
        {entries.map((e, i) => {
          const barH   = Math.max(Math.round((e.amount / max) * BAR_H), 8);
          const isLast = i === entries.length - 1;

          // Color: latest bar is amber-500, previous bars are amber-200 → amber-400
          const barColor = isLast
            ? '#f59e0b'          // amber-500
            : i === entries.length - 2
            ? '#fbbf24'          // amber-400
            : '#fde68a';         // amber-200

          return (
            <div
              key={e.id}
              style={{ width: BAR_W, marginRight: i < entries.length - 1 ? BAR_GAP : 0 }}
              className="flex flex-col items-center"
            >
              {/* Amount label above bar */}
              <span className="text-[10px] font-semibold text-slate-600 mb-1 text-center leading-tight">
                {fmtCurrency(e.amount)}
              </span>

              {/* Bar */}
              <div
                style={{ height: barH, backgroundColor: barColor, width: BAR_W }}
                className="rounded-t-md w-full"
              />

              {/* Labels below */}
              <div className="mt-1.5 text-center">
                <div className="text-[11px] font-bold text-slate-700 leading-none">{e.label}</div>
                {e.date && (
                  <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(e.date)}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Baseline rule */}
      <div className="border-t border-slate-200 mt-2" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BudgetDashboard({ projectId, files, onFileAdded, onFileDeleted, showDropZone = true }) {
  // Build sorted chart entries from uploaded budget PDFs that have a parsed amount
  const chartEntries = useMemo(() => {
    return files
      .filter(f => f.parsedAmount != null)
      .map(f => ({
        id:     f.id,
        amount: f.parsedAmount,
        label:  labelFromName(f.originalName),
        date:   dateFromName(f.originalName),
        name:   f.originalName,
      }))
      .sort((a, b) => {
        // Sort by filename date, then by upload date
        if (a.date && b.date) return a.date - b.date;
        if (a.date) return -1;
        if (b.date) return  1;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
  }, [files]);

  const hasParsed = chartEntries.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Budget Progression Chart ──────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Budget Progression</h3>
            <p className="text-xs text-slate-400 mt-0.5">Grand total per submission, inc. tax &amp; freight</p>
          </div>
          {hasParsed && (
            <span className="text-[11px] text-slate-400 font-medium">
              {chartEntries.length} submission{chartEntries.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {hasParsed ? (
          <BudgetBarChart entries={chartEntries} />
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">Drop budget PDFs below to chart the progression</p>
            <p className="text-xs text-slate-400 mt-1">Each budget will appear as a bar, ordered by date</p>
          </div>
        )}
      </div>

      {/* ── File Drop Zone ────────────────────────────────────────────────── */}
      {showDropZone && (
        <FileDropZone
          projectId={projectId}
          tab="budgets"
          initialFiles={files}
          onFileAdded={onFileAdded}
          onFileDeleted={onFileDeleted}
        />
      )}
    </div>
  );
}
