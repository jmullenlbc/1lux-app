// The bytes behind every in-app drop zone now arrive one of two ways: inside the
// request body (as always), or already sitting in S3 because the browser sent
// them straight there to clear Amplify's ~4.4 MB front door. uploadIntake.js is
// the seam that hides the difference. These tests pin that seam, because a bug
// here looks like "the file uploaded but the app says there was no file".
import { test } from 'node:test';
import assert from 'node:assert';

// These run offline: the module only reaches for S3 when an uploadKey is
// present, and every case below either has no key or is rejected before the
// fetch ever happens.
import { readUploadedFile, readUploadedFiles } from '../../src/lib/uploadIntake.js';

// A stand-in for the browser File object: only the three members the code touches.
const fileLike = (name, bytes, type = 'application/pdf') => ({
  name,
  type,
  arrayBuffer: async () => new Uint8Array(Buffer.from('x'.repeat(bytes))).buffer,
});

// FormData is global in Node 18+, but a plain shim keeps the shape obvious.
const form = (entries) => {
  const map = new Map();
  for (const [k, v] of entries) {
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(v);
  }
  return {
    get:    (k) => (map.get(k) ?? [null])[0],
    getAll: (k) => map.get(k) ?? [],
  };
};

// ── The multipart path, what every route did before the change ─────────────

test('a file in the request body comes back with its bytes, name and type', async () => {
  const got = await readUploadedFile(form([['file', fileLike('CD Schedule.pdf', 500)]]));
  assert.equal(got.ok, true);
  assert.equal(got.buffer.length, 500);
  assert.equal(got.name, 'CD Schedule.pdf');
  assert.equal(got.type, 'application/pdf');
  assert.equal(got.uploadKey, null);
});

test('an empty form is a 400 with a message, never a crash', async () => {
  const got = await readUploadedFile(form([]));
  assert.equal(got.ok, false);
  assert.equal(got.status, 400);
  assert.match(got.message, /No file/i);
});

test('a text field named "file" is not mistaken for a file', async () => {
  const got = await readUploadedFile(form([['file', 'not-a-file']]));
  assert.equal(got.ok, false);
  assert.equal(got.status, 400);
});

test('a body-borne file over the ceiling is a 413, not a silent truncation', async () => {
  const got = await readUploadedFile(form([['file', fileLike('huge.pdf', 2000)]]), { limit: 1000 });
  assert.equal(got.ok, false);
  assert.equal(got.status, 413);
  assert.match(got.message, /larger than/i);
});

test('a missing type falls back rather than producing undefined', async () => {
  const got = await readUploadedFile(form([['file', fileLike('a.pdf', 10, '')]]));
  assert.equal(got.type, 'application/octet-stream');
});

test('cleanup on the multipart path is a harmless no-op', async () => {
  const got = await readUploadedFile(form([['file', fileLike('a.pdf', 10)]]));
  await got.cleanup(); // must not throw, there is nothing staged to delete
});

// ── The direct-to-S3 path ───────────────────────────────────────────────────
// A key with no file name is the failure mode worth pinning: the object exists,
// but everything downstream (stored file name, AI prompt, page title) needs the
// original name, and inventing one would put "upload.pdf" in front of a client.

test('a key without a file name is refused rather than renamed', async () => {
  const got = await readUploadedFile(form([['uploadKey', 'uploads/project/abc123.pdf']]));
  assert.equal(got.ok, false);
  assert.equal(got.status, 400);
  assert.match(got.message, /file name/i);
});

// ── The multi-file version ──────────────────────────────────────────────────

test('several files in the body all come back, in order', async () => {
  const got = await readUploadedFiles(form([
    ['files', fileLike('A1.pdf', 10)],
    ['files', fileLike('A2.pdf', 20)],
    ['files', fileLike('A3.pdf', 30)],
  ]));
  assert.equal(got.ok, true);
  assert.deepEqual(got.files.map(f => f.name), ['A1.pdf', 'A2.pdf', 'A3.pdf']);
  assert.deepEqual(got.files.map(f => f.buffer.length), [10, 20, 30]);
});

test('one oversized file fails the whole set: a partial drawing set is worse than none', async () => {
  const got = await readUploadedFiles(form([
    ['files', fileLike('A1.pdf', 10)],
    ['files', fileLike('A2.pdf', 9999)],
  ]), { limit: 1000 });
  assert.equal(got.ok, false);
  assert.equal(got.status, 413);
  assert.match(got.message, /A2\.pdf/);
});

test('no files at all is a 400', async () => {
  const got = await readUploadedFiles(form([]));
  assert.equal(got.ok, false);
  assert.equal(got.status, 400);
});

test('an unreadable uploadKeys list is a 400, not a thrown SyntaxError', async () => {
  const got = await readUploadedFiles(form([['uploadKeys', '{not json']]));
  assert.equal(got.ok, false);
  assert.equal(got.status, 400);
  assert.match(got.message, /unreadable/i);
});

test('an empty uploadKeys list still lets body files through', async () => {
  // The mixed drop: nothing was presignable, so the client sent no keys.
  const got = await readUploadedFiles(form([
    ['uploadKeys', '[]'],
    ['files', fileLike('sketch.png', 10, 'image/png')],
  ]));
  assert.equal(got.ok, true);
  assert.equal(got.files.length, 1);
  assert.equal(got.files[0].name, 'sketch.png');
});

test('a non-file entry under "files" is skipped, not turned into an empty buffer', async () => {
  const got = await readUploadedFiles(form([
    ['files', 'stray-text-field'],
    ['files', fileLike('A1.pdf', 10)],
  ]));
  assert.equal(got.ok, true);
  assert.equal(got.files.length, 1);
});
