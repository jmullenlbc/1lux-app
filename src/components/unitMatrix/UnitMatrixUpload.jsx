'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { oversizeMessage, uploadErrorMessage, uploadThrowMessage } from '@/lib/uploadErrorMessage';
import { appendUpload } from '@/lib/uploadClient';
import { postParked } from '@/lib/parkedFetch';
import ReadingWait, { READING_TIME_HINT } from '@/components/ReadingWait';

// ── confidence → display tier ────────────────────────────────────────────────
function confidenceTier(conf) {
  if (conf == null) return 'manual';
  if (conf >= 0.85)  return 'high';
  if (conf >= 0.60)  return 'confirm';
  return 'low';
}

function ConfChip({ tier, pct }) {
  // `check` is the red tier: we filled the number in, but we are not sure enough
  // about it to let it slide past without a human looking. It shows the actual
  // percentage rather than a word, because "we're 48% sure" and "we're 71% sure"
  // deserve different amounts of squinting and a single label hides that.
  if (tier === 'check')   return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-300">{pct != null ? `${pct}%` : 'Check'}</span>;
  if (tier === 'high')    return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">{pct != null ? `${pct}%` : 'High'}</span>;
  if (tier === 'confirm') return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{pct != null ? `${pct}%` : 'Confirm'}</span>;
  return                         <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">Manual</span>;
}

// ── rollup calculation ────────────────────────────────────────────────────────
function rollup(rows) {
  let units = 0, sf = 0, bed = 0, bath = 0, balc = 0;
  for (const r of rows) {
    const q = Number(r.qty) || 0;
    units += q;
    if (r.unitSf    != null) sf   += q * (Number(r.unitSf)    || 0);
    if (r.bedrooms  != null) bed  += q * (Number(r.bedrooms)  || 0);
    if (r.bathrooms != null) bath += q * (Number(r.bathrooms) || 0);
    if (r.balconies != null) balc += q * (Number(r.balconies) || 0);
  }
  const hasSf   = rows.some(r => r.unitSf    != null);
  const hasBed  = rows.some(r => r.bedrooms  != null);
  const hasBath = rows.some(r => r.bathrooms != null);
  const hasBalc = rows.some(r => r.balconies != null);
  return { units, sf: hasSf ? sf : null, bed: hasBed ? bed : null, bath: hasBath ? bath : null, balc: hasBalc ? balc : null };
}

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }

// ── automatic checks ─────────────────────────────────────────────────────────
// Results from the deterministic checks in src/lib/agent/autoChecks.js, shown at
// the moment somebody is deciding whether to apply the extraction. Deliberately
// here rather than only in /admin/agent-runs: a contradiction found after the
// numbers are already in a budget is a correction, and a contradiction found
// before they are is just a fix.
function CheckList({ review }) {
  if (!review || !Array.isArray(review.checks) || review.checks.length === 0) return null;

  const failed  = review.checks.filter(c => c.status === 'FAIL');
  const skipped = review.checks.filter(c => c.status === 'SKIP');
  const passed  = review.checks.filter(c => c.status === 'PASS');

  if (failed.length === 0) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2.5 text-xs text-green-800 flex items-start gap-2">
        <svg className="w-4 h-4 shrink-0 mt-px" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        <span>
          <span className="font-semibold">{passed.length} automatic check{passed.length !== 1 ? 's' : ''} passed.</span>
          {' '}The numbers add up against each other.
          {skipped.length > 0 && <span className="text-green-700/70"> {skipped.length} check{skipped.length !== 1 ? 's' : ''} couldn&apos;t run — the document didn&apos;t give them anything to compare.</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
        </svg>
        <span className="text-sm font-semibold text-red-800">
          {failed.length} automatic check{failed.length !== 1 ? 's' : ''} failed
        </span>
      </div>
      <ul className="space-y-1.5 text-xs text-red-700">
        {failed.map(c => (
          <li key={c.key} className="flex gap-2">
            <span className="text-red-400 shrink-0">•</span>
            <span>{c.detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11px] text-red-600/80 border-t border-red-200 pt-2">
        These are arithmetic, not opinions — something in the extraction contradicts something else in it.
        Fix the rows below before applying, or apply anyway if the document really is like this.
      </p>
    </div>
  );
}

// ── inline-editable cell ─────────────────────────────────────────────────────
function EditCell({ value, onChange, numeric, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const inputRef = useRef(null);

  function start() {
    setDraft(value ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    setEditing(false);
    const v = numeric ? (draft === '' ? null : Number(draft)) : (draft || null);
    if (v !== value) onChange(v);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className={`w-full bg-blue-50 border border-blue-300 rounded px-1.5 py-0.5 text-sm font-mono outline-none ${className}`}
        style={{ minWidth: 48 }}
      />
    );
  }
  return (
    <span
      onClick={start}
      className={`cursor-text hover:bg-slate-100 rounded px-1.5 py-0.5 block ${value == null ? 'text-slate-300' : ''} ${className}`}
    >
      {value == null ? '—' : value}
    </span>
  );
}

// ── review modal ─────────────────────────────────────────────────────────────
function ReviewModal({ proposal, fileName, onConfirm, onCancel }) {
  // rows = editable copy of unitTypes
  const [rows, setRows]             = useState(() => (proposal.unitTypes || []).map((r, i) => ({ ...r, _key: i })));
  const [grossSf, setGrossSf]       = useState(proposal.projectTotals?.grossInteriorSf ?? null);
  const [garageSf, setGarageSf]     = useState(proposal.projectTotals?.garageSf ?? null);
  const [corridorSf, setCorridorSf] = useState(proposal.projectTotals?.corridorSf ?? null);

  // The net-vs-gross verdict for the Gross Interior SF row. See src/lib/areaSheet.js.
  //
  // Once the reviewer types their own number the verdict stops applying — it was
  // about the number we read off the drawing, not about theirs. Keeping the red
  // flag on a hand-entered figure would be telling them we're unsure about their
  // own input, and the flag would never clear no matter what they did.
  const gross = useMemo(() => {
    const pt = proposal.projectTotals ?? {};
    const edited = pt.grossInteriorSf != null && grossSf !== pt.grossInteriorSf;
    if (edited) return { needsReview: false, confidence: null, reviewNote: null };

    const parts = [];
    if (pt.grossSfSummary) parts.push(pt.grossSfSummary);
    if (pt.grossSfSheet)   parts.push(`Read from sheet ${pt.grossSfSheet}.`);
    if (pt.grossSfAdjusted && pt.grossSfStated != null) {
      parts.push(`The drawing states ${fmt(pt.grossSfStated)} SF.`);
    }
    return {
      needsReview: !!pt.grossSfNeedsReview,
      confidence:  pt.grossSfConfidence ?? null,
      reviewNote:  parts.join(' ') || null,
    };
  }, [proposal, grossSf]);

  // Which fields are checked for writing to ProjectData
  const totals = rollup(rows);

  const tierA = { numUnits: totals.units, unitsSf: totals.sf, numBedrooms: totals.bed, numBathrooms: totals.bath };
  const tierB = { numBalconies: totals.balc, grossSf };

  const [checked, setChecked] = useState(() => {
    const init = {};
    if (tierA.numUnits   != null) init.numUnits    = true;
    if (tierA.unitsSf    != null) init.unitsSf     = true;
    if (tierA.numBedrooms!= null) init.numBedrooms = true;
    if (tierA.numBathrooms!=null) init.numBathrooms= true;
    // Tier B always starts unchecked — user must explicitly confirm
    init.numBalconies = false;
    init.grossSf      = false;
    init.garageSf     = false;
    init.corridorSf   = false;
    return init;
  });

  function updateRow(key, field, value) {
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  }

  function deleteRow(key) {
    setRows(prev => prev.filter(r => r._key !== key));
  }

  function addRow() {
    setRows(prev => [...prev, { _key: Date.now(), code: '', label: null, qty: 0, unitSf: null, bedrooms: null, bathrooms: null, balconies: null, source: 'MANUAL', confidence: null }]);
  }

  // Recompute totals whenever rows change
  const live = rollup(rows);
  const readyCount = Object.entries(checked).filter(([, v]) => v).length;
  const totalFields = Object.keys(checked).length;

  function handleApply() {
    const confirmedFields = {};
    if (checked.numUnits    && live.units != null)  confirmedFields.numUnits    = live.units;
    if (checked.unitsSf     && live.sf    != null)  confirmedFields.unitsSf     = live.sf;
    if (checked.numBedrooms && live.bed   != null)  confirmedFields.numBedrooms = live.bed;
    if (checked.numBathrooms&& live.bath  != null)  confirmedFields.numBathrooms= live.bath;
    if (checked.numBalconies&& live.balc  != null)  confirmedFields.numBalconies= live.balc;
    if (checked.grossSf     && grossSf    != null)  confirmedFields.grossSf     = grossSf;
    if (checked.garageSf    && garageSf   != null)  confirmedFields.garageSf    = garageSf;
    if (checked.corridorSf  && corridorSf != null)  confirmedFields.corridorSf  = corridorSf;

    onConfirm({ unitTypes: rows.map(({ _key, ...r }) => r), confirmedFields });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-6">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-slate-800">Review Unit Matrix</span>
            {rows.length > 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                {rows.length} type{rows.length !== 1 ? 's' : ''} detected
              </span>
            )}
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        {/* Provenance strip */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
            <span className="font-mono text-slate-600">{fileName}</span>
          </div>
          {proposal.overallConfidence != null && (
            <div className="text-slate-400">
              Extraction confidence <span className="font-semibold text-green-700">{Math.round(proposal.overallConfidence * 100)}%</span>
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-7 max-h-[62vh] overflow-y-auto">

          <CheckList review={proposal.review} />

          {/* ── Section 1: Unit Types ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Unit Types Extracted</div>
              <button onClick={addRow} className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                </svg>Add type
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-left">
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Label</th>
                    <th className="px-4 py-2.5 text-right">Qty</th>
                    <th className="px-4 py-2.5 text-right">Unit SF</th>
                    <th className="px-4 py-2.5 text-center">Bed</th>
                    <th className="px-4 py-2.5 text-center">Bath</th>
                    <th className="px-4 py-2.5 text-center">Balc</th>
                    <th className="px-4 py-2.5 text-center">Conf.</th>
                    <th className="px-2 py-2.5 w-6"></th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {rows.map((row, idx) => (
                    <tr key={row._key} className={`border-b border-slate-50 hover:bg-slate-50/40 ${idx % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                      <td className="px-4 py-2">
                        <EditCell value={row.code} onChange={v => updateRow(row._key, 'code', v)} className="font-mono font-semibold" />
                      </td>
                      <td className="px-4 py-2">
                        <EditCell value={row.label} onChange={v => updateRow(row._key, 'label', v)} className="text-slate-500" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <EditCell value={row.qty} onChange={v => updateRow(row._key, 'qty', v)} numeric className="font-mono text-right" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <EditCell value={row.unitSf} onChange={v => updateRow(row._key, 'unitSf', v)} numeric className="font-mono text-right" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <EditCell value={row.bedrooms} onChange={v => updateRow(row._key, 'bedrooms', v)} numeric className="text-center" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <EditCell value={row.bathrooms} onChange={v => updateRow(row._key, 'bathrooms', v)} numeric className="text-center" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <EditCell value={row.balconies} onChange={v => updateRow(row._key, 'balconies', v)} numeric className="text-center" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <ConfChip tier={confidenceTier(row.confidence)} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => deleteRow(row._key)} className="text-slate-300 hover:text-red-400 transition-colors text-xs leading-none">&times;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rollup bar */}
            {rows.length > 0 && (
              <div className="mt-3 flex items-center gap-5 rounded-xl bg-amber-50 border border-amber-100 px-4 py-2.5 text-sm flex-wrap">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Rolls up to</span>
                <span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.units)}</span> units</span>
                {live.sf   != null && <><span className="text-slate-300">·</span><span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.sf)}</span> unit SF</span></>}
                {live.bed  != null && <><span className="text-slate-300">·</span><span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.bed)}</span> bed</span></>}
                {live.bath != null && <><span className="text-slate-300">·</span><span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.bath)}</span> bath</span></>}
                {live.balc != null && <><span className="text-slate-300">·</span><span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.balc)}</span> balconies</span></>}
              </div>
            )}
          </div>

          {/* ── Section 2: Apply to Project Info ── */}
          <div>
            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Apply to Project Info</div>
            <p className="text-xs text-slate-400 mb-4">Checked fields write to the dashboard. Unchecked fields are left untouched.</p>

            <div className="grid grid-cols-2 gap-x-10 gap-y-6">

              {/* Square Footage */}
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">Square Footage</div>
                <div className="space-y-1.5">
                  <FieldRow
                    label="Unit / Room SF"
                    value={live.sf}
                    fieldKey="unitsSf"
                    checked={checked}
                    setChecked={setChecked}
                    tier={live.sf != null ? 'high' : 'manual'}
                    available={live.sf != null}
                  />
                  <FieldRow
                    label="Gross Interior SF"
                    value={grossSf}
                    fieldKey="grossSf"
                    checked={checked}
                    setChecked={setChecked}
                    tier={grossSf == null ? 'manual' : gross.needsReview ? 'check' : 'confirm'}
                    pct={grossSf != null && gross.confidence != null ? Math.round(gross.confidence * 100) : null}
                    note={gross.reviewNote}
                    available={grossSf != null}
                    alwaysConfirm
                    editable
                    onEdit={setGrossSf}
                  />
                  <FieldRow
                    label="Garage SF"
                    value={garageSf}
                    fieldKey="garageSf"
                    checked={checked}
                    setChecked={setChecked}
                    tier={garageSf != null ? 'confirm' : 'manual'}
                    available={garageSf != null}
                    alwaysConfirm
                    editable
                    onEdit={setGarageSf}
                  />
                  <FieldRow
                    label="Corridor SF"
                    value={corridorSf}
                    fieldKey="corridorSf"
                    checked={checked}
                    setChecked={setChecked}
                    tier={corridorSf != null ? 'confirm' : 'manual'}
                    available={corridorSf != null}
                    alwaysConfirm
                    editable
                    onEdit={setCorridorSf}
                  />
                  <GreyRow label="BOH / Amenity / Lot / Footprint SF" note="+4 fields" />
                </div>
              </div>

              {/* Counts */}
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">Counts</div>
                <div className="space-y-1.5">
                  <FieldRow
                    label="# Units / Rooms"
                    value={live.units}
                    fieldKey="numUnits"
                    checked={checked}
                    setChecked={setChecked}
                    tier={live.units > 0 ? 'high' : 'manual'}
                    available={live.units > 0}
                  />
                  <FieldRow
                    label="# Bedrooms"
                    value={live.bed}
                    fieldKey="numBedrooms"
                    checked={checked}
                    setChecked={setChecked}
                    tier={live.bed != null ? 'high' : 'manual'}
                    available={live.bed != null}
                  />
                  <FieldRow
                    label="# Bathrooms"
                    value={live.bath}
                    fieldKey="numBathrooms"
                    checked={checked}
                    setChecked={setChecked}
                    tier={live.bath != null ? 'high' : 'manual'}
                    available={live.bath != null}
                  />
                  <FieldRow
                    label="# Balconies"
                    value={live.balc}
                    fieldKey="numBalconies"
                    checked={checked}
                    setChecked={setChecked}
                    tier={live.balc != null ? 'confirm' : 'manual'}
                    available={live.balc != null}
                    alwaysConfirm
                  />
                  <GreyRow label="# Vanities" note="from fixture schedule" />
                  <GreyRow label="# Ceiling Fans / Stairwells / Parking" note="+5 fields" />
                </div>
              </div>
            </div>
          </div>

          {/* Notes from extraction */}
          {proposal.notes && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-600">Extraction notes: </span>{proposal.notes}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{readyCount}</span> field{readyCount !== 1 ? 's' : ''} selected ·{' '}
            <span className="text-slate-400">{totalFields - readyCount} unchecked (left unchanged)</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold">
              Cancel
            </button>
            <button onClick={handleApply} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm">
              Apply to Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value, fieldKey, checked, setChecked, tier, available, alwaysConfirm, editable, onEdit, pct, note }) {
  const isChecked = !!checked[fieldKey];
  const isCheck = tier === 'check' && available;

  if (!available) {
    return (
      <div className="flex items-center gap-3 py-1 opacity-50">
        <div className="w-4 h-4 rounded border border-slate-200 bg-slate-50 shrink-0" />
        <span className="text-sm text-slate-500 flex-1">{label}</span>
        <span className="font-mono text-sm text-slate-300">—</span>
        <span className="w-16"><ConfChip tier="manual" /></span>
      </div>
    );
  }

  return (
    <div className={isCheck ? 'rounded-lg border border-red-200 bg-red-50/60 px-2 -mx-2 py-1' : ''}>
      <label className="flex items-center gap-3 py-1 cursor-pointer group">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={e => setChecked(prev => ({ ...prev, [fieldKey]: e.target.checked }))}
          className="accent-amber-500 w-4 h-4 shrink-0"
        />
        <span className={`text-sm flex-1 ${isCheck ? 'text-red-800 font-semibold' : 'text-slate-600'}`}>
          {label}{alwaysConfirm ? ' *' : ''}
        </span>
        {editable && onEdit ? (
          <EditCell
            value={value}
            onChange={onEdit}
            numeric
            className={`font-mono text-sm w-24 text-right ${isCheck ? 'text-red-700 font-semibold' : 'text-slate-800'}`}
          />
        ) : (
          <span className={`font-mono text-sm rounded px-1.5 py-0.5 group-hover:bg-slate-50 ${isCheck ? 'text-red-700 font-semibold' : 'text-slate-800'}`}>
            {fmt(value)}
          </span>
        )}
        <span className="w-16"><ConfChip tier={tier} pct={pct} /></span>
      </label>
      {/* The reason, not just the flag. A red number with no explanation makes a
          reviewer distrust the whole panel; a red number that says WHY tells them
          exactly which sheet to open and what to look for. */}
      {isCheck && note && (
        <p className="text-[11px] text-red-700/80 leading-snug pl-7 pr-16 pb-1">{note}</p>
      )}
    </div>
  );
}

function GreyRow({ label, note }) {
  return (
    <div className="flex items-center gap-3 py-1 opacity-45">
      <div className="w-4 h-4 rounded border border-slate-200 bg-slate-50 shrink-0" />
      <span className="text-sm text-slate-500 flex-1">{label}</span>
      {note && <span className="font-mono text-[11px] text-slate-300">{note}</span>}
      <span className="w-16"><ConfChip tier="manual" /></span>
    </div>
  );
}

// ── main upload component ─────────────────────────────────────────────────────
// `onCommitted(projectData)` is optional: the questionnaires pass it so their
// form and live budget refresh the moment an apply lands, without a reload.
// The Takeoffs tab omits it and behaves exactly as before.
export default function UnitMatrixUpload({ projectId, onCommitted }) {
  const [state, setState]         = useState('loading'); // loading|idle|uploading|parsing|reviewing|committed|error
  // When the read started, so the wait can be counted out loud. A matrix on a
  // plotted sheet is read by a model, and that is minutes, not a page load.
  const [readingSince, setReadingSince] = useState(null);
  const [existingFile, setExistingFile] = useState(null);
  const [savedTypes, setSavedTypes]     = useState([]);
  const [proposal, setProposal]         = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null); // { id, name }
  const [errMsg, setErrMsg]             = useState('');
  const [toast, setToast]               = useState(null);
  const [showReplaceWarning, setShowReplaceWarning] = useState(false);
  const [pendingFile, setPendingFile]   = useState(null);
  const dropRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { loadCurrent(); }, [projectId]);

  async function loadCurrent() {
    setState('loading');
    try {
      const r = await fetch(`/api/projects/${projectId}/unit-matrix`);
      const d = await r.json();
      if (d.unitTypes?.length > 0) {
        setSavedTypes(d.unitTypes);
        setExistingFile(d.sourceFile);
        setState('committed');
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  const handleFiles = useCallback((files) => {
    if (!files?.length) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
      setErrMsg('Image files aren\'t supported yet — please upload a text PDF or Excel file.');
      setState('error');
      return;
    }

    if (existingFile) {
      setPendingFile(file);
      setShowReplaceWarning(true);
    } else {
      uploadAndParse(file);
    }
  }, [existingFile]);

  async function uploadAndParse(file) {
    setState('uploading');
    setErrMsg('');

    // Check the size before sending — a 4 MB+ body is rejected by the host before
    // it ever reaches us, and "Upload failed, please try again" is a lie there:
    // retrying the same file never works.
    const tooBig = oversizeMessage(file);
    if (tooBig) { setErrMsg(tooBig); setState('error'); return; }

    // Upload
    const formData = new FormData();
    formData.append('tab', 'unit-matrix');

    let fileId, fileName;
    try {
      // PDFs and spreadsheets go straight to S3, so a 25 MB matrix never meets
      // Amplify's 4 MB front door.
      await appendUpload(formData, file, { scope: 'project' });
      const r = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: formData });
      if (!r.ok) throw new Error(await uploadErrorMessage(r, file));
      const d = await r.json();
      fileId   = d.file?.id;
      fileName = d.file?.originalName ?? file.name;
    } catch (e) {
      setErrMsg(e.message || 'Upload failed. Please try again.');
      setState('error');
      return;
    }

    setState('parsing');
    setReadingSince(Date.now());
    setUploadedFile({ id: fileId, name: fileName });

    // Parse
    try {
      // Park-and-poll: the read runs in steps behind the front door and the
      // answer arrives with the same body and status it always had.
      const r = await postParked(`/api/projects/${projectId}/unit-matrix/parse`, { fileId });
      const d = await r.json();

      if (!r.ok) {
        if (d.error === 'vision_not_supported') {
          setErrMsg('This file has no extractable text layer. Please use a text-based PDF or Excel file.');
          setState('error');
          return;
        }
        throw new Error(d.error || 'Parse failed');
      }

      setProposal(d);
      setState('reviewing');
    } catch (e) {
      setErrMsg(e.message || 'Extraction failed. Please try again.');
      setState('error');
    }
  }

  async function handleConfirm({ unitTypes, confirmedFields }) {
    setState('saving');
    try {
      const r = await fetch(`/api/projects/${projectId}/unit-matrix/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // runId ties this apply back to the extraction that produced it, so the
        // server can diff what was applied against what the model proposed and
        // record the verdict. See src/lib/agent/unitMatrixDiff.js.
        body: JSON.stringify({ fileId: uploadedFile?.id, unitTypes, confirmedFields, runId: proposal?.review?.runId ?? null }),
      });
      if (!r.ok) throw new Error('Commit failed');
      const d = await r.json();

      setSavedTypes(d.unitTypes);
      setExistingFile({ id: uploadedFile?.id, originalName: uploadedFile?.name, createdAt: new Date().toISOString() });
      setProposal(null);
      setState('committed');
      const count = Object.keys(confirmedFields).length;
      showToast(`${unitTypes.length} unit types saved · ${count} field${count !== 1 ? 's' : ''} written to Project Info`);
      if (d.projectData) onCommitted?.(d.projectData);
    } catch {
      // Return to reviewing so the user can retry without re-uploading
      setState('reviewing');
      showToast('Save failed — please try again');
    }
  }

  // Drag-and-drop
  function onDragOver(e) { e.preventDefault(); dropRef.current?.classList.add('border-amber-400', 'bg-amber-50'); }
  function onDragLeave()  { dropRef.current?.classList.remove('border-amber-400', 'bg-amber-50'); }
  function onDrop(e)      { e.preventDefault(); onDragLeave(); handleFiles(e.dataTransfer.files); }

  // ── Committed state: show saved unit types ───────────────────────────────
  if (state === 'committed') {
    const live = rollup(savedTypes);
    return (
      <div className="mb-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Unit Matrix</h3>
              {existingFile && (
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  {existingFile.originalName} · {new Date(existingFile.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowReplaceWarning(true)}
              className="text-xs text-slate-400 hover:text-amber-600 font-semibold border border-slate-200 hover:border-amber-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              Replace
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-left">
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-right">Unit SF</th>
                  <th className="px-4 py-2.5 text-center">Bed</th>
                  <th className="px-4 py-2.5 text-center">Bath</th>
                  <th className="px-4 py-2.5 text-center">Balc</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {savedTypes.map((row, i) => (
                  <tr key={row.id} className={`border-b border-slate-50 last:border-0 ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                    <td className="px-4 py-2 font-mono font-semibold">{row.code}</td>
                    <td className="px-4 py-2 text-right font-mono">{row.qty}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(row.unitSf)}</td>
                    <td className="px-4 py-2 text-center">{row.bedrooms ?? '—'}</td>
                    <td className="px-4 py-2 text-center">{row.bathrooms ?? '—'}</td>
                    <td className="px-4 py-2 text-center">{row.balconies ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-2.5 bg-amber-50 border-t border-amber-100 flex items-center gap-5 text-sm flex-wrap">
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Rolls up to</span>
            <span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.units)}</span> units</span>
            {live.sf   != null && <><span className="text-slate-300">·</span><span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.sf)}</span> unit SF</span></>}
            {live.bed  != null && <><span className="text-slate-300">·</span><span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.bed)}</span> bed</span></>}
            {live.bath != null && <><span className="text-slate-300">·</span><span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.bath)}</span> bath</span></>}
            {live.balc != null && <><span className="text-slate-300">·</span><span className="text-slate-700"><span className="font-mono font-semibold">{fmt(live.balc)}</span> balconies</span></>}
          </div>
        </div>

        {/* Replace warning dialog */}
        {showReplaceWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <h3 className="text-base font-semibold text-slate-800 mb-2">Replace Unit Matrix?</h3>
              <p className="text-sm text-slate-500 mb-1">
                This will overwrite the current unit types and any Project Info fields set from this matrix.
              </p>
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
                Any budgets or proposals already using the existing unit data will not be updated automatically. Review them after replacing.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowReplaceWarning(false); setPendingFile(null); }}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold"
                >
                  Keep existing
                </button>
                <button
                  onClick={() => {
                    setShowReplaceWarning(false);
                    setExistingFile(null);
                    setSavedTypes([]);
                    setState('idle');
                    if (pendingFile) { uploadAndParse(pendingFile); setPendingFile(null); }
                  }}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm"
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  // ── Idle / error: upload zone ─────────────────────────────────────────────
  return (
    <div className="mb-6">
      <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">Unit Matrix</div>

      {state === 'loading' || state === 'uploading' || state === 'parsing' || state === 'saving' ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 flex flex-col items-center gap-3">
          <svg className="w-6 h-6 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm text-slate-500">
            {state === 'uploading' ? 'Uploading…' : state === 'parsing' ? 'Extracting unit data…' : state === 'saving' ? 'Saving…' : ''}
          </p>
          {state === 'parsing' && <ReadingWait startedAt={readingSince} />}
        </div>
      ) : (
        <div
          ref={dropRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className="rounded-xl border-2 border-dashed border-slate-200 hover:border-amber-300 bg-white hover:bg-amber-50/30 transition-colors cursor-pointer px-6 py-8 flex flex-col items-center gap-3"
          onClick={() => inputRef.current?.click()}
        >
          <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
          </svg>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600">Drop unit matrix here</p>
            <p className="text-xs text-slate-400 mt-0.5">Text PDF or Excel · PNG/JPG not yet supported</p>
            <p className="text-[11px] text-slate-400 mt-1">{READING_TIME_HINT}</p>
          </div>
          <span className="text-xs font-semibold text-amber-600 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-50">Browse file</span>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.xlsx,.xls"
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = null; }}
          />
        </div>
      )}

      {state === 'error' && errMsg && (
        <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
          <span>⚠</span>{errMsg}
          <button onClick={() => { setState('idle'); setErrMsg(''); }} className="ml-2 underline text-slate-400 hover:text-slate-600">Dismiss</button>
        </p>
      )}

      {/* Review modal */}
      {state === 'reviewing' && proposal && (
        <ReviewModal
          proposal={proposal}
          fileName={uploadedFile?.name ?? ''}
          onConfirm={handleConfirm}
          onCancel={() => { setProposal(null); setState('idle'); }}
        />
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div className="fixed bottom-6 right-6 z-[60] bg-slate-800 text-white text-sm rounded-xl shadow-2xl px-4 py-3 flex items-center gap-2 pointer-events-none">
      <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
      {msg}
    </div>
  );
}
