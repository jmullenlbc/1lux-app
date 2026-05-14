'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { CATEGORIES, COLOR_MAP } from '../categories';
import { SEVERITY_CONFIG, StandardModal, StandardCard } from '../KnowledgeBaseClient';
import KnowledgeBaseChat from '@/components/KnowledgeBaseChat';

const SEVERITY_ORDER = { REQUIRED: 0, RECOMMENDED: 1, NOTE: 2 };

export default function CategoryClient({ standards: initial, catConfig, isEditor }) {
  const [standards, setStandards] = useState(initial);
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState('ALL'); // ALL | REQUIRED | RECOMMENDED | NOTE
  const [modal,     setModal]     = useState(null);

  const colors = COLOR_MAP[catConfig.color];

  const filtered = useMemo(() => {
    let list = standards;
    if (filter !== 'ALL')     list = list.filter(s => s.severity === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        (s.tags || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));
  }, [standards, filter, search]);

  function handleSave(saved, isNew) {
    setStandards(prev => isNew
      ? [saved, ...prev]
      : prev.map(s => s.id === saved.id ? saved : s)
    );
    setModal(null);
  }

  const counts = useMemo(() => ({
    ALL:         standards.length,
    REQUIRED:    standards.filter(s => s.severity === 'REQUIRED').length,
    RECOMMENDED: standards.filter(s => s.severity === 'RECOMMENDED').length,
    NOTE:        standards.filter(s => s.severity === 'NOTE').length,
  }), [standards]);

  return (
    <div className="min-h-screen bg-slate-50">
      {modal && (
        <StandardModal
          standard={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
            <Link href="/knowledge-base" className="hover:text-slate-600 transition-colors flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
              Knowledge Base
            </Link>
            <span>›</span>
            <span className={`font-semibold ${colors.text}`}>{catConfig.label}</span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${colors.bg} flex items-center justify-center text-lg shrink-0`}>
                {catConfig.icon}
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900">{catConfig.label}</h1>
                <p className="text-[11px] text-slate-400">{catConfig.desc}</p>
              </div>
            </div>
            {isEditor && (
              <button onClick={() => setModal('add')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Add Standard
              </button>
            )}
          </div>

          {/* Search + filter bar */}
          <div className="flex items-center gap-3 mt-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${catConfig.label.toLowerCase()} standards…`}
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="flex items-center gap-1">
              {['ALL', 'REQUIRED', 'RECOMMENDED', 'NOTE'].map(sev => (
                <button key={sev} onClick={() => setFilter(sev)}
                  className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${
                    filter === sev
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}>
                  {sev === 'ALL' ? `All (${counts.ALL})` : `${sev[0]}${sev.slice(1).toLowerCase()} (${counts[sev]})`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Standards list */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-3xl mb-3">{catConfig.icon}</div>
            <p className="text-sm font-medium text-slate-500">No standards found</p>
            <p className="text-xs mt-1">
              {search ? `No results for "${search}"` : isEditor ? 'Add the first standard for this category.' : 'Standards will appear here once added.'}
            </p>
            {isEditor && !search && (
              <button onClick={() => setModal('add')}
                className="mt-4 px-4 py-2 text-xs font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                Add First Standard
              </button>
            )}
          </div>
        ) : (
          filtered.map(s => (
            <StandardCard
              key={s.id}
              standard={s}
              isEditor={isEditor}
              onEdit={() => setModal(s)}
              onDelete={id => setStandards(prev => prev.filter(x => x.id !== id))}
            />
          ))
        )}
      </div>

      <KnowledgeBaseChat />
    </div>
  );
}
