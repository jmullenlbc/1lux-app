/**
 * Reading the signature block at the bottom of an email, and the rule for
 * applying it to a person's card: fill blanks only, a difference is a question.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSignature, stripHtml } from '../../src/lib/email/signature.js';
import { applySignatureToContact } from '../../src/lib/email/signatureApply.js';

test('a full signature after "Thanks" is read field by field', () => {
  const s = parseSignature(`Hi Mike,

Here is the schedule. Let me know what you think.

Thanks,
Sam Jones
Director of Preconstruction
Clearsky Development LLC
O: 206-555-0100 | M: 206.555.0199
sam@clearskydev.com
www.clearskydev.com
linkedin.com/in/samjones`);
  assert.equal(s.name, 'Sam Jones');
  assert.equal(s.title, 'Director of Preconstruction');
  assert.equal(s.company, 'Clearsky Development LLC');
  assert.equal(s.phone, '(206) 555-0100');
  assert.equal(s.mobile, '(206) 555-0199');
  assert.equal(s.website, 'www.clearskydev.com');
  assert.equal(s.linkedInUrl, 'https://www.linkedin.com/in/samjones');
});

test('a two-hyphen separator starts the block, and "Title, Company" on one line is split', () => {
  const s = parseSignature(`Sounds good, see you Tuesday.
--
Dana Ortiz
Project Manager, Trailhead Builders
Cell (425) 555-0142
https://www.linkedin.com/in/dana-ortiz-123/`);
  assert.equal(s.name, 'Dana Ortiz');
  assert.equal(s.title, 'Project Manager');
  assert.equal(s.company, 'Trailhead Builders');
  assert.equal(s.mobile, '(425) 555-0142');
  assert.equal(s.phone, null);
  assert.match(s.linkedInUrl, /linkedin\.com\/in\/dana-ortiz-123/);
});

test('an HTML body is stripped first, and a lone number is the work phone', () => {
  const html = `<div><p>Thanks for the quick turnaround.</p><p>Best regards,</p>
<p><b>Lee Busse</b><br>Senior Estimator<br>Northwind Construction, Inc.<br>+1 (503) 555-0177<br>lee@northwind.test</p></div>`;
  const s = parseSignature('', { bodyHtml: html, senderName: 'Lee Busse' });
  assert.equal(s.name, 'Lee Busse');
  assert.equal(s.title, 'Senior Estimator');
  assert.equal(s.company, 'Northwind Construction, Inc.');
  assert.equal(s.phone, '(503) 555-0177');
  assert.equal(s.mobile, null);
  assert.equal(s.linkedInUrl, null);
  assert.equal(stripHtml('<p>a</p><p>b &amp; c</p>').trim(), 'a\nb & c');
});

test('a title with no company line borrows the line after it', () => {
  const s = parseSignature(`Cheers
Priya Natarajan
VP Purchasing
Summit Homes
971-555-0120`);
  assert.equal(s.title, 'VP Purchasing');
  assert.equal(s.company, 'Summit Homes');
  assert.equal(s.phone, '(971) 555-0120');
});

test('a short reply with no sign-off has no signature', () => {
  const s = parseSignature('Yes, that works for me. See you at 2.');
  assert.deepEqual(s, { name: null, title: null, company: null, phone: null, mobile: null, linkedInUrl: null, website: null });
});

test('a sign-off alone, with nothing after it, is not a signature', () => {
  const s = parseSignature('Will do.\n\nThanks');
  assert.equal(s.name, null);
  assert.equal(s.phone, null);
});

// Applying what was read to the card.

function fakeDb(contact) {
  const db = {
    contact: { ...contact },
    suggestions: [],
    updates: [],
  };
  db.contact.findUnique = async () => ({ ...db.contact });
  db.contact.update = async ({ data }) => { Object.assign(db.contact, data); db.updates.push(data); return db.contact; };
  db.contactFieldSuggestion = {
    findFirst: async ({ where }) => db.suggestions.find(s => s.contactId === where.contactId && s.field === where.field && s.suggestedValue === where.suggestedValue) || null,
    create:    async ({ data }) => { const row = { id: `s${db.suggestions.length + 1}`, status: 'PENDING', ...data }; db.suggestions.push(row); return row; },
  };
  return db;
}

test('blanks are filled, differences become questions, the same value is left alone', async () => {
  const db = fakeDb({ id: 'c1', title: 'Estimator', company: null, workPhone: null, cellPhone: '(206) 555-0199', phone: null, linkedInUrl: null });
  const parsed = { name: 'Sam Jones', title: 'Director of Preconstruction', company: 'Clearsky Development LLC',
                   phone: '(206) 555-0100', mobile: '206-555-0199', linkedInUrl: 'https://www.linkedin.com/in/samjones', website: 'clearskydev.com' };
  const r = await applySignatureToContact(db, { contactId: 'c1', parsed, messageId: 'm1' });

  assert.deepEqual(r.filled.sort(), ['company', 'linkedInUrl', 'phone']);
  assert.equal(db.contact.company, 'Clearsky Development LLC');
  assert.equal(db.contact.workPhone, '(206) 555-0100');
  assert.equal(db.contact.phone, '(206) 555-0100');            // legacy column kept in sync
  assert.equal(db.contact.title, 'Estimator');                 // never overwritten
  assert.equal(db.contact.cellPhone, '(206) 555-0199');        // same digits, no question

  assert.deepEqual(r.suggested.sort(), ['title', 'website']);
  const q = db.suggestions.find(s => s.field === 'title');
  assert.equal(q.currentValue, 'Estimator');
  assert.equal(q.suggestedValue, 'Director of Preconstruction');
  assert.equal(q.sourceMessageId, 'm1');

  // Asking again does not make a second question.
  const again = await applySignatureToContact(db, { contactId: 'c1', parsed, messageId: 'm2' });
  assert.deepEqual(again.suggested, []);
  assert.equal(db.suggestions.filter(s => s.field === 'title').length, 1);
});
