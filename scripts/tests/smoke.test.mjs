// Role-aware smoke tests. Requires a running dev server (`npm run dev:3000`).
//
// These exist because of two real production bugs (2026-07-06):
//   1. Projects were gated to creator-or-super-admin, so COMPANY_ADMIN saw ZERO
//      projects and 404'd opening any. Nothing caught it but a teammate complaining.
//   2. Routes 500'd after a column was dropped by `db push --accept-data-loss`.
//
// The seeded accounts are all ILC_ADMIN, which would NOT have caught bug #1 — the
// break was role-specific. So we stand up a disposable COMPANY_ADMIN for the run
// and delete it afterwards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { login, get, serverUp, BASE } from './_auth.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const TEMP_EMAIL = 'smoke-companyadmin@ilcstudios.test';
const TEMP_PW    = 'SmokeTest2026!';

const SEEDED = [{ label: 'ILC_ADMIN', email: 'admin@ilcstudios.com', password: 'ILCadmin2024!' }];

const PAGES = ['/dashboard', '/crm', '/clients', '/pre-con',
  '/dashboards/main', '/dashboards/sales', '/dashboards/meeting'];
const APIS = ['/api/projects', '/api/clients', '/api/sales/meeting', '/api/users'];

let sessions = [];

before(async () => {
  assert.ok(await serverUp(), `no dev server at ${BASE} — run \`npm run dev:3000\` first`);

  // Disposable non-super-admin — the role class that regressed.
  await prisma.user.upsert({
    where:  { email: TEMP_EMAIL },
    update: { role: 'COMPANY_ADMIN', isActive: true, passwordHash: await bcrypt.hash(TEMP_PW, 10) },
    create: { email: TEMP_EMAIL, name: 'Smoke COMPANY_ADMIN', role: 'COMPANY_ADMIN',
              isActive: true, passwordHash: await bcrypt.hash(TEMP_PW, 10) },
  });

  for (const a of [...SEEDED, { label: 'COMPANY_ADMIN', email: TEMP_EMAIL, password: TEMP_PW }]) {
    sessions.push({ ...a, ...(await login(a.email, a.password)) });
  }
});

after(async () => {
  await prisma.user.deleteMany({ where: { email: TEMP_EMAIL } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

test('every test account can log in', () => {
  assert.equal(sessions.length, 2, 'expected an ILC_ADMIN and a COMPANY_ADMIN session');
});

test('no app page 500s for any ILC role', async () => {
  const failures = [];
  for (const s of sessions) {
    for (const p of PAGES) {
      const { status } = await get(p, s.cookie);
      if (status >= 500) failures.push(`${s.label} ${p} → ${status}`);
    }
  }
  assert.deepStrictEqual(failures, []);
});

test('no GET API 500s for any ILC role', async () => {
  const failures = [];
  for (const s of sessions) {
    for (const a of APIS) {
      const { status } = await get(a, s.cookie);
      if (status >= 500) failures.push(`${s.label} ${a} → ${status}`);
    }
  }
  assert.deepStrictEqual(failures, []);
});

// ── The regression that actually bit us ──────────────────────────────────────
test('EVERY ILC role can see projects (not just the creator)', async () => {
  const blind = [];
  for (const s of sessions) {
    const { json } = await get('/api/projects', s.cookie);
    const list = Array.isArray(json) ? json : (json?.projects || []);
    if (list.length === 0) blind.push(`${s.label} sees 0 projects`);
  }
  assert.deepStrictEqual(blind, [],
    'a role sees no projects — visibility regressed to creator-only');
});

test('EVERY ILC role can open a project they did not create', async () => {
  const admin = sessions.find(s => s.label === 'ILC_ADMIN');
  const { json } = await get('/api/projects', admin.cookie);
  const list = Array.isArray(json) ? json : (json?.projects || []);
  if (!list.length) return; // nothing seeded to check against

  const blocked = [];
  for (const s of sessions) {
    const { status } = await get(`/project/${list[0].id}`, s.cookie);
    if (status === 404) blocked.push(`${s.label} got 404 opening a project it didn't create`);
  }
  assert.deepStrictEqual(blocked, [],
    'a role was blocked from a project it did not create — visibility regressed');
});
