'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { COLOR_MAP } from './categories';
import KnowledgeBaseChat from '@/components/KnowledgeBaseChat';
import RichTextEditor, { RichContent } from '@/components/RichTextEditor';
import { CARD, MODAL, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, BTN_COMPACT_PRIMARY, BTN_DANGER, H1, H2, LABEL, HELPER, INPUT, CARD_TITLE } from '@/components/ui/tokens';
import { FilterToolbar, FilterPanel, countFilters, SearchBox } from '@/components/ui/FilterPanel';
import { SortSelect, sortRows } from '@/components/ui/SortHeader';
import { WidgetEmpty } from '@/components/ui/WidgetFrame';
import { useUrlView } from '@/lib/useUrlView';

// ── Code Search banner card ────────────────────────────────────────────────────
function CodeSearchCard() {
  return (
    <Link href="/knowledge-base/code-search"
      className="group bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl border border-violet-200 shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-3 col-span-full sm:col-span-2 lg:col-span-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center text-xl shrink-0">⚖️</div>
          <div>
            <div className="text-sm font-bold text-violet-800">Code Search</div>
            <div className="text-xs text-violet-500">AI-powered: ASHRAE 90.1 · IBC · IECC · NEC</div>
          </div>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200 shrink-0">
          New
        </span>
      </div>
      <p className="text-xs text-violet-700 leading-relaxed">
        Ask questions about LPD allowances, emergency lighting, egress requirements, controls, and more, with section citations and confidence levels.
      </p>
      <div className="flex items-center gap-1 text-xs font-semibold text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity mt-auto">
        Search building codes
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
      </div>
    </Link>
  );
}

// ── LPD Check banner card ──────────────────────────────────────────────────────
function LPDCheckCard() {
  return (
    <Link href="/knowledge-base/lpd-check"
      className="group bg-gradient-to-br from-green-50 to-teal-50 rounded-xl border border-green-200 shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-3 col-span-full sm:col-span-2 lg:col-span-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-xl shrink-0">📊</div>
          <div>
            <div className="text-sm font-bold text-green-800">LPD Compliance Check</div>
            <div className="text-xs text-green-600">ASHRAE 90.1-2022 §9.5.1 · Upload CSV or Excel</div>
          </div>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 shrink-0">
          New
        </span>
      </div>
      <p className="text-xs text-green-700 leading-relaxed">
        Upload any fixture schedule spreadsheet and instantly check LPD compliance per area. Auto-detects columns, groups by location, and flags spaces that exceed ASHRAE limits.
      </p>
      <div className="flex items-center gap-1 text-xs font-semibold text-green-600 opacity-0 group-hover:opacity-100 transition-opacity mt-auto">
        Check LPD compliance
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
      </div>
    </Link>
  );
}

export const SEVERITY_CONFIG = {
  REQUIRED:    { label: 'Required',    color: 'text-red-700 bg-red-50 border-red-200',    dot: 'bg-red-500' },
  RECOMMENDED: { label: 'Recommended', color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  NOTE:        { label: 'Note',        color: 'text-slate-600 bg-slate-100 border-slate-200', dot: 'bg-slate-400' },
};

const COLOR_OPTIONS = ['blue','violet','slate','orange','green','indigo','amber','rose','cyan','teal','sky','purple','pink'];
const ICON_OPTIONS  = ['📁','🏠','🚶','🏭','🚗','🌿','💡','🔦','✅','🎚️','📐','🏗️','📋','🔒','💼','🎯','📊','🔧','✏️','📌','🧩','⚡','🌐','🔑'];

// Extend COLOR_MAP with extra colors used in the picker
const FULL_COLOR_MAP = {
  ...COLOR_MAP,
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
  pink:   { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-700',   dot: 'bg-pink-500',   badge: 'bg-pink-100 text-pink-700'   },
};

function getColors(color) {
  return FULL_COLOR_MAP[color] || FULL_COLOR_MAP.slate;
}

// ── Category management modal ─────────────────────────────────────────────────
function CategoryModal({ categories: initial, onClose, onUpdate }) {
  const [cats,      setCats]      = useState(initial);
  const [editing,   setEditing]   = useState(null); // null | 'new' | cat-object
  const [form,      setForm]      = useState({ label: '', desc: '', color: 'blue', icon: '📁' });
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(null); // id being deleted
  const [confirmDel, setConfirmDel] = useState(null); // id awaiting confirm

  function startEdit(cat) {
    setEditing(cat);
    setForm({ label: cat.label, desc: cat.desc, color: cat.color, icon: cat.icon });
  }
  function startNew() {
    setEditing('new');
    setForm({ label: '', desc: '', color: 'blue', icon: '📁' });
  }

  async function handleSave() {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        const res = await fetch('/api/knowledge-base/categories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const created = await res.json();
          const next = [...cats, created];
          setCats(next);
          onUpdate(next);
          setEditing(null);
        }
      } else {
        const res = await fetch(`/api/knowledge-base/categories/${editing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const updated = await res.json();
          const next = cats.map(c => c.id === updated.id ? updated : c);
          setCats(next);
          onUpdate(next);
          setEditing(null);
        }
      }
    } finally { setSaving(false); }
  }

  async function handleDelete(cat) {
    setDeleting(cat.id);
    try {
      const res = await fetch(`/api/knowledge-base/categories/${cat.id}`, { method: 'DELETE' });
      if (res.ok) {
        const next = cats.filter(c => c.id !== cat.id);
        setCats(next);
        onUpdate(next);
      }
    } finally { setDeleting(null); setConfirmDel(null); }
  }

  const visibleCats = cats.filter(c => c.key !== 'UNCATEGORIZED');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-10 overflow-y-auto">
      <div className={`${MODAL} w-full max-w-xl mx-auto`}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className={H2}>Manage Categories</h2>
            <p className={`${HELPER} mt-0.5`}>Add, rename, or remove categories. Deleted categories move entries to Uncategorized.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Category list */}
        <div className="px-6 py-4 space-y-2 max-h-72 overflow-y-auto">
          {visibleCats.map(cat => {
            const colors = getColors(cat.color);
            const isConfirming = confirmDel === cat.id;
            const isDeleting   = deleting === cat.id;
            return (
              <div key={cat.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white transition-colors">
                <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center text-base shrink-0`}>
                  {cat.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800">{cat.label}</div>
                  <div className={`${HELPER} truncate`}>{cat.desc || '-'}</div>
                </div>
                {!isConfirming ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(cat)}
                      className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                    </button>
                    {!cat.isBuiltIn && (
                      <button onClick={() => setConfirmDel(cat.id)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={HELPER}>Delete?</span>
                    <button onClick={() => handleDelete(cat)} disabled={isDeleting}
                      className={`${BTN_DANGER} px-3 py-1.5 text-xs`}>
                      {isDeleting ? '…' : 'Yes'}
                    </button>
                    <button onClick={() => setConfirmDel(null)}
                      className={BTN_COMPACT}>
                      No
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {visibleCats.length === 0 && (
            <WidgetEmpty>No categories yet. Add one below.</WidgetEmpty>
          )}
        </div>

        {/* Add / Edit form */}
        {editing ? (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl space-y-3">
            <p className={LABEL}>
              {editing === 'new' ? 'New Category' : `Editing: ${editing.label}`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={`${LABEL} block mb-1`}>Label *</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Outdoor Lighting"
                  className={INPUT} />
              </div>
              <div className="col-span-2">
                <label className={`${LABEL} block mb-1`}>Description</label>
                <input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                  placeholder="Short description shown on the category card"
                  className={INPUT} />
              </div>
              <div>
                <label className={`${LABEL} block mb-1`}>Color</label>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_OPTIONS.map(c => {
                    const cm = getColors(c);
                    return (
                      <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                        title={c}
                        className={`w-6 h-6 rounded-full ${cm.dot} transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-1 ring-orange-500' : ''}`} />
                    );
                  })}
                </div>
              </div>
              <div>
                <label className={`${LABEL} block mb-1`}>Icon</label>
                <div className="flex flex-wrap gap-1">
                  {ICON_OPTIONS.map(icon => (
                    <button key={icon} onClick={() => setForm(f => ({ ...f, icon }))}
                      className={`w-7 h-7 rounded-lg text-base flex items-center justify-center transition-colors ${form.icon === icon ? 'bg-orange-50 ring-2 ring-orange-400' : 'hover:bg-slate-100'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
              <div className={`w-8 h-8 rounded-lg ${getColors(form.color).bg} flex items-center justify-center text-base`}>{form.icon}</div>
              <div>
                <div className={`text-xs font-bold ${getColors(form.color).text}`}>{form.label || 'Preview'}</div>
                <div className={HELPER}>{form.desc || 'Description'}</div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)}
                className={BTN_COMPACT}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.label.trim()}
                className={BTN_COMPACT_PRIMARY}>
                {saving ? 'Saving…' : editing === 'new' ? 'Add Category' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
            <button onClick={onClose}
              className={BTN_SECONDARY}>
              Done
            </button>
            <button onClick={startNew}
              className={BTN_PRIMARY}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add Category
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── StandardModal ─────────────────────────────────────────────────────────────
export function StandardModal({ standard, categories, onClose, onSave, isSuperAdmin }) {
  const [form, setForm] = useState({
    category:       standard?.category       || '',
    title:          standard?.title          || '',
    content:        standard?.content        || '',
    severity:       standard?.severity       || 'REQUIRED',
    tags:           standard ? (JSON.parse(standard.tags || '[]')).join(', ') : '',
    sourceUrl:      standard?.sourceUrl      || '',
    superAdminOnly: standard?.superAdminOnly || false,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.category || !form.title || !form.content) return;
    setSaving(true);
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    const payload = { ...form, tags };
    const url    = standard ? `/api/knowledge-base/${standard.id}` : '/api/knowledge-base';
    const method = standard ? 'PATCH' : 'POST';
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data   = await res.json();
    setSaving(false);
    if (res.ok) onSave(data, !standard);
  }

  const catList = (categories || []).filter(c => c.key !== 'UNCATEGORIZED');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-10 overflow-y-auto">
      <div className={`${MODAL} w-full max-w-2xl mx-auto`}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className={H2}>{standard ? 'Edit Standard' : 'Add Standard'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${LABEL} block mb-1`}>Category *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className={INPUT}>
                <option value="">Select...</option>
                {catList.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={`${LABEL} block mb-1`}>Severity *</label>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                className={INPUT}>
                <option value="REQUIRED">Required</option>
                <option value="RECOMMENDED">Recommended</option>
                <option value="NOTE">Note</option>
              </select>
            </div>
          </div>

          <div>
            <label className={`${LABEL} block mb-1`}>Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Fixture End Placement"
              className={INPUT} />
          </div>

          <div>
            <label className={`${LABEL} block mb-1`}>Rule / Content *</label>
            <RichTextEditor
              value={form.content}
              onChange={html => setForm(f => ({ ...f, content: html }))}
              placeholder="Describe the standard or rule…"
              minHeight={140}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`${LABEL} block mb-1`}>Tags <span className="font-normal">(comma-separated)</span></label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="spacing, placement, corridor"
                className={INPUT} />
            </div>
            <div>
              <label className={`${LABEL} block mb-1`}>Source URL</label>
              <input value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))}
                placeholder="https://..."
                className={INPUT} />
            </div>
          </div>

          {isSuperAdmin && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 rounded-lg border border-orange-200 bg-orange-50">
              <input type="checkbox" checked={form.superAdminOnly}
                onChange={e => setForm(f => ({ ...f, superAdminOnly: e.target.checked }))}
                className="w-4 h-4 accent-orange-500 rounded" />
              <div>
                <div className="text-xs font-bold text-orange-700">Super Admin Only</div>
                <div className="text-[11px] text-orange-500">Hidden from all non-Super Admin users</div>
              </div>
            </label>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className={BTN_SECONDARY}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.category || !form.title || !form.content}
            className={BTN_PRIMARY}>
            {saving ? 'Saving…' : standard ? 'Save Changes' : 'Add Standard'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── List filters and sort (address-backed) ────────────────────────────────────
const KB_FIELDS = [
  { key: 'category', label: 'Category', kind: 'pick' },
  { key: 'severity', label: 'Severity', kind: 'pick' },
  { key: 'tag',      label: 'Tag',      kind: 'text', placeholder: 'Tag contains...' },
  { key: 'title',    label: 'Title',    kind: 'text' },
];
const KB_SORT_FIELDS = [
  { key: 'title',    label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'severity', label: 'Severity' },
];
const SEVERITY_RANK = { REQUIRED: 0, RECOMMENDED: 1, NOTE: 2 };

// ── Main component ────────────────────────────────────────────────────────────
export default function KnowledgeBaseClient({ standards: initial, categories: initialCats, isEditor, isAdmin, isSuperAdmin }) {
  const [standards,   setStandards]   = useState(initial);
  const [categories,  setCategories]  = useState(initialCats || []);
  const [search,      setSearch]      = useState('');
  const [modal,       setModal]       = useState(null);  // null | 'add' | standard-object
  const [showCatMgr,  setShowCatMgr]  = useState(false);
  const [panelOpen,   setPanelOpen]   = useState(false);
  const { filters, setFilter, clearFilters, sort, setSort } = useUrlView({ fields: KB_FIELDS });

  const catLabel = useMemo(() => Object.fromEntries(categories.map(c => [c.key, c.label])), [categories]);
  const choices = useMemo(() => ({
    category: categories.map(c => [c.key, c.label]),
    severity: Object.entries(SEVERITY_CONFIG).map(([k, v]) => [k, v.label]),
  }), [categories]);
  const getters = useMemo(() => ({
    title:    s => s.title,
    category: s => catLabel[s.category] || s.category,
    severity: s => SEVERITY_RANK[s.severity] ?? 3,
  }), [catLabel]);

  const filterCount = countFilters(filters, KB_FIELDS);

  const filtered = useMemo(() => {
    let list = standards;
    if (filters.category) list = list.filter(s => s.category === filters.category);
    if (filters.severity) list = list.filter(s => s.severity === filters.severity);
    if (filters.tag)      list = list.filter(s => (s.tags || '').toLowerCase().includes(filters.tag.toLowerCase()));
    if (filters.title)    list = list.filter(s => (s.title || '').toLowerCase().includes(filters.title.toLowerCase()));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.tags || '').toLowerCase().includes(q)
      );
    }
    return sortRows(list, sort, getters);
  }, [standards, search, filters, sort, getters]);

  function handleSave(saved, isNew) {
    setStandards(prev => isNew ? [saved, ...prev] : prev.map(s => s.id === saved.id ? saved : s));
    setModal(null);
  }

  const total = standards.length;
  const visibleCats = categories.filter(c => c.key !== 'UNCATEGORIZED' || standards.some(s => s.category === 'UNCATEGORIZED'));
  const listMode = !!search.trim() || filterCount > 0;

  const headerProps = {
    search, setSearch, total, isEditor, isAdmin, categories,
    onAdd: () => setModal('add'), onManageCats: () => setShowCatMgr(true),
    filterCount, panelOpen, onTogglePanel: () => setPanelOpen(o => !o), onClear: clearFilters,
    shown: filtered.length, filters, choices, setFilter, sort, setSort, listMode,
  };

  // Search results view
  if (listMode) {
    return (
      <div className="min-h-screen bg-slate-50">
        {modal && <StandardModal standard={modal === 'add' ? null : modal} categories={categories} onClose={() => setModal(null)} onSave={handleSave} isSuperAdmin={isSuperAdmin} />}
        {showCatMgr && <CategoryModal categories={categories} onClose={() => setShowCatMgr(false)} onUpdate={setCategories} />}
        <Header {...headerProps} />
        <div className="max-w-4xl mx-auto px-6 py-6">
          {search.trim() && (
            <p className={`${HELPER} mb-4 tabular-nums`}>{filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;</p>
          )}
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className={CARD}><WidgetEmpty>No standards match.</WidgetEmpty></div>
            )}
            {filtered.map(s => (
              <StandardCard key={s.id} standard={s} categories={categories} isEditor={isEditor}
                onEdit={() => setModal(s)}
                onDelete={id => setStandards(prev => prev.filter(x => x.id !== id))} />
            ))}
          </div>
        </div>
        <KnowledgeBaseChat />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {modal && <StandardModal standard={modal === 'add' ? null : modal} categories={categories} onClose={() => setModal(null)} onSave={handleSave} isSuperAdmin={isSuperAdmin} />}
      {showCatMgr && <CategoryModal categories={categories} onClose={() => setShowCatMgr(false)} onUpdate={setCategories} />}
      <Header {...headerProps} />

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CodeSearchCard />
          <LPDCheckCard />
          {visibleCats.map(cat => {
            const count  = standards.filter(s => s.category === cat.key).length;
            const colors = getColors(cat.color);
            return (
              <Link key={cat.key} href={`/knowledge-base/${cat.key.toLowerCase()}`}
                className={`group bg-white rounded-xl border ${colors.border} shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-3`}>
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center text-xl`}>
                    {cat.icon}
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full tabular-nums ${colors.badge}`}>
                    {count} {count === 1 ? 'standard' : 'standards'}
                  </span>
                </div>
                <div>
                  <div className={`text-sm font-bold ${colors.text} mb-1`}>{cat.label}</div>
                  <div className={`${HELPER} leading-relaxed`}>{cat.desc}</div>
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold ${colors.text} opacity-0 group-hover:opacity-100 transition-opacity mt-auto`}>
                  View standards
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <KnowledgeBaseChat />
    </div>
  );
}

function Header({ search, setSearch, total, isEditor, isAdmin, onAdd, onManageCats, categories,
  filterCount, panelOpen, onTogglePanel, onClear, shown, filters, choices, setFilter, sort, setSort, listMode }) {
  const catCount = (categories || []).filter(c => c.key !== 'UNCATEGORIZED').length;
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-5">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={LABEL}>Design</span>
            </div>
            <h1 className={H1}>Knowledge Base</h1>
            <p className={`${HELPER} mt-0.5 tabular-nums`}>{total} ILC design standards across {catCount} categories</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/knowledge-base/code-search"
              className={BTN_SECONDARY}>
              <span>⚖️</span>
              Code Search
            </Link>
            {isAdmin && (
              <button onClick={onManageCats}
                className={BTN_SECONDARY}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Categories
              </button>
            )}
            {isEditor && (
              <button onClick={onAdd}
                className={BTN_PRIMARY}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Add Standard
              </button>
            )}
          </div>
        </div>
        <FilterToolbar
          count={filterCount}
          open={panelOpen}
          onToggle={onTogglePanel}
          onClear={onClear}
          shown={shown}
          total={total}
          noun="standards"
          right={(
            <>
              {listMode && <SortSelect fields={KB_SORT_FIELDS} sort={sort} onChange={setSort} />}
              <SearchBox value={search} onChange={setSearch} placeholder="Search standards, try garage spacing or controls..." className="w-72" />
            </>
          )}
        />
        <FilterPanel open={panelOpen} fields={KB_FIELDS} filters={filters} choices={choices} onChange={setFilter} />
      </div>
    </div>
  );
}

// ── StandardCard (used in search results) ─────────────────────────────────────
export function StandardCard({ standard, categories, isEditor, onEdit, onDelete }) {
  const [expanded,   setExpanded]   = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const sev    = SEVERITY_CONFIG[standard.severity] || SEVERITY_CONFIG.NOTE;
  const tags   = (() => { try { return JSON.parse(standard.tags || '[]'); } catch { return []; } })();
  const catCfg = (categories || []).find(c => c.key === standard.category);
  const colors = getColors(catCfg?.color || 'slate');

  const isHtml  = /<[a-z][\s\S]*>/i.test(standard.content || '');
  const textLen = isHtml ? (standard.content || '').replace(/<[^>]+>/g, '').length : (standard.content || '').length;
  const isLong  = textLen > 200;

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/knowledge-base/${standard.id}`, { method: 'DELETE' });
    onDelete(standard.id);
  }

  return (
    <div className={`${CARD} overflow-hidden group`}>
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${sev.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`${CARD_TITLE} leading-snug`}>{standard.title}</h3>
                {standard.superAdminOnly && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 shrink-0">🔒 Super Admin</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {isEditor && !confirming && (
                  <>
                    <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                    </button>
                    <button onClick={() => setConfirming(true)} className="p-1.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </>
                )}
                {confirming && (
                  <div className="flex items-center gap-1">
                    <span className={`${HELPER} mr-1`}>Delete?</span>
                    <button onClick={handleDelete} disabled={deleting} className={`${BTN_DANGER} px-3 py-1.5 text-xs`}>{deleting ? '…' : 'Yes'}</button>
                    <button onClick={() => setConfirming(false)} className={BTN_COMPACT}>No</button>
                  </div>
                )}
              </div>
            </div>
            <div className={`mt-1.5 ${!expanded && isLong ? 'line-clamp-4 overflow-hidden' : ''}`}>
              <RichContent html={standard.content} />
            </div>
            {isLong && (
              <button onClick={() => setExpanded(e => !e)} className="text-xs text-orange-600 hover:text-orange-700 mt-1 font-semibold">
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${sev.color}`}>{sev.label}</span>
              {tags.map(tag => (
                <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">#{tag}</span>
              ))}
              {standard.sourceUrl && (
                <a href={standard.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-orange-600 hover:text-orange-700 flex items-center gap-1 ml-auto">Source ↗</a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
