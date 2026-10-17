'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

// ── Markdown renderer (reused from existing KB chat) ─────────────────────────
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

function parseMarkdown(content) {
  const lines = content.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^#{1,3} /.test(trimmed)) {
      const level = trimmed.match(/^(#+)/)[1].length;
      blocks.push({ type: 'heading', level, text: trimmed.replace(/^#+\s*/, '') });
      i++;
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
      blocks.push({ type: 'ordered-list', items });
    } else if (/^[-─]{3,}$/.test(trimmed)) {
      blocks.push({ type: 'hr' }); i++;
    } else if (trimmed === '') {
      blocks.push({ type: 'spacer' }); i++;
    } else {
      let text = trimmed;
      while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !/^[-•*#\d]/.test(lines[i + 1].trim())) {
        i++; text += ' ' + lines[i].trim();
      }
      blocks.push({ type: 'paragraph', text }); i++;
    }
  }
  return blocks;
}

function MarkdownContent({ content }) {
  const blocks = parseMarkdown(content);
  return (
    <div className="space-y-1.5 text-sm text-slate-700 leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          const Tag = b.level === 1 ? 'h3' : b.level === 2 ? 'h4' : 'h5';
          const cls = b.level === 1 ? 'text-base font-bold text-slate-900 mt-2'
                    : b.level === 2 ? 'text-sm font-bold text-slate-800 mt-1.5'
                    : 'text-sm font-semibold text-slate-700 mt-1';
          return <Tag key={i} className={cls}>{renderInline(b.text)}</Tag>;
        }
        if (b.type === 'list') return (
          <ul key={i} className="space-y-1 pl-4">
            {b.items.map((item, j) => <li key={j} className="flex gap-2"><span className="text-blue-400 shrink-0 mt-0.5">•</span><span>{renderInline(item)}</span></li>)}
          </ul>
        );
        if (b.type === 'ordered-list') return (
          <ol key={i} className="space-y-1 pl-4">
            {b.items.map((item, j) => <li key={j} className="flex gap-2"><span className="text-slate-500 shrink-0 w-4 text-right">{j + 1}.</span><span>{renderInline(item)}</span></li>)}
          </ol>
        );
        if (b.type === 'hr') return <hr key={i} className="border-slate-200 my-2" />;
        if (b.type === 'spacer') return <div key={i} className="h-1" />;
        if (b.type === 'paragraph') return <p key={i}>{renderInline(b.text)}</p>;
        return null;
      })}
    </div>
  );
}

// ── Confidence badge from answer text ─────────────────────────────────────────
function ConfidenceBadge({ text }) {
  if (text.includes('✅ CERTAIN'))
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">✅ CERTAIN</span>;
  if (text.includes('⚠️ LIKELY'))
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⚠️ LIKELY</span>;
  if (text.includes('🔍 VERIFY WITH EOR'))
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">🔍 VERIFY WITH EOR</span>;
  return null;
}

// ── Suggested queries ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'What is the LPD for an open office under ASHRAE 90.1?',
  'What are the emergency lighting requirements for hotel corridors?',
  'How many foot-candles are required for egress paths?',
  'Do I need occupancy sensors in a conference room?',
  'What is the LPD for a hospital operating room?',
  'What controls are required for exterior building lighting?',
  'Can I use dimmers on emergency lighting circuits?',
  'What is the LPD for a parking garage?',
  'What are the requirements for recessed fixtures above insulation?',
  'What is the ASHRAE LPD for a restaurant dining room?',
];

// ── Main component ──────────────────────────────────────────────────────────
export default function CodeSearchClient({ codeMeta = [] }) {
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);   // [{role, content}]
  const [current, setCurrent] = useState('');   // streaming current answer
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, current]);

  async function handleSearch(q) {
    const searchQuery = (q || query).trim();
    if (!searchQuery || loading) return;

    setQuery('');
    setLoading(true);
    setCurrent('');

    const newHistory = [...history, { role: 'user', content: searchQuery }];
    setHistory(newHistory);

    try {
      const res = await fetch('/api/knowledge/code-search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: searchQuery, history }),
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
        const chunk = decoder.decode(value, { stream: true });
        answer += chunk;
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  }

  function clearHistory() {
    setHistory([]);
    setCurrent('');
    setQuery('');
  }

  const isEmpty = history.length === 0 && !current;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between mb-1">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link href="/knowledge-base" className="text-[11px] font-bold text-orange-600 uppercase tracking-wide hover:text-orange-700 transition-colors">
                  ← Knowledge Base
                </Link>
              </div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <span className="text-2xl">⚖️</span>
                Code Search
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">Ask any question about building codes relevant to lighting design</p>
            </div>
            <div className="flex items-center gap-2">
              {!isEmpty && (
                <button onClick={clearHistory}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  New Search
                </button>
              )}
            </div>
          </div>

          {/* Code chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {codeMeta.map(c => (
              <span key={c.code} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {c.code}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">

          {/* Empty state with suggestions */}
          {isEmpty && (
            <div className="space-y-6">
              <div className="text-center py-4">
                <div className="text-4xl mb-3">⚖️</div>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Ask questions about ASHRAE 90.1, IBC, IECC, and NEC requirements for lighting design.
                  Get specific section citations and confidence levels.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Try asking:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} onClick={() => handleSearch(s)}
                      className="text-left px-4 py-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-all shadow-sm">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Conversation */}
          {!isEmpty && (
            <div className="space-y-4">
              {history.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  {msg.role === 'user' ? (
                    <div className="max-w-[80%] bg-orange-500 text-white rounded-xl rounded-tr-sm px-4 py-3 text-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[90%] bg-white rounded-xl rounded-tl-sm border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-5 h-5 rounded-full bg-orange-50 flex items-center justify-center text-[11px]">⚖️</div>
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Code Reference</span>
                          <div className="ml-auto">
                            <ConfidenceBadge text={msg.content} />
                          </div>
                        </div>
                        <MarkdownContent content={msg.content} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming current answer */}
              {(loading || current) && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] bg-white rounded-xl rounded-tl-sm border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-5 h-5 rounded-full bg-orange-50 flex items-center justify-center text-[11px]">⚖️</div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Code Reference</span>
                        {loading && !current && (
                          <div className="flex gap-1 ml-2">
                            {[0, 1, 2].map(d => (
                              <span key={d} className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                            ))}
                          </div>
                        )}
                      </div>
                      {current ? <MarkdownContent content={current} /> : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Search input ──────────────────────────────────────────────────── */}
      <div className="bg-white border-t border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a code question… e.g. 'What is the LPD allowance for a hotel guest room?'"
                rows={2}
                disabled={loading}
                className="w-full text-sm border border-slate-300 rounded-lg px-4 py-3 pr-12 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-all placeholder:text-slate-500 disabled:opacity-60"
              />
              <div className="absolute right-3 bottom-3 text-[11px] text-slate-500">⏎ send</div>
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={!query.trim() || loading}
              className="h-11 px-5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0">
              {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              )}
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Loaded: {codeMeta.map(c => c.code).join(' · ')}
            {' · '}Answers include section citations and confidence levels
          </p>
        </div>
      </div>
    </div>
  );
}
