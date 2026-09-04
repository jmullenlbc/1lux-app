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
import { runStagedParse, PARSE_STEPS, stage, STAGE_RETRY_WAITS_MS, HANGUP_RETRY_WAITS_MS, waitForVisible } from '../../src/lib/intake/stagedParse.js';

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

test('a render that needs several slices is asked again until it is done', async () => {
  // The monster-set shape: the server draws one sheet per request and says
  // "more" until all four are kept. The client must keep asking, and the
  // answer it hands on must be the FINAL one, not a mid-set partial.
  let renderCalls = 0;
  const f = fakeFetch({
    ...CLEAN,
    render: () => {
      renderCalls += 1;
      if (renderCalls < 3) {
        return { more: true, keptSheets: [{ page: 4, key: 'sheets/x.jpg', bytes: 90000 }], sheetsRead: [4, 7] };
      }
      return {
        keptSheets: [
          { page: 4, key: 'sheets/x.jpg', bytes: 90000 },
          { page: 7, key: 'sheets/y.jpg', bytes: 80000 },
        ],
        sheetsRead: [4, 7],
      };
    },
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf', onStep: () => {} });
  f.restore();

  assert.equal(renderCalls, 3, 'the client must ask again while the server says more');
  assert.equal(out.keptSheets.length, 2, 'the final, complete kept list is the one reported');
  assert.deepStrictEqual(f.calls.filter(c => c === 'render'), ['render', 'render', 'render']);
});

test('the four stages run in order, and the working scan is cleaned up', async () => {
  const f = fakeFetch(CLEAN);
  const steps = [];
  await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf', onStep: (k, s) => steps.push(k + ':' + s) });
  f.restore();

  // The matrix is KICKED right after the scan (it thinks while the sheets are
  // drawn), so its request lands before the render's even though the visitor
  // still sees the steps in the listed order.
  assert.deepStrictEqual(f.calls, ['scan', 'matrix', 'render', 'done'],
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

  assert.deepStrictEqual(f.calls, ['scan', 'matrix', 'render', 'site', 'done']);
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

  assert.deepStrictEqual(f.calls, ['scan', 'matrix', 'render', 'done']);
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


// ── The retry: a dropped request must not kill a minutes-long read ──────────
// Every R1 Mike screenshotted was ONE thrown fetch ending the whole read. The
// server parks its progress under a scanKey, so re-asking is always safe.

// Real waits are 2s/6s (drops) and 3s/10s (hang-ups); tests only care about
// the COUNT, not the pacing.
STAGE_RETRY_WAITS_MS[0] = 1;
STAGE_RETRY_WAITS_MS[1] = 1;
HANGUP_RETRY_WAITS_MS[0] = 1;
HANGUP_RETRY_WAITS_MS[1] = 1;

function countingFetch(behaviours) {
  let n = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    const b = behaviours[Math.min(n++, behaviours.length - 1)];
    if (b instanceof Error) throw b;
    return { ok: b.ok !== false, status: b.status ?? 200, json: async () => b };
  };
  return { calls: () => n, restore: () => { globalThis.fetch = original; } };
}

test('a dropped request is re-asked and the read continues', async () => {
  const f = countingFetch([new TypeError('Failed to fetch'), { staging: true, scanKey: 'k' }]);
  try {
    const d = await stage({ stage: 'scan', s3Key: 'x' });
    assert.equal(d.scanKey, 'k');
    assert.equal(f.calls(), 2, 'first attempt dropped, second answered');
  } finally { f.restore(); }
});

test('three drops in a row give up with the original error', async () => {
  const f = countingFetch([new TypeError('Failed to fetch')]);
  try {
    await assert.rejects(() => stage({ stage: 'scan', s3Key: 'x' }), TypeError);
    assert.equal(f.calls(), 3, 'one ask plus two retries, then done');
  } finally { f.restore(); }
});

test('an answer the server actually gave is never retried', async () => {
  // A 4xx/5xx WITH a message is a decision, not a drop. Re-asking would repeat
  // work the server already refused once.
  const f = countingFetch([{ ok: false, status: 422, message: 'This file is not a PDF.' }]);
  try {
    await assert.rejects(() => stage({ stage: 'scan', s3Key: 'x' }), /not a PDF/);
    assert.equal(f.calls(), 1);
  } finally { f.restore(); }
});

test('the visitor leaving is not a failure to retry', async () => {
  const gone = new Error('gone');
  gone.name = 'AbortError';
  const f = countingFetch([gone]);
  try {
    await assert.rejects(() => stage({ stage: 'scan', s3Key: 'x' }), /gone/);
    assert.equal(f.calls(), 1);
  } finally { f.restore(); }
});

test('waitForVisible is a no-op where there is no page to hide', async () => {
  // Node has no document; the retry must not hang waiting for one.
  await waitForVisible(50);
});

// ── The front-door hang-up: an empty non-2xx is a drop, not a decision ──────
// Amplify's front door hangs up on any request past ~30s and returns a 504
// with NO body. The work is parked server-side under the scanKey, so this is
// as retryable as a thrown fetch — but it used to be treated as a server
// decision, and one hang-up killed the whole read. That was the R3 on the
// 294-sheet Skyline Ridge set.

test('a front-door hang-up (empty 504) is re-asked and the read continues', async () => {
  const f = countingFetch([{ ok: false, status: 504 }, { staging: true, scanKey: 'k' }]);
  try {
    const d = await stage({ stage: 'scan', s3Key: 'x' });
    assert.equal(d.scanKey, 'k');
    assert.equal(f.calls(), 2, 'first attempt hung up, second answered');
  } finally { f.restore(); }
});

test('hang-ups on every attempt give up with the R3 message', async () => {
  const f = countingFetch([{ ok: false, status: 504 }]);
  try {
    await assert.rejects(
      () => stage({ stage: 'scan', s3Key: 'x' }),
      (e) => e.shown === true && /\(R3\/scan\)/.test(e.message) && /504/.test(e.message),
    );
    assert.equal(f.calls(), 1 + HANGUP_RETRY_WAITS_MS.length, 'one ask plus the hang-up retries');
  } finally { f.restore(); }
});

test('an answer the server wrote is still never retried, and carries its code', async () => {
  const f = countingFetch([{ ok: false, status: 410, error: 'scan_expired', message: 'This upload timed out before we finished reading it.' }]);
  try {
    await assert.rejects(
      () => stage({ stage: 'scan', scanKey: 'k' }),
      (e) => e.shown === true && !e.hangUp && e.code === 'scan_expired',
    );
    assert.equal(f.calls(), 1, 'a served message is a decision, not a drop');
  } finally { f.restore(); }
});

// ── The sheet pick as its own round ─────────────────────────────────────────
// The finishing scan slice used to pay for its reading AND the sheet-pick
// model call in one request. The server now parks the finished pages and says
// `more: true` once more; the pick request is short and never opens the file.

test('the sheet pick arrives as its own round, and the loop just keeps asking', async () => {
  let n = 0;
  const f = fakeFetch({
    ...CLEAN,
    scan: () => (++n === 1
      ? { staging: true, more: true, scanKey: 'k', totalPages: 294, pagesRead: 294, picking: true }
      : { staging: true, scanKey: 'k', totalPages: 294, sheetsRead: [4, 7], hasText: true, needsRender: true }),
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.strictEqual(f.calls.filter(c => c === 'scan').length, 2,
    'one finishing slice, then the pick round');
  assert.deepStrictEqual(out.sheetsRead, [4, 7]);
  assert.equal(out.totalPages, 294);
});

// ── The parallel scan: four streams instead of one polite one ───────────────
// Production reads 5-8 pages a slice, so a 294-page set took nine minutes down
// one stream. The first slice's response OFFERS the rest of the set as ranges;
// the client reads them concurrently, each stream parking server-side under
// its own key, then one merge request folds the banked pages back into the
// main scan. What these protect: every offered range must actually be read,
// the merge must wait for all of the streams, and one dead stream must cost a
// hole in the read -- never the read itself.

const RANGES = [
  { from: 9, to: 36 }, { from: 37, to: 64 }, { from: 65, to: 92 }, { from: 93, to: 120 },
];

/** A monster set's scan replies: first slice offers ranges, shards answer, merge folds. */
function monsterScan({ shardReply } = {}) {
  let plainScans = 0;
  return (body) => {
    if (body.shard != null) {
      return shardReply
        ? shardReply(body)
        : { staging: true, shard: body.shard, more: false, pagesRead: 28 };
    }
    if (body.mergeShards) {
      // The real merge falls through to the ordinary finishing slice: it says
      // "more" once (the pick round), exactly like a very productive slice.
      return { staging: true, more: true, scanKey: 'k', totalPages: 120, pagesRead: 120, picking: true };
    }
    return (++plainScans === 1)
      ? { staging: true, more: true, scanKey: 'k', totalPages: 120, pagesRead: 8, shardRanges: RANGES }
      : { staging: true, scanKey: 'k', totalPages: 120, sheetsRead: [4, 7], hasText: true, needsRender: true };
  };
}

test('a monster scan fans out into the offered ranges and merges when all are done', async () => {
  const f = fakeFetch({ ...CLEAN, scan: monsterScan() });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'monster.pdf' });
  f.restore();

  const shards = f.sent.filter(b => b.shard != null);
  assert.deepStrictEqual(
    shards.map(b => ({ from: b.from, to: b.to })).sort((a, b) => a.from - b.from),
    RANGES,
    'every offered range must be read -- a dropped one is silently unread pages');
  assert.deepStrictEqual([...new Set(shards.map(b => b.shard))].sort(), [0, 1, 2, 3]);

  const mergeAt = f.sent.findIndex(b => b.mergeShards);
  assert.equal(f.sent.filter(b => b.mergeShards).length, 1, 'one merge, not one per stream');
  const lastShardAt = f.sent.reduce((at, b, i) => (b.shard != null ? i : at), -1);
  assert.ok(mergeAt > lastShardAt, 'the merge must wait for every stream');

  assert.equal(out.unitTypes.length, 1, 'the read finishes exactly like a serial one');
  assert.equal(out.totalPages, 120);
});

test('one dead stream is a hole in the read, not the end of it', async () => {
  const f = fakeFetch({
    ...CLEAN,
    scan: monsterScan({
      shardReply: (body) => (body.shard === 2
        ? { __status: 502, message: 'One stream died.' }
        : { staging: true, shard: body.shard, more: false, pagesRead: 28 }),
    }),
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'monster.pdf' });
  f.restore();

  assert.equal(f.sent.filter(b => b.mergeShards).length, 1,
    'the merge still runs -- the other three streams banked real pages');
  assert.equal(out.unitTypes.length, 1, 'the visitor still gets an answer');
});

test('but every stream dying IS the end of the read', async () => {
  const f = fakeFetch({
    ...CLEAN,
    scan: monsterScan({ shardReply: () => ({ __status: 502, message: 'Every stream died.' }) }),
  });
  await assert.rejects(
    () => runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'monster.pdf' }),
    /Every stream died/,
  );
  f.restore();
  assert.equal(f.sent.filter(b => b.mergeShards).length, 0, 'nothing to merge');
});

// ── The overlap: the unit-count read thinks while the sheets are drawn ──────
// The matrix is ONE long model call needing nothing but the parked text, so on
// a set WITH text it is kicked right after the scan and awaited at its old
// place in the step order. What this protects: the answer handed on must be
// the FINAL polled one, and a set with no text must not be asked early (there
// is no table to read yet).

test('the matrix is kicked before the render, and the polled answer is the final one', async () => {
  let matrixCalls = 0;
  const f = fakeFetch({
    ...CLEAN,
    // First ask: "still reading" -- the server kicked the model call off.
    // Second ask (one poll later): the parked answer.
    matrix: () => (++matrixCalls === 1 ? { more: true } : { matrix: MATRIX, needsSite: false }),
  });
  const out = await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.ok(f.calls.indexOf('matrix') < f.calls.indexOf('render'),
    'the think must start before the sheets are drawn, or nothing overlaps');
  assert.equal(matrixCalls, 2, 'polled until the parked answer appeared');
  assert.equal(out.unitTypes.length, 1, 'a mid-think "more" must never be handed on as the answer');
});

test('a set with no text layer does not kick the matrix early', async () => {
  const f = fakeFetch(PLOTTED);
  await runStagedParse({ s3Key: 'uploads/intake/a.pdf', fileName: 'set.pdf' });
  f.restore();

  assert.ok(f.calls.indexOf('matrix') > f.calls.indexOf('render'),
    'with nothing parked to read, asking early would just burn a request');
});
