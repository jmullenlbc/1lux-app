/**
 * Bot email style (Mike 9-26): no dashes ever, bullets for next steps, the
 * sender's own signature and voice, and a tone upload that reads only the
 * words each person wrote.
 *
 * Run: node --test scripts/tests/emailStyle.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripDashes, hasBullets, signatureBlock, formatPhone, withSignature, insertBeforeSignOff, toneSection } from '../../src/lib/bot/emailStyle.js';
import { parseMessage, parseMboxText, ownWords, decodeHeader } from '../../src/lib/tone/mbox.js';
import { editExamples, editExamplesSection } from '../../src/lib/bot/editLearning.js';

const MIKE = { name: 'Michael Kershner', jobTitle: 'Founder and President of Business Development', email: 'mike@ilcstudios.com', phone: '(857) 998-0556' };

test('no em dash, en dash or double dash survives', () => {
  const out = stripDashes('Thanks for coffee—I really enjoyed it. Pages 2–3 -- the rest\n— Mike');
  assert.doesNotMatch(out, /—|–|--/);
  assert.match(out, /coffee, I really/);
  assert.match(out, /Pages 2-3, the rest/);
  assert.match(out, /\nMike$/);
  assert.equal(stripDashes('Hi Lee —.'), 'Hi Lee.');
  assert.equal(stripDashes('Hi Lee,\n\nThanks,\nMike'), 'Hi Lee,\n\nThanks,\nMike');
  assert.equal(stripDashes('Hi Lee —\nMore'), 'Hi Lee\nMore');
});

test('bullets are detected', () => {
  assert.equal(hasBullets('Hi\n\n• Send the fee sheet'), true);
  assert.equal(hasBullets('Hi\n- one'), true);
  assert.equal(hasBullets('Just a paragraph - with a hyphen.'), false);
});

test('signature swaps in each person, in Mike\'s layout', () => {
  assert.equal(formatPhone('+1 857 998 0556'), '857.998.0556');
  assert.equal(signatureBlock(MIKE), 'Michael Kershner\nFounder and President of Business Development\nmike@ilcstudios.com\nc: 857.998.0556');
  assert.equal(signatureBlock({ name: 'Maram S', email: 'maram@ilcstudios.com' }), 'Maram S\nmaram@ilcstudios.com');
  assert.equal(withSignature('Best,\nMike\n\n', MIKE), `Best,\nMike\n\n${signatureBlock(MIKE)}`);
});

test('new items go above the sign-off and signature of an edited email', () => {
  const body = withSignature('Hi Lee,\n\nGood to see you.\n\nBest,\nMike', MIKE);
  const out = insertBeforeSignOff(body, '• One more thing', MIKE);
  assert.ok(out.indexOf('One more thing') < out.indexOf('Best,'));
  assert.ok(out.endsWith(signatureBlock(MIKE)));
  assert.equal(insertBeforeSignOff('Hi', '', MIKE), 'Hi');
});

test('tone profile becomes a prompt block', () => {
  const block = toneSection(JSON.stringify({ summary: 'Short and direct.', openers: ['Hey Lee'], avoids: ['fluff'] }), 'Michael Kershner');
  assert.match(block, /Michael actually writes/);
  assert.match(block, /Short and direct/);
  assert.match(block, /"Hey Lee"/);
  assert.equal(toneSection(null, 'x'), '');
  assert.equal(toneSection('not json', 'x'), '');
});

test('edit lessons are per salesperson', async () => {
  let asked;
  const db = { botDraft: { findMany: async a => { asked = a; return [{ subject: 'S', body: 'sent', aiSubject: 'S', aiBody: 'bot' }]; } } };
  const got = await editExamples(db, 'RECAP', 4, 'u1');
  assert.equal(asked.where.userId, 'u1');
  assert.match(editExamplesSection(got, 'Maram Smith'), /WHAT MARAM ACTUALLY SENT/);
  assert.doesNotMatch(editExamplesSection(got, 'Maram Smith'), /—/);
});

// A Takeout record: multipart, base64 text part, quoted reply underneath.
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const record = ({ labels = 'Sent', from = 'Mike <mike@ilcstudios.com>', subject = 'Seattle', text }) => [
  'From 1234@xxx Thu Sep 24 10:00:00 +0000 2026',
  `X-Gmail-Labels: ${labels}`,
  `From: ${from}`,
  `Subject: ${subject}`,
  'Date: Thu, 24 Sep 2026 10:00:00 -0700',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset="UTF-8"',
  'Content-Transfer-Encoding: base64',
  '',
  b64(text),
  '--b1',
  'Content-Type: text/html; charset="UTF-8"',
  '',
  '<p>ignored</p>',
  '--b1--',
  '',
].join('\n');

test('the tone reader keeps only what the person wrote', () => {
  const text = 'Hey Lee, good seeing you. I will get you the fee sheet by Friday, sound good?\n\nOn Wed, Sep 23, 2026 Lee Busse wrote:\n> send me stuff';
  const e = parseMessage(record({ text }), 'mike@ilcstudios.com');
  assert.ok(e);
  assert.match(e.body, /fee sheet by Friday/);
  assert.doesNotMatch(e.body, /send me stuff|wrote:/);
  assert.equal(parseMessage(record({ labels: 'Inbox', from: 'Lee <lee@x.test>', text }), 'mike@ilcstudios.com'), null);
  assert.equal(parseMessage(record({ subject: 'Automatic reply: out', text }), 'mike@ilcstudios.com'), null);
  assert.equal(decodeHeader('=?UTF-8?B?' + b64('Café follow-up') + '?='), 'Café follow-up');
  assert.equal(ownWords('Thanks!\n-- \nMike\nc: 857'), 'Thanks!');
  const all = parseMboxText([record({ text }), record({ text: `${text} again` })].join('\n'), 'mike@ilcstudios.com');
  assert.equal(all.length, 2);
});

// ── Voice Training + signature layout (Mike 9-26, item 1 and 2) ─────────────
import { pickSubject, voiceExamplesSection, subjectRules, DEFAULT_SIGNATURE_TEMPLATE } from '../../src/lib/bot/emailStyle.js';
import { sampleHash, parsePastedEmail } from '../../src/lib/tone/mbox.js';

test('signature layout fills each person in and drops a line whose details are blank', () => {
  const layout = '{name}\n{title}\n{email}\nc: {phone}';
  assert.equal(signatureBlock(MIKE, layout), 'Michael Kershner\nFounder and President of Business Development\nmike@ilcstudios.com\nc: 857.998.0556');
  const noCell = signatureBlock({ ...MIKE, phone: '' }, layout);
  assert.doesNotMatch(noCell, /c:/);
  assert.equal(signatureBlock({ name: 'Maram Test', email: 'm@x.com' }, 'Best,\n{first}\n{title}'), 'Best,\nMaram');
  assert.equal(signatureBlock(MIKE, undefined), signatureBlock(MIKE, DEFAULT_SIGNATURE_TEMPLATE));
  assert.match(signatureBlock({ ...MIKE, signatureTemplate: 'Cheers,\n{first}' }), /^Cheers,\nMichael$/);
});

test('subjects: a real one survives, stock lines and day words fall back', () => {
  assert.equal(pickSubject('Lee, those Creekside wall packs', 'fb'), 'Lee, those Creekside wall packs');
  assert.equal(pickSubject('', 'fb'), 'fb');
  assert.equal(pickSubject('Re: Clear Sky peer review', 'fb'), 'Clear Sky peer review');
  assert.equal(pickSubject('RE: Fwd: Re:', 'fb'), 'fb');
  assert.equal(pickSubject('Checking in', 'fb'), 'fb');
  assert.equal(pickSubject('Great seeing you today', 'fb'), 'fb');
  assert.doesNotMatch(pickSubject('Lighting -- next steps', 'fb'), /--/);
  assert.match(subjectRules('coffee'), /our coffee/);
});

test('real emails are shown to the writer as examples, not copied', () => {
  assert.equal(voiceExamplesSection([], 'Mike'), '');
  const s = voiceExamplesSection([{ subject: 'Quick one', body: 'Hey Lee, loved the site walk.' }], 'Michael Kershner');
  assert.match(s, /Real emails Michael wrote/);
  assert.match(s, /Subject: Quick one\nHey Lee/);
  assert.match(s, /Never copy/);
});

test('sample hash ignores case and spacing so the same email is never stored twice', () => {
  assert.equal(sampleHash('Hi', 'Hello  there\nLee'), sampleHash(' hi ', 'hello there lee'));
  assert.notEqual(sampleHash('Hi', 'Hello there'), sampleHash('Hi', 'Hello there!'));
});

test('pasted emails: optional Subject line, too short is skipped', () => {
  const e = parsePastedEmail('Subject: Pool lights\nHey Sam, the pool lights look great. Can we walk it Thursday with the GC?');
  assert.equal(e.subject, 'Pool lights');
  assert.match(e.body, /^Hey Sam/);
  assert.equal(parsePastedEmail('Thanks!'), null);
  assert.equal(parsePastedEmail('No subject here but plenty of words to count as a real email body.', 'x').subject, 'x');
});

test('the tone reader drops the typed or picture signature and a two-line "On ... wrote:"', () => {
  const typed = 'Hi Lee,\n\nLoved the walk today. Can we get on a call Thursday?\n\nExcited to talk soon!\nMichael Kershner\nFounder and President of Business Development\nmike@ilcstudios.com\nc: 857.998.0556';
  const t = ownWords(typed);
  assert.match(t, /Excited to talk soon!$/);
  const pic = ownWords('Call me with any questions Kyle!\n[image: photo] <http://www.ilcstudios.com>\n\nMichael Kershner\n(857) 998-0556');
  assert.equal(pic, 'Call me with any questions Kyle!');
  const quoted = ownWords('Sounds good!\n\nOn Thu, Jun 18, 2026 at 2:10 PM Michael Kershner <mike@ilcstudios.com>\nwrote:\n> old stuff');
  assert.equal(quoted, 'Sounds good!');
  assert.match(ownWords('We need 40 wall packs on the east side.\nThanks,\nMike'), /Thanks,\nMike$/);
});
