import { redirect } from 'next/navigation';
import { getSession, isSuperAdmin } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import ChangelogClient from './ChangelogClient';

export const dynamic = 'force-dynamic';

// ── Read CHANGELOG.md ────────────────────────────────────────────────────────

function renderMarkdown(text) {
  const lines = text.split('\n');
  const nodes = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if      (line.startsWith('# '))   nodes.push({ type: 'h1', text: line.slice(2).trim() });
    else if (line.startsWith('## '))  nodes.push({ type: 'h2', text: line.slice(3).trim() });
    else if (line.startsWith('### ')) nodes.push({ type: 'h3', text: line.slice(4).trim() });
    else if (line.startsWith('- ') || line.startsWith('  - ')) {
      const nested = line.startsWith('  - ');
      nodes.push({ type: 'li', text: (nested ? line.slice(4) : line.slice(2)).trim(), nested });
    } else if (line.startsWith('---')) {
      nodes.push({ type: 'hr' });
    } else if (line.trim()) {
      nodes.push({ type: 'p', text: line.trim() });
    }
    i++;
  }
  return nodes;
}

// ── Load deploy log ──────────────────────────────────────────────────────────

function loadDeployLog() {
  const logPath = path.join(process.cwd(), 'deploy-log.json');
  try {
    const raw = fs.readFileSync(logPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null; // file doesn't exist (local dev without running the script)
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ChangelogPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isSuperAdmin(session.role)) redirect('/dashboard');

  // CHANGELOG.md
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  let changelogContent = '';
  try { changelogContent = fs.readFileSync(changelogPath, 'utf-8'); }
  catch { changelogContent = '# CHANGELOG.md not found\n\nThe changelog file could not be read.'; }
  const nodes = renderMarkdown(changelogContent);

  // Deploy log
  const deployLog = loadDeployLog();

  return <ChangelogClient nodes={nodes} deployLog={deployLog} />;
}
