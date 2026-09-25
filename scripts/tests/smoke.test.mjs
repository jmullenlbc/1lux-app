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
const TEMP_PW = 'SmokeTest2026!';

// Disposable accounts for the roles the seeded data does not cover.
//
// USER is here because of Mike, 2026-08-25: a staff account on the live app
// opened Clients and saw an empty page. Every client had been created by
// somebody else, and the list narrowed to admins. ILC_ADMIN and COMPANY_ADMIN
// both passed that day — the break only showed on the plain USER role, which
// is why the role list below has to include it.
const TEMP_ACCOUNTS = [
  { label: 'COMPANY_ADMIN', email: 'smoke-companyadmin@ilcstudios.test', role: 'COMPANY_ADMIN' },
  { label: 'USER',          email: 'smoke-user@ilcstudios.test',         role: 'USER' },
];

// Admin login comes from the private .env, never typed here (this file is in git).
const SEEDED = [{ label: 'ILC_ADMIN', email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD }];

const PAGES = ['/dashboard', '/crm', '/clients', '/pre-con',
  '/dashboards/main', '/dashboards/sales', '/dashboards/meeting'];
const APIS = ['/api/projects', '/api/clients', '/api/sales/meeting', '/api/users'];

let sessions = [];

before(async () => {
  assert.ok(await serverUp(), `no dev server at ${BASE} — run \`npm run dev:3000\` first`);
  assert.ok(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD, 'set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in .env first');

  // Disposable non-super-admins — the role class that regressed, twice.
  const passwordHash = await bcrypt.hash(TEMP_PW, 10);
  for (const a of TEMP_ACCOUNTS) {
    await prisma.user.upsert({
      where:  { email: a.email },
      update: { role: a.role, isActive: true, passwordHash },
      create: { email: a.email, name: `Smoke ${a.role}`, role: a.role, isActive: true, passwordHash },
    });
  }

  for (const a of [...SEEDED, ...TEMP_ACCOUNTS.map(a => ({ ...a, password: TEMP_PW }))]) {
    sessions.push({ ...a, ...(await login(a.email, a.password)) });
  }
});

after(async () => {
  await prisma.user
    .deleteMany({ where: { email: { in: TEMP_ACCOUNTS.map(a => a.email) } } })
    .catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

test('every test account can log in', () => {
  assert.equal(sessions.length, 1 + TEMP_ACCOUNTS.length,
    'expected an ILC_ADMIN plus one session per disposable role');
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

// ── The same regression, on the clients side (Mike, 2026-08-25) ──────────────
// Projects had been opened up months earlier; clients had not, so a staff
// account could see the work and none of the companies it was for.
test('EVERY ILC role can see clients', async () => {
  const blind = [];
  for (const s of sessions) {
    const { json } = await get('/api/clients', s.cookie);
    const list = Array.isArray(json) ? json : (json?.clients || []);
    if (list.length === 0) blind.push(`${s.label} sees 0 clients`);
  }
  assert.deepStrictEqual(blind, [],
    'a role sees no clients — visibility regressed to creator-only');
});

test('EVERY ILC role can open a client, and the people inside it', async () => {
  const admin = sessions.find(s => s.label === 'ILC_ADMIN');
  const { json } = await get('/api/clients', admin.cookie);
  const list = Array.isArray(json) ? json : (json?.clients || []);
  if (!list.length) return; // nothing seeded to check against

  const blocked = [];
  for (const s of sessions) {
    const page = await get(`/clients/${list[0].id}`, s.cookie);
    if (page.status === 404) blocked.push(`${s.label} got 404 opening a client it didn't create`);
    // "people within clients" is the third thing Mike named, and it is a
    // separate route with its own copy of the old rule.
    const contacts = await get(`/api/clients/${list[0].id}/contacts`, s.cookie);
    if (contacts.status === 403) blocked.push(`${s.label} got 403 on that client's contacts`);
  }
  assert.deepStrictEqual(blocked, [],
    'a role was blocked from a client it did not create — visibility regressed');
});
