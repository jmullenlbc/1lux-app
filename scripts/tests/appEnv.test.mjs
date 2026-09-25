// Mike 2026-09-24: staging must say so, big, on every page. Live says nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appEnv, liveUrl } from '../../src/lib/appEnv.js';

test('the env variable decides first', () => {
  assert.equal(appEnv('staging', 'app.ilcstudios.com'), 'staging');
  assert.equal(appEnv('production', 'staging.app.ilcstudios.com'), 'live');
});

test('with no variable, a staging web address still counts as staging', () => {
  assert.equal(appEnv(undefined, 'staging.app.ilcstudios.com'), 'staging');
  assert.equal(appEnv('', 'staging.d1abc.amplifyapp.com'), 'staging');
  assert.equal(appEnv(undefined, 'app.ilcstudios.com'), 'live');
  assert.equal(appEnv(undefined, 'localhost'), 'live');
  assert.equal(appEnv(undefined, 'nostagingplease.com'), 'live');
});

test('"Go to live" lands on the same page on the live copy', () => {
  assert.equal(liveUrl('/project/abc/summary'), 'https://app.ilcstudios.com/project/abc/summary');
  assert.equal(liveUrl(''), 'https://app.ilcstudios.com/');
});
