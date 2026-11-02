'use client';

import { useState } from 'react';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT } from '@/components/ui/tokens';
import TemplateTextarea from '@/components/salesAutomation/TemplateTextarea';

const EXECUTORS = [
  { v: 'EMAIL',          label: 'Email (send email)' },
  { v: 'TEXT',           label: 'Text (send SMS)' },
  { v: 'CALL',           label: 'Call (reminder/task)' },
  { v: 'SCHEDULE',       label: 'Schedule an event' },
  { v: 'EXPECT_INTRO',   label: 'Expect intro (wait + remind)' },
  { v: 'EXPECT_REPLY',   label: 'Expect a reply (watch email + remind)' },
  { v: 'EXPECT_FILES',   label: 'Expect drawings / files (watch email + remind)' },
  { v: 'EXPECT_INVITE',  label: 'Expect an invite (watch email + calendar + remind)' },
  { v: 'SEND_MATERIALS', label: 'Send materials (deck/DocSend)' },
  { v: 'ADD_TO_LIST',    label: 'Add to list' },
  { v: 'INTERNAL_TASK',  label: 'Internal task' },
  { v: 'INTEL',          label: 'Intel (fact, no action)' },
  { v: 'OTHER',          label: 'Other' },
];
const TEMPLATE_EXECUTORS = new Set(['EMAIL', 'TEXT', 'SEND_MATERIALS']);
// Waiting on them, the full 1st/2nd/3rd ladder is on Sales Automation → Reminder Timeline.
const WAIT_EXECUTORS = new Set(['EXPECT_INTRO', 'EXPECT_REPLY', 'EXPECT_FILES', 'EXPECT_INVITE']);

const blankType = () => ({
  key: '', label: '', executor: 'EMAIL', kind: 'ACTION',
  description: '', emailTemplate: '', instructions: '', reminderDays: '', sortOrder: 100, isActive: true,
  _new: true,
});

export default function NoteActionTypesEditor({ initialTypes }) {
  const [types, setTypes] = useState(() => initialTypes.map(t => ({ ...t, reminderDays: t.reminderDays ?? '' })));
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function startEdit(t) { setEditingKey(t.key); setDraft({ ...t }); setMsg(''); }
  function startAdd()   { setEditingKey('__new__'); setDraft(blankType()); setMsg(''); }
  function cancel()     { setEditingKey(null); setDraft(null); }

  async function save() {
    if (!draft.label.trim()) { setMsg('Label is required.'); return; }
    if (draft._new && !draft.key.trim()) { setMsg('Key is required for a new type.'); return; }
    setBusy(true); setMsg('');
    try {
      const method = draft._new ? 'POST' : 'PATCH';
      const res = await fetch('/api/crm/note-action-types', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: draft.key, label: draft.label, executor: draft.executor, kind: draft.kind,
          description: draft.description, emailTemplate: draft.emailTemplate,
          instructions: draft.instructions, reminderDays: draft.reminderDays,
          sortOrder: draft.sortOrder, isActive: draft.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || 'Save failed'); setBusy(false); return; }
      const saved = { ...data.type, reminderDays: data.type.reminderDays ?? '' };
      setTypes(prev => {
        const i = prev.findIndex(t => t.key === saved.key);
        const next = i >= 0 ? prev.map(t => (t.key === saved.key ? saved : t)) : [...prev, saved];
        return next.sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label));
      });
      cancel();
    } catch (e) { setMsg('Network error'); }
    setBusy(false);
  }

  async function toggleActive(t) {
    const res = await fetch('/api/crm/note-action-types', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: t.key, isActive: !t.isActive }),
    });
    if (res.ok) setTypes(prev => prev.map(x => (x.key === t.key ? { ...x, isActive: !t.isActive } : x)));
  }

  async function remove(t) {
    if (!confirm(`Delete the "${t.label}" type? Existing note actions that use it will keep their value but it won't appear in the dropdown.`)) return;
    const res = await fetch(`/api/crm/note-action-types?key=${encodeURIComponent(t.key)}`, { method: 'DELETE' });
    if (res.ok) setTypes(prev => prev.filter(x => x.key !== t.key));
  }

  const editing = editingKey != null;

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{types.length} types</p>
        <button onClick={startAdd} disabled={editing}
          className={BTN_PRIMARY}>
          + Add type
        </button>
      </div>

      {editing && (
        <TypeForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} busy={busy} msg={msg} />
      )}

      <div className="space-y-2">
        {types.map(t => (
          <div key={t.key}
            className={`border rounded-xl shadow-sm px-4 py-3 flex items-start gap-3 ${t.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-900">{t.label}</span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t.key}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">{t.executor}</span>
                {t.kind === 'INTEL' && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">INTEL</span>}
                {WAIT_EXECUTORS.has(t.executor) && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">
                    remind after {t.reminderDays || '—'}d
                  </span>
                )}
                {TEMPLATE_EXECUTORS.has(t.executor) && !t.emailTemplate && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">template blank</span>
                )}
              </div>
              {t.description && <p className="text-xs text-slate-500 mt-1">{t.description}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggleActive(t)} disabled={editing}
                className={`text-xs font-semibold px-2 py-1 rounded-lg border ${t.isActive ? 'border-green-200 text-green-700 bg-green-50' : 'border-slate-300 text-slate-500'}`}>
                {t.isActive ? 'Active' : 'Inactive'}
              </button>
              <button onClick={() => startEdit(t)} disabled={editing}
                className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">Edit</button>
              <button onClick={() => remove(t)} disabled={editing}
                className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {hint && <span className="text-xs text-slate-500 ml-1">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TypeForm({ draft, setDraft, onSave, onCancel, busy, msg }) {
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const showTemplate = TEMPLATE_EXECUTORS.has(draft.executor);
  const showReminder = WAIT_EXECUTORS.has(draft.executor);
  const input = INPUT;

  return (
    <div className="border border-slate-300 rounded-lg p-4 mb-4 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Label" hint="shown in the dropdown">
          <input className={input} value={draft.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Email" />
        </Field>
        <Field label="Key" hint={draft._new ? 'unique id, A to Z and _' : '(locked)'}>
          <input className={input} value={draft.key} disabled={!draft._new}
            onChange={e => set('key', e.target.value)} placeholder="EMAIL" />
        </Field>
        <Field label="Method / executor" hint="what the bot does">
          <select className={input} value={draft.executor} onChange={e => set('executor', e.target.value)}>
            {EXECUTORS.map(x => <option key={x.v} value={x.v}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Kind">
          <select className={input} value={draft.kind} onChange={e => set('kind', e.target.value)}>
            <option value="ACTION">Action (task)</option>
            <option value="INTEL">Intel (fact)</option>
          </select>
        </Field>
        <Field label="Sort order">
          <input type="number" className={input} value={draft.sortOrder} onChange={e => set('sortOrder', e.target.value)} />
        </Field>
        {showReminder && (
          <Field label="Default reminder (days)" hint="bot waits this long before reminding">
            <input type="number" min="0" className={input} value={draft.reminderDays}
              onChange={e => set('reminderDays', e.target.value)} placeholder="7" />
          </Field>
        )}
      </div>

      <div className="mt-3">
        <Field label="Description" hint="helps the AI classify lines into this type">
          <input className={input} value={draft.description || ''} onChange={e => set('description', e.target.value)} />
        </Field>
      </div>

      {showTemplate && (
        <div className="mt-3">
          <Field label="Message template" hint="blank email/text body the bot drafts. Add DocSend links etc.">
            <TemplateTextarea rows={5} className={input + ' font-mono'} value={draft.emailTemplate || ''}
              onChange={v => set('emailTemplate', v)}
              placeholder={"Hi {{firstName}},\n\n...\n\nMike"} />
          </Field>
        </div>
      )}

      <div className="mt-3">
        <Field label="Bot instructions" hint="how the bot should execute this action">
          <textarea rows={3} className={input} value={draft.instructions || ''}
            onChange={e => set('instructions', e.target.value)}
            placeholder="e.g. Draft an email to the contact and queue for Mike's review." />
        </Field>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={draft.isActive} onChange={e => set('isActive', e.target.checked)} />
          Active
        </label>
        <div className="flex-1" />
        {msg && <span className="text-xs text-red-600">{msg}</span>}
        <button onClick={onCancel} disabled={busy}
          className={BTN_SECONDARY}>Cancel</button>
        <button onClick={onSave} disabled={busy}
          className={BTN_PRIMARY}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
