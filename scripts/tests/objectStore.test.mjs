/**
 * Unit tests for src/lib/objectStore.js, the one place that knows where uploaded files live.
 * Presigning is local crypto, so no bucket, account or network is touched.
 * Run: node --test scripts/tests/objectStore.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const { storageSettings, objectStoreOn, s3ClientOptions, s3Client, storageDescription } =
  await import('../../src/lib/objectStore.js');

// Not in AWS's real key shape, so the pre-push secret scanner stays quiet.
const KEYS = { S3_ACCESS_KEY_ID: 'fake-access-key-id-for-tests', S3_SECRET_ACCESS_KEY: 'testfakesecrettestfakesecrettestfakesec' };

test('no bucket means local disk', () => {
  assert.equal(objectStoreOn({}), false);
  assert.equal(objectStoreOn({ S3_BUCKET: '   ' }), false);
  assert.deepEqual(storageDescription({}), { kind: 'local-disk', bucket: null, endpointHost: null });
});

test('AWS S3: default region, dualstack for IPv6-only phones, keys passed', () => {
  const env = { S3_BUCKET: 'b', ...KEYS };
  const o = s3ClientOptions(env);
  assert.equal(o.region, 'us-east-2');
  assert.equal(o.useDualstackEndpoint, true);
  assert.equal(o.endpoint, undefined);
  assert.deepEqual(o.credentials, { accessKeyId: KEYS.S3_ACCESS_KEY_ID, secretAccessKey: KEYS.S3_SECRET_ACCESS_KEY });
  assert.equal(storageDescription(env).kind, 'aws-s3');
});

test('no keys: falls back to the default credential chain', () => {
  assert.equal(s3ClientOptions({ S3_BUCKET: 'b' }).credentials, undefined);
});

test('S3-compatible endpoint (Cloudflare R2): endpoint as given, region auto, no dualstack', () => {
  const env = { S3_BUCKET: 'b', S3_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com/', ...KEYS };
  const o = s3ClientOptions(env);
  assert.equal(o.endpoint, 'https://acct123.r2.cloudflarestorage.com');
  assert.equal(o.region, 'auto');
  assert.equal(o.useDualstackEndpoint, undefined);
  assert.equal(o.forcePathStyle, undefined);
  assert.deepEqual(storageDescription(env), { kind: 's3-compatible', bucket: 'b', endpointHost: 'acct123.r2.cloudflarestorage.com', region: 'auto' });
});

test('explicit region and path-style addressing are honoured', () => {
  const o = s3ClientOptions({ S3_BUCKET: 'b', S3_ENDPOINT: 'http://localhost:9000', S3_REGION: 'us-west-000', S3_FORCE_PATH_STYLE: 'true' });
  assert.equal(o.region, 'us-west-000');
  assert.equal(o.forcePathStyle, true);
  assert.equal(storageSettings({ S3_FORCE_PATH_STYLE: 'no' }).forcePathStyle, false);
});

test('presigned links point at the configured store', async () => {
  const aws = await getSignedUrl(s3Client({ S3_BUCKET: 'my-bucket', S3_REGION: 'us-east-1', ...KEYS }),
    new GetObjectCommand({ Bucket: 'my-bucket', Key: 'uploads/a.pdf' }), { expiresIn: 60 });
  assert.match(new URL(aws).host, /^my-bucket\.s3\.dualstack\.us-east-1\.amazonaws\.com$/);

  const r2 = await getSignedUrl(s3Client({ S3_BUCKET: 'my-bucket', S3_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com', ...KEYS }),
    new GetObjectCommand({ Bucket: 'my-bucket', Key: 'uploads/a.pdf' }), { expiresIn: 60 });
  assert.ok(new URL(r2).host.endsWith('acct123.r2.cloudflarestorage.com'), r2);

  const minio = await getSignedUrl(s3Client({ S3_BUCKET: 'my-bucket', S3_ENDPOINT: 'http://localhost:9000', S3_FORCE_PATH_STYLE: '1', ...KEYS }),
    new GetObjectCommand({ Bucket: 'my-bucket', Key: 'uploads/a.pdf' }), { expiresIn: 60 });
  const u = new URL(minio);
  assert.equal(u.host, 'localhost:9000');
  assert.ok(u.pathname.startsWith('/my-bucket/uploads/a.pdf'), u.pathname);
});

test('the storage modules all use the shared client', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['src/lib/qcStorage.js', 'src/lib/projectFileStorage.js', 'src/lib/botKnowledge/storage.js']) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.ok(!/new S3Client\(/.test(src), `${f} builds its own S3 client; use objectStore.js`);
    assert.match(src, /objectStore\.js/, `${f} should import objectStore.js`);
  }
});
