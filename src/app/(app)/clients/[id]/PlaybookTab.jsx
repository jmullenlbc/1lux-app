'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { PROJECT_TYPES, SECTION_COLOR_MAP } from '@/lib/standards-questions';
import { PLAYBOOK_CONTENT } from '@/lib/playbookContent';
import PlaybookContent from '@/components/PlaybookContent';

// ── Sections (v3 — modify + extend; all internal-only data) ───────────────────
const SECTIONS = [
  { id: 'profile',    label: 'Account Profile',          icon: '📇', color: 'blue' },
  { id: 'intro',      label: 'Introductions & Onboarding', icon: '🚪', color: 'indigo' },
  { id: 'comms',      label: 'Communication & Distribution', icon: '📣', color: 'violet' },
  { id: 'approvals',  label: 'Approvals & Sign-off',     icon: '✅', color: 'amber' },
  { id: 'logistics',  label: 'Logistics',                icon: '📦', color: 'orange' },
  { id: 'process',    label: 'Process & Timeframes',     icon: '🔄', color: 'indigo' },
  { id: 'notes',      label: 'Manual Notes',             icon: '📝', color: 'slate' },
];
const SECTION_DESCS = {
  profile:   'Project types, markets, volume, and the standing architect / engineer / GC relationships.',
  intro:     'Who puts ILC in, the vendor-list trigger, and how we learn of new deals.',
  comms:     'Who is on the thread for each deliverable (drives the bot’s CC list).',
  approvals: 'Who signs, who is invoiced, and payment terms.',
  logistics: 'Storage, freight/warehousing, receiving party, and damage/inventory.',
  process:   'Our standard process plus lead times and turnaround expectations.',
  notes:     'Free-form, account-specific operating detail (phasing models, special terms).',
};

// ── Option sets ───────────────────────────────────────────────────────────────
const CO_TOLERANCE = [
  { value: 'TIGHT', label: 'Tight' }, { value: 'NORMAL', label: 'Normal' }, { value: 'FLEXIBLE', label: 'Flexible' },
];
const MGMT = [
  { value: 'CENTRAL', label: 'Centralized' }, { value: 'REGIONAL', label: 'Regional PM' }, { value: 'MIXED', label: 'Mixed' },
];
const GC_MODEL = [
  { value: 'OPEN_BID', label: 'Open bid' }, { value: 'PREFERRED', label: 'Preferred list' },
  { value: 'SINGLE', label: 'Single GC' }, { value: 'DESIGN_BUILD', label: 'Design-build' },
];
const INTRO_STATUS = [
  { value: 'NOT_INTRODUCED', label: 'Not introduced' }, { value: 'INTRODUCED', label: 'Introduced' }, { value: 'WORKING', label: 'Working together' },
];
const PAYMENT_TERMS = [
  { value: 'NET30', label: 'NET 30' }, { value: 'NET45', label: 'NET 45' }, { value: 'NET60', label: 'NET 60' }, { value: 'OTHER', label: 'Other' },
];
const DISTRIBUTION_EVENTS = [
  { value: 'BUDGETS', label: 'Budgets' }, { value: 'DESIGN_MILESTONE', label: 'Design milestones' },
  { value: 'FIXTURE_SCHEDULE', label: 'Fixture schedule' }, { value: 'PHOTOMETRICS', label: 'Photometrics' },
  { value: 'SUBMITTALS', label: 'Submittals' }, { value: 'RFIS', label: 'RFIs' },
  { value: 'CHANGE_ORDERS', label: 'Change orders' }, { value: 'SHIP_SCHEDULE', label: 'Ship schedule' }, { value: 'OTHER', label: 'Other' },
];
// Approval roles, in display order
const ASSIGNMENT_ROLES = [
  { role: 'PROPOSAL_SIGNER_STANDARDS', label: 'Standards proposal signer' },
  { role: 'PROPOSAL_SIGNER_PROJECT',   label: 'Project proposal signer' },
  { role: 'CONTRACT_SIGNER',           label: 'Project contract signer' },
  { role: 'INVOICING_STANDARDS',       label: 'Invoices to (standards)' },
  { role: 'INVOICING_PROJECT',         label: 'Invoices to (project)' },
  { role: 'DESIGN_INTRO',              label: 'Design-team intro handled by' },
  { role: 'GC_INTRO',                  label: 'Pre-con GC intro handled by' },
];

// ── Primitives ────────────────────────────────────────────────────────────────
function FieldLabel({ children, hint }) {
  return (
    <div className="mb-1.5">
      <div className="text-xs font-semibold text-slate-600">{children}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}
function Inp({ value, onChange, placeholder, type = 'text' }) {
  return <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />;
}
function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y" />;
}
function Toggle({ checked, onChange, label, sub }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 border border-slate-200 rounded-lg bg-white">
      <div><div className="text-sm font-medium text-slate-700">{label}</div>{sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}</div>
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
      {options.map(o => { const v = o.value ?? o, l = o.label ?? o; const on = value === v;
        return <button key={v} type="button" onClick={() => onChange(on ? '' : v)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>{l}</button>;
      })}
    </div>
  );
}
function ChipMulti({ options, selected, onChange }) {
  const sel = selected || [];
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {options.map(o => { const v = o.value ?? o, l = o.label ?? o; const on = sel.includes(v);
        return <button key={v} type="button" onClick={() => onChange(on ? sel.filter(s => s !== v) : [...sel, v])}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>{l}</button>;
      })}
    </div>
  );
}
// Single-contact dropdown grouped by department.
function ContactSelect({ contacts, value, onChange, placeholder = 'Select a contact…' }) {
  const byDept = {};
  for (const c of contacts) { const d = c.department || 'Other'; (byDept[d] ||= []).push(c); }
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value || null)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500">
      <option value="">{contacts.length ? placeholder : 'No contacts yet — add them on the People tab'}</option>
      {Object.entries(byDept).map(([dept, list]) => (
        <optgroup key={dept} label={dept}>
          {list.map(c => <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
function Divider() { return <div className="border-t border-slate-100 my-6" />; }
function GroupLabel({ children }) { return <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{children}</div>; }

function parseJSON(v, fb) { if (v == null) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } }

// ── Relationship editor (one of architect / engineer / gc) ────────────────────
function RelationshipEditor({ title, rel, contacts, isGc, onChange }) {
  const set = (k, v) => onChange({ ...rel, [k]: v });
  return (
    <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3">
      <Toggle checked={!!rel.exists} onChange={v => set('exists', v)} label={title} sub="Is there a standing relationship?" />
      {rel.exists && (
        <div className="space-y-3 pl-1">
          <div><FieldLabel>Firm</FieldLabel><Inp value={rel.firm} onChange={v => set('firm', v)} placeholder="Firm name" /></div>
          <div><FieldLabel>Key contact</FieldLabel><ContactSelect contacts={contacts} value={rel.contactId} onChange={v => set('contactId', v)} /></div>
          <div><FieldLabel>Intro status</FieldLabel><ChipRow options={INTRO_STATUS} value={rel.introStatus || ''} onChange={v => set('introStatus', v)} /></div>
          {isGc && <div><FieldLabel>GC model</FieldLabel><ChipRow options={GC_MODEL} value={rel.gcModel || ''} onChange={v => set('gcModel', v)} /></div>}
          <div><FieldLabel>Notes</FieldLabel><Textarea value={rel.notes} onChange={v => set('notes', v)} rows={2} /></div>
        </div>
      )}
    </div>
  );
}

// ── Distribution editor ───────────────────────────────────────────────────────
function DistributionEditor({ rows, contacts, onChange }) {
  const update = (i, patch) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const add    = () => onChange([...rows, { event: 'BUDGETS', contactId: '', freetextName: '', note: '' }]);
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-xs text-slate-400">No distribution rows yet. Add who should be on the thread per deliverable.</p>}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-start rounded-lg border border-slate-200 p-2 bg-white">
          <div className="col-span-3">
            <select value={r.event} onChange={e => update(i, { event: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500">
              {DISTRIBUTION_EVENTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div className="col-span-4">
            <ContactSelect contacts={contacts} value={r.contactId} onChange={v => update(i, { contactId: v })} placeholder="CRM contact…" />
          </div>
          <div className="col-span-2"><Inp value={r.freetextName} onChange={v => update(i, { freetextName: v })} placeholder="or name" /></div>
          <div className="col-span-2"><Inp value={r.note} onChange={v => update(i, { note: v })} placeholder="note" /></div>
          <button type="button" onClick={() => remove(i)} className="col-span-1 text-slate-300 hover:text-red-500 text-sm py-1.5">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs font-medium text-amber-600 hover:text-amber-700">+ Add row</button>
    </div>
  );
}

// ── Manual-notes editor (free-form titled blocks) ─────────────────────────────
function NotesEditor({ notes, onChange }) {
  const update = (i, patch) => onChange(notes.map((n, j) => j === i ? { ...n, ...patch } : n));
  const add    = () => onChange([...notes, { topic: '', body: '' }]);
  const remove = (i) => onChange(notes.filter((_, j) => j !== i));
  return (
    <div className="space-y-3 max-w-2xl">
      {notes.length === 0 && <p className="text-xs text-slate-400">No notes yet. Use these for account-specific detail (phasing model, special terms…).</p>}
      {notes.map((n, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-3 bg-white space-y-2">
          <div className="flex items-center gap-2">
            <input value={n.topic ?? ''} onChange={e => update(i, { topic: e.target.value })} placeholder="Topic (e.g. Phasing model)"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <button type="button" onClick={() => remove(i)} className="text-slate-300 hover:text-red-500 text-sm">✕</button>
          </div>
          <Textarea value={n.body} onChange={v => update(i, { body: v })} rows={4} placeholder="Details… (markdown allowed)" />
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs font-medium text-amber-600 hover:text-amber-700">+ Add note</button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PlaybookTab({ clientId, clientName = '', contacts = [], canEdit = false }) {
  const [activeSection, setActiveSection] = useState('profile');
  const [saveState, setSaveState] = useState('idle');
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef({});

  const [scalars, setScalars] = useState({});
  const [projectTypes, setProjectTypes] = useState([]);
  const [rels, setRels] = useState({ ARCHITECT: { kind: 'ARCHITECT' }, ENGINEER: { kind: 'ENGINEER' }, GC: { kind: 'GC' } });
  const [asg, setAsg] = useState({});           // role -> contactId
  const [distribution, setDistribution] = useState([]);
  const [notes, setNotes] = useState([]);

  // Load
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/playbook`);
        if (res.ok) {
          const d = await res.json();
          const pb = d.playbook || {};
          setScalars(pb);
          setProjectTypes(parseJSON(pb.projectTypes, []));
          const rmap = { ARCHITECT: { kind: 'ARCHITECT' }, ENGINEER: { kind: 'ENGINEER' }, GC: { kind: 'GC' } };
          for (const r of (d.relationships || [])) rmap[r.kind] = r;
          setRels(rmap);
          setAsg(Object.fromEntries((d.assignments || []).map(a => [a.role, a.contactId])));
          setDistribution((d.distribution || []).map(x => ({ event: x.event, contactId: x.contactId || '', freetextName: x.freetextName || '', note: x.note || '' })));
          setNotes((d.notes || []).map(n => ({ topic: n.topic, body: n.body })));
        }
      } catch {}
      finally { setLoaded(true); }
    })();
  }, [clientId]);

  // Debounced save of a body slice
  const save = useCallback((key, body) => {
    if (!canEdit || !loaded) return;
    clearTimeout(debounceRef.current[key]);
    setSaveState('saving');
    debounceRef.current[key] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/playbook`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        setSaveState(res.ok ? 'saved' : 'error');
        if (res.ok) setTimeout(() => setSaveState('idle'), 2500);
      } catch { setSaveState('error'); }
    }, 1000);
  }, [clientId, canEdit, loaded]);

  // Scalar helpers
  const setScalar = (patch, key = 'scalars') => { const next = { ...scalars, ...patch }; setScalars(next); save(key, { scalars: pickScalars(next, projectTypes) }); };
  const setPTypes = (arr) => { setProjectTypes(arr); save('scalars', { scalars: { projectTypes: JSON.stringify(arr) } }); };

  const setRel = (kind, rel) => { const next = { ...rels, [kind]: rel }; setRels(next); save('rels', { relationships: [next.ARCHITECT, next.ENGINEER, next.GC] }); };
  const setRole = (role, contactId) => { const next = { ...asg, [role]: contactId }; setAsg(next); save('asg', { assignments: ASSIGNMENT_ROLES.map(r => ({ role: r.role, contactId: next[r.role] || null })) }); };
  const setDist = (rows) => { setDistribution(rows); save('dist', { distribution: rows }); };
  const setNote = (arr) => { setNotes(arr); save('notes', { notes: arr.map((n, i) => ({ ...n, sortOrder: i })) }); };

  if (!loaded) {
    return <div className="flex items-center justify-center h-48 text-sm text-slate-400">Loading playbook…</div>;
  }

  const sec = SECTIONS.find(s => s.id === activeSection);
  const c = SECTION_COLOR_MAP[sec?.color] || SECTION_COLOR_MAP.slate;
  const dim = !canEdit ? 'pointer-events-none opacity-60' : '';

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Nav */}
      <div className="w-56 shrink-0">
        <nav className="space-y-0.5">
          {SECTIONS.map(s => {
            const col = SECTION_COLOR_MAP[s.color] || SECTION_COLOR_MAP.slate;
            const on = activeSection === s.id;
            return (
              <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-xs font-medium transition-colors ${on ? `${col.bg} ${col.text} border ${col.border}` : 'text-slate-600 hover:bg-slate-100'}`}>
                <span className="text-sm shrink-0">{s.icon}</span><span className="flex-1 leading-snug">{s.label}</span>
              </button>
            );
          })}
        </nav>
        <p className="text-[10px] text-slate-400 mt-4 px-2 leading-relaxed">Internal playbook — not shown on the client share link.</p>
      </div>

      {/* Form */}
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-3 mb-5 px-4 py-3 rounded-xl border ${c.bg} ${c.border}`}>
          <span className="text-xl">{sec?.icon}</span>
          <div><h2 className={`text-sm font-bold ${c.text}`}>{sec?.label}</h2><p className="text-[11px] text-slate-500">{SECTION_DESCS[activeSection]}</p></div>
        </div>

        {PLAYBOOK_CONTENT[activeSection] && <PlaybookContent content={PLAYBOOK_CONTENT[activeSection]} clientName={clientName} />}

        <div className={dim}>
          {/* §1 Account Profile */}
          {activeSection === 'profile' && (
            <div className="space-y-5 max-w-2xl">
              <div><FieldLabel>Project types</FieldLabel><ChipMulti options={PROJECT_TYPES} selected={projectTypes} onChange={setPTypes} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><FieldLabel>Projects / year</FieldLabel><Inp type="number" value={scalars.projectsPerYear} onChange={v => setScalar({ projectsPerYear: v ? Number(v) : null })} /></div>
                <div><FieldLabel>Primary markets</FieldLabel><Inp value={scalars.primaryMarkets} onChange={v => setScalar({ primaryMarkets: v })} placeholder="e.g. CO, AZ, TX" /></div>
              </div>
              <div><FieldLabel>Cost-tier notes</FieldLabel><Textarea value={scalars.costTierNotes} onChange={v => setScalar({ costTierNotes: v })} rows={2} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><FieldLabel>Primary national contact</FieldLabel><ContactSelect contacts={contacts} value={scalars.primaryContactId} onChange={v => setScalar({ primaryContactId: v })} /></div>
                <div><FieldLabel>Approver</FieldLabel><ContactSelect contacts={contacts} value={scalars.approverContactId} onChange={v => setScalar({ approverContactId: v })} /></div>
              </div>
              <Divider />
              <GroupLabel>Standing relationships</GroupLabel>
              <div className="space-y-3">
                <RelationshipEditor title="Architect" rel={rels.ARCHITECT} contacts={contacts} onChange={r => setRel('ARCHITECT', r)} />
                <RelationshipEditor title="Engineer (EE)" rel={rels.ENGINEER} contacts={contacts} onChange={r => setRel('ENGINEER', r)} />
                <RelationshipEditor title="General Contractor" rel={rels.GC} contacts={contacts} isGc onChange={r => setRel('GC', r)} />
              </div>
            </div>
          )}

          {/* §2 Introductions & Onboarding */}
          {activeSection === 'intro' && (
            <div className="space-y-5 max-w-2xl">
              <div><FieldLabel hint="Who introduces ILC into a project">Intro owner</FieldLabel><ContactSelect contacts={contacts} value={scalars.introOwnerContactId} onChange={v => setScalar({ introOwnerContactId: v })} /></div>
              <div><FieldLabel hint="If not a CRM contact, describe who">Intro owner note</FieldLabel><Inp value={scalars.introOwnerNote} onChange={v => setScalar({ introOwnerNote: v })} placeholder="e.g. the construction PMs ('SJs')" /></div>
              <Toggle checked={!!scalars.onVendorList} onChange={v => setScalar({ onVendorList: v })} label="On the precon vendor list" sub="Added at project birth?" />
              <div><FieldLabel>Vendor-list note</FieldLabel><Inp value={scalars.vendorListNote} onChange={v => setScalar({ vendorListNote: v })} placeholder="e.g. listed as lighting designer/supplier" /></div>
              <div><FieldLabel hint="How ILC learns of new deals">Pipeline feed</FieldLabel><Inp value={scalars.pipelineFeed} onChange={v => setScalar({ pipelineFeed: v })} placeholder="e.g. monthly DealPath report (Emily)" /></div>
              <div><FieldLabel>Notes</FieldLabel><Textarea value={scalars.introNotes} onChange={v => setScalar({ introNotes: v })} rows={3} /></div>
            </div>
          )}

          {/* §3 Communication & Distribution */}
          {activeSection === 'comms' && (
            <div className="space-y-5 max-w-3xl">
              <div><FieldLabel hint="General posture for who to include">Communication posture</FieldLabel><Inp value={scalars.commsPosture} onChange={v => setScalar({ commsPosture: v })} placeholder="e.g. CC more, not less" /></div>
              <Divider />
              <GroupLabel>Distribution — who's on the thread per deliverable</GroupLabel>
              <DistributionEditor rows={distribution} contacts={contacts} onChange={setDist} />
            </div>
          )}

          {/* §4 Approvals & Sign-off */}
          {activeSection === 'approvals' && (
            <div className="space-y-5 max-w-2xl">
              <div><FieldLabel>Payment terms</FieldLabel><ChipRow options={PAYMENT_TERMS} value={scalars.paymentTerms || ''} onChange={v => setScalar({ paymentTerms: v })} /></div>
              <Divider />
              <GroupLabel>Who signs / who's invoiced</GroupLabel>
              <div className="space-y-4">
                {ASSIGNMENT_ROLES.map(r => (
                  <div key={r.role}><FieldLabel>{r.label}</FieldLabel><ContactSelect contacts={contacts} value={asg[r.role]} onChange={v => setRole(r.role, v)} /></div>
                ))}
              </div>
            </div>
          )}

          {/* §5 Logistics */}
          {activeSection === 'logistics' && (
            <div className="space-y-5 max-w-2xl">
              <div><FieldLabel>Storage duration</FieldLabel><Inp value={scalars.storageDuration} onChange={v => setScalar({ storageDuration: v })} placeholder="e.g. ~180 days" /></div>
              <div><FieldLabel hint="Who receives/stores on site">Receiving party</FieldLabel><ContactSelect contacts={contacts} value={scalars.receivingPartyContactId} onChange={v => setScalar({ receivingPartyContactId: v })} /></div>
              <div><FieldLabel>Receiving party note</FieldLabel><Inp value={scalars.receivingPartyNote} onChange={v => setScalar({ receivingPartyNote: v })} placeholder="e.g. EC, paid a negotiated fee by the GC" /></div>
              <div><FieldLabel>Freight & warehousing</FieldLabel><Textarea value={scalars.freightWarehousing} onChange={v => setScalar({ freightWarehousing: v })} rows={2} /></div>
              <div><FieldLabel>Damage & inventory</FieldLabel><Textarea value={scalars.damageInventory} onChange={v => setScalar({ damageInventory: v })} rows={2} /></div>
              <div><FieldLabel>Notes</FieldLabel><Textarea value={scalars.logisticsNotes} onChange={v => setScalar({ logisticsNotes: v })} rows={2} /></div>
            </div>
          )}

          {/* §6 Process & Timeframes */}
          {activeSection === 'process' && (
            <div className="space-y-5 max-w-2xl">
              <div className="grid grid-cols-2 gap-4">
                <div><FieldLabel>CO tolerance</FieldLabel><ChipRow options={CO_TOLERANCE} value={scalars.coTolerance || ''} onChange={v => setScalar({ coTolerance: v })} /></div>
                <div><FieldLabel>Mgmt structure</FieldLabel><ChipRow options={MGMT} value={scalars.mgmtStructure || ''} onChange={v => setScalar({ mgmtStructure: v })} /></div>
              </div>
              <Toggle checked={!!scalars.hasDesignTeam} onChange={v => setScalar({ hasDesignTeam: v })} label="Has in-house design team" />
              <div><FieldLabel>Process notes</FieldLabel><Textarea value={scalars.processNotes} onChange={v => setScalar({ processNotes: v })} rows={3} /></div>
              <Divider />
              <GroupLabel>Timeframes</GroupLabel>
              <div className="grid grid-cols-2 gap-4">
                <div><FieldLabel>Engagement lead time</FieldLabel><Inp value={scalars.engagementLeadTime} onChange={v => setScalar({ engagementLeadTime: v })} /></div>
                <div><FieldLabel>Budget cadence</FieldLabel><Inp value={scalars.budgetCadence} onChange={v => setScalar({ budgetCadence: v })} /></div>
                <div><FieldLabel>Submittal turnaround</FieldLabel><Inp value={scalars.submittalTurnaround} onChange={v => setScalar({ submittalTurnaround: v })} /></div>
                <div><FieldLabel>RFI response expectation</FieldLabel><Inp value={scalars.rfiResponseExpectation} onChange={v => setScalar({ rfiResponseExpectation: v })} /></div>
              </div>
              <div><FieldLabel>Timeframe notes</FieldLabel><Textarea value={scalars.timeframeNotes} onChange={v => setScalar({ timeframeNotes: v })} rows={2} /></div>
            </div>
          )}

          {/* §7 Manual Notes */}
          {activeSection === 'notes' && <NotesEditor notes={notes} onChange={setNote} />}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {saveState === 'saving' && <span>Saving…</span>}
            {saveState === 'saved' && <span className="text-green-600">✓ Saved</span>}
            {saveState === 'error' && <span className="text-red-500">Save failed — check connection</span>}
            {saveState === 'idle' && !canEdit && <span className="text-slate-300">🔒 View only</span>}
          </div>
          {activeSection !== SECTIONS[SECTIONS.length - 1].id && (
            <button type="button" onClick={() => { const i = SECTIONS.findIndex(s => s.id === activeSection); if (i < SECTIONS.length - 1) setActiveSection(SECTIONS[i + 1].id); }}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Next section →</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Build the scalar payload (projectTypes serialized) for a partial save.
function pickScalars(scalars, projectTypes) {
  const FIELDS = [
    'projectsPerYear', 'primaryMarkets', 'costTierNotes', 'primaryContactId', 'approverContactId',
    'introOwnerContactId', 'introOwnerNote', 'onVendorList', 'vendorListNote', 'pipelineFeed', 'introNotes',
    'commsPosture', 'engagementTiming', 'submittalPlatform', 'coTolerance', 'mgmtStructure', 'hasDesignTeam',
    'processNotes', 'engagementLeadTime', 'budgetCadence', 'submittalTurnaround', 'typicalSdToCd',
    'rfiResponseExpectation', 'timeframeNotes', 'paymentTerms', 'storageDuration', 'receivingPartyContactId',
    'receivingPartyNote', 'freightWarehousing', 'damageInventory', 'logisticsNotes',
  ];
  const out = {};
  for (const f of FIELDS) if (f in scalars) out[f] = scalars[f] ?? null;
  out.projectTypes = JSON.stringify(projectTypes || []);
  return out;
}
