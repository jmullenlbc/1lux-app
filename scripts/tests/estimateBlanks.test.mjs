// Blank = we estimate it on the internal wizards (Mike 10-17): once the
// minimum figures are in, blanks get the public tool's estimate, saved and
// tagged 'guess'; a typed 0 stays 0; an emptied box is estimated again.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { login, serverUp, BASE } from './_auth.mjs';
import { PrismaClient } from '@prisma/client';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';
import { estimateBlankFigures, figuresStillNeeded } from '../../src/lib/figures/estimateBlanks.js';

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
const sourceOf = async field => (await prisma.projectFigureSource.findUnique({
  where: { projectId_field: { projectId, field } },
}))?.source ?? null;

test('pure: the minimum figures, in plain words', () => {
  assert.deepEqual(figuresStillNeeded({ numUnits: 200 }, 'wrap'),
    ['Total building SF or unit SF', 'Stories', 'Surface parking stalls (0 if none)']);
  assert.deepEqual(figuresStillNeeded({ numUnits: 200, grossSf: 100000, numFloors: 4, numSurfaceParking: 0 }, 'wrap'), []);
  // An earlier estimate does not count as typed.
  assert.ok(figuresStillNeeded({ numUnits: 200, grossSf: 100000, numFloors: 4, numSurfaceParking: 0 }, 'wrap', new Set(['grossSf']))
    .includes('Total building SF or unit SF'));
});

test('pure: nothing is estimated before the minimum figures are in', () => {
  assert.deepEqual(estimateBlankFigures({ numUnits: 200, grossSf: 100000 }, 'wrap').values, {});
});

test('pure: a wrap at 100,000 SF gets a 12% corridor; a typed 0 stays 0', () => {
  const pd = { numUnits: 200, grossSf: 100000, numFloors: 4, numSurfaceParking: 50 };
  assert.equal(estimateBlankFigures(pd, 'wrap').values.corridorSf, 12000);
  assert.equal('corridorSf' in estimateBlankFigures({ ...pd, corridorSf: 0 }, 'wrap').values, false);
});

before(async () => {
  assert.ok(await serverUp(), `no dev server at ${BASE}, run \`npm run dev:3000\` first`);
  const ADMIN = await ensureE2eAdmin(prisma);
  const admin = await prisma.user.findFirst({ where: { email: ADMIN.email } });
  const project = await prisma.project.create({
    data: {
      name: 'ZZ estimate-the-blanks test (disposable)',
      buildingType: 'wrap',
      budgetType: 'design',
      createdBy: { connect: { id: admin.id } },
      projectData: { create: { numUnits: 200, numFloors: 4, numSurfaceParking: 50 } },
    },
  });
  projectId = project.id;
  session = await login(ADMIN.email, ADMIN.password);
});

after(async () => {
  if (projectId) {
    await prisma.projectFigureSource.deleteMany({ where: { projectId } }).catch(() => {});
    await prisma.projectActivity.deleteMany({ where: { projectId } }).catch(() => {});
    await prisma.questionnaireResponse.deleteMany({ where: { projectId } }).catch(() => {});
    await prisma.projectData.deleteMany({ where: { projectId } }).catch(() => {});
    await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

test('route: typing gross SF fills the blanks, tagged as estimates', async () => {
  const r = await put({ grossSf: '100,000' });
  assert.equal(r.status, 200);
  assert.equal(r.json.projectData.corridorSf, 12000);
  assert.ok(r.json.projectData.estimatedFields.includes('corridorSf'));
  assert.equal(await sourceOf('corridorSf'), 'guess');
  assert.equal(await sourceOf('grossSf'), 'staff');
});

test('route: a typed 0 stays 0 and is a person\'s figure', async () => {
  const r = await put({ corridorSf: '0' });
  assert.equal(r.json.projectData.corridorSf, 0);
  assert.equal(r.json.projectData.estimatedFields.includes('corridorSf'), false);
  assert.equal(await sourceOf('corridorSf'), 'staff');
});

test('route: an emptied box is estimated again', async () => {
  const r = await put({ corridorSf: '', clearFields: ['corridorSf'] });
  assert.equal(r.json.projectData.corridorSf, 12000);
  assert.equal(await sourceOf('corridorSf'), 'guess');
});

test('route: emptying a minimum figure takes the estimates back out', async () => {
  const r = await put({ numFloors: '', clearFields: ['numFloors'] });
  assert.equal(r.json.projectData.corridorSf, null);
  assert.deepEqual(r.json.projectData.estimatedFields, []);
});

test('route: opening an older project fills its blanks once', async () => {
  const admin = await prisma.user.findFirst({ where: { email: (await ensureE2eAdmin(prisma)).email } });
  const old = await prisma.project.create({
    data: {
      name: 'ZZ old-project fill test (disposable)',
      buildingType: 'wrap', budgetType: 'design',
      createdBy: { connect: { id: admin.id } },
      projectData: { create: { numUnits: 200, numFloors: 4, numSurfaceParking: 50, grossSf: 100000, bohSf: 0 } },
    },
  });
  try {
    const res = await fetch(`${BASE}/project/${old.id}`, { headers: { cookie: session.cookie } });
    assert.equal(res.status, 200);
    const pd = await prisma.projectData.findUnique({ where: { projectId: old.id } });
    assert.equal(pd.corridorSf, 12000);
    assert.equal(pd.bohSf, 0); // a typed 0 stays 0
    const src = await prisma.projectFigureSource.findUnique({ where: { projectId_field: { projectId: old.id, field: 'corridorSf' } } });
    assert.equal(src?.source, 'guess');
  } finally {
    await prisma.projectFigureSource.deleteMany({ where: { projectId: old.id } }).catch(() => {});
    await prisma.projectActivity.deleteMany({ where: { projectId: old.id } }).catch(() => {});
    await prisma.projectData.deleteMany({ where: { projectId: old.id } }).catch(() => {});
    await prisma.project.deleteMany({ where: { id: old.id } }).catch(() => {});
  }
});
