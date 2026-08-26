// The read is four HTTP requests now, and this file drives them.
//
// Why it is worth testing at all: the failure it replaced was invisible. The
// one-request version of the read had never completed once on the live site --
// Amplify hangs up at ~30 seconds, a real set takes ~66 -- and it looked like a
// generic upload failure because the 504 arrives with no body. Splitting it up
// moves that risk into ORDERING: skip a step that was needed, or hand the wrong
// answer to the combiner, and the visitor gets confidently wrong numbers rather
// than an error.
//
// So these tests are about the sequence and about which answer wins, using a
// fake fetch. The stages themselves are the route's business.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStagedParse, PARSE_STEPS } from '../../src/lib/intake/stagedParse.js';

/**
 * Stand in for the network.
 * @param replies  stage -> body, or a function returning one
 */
function fakeFetch(replies) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body.stage);
    const reply = typeof replies[body.stage] === 'function'
      ? replies[body.stage](body)
      : replies[body.stage];
    if (reply?.__status) return { ok: false, json: async () => ({ message: reply.message }) };
    return { ok: true, json: async () => reply ?? {} };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const MATRIX = { unitTypes: [{ name: 'A1', count: 12, sf: 750 }], overallConfidence: 0.9 };

/** A set that reads cleanly off the text layer -- the happy path. */
const CLEAN = {
  scan:   { staging: true, scanKey: 'scans/abc.json.gz', totalPages: 120, sheetsRead: [4, 7], hasText: true, needsRender: true },
  render: { keptSheets: [{ page: 4, key: 'sheets/x.jpg', bytes: 90000 }], sheetsRead: [4, 7] },
  matrix: { matrix: MATRIX, needsSite: false },
  done:   { ok: true },
};

test('the four stages run in order, and the working scan is cleaned up', async () => {
  const f = fakeFetch(CLEAN);
  const steps = [];
  await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf', onStep: (k, s) => steps.push(k + ':' + s) });
  f.restore();

  assert.deepStrictEqual(f.calls, ['scan', 'render', 'matrix', 'done'],
    'site must not run when the matrix already answered -- it is the expensive call');
  assert.ok(steps.includes('site:skipped'),
    'a step that does not run must still be reported, or it looks like the read stopped');
});

test('a clean unit matrix is what the visitor gets back', async () => {
  const f = fakeFetch(CLEAN);
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.equal(out.unitTypes.length, 1);
  assert.equal(out.fileName, 'set.pdf');
  assert.equal(out.totalPages, 120);
  assert.deepStrictEqual(out.sheetsRead, [4, 7], 'the render stage refines which sheets were opened');
  assert.equal(out.keptSheets.length, 1, 'the reviewer copy has to survive the trip');
});

test('a site plan with no matrix falls through to the vision read', async () => {
  const f = fakeFetch({
    ...CLEAN,
    matrix: { matrix: { unitTypes: [] }, needsSite: true },
    site:   { siteData: { totalUnits: 247, lotAcres: 11.4 } },
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'site.pdf' });
  f.restore();

  assert.deepStrictEqual(f.calls, ['scan', 'render', 'matrix', 'site', 'done']);
  assert.equal(out.kind, 'site_data');
  assert.equal(out.siteData.totalUnits, 247);
});

test('a scanned set with no text layer goes straight to vision', async () => {
  const f = fakeFetch({
    scan:   { staging: true, scanKey: 'scans/abc.json.gz', totalPages: 3, hasText: false, needsRender: true },
    render: { keptSheets: [{ page: 1, key: 'sheets/x.jpg' }] },
    matrix: { matrix: null, needsSite: true },
    site:   { siteData: { lotSf: 480000 } },
    done:   { ok: true },
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'scan.pdf' });
  f.restore();
  assert.equal(out.kind, 'site_data');
  assert.equal(out.siteData.lotSf, 480000);
});

test('a failed site read does not throw away a matrix we already have', async () => {
  // The site read is a second look, not the answer. Losing it must cost the
  // visitor nothing when the text read already worked.
  const f = fakeFetch({
    ...CLEAN,
    matrix: { matrix: MATRIX, needsSite: true },
    site:   { __status: 502, message: 'The site plan could not be read.' },
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();
  assert.equal(out.unitTypes.length, 1, 'the matrix must survive a failed site read');
});

test('but with no text layer, a failed site read IS the failure', async () => {
  const f = fakeFetch({
    scan:   { staging: true, scanKey: 'scans/abc.json.gz', hasText: false, needsRender: true },
    render: { keptSheets: [] },
    matrix: { matrix: null, needsSite: true },
    site:   { __status: 502, message: 'The site plan could not be read.' },
    done:   { ok: true },
  });
  await assert.rejects(
    () => runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'scan.pdf' }),
    /site plan could not be read/,
  );
  f.restore();
});

test('the parked scan is swept even when a stage fails', async () => {
  const f = fakeFetch({ ...CLEAN, matrix: { __status: 502, message: 'Could not read this file.' } });
  await assert.rejects(() => runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' }));
  f.restore();
  assert.ok(f.calls.includes('done'), 'a failed read must not leave its working files behind');
});

test('a server that declines to stage says so, rather than failing', async () => {
  // Local dev has no bucket to park a scan in. That is not an error -- it means
  // "do this one in a single request", and the caller falls back.
  const f = fakeFetch({ scan: { staging: false, fileName: 'small.pdf' } });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'small.pdf' });
  f.restore();
  assert.equal(out, null);
  assert.deepStrictEqual(f.calls, ['scan'], 'nothing to clean up if nothing was parked');
});

test('an error message from the server reaches the visitor unchanged', async () => {
  // These are written for a public reader -- a GC on a job site -- so the UI
  // shows them as-is. A wrapper that replaced them with "something went wrong"
  // would throw away the only actionable part.
  const f = fakeFetch({ scan: { __status: 410, message: 'This upload timed out before we finished reading it. Please upload the file again.' } });
  await assert.rejects(
    () => runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'x.pdf' }),
    (e) => e.shown === true && /upload the file again/.test(e.message),
  );
  f.restore();
});

test('every step the UI lists is one the driver actually reports', async () => {
  // The progress list is drawn from PARSE_STEPS. A step nobody ever reports
  // would sit grey forever and read as a stall.
  const f = fakeFetch({
    ...CLEAN,
    matrix: { matrix: { unitTypes: [] }, needsSite: true },
    site:   { siteData: { totalUnits: 10 } },
  });
  const seen = new Set();
  await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'a.pdf', onStep: k => seen.add(k) });
  f.restore();
  assert.deepStrictEqual(PARSE_STEPS.map(s => s.key).filter(k => !seen.has(k)), []);
});

test('a unit-counts read that fails still lets the site plan answer', async () => {
  // Seen for real 2026-08-25: the model ran long on a code-review sheet and its
  // answer was cut off mid-JSON. The site read on that same sheet found 250
  // units and 12 buildings. Losing the whole upload over the first failure --
  // intermittently, so the same file can fail then succeed -- is the worst
  // thing to hand a GC.
  const f = fakeFetch({
    ...CLEAN,
    matrix: { matrix: null, needsSite: true, matrixError: 'Could not read the extraction result.' },
    site:   { siteData: { totalUnits: 250, buildingCount: 12 } },
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'code.pdf' });
  f.restore();
  assert.equal(out.kind, 'site_data');
  assert.equal(out.siteData.totalUnits, 250);
});

test('when BOTH reads are out, the visitor is told what went wrong', async () => {
  // Not "no numbers found" -- that blames the drawing for our failure, and
  // sends someone off to check a sheet that was perfectly fine.
  const f = fakeFetch({
    ...CLEAN,
    matrix: { matrix: null, needsSite: true, matrixError: 'Could not read the extraction result.' },
    site:   { siteData: { totalUnits: null, lotSf: null } },
  });
  await assert.rejects(
    () => runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'code.pdf' }),
    /Could not read the extraction result/,
  );
  f.restore();
});

test('a site read that errors after a failed unit-counts read is not swallowed', async () => {
  const f = fakeFetch({
    ...CLEAN,
    matrix: { matrix: null, needsSite: true, matrixError: 'Could not read the extraction result.' },
    site:   { __status: 502, message: 'The site plan could not be read.' },
  });
  await assert.rejects(
    () => runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'code.pdf' }),
    /site plan could not be read/,
  );
  f.restore();
});
