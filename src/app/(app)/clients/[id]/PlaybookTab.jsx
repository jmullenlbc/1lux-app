'use client';
import { useState, useEffect, useRef, useCallback, useId } from 'react';

// ── Constants ──────────────────────────────────────────────────────────────────

const PROJECT_TYPES = [
  'BTR / Townhome', 'Garden walk-up', 'Podium / Wrap',
  'Mid-rise', 'High-rise', 'Affordable Tax Credit (LIHTC)', 'Mixed-use',
];

const DEFAULT_DELIVERABLES = [
  { name: 'Site photometrics',                  approver: 'all',    form: 'Written email',    gcRoutes: true,  notes: '' },
  { name: 'Fixture submittals (typical)',        approver: 'ee',     form: 'Stamped submittal', gcRoutes: true,  notes: '' },
  { name: 'Controls submittals (amenity)',       approver: 'client', form: 'Written email',    gcRoutes: true,  notes: '' },
  { name: 'Emergency / life safety fixtures',   approver: 'ee',     form: 'Stamped submittal', gcRoutes: false, notes: '' },
  { name: 'Budget',                             approver: 'client', form: 'Written email',    gcRoutes: false, notes: '' },
  { name: 'Unit design modifications',          approver: 'client', form: 'Written email',    gcRoutes: false, notes: '' },
  { name: 'Energy compliance report',           approver: 'ee',     form: 'Stamped submittal', gcRoutes: false, notes: '' },
];

const APPROVER_OPTIONS = [
  { value: 'client',  label: 'Client' },
  { value: 'ee',      label: 'EE' },
  { value: 'gc',      label: 'GC' },
  { value: 'all',     label: 'Client + EE' },
];

const FORM_OPTIONS = ['Written email', 'Stamped submittal', 'Verbal OK', 'Client portal', 'Not required'];

const SECTIONS = [
  { id: 'scope',      label: '1 · Scope & Relationships', totalFields: 9  },
  { id: 'approval',   label: '2 · Approval Matrix',       totalFields: 7  },
  { id: 'process',    label: '3 · General Process',        totalFields: 5  },
  { id: 'timeframes', label: '4 · Timeframes',            totalFields: 6  },
];

const SECTION_DESCS = {
  scope:      'Who are the key stakeholders, what do they build, and who needs to be in the room.',
  approval:   'What requires a formal sign-off, from whom, and in what form.',
  process:    'How this client actually operates day-to-day — their procurement flow, tools, and working style.',
  timeframes: 'Pace expectations — how far in advance they engage and how fast they expect responses.',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJSON(v, fallback) {
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

function countFilled(obj) {
  if (!obj) return 0;
  return Object.values(obj).filter(v => {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'boolean') return true;
    return v !== '' && v !== null && v !== undefined;
  }).length;
}

function approverBadgeClass(approver) {
  return {
    client: 'bg-amber-100 text-amber-700',
    ee:     'bg-blue-100 text-blue-700',
    gc:     'bg-slate-100 text-slate-600',
    all:    'bg-green-100 text-green-700',
  }[approver] || 'bg-slate-100 text-slate-600';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldLabel({ children, hint }) {
  return (
    <div className="mb-1">
      <div className="text-xs font-semibold text-slate-600">{children}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function Inp({ value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 ${className}`} />
  );
}

function Sel({ value, onChange, options, placeholder = '— Select —' }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white">
      <option value="">{placeholder}</option>
      {options.map(o => {
        const val = typeof o === 'string' ? o : o.value;
        const lbl = typeof o === 'string' ? o : o.label;
        return <option key={val} value={val}>{lbl}</option>;
      })}
    </select>
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
  );
}

function Toggle({ checked, onChange, label, sub }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 border border-slate-200 rounded-lg">
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-amber-500' : 'bg-slate-200'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function ChipSelect({ options, selected, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {options.map(o => {
        const active = selected.includes(o);
        return (
          <button key={o} type="button"
            onClick={() => onChange(active ? selected.filter(s => s !== o) : [...selected, o])}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              active ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

function ContactPicker({ value, onChange, contacts, placeholder }) {
  const selected = contacts.find(c => c.id === value);
  return (
    <div className="relative">
      {selected ? (
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-white">
          <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">
            {selected.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-800 truncate">{selected.name}</div>
            {selected.title && <div className="text-[11px] text-slate-400 truncate">{selected.title}</div>}
          </div>
          <button type="button" onClick={() => onChange('')} className="text-xs text-amber-600 hover:text-amber-700 shrink-0 ml-1">Change</button>
        </div>
      ) : (
        <select value="" onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white">
          <option value="">{placeholder || '— Select contact —'}</option>
          {contacts.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.title ? ` (${c.title})` : ''}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-slate-100 my-6" />;
}

function GroupLabel({ children }) {
  return <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{children}</div>;
}

// ── Scope section ─────────────────────────────────────────────────────────────

function ScopeSection({ data, onChange, contacts }) {
  function set(k, v) { onChange({ ...data, [k]: v }); }

  return (
    <div className="space-y-6">
      <div>
        <GroupLabel>Portfolio profile</GroupLabel>
        <div className="space-y-4">
          <div>
            <FieldLabel hint="Select all that apply">Project types they build</FieldLabel>
            <ChipSelect options={PROJECT_TYPES} selected={data.projectTypes || []} onChange={v => set('projectTypes', v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Approx. projects per year</FieldLabel>
              <Inp value={data.projectsPerYear} onChange={v => set('projectsPerYear', v)} placeholder="e.g. 12" type="number" />
            </div>
            <div>
              <FieldLabel>Primary markets / states</FieldLabel>
              <Inp value={data.primaryMarkets} onChange={v => set('primaryMarkets', v)} placeholder="e.g. CA, AZ, TX, CO" />
            </div>
          </div>
          <div>
            <FieldLabel hint="How they think about cost vs. spec across their portfolio">Cost tier priority by project type</FieldLabel>
            <Textarea value={data.costTierNotes} onChange={v => set('costTierNotes', v)} placeholder="e.g. BTR = cost-first. Podium = balanced. LIHTC = cost-critical." />
          </div>
        </div>
      </div>

      <SectionDivider />

      <div>
        <GroupLabel>Key relationships</GroupLabel>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Day-to-day PM / Contact</FieldLabel>
            <ContactPicker value={data.primaryContactId} onChange={v => set('primaryContactId', v)} contacts={contacts} placeholder="— Select PM —" />
          </div>
          <div>
            <FieldLabel>Final budget approver</FieldLabel>
            <ContactPicker value={data.finalApproverId} onChange={v => set('finalApproverId', v)} contacts={contacts} placeholder="— Select approver —" />
          </div>
        </div>
      </div>

      <SectionDivider />

      <div>
        <GroupLabel>Design team relationships</GroupLabel>
        <div className="space-y-3">
          <Toggle
            checked={!!data.hasArchitect}
            onChange={v => set('hasArchitect', v)}
            label="Standing architect relationship"
            sub="Do they use the same architect across most projects?"
          />
          {data.hasArchitect && (
            <div className="pl-4 border-l-2 border-amber-200 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Firm name</FieldLabel>
                  <Inp value={data.architectFirm} onChange={v => set('architectFirm', v)} placeholder="Firm name" />
                </div>
                <div>
                  <FieldLabel>Primary contact</FieldLabel>
                  <Inp value={data.architectContact} onChange={v => set('architectContact', v)} placeholder="Name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>ILC intro needed?</FieldLabel>
                  <Sel value={data.architectIntro} onChange={v => set('architectIntro', v)}
                    options={['Client will introduce us', 'Already have a relationship', 'We need to request intro']} />
                </div>
                <div>
                  <FieldLabel>Notes</FieldLabel>
                  <Inp value={data.architectNotes} onChange={v => set('architectNotes', v)} placeholder="Working style notes…" />
                </div>
              </div>
            </div>
          )}

          <Toggle
            checked={!!data.hasEE}
            onChange={v => set('hasEE', v)}
            label="Standing electrical engineer (EOR)"
            sub="Do they have a preferred or recurring EE?"
          />
          {data.hasEE && (
            <div className="pl-4 border-l-2 border-blue-200 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Firm name</FieldLabel>
                  <Inp value={data.eeFirm} onChange={v => set('eeFirm', v)} placeholder="Firm name" />
                </div>
                <div>
                  <FieldLabel>Primary contact</FieldLabel>
                  <Inp value={data.eeContact} onChange={v => set('eeContact', v)} placeholder="Name" />
                </div>
              </div>
            </div>
          )}

          <Toggle
            checked={!!data.hasGC}
            onChange={v => set('hasGC', v)}
            label="Standing GC relationship"
            sub="Do they have preferred GCs or is it open bid per project?"
          />
          {data.hasGC && (
            <div className="pl-4 border-l-2 border-slate-200 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>GC engagement model</FieldLabel>
                  <Sel value={data.gcModel} onChange={v => set('gcModel', v)}
                    options={['Open bid — different GC per project', 'Preferred GC list — 2-3 firms', 'Single GC relationship', 'Design-build (GC from day one)']} />
                </div>
                <div>
                  <FieldLabel>Notes on GC routing</FieldLabel>
                  <Inp value={data.gcRoutingNotes} onChange={v => set('gcRoutingNotes', v)} placeholder="e.g. All submittals route through GC once awarded" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <SectionDivider />

      <div>
        <GroupLabel>Internal notes</GroupLabel>
        <div className="space-y-4">
          <div>
            <FieldLabel hint="Who holds the budget and who can approve changes">Budget authority</FieldLabel>
            <Inp value={data.budgetAuthority} onChange={v => set('budgetAuthority', v)} placeholder="e.g. VP Construction has final say on any CO over $10k" />
          </div>
          <div>
            <FieldLabel hint="Things that have tripped up projects in the past">Gotchas / watch-outs</FieldLabel>
            <Textarea value={data.watchOuts} onChange={v => set('watchOuts', v)} placeholder="e.g. They hate scope creep surprises. Always confirm before adding." />
          </div>
          <div>
            <FieldLabel>Communication preferences</FieldLabel>
            <Inp value={data.communicationPrefs} onChange={v => set('communicationPrefs', v)} placeholder="e.g. Prefer email over phone. Respond same day." />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Approval Matrix section ───────────────────────────────────────────────────

function ApprovalSection({ data, onChange }) {
  function updateRow(i, key, val) {
    const next = data.map((r, idx) => idx === i ? { ...r, [key]: val } : r);
    onChange(next);
  }

  function addRow() {
    onChange([...data, { id: Date.now().toString(), name: '', approver: 'client', form: 'Written email', gcRoutes: false, notes: '' }]);
  }

  function removeRow(i) {
    onChange(data.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 mb-4 text-xs text-amber-700 leading-relaxed">
        <strong>Team note:</strong> If a GC is awarded, all deliverables marked "Routes via GC" must go to the GC first — not directly to the client or EE. Confirm GC status at project kickoff.
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[22%]">Deliverable</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[14%]">Approver</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[18%]">Form required</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[10%]">Via GC</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.id || i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2">
                  <input value={row.name} onChange={e => updateRow(i, 'name', e.target.value)}
                    placeholder="Deliverable name"
                    className="w-full text-sm font-medium text-slate-800 bg-transparent border-none outline-none placeholder:text-slate-300 focus:bg-white focus:ring-1 focus:ring-amber-400 rounded px-1 -mx-1" />
                </td>
                <td className="px-3 py-2">
                  <select value={row.approver} onChange={e => updateRow(i, 'approver', e.target.value)}
                    className="text-xs border border-slate-200 rounded-full px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
                    {APPROVER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select value={row.form} onChange={e => updateRow(i, 'form', e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 w-full">
                    {FORM_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  <button type="button" onClick={() => updateRow(i, 'gcRoutes', !row.gcRoutes)}
                    className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${row.gcRoutes ? 'bg-amber-500' : 'bg-slate-200'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${row.gcRoutes ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-3 py-2">
                  <input value={row.notes} onChange={e => updateRow(i, 'notes', e.target.value)}
                    placeholder="Add a note…"
                    className="w-full text-xs text-slate-500 bg-transparent border-none outline-none placeholder:text-slate-300 focus:bg-white focus:ring-1 focus:ring-amber-400 rounded px-1 -mx-1" />
                </td>
                <td className="px-1 py-2">
                  <button type="button" onClick={() => removeRow(i)}
                    className="text-slate-300 hover:text-red-400 transition-colors p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow}
        className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add deliverable
      </button>
    </div>
  );
}

// ── Process section ───────────────────────────────────────────────────────────

function ProcessSection({ data, onChange }) {
  function set(k, v) { onChange({ ...data, [k]: v }); }

  return (
    <div className="space-y-6">
      <div>
        <GroupLabel>Procurement & engagement</GroupLabel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>When do they typically engage ILC?</FieldLabel>
              <Sel value={data.engagementTiming} onChange={v => set('engagementTiming', v)}
                options={['Schematic Design (SD)', 'Design Development (DD)', 'Construction Documents (CD)', 'Bid phase', 'Varies by project']} />
            </div>
            <div>
              <FieldLabel>Submittal platform</FieldLabel>
              <Sel value={data.submittalPlatform} onChange={v => set('submittalPlatform', v)}
                options={['Email only', 'Procore', 'BuildingConnected', 'Bluebeam Studio', 'Other']} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Change order tolerance</FieldLabel>
              <Sel value={data.changeOrderTolerance} onChange={v => set('changeOrderTolerance', v)}
                options={['Tight — minimize COs, prefer scope clarity upfront', 'Normal — standard process', 'Flexible — will entertain COs as needed']} />
            </div>
            <div>
              <FieldLabel>Management structure</FieldLabel>
              <Sel value={data.managementStructure} onChange={v => set('managementStructure', v)}
                options={['Centralized — all decisions from HQ', 'Regional — regional PM has authority', 'Mixed — regional for design, HQ for budget']} />
            </div>
          </div>
        </div>
      </div>

      <SectionDivider />

      <div>
        <GroupLabel>Internal team</GroupLabel>
        <div className="space-y-4">
          <Toggle
            checked={!!data.hasInternalDesignTeam}
            onChange={v => set('hasInternalDesignTeam', v)}
            label="Internal design standards team"
            sub="Do they have in-house people who manage design decisions?"
          />
          <div>
            <FieldLabel hint="Anything that would help the ILC team work smoothly with this client">Additional process notes</FieldLabel>
            <Textarea value={data.processNotes} onChange={v => set('processNotes', v)}
              placeholder="e.g. They want a single point of contact at ILC for all communication…" rows={4} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Timeframes section ────────────────────────────────────────────────────────

function TimeframesSection({ data, onChange }) {
  function set(k, v) { onChange({ ...data, [k]: v }); }

  return (
    <div className="space-y-6">
      <div>
        <GroupLabel>Engagement & pace</GroupLabel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel hint="How far in advance do they bring ILC in?">Typical lead time before groundbreak</FieldLabel>
              <Sel value={data.leadTime} onChange={v => set('leadTime', v)}
                options={['6+ months out', '3–6 months out', '1–3 months out', 'At or after groundbreak', 'Varies significantly']} />
            </div>
            <div>
              <FieldLabel hint="When do they expect budget revisions?">Budget update cadence</FieldLabel>
              <Sel value={data.budgetCadence} onChange={v => set('budgetCadence', v)}
                options={['Each design phase (SD / DD / CD)', 'CD only', 'As-requested', 'Fixed intervals (quarterly)']} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Submittal turnaround expectation</FieldLabel>
              <Sel value={data.submittalTurnaround} onChange={v => set('submittalTurnaround', v)}
                options={['3 business days', '5 business days', '2 weeks', 'No stated standard']} />
            </div>
            <div>
              <FieldLabel>Typical SD → CD timeline</FieldLabel>
              <Inp value={data.sdToCdTimeline} onChange={v => set('sdToCdTimeline', v)}
                placeholder="e.g. 4–6 months BTR, 8–10 months podium" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Expected ILC response time on RFIs</FieldLabel>
              <Sel value={data.rfiResponseTime} onChange={v => set('rfiResponseTime', v)}
                options={['Same day', '24 hours', '48 hours', 'Not specified']} />
            </div>
            <div>
              <FieldLabel>Timeframe notes</FieldLabel>
              <Inp value={data.timeframeNotes} onChange={v => set('timeframeNotes', v)}
                placeholder="Anything unusual about their pace or schedule…" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main PlaybookTab ──────────────────────────────────────────────────────────

export default function PlaybookTab({ clientId, contacts = [], canEdit = false }) {
  const [activeSection, setActiveSection] = useState('scope');
  const [saveState, setSaveState]         = useState('idle'); // idle | saving | saved | error
  const debounceRef = useRef(null);

  // Section data states
  const [scope,      setScope]      = useState({ projectTypes: [], projectsPerYear: '', primaryMarkets: '', costTierNotes: '', primaryContactId: '', finalApproverId: '', hasArchitect: false, architectFirm: '', architectContact: '', architectIntro: '', architectNotes: '', hasEE: false, eeFirm: '', eeContact: '', hasGC: false, gcModel: '', gcRoutingNotes: '', budgetAuthority: '', watchOuts: '', communicationPrefs: '' });
  const [approval,   setApproval]   = useState(DEFAULT_DELIVERABLES.map((d, i) => ({ ...d, id: String(i) })));
  const [process,    setProcess]    = useState({ engagementTiming: '', submittalPlatform: '', changeOrderTolerance: '', managementStructure: '', hasInternalDesignTeam: false, processNotes: '' });
  const [timeframes, setTimeframes] = useState({ leadTime: '', budgetCadence: '', submittalTurnaround: '', sdToCdTimeline: '', rfiResponseTime: '', timeframeNotes: '' });

  const [loaded, setLoaded] = useState(false);

  // Load existing playbook on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/clients/${clientId}/playbook`);
        if (!res.ok) return;
        const pb = await res.json();
        if (!pb) return;
        const s = parseJSON(pb.scope, null);
        const a = parseJSON(pb.approval, null);
        const p = parseJSON(pb.process, null);
        const t = parseJSON(pb.timeframes, null);
        if (s) setScope(s);
        if (a && a.length > 0) setApproval(a);
        if (p) setProcess(p);
        if (t) setTimeframes(t);
      } catch { /* silent */ }
      finally { setLoaded(true); }
    }
    load();
  }, [clientId]);

  // Auto-save with debounce
  const scheduleSave = useCallback((section, data) => {
    if (!canEdit || !loaded) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveState('saving');
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/playbook`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section, data }),
        });
        setSaveState(res.ok ? 'saved' : 'error');
        if (res.ok) setTimeout(() => setSaveState('idle'), 2500);
      } catch {
        setSaveState('error');
      }
    }, 1200);
  }, [clientId, canEdit, loaded]);

  function handleScope(v)      { setScope(v);      scheduleSave('scope', v); }
  function handleApproval(v)   { setApproval(v);   scheduleSave('approval', v); }
  function handleProcess(v)    { setProcess(v);     scheduleSave('process', v); }
  function handleTimeframes(v) { setTimeframes(v); scheduleSave('timeframes', v); }

  // Completion counts
  const filledScope      = countFilled({ ...scope,      _pt: (scope.projectTypes || []).length });
  const filledApproval   = approval.filter(r => r.name.trim()).length;
  const filledProcess    = countFilled(process);
  const filledTimeframes = countFilled(timeframes);

  const completionMap = {
    scope:      { filled: filledScope,      total: SECTIONS[0].totalFields },
    approval:   { filled: filledApproval,   total: approval.length || SECTIONS[1].totalFields },
    process:    { filled: filledProcess,     total: SECTIONS[2].totalFields },
    timeframes: { filled: filledTimeframes, total: SECTIONS[3].totalFields },
  };

  const totalFilled = filledScope + filledApproval + filledProcess + filledTimeframes;
  const totalFields = Object.values(completionMap).reduce((s, c) => s + c.total, 0);
  const pct = totalFields > 0 ? Math.round((totalFilled / totalFields) * 100) : 0;

  function badgeClasses(id) {
    const { filled, total } = completionMap[id];
    if (filled === 0) return 'bg-slate-100 text-slate-400';
    if (filled >= total) return 'bg-green-100 text-green-700';
    return 'bg-amber-100 text-amber-700';
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
        Loading playbook…
      </div>
    );
  }

  return (
    <div className="flex gap-0 min-h-[600px]">
      {/* Left section nav */}
      <div className="w-56 shrink-0 border-r border-slate-100 pr-4 py-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Playbook sections</div>
        <nav className="space-y-0.5">
          {SECTIONS.map(s => {
            const { filled, total } = completionMap[s.id];
            const isActive = activeSection === s.id;
            return (
              <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  isActive ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                <span className="truncate">{s.label}</span>
                <span className={`ml-2 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeClasses(s.id)}`}>
                  {filled}/{total}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Completion bar */}
        <div className="mt-6 px-3 pt-4 border-t border-slate-100">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Completion</div>
          <div className="text-2xl font-bold text-slate-800">{pct}%</div>
          <div className="text-[11px] text-slate-400 mt-0.5 mb-2">{totalFilled} of {totalFields} fields filled</div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Form area */}
      <div className="flex-1 pl-8 py-2 overflow-y-auto">
        {/* Section header */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-900">
            {SECTIONS.find(s => s.id === activeSection)?.label.replace(/^\d+ · /, '')}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">{SECTION_DESCS[activeSection]}</p>
        </div>

        {/* Section content */}
        <div className={!canEdit ? 'pointer-events-none opacity-60' : ''}>
          {activeSection === 'scope'      && <ScopeSection      data={scope}      onChange={handleScope}      contacts={contacts} />}
          {activeSection === 'approval'   && <ApprovalSection   data={approval}   onChange={handleApproval} />}
          {activeSection === 'process'    && <ProcessSection    data={process}    onChange={handleProcess} />}
          {activeSection === 'timeframes' && <TimeframesSection data={timeframes} onChange={handleTimeframes} />}
        </div>

        {/* Navigation + save status */}
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {saveState === 'saving' && <span className="flex items-center gap-1.5"><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>Saving…</span>}
            {saveState === 'saved'  && <span className="text-green-600">✓ Saved</span>}
            {saveState === 'error'  && <span className="text-red-500">Save failed — check connection</span>}
            {saveState === 'idle'   && !canEdit && <span className="text-slate-300">🔒 View only</span>}
          </div>
          <div className="flex gap-2">
            {activeSection !== 'timeframes' && (
              <button type="button"
                onClick={() => {
                  const idx = SECTIONS.findIndex(s => s.id === activeSection);
                  if (idx < SECTIONS.length - 1) setActiveSection(SECTIONS[idx + 1].id);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                Next section →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
