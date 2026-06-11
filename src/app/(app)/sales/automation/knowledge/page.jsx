'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import AutomationNav from '@/components/salesAutomation/AutomationNav';
import DisabledSection from '@/components/salesAutomation/DisabledSection';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: '',            label: 'All' },
  { value: 'GENERAL',     label: 'General' },
  { value: 'DEVELOPERS',  label: 'Developers' },
  { value: 'ARCHITECTS',  label: 'Architects' },
  { value: 'ENGINEERS',   label: 'Engineers' },
  { value: 'CONTRACTORS', label: 'Contractors' },
];

const CATEGORY_ENTRY_OPTIONS = CATEGORY_OPTIONS.filter(o => o.value !== '');
const DEFAULT_CATEGORIES     = CATEGORY_ENTRY_OPTIONS.map(o => o.value);

// ── CreatableSelect ───────────────────────────────────────────────────────────
function CreatableSelect({ value, onChange, options, placeholder = 'Select or type…' }) {
  const [open,  setOpen]  = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(input.toLowerCase()));
  const isNew = input.trim() && !options.some(o => o.toLowerCase() === input.trim().toLowerCase());

  function select(val) { onChange(val); setInput(''); setOpen(false); }
  function handleKeyDown(e) {
    if (e.key === 'Enter' && input.trim()) { e.preventDefault(); select(input.trim()); }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white flex items-center gap-2 cursor-pointer focus-within:ring-2 focus-within:ring-orange-400 focus-within:border-orange-400"
        onClick={() => setOpen(true)}
      >
        {!open && value ? (
          <span className="flex-1 truncate">{value}</span>
        ) : (
          <input autoFocus={open} value={open ? input : ''}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setOpen(true)} onKeyDown={handleKeyDown}
            placeholder={open ? 'Type to filter or add new…' : value || placeholder}
            className="flex-1 outline-none bg-transparent text-sm placeholder:text-slate-400"
          />
        )}
        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 && !isNew && (
            <p className="px-3 py-2 text-xs text-slate-400">No options found</p>
          )}
          {filtered.map(opt => (
            <button key={opt} type="button" onClick={() => select(opt)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 hover:text-orange-700 transition-colors ${opt === value ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-slate-700'}`}>
              {opt}
            </button>
          ))}
          {isNew && (
            <button type="button" onClick={() => select(input.trim())}
              className="w-full text-left px-3 py-2 text-sm text-orange-600 font-semibold hover:bg-orange-50 border-t border-slate-100 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add "{input.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  category: 'GENERAL',
  keywords: '',
  question: '',
  answer: '',
  isActive: true,
};

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  // skip header row (index 0)
  return lines.slice(1).map(line => {
    // simple comma split — won't handle quoted commas but fine for structured data
    const cols = line.split(',');
    return {
      category: (cols[0] || '').trim().toUpperCase() || 'GENERAL',
      keywords: (cols[1] || '').trim(),
      question: (cols[2] || '').trim(),
      answer:   cols.slice(3).join(',').trim(), // rejoin in case answer has commas
    };
  }).filter(r => r.question && r.answer);
}

// ── Import Modal ──────────────────────────────────────────────────────────────

function ImportModal({ open, onClose, onImported }) {
  const [file,         setFile]         = useState(null);
  const [parsed,       setParsed]       = useState([]);
  const [importing,    setImporting]    = useState(false);
  const [importErr,    setImportErr]    = useState('');
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setParsed([]);
      setImportErr('');
      setImportResult(null);
    }
  }, [open]);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setImportErr('');
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result || '');
      if (rows.length === 0) {
        setImportErr('No valid rows found. Ensure columns are: CATEGORY, KEYWORDS, QUESTION, ANSWER');
      }
      setParsed(rows);
    };
    reader.readAsText(f);
  }

  async function handleImport() {
    if (!parsed.length) return;
    setImporting(true);
    setImportErr('');
    try {
      const res = await fetch('/api/automation/knowledge/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: parsed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const d = await res.json();
      setImportResult(d);
      onImported();
    } catch (e) {
      setImportErr(e.message);
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 z-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Import Knowledge from CSV</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Upload a CSV file with columns: <span className="font-mono font-semibold">CATEGORY, KEYWORDS, QUESTION, ANSWER</span>.<br />
            The first row should be the header row.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">CSV File</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 file:cursor-pointer"
            />
          </div>

          {parsed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">{parsed.length} rows detected — preview (first 3):</p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-[10px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-semibold text-slate-500">Category</th>
                      <th className="text-left px-2 py-1.5 font-semibold text-slate-500">Keywords</th>
                      <th className="text-left px-2 py-1.5 font-semibold text-slate-500">Question</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 text-slate-600">{row.category}</td>
                        <td className="px-2 py-1.5 text-slate-500 truncate max-w-[100px]">{row.keywords}</td>
                        <td className="px-2 py-1.5 text-slate-600 truncate max-w-[180px]">{row.question}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importErr && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{importErr}</p>
          )}

          {importResult && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Successfully imported {importResult.count ?? importResult.imported ?? parsed.length} entries.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
            {importResult ? 'Close' : 'Cancel'}
          </button>
          {!importResult && (
            <button
              onClick={handleImport}
              disabled={importing || parsed.length === 0}
              className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {importing && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {importing ? 'Importing…' : `Import ${parsed.length} entr${parsed.length === 1 ? 'y' : 'ies'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Entry Drawer ──────────────────────────────────────────────────────────────

function EntryDrawer({ open, onClose, entry, onSaved }) {
  const [form,            setForm]           = useState(EMPTY_FORM);
  const [saving,          setSaving]         = useState(false);
  const [err,             setErr]            = useState('');
  const [categoryOptions, setCategoryOptions]= useState(DEFAULT_CATEGORIES);

  // Load any custom categories already used in existing entries
  useEffect(() => {
    fetch('/api/automation/knowledge')
      .then(r => r.json())
      .then(d => {
        const existing = (d.entries || []).map(e => e.category).filter(Boolean);
        const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...existing]));
        setCategoryOptions(merged);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setForm(entry ? { ...EMPTY_FORM, ...entry } : EMPTY_FORM);
      setErr('');
    }
  }, [open, entry]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.question.trim()) { setErr('Question is required.'); return; }
    if (!form.answer.trim())   { setErr('Answer is required.'); return; }
    setSaving(true);
    setErr('');
    try {
      const url    = entry ? `/api/automation/knowledge/${entry.id}` : '/api/automation/knowledge';
      const method = entry ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Error ${res.status}`);
      }
      const saved = await res.json();
      onSaved(saved, !!entry);
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
      <div className={`fixed top-0 right-0 bottom-0 w-[480px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">{entry ? 'Edit Entry' : 'Add Entry'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Category
              <span className="ml-1.5 text-[10px] font-normal text-slate-400">type to add new</span>
            </label>
            <CreatableSelect
              value={form.category}
              onChange={v => set('category', v)}
              options={categoryOptions}
              placeholder="Select or type a category…"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Keywords</label>
            <input
              type="text"
              value={form.keywords}
              onChange={e => set('keywords', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="comma-separated: fixture, budget, schedule"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Question <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.question}
              onChange={e => set('question', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="What is a typical lead time for custom fixtures?"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Answer <span className="text-red-500">*</span></label>
            <textarea
              rows={6}
              value={form.answer}
              onChange={e => set('answer', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              placeholder="Custom fixture lead times typically run 8–14 weeks..."
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => set('isActive', e.target.checked)}
              className="w-4 h-4 rounded accent-orange-600"
            />
            <span className="text-xs text-slate-700 font-medium">Active</span>
          </label>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">{err}</p>
          )}
        </form>

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
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const [entries,        setEntries]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showDrawer,     setShowDrawer]     = useState(false);
  const [editingEntry,   setEditingEntry]   = useState(null);
  const [showImport,     setShowImport]     = useState(false);
  const [err,            setErr]            = useState('');
  const debounceRef = useRef(null);

  const load = useCallback(async (q, cat) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q)   params.set('q', q);
      if (cat) params.set('category', cat);
      const res = await fetch(`/api/automation/knowledge?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setEntries(d.entries || d || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load('', ''); }, [load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load(search, categoryFilter);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, categoryFilter, load]);

  async function handleArchive(entry) {
    try {
      const res = await fetch(`/api/automation/knowledge/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (res.ok) {
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, isActive: false } : e));
      }
    } catch {}
  }

  function openNew() {
    setEditingEntry(null);
    setShowDrawer(true);
  }

  function openEdit(e) {
    setEditingEntry(e);
    setShowDrawer(true);
  }

  function handleSaved(saved, isEdit) {
    if (isEdit) {
      setEntries(prev => prev.map(e => e.id === saved.id ? saved : e));
    } else {
      setEntries(prev => [...prev, saved]);
    }
  }

  // Group by category
  const grouped = entries.reduce((acc, e) => {
    const cat = e.category || 'GENERAL';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(e);
    return acc;
  }, {});

  const groupKeys = Object.keys(grouped).sort();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <AutomationNav />
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Bot Knowledge</h1>
        <p className="text-xs text-slate-500 mt-0.5">Searchable knowledge the bot draws from when drafting emails.</p>
      </div>

      {err && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search entries…"
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          {CATEGORY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => setShowImport(true)}
          className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
        >
          Import from CSV
        </button>
        <button
          onClick={openNew}
          className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors"
        >
          + Add Entry
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">No knowledge entries yet</p>
            <p className="text-xs text-slate-400">Add entries manually or import from a CSV file.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {groupKeys.filter(cat => grouped[cat].some(e => e.isActive)).map(cat => (
            <div key={cat} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{cat}</span>
                <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{grouped[cat].filter(e => e.isActive).length}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {grouped[cat].filter(e => e.isActive).map(entry => (
                  <div
                    key={entry.id}
                    className={`py-3 flex items-start justify-between gap-3 ${!entry.isActive ? 'opacity-50' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-slate-800 leading-snug">{entry.question}</p>
                        {!entry.isActive && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{entry.answer}</p>
                      {entry.keywords && (
                        <p className="text-[10px] text-slate-400 mt-1 font-mono">{entry.keywords}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(entry)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-orange-600 px-2 py-1 rounded hover:bg-orange-50 transition-colors"
                      >
                        Edit
                      </button>
                      {entry.isActive && (
                        <button
                          onClick={() => handleArchive(entry)}
                          className="text-[11px] font-semibold text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <DisabledSection count={entries.filter(e => !e.isActive).length} label="Archived entries">
            <div className="divide-y divide-slate-100">
              {entries.filter(e => !e.isActive).map(entry => (
                <button key={entry.id} onClick={() => openEdit(entry)} className="w-full flex items-center gap-2 py-2 text-left">
                  <span className="text-xs font-semibold text-slate-600 truncate">{entry.question}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{entry.category}</span>
                  <span className="ml-auto text-[10px] text-orange-600 font-semibold shrink-0">Edit to restore</span>
                </button>
              ))}
            </div>
          </DisabledSection>
        </div>
      )}

      <EntryDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        entry={editingEntry}
        onSaved={handleSaved}
      />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => load(search, categoryFilter)}
      />
    </div>
  );
}
