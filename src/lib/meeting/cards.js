/**
 * The Weekly Meeting card catalog.
 *
 * The meeting screen used to be two hardcoded queues. Mike asked for a screen he
 * can customize, and Maram is the one who actually runs the meeting, so this is
 * a SHARED team screen with a default set an admin owns, not a per-person view.
 * Every card that lists deals therefore carries an owner column: the point of the
 * meeting is "who owes what", and a list without a name on each row cannot answer
 * that.
 *
 * This file is the single source of truth for what a card IS. It is deliberately
 * pure, no Prisma, no React, no `@/` alias, so the layout rules can be tested
 * directly and so both the API and the screen read the same catalog instead of
 * drifting apart.
 *
 * Storage: a card layout is Dashboard(section="MEETING") + one DashboardWidget
 * row per card, where `metric` holds the card key and `position` the order. No
 * schema change was needed, Dashboard.section is a plain string, and
 * ownerUserId being null already means "the shared default", set means "somebody's
 * personal copy". A user with no personal copy sees the shared default.
 */

export const MEETING_SECTION = 'MEETING';

/** DashboardWidget.category value that marks a row as a meeting card. */
export const MEETING_CATEGORY = 'MEETING_CARD';

/**
 * How long a relationship has to be silent before it lands on the "went quiet"
 * card, when nothing more specific applies.
 *
 * Measured, not guessed. Mike asked "went quiet after what is the real question",
 * so this came out of four years of his own calendar (scripts/calendar/quietGap.mjs):
 * across 5,353 gaps between meetings with the same company, half were 14 days or
 * less, 80% were 28 days or less, and 90% were 70 days or less. Every one of those
 * gaps is a gap a relationship SURVIVED, another meeting followed it. So a line
 * at 60 days flags roughly one gap in nine; at 30 days it would flag nearly one in
 * five, which is his normal rhythm and would make the card noise.
 *
 * This is only the fallback. A contact with a cadence tier uses its tier's rule
 * (RelationshipCadenceRule), and a per-contact or per-client override beats that.
 */
export const QUIET_AFTER_DAYS = 60;

/** Cards that list deals get an owner column, Maram runs the meeting, not the owner. */
const DEALS = { showsOwner: true };
const INFO  = { showsOwner: false };

/**
 * Maram 9-17: the meeting screen splits into a project-level tab and a
 * people-level tab. Every card belongs to exactly one. Deals, proposals,
 * budgets and submissions are about projects; who has gone quiet, new leads,
 * travel and who is out are about people.
 */
export const MEETING_LEVELS = [
  { key: 'project', label: 'Projects', hint: 'Deals, proposals, budgets and submissions' },
  { key: 'people',  label: 'People',   hint: 'Relationships, leads, travel and who is out' },
];
const PEOPLE_LEVEL_CARDS = new Set(['wentQuiet', 'newLeads', 'introductions', 'travel', 'whosOut']);
export function cardLevel(key) { return PEOPLE_LEVEL_CARDS.has(key) ? 'people' : 'project'; }

/**
 * The catalog.
 *
 * `needs` names a field the app does not have yet. A card with `needs` set is
 * real and listed, but cannot be switched on until that field exists, the screen
 * shows it greyed with the reason, rather than pretending the data is there.
 */
export const MEETING_CARDS = [
  // ── Maram's agenda (Oct 5 call), in the order she runs the meeting ──────────
  // defaultLayout() follows catalog order, so these sit at the top. The agenda
  // is: new opportunities, new leads, introductions, ownership, next actions,
  // client follow-ups, deadlines, blockers, then everything else.
  {
    key: 'newOpportunities',
    title: 'New opportunities',
    subtitle: 'Projects added in the last 7 days, any board',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'newLeads',
    title: 'New website leads to review',
    subtitle: 'Conceptual budget requests still sitting at Pending',
    ...INFO,
    defaultOn: true,
  },
  {
    key: 'introductions',
    title: 'Introductions',
    subtitle: 'People we asked to be introduced to, last 14 days or still open',
    ...INFO,
    defaultOn: true,
  },
  {
    key: 'ownership',
    title: 'Ownership',
    subtitle: 'Open jobs nobody owns yet',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'nextActions',
    title: 'Next actions due',
    subtitle: 'Who owes what, by when, overdue in red',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'clientFollowUps',
    title: 'Client follow-ups',
    subtitle: 'Open steps where we are waiting on the client, grouped by client, oldest first',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'deadlines',
    title: 'Deadlines',
    subtitle: 'Contract dates and open steps landing in the next 14 days',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'blockers',
    title: 'Blockers',
    subtitle: 'Waiting or blocked, with the reason',
    ...DEALS,
    defaultOn: true,
  },

  {
    key: 'awaitingSignature',
    title: 'Awaiting signature',
    subtitle: 'Proposals out, not yet signed, longest waiting first',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'closingSoon',
    title: 'Closing in the next 2 weeks',
    subtitle: 'Expected order dates landing inside 14 days',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'proposalsSentLastWeek',
    title: 'Proposals sent last week',
    subtitle: 'What went out since the last meeting',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'proposalsAwaiting',
    title: 'Proposals awaiting a response',
    subtitle: 'Sent, not accepted, not declined, oldest first',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'designSubmissions',
    title: 'Design submissions this week',
    subtitle: 'Drawing sets in or out, either direction',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'budgetsAwaitingReply',
    title: 'Budgets sent, no reply',
    subtitle: 'Budget out, nobody there has written back since',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'wonAndLost',
    title: 'Won and lost since last week',
    subtitle: 'Closed projects with the reason, so the reason gets read out loud',
    ...DEALS,
    defaultOn: true,
  },
  {
    key: 'wentQuiet',
    title: 'Gone quiet',
    subtitle: `Live relationships with no contact in ${QUIET_AFTER_DAYS}+ days`,
    ...INFO,
    defaultOn: false,
  },
  {
    key: 'flagged',
    title: 'Flagged projects',
    subtitle: 'Anything somebody flagged for the room to look at',
    ...DEALS,
    defaultOn: false,
  },

  // ── Cards Mike asked for that need a field the app does not have yet ────────
  // Listed so they are visible and get built, not silently dropped.
  {
    key: 'budgetsDue',
    title: 'Budgets due this week',
    subtitle: 'Budgets we promised by a date that lands this week',
    ...DEALS,
    defaultOn: false,
    needs: 'a "budget promised by" date on the project. The app records when a '
      + 'budget was SENT, but never when it was promised',
  },
  {
    key: 'proposalsDue',
    title: 'Proposals due in the next 2 weeks',
    subtitle: 'Proposals we promised by a date inside 14 days',
    ...DEALS,
    defaultOn: false,
    needs: 'a "proposal promised by" date on the proposal, same gap as budgets',
  },
  {
    key: 'ifcBudgets',
    title: 'IFC / for-award budgets awaiting a response',
    subtitle: 'The ones that are actually about to be bought',
    ...DEALS,
    defaultOn: false,
    needs: 'a phase on the budget itself. A budget\'s phase is not always the '
      + 'phase of the last drawing set that came in',
  },
  {
    key: 'travel',
    title: 'Travel coming up',
    subtitle: 'Who is on the road, and where',
    ...INFO,
    defaultOn: false,
    needs: 'the Microsoft calendar connection. Travel is already detected, but '
      + 'nothing is syncing yet',
  },
  {
    key: 'marketing',
    title: 'Marketing in flight',
    subtitle: 'Presentations and material being built, typed by hand',
    ...INFO,
    defaultOn: false,
    needs: 'somewhere to type it: a meeting notes table',
  },
  {
    key: 'parkingLot',
    title: 'Parking lot',
    subtitle: 'Carried forward until somebody closes it',
    ...INFO,
    defaultOn: false,
    needs: 'somewhere to type it: a meeting notes table',
  },
  {
    key: 'whosOut',
    title: "Who's out this week",
    subtitle: 'PTO and coverage',
    ...INFO,
    defaultOn: false,
    needs: 'somewhere to type it: a meeting notes table',
  },
];

// Stamp the level on every card so the catalog carries it (the layout route
// ships the catalog to the screen, and the screen filters by it).
for (const c of MEETING_CARDS) c.level = cardLevel(c.key);

const BY_KEY = new Map(MEETING_CARDS.map(c => [c.key, c]));

export function getCard(key) {
  return BY_KEY.get(key) || null;
}

/** Card keys that can actually be switched on today. */
export function availableCardKeys() {
  return MEETING_CARDS.filter(c => !c.needs).map(c => c.key);
}

/** The set an admin gets before anyone customizes anything. */
export function defaultLayout() {
  return MEETING_CARDS.filter(c => c.defaultOn && !c.needs).map(c => c.key);
}

/**
 * Clean a requested layout into something safe to save or render.
 *
 * Drops unknown keys (a card removed from the catalog leaves stale rows behind),
 * drops cards that are not buildable yet, and de-duplicates. Order is kept as
 * given, that IS the run-of-show, and the person running the meeting decides it.
 */
export function normalizeLayout(keys) {
  if (!Array.isArray(keys)) return defaultLayout();
  const seen = new Set();
  const out = [];
  for (const raw of keys) {
    const key = typeof raw === 'string' ? raw.trim() : '';
    const card = BY_KEY.get(key);
    if (!card || card.needs || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  // An empty layout is a mistake, not a preference, nobody wants a blank meeting.
  return out.length ? out : defaultLayout();
}
