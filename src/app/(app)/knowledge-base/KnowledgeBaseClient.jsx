'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { CATEGORIES, COLOR_MAP } from './categories';
import KnowledgeBaseChat from '@/components/KnowledgeBaseChat';
import RichTextEditor, { RichContent } from '@/components/RichTextEditor';

export const SEVERITY_CONFIG = {
  REQUIRED:    { label: 'Required',    color: 'text-red-700 bg-red-50 border-red-200',    dot: 'bg-red-500' },
  RECOMMENDED: { label: 'Recommended', color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  NOTE:        { label: 'Note',        color: 'text-slate-600 bg-slate-100 border-slate-200', dot: 'bg-slate-400' },
};

// ── StandardModal ─────────────────────────────────────────────────────────────
export function StandardModal({ standard, onClose, onSave }) {
  const [form, setForm] = useState({
    category:  standard?.category  || '',
    title:     standard?.title     || '',
    content:   standard?.content   || '',
    severity:  standard?.severity  || 'REQUIRED',
    tags:      standard ? (JSON.parse(standard.tags || '[]')).join(', ') : '',
    sourceUrl: standard?.sourceUrl || '',
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-10 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">{standard ? 'Edit Standard' : 'Add Standard'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Category *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— select —</option>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Severity *</label>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="REQUIRED">Required</option>
                <option value="RECOMMENDED">Recommended</option>
                <option value="NOTE">Note</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Fixture End Placement"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Rule / Content *</label>
            <RichTextEditor
              value={form.content}
              onChange={html => setForm(f => ({ ...f, content: html }))}
              placeholder="Describe the standard or rule… paste from Google Docs or Microsoft Word to preserve formatting."
              minHeight={140}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tags <span className="font-normal">(comma-separated)</span></label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="spacing, placement, corridor"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Source URL</label>
              <input value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.category || !form.title || !form.content}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : standard ? 'Save Changes' : 'Add Standard'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function KnowledgeBaseClient({ standards: initial, isEditor }) {
  const [standards, setStandards] = useState(initial);
  const [search,    setSearch]    = useState('');
  const [modal,     setModal]     = useState(null); // null | 'add' | standard-object

  const filtered = useMemo(() => {
    if (!search.trim()) return standards;
    const q = search.toLowerCase();
    return standards.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      (s.tags || '').toLowerCase().includes(q)
    );
  }, [standards, search]);

  // Group filtered results by category
  const byCategory = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    });
    return map;
  }, [filtered]);

  function handleSave(saved, isNew) {
    setStandards(prev => isNew
      ? [saved, ...prev]
      : prev.map(s => s.id === saved.id ? saved : s)
    );
    setModal(null);
  }

  const total = standards.length;
  const categoriesWithStandards = CATEGORIES.filter(c => (byCategory[c.key] || []).length > 0 || !search);

  // If searching, show flat search results
  if (search.trim() && filtered.length > 0) {
    return (
      <div className="min-h-screen bg-slate-50">
        {modal && <StandardModal standard={modal === 'add' ? null : modal} onClose={() => setModal(null)} onSave={handleSave} />}
        <Header search={search} setSearch={setSearch} total={total} isEditor={isEditor} onAdd={() => setModal('add')} />
        <div className="max-w-4xl mx-auto px-6 py-6">
          <p className="text-xs text-slate-400 mb-4">{filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;</p>
          <div className="space-y-3">
            {filtered.map(s => (
              <StandardCard key={s.id} standard={s} isEditor={isEditor}
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
      {modal && <StandardModal standard={modal === 'add' ? null : modal} onClose={() => setModal(null)} onSave={handleSave} />}
      <Header search={search} setSearch={setSearch} total={total} isEditor={isEditor} onAdd={() => setModal('add')} />

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CATEGORIES.map(cat => {
            const count  = standards.filter(s => s.category === cat.key).length;
            const colors = COLOR_MAP[cat.color];
            return (
              <Link key={cat.key} href={`/knowledge-base/${cat.key.toLowerCase()}`}
                className={`group bg-white rounded-xl border ${colors.border} shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-3`}>
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center text-xl`}>
                    {cat.icon}
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${colors.badge}`}>
                    {count} {count === 1 ? 'standard' : 'standards'}
                  </span>
                </div>
                <div>
                  <div className={`text-sm font-bold ${colors.text} mb-1`}>{cat.label}</div>
                  <div className="text-xs text-slate-400 leading-relaxed">{cat.desc}</div>
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium ${colors.text} opacity-0 group-hover:opacity-100 transition-opacity mt-auto`}>
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

function Header({ search, setSearch, total, isEditor, onAdd }) {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-5">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Design</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Knowledge Base</h1>
            <p className="text-xs text-slate-400 mt-0.5">{total} ILC design standards across {Object.keys({}).length || 10} categories</p>
          </div>
          {isEditor && (
            <button onClick={onAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add Standard
            </button>
          )}
        </div>
        <div className="relative max-w-xl">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search standards — try &quot;garage spacing&quot; or &quot;controls&quot;…"
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── StandardCard (used in search results) ─────────────────────────────────────
export function StandardCard({ standard, isEditor, onEdit, onDelete }) {
  const [expanded,  setExpanded]  = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const sev    = SEVERITY_CONFIG[standard.severity] || SEVERITY_CONFIG.NOTE;
  const tags   = (() => { try { return JSON.parse(standard.tags || '[]'); } catch { return []; } })();
  const catCfg = CATEGORIES.find(c => c.key === standard.category);
  const colors = catCfg ? COLOR_MAP[catCfg.color] : COLOR_MAP.slate;

  // Determine if content is HTML or plain text
  const isHtml = /<[a-z][\s\S]*>/i.test(standard.content || '');
  // Estimate "length" for show more/less — strip tags for HTML
  const textLen = isHtml
    ? (standard.content || '').replace(/<[^>]+>/g, '').length
    : (standard.content || '').length;
  const isLong = textLen > 200;

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/knowledge-base/${standard.id}`, { method: 'DELETE' });
    onDelete(standard.id);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group">
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${sev.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 leading-snug">{standard.title}</h3>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {isEditor && !confirming && (
                  <>
                    <button onClick={onEdit}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                    </button>
                    <button onClick={() => setConfirming(true)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </>
                )}
                {confirming && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 mr-1">Delete?</span>
                    <button onClick={handleDelete} disabled={deleting}
                      className="px-2 py-1 text-[10px] font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                      {deleting ? '…' : 'Yes'}
                    </button>
                    <button onClick={() => setConfirming(false)}
                      className="px-2 py-1 text-[10px] font-medium rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
                      No
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className={`mt-1.5 ${!expanded && isLong ? 'line-clamp-4 overflow-hidden' : ''}`}>
              <RichContent html={standard.content} />
            </div>
            {isLong && (
              <button onClick={() => setExpanded(e => !e)} className="text-xs text-blue-600 hover:text-blue-700 mt-1 font-medium">
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sev.color}`}>
                {sev.label}
              </span>
              {tags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  #{tag}
                </span>
              ))}
              {standard.sourceUrl && (
                <a href={standard.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-blue-600 hover:text-blue-700 flex items-center gap-1 ml-auto">
                  Source ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
