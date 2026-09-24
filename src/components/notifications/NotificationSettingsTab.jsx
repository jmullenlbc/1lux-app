'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { NOTIFICATION_TYPES, NOTIFICATION_MODULES } from '@/lib/notificationTypes';
import NotificationLog from './NotificationLog';

// ── Pattern badge metadata — plain English ────────────────────────────────────
const PATTERN_META = {
  EVENT: {
    label: 'Immediate',
    description: 'Fires the moment it happens — no waiting',
    cls: 'bg-green-50 text-green-700 border-green-200',
  },
  DIGEST: {
    label: 'Weekly Digest',
    description: 'Batched with other updates into one email every Wednesday — less inbox noise',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  THRESHOLD: {
    label: 'Condition-Based',
    description: 'Only sends when a specific condition is met (e.g. ESD within 2 weeks)',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

function PatternBadge({ pattern, showTip = false }) {
  const m = PATTERN_META[pattern] || PATTERN_META.EVENT;
  const [tip, setTip] = useState(false);
  return (
    <div className="relative inline-flex">
      <span
        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border cursor-default ${m.cls}`}
        onMouseEnter={() => showTip && setTip(true)}
        onMouseLeave={() => setTip(false)}
      >
        {m.label}
      </span>
      {showTip && tip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 bg-slate-800 text-white text-[11px] rounded-lg px-3 py-2 z-50 shadow-xl">
          {m.description}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}

// ── Contact chip picker ───────────────────────────────────────────────────────
function ContactPicker({ available, onAdd }) {
  const [open, setOpen] = useState(false);
  const [q,    setQ]    = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(''); } }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (available.length === 0) return null;

  const filtered = available.filter(c =>
    (c.name || '').toLowerCase().includes(q.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setOpen(o => !o); setQ(''); }}
        className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded-full border border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-colors">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add contact
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search contacts…"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              onKeyDown={e => e.key === 'Escape' && setOpen(false)}
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length > 0 ? filtered.map(c => (
              <button key={c.id} onClick={() => { onAdd(c); setOpen(false); setQ(''); }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                <p className="text-xs font-medium text-slate-800">{c.name}</p>
                {c.email && <p className="text-[10px] text-slate-400">{c.email}</p>}
              </button>
            )) : (
              <p className="px-3 py-3 text-xs text-slate-400 italic text-center">
                {available.length === 0 ? 'All contacts subscribed' : 'No match'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notification row ──────────────────────────────────────────────────────────
const ROADMAP_TYPES = new Set(['EMAIL_FLAGGED', 'SHIP_LEAD_CONFLICT', 'SHIP_ESD_CONFLICT', 'RFI_ALL', 'REPLACEMENT_REQUEST']);

function NotificationRow({ notificationType, config, allContacts, onChange }) {
  const meta      = NOTIFICATION_TYPES[notificationType];
  const isRoadmap = ROADMAP_TYPES.has(notificationType);
  const [saving,  setSaving] = useState(false);

  const enabled          = config?.enabled ?? true;
  const rawEmails        = config?.externalEmails || '';
  const subscribedEmails = rawEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const subscribedContacts = allContacts.filter(c => c.email && subscribedEmails.includes(c.email.toLowerCase()));
  const availableContacts  = allContacts.filter(c => c.email && !subscribedEmails.includes(c.email.toLowerCase()));

  async function save(updates) {
    setSaving(true);
    await onChange(notificationType, updates);
    setSaving(false);
  }

  async function toggleGlobal() {
    await save({ enabled: !enabled, externalEmails: rawEmails });
  }

  async function addContact(contact) {
    const emails = [...new Set([...subscribedEmails, contact.email.toLowerCase()])].join(', ');
    await save({ enabled, externalEmails: emails });
  }

  async function removeContact(email) {
    const emails = subscribedEmails.filter(e => e !== email.toLowerCase()).join(', ');
    await save({ enabled, externalEmails: emails });
  }

  async function toggleContact(contact) {
    const email = contact.email.toLowerCase();
    if (subscribedEmails.includes(email)) {
      await removeContact(email);
    } else {
      await addContact(contact);
    }
  }

  if (isRoadmap) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 opacity-40">
        <div className="w-9 h-5 rounded-full bg-slate-200 shrink-0" />
        <p className="text-sm text-slate-400 flex-1">{meta?.label || notificationType}</p>
        <PatternBadge pattern={meta?.pattern || 'EVENT'} />
        <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 rounded border border-slate-200">Coming soon</span>
      </div>
    );
  }

  return (
    <div className={`px-4 py-3.5 border-b border-slate-50 last:border-0 transition-opacity ${saving ? 'opacity-60' : ''}`}>
      {/* Header row: global toggle + label + pattern badge */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleGlobal}
          disabled={saving}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 ${enabled ? 'bg-amber-500' : 'bg-slate-200'}`}
          title={enabled ? 'Disable for all contacts' : 'Enable for contacts'}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
        </button>
        <p className={`text-sm flex-1 ${enabled ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
          {meta?.label || notificationType}
        </p>
        <PatternBadge pattern={meta?.pattern || 'EVENT'} showTip />
      </div>

      {/* Contacts row — only when globally enabled */}
      {meta?.external && enabled && (
        <div className="mt-2.5 ml-12">
          <div className="flex flex-wrap gap-1.5 items-center">
            {allContacts.length === 0 ? (
              <p className="text-[11px] text-slate-300 italic">Add contacts in the section above to subscribe them</p>
            ) : (
              <>
                {/* All contacts shown — subscribed ones highlighted */}
                {allContacts.map(c => {
                  const subscribed = c.email && subscribedEmails.includes(c.email.toLowerCase());
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleContact(c)}
                      disabled={saving || !c.email}
                      title={c.email ? (subscribed ? `Remove ${c.name}` : `Subscribe ${c.name}`) : 'No email set for this contact'}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        subscribed
                          ? 'bg-blue-600 text-white border-blue-600'
                          : c.email
                            ? 'bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-600'
                            : 'bg-white text-slate-300 border-slate-100 cursor-not-allowed'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${subscribed ? 'bg-white' : c.email ? 'bg-slate-300' : 'bg-slate-200'}`} />
                      {c.name}
                      {subscribed && (
                        <svg className="w-2.5 h-2.5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
                {subscribedContacts.length === 0 && (
                  <p className="text-[11px] text-slate-300 italic ml-1">Click a contact to subscribe them</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Module section ────────────────────────────────────────────────────────────
function ModuleSection({ module, keys, configs, allContacts, onChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const activeCount = keys.filter(k => configs[k]?.enabled).length;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden mb-3">
      <button onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">{module}</span>
          {activeCount > 0 && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              {activeCount} active
            </span>
          )}
        </div>
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
              allContacts={allContacts}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const EXTERNAL_MODULES = NOTIFICATION_MODULES
  .map(m => ({ ...m, keys: m.keys.filter(k => NOTIFICATION_TYPES[k]?.external === true) }))
  .filter(m => m.keys.length > 0);

export default function NotificationSettingsTab({ projectId }) {
  const [view,     setView]     = useState('settings');
  const [configs,  setConfigs]  = useState({});
  const [contacts, setContacts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [dismissedDryRun, setDismissedDryRun] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cfgRes, ctxRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/notifications`),
        fetch(`/api/projects/${projectId}/contacts`),
      ]);
      const [cfg, ctx] = await Promise.all([cfgRes.json(), ctxRes.json()]);
      setConfigs(cfg.configs || {});
      // contacts endpoint returns array or { contacts: [...] }
      setContacts(Array.isArray(ctx) ? ctx : (ctx.contacts || []));
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
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">External Notifications</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {view === 'settings'
              ? 'Choose which project contacts get notified for each event. Toggle a contact to subscribe or unsubscribe them.'
              : 'Audit trail of all notifications triggered for this project.'}
          </p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
          {[['settings', 'Settings'], ['log', 'Activity Log']].map(([val, lbl]) => (
            <button key={val} onClick={() => setView(val)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === val ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {view === 'log' && <NotificationLog projectId={projectId} />}

      {view === 'settings' && (
        <div className="space-y-0">

          {/* Legend — plain English */}
          <div className="flex flex-col gap-2 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">How notifications are sent</p>
            {Object.entries(PATTERN_META).map(([key, m]) => (
              <div key={key} className="flex items-start gap-2.5">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border shrink-0 mt-0.5 ${m.cls}`}>
                  {m.label}
                </span>
                <span className="text-xs text-slate-500">{m.description}</span>
              </div>
            ))}
          </div>

          {/* Dry-run warning */}
          {!dismissedDryRun && (
            <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-amber-800 flex-1">
                <strong>Email is in dry-run mode.</strong> Everything is tracked and logged, but no emails are actually sent until Microsoft Outlook is connected. Set up your contacts now — they'll be ready to go when email goes live.
              </p>
              <button
                onClick={() => setDismissedDryRun(true)}
                className="p-1 text-amber-500 hover:text-amber-600 shrink-0"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* No contacts hint */}
          {!loading && contacts.length === 0 && (
            <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
              <strong>No project contacts yet.</strong> Add contacts using the "+ Add Project Contacts" button above — then come back here to subscribe them to notifications.
            </div>
          )}

          {/* Contact quick-view: who gets what */}
          {!loading && contacts.length > 0 && (() => {
            const allKeys = EXTERNAL_MODULES.flatMap(m => m.keys).filter(k => !ROADMAP_TYPES.has(k));
            return (
              <div className="mb-5 border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <p className="text-sm font-semibold text-slate-700">Contact Overview</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">How many notifications each contact is subscribed to</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {contacts.map(c => {
                    const email = c.email?.toLowerCase() || '';
                    const count = !email ? 0 : allKeys.filter(k => {
                      const emails = (configs[k]?.externalEmails || '').split(',').map(e => e.trim().toLowerCase());
                      return configs[k]?.enabled && emails.includes(email);
                    }).length;
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-[11px] font-bold text-slate-500">
                          {(c.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">{c.name}</p>
                          {c.email ? <p className="text-[10px] text-slate-400 truncate">{c.email}</p> : <p className="text-[10px] text-red-400 italic">No email — can't receive notifications</p>}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${count > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                          {count} notification{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {loading ? (
            <div className="text-center py-10 text-sm text-slate-400">Loading…</div>
          ) : (
            <div>
              {EXTERNAL_MODULES.map(({ module, keys }) => (
                <ModuleSection
                  key={module}
                  module={module}
                  keys={keys}
                  configs={configs}
                  allContacts={contacts.filter(c => c.email)}
                  onChange={handleChange}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
