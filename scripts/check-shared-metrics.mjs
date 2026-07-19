#!/usr/bin/env node
/**
 * check-shared-metrics — stops the same business question getting two answers.
 *
 * Real incident (2026-07-18): the CRM stats bar computed win rate as
 * `won / (won + lost)` while the dashboards used a different denominator. On the
 * same data they showed 40% and 29% under the same label. Nothing caught it.
 *
 * Shared business numbers live in ONE place (src/lib/pipeline.js) and are imported.
 * This fails the run if a component re-derives one locally.
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'src';

// Files legitimately allowed to touch the primitives. Everything here either IS
// the source of truth, or reads/writes the raw columns (a Prisma select is not a
// re-derivation) — never a component computing its own number.
const ALLOW = new Set([
  'src/lib/pipeline.js',                       // the single source of truth
  'src/lib/dashboards/fieldCatalog.js',        // imports the status sets to build measures
  'src/lib/dashboards/providers.js',           // shapes averageProbability onto rows
  'src/app/api/projects/[id]/route.js',        // persists the legacy column (writes only)
  'src/components/ProjectDashboard.jsx',       // edits the two source probability fields
  'src/app/(app)/crm/page.jsx',                // Prisma select of the raw columns
  'src/app/api/pipeline/route.js',             // Prisma select of the raw columns
  'src/lib/dashboardEngine.js',                // legacy engine; maps the old deal shape (bridge only)
  'scripts/check-shared-metrics.mjs',
].map(p => p.split('/').join(path.sep)));

const RULES = [
  {
    key: 'local-win-rate',
    // a file that mentions both outcomes AND divides counts is deriving a rate
    test: src => /['"]WON['"]/.test(src) && /['"]LOST['"]/.test(src)
              && /\.length\s*\/|\/\s*\(?\s*\w*(won|lost|decided)\w*\.length/i.test(src),
    msg: 'derives a win rate locally — import { winRate } from "@/lib/pipeline" instead',
  },
  {
    key: 'legacy-probability',
    test: src => /\bpipelineProbability\b/.test(src),
    msg: 'uses the legacy pipelineProbability — use { averageProbability } from "@/lib/pipeline"',
  },
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

if (!fs.existsSync(ROOT)) { console.log('• check-shared-metrics: no src/ (skipping)'); process.exit(0); }

const violations = [];
for (const file of walk(ROOT)) {
  if (ALLOW.has(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const rule of RULES) {
    if (rule.test(src)) violations.push({ file: file.split(path.sep).join('/'), rule: rule.key, msg: rule.msg });
  }
}

if (violations.length) {
  console.error('\n❌ BLOCKED — a shared business metric is being re-derived locally:\n');
  for (const v of violations) console.error(`   ${v.file}\n     ${v.msg}\n`);
  console.error('Shared numbers (win rate, probability) live in src/lib/pipeline.js so every');
  console.error('surface shows the SAME value. Import them; never recompute.\n');
  process.exit(1);
}
console.log('✓ check-shared-metrics: no locally re-derived win-rate or probability math');
