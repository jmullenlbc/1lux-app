'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import AutomationNav from '@/components/salesAutomation/AutomationNav';
import DisabledSection from '@/components/salesAutomation/DisabledSection';
import ConfirmArchiveModal from '@/components/salesAutomation/ConfirmArchiveModal';

// ── CreatableSelect ───────────────────────────────────────────────────────────
// A combo-box that lets admins pick an existing option OR type a new one.
// Press Enter or click "Add" to use a value not in the list.

function CreatableSelect({ value, onChange, options, placeholder = 'Select or type…', label }) {
  const [open,   setOpen]   = useState(false);
  const [input,  setInput]  = useState('');
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(input.toLowerCase())
  );
  const isNew = input.trim() && !options.some(o => o.toLowerCase() === input.trim().toLowerCase());

  function select(val) {
    onChange(val);
    setInput('');
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && input.trim()) { e.preventDefault(); select(input.trim()); }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white flex items-center gap-2 cursor-pointer focus-within:ring-2 focus-within:ring-orange-400 focus-within:border-orange-400"
        onClick={() => setOpen(true)}
      >
        {!open && value ? (
          <span className="flex-1 truncate">{value}</span>
        ) : (
          <input
            autoFocus={open}
            value={open ? input : ''}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={open ? `Type to filter or add new…` : value || placeholder}
            className="flex-1 outline-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400"
          />
        )}
        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 && !isNew && (
            <p className="px-3 py-2 text-xs text-slate-400">No options found</p>
          )}
          {filtered.map(opt => (
            <button key={opt} type="button"
              onClick={() => select(opt)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 hover:text-orange-700 transition-colors ${opt === value ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-slate-700'}`}
            >
              {opt}
            </button>
          ))}
          {isNew && (
            <button type="button"
              onClick={() => select(input.trim())}
              className="w-full text-left px-3 py-2 text-sm text-orange-600 font-semibold hover:bg-orange-50 border-t border-slate-100 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add "{input.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_MAP = {
  EMAIL: 'Email',
  LINKEDIN: 'LinkedIn',
  MEETING_AGENDA: 'Meeting Agenda',
};

const SCENARIO_OPTIONS = [
  { value: 'new_intro',              label: 'New Intro' },
  { value: 'proposal_sent',          label: 'Proposal Sent' },
  { value: 'follow_up',              label: 'Follow-Up' },
  { value: 'peer_review_sent',       label: 'Peer Review Sent' },
  { value: 'golf_invite',            label: 'Golf Invite' },
  { value: 'linkedin_connect',       label: 'LinkedIn Connect' },
  { value: 'linkedin_move_to_email', label: 'LinkedIn → Email' },
  { value: 'meeting_recap',          label: 'Meeting Recap' },
  { value: 'kick_off_agenda',        label: 'Kick-Off Agenda' },
  { value: 'custom',                 label: 'Custom' },
];

const CLIENT_TYPE_OPTIONS     = ['Any', 'Developer', 'Architect', 'GC', 'EC'];
const SERVICE_LABELS = { fullDesign: 'Full Design', designAssist: 'Design Assist', peerReview: 'Peer Review', bidOnly: 'Bid Only', conceptual: 'Conceptual Budget' };
// Flat lists for CreatableSelect defaults
const DEFAULT_CHANNELS        = ['EMAIL', 'LINKEDIN', 'MEETING_AGENDA'];
const DEFAULT_SCENARIOS_LIST  = SCENARIO_OPTIONS.map(o => o.value);
const DEFAULT_CLIENT_TYPES_LIST = CLIENT_TYPE_OPTIONS;

const EMPTY_FORM = {
  name: '',
  channel: 'EMAIL',
  scenario: 'follow_up',
  dealStage: '',
  clientType: 'Any',
  serviceType: '',
  pipeline: '',
  contactRole: '',
  topicWords: '',
  subject: '',
  body: '',
  direction: '',
  isDefault: false,
  isActive: true,
};

const TAB_CHANNELS = {
  email:    'EMAIL',
  linkedin: 'LINKEDIN',
  agenda:   'MEETING_AGENDA',
};

// ── Drawer ────────────────────────────────────────────────────────────────────

function TemplateDrawer({ open, onClose, template, onSaved, onArchive, onRestore }) {
  const [form,    setForm]   = useState(EMPTY_FORM);
  const [saving,  setSaving] = useState(false);
  const [err,     setErr]    = useState('');
  const [options, setOptions]= useState({
    channels:    DEFAULT_CHANNELS,
    scenarios:   DEFAULT_SCENARIOS_LIST,
    clientTypes: DEFAULT_CLIENT_TYPES_LIST,
  });

  // Load custom options once on first open
  useEffect(() => {
    fetch('/api/automation/templates/options')
      .then(r => r.json())
      .then(d => {
        if (d.channels)    setOptions(prev => ({ ...prev, channels:    d.channels }));
        if (d.scenarios)   setOptions(prev => ({ ...prev, scenarios:   d.scenarios }));
        if (d.clientTypes) setOptions(prev => ({ ...prev, clientTypes: d.clientTypes }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setForm(template
        ? { ...EMPTY_FORM, ...template }
        : EMPTY_FORM);
      setErr('');
    }
  }, [open, template]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    setSaving(true);
    setErr('');
    try {
      const url    = template ? `/api/automation/templates/${template.id}` : '/api/automation/templates';
      const method = template ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const saved = await res.json();
      onSaved(saved.template || saved, !!template);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <div className={`fixed top-0 right-0 bottom-0 w-[480px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">
            {template ? 'Edit Template' : 'New Template'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="e.g. Proposal Follow-Up – Developer"
            />
          </div>

          {/* Channel */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Channel
              <span className="ml-1.5 text-[10px] font-normal text-slate-400">type to add new</span>
            </label>
            <CreatableSelect
              value={form.channel}
              onChange={v => set('channel', v)}
              options={options.channels}
              placeholder="Select or type a channel…"
            />
          </div>

          {/* Scenario */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Scenario
              <span className="ml-1.5 text-[10px] font-normal text-slate-400">type to add new</span>
            </label>
            <CreatableSelect
              value={form.scenario}
              onChange={v => set('scenario', v)}
              options={options.scenarios}
              placeholder="Select or type a scenario…"
            />
          </div>

          {/* Deal Stage */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Project Stage <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={form.dealStage}
              onChange={e => set('dealStage', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="e.g. QUALIFIED"
            />
          </div>

          {/* Client Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Client Type
              <span className="ml-1.5 text-[10px] font-normal text-slate-400">type to add new</span>
            </label>
            <CreatableSelect
              value={form.clientType}
              onChange={v => set('clientType', v)}
              options={options.clientTypes}
              placeholder="Select or type a client type…"
            />
          </div>

          {/* More rules (Mike 10-1): blank means any. The email writers only use this template when the email fits. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Service Type</label>
              <select value={form.serviceType || ''} onChange={e => set('serviceType', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                <option value="">Any</option>
                <option value="fullDesign">Full Design</option>
                <option value="designAssist">Design Assist</option>
                <option value="peerReview">Peer Review</option>
                <option value="bidOnly">Bid Only</option>
                <option value="conceptual">Conceptual Budget</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pipeline</label>
              <select value={form.pipeline || ''} onChange={e => set('pipeline', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                <option value="">Both</option>
                <option value="DESIGN">Design</option>
                <option value="PROCUREMENT">Procurement</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Role</label>
            <input type="text" value={form.contactRole || ''} onChange={e => set('contactRole', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="e.g. owner, project manager (words from their job title)" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Topic Words</label>
            <input type="text" value={form.topicWords || ''} onChange={e => set('topicWords', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="e.g. peer review budget fixture schedule" />
            <p className="text-[10px] text-slate-400 mt-1">Words that make the email writers reach for this template when an email is about the same thing.</p>
          </div>

          {/* Subject — only for EMAIL */}
          {form.channel === 'EMAIL' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={e => set('subject', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Following up on {projectName}"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Body</label>
            <textarea
              rows={8}
              value={form.body}
              onChange={e => set('body', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono resize-none"
              placeholder={`Hi {contactFirstName},\n\nI wanted to follow up on {projectName}...\n\nBest,\n{senderName}`}
            />
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Use <code className="bg-slate-100 px-1 rounded">{'{variable}'}</code> placeholders. Available:{' '}
              <span className="font-mono">{'{clientName}'}, {'{contactFirstName}'}, {'{projectName}'}, {'{dealStage}'}, {'{proposedTimes}'}, {'{lastActivitySummary}'}, {'{daysSinceContact}'}, {'{senderName}'}</span>
            </p>
          </div>

          {/* AI Direction */}
          <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-3">
            <label className="block text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI Direction <span className="font-normal text-amber-600">(optional)</span>
            </label>
            <textarea
              rows={4}
              value={form.direction || ''}
              onChange={e => set('direction', e.target.value)}
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed"
              placeholder={`Instructions for the AI when drafting. Examples:\n- If we had an in-person meeting in the last 30 days, open with a warm reference to it\n- If last note mentions something they promised, call it out\n- Keep under 4 sentences. End with a specific ask.\n- Never say "I hope this email finds you well"`}
            />
            <p className="text-[10px] text-amber-700 mt-1">
              The AI reads this before writing. The Body above is the starting point — the AI personalizes it using these instructions + relationship data.
            </p>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={e => set('isDefault', e.target.checked)}
                className="w-4 h-4 rounded accent-orange-600"
              />
              <span className="text-xs text-slate-700 font-medium">Default template</span>
            </label>
            {template && !template.isActive && (
              <span className="text-xs text-amber-700 font-medium">Archived — the bot does not use this one</span>
            )}
          </div>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">{err}</p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          {template && (template.isActive ? (
            <button type="button" onClick={() => onArchive(template)}
              className="mr-auto px-3 py-2 rounded-lg text-sm font-semibold text-amber-700 hover:bg-amber-50 transition-colors">
              Archive
            </button>
          ) : (
            <button type="button" onClick={() => onRestore(template)}
              className="mr-auto px-3 py-2 rounded-lg text-sm font-semibold text-green-700 hover:bg-green-50 transition-colors">
              Restore
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Templates Table ───────────────────────────────────────────────────────────

function TemplatesTable({ templates, onEdit, onArchive, onRestore }) {
  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">No templates yet</p>
        <p className="text-xs text-slate-400">Add a template or seed the starter set.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Name</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Scenario</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Client Type</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Stage</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Also only for</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Default</th>
            <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Active</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {templates.filter(t => t.isActive).length === 0 ? (
            <tr><td colSpan={8} className="py-6 text-center text-xs text-slate-400">No active templates — they are all archived below.</td></tr>
          ) : templates.filter(t => t.isActive).map(t => (
            <tr
              key={t.id}
              onClick={() => onEdit(t)}
              className="hover:bg-slate-50 cursor-pointer transition-colors group"
            >
              <td className="py-2.5 pr-4 font-medium text-slate-800">{t.name}</td>
              <td className="py-2.5 pr-4 text-slate-500 capitalize">{t.scenario?.replace(/_/g, ' ')}</td>
              <td className="py-2.5 pr-4 text-slate-500">{t.clientType || 'Any'}</td>
              <td className="py-2.5 pr-4 text-slate-500">{t.dealStage || <span className="text-slate-300">—</span>}</td>
              <td className="py-2.5 pr-4 text-slate-500">{[t.serviceType && (SERVICE_LABELS[t.serviceType] || t.serviceType), t.pipeline && (t.pipeline === 'DESIGN' ? 'Design' : 'Procurement'), t.contactRole].filter(Boolean).join(', ') || <span className="text-slate-300">—</span>}</td>
              <td className="py-2.5 pr-4">
                {t.isDefault
                  ? <span className="text-green-600 font-bold">✓</span>
                  : <span className="text-slate-300">—</span>}
              </td>
              <td className="py-2.5 pr-4">
                <span className={`inline-block w-2 h-2 rounded-full ${t.isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
              </td>
              <td className="py-2.5 text-right">
                <button
                  onClick={e => { e.stopPropagation(); onEdit(t); }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-orange-600 transition-colors opacity-0 group-hover:opacity-100 px-2 py-1 rounded hover:bg-orange-50"
                >
                  Edit
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onArchive(t); }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-amber-700 transition-colors opacity-0 group-hover:opacity-100 px-2 py-1 rounded hover:bg-amber-50"
                >
                  Archive
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <DisabledSection count={templates.filter(t => !t.isActive).length} label="Archived templates">
        <p className="text-[11px] text-slate-400 mb-1">Kept, never deleted. The bot does not use these until they are restored.</p>
        <div className="divide-y divide-slate-100">
          {templates.filter(t => !t.isActive).map(t => (
            <div key={t.id} className="w-full flex items-center gap-2 py-2">
              <button onClick={() => onEdit(t)} className="flex items-center gap-2 text-left min-w-0">
                <span className="text-xs font-semibold text-slate-600">{t.name}</span>
                <span className="text-[10px] text-slate-400 capitalize">{t.scenario?.replace(/_/g, ' ')}</span>
              </button>
              <button onClick={() => onRestore(t)} className="ml-auto text-[10px] text-green-700 font-semibold px-2 py-1 rounded hover:bg-green-50">Restore</button>
            </div>
          ))}
        </div>
      </DisabledSection>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [tab,              setTab]              = useState('email');
  const [templates,        setTemplates]        = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [showDrawer,       setShowDrawer]       = useState(false);
  const [editingTemplate,  setEditingTemplate]  = useState(null);
  const [seeding,          setSeeding]          = useState(false);
  const [seeded,           setSeeded]           = useState(false);
  const [err,              setErr]              = useState('');
  const [archiving,        setArchiving]        = useState(null);   // template waiting on the archive popup
  const [archiveBusy,      setArchiveBusy]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automation/templates');
      if (res.ok) {
        const d = await res.json();
        setTemplates(d.templates || d || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSeed() {
    setSeeding(true);
    setErr('');
    try {
      const res = await fetch('/api/automation/templates/seed', { method: 'POST' });
      if (!res.ok) throw new Error('Seed failed');
      setSeeded(true);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSeeding(false);
    }
  }

  function openNew() {
    setEditingTemplate(null);
    setShowDrawer(true);
  }

  function openEdit(t) {
    setEditingTemplate(t);
    setShowDrawer(true);
  }

  function handleSaved(saved, isEdit) {
    if (isEdit) {
      setTemplates(prev => prev.map(t => t.id === saved.id ? saved : t));
    } else {
      setTemplates(prev => [...prev, saved]);
    }
  }

  // Archive / restore. Email templates are archived, never deleted (Mike,
  // 2026-09-11). Archiving only flips isActive, which everything that picks a
  // template already honours, so the template and its wording are kept.
  async function setActive(t, isActive) {
    const res = await fetch(`/api/automation/templates/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Error ${res.status}`);
    }
    const { template } = await res.json();
    setTemplates(prev => prev.map(x => x.id === template.id ? template : x));
    return template;
  }

  async function confirmArchive() {
    if (!archiving) return;
    setArchiveBusy(true);
    setErr('');
    try {
      await setActive(archiving, false);
      setShowDrawer(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setArchiving(null);
      setArchiveBusy(false);
    }
  }

  async function restore(t) {
    setErr('');
    try {
      const saved = await setActive(t, true);
      if (editingTemplate?.id === saved.id) setEditingTemplate(saved);
    } catch (e) {
      setErr(e.message);
    }
  }

  const channelFilter = TAB_CHANNELS[tab];
  const filtered      = templates.filter(t => t.channel === channelFilter);

  const TABS = [
    { id: 'email',    label: 'Email' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'agenda',   label: 'Meeting Agendas' },
  ];

  return (
    <div className="px-4 py-6">
      <AutomationNav />
      <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Templates</h1>
          <p className="text-xs text-slate-500 mt-0.5">Reusable message templates for email, LinkedIn, and meetings.</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors">
          + New Template
        </button>
      </div>

      {err && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</p>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5 w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Seed banner */}
      {!loading && templates.length === 0 && !seeded && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-800">No templates yet</p>
            <p className="text-xs text-amber-600 mt-0.5">Seed a starter set of templates to get up and running fast.</p>
          </div>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0 ml-4"
          >
            {seeding && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {seeding ? 'Seeding…' : 'Seed Starter Templates'}
          </button>
        </div>
      )}

      {/* Table card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : (
          <TemplatesTable templates={filtered} onEdit={openEdit} onArchive={setArchiving} onRestore={restore} />
        )}
      </div>

      <TemplateDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        template={editingTemplate}
        onSaved={handleSaved}
        onArchive={setArchiving}
        onRestore={restore}
      />

      <ConfirmArchiveModal
        open={!!archiving}
        title="Archive this template?"
        what={archiving?.name}
        body={<>Once it is archived, the sales bot stops using this template when it drafts messages. Nothing is deleted — the template and its wording are kept, and you can restore it any time from <b>Archived templates</b> at the bottom of this list.</>}
        busy={archiveBusy}
        onCancel={() => setArchiving(null)}
        onConfirm={confirmArchive}
      />
      </div>
    </div>
  );
}
