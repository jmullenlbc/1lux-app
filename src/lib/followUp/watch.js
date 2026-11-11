/**
 * Follow-up watch, did they do what they said they would? (Mike 9-25)
 *
 * After a meeting, some next steps are the other person's to do: reply, send
 * drawings, send an invite, make an intro. Those are "waiting" steps. This file
 * answers two questions about them, with no database, so the rules can be
 * tested on their own:
 *
 *  - Does this email (or calendar invite) do the thing? → emailFulfills / eventFulfills
 *  - If nothing has come, when is the next reminder?    → ladderOf / nextRemindAt
 *
 * The reminder ladder is "days after the meeting": 14 / 30 / 60 by default,
 * editable per step type on Sales Automation → Reminder timeline. A blank rung
 * means stop. After the last rung the bot stops asking and the step shows
 * "no answer after N reminders", it never nags forever.
 */

/** Executors that wait on the other person, and what each one waits for. */
export const WAIT_EXECUTORS = {
  EXPECT_REPLY:  'REPLY',
  EXPECT_FILES:  'FILES',
  EXPECT_INVITE: 'INVITE',
  EXPECT_INTRO:  'INTRO',
};
export const isWaitExecutor = executor => Object.hasOwn(WAIT_EXECUTORS, executor || '');

/** Our own addresses never count as "the third party" in an intro. */
export const ILC_DOMAINS = ['ilcstudios.com', '1lux.lighting', 'logiqsupply.com'];

const DAY_MS = 86_400_000;
const lower = s => String(s || '').trim().toLowerCase();
const domainOf = e => lower(e).split('@')[1] || '';

// Files that look like drawings or a document set. Images are left out on
// purpose: a logo in a signature is an image attachment on half of all email.
const FILE_RE = /\.(pdf|dwg|dxf|rvt|rfa|ifc|nwd|nwc|dwf|dwfx|skp|zip|7z|rar|xlsx?|docx?)$/i;

// A link to a file share instead of an attachment.
const SHARE_LINKS = [
  ['dropbox.com', 'Dropbox'], ['box.com', 'Box'], ['wetransfer.com', 'WeTransfer'], ['we.tl', 'WeTransfer'],
  ['sharepoint.com', 'SharePoint'], ['1drv.ms', 'OneDrive'], ['onedrive.live.com', 'OneDrive'],
  ['drive.google.com', 'Google Drive'], ['procore.com', 'Procore'], ['bluebeam', 'Bluebeam'],
  ['egnyte.com', 'Egnyte'], ['buildingconnected.com', 'BuildingConnected'], ['acc.autodesk.com', 'Autodesk'],
  ['docs.b360.autodesk.com', 'Autodesk'], ['plangrid.com', 'PlanGrid'], ['smartsheet.com', 'Smartsheet'],
];
// Words that make an attachment with no listed name worth believing.
const FILES_WORDS = /\b(drawings?|plans?|sheets?|set|cds?|dds?|sds?|pdfs?|files?|attached|attachments?|specs?)\b/i;

function textOf(email) {
  const html = String(email.bodyHtml || '').replace(/<[^>]+>/g, ' ');
  return `${email.subject || ''}\n${email.bodyPreview || ''}\n${html}`;
}

/** Everyone on the email as [{ email, name }], sender first. Accepts JSON strings as stored. */
export function peopleOn(email) {
  const list = v => {
    if (!v) return [];
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
    return (Array.isArray(v) ? v : []).map(p => (typeof p === 'string' ? { email: p } : p)).filter(p => p?.email);
  };
  const from = email.fromEmail || email.from;
  return [
    ...(from ? [{ email: from, name: email.fromName || '' }] : []),
    ...list(email.to ?? email.toEmails), ...list(email.cc ?? email.ccEmails),
  ].map(p => ({ email: lower(p.email), name: String(p.name || '') }));
}

function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || 'They'; }

/** Name tokens of a target ("Jane Roe (Acme)") worth searching for, 3+ letters. */
function targetTokens(targetName) {
  return lower(targetName).split(/[^a-z0-9]+/).filter(t => t.length >= 3);
}

/**
 * Does this email do the waiting step?
 *
 * @param executor  one of WAIT_EXECUTORS' keys
 * @param email     { fromEmail, fromName, to|toEmails, cc|ccEmails, subject, bodyPreview, bodyHtml,
 *                    sentAt, isCalendarInvite, isAutomated, hasAttachments, attachments: [{ filename }] }
 * @param opts      { contactEmail, contactName, targetName, since, ilcDomains }
 * @returns { how, note } when it does, or null.
 */
export function emailFulfills(executor, email, { contactEmail, contactName = '', targetName = '', since = null, ilcDomains = ILC_DOMAINS } = {}) {
  const want = WAIT_EXECUTORS[executor];
  const contact = lower(contactEmail);
  if (!want || !email || !contact || email.isAutomated) return null;

  const sent = email.sentAt ? new Date(email.sentAt) : null;
  if (since && sent && sent < new Date(since)) return null;

  const who = firstName(contactName);
  const from = lower(email.fromEmail || email.from);
  const subject = String(email.subject || '').trim();

  if (want === 'REPLY') {
    if (from !== contact || email.isCalendarInvite) return null;
    return { how: 'email', note: `${who} replied${subject ? `: "${subject}"` : ''}` };
  }

  if (want === 'INVITE') {
    if (from !== contact || !email.isCalendarInvite) return null;
    return { how: 'email', note: `${who} sent an invite${subject ? `: "${subject}"` : ''}` };
  }

  if (want === 'FILES') {
    if (from !== contact) return null;
    const files = (email.attachments || []).map(a => a?.filename || a?.name || '').filter(n => FILE_RE.test(n));
    if (files.length) return { how: 'email', note: `${who} sent ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${files.length - 3} more` : ''}` };
    const text = lower(textOf(email));
    const share = SHARE_LINKS.find(([host]) => text.includes(host));
    if (share) return { how: 'email', note: `${who} sent a ${share[1]} link${subject ? `: "${subject}"` : ''}` };
    // The provider said "has attachments" without naming them (Graph does
    // this unless attachments are expanded). Believed only with a files word.
    if (email.hasAttachments && !(email.attachments || []).length && FILES_WORDS.test(textOf(email))) {
      return { how: 'email', note: `${who} sent an attachment${subject ? `: "${subject}"` : ''}` };
    }
    return null;
  }

  if (want === 'INTRO') {
    const people = peopleOn(email);
    if (!people.some(p => p.email === contact)) return null;
    const ours = new Set(ilcDomains.map(lower));
    const others = people.filter(p => p.email !== contact && !ours.has(domainOf(p.email)));
    if (!others.length) return null;
    const tokens = targetTokens(targetName);
    let match = others[0];
    if (tokens.length) {
      const hay = p => lower(`${p.name} ${p.email}`);
      match = others.find(p => tokens.some(t => hay(p).includes(t)));
      // The name may only be in the words ("meet Jane, cc'd").
      if (!match && tokens.some(t => lower(textOf(email)).includes(t))) match = others[0];
      if (!match) return null;
    }
    // Synced addresses carry no names, so fall back to the name from the note.
    const target = match.name || (tokens.length && String(targetName).trim()) || '';
    return { how: 'email', note: `${who} introduced you to ${target ? `${target} (${match.email})` : match.email}` };
  }
  return null;
}

/**
 * Does a synced calendar event do the waiting step? Only an invite the contact
 * organized counts, and only one that arrives after the ask.
 * @param event { organizerEmail, title, startAt, createdAt? }
 */
export function eventFulfills(executor, event, { contactEmail, contactName = '', since = null } = {}) {
  if (WAIT_EXECUTORS[executor] !== 'INVITE' || !event) return null;
  if (!contactEmail || lower(event.organizerEmail) !== lower(contactEmail)) return null;
  const when = event.createdAt || event.startAt;
  if (since && when && new Date(when) <= new Date(since)) return null;
  return { how: 'calendar', note: `${firstName(contactName)} sent an invite${event.title ? `: "${event.title}"` : ''}` };
}

// ── The reminder ladder ──────────────────────────────────────────────────────

/**
 * The rungs, in days after the meeting. A per-step override replaces the first
 * rung. Blank, zero or out-of-order rungs are dropped, so "14, blank, 60" is
 * 14 then 60 and "30, 14" is just 30.
 */
export function ladderOf(type = {}, action = {}) {
  const raw = [action.reminderDays ?? type.reminderDays, type.reminder2Days, type.reminder3Days];
  const out = [];
  for (const v of raw) {
    const n = Number(v);
    if (v == null || v === '' || !Number.isFinite(n) || n < 1) continue;
    if (out.length && n <= out[out.length - 1]) continue;
    out.push(Math.round(n));
  }
  return out;
}

/** When the wait started: the meeting, unless the step was confirmed before it. */
export function waitStart(action = {}, note = {}) {
  const meeting = note.meetingDate ? new Date(note.meetingDate) : null;
  const confirmed = action.confirmedAt ? new Date(action.confirmedAt) : null;
  if (meeting && confirmed) return meeting < confirmed ? meeting : confirmed;
  return meeting || confirmed || new Date();
}

/** The date of rung number `count` (0 = first), or null when the ladder is done. */
export function nextRemindAt(start, rungs, count) {
  const days = rungs[count];
  if (days == null) return null;
  return new Date(new Date(start).getTime() + days * DAY_MS);
}

/**
 * The step's live state in plain words, for the Notes tab.
 * @returns { state: 'done'|'waiting'|'gave up'|'not started', text }
 */
export function waitStatus(action = {}, rungs = [], now = new Date()) {
  if (action.fulfilledAt) return { state: 'done', text: action.fulfilledNote || 'Done' };
  if (action.status === 'DONE') return { state: 'done', text: 'Marked done' };
  if (action.status !== 'CONFIRMED') return { state: 'not started', text: 'Starts watching when the note is published' };
  const sent = action.reminderCount || 0;
  if (action.remindAt) {
    const d = new Date(action.remindAt);
    const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const rung = `reminder ${sent + 1} of ${Math.max(rungs.length, sent + 1)}`;
    return { state: 'waiting', text: d <= now ? `Watching email, ${rung} is due` : `Watching email, ${rung} on ${day}` };
  }
  if (sent > 0) return { state: 'gave up', text: `No answer after ${sent} reminder${sent === 1 ? '' : 's'}` };
  return { state: 'waiting', text: 'Watching email, no reminders set for this step' };
}
