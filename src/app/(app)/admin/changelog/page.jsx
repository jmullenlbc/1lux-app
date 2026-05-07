import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

function renderMarkdown(text) {
  const lines = text.split('\n');
  const nodes = [];
  let i = 0;

  function parseLine(line) {
    // Bold **text**
    return line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      nodes.push({ type: 'h1', text: line.slice(2).trim() });
    } else if (line.startsWith('## ')) {
      nodes.push({ type: 'h2', text: line.slice(3).trim() });
    } else if (line.startsWith('### ')) {
      nodes.push({ type: 'h3', text: line.slice(4).trim() });
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

export default async function ChangelogPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ILC_ADMIN' && session.role !== 'ADMIN') redirect('/dashboard');

  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  let content = '';
  try {
    content = fs.readFileSync(changelogPath, 'utf-8');
  } catch {
    content = '# CHANGELOG.md not found\n\nThe changelog file could not be read.';
  }

  const nodes = renderMarkdown(content);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Changelog</h1>
        <p className="text-slate-500 text-sm mt-1">
          Development history — all features, fixes, and schema changes since day one.
        </p>
      </div>

      {/* Rendered changelog */}
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
              <h2 key={idx} className="text-lg font-bold text-slate-900 mt-8 mb-2 pt-6 border-t border-slate-100 first:border-t-0 first:pt-0 first:mt-0">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 inline-block" />
                  {node.text}
                </span>
              </h2>
            );
          }
          if (node.type === 'h3') {
            return (
              <h3 key={idx} className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-4 mb-1.5">
                {node.text}
              </h3>
            );
          }
          if (node.type === 'li') {
            return (
              <div
                key={idx}
                className={`flex items-start gap-2 py-0.5 ${node.nested ? 'pl-4' : ''}`}
              >
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                <span
                  className="text-sm text-slate-600 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: node.text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-800">$1</strong>').replace(/`(.+?)`/g, '<code class="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">$1</code>') }}
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
                dangerouslySetInnerHTML={{ __html: node.text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-700">$1</strong>').replace(/`(.+?)`/g, '<code class="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">$1</code>') }}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
