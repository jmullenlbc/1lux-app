'use client';
import { useState, useRef, useEffect } from 'react';

// ── Markdown renderer (shared with ProjectChat) ───────────────────────────────

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
    <div className="space-y-1.5">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
          return <Tag key={idx} className="font-bold text-slate-900 mt-2 mb-0.5 first:mt-0">{renderInline(block.text)}</Tag>;
        }
        if (block.type === 'list') return (
          <ul key={idx} className="space-y-0.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2 items-start">
                <span className="text-violet-500 mt-0.5 shrink-0">•</span>
                <span>{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        );
        if (block.type === 'ordered-list') return (
          <ol key={idx} className="space-y-0.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2 items-start">
                <span className="text-slate-400 shrink-0 w-4 text-right">{j + 1}.</span>
                <span>{renderInline(item)}</span>
              </li>
            ))}
          </ol>
        );
        if (block.type === 'hr') return <hr key={idx} className="border-slate-200 my-1" />;
        if (block.type === 'spacer') return <div key={idx} className="h-1" />;
        if (block.type === 'paragraph') return <p key={idx}>{renderInline(block.text)}</p>;
        return null;
      })}
    </div>
  );
}

function Message({ role, content, streaming }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${isUser ? 'bg-violet-600 text-white' : 'bg-slate-800 text-white'}`}>
        {isUser ? 'You' : 'AI'}
      </div>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser ? 'bg-violet-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
        {isUser ? <p>{content}</p> : <MarkdownContent content={content} />}
        {streaming && <span className="inline-block w-1.5 h-4 bg-slate-400 animate-pulse ml-0.5 align-middle rounded-sm" />}
      </div>
    </div>
  );
}

// ── Suggested questions ───────────────────────────────────────────────────────

const SUGGESTED = [
  'What are the required corridor disk spacing standards?',
  'What garage fixture specs does ILC typically use?',
  'What dimming standards apply to residential units?',
  'What are the QC checklist requirements before submitting drawings?',
  'What controls standards apply to exterior lighting?',
];

// ── Main component ────────────────────────────────────────────────────────────

export default function KnowledgeBaseChat() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  async function send(question) {
    const q = (question || input).trim();
    if (!q || loading) return;

    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    try {
      const res = await fetch('/api/knowledge-base/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: q, history }),
      });

      if (!res.ok) throw new Error('Request failed');

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   text   = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        const snapshot = text;
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: snapshot, streaming: true };
          return next;
        });
      }

      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: text, streaming: false };
        return next;
      });
    } catch {
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.', streaming: false };
        return next;
      });
    }

    setLoading(false);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function reset() {
    setMessages([]);
    setInput('');
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-violet-700 hover:bg-violet-600 text-white shadow-xl transition-all hover:scale-105"
        >
          {/* Book + sparkle icon */}
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-sm font-semibold">Ask Standards AI</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-40 w-[420px] max-w-[calc(100vw-2rem)] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ height: '540px' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-violet-700 text-white shrink-0">
            <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Standards AI</p>
              <p className="text-[10px] text-violet-200">Ask anything about ILC design standards</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={reset}
                className="text-violet-200 hover:text-white text-[10px] font-medium px-2 py-1 rounded-lg hover:bg-violet-600 transition-colors mr-1"
                title="Start new conversation"
              >
                New chat
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-violet-200 hover:text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-4">
                <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Ask about ILC Design Standards</p>
                  <p className="text-xs text-slate-400 mt-1">Get instant answers from the full standards library</p>
                </div>
                <div className="flex flex-col gap-1.5 w-full">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="text-left text-xs px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <Message key={i} role={m.role} content={m.content} streaming={m.streaming} />
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input bar */}
          <div className="px-4 py-3 border-t border-slate-200 bg-white shrink-0">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about ILC design standards…"
                rows={1}
                className="flex-1 resize-none text-sm text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-violet-400 transition-colors"
                style={{ maxHeight: '100px', overflowY: 'auto' }}
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  );
}
