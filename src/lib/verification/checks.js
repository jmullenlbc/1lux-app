/**
 * Things Needing a Look — the five checks behind the Main-dashboard card.
 *
 * Mike, 2026-09-09: "do we need to have a verification area for things that are
 * conflicting or need attention in general but it can't be overwhelming. like
 * maybe a few a week at most." Then, 2026-09-10: "1. home screen widget /
 * 2. yes start small / 3. i agree with all of yours."
 *
 * The five he agreed to, in his words:
 *
 *   1. The architect or GC typed on a client's Pipeline tab disagrees with the
 *      Architect/GC company on that job's team.
 *   2. A person with no company.
 *   3. A won or lost job with no close date, or one carrying a date the system
 *      guessed rather than got told.
 *   4. Two people with the same email address.
 *   5. A job with people on it but nobody marked as the main contact.
 *
 * Two rules keep it small, and they are promises, not preferences:
 *   • it only ever looks at open jobs and jobs closed in the last 90 days;
 *   • every item can be buried for good with "That's fine".
 *
 * Everything in this file is a pure function over rows already loaded. No
 * Prisma, no dates read from the clock — `now` is always passed in — so the
 * whole thing is testable without a database. The loading lives in
 * src/app/api/verification/route.js.
 */

import { pipelinesFor } from '../pipeline.js';

/** How far back a closed job stays interesting. Mike's number, not a guess. */
export const SCOPE_DAYS = 90;

/** The most new items anyone is shown in a single week. */
export const WEEKLY_NEW_LIMIT = 5;

/** The most items on the card at once, however long they have been sitting. */
export const VISIBLE_LIMIT = 5;

/** Statuses that mean the sale was decided, one way or the other. */
const DECIDED = ['WON', 'LOST', 'ABANDONED'];

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Company-name comparison ──────────────────────────────────────────────────
// The Pipeline tab holds whatever was typed into a spreadsheet — "DLR Group,
// Inc." — while the team seat holds a real company row — "DLR Group". Comparing
// those two strings raw would flag every single job, which is the fastest way to
// make a card like this worthless. So both sides are reduced to their bones
// first: lower case, no punctuation, no legal suffix, no trade word.
const NOISE_WORDS = new Set([
  'inc', 'llc', 'llp', 'lp', 'ltd', 'plc', 'co', 'corp', 'corporation',
  'company', 'group', 'the', 'and', 'of', 'a',
  'architect', 'architects', 'architecture', 'architectural',
  'construction', 'constructors', 'contracting', 'contractors', 'contractor',
  'builder', 'builders', 'building', 'development', 'developments',
  'design', 'designs', 'studio', 'studios', 'partners', 'associates',
]);

/** "DLR Group, Inc." → "dlr" */
export function normalizeCompany(raw) {
  if (!raw) return '';
  const words = String(raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w && !NOISE_WORDS.has(w));
  // If stripping the noise leaves nothing, the name WAS all noise ("The Design
  // Group"). Fall back to the plain squashed string rather than matching every
  // other all-noise name.
  if (!words.length) {
    return String(raw).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
  return words.join(' ');
}

/**
 * Do these two company names plausibly mean the same company?
 * Deliberately generous — a false "these disagree" costs Mike a look at a job
 * that was fine, and five of those in a row is how a card gets ignored.
 */
export function companiesAgree(a, b) {
  const x = normalizeCompany(a);
  const y = normalizeCompany(b);
  if (!x || !y) return true;              // nothing to disagree with
  if (x === y) return true;
  const xs = x.replace(/ /g, '');
  const ys = y.replace(/ /g, '');
  return xs.includes(ys) || ys.includes(xs);
}

// ── Scope ────────────────────────────────────────────────────────────────────

function isOpen(project) {
  return pipelinesFor(project).some(p =>
    (p === 'DESIGN' ? project.designStatus : project.procurementStatus) === 'OPEN');
}

/** The status each of this project's real boards is sitting on. */
export function boardStatuses(project) {
  return pipelinesFor(project).map(pipeline => ({
    pipeline,
    status: pipeline === 'DESIGN' ? project.designStatus : project.procurementStatus,
  }));
}

/**
 * Open jobs, plus jobs closed in the last 90 days. A closed job with no status
 * history at all falls back to when the record was last touched — otherwise a
 * job whose missing close date is the very problem we are looking for would be
 * ruled out of scope by the missing close date.
 */
export function inScope(project, eventsByProject, now) {
  if (isOpen(project)) return true;
  const cutoff = now.getTime() - SCOPE_DAYS * DAY_MS;
  const events = eventsByProject.get(project.id) || [];
  const closes = events.filter(e => e.toStatus !== 'OPEN');
  if (!closes.length) return new Date(project.updatedAt).getTime() >= cutoff;
  const newest = Math.max(...closes.map(e => new Date(e.changedAt).getTime()));
  return newest >= cutoff;
}

// ── The five checks ──────────────────────────────────────────────────────────
// Each returns [{ key, kind, title, detail, href, hrefLabel }]. `key` is stable
// for the life of the problem: same problem on the same record, same key, so
// "That's fine" buries it once and for all.

/**
 * 1. The architect or GC typed on a client's Pipeline tab disagrees with the
 *    Architect/GC company on that job's team.
 *
 * Mike has never been told these are two different fields, which is the whole
 * point of the check. The Pipeline tab is free text pasted out of a spreadsheet;
 * the team seat is a real company record. Nothing has ever made them agree.
 *
 * PipelineProject has no link to Project — there is no foreign key between them
 * — so a row is matched to a job the only way available: same client, same name.
 */
export function checkTeamMismatch(ctx) {
  const { projects, pipelineRows } = ctx;
  const byClientName = new Map();
  for (const p of projects) {
    if (!p.clientId || !p.name) continue;
    byClientName.set(`${p.clientId}::${p.name.trim().toLowerCase()}`, p);
  }

  const out = [];
  for (const row of pipelineRows) {
    if (row.dismissed) continue;
    const project = byClientName.get(`${row.clientId}::${(row.name || '').trim().toLowerCase()}`);
    if (!project) continue;

    const seats = [
      { field: 'architect', label: 'Architect', typed: row.architect, seat: project.architect },
      { field: 'gc',        label: 'GC',        typed: row.gc,        seat: project.generalContractor },
    ];
    for (const s of seats) {
      // Only a real disagreement counts. A blank on either side is a gap, not a
      // conflict, and gaps are a different card on a different day.
      if (!s.typed || !s.seat?.name) continue;
      if (companiesAgree(s.typed, s.seat.name)) continue;
      out.push({
        key:       `team_mismatch:${project.id}:${s.field}`,
        kind:      'TEAM_MISMATCH',
        title:     `${project.name}: two different ${s.label}s`,
        detail:    `The Pipeline tab says “${s.typed}”. The project team says “${s.seat.name}”. One of them is out of date.`,
        href:      `/project/${project.id}`,
        hrefLabel: 'Open the project',
      });
    }
  }
  return out;
}

/**
 * 2. A person with no company. Mike asked for this flag on the person's own
 *    record; this surfaces the same thing where he will actually see it.
 *
 * Scoped to people who are on one of the jobs in scope, or who were added in the
 * last 90 days — an address book of old contacts is not something to chase.
 */
export function checkPersonNoCompany(ctx) {
  const { contacts, scopedProjectIds, now } = ctx;
  const cutoff = now.getTime() - SCOPE_DAYS * DAY_MS;
  const out = [];
  for (const c of contacts) {
    if (c.clientId) continue;
    const onLiveJob = (c.projectLinks || []).some(l => scopedProjectIds.has(l.projectId));
    const isNew     = new Date(c.createdAt).getTime() >= cutoff;
    if (!onLiveJob && !isNew) continue;
    out.push({
      key:       `person_no_company:${c.id}`,
      kind:      'PERSON_NO_COMPANY',
      title:     `${c.name} is not attached to a company`,
      detail:    c.company
        ? `“${c.company}” is typed on their record but it was never linked to a company we have, so nothing about them rolls up.`
        : 'Nothing they do counts towards any company until one is picked.',
      href:      `/crm/contacts?q=${encodeURIComponent(c.name || '')}&missing=company`,
      hrefLabel: 'Open the people list',
    });
  }
  return out;
}

/**
 * 3. A won or lost job with no close date, or one carrying a date the system
 *    guessed rather than got told.
 *
 * The guessed ones are the 0069 backfill: when the status history was invented
 * from `updatedAt`, every row was stamped `approximated` precisely so a guess
 * would never be mistaken for a fact later. This is that later.
 */
export function checkCloseDate(ctx) {
  const { scopedProjects, eventsByProject } = ctx;
  const out = [];
  for (const project of scopedProjects) {
    const events = eventsByProject.get(project.id) || [];
    for (const { pipeline, status } of boardStatuses(project)) {
      if (!DECIDED.includes(status)) continue;
      const closes = events
        .filter(e => e.pipeline === pipeline && e.toStatus === status)
        .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
      const board = pipeline === 'DESIGN' ? 'Design' : 'Procurement';
      const word  = status === 'WON' ? 'won' : status === 'LOST' ? 'lost' : 'abandoned';

      if (!closes.length) {
        out.push({
          key:       `close_date_missing:${project.id}:${pipeline}`,
          kind:      'CLOSE_DATE_MISSING',
          title:     `${project.name}: ${board} was ${word}, but no date`,
          detail:    'Nothing records when this closed, so it counts nowhere on any month or sales-cycle number.',
          href:      `/project/${project.id}`,
          hrefLabel: 'Open the project',
        });
      } else if (closes[0].approximated) {
        out.push({
          key:       `close_date_guessed:${project.id}:${pipeline}`,
          kind:      'CLOSE_DATE_GUESSED',
          title:     `${project.name}: the ${board} close date is a guess`,
          detail:    `Nobody told the system when this was ${word}, so it used the day the record was last touched — ${fmtDay(closes[0].changedAt)}. If that is wrong, every month it lands in is wrong too.`,
          href:      `/project/${project.id}`,
          hrefLabel: 'Open the project',
        });
      }
    }
  }
  return out;
}

/**
 * 4. Two people with the same email address. The people-table merge deliberately
 *    left the ambiguous pairs alone rather than guessing which one to keep — so
 *    the ones that are left are the ones that need a human.
 *
 * Not scoped to live jobs: a duplicated person is wrong everywhere, it is rare
 * by nature, and merging the wrong two people is unrecoverable, so these should
 * be looked at whenever they exist.
 */
export function checkDuplicateEmail(ctx) {
  const { contacts } = ctx;
  const byEmail = new Map();
  for (const c of contacts) {
    const email = (c.email || '').trim().toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(c);
  }
  const out = [];
  for (const [email, people] of byEmail) {
    if (people.length < 2) continue;
    const names = people.map(p => p.name).join(', ');
    out.push({
      key:       `duplicate_email:${email}`,
      kind:      'DUPLICATE_EMAIL',
      title:     `${people.length} people share ${email}`,
      detail:    `${names}. Whatever comes in on that address only ever lands on one of them.`,
      href:      `/crm/contacts?q=${encodeURIComponent(email)}`,
      hrefLabel: 'See both people',
    });
  }
  return out;
}

/**
 * 5. A job with people on it but nobody marked as the main contact. The job's
 *    win or loss counts on the main contact's record, so a blank one means the
 *    job counts for nobody.
 */
export function checkNoLead(ctx) {
  const { scopedProjects } = ctx;
  const out = [];
  for (const project of scopedProjects) {
    const people = project.contactLinks || [];
    if (!people.length) continue;                 // no people is not this problem
    if (people.some(pc => pc.isLead)) continue;
    out.push({
      key:       `no_lead:${project.id}`,
      kind:      'NO_LEAD',
      title:     `${project.name} has no main contact`,
      detail:    `${people.length} ${people.length === 1 ? 'person is' : 'people are'} on this job and none of them is marked as the main one, so whether it is won or lost counts towards nobody.`,
      href:      `/project/${project.id}`,
      hrefLabel: 'Open the project',
    });
  }
  return out;
}

// ── Putting it together ──────────────────────────────────────────────────────

/** Every live problem, in the order they should be looked at. */
export function runChecks(data) {
  const now = data.now || new Date();
  const eventsByProject = new Map();
  for (const e of data.statusEvents || []) {
    if (!eventsByProject.has(e.projectId)) eventsByProject.set(e.projectId, []);
    eventsByProject.get(e.projectId).push(e);
  }
  const projects       = data.projects || [];
  const scopedProjects = projects.filter(p => inScope(p, eventsByProject, now));
  const ctx = {
    now,
    projects,
    scopedProjects,
    scopedProjectIds: new Set(scopedProjects.map(p => p.id)),
    eventsByProject,
    pipelineRows: (data.pipelineRows || []),
    contacts:     (data.contacts || []),
  };

  // Order matters: this is the order they queue up in, so the ones that quietly
  // break a number come before the ones that are merely untidy.
  return [
    ...checkTeamMismatch(ctx),
    ...checkCloseDate(ctx),
    ...checkNoLead(ctx),
    ...checkDuplicateEmail(ctx),
    ...checkPersonNoCompany(ctx),
  ];
}

/**
 * Decide what actually goes on the card.
 *
 * Two ceilings, both of them promises made to Mike:
 *   • never more than five on screen at once;
 *   • never more than five NEW ones in a week.
 *
 * `shown` is every item ever put in front of somebody, with the day it first
 * was. `dismissed` is every item somebody buried. Anything already shown and
 * still not fixed stays on the card — it does not get re-charged to this week's
 * five — and anything fresh only joins if this week has room.
 *
 * Returns { items, fresh, remainingThisWeek, totalOpen }, where `fresh` is the
 * keys the caller must record as SHOWN.
 */
export function selectItems(items, { shown = new Map(), dismissed = new Set(), now = new Date() } = {}) {
  const live = items.filter(i => !dismissed.has(i.key));

  const alreadyShown = live
    .filter(i => shown.has(i.key))
    .sort((a, b) => new Date(shown.get(a.key)) - new Date(shown.get(b.key)))
    .slice(0, VISIBLE_LIMIT);

  const weekStart = startOfWeek(now);
  let newThisWeek = 0;
  for (const at of shown.values()) {
    if (new Date(at).getTime() >= weekStart.getTime()) newThisWeek += 1;
  }

  const room = Math.max(0, Math.min(
    VISIBLE_LIMIT - alreadyShown.length,
    WEEKLY_NEW_LIMIT - newThisWeek,
  ));
  const fresh = spreadKinds(live.filter(i => !shown.has(i.key))).slice(0, room);

  return {
    items:             [...alreadyShown, ...fresh],
    fresh:             fresh.map(i => i.key),
    remainingThisWeek: Math.max(0, WEEKLY_NEW_LIMIT - newThisWeek - fresh.length),
    totalOpen:         live.length,
  };
}

/**
 * Deal one item from each kind in turn, then go round again.
 *
 * Without this, a single check that fires twenty times fills all five slots and
 * the other four checks are invisible for weeks. Found on the real data: five
 * jobs missing a close date took the whole card. Order within a kind is left
 * exactly as the checks produced it.
 */
function spreadKinds(items) {
  const queues = new Map();
  for (const i of items) {
    if (!queues.has(i.kind)) queues.set(i.kind, []);
    queues.get(i.kind).push(i);
  }
  const out = [];
  const lists = [...queues.values()];
  for (let round = 0; out.length < items.length; round += 1) {
    for (const list of lists) {
      if (round < list.length) out.push(list[round]);
    }
  }
  return out;
}

/** Monday 00:00 local, because a sales week starts on a Monday. */
export function startOfWeek(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7;           // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return d;
}

function fmtDay(value) {
  try {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return 'an unknown day'; }
}
