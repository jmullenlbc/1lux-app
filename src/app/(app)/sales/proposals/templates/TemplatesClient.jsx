'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROPOSAL_TYPES = [
  { value: 'FULL_DESIGN',   label: 'Full Design' },
  { value: 'DESIGN_ASSIST', label: 'Design Assist' },
  { value: 'PEER_REVIEW',   label: 'Peer Review' },
  // SCOPE_LETTER retired 2026-09-18 (Maram 9-17); an old template of that type
  // still shows its raw type below, it just cannot be created.
];

const MERGE_TOKENS = [
  { token: '{clientName}',      label: 'Client Name' },
  { token: '{clientLegalName}', label: 'Client Legal Name' },
  { token: '{projectName}',     label: 'Project Name' },
  { token: '{location}',        label: 'Location' },
  { token: '{effectiveDate}',   label: 'Effective Date' },
  { token: '{fee}',             label: 'Fee Amount' },
  { token: '{ilcSigner}',       label: 'ILC Signer' },
];

const DEFAULT_TASKS = [
  { area: 'Schematic Design',     task: 'Design Concept Development',  srHours: 8,  designerHours: 16, salesHours: 2, outsourceHours: 0 },
  { area: 'Schematic Design',     task: 'Fixture Type Selection',       srHours: 4,  designerHours: 12, salesHours: 0, outsourceHours: 0 },
  { area: 'Design Development',   task: 'Fixture Schedule Development', srHours: 6,  designerHours: 20, salesHours: 0, outsourceHours: 0 },
  { area: 'Design Development',   task: 'Design Documentation',         srHours: 4,  designerHours: 16, salesHours: 0, outsourceHours: 0 },
  { area: 'Construction Docs',    task: 'Lighting Plans & Details',     srHours: 8,  designerHours: 24, salesHours: 0, outsourceHours: 8  },
  { area: 'Construction Admin',   task: 'Submittal Review',             srHours: 4,  designerHours: 8,  salesHours: 0, outsourceHours: 0 },
  { area: 'Construction Admin',   task: 'RFI Responses',                srHours: 2,  designerHours: 4,  salesHours: 0, outsourceHours: 0 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Rich Text Toolbar ─────────────────────────────────────────────────────────

function RichToolbar({ editorRef, onInsertToken }) {
  function cmd(command, value) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  return (
    <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-slate-200 bg-slate-50 rounded-t-lg">
      <button title="Bold"      onMouseDown={e => { e.preventDefault(); cmd('bold'); }}
        className="px-2 py-1 rounded text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors">B</button>
      <button title="Italic"    onMouseDown={e => { e.preventDefault(); cmd('italic'); }}
        className="px-2 py-1 rounded text-sm italic text-slate-500 hover:bg-slate-200 transition-colors">I</button>
      <button title="Underline" onMouseDown={e => { e.preventDefault(); cmd('underline'); }}
        className="px-2 py-1 rounded text-sm underline text-slate-500 hover:bg-slate-200 transition-colors">U</button>
      <div className="w-px h-4 bg-slate-300 mx-1" />
      <button title="H1" onMouseDown={e => { e.preventDefault(); cmd('formatBlock', 'h1'); }}
        className="px-2 py-1 rounded text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors">H1</button>
      <button title="H2" onMouseDown={e => { e.preventDefault(); cmd('formatBlock', 'h2'); }}
        className="px-2 py-1 rounded text-sm font-semibold text-slate-500 hover:bg-slate-200 transition-colors">H2</button>
      <button title="Paragraph" onMouseDown={e => { e.preventDefault(); cmd('formatBlock', 'p'); }}
        className="px-2 py-1 rounded text-sm text-slate-500 hover:bg-slate-200 transition-colors">¶</button>
      <div className="w-px h-4 bg-slate-300 mx-1" />
      <button title="Bullet list" onMouseDown={e => { e.preventDefault(); cmd('insertUnorderedList'); }}
        className="px-2 py-1 rounded text-sm text-slate-500 hover:bg-slate-200 transition-colors">• List</button>
      <button title="Numbered list" onMouseDown={e => { e.preventDefault(); cmd('insertOrderedList'); }}
        className="px-2 py-1 rounded text-sm text-slate-500 hover:bg-slate-200 transition-colors">1. List</button>
      <div className="w-px h-4 bg-slate-300 mx-1" />
      {/* Merge tokens */}
      <div className="relative group">
        <button className="px-2 py-1 rounded text-[11px] font-mono text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors border border-violet-200">
          {'{…}'}
        </button>
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 hidden group-hover:block min-w-[160px]">
          {MERGE_TOKENS.map(t => (
            <button key={t.token} onMouseDown={e => { e.preventDefault(); onInsertToken(t.token); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-4">
              <span className="text-slate-700">{t.label}</span>
              <span className="text-[10px] font-mono text-violet-500">{t.token}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Task Table ────────────────────────────────────────────────────────────────

const TASK_COLS = [
  { key: 'area',           label: 'Area',       numeric: false, field: 'area' },
  { key: 'task',           label: 'Task',       numeric: false, field: 'task' },
  { key: 'srHours',        label: 'Sr Designer', numeric: true, field: 'srHours' },
  { key: 'designerHours',  label: 'Designer',   numeric: true, field: 'designerHours' },
  { key: 'salesHours',     label: 'Sales',      numeric: true, field: 'salesHours' },
  { key: 'outsourceHours', label: 'Outsource',  numeric: true, field: 'outsourceHours' },
];
const HOUR_FIELDS = ['srHours', 'designerHours', 'salesHours', 'outsourceHours'];

function TaskSortIcon({ active, dir }) {
  if (!active) return <span className="ml-0.5 text-slate-300 text-[9px]">⇅</span>;
  return <span className="ml-0.5 text-orange-500 text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>;
}

function TaskTable({ tasks, onChange }) {
  const [sortKey, setSortKey] = useState('area');
  const [sortDir, setSortDir] = useState('asc');

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(TASK_COLS.find(c => c.key === key)?.numeric ? 'desc' : 'asc'); }
  }

  // Use stable _key for identity; canonical order is `tasks` prop
  const keyed = useMemo(() =>
    tasks.map((t, i) => ({ ...t, _key: t._id || t.id || `t${i}` })),
  [tasks]);

  const sorted = useMemo(() => {
    return [...keyed].sort((a, b) => {
      const av = a[sortKey] ?? (TASK_COLS.find(c => c.key === sortKey)?.numeric ? 0 : '');
      const bv = b[sortKey] ?? (TASK_COLS.find(c => c.key === sortKey)?.numeric ? 0 : '');
      if (typeof av === 'string') {
        const cmp = av.toLowerCase().localeCompare(bv.toString().toLowerCase());
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [keyed, sortKey, sortDir]);

  function updateTask(key, field, val) {
    onChange(tasks.map((t, i) => {
      const k = t._id || t.id || `t${i}`;
      return k === key ? { ...t, [field]: val } : t;
    }));
  }
  function removeTask(key) {
    onChange(tasks.filter((t, i) => (t._id || t.id || `t${i}`) !== key));
  }
  function addTask() {
    onChange([...tasks, { _id: uid(), area: '', task: '', srHours: 0, designerHours: 0, salesHours: 0, outsourceHours: 0, sortOrder: tasks.length }]);
  }

  // Grand totals
  const grandTotals = useMemo(() =>
    HOUR_FIELDS.reduce((acc, f) => ({ ...acc, [f]: tasks.reduce((s, t) => s + (t[f] || 0), 0) }), {}),
  [tasks]);

  // Build display rows with per-area subtotals after each contiguous group
  const displayRows = useMemo(() => {
    const rows = [];
    let group = [], prevArea = null;
    function pushSub(area, items) {
      const sub = HOUR_FIELDS.reduce((acc, f) => ({ ...acc, [f]: items.reduce((s, t) => s + (t[f] || 0), 0) }), {});
      rows.push({ type: 'subtotal', area, sub });
    }
    for (const t of sorted) {
      if (t.area !== prevArea && prevArea !== null) { pushSub(prevArea, group); group = []; }
      rows.push({ type: 'row', task: t });
      group.push(t);
      prevArea = t.area;
    }
    if (group.length > 0) pushSub(prevArea, group);
    return rows;
  }, [sorted]);

  const fmt = v => v % 1 === 0 ? v : v.toFixed(1);
  const inputCls = 'w-full text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-orange-300 rounded px-1 py-0.5';
  const numCls   = 'w-14 text-xs text-right bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-orange-300 rounded px-1 py-0.5';
  const thCls    = 'px-2 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide cursor-pointer select-none hover:text-slate-600 hover:bg-slate-100 transition-colors';

  return (
    <div className="space-y-3">
      {/* Grand total summary */}
      <div className="grid grid-cols-4 gap-2">
        {HOUR_FIELDS.map(f => {
          const label = TASK_COLS.find(c => c.field === f)?.label || f;
          return (
            <div key={f} className="bg-white border border-slate-200 rounded-xl px-3 py-2">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                {fmt(grandTotals[f])} <span className="text-[10px] font-normal text-slate-400">hrs</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className={`${thCls} text-left w-32`} onClick={() => handleSort('area')}>
                Area <TaskSortIcon active={sortKey === 'area'} dir={sortDir} />
              </th>
              <th className={`${thCls} text-left`} onClick={() => handleSort('task')}>
                Task <TaskSortIcon active={sortKey === 'task'} dir={sortDir} />
              </th>
              {HOUR_FIELDS.map(f => (
                <th key={f} className={`${thCls} text-right`} onClick={() => handleSort(f)}>
                  {TASK_COLS.find(c => c.field === f)?.label} <TaskSortIcon active={sortKey === f} dir={sortDir} />
                </th>
              ))}
              <th className="w-7" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayRows.map((row, ri) => {
              if (row.type === 'subtotal') {
                return (
                  <tr key={`sub-${ri}`} className="bg-slate-50 border-t border-slate-200">
                    <td className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide" colSpan={2}>
                      {row.area || '(no area)'} — subtotal
                    </td>
                    {HOUR_FIELDS.map(f => (
                      <td key={f} className="px-2 py-1.5 text-right text-[11px] font-semibold text-slate-600">
                        {fmt(row.sub[f])}
                      </td>
                    ))}
                    <td />
                  </tr>
                );
              }
              const t = row.task;
              return (
                <tr key={t._key} className="hover:bg-slate-50 group">
                  <td className="px-2 py-1.5">
                    <input value={t.area} onChange={e => updateTask(t._key, 'area', e.target.value)}
                      className={inputCls} placeholder="Area…" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={t.task} onChange={e => updateTask(t._key, 'task', e.target.value)}
                      className={inputCls} placeholder="Task description…" />
                  </td>
                  {HOUR_FIELDS.map(f => (
                    <td key={f} className="px-2 py-1.5">
                      <input type="number" min="0" step="0.5" value={t[f]}
                        onChange={e => updateTask(t._key, f, parseFloat(e.target.value) || 0)}
                        className={numCls} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => removeTask(t._key)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
              <td colSpan={2} className="px-3 py-2 text-xs text-slate-600">Grand Total</td>
              {HOUR_FIELDS.map(f => (
                <td key={f} className="px-2 py-2 text-right text-xs text-slate-700">{fmt(grandTotals[f])}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button onClick={addTask}
        className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add task
      </button>
    </div>
  );
}

// ── Template Editor Panel ─────────────────────────────────────────────────────

function TemplateEditor({ template, onSaved, onDeleted }) {
  const [activeTab, setActiveTab] = useState('document');
  const [form, setForm] = useState({
    name:            template?.name            || '',
    type:            template?.type            || 'FULL_DESIGN',
    isDefault:       template?.isDefault       || false,
    defaultAdderPct: template?.defaultAdderPct ?? 10,
    docBody:         template?.docBody         || '',
    milestoneSplit:  (() => {
      try { return template?.milestoneSplit ? JSON.parse(template.milestoneSplit) : []; }
      catch { return []; }
    })(),
    exclusions: template?.exclusions || '',
    tasks: (template?.tasks || []).map((t, i) => ({ ...t, _id: t.id || uid() })),
  });
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');
  const [savedOk, setSavedOk]   = useState(false);
  const editorRef               = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Sync docBody from contentEditable on blur
  function handleEditorBlur() {
    set('docBody', editorRef.current?.innerHTML || '');
  }

  function insertToken(token) {
    editorRef.current?.focus();
    document.execCommand('insertText', false, token);
  }

  // Init editor content when template changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = template?.docBody || '';
    }
  }, [template?.id]);

  function addMilestone() {
    set('milestoneSplit', [...form.milestoneSplit, { label: '', pct: 0 }]);
  }
  function updateMilestone(idx, field, val) {
    const next = form.milestoneSplit.map((m, i) => i === idx ? { ...m, [field]: val } : m);
    set('milestoneSplit', next);
  }
  function removeMilestone(idx) {
    set('milestoneSplit', form.milestoneSplit.filter((_, i) => i !== idx));
  }
  const milestoneTotal = form.milestoneSplit.reduce((s, m) => s + (parseFloat(m.pct) || 0), 0);

  async function save() {
    if (!form.name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr('');
    try {
      const body = {
        name:            form.name.trim(),
        type:            form.type,
        isDefault:       form.isDefault,
        defaultAdderPct: Number(form.defaultAdderPct) || 10,
        docBody:         editorRef.current?.innerHTML || form.docBody,
        milestoneSplit:  form.milestoneSplit.length ? JSON.stringify(form.milestoneSplit) : null,
        exclusions:      form.exclusions || null,
        tasks:           form.tasks.map((t, idx) => ({
          area: t.area, task: t.task, sortOrder: idx,
          srHours: t.srHours || 0, designerHours: t.designerHours || 0,
          salesHours: t.salesHours || 0, outsourceHours: t.outsourceHours || 0,
        })),
      };
      const url    = template?.id ? `/api/proposal-templates/${template.id}` : '/api/proposal-templates';
      const method = template?.id ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
      onSaved(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!template?.id) return;
    const res = await fetch(`/api/proposal-templates/${template.id}/duplicate`, { method: 'POST' });
    if (res.ok) {
      const copy = await res.json();
      onSaved(copy);
    }
  }

  async function del() {
    if (!template?.id) return;
    if (!confirm('Delete this template? Existing proposals will not be affected.')) return;
    await fetch(`/api/proposal-templates/${template.id}`, { method: 'DELETE' });
    onDeleted(template.id);
  }

  const inputCls  = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400';
  const labelCls  = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1';

  const TABS = [
    { id: 'document',   label: 'Document' },
    { id: 'calculator', label: 'Fee Breakdown' },
    { id: 'milestones', label: 'Milestones' },
    { id: 'settings',   label: 'Settings' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Template header */}
      <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-200">
        <div className="flex-1 min-w-0">
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Template name…"
            className="w-full text-base font-bold text-slate-900 border-0 border-b-2 border-transparent focus:border-orange-400 focus:outline-none bg-transparent pb-0.5"
          />
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400">
              {PROPOSAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={form.isDefault} onChange={e => set('isDefault', e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-orange-500" />
              Default for type
            </label>
            {template?._count?.proposals != null && (
              <span className="text-[11px] text-slate-400">{template._count.proposals} proposal{template._count.proposals !== 1 ? 's' : ''} using this</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {template?.id && (
            <>
              <button onClick={duplicate} title="Duplicate"
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Copy
              </button>
              <button onClick={del} title="Delete"
                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                Delete
              </button>
            </>
          )}
          <button onClick={save} disabled={saving}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 ${
              savedOk ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white hover:bg-orange-600'
            }`}>
            {saving ? 'Saving…' : savedOk ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 border-b border-slate-100">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors -mb-px border-b-2 ${
              activeTab === t.id
                ? 'border-orange-500 text-orange-600 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</p>}

        {activeTab === 'document' && (
          <div>
            <p className="text-xs text-slate-400 mb-2">
              Use <span className="font-mono text-violet-600">{'{tokens}'}</span> for merge fields — click the <span className="font-mono">{'{…}'}</span> button to insert. Formatting toolbar below.
            </p>
            <RichToolbar editorRef={editorRef} onInsertToken={insertToken} />
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onBlur={handleEditorBlur}
              className="min-h-[400px] p-4 border border-slate-200 border-t-0 rounded-b-lg focus:outline-none text-sm text-slate-800 leading-relaxed prose prose-sm max-w-none"
              style={{ fontFamily: 'Georgia, serif' }}
            />
          </div>
        )}

        {activeTab === 'calculator' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Default Adder %</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="100" step="0.5"
                  value={form.defaultAdderPct}
                  onChange={e => set('defaultAdderPct', e.target.value)}
                  className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <span className="text-sm text-slate-500">% overhead / profit margin added on top of labor</span>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Fee Breakdown — pre-populates when this template is chosen
              </p>
              <TaskTable tasks={form.tasks} onChange={v => set('tasks', v)} />
            </div>
          </div>
        )}

        {activeTab === 'milestones' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">Milestone payment split — shown on the client-facing PDF for Full Design proposals.</p>
            <div className="space-y-2">
              {form.milestoneSplit.map((m, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input value={m.label} onChange={e => updateMilestone(idx, 'label', e.target.value)}
                    placeholder="Milestone label…"
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <input type="number" min="0" max="100" step="1"
                    value={m.pct} onChange={e => updateMilestone(idx, 'pct', parseFloat(e.target.value) || 0)}
                    className="w-20 text-sm text-right border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <span className="text-sm text-slate-400">%</span>
                  <button onClick={() => removeMilestone(idx)} className="text-slate-300 hover:text-red-500 transition-colors">×</button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button onClick={addMilestone}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add milestone
              </button>
              <span className={`text-xs font-semibold ${milestoneTotal === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                Total: {milestoneTotal}%
                {milestoneTotal !== 100 && ` (should be 100%)`}
              </span>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Exclusions / Standard Language</label>
              <textarea
                value={form.exclusions}
                onChange={e => set('exclusions', e.target.value)}
                rows={6}
                placeholder="Not included in this scope: energy compliance calculations, emergency lighting systems…"
                className={inputCls + ' resize-none'}
              />
              <p className="text-[11px] text-slate-400 mt-1">Internal reference — not shown on PDF unless explicitly inserted in document body.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TemplatesClient() {
  const [templates,        setTemplates]        = useState([]);
  const [selectedId,       setSelectedId]       = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [err,              setErr]              = useState('');
  const [typeFilter,       setTypeFilter]       = useState('all');
  const [creatingNew,      setCreatingNew]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proposal-templates');
      const data = await res.json();
      setTemplates(data.templates || []);
      if (!selectedId && data.templates?.length > 0) {
        setSelectedId(data.templates[0].id);
      }
    } catch { setErr('Failed to load templates'); }
    finally { setLoading(false); }
  }, [selectedId]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const filtered = typeFilter === 'all' ? templates : templates.filter(t => t.type === typeFilter);
  const selected = creatingNew ? null : templates.find(t => t.id === selectedId) || null;

  function handleSaved(t) {
    setTemplates(prev => {
      const idx = prev.findIndex(x => x.id === t.id);
      if (idx >= 0) return prev.map((x, i) => i === idx ? t : x);
      return [t, ...prev];
    });
    setSelectedId(t.id);
    setCreatingNew(false);
  }

  function handleDeleted(id) {
    setTemplates(prev => prev.filter(t => t.id !== id));
    setSelectedId(templates.find(t => t.id !== id)?.id || null);
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Proposal Templates</h1>
          <p className="text-xs text-slate-400 mt-0.5">Manage document templates and fee breakdowns for proposals</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/sales/proposals" className="text-xs text-slate-500 hover:text-slate-700 transition-colors px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
            ← Back to Proposals
          </a>
          <button
            onClick={() => { setCreatingNew(true); setSelectedId(null); }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Template
          </button>
        </div>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border-b border-red-200 px-6 py-2">{err}</p>}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar list */}
        <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
          {/* Type filter */}
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setTypeFilter('all')}
                className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${typeFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                All
              </button>
              {PROPOSAL_TYPES.map(t => (
                <button key={t.value} onClick={() => setTypeFilter(v => v === t.value ? 'all' : t.value)}
                  className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${typeFilter === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                  {t.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
          {/* Template list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                {typeFilter !== 'all' ? 'No templates for this type' : 'No templates yet'}
              </div>
            ) : (
              filtered.map(t => (
                <button key={t.id} onClick={() => { setSelectedId(t.id); setCreatingNew(false); }}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${
                    selectedId === t.id && !creatingNew ? 'bg-orange-50 border-l-2 border-l-orange-500' : 'hover:bg-slate-50'
                  }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 truncate">{t.name}</span>
                    {t.isDefault && <span className="text-[10px] text-amber-600 font-bold shrink-0">DEFAULT</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400">
                      {PROPOSAL_TYPES.find(p => p.value === t.type)?.label || t.type}
                    </span>
                    {t._count?.proposals > 0 && (
                      <span className="text-[10px] text-slate-300">· {t._count.proposals} in use</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Editor panel */}
        <div className="flex-1 overflow-hidden bg-white">
          {creatingNew || !selected ? (
            <TemplateEditor
              key="new"
              template={null}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          ) : (
            <TemplateEditor
              key={selected.id}
              template={selected}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          )}
        </div>
      </div>
    </div>
  );
}
