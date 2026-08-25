#!/usr/bin/env node
/**
 * Guard: an auth helper that is called but never imported.
 *
 * This bug has now shipped three times. A route calls `getSession()` or
 * `isSuperAdmin()`, the import line only ever mentioned `requireAuth`, and
 * nothing complains — not the editor, not the build, not the tests. The route
 * throws a ReferenceError on the first real request and the user sees a bare
 * 500. It broke the market-intel source buttons, the client-standards tabs,
 * the budget-QC assignment, and a project's assignee list.
 *
 * The check is deliberately blunt: for every file under src/, find calls to a
 * known helper from src/lib/auth.js, and fail if the name is neither imported
 * nor declared in that same file. Comments and import lines are stripped first
 * so that documentation prose does not trip it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HELPERS = [
  'isSuperAdmin', 'isCompanyAdmin', 'isAnyAdmin', 'isClientViewer',
  'canSeeAllData', 'isSalesAdmin', 'parsePermissions', 'getRoleLabel',
  'signToken', 'verifyToken', 'getSession', 'setSessionCookie',
  'clearSessionCookie', 'requireAuth', 'requireAdmin', 'requireSalesAdmin',
  'requireSuperAdmin', 'requireILCAdmin',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];

for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');

  // Client components are skipped. None of these helpers can run in the
  // browser — getSession reads server cookies — so a real call in a client
  // component would fail the build long before this gate. What they DO carry
  // is prose: the tech-stack page prints `await requireAuth(request)` inside a
  // <code> tag to document the convention, and that is not a call.
  if (/^\s*['"]use client['"]/m.test(src)) continue;

  // What the file brings in, from anywhere, under any alias.
  const imported = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const piece of m[1].split(',')) {
      const name = piece.trim().split(/\s+as\s+/).pop();
      if (name) imported.add(name);
    }
  }
  // What the file defines for itself — a local helper of the same name is fine.
  const declared = new Set(
    [...src.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1])
  );

  // Body only: no import lines, no comments, no strings that merely mention a
  // helper (the tech-stack page documents `requireAuth` in prose).
  const body = src
    .split('\n')
    .filter(l => !l.trim().startsWith('import'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');

  for (const helper of HELPERS) {
    if (!new RegExp(`\\b${helper}\\s*\\(`).test(body)) continue;
    if (imported.has(helper) || declared.has(helper)) continue;
    problems.push({ file: file.replace(/\\/g, '/'), helper });
  }
}

if (problems.length) {
  console.error('\ncheck-auth-imports: an auth helper is called but never imported.\n');
  for (const { file, helper } of problems) {
    console.error(`  ${file}`);
    console.error(`    calls ${helper}() — add it to the import from '@/lib/auth'\n`);
  }
  console.error('Every request to these routes throws a ReferenceError and returns a 500.\n');
  process.exit(1);
}

console.log(`✓ check-auth-imports: every auth helper call is imported (${HELPERS.length} helpers checked)`);
