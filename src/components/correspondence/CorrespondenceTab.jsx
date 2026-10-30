'use client';
import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { FilterToolbar, FilterPanel } from '@/components/ui/FilterPanel';
import EmailTagTargets, { startEmailDrag, untagEmailMessage } from '@/components/email/EmailTagTargets';

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#1d4ed8','#0891b2','#059669','#d97706','#dc2626',
  '#7c3aed','#db2777','#0f766e','#b45309','#1e40af',
];

const TAG_STYLES = {
  Design:    'bg-blue-50 text-blue-700',
  RFI:       'bg-purple-50 text-purple-700',
  Schedule:  'bg-green-50 text-green-700',
  Contract:  'bg-amber-50 text-amber-700',
  Budget:    'bg-pink-50 text-pink-700',
  CO:        'bg-orange-50 text-orange-700',
  PO:        'bg-green-50 text-green-700',
  ESD:       'bg-teal-50 text-teal-700',
  Submittal: 'bg-indigo-50 text-indigo-700',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarColor(email = '') {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name, email) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

function relativeTime(d) {
  const now  = new Date();
  const date = new Date(d);
  const diffMin = Math.floor((now - date) / 60000);
  const diffHr  = Math.floor((now - date) / 3600000);

  if (diffMin < 60)  return `${diffMin}m ago`;
  if (diffHr  < 24)  return `${diffHr}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function fileIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('image')) return '🖼️';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  return '📎';
}

function sanitizeHtml(html) {
  if (!html || typeof window === 'undefined') return html ?? '';
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
}

// ── Tag chip ──────────────────────────────────────────────────────────────────

function TagChip({ tag, small }) {
  const cls = TAG_STYLES[tag] ?? 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold ${cls} ${small ? '' : ''}`}>
      {tag}
    </span>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 p-4">
      {[0, 1, 2].map(i => (
        <div key={i} className="border border-slate-100 rounded-lg p-3 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-slate-200" />
            <div className="h-2.5 bg-slate-200 rounded flex-1 max-w-[120px]" />
          </div>
          <div className="h-2 bg-slate-200 rounded mb-1.5 w-4/5" />
          <div className="h-2 bg-slate-100 rounded w-3/5" />
        </div>
      ))}
    </div>
  );
}

// ── Thread row ────────────────────────────────────────────────────────────────

function ThreadRow({ thread, selected, unread, onClick }) {
  const tags = thread.tags?.slice(0, 3) ?? [];
  const overflow = (thread.tags?.length ?? 0) - 3;
  return (
    <div
      onClick={onClick}
      className={[
        'px-3 py-2.5 border-b border-slate-100 cursor-pointer relative transition-colors',
        selected
          ? 'bg-[#fefdf9] border-l-[3px] border-l-amber-400 pl-[9px]'
          : 'border-l-[3px] border-l-transparent hover:bg-slate-50',
      ].join(' ')}
    >
      {/* Unread dot */}
      {unread && (
        <span className="absolute top-3 right-3 w-[7px] h-[7px] bg-orange-500 rounded-full" />
      )}

      {/* Row 1: avatar + sender + time */}
      <div className="flex items-center gap-1.5 mb-1 pr-3">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
          style={{ background: avatarColor(thread.senderEmail) }}
        >
          {initials(thread.senderName, thread.senderEmail)}
        </div>
        <span className={`flex-1 text-[11px] truncate ${unread ? 'font-semibold text-[#1a1a1a]' : 'text-[#4a4540]'}`}>
          {thread.senderName || thread.senderEmail}
        </span>
        <span className="text-[11px] text-[#b8b2a8] shrink-0">
          {relativeTime(thread.latestReceivedAt)}
        </span>
      </div>

      {/* Row 2: subject */}
      <div className={`text-[11px] truncate mb-1 ${unread ? 'font-medium text-[#2a2520]' : 'text-[#6b6560]'}`}>
        {thread.subject}
      </div>

      {/* Row 3: preview */}
      <div className="text-[11px] text-[#b8b2a8] truncate mb-1.5">
        {thread.latestPreview}
      </div>

      {/* Row 4: tag chips */}
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {tags.map(t => <TagChip key={t} tag={t} small />)}
          {overflow > 0 && (
            <span className="text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
              +{overflow}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Message card ──────────────────────────────────────────────────────────────

function MessageCard({ message, isLatest, collapsed, onToggle, onUntag }) {
  const color = avatarColor(message.fromEmail);
  const init  = initials(message.fromName, message.fromEmail);

  return (
    <div className={[
      'border rounded-xl overflow-hidden mb-3',
      isLatest ? 'border-[#bfdbfe]' : 'border-slate-200',
      collapsed ? 'opacity-65' : '',
    ].join(' ')}>

      {/* Header. Drag it onto a tag above to tag this email (0118). */}
      <div
        draggable
        onDragStart={e => startEmailDrag(e, message.id)}
        title="Drag onto a tag to tag this email"
        onClick={collapsed ? onToggle : undefined}
        className={[
          'flex items-center gap-2.5 px-4 py-2.5 cursor-grab active:cursor-grabbing',
          isLatest ? 'bg-[#eff6ff] border-b border-[#dbeafe]' : 'bg-[#faf9f7] border-b border-slate-100',
          collapsed ? 'cursor-pointer hover:bg-slate-50' : '',
        ].join(' ')}
      >
        <div
          className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ background: color }}
        >
          {init}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[#1a1a1a]">
              {message.fromName || message.fromEmail}
            </span>
            {isLatest && (
              <span className="text-[11px] font-semibold bg-[#dbeafe] text-[#1e40af] px-1.5 py-0.5 rounded">
                New
              </span>
            )}
            {message.messageTags?.map(t => (
              <span
                key={t.key}
                className="text-[11px] font-semibold px-1.5 py-0.5 rounded border bg-white"
                style={{ borderColor: t.color || '#cbd5e1', color: t.color || '#475569' }}
              >
                {t.label}
                <button
                  type="button"
                  title="Remove this tag"
                  onClick={e => { e.stopPropagation(); onUntag?.(message.id, t.key); }}
                  className="ml-1 text-slate-400 hover:text-slate-700"
                >x</button>
              </span>
            ))}
          </div>
          {!collapsed && (
            <div className="text-[11px] text-[#9a9589]">
              {message.fromEmail}{message.company ? ` · ${message.company}` : ''}
            </div>
          )}
          {collapsed && (
            <div className="text-[11px] text-[#9a9589] truncate max-w-[300px]">
              {message.bodyPreview}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-[#b8b2a8]">{fmtTime(message.receivedAt)}</span>
          {message.webUrl && (
            <a
              href={message.webUrl}
              target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[11px] text-blue-500 flex items-center gap-0.5 hover:text-orange-600"
            >
              Outlook →
            </a>
          )}
          {!isLatest && (
            <button
              onClick={onToggle}
              className="text-[11px] text-slate-400 hover:text-slate-600"
            >
              {collapsed ? '▼' : '▲'}
            </button>
          )}
        </div>
      </div>

      {/* Body + attachments (hidden when collapsed) */}
      {!collapsed && (
        <>
          <div
            className="px-4 py-3 text-xs text-[#4a4540] leading-[1.7]"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.bodyHtml || message.bodyPreview || '') }}
          />
          {message.attachments?.length > 0 && (
            <div className="border-t border-slate-100">
              {message.attachments.map(att => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-4 py-2 bg-[#faf9f7] border-b border-slate-50 last:border-0"
                  style={{ cursor: 'default' }}
                >
                  <span className="text-sm">{fileIcon(att.mimeType)}</span>
                  <span className="text-[11px] text-[#6b6560] flex-1">{att.filename}</span>
                  {att.size && (
                    <span className="text-[11px] text-[#b8b2a8]">{fmtSize(att.size)}</span>
                  )}
                  <span className="text-[11px] text-[#b8b2a8] italic">Download coming soon</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CorrespondenceTab({ projectId, projectName }) {
  const [threads,         setThreads]         = useState([]);
  const [threadsLoading,  setThreadsLoading]   = useState(true);
  const [selectedConvId,  setSelectedConvId]   = useState(null);
  const [messages,        setMessages]         = useState([]);
  const [msgsLoading,     setMsgsLoading]      = useState(false);
  const [readIds,         setReadIds]          = useState(new Set()); // locally marked read
  const [search,          setSearch]           = useState('');
  const [activePills,     setActivePills]      = useState(['All']);
  const [filtersOpen,     setFiltersOpen]      = useState(false);
  const [collapsedMsgs,   setCollapsedMsgs]    = useState({}); // msgId → bool

  // Fetch thread list
  useEffect(() => {
    fetch(`/api/projects/${projectId}/correspondence/threads`)
      .then(r => r.json())
      .then(d => { setThreads(d.threads ?? []); setThreadsLoading(false); })
      .catch(() => setThreadsLoading(false));
  }, [projectId]);

  // Open a thread
  const openThread = useCallback((convId) => {
    setSelectedConvId(convId);
    setMsgsLoading(true);
    setCollapsedMsgs({});

    // Optimistic mark-as-read
    setReadIds(prev => new Set([...prev, convId]));
    fetch(`/api/projects/${projectId}/correspondence/threads/${encodeURIComponent(convId)}/read`, {
      method: 'PATCH',
    }).catch(() => {});

    fetch(`/api/projects/${projectId}/correspondence/threads/${encodeURIComponent(convId)}`)
      .then(r => r.json())
      .then(d => {
        const msgs = d.messages ?? [];
        setMessages(msgs);
        // All but the latest start collapsed
        const initCollapsed = {};
        msgs.forEach((m, i) => { if (i < msgs.length - 1) initCollapsed[m.id] = true; });
        setCollapsedMsgs(initCollapsed);
        setMsgsLoading(false);
      })
      .catch(() => setMsgsLoading(false));
  }, [projectId]);

  function toggleMsgCollapse(msgId) {
    setCollapsedMsgs(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  }

  // Tags as rows (0118): a drop or a click on a tag adds it, the x removes it.
  function onTagged(messageId, tag) {
    setMessages(prev => prev.map(m => m.id !== messageId || m.messageTags?.some(t => t.key === tag.key)
      ? m
      : { ...m, messageTags: [...(m.messageTags || []), { key: tag.key, label: tag.label, color: tag.color || null }] }));
  }
  async function onUntag(messageId, tagKey) {
    try {
      await untagEmailMessage(messageId, tagKey);
      setMessages(prev => prev.map(m => m.id !== messageId ? m : { ...m, messageTags: (m.messageTags || []).filter(t => t.key !== tagKey) }));
    } catch {}
  }
  const latestMessageId = messages.length ? messages[messages.length - 1].id : null;

  // Derive all tags present in this project's threads
  const allTags = [...new Set(threads.flatMap(t => t.tags ?? []))].sort();

  function togglePill(pill) {
    if (pill === 'All') {
      setActivePills(['All']);
      return;
    }
    setActivePills(prev => {
      const withoutAll = prev.filter(p => p !== 'All');
      const already    = withoutAll.includes(pill);
      const next       = already ? withoutAll.filter(p => p !== pill) : [...withoutAll, pill];
      return next.length === 0 ? ['All'] : next;
    });
  }

  // Filter threads
  const isThreadUnread = t => (t.unreadCount > 0) && !readIds.has(t.conversationId);

  const filtered = threads.filter(t => {
    // Tag filter
    if (!activePills.includes('All')) {
      const hasAll = activePills.every(pill => t.tags?.includes(pill));
      if (!hasAll) return false;
    }
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.subject?.toLowerCase().includes(q) ||
        t.senderName?.toLowerCase().includes(q) ||
        t.latestPreview?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalUnread = threads.filter(isThreadUnread).length;
  const selectedThread = threads.find(t => t.conversationId === selectedConvId) ?? null;

  // ── Empty state: no emails at all ──────────────────────────────────────────
  if (!threadsLoading && threads.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-220px)]">
        <div className="text-center">
          <svg className="w-8 h-8 text-[#d0ccc4] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-semibold text-slate-700 mb-1">No correspondence yet</p>
          <p className="text-xs text-slate-400">
            Emails you label in Outlook with "{projectName}" will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-220px)] border-t border-slate-200">

      {/* ── Thread list ───────────────────────────────────────────────────── */}
      {/* Phones show the list or the open thread, never both (Mike 10-29) */}
      <div className={`${selectedThread ? 'hidden md:flex' : 'flex'} w-full md:w-[272px] shrink-0 md:border-r border-[#ede9e2] flex-col bg-[#faf9f7] overflow-hidden`}>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#ede9e2]">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b6560]">Threads</span>
          <span className="text-[11px] text-[#b8b2a8]">
            {threads.length} total{totalUnread > 0 ? ` · ${totalUnread} unread` : ''}
          </span>
        </div>

        {/* Search */}
        <div className="px-2.5 py-2 border-b border-[#ede9e2]">
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#b8b2a8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search correspondence…"
              className="w-full text-base md:text-[11px] border border-[#e8e4dc] rounded-md pl-6 pr-2 py-1.5 text-[#4a4540] bg-white outline-none focus:border-orange-500 placeholder:text-[#b8b2a8]"
            />
          </div>
        </div>

        {/* Filter: tick one or more tags; a thread must carry every ticked tag */}
        {allTags.length > 0 && (
          <div className="px-2.5 py-2 border-b border-[#ede9e2]">
            <FilterToolbar count={activePills.includes('All') ? 0 : activePills.length} open={filtersOpen}
              onToggle={() => setFiltersOpen(o => !o)} onClear={() => togglePill('All')} />
            <FilterPanel open={filtersOpen} className="p-3 mt-2">
              <div className="col-span-full flex flex-col gap-1.5">
                {allTags.map(tag => (
                  <label key={tag} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" className="accent-orange-500" checked={activePills.includes(tag)} onChange={() => togglePill(tag)} />
                    {tag}
                  </label>
                ))}
              </div>
            </FilterPanel>
          </div>
        )}

        {/* Thread rows */}
        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="space-y-0">
              {[0,1,2,3].map(i => (
                <div key={i} className="px-3 py-3 border-b border-slate-100 animate-pulse">
                  <div className="flex gap-1.5 mb-1.5">
                    <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0" />
                    <div className="h-2.5 bg-slate-200 rounded flex-1 max-w-[100px]" />
                  </div>
                  <div className="h-2 bg-slate-200 rounded mb-1 w-4/5" />
                  <div className="h-2 bg-slate-100 rounded w-3/5" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-xs text-slate-400 mb-2">No threads match this filter.</p>
              <button
                onClick={() => { setSearch(''); setActivePills(['All']); }}
                className="text-xs text-orange-600 hover:text-orange-700 font-medium"
              >
                Clear filters
              </button>
            </div>
          ) : (
            filtered.map(t => (
              <ThreadRow
                key={t.conversationId}
                thread={t}
                selected={t.conversationId === selectedConvId}
                unread={isThreadUnread(t)}
                onClick={() => openThread(t.conversationId)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Thread detail ─────────────────────────────────────────────────── */}
      <div className={`${selectedThread ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-hidden bg-white`}>

        {!selectedThread ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            Select a thread to read
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div className="px-4 md:px-5 py-3 border-b border-[#ede9e2] shrink-0">
              <button onClick={() => setSelectedConvId(null)} className="md:hidden -ml-1 mb-2 px-2 py-1.5 text-sm font-medium text-orange-600">
                ‹ All threads
              </button>
              <div className="text-[15px] font-semibold text-[#1a1a1a] mb-1.5">
                {selectedThread.subject}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#9a9589]">
                <span>{selectedThread.messageCount} message{selectedThread.messageCount !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>Started {fmtDate(messages[0]?.receivedAt ?? selectedThread.latestReceivedAt)}</span>
                {selectedThread.tags?.map(t => (
                  <span key={t}><TagChip tag={t} /></span>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  {/* Edit tags, disabled stub */}
                  <button
                    className="flex items-center gap-1 text-[11px] border border-[#e8e4dc] px-2.5 py-1 rounded-md text-[#6b6560]"
                    style={{ opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' }}
                    disabled
                  >
                    Edit tags
                  </button>
                  {selectedThread.webUrl && (
                    <a
                      href={selectedThread.webUrl}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] border border-[#d0ccc4] px-2.5 py-1 rounded-md text-[#1a1a1a] hover:bg-[#f5f3ef]"
                    >
                      Open in Outlook →
                    </a>
                  )}
                </div>
              </div>
              <EmailTagTargets className="mt-2" selectedMessageId={latestMessageId} onTagged={onTagged} />
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4">
              {msgsLoading ? (
                <Skeleton />
              ) : messages.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No messages found.</p>
              ) : (
                messages.map((msg, i) => {
                  const isLatest = i === messages.length - 1;
                  return (
                    <MessageCard
                      key={msg.id}
                      message={msg}
                      isLatest={isLatest}
                      collapsed={!isLatest && (collapsedMsgs[msg.id] ?? true)}
                      onToggle={() => toggleMsgCollapse(msg.id)}
                      onUntag={onUntag}
                    />
                  );
                })
              )}
            </div>

            {/* Reply bar */}
            <div className="px-4 md:px-5 py-3 border-t border-[#ede9e2] flex flex-wrap items-center gap-2 bg-[#faf9f7] shrink-0">
              <svg className="w-4 h-4 text-[#b8b2a8] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[11px] text-[#9a9589] italic flex-1">
                Replying from the platform is coming soon, use Outlook to respond for now
              </span>
              {selectedThread.webUrl ? (
                <a
                  href={selectedThread.webUrl}
                  target="_blank" rel="noreferrer"
                  className="text-[11px] border border-[#e8e4dc] bg-white px-3 py-1.5 rounded-md text-[#1a1a1a] hover:bg-[#f5f3ef] flex items-center gap-1 shrink-0"
                >
                  Open thread in Outlook →
                </a>
              ) : (
                <button
                  disabled
                  className="text-[11px] border border-[#e8e4dc] bg-white px-3 py-1.5 rounded-md text-[#9a9589] shrink-0"
                  style={{ cursor: 'not-allowed', opacity: 0.5 }}
                >
                  Open thread in Outlook
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
