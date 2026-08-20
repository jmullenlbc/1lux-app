// The upload drop zones used to fail silently: `if (res.ok) {...}` with no else,
// inside `try {} catch {}`. Every failure looked the same to the user — the spinner
// vanished and the file never appeared. These tests pin the honest messages.
import { test } from 'node:test';
import assert from 'node:assert';
import {
  UPLOAD_LIMIT_BYTES,
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
  const msg = oversizeMessage(file('CD set.pdf', 12.5 * 1024 * 1024));
  assert.match(msg, /CD set\.pdf/);
  assert.match(msg, /12\.5 MB/);
  assert.match(msg, /4 MB/);
});

test('the message says what to DO, not just that it failed', () => {
  const msg = oversizeMessage(file('big.pdf', 9 * 1024 * 1024));
  assert.match(msg, /reduced-size|split/i);
});

test('a 413 explains the size cap even though the response body is empty', async () => {
  // This is the real prod shape: the host rejects the body before our code runs,
  // so there is no JSON for the server to explain itself with.
  const msg = await uploadErrorMessage(res(413), file('huge.pdf', 20 * 1024 * 1024));
  assert.match(msg, /20\.0 MB/);
  assert.match(msg, /4 MB/);
});

test('a 401/403 tells the user to sign back in — not to shrink the file', async () => {
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
  assert.doesNotMatch(msg, /4 MB/);
});

test('every message ends up a non-empty string — silence is the bug being fixed', async () => {
  const cases = [
    await uploadErrorMessage(res(413), file('a.pdf', 9e6)),
    await uploadErrorMessage(res(401), file('a.pdf', 10)),
    await uploadErrorMessage(res(500), file('a.pdf', 10)),
    await uploadErrorMessage(res(404), null),
    uploadThrowMessage(new Error(''), null),
    uploadThrowMessage({}, null),
  ];
  for (const msg of cases) assert.ok(typeof msg === 'string' && msg.trim().length > 0, `empty message: ${JSON.stringify(msg)}`);
});
