'use client';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import PdfViewerModal from '@/components/ui/PdfViewerModal';
import { FilterToolbar, FilterPanel } from '@/components/ui/FilterPanel';

const TAG_FIELD = [{ key: 'tag', label: 'Tag', kind: 'pick' }];
import { oversizeMessage, uploadErrorMessage, uploadThrowMessage } from '@/lib/uploadErrorMessage';
import { appendUpload } from '@/lib/uploadClient';
import { postParked } from '@/lib/parkedFetch';
import ConfirmArchiveModal, { setArchived, ArchiveBoxIcon, KEPT_ON_ARCHIVE_PAGE } from '@/components/salesAutomation/ConfirmArchiveModal';

// ─── Tag definitions ──────────────────────────────────────────────────────────
const CONTRACT_TAGS = [
  { value: 'Supply - Executed', label: 'Supply Contract',   sub: 'Executed supply agreement',     color: 'bg-blue-100 text-blue-700 border-blue-200',   dot: 'bg-blue-500',   aiReview: true  },
  { value: 'Supply',            label: 'Supply Draft',      sub: 'Draft / unsigned supply PO',    color: 'bg-sky-100 text-sky-700 border-sky-200',      dot: 'bg-sky-400',    aiReview: true  },
  { value: 'Design - Executed', label: 'Design Contract',   sub: 'Executed design agreement',     color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500', aiReview: false },
  { value: 'Design',            label: 'Design Draft',      sub: 'Draft design agreement',        color: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-400', aiReview: false },
  { value: 'Amendment',         label: 'Amendment',         sub: 'Contract amendment or addendum', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-orange-500',  aiReview: false },
  { value: 'COI',               label: 'Certificate of Insurance', sub: 'COI from vendor or GC', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500',  aiReview: false },
  { value: 'SOV',               label: 'Schedule of Values', sub: 'SOV for billing',            color: 'bg-teal-100 text-teal-700 border-teal-200',    dot: 'bg-teal-500',   aiReview: false },
  { value: 'Proposal',          label: 'Proposal',          sub: 'Bid or proposal document',      color: 'bg-red-100 text-red-700 border-red-200',   dot: 'bg-red-400',   aiReview: false },
];

function tagMeta(tagValue) {
  return CONTRACT_TAGS.find(t => t.value === tagValue) || {
    label: tagValue, color: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400', aiReview: false,
  };
}

function isSupplyTag(tag) {
  return tag === 'Supply - Executed' || tag === 'Supply';
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
const RISK_META = {
  'Low':       { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Medium':    { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-orange-500'  },
  'High':      { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  'Very High': { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
};
const FLAG_META = {
  RED:    { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-700',   badge: 'bg-red-100 text-red-700',   dot: 'bg-red-500'   },
  YELLOW: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
  GREEN:  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
};
const ACTION_COLORS = {
  'Accept':           'bg-green-100 text-green-700',
  'Negotiate':        'bg-amber-100 text-amber-700',
  'Push Back Hard':   'bg-orange-100 text-orange-700',
  'Seek Legal Review':'bg-red-100 text-red-700',
};

function RiskBadge({ score }) {
  const m = RISK_META[score] || RISK_META['High'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {score}
    </span>
  );
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function parseTags(raw) {
  if (!raw) return [];
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
}

function parseAnalysis(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

// Extract COI expiry date from tags array (stored as "COI_EXPIRY:YYYY-MM-DD")
function getCOIExpiry(tags) {
  const entry = tags.find(t => t.startsWith('COI_EXPIRY:'));
  return entry ? entry.replace('COI_EXPIRY:', '') : null;
}

// Returns { label, color } for a COI expiry date string
function coiExpiryMeta(isoDate) {
  if (!isoDate) return null;
  const expiry = new Date(isoDate);
  const today  = new Date();
  const daysLeft = Math.floor((expiry - today) / 86400000);
  if (daysLeft < 0)  return { label: `Expired ${Math.abs(daysLeft)}d ago`, color: 'text-red-600 bg-red-50 border-red-200' };
  if (daysLeft < 30) return { label: `Expires in ${daysLeft}d`, color: 'text-red-600 bg-red-50 border-red-200' };
  if (daysLeft < 60) return { label: `Expires in ${daysLeft}d`, color: 'text-amber-600 bg-amber-50 border-amber-200' };
  const formatted = expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return { label: `Expires ${formatted}`, color: 'text-green-700 bg-green-50 border-green-200' };
}

// ─── Tag selector modal ───────────────────────────────────────────────────────
function TagModal({ fileName, onConfirm, onCancel, allowedTags = null }) {
  const [selected, setSelected] = useState(null);

  const meta = selected ? tagMeta(selected) : null;
  const visibleTags = allowedTags
    ? CONTRACT_TAGS.filter(t => allowedTags.includes(t.value))
    : CONTRACT_TAGS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">What type of document is this?</h3>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{fileName}</p>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {visibleTags.map(tag => (
            <button
              key={tag.value}
              type="button"
              onClick={() => setSelected(tag.value)}
              className={[
                'w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                selected === tag.value
                  ? 'border-orange-400 bg-amber-50 ring-1 ring-orange-500'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
            >
              <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${tag.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{tag.label}</span>
                  {tag.aiReview && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                      ⚡ AI Review
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{tag.sub}</p>
              </div>
            </button>
          ))}
        </div>

        {meta?.aiReview && (
          <div className="mx-4 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700 font-medium">
              ⚡ Claude will automatically review this supply contract against our standard positions.
            </p>
          </div>
        )}

        <div className="flex gap-2 px-4 py-3 border-t border-slate-100">
          <button type="button" onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => selected && onConfirm({ tag: selected, aiReview: tagMeta(selected).aiReview })}
            disabled={!selected}
            className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {meta?.aiReview ? '⚡ Upload & Review' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Contract analysis panel ──────────────────────────────────────────────────
function AnalysisPanel({ analysis, fileName }) {
  const [tab, setTab] = useState('flags');

  const flags   = analysis?.flags || [];
  const missing = analysis?.missing_clauses || [];
  const summary = analysis?.contract_summary || {};
  const ilcPos  = analysis?.ilc_position_summary || {};
  const southstar = analysis?.southstar_compatibility || {};

  const reds    = flags.filter(f => f.severity === 'RED');
  const yellows = flags.filter(f => f.severity === 'YELLOW');
  const greens  = flags.filter(f => f.severity === 'GREEN');
  const sorted  = [...reds, ...yellows, ...greens];

  const risk    = analysis?.overall_risk_score;
  const riskM   = RISK_META[risk] || RISK_META['High'];

  const TABS = [
    { id: 'flags',    label: `Flags (${flags.length})` },
    { id: 'missing',  label: `Missing (${missing.length})` },
    { id: 'checklist',label: 'ILC Checklist' },
    { id: 'southstar',label: 'Southstar' },
  ];

  function CheckRow({ label, value, invert = false }) {
    const good = invert ? value === false : value === true;
    return (
      <div className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
        <span className={`text-sm shrink-0 font-semibold ${good ? 'text-green-500' : 'text-red-400'}`}>
          {good ? '✓' : '✗'}
        </span>
        <span className="text-xs text-slate-600">{label}</span>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Summary header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">{summary.counterparty_name || '—'}</span>
            {summary.contract_tier && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                {summary.contract_tier?.split(' - ')[0]}
              </span>
            )}
            {risk && <RiskBadge score={risk} />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{analysis?.overall_risk_rationale}</p>
        </div>
        <div className="flex gap-3 text-xs text-slate-500 shrink-0">
          <span className="text-red-600 font-semibold">{reds.length} RED</span>
          <span className="text-amber-600 font-semibold">{yellows.length} YELLOW</span>
          <span className="text-green-600 font-semibold">{greens.length} GREEN</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 bg-white overflow-x-auto md:overflow-visible">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
              tab === t.id
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
        {tab === 'flags' && (
          sorted.length === 0
            ? <p className="text-xs text-slate-400 text-center py-4">No flags found.</p>
            : sorted.map(f => {
                const m = FLAG_META[f.severity] || FLAG_META.YELLOW;
                return (
                  <div key={f.id} className={`rounded-xl border p-3 ${m.bg} ${m.border}`}>
                    <div className="flex items-start gap-2 mb-1.5">
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${m.badge}`}>{f.severity}</span>
                      <span className={`text-xs font-semibold flex-1 ${m.text}`}>{f.title}</span>
                      {f.suggested_action && (
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${ACTION_COLORS[f.suggested_action] || 'bg-slate-100 text-slate-500'}`}>
                          {f.suggested_action}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="text-slate-600"><span className="font-medium text-slate-700">Contract says:</span> {f.what_it_says}</p>
                      <p className="text-slate-600"><span className="font-medium text-slate-700">ILC wants:</span> {f.what_ilc_wants}</p>
                      {f.risk && <p className="text-slate-500 italic">{f.risk}</p>}
                    </div>
                  </div>
                );
              })
        )}

        {tab === 'missing' && (
          missing.length === 0
            ? <p className="text-xs text-slate-400 text-center py-4">No missing clauses identified.</p>
            : missing.map((c, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-800">{c.clause}</span>
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                      c.importance === 'Critical' ? 'bg-red-100 text-red-700' :
                      c.importance === 'Important' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-500'
                    }`}>{c.importance}</span>
                  </div>
                  <p className="text-xs text-slate-500">{c.why_it_matters}</p>
                </div>
              ))
        )}

        {tab === 'checklist' && (
          <div className="divide-y divide-slate-50">
            <CheckRow label="40% mobilization upfront"                     value={ilcPos.mobilization_required === true || ilcPos.mobilization_required === 'true'} />
            <CheckRow label="Liability cap present"                         value={ilcPos.liability_cap_present === true || ilcPos.liability_cap_present === 'true'} />
            <CheckRow label="Consequential damages waived"                  value={ilcPos.consequential_damages_waived === true || ilcPos.consequential_damages_waived === 'true'} />
            <CheckRow label="Colorado law governs"                          value={ilcPos.colorado_law_governs === true || ilcPos.colorado_law_governs === 'true'} />
            <CheckRow label="Mediation required before litigation"          value={ilcPos.mediation_required === true || ilcPos.mediation_required === 'true'} />
            <CheckRow label="Tariff price protection"                       value={ilcPos.tariff_protection_present === true || ilcPos.tariff_protection_present === 'true'} />
            <CheckRow label="No IP assignment to customer"                  value={ilcPos.ip_assignment_to_customer === false || ilcPos.ip_assignment_to_customer === 'false'} invert />
            <CheckRow label="No unilateral modification right"              value={ilcPos.unilateral_modification_right === false || ilcPos.unilateral_modification_right === 'false'} invert />
            <CheckRow label="Southstar acknowledged"                        value={ilcPos.southstar_acknowledged === true || ilcPos.southstar_acknowledged === 'true'} />
            {ilcPos.payment_terms_days && (
              <div className="flex items-center gap-2 py-1.5">
                <span className="text-xs text-slate-500 w-4 shrink-0">📋</span>
                <span className="text-xs text-slate-600">Payment terms: <strong>{ilcPos.payment_terms_days}</strong></span>
              </div>
            )}
            {ilcPos.risk_of_loss_point && (
              <div className="flex items-center gap-2 py-1.5">
                <span className="text-xs text-slate-500 w-4 shrink-0">📋</span>
                <span className="text-xs text-slate-600">Risk of loss: <strong>{ilcPos.risk_of_loss_point}</strong></span>
              </div>
            )}
          </div>
        )}

        {tab === 'southstar' && (
          <div>
            <div className={`flex items-center gap-2 mb-3 p-2 rounded-lg ${
              southstar.compatible ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <span className={`text-sm font-bold ${southstar.compatible ? 'text-green-600' : 'text-red-600'}`}>
                {southstar.compatible ? '✓ Compatible' : '✗ Incompatible'}
              </span>
              <span className="text-xs text-slate-500">with Southstar Financial arrangement</span>
            </div>
            {(southstar.issues || []).map((issue, i) => (
              <div key={i} className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-red-400 text-xs shrink-0">⚠</span>
                <span className="text-xs text-slate-600">{issue}</span>
              </div>
            ))}
            {(!southstar.issues || southstar.issues.length === 0) && southstar.compatible && (
              <p className="text-xs text-slate-400 text-center py-4">No Southstar compatibility issues found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── File row ─────────────────────────────────────────────────────────────────
function ContractFileRow({ file, projectId, onDelete, analysisOverride, onView = null }) {
  const [expanded,   setExpanded]   = useState(false);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [analysis,   setAnalysis]   = useState(analysisOverride || parseAnalysis(file.analysisData));
  const [analyzeErr, setAnalyzeErr] = useState(null);

  // When the parent injects an analysis after auto-upload+review, update state and auto-expand
  useEffect(() => {
    if (analysisOverride && !analysis) {
      setAnalysis(analysisOverride);
      setExpanded(true);
    }
  }, [analysisOverride]);

  const tags       = parseTags(file.tags);
  const hasSupply  = tags.some(isSupplyTag);
  const isCOI      = tags.includes('COI');
  const coiExpiry  = isCOI ? getCOIExpiry(tags) : null;
  const coiMeta    = coiExpiry ? coiExpiryMeta(coiExpiry) : null;
  const url        = `/api/projects/${projectId}/files/${file.id}`;
  const ext        = file.originalName.split('.').pop()?.toLowerCase();
  const isPdf      = ext === 'pdf';

  // Primary tag (first one)
  const primaryTag = tags[0] ? tagMeta(tags[0]) : null;
  const risk       = analysis?.overall_risk_score;

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeErr(null);
    try {
      // Park-and-poll: the review runs in steps behind the front door, so a
      // 4-minute scanned contract no longer dies at 30 seconds. No client-side
      // clock, the server says when it has given up (job_timeout).
      const res  = await postParked(`/api/projects/${projectId}/analyze-contract`, { fileId: file.id });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeErr(data.error === 'job_timeout'
          ? 'Analysis timed out, the document may be too large. Try a smaller PDF or a specific exhibit.'
          : (data.message || data.error || 'Analysis failed'));
      } else {
        setAnalysis(data.analysis);
        setExpanded(true);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        setAnalyzeErr('Analysis timed out, the document may be too large. Try a smaller PDF or a specific exhibit.');
      } else {
        setAnalyzeErr('Network error: ' + e.message);
      }
    }
    setAnalyzing(false);
  }

  return (
    <div className="border-b border-slate-100 last:border-0">
      {/* Phones: the action buttons drop to their own line (Mike 10-29) */}
      <div className={`flex flex-wrap md:flex-nowrap items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${expanded ? 'bg-slate-50' : ''}`}>
        {/* File icon */}
        <div className="shrink-0">
          {isPdf ? (
            <svg className="w-7 h-8 text-red-400" viewBox="0 0 24 28" fill="none">
              <rect width="24" height="28" rx="2" fill="currentColor" fillOpacity="0.12"/>
              <text x="12" y="18" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">PDF</text>
            </svg>
          ) : (
            <svg className="w-7 h-8 text-green-500" viewBox="0 0 24 28" fill="none">
              <rect width="24" height="28" rx="2" fill="currentColor" fillOpacity="0.12"/>
              <text x="12" y="18" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">XLS</text>
            </svg>
          )}
        </div>

        {/* Name + metadata */}
        <div className="flex-1 min-w-0">
          {onView ? (
            <button onClick={onView}
              className="text-sm font-medium text-slate-800 hover:text-orange-600 transition-colors truncate block text-left w-full">
              {file.originalName}
              <span className="ml-1.5 text-[11px] text-slate-400">· click to view</span>
            </button>
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-sm font-medium text-slate-800 hover:text-orange-600 transition-colors truncate block">
              {file.originalName}
            </a>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {/* Tag badges, skip internal COI_EXPIRY meta-tags */}
            {tags.filter(t => !t.startsWith('COI_EXPIRY:')).map(tag => {
              const m = tagMeta(tag);
              return (
                <span key={tag} className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${m.color}`}>
                  {m.label}
                </span>
              );
            })}
            {/* COI expiry badge */}
            {coiMeta && (
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${coiMeta.color}`}>
                ⏱ {coiMeta.label}
              </span>
            )}
            {/* Risk score if reviewed */}
            {risk && <RiskBadge score={risk} />}
            <span className="text-[11px] text-slate-400">{formatBytes(file.size)}</span>
            <span className="text-[11px] text-slate-400">
              {new Date(file.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
            </span>
            {file.textContent
              ? <span className="text-[11px] text-green-500 font-medium">● readable</span>
              : isPdf && <span className="text-[11px] text-slate-300 font-medium" title="Scanned PDF, AI can't read">● not readable</span>
            }
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end md:justify-start gap-1.5 shrink-0 w-full md:w-auto">
          {/* AI Review button, only for supply contracts with text */}
          {hasSupply && file.textContent && (
            analysis ? (
              <button
                onClick={() => setExpanded(v => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                  expanded
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span className="text-[11px]">⚡</span>
                {expanded ? 'Hide Review' : 'View Review'}
              </button>
            ) : (
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-orange-700 border border-slate-200 hover:border-amber-200 transition-colors disabled:opacity-60"
              >
                {analyzing ? (
                  <>
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    Analyzing…
                  </>
                ) : (
                  <>⚡ Review</>
                )}
              </button>
            )
          )}
          {hasSupply && !file.textContent && (
            <span className="text-[11px] text-slate-400 italic">Scanned PDF</span>
          )}

          {/* Download */}
          <a
            href={url}
            download={file.originalName}
            className="p-1 rounded-lg text-slate-300 hover:text-orange-600 hover:bg-orange-50 transition-colors"
            title="Download"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </a>

          {/* Archive */}
          <button
            onClick={() => onDelete(file.id)}
            className="p-1 rounded-lg text-slate-300 hover:text-orange-600 hover:bg-amber-50 transition-colors"
            title="Archive file"
          >
            <ArchiveBoxIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Analysis error */}
      {analyzeErr && (
        <div className="mx-4 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600 font-medium">Analysis failed: {analyzeErr}</p>
        </div>
      )}

      {/* Expanded analysis */}
      {expanded && analysis && (
        <div className="px-4 pb-4">
          <AnalysisPanel analysis={analysis} fileName={file.originalName} />
        </div>
      )}
    </div>
  );
}

// ─── Drop zone ────────────────────────────────────────────────────────────────
function DropZone({ onFiles, dragging, setDragging, inputRef }) {
  return (
    <div
      onDragEnter={e => { e.preventDefault(); setDragging(true); }}
      onDragOver={e  => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { e.preventDefault(); setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={[
        'border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-all',
        dragging ? 'border-orange-400 bg-amber-50 scale-[1.01]' : 'border-slate-200 hover:border-amber-300 hover:bg-slate-50',
      ].join(' ')}
    >
      <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv" className="hidden"
        onChange={e => onFiles(e.target.files)} />

      <div className={`w-10 h-10 mx-auto mb-3 rounded-xl flex items-center justify-center ${dragging ? 'bg-amber-100' : 'bg-slate-100'}`}>
        <svg className={`w-5 h-5 ${dragging ? 'text-amber-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      </div>
      <p className={`text-sm font-semibold ${dragging ? 'text-amber-600' : 'text-slate-600'}`}>
        {dragging ? 'Drop to upload' : 'Drop any contract document here'}
      </p>
      <p className="text-xs text-slate-400 mt-1">
        Supply contracts · COIs · Amendments · SOVs · Proposals
      </p>
      <p className="text-xs text-slate-300 mt-0.5">PDF, Excel, CSV</p>
    </div>
  );
}

// ─── Main ContractsPanel ──────────────────────────────────────────────────────
// Tag helpers for filtering
function isDesignTag(tag) { return tag === 'Design - Executed' || tag === 'Design'; }
function isSupplyTagFull(tag) { return !isDesignTag(tag); } // everything else is supply-side

// ─── Simple file row (COI, SOV, and grouped contract sections) ────────────────
function SimpleFileRow({ file, projectId, onDelete, onView }) {
  const ext   = file.originalName.split('.').pop()?.toLowerCase();
  const isPdf = ext === 'pdf';
  const url   = `/api/projects/${projectId}/files/${file.id}`;
  const tags  = parseTags(file.tags).filter(t => !t.startsWith('COI_EXPIRY:'));

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
      {/* Icon */}
      <div className="shrink-0">
        {isPdf ? (
          <svg className="w-7 h-8 text-red-400" viewBox="0 0 24 28" fill="none">
            <rect width="24" height="28" rx="2" fill="currentColor" fillOpacity="0.12"/>
            <text x="12" y="18" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">PDF</text>
          </svg>
        ) : (
          <svg className="w-7 h-8 text-green-500" viewBox="0 0 24 28" fill="none">
            <rect width="24" height="28" rx="2" fill="currentColor" fillOpacity="0.12"/>
            <text x="12" y="18" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="bold">{ext?.toUpperCase().slice(0,3)}</text>
          </svg>
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        {isPdf && onView ? (
          <button onClick={onView} className="text-sm font-semibold text-slate-800 hover:text-orange-600 transition-colors text-left truncate block w-full">
            {file.originalName}
          </button>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-slate-800 hover:text-orange-600 transition-colors truncate block">
            {file.originalName}
          </a>
        )}
        <div className="flex flex-wrap md:flex-nowrap items-center gap-2 mt-0.5">
          {tags.map(t => {
            const m = tagMeta(t);
            return <span key={t} className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${m.color}`}>{m.label}</span>;
          })}
          <span className="text-[11px] text-slate-400">{formatBytes(file.size)}</span>
          <span className="text-[11px] text-slate-400">
            {new Date(file.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* View (PDF only) */}
        {isPdf && onView && (
          <button onClick={onView} className="p-1.5 rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors" title="View">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
        {/* Download */}
        <a href={url} download={file.originalName} className="p-1.5 rounded-lg text-slate-300 hover:text-orange-600 hover:bg-orange-50 transition-colors" title="Download">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </a>
        {/* Archive */}
        <button onClick={() => onDelete(file.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-orange-600 hover:bg-amber-50 transition-colors" title="Archive">
          <ArchiveBoxIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function ContractsPanel({ projectId, initialFiles = [], onFileAdded, onFileDeleted, supplyOnly = false, designOnly = false }) {
  const [files,       setFiles]       = useState(initialFiles);
  const [dragging,    setDragging]    = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // { file: File }
  const [uploading,   setUploading]   = useState([]);   // [{ id, name }]
  const [uploadErrors, setUploadErrors] = useState([]);  // [{ id, msg }], shown until dismissed
  const [newAnalyses, setNewAnalyses] = useState({});   // fileId → analysis
  const [activeTag,   setActiveTag]   = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState(null); // PDF viewer
  const [archiveAsk,  setArchiveAsk]  = useState(null); // the file being asked about
  const [archiving,   setArchiving]   = useState(false);
  const inputRef = useRef(null);

  // For designOnly mode: only show these two tag options
  const DESIGN_ALLOWED_TAGS = ['Design - Executed', 'Design'];

  const handleFiles = useCallback((fileList) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    // Open modal for first file; queue rest
    if (arr.length === 1) {
      setPendingFile({ file: arr[0] });
    } else {
      // For multi-file drop, open modal for each sequentially
      setPendingFile({ file: arr[0], queue: arr.slice(1) });
    }
  }, []);

  async function doUpload(file, tag, aiReview) {
    const uid = `${Date.now()}-${Math.random()}`;
    const label = aiReview ? `${file.name} · uploading + AI review…` : file.name;
    // Never let a failure be silent, say what went wrong and what to do about it.
    const fail = (msg) => setUploadErrors(prev => [...prev, { id: uid, msg }]);

    const tooBig = oversizeMessage(file);
    if (tooBig) { fail(tooBig); return; }

    setUploading(prev => [...prev, { id: uid, name: file.name, reviewing: aiReview }]);

    const form = new FormData();
    form.append('tab',  'contracts');
    form.append('tags', JSON.stringify([tag]));

    let uploadedFile = null;
    try {
      // Inside the try: sending straight to S3 can fail too, and that message
      // belongs in the same banner as everything else.
      await appendUpload(form, file, { scope: 'project' });
      const res = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: form });
      if (res.ok) {
        const data = await res.json();
        uploadedFile = data.file;
        setFiles(prev => [data.file, ...prev]);
        onFileAdded?.(data.file, data.contractUpdate ?? null);
      } else {
        fail(await uploadErrorMessage(res, file));
      }
    } catch (e) {
      fail(uploadThrowMessage(e, file));
    }

    // Auto-run AI review for supply contracts
    if (aiReview && uploadedFile?.id) {
      try {
        const res  = await postParked(`/api/projects/${projectId}/analyze-contract`, { fileId: uploadedFile.id });
        const data = await res.json();
        if (res.ok && data.analysis) {
          setNewAnalyses(prev => ({ ...prev, [uploadedFile.id]: data.analysis }));
        }
      } catch {}
    }

    setUploading(prev => prev.filter(u => u.id !== uid));
  }

  function onModalConfirm({ tag, aiReview }) {
    const { file, queue } = pendingFile;
    setPendingFile(null);
    doUpload(file, tag, aiReview);
    // If there are queued files, open modal for next one
    if (queue?.length) {
      setTimeout(() => setPendingFile({ file: queue[0], queue: queue.slice(1) }), 100);
    }
  }

  // The rows' Archive buttons call this; it only asks. Contracts are archived,
  // never deleted (migration 0076).
  function deleteFile(fileId) {
    setArchiveAsk(files.find(f => f.id === fileId) ?? { id: fileId });
  }

  async function archiveFile(fileId) {
    setArchiving(true);
    const problem = await setArchived(`/api/projects/${projectId}/files/${fileId}`);
    setArchiving(false);
    setArchiveAsk(null);
    if (problem) { alert(problem); return; }
    setFiles(prev => prev.filter(f => f.id !== fileId));
    onFileDeleted?.(fileId);
  }

  // Tag filter chips
  const presentTags = useMemo(() => {
    const set = new Set();
    files.forEach(f => parseTags(f.tags).forEach(t => {
      if (!t.startsWith('COI_EXPIRY:')) set.add(t);
    }));
    const order = CONTRACT_TAGS.map(t => t.value);
    return [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [files]);

  // Apply supply/design filter first, then activeTag filter
  const typeFilteredFiles = designOnly
    ? files.filter(f => parseTags(f.tags).some(isDesignTag))
    : supplyOnly
    ? files.filter(f => !parseTags(f.tags).some(isDesignTag))
    : files;

  const visibleFiles = activeTag
    ? typeFilteredFiles.filter(f => parseTags(f.tags).includes(activeTag))
    : typeFilteredFiles;

  // Stats, scoped to typeFilteredFiles
  const reviewedCount = typeFilteredFiles.filter(f => f.analysisData || newAnalyses[f.id]).length;
  const supplyCount   = typeFilteredFiles.filter(f => parseTags(f.tags).some(isSupplyTag)).length;

  return (
    <div className="space-y-4">
      <ConfirmArchiveModal
        open={!!archiveAsk}
        title="Archive this file?"
        what={archiveAsk?.originalName}
        body={`It comes off this tab, along with its contract review. ${KEPT_ON_ARCHIVE_PAGE}`}
        busy={archiving}
        onCancel={() => setArchiveAsk(null)}
        onConfirm={() => archiveFile(archiveAsk.id)}
      />
      {/* PDF viewer */}
      {viewingFile && (
        <PdfViewerModal
          file={viewingFile}
          projectId={projectId}
          onClose={() => setViewingFile(null)}
        />
      )}

      {/* Tag modal */}
      {pendingFile && (
        <TagModal
          fileName={pendingFile.file.name}
          onConfirm={onModalConfirm}
          onCancel={() => setPendingFile(null)}
          allowedTags={designOnly ? DESIGN_ALLOWED_TAGS : null}
        />
      )}

      {/* Drop zone */}
      <DropZone
        onFiles={handleFiles}
        dragging={dragging}
        setDragging={setDragging}
        inputRef={inputRef}
      />

      {/* Upload progress */}
      {uploading.length > 0 && (
        <div className="space-y-1.5">
          {uploading.map(u => (
            <div key={u.id} className="flex items-center gap-2.5 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <span className="truncate font-medium">{u.name}</span>
              <span className="ml-auto shrink-0 text-amber-500">
                {u.reviewing ? '⚡ Uploading + AI review in progress…' : 'Uploading…'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Upload failures, stay on screen until dismissed so nothing fails silently */}
      {uploadErrors.length > 0 && (
        <div className="space-y-1.5">
          {uploadErrors.map(err => (
            <div key={err.id} className="flex items-start gap-2.5 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="flex-1">{err.msg}</span>
              <button onClick={() => setUploadErrors(prev => prev.filter(e => e.id !== err.id))}
                className="shrink-0 text-red-400 hover:text-red-600 font-bold leading-none" title="Dismiss">×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Grouped sections (supplyOnly) or flat list (designOnly / all) ──────── */}
      {supplyOnly ? (() => {
        // Split files into three buckets, tagged COI/SOV go to their own section only
        const coiFiles      = typeFilteredFiles.filter(f => parseTags(f.tags).includes('COI'));
        const sovFiles      = typeFilteredFiles.filter(f => parseTags(f.tags).includes('SOV'));
        const contractFiles = typeFilteredFiles.filter(f => !parseTags(f.tags).includes('COI') && !parseTags(f.tags).includes('SOV'));
        const noFiles       = coiFiles.length === 0 && sovFiles.length === 0 && contractFiles.length === 0 && uploading.length === 0;

        function SectionHeader({ color, label, count }) {
          return (
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
              <span className={`w-2 h-2 rounded-full ${color} shrink-0`} />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1">{label}</p>
              <span className="text-[11px] text-slate-400">{count} file{count !== 1 ? 's' : ''}</span>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {/* ── Supply Contracts section ── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <SectionHeader color="bg-blue-500" label="Supply Contracts" count={contractFiles.length} />
              {contractFiles.length > 0 ? (
                contractFiles.map(f => (
                  <ContractFileRow
                    key={f.id}
                    file={f}
                    projectId={projectId}
                    onDelete={deleteFile}
                    analysisOverride={newAnalyses[f.id] || null}
                    onView={null}
                  />
                ))
              ) : (
                <p className="text-xs text-slate-300 italic text-center py-5">No supply contracts uploaded yet</p>
              )}
            </div>

            {/* ── Certificates of Insurance section ── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <SectionHeader color="bg-green-500" label="Certificates of Insurance" count={coiFiles.length} />
              {coiFiles.length > 0 ? (
                coiFiles.map(f => (
                  <SimpleFileRow
                    key={f.id}
                    file={f}
                    projectId={projectId}
                    onDelete={deleteFile}
                    onView={() => setViewingFile(f)}
                  />
                ))
              ) : (
                <p className="text-xs text-slate-300 italic text-center py-5">No COIs uploaded yet</p>
              )}
            </div>

            {/* ── Schedules of Values section ── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <SectionHeader color="bg-teal-500" label="Schedules of Values" count={sovFiles.length} />
              {sovFiles.length > 0 ? (
                sovFiles.map(f => (
                  <SimpleFileRow
                    key={f.id}
                    file={f}
                    projectId={projectId}
                    onDelete={deleteFile}
                    onView={() => setViewingFile(f)}
                  />
                ))
              ) : (
                <p className="text-xs text-slate-300 italic text-center py-5">No SOVs uploaded yet</p>
              )}
            </div>

            {noFiles && (
              <p className="text-center text-xs text-slate-400 py-2">Drop files above to get started, tag them as Contract, COI, or SOV.</p>
            )}
          </div>
        );
      })() : (
        <>
          {/* Flat list for designOnly / default mode */}
          {files.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <span className="text-xs text-slate-500 font-medium">{files.length} document{files.length !== 1 ? 's' : ''}</span>
                {supplyCount > 0 && (
                  <span className="text-xs text-slate-400">· {reviewedCount}/{supplyCount} reviewed</span>
                )}
                {presentTags.length > 0 && (
                  <FilterToolbar className="ml-auto" count={activeTag ? 1 : 0} open={filtersOpen}
                    onToggle={() => setFiltersOpen(o => !o)} onClear={() => setActiveTag(null)} />
                )}
              </div>
              {presentTags.length > 0 && (
                <FilterPanel open={filtersOpen} fields={TAG_FIELD} filters={{ tag: activeTag || '' }}
                  choices={{ tag: presentTags.map(tag => [tag, `${tagMeta(tag).label} (${files.filter(f => parseTags(f.tags).includes(tag)).length})`]) }}
                  onChange={(_, v) => setActiveTag(v || null)} className="m-3" />
              )}
              {visibleFiles.length > 0
                ? visibleFiles.map(f => (
                    <ContractFileRow key={f.id} file={f} projectId={projectId} onDelete={deleteFile}
                      analysisOverride={newAnalyses[f.id] || null}
                      onView={designOnly ? () => setViewingFile(f) : null}
                    />
                  ))
                : <p className="text-center text-xs text-slate-400 py-8">No documents tagged "{activeTag}".</p>
              }
            </div>
          )}
          {files.length === 0 && uploading.length === 0 && (
            <div className="text-center py-4">
              <p className="text-xs text-slate-400">No documents uploaded yet. Drop a file above to get started.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
