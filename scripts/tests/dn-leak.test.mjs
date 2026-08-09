// Live audit of the outbound routes that carry buy price. Requires a running
// dev server (`npm run dev:3000`) — run via `npm run verify:dn`.
//
// Unit tests prove src/lib/redact.js works. This proves the routes actually USE
// it, which is the half that failed before: the CO PDF route imported
// requireAuth() and then ignored its error, and the CO share route stripped
// originalDN while shipping the margin it is derived from.
//
// Everything here is disposable — a throwaway project, CO, share token and
// CLIENT_VIEWER, all deleted in after().
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { login, get, serverUp, BASE } from './_auth.mjs';
import { assertNoIlcOnly } from '../../src/lib/redact.js';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN        = { email: 'admin@ilcstudios.com', password: 'ILCadmin2024!' };
const VIEWER_EMAIL = 'dnleak-clientviewer@ilcstudios.test';
const VIEWER_PW    = 'DnLeakTest2026!';

// Distinctive values so a leak is unambiguous in raw HTML.
const DN_VALUE = 7777.77;
const CN_VALUE = 10101.01;
const MARGIN   = 0.23;

let fixture = null;   // { projectId, coId, token }
let ilc     = null;   // ILC_ADMIN session
let viewer  = null;   // CLIENT_VIEWER session

before(async () => {
  assert.ok(await serverUp(), `no dev server at ${BASE} — run \`npm run dev:3000\` first`);

  const admin = await prisma.user.findFirst({ where: { email: ADMIN.email } });
  assert.ok(admin, `seeded admin ${ADMIN.email} not found — run \`npm run db:seed\``);

  await prisma.user.upsert({
    where:  { email: VIEWER_EMAIL },
    update: { role: 'CLIENT_VIEWER', isActive: true, passwordHash: await bcrypt.hash(VIEWER_PW, 10) },
    create: { email: VIEWER_EMAIL, name: 'DN-leak CLIENT_VIEWER', role: 'CLIENT_VIEWER',
              isActive: true, passwordHash: await bcrypt.hash(VIEWER_PW, 10) },
  });

  const project = await prisma.project.create({
    data: {
      name: 'ZZ DN-leak audit (disposable)',
      createdBy:   { connect: { id: admin.id } },
      projectData: { create: { marginPct: MARGIN, salesTaxPct: 0.0815, freightPct: 0.06, warehousingPct: 0.03 } },
    },
  });

  const co = await prisma.changeOrder.create({
    data: {
      project:   { connect: { id: project.id } },
      createdBy: { connect: { id: admin.id } },
      coNumber:  'CO-99999',
      title:     'DN leak audit',
      optionGroups: {
        create: [{
          label: 'Option A', isSelected: true,
          lineItems: { create: [{ fixtureType: 'ZZ1', qty: 1, cnUnitPrice: CN_VALUE, originalDN: DN_VALUE }] },
        }],
      },
    },
  });

  const share = await prisma.changeOrderShare.create({
    data: { changeOrder: { connect: { id: co.id } }, createdBy: { connect: { id: admin.id } } },
  });

  fixture = { projectId: project.id, coId: co.id, token: share.token };
  ilc     = await login(ADMIN.email, ADMIN.password);
  viewer  = await login(VIEWER_EMAIL, VIEWER_PW);
});

after(async () => {
  if (fixture) {
    await prisma.projectData.deleteMany({ where: { projectId: fixture.projectId } }).catch(() => {});
    await prisma.project.deleteMany({ where: { id: fixture.projectId } }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { email: VIEWER_EMAIL } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

// ── Public share link ────────────────────────────────────────────────────────

test('public CO share link carries no ILC-only field anywhere in the payload', async () => {
  const { status, json, text } = await get(`/api/share/co/${fixture.token}`, null);
  assert.equal(status, 200, `share link returned ${status}: ${text.slice(0, 200)}`);
  assertNoIlcOnly(json, `GET /api/share/co/${fixture.token}`);
});

test('REGRESSION: public share link does not ship the margin (DN is derivable from it)', async () => {
  const { json, text } = await get(`/api/share/co/${fixture.token}`, null);
  assert.ok(!('marginPct' in (json?.rates || {})), 'rates.marginPct leaked to a public share link');
  assert.ok(!text.includes(String(MARGIN)), 'the margin value appears in the public share payload');
  assert.ok(!text.includes(String(DN_VALUE)), 'the DN value appears in the public share payload');
});

test('public share link still returns the client-facing numbers it is for', async () => {
  const { json } = await get(`/api/share/co/${fixture.token}`, null);
  const li = json.co.optionGroups[0].lineItems[0];
  assert.equal(li.cnUnitPrice, CN_VALUE, 'redaction removed the client price');
  assert.equal(li.totalCN, CN_VALUE, 'computed total went missing');
  assert.equal(json.rates.freightPct, 0.06, 'redaction removed a rate the share page renders');
  assert.equal(json.rates.salesTaxPct, 0.0815);
  assert.ok(json.co.optionGroups[0].footer.total > 0, 'footer total should still be computed');
});

// ── Change-order PDF ─────────────────────────────────────────────────────────

const pdfPath = (q = '') => `/api/projects/${fixture.projectId}/change-orders/${fixture.coId}/pdf${q}`;

test('REGRESSION: CO PDF requires a session — it used to serve to anyone with the URL', async () => {
  const { status } = await get(pdfPath('?hideInternalDN=false'), null);
  assert.equal(status, 401, `unauthenticated CO PDF returned ${status}, expected 401`);
});

test('CO PDF hides DN by default even for ILC staff', async () => {
  const { status, text } = await get(pdfPath(), ilc.cookie);
  assert.equal(status, 200);
  assert.ok(!text.includes('Orig DN'), 'DN column rendered without being asked for');
  assert.ok(!text.includes(String(DN_VALUE)), 'DN value rendered without being asked for');
});

test('CO PDF shows DN to ILC staff who explicitly ask — the internal view still works', async () => {
  const { status, text } = await get(pdfPath('?hideInternalDN=false'), ilc.cookie);
  assert.equal(status, 200);
  assert.ok(text.includes('Orig DN'), 'ILC staff lost the internal DN column');
  assert.ok(text.includes('7,777.77'), 'ILC staff lost the DN value');
});

test('REGRESSION: a logged-in CLIENT_VIEWER cannot opt into the DN column', async () => {
  const { status, text } = await get(pdfPath('?hideInternalDN=false'), viewer.cookie);
  assert.ok(status < 500, `CLIENT_VIEWER got ${status}`);
  assert.ok(!text.includes('Orig DN'), 'CLIENT_VIEWER was served the internal DN column');
  assert.ok(!text.includes('7,777.77'), 'CLIENT_VIEWER was served the DN value');
});

// ── Portal ───────────────────────────────────────────────────────────────────
// These routes redact via Prisma `select` allowlists rather than redact(). That
// is a legitimate second pattern — it never loads the field at all — but it has
// to be verified the same way, or an added `include` reopens the hole silently.

test('portal budget + change-order routes refuse unauthenticated callers', async () => {
  for (const path of [
    `/api/portal/projects/${fixture.projectId}/budget`,
    `/api/portal/projects/${fixture.projectId}/change-orders`,
    `/api/portal/projects/${fixture.projectId}/conceptual-budget`,
  ]) {
    const { status, json } = await get(path, null);
    assert.ok(status === 401 || status === 403, `${path} returned ${status}, expected 401/403`);
    if (json) assertNoIlcOnly(json, `GET ${path} (unauthenticated)`);
  }
});
