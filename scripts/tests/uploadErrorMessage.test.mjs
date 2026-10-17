// The upload drop zones used to fail silently: `if (res.ok) {...}` with no else,
// inside `try {} catch {}`. Every failure looked the same to the user, the spinner
// vanished and the file never appeared. These tests pin the honest messages.
import { test } from 'node:test';
import assert from 'node:assert';
import {
  UPLOAD_LIMIT_BYTES,
  PROJECT_UPLOAD_LIMIT_BYTES,
  limitForFile,
  batchOversizeMessage,
  oversizeMessage,
  uploadErrorMessage,
  uploadThrowMessage,
} from '../../src/lib/uploadErrorMessage.js';

const file = (name, size) => ({ name, size });
const res  = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => { if (body === undefined) throw new SyntaxError('Unexpected end of JSON input'); return body; },
});

test('a file under the ceiling is not flagged', () => {
  assert.equal(oversizeMessage(file('schedule.pdf', UPLOAD_LIMIT_BYTES)), null);
  assert.equal(oversizeMessage(file('schedule.pdf', 1024)), null);
  assert.equal(oversizeMessage(null), null);
});

test('an oversized file names the file, its real size, and the ceiling', () => {
  const msg = oversizeMessage(file('CD set.pdf', 31.5 * 1024 * 1024));
  assert.match(msg, /CD set\.pdf/);
  assert.match(msg, /31\.5 MB/);
  assert.match(msg, /25 MB/);
});

test('the message says what to DO, not just that it failed', () => {
  const msg = oversizeMessage(file('big.pdf', 40 * 1024 * 1024));
  assert.match(msg, /reduced-size|split/i);
});

// ── The two ceilings ────────────────────────────────────────────────────────
// PDFs and spreadsheets go straight to S3 and never meet Amplify's front door,
// so they get 25 MB. Anything else still travels through the app and is stuck
// with the 4 MB the host allows. Both numbers must appear in the right message
// or the user is told to shrink a file that was never too big.

test('a 9 MB construction schedule is fine: this is the whole point of the change', () => {
  assert.equal(oversizeMessage(file('Marmalade CD Schedule.pdf', 9 * 1024 * 1024)), null);
  assert.equal(oversizeMessage(file('unit matrix.xlsx', 20 * 1024 * 1024)), null);
});

test('a 9 MB image is NOT fine: it has no direct-to-S3 route', () => {
  const msg = oversizeMessage(file('site photo.png', 9 * 1024 * 1024));
  assert.match(msg, /4 MB/);
  assert.doesNotMatch(msg, /25 MB/);
});

test('limitForFile picks the ceiling from the extension, case-insensitively', () => {
  assert.equal(limitForFile(file('a.PDF', 1)),  PROJECT_UPLOAD_LIMIT_BYTES);
  assert.equal(limitForFile(file('a.XLSX', 1)), PROJECT_UPLOAD_LIMIT_BYTES);
  assert.equal(limitForFile(file('a.docx', 1)), UPLOAD_LIMIT_BYTES);
  assert.equal(limitForFile(file('noextension', 1)), UPLOAD_LIMIT_BYTES);
});

test('a PDF over BOTH ceilings still reports 25, not 4: the number that applied', () => {
  const msg = oversizeMessage(file('huge.pdf', 60 * 1024 * 1024));
  assert.match(msg, /25 MB/);
  assert.doesNotMatch(msg, /4 MB/);
});

test('a 413 explains the size cap even though the response body is empty', async () => {
  // This is the real prod shape: the host rejects the body before our code runs,
  // so there is no JSON for the server to explain itself with.
  const msg = await uploadErrorMessage(res(413), file('huge.pdf', 30 * 1024 * 1024));
  assert.match(msg, /30\.0 MB/);
  assert.match(msg, /25 MB/);
});

test('a 401/403 tells the user to sign back in, not to shrink the file', async () => {
  for (const status of [401, 403]) {
    const msg = await uploadErrorMessage(res(status), file('a.pdf', 100));
    assert.match(msg, /session expired/i);
    assert.doesNotMatch(msg, /4 MB/);
  }
});

test("the server's own error text wins when it has one", async () => {
  const msg = await uploadErrorMessage(res(422, { error: 'That PDF is a scanned image with no text.' }), file('scan.pdf', 100));
  assert.equal(msg, 'That PDF is a scanned image with no text.');
});

test('an empty error body still produces a message, never a thrown SyntaxError', async () => {
  const msg = await uploadErrorMessage(res(500), file('a.pdf', 100));
  assert.match(msg, /500/);
  assert.match(msg, /a\.pdf/);
});

test('an ok response yields no message at all', async () => {
  assert.equal(await uploadErrorMessage(res(200, { file: {} }), file('a.pdf', 100)), null);
});

test('a network throw on a big file blames the size, which is the usual cause', () => {
  const msg = uploadThrowMessage(new Error('Failed to fetch'), file('big.pdf', 30 * 1024 * 1024));
  assert.match(msg, /30\.0 MB/);
});

test('a network throw on a small file reports the connection, not a phantom size problem', () => {
  const msg = uploadThrowMessage(new Error('Failed to fetch'), file('small.pdf', 100));
  assert.match(msg, /Failed to fetch/);
  assert.doesNotMatch(msg, /MB\./);
});

test('every message ends up a non-empty string: silence is the bug being fixed', async () => {
  const cases = [
    await uploadErrorMessage(res(413), file('a.pdf', 90e6)),
    await uploadErrorMessage(res(401), file('a.pdf', 10)),
    await uploadErrorMessage(res(500), file('a.pdf', 10)),
    await uploadErrorMessage(res(404), null),
    uploadThrowMessage(new Error(''), null),
    uploadThrowMessage({}, null),
  ];
  for (const msg of cases) assert.ok(typeof msg === 'string' && msg.trim().length > 0, `empty message: ${JSON.stringify(msg)}`);
});

// ── The multi-file drop zones ───────────────────────────────────────────────
// These used to sum every file and compare against 4 MB. That was right when
// the whole set travelled in one request body; now the PDFs leave one at a
// time. Getting this wrong means refusing a drawing set that would upload fine.

test('a set of large PDFs is fine: they no longer share one 4 MB budget', () => {
  const set = [file('A-100.pdf', 12e6), file('A-200.pdf', 15e6), file('A-300.pdf', 20e6)];
  assert.equal(batchOversizeMessage(set), null);
});

test('one PDF over 25 MB fails the set and names that file', () => {
  const set = [file('A-100.pdf', 5e6), file('A-200.pdf', 40e6)];
  const msg = batchOversizeMessage(set);
  assert.match(msg, /A-200\.pdf/);
  assert.match(msg, /25 MB/);
});

test('the files that still share the request body are still added up', () => {
  const set = [file('a.png', 3e6), file('b.png', 3e6)];
  const msg = batchOversizeMessage(set);
  assert.match(msg, /4 MB/);
  assert.match(msg, /smaller batches/);
});

test('big PDFs do not count against the shared 4 MB budget', () => {
  const set = [file('A-100.pdf', 20e6), file('note.png', 1e6)];
  assert.equal(batchOversizeMessage(set), null);
});

test('an empty set is not an error', () => {
  assert.equal(batchOversizeMessage([]), null);
  assert.equal(batchOversizeMessage(null), null);
});
