/**
 * Q&A starter for Voice Training (Mike 9-30: "asking questions and getting a
 * typical email and then pushing that response to the voice training as a
 * manual way at the beginning to really target the AI model in the right
 * place"). Each question is an everyday sales situation; the person writes the
 * email they would really send. Answers are saved as source INTERVIEW (the
 * batch fileName is the question's title) and the relearn always reads every
 * one of them, ahead of the mailbox, so they steer the voice most.
 *
 * Pure, no imports: the screen and the server both read it.
 */
export const INTERVIEW_SOURCE = 'INTERVIEW';
export const INTERVIEW_PREFIX = 'Q&A: ';

export const QUESTIONS = [
  { key: 'new-lead', title: 'First reply to a new lead', subject: 'Lighting budget for your project',
    ask: 'A developer you have never worked with fills out the website form asking for a lighting budget on a 200-unit apartment building. Write your first reply.' },
  { key: 'proposal-chase', title: 'Proposal with no answer', subject: 'Following up on our proposal',
    ask: 'You sent a proposal 8 days ago and have heard nothing. Write the follow-up.' },
  { key: 'need-drawings', title: 'Asking for drawings', subject: 'Drawings for pricing',
    ask: 'A general contractor wants a number, but you need the electrical and architectural drawings first. Ask for them.' },
  { key: 'rush', title: 'A rush request', subject: 'Budget timing',
    ask: 'A GC needs the lighting budget by Friday, which is tight. Reply with what you can do.' },
  { key: 'budget-delivered', title: 'Sending the budget', subject: 'Lighting budget attached',
    ask: 'You are sending the finished lighting budget. Write the email that goes with it.' },
  { key: 'cut-cost', title: 'Asked to cut cost', subject: 'Options to bring the number down',
    ask: 'The architect says the lighting number is 15% over and asks what can come out. Reply.' },
  { key: 'price-pushback', title: 'Price pushback', subject: 'Our fee',
    ask: 'A client says your fee is higher than another firm\'s. Reply.' },
  { key: 'met-at-event', title: 'After meeting someone', subject: 'Great meeting you',
    ask: 'You met a developer at an industry event yesterday. Write the follow-up.' },
  { key: 'past-client', title: 'Checking in with a past client', subject: 'Checking in',
    ask: 'Write to a client you finished a project with last year, to see what they have coming up.' },
  { key: 'won-job', title: 'Kicking off a won job', subject: 'Next steps',
    ask: 'You just won the job. Write the thank-you and next steps email.' },
  { key: 'not-a-fit', title: 'Saying no politely', subject: 'Your project',
    ask: 'A project is not a fit for ILC right now. Turn it down and keep the door open.' },
  { key: 'referral', title: 'Asking for an introduction', subject: 'Quick favor',
    ask: 'Ask a happy client to introduce you to a developer they know.' },
];

/** The question an upload answered, from its batch fileName, or null. */
export function questionFor(fileName) {
  const t = String(fileName || '');
  return t.startsWith(INTERVIEW_PREFIX) ? QUESTIONS.find(q => INTERVIEW_PREFIX + q.title === t) || null : null;
}
