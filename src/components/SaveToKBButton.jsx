'use client';
import { useState } from 'react';

// Converts FLAG/VERIFY/WARN severity tokens → KB severity constants
function toKbSeverity(s) {
  if (s === 'FLAG' || s === 'REQUIRED' || s === 'critical') return 'REQUIRED';
  if (s === 'WARN' || s === 'WARNING' || s === 'warning') return 'RECOMMENDED';
  if (s === 'VERIFY') return 'RECOMMENDED';
  return 'NOTE';
}

export default function SaveToKBButton({ title, content, severity = 'FLAG', suggestedTags = [] }) {
  const [phase,       setPhase]      = useState('idle'); // idle | picking | saving | saved | error
  const [categories,  setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('');

  async function openPicker() {
    setPhase('picking');
    if (categories.length === 0) {
      try {
        const res = await fetch('/api/knowledge-base/categories');
        if (res.ok) {
          const cats = await res.json();
          setCategories(cats.filter(c => c.key !== 'UNCATEGORIZED'));
        }
      } catch { /* silent */ }
    }
  }

  async function save() {
    if (!selectedCat) return;
    setPhase('saving');
    try {
      const res = await fetch('/api/knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          severity:  toKbSeverity(severity),
          category:  selectedCat,
          tags:      suggestedTags,
          sourceUrl: '',
        }),
      });
      if (!res.ok) throw new Error('save failed');
      setPhase('saved');
    } catch {
      setPhase('error');
    }
  }

  if (phase === 'saved') {
    return (
      <a href="/knowledge-base" target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-600 hover:text-green-700 transition-colors">
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
        Saved to KB
      </a>
    );
  }

  if (phase === 'error') {
    return (
      <span className="text-[10px] text-red-500 flex items-center gap-1">
        Save failed,
        <button onClick={() => setPhase('idle')} className="underline hover:no-underline">retry</button>
      </span>
    );
  }

  if (phase === 'picking' || phase === 'saving') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          value={selectedCat}
          onChange={e => setSelectedCat(e.target.value)}
          className="text-[10px] border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[160px]"
        >
          <option value="">Category</option>
          {categories.map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={phase === 'saving' || !selectedCat}
          className="text-[10px] px-2.5 py-1 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {phase === 'saving' ? '…' : 'Save'}
        </button>
        <button
          onClick={() => setPhase('idle')}
          className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors px-1"
        >
          ✕
        </button>
      </div>
    );
  }

  // idle
  return (
    <button
      onClick={openPicker}
      title="Save this finding to the Knowledge Base"
      className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors px-1.5 py-1 rounded-md"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
      </svg>
      Save to KB
    </button>
  );
}
