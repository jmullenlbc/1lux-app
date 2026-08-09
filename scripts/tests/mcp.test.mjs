// Live acceptance tests for the Librarian (/api/mcp) — Slice 3.
//
// Requires a running dev server (`npm run dev:3000`); run via `npm run verify:mcp`.
//
// The point of testing over real HTTP rather than calling the tools directly:
// the guards are only worth anything if they hold on the wire, through the real
// auth path, for a real logged-in CLIENT_VIEWER. So this file creates a
// disposable CLIENT_VIEWER, logs it in, and makes it try to read the buy price
// nine different ways.
//
// Every DN assertion is PAIRED with an ILC positive control on the same row. A
// test that only asserts "the client did not see 6363.63" passes just as happily
// when the query returned nothing at all, when the model name was wrong, or when
// the endpoint 500'd — which is how a redaction test quietly stops testing
// redaction. The ILC half proves the value was there to leak.
//
// Everything created here is disposable and removed in after().
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { login, get, post, serverUp, BASE } from './_auth.mjs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN        = { email: 'admin@ilcstudios.com', password: 'ILCadmin2024!' };
const VIEWER_EMAIL = 'mcp-clientviewer@ilcstudios.test';
const VIEWER_PW    = 'McpTest2026!';

// Distinctive values, so a leak is unambiguous in a raw response body. Several
// assertions below check the value is absent from the WHOLE payload, so these
// must not be substrings of anything incidental: a two-decimal margin like 0.27
// collides with the millisecond field of an ISO timestamp (`:10.271Z`) often
// enough to flake. Four decimals does not.
const DN_VALUE = 6363.63;
const CN_VALUE = 9191.91;
const MARGIN   = 0.2637;
const TAX      = 0.0815;

// Two fixtures, because there are two different boundaries to prove.
//
//   fixture — a project the CLIENT_VIEWER OWNS. Every redaction test reads this
//             one, so it fails on redaction rather than on an empty result. It is
//             the harder version of the claim: even on your own project, you do
//             not see the buy price.
//   foreign — a project owned by ILC. Every row-scope test reads this one, and
//             the client must not reach it at all.
//
// Before row scoping existed, one fixture served both roles and the redaction
// tests happened to pass because the client could read every row in the database.
let fixture   = null;   // { projectId, coId, groupId, lineItemId } — viewer-owned
let foreign   = null;   // { projectId, coId, lineItemId, name }    — ILC-owned
let ilc       = null;
let viewer    = null;
let viewerId  = null;
let adminRole = null;   // whatever the seed actually gave the admin

const mcp = (body, auth) => post('/api/mcp', body, auth);

/**
 * The JSON-RPC shape, unwrapped to the tool's own result object.
 *
 * A tool result comes back as `result.content[0].text` holding pretty-printed
 * JSON — so a leak check has to look at BOTH the parsed object and the raw text,
 * which is why this returns both.
 */
async function rpc(method, params, auth, id = 1) {
  const { status, json } = await post('/api/mcp', { jsonrpc: '2.0', id, method, params }, auth);
  const text = json?.result?.content?.[0]?.text || '';
  let result = null;
  try { result = text ? JSON.parse(text) : null; } catch { result = null; }
  return { status, envelope: json, isError: json?.result?.isError === true, text, result };
}

before(async () => {
  assert.ok(await serverUp(), `no dev server at ${BASE} — run \`npm run dev:3000\` first`);

  const admin = await prisma.user.findFirst({ where: { email: ADMIN.email } });
  assert.ok(admin, `seeded admin ${ADMIN.email} not found — run \`npm run db:seed\``);
  // Read the role rather than assuming it. The schema carries both the current
  // names (SUPER_ADMIN) and the legacy ones (ILC_ADMIN); the audit assertion
  // below cares that the log recorded the RIGHT role, not which name it is.
  adminRole = admin.role;

  const viewerUser = await prisma.user.upsert({
    where:  { email: VIEWER_EMAIL },
    update: { role: 'CLIENT_VIEWER', isActive: true, passwordHash: await bcrypt.hash(VIEWER_PW, 10) },
    create: { email: VIEWER_EMAIL, name: 'MCP CLIENT_VIEWER', role: 'CLIENT_VIEWER',
              isActive: true, passwordHash: await bcrypt.hash(VIEWER_PW, 10) },
  });
  viewerId = viewerUser.id;

  // Owned by the viewer, because src/app/api/projects/route.js scopes a
  // CLIENT_VIEWER with `{ createdById: user.id }` and src/lib/mcp/scope.js
  // mirrors it. Owning the row is what makes the redaction tests below test
  // redaction instead of testing the row filter.
  const project = await prisma.project.create({
    data: {
      name: 'ZZ MCP audit (disposable)',
      createdBy:   { connect: { id: viewerUser.id } },
      // marginPct is ilc_only; salesTaxPct is client_ok. Both on one row, so the
      // margin test can prove redaction removed one and kept the other.
      projectData: { create: { marginPct: MARGIN, salesTaxPct: TAX } },
    },
  });

  const co = await prisma.changeOrder.create({
    data: {
      project:   { connect: { id: project.id } },
      createdBy: { connect: { id: admin.id } },
      coNumber:  'CO-99998',
      title:     'MCP audit',
      optionGroups: {
        create: [{
          label: 'Option A', isSelected: true,
          lineItems: { create: [{ fixtureType: 'ZZ-MCP', qty: 1, description: 'MCP test fixture',
                                  cnUnitPrice: CN_VALUE, originalDN: DN_VALUE }] },
        }],
      },
    },
    include: { optionGroups: { include: { lineItems: true } } },
  });

  fixture = {
    projectId:  project.id,
    coId:       co.id,
    groupId:    co.optionGroups[0].id,
    lineItemId: co.optionGroups[0].lineItems[0].id,
  };

  // Somebody else's project. Distinctive name so a scope leak is unmistakable in
  // a raw body, and the same DN value so the "nothing about it comes back" checks
  // can reuse the leak markers.
  const foreignName = 'ZZ MCP foreign (disposable)';
  const foreignProject = await prisma.project.create({
    data: {
      name: foreignName,
      createdBy:   { connect: { id: admin.id } },
      projectData: { create: { marginPct: MARGIN, salesTaxPct: TAX } },
    },
  });

  const foreignCo = await prisma.changeOrder.create({
    data: {
      project:   { connect: { id: foreignProject.id } },
      createdBy: { connect: { id: admin.id } },
      coNumber:  'CO-99997',
      title:     'MCP foreign',
      optionGroups: {
        create: [{
          label: 'Option A', isSelected: true,
          lineItems: { create: [{ fixtureType: 'ZZ-FOREIGN', qty: 1, description: 'not the viewer\'s',
                                  cnUnitPrice: CN_VALUE, originalDN: DN_VALUE }] },
        }],
      },
    },
    include: { optionGroups: { include: { lineItems: true } } },
  });

  foreign = {
    name:       foreignName,
    projectId:  foreignProject.id,
    coId:       foreignCo.id,
    lineItemId: foreignCo.optionGroups[0].lineItems[0].id,
  };

  ilc    = await login(ADMIN.email, ADMIN.password);
  viewer = await login(VIEWER_EMAIL, VIEWER_PW);
});

after(async () => {
  // Deleted by project id rather than by name: an earlier run whose before()
  // threw mid-way leaves an orphan, and matching on the name would delete rows
  // this run never created.
  // Children first — the CO is not guaranteed to cascade off the project, and an
  // orphaned CO-99998 would collide with the next run's fixture.
  for (const f of [fixture, foreign]) {
    if (!f) continue;
    await prisma.changeOrder.deleteMany({ where: { id: f.coId } }).catch(() => {});
    await prisma.projectData.deleteMany({ where: { projectId: f.projectId } }).catch(() => {});
    await prisma.project.deleteMany({ where: { id: f.projectId } }).catch(() => {});
  }
  // The viewer owns fixture.projectId, so the user row must go last or the
  // delete fails on a foreign key and leaves the project behind.
  await prisma.user.deleteMany({ where: { email: VIEWER_EMAIL } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

// ── Discovery and authentication ─────────────────────────────────────────────

test('GET describes the service without a credential, and lists exactly the expected tools', async () => {
  const { status, json } = await get('/api/mcp', null);
  assert.equal(status, 200);
  assert.equal(json.service, 'ilc-librarian');

  const names = json.tools.map(t => t.name).sort();
  // Pinned rather than counted. A tool appearing in this list is a deliberate
  // act, and a WRITE tool appearing in it is the single thing this slice exists
  // to prevent — so the list is asserted whole and a new tool fails this test
  // until someone writes its guard tests.
  assert.deepEqual(names, [
    'count_records', 'describe_model', 'get_client_360', 'get_pipeline',
    'get_project_360', 'get_record', 'list_models', 'query_records', 'search',
  ]);
  assert.equal(json.readOnly, true);
});

test('POST without a credential is refused — no degrading to a public view', async () => {
  const { status } = await mcp({ tool: 'list_models', params: {} }, null);
  assert.equal(status, 401);
});

test('a bearer token is never accepted while bearer auth is unconfigured', async () => {
  // The Amplify trap: if MCP_API_TOKEN inlines as undefined, a naive comparison
  // authenticates the literal string "undefined". 503 (loud misconfiguration) or
  // 401 (wrong token) are both correct here. 200 is the bug.
  const { status } = await mcp({ tool: 'list_models', params: {} }, { bearer: 'undefined' });
  assert.ok(status === 401 || status === 503, `literal "undefined" bearer returned ${status}`);
  assert.notEqual(status, 200);
});

// ── The boundary itself: paired ILC / client reads of one row ────────────────

test('POSITIVE CONTROL: ILC reads the line item and gets originalDN', async () => {
  const { status, json } = await mcp({
    tool: 'query_records',
    params: { model: 'ChangeOrderLineItem', where: { id: fixture.lineItemId } },
  }, ilc.cookie);

  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.count, 1, 'fixture row not found — every paired assertion below would pass vacuously');
  assert.equal(json.records[0].originalDN, DN_VALUE, 'ILC lost the DN it is entitled to');
});

test('a CLIENT_VIEWER reads the same row and originalDN is absent', async () => {
  const { status, json, text } = await mcp({
    tool: 'query_records',
    params: { model: 'ChangeOrderLineItem', where: { id: fixture.lineItemId } },
  }, viewer.cookie);

  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.count, 1, 'the client got no row — this test must fail on redaction, not on an empty result');
  const row = json.records[0];
  assert.equal(row.cnUnitPrice, CN_VALUE, 'redaction removed the client-facing sell price');
  assert.ok(!('originalDN' in row), 'originalDN reached a CLIENT_VIEWER');
  assert.ok(!('quoteReference' in row), 'quoteReference reached a CLIENT_VIEWER');
  assert.ok(!text.includes(String(DN_VALUE)), 'the DN value appears somewhere in the response body');
});

test('describe_model never names an ilc_only field to a client', async () => {
  const asIlc = await mcp({ tool: 'describe_model', params: { model: 'ChangeOrderLineItem' } }, ilc.cookie);
  assert.equal(asIlc.status, 200);
  assert.ok('originalDN' in asIlc.json.properties, 'ILC lost the field from the schema description');

  const asClient = await mcp({ tool: 'describe_model', params: { model: 'ChangeOrderLineItem' } }, viewer.cookie);
  assert.equal(asClient.status, 200);
  // Absent, not marked "restricted". Naming a field you cannot read tells the
  // caller the buy price exists and what it is called, which is most of what an
  // attacker wants from a schema.
  assert.ok(!('originalDN' in asClient.json.properties), 'describe_model named originalDN to a client');
  assert.ok(!asClient.text.includes('originalDN'), 'originalDN appears in the description payload');
});

// ── Oracles: the QUERY is guarded, not just the response ────────────────────

test('a client cannot FILTER on a field it cannot read', async () => {
  // `where: { originalDN: { gt: N } }` never returns the column, but which rows
  // come back is a binary search over its value.
  const { status, text } = await mcp({
    tool: 'query_records',
    params: { model: 'ChangeOrderLineItem', where: { originalDN: { gt: 1 } } },
  }, viewer.cookie);

  assert.equal(status, 403, `a where-clause oracle must be refused, got ${status}: ${text.slice(0, 200)}`);
});

test('the oracle guard survives AND/OR nesting', async () => {
  const { status } = await mcp({
    tool: 'query_records',
    params: {
      model: 'ChangeOrderLineItem',
      where: { AND: [{ qty: 1 }, { OR: [{ originalDN: { gt: 1 } }, { qty: 2 }] }] },
    },
  }, viewer.cookie);

  assert.equal(status, 403, 'a forbidden field nested inside AND/OR slipped through');
});

test('a client cannot ORDER BY a field it cannot read', async () => {
  // Sorting is a slower oracle than filtering, and just as total.
  const { status } = await mcp({
    tool: 'query_records',
    params: { model: 'ChangeOrderLineItem', orderBy: { originalDN: 'desc' } },
  }, viewer.cookie);

  assert.equal(status, 403, 'an orderBy oracle was allowed');
});

test('a client cannot COUNT on a field it cannot read', async () => {
  // count_records returns no rows at all, which makes it look harmless. It is
  // the cheapest oracle of the three.
  const { status } = await mcp({
    tool: 'count_records',
    params: { model: 'ChangeOrderLineItem', where: { originalDN: { gt: 1 } } },
  }, viewer.cookie);

  assert.equal(status, 403, 'count_records accepted a forbidden filter');
});

test('ILC may filter on originalDN — the guard is by audience, not a blanket ban', async () => {
  const { status, json } = await mcp({
    tool: 'query_records',
    params: { model: 'ChangeOrderLineItem', where: { originalDN: DN_VALUE } },
  }, ilc.cookie);

  assert.equal(status, 200, 'the guard blocked ILC, which would make the endpoint useless internally');
  assert.ok(json.count >= 1);
});

// ── Relations: the boundary has to hold two levels down ─────────────────────

test('a nested include cannot smuggle DN up through two relations', async () => {
  const params = {
    model: 'ChangeOrder',
    where: { id: fixture.coId },
    include: { optionGroups: { include: { lineItems: true } } },
  };

  const asIlc = await mcp({ tool: 'query_records', params }, ilc.cookie);
  assert.equal(asIlc.status, 200, JSON.stringify(asIlc.json));
  assert.equal(asIlc.json.count, 1, 'the nested read returned nothing — the client half would pass vacuously');
  assert.equal(
    asIlc.json.records[0].optionGroups[0].lineItems[0].originalDN, DN_VALUE,
    'ILC lost DN through a nested include',
  );

  const asClient = await mcp({ tool: 'query_records', params }, viewer.cookie);
  assert.equal(asClient.status, 200, JSON.stringify(asClient.json));
  assert.equal(asClient.json.count, 1, 'the client got no CO — this must fail on redaction, not on an empty result');
  const nested = asClient.json.records[0].optionGroups[0].lineItems[0];
  assert.equal(nested.cnUnitPrice, CN_VALUE, 'redaction removed the client-facing price two levels down');
  assert.ok(!('originalDN' in nested), 'originalDN leaked through a nested include');
  assert.ok(!asClient.text.includes(String(DN_VALUE)), 'the DN value appears in the nested payload');
});

test('a select inside an include cannot request a forbidden field', async () => {
  // buildInclude reconstructs from declared links rather than filtering what was
  // sent, so a nested select is dropped entirely rather than honoured.
  const { status, json, text } = await mcp({
    tool: 'query_records',
    params: {
      model: 'ChangeOrder',
      where: { id: fixture.coId },
      include: { optionGroups: { include: { lineItems: { select: { originalDN: true } } } } },
    },
  }, viewer.cookie);

  assert.ok(status === 200 || status === 403, `unexpected ${status}: ${text.slice(0, 200)}`);
  if (status === 200) assert.ok(!text.includes(String(DN_VALUE)), 'a nested select smuggled the DN out');
  if (status === 200 && json.count) {
    const items = json.records[0].optionGroups?.[0]?.lineItems || [];
    for (const it of items) assert.ok(!('originalDN' in it), 'originalDN survived a nested select');
  }
});

// ── ILC-only tools ───────────────────────────────────────────────────────────

test('get_pipeline and get_client_360 are refused to a client', async () => {
  for (const tool of ['get_pipeline', 'get_client_360']) {
    const { status } = await mcp({ tool, params: { name: 'ZZ' } }, viewer.cookie);
    assert.equal(status, 403, `${tool} was not refused to a CLIENT_VIEWER`);
  }
});

test('search does not enumerate ILC clients for a client caller', async () => {
  const { status, json } = await mcp({ tool: 'search', params: { query: 'a' } }, viewer.cookie);
  assert.equal(status, 200);
  assert.deepEqual(json.clients, [], 'a client caller enumerated the account list');
});

// ── Row scope: WHICH ROWS, not which fields ─────────────────────────────────
//
// Field redaction and row scoping are different controls and fail differently.
// Every test above this line passed on a build where a CLIENT_VIEWER could list
// all 25 projects and all 12 clients in the database — perfectly redacted, and
// completely enumerated. "You may not see the buy price" and "you may not see
// that this project exists" are separate claims and need separate tests.
//
// The rule is not invented here. src/app/api/projects/route.js:
//   "External Client Viewers stay scoped to their own — never widen this to
//    CLIENT_VIEWER"  → { createdById: user.id }
// src/lib/mcp/scope.js reaches that same predicate from every registered object.

test('POSITIVE CONTROL: ILC sees both fixture projects', async () => {
  // Without this, every scope assertion below would also pass on a server that
  // had simply stopped returning projects to anyone.
  const { status, json } = await mcp({
    tool: 'query_records',
    params: { model: 'Project', where: { name: { contains: 'ZZ MCP' } }, limit: 50 },
  }, ilc.cookie);

  assert.equal(status, 200, JSON.stringify(json));
  const ids = json.records.map(r => r.id);
  assert.ok(ids.includes(fixture.projectId), 'ILC lost the viewer-owned fixture');
  assert.ok(ids.includes(foreign.projectId), 'ILC lost the ILC-owned fixture');
});

test('a CLIENT_VIEWER listing projects gets only its own', async () => {
  const { status, json, text } = await mcp({
    tool: 'query_records', params: { model: 'Project', limit: 100 },
  }, viewer.cookie);

  assert.equal(status, 200, JSON.stringify(json));
  // Not "fewer than ILC" — exactly its own. A weaker assertion would pass while
  // leaking every project that happened to fall outside the first page.
  assert.deepEqual(json.records.map(r => r.id), [fixture.projectId],
    'a CLIENT_VIEWER enumerated projects it does not own');
  assert.ok(!text.includes(foreign.name), "someone else's project name came back");
});

test('the same holds for count — a census needs no rows', async () => {
  const asIlc    = await mcp({ tool: 'count_records', params: { model: 'Project' } }, ilc.cookie);
  const asClient = await mcp({ tool: 'count_records', params: { model: 'Project' } }, viewer.cookie);

  assert.equal(asIlc.status, 200);
  assert.equal(asClient.status, 200);
  assert.ok(asIlc.json.count > 1, 'the dev database has almost no projects — this comparison proves nothing');
  assert.equal(asClient.json.count, 1, `a client counted ${asClient.json.count} projects, owning 1`);
});

test('get_record on a foreign id reads as absent, not as forbidden', async () => {
  // "Not yours" confirms the id exists, which is the one bit an enumerator wants.
  const { status, json } = await mcp({
    tool: 'get_record', params: { model: 'Project', id: foreign.projectId },
  }, viewer.cookie);

  assert.equal(status, 200);
  assert.equal(json.record, null, 'a client fetched a project by id that it does not own');
});

test('scope follows the relation path three hops down', async () => {
  // ChangeOrderLineItem → optionGroup → changeOrder → project → createdById.
  // A scope that only covered top-level Project would let a client walk in
  // through any child table and read the same rows sideways.
  const params = {
    model: 'ChangeOrderLineItem',
    where: { id: { in: [fixture.lineItemId, foreign.lineItemId] } },
  };

  const asIlc = await mcp({ tool: 'query_records', params }, ilc.cookie);
  assert.equal(asIlc.json.count, 2, 'both fixture line items must exist for this test to mean anything');

  const asClient = await mcp({ tool: 'query_records', params }, viewer.cookie);
  assert.equal(asClient.status, 200, JSON.stringify(asClient.json));
  assert.deepEqual(asClient.json.records.map(r => r.id), [fixture.lineItemId],
    'a client read a line item belonging to another project');
});

test('a foreign row cannot be reached through a curated tool either', async () => {
  const byId = await mcp({
    tool: 'get_project_360', params: { projectId: foreign.projectId },
  }, viewer.cookie);
  assert.equal(byId.status, 200);
  assert.equal(byId.json.project, null, 'get_project_360 handed over a foreign project by id');

  // By name is the more dangerous shape: `name: { contains: ... }` + findFirst
  // means a vague string returns whatever matched first, whoever owns it.
  const byName = await mcp({
    tool: 'get_project_360', params: { name: 'ZZ MCP foreign' },
  }, viewer.cookie);
  assert.equal(byName.status, 200);
  assert.equal(byName.json.project, null, 'get_project_360 matched a foreign project by name');
});

test('search is scoped too — it is a query with a friendlier argument', async () => {
  const { status, json, text } = await mcp({
    tool: 'search', params: { query: 'ZZ MCP' },
  }, viewer.cookie);

  assert.equal(status, 200);
  assert.deepEqual(json.projects.map(p => p.id), [fixture.projectId],
    'search returned projects the caller does not own');
  assert.ok(!text.includes(foreign.name), 'search leaked a foreign project name');
});

test('Client is unreachable to a client caller through the generic tools', async () => {
  // `search` already returns clients: [] to this audience. That intent was
  // defeated one tool over: query_records on Client handed back the whole
  // account list. Both tools must agree.
  for (const tool of ['query_records', 'count_records']) {
    const { status } = await mcp({ tool, params: { model: 'Client' } }, viewer.cookie);
    assert.equal(status, 403, `${tool} on Client was not refused to a CLIENT_VIEWER`);
  }
});

test('SHIP CRITERION: every registered object is scoped or refused — never open', async () => {
  // The fail-closed proof, stated over the whole registry rather than the objects
  // someone remembered to test. SCOPED_OBJECTS is imported from the source, so
  // this reads the real map and not a copy that can drift.
  const { SCOPED_OBJECTS } = await import('../../src/lib/mcp/scope.js');

  const listing = await mcp({ tool: 'list_models', params: {} }, ilc.cookie);
  const models = listing.json.models;
  assert.ok(models.length >= 8, `registry has only ${models.length} objects — this sweep would be near-vacuous`);

  let reachable = 0, refused = 0;

  for (const { object } of models) {
    const { status } = await mcp({ tool: 'query_records', params: { model: object, limit: 1 } }, viewer.cookie);

    if (SCOPED_OBJECTS.includes(object)) {
      // Declared scopable → must actually work. A scope path with a typo in a
      // relation name would 500 here rather than silently denying.
      assert.equal(status, 200, `${object} has a scope path but a client query returned ${status}`);
      reachable++;
    } else {
      // Not declared → must be refused. This is the branch that protects the
      // objects nobody has thought about yet, including ones added next year.
      assert.equal(status, 403, `${object} has NO scope path and was not refused (${status}) — open by default`);
      refused++;
    }
  }

  assert.equal(reachable + refused, models.length);
  assert.ok(reachable >= 5, `only ${reachable} objects are reachable by a client — scoping has become deny-all`);
  assert.ok(refused >= 1, 'every object is scopable, so the fail-closed branch was never exercised');
});

// ── Blast radius ─────────────────────────────────────────────────────────────

test('the row limit is clamped no matter what the caller asks for', async () => {
  const { status, json } = await mcp({
    tool: 'query_records',
    params: { model: 'Project', limit: 100000 },
  }, ilc.cookie);

  assert.equal(status, 200);
  assert.ok(json.limit <= 100, `limit clamped to ${json.limit}, expected <= 100`);
  assert.ok(json.records.length <= 100);
});

test('an unregistered model is refused even to ILC — reachability is not visibility', async () => {
  // `User` is a real Prisma model with no ontology definition. ILC staff are
  // cleared to see users; the SERVER is not cleared to serve them.
  const { status, text } = await mcp({
    tool: 'query_records', params: { model: 'User' },
  }, ilc.cookie);

  assert.ok(status === 400 || status === 403, `unregistered model returned ${status}`);
  assert.ok(!text.includes('passwordHash'), 'the refusal leaked a column name');
});

test('there is no write tool reachable by any name', async () => {
  for (const tool of ['create_record', 'update_record', 'delete_record', 'execute_raw', 'query_raw']) {
    const { status, json } = await mcp({ tool, params: {} }, ilc.cookie);
    assert.equal(status, 400, `${tool} returned ${status} — expected "unknown tool"`);
    assert.match(json.error, /Unknown tool/, `${tool} resolved to something`);
  }
});

test('a malformed where is the CALLER\'s error (4xx), not ours (500)', async () => {
  const { status } = await mcp({
    tool: 'query_records', params: { model: 'Project', where: '{not valid json' },
  }, ilc.cookie);

  // A 500 here would be wrong twice over: it blames the server for a client typo,
  // and it pollutes any error-rate check built on the audit log.
  assert.ok(status >= 400 && status < 500, `malformed where returned ${status}, expected 4xx`);
});

// ── Audit ────────────────────────────────────────────────────────────────────

test('every call is audited, refusals included', async () => {
  // audit.js imports '@/lib/db', and the `@` alias is a bundler feature that
  // plain `node --test` cannot resolve — so the JSONL sink is read directly.
  // If the file is absent the Prisma sink is active and this assertion does not
  // apply; it skips rather than failing on a configuration it cannot see.
  const AUDIT_FILE = 'C:/ilc-studios-live/.mcp-audit/mcp-queries.jsonl';
  const { readFile } = await import('node:fs/promises');
  const readTail = async (limit = 50) => {
    try {
      const raw = await readFile(AUDIT_FILE, 'utf8');
      return raw.split('\n').filter(Boolean).slice(-limit)
        .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return null; }
  };

  if ((await readTail()) === null) return;   // Prisma sink active

  const marker = `ZZ-audit-${Date.now()}`;
  await mcp({ tool: 'query_records', params: { model: 'Project', where: { name: marker } } }, ilc.cookie);
  await mcp({ tool: 'query_records',
              params: { model: 'ChangeOrderLineItem', where: { originalDN: { gt: 1 } } } }, viewer.cookie);

  const tail = await readTail(50);
  assert.ok(tail.some(e => JSON.stringify(e).includes(marker)), 'a successful query was not audited');
  assert.ok(tail.some(e => e.status === 'rejected'), 'a refusal was not audited — refusals are the interesting ones');
});

// ── The ship criterion, stated over the whole registry ───────────────────────
//
// The paired ILC/client read above proves the boundary holds for the one field
// that has leaked twice. That is the field that matters most and the weakest
// possible form of the claim. The criterion for this slice is stronger:
//
//   "a CLIENT_VIEWER can query through MCP and cannot reach a single ilc_only
//    field, proven by a test rather than by inspection."
//
// So: ask ILC for the classification of every property of every registered
// object, then assert the client's own view of that object names none of the
// ilc_only ones. describe_model is the surface an agent uses to PLAN a query, so
// a name appearing there is both a disclosure and step one of an exfiltration.

const AUDIT_PATH = new URL('../../.mcp-audit/mcp-queries.jsonl', import.meta.url);

async function auditTail(limit = 80) {
  const { readFile } = await import('node:fs/promises');
  try {
    const raw = await readFile(AUDIT_PATH, 'utf8');
    return raw.split('\n').filter(Boolean).slice(-limit)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return null; }   // null = Prisma sink active, not "no audit"
}

test('SHIP CRITERION: no ilc_only field on any registered object is named to a client', async () => {
  const listing = await mcp({ tool: 'list_models', params: {} }, ilc.cookie);
  assert.equal(listing.status, 200, JSON.stringify(listing.json));

  const models = listing.json.models;
  assert.ok(models.length >= 8, `registry has only ${models.length} objects — this sweep would be near-vacuous`);

  let checkedFields = 0;

  for (const { object } of models) {
    const asIlc    = await mcp({ tool: 'describe_model', params: { model: object } }, ilc.cookie);
    const asClient = await mcp({ tool: 'describe_model', params: { model: object } }, viewer.cookie);
    assert.equal(asIlc.status, 200,    `ILC could not describe ${object}`);
    assert.equal(asClient.status, 200, `client could not describe ${object}`);

    const ilcOnly = Object.entries(asIlc.json.properties)
      .filter(([, def]) => def.sensitivity === 'ilc_only')
      .map(([name]) => name);

    for (const name of ilcOnly) {
      assert.ok(
        !(name in asClient.json.properties),
        `${object}.${name} is ilc_only but describe_model names it to a CLIENT_VIEWER`,
      );
      checkedFields++;
    }
  }

  // Guard against the sweep silently testing nothing: if the registry ever stops
  // declaring sensitivity, every assertion above passes and the criterion is
  // unproven. The count is what makes the green meaningful.
  assert.ok(checkedFields >= 15, `only ${checkedFields} ilc_only fields checked — the registry declares far more`);
});

test('SHIP CRITERION: no ilc_only field on any registered object is RETURNED to a client', async () => {
  // The companion to the test above. describe_model proves the client cannot
  // learn the names; this proves that even if it somehow knew them, the rows do
  // not carry them. Reads one page of each object as both audiences.
  const listing = await mcp({ tool: 'list_models', params: {} }, ilc.cookie);
  const models = listing.json.models;

  let checkedObjects = 0;
  let refusedOutright = 0;

  for (const { object } of models) {
    const asIlc = await mcp({ tool: 'describe_model', params: { model: object } }, ilc.cookie);
    const ilcOnly = new Set(Object.entries(asIlc.json.properties)
      .filter(([, def]) => def.sensitivity === 'ilc_only')
      .map(([name]) => name));
    if (!ilcOnly.size) continue;

    const rows = await mcp({ tool: 'query_records', params: { model: object, limit: 5 } }, viewer.cookie);

    // 403 is a STRONGER outcome than redaction, not a failure: the object has no
    // row-scope path, so the client cannot reach a row to redact. Anything other
    // than 200-with-redacted-rows or 403 is a real problem.
    if (rows.status === 403) { refusedOutright++; continue; }
    assert.equal(rows.status, 200, `client query on ${object} returned ${rows.status}: ${rows.text.slice(0, 200)}`);

    for (const row of rows.json.records) {
      for (const name of ilcOnly) {
        assert.ok(!(name in row), `${object}.${name} came back in a CLIENT_VIEWER's rows`);
      }
    }
    checkedObjects++;
  }

  assert.ok(checkedObjects >= 5,
    `only ${checkedObjects} objects with ilc_only fields were exercised (${refusedOutright} refused outright) — ` +
    'if this fell because scoping now denies everything, the sweep is no longer proving redaction');
});

test('redaction removes EXACTLY the ilc_only fields — not fewer, and not more', async () => {
  // The anti-vacuity test for everything above it.
  //
  // Every other assertion in this file is of the form "field X is absent for a
  // client". A redactor that returned `{}` — or that silently failed and returned
  // null — would satisfy all of them at once, and the suite would go green while
  // the endpoint returned nothing to anybody. So this one pins the difference
  // between the two audiences in both directions: the client must LOSE the
  // ilc_only set, and must KEEP everything else.
  const params = { model: 'ChangeOrderLineItem', where: { id: fixture.lineItemId } };

  const asIlc    = await mcp({ tool: 'query_records', params }, ilc.cookie);
  const asClient = await mcp({ tool: 'query_records', params }, viewer.cookie);
  assert.equal(asIlc.json.count, 1);
  assert.equal(asClient.json.count, 1);

  const described = await mcp({ tool: 'describe_model', params: { model: 'ChangeOrderLineItem' } }, ilc.cookie);
  const ilcOnly = new Set(Object.entries(described.json.properties)
    .filter(([, def]) => def.sensitivity === 'ilc_only')
    .map(([name]) => name));
  assert.ok(ilcOnly.size >= 2, 'the object under test declares almost nothing ilc_only — pick a different one');

  const ilcKeys    = new Set(Object.keys(asIlc.json.records[0]));
  const clientKeys = new Set(Object.keys(asClient.json.records[0]));
  const removed    = [...ilcKeys].filter(k => !clientKeys.has(k)).sort();

  // Direction 1: nothing sensitive survived.
  assert.deepEqual(removed, [...ilcOnly].sort(), 'the set of removed fields is not the set of ilc_only fields');

  // Direction 2: the response is still a response. Over-redaction is a bug too —
  // it is how a client-facing surface goes blank after a schema change, and it is
  // the exact failure mode that would make every other test here meaningless.
  assert.ok(clientKeys.size >= 10, `the client got only ${clientKeys.size} fields back — redaction ate the record`);
  for (const kept of ['id', 'fixtureType', 'qty', 'description', 'cnUnitPrice']) {
    assert.ok(clientKeys.has(kept), `${kept} is client_ok but was redacted away`);
  }
});

test('the margin is ilc_only too — the DN is one division away from any CN', async () => {
  const params = { model: 'ProjectData', where: { projectId: fixture.projectId } };

  const asIlc = await mcp({ tool: 'query_records', params }, ilc.cookie);
  assert.equal(asIlc.status, 200, JSON.stringify(asIlc.json));
  assert.equal(asIlc.json.count, 1, 'the ProjectData row is missing — the client half would pass vacuously');
  assert.equal(asIlc.json.records[0].marginPct, MARGIN, 'ILC lost the margin');

  const asClient = await mcp({ tool: 'query_records', params }, viewer.cookie);
  assert.equal(asClient.status, 200);
  assert.equal(asClient.json.count, 1, 'the client got no row — this must fail on redaction, not on an empty result');
  assert.equal(asClient.json.records[0].salesTaxPct, TAX, 'redaction removed a rate the client is entitled to');
  assert.ok(!('marginPct' in asClient.json.records[0]), 'marginPct reached a CLIENT_VIEWER');
  assert.ok(!asClient.text.includes(String(MARGIN)), 'the margin value appears somewhere in the response body');
});

test('a relation filter cannot reach a forbidden field one level down', async () => {
  // The oracle does not disappear when it moves across a link: filtering change
  // orders by their line items' DN is the same binary search, one hop away.
  const { status } = await mcp({
    tool: 'query_records',
    params: {
      model: 'ChangeOrder',
      where: { optionGroups: { some: { lineItems: { some: { originalDN: { gt: 1 } } } } } },
    },
  }, viewer.cookie);

  assert.equal(status, 403, 'the oracle survived by moving down a relation');
});

test('nobody filters on a credential — not even ILC', async () => {
  // NEVER_READABLE outranks the ILC audience. An admin does not get to
  // binary-search a bcrypt hash through a relation filter either.
  const { status } = await mcp({
    tool: 'query_records',
    params: { model: 'Project', where: { createdBy: { passwordHash: { not: null } } } },
  }, ilc.cookie);

  assert.ok(status >= 400 && status < 500, `an ILC caller reached a credential filter (${status})`);
});

test('get_project_360 redacts every branch it assembles', async () => {
  // The curated tools are convenience over the same primitives, not a privileged
  // path — and they are where a redaction gap is most likely, because they
  // hand-assemble six relations in one query.
  const asIlc = await mcp({ tool: 'get_project_360', params: { projectId: fixture.projectId } }, ilc.cookie);
  assert.equal(asIlc.status, 200, JSON.stringify(asIlc.json));
  assert.ok(asIlc.text.includes(String(DN_VALUE)), 'ILC lost the DN from the 360 view — the client half is now vacuous');

  const asClient = await mcp({ tool: 'get_project_360', params: { projectId: fixture.projectId } }, viewer.cookie);
  assert.equal(asClient.status, 200, JSON.stringify(asClient.json));
  assert.equal(asClient.json.project?.name, 'ZZ MCP audit (disposable)', 'the client got no project back');
  assert.ok(!asClient.text.includes(String(DN_VALUE)), 'the 360 view leaked the buy price');
  assert.ok(!asClient.text.includes(String(MARGIN)),   'the 360 view leaked the margin');
});

test('the unauthenticated catalogue names tools, never fields', async () => {
  // GET is deliberately open so an MCP client can discover the endpoint before it
  // has a token. That is only safe while it discloses nothing the public repo
  // does not — tool names and argument shapes, no object names, no columns.
  const { json, text } = await get('/api/mcp', null);
  assert.equal(json.readOnly, true);
  for (const name of ['originalDN', 'quoteReference', 'marginPct', 'dnPerUnit', 'passwordHash']) {
    assert.ok(!text.includes(name), `the anonymous catalogue names ${name}`);
  }
});

test('a body with neither shape is a 400 that says what to send', async () => {
  const { status, json } = await mcp({ hello: 'world' }, ilc.cookie);
  assert.equal(status, 400);
  assert.match(json.error, /query_records/, 'the error should name the tool surface rather than just failing');
});

// ── The MCP wire shape ───────────────────────────────────────────────────────
//
// Everything above drives the plain `{tool, params}` shape the in-app Ask AI
// branch uses. A real MCP client speaks JSON-RPC 2.0, and a second wire shape is
// a second way around the guards unless it is proven not to be — which is the
// whole reason both shapes funnel through executeTool().

test('initialize returns a protocol version and a tools capability', async () => {
  const { status, envelope } = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mcp.test.mjs', version: '1.0.0' },
  }, ilc.cookie);

  assert.equal(status, 200);
  assert.equal(envelope.jsonrpc, '2.0');
  assert.ok(envelope.result.protocolVersion, 'no protocolVersion — clients abort the handshake');
  assert.ok(envelope.result.capabilities.tools, 'the server did not advertise tools');
  assert.equal(envelope.result.serverInfo.name, 'ilc-librarian');
});

test('a notification gets 202 and an empty body, not a result', async () => {
  // Answering a notification is a protocol violation that some clients treat as
  // fatal, and it is the easiest thing to get wrong in a hand-rolled server.
  const { status, text } = await post('/api/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, ilc.cookie);
  assert.equal(status, 202);
  assert.equal(text, '');
});

test('tools/list returns schemas a model can actually call', async () => {
  const { envelope } = await rpc('tools/list', {}, ilc.cookie);
  const tools = envelope.result.tools;
  assert.equal(tools.length, 9);
  for (const t of tools) {
    assert.equal(t.inputSchema?.type, 'object', `${t.name} has no object inputSchema`);
    assert.ok(t.description?.length > 20, `${t.name} has no usable description`);
  }
});

test('an unknown JSON-RPC method is -32601, not a crash', async () => {
  const { envelope } = await rpc('tools/summon', {}, ilc.cookie);
  assert.equal(envelope.error?.code, -32601);
});

test('SHIP CRITERION: the boundary holds through the JSON-RPC shape too', async () => {
  const args = { model: 'ChangeOrderLineItem', where: { id: fixture.lineItemId } };

  const asIlc = await rpc('tools/call', { name: 'query_records', arguments: args }, ilc.cookie);
  assert.equal(asIlc.isError, false, `ILC call errored: ${asIlc.text.slice(0, 200)}`);
  assert.equal(asIlc.result.records[0].originalDN, DN_VALUE, 'positive control failed through JSON-RPC');

  const asClient = await rpc('tools/call', { name: 'query_records', arguments: args }, viewer.cookie);
  assert.equal(asClient.isError, false, `client call errored: ${asClient.text.slice(0, 200)}`);
  assert.equal(asClient.result.count, 1, 'the client got no row — this must fail on redaction, not on an empty result');
  assert.ok(!('originalDN' in asClient.result.records[0]), 'originalDN leaked through JSON-RPC');
  assert.ok(!asClient.text.includes(String(DN_VALUE)), 'the DN appears in the JSON-RPC content block');
});

test('a refused tool call is isError:true, not a transport fault', async () => {
  // MCP convention, and it matters: the model needs to SEE "you cannot read that
  // field" so it can change course. A JSON-RPC error gets swallowed by the client
  // and the model just learns the call failed.
  const { status, envelope, isError, text } = await rpc('tools/call', {
    name: 'query_records',
    arguments: { model: 'ChangeOrderLineItem', where: { originalDN: { gt: 1 } } },
  }, viewer.cookie);

  assert.equal(status, 200);
  assert.equal(envelope.error, undefined, 'a guard rejection was reported as a transport error');
  assert.equal(isError, true);
  assert.match(text, /not available to you/);
});

test('a batch answers each request and drops the notifications', async () => {
  const { status, json } = await post('/api/mcp', [
    { jsonrpc: '2.0', id: 'a', method: 'ping' },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 'b', method: 'tools/list' },
  ], ilc.cookie);

  assert.equal(status, 200);
  assert.equal(json.length, 2, 'the notification produced a response');
  assert.deepEqual(json.map(r => r.id).sort(), ['a', 'b']);
});

test('JSON-RPC framing is not an unauthenticated side door', async () => {
  const { status } = await post('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, null);
  assert.equal(status, 401);
});

// ── What the audit log holds ─────────────────────────────────────────────────

test('the audit log records who asked, with the right role', async () => {
  const marker = `ZZ-role-${process.pid}-${Date.now()}`;
  await mcp({ tool: 'query_records', params: { model: 'Project', where: { name: marker } } }, ilc.cookie);
  await mcp({ tool: 'query_records',
              params: { model: 'ChangeOrderLineItem', where: { originalDN: { gt: 1 } } } }, viewer.cookie);

  const tail = await auditTail();
  if (tail === null) return;   // Prisma sink active

  const okEntry = tail.find(e => e.params?.includes(marker));
  assert.ok(okEntry, 'the successful query was not audited');
  assert.equal(okEntry.status, 'ok');
  assert.equal(okEntry.tool, 'query_records');
  assert.equal(okEntry.callerRole, adminRole, 'the log attributed the read to the wrong role');
  assert.equal(okEntry.audience, 'ilc');

  const refused = tail.find(e => e.status === 'rejected' && e.callerRole === 'CLIENT_VIEWER');
  assert.ok(refused, 'the refusal was not attributed to the CLIENT_VIEWER who made it');
  assert.equal(refused.audience, 'client');
});

test('the audit log records the question, never the answer', async () => {
  await mcp({ tool: 'query_records',
              params: { model: 'ChangeOrderLineItem', where: { id: fixture.lineItemId } } }, ilc.cookie);

  const tail = await auditTail(20);
  if (tail === null) return;
  const asText = JSON.stringify(tail);

  // Row COUNTS are recorded; row CONTENTS are not. An audit log that copied the
  // rows would be a second, unredacted store of the same buy prices — and one
  // that nothing redacts on the way out.
  assert.ok(!asText.includes(String(DN_VALUE)), 'the audit log holds the buy price it was auditing access to');
  assert.ok(!asText.includes(String(CN_VALUE)), 'the audit log is storing row contents');
  assert.ok(tail.some(e => Number.isFinite(e.rowCount)), 'no row count was recorded — the log cannot show scale of access');
});
