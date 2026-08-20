#!/usr/bin/env node
/**
 * verify — the thing that decides whether work is actually done.
 *
 * The model doing the work never decides the work is finished; this does.
 * Gates run cheapest-first and stop at the first failure, so feedback is fast.
 *
 *   npm run verify           static gates (no server, no build needed)
 *   npm run verify -- --full adds the build + runtime-asset trace check
 *   npm run verify:smoke     role-aware smoke tests (needs a running dev server)
 */
import { execSync } from 'child_process';
import fs from 'fs';

const FULL = process.argv.includes('--full');

const GATES = [
  { name: 'dynamic pages',       cmd: 'node scripts/check-dynamic-pages.js' },
  { name: 'schema provider',     cmd: 'node scripts/check-schema-provider.js' },
  { name: 'env contract',        cmd: 'node scripts/check-env-contract.js' },
  { name: 'migrations (postgres)', cmd: 'node scripts/check-migrations-postgres.js' },
  { name: 'schema ↔ migrations', cmd: 'node scripts/check-schema-migrations-sync.js' },
  { name: 'shared metrics',      cmd: 'node scripts/check-shared-metrics.mjs' },
  // The ontology is a claim about prisma/schema.prisma; this catches the two of
  // them drifting apart before the drift ships.
  { name: 'sensitivity coverage', cmd: 'node scripts/check-sensitivity-coverage.mjs' },
  // Pure unit tests — no server, no DB, so they belong in the static run.
  { name: 'unit tests',          cmd: 'node --test scripts/tests/intake.test.mjs scripts/tests/drawingExtract.test.mjs scripts/tests/areaSheet.test.mjs scripts/tests/siteVision.test.mjs scripts/tests/redact.test.mjs scripts/tests/ontology.test.mjs' },
  { name: 'secrets',             cmd: 'node scripts/check-secrets.js', optional: true },
  ...(FULL ? [
    { name: 'production build',  cmd: 'npm run build' },
    { name: 'runtime assets',    cmd: 'node scripts/check-runtime-assets.mjs' },
  ] : []),
];

const results = [];
let failed = null;

for (const gate of GATES) {
  if (gate.optional && !fs.existsSync(gate.cmd.split(' ').pop())) continue;
  process.stdout.write(`▸ ${gate.name}… `);
  const started = Date.now();
  try {
    execSync(gate.cmd, { stdio: 'pipe' });
    const ms = Date.now() - started;
    console.log(`ok (${ms}ms)`);
    results.push({ gate: gate.name, ok: true, ms });
  } catch (err) {
    console.log('FAILED');
    const out = `${err.stdout || ''}${err.stderr || ''}`.trim();
    if (out) console.error('\n' + out.split('\n').slice(-25).join('\n') + '\n');
    results.push({ gate: gate.name, ok: false });
    failed = gate.name;
    break; // stop at first failure — the rest is noise
  }
}

fs.mkdirSync('.claude', { recursive: true });
fs.writeFileSync('.claude/last-verify.json',
  JSON.stringify({ at: new Date().toISOString(), full: FULL, failed, results }, null, 2));

if (failed) {
  console.error(`✗ verify FAILED at: ${failed}`);
  process.exit(1);
}
console.log(`✓ verify passed (${results.length} gates${FULL ? ', full' : ''})`);
