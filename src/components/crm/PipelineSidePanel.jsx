'use client';
/**
 * The pipeline side panel — edit a job's sales fields without leaving the board.
 *
 * Mike, 2026-09-09: "So we don't have to go into a project and come back, go into
 * a project, come back." Clicking a card on the pipeline used to navigate away
 * and lose your place on the board; now it slides this out on the right instead.
 *
 * Every field saves the moment you leave it. The fields are the same ones on the
 * project's own Sales Details card and they save through the same API, so the two
 * screens can never disagree about what a field means or which are required.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { cleanNumberInput } from '@/lib/numberInput';
import Link from 'next/link';
import {
  PIPELINE_STAGES, STAGE_LABEL, PIPELINE_STATUS, STATUS_LABEL,
  inDesignPipeline, stagesOutOfSync, averageProbability,
} from '@/lib/pipeline';
import { PROJECT_TEAM_ROLES } from '@/lib/projectTeam';

const STATUS_OPTIONS      = PIPELINE_STATUS.map(s => ({ value: s.key, label: s.label }));
const PROC_STAGE_OPTIONS  = PIPELINE_STAGES.PROCUREMENT.map(s => ({ value: s.key, label: s.label }));
const DESIGN_STAGE_OPTIONS = PIPELINE_STAGES.DESIGN.map(s => ({ value: s.key, label: s.label }));

const money = v => (v == null || v === '' ? null : `$${Number(v).toLocaleString()}`);

/**
 * One field. Reads as plain text until you click it, then becomes an input or a
 * dropdown and saves on blur — the same click-to-edit behaviour as the project
 * screen, so nothing new has to be learned to use it.
 */
// A stored date that will not parse must not take the whole screen down
// (toISOString() throws on an invalid Date).
function dateInputValue(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// Money boxes: '1,200,000' or '$41,200' is what people type. Send only the
// digits so the API never sees a comma (Maram, 9-18).
const cleanMoney = cleanNumberInput;

function Field({ label, displayValue, rawValue, onSave, select, options = [], type = 'text', readOnly, accent }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(rawValue ?? '');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { setValue(rawValue ?? ''); }, [rawValue]);

  async function commit(next) {
    setEditing(false);
    if (String(next ?? '') === String(rawValue ?? '')) return;
    setSaving(true);
    await onSave(next);
    setSaving(false);
  }

  const shown = displayValue != null && displayValue !== '' ? displayValue : null;

  return (
    <div className="py-2 flex items-baseline gap-3">
      <p className="w-40 shrink-0 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <div className="flex-1 min-w-0">
        {readOnly ? (
          <p className={`text-sm font-semibold ${shown ? (accent || 'text-slate-800') : 'text-slate-300'}`}>{shown ?? '—'}</p>
        ) : editing ? (
          select ? (
            <select
              autoFocus
              value={value}
              onChange={e => { setValue(e.target.value); commit(e.target.value); }}
              onBlur={() => setEditing(false)}
              className="w-full px-2 py-1 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              autoFocus
              type={type}
              value={value}
              onChange={e => setValue(e.target.value)}
              onBlur={() => commit(value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commit(value);
                if (e.key === 'Escape') { setValue(rawValue ?? ''); setEditing(false); }
              }}
              className="w-full px-2 py-1 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`text-left w-full text-sm font-semibold rounded px-1 -mx-1 hover:bg-amber-50 transition-colors ${
              shown ? (accent || 'text-slate-800') : 'text-slate-300'
            }`}
          >
            {saving ? <span className="text-amber-500">Saving…</span> : (shown ?? '—')}
          </button>
        )}
      </div>
    </div>
  );
}

function Rule({ label }) {
  return (
    <p className="mt-4 mb-1 pt-3 border-t border-slate-100 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
      {label}
    </p>
  );
}

export default function PipelineSidePanel({ project, onClose, onUpdate }) {
  const [error, setError] = useState(null);
  const [salesUsers, setSalesUsers] = useState([]);
  const panelRef = useRef(null);

  // Esc closes, the same as every other overlay on the platform.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    fetch('/api/users?department=SALES_MARKETING')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setSalesUsers(d.users || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const save = useCallback(async (field, value) => {
    setError(null);
    const payload = { [field]: value === '' ? null : value };

    // Mike's rule: a deal cannot go to Lost or Abandoned without a written
    // reason. Asked here so the round trip is not wasted; the API enforces it
    // regardless of which screen the change came from.
    if ((field === 'procurementStatus' || field === 'designStatus') &&
        (value === 'LOST' || value === 'ABANDONED')) {
      const word   = value === 'LOST' ? 'lost' : 'abandoned';
      const reason = prompt(`Why was this project ${word}? (required)`, project[`${field}Reason`] || '');
      if (reason === null) return;
      if (!reason.trim()) { setError(`A reason is required to mark a project ${word}.`); return; }
      payload[`${field}Reason`] = reason.trim();
    }

    const res  = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'That did not save.'); return; }

    // The API hands back the project without the client / owner names the board
    // shows, so put the owner's name back on before the card re-renders —
    // otherwise changing the owner blanks the name until the page is reloaded.
    const saved = { ...data.project };
    if (field === 'salesOwnerId') {
      const owner = salesUsers.find(u => u.id === value);
      saved.salesOwner = owner ? { id: owner.id, name: owner.name || owner.email } : null;
    }
    onUpdate?.(saved);
  }, [project, onUpdate, salesUsers]);

  const p = field => value => save(field, value);
  const pMoney = field => value => save(field, cleanMoney(value));

  const isDesign     = inDesignPipeline(project.serviceType);
  const combined     = (project.contractValue || 0) + (project.designContractValue || 0);
  const avgProb      = averageProbability(project);
  const outOfSync    = stagesOutOfSync(project);
  const ownerId      = project.salesOwnerId ?? project.salesOwner?.id ?? '';
  const ownerOptions = [{ value: '', label: '— Unassigned —' }, ...salesUsers.map(u => ({ value: u.id, label: u.name || u.email }))];
  const ownerName    = salesUsers.find(u => u.id === ownerId)?.name || (ownerId ? project.salesOwner?.name : null);
  // The team seats, read-only here. Editing them belongs on the project screen
  // where the full company list is already loaded.
  const team = PROJECT_TEAM_ROLES
    .map(role => ({ label: role.label, name: project[role.relation]?.name }))
    .filter(row => row.name);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Clicking off the panel closes it — the board is still right there. */}
      <div className="absolute inset-0 bg-slate-900/20" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-label={`${project.name} sales details`}
        className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col"
      >
        {/* ── Header ── */}
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {project.projectNumber && (
                <span className="text-[11px] font-mono font-semibold text-slate-400">
                  PRJ-{String(project.projectNumber).padStart(4, '0')}
                </span>
              )}
              <h2 className="text-lg font-bold text-slate-900 truncate">{project.name}</h2>
              <p className="text-xs text-slate-400 truncate">
                {[project.client?.name, [project.city, project.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'No client yet'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Link
              href={`/project/${project.id}`}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700"
            >
              Open full project →
            </Link>
            {outOfSync && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full" title="Procurement and Design stages differ">
                ⚠ stages differ
              </span>
            )}
          </div>
        </div>

        {/* ── Fields ── */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

          <Rule label="Pipeline" />
          <Field label="Procurement Stage" displayValue={STAGE_LABEL[project.procurementStage] || 'Qualified'}
            rawValue={project.procurementStage || 'QUALIFIED'} onSave={p('procurementStage')} select options={PROC_STAGE_OPTIONS} />
          <Field label="Procurement Status" displayValue={STATUS_LABEL[project.procurementStatus] || 'Open'}
            rawValue={project.procurementStatus || 'OPEN'} onSave={p('procurementStatus')} select options={STATUS_OPTIONS} />
          {project.procurementStatusReason && (
            <Field label="Why Procurement Closed" displayValue={project.procurementStatusReason} readOnly />
          )}
          {isDesign && (
            <>
              <Field label="Design Stage" displayValue={STAGE_LABEL[project.designStage] || 'Qualified'}
                rawValue={project.designStage || 'QUALIFIED'} onSave={p('designStage')} select options={DESIGN_STAGE_OPTIONS} />
              <Field label="Design Status" displayValue={STATUS_LABEL[project.designStatus] || 'Open'}
                rawValue={project.designStatus || 'OPEN'} onSave={p('designStatus')} select options={STATUS_OPTIONS} />
              {project.designStatusReason && (
                <Field label="Why Design Closed" displayValue={project.designStatusReason} readOnly />
              )}
            </>
          )}
          <Field label="Sales Owner" displayValue={ownerName} rawValue={ownerId} onSave={p('salesOwnerId')} select options={ownerOptions} />

          <Rule label="Revenue" />
          <Field label="Product Sale Total ($)" displayValue={money(project.contractValue)}
            rawValue={project.contractValue ?? ''} onSave={pMoney('contractValue')} />
          <Field label="Design Fee Total ($)" displayValue={money(project.designContractValue)}
            rawValue={project.designContractValue ?? ''} onSave={pMoney('designContractValue')} />
          <Field label="Total Combined ($)" displayValue={money(combined)} readOnly accent="text-blue-600" />

          <Rule label="Forecast" />
          <Field label="Probability to Win (%)" displayValue={project.probabilityToWin != null ? `${project.probabilityToWin}%` : null}
            rawValue={project.probabilityToWin ?? ''} onSave={p('probabilityToWin')} type="number" />
          <Field label="Probability to Move Forward (%)" displayValue={project.probabilityToMoveForward != null ? `${project.probabilityToMoveForward}%` : null}
            rawValue={project.probabilityToMoveForward ?? ''} onSave={p('probabilityToMoveForward')} type="number" />
          <Field label="Average Probability (%)" displayValue={avgProb != null ? `${avgProb}%` : null} readOnly accent="text-blue-600" />
          <Field label="Expected Order Date"
            displayValue={project.expectedOrderDate ? new Date(project.expectedOrderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null}
            rawValue={dateInputValue(project.expectedOrderDate)}
            onSave={p('expectedOrderDate')} type="date" />

          {team.length > 0 && (
            <>
              <Rule label="Project Team" />
              {team.map(row => (
                <Field key={row.label} label={row.label} displayValue={row.name} readOnly />
              ))}
            </>
          )}

          <p className="mt-5 mb-2 text-[10px] text-slate-400 leading-relaxed">
            Everything here saves as soon as you leave the field. The board behind
            this panel updates with it.
          </p>
        </div>
      </div>
    </div>
  );
}
