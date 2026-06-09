export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import TechStackClient from './TechStackClient';

function loadDeployLog() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'deploy-log.json'), 'utf-8');
    return JSON.parse(raw);
  } catch { return []; }
}

function loadPackageJson() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8');
    return JSON.parse(raw);
  } catch { return {}; }
}

// Tag a commit by what area of the stack it touched
function classifyCommit(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('schema') || m.includes('prisma') || m.includes('migration') || m.includes('db:'))
    return 'database';
  if (m.includes('auth') || m.includes('jwt') || m.includes('session') || m.includes('role'))
    return 'auth';
  if (m.includes('amplify') || m.includes('deploy') || m.includes('build') || m.includes('next.config'))
    return 'infra';
  if (m.includes('api/') || m.includes('route') || m.includes('endpoint'))
    return 'api';
  if (m.includes('component') || m.includes('client') || m.includes('ui') || m.includes('page'))
    return 'ui';
  if (m.includes('package') || m.includes('install') || m.includes('dep') || m.includes('npm'))
    return 'deps';
  if (m.includes('fix:') || m.includes('bug') || m.includes('hotfix'))
    return 'fix';
  if (m.includes('feat:'))
    return 'feat';
  return 'other';
}

export default async function TechStackPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ILC_ADMIN', 'SUPER_ADMIN'].includes(session.role)) redirect('/dashboard');

  const pkg       = loadPackageJson();
  const deployLog = loadDeployLog();

  const KEY_DEPS = [
    { key: 'next',             label: 'Next.js',          role: 'Framework (App Router)' },
    { key: 'react',            label: 'React',             role: 'UI Library' },
    { key: 'prisma',           label: 'Prisma',            role: 'ORM' },
    { key: '@prisma/client',   label: 'Prisma Client',     role: 'DB Client' },
    { key: 'tailwindcss',      label: 'Tailwind CSS',      role: 'Styling' },
    { key: 'jose',             label: 'jose',              role: 'JWT Auth' },
    { key: '@anthropic-ai/sdk',label: 'Anthropic SDK',     role: 'AI / Claude' },
    { key: 'xlsx',             label: 'xlsx',              role: 'Excel Parsing' },
    { key: 'pdfjs-dist',       label: 'pdfjs-dist',        role: 'PDF Parsing' },
    { key: 'tesseract.js',     label: 'Tesseract.js',      role: 'OCR' },
    { key: '@napi-rs/canvas',  label: '@napi-rs/canvas',   role: 'Server Canvas' },
  ];

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const deps = KEY_DEPS.map(d => ({
    ...d,
    version: (allDeps[d.key] || '—').replace(/[\^~]/, ''),
  }));

  // Annotate commits with category
  const commits = (deployLog || []).slice(0, 100).map(c => ({
    ...c,
    category: classifyCommit(c.message || c.subject || ''),
  }));

  return <TechStackClient deps={deps} commits={commits} nodeVersion={process.version} />;
}
