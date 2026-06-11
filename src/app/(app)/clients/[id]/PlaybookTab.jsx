'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { PROJECT_TYPES } from '@/lib/standards-questions';

// ── Section config ─────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'scope',   label: '1 · Scope & Relationships', totalFields: 4 },
  { id: 'process', label: '2 · General Process',       totalFields: 3 },
];

const SECTION_DESCS = {
  scope:   'Who the client is, what they build, and their primary contact.',
  process: 'How this client operates day-to-day — procurement flow, tools, and working style.',
};

// ── Option sets ────────────────────────────────────────────────────────────────

const CO_TOLERANCE_OPTIONS = [
  { value: 'TIGHT',    label: 'Tight — minimize COs' },
  { value: 'NORMAL',   label: 'Normal process' },
  { value: 'FLEXIBLE', label: 'Flexible as needed' },
];

const MGMT_OPTIONS = [
  { value: 'CENTRAL',   label: 'Centralized — all from HQ' },
  { value: 'REGIONAL',  label: 'Regional PM has authority' },
  { value: 'MIXED',     label: 'Mixed — regional design, HQ budget' },
];

const GC_MODEL_OPTIONS = [
  { value: 'OPEN_BID',    label: 'Open bid — different GC per project' },
  { value: 'PREFERRED',   label: 'Preferred GC list (2–3 firms)' },
  { value: 'SINGLE',      label: 'Single GC relationship' },
  { value: 'DESIGN_BUILD', label: 'Design-build (GC from day one)' },
];

// ── Default states ─────────────────────────────────────────────────────────────

const DEFAULT_SCOPE = {
  projectTypes:              [],
  projectsPerYear:           '',
  primaryMarkets:            '',
  primaryNationalContactId:  '',
};

const DEFAULT_PROCESS = {
  coTolerance:   '',
  mgmtStructure: '',
  hasDesignTeam: false,
  processNotes:  '',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseJSON(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function countFilled(obj, fields) {
  return fields.filter(f => {
    const v = obj?.[f];
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'boolean') return v;
    return v !== '' && v !== null && v !== undefined;
  }).length;
}

// ── Shared form primitives ─────────────────────────────────────────────────────

function FieldLabel({ children, hint }) {
  return (
    <div className="mb-1.5">
      <div className="text-xs font-semibold text-slate-600">{children}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}

function Inp({ value, onChange, placeholder, type = 'text', disabled = false }) {
  return (
    <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400" />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea value={value || ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
  );
}

function Toggle({ checked, onChange, label, sub }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 border border-slate-200 rounded-lg bg-white">
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-amber-500' : 'bg-slate-200'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function ChipRow({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        const active = value === v;
        return (
          <button key={v} type="button" onClick={() => onChange(active ? '' : v)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              active
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

function ChipMulti({ options, selected, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        const active = selected.includes(v);
        return (
          <button key={v} type="button"
            onClick={() => onChange(active ? selected.filter(s => s !== v) : [...selected, v])}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              active
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

function ContactPicker({ value, onChange, contacts, placeholder }) {
  const selected = contacts.find(c => c.id === value);
  return selected ? (
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
  );
}

function GroupLabel({ children }) {
  return <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{children}</div>;
}

function Divider() {
  return <div className="border-t border-slate-100 my-6" />;
}

// ── File drop zone ─────────────────────────────────────────────────────────────

function FileDropZone() {
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const ACCEPTED = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];

  function addFiles(incoming) {
    const valid = Array.from(incoming).filter(f => ACCEPTED.includes(f.type));
    setFiles(prev => [...prev, ...valid]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <div className="mt-3">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors ${
          dragging ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50'
        }`}
      >
        <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls" multiple className="hidden"
          onChange={e => addFiles(e.target.files)} />
        <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.324 5.25 5.25 0 01.095 10.1" />
        </svg>
        <p className="text-sm text-slate-500">Drop PDF or Excel files here</p>
        <p className="text-xs text-slate-400 mt-0.5">or click to browse</p>
      </div>
      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-600">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="flex-1 truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-red-500 shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section 1: Scope & Relationships ─────────────────────────────────────────

function ScopeSection({ data, onChange, contacts }) {
  function set(k, v) { onChange({ ...data, [k]: v }); }

  return (
    <div className="space-y-6">
      <div>
        <GroupLabel>Portfolio profile</GroupLabel>
        <div className="space-y-4">
          <div>
            <FieldLabel hint="Select all project types this client builds">Project types built</FieldLabel>
            <ChipMulti options={PROJECT_TYPES} selected={data.projectTypes || []} onChange={v => set('projectTypes', v)} />
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
        </div>
      </div>

      <Divider />

      <div>
        <GroupLabel>Key contact</GroupLabel>
        <div>
          <FieldLabel hint="Primary national contact at this company">Primary national contact</FieldLabel>
          <ContactPicker
            value={data.primaryNationalContactId}
            onChange={v => set('primaryNationalContactId', v)}
            contacts={contacts}
            placeholder="— Select contact —"
          />
        </div>
      </div>
    </div>
  );
}

// ── Section 2: General Process ────────────────────────────────────────────────

function ProcessSection({ data, onChange }) {
  function set(k, v) { onChange({ ...data, [k]: v }); }

  return (
    <div className="space-y-6">
      <div>
        <GroupLabel>Procurement & engagement</GroupLabel>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Change order tolerance</FieldLabel>
            <ChipRow options={CO_TOLERANCE_OPTIONS} value={data.coTolerance || ''} onChange={v => set('coTolerance', v)} />
          </div>
          <div>
            <FieldLabel>Management structure</FieldLabel>
            <ChipRow options={MGMT_OPTIONS} value={data.mgmtStructure || ''} onChange={v => set('mgmtStructure', v)} />
          </div>
        </div>
      </div>

      <Divider />

      <div>
        <GroupLabel>Internal team</GroupLabel>
        <div className="space-y-4">
          <Toggle
            checked={!!data.hasDesignTeam}
            onChange={v => set('hasDesignTeam', v)}
            label="Internal design standards team"
            sub="Do they have in-house people who manage design decisions?"
          />
          {data.hasDesignTeam && <FileDropZone />}
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

// ── Main PlaybookTab ──────────────────────────────────────────────────────────

export default function PlaybookTab({ clientId, contacts = [], canEdit = false }) {
  const [activeSection, setActiveSection] = useState('scope');
  const [saveState,     setSaveState]     = useState('idle');
  const debounceRef = useRef({});
  const [loaded, setLoaded] = useState(false);

  const [scope,   setScope]   = useState(DEFAULT_SCOPE);
  const [process, setProcess] = useState(DEFAULT_PROCESS);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/clients/${clientId}/playbook`);
        if (!res.ok) return;
        const pb = await res.json();
        if (!pb) return;

        setScope({
          projectTypes:             parseJSON(pb.projectTypes, []),
          projectsPerYear:          pb.projectsPerYear ?? '',
          primaryMarkets:           pb.primaryMarkets ?? '',
          primaryNationalContactId: pb.primaryContactId ?? '',
        });

        setProcess({
          coTolerance:   pb.coTolerance   ?? '',
          mgmtStructure: pb.mgmtStructure ?? '',
          hasDesignTeam: pb.hasDesignTeam ?? false,
          processNotes:  pb.processNotes  ?? '',
        });
      } catch { /* silent */ }
      finally { setLoaded(true); }
    }
    load();
  }, [clientId]);

  // ── Debounced save per section ────────────────────────────────────────────
  const scheduleSave = useCallback((sectionId, data) => {
    if (!canEdit || !loaded) return;
    if (debounceRef.current[sectionId]) clearTimeout(debounceRef.current[sectionId]);
    setSaveState('saving');
    debounceRef.current[sectionId] = setTimeout(async () => {
      let body = {};

      if (sectionId === 'scope') {
        body = {
          projectTypes:     JSON.stringify(data.projectTypes || []),
          projectsPerYear:  parseInt(data.projectsPerYear) || null,
          primaryMarkets:   data.primaryMarkets || null,
          primaryContactId: data.primaryNationalContactId || null,
        };
      } else if (sectionId === 'process') {
        body = {
          coTolerance:   data.coTolerance   || null,
          mgmtStructure: data.mgmtStructure || null,
          hasDesignTeam: !!data.hasDesignTeam,
          processNotes:  data.processNotes  || null,
        };
      }

      try {
        const res = await fetch(`/api/clients/${clientId}/playbook`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setSaveState(res.ok ? 'saved' : 'error');
        if (res.ok) setTimeout(() => setSaveState('idle'), 2500);
      } catch {
        setSaveState('error');
      }
    }, 1200);
  }, [clientId, canEdit, loaded]);

  function handleScope(v)   { setScope(v);   scheduleSave('scope', v); }
  function handleProcess(v) { setProcess(v); scheduleSave('process', v); }

  // ── Completion ────────────────────────────────────────────────────────────
  const filledScope   = countFilled(scope,   ['projectTypes', 'projectsPerYear', 'primaryMarkets', 'primaryNationalContactId']);
  const filledProcess = countFilled(process, ['coTolerance', 'mgmtStructure', 'hasDesignTeam']);

  const completionMap = {
    scope:   { filled: filledScope,   total: SECTIONS[0].totalFields },
    process: { filled: filledProcess, total: SECTIONS[1].totalFields },
  };

  const totalFilled = filledScope + filledProcess;
  const totalFields = SECTIONS.reduce((s, c) => s + c.totalFields, 0);
  const pct         = totalFields > 0 ? Math.round((totalFilled / totalFields) * 100) : 0;

  function badgeClasses(id) {
    const { filled, total } = completionMap[id];
    if (filled === 0) return 'bg-slate-100 text-slate-400';
    if (filled >= total) return 'bg-green-100 text-green-700';
    return 'bg-amber-100 text-amber-700';
  }

  // ── Loading state ─────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
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
          {activeSection === 'scope'   && <ScopeSection   data={scope}   onChange={handleScope}   contacts={contacts} />}
          {activeSection === 'process' && <ProcessSection data={process} onChange={handleProcess} />}
        </div>

        {/* Footer: save status + navigation */}
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {saveState === 'saving' && (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
                Saving…
              </span>
            )}
            {saveState === 'saved' && <span className="text-green-600">✓ Saved</span>}
            {saveState === 'error' && <span className="text-red-500">Save failed — check connection</span>}
            {saveState === 'idle'  && !canEdit && <span className="text-slate-300">🔒 View only</span>}
          </div>
          <div className="flex gap-2">
            {activeSection !== SECTIONS[SECTIONS.length - 1].id && (
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
