// /api/auth/me looked the user up by `jwtUser.id`, a name that was never
// defined, so it answered 500 every time and the admin-only tabs on the Sales
// Automation screen never appeared, even for Super Admins. Found 2026-09-11.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE, login, serverUp } from './_auth.mjs';

const src = readFileSync(new URL('../../src/app/api/auth/me/route.js', import.meta.url), 'utf8');

test('/api/auth/me looks the user up by the session it just read', () => {
  assert.match(src, /where: \{ id: session\.id \}/);
  assert.doesNotMatch(src, /jwtUser/);
});

test('/api/auth/me answers with the signed-in user on the running server', async (t) => {
  if (!(await serverUp())) { t.skip(`dev server not reachable at ${BASE}`); return; }
  const { cookie } = await login('admin@ilcstudios.com', 'ILCadmin2024!');
  const res = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user?.email, 'admin@ilcstudios.com');
  assert.equal(typeof body.salesAdmin, 'boolean');
});
