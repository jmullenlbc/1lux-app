'use client';
import { useState, useEffect, useCallback } from 'react';
import { NOTIFICATION_TYPES, NOTIFICATION_MODULES } from '@/lib/notify';
import NotificationLog from './NotificationLog';

const PATTERN_BADGE = {
  EVENT:     { label: 'Immediate',   cls: 'bg-green-50 text-green-700 border-green-200' },
  DIGEST:    { label: 'Wed Digest',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  THRESHOLD: { label: 'Threshold',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const ROADMAP_TYPES = new Set([
  'EMAIL_FLAGGED', 'SHIP_LEAD_CONFLICT', 'SHIP_ESD_CONFLICT', 'RFI_ALL', 'REPLACEMENT_REQUEST',
]);

function PatternBadge({ pattern }) {
  const b = PATTERN_BADGE[pattern] || PATTERN_BADGE.EVENT;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${b.cls}`}>
      {b.label}
    </span>
  );
}

function NotificationRow({ notificationType, config, onChange }) {
  const meta     = NOTIFICATION_TYPES[notificationType];
  const isRoadmap= ROADMAP_TYPES.has(notificationType);
  const enabled  = config?.enabled ?? true;
  const emails   = config?.externalEmails ?? '';
  const [emailDraft, setEmailDraft] = useState(emails);
  const [saving,     setSaving]     = useState(false);

  // Sync draft when config loads
  useEffect(() => { setEmailDraft(config?.externalEmails ?? ''); }, [config?.externalEmails]);

  async function toggle() {
    setSaving(true);
    await onChange(notificationType, { enabled: !enabled, externalEmails: emailDraft });
    setSaving(false);
  }

  async function saveEmails() {
    if (emailDraft === (config?.externalEmails ?? '')) return;
    setSaving(true);
    await onChange(notificationType, { enabled, externalEmails: emailDraft });
    setSaving(false);
  }

  if (isRoadmap) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 opacity-40">
        <div className="w-9 h-5 rounded-full bg-slate-200 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-400">{meta?.label || notificationType}</p>
        </div>
        <PatternBadge pattern={meta?.pattern || 'EVENT'} />
        <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 rounded border border-slate-200">Roadmap</span>
      </div>
    );
  }

  return (
    <div className={`px-4 py-3 border-b border-slate-50 last:border-0 ${saving ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        {/* Toggle */}
        <button
          onClick={toggle}
          disabled={saving}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 ${enabled ? 'bg-amber-500' : 'bg-slate-200'}`}
          aria-label={enabled ? 'Disable notification' : 'Enable notification'}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
        </button>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${enabled ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
            {meta?.label || notificationType}
          </p>
          {meta?.external && enabled && (
            <p className="text-xs text-slate-400 mt-0.5">External recipients below</p>
          )}
        </div>

        <PatternBadge pattern={meta?.pattern || 'EVENT'} />

        {/* INT / EXT indicators */}
        <div className="flex gap-1 shrink-0">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-mono">INT</span>
          {meta?.external && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">EXT</span>}
        </div>
      </div>

      {/* Email field — only for external types that are enabled */}
      {meta?.external && enabled && (
        <div className="mt-2 ml-12">
          <div className="flex gap-2">
            <input
              value={emailDraft}
              onChange={e => setEmailDraft(e.target.value)}
              onBlur={saveEmails}
              onKeyDown={e => e.key === 'Enter' && saveEmails()}
              placeholder="contractor@example.com, gc@example.com"
              className="flex-1 text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white placeholder:text-slate-300"
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Comma-separated · saved on blur or Enter</p>
        </div>
      )}
    </div>
  );
}

function ModuleSection({ module, keys, configs, onChange }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-slate-700">{module}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{keys.length} notification{keys.length !== 1 ? 's' : ''}</span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {!collapsed && (
        <div>
          {keys.map(key => (
            <NotificationRow
              key={key}
              notificationType={key}
              config={configs[key]}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function NotificationSettingsTab({ projectId }) {
  const [view,     setView]     = useState('settings'); // 'settings' | 'log'
  const [configs,  setConfigs]  = useState({});
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/projects/${projectId}/notifications`);
      const data = await res.json();
      setConfigs(data.configs || {});
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleChange(notificationType, updates) {
    const res = await fetch(`/api/projects/${projectId}/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationType, ...updates }),
    });
    if (res.ok) {
      const { config } = await res.json();
      setConfigs(prev => ({
        ...prev,
        [notificationType]: { enabled: config.enabled, externalEmails: config.externalEmails },
      }));
    }
  }

  return (
    <div>
      {/* Header + view toggle */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Notifications</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {view === 'settings'
              ? 'Configure who receives external email notifications for each event type.'
              : 'Audit trail of all notifications triggered for this project.'}
          </p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
          {[['settings', 'Settings'], ['log', 'Activity Log']].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setView(val)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === val ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Activity log view */}
      {view === 'log' && <NotificationLog projectId={projectId} />}

      {/* Settings view */}
      {view === 'settings' && <div className="space-y-0">

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-5 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <PatternBadge pattern="EVENT" /> Sends immediately when event occurs
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <PatternBadge pattern="DIGEST" /> Batched into Wednesday digest email
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <PatternBadge pattern="THRESHOLD" /> Checked by daily cron job
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-mono">INT</span> ILC internal
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">EXT</span> External recipients
        </div>
      </div>

      {/* Dry-run warning */}
      <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
        <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-xs text-amber-800">
          <strong>Email sending is in dry-run mode.</strong> Notifications are logged and tracked,
          but no emails are sent until Microsoft Outlook is connected. Configure recipients now
          so the system is ready when Outlook goes live.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-slate-400">Loading…</div>
      ) : (
        <div>
          {NOTIFICATION_MODULES.map(({ module, keys }) => (
            <ModuleSection
              key={module}
              module={module}
              keys={keys}
              configs={configs}
              onChange={handleChange}
            />
          ))}
        </div>
      )}
      </div>}
    </div>
  );
}
