// Pins the park-and-poll wrap on every in-app AI read (Mike 2026-09-17: "match
// the public page across all drawing uploads in the system"). Amplify's front
// door drops any request over ~30s with an empty 504, so each of these routes
// must answer its first request by writing the job down, and each caller must
// poll for it. If a route slips back to a one-shot fetch, this test says so
// before prod does. See src/lib/parkedJob.js and src/lib/parkedFetch.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const ROUTES = [
  'src/app/api/projects/[id]/site/parse/route.js',
  'src/app/api/projects/[id]/unit-matrix/parse/route.js',
  'src/app/api/projects/[id]/files/[fileId]/reparse/route.js',
  'src/app/api/projects/[id]/analyze-contract/route.js',
  'src/app/api/projects/[id]/fixture-schedule/parse/route.js',
  'src/app/api/projects/[id]/peer-review/parse-pdf/route.js',
  'src/app/api/projects/[id]/tracker/extract/route.js',
  'src/app/api/projects/[id]/tracker/import-toc/route.js',
  'src/app/api/projects/[id]/code-check/route.js',
  'src/app/api/automation/knowledge/docs/route.js',
  'src/app/api/sales/voice/rebuild/route.js',
  'src/app/api/sales/voice/templates/refill/route.js',
];

const CALLERS = [
  'src/components/site/SiteDataUpload.jsx',
  'src/components/unitMatrix/UnitMatrixUpload.jsx',
  'src/lib/scheduleReadClient.js',
  'src/components/CAScheduleCard.jsx',
  'src/app/(app)/project/[id]/ProjectHubClient.jsx',
  'src/components/contracts/ContractsPanel.jsx',
  'src/app/(app)/project/[id]/FixtureScheduleEditor.jsx',
  'src/app/(app)/project/[id]/PeerReviewClient.jsx',
  'src/app/(app)/project/[id]/FixtureScheduleTab.jsx',
  'src/components/tracker/SubmittalTrackerClient.jsx',
  'src/components/tracker/TocImportModal.jsx',
  'src/components/CodeCheckPanel.jsx',
  'src/app/(app)/sales/automation/knowledge/page.jsx',
];

for (const p of ROUTES) {
  test(`route parks its work: ${p}`, () => {
    const s = read(p);
    assert.ok(s.includes('runParkedJob('), 'runParkedJob( missing');
    assert.ok(/export const maxDuration = 300;/.test(s), 'maxDuration must be 300 (the Lambda ceiling)');
    assert.ok(!s.includes('maxDuration = 120'), 'old 120s ceiling left behind');
  });
}

for (const p of CALLERS) {
  test(`caller polls for the answer: ${p}`, () => {
    const s = read(p);
    assert.ok(s.includes('postParked('), 'postParked( missing');
    assert.ok(s.includes("from '@/lib/parkedFetch'") || s.includes("from './parkedFetch'"), 'parkedFetch import missing');
  });
}

test('the upload route no longer reads schedules inline', () => {
  const s = read('src/app/api/projects/[id]/files/route.js');
  assert.ok(!s.includes('extractScheduleMilestones('), 'schedule read crept back into the upload request');
  assert.ok(!s.includes('extractDesignMilestonesWithAI('), 'design schedule read crept back into the upload request');
});
