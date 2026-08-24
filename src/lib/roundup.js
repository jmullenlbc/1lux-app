/**
 * roundup.js — building one person's Monday morning.
 *
 * ── What this is for ──
 * The weekly sales meeting already has a run-of-show at /dashboards/meeting:
 * everything open, for everybody, edited live in the room. That is the right
 * surface for the meeting and the wrong surface for the hour before it, when
 * the only question is "what do I personally have to answer for on Monday?"
 *
 * So this does not build a second dashboard. It builds one bell item per
 * person, on Monday, that says what THEY are on the hook for and links into the
 * meeting board. Same data, cut to one person — the cut is the whole product.
 *
 * ── Two rules that shape everything below ──
 * 1. Nobody gets an empty bell. A roundup that says "nothing this week" every
 *    week teaches people to dismiss it unread, and then the week it matters it
 *    is dismissed unread too. No sections → no alert, and that is a success.
 * 2. Only your own work. Being told about a deal you do not own is somebody
 *    else's homework arriving as your obligation. Every filter here is an
 *    ownership filter first and a date filter second.
 *
 * Pure and import-free, so it can be tested without a database or a Next build.
 */

/** Anything older than this stopped being news before you read it. */
export const SIGNAL_WINDOW_DAYS = 7;

/** How far ahead "this week" looks for things that have not gone wrong yet. */
export const LOOKAHEAD_DAYS = 7;

/** Most people can hold about this many of anything before it becomes a wall. */
const MAX_ITEMS_PER_SECTION = 6;

const DAY = 86400_000;

/** A Date, or null — never `new Date(null)`, which is a valid date in 1970. */
function asDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  const c = new Date(d.getTime());
  c.setHours(0, 0, 0, 0);
  return c;
}

function daysBetween(from, to) {
  return Math.floor((startOfDay(to) - startOfDay(from)) / DAY);
}

/**
 * The ISO week this date falls in, as `2026-W35`.
 *
 * This is the dedupe key, so it has to have exactly one property: the same
 * Monday produces the same string, and the next Monday produces a different
 * one. A calendar month or a plain date would fail one of those.
 */
export function weekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weeks are Monday-based and belong to the year containing their Thursday.
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * DAY));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Is this project mine — either hat? */
function ownedBy(project, userId) {
  return project.salesOwnerId === userId || project.preconManagerId === userId;
}

/**
 * Build one person's Monday roundup.
 *
 * @param {object}  input
 * @param {string}  input.userId
 * @param {Array}   [input.projects]     every live project, filtered here
 * @param {Array}   [input.noteActions]  note actions with `note` included
 * @param {Array}   [input.signals]      recent market signals
 * @param {Date}    [input.now]
 * @returns {{sections: Array, alert: object|null, counts: object}}
 *
 * `alert` is null when there is genuinely nothing to say. Callers must treat
 * that as the normal case and send nothing, not as an error.
 */
export function buildRoundup({ userId, projects = [], noteActions = [], signals = [], now = new Date() } = {}) {
  const empty = { sections: [], alert: null, counts: {} };
  if (!userId) return empty;

  const mine = (projects || []).filter(p => p && ownedBy(p, userId));
  const myProjectIds = new Set(mine.map(p => p.id));
  const myClientIds  = new Set(mine.map(p => p.clientId || p.client?.id).filter(Boolean));
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY);

  const sections = [];
  const push = (key, label, items) => {
    if (!items.length) return;
    sections.push({
      key, label,
      count: items.length,
      items: items.slice(0, MAX_ITEMS_PER_SECTION),
      more: Math.max(0, items.length - MAX_ITEMS_PER_SECTION),
    });
  };

  // ── Proposals out, nothing signed ────────────────────────────────────────
  // Longest wait first: the one that has been silent three weeks is the one
  // Monday is actually about.
  const awaiting = mine
    .filter(p => (p.proposalSentDate || p.designStage === 'PROPOSAL_SENT')
      && p.procurementStatus === 'OPEN'
      && (p.designStatus === 'OPEN' || !p.designStatus))
    .map(p => {
      const sent = asDate(p.proposalSentDate);
      return { id: p.id, name: p.name, days: sent ? daysBetween(sent, now) : null };
    })
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1))
    .map(p => ({ id: p.id, name: p.name, detail: p.days == null ? 'sent' : `${p.days} days` }));
  push('awaitingSignature', 'Waiting on a signature', awaiting);

  // ── Next actions I own ───────────────────────────────────────────────────
  // Overdue and due-this-week are one section deliberately. Split into two,
  // the overdue list becomes the one you read and the upcoming one becomes the
  // one you stop reading — which is how something becomes overdue.
  const actions = mine
    .filter(p => p.nextActionOwnerId === userId && asDate(p.nextActionDueDate))
    .map(p => {
      const due = asDate(p.nextActionDueDate);
      const offset = daysBetween(now, due);
      return { id: p.id, name: p.name, due, offset, overdue: offset < 0 };
    })
    .filter(a => a.due <= horizon)
    .sort((a, b) => a.offset - b.offset)
    .map(a => ({
      id: a.id, name: a.name, overdue: a.overdue,
      detail: a.overdue ? `${Math.abs(a.offset)} days overdue`
            : a.offset === 0 ? 'due today'
            : `due in ${a.offset} days`,
    }));
  push('nextActions', 'Your next actions', actions);

  // ── Reminders I set on my own notes ──────────────────────────────────────
  // Only unsent ones. A reminder that already rang the bell on its own day
  // must not ring again inside the roundup — that is the same nag wearing a
  // different hat, and it is exactly what the remindedAt stamp exists to stop.
  const reminders = (noteActions || [])
    .filter(a => a?.id && a.note?.isPublished && a.note.createdById === userId && !a.remindedAt)
    .map(a => ({ action: a, at: asDate(a.remindAt) }))
    .filter(r => r.at && r.at <= horizon)
    .sort((a, b) => a.at - b.at)
    .map(r => ({
      id: r.action.id,
      name: r.action.contactName || r.action.targetName || r.action.company || 'a contact',
      detail: String(r.action.detail || r.action.rawText || 'follow-up').slice(0, 120),
    }));
  push('reminders', 'Follow-ups you set', reminders);

  // ── Jobs I flagged ───────────────────────────────────────────────────────
  const flagged = mine
    .filter(p => p.flagged)
    .map(p => ({ id: p.id, name: p.name, detail: String(p.flagNote || 'flagged').slice(0, 120) }));
  push('flagged', 'Flagged', flagged);

  // ── Orders I am expecting ────────────────────────────────────────────────
  const expected = mine
    .filter(p => asDate(p.expectedOrderDate) && p.procurementStatus === 'OPEN')
    .map(p => ({ id: p.id, name: p.name, at: asDate(p.expectedOrderDate) }))
    .filter(p => p.at <= new Date(now.getTime() + 30 * DAY))
    .sort((a, b) => a.at - b.at)
    .map(p => {
      const off = daysBetween(now, p.at);
      return { id: p.id, name: p.name, detail: off < 0 ? `${Math.abs(off)} days late` : `in ${off} days` };
    });
  push('expectedOrders', 'Orders expected within 30 days', expected);

  // ── News about my clients and my jobs ────────────────────────────────────
  // A SUGGESTED project link is a guess, so it does not get to put an article
  // in your roundup on its own — but the same article still qualifies if its
  // CLIENT is yours, which is a judgement made by a different mechanism.
  const cutoff = new Date(now.getTime() - SIGNAL_WINDOW_DAYS * DAY);
  const news = (signals || [])
    .filter(s => s?.id)
    .map(s => ({ s, at: asDate(s.publishedAt) || asDate(s.createdAt) }))
    .filter(({ s, at }) => {
      if (!at || at < cutoff) return false;
      const projectHit = s.linkedProjectId && myProjectIds.has(s.linkedProjectId)
        && ['AUTO_LINKED', 'CONFIRMED'].includes(s.projectMatchStatus);
      const clientHit = s.linkedClientId && myClientIds.has(s.linkedClientId)
        && ['AUTO_LINKED', 'CONFIRMED'].includes(s.matchStatus);
      return Boolean(projectHit || clientHit);
    })
    .sort((a, b) => b.at - a.at)
    .map(({ s }) => ({
      id: s.id,
      name: String(s.title || 'Untitled').slice(0, 120),
      detail: s.linkedProject?.name || s.linkedClient?.name || 'news',
    }));
  push('news', 'News on your clients', news);

  if (!sections.length) return empty;

  const counts = Object.fromEntries(sections.map(s => [s.key, s.count]));

  // The bell shows a title and one line. The line has to survive being read at
  // a glance, so it is counts — the names are one click away on the board.
  const parts = [];
  if (counts.awaitingSignature) parts.push(`${counts.awaitingSignature} waiting on signature`);
  const overdue = actions.filter(a => a.overdue).length;
  if (overdue) parts.push(`${overdue} action${overdue === 1 ? '' : 's'} overdue`);
  else if (counts.nextActions) parts.push(`${counts.nextActions} action${counts.nextActions === 1 ? '' : 's'} due`);
  if (counts.reminders) parts.push(`${counts.reminders} follow-up${counts.reminders === 1 ? '' : 's'}`);
  if (counts.flagged) parts.push(`${counts.flagged} flagged`);
  if (counts.expectedOrders) parts.push(`${counts.expectedOrders} order${counts.expectedOrders === 1 ? '' : 's'} expected`);
  if (counts.news) parts.push(`${counts.news} news item${counts.news === 1 ? '' : 's'}`);

  return {
    sections,
    counts,
    alert: {
      userId,
      type: 'WEEKLY_ROUNDUP',
      title: 'Your week',
      message: parts.join(' · '),
      link: '/dashboards/meeting',
      // Keyed on the week, so Monday's roundup can only arrive once however
      // many times the job runs — and next Monday's is a different key.
      dedupeKey: `roundup:${weekKey(now)}`,
    },
  };
}
