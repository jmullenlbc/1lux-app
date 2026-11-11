// What actually sends campaign mail (0147). Mike 10-29: build everything, pick
// the sending service later. Until one is wired in here:
//   - production refuses with a plain message;
//   - a local or test copy runs in "test mode": every step runs and is
//     recorded, but no email leaves the computer.
// CAMPAIGN_SENDER names the service once one exists (for example "postmark").
import crypto from 'node:crypto';

export const NOT_CONNECTED = 'No sending service is connected yet, so nothing can be emailed. Your campaign is saved. Ask Mike to pick a sending service. (CAMPAIGN_NO_SENDER)';

export function senderStatus() {
  const named = String(process.env.CAMPAIGN_SENDER || '').trim().toLowerCase();
  const prod = process.env.NODE_ENV === 'production';
  if (!named || named === 'dryrun') {
    if (prod) return { ready: false, mode: null, message: NOT_CONNECTED };
    return { ready: true, mode: 'dryrun', label: 'Test mode: every step runs, but no email leaves this computer.' };
  }
  return { ready: false, mode: named, message: `The sending service "${named}" is named but not built in yet, so nothing can be emailed. Your campaign is saved. (CAMPAIGN_SENDER_UNKNOWN)` };
}

export function fromAddress() {
  return {
    name: process.env.CAMPAIGN_FROM_NAME || '1LUX',
    email: process.env.CAMPAIGN_FROM_EMAIL || null,
  };
}

/** One email. Returns { providerMessageId }; throws with a plain message on failure. */
export async function sendOne({ to, subject, html, text, headers }) {
  const s = senderStatus();
  if (!s.ready) throw new Error(s.message);
  if (!to || !subject || !html || !text || !headers) throw new Error('The email was missing a part. Nothing was sent. (CAMPAIGN_EMAIL_INCOMPLETE)');
  // dryrun: nothing leaves; the id marks the send as a test one.
  return { providerMessageId: `dryrun-${crypto.randomBytes(6).toString('hex')}` };
}
