'use client';
import { useState, useEffect, useCallback } from 'react';
import DisabledSection from '@/components/salesAutomation/DisabledSection';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtTrigger(type) {
  const map = {
    DEAL_STALE:            'Deal Stale',
    INBOUND_EMAIL_INTENT:  'Scheduling Intent',
    MARKET_SIGNAL:         'Market Signal',
    DEAL_STAGE_CHANGE:     'Stage Change',
    MANUAL:                'Manual',
  };
  return map[type] || type;
}

function fmtAction(type) {
  const map = {
    DRAFT_FOLLOW_UP_EMAIL:     'Draft Follow-Up',
    DRAFT_SCHEDULING_REPLY:    'Draft Scheduling Reply',
    DRAFT_LINKEDIN_MESSAGE:    'Draft LinkedIn',
    NOTIFY_ONLY:               'Notify Only',
  };
  return map[type] || type;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// ── Trigger Config Fields ─────────────────────────────────────────────────────

function TriggerConfig({ triggerType, config, onChange }) {
  function set(key, val) {
    onChange({ ...config, [key]: val });
  }

  if (triggerType === 'DEAL_STALE') {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pipeline</label>
          <select
            value={config.pipeline || 'Procurement'}
            onChange={e => set('pipeline', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="Procurement">Procurement</option>
            <option value="Design">Design</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Stages</label>
          {(() => {
            const procStages = [
              { value: 'QUALIFIED',       label: 'Qualified' },
              { value: 'PRECONSTRUCTION', label: 'Pre-Construction' },
              { value: 'BUYOUT',          label: 'Buyout' },
              { value: 'CONSTRUCTION',    label: 'Construction' },
              { value: 'COMPLETED',       label: 'Completed' },
            ];
            const designStages = [
              { value: 'DESIGN_QUALIFIED', label: 'Design Qualified' },
              { value: 'PROPOSAL_SENT',    label: 'Proposal Sent' },
              { value: 'DESIGN',           label: 'Design' },
              { value: 'DESIGN_COMPLETED', label: 'Design Completed' },
            ];
            const stageOptions = (config.pipeline || '').toLowerCase() === 'design' ? designStages : procStages;
            const selected = (config.stages || '').split(',').map(s => s.trim()).filter(Boolean);
            function toggleStage(val) {
              const next = selected.includes(val)
                ? selected.filter(s => s !== val)
                : [...selected, val];
              set('stages', next.join(', '));
            }
            return (
              <div className="flex flex-wrap gap-1.5">
                {stageOptions.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStage(s.value)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                      selected.includes(s.value)
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            );
          })()}
          {!(config.stages || '') && (
            <p className="text-[10px] text-slate-400 mt-1">Select one or more stages above</p>
          )}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Stale after</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={config.staleDays ?? 14}
              onChange={e => set('staleDays', parseInt(e.target.value) || 1)}
              className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <span className="text-xs text-slate-500">days</span>
          </div>
        </div>
      </div>
    );
  }

  if (triggerType === 'INBOUND_EMAIL_INTENT') {
    return (
      <div>
        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Min confidence (0–1)</label>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={config.confidenceThreshold ?? 0.75}
          onChange={e => set('confidenceThreshold', parseFloat(e.target.value) || 0)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>
    );
  }

  if (triggerType === 'MARKET_SIGNAL') {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Signal types</label>
          <input
            type="text"
            value={config.signalTypes || ''}
            onChange={e => set('signalTypes', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="GROUNDBREAKING, FINANCING"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!config.requireClientMatch}
            onChange={e => set('requireClientMatch', e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-orange-600"
          />
          <span className="text-[11px] text-slate-700">Require client match</span>
        </label>
      </div>
    );
  }

  if (triggerType === 'DEAL_STAGE_CHANGE') {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">From stage</label>
          <input
            type="text"
            value={config.fromStage || ''}
            onChange={e => set('fromStage', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="QUALIFIED"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">To stage</label>
          <input
            type="text"
            value={config.toStage || ''}
            onChange={e => set('toStage', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="PROPOSAL_SENT"
          />
        </div>
      </div>
    );
  }

  if (triggerType === 'MANUAL') {
    return (
      <p className="text-xs text-slate-400 italic">Triggered manually from a deal.</p>
    );
  }

  return null;
}

// ── Action Config Fields ──────────────────────────────────────────────────────

function ActionConfig({ actionType, config, onChange }) {
  function set(key, val) {
    onChange({ ...config, [key]: val });
  }

  if (actionType === 'DRAFT_FOLLOW_UP_EMAIL' || actionType === 'DRAFT_SCHEDULING_REPLY') {
    return (
      <div>
        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Review window</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={config.reviewWindowMinutes ?? 30}
            onChange={e => set('reviewWindowMinutes', parseInt(e.target.value))}
            className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <span className="text-xs text-slate-500">min, -1 = always manual</span>
        </div>
      </div>
    );
  }

  if (actionType === 'DRAFT_LINKEDIN_MESSAGE') {
    return (
      <p className="text-xs text-slate-400 italic">Always requires manual send.</p>
    );
  }

  if (actionType === 'NOTIFY_ONLY') {
    return (
      <div>
        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Notification message</label>
        <input
          type="text"
          value={config.notificationMessage || ''}
          onChange={e => set('notificationMessage', e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="New signal for {clientName}"
        />
      </div>
    );
  }

  return null;
}

// ── Rule Drawer ───────────────────────────────────────────────────────────────

const EMPTY_RULE = {
  name: '',
  triggerType: 'DEAL_STALE',
  actionType: 'DRAFT_FOLLOW_UP_EMAIL',
  triggerConfig: {},
  actionConfig: {},
  isActive: true,
};

function RuleDrawer({ open, onClose, rule, onSaved }) {
  const [form,   setForm]   = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  useEffect(() => {
    if (open) {
      if (rule) {
        let tc = rule.triggerConfig || {};
        let ac = rule.actionConfig  || {};
        if (typeof tc === 'string') { try { tc = JSON.parse(tc); } catch { tc = {}; } }
        if (typeof ac === 'string') { try { ac = JSON.parse(ac); } catch { ac = {}; } }
        setForm({ ...EMPTY_RULE, ...rule, triggerConfig: tc, actionConfig: ac });
      } else {
        setForm(EMPTY_RULE);
      }
      setErr('');
    }
  }, [open, rule]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Rule name is required.'); return; }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        ...form,
        triggerConfig: JSON.stringify(form.triggerConfig || {}),
        actionConfig:  JSON.stringify(form.actionConfig  || {}),
      };
      const url    = rule ? `/api/automation/bot-rules/${rule.id}` : '/api/automation/bot-rules';
      const method = rule ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
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
      <div className={`fixed top-0 right-0 bottom-0 w-[560px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">{rule ? 'Edit Rule' : 'New Rule'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Two-panel WHEN / THEN */}
          <div className="grid grid-cols-2 gap-4">
            {/* WHEN */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">When</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Trigger type</label>
                  <select
                    value={form.triggerType}
                    onChange={e => set('triggerType', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="DEAL_STALE">Deal Stale</option>
                    <option value="INBOUND_EMAIL_INTENT">Scheduling Intent</option>
                    <option value="MARKET_SIGNAL">Market Signal</option>
                    <option value="DEAL_STAGE_CHANGE">Stage Change</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </div>
                <TriggerConfig
                  triggerType={form.triggerType}
                  config={form.triggerConfig}
                  onChange={v => set('triggerConfig', v)}
                />
              </div>
            </div>

            {/* THEN */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Then</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Action type</label>
                  <select
                    value={form.actionType}
                    onChange={e => set('actionType', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="DRAFT_FOLLOW_UP_EMAIL">Draft Follow-Up Email</option>
                    <option value="DRAFT_SCHEDULING_REPLY">Draft Scheduling Reply</option>
                    <option value="DRAFT_LINKEDIN_MESSAGE">Draft LinkedIn</option>
                    <option value="NOTIFY_ONLY">Notify Only</option>
                  </select>
                </div>
                <ActionConfig
                  actionType={form.actionType}
                  config={form.actionConfig}
                  onChange={v => set('actionConfig', v)}
                />
              </div>
            </div>
          </div>

          {/* Rule name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Rule name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="e.g. Stale Proposal Follow-Up"
            />
          </div>

          {/* Applies to */}
          <p className="text-xs text-slate-400">Applies to: All Sales</p>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>
          )}
        </form>

        {/* Footer */}
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
            {saving ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BotRulesPanel() {
  const [rules,       setRules]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showDrawer,  setShowDrawer]  = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [toggling,    setToggling]    = useState({});
  const [err,         setErr]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automation/bot-rules');
      if (res.ok) {
        const d = await res.json();
        setRules(d.rules || d || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(rule) {
    setToggling(prev => ({ ...prev, [rule.id]: true }));
    try {
      const res = await fetch(`/api/automation/bot-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (res.ok) {
        setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isActive: !r.isActive } : r));
      }
    } catch {}
    setToggling(prev => ({ ...prev, [rule.id]: false }));
  }

  function openNew() {
    setEditingRule(null);
    setShowDrawer(true);
  }

  function openEdit(rule) {
    setEditingRule(rule);
    setShowDrawer(true);
  }

  function handleSaved(saved, isEdit) {
    // API returns { rule: {...} } — unwrap it
    const rule = saved?.rule || saved;
    if (isEdit) {
      setRules(prev => prev.map(r => r.id === rule.id ? rule : r));
    } else {
      setRules(prev => [...prev, rule]);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Bot Rules</h2>
          <p className="text-xs text-slate-500 mt-0.5">What triggers the bot and what it does. Disabled rules stop affecting automations but are kept for history.</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors shrink-0">
          + New Rule
        </button>
      </div>

      {err && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">No rules yet</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Create your first rule to start automating follow-ups and scheduling replies.
            </p>
            <button onClick={openNew} className="mt-4 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors">
              + New Rule
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Name</th>
                  <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Trigger</th>
                  <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Action</th>
                  <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Status</th>
                  <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-4">Created</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rules.filter(r => r.isActive).length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-xs text-slate-400">No active rules — all are disabled below.</td></tr>
                ) : rules.filter(r => r.isActive).map(rule => (
                  <tr
                    key={rule.id}
                    onClick={() => openEdit(rule)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 pr-4 font-semibold text-slate-800">{rule.name}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {fmtTrigger(rule.triggerType)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                        {fmtAction(rule.actionType)}
                      </span>
                    </td>
                    <td className="py-3 pr-4" onClick={e => e.stopPropagation()}>
                      <ToggleSwitch
                        checked={!!rule.isActive}
                        onChange={() => handleToggle(rule)}
                        disabled={!!toggling[rule.id]}
                      />
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{fmtDate(rule.createdAt)}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(rule); }}
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

        <DisabledSection count={rules.filter(r => !r.isActive).length}>
          <div className="divide-y divide-slate-100">
            {rules.filter(r => !r.isActive).map(rule => (
              <div key={rule.id} className="flex items-center gap-3 py-2">
                <button onClick={() => openEdit(rule)} className="flex-1 text-left min-w-0">
                  <span className="text-xs font-semibold text-slate-600">{rule.name}</span>
                  <span className="ml-2 text-[10px] text-slate-400">{fmtTrigger(rule.triggerType)} → {fmtAction(rule.actionType)}</span>
                </button>
                <ToggleSwitch
                  checked={!!rule.isActive}
                  onChange={() => handleToggle(rule)}
                  disabled={!!toggling[rule.id]}
                />
              </div>
            ))}
          </div>
        </DisabledSection>
      </div>

      <RuleDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        rule={editingRule}
        onSaved={handleSaved}
      />
    </div>
  );
}
