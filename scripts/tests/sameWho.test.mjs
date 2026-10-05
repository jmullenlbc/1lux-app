// "Same person? Same company? Same job?" for web budgets (migration 0117).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstNamesMatch, matchPerson, matchCompany, nameParts } from '../../src/lib/intake/sameWho.js';

const JOSEPH = { id: 'c1', name: 'Joseph Smith', firstName: 'Joseph', lastName: 'Smith', email: 'jsmith@acme.com' };

test('Joe Smith and Joseph Smith: a question, never a silent join', () => {
  const m = matchPerson({ firstName: 'Joe', lastName: 'Smith', email: 'joe@other.com' }, [JOSEPH]);
  assert.equal(m.action, 'review');
  assert.equal(m.contact.id, 'c1');
  assert.match(m.reason, /Joe and Joseph can be the same name/);
  assert.match(m.reason, /jsmith@acme\.com/);
});

test('the same email is the same person, whatever the name', () => {
  const m = matchPerson({ firstName: 'Bobby', lastName: 'Jones', email: 'JSmith@Acme.com ' }, [JOSEPH]);
  assert.equal(m.action, 'link');
});

test('same name, different email asks; a different last name is new', () => {
  assert.equal(matchPerson({ firstName: 'Joseph', lastName: 'Smith', email: 'x@y.com' }, [JOSEPH]).action, 'review');
  assert.equal(matchPerson({ firstName: 'Joseph', lastName: 'Smyth', email: 'x@y.com' }, [JOSEPH]).action, 'new');
  assert.equal(matchPerson({ firstName: 'Karen', lastName: 'Smith', email: 'x@y.com' }, [JOSEPH]).action, 'new');
});

test('first names: nickname, initial, prefix', () => {
  assert.equal(firstNamesMatch('Mike', 'Michael'), 'Mike and Michael can be the same name');
  assert.equal(firstNamesMatch('J.', 'Joseph'), 'J. and Joseph could be an initial');
  assert.equal(firstNamesMatch('Chris', 'Christopher'), 'Chris and Christopher can be the same name');
  assert.equal(firstNamesMatch('Al', 'Bob'), null);
});

test('a contact with only a full name is split', () => {
  assert.deepEqual(nameParts({ name: 'Mary Ann Lee' }), { first: 'Mary Ann', last: 'Lee' });
  const m = matchPerson({ firstName: 'Mary', lastName: 'Lee', email: 'm@z.com' }, [{ id: 'c2', name: 'Mary Ann Lee', email: null }]);
  assert.equal(m.action, 'review');
  assert.match(m.reason, /we have no email for them/);
});

const CLIENTS = [
  { id: 'k1', name: 'Acme Builders, LLC', emailDomains: '["acme.com"]', website: null },
  { id: 'k2', name: 'Trammell Crow Residential', emailDomains: [], website: 'https://www.tcr.com/about' },
];

test('company: email domain and same name join; close names and website domains ask', () => {
  assert.equal(matchCompany({ companyName: 'Whatever', emailDomain: 'acme.com' }, CLIENTS).action, 'link');
  assert.equal(matchCompany({ companyName: 'Acme Builders', emailDomain: 'x.com' }, CLIENTS).action, 'link');
  const close = matchCompany({ companyName: 'Trammell Crow', emailDomain: 'x.com' }, CLIENTS);
  assert.equal(close.action, 'review');
  assert.equal(close.client.id, 'k2');
  const site = matchCompany({ companyName: 'TCR Group West', emailDomain: 'tcr.com' }, CLIENTS);
  assert.equal(site.action, 'review');
  assert.equal(matchCompany({ companyName: 'Nobody Inc', emailDomain: 'nobody.com' }, CLIENTS).action, 'new');
});

test('no dashes in anything a person reads', () => {
  const reasons = [
    matchPerson({ firstName: 'Joe', lastName: 'Smith', email: 'a@b.com' }, [JOSEPH]).reason,
    matchCompany({ companyName: 'Trammell Crow', emailDomain: 'x.com' }, CLIENTS).reason,
    matchCompany({ companyName: 'TCR Group West', emailDomain: 'tcr.com' }, CLIENTS).reason,
  ];
  for (const r of reasons) assert.ok(!/[–—]|--/.test(r), r);
  for (const f of ['src/lib/intake/webPeople.js', 'src/lib/intake/webReviews.js', 'src/app/(app)/sales/desk/page.jsx']) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.ok(!/[–—]/.test(src), `${f} has a long dash`);
  }
});

test('migration 0117 is additive and the schema carries it', () => {
  const sql = readFileSync(new URL('../../prisma/migrations/0117_web_people_reviews/migration.sql', import.meta.url), 'utf8');
  assert.ok(!/\bDROP\b/i.test(sql), 'no DROP in 0117');
  assert.match(sql, /CREATE TABLE "DuplicateReview"/);
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /model DuplicateReview \{/);
  const archive = readFileSync(new URL('../../src/lib/archive.js', import.meta.url), 'utf8');
  assert.ok(archive.includes("'duplicateReview'"), 'answered questions are never deleted');
});

test('wiring: first save, send, sweep and My Desk all use it', () => {
  const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  assert.ok(read('src/app/api/intake/draft/route.js').includes('settleQuietly('), 'first save makes the company and person');
  const submit = read('src/app/api/intake/submit/route.js');
  assert.ok(submit.includes('settleQuietly(') && submit.includes('linkPeopleQuietly('));
  assert.ok(submit.includes("kind: 'project'"), 'a look alike job becomes a question');
  const lib = read('src/lib/intake/conceptualProjects.js');
  assert.ok(lib.includes('askOnce(') && lib.includes('linkPeopleQuietly('));
  const desk = read('src/lib/desk/deskServer.js');
  assert.ok(desk.includes('salesOwnerId: null') && desk.includes('pendingReviews('));
  const reviews = read('src/lib/intake/webReviews.js');
  assert.ok(reviews.includes("status: 'PENDING'"), 'an answer claims the question first');
  // Mike 10-4: the questions also show on the company page and the Contacts list.
  const shared = "@/components/crm/LookAlikeReviews";
  for (const f of ['src/app/(app)/clients/[id]/ClientDetailClient.jsx', 'src/app/(app)/crm/contacts/ContactsClient.jsx', 'src/app/(app)/sales/desk/page.jsx']) {
    assert.ok(read(f).includes(shared), `${f} uses the shared look alike rows`);
  }
  const get = read('src/app/api/sales/desk/review/route.js');
  assert.ok(get.includes('existingContact: { clientId }') && get.includes('pendingReviews(prisma, where)'), 'one company sees its own and its people\'s questions');
});
