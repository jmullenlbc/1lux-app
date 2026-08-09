/**
 * Unit tests for the ontology layer — the fail-closed half of the redaction
 * boundary.
 *
 * The bar these tests are trying to clear: the interesting failure of an
 * allowlist is not "it blocked something" — it is "a field slipped through
 * because nobody declared it." So most of what follows checks the DEFAULT, not
 * the declaration. A field nobody has thought about must be absent.
 *
 *   node --test scripts/tests/ontology.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SENSITIVITY, DEFAULT_SENSITIVITY, NEVER_READABLE,
  canSee, isNeverReadable, AUDIENCES,
} from '../../src/lib/ontology/sensitivity.js';

import {
  objects, byModel, objectKeys, getObject,
  sensitivityOf, ilcOnlyFieldNames, globallyIlcOnlyFieldNames,
  globalDenyFieldNames, ambiguousFieldNames, validateRegistry,
} from '../../src/lib/ontology/index.js';

import {
  canReadObject, redactObject, stripNeverReadable,
  readableProps, describeForAudience,
} from '../../src/lib/ontology/redact.js';

import { ILC_ONLY_FIELDS } from '../../src/lib/redact.js';

// ─────────────────────────────────────────────────────────────────────────────
// The registry itself
// ─────────────────────────────────────────────────────────────────────────────

test('the registry is internally consistent', () => {
  const problems = validateRegistry();
  assert.deepEqual(problems, [], `registry problems:\n  ${problems.join('\n  ')}`);
});

test('every registered object is reachable by key AND by prisma model name', () => {
  for (const key of objectKeys) {
    const obj = objects[key];
    assert.equal(getObject(key)?.key, key, `${key} not reachable by key`);
    assert.equal(getObject(obj.model)?.key, key, `${key} not reachable by model "${obj.model}"`);
    assert.equal(byModel[obj.model]?.key, key);
  }
});

test('lookup is case-insensitive but never invents an object', () => {
  assert.equal(getObject('changeorder')?.key, 'ChangeOrder');
  assert.equal(getObject('CHANGEORDER')?.key, 'ChangeOrder');
  assert.equal(getObject('NotAThing'), null);
  assert.equal(getObject(''), null);
  assert.equal(getObject(null), null);
  assert.equal(getObject(undefined), null);
  assert.equal(getObject({ key: 'Project' }), null);   // not a string
});

// ─────────────────────────────────────────────────────────────────────────────
// Fail-closed defaults — the part that matters
// ─────────────────────────────────────────────────────────────────────────────

test('an undeclared property defaults to ilc_only', () => {
  assert.equal(DEFAULT_SENSITIVITY, SENSITIVITY.ILC_ONLY);
  assert.equal(sensitivityOf('Project', 'someColumnSeanAddsNextWeek'), SENSITIVITY.ILC_ONLY);
  assert.equal(sensitivityOf('NotAnObject', 'anything'), SENSITIVITY.ILC_ONLY);
});

test('canSee fails closed on an unknown audience', () => {
  // A typo in an audience string must not widen access.
  assert.equal(canSee(SENSITIVITY.PUBLIC, 'ILC'), false);      // wrong case
  assert.equal(canSee(SENSITIVITY.PUBLIC, 'admin'), false);
  assert.equal(canSee(SENSITIVITY.PUBLIC, ''), false);
  assert.equal(canSee(SENSITIVITY.PUBLIC, undefined), false);
  assert.equal(canSee(SENSITIVITY.PUBLIC, null), false);
});

test('canSee fails closed on an unknown sensitivity level', () => {
  // A typo'd level is treated as ilc_only, not as "no restriction".
  assert.equal(canSee('cleint_ok', 'client'), false);
  assert.equal(canSee('', 'client'), false);
  assert.equal(canSee(undefined, 'client'), false);
  assert.equal(canSee('cleint_ok', 'ilc'), true);   // ILC is cleared for ilc_only
});

test('the clearance table is exactly the addendum table', () => {
  assert.deepEqual([...AUDIENCES].sort(), ['client', 'ilc', 'public']);
  const table = {
    ilc:    { public: true,  client_ok: true,  ilc_only: true  },
    client: { public: true,  client_ok: true,  ilc_only: false },
    public: { public: true,  client_ok: false, ilc_only: false },
  };
  for (const [audience, row] of Object.entries(table)) {
    for (const [level, expected] of Object.entries(row)) {
      assert.equal(canSee(level, audience), expected, `canSee(${level}, ${audience})`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NEVER_READABLE — above the audience axis entirely
// ─────────────────────────────────────────────────────────────────────────────

test('credentials and share tokens are blocked for EVERY audience, including ILC', () => {
  const record = {
    id: 'u1',
    email: 'someone@ilcstudios.com',
    passwordHash: '$2b$10$notarealhash',
    inviteToken: 'inv_abc',
    token: 'share_xyz',
    accessToken: 'ya29.live',
    refreshToken: '1//refresh',
    openToken: 'open_1',
    webhookSubId: 'sub_1',
  };
  for (const audience of AUDIENCES) {
    const out = stripNeverReadable(record);
    for (const blocked of NEVER_READABLE) {
      assert.ok(!(blocked in out), `${blocked} survived stripNeverReadable for ${audience}`);
    }
  }
  assert.equal(stripNeverReadable(record).email, 'someone@ilcstudios.com');
});

test('never-readable fields are stripped at depth and inside arrays', () => {
  const out = stripNeverReadable({
    project: { shares: [{ id: 's1', token: 'leak_me' }, { id: 's2', token: 'leak_me_too' }] },
  });
  assert.deepEqual(out.project.shares, [{ id: 's1' }, { id: 's2' }]);
});

test('a NEVER_READABLE name can never be re-widened by an object definition', () => {
  // validateRegistry() is what enforces this; assert the rule directly too so a
  // future edit to validateRegistry cannot quietly drop the check.
  for (const key of objectKeys) {
    for (const prop of Object.keys(objects[key].properties)) {
      assert.ok(!NEVER_READABLE.has(prop), `${key}.${prop} is in NEVER_READABLE but declared readable`);
    }
  }
  assert.equal(isNeverReadable('passwordHash'), true);
  assert.equal(isNeverReadable('mustChangePassword'), false);   // the regex false positive
  assert.equal(isNeverReadable('buildingFootprintSf'), false);
  assert.equal(isNeverReadable('isAlternate'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Object-level access
// ─────────────────────────────────────────────────────────────────────────────

test('an UNREGISTERED object is unreachable to non-ILC callers', () => {
  assert.equal(canReadObject('emailAccount', 'client'), false);
  assert.equal(canReadObject('emailAccount', 'public'), false);
  assert.equal(canReadObject('manufacturerProduct', 'client'), false);
  assert.equal(canReadObject('somethingSeanAddsNextWeek', 'client'), false);
  // ILC is cleared for everything — that asymmetry IS the fail-closed guarantee.
  assert.equal(canReadObject('emailAccount', 'ilc'), true);
});

test('redactObject THROWS for a non-ILC caller on an unregistered object', () => {
  // A silent {} would read as "no data" and send someone debugging the wrong thing.
  assert.throws(
    () => redactObject('manufacturerProduct', { id: 'p1', cost: 12.5 }, 'client'),
    /no ontology definition/,
  );
  // ILC still gets the row, minus credentials.
  const out = redactObject('manufacturerProduct', { id: 'p1', cost: 12.5 }, 'ilc');
  assert.equal(out.cost, 12.5);
});

// ─────────────────────────────────────────────────────────────────────────────
// Redaction — the buy-price boundary
// ─────────────────────────────────────────────────────────────────────────────

const LINE_ITEM = {
  id: 'li1',
  optionGroupId: 'og1',
  fixtureType: 'F1',
  qty: 10,
  cnUnitPrice: 130.0,
  originalDN: 100.0,
  quoteReference: 'Q-1234',
  notes: 'client-facing note',
};

test('a client never sees originalDN, but still sees the price they were quoted', () => {
  const out = redactObject('ChangeOrderLineItem', LINE_ITEM, 'client');
  assert.ok(!('originalDN' in out));
  assert.ok(!('quoteReference' in out));
  assert.equal(out.cnUnitPrice, 130.0);
  assert.equal(out.qty, 10);
});

test('the allowlist drops UNDECLARED fields for non-ILC — new columns are invisible', () => {
  const withNewColumn = { ...LINE_ITEM, secretNewMarginColumn: 0.23, anotherOne: 'x' };
  const client = redactObject('ChangeOrderLineItem', withNewColumn, 'client');
  assert.ok(!('secretNewMarginColumn' in client), 'undeclared field reached a client');
  assert.ok(!('anotherOne' in client));
  // ILC keeps them so internal tools do not go blind on a fresh migration.
  const ilc = redactObject('ChangeOrderLineItem', withNewColumn, 'ilc');
  assert.equal(ilc.secretNewMarginColumn, 0.23);
});

test('redaction recurses into links using the LINK TARGET object, not the parent', () => {
  const co = {
    id: 'co1',
    coNumber: 'CO-00001',
    createdById: 'u1',
    optionGroups: [{
      id: 'og1',
      label: 'Option A',
      lineItems: [LINE_ITEM, { ...LINE_ITEM, id: 'li2', originalDN: 55.5 }],
    }],
  };
  const out = redactObject('ChangeOrder', co, 'client');
  assert.ok(!('createdById' in out));
  assert.equal(out.optionGroups.length, 1);
  assert.equal(out.optionGroups[0].lineItems.length, 2);
  for (const li of out.optionGroups[0].lineItems) {
    assert.ok(!('originalDN' in li), 'DN survived two levels of nesting');
    assert.ok(!('quoteReference' in li));
    assert.equal(li.cnUnitPrice, 130.0);
  }
});

test('the ontology "public" tier is NARROWER than the transport redactor\'s PUBLIC', () => {
  // These two modules both use the word "public" and they do not mean the same
  // thing. Writing it down here because the difference is a leak waiting to
  // happen if someone unifies them by reflex:
  //
  //   src/lib/redact.js  AUDIENCE.PUBLIC — "this payload is leaving the ILC
  //     boundary." A share-link holder gets the full quote minus buy price,
  //     which is the whole point of a share link.
  //
  //   ontology 'public' — "this caller presented no credential at all."
  //     Nothing in the registry is classified `public` today, so such a caller
  //     gets identity and structure and no content. That is correct for a
  //     general-purpose read API reachable over HTTP.
  //
  // A share-token holder is therefore `client` in ontology terms — possession of
  // the token IS the authorization. Mapping one to `public` would blank the
  // contractor's own quote; mapping the other to `client` would hand an
  // anonymous caller real data. Keep them distinct.
  const asClient = redactObject('ChangeOrderLineItem', LINE_ITEM, 'client');
  const asPublic = redactObject('ChangeOrderLineItem', LINE_ITEM, 'public');

  assert.equal(asClient.cnUnitPrice, 130.0);
  assert.ok(!('cnUnitPrice' in asPublic), 'anonymous caller reached a sell price');
  assert.ok(!('originalDN' in asClient) && !('originalDN' in asPublic));

  // No property anywhere in the registry is classified `public` yet. If that
  // changes, it should be a deliberate decision, so make the change loud.
  const publicProps = [];
  for (const key of objectKeys) {
    for (const [prop, def] of Object.entries(objects[key].properties)) {
      if (def.sensitivity === SENSITIVITY.PUBLIC) publicProps.push(`${key}.${prop}`);
    }
  }
  assert.deepEqual(publicProps, [], `newly public: ${publicProps.join(', ')} — was that deliberate?`);
});

test('a link branch whose target is unreadable is dropped, not half-redacted', () => {
  // Client is ilc_only-heavy but registered, so it survives with id+name only.
  const project = { id: 'p1', name: 'The Approach', client: { id: 'c1', name: 'Acme', tier: 'A', pipelinePerUnit: 900 } };
  const out = redactObject('Project', project, 'client');
  assert.deepEqual(out.client, { id: 'c1', name: 'Acme' });
  assert.ok(!('tier' in out.client));
  assert.ok(!('pipelinePerUnit' in out.client));
});

test('marginPct is unreachable on ProjectData for client and public', () => {
  const pd = { id: 'pd1', projectId: 'p1', numUnits: 120, salesTaxPct: 0.0825, marginPct: 0.23, clientInitialBudget: 500000 };
  for (const audience of ['client', 'public']) {
    const out = redactObject('ProjectData', pd, audience);
    assert.ok(!('marginPct' in out), `marginPct reached ${audience}`);
    assert.ok(!('clientInitialBudget' in out), `clientInitialBudget reached ${audience}`);
  }
  assert.equal(redactObject('ProjectData', pd, 'client').salesTaxPct, 0.0825);
  assert.equal(redactObject('ProjectData', pd, 'ilc').marginPct, 0.23);
});

test('null, undefined and arrays are handled without throwing', () => {
  assert.equal(redactObject('ChangeOrder', null, 'client'), null);
  assert.equal(redactObject('ChangeOrder', undefined, 'client'), null);
  assert.deepEqual(redactObject('ChangeOrderLineItem', [], 'client'), []);
  const arr = redactObject('ChangeOrderLineItem', [LINE_ITEM, LINE_ITEM], 'client');
  assert.equal(arr.length, 2);
  assert.ok(!('originalDN' in arr[0]));
});

test('a null link value is preserved rather than recursed into', () => {
  const out = redactObject('Project', { id: 'p1', name: 'X', client: null }, 'client');
  assert.equal(out.client, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// readableProps — the query-oracle defence
// ─────────────────────────────────────────────────────────────────────────────

test('readableProps refuses the fields a where-clause could use as an oracle', () => {
  const client = readableProps('DesignBidMatrixItem', 'client');
  assert.ok(!client.has('dnPerUnit'), 'client could filter on dnPerUnit');
  assert.ok(!client.has('internalNotes'));
  assert.ok(!client.has('salesRep'));
  assert.ok(client.has('cnPerUnit'));

  const ilc = readableProps('DesignBidMatrixItem', 'ilc');
  assert.ok(ilc.has('dnPerUnit'));
});

test('readableProps returns null (not an empty set) for an unregistered object', () => {
  // null means "no declaration"; an empty Set would mean "declared, nothing readable".
  // Callers treat those differently, so the distinction has to survive.
  assert.equal(readableProps('emailAccount', 'ilc'), null);
  assert.equal(readableProps('emailAccount', 'client'), null);
});

test('readableProps includes link names only when the target is readable', () => {
  const client = readableProps('Project', 'client');
  assert.ok(client.has('changeOrders'));
  assert.ok(client.has('client'));   // Client is registered, so the link is traversable
});

// ─────────────────────────────────────────────────────────────────────────────
// describeForAudience — introspection must not itself be a disclosure
// ─────────────────────────────────────────────────────────────────────────────

test('introspection OMITS ilc_only fields for a client rather than marking them redacted', () => {
  const d = describeForAudience('ChangeOrderLineItem', 'client');
  assert.ok(!('originalDN' in d.properties), 'told a client that originalDN exists');
  assert.ok(!('quoteReference' in d.properties));
  assert.ok('cnUnitPrice' in d.properties);
  // And the classification itself is not echoed to non-ILC.
  assert.ok(!('sensitivity' in d.properties.cnUnitPrice));
});

test('introspection tells ILC the classification', () => {
  const d = describeForAudience('ChangeOrderLineItem', 'ilc');
  assert.equal(d.properties.originalDN.sensitivity, 'ilc_only');
  assert.equal(d.properties.cnUnitPrice.sensitivity, 'client_ok');
});

test('describeForAudience returns null for an unregistered object', () => {
  assert.equal(describeForAudience('emailAccount', 'ilc'), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// The two redactors agree
// ─────────────────────────────────────────────────────────────────────────────

test('globalDeny names are ilc_only on EVERY object that declares them', () => {
  const global = globalDenyFieldNames();
  for (const key of objectKeys) {
    for (const [prop, def] of Object.entries(objects[key].properties)) {
      if (!global.has(prop)) continue;
      assert.equal(
        def.sensitivity, SENSITIVITY.ILC_ONLY,
        `${key}.${prop} is "${def.sensitivity}" but the name is stripped globally — one of the two is wrong`,
      );
    }
  }
});

test('src/lib/redact.js consumes the ontology — there is no second hand-written list', () => {
  const derived = globalDenyFieldNames();
  assert.deepEqual([...ILC_ONLY_FIELDS].sort(), [...derived].sort());
});

test('the Slice 1 field list is still fully covered after the refactor', () => {
  // These are the names the two real production leaks turned on. Losing any of
  // them to a registry edit would silently reopen a closed hole.
  for (const name of ['originalDN', 'dnPerUnit', 'propUnitDN', 'marginPct', 'internalNotes', 'salesRep', 'rfqStatus']) {
    assert.ok(ILC_ONLY_FIELDS.has(name), `${name} dropped off the transport denylist`);
  }
});

test('ambiguous names are deliberately NOT stripped by bare name', () => {
  const ambiguous = ambiguousFieldNames();
  // `notes` is ilc_only on Client and client_ok on ChangeOrder. Stripping it by
  // name would blank the client's own quote notes.
  assert.ok(ambiguous.has('notes'), 'expected `notes` to be classified ambiguous');
  assert.ok(!globallyIlcOnlyFieldNames().has('notes'));
  assert.ok(!ILC_ONLY_FIELDS.has('notes'), '`notes` reached the global denylist');
  assert.ok(!ILC_ONLY_FIELDS.has('createdAt'));
  assert.ok(!ILC_ONLY_FIELDS.has('status'));
});

test('every globally-ilc_only name is a subset of every-ilc_only', () => {
  const all = ilcOnlyFieldNames();
  for (const name of globallyIlcOnlyFieldNames()) {
    assert.ok(all.has(name), `${name} is "globally ilc_only" but not ilc_only anywhere`);
  }
});
