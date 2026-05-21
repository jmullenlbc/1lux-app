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

  return <RoadmapClient nodes={nodes} statusMeta={STATUS_META} />;
}
