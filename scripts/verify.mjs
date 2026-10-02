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
  // First, because a file git cannot see is a file production will not have,
  // and every gate after this one would pass on it anyway.
  { name: 'source is tracked',   cmd: 'node scripts/check-source-tracked.mjs' },
  { name: 'auth imports',       cmd: 'node scripts/check-auth-imports.mjs' },
  { name: 'no prisma in browser', cmd: 'node scripts/check-client-prisma.mjs' },
  { name: 'dynamic pages',       cmd: 'node scripts/check-dynamic-pages.js' },
  { name: 'schema provider',     cmd: 'node scripts/check-schema-provider.js' },
  { name: 'env contract',        cmd: 'node scripts/check-env-contract.js' },
  { name: 'migrations (postgres)', cmd: 'node scripts/check-migrations-postgres.js' },
  { name: 'schema ↔ migrations', cmd: 'node scripts/check-schema-migrations-sync.js' },
  { name: 'shared metrics',      cmd: 'node scripts/check-shared-metrics.mjs' },
  // The ontology is a claim about prisma/schema.prisma; this catches the two of
  // them drifting apart before the drift ships.
  { name: 'sensitivity coverage', cmd: 'node scripts/check-sensitivity-coverage.mjs' },
  // agents.md and the unauthenticated server card both come out of
  // src/lib/mcp/catalog.js. This fails if that file stops being loadable under
  // plain Node, or if the document no longer matches the tools.
  { name: 'mcp catalogue',       cmd: 'node scripts/check-mcp-catalog.mjs' },
  // Pure unit tests — no server, no DB, so they belong in the static run.
  { name: 'unit tests',          cmd: 'node --test scripts/tests/intake.test.mjs scripts/tests/intakePublicMath.test.mjs scripts/tests/intakeVisits.test.mjs scripts/tests/intakeHandoff.test.mjs scripts/tests/drawingExtract.test.mjs scripts/tests/areaSheet.test.mjs scripts/tests/siteVision.test.mjs scripts/tests/redact.test.mjs scripts/tests/ontology.test.mjs scripts/tests/sheetIndex.test.mjs scripts/tests/pdfRange.test.mjs scripts/tests/aiModels.test.mjs scripts/tests/driveLength.test.mjs scripts/tests/garagesCarports.test.mjs scripts/tests/meetingPrep.test.mjs scripts/tests/accessEvents.test.mjs scripts/tests/draftReminder.test.mjs scripts/tests/amenityLevel.test.mjs scripts/tests/manualCorrections.test.mjs scripts/tests/quantities.test.mjs scripts/tests/parkingLadder.test.mjs scripts/tests/controlsCap.test.mjs scripts/tests/clubhouseControls.test.mjs scripts/tests/errorNumbers.test.mjs scripts/tests/combineResult.test.mjs scripts/tests/intakeDrafts.test.mjs scripts/tests/combineReads.test.mjs scripts/tests/parkedJob.test.mjs scripts/tests/parkedRoutes.test.mjs scripts/tests/numberInput.test.mjs scripts/tests/pipelineStatus.test.mjs scripts/tests/serviceAndDepartments.test.mjs scripts/tests/deptScreens.test.mjs scripts/tests/calibrationDrivers.test.mjs scripts/tests/mcpRateLimit.test.mjs scripts/tests/mcpApiKeys.test.mjs scripts/tests/unitSelections.test.mjs scripts/tests/unitLooks.test.mjs scripts/tests/procurementForecast.test.mjs scripts/tests/dashboardPrebuilt.test.mjs scripts/tests/bathLadderAmenityLevels.test.mjs scripts/tests/figureNorms.test.mjs scripts/tests/appEnv.test.mjs scripts/tests/areaNorms.test.mjs scripts/tests/salesNotes.test.mjs scripts/tests/calendarInPerson.test.mjs scripts/tests/notesCalendar.test.mjs scripts/tests/followUp.test.mjs scripts/tests/emailStyle.test.mjs scripts/tests/outlookExport.test.mjs scripts/tests/personalFacts.test.mjs scripts/tests/desk.test.mjs scripts/tests/checkIns.test.mjs scripts/tests/needsPerson.test.mjs scripts/tests/voiceInsights.test.mjs scripts/tests/voiceAutoMail.test.mjs scripts/tests/templateMatch.test.mjs scripts/tests/marketAsk.test.mjs scripts/tests/alerts.test.mjs' },
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
