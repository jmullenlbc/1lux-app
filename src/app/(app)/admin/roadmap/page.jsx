export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import RoadmapClient from './RoadmapClient';

const STATUS_META = {
  'planned':  { label: 'Planned',     color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  'future':   { label: 'Future',      color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
  'in progress': { label: 'In Progress', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  'done':     { label: 'Done',        color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' },
};

function getStatusFromHeading(text) {
  const lower = text.toLowerCase();
  if (lower.includes('_(done)_') || lower.includes('_(completed)_')) return 'done';
  if (lower.includes('_(in progress)_')) return 'in progress';
  if (lower.includes('_(planned)_')) return 'planned';
  if (lower.includes('_(future)_')) return 'future';
  return null;
}

function stripStatus(text) {
  return text.replace(/_\(.*?\)_/g, '').trim();
}

function renderMarkdown(text) {
  const lines = text.split('\n');
  const nodes = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      nodes.push({ type: 'h1', text: line.slice(2).trim() });
    } else if (line.startsWith('## ')) {
      const raw = line.slice(3).trim();
      nodes.push({ type: 'h2', text: stripStatus(raw), status: getStatusFromHeading(raw) });
    } else if (line.startsWith('### ')) {
      const raw = line.slice(4).trim();
      nodes.push({ type: 'h3', text: stripStatus(raw), status: getStatusFromHeading(raw) });
    } else if (line.startsWith('- ') || line.startsWith('  - ')) {
      const isNested = line.startsWith('  - ');
      const text = isNested ? line.slice(4).trim() : line.slice(2).trim();
      nodes.push({ type: 'li', text, nested: isNested });
    } else if (line.startsWith('---')) {
      nodes.push({ type: 'hr' });
    } else if (line.trim() !== '') {
      nodes.push({ type: 'p', text: line.trim() });
    }

    i++;
  }

  return nodes;
}

function inlineHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-800">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">$1</code>');
}

export default async function RoadmapPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const roadmapPath = path.join(process.cwd(), 'ROADMAP.md');
  let content = '';
  try {
    content = fs.readFileSync(roadmapPath, 'utf-8');
  } catch {
    content = '# ROADMAP.md not found\n\nThe roadmap file could not be read.';
  }

  const nodes = renderMarkdown(content);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roadmap</h1>
          <p className="text-slate-500 text-sm mt-1">
            Planned features, future ideas, and items in progress.
          </p>
        </div>
        <RoadmapClient />
      </div>

      {/* Rendered roadmap */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-0">
        {nodes.map((node, idx) => {
          if (node.type === 'h1') {
            return (
              <h1 key={idx} className="text-2xl font-bold text-slate-900 mt-6 mb-3 first:mt-0">
                {node.text}
              </h1>
            );
          }

          if (node.type === 'h2') {
            return (
              <h2 key={idx} className="flex items-center gap-2.5 text-lg font-bold text-slate-900 mt-10 mb-3 pt-8 border-t border-slate-100 first:border-t-0 first:pt-0 first:mt-0">
                <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0 inline-block" />
                {node.text}
              </h2>
            );
          }

          if (node.type === 'h3') {
            const meta = node.status ? STATUS_META[node.status] : null;
            return (
              <h3 key={idx} className="flex items-center gap-2 mt-5 mb-2">
                <span className="text-sm font-bold text-slate-800">{node.text}</span>
                {meta && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}
                  >
                    {meta.label}
                  </span>
                )}
              </h3>
            );
          }

          if (node.type === 'li') {
            return (
              <div key={idx} className={`flex items-start gap-2 py-0.5 ${node.nested ? 'pl-4' : ''}`}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                <span
                  className="text-sm text-slate-600 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: inlineHtml(node.text) }}
                />
              </div>
            );
          }

          if (node.type === 'hr') {
            return <div key={idx} className="border-t border-slate-100 my-4" />;
          }

          if (node.type === 'p') {
            return (
              <p
                key={idx}
                className="text-sm text-slate-500 leading-relaxed mt-1"
                dangerouslySetInnerHTML={{ __html: inlineHtml(node.text) }}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
