'use client';
import { useState, useRef, useEffect } from 'react';

// ── Inline markdown renderer ───────────────────────────────────────────────────
function renderInline(text) {
  const parts = [];
  const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] !== undefined) parts.push(<strong key={m.index} className="font-semibold">{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<code key={m.index} className="bg-slate-100 rounded px-1 text-xs font-mono">{m[3]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownContent({ content }) {
  const lines = content.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (/^#{1,3} /.test(trimmed)) {
      blocks.push({ type: 'heading', text: trimmed.replace(/^#+\s*/, '') }); i++;
    } else if (/^[-•*] /.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-•*] /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-•*] /, '')); i++;
      }
      blocks.push({ type: 'list', items });
    } else if (/^\d+\. /.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\. /, '')); i++;
      }
      blocks.push({ type: 'ol', items });
    } else if (trimmed === '' || /^[-─]{3,}$/.test(trimmed)) {
      blocks.push({ type: 'spacer' }); i++;
    } else {
      let text = trimmed;
      while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !/^[-•*#\d]/.test(lines[i + 1].trim())) {
        i++; text += ' ' + lines[i].trim();
      }
      blocks.push({ type: 'p', text }); i++;
    }
  }
  return (
    <div className="space-y-1.5 text-sm text-slate-700 leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === 'heading') return <p key={i} className="font-bold text-slate-800 mt-1">{renderInline(b.text)}</p>;
        if (b.type === 'list')    return <ul key={i} className="space-y-0.5 pl-3">{b.items.map((t, j) => <li key={j} className="flex gap-1.5"><span className="text-violet-400 shrink-0">•</span><span>{renderInline(t)}</span></li>)}</ul>;
        if (b.type === 'ol')      return <ol key={i} className="space-y-0.5 pl-3">{b.items.map((t, j) => <li key={j} className="flex gap-1.5"><span className="text-slate-400 shrink-0 w-4 text-right">{j + 1}.</span><span>{renderInline(t)}</span></li>)}</ol>;
        if (b.type === 'spacer')  return <div key={i} className="h-1" />;
        if (b.type === 'p')       return <p key={i}>{renderInline(b.text)}</p>;
        return null;
      })}
    </div>
  );
}

function ConfidenceBadge({ text }) {
  if (!text) return null;
  if (text.includes('✅ CERTAIN'))
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">✅ CERTAIN</span>;
  if (text.includes('⚠️ LIKELY'))
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⚠️ LIKELY</span>;
  if (text.includes('🔍 VERIFY WITH EOR'))
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">🔍 VERIFY WITH EOR</span>;
  return null;
}

const QUICK_QUESTIONS = [
  'What are the lighting and emergency lighting requirements for dwelling units?',
  'What are the code requirements for corridor lighting and emergency lighting?',
  'What are the lighting requirements for electrical and mechanical rooms (life safety)?',
  'What are the lighting and LPD requirements for interior amenity areas (clubhouse, fitness, leasing)?',
  'What are the lighting requirements for exterior egress doors and exit paths?',
  'What are the code requirements for stairwell lighting and emergency lighting?',
  'What are the lighting requirements for pool equipment rooms?',
  'What are the lighting requirements for resident storage areas and bike rooms?',
];

// ── Main component ─────────────────────────────────────────────────────────────
// projectContext: { projectName, buildingType, city, state, serviceType }
export default function ProjectCodeSearch({ projectContext = {} }) {
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState('');
  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  // Auto-scroll the chat container — only if the user is already near the bottom
  // (within 150px), so manual scroll-up is never fought during streaming.
  useEffect(() => {
    const el = containerRef.current;
    if (!open || !el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [history, current, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  async function handleSearch(q) {
    const searchQuery = (q || query).trim();
    if (!searchQuery || loading) return;

    setQuery('');
    setLoading(true);
    setCurrent('');

    const newUserMsg = { role: 'user', content: searchQuery };
    setHistory(prev => [...prev, newUserMsg]);

    try {
      const res = await fetch('/api/knowledge/code-search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          query: searchQuery,
          history,
          projectContext,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        setHistory(prev => [...prev, { role: 'assistant', content: `Error: ${err}` }]);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setCurrent(answer);
      }

      setHistory(prev => [...prev, { role: 'assistant', content: answer }]);
      setCurrent('');
    } catch (e) {
      setHistory(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch(); }
  }

  // Context chips — show location, building type, and any set code editions
  const { codes = {} } = projectContext;
  const codeChips = [
    codes.iecc   ? `IECC ${codes.iecc}`   : null,
    codes.ibc    ? `IBC ${codes.ibc}`     : null,
    codes.nec    ? `NEC ${codes.nec}`     : null,
    codes.ashrae ? `ASHRAE ${codes.ashrae}` : null,
    codes.nfpa   ? `NFPA ${codes.nfpa}`   : null,
  ].filter(Boolean);
  const contextChips = [
    projectContext.buildingType,
    projectContext.city && projectContext.state
      ? `${projectContext.city}, ${projectContext.state}`
      : projectContext.state || projectContext.city,
    ...codeChips,
  ].filter(Boolean);

  const isEmpty = history.length === 0 && !current;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

      {/* ── Header / toggle ─────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-base shrink-0">⚖️</div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Code Intelligence</p>
            <p className="text-sm font-semibold text-slate-800">Ask a code question for this project</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {contextChips.length > 0 && !open && (
            <div className="hidden sm:flex items-center gap-1.5">
              {contextChips.map((chip, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-medium">
                  {chip}
                </span>
              ))}
            </div>
          )}
          {history.length > 0 && !open && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
              {history.filter(h => h.role === 'user').length} {history.filter(h => h.role === 'user').length === 1 ? 'question' : 'questions'}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* ── Expanded content ─────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-slate-100">

          {/* Context banner */}
          {contextChips.length > 0 && (
            <div className="px-6 py-2.5 bg-violet-50 border-b border-violet-100 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">Project context:</span>
              {contextChips.map((chip, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white text-violet-700 border border-violet-200 font-medium">
                  {chip}
                </span>
              ))}
              <span className="text-[10px] text-violet-400 ml-1">— answers are scoped to this project</span>
            </div>
          )}

          {/* Conversation or quick questions */}
          <div ref={containerRef} className="px-6 py-4 max-h-96 overflow-y-auto space-y-3">
            {isEmpty && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Common questions for this project:</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {QUICK_QUESTIONS.map((q, i) => (
                    <button key={i} onClick={() => handleSearch(q)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] bg-violet-600 text-white rounded-xl rounded-tr-sm px-3 py-2 text-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[95%] bg-slate-50 rounded-xl rounded-tl-sm border border-slate-200 px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Code Reference</span>
                      <ConfidenceBadge text={msg.content} />
                    </div>
                    <MarkdownContent content={msg.content} />
                  </div>
                )}
              </div>
            ))}

            {(loading || current) && (
              <div className="flex justify-start">
                <div className="max-w-[95%] bg-slate-50 rounded-xl rounded-tl-sm border border-slate-200 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Code Reference</span>
                    {loading && !current && (
                      <div className="flex gap-1">
                        {[0,1,2].map(d => (
                          <span key={d} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d*0.15}s` }} />
                        ))}
                      </div>
                    )}
                  </div>
                  {current && <MarkdownContent content={current} />}
                </div>
              </div>
            )}

          </div>

          {/* Input bar */}
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a code question…"
                disabled={loading}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-60 placeholder:text-slate-400"
              />
              <button
                onClick={() => handleSearch()}
                disabled={!query.trim() || loading}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0">
                {loading
                  ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                }
                {loading ? 'Searching…' : 'Ask'}
              </button>
              {!isEmpty && (
                <button
                  onClick={() => { setHistory([]); setCurrent(''); }}
                  title="Clear conversation"
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              ASHRAE 90.1 · IBC · IECC · NEC — answers include section citations
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
