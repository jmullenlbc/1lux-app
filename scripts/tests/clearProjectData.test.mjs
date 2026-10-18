// A box emptied in the wizard really empties (design wizard bug 2, 10-17):
// the form sends clearFields for touched blank boxes; plain blanks still mean
// "no change" so a stale form can never wipe a figure.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { login, serverUp, BASE } from './_auth.mjs';
import { PrismaClient } from '@prisma/client';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

const prisma = new PrismaClient();
let projectId = null;
let session = null;

async function put(body) {
  const res = await fetch(`${BASE}/api/projects/${projectId}/data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie: session.cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

before(async () => {
  assert.ok(await serverUp(), `no dev server at ${BASE}, run \`npm run dev:3000\` first`);
  const ADMIN = await ensureE2eAdmin(prisma);
  const admin = await prisma.user.findFirst({ where: { email: ADMIN.email } });
  const project = await prisma.project.create({
    data: {
      name: 'ZZ clear-a-box test (disposable)',
      createdBy: { connect: { id: admin.id } },
      projectData: { create: { corridorSf: 5000, numFloors: 4, numStairwells: 2, numEgressStairwells: 14 } },
    },
  });
  projectId = project.id;
  session = await login(ADMIN.email, ADMIN.password);
});

after(async () => {
  if (projectId) {
    await prisma.activityLog?.deleteMany?.({ where: { projectId } }).catch(() => {});
    await prisma.questionnaireResponse.deleteMany({ where: { projectId } }).catch(() => {});
    await prisma.projectData.deleteMany({ where: { projectId } }).catch(() => {});
    await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

test('a plain blank changes nothing', async () => {
  const r = await put({ corridorSf: '' });
  assert.equal(r.status, 200);
  assert.equal(r.json.projectData.corridorSf, 5000);
});

test('clearFields empties the box', async () => {
  const r = await put({ corridorSf: '', clearFields: ['corridorSf'] });
  assert.equal(r.status, 200);
  assert.equal(r.json.projectData.corridorSf, null);
});

test('clearing stairwells clears the landings worked out from them', async () => {
  const r = await put({ clearFields: ['numStairwells'] });
  assert.equal(r.json.projectData.numStairwells, null);
  assert.equal(r.json.projectData.numEgressStairwells, null);
});

test('unknown field names in clearFields are ignored', async () => {
  const r = await put({ clearFields: ['name', 'createdById'] });
  assert.equal(r.status, 200);
});
