'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

// ── Markdown renderer ─────────────────────────────────────────────────────────

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
                <span className="text-amber-500 mt-0.5 shrink-0">•</span>
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
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${isUser ? 'bg-amber-500 text-white' : 'bg-slate-800 text-white'}`}>
        {isUser ? 'You' : 'AI'}
      </div>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser ? 'bg-amber-500 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
        {isUser ? <p>{content}</p> : <MarkdownContent content={content} />}
        {streaming && <span className="inline-block w-1.5 h-4 bg-slate-400 animate-pulse ml-0.5 align-middle rounded-sm" />}
      </div>
    </div>
  );
}

// ── Date grouping helpers ─────────────────────────────────────────────────────

function dateGroup(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const conv  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff  = Math.floor((today - conv) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return 'This Week';
  if (diff < 30) return 'This Month';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectChat({ projectId }) {
  const [open,           setOpen]          = useState(false);
  const [view,           setView]          = useState('list');  // 'list' | 'chat'
  const [conversations,  setConversations] = useState([]);
  const [convsLoading,   setConvsLoading]  = useState(false);
  const [activeConvId,   setActiveConvId]  = useState(null);
  const [messages,       setMessages]      = useState([]);
  const [input,          setInput]         = useState('');
  const [loading,        setLoading]       = useState(false);
  const [deletingId,     setDeletingId]    = useState(null);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // ── Load conversation list ────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    setConvsLoading(true);
    try {
      const res  = await fetch(`/api/projects/${projectId}/chat/conversations`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {}
    setConvsLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (open && view === 'list') loadConversations();
  }, [open, view, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && view === 'chat') setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, view]);

  // ── Open a previous conversation ──────────────────────────────────────────

  async function openConversation(convId) {
    setActiveConvId(convId);
    setMessages([]);
    setView('chat');
    try {
      const res  = await fetch(`/api/projects/${projectId}/chat/conversations/${convId}`);
      const data = await res.json();
      setMessages((data.messages || []).map(m => ({ role: m.role, content: m.content })));
    } catch {}
  }

  // ── Start a new conversation ──────────────────────────────────────────────

  function newConversation() {
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    setView('chat');
  }

  // ── Send a message ────────────────────────────────────────────────────────

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: q, history, conversationId: activeConvId }),
      });

      if (!res.ok) throw new Error('Request failed');

      // Grab the conversation ID from header so subsequent messages thread correctly
      const returnedConvId = res.headers.get('X-Conversation-Id');
      if (returnedConvId && !activeConvId) setActiveConvId(returnedConvId);

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

  // ── Delete a conversation ─────────────────────────────────────────────────

  async function deleteConversation(e, convId) {
    e.stopPropagation();
    setDeletingId(convId);
    try {
      await fetch(`/api/projects/${projectId}/chat/conversations/${convId}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== convId));
    } catch {}
    setDeletingId(null);
  }

  // ── Back to list ──────────────────────────────────────────────────────────

  function backToList() {
    setView('list');
    setActiveConvId(null);
    setMessages([]);
  }

  // ── Grouped conversations ─────────────────────────────────────────────────

  const grouped = conversations.reduce((acc, c) => {
    const g = dateGroup(c.createdAt);
    if (!acc[g]) acc[g] = [];
    acc[g].push(c);
    return acc;
  }, {});
  const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month'];
  const sortedGroups = [
    ...GROUP_ORDER.filter(g => grouped[g]),
    ...Object.keys(grouped).filter(g => !GROUP_ORDER.includes(g)).sort().reverse(),
  ];

  const totalAiReplies = messages.filter(m => m.role === 'assistant').length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white shadow-xl transition-all hover:scale-105"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-sm font-semibold">Ask AI</span>
          {conversations.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {conversations.length}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[420px] max-w-[calc(100vw-2rem)] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ height: '560px' }}>

          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 text-white shrink-0">
            {view === 'chat' && (
              <button onClick={backToList} className="text-slate-400 hover:text-white -ml-1 mr-0.5 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {view === 'list' ? 'Ask AI' : (activeConvId ? 'Conversation' : 'New Chat')}
              </p>
              <p className="text-[10px] text-slate-400">
                {view === 'list' ? 'Reads all uploaded project documents' : 'Answers from your project documents'}
              </p>
            </div>
            {view === 'list' && (
              <button onClick={newConversation}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-medium transition-colors shrink-0">
                + New
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white ml-1 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── List view ── */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto bg-slate-50">
              {convsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <svg className="animate-spin w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-6 px-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-200 flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">No conversations yet</p>
                    <p className="text-xs text-slate-400 mt-1">Start a new chat to ask questions about this project</p>
                  </div>
                  <button onClick={newConversation}
                    className="mt-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-medium transition-colors">
                    Start a conversation
                  </button>
                </div>
              ) : (
                <div className="p-3 space-y-4">
                  {sortedGroups.map(group => (
                    <div key={group}>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1.5">{group}</p>
                      <div className="space-y-1">
                        {grouped[group].map(conv => (
                          <button key={conv.id} onClick={() => openConversation(conv.id)}
                            className="group w-full text-left px-3 py-2.5 rounded-xl bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-200 transition-all">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-slate-800 font-medium truncate flex-1">{conv.title}</p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] text-slate-400">{fmtTime(conv.createdAt)}</span>
                                <button
                                  onClick={e => deleteConversation(e, conv.id)}
                                  disabled={deletingId === conv.id}
                                  className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-slate-300 hover:text-red-400 transition-all"
                                >
                                  {deletingId === conv.id ? (
                                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                                    </svg>
                                  ) : (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {conv.messageCount} message{conv.messageCount !== 1 ? 's' : ''}
                              {conv.lastMessage && ` · ${conv.lastMessage.content.slice(0, 40)}${conv.lastMessage.content.length > 40 ? '…' : ''}`}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Chat view ── */}
          {view === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-6">
                    <div className="w-12 h-12 rounded-2xl bg-slate-200 flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Ask anything about this project</p>
                      <p className="text-xs text-slate-400 mt-1">Answers come from your uploaded documents</p>
                    </div>
                    <div className="flex flex-col gap-1.5 w-full mt-2">
                      {[
                        'What fixture types are specified in the drawings?',
                        'Summarize the open RFIs',
                        'What is the current contract value?',
                      ].map(q => (
                        <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }}
                          className="text-left text-xs px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-700 transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <Message key={i} role={m.role} content={m.content} streaming={m.streaming} />
                ))}
                <div ref={bottomRef} />
              </div>

              <div className="px-4 py-3 border-t border-slate-200 bg-white shrink-0">
                <div className="flex gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask a question about this project…"
                    rows={1}
                    className="flex-1 resize-none text-sm text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400 transition-colors"
                    style={{ maxHeight: '120px', overflowY: 'auto' }}
                  />
                  <button
                    onClick={send}
                    disabled={loading || !input.trim()}
                    className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
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
            </>
          )}
        </div>
      )}
    </>
  );
}
