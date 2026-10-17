'use client';
import { useState } from 'react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function fmtRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 2)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  if (h < 24)  return `${h}h ago`;
  if (d < 7)   return `${d}d ago`;
  return fmtDate(iso);
}

function authorInitials(name) {
  return (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function authorColor(email) {
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500',
    'bg-amber-500', 'bg-red-500', 'bg-cyan-500', 'bg-indigo-500',
  ];
  let hash = 0;
  for (const c of (email || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

// Group commits by calendar day
function groupByDay(commits) {
  const map = new Map();
  for (const c of commits) {
    const day = c.date ? new Date(c.date).toDateString() : 'Unknown';
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(c);
  }
  return [...map.entries()];
}

// ── Markdown changelog renderer ───────────────────────────────────────────────

function inlineHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-800">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">$1</code>');
}

function MarkdownChangelog({ nodes }) {
  const [search, setSearch] = useState('');

  // Group nodes into h2 sections so we can filter whole sections
  const sections = [];
  let current = { header: null, nodes: [] };
  for (const node of nodes) {
    if (node.type === 'h1') {
      sections.push({ header: null, nodes: [node], isTitle: true });
    } else if (node.type === 'h2') {
      if (current.header !== null || current.nodes.length > 0) sections.push(current);
      current = { header: node, nodes: [] };
    } else {
      current.nodes.push(node);
    }
  }
  if (current.header !== null || current.nodes.length > 0) sections.push(current);

  const versionSections = sections.filter(s => !s.isTitle);
  const latestVersion   = versionSections[0]?.header?.text || null;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? sections.filter(s =>
        s.isTitle ||
        s.header?.text.toLowerCase().includes(q) ||
        s.nodes.some(n => n.text?.toLowerCase().includes(q))
      )
    : sections;

  const displayNodes = filtered.flatMap(s => s.header ? [s.header, ...s.nodes] : s.nodes);

  return (
    <div className="space-y-5">
      {/* Stats + search, identical layout to Deploy History */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span><strong className="text-slate-700">{versionSections.length}</strong> versions</span>
          {latestVersion && (
            <span>Latest: <strong className="text-slate-700">{latestVersion}</strong></span>
          )}
        </div>
        <input
          type="text"
          placeholder="Search changelog notes…"
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500 w-56"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {q && filtered.filter(s => !s.isTitle).length === 0 && (
        <div className="text-center text-slate-500 text-sm py-10">No versions match your search</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-0">
        {displayNodes.map((node, idx) => {
          if (node.type === 'h1') return (
            <h1 key={idx} className="text-2xl font-bold text-slate-900 mt-6 mb-3 first:mt-0">{node.text}</h1>
          );
          if (node.type === 'h2') return (
            <h2 key={idx} className="text-lg font-bold text-slate-900 mt-8 mb-2 pt-6 border-t border-slate-100 first:border-t-0 first:pt-0 first:mt-0">
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 inline-block" />
                {node.text}
              </span>
            </h2>
          );
          if (node.type === 'h3') return (
            <h3 key={idx} className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-4 mb-1.5">{node.text}</h3>
          );
          if (node.type === 'li') return (
            <div key={idx} className={`flex items-start gap-2 py-0.5 ${node.nested ? 'pl-4' : ''}`}>
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
              <span className="text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: inlineHtml(node.text) }} />
            </div>
          );
          if (node.type === 'hr') return <div key={idx} className="border-t border-slate-100 my-4" />;
          if (node.type === 'p') return (
            <p key={idx} className="text-sm text-slate-500 leading-relaxed mt-1" dangerouslySetInnerHTML={{ __html: inlineHtml(node.text) }} />
          );
          return null;
        })}
      </div>
    </div>
  );
}

// ── Single commit row ─────────────────────────────────────────────────────────

function CommitRow({ commit }) {
  const [open, setOpen] = useState(false);
  const hasBody = Boolean(commit.body?.trim());
  const isAI = commit.coAuthors?.some(a => a.email?.includes('anthropic'));

  return (
    <div className="group relative pl-8">
      {/* Timeline dot */}
      <span className="absolute left-0 top-3.5 w-3 h-3 rounded-full border-2 border-white bg-slate-300 group-hover:bg-orange-400 transition-colors z-10" />

      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 transition-colors">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Left: subject + meta */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 leading-snug">{commit.subject}</p>
            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
              {/* Author avatar */}
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-white ${authorColor(commit.email)}`}>
                {authorInitials(commit.author)}
              </span>
              <span className="text-xs text-slate-500">{commit.author}</span>
              {isAI && (
                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-600">AI-assisted</span>
              )}
              <span className="text-slate-300 text-xs">·</span>
              <span className="text-xs text-slate-500 font-mono">{commit.hash}</span>
              <span className="text-slate-300 text-xs">·</span>
              <span className="text-xs text-slate-500" title={`${fmtDate(commit.date)} ${fmtTime(commit.date)}`}>
                {fmtRelative(commit.date)}
              </span>
            </div>
          </div>

          {/* Right: expand button */}
          {hasBody && (
            <button
              onClick={() => setOpen(v => !v)}
              className="text-xs text-slate-500 hover:text-slate-600 flex items-center gap-1 shrink-0 mt-1"
            >
              {open ? 'Less' : 'Details'}
              <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Expanded body */}
        {open && hasBody && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <pre className="text-xs text-slate-500 whitespace-pre-wrap font-sans leading-relaxed">{commit.body}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Deploy History tab ────────────────────────────────────────────────────────

function DeployHistory({ deployLog }) {
  const [search, setSearch] = useState('');

  if (!deployLog) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-slate-500 text-sm">
        Deploy log not available, it is generated during the Amplify build.
        <br />
        <span className="text-xs mt-1 block">Run <code className="bg-slate-100 px-1 rounded">npm run dev:3000</code> locally to generate it for local development.</span>
      </div>
    );
  }

  const filtered = search.trim()
    ? deployLog.filter(c =>
        c.subject.toLowerCase().includes(search.toLowerCase()) ||
        c.author.toLowerCase().includes(search.toLowerCase()) ||
        c.hash.toLowerCase().includes(search.toLowerCase()) ||
        c.body?.toLowerCase().includes(search.toLowerCase())
      )
    : deployLog;

  const days = groupByDay(filtered);

  return (
    <div className="space-y-5">
      {/* Stats + search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span><strong className="text-slate-700">{deployLog.length}</strong> total pushes</span>
          {deployLog[0]?.date && (
            <span>Latest: <strong className="text-slate-700">{fmtDate(deployLog[0].date)}</strong> at <strong className="text-slate-700">{fmtTime(deployLog[0].date)}</strong></span>
          )}
        </div>
        <input
          type="text"
          placeholder="Search commits…"
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500 w-56"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-10">No commits match your search</div>
      )}

      {/* Timeline grouped by day */}
      {days.map(([day, commits]) => (
        <div key={day}>
          {/* Day header */}
          <div className="flex items-center gap-3 mb-3 pl-8">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {new Date(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{commits.length}</span>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[5px] top-0 bottom-0 w-px bg-slate-100" />
            <div className="space-y-2">
              {commits.map(c => <CommitRow key={c.fullHash || c.hash} commit={c} />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Root client component ─────────────────────────────────────────────────────

export default function ChangelogClient({ nodes, deployLog }) {
  const [tab, setTab] = useState('history');

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Changelog</h1>
        <p className="text-slate-500 text-sm mt-1">
          Development history, every feature and fix pushed to production.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mb-6 w-fit">
        {[
          { id: 'history',   label: 'Deploy History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
          { id: 'changelog', label: 'Changelog Notes', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
            </svg>
            {t.label}
            {t.id === 'history' && deployLog && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700">
                {deployLog.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'history'   && <DeployHistory deployLog={deployLog} />}
      {tab === 'changelog' && <MarkdownChangelog nodes={nodes} />}
    </div>
  );
}
