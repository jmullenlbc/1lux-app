'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import AutomationNav from '@/components/salesAutomation/AutomationNav';
import BotRulesPanel from '@/components/salesAutomation/BotRulesPanel';

// ── Default meeting types ─────────────────────────────────────────────────────
const DEFAULT_MEETING_TYPES = [
  'Coffee',
  'Lunch',
  'Site Visit',
  'Happy Hour',
  'Internal Meeting',
  'Golf',
  'Office Presentation',
];

const DEFAULT_LOCATION_TYPES = [
  'In Office',
  'Client Site',
  'Coffee Shop',
  'Virtual',
];

// ── CreatableSelect (same pattern as templates page) ─────────────────────────
function CreatableSelect({ value, onChange, options, placeholder = 'Select or type…' }) {
  const [open,  setOpen]  = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(input.toLowerCase()));
  const isNew = input.trim() && !options.some(o => o.toLowerCase() === input.trim().toLowerCase());

  function select(val) { onChange(val); setInput(''); setOpen(false); }

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
          <input autoFocus={open} value={open ? input : ''}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setOpen(true)} onKeyDown={handleKeyDown}
            placeholder={open ? 'Type to filter or add new…' : value || placeholder}
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
            <button key={opt} type="button" onClick={() => select(opt)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 hover:text-orange-700 transition-colors ${opt === value ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-slate-700'}`}>
              {opt}
            </button>
          ))}
          {isNew && (
            <button type="button" onClick={() => select(input.trim())}
              className="w-full text-left px-3 py-2 text-sm text-orange-600 font-semibold hover:bg-orange-50 border-t border-slate-100 flex items-center gap-1.5">
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

// ── Toggle Switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors shrink-0 focus:outline-none disabled:opacity-50 ${checked ? 'bg-orange-500' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

// ── Days helpers ──────────────────────────────────────────────────────────────

const ALL_DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
function parseDays(str) {
  if (!str) return ['MON','TUE','WED','THU','FRI'];
  if (str === 'MON-FRI') return ['MON','TUE','WED','THU','FRI'];
  return str.split(/[,\s-]+/).map(d => d.trim().toUpperCase()).filter(d => ALL_DAYS.includes(d));
}
function serializeDays(arr) { return arr.join(','); }

// ── Scheduling Rule Drawer ────────────────────────────────────────────────────

const EMPTY_SCHED_RULE = {
  meetingType:  'Coffee',
  dealStage:    '',
  days:         'MON-FRI',
  startTime:    '09:00',
  endTime:      '17:00',
  durationMins: 60,
  bufferBefore: 0,
  bufferAfter:  0,
  locationType: 'In Office',
  travelBuffer: 0,
  priority:     0,
};

function SchedulingRuleDrawer({ open, onClose, rule, onSaved }) {
  const [form,               setForm]              = useState(EMPTY_SCHED_RULE);
  const [saving,             setSaving]            = useState(false);
  const [err,                setErr]               = useState('');
  const [meetingTypeOptions,  setMeetingTypeOptions]  = useState(DEFAULT_MEETING_TYPES);
  const [locationTypeOptions, setLocationTypeOptions] = useState(DEFAULT_LOCATION_TYPES);

  // Load any custom meeting / location types already saved in existing rules
  useEffect(() => {
    fetch('/api/bot/rules/scheduling')
      .then(r => r.json())
      .then(d => {
        const rules = d.rules || [];
        const meetings  = rules.map(r => r.meetingType).filter(Boolean);
        const locations = rules.map(r => r.locationType).filter(Boolean);
        setMeetingTypeOptions(Array.from(new Set([...DEFAULT_MEETING_TYPES, ...meetings])));
        setLocationTypeOptions(Array.from(new Set([...DEFAULT_LOCATION_TYPES, ...locations])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setForm(rule ? { ...EMPTY_SCHED_RULE, ...rule } : EMPTY_SCHED_RULE);
      setErr('');
    }
  }, [open, rule]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const url    = rule ? `/api/bot/rules/scheduling/${rule.id}` : '/api/bot/rules/scheduling';
      const method = rule ? 'PATCH' : 'POST';
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
      onSaved(saved, !!rule);
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
      <div className={`fixed top-0 right-0 bottom-0 w-[440px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">{rule ? 'Edit Scheduling Rule' : 'New Scheduling Rule'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Meeting Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Meeting Type
              <span className="ml-1.5 text-[10px] font-normal text-slate-400">type to add new</span>
            </label>
            <CreatableSelect
              value={form.meetingType}
              onChange={v => set('meetingType', v)}
              options={meetingTypeOptions}
              placeholder="Select or add a meeting type…"
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
              placeholder="Leave blank for all stages"
            />
          </div>

          {/* Days */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Days</label>
            <div className="flex gap-1">
              {ALL_DAYS.map(day => {
                const active = parseDays(form.days).includes(day);
                const shortLabel = day === 'THU' ? 'Th' : day === 'SUN' ? 'Su' : day === 'SAT' ? 'Sa' : day[0];
                return (
                  <button key={day} type="button"
                    onClick={() => {
                      const curr = parseDays(form.days);
                      const next = curr.includes(day) ? curr.filter(d => d !== day) : [...curr, day];
                      set('days', serializeDays(next) || 'MON');
                    }}
                    className={`w-9 h-8 rounded text-[11px] font-bold transition-colors ${
                      active ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
              <input
                type="time"
                value={form.startTime}
                onChange={e => set('startTime', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
              <input
                type="time"
                value={form.endTime}
                onChange={e => set('endTime', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Duration</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={15}
                step={15}
                value={form.durationMins}
                onChange={e => set('durationMins', parseInt(e.target.value) || 60)}
                className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <span className="text-xs text-slate-500">minutes</span>
            </div>
          </div>

          {/* Buffers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Buffer Before</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={form.bufferBefore}
                  onChange={e => set('bufferBefore', parseInt(e.target.value) || 0)}
                  className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="text-xs text-slate-500">min</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Buffer After</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={form.bufferAfter}
                  onChange={e => set('bufferAfter', parseInt(e.target.value) || 0)}
                  className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="text-xs text-slate-500">min</span>
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Location Type</label>
            <CreatableSelect
              value={form.locationType}
              onChange={v => set('locationType', v)}
              options={locationTypeOptions}
              placeholder="Select or type a location…"
            />
          </div>

          {/* Travel buffer */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Travel Buffer</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={5}
                value={form.travelBuffer}
                onChange={e => set('travelBuffer', parseInt(e.target.value) || 0)}
                className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <span className="text-xs text-slate-500">minutes</span>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
            <input
              type="number"
              value={form.priority}
              onChange={e => set('priority', parseInt(e.target.value) || 0)}
              className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
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

// ── Exclusion Rule Drawer ─────────────────────────────────────────────────────

const RULE_TYPES = [
  { value: 'RECURRING_WEEKLY',   label: 'Weekly recurring' },
  { value: 'RECURRING_BIWEEKLY', label: 'Bi-weekly recurring' },
  { value: 'KEYWORD_SUBJECT',    label: 'Subject keyword' },
  { value: 'MIN_RECIPIENTS',     label: 'Min recipients' },
  { value: 'SENDER_DOMAIN',      label: 'Sender domain' },
];

const EMPTY_EXCL_RULE = {
  name:     '',
  ruleType: 'RECURRING_WEEKLY',
  keywords: '',
  minRecipients: 25,          // Mike's number — see MASS_EMAIL_MIN_PEOPLE
  senderDomain: '',
  isActive: true,
};

function ExclusionRuleDrawer({ open, onClose, rule, onSaved }) {
  const [form,   setForm]   = useState(EMPTY_EXCL_RULE);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  useEffect(() => {
    if (open) {
      if (rule) {
        let cfg = rule.config || '{}';
        if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }
        setForm({
          name:          rule.name || '',
          ruleType:      rule.ruleType || 'RECURRING_WEEKLY',
          keywords:      Array.isArray(cfg.keywords) ? cfg.keywords.join(', ') : (cfg.keywords || ''),
          minRecipients: cfg.minRecipients ?? 25,
          senderDomain:  cfg.domain || '',
          isActive:      rule.isActive !== false,
        });
      } else {
        setForm(EMPTY_EXCL_RULE);
      }
      setErr('');
    }
  }, [open, rule]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function buildConfig() {
    if (form.ruleType === 'KEYWORD_SUBJECT') {
      const kws = form.keywords.split(',').map(s => s.trim()).filter(Boolean);
      return JSON.stringify({ keywords: kws });
    }
    if (form.ruleType === 'MIN_RECIPIENTS') {
      return JSON.stringify({ minRecipients: Number(form.minRecipients) || 25 });
    }
    if (form.ruleType === 'SENDER_DOMAIN') {
      return JSON.stringify({ domain: form.senderDomain.trim() });
    }
    return '{}';
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        name:     form.name.trim(),
        ruleType: form.ruleType,
        config:   buildConfig(),
        isActive: form.isActive,
      };
      const url    = rule ? `/api/automation/exclusion-rules/${rule.id}` : '/api/automation/exclusion-rules';
      const method = rule ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const saved = await res.json();
      onSaved(saved, !!rule);
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
      <div className={`fixed top-0 right-0 bottom-0 w-[420px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">{rule ? 'Edit Exclusion Rule' : 'New Exclusion Rule'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Weekly recurring meetings"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Rule Type</label>
            <select
              value={form.ruleType}
              onChange={e => set('ruleType', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {RULE_TYPES.map(rt => (
                <option key={rt.value} value={rt.value}>{rt.label}</option>
              ))}
            </select>
          </div>

          {/* Config fields based on type */}
          {form.ruleType === 'KEYWORD_SUBJECT' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Keywords <span className="text-slate-400 font-normal">(comma-separated)</span></label>
              <input
                type="text"
                value={form.keywords}
                onChange={e => set('keywords', e.target.value)}
                placeholder="e.g. OAC, project meeting, coordination"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          )}

          {form.ruleType === 'MIN_RECIPIENTS' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Minimum recipients</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={2}
                  value={form.minRecipients}
                  onChange={e => set('minRecipients', parseInt(e.target.value) || 25)}
                  className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="text-xs text-slate-500">recipients</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                An email with this many people on it (sender included) is treated as a
                mass send: it is still saved, but it will not move anyone&rsquo;s Last
                Email dates. Leave it at 25 unless you have a reason to change it.
              </p>
            </div>
          )}

          {form.ruleType === 'SENDER_DOMAIN' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Domain</label>
              <input
                type="text"
                value={form.senderDomain}
                onChange={e => set('senderDomain', e.target.value)}
                placeholder="e.g. noreply.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => set('isActive', e.target.checked)}
              className="w-4 h-4 rounded accent-orange-600"
            />
            <span className="text-xs text-slate-700 font-medium">Active</span>
          </label>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
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

// ── Follow-Up Rule Drawer ─────────────────────────────────────────────────────

const EMPTY_FU_RULE = {
  name:     '',
  pipeline: 'Procurement',
  stage:    '',
  staleDays: 14,
  isActive: true,
};

function FollowUpRuleDrawer({ open, onClose, onSaved }) {
  const [form,   setForm]   = useState(EMPTY_FU_RULE);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FU_RULE);
      setErr('');
    }
  }, [open]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.stage.trim()) { setErr('Stage is required.'); return; }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        name:          form.name || `${form.pipeline} – ${form.stage} stale (${form.staleDays}d)`,
        triggerType:   'DEAL_STALE',
        actionType:    'DRAFT_FOLLOW_UP_EMAIL',
        isActive:      form.isActive,
        triggerConfig: JSON.stringify({
          pipeline:  form.pipeline,
          stages:    form.stage,
          staleDays: form.staleDays,
        }),
        actionConfig: JSON.stringify({}),
      };
      const res = await fetch('/api/automation/bot-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const saved = await res.json();
      onSaved(saved);
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
      <div className={`fixed top-0 right-0 bottom-0 w-[440px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">New Follow-Up Threshold</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Pipeline</label>
            <select
              value={form.pipeline}
              onChange={e => set('pipeline', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="Procurement">Procurement</option>
              <option value="Design">Design</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Stage <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.stage}
              onChange={e => set('stage', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="e.g. PRECONSTRUCTION"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Stale after</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={form.staleDays}
                onChange={e => set('staleDays', parseInt(e.target.value) || 1)}
                className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <span className="text-xs text-slate-500">days</span>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => set('isActive', e.target.checked)}
              className="w-4 h-4 rounded accent-orange-600"
            />
            <span className="text-xs text-slate-700 font-medium">Enabled</span>
          </label>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
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

// ── Classification Rule Drawer ────────────────────────────────────────────────

const CLASS_CONDITION_TYPES = [
  { value: 'TITLE_CONTAINS',     label: 'Title Contains' },
  { value: 'LOCATION_CONTAINS',  label: 'Location Contains' },
  { value: 'LOCATION_TYPE',      label: 'Location Type' },
  { value: 'MIN_ATTENDEES',      label: 'Min Attendees' },
  { value: 'MAX_ATTENDEES',      label: 'Max Attendees' },
  { value: 'ORGANIZER_DOMAIN',   label: 'Organizer Domain' },
  { value: 'MIN_DURATION',       label: 'Min Duration (min)' },
  { value: 'MAX_DURATION',       label: 'Max Duration (min)' },
  { value: 'BODY_CONTAINS',      label: 'Body Contains' },
];

// Meal covers a work breakfast, lunch or dinner; Travel is a day on the road to
// see clients. Both are Mike's rules from 2026-09-07.
const CLASS_RESULT_TYPES = [
  { value: 'COFFEE',      label: '☕ Coffee' },
  { value: 'MEAL',        label: '🍽 Meal (breakfast, lunch or dinner)' },
  { value: 'GOLF',        label: '⛳ Golf' },
  { value: 'HAPPY_HOUR',  label: '🍻 Happy Hour' },
  { value: 'SITE_VISIT',  label: '🏗 Site Visit' },
  { value: 'TRAVEL',      label: '✈️ Travel day' },
  { value: 'CALL',        label: '📞 Call' },
  { value: 'TEXT',        label: '💬 Text' },
  { value: 'EVENT',       label: '🎟 Event' },
  { value: 'OTHER',       label: '📅 Other' },
  { value: 'SKIP',        label: '⏭ Skip' },
];

const EMPTY_CLASS_RULE = {
  name:           '',
  conditionType:  'TITLE_CONTAINS',
  conditionValue: '',
  resultType:     'COFFEE',
  priority:       50,
  isActive:       true,
};

function ClassificationRuleDrawer({ open, onClose, rule, onSaved }) {
  const [form,   setForm]   = useState(EMPTY_CLASS_RULE);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  useEffect(() => {
    if (open) {
      setForm(rule ? { ...EMPTY_CLASS_RULE, ...rule } : EMPTY_CLASS_RULE);
      setErr('');
    }
  }, [open, rule]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    if (!form.conditionValue.toString().trim()) { setErr('Condition value is required.'); return; }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        name:           form.name.trim(),
        conditionType:  form.conditionType,
        conditionValue: form.conditionValue.toString().trim(),
        resultType:     form.resultType,
        priority:       parseInt(form.priority) || 50,
        isActive:       form.isActive,
      };
      const url    = rule ? `/api/automation/classification-rules/${rule.id}` : '/api/automation/classification-rules';
      const method = rule ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const saved = await res.json();
      onSaved(saved, !!rule);
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
      <div className={`fixed top-0 right-0 bottom-0 w-[440px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">{rule ? 'Edit Classification Rule' : 'New Classification Rule'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Coffee keyword match"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Condition Type</label>
            <select
              value={form.conditionType}
              onChange={e => set('conditionType', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {CLASS_CONDITION_TYPES.map(ct => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Condition Value <span className="text-red-500">*</span></label>
            {form.conditionType === 'LOCATION_TYPE' ? (
              <select
                value={form.conditionValue}
                onChange={e => set('conditionValue', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">Select…</option>
                <option value="virtual">Virtual</option>
                <option value="in_person">In Person</option>
              </select>
            ) : (
              <input
                type={['MIN_ATTENDEES','MAX_ATTENDEES','MIN_DURATION','MAX_DURATION'].includes(form.conditionType) ? 'number' : 'text'}
                min={0}
                value={form.conditionValue}
                onChange={e => set('conditionValue', e.target.value)}
                placeholder={
                  form.conditionType === 'TITLE_CONTAINS'    ? 'e.g. coffee' :
                  form.conditionType === 'LOCATION_CONTAINS' ? 'e.g. Starbucks' :
                  form.conditionType === 'ORGANIZER_DOMAIN'  ? 'e.g. vendor.com' :
                  form.conditionType === 'BODY_CONTAINS'     ? 'e.g. grab coffee' :
                  'e.g. 30'
                }
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Result Type</label>
            <select
              value={form.resultType}
              onChange={e => set('resultType', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {CLASS_RESULT_TYPES.map(rt => (
                <option key={rt.value} value={rt.value}>{rt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Priority <span className="text-slate-400 font-normal">(lower = checked first)</span></label>
            <input
              type="number"
              min={1}
              value={form.priority}
              onChange={e => set('priority', parseInt(e.target.value) || 50)}
              className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => set('isActive', e.target.checked)}
              className="w-4 h-4 rounded accent-orange-600"
            />
            <span className="text-xs text-slate-700 font-medium">Active</span>
          </label>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
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

// ── CadenceRuleRow ────────────────────────────────────────────────────────────

function CadenceRuleRow({ rule, onDaysBlur, onToggle, toggling }) {
  const [days, setDays] = useState(rule.cadenceDays ?? 30);

  useEffect(() => { setDays(rule.cadenceDays ?? 30); }, [rule.cadenceDays]);

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="py-2.5 pr-4 font-medium text-slate-800">{rule.tier || rule.name || `Tier ${rule.id?.slice(-4)}`}</td>
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            value={days}
            onChange={e => setDays(e.target.value)}
            onBlur={() => onDaysBlur(rule, days)}
            onKeyDown={e => e.key === 'Enter' && onDaysBlur(rule, days)}
            className="w-16 border border-slate-200 rounded-md px-2 py-0.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <span className="text-xs text-slate-500">days</span>
        </div>
      </td>
      <td className="py-2.5 pr-4">
        <ToggleSwitch
          checked={!!rule.isActive}
          onChange={() => onToggle(rule)}
          disabled={toggling}
        />
      </td>
      <td className="py-2.5"></td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RulesPage() {
  const [subtab,            setSubtab]            = useState('my');
  const [config,            setConfig]            = useState(null);
  const [schedulingRules,   setSchedulingRules]   = useState([]);
  const [followUpRules,     setFollowUpRules]     = useState([]);
  const [cadenceRules,      setCadenceRules]      = useState([]);
  const [exclusionRules,    setExclusionRules]    = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [savingConfig,      setSavingConfig]      = useState(false);
  const [showSchedDrawer,   setShowSchedDrawer]   = useState(false);
  const [editingSched,      setEditingSched]      = useState(null);
  const [showFUDrawer,      setShowFUDrawer]      = useState(false);
  const [showExclDrawer,    setShowExclDrawer]    = useState(false);
  const [editingExcl,       setEditingExcl]       = useState(null);
  const [toggling,          setToggling]          = useState({});
  const [togglingCadence,   setTogglingCadence]   = useState({});
  const [togglingExcl,      setTogglingExcl]      = useState({});
  const [seedingCadence,    setSeedingCadence]    = useState(false);
  const [seedingExcl,       setSeedingExcl]       = useState(false);
  const [showAddTier,       setShowAddTier]       = useState(false);
  const [newTier,           setNewTier]           = useState({ label: '', cadenceDays: 90 });
  const [savingTier,        setSavingTier]        = useState(false);
  const [classRules,        setClassRules]        = useState([]);
  const [showClassDrawer,   setShowClassDrawer]   = useState(false);
  const [editingClassRule,  setEditingClassRule]  = useState(null);
  const [seedingClass,      setSeedingClass]      = useState(false);
  const [err,               setErr]               = useState('');

  // Review window local state (synced from config)
  const [rwMode,       setRwMode]       = useState('manual'); // 'manual' | 'auto' | 'immediate'
  const [rwMinutes,    setRwMinutes]    = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, schedRes, rulesRes, cadenceRes, exclRes, classRes] = await Promise.all([
        fetch('/api/bot/config'),
        fetch('/api/bot/rules/scheduling'),
        fetch('/api/automation/bot-rules'),
        fetch('/api/crm/cadence-rules'),
        fetch('/api/automation/exclusion-rules'),
        fetch('/api/automation/classification-rules'),
      ]);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setConfig(cfg);
        const rw = cfg.reviewWindowMinutes ?? -1;
        if (rw === -1)    setRwMode('manual');
        else if (rw === 0) setRwMode('immediate');
        else { setRwMode('auto'); setRwMinutes(rw); }
      }
      if (schedRes.ok) {
        const d = await schedRes.json();
        setSchedulingRules(d.rules || d || []);
      }
      if (rulesRes.ok) {
        const d = await rulesRes.json();
        const allRules = d.rules || d || [];
        setFollowUpRules(allRules.filter(r => r.triggerType === 'DEAL_STALE'));
      }
      if (cadenceRes.ok) {
        const d = await cadenceRes.json();
        setCadenceRules(d.rules || d || []);
      }
      if (exclRes.ok) {
        const d = await exclRes.json();
        setExclusionRules(d.rules || d || []);
      }
      if (classRes.ok) {
        const d = await classRes.json();
        setClassRules(d.rules || d || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveReviewWindow(mode, mins) {
    const rw = mode === 'manual' ? -1 : mode === 'immediate' ? 0 : mins;
    setSavingConfig(true);
    try {
      await fetch('/api/bot/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewWindowMinutes: rw }),
      });
      setConfig(prev => ({ ...prev, reviewWindowMinutes: rw }));
    } catch {}
    setSavingConfig(false);
  }

  async function handleToggleFU(rule) {
    setToggling(prev => ({ ...prev, [rule.id]: true }));
    try {
      const res = await fetch(`/api/automation/bot-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (res.ok) {
        setFollowUpRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r));
      }
    } catch {}
    setToggling(prev => ({ ...prev, [rule.id]: false }));
  }

  function handleSchedSaved(saved, isEdit) {
    if (isEdit) {
      setSchedulingRules(prev => prev.map(r => r.id === saved.id ? saved : r));
    } else {
      setSchedulingRules(prev => [...prev, saved]);
    }
  }

  function handleFUSaved(saved) {
    setFollowUpRules(prev => [...prev, saved]);
  }

  // ── Cadence rule handlers ───────────────────────────────────────────────────

  async function handleSeedCadence() {
    setSeedingCadence(true);
    try {
      const res = await fetch('/api/crm/cadence-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: true }),
      });
      if (res.ok) {
        const d = await res.json();
        setCadenceRules(d.rules || d || []);
      }
    } catch {}
    setSeedingCadence(false);
  }

  async function handleCadenceDaysBlur(rule, cadenceDays) {
    const days = parseInt(cadenceDays) || rule.cadenceDays;
    if (days === rule.cadenceDays) return;
    try {
      const res = await fetch(`/api/crm/cadence-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadenceDays: days }),
      });
      if (res.ok) {
        setCadenceRules(prev => prev.map(r => r.id === rule.id ? { ...r, cadenceDays: days } : r));
      }
    } catch {}
  }

  async function handleToggleCadence(rule) {
    setTogglingCadence(prev => ({ ...prev, [rule.id]: true }));
    try {
      const res = await fetch(`/api/crm/cadence-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (res.ok) {
        setCadenceRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r));
      }
    } catch {}
    setTogglingCadence(prev => ({ ...prev, [rule.id]: false }));
  }

  // ── Exclusion rule handlers ─────────────────────────────────────────────────

  async function handleSeedExclusions() {
    setSeedingExcl(true);
    const defaults = [
      { name: 'Weekly recurring meetings',      ruleType: 'RECURRING_WEEKLY',   config: '{}',                                           isActive: true },
      { name: 'OAC / project coordination',      ruleType: 'KEYWORD_SUBJECT',    config: '{"keywords":["OAC","project meeting","coordination"]}', isActive: true },
      { name: 'Mass emails (25+ people)',        ruleType: 'MIN_RECIPIENTS',     config: '{"minRecipients":25}',                          isActive: true },
    ];
    try {
      const results = await Promise.all(
        defaults.map(d => fetch('/api/automation/exclusion-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        }).then(r => r.ok ? r.json() : null))
      );
      const saved = results.filter(Boolean);
      if (saved.length) setExclusionRules(prev => [...prev, ...saved]);
    } catch {}
    setSeedingExcl(false);
  }

  function handleExclSaved(saved, isEdit) {
    if (isEdit) {
      setExclusionRules(prev => prev.map(r => r.id === saved.id ? saved : r));
    } else {
      setExclusionRules(prev => [...prev, saved]);
    }
  }

  async function handleToggleExcl(rule) {
    setTogglingExcl(prev => ({ ...prev, [rule.id]: true }));
    try {
      const res = await fetch(`/api/automation/exclusion-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (res.ok) {
        setExclusionRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r));
      }
    } catch {}
    setTogglingExcl(prev => ({ ...prev, [rule.id]: false }));
  }

  async function handleDeleteExcl(rule) {
    if (!confirm(`Delete exclusion rule "${rule.name}"?`)) return;
    try {
      const res = await fetch(`/api/automation/exclusion-rules/${rule.id}`, { method: 'DELETE' });
      if (res.ok) setExclusionRules(prev => prev.filter(r => r.id !== rule.id));
    } catch {}
  }

  function handleClassSaved(saved, isEdit) {
    if (isEdit) {
      setClassRules(prev => prev.map(r => r.id === saved.id ? saved : r));
    } else {
      setClassRules(prev => [...prev, saved]);
    }
  }

  function parseTriggerConfig(rule) {
    let tc = rule.triggerConfig || {};
    if (typeof tc === 'string') { try { tc = JSON.parse(tc); } catch { tc = {}; } }
    return tc;
  }

  const SUBTABS = [
    { id: 'my',       label: 'My Rules' },
    { id: 'defaults', label: 'Company Defaults' },
  ];

  return (
    <div className="px-4 py-6">
      <AutomationNav />
      <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Rules</h1>
        <p className="text-xs text-slate-500 mt-0.5">Bot rules, scheduling, exclusions, classification, and relationship cadence — all in one place.</p>
      </div>

      {/* Bot Rules — global, always at top */}
      <div className="mb-6">
        <BotRulesPanel />
      </div>

      <div className="border-t border-slate-200 mb-6" />

      {/* Scheduling & Relationship section heading */}
      <div className="mb-3">
        <h2 className="text-base font-bold text-slate-900">Scheduling &amp; Relationship</h2>
        <p className="text-xs text-slate-500 mt-0.5">Review window, meeting rules, exclusions, classification, and cadence.</p>
      </div>

      {err && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</p>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {SUBTABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSubtab(id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              subtab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── Section 1: Review Window ────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-slate-900">Review Window</h2>
              {savingConfig && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <div className="w-3 h-3 border-2 border-slate-200 border-t-orange-400 rounded-full animate-spin" />
                  Saving…
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-4">How long before the bot sends a scheduling reply automatically.</p>
            <div className="space-y-2.5">
              {/* Always manual */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-transparent hover:bg-slate-50 transition-colors">
                <input
                  type="radio"
                  name="rw"
                  checked={rwMode === 'manual'}
                  onChange={() => { setRwMode('manual'); saveReviewWindow('manual', rwMinutes); }}
                  className="accent-orange-600"
                />
                <span className="text-sm text-slate-700">Always require manual send</span>
              </label>

              {/* Auto after N minutes */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-transparent hover:bg-slate-50 transition-colors">
                <input
                  type="radio"
                  name="rw"
                  checked={rwMode === 'auto'}
                  onChange={() => { setRwMode('auto'); saveReviewWindow('auto', rwMinutes); }}
                  className="accent-orange-600"
                />
                <span className="text-sm text-slate-700 flex items-center gap-2">
                  Auto-send after:
                  <input
                    type="number"
                    min={1}
                    value={rwMinutes}
                    onChange={e => setRwMinutes(parseInt(e.target.value) || 1)}
                    onBlur={() => rwMode === 'auto' && saveReviewWindow('auto', rwMinutes)}
                    onClick={e => e.stopPropagation()}
                    className="w-16 border border-slate-200 rounded-md px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <span className="text-slate-500 text-xs">minutes</span>
                </span>
              </label>

              {/* Immediate */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-transparent hover:bg-slate-50 transition-colors">
                <input
                  type="radio"
                  name="rw"
                  checked={rwMode === 'immediate'}
                  onChange={() => { setRwMode('immediate'); saveReviewWindow('immediate', rwMinutes); }}
                  className="accent-orange-600"
                />
                <span className="text-sm text-slate-700">Immediate (no review)</span>
              </label>
            </div>
          </div>

          {/* ── Section 2: Scheduling Rules ─────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-slate-900">Scheduling Rules</h2>
              <button
                onClick={() => { setEditingSched(null); setShowSchedDrawer(true); }}
                className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 transition-colors"
              >
                + Add Rule
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">When and where the bot can offer meeting times.</p>

            {schedulingRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                  </svg>
                </div>
                <p className="text-xs text-slate-500">No scheduling rules yet. Add one to define available meeting windows.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Meeting Type</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Stage</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Days</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Time Window</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Duration</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Location</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Travel</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {schedulingRules.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-2.5 pr-3 font-medium text-slate-800">{r.meetingType || '—'}</td>
                        <td className="py-2.5 pr-3 text-slate-500">{r.dealStage || <span className="text-slate-300">All</span>}</td>
                        <td className="py-2.5 pr-3 text-slate-500 font-mono text-[10px]">{r.days || 'MON-FRI'}</td>
                        <td className="py-2.5 pr-3 text-slate-500">{r.startTime} – {r.endTime}</td>
                        <td className="py-2.5 pr-3 text-slate-500">{r.durationMins ?? '—'} min</td>
                        <td className="py-2.5 pr-3 text-slate-500">{r.locationType || '—'}</td>
                        <td className="py-2.5 pr-3 text-slate-500">{r.travelBuffer ?? 0} min</td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => { setEditingSched(r); setShowSchedDrawer(true); }}
                            className="text-[11px] font-semibold text-slate-500 hover:text-orange-600 transition-colors opacity-0 group-hover:opacity-100 px-2 py-1 rounded hover:bg-orange-50"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Follow-Up Thresholds removed — these are now managed in Bot Rules above (trigger = Deal Stale). */}

          {/* ── Section: Relationship Cadence Defaults ────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-slate-900">Relationship Cadence</h2>
              <div className="flex items-center gap-2">
                {cadenceRules.length === 0 && (
                  <button
                    onClick={handleSeedCadence}
                    disabled={seedingCadence}
                    className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {seedingCadence && <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    Seed Defaults
                  </button>
                )}
                <button
                  onClick={() => setShowAddTier(v => !v)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  + Add Tier
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">Default in-person check-in intervals by relationship tier. Override at the company or contact level.</p>

            {cadenceRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                </div>
                <p className="text-xs text-slate-500">No cadence rules yet. Click Seed Defaults to create standard tiers.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Tier</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">In-person every</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Active</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {cadenceRules.map(r => (
                      <CadenceRuleRow
                        key={r.id}
                        rule={r}
                        onDaysBlur={handleCadenceDaysBlur}
                        onToggle={handleToggleCadence}
                        toggling={!!togglingCadence[r.id]}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add Tier inline form */}
            {showAddTier && (
              <div className="mt-3 flex items-end gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">Tier Label</label>
                  <input value={newTier.label} onChange={e => setNewTier(p => ({...p, label: e.target.value}))}
                    placeholder="e.g. Board Member" className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">Days</label>
                  <input type="number" value={newTier.cadenceDays} onChange={e => setNewTier(p => ({...p, cadenceDays: parseInt(e.target.value)||90}))}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                </div>
                <button disabled={savingTier || !newTier.label.trim()} onClick={async () => {
                  setSavingTier(true);
                  const res = await fetch('/api/crm/cadence-rules', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ tier: newTier.label.toUpperCase().replace(/\s+/g,'_'), label: newTier.label, cadenceDays: newTier.cadenceDays, isActive: true })
                  });
                  if (res.ok) {
                    const d = await res.json();
                    setCadenceRules(prev => [...prev, d.rule]);
                    setNewTier({ label:'', cadenceDays: 90 });
                    setShowAddTier(false);
                  }
                  setSavingTier(false);
                }} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 transition-colors">
                  {savingTier ? 'Saving…' : 'Add'}
                </button>
                <button onClick={() => setShowAddTier(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">Cancel</button>
              </div>
            )}
          </div>

          {/* ── Section 5: Activity Exclusion Rules ─────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-slate-900">Activity Exclusion Rules</h2>
              <div className="flex items-center gap-2">
                {exclusionRules.length === 0 && (
                  <button
                    onClick={handleSeedExclusions}
                    disabled={seedingExcl}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {seedingExcl && <div className="w-3 h-3 border-2 border-slate-300 border-t-orange-400 rounded-full animate-spin" />}
                    Seed defaults
                  </button>
                )}
                <button
                  onClick={() => { setEditingExcl(null); setShowExclDrawer(true); }}
                  className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 transition-colors"
                >
                  + Add Rule
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">Meetings and emails matching these rules are excluded from relationship tracking.</p>

            {exclusionRules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <p className="text-xs text-slate-500">No exclusion rules yet. Add rules or seed defaults.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Name</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Type</th>
                      <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Active</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {exclusionRules.map(r => {
                      const typeLabel = RULE_TYPES.find(rt => rt.value === r.ruleType)?.label || r.ruleType;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="py-2.5 pr-4 font-medium text-slate-800">
                            <button
                              onClick={() => { setEditingExcl(r); setShowExclDrawer(true); }}
                              className="hover:text-orange-600 transition-colors"
                            >
                              {r.name}
                            </button>
                          </td>
                          <td className="py-2.5 pr-4 text-slate-500">{typeLabel}</td>
                          <td className="py-2.5 pr-4">
                            <ToggleSwitch
                              checked={!!r.isActive}
                              onChange={() => handleToggleExcl(r)}
                              disabled={!!togglingExcl[r.id]}
                            />
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => handleDeleteExcl(r)}
                              className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete rule"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Section 6: Activity Classification Rules ────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Activity Classification Rules</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rules determine how calendar events are classified (Coffee, Lunch, Golf, etc.).
                  Checked highest-priority first — first match wins.
                  Unmatched events are classified by AI.
                </p>
              </div>
              <button
                onClick={() => { setEditingClassRule(null); setShowClassDrawer(true); }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors shrink-0"
              >+ Add Rule</button>
            </div>

            {classRules.length === 0 && (
              <div className="mt-3">
                <button
                  disabled={seedingClass}
                  onClick={async () => {
                    setSeedingClass(true);
                    const res = await fetch('/api/automation/classification-rules', {
                      method: 'POST', headers: {'Content-Type':'application/json'},
                      body: JSON.stringify({ seed: true })
                    });
                    const d = await res.json();
                    if (d.ok) {
                      const r = await fetch('/api/automation/classification-rules');
                      const rd = await r.json();
                      setClassRules(rd.rules || []);
                    }
                    setSeedingClass(false);
                  }}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50 transition-colors"
                >
                  {seedingClass ? 'Seeding…' : '⚡ Seed default classification rules'}
                </button>
                <p className="text-[11px] text-slate-400 mt-1">16 default rules covering common keywords, location types, and group sizes</p>
              </div>
            )}

            {classRules.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Priority', 'Rule Name', 'Condition', 'Result', 'Active', ''].map(h => (
                        <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {classRules.map(rule => (
                      <tr key={rule.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-2 pr-4">
                          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{rule.priority}</span>
                        </td>
                        <td className="py-2 pr-4 font-medium text-slate-700">{rule.name}</td>
                        <td className="py-2 pr-4 text-slate-500">
                          <span className="text-[10px] text-slate-400 uppercase">{rule.conditionType.replace(/_/g,' ')}</span>
                          {' '}
                          <span className="font-mono text-slate-600">"{rule.conditionValue}"</span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            rule.resultType === 'SKIP'       ? 'bg-slate-100 text-slate-500' :
                            rule.resultType === 'GOLF'       ? 'bg-green-50 text-green-700' :
                            rule.resultType === 'MEAL'       ? 'bg-orange-50 text-orange-700' :
                            rule.resultType === 'LUNCH'      ? 'bg-orange-50 text-orange-700' :
                            rule.resultType === 'COFFEE'     ? 'bg-amber-50 text-amber-700' :
                            rule.resultType === 'HAPPY_HOUR' ? 'bg-yellow-50 text-yellow-700' :
                            rule.resultType === 'SITE_VISIT' ? 'bg-blue-50 text-blue-700' :
                            rule.resultType === 'TRAVEL'     ? 'bg-sky-50 text-sky-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {/* Rules saved before the rename still say LUNCH — show them as Meal. */}
                            {rule.resultType === 'SKIP' ? 'Skip'
                              : rule.resultType === 'LUNCH' ? 'Meal'
                              : rule.resultType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <ToggleSwitch
                            checked={!!rule.isActive}
                            onChange={async (val) => {
                              await fetch(`/api/automation/classification-rules/${rule.id}`, {
                                method: 'PATCH', headers: {'Content-Type':'application/json'},
                                body: JSON.stringify({ isActive: val })
                              });
                              setClassRules(prev => prev.map(r => r.id === rule.id ? {...r, isActive: val} : r));
                            }}
                          />
                        </td>
                        <td className="py-2">
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingClassRule(rule); setShowClassDrawer(true); }}
                              className="text-[11px] text-slate-400 hover:text-orange-600 transition-colors">Edit</button>
                            <button onClick={async () => {
                              if (!confirm('Delete this rule?')) return;
                              await fetch(`/api/automation/classification-rules/${rule.id}`, { method: 'DELETE' });
                              setClassRules(prev => prev.filter(r => r.id !== rule.id));
                            }} className="text-[11px] text-slate-400 hover:text-red-500 transition-colors">✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Section 7: Location & Travel ────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-1">Location &amp; Travel</h2>
            <p className="text-xs text-slate-500 mb-4">Home base and travel preferences for scheduling.</p>

            {/* Phase D banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-start gap-2.5">
              <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="text-xs text-blue-700 leading-relaxed">
                Travel detection will be available in <span className="font-semibold">Phase D</span> when M365 calendar is connected.
              </p>
            </div>

            <div className="space-y-4 opacity-60 pointer-events-none select-none">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Home base city</label>
                <input
                  type="text"
                  disabled
                  placeholder="e.g. Chicago, IL"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-slate-50 cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 mt-1">Stored to your user profile. Available in Phase D.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Default travel buffer before</label>
                  <div className="flex items-center gap-2">
                    <input type="number" disabled className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-slate-50 cursor-not-allowed" defaultValue={30} />
                    <span className="text-xs text-slate-500">min</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Default travel buffer after</label>
                  <div className="flex items-center gap-2">
                    <input type="number" disabled className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-slate-50 cursor-not-allowed" defaultValue={30} />
                    <span className="text-xs text-slate-500">min</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      <SchedulingRuleDrawer
        open={showSchedDrawer}
        onClose={() => setShowSchedDrawer(false)}
        rule={editingSched}
        onSaved={handleSchedSaved}
      />

      <ExclusionRuleDrawer
        open={showExclDrawer}
        onClose={() => { setShowExclDrawer(false); setEditingExcl(null); }}
        rule={editingExcl}
        onSaved={handleExclSaved}
      />

      <ClassificationRuleDrawer
        open={showClassDrawer}
        onClose={() => { setShowClassDrawer(false); setEditingClassRule(null); }}
        rule={editingClassRule}
        onSaved={handleClassSaved}
      />
      </div>
    </div>
  );
}
