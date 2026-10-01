// Voice Training (Mike 9-30): out-of-office replies and calendar mail never
// teach a voice; a big .mbox picks up where it stopped. Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoMailReason, findAutoMail } from '../../src/lib/tone/autoMail.js';
import { extractSentEmails, parseMessage, parsePastedEmail } from '../../src/lib/tone/mbox.js';
import { QUESTIONS, INTERVIEW_PREFIX, questionFor } from '../../src/lib/tone/interview.js';

const t = (name, got, want) => test(name, () => assert.equal(got, want));

// out of office
t('ooo subj', autoMailReason({ subject: 'Automatic reply: Lighting budget', body: 'x' }), 'OUT_OF_OFFICE');
t('ooo re', autoMailReason({ subject: 'Re: Site walk', body: 'Thank you for your email. I am currently out of the office with limited access to email and will return on Monday, Oct 5.' }), 'OUT_OF_OFFICE');
t('ooo lead+tail', autoMailReason({ subject: 'Re: Pricing', body: "Hi, I'm on vacation until Oct 12. For urgent matters please contact Sean at the office." }), 'OUT_OF_OFFICE');
t('ooo header', autoMailReason({ subject: 'Re: hi', body: 'whatever text here that is long enough to count', head: 'Auto-Submitted: auto-replied' }), 'OUT_OF_OFFICE');
// calendar
t('cal accepted', autoMailReason({ subject: 'Accepted: ILC / Trailhead budget review', body: '' }), 'CALENDAR');
t('cal gcal', autoMailReason({ subject: 'Invitation: Site walk @ Mon Oct 5, 2026 10am - 11am (EDT) (lee@x.com)', body: '' }), 'CALENDAR');
t('cal updated', autoMailReason({ subject: 'Updated invitation with note: Budget call', body: '' }), 'CALENDAR');
t('cal tentative', autoMailReason({ subject: 'Tentative: Kickoff', body: '' }), 'CALENDAR');
t('cal zoom body', autoMailReason({ subject: 'Budget review', body: 'Mike is inviting you to a scheduled Zoom meeting.\nJoin Zoom Meeting\nhttps://zoom.us/j/123\nMeeting ID: 812 3456 7890' }), 'CALENDAR');
t('cal teams', autoMailReason({ subject: 'Kickoff', body: 'Microsoft Teams meeting\nJoin on your computer, mobile app or room device\nClick here to join the meeting' }), 'CALENDAR');
t('cal raw', autoMailReason({ subject: 'Lunch', body: 'see you', raw: '--b\nContent-Type: text/calendar; method=REQUEST\n\nBEGIN:VCALENDAR' }), 'CALENDAR');
// real emails stay
t('real 1', autoMailReason({ subject: 'Re: Trailhead lighting budget', body: "Hi Lee,\n\nAttached is the updated budget. I pulled the pathway lights down to 40 and swapped the wall packs. Let me know if you want to walk through it Thursday." }), null);
t('real 2', autoMailReason({ subject: 'Following up', body: "Hi Dana, I'll be out of the office Friday but wanted to get this to you first. The proposal is attached, happy to talk Monday." }), null);
t('real 3', autoMailReason({ subject: 'Accepted proposal next steps', body: 'Great news on the award. Next steps are the kickoff call and the fixture schedule review.' }), null);
t('real 4', autoMailReason({ subject: 'Meeting next week', body: 'Can we meet Tuesday at 2 to go over the drawings? Happy to come to your office if that is easier.' }), null);

// repeated template sent 3+ times is caught in the library sweep
const tpl = d => ({ id: d, subject: 'Re: stuff', body: `Hello, I am out of the office ${d} and checking messages when I can. Talk soon.` });
const m = findAutoMail([tpl('Oct 3'), tpl('Nov 9'), tpl('Dec 1'), { id: 'x', subject: 'hi', body: 'A real note about the budget and the fixtures we picked.' }]);
t('repeat tpl', m.size, 3);

// parser path counts what it leaves out
const rec = (subj, body, extra = '') => `From 1@xxx Mon Jan 1 00:00:00 2024\nX-Gmail-Labels: Sent\nFrom: Mike <mike@ilcstudios.com>\nSubject: ${subj}\nDate: Mon, 1 Jan 2024 10:00:00 -0500\nContent-Type: text/plain\n${extra}\n${body}\n`;
const stats = {};
t('parse ooo', parseMessage(rec('Re: hello', 'Thank you for your email. I am currently out of the office until Monday.'), '', stats), null);
t('parse cal', parseMessage(rec('Accepted: Budget call', 'Mike has accepted this invitation.'), '', stats), null);
t('stats', JSON.stringify(stats), '{"OUT_OF_OFFICE":1,"CALENDAR":1}');
t('paste ooo', parsePastedEmail('Subject: Automatic reply: x\nI am away from the office and will reply when I return on Monday.'), null);
t('q&a key', questionFor(INTERVIEW_PREFIX + QUESTIONS[2].title)?.key, QUESTIONS[2].key);
t('q&a answers are not automatic', QUESTIONS.every(q => !autoMailReason({ subject: q.subject, body: 'Hi Lee, thanks for reaching out about the project. Here is what I can do.' })), true);

// resume: a mailbox read from part way picks up at the next email, no half email
const real = n => rec(`Budget ${n}`, `Hi Lee, here is the budget number ${n} for the project. Let me know what you think of it.`);
const text = Array.from({ length: 20 }, (_, i) => real(i)).join('');
const blob = new Blob([text]);
const all = await extractSentEmails(blob, '', {});
t('all', all.length, 20);
const half = Math.floor(text.length / 2) + 3;
const rest = await extractSentEmails(blob, '', { startAt: half });
const firstIdx = Number(rest.map(e => e.subject.split(' ')[1]).sort((a, b) => a - b)[0]);
t('resume count', rest.length, 20 - firstIdx);
t('resume complete bodies', rest.every(e => e.body.endsWith('think of it.')), true);
let last = 0;
await extractSentEmails(blob, '', { startAt: half, onProgress: b => { last = b; } });
t('progress from file start', last, text.length);


test('away and focus-time sentences come out of a real email (Mike 10-1)', async () => {
  const { stripAwayLines, isAwaySentence } = await import('../../src/lib/tone/autoMail.js');
  const body = 'Hi Lee,\n\nAttached is the budget. Let me know if you have any questions.\n\nILC Studios observes company-wide focus time the first week of each month. We will respond to outside meetings and emails as we are able. Thank you for your understanding.\n\nMike';
  assert.equal(stripAwayLines(body), 'Hi Lee,\n\nAttached is the budget. Let me know if you have any questions.\n\nMike');
  assert.equal(stripAwayLines('I am out of the office until Monday with limited\naccess to email. The budget is attached and came in under target.'), 'The budget is attached and came in under target.');
  const real = 'Thanks for your understanding. We will not have pricing until Friday.';
  assert.equal(stripAwayLines(real), real);
  assert.ok(isAwaySentence("I'll be on vacation next week."));
  assert.ok(!isAwaySentence('Excited to talk soon!'));
});

test('out sick, office closed and hand-off lines are away too (Mike 10-1, second pass)', async () => {
  const { stripAwayLines, isAwaySentence, autoMailReason, isAwayTemplate } = await import('../../src/lib/tone/autoMail.js');
  for (const s of ['I will be out sick on 2/23.', 'I will be out all day on 9/18 at a work event.', 'Please email the following people for help.',
    'Our office will be closed Friday for the holiday.', "I'm out of town through Thursday.", 'I will be unavailable until 3pm.', 'The Design Team at ILC Studios will be away from the office 6/16/25 - 6/20/25.']) assert.ok(isAwaySentence(s), s);
  for (const s of ['We are out of ideas on the garage.', 'The budget is out of scope for this phase.', 'Reach out with any questions.']) assert.ok(!isAwaySentence(s), s);
  const note = 'Hi all,\n\nI will be out sick on 2/23. Please email the following people for help.\nSean Ryan sean@ilcstudios.com\nJohn Doe john@ilcstudios.com\n\nThe Mason budget is attached and came in under target.';
  assert.equal(stripAwayLines(note), 'Hi all,\n\nThe Mason budget is attached and came in under target.');
  assert.equal(autoMailReason({ subject: 'ILC office closed notice', body: 'Hi all, our office will be closed Monday for Labor Day. Have a great weekend!' }), 'OUT_OF_OFFICE');
  assert.equal(autoMailReason({ subject: 'Out sick today', body: 'I will be out sick on 2/23. Please email the following people for help.' }), 'OUT_OF_OFFICE');
  assert.ok(isAwayTemplate({ name: 'ILC office closed notice', subject: 'Office hours', body: 'Thanks for reaching out, we will get back to you.' }));
  assert.ok(!isAwayTemplate({ name: 'Peer review budget delivery', subject: 'Budget', body: 'Attached is the budget for {Project Name}.' }));
});
