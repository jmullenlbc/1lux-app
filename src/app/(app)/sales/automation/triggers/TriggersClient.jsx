'use client';
import { useState, useEffect, useCallback } from 'react';
import TemplateTextarea from '@/components/salesAutomation/TemplateTextarea';

const input = 'w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-800 bg-white outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400';
const btnPrimary = 'px-3 py-1.5 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40';
const btnGhost = 'px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50';

const emptyDraft = () => ({
  name: '', triggerType: 'NOTE_ACTION_CONFIRMED', match: 'all',
  conditions: [], actionType: 'NOTIFY', action: {}, isActive: true,
});

function ConditionRow({ fields, operators, cond, onChange, onRemove }) {
  const field = fields.find(f => f.key === cond.field) || fields[0];
  const ftype = field?.type;
  const ops = operators.filter(o => {
    if (ftype === 'bool') return ['is_true', 'is_false'].includes(o.key);
    if (ftype === 'number') return ['eq','neq','gt','gte','lt','lte','exists'].includes(o.key);
    return ['eq','neq','contains','exists'].includes(o.key);
  });
  const noValue = ['is_true','is_false','exists'].includes(cond.op);
  return (
    <div className="flex items-center gap-2">
      <select className={input + ' flex-1'} value={cond.field} onChange={e => onChange({ ...cond, field: e.target.value })}>
        {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <select className={input + ' w-28'} value={cond.op} onChange={e => onChange({ ...cond, op: e.target.value })}>
        {ops.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {!noValue && (
        field?.type === 'enum'
          ? <select className={input + ' flex-1'} value={cond.value || ''} onChange={e => onChange({ ...cond, value: e.target.value })}>
              <option value="">—</option>
              {field.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          : <input className={input + ' flex-1'} type={field?.type === 'number' ? 'number' : 'text'} value={cond.value || ''}
              onChange={e => onChange({ ...cond, value: e.target.value })} placeholder="value" />
      )}
      <button onClick={onRemove} className="text-slate-400 hover:text-rose-500 text-sm px-1" title="Remove">✕</button>
    </div>
  );
}

function ActionConfig({ actionType, action, setAction }) {
  const set = (k, v) => setAction({ ...action, [k]: v });
  if (actionType === 'DRAFT_EMAIL') return (
    <div className="space-y-2">
      <input className={input} placeholder="Subject (optional)" value={action.subject || ''} onChange={e => set('subject', e.target.value)} />
      <TemplateTextarea rows={4} className={input + ' font-mono'} placeholder={'Email body — type { for variables'} value={action.template || ''} onChange={v => set('template', v)} />
    </div>
  );
  if (actionType === 'NOTIFY') return (
    <input className={input} placeholder="Notification message" value={action.message || ''} onChange={e => set('message', e.target.value)} />
  );
  if (actionType === 'SCHEDULE_REMINDER') return (
    <div className="flex items-center gap-2"><span className="text-xs text-slate-500">Remind after</span>
      <input type="number" min="1" className={input + ' w-24'} value={action.days || ''} onChange={e => set('days', e.target.value)} placeholder="7" />
      <span className="text-xs text-slate-500">days</span></div>
  );
  if (actionType === 'ADD_TO_LIST') return (
    <input className={input} placeholder="List name (e.g. Golf league)" value={action.list || ''} onChange={e => set('list', e.target.value)} />
  );
  return <p className="text-xs text-slate-400">No extra configuration.</p>;
}

function ruleSummary(rule, triggers, actions) {
  const t = triggers.find(x => x.key === rule.triggerType);
  let conds = [];
  try { conds = JSON.parse(rule.triggerConfig || '{}').conditions?.rules || []; } catch {}
  const a = actions.find(x => x.key === rule.actionType);
  const fieldLabel = k => t?.fields.find(f => f.key === k)?.label || k;
  const condText = conds.length ? conds.map(c => `${fieldLabel(c.field)} ${c.op} ${c.value ?? ''}`).join(` ${'AND'} `) : 'always';
  return { when: t?.label || rule.triggerType, ifText: condText, then: a?.label || rule.actionType };
}

function TestPanel({ meta, onRan }) {
  const [triggerKey, setTriggerKey] = useState('NOTE_ACTION_CONFIRMED');
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const trigger = meta.triggers.find(t => t.key === triggerKey) || meta.triggers[0];

  function setVal(k, v) { setValues(s => ({ ...s, [k]: v })); }

  function buildPayload() {
    const p = {};
    for (const f of trigger.fields) {
      let v = values[f.key];
      if (v === undefined || v === '') continue;
      if (f.type === 'number') v = Number(v);
      if (f.type === 'bool') v = (v === 'true' || v === true);
      p[f.key] = v;
    }
    // NOTE_ACTION_CONFIRMED rules also key off typeLabel; mirror method if unset.
    if (triggerKey === 'NOTE_ACTION_CONFIRMED' && p.method && !p.typeLabel) p.typeLabel = p.method;
    return p;
  }

  async function run(real) {
    setBusy(true); setResult(null);
    try {
      const res = await fetch('/api/automation/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType: triggerKey, payload: buildPayload(), run: real }),
      });
      const d = await res.json();
      setResult(d.result || { error: d.error });
      if (real) onRan?.();
    } catch { setResult({ error: 'Network error' }); }
    setBusy(false);
  }

  return (
    <section>
      <h2 className="text-sm font-bold text-slate-900 mb-1">Test a trigger (no M365 needed)</h2>
      <p className="text-xs text-slate-500 mb-3">
        Simulate an event and see which of your rules would fire. <strong>Dry run</strong> changes nothing;
        <strong> Run for real</strong> actually fires (any drafts land in your Bot Queue). This is the same path
        Microsoft 365 sync will use once connected.
      </p>
      <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Trigger</label>
          <select className={input + ' mt-1'} value={triggerKey} onChange={e => { setTriggerKey(e.target.value); setValues({}); setResult(null); }}>
            {meta.triggers.map(t => <option key={t.key} value={t.key}>{t.label}{t.needsSync ? '  (via sync / this test)' : ''}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {trigger.fields.map(f => (
            <div key={f.key}>
              <label className="text-xs text-slate-500">{f.label}</label>
              {f.type === 'enum'
                ? <select className={input} value={values[f.key] || ''} onChange={e => setVal(f.key, e.target.value)}>
                    <option value="">—</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                : f.type === 'bool'
                ? <select className={input} value={values[f.key] || ''} onChange={e => setVal(f.key, e.target.value)}>
                    <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
                  </select>
                : <input className={input} type={f.type === 'number' ? 'number' : 'text'} value={values[f.key] || ''} onChange={e => setVal(f.key, e.target.value)} placeholder={f.label} />}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => run(false)} disabled={busy} className={btnGhost}>{busy ? '…' : 'Test (dry run)'}</button>
          <button onClick={() => run(true)} disabled={busy} className={btnPrimary}>Run for real</button>
        </div>

        {result && (
          <div className="mt-2 border-t border-slate-100 pt-3 text-sm">
            {result.error && <p className="text-rose-600 text-xs">{result.error}</p>}
            {result.dryRun && (
              <>
                {result.baseline && <p className="text-slate-600 text-xs mb-1">Baseline: {result.baseline.detail}</p>}
                {result.matched?.length ? (
                  <>
                    <p className="text-xs text-slate-500 mb-1">{result.matched.length} rule(s) would fire:</p>
                    <ul className="space-y-1">
                      {result.matched.map(m => (
                        <li key={m.ruleId} className="text-xs text-slate-700">✓ <span className="font-medium">{m.ruleName}</span> → {m.actionLabel}{!m.known && <span className="text-rose-500"> (unknown action)</span>}</li>
                      ))}
                    </ul>
                  </>
                ) : <p className="text-xs text-slate-400">No rules matched this event.</p>}
              </>
            )}
            {result.fired && (
              <p className="text-xs text-emerald-700">Fired {result.fired.length} rule action(s){result.baseline ? ' + baseline' : ''}. Check the Bot Queue for any drafts.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function TriggersClient() {
  const [meta, setMeta] = useState(null);
  const [rules, setRules] = useState([]);
  const [activity, setActivity] = useState({ recent: [], summary: [] });
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [m, r, a] = await Promise.all([
      fetch('/api/automation/rule-meta').then(x => x.json()).catch(() => null),
      fetch('/api/automation/bot-rules').then(x => x.json()).catch(() => ({ rules: [] })),
      fetch('/api/automation/activity').then(x => x.json()).catch(() => ({ recent: [], summary: [] })),
    ]);
    setMeta(m);
    const engineKeys = new Set((m?.triggers || []).map(t => t.key));
    setRules((r.rules || []).filter(x => engineKeys.has(x.triggerType)));
    setActivity(a);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!meta) return <p className="text-sm text-slate-400">Loading…</p>;

  const trigger = (draft && meta.triggers.find(t => t.key === draft.triggerType)) || meta.triggers[0];

  function startNew() { setDraft(emptyDraft()); setMsg(''); }
  function addCond() {
    const f = trigger.fields[0];
    setDraft(d => ({ ...d, conditions: [...d.conditions, { field: f.key, op: f.type === 'bool' ? 'is_true' : (f.type === 'number' ? 'gte' : 'eq'), value: '' }] }));
  }

  async function save() {
    if (!draft.name.trim()) { setMsg('Give the rule a name.'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/automation/bot-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name, triggerType: draft.triggerType, actionType: draft.actionType,
          isActive: draft.isActive,
          triggerConfig: { conditions: { match: draft.match, rules: draft.conditions } },
          actionConfig: draft.action,
        }),
      });
      if (!res.ok) { setMsg((await res.json()).error || 'Save failed'); setBusy(false); return; }
      setDraft(null);
      await load();
    } catch { setMsg('Network error'); }
    setBusy(false);
  }

  async function toggle(rule) {
    await fetch(`/api/automation/bot-rules/${rule.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !rule.isActive }) }).catch(() => {});
    load();
  }
  async function remove(rule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await fetch(`/api/automation/bot-rules/${rule.id}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  return (
    <div className="space-y-8">
      {/* Builder */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Your rules</h2>
          {!draft && <button onClick={startNew} className={btnPrimary}>+ New rule</button>}
        </div>

        {draft && (
          <div className="border border-slate-300 rounded-xl p-4 bg-slate-50 mb-4 space-y-4">
            <input className={input} placeholder="Rule name — e.g. “Notify me on Brinkmann emails”" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />

            {/* WHEN */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-orange-600">When</label>
              <select className={input + ' mt-1'} value={draft.triggerType}
                onChange={e => setDraft({ ...draft, triggerType: e.target.value, conditions: [] })}>
                {meta.triggers.map(t => <option key={t.key} value={t.key} disabled={!t.live}>{t.label}{t.live ? '' : '  (connects when sync is live)'}</option>)}
              </select>
            </div>

            {/* IF */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wide text-orange-600">If</label>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  match
                  <select className="border border-slate-200 rounded px-1.5 py-0.5" value={draft.match} onChange={e => setDraft({ ...draft, match: e.target.value })}>
                    <option value="all">all</option><option value="any">any</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2 mt-1">
                {draft.conditions.length === 0 && <p className="text-xs text-slate-400">No conditions — fires every time.</p>}
                {draft.conditions.map((c, i) => (
                  <ConditionRow key={i} fields={trigger.fields} operators={meta.operators} cond={c}
                    onChange={nc => setDraft(d => ({ ...d, conditions: d.conditions.map((x, j) => j === i ? nc : x) }))}
                    onRemove={() => setDraft(d => ({ ...d, conditions: d.conditions.filter((_, j) => j !== i) }))} />
                ))}
                <button onClick={addCond} className="text-xs text-orange-600 hover:text-orange-700 font-medium">+ Add condition</button>
              </div>
            </div>

            {/* THEN */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-orange-600">Then</label>
              <select className={input + ' mt-1'} value={draft.actionType} onChange={e => setDraft({ ...draft, actionType: e.target.value, action: {} })}>
                {meta.actions.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
              <div className="mt-2"><ActionConfig actionType={draft.actionType} action={draft.action} setAction={a => setDraft({ ...draft, action: a })} /></div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
              <div className="flex-1" />
              {msg && <span className="text-xs text-rose-600">{msg}</span>}
              <button onClick={() => setDraft(null)} className={btnGhost}>Cancel</button>
              <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save rule'}</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {rules.length === 0 && !draft && <p className="text-sm text-slate-400">No rules yet. The bot still runs each method&rsquo;s baseline action — add a rule to layer on more.</p>}
          {rules.map(rule => {
            const s = ruleSummary(rule, meta.triggers, meta.actions);
            return (
              <div key={rule.id} className={`border rounded-lg px-4 py-3 flex items-start gap-3 ${rule.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-sm">{rule.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    <span className="text-orange-600 font-medium">When</span> {s.when} · <span className="text-orange-600 font-medium">If</span> {s.ifText} · <span className="text-orange-600 font-medium">Then</span> {s.then}
                  </div>
                </div>
                <button onClick={() => toggle(rule)} className={`text-xs px-2 py-1 rounded border ${rule.isActive ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-slate-200 text-slate-400'}`}>{rule.isActive ? 'Active' : 'Off'}</button>
                <button onClick={() => remove(rule)} className="text-xs px-2 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50">Delete</button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Test harness */}
      <TestPanel meta={meta} onRan={load} />

      {/* Learning / review */}
      <section>
        <h2 className="text-sm font-bold text-slate-900 mb-1">How your rules are doing</h2>
        <p className="text-xs text-slate-500 mb-3">The bot learns from what you keep, edit, or reject. Rules with high reject rates are good candidates to tune or turn off.</p>
        {activity.summary.length === 0 ? (
          <p className="text-sm text-slate-400">No automation activity yet.</p>
        ) : (
          <div className="overflow-hidden border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr><th className="text-left px-3 py-2 font-medium">Rule</th><th className="px-3 py-2 font-medium">Fired</th><th className="px-3 py-2 font-medium">Accepted</th><th className="px-3 py-2 font-medium">Edited</th><th className="px-3 py-2 font-medium">Rejected</th><th className="px-3 py-2 font-medium">Pending</th></tr>
              </thead>
              <tbody>
                {activity.summary.map((s, i) => (
                  <tr key={s.ruleId || `b${i}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{s.ruleName}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{s.fired}</td>
                    <td className="px-3 py-2 text-center text-emerald-600">{s.accepted}</td>
                    <td className="px-3 py-2 text-center text-amber-600">{s.edited}</td>
                    <td className="px-3 py-2 text-center text-rose-600">{s.rejected}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{s.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
