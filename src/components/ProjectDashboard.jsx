'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { buildingTypeLabel, PROJECT_TYPES, projectTypeLabel } from '@/lib/utils';
import { PIPELINE_STAGES, STAGE_LABEL, STATUS_LABEL, PIPELINE_STATUS, inDesignPipeline, stagesOutOfSync } from '@/lib/pipeline';
import MissingInputsWarning from './MissingInputsWarning';

const PROC_STAGE_OPTIONS   = PIPELINE_STAGES.PROCUREMENT.map(s => ({ value: s.key, label: s.label }));
const DESIGN_STAGE_OPTIONS = PIPELINE_STAGES.DESIGN.map(s => ({ value: s.key, label: s.label }));
const STATUS_OPTIONS       = PIPELINE_STATUS.map(s => ({ value: s.key, label: s.label }));

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(val) {
  if (val == null || val === '' || isNaN(Number(val))) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(val));
}
function fmtSf(val) {
  if (val == null || val === '' || isNaN(Number(val)) || Number(val) === 0) return null;
  return Number(val).toLocaleString();
}
function fmtNum(val) {
  if (val == null || val === '' || isNaN(Number(val)) || Number(val) === 0) return null;
  return Number(val).toLocaleString();
}
function fmtPct(val) {
  if (val == null || val === '' || isNaN(Number(val)) || Number(val) === 0) return null;
  return `${(Number(val) * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}
function fmtDate(str) {
  if (!str) return null;
  try {
    return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return str; }
}
const SERVICE_TYPE_LABELS = {
  fullDesign: 'Full Design', designAssist: 'Design Assist',
  peerReview: 'Peer Review', bidOnly: 'Bid Only', conceptual: 'Conceptual',
};
function serviceTypeLabel(val) {
  if (!val) return null;
  return SERVICE_TYPE_LABELS[val] || val;
}

// ── Widget (summary card — unchanged) ────────────────────────────────────────
function Widget({ label, value, sub, accent, empty, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm flex flex-col gap-1 min-w-0">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      {value != null ? (
        <>
          <p className={`text-2xl font-bold tracking-tight ${accent || 'text-slate-800'}`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </>
      ) : (
        <p className="text-sm text-slate-300 italic mt-1">{empty || 'Not set'}</p>
      )}
      {children}
    </div>
  );
}

// ── Thin divider with section label ──────────────────────────────────────────
function Rule({ label }) {
  return (
    <div className="col-span-full flex items-center gap-3 pt-1">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
      <div className="flex-1 border-t border-slate-100" />
    </div>
  );
}

// ── Editable stat cell ────────────────────────────────────────────────────────
// displayValue: formatted string to show when not editing
// rawValue: the raw number/string stored in DB (for the input)
// onSave(rawValue) → called on blur with the new raw string
function EditableStat({ label, displayValue, rawValue, onSave, wide, mono, type = 'text', select, options }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef(null);

  function startEdit() {
    setDraft(rawValue != null ? String(rawValue) : '');
    setEditing(true);
    // focus on next tick after render
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const changed = trimmed !== (rawValue != null ? String(rawValue) : '');
    if (!changed) return;
    setSaving(true);
    await onSave(trimmed === '' ? null : trimmed);
    setSaving(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setEditing(false); }
  }

  const hasValue = displayValue != null && displayValue !== '';

  return (
    <div
      className={`min-w-0 group relative ${wide ? 'col-span-2' : ''}`}
      onClick={!editing ? startEdit : undefined}
    >
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none mb-1 truncate">{label}</p>

      {editing ? (
        select ? (
          <select
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            className="w-full text-sm font-semibold text-slate-800 bg-white border border-amber-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
          >
            {options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className={`w-full text-sm font-semibold text-slate-800 bg-white border border-amber-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400 ${mono ? 'font-mono' : ''}`}
          />
        )
      ) : (
        <div className="flex items-center gap-1 cursor-text">
          <p className={`text-sm font-semibold leading-snug truncate flex-1 ${mono ? 'font-mono' : ''} ${hasValue ? 'text-slate-800' : 'text-slate-300'}`}>
            {saving ? <span className="text-amber-400">Saving…</span> : (displayValue || '—')}
          </p>
          {/* Edit pencil — visible on hover */}
          <svg className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ── Read-only stat cell (synced display — e.g. Sales Details from CRM) ─────────
function ReadStat({ label, value, wide, accent }) {
  const hasValue = value != null && value !== '';
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none mb-1 truncate">{label}</p>
      <p className={`text-sm font-semibold leading-snug ${wide ? '' : 'truncate'} ${hasValue ? (accent || 'text-slate-800') : 'text-slate-300'}`}>
        {hasValue ? value : '—'}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProjectDashboard({
  project: initialProject,
  budget,
  contractValue,
  files,
  onProjectUpdate,    // (updatedProject) => void — called after project-level saves
  onProjectDataUpdate,// (updatedProjectData) => void — called after data saves
  designInfo = {},
  saveDesignInfo,     // (key, value) => void — saves to design-info responses
}) {
  const [project,     setProject]     = useState(initialProject);
  const [projectData, setProjectData] = useState(initialProject.projectData ?? {});

  const pd = projectData;

  // ── Sales / Pipeline fields live on the project itself (Deal merged in) ──────
  const isDesignPipeline = inDesignPipeline(project.serviceType);
  const combinedRevenue  = (project.contractValue || 0) + (project.designContractValue || 0);
  // Average Probability — mean of the two entered values (falls back to whichever is present).
  const _probParts = [project.probabilityToWin, project.probabilityToMoveForward].filter(v => v != null && v !== '');
  const avgProbability = _probParts.length ? Math.round(_probParts.reduce((a, b) => a + Number(b), 0) / _probParts.length) : null;
  const outOfSync        = stagesOutOfSync(project);

  // Sales Owner dropdown — Sales-division users only.
  const [salesUsers, setSalesUsers] = useState([]);
  useEffect(() => {
    let alive = true;
    fetch('/api/users?division=SALES')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setSalesUsers(d.users || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const salesOwnerOptions = [{ value: '', label: '— Unassigned —' }, ...salesUsers.map(u => ({ value: u.id, label: u.name || u.email }))];
  const salesOwnerName    = salesUsers.find(u => u.id === project.salesOwnerId)?.name;

  // ── Budget numbers ────────────────────────────────────────────────────────
  const clientInitialBudget = pd.clientInitialBudget ?? null;

  const budgetFiles = files
    .filter(f => f.tab === 'budgets' && f.parsedAmount != null)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const latestBudgetFile   = budgetFiles[0] ?? null;
  const wizardTotal        = budget?.totalWithControls ?? null;
  const currentBudget      = latestBudgetFile?.parsedAmount ?? null;
  const currentBudgetSub   = latestBudgetFile
    ? `From ${latestBudgetFile.originalName.replace(/\.[^.]+$/, '')} · ${fmtDate(latestBudgetFile.createdAt)}`
    : wizardTotal != null ? 'From budget tool estimate' : null;
  const currentBudgetVal   = currentBudget ?? wizardTotal;

  // ── Change order total ────────────────────────────────────────────────────
  const coFiles = files.filter(f => {
    if (f.tab !== 'ca' || f.parsedAmount == null) return false;
    try { const tags = JSON.parse(f.tags || '[]'); return tags.includes('Change Order'); }
    catch { return false; }
  });
  const coTotal = coFiles.length > 0 ? coFiles.reduce((sum, f) => sum + (f.parsedAmount || 0), 0) : null;

  // ── Save helpers ──────────────────────────────────────────────────────────

  // Save a ProjectData field (numeric)
  const saveData = useCallback(async (field, rawValue) => {
    const payload = { [field]: rawValue === '' || rawValue == null ? null : rawValue };
    const res = await fetch(`/api/projects/${project.id}/data`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const { projectData: updated } = await res.json();
      setProjectData(updated);
      onProjectDataUpdate?.(updated);
    }
  }, [project.id, onProjectDataUpdate]);

  // Save a top-level Project field
  const saveProject = useCallback(async (field, value) => {
    const payload = { [field]: value === '' ? null : value };
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const { project: updated } = await res.json();
      setProject(updated);
      onProjectUpdate?.(updated);
    }
  }, [project.id, onProjectUpdate]);

  // Convenience: data field saver factory
  const d = (field) => (val) => saveData(field, val);
  // Convenience: project field saver factory
  const p = (field) => (val) => saveProject(field, val);

  // ── Building type options ─────────────────────────────────────────────────
  const BUILDING_TYPES = [
    { value: '', label: '— Select —' },
    { value: 'highRise', label: 'High Rise (10+ floors)' },
    { value: 'midRise', label: 'Mid Rise (5–9 floors)' },
    { value: 'lowRise', label: 'Low Rise (2–4 floors)' },
    { value: 'garden', label: 'Garden Style' },
    { value: 'singleFamily', label: 'Single Family' },
    { value: 'townhome', label: 'Townhome' },
    { value: 'hotel', label: 'Hotel / Hospitality' },
    { value: 'office', label: 'Office' },
    { value: 'retail', label: 'Retail' },
    { value: 'mixedUse', label: 'Mixed Use' },
    { value: 'other', label: 'Other' },
  ];

  const projectIdLabel = project.projectNumber
    ? `PRJ-${String(project.projectNumber).padStart(4, '0')}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Project Overview</h2>
          <p className="text-sm text-slate-400 mt-0.5">Key numbers at a glance · click any field below to edit</p>
        </div>
        {projectIdLabel && (
          <span className="ml-auto text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500">
            {projectIdLabel}
          </span>
        )}
      </div>

      {/* ── Missing-inputs warning (compact) ──────────────────────────────── */}
      {/* Auto-hides when nothing's blank — see src/lib/projectInputChecks.js */}
      <MissingInputsWarning projectData={pd} projectId={project.id} mode="compact" />

      {/* ── Budget row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <Widget
          label="Initial Budget"
          value={fmt(clientInitialBudget)}
          sub="Client's original budget target"
          empty="No initial budget set"
        />
        <Widget
          label="Current Budget"
          value={fmt(currentBudgetVal)}
          sub={currentBudgetSub}
          accent={
            currentBudgetVal != null && clientInitialBudget != null
              ? currentBudgetVal > clientInitialBudget ? 'text-red-600' : 'text-green-600'
              : 'text-slate-800'
          }
          empty="No budget on file"
        >
          {currentBudgetVal != null && clientInitialBudget != null && (
            <p className="text-xs mt-1">
              {currentBudgetVal > clientInitialBudget ? (
                <span className="text-red-500">↑ {fmt(currentBudgetVal - clientInitialBudget)} over initial</span>
              ) : currentBudgetVal < clientInitialBudget ? (
                <span className="text-green-600">↓ {fmt(clientInitialBudget - currentBudgetVal)} under initial</span>
              ) : (
                <span className="text-slate-400">On budget</span>
              )}
            </p>
          )}
        </Widget>
      </div>

      {/* ── Contract row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <Widget
          label="Supply Contract Total"
          value={fmt(contractValue ?? project.contractValue)}
          sub={project.contractSignedDate ? `Signed ${fmtDate(project.contractSignedDate)}` : 'No signed date on file'}
          empty="No supply contract on file"
        />
        <Widget
          label="Change Order Total"
          value={coTotal != null ? fmt(coTotal) : null}
          sub={coFiles.length > 0 ? `${coFiles.length} change order${coFiles.length !== 1 ? 's' : ''}` : null}
          accent="text-orange-600"
          empty="No change orders on file"
        />
      </div>

      {/* ── Project Details — editable ────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Project Details</p>
          <span className="text-[10px] text-slate-300 italic">Click any field to edit</span>
        </div>

        <div className="grid grid-cols-4 gap-x-6 gap-y-4">

          {/* ── Project Info ── */}
          <Rule label="Project Info" />
          <EditableStat
            label="Building Type"
            displayValue={buildingTypeLabel(project.buildingType)}
            rawValue={project.buildingType || ''}
            onSave={p('buildingType')}
            select
            options={BUILDING_TYPES}
          />
          <EditableStat
            label="Address"
            displayValue={project.address}
            rawValue={project.address || ''}
            onSave={p('address')}
            wide
          />
          <EditableStat
            label="Revit Year"
            displayValue={designInfo.revitYear ? String(designInfo.revitYear) : null}
            rawValue={designInfo.revitYear || ''}
            onSave={val => saveDesignInfo?.('revitYear', val)}
          />

          {/* ── Square Footage ── */}
          <Rule label="Square Footage" />
          <EditableStat label="Total Gross SF"        displayValue={fmtSf(pd.grossSf)}              rawValue={pd.grossSf}              onSave={d('grossSf')} />
          <EditableStat label="Units Gross SF"        displayValue={fmtSf(pd.unitsSf)}              rawValue={pd.unitsSf}              onSave={d('unitsSf')} />
          <EditableStat label="Garage SF"             displayValue={fmtSf(pd.garageSf)}             rawValue={pd.garageSf}             onSave={d('garageSf')} />
          <EditableStat label="Corridor SF"           displayValue={fmtSf(pd.corridorSf)}           rawValue={pd.corridorSf}           onSave={d('corridorSf')} />
          <EditableStat label="Interior Amenity SF"   displayValue={fmtSf(pd.interiorAmenitySf)}    rawValue={pd.interiorAmenitySf}    onSave={d('interiorAmenitySf')} />
          <EditableStat label="Exterior Amenity SF"   displayValue={fmtSf(pd.exteriorAmenitySf)}    rawValue={pd.exteriorAmenitySf}    onSave={d('exteriorAmenitySf')} />
          <EditableStat label="BOH SF"                displayValue={fmtSf(pd.bohSf)}                rawValue={pd.bohSf}                onSave={d('bohSf')} />
          <EditableStat label="Lot SF"                displayValue={fmtSf(pd.lotSf)}                rawValue={pd.lotSf}                onSave={d('lotSf')} />
          <EditableStat label="Building Footprint SF" displayValue={fmtSf(pd.buildingFootprintSf)}  rawValue={pd.buildingFootprintSf}  onSave={d('buildingFootprintSf')} />

          {/* ── Counts ── */}
          <Rule label="Counts" />
          <EditableStat label="# Units / Rooms"     displayValue={fmtNum(pd.numUnits)}            rawValue={pd.numUnits}            onSave={d('numUnits')} />
          <EditableStat label="# Buildings"         displayValue={fmtNum(pd.numBuildings)}        rawValue={pd.numBuildings}        onSave={d('numBuildings')} />
          <EditableStat label="# Bedrooms"          displayValue={fmtNum(pd.numBedrooms)}         rawValue={pd.numBedrooms}         onSave={d('numBedrooms')} />
          <EditableStat label="# Bathrooms"         displayValue={fmtNum(pd.numBathrooms)}        rawValue={pd.numBathrooms}        onSave={d('numBathrooms')} />
          <EditableStat label="# Vanities"          displayValue={fmtNum(pd.numVanities)}         rawValue={pd.numVanities}         onSave={d('numVanities')} />
          <EditableStat label="# Balconies"         displayValue={fmtNum(pd.numBalconies)}        rawValue={pd.numBalconies}        onSave={d('numBalconies')} />
          <EditableStat label="# Egress Stairwell Landings" displayValue={fmtNum(pd.numEgressStairwells)} rawValue={pd.numEgressStairwells} onSave={d('numEgressStairwells')} />
          <EditableStat label="# Ceiling Fans"      displayValue={fmtNum(pd.numFans)}             rawValue={pd.numFans}             onSave={d('numFans')} />
          <EditableStat label="# Surface Parking"   displayValue={fmtNum(pd.numSurfaceParking)}   rawValue={pd.numSurfaceParking}   onSave={d('numSurfaceParking')} />
          <EditableStat label="# Carports"          displayValue={fmtNum(pd.numCarports)}         rawValue={pd.numCarports}         onSave={d('numCarports')} />
          <EditableStat label="# Exterior Doors"    displayValue={fmtNum(pd.numExteriorDoors)}    rawValue={pd.numExteriorDoors}    onSave={d('numExteriorDoors')} />
          {/* Drawing-takeoff counts (Phase 1, 2026-08-12) — filled by the
              drawing parser later; editable here, deliberately not wizard
              questions. */}
          <EditableStat label="# Elevator Shafts"   displayValue={fmtNum(pd.numElevatorShafts)}   rawValue={pd.numElevatorShafts}   onSave={d('numElevatorShafts')} />
          <EditableStat label="# Floors"            displayValue={fmtNum(pd.numFloors)}           rawValue={pd.numFloors}           onSave={d('numFloors')} />

          {/* ── Budget / Rates ── */}
          <Rule label="Budget &amp; Rates" />
          <EditableStat label="Margin %"     displayValue={fmtPct(pd.marginPct)}      rawValue={pd.marginPct != null ? (pd.marginPct * 100).toFixed(2) : ''}     onSave={val => d('marginPct')(val != null && val !== '' ? parseFloat(val) / 100 : null)} />
          <EditableStat label="Initial Client Budget" displayValue={fmt(pd.clientInitialBudget)} rawValue={pd.clientInitialBudget} onSave={d('clientInitialBudget')} />
          <EditableStat label="Freight %"    displayValue={fmtPct(pd.freightPct)}     rawValue={pd.freightPct != null ? (pd.freightPct * 100).toFixed(2) : ''} onSave={val => d('freightPct')(val != null && val !== '' ? parseFloat(val) / 100 : null)} />
          <EditableStat label="Warehousing %" displayValue={fmtPct(pd.warehousingPct)} rawValue={pd.warehousingPct != null ? (pd.warehousingPct * 100).toFixed(2) : ''} onSave={val => d('warehousingPct')(val != null && val !== '' ? parseFloat(val) / 100 : null)} />
          <EditableStat label="Sales Tax %"  displayValue={fmtPct(pd.salesTaxPct)}    rawValue={pd.salesTaxPct != null ? (pd.salesTaxPct * 100).toFixed(2) : ''} onSave={val => d('salesTaxPct')(val != null && val !== '' ? parseFloat(val) / 100 : null)} />

        </div>
      </div>

      {/* ── Sales Details — editable, lives on the project (Deal merged in) ───── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sales Details</p>
            {outOfSync && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full" title="Procurement and Design stages differ">
                ⚠ stages differ
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-300 italic">Click any field to edit</span>
        </div>

        <div className="grid grid-cols-4 gap-x-6 gap-y-4">
          {/* ── Stage & type (top) ── */}
          <Rule label="Pipeline" />
          <EditableStat label="Procurement Stage" displayValue={STAGE_LABEL[project.procurementStage] || 'Qualified'} rawValue={project.procurementStage || 'QUALIFIED'} onSave={p('procurementStage')} select options={PROC_STAGE_OPTIONS} />
          {isDesignPipeline && (
            <EditableStat label="Design Stage" displayValue={STAGE_LABEL[project.designStage] || 'Design Qualified'} rawValue={project.designStage || 'DESIGN_QUALIFIED'} onSave={p('designStage')} select options={DESIGN_STAGE_OPTIONS} />
          )}
          <EditableStat label="Project Type" displayValue={project.projectType ? projectTypeLabel(project.projectType) : null} rawValue={project.projectType || ''} onSave={p('projectType')} select options={[{ value: '', label: '— Select —' }, ...PROJECT_TYPES]} />
          <EditableStat label="Procurement Status" displayValue={STATUS_LABEL[project.procurementStatus] || 'Open'} rawValue={project.procurementStatus || 'OPEN'} onSave={p('procurementStatus')} select options={STATUS_OPTIONS} />
          {isDesignPipeline && (
            <EditableStat label="Design Status" displayValue={STATUS_LABEL[project.designStatus] || 'Open'} rawValue={project.designStatus || 'OPEN'} onSave={p('designStatus')} select options={STATUS_OPTIONS} />
          )}
          <EditableStat label="Sales Owner" displayValue={salesOwnerName} rawValue={project.salesOwnerId || ''} onSave={p('salesOwnerId')} select options={salesOwnerOptions} />

          {/* ── Revenue ── */}
          <Rule label="Revenue" />
          <EditableStat label="Product Sale Total ($)" displayValue={fmt(project.contractValue)}       rawValue={project.contractValue ?? ''}       onSave={p('contractValue')} />
          <EditableStat label="Design Fee Total ($)"   displayValue={fmt(project.designContractValue)} rawValue={project.designContractValue ?? ''} onSave={p('designContractValue')} />
          <ReadStat     label="Total Combined ($)"     value={fmt(combinedRevenue)} accent="text-blue-600" />
          <EditableStat label="Probability to Win (%)"          displayValue={project.probabilityToWin != null ? `${project.probabilityToWin}%` : null}                 rawValue={project.probabilityToWin ?? ''}          onSave={p('probabilityToWin')} type="number" />
          <EditableStat label="Probability to Move Forward (%)" displayValue={project.probabilityToMoveForward != null ? `${project.probabilityToMoveForward}%` : null} rawValue={project.probabilityToMoveForward ?? ''} onSave={p('probabilityToMoveForward')} type="number" />
          <ReadStat     label="Average Probability (%)"          value={avgProbability != null ? `${avgProbability}%` : null} accent="text-blue-600" />
          <EditableStat label="Expected Order Date"
            displayValue={project.expectedOrderDate ? new Date(project.expectedOrderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null}
            rawValue={project.expectedOrderDate ? new Date(project.expectedOrderDate).toISOString().slice(0, 10) : ''}
            onSave={p('expectedOrderDate')} type="date" />
        </div>
      </div>
    </div>
  );
}
