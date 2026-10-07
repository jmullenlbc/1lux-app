'use client';
import { useState } from 'react';
import PriorityStack from '@/components/PriorityStack';

function inlineHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-800">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">$1</code>');
}

// ── Request Feature modal ─────────────────────────────────────────────────────

function RequestFeatureButton() {
  const [open,   setOpen]   = useState(false);
  const [text,   setText]   = useState('');
  const [sent,   setSent]   = useState(false);
  const [saving, setSaving] = useState(false);

  function handleSubmit() {
    if (!text.trim()) return;
    setSaving(true);
    setTimeout(() => { setSent(true); setSaving(false); }, 600);
  }

  function handleClose() { setOpen(false); setSent(false); setText(''); }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Request Feature
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && handleClose()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Request a Feature</h2>
              <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {sent ? (
              <div className="px-6 py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <p className="text-slate-700 font-medium">Request received!</p>
                <p className="text-sm text-slate-500 mt-1">We'll review it and add it to the roadmap if it fits.</p>
                <button onClick={handleClose} className="mt-5 px-5 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition-colors">Done</button>
              </div>
            ) : (
              <>
                <div className="px-6 py-4">
                  <p className="text-sm text-slate-500 mb-3">Describe the feature you'd like to see added to the platform.</p>
                  <textarea autoFocus rows={4} value={text} onChange={e => setText(e.target.value)}
                    placeholder="e.g. Allow exporting the fixture schedule as a PDF with ILC branding..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                  <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                  <button onClick={handleSubmit} disabled={saving || !text.trim()}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50">
                    {saving ? 'Submitting…' : 'Submit request'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Roadmap content ───────────────────────────────────────────────────────────

export default function RoadmapClient({ nodes, statusMeta, priorities = [] }) {
  const [search, setSearch] = useState('');

  // Group nodes into h2 sections for filtering
  const sections = [];
  let current = { header: null, nodes: [], isTitle: false };
  for (const node of nodes) {
    if (node.type === 'h1') {
      sections.push({ header: null, nodes: [node], isTitle: true });
    } else if (node.type === 'h2') {
      if (current.header !== null || current.nodes.length > 0) sections.push(current);
      current = { header: node, nodes: [], isTitle: false };
    } else {
      current.nodes.push(node);
    }
  }
  if (current.header !== null || current.nodes.length > 0) sections.push(current);

  const topicCount = sections.filter(s => !s.isTitle).length;

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
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roadmap</h1>
          <p className="text-slate-500 text-sm mt-1">Planned features, future ideas, and items in progress.</p>
        </div>
        <RequestFeatureButton />
      </div>

      {/* Priority stack */}
      <div className="mb-8">
        <PriorityStack initialPriorities={priorities} />
      </div>

      {/* Stats + search bar — same layout as Changelog */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span><strong className="text-slate-700">{topicCount}</strong> topic{topicCount !== 1 ? 's' : ''}</span>
          {q && (
            <span>{filtered.filter(s => !s.isTitle).length} matching</span>
          )}
        </div>
        <input
          type="text"
          placeholder="Search roadmap…"
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-200 w-56"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Rendered roadmap */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-0">
        {displayNodes.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-8">No results for &ldquo;{search}&rdquo;</p>
        )}
        {displayNodes.map((node, idx) => {
          if (node.type === 'h1') return (
            <h1 key={idx} className="text-2xl font-bold text-slate-900 mt-6 mb-3 first:mt-0">{node.text}</h1>
          );
          if (node.type === 'h2') return (
            <h2 key={idx} className="flex items-center gap-2.5 text-lg font-bold text-slate-900 mt-10 mb-3 pt-8 border-t border-slate-100 first:border-t-0 first:pt-0 first:mt-0">
              <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0 inline-block" />
              {node.text}
            </h2>
          );
          if (node.type === 'h3') {
            const meta = node.status ? statusMeta[node.status] : null;
            return (
              <h3 key={idx} className="flex items-center gap-2 mt-5 mb-2">
                <span className="text-sm font-bold text-slate-800">{node.text}</span>
                {meta && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}>
                    {meta.label}
                  </span>
                )}
              </h3>
            );
          }
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
