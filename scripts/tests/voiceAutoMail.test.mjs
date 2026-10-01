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

