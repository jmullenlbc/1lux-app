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

const { validatePresignRequest, presignUpload, isUploadKey, MAX_DIRECT_UPLOAD_BYTES } =
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

test('rejects files over the 50 MB ceiling, accepts exactly at it', () => {
  const over = validatePresignRequest({ fileName: 'huge.pdf', size: MAX_DIRECT_UPLOAD_BYTES + 1 });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'too_large');

  const at = validatePresignRequest({ fileName: 'big.pdf', size: MAX_DIRECT_UPLOAD_BYTES });
  assert.equal(at.ok, true, 'exactly 50 MB is allowed');
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
  assert.equal(slip.expiresIn, 600);

  const url = new URL(slip.url);
  assert.match(url.hostname, /test-bucket/, 'URL targets the configured bucket');
  assert.ok(url.pathname.includes('uploads/intake/'), 'URL path carries the key');
  assert.ok(url.searchParams.get('X-Amz-Signature'), 'URL is actually signed');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '600');
});

test('two slips never share a key', async () => {
  const a = await presignUpload({ scope: 'intake', ext: 'pdf', contentType: 'application/pdf' });
  const b = await presignUpload({ scope: 'intake', ext: 'pdf', contentType: 'application/pdf' });
  assert.notEqual(a.key, b.key);
});
