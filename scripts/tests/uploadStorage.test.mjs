/**
 * Unit tests for the direct-to-S3 upload layer (src/lib/uploadStorage.js).
 * Pure validation plus offline presigning — SigV4 signing is local crypto,
 * so no AWS account, network, or bucket is touched.
 * Run: node --test scripts/tests/uploadStorage.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Fake credentials BEFORE the module loads, so presignAvailable() is true and
// getSignedUrl has something to sign with. Nothing here ever reaches AWS.
process.env.S3_BUCKET = 'test-bucket';
process.env.S3_REGION = 'us-east-1';
// Deliberately NOT in AWS's real AKIA[0-9A-Z]{16} shape — that form trips the
// pre-push secret scanner (scripts/check-secrets.js), and a guard that cries
// wolf on a test fixture is a guard people learn to skip with --no-verify.
process.env.S3_ACCESS_KEY_ID = 'fake-access-key-id-for-tests';
process.env.S3_SECRET_ACCESS_KEY = 'testfakesecrettestfakesecrettestfakesec';

const { validatePresignRequest, presignUpload, isUploadKey, rangeFetcherFor,
        MAX_INTAKE_UPLOAD_BYTES, MAX_PROJECT_UPLOAD_BYTES,
        MAX_KNOWLEDGE_UPLOAD_BYTES, limitForScope,
        isSheetKey, putSheetImage, presignSheetRead,
        PART_BYTES, MULTIPART_MIN_BYTES, partCountFor } =
  await import('../../src/lib/uploadStorage.js');

// ─── validatePresignRequest ─────────────────────────────────────────────────

test('accepts pdf, xlsx, and xls with sensible sizes', () => {
  for (const [name, type] of [
    ['drawings.pdf', 'application/pdf'],
    ['A1.02 Unit Matrix.XLSX', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['legacy.xls', 'application/vnd.ms-excel'],
  ]) {
    const v = validatePresignRequest({ fileName: name, size: 10 * 1024 * 1024 });
    assert.equal(v.ok, true, `${name} should be accepted`);
    assert.equal(v.contentType, type);
  }
});

test('rejects images, executables, and extensionless names', () => {
  for (const name of ['scan.jpg', 'photo.PNG', 'evil.exe', 'noextension', 'archive.zip', '']) {
    const v = validatePresignRequest({ fileName: name, size: 1000 });
    assert.equal(v.ok, false, `${name || '(empty)'} should be rejected`);
    assert.equal(v.code, 'unsupported_type');
  }
});

test('rejects missing, zero, and non-numeric sizes', () => {
  for (const size of [undefined, 0, -5, 'big', NaN, Infinity]) {
    const v = validatePresignRequest({ fileName: 'ok.pdf', size });
    assert.equal(v.ok, false, `size=${size} should be rejected`);
    assert.equal(v.code, 'bad_request');
  }
});

test('rejects files over the intake ceiling, accepts exactly at it', () => {
  const over = validatePresignRequest({ fileName: 'huge.pdf', size: MAX_INTAKE_UPLOAD_BYTES + 1 });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'too_large');

  const at = validatePresignRequest({ fileName: 'big.pdf', size: MAX_INTAKE_UPLOAD_BYTES });
  assert.equal(at.ok, true, 'exactly the ceiling is allowed');
});

test('the intake ceiling is 400 MB and the project ceiling is separate', () => {
  // Mike, 2026-08-21, after a GC's 246 MB set was refused on the live site.
  // A real DD/CD set runs 200-350 MB, so anything under 400 MB here would put
  // us straight back in front of the same failure.
  assert.equal(MAX_INTAKE_UPLOAD_BYTES, 400 * 1024 * 1024);
  assert.equal(limitForScope('intake'), MAX_INTAKE_UPLOAD_BYTES);
  // In-app uploads stay small on purpose — every megabyte there becomes parsed
  // text we pay for. Raising the public cap must not drag this one along.
  assert.equal(limitForScope('project'), MAX_PROJECT_UPLOAD_BYTES);
  assert.ok(MAX_PROJECT_UPLOAD_BYTES < MAX_INTAKE_UPLOAD_BYTES);
});

test('a 246 MB set — the one that actually failed — is now accepted', () => {
  const v = validatePresignRequest({ fileName: 'Broadston Drawings.pdf', size: 246.1 * 1024 * 1024 });
  assert.equal(v.ok, true, 'the real upload from the GC must go through');
  assert.equal(v.limit, MAX_INTAKE_UPLOAD_BYTES);
});

// ─── The bot's library ───────────────────────────────────────────────────────
//
// Mike, 2026-09-07: "we should make it up to 25mbs like email. can we do it in
// pieces very easily like drawings?" These tests are the answer to the second
// half — the knowledge scope rides the same presign/multipart plumbing, it just
// accepts more kinds of file and stops at 25 MB.

test('the knowledge scope takes everything the bot can read, not just PDFs', () => {
  for (const [name, type] of [
    ['Scope of work.docx',    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['Fixture schedule.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['Lowell budget.pdf',     'application/pdf'],
    ['whiteboard.JPEG',       'image/jpeg'],
    ['site photo.png',        'image/png'],
    ['notes.txt',             'text/plain'],
    ['rates.csv',             'text/csv'],
  ]) {
    const v = validatePresignRequest({ fileName: name, size: 8 * 1024 * 1024, scope: 'knowledge' });
    assert.equal(v.ok, true, `${name} should be accepted for the bot's library`);
    assert.equal(v.contentType, type);
  }
});

test('widening the knowledge scope does NOT widen the public intake page', () => {
  // The public conceptual-budget page must keep taking drawings and schedules
  // only. An image or a Word document there is someone in the wrong place.
  for (const name of ['whiteboard.png', 'Scope of work.docx', 'notes.txt']) {
    assert.equal(validatePresignRequest({ fileName: name, size: 1000 }).ok, false, `${name} must still be refused at intake`);
    assert.equal(validatePresignRequest({ fileName: name, size: 1000, scope: 'project' }).ok, false, `${name} must still be refused on a project`);
  }
});

test('the knowledge ceiling is 25 MB — the size of an email attachment', () => {
  assert.equal(MAX_KNOWLEDGE_UPLOAD_BYTES, 25 * 1024 * 1024);
  assert.equal(limitForScope('knowledge'), MAX_KNOWLEDGE_UPLOAD_BYTES);

  const at   = validatePresignRequest({ fileName: 'big.pdf', size: MAX_KNOWLEDGE_UPLOAD_BYTES, scope: 'knowledge' });
  const over = validatePresignRequest({ fileName: 'huge.pdf', size: MAX_KNOWLEDGE_UPLOAD_BYTES + 1, scope: 'knowledge' });
  assert.equal(at.ok, true, 'exactly 25 MB is allowed');
  assert.equal(over.ok, false);
  assert.equal(over.code, 'too_large');
});

test('a 20 MB Word document — the thing that used to be refused at 4 MB', () => {
  const v = validatePresignRequest({ fileName: 'ILC Standards.docx', size: 20 * 1024 * 1024, scope: 'knowledge' });
  assert.equal(v.ok, true);
  // Four pieces of 5 MB, each its own request with its own retry. That is the
  // "in pieces, like drawings" part.
  assert.ok(20 * 1024 * 1024 >= MULTIPART_MIN_BYTES, 'a file this size goes up in pieces');
  assert.equal(partCountFor(20 * 1024 * 1024), 4);
});

test('an unknown scope is refused rather than falling back to a generous one', () => {
  const v = validatePresignRequest({ fileName: 'x.pdf', size: 1000, scope: 'knowledge-ish' });
  assert.equal(v.ok, false);
  assert.equal(v.code, 'bad_request');
});

test('handles null/absent input without throwing', () => {
  assert.equal(validatePresignRequest().ok, false);
  assert.equal(validatePresignRequest({}).ok, false);
  assert.equal(validatePresignRequest({ fileName: null, size: null }).ok, false);
});

// ─── isUploadKey — the guard between a public key string and our bucket ─────

test('accepts only keys the presign route could have issued', () => {
  assert.equal(isUploadKey('uploads/intake/ab12cd34ef56.pdf'), true);
  assert.equal(isUploadKey('uploads/intake/x9y8z7.xlsx'), true);
});

test('rejects traversal, other prefixes, and non-strings', () => {
  for (const bad of [
    'qc/abc.png',                      // the QC media prefix is NOT reachable
    'uploads/intake/../../secrets.pdf', // traversal
    'uploads/intake/a b.pdf',          // spaces
    'uploads/intake/abc',              // no extension
    'uploads/abc.pdf',                 // missing scope segment
    'anything-else',
    '', null, undefined, 42, {},
  ]) {
    assert.equal(isUploadKey(bad), false, `${JSON.stringify(bad)} should be rejected`);
  }
});

// ─── presignUpload — offline signing with fake credentials ──────────────────

test('presigned slip points at our bucket, under uploads/, with an expiry', async () => {
  const slip = await presignUpload({ scope: 'intake', ext: 'pdf', contentType: 'application/pdf' });
  assert.match(slip.key, /^uploads\/intake\/[a-z0-9]+\.pdf$/);
  assert.equal(isUploadKey(slip.key), true, 'issued keys must pass our own guard');
  // An hour, not ten minutes: a 400 MB set over a job-site connection can take
  // ~27 minutes, and a slip that expires mid-transfer fails the upload at 90%
  // with nothing the visitor can do about it.
  assert.equal(slip.expiresIn, 3600);

  const url = new URL(slip.url);
  assert.match(url.hostname, /test-bucket/, 'URL targets the configured bucket');
  assert.ok(url.pathname.includes('uploads/intake/'), 'URL path carries the key');
  assert.ok(url.searchParams.get('X-Amz-Signature'), 'URL is actually signed');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '3600');
});

test('two slips never share a key', async () => {
  const a = await presignUpload({ scope: 'intake', ext: 'pdf', contentType: 'application/pdf' });
  const b = await presignUpload({ scope: 'intake', ext: 'pdf', contentType: 'application/pdf' });
  assert.notEqual(a.key, b.key);
});


// ─── rangeFetcherFor — the byte-range reader behind big-set parsing ─────────
// The fetch itself needs S3, but the guard in front of it does not, and that
// guard is the security-relevant half: it is what stops a caller-supplied
// string from addressing an object outside uploads/.

test('rangeFetcherFor refuses a key the presign route could not have issued', () => {
  for (const key of ['../../etc/passwd', 'projects/1/secret.pdf', 'uploads/../x.pdf', '', null]) {
    assert.throws(() => rangeFetcherFor(key), /not a valid upload key/,
      `rangeFetcherFor should refuse ${JSON.stringify(key)}`);
  }
});

test('rangeFetcherFor returns a fetcher for a legitimate key', () => {
  const f = rangeFetcherFor('uploads/intake/abc123def456.pdf');
  assert.equal(typeof f, 'function');
  assert.equal(f.length, 2, 'the fetcher takes (begin, end)');
});


// ─── Kept sheets — the compressed copies a reviewer looks at later ──────────
// The originals are deleted after parsing, so these images are the only record
// of what the parser actually read. Two things matter: they must live somewhere
// the 1-day lifecycle rule does not sweep, and the key that names one arrives
// from a submission payload a member of the public wrote.

test('a kept-sheet key is not an upload key, and vice versa', () => {
  // The prefixes are deliberately separate: uploads/ is swept daily, sheets/ is
  // not. If the guards overlapped, a kept sheet could be written where it would
  // vanish overnight — and the reviewer would open an empty panel.
  assert.equal(isSheetKey('sheets/abc123def456.jpg'), true);
  assert.equal(isUploadKey('sheets/abc123def456.jpg'), false, 'sheets/ is not the upload prefix');
  assert.equal(isSheetKey('uploads/intake/abc123def456.pdf'), false, 'uploads/ is not the sheet prefix');
});

test('isSheetKey refuses anything a reviewer could be tricked into fetching', () => {
  for (const key of [
    '../../etc/passwd',
    'sheets/../uploads/intake/abc.pdf',
    'sheets/abc/../../secret.jpg',
    'sheets/nested/dir/abc.jpg',
    'sheets/abc.pdf',                 // right prefix, wrong kind of file
    'sheets/.jpg',
    'sheets/',
    '',
    null,
    undefined,
    12345,
    {},
  ]) {
    assert.equal(isSheetKey(key), false, `isSheetKey should refuse ${JSON.stringify(key)}`);
  }
});

test('a signed view link points at the sheet and expires the same day it is issued', async () => {
  const url = new URL(await presignSheetRead('sheets/abc123def456.jpg'));
  assert.match(url.hostname, /test-bucket/);
  assert.ok(url.pathname.includes('sheets/abc123def456.jpg'), 'the link addresses the sheet');
  assert.ok(url.searchParams.get('X-Amz-Signature'), 'the link is actually signed');
  // Short on purpose: the link is re-issued every time the submission is opened,
  // so a five-minute life costs a reviewer nothing and means a link that leaks
  // into a browser history or a pasted message is already dead.
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
});

test('presignSheetRead hands back nothing for a key it does not trust', async () => {
  for (const key of ['uploads/intake/abc123def456.pdf', '../secret.jpg', '', null]) {
    assert.equal(await presignSheetRead(key), null, `should refuse ${JSON.stringify(key)}`);
  }
});

test('putSheetImage refuses junk before it reaches the network', async () => {
  // Keeping a copy is a nice-to-have hung off the end of a parse that has
  // already succeeded. It returns null instead of throwing, because nothing
  // here is worth failing a GC's upload over.
  assert.equal(await putSheetImage(Buffer.from('x'), 'application/pdf'), null, 'not an image type');
  assert.equal(await putSheetImage(Buffer.alloc(0), 'image/jpeg'), null, 'nothing to store');
  assert.equal(await putSheetImage(null, 'image/jpeg'), null, 'no buffer at all');
});


// ── chunked uploads ───────────────────────────────────────────────────────
//
// Mike's phone died ~10% into a set on wifi (2026-08-29). One long PUT has no
// unit smaller than the whole file to retry, so a mid-transfer drop cost
// everything. These pin the shape of the fix.

test('a part is at least the 5 MB floor storage enforces on non-final parts', () => {
  assert.ok(PART_BYTES >= 5 * 1024 * 1024, 'S3 rejects a non-final part under 5 MB');
});

test('part count covers the whole file, with a partial last part', () => {
  assert.equal(partCountFor(PART_BYTES), 1, 'an exact single part is not split');
  assert.equal(partCountFor(PART_BYTES + 1), 2, 'one byte over needs a second part');
  assert.equal(partCountFor(PART_BYTES * 3), 3);
  // The real case: a 400 MB set must stay well inside storage's 10,000-part cap.
  const parts = partCountFor(MAX_INTAKE_UPLOAD_BYTES);
  assert.ok(parts > 1 && parts < 10000, `400 MB should chunk sanely, got ${parts}`);
});

test('a small file is never chunked \u2014 one PUT is simply better', () => {
  assert.equal(partCountFor(1024), 1);
  assert.ok(MULTIPART_MIN_BYTES >= PART_BYTES,
    'chunking below one part size would add an assembly step for nothing');
});

test('presigned links resolve on IPv6-only phone networks', async () => {
  // The standard bucket hostname has no AAAA record (checked 2026-08-29), so a
  // phone on an IPv6-only carrier cannot reach it at all. Every browser-facing
  // link must be minted on the dualstack host.
  const slip = await presignUpload({ scope: 'intake', ext: 'pdf', contentType: 'application/pdf' });
  assert.match(new URL(slip.url).host, /\.s3\.dualstack\./,
    'presigned uploads must use the dualstack endpoint');
});
