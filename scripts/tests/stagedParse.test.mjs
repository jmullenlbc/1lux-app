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
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    // The first step may arrive as a form (a laptop with no bucket sends the
    // file itself); every other step is JSON.
    const isForm = typeof opts.body?.get === 'function';
    const body = isForm
      ? { stage: opts.body.get('stage'), file: opts.body.get('file') }
      : JSON.parse(opts.body);
    calls.push(body.stage);
    sent.push(body);
    const reply = typeof replies[body.stage] === 'function'
      ? replies[body.stage](body)
      : replies[body.stage];
    if (reply?.__status) return { ok: false, json: async () => ({ message: reply.message }) };
    return { ok: true, json: async () => reply ?? {} };
  };
  return { calls, sent, restore: () => { globalThis.fetch = original; } };
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

test('with nowhere to upload first, the file rides along with the first step', async () => {
  // A laptop has no bucket. Before this, that dropped the whole read back to
  // one long request -- no steps, no progress, and one connection held open for
  // a minute, which is the exact shape this change exists to remove. And the
  // laptop is what Mike tests against from his phone.
  const f = fakeFetch(CLEAN);
  const file = new Blob(['%PDF-1.7 pretend drawing'], { type: 'application/pdf' });
  const out = await runStagedParse({ file, fileName: 'set.pdf' });
  f.restore();

  assert.deepStrictEqual(f.calls, ['scan', 'render', 'matrix', 'done']);
  assert.equal(f.sent[0].file?.size, file.size, 'the scan step has to carry the file itself');
  assert.equal(f.sent[1].file, undefined, 'later steps work from the parked key, not the file');
  assert.equal(out.unitTypes.length, 1);
});

test('when the file was uploaded first, the scan step sends only the key', async () => {
  const f = fakeFetch(CLEAN);
  await runStagedParse({ s3Key: 'uploads/intake/a.pdf', file: new Blob(['x']), fileName: 'set.pdf' });
  f.restore();
  assert.equal(f.sent[0].s3Key, 'uploads/intake/a.pdf');
  assert.equal(f.sent[0].file, undefined, 'no reason to re-send bytes that are already up there');
});

// ─── the picture-only path ──────────────────────────────────────────────────
//
// A plotted set has no text to search, so the sheets worth opening are found by
// reading the drawing index off the cover as a picture. What these protect is
// the fallback: this path is an improvement on opening the front of the set,
// never a requirement, and no failure inside it may cost the visitor his read.

/** A set that arrives as pictures: nothing to search, index read instead. */
const PLOTTED = {
  scan:   { staging: true, scanKey: 'scans/abc.json.gz', totalPages: 158, sheetsRead: [1], hasText: false, needsRender: true, needsIndex: true },
  index:  { found: true, tiles: 3 },
  sheets: { mapped: true, sheetsRead: [42, 9], picked: [{ role: 'sitePlan', sheetNumber: 'C2.1', page: 42 }] },
  render: { keptSheets: [{ page: 42, key: 'sheets/x.jpg', bytes: 90000 }], sheetsRead: [42, 9] },
  matrix: { matrix: null, needsSite: true },
  site:   { siteData: { units: 180, buildings: 5 } },
  done:   { ok: true },
};

test('a plotted set reads its drawing index before opening anything', async () => {
  const f = fakeFetch(PLOTTED);
  const steps = [];
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf', onStep: (k, st) => steps.push(k + ':' + st) });
  f.restore();

  assert.deepStrictEqual(f.calls, ['scan', 'index', 'sheets', 'render', 'matrix', 'site', 'done']);
  assert.ok(steps.includes('index:done'));
  assert.deepStrictEqual(out.sheetsRead, [42, 9],
    'the sheets the index named are what we opened, not the cover');
});

test('a set with a text layer never pays for the picture read', async () => {
  const f = fakeFetch(CLEAN);
  const steps = [];
  await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf', onStep: (k, st) => steps.push(k + ':' + st) });
  f.restore();

  assert.ok(!f.calls.includes('index'), 'two model calls for nothing');
  assert.ok(steps.includes('index:skipped'), 'a step that vanishes looks like a stall');
});

test('no index on the cover means we open the front of the set anyway', async () => {
  const f = fakeFetch({ ...PLOTTED, index: { found: false, reason: 'no_index_found' } });
  const steps = [];
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf', onStep: (k, st) => steps.push(k + ':' + st) });
  f.restore();

  assert.ok(!f.calls.includes('sheets'), 'nothing to read, so nothing to ask');
  assert.ok(f.calls.includes('render'), 'the read must carry on');
  assert.ok(steps.includes('index:skipped'));
  assert.ok(out.siteData, 'the visitor still gets an answer');
});

test('an index read that cannot be anchored does not stop the read', async () => {
  // Anchoring is what turns a row in the index into a page in the file. Without
  // it we know which sheet we want and not where it is -- and guessing would
  // open some other drawing and report ITS numbers as the answer.
  const f = fakeFetch({ ...PLOTTED, sheets: { mapped: false, reason: 'no_anchor', sheetsRead: [1] } });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.ok(f.calls.includes('render'));
  assert.ok(out.siteData, 'the visitor still gets an answer');
});

test('an index step that errors outright is survived, not raised', async () => {
  const f = fakeFetch({ ...PLOTTED, index: { __status: 500, message: 'boom' } });
  const steps = [];
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf', onStep: (k, st) => steps.push(k + ':' + st) });
  f.restore();

  assert.ok(steps.includes('index:skipped'));
  assert.ok(out.siteData, 'a failed shortcut must never cost a GC his upload');
});

test('the index is read one close-up at a time until the server says it is done', async () => {
  // Reading a 158-sheet index in one request would sail past the ~30s front
  // door and come back as an empty 504 -- the exact failure this whole staged
  // read exists to avoid. Each close-up is its own request.
  let n = 0;
  const f = fakeFetch({
    ...PLOTTED,
    index: { found: true, tiles: 3 },
    sheets: () => (++n < 3
      ? { more: true, tilesDone: n, tiles: 3 }
      : { mapped: true, sheetsRead: [42, 9], picked: [] }),
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.strictEqual(f.calls.filter(c => c === 'sheets').length, 3);
  assert.deepStrictEqual(out.sheetsRead, [42, 9]);
});

test('a server that never stops asking for another close-up is cut off', async () => {
  const f = fakeFetch({ ...PLOTTED, sheets: () => ({ more: true }) });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  // The stop sits above the most close-ups the server will ever cut, so it
  // never truncates a real index; all that matters here is that it exists.
  assert.ok(f.calls.filter(c => c === 'sheets').length < 40, 'the read span the visitor forever');
  assert.ok(f.calls.includes('render'), 'and it still has to finish');
  assert.ok(out.siteData);
});

// ─── the other two loops the ~30s front door forced ─────────────────────────
//
// The index and the drawings are now looked at one request at a time for the
// same reason the close-ups are: a request that runs past thirty seconds comes
// back from Amplify as an empty 504 and the visitor gets nothing.

test('the front sheets are looked at one at a time until an index turns up', async () => {
  // Sheet 1 is often just a rendering or a vicinity map; the index is on the
  // second sheet. Looking at both in one request cost 24 seconds.
  let looked = 0;
  const f = fakeFetch({
    ...PLOTTED,
    index: () => (++looked < 2
      ? { found: false, more: true, lookedAt: looked }
      : { found: true, tiles: 2 }),
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.strictEqual(f.calls.filter(c => c === 'index').length, 2);
  assert.ok(f.calls.includes('sheets'), 'the index it eventually found was never read');
  assert.deepStrictEqual(out.sheetsRead, [42, 9]);
});

test('front sheets that never show an index still let the read finish', async () => {
  const f = fakeFetch({ ...PLOTTED, index: { found: false } });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.ok(!f.calls.includes('sheets'), 'it went looking for an index it had not found');
  assert.ok(f.calls.includes('render'), 'a set with no index should still be opened');
  assert.ok(out.siteData, 'the visitor got nothing back');
});

test('a server that keeps asking for another front sheet is cut off', async () => {
  const f = fakeFetch({ ...PLOTTED, index: () => ({ found: false, more: true }) });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.ok(f.calls.filter(c => c === 'index').length < 20, 'it looked at front sheets forever');
  assert.ok(f.calls.includes('render'), 'and it still has to finish');
  assert.ok(out.siteData);
});

test('the drawings are read one sheet at a time, and the last answer is the merged one', async () => {
  // Reading two sheets in one request measured 29.4 seconds against a 30
  // second door. One sheet per request; the server merges as it goes.
  let n = 0;
  const f = fakeFetch({
    ...PLOTTED,
    site: () => (++n < 2
      ? { more: true, sheetsDone: n, sheets: 2 }
      : { siteData: { units: 250, buildings: 12 } }),
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.strictEqual(f.calls.filter(c => c === 'site').length, 2);
  assert.strictEqual(out.siteData.units, 250);
});

test('a server that keeps asking for another drawing is cut off', async () => {
  const f = fakeFetch({ ...PLOTTED, site: () => ({ more: true }) });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.ok(f.calls.filter(c => c === 'site').length < 24, 'the read span the visitor forever');
  assert.ok(f.calls.includes('done'), 'and it still has to finish');
});
