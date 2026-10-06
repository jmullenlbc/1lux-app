/**
 * Proposals list filters (Mike 10-5). Pure, no app imports, so the test can
 * load it straight from disk.
 *
 * Status words on that screen: an accepted proposal is a WON design fee and a
 * declined one is LOST. The stored keys stay ACCEPTED / DECLINED.
 */
export const STATUS_LABELS = {
  DRAFT:    'Draft',
  SENT:     'Sent',
  ACCEPTED: 'Won',
  DECLINED: 'Lost',
  EXPIRED:  'Expired',   // retired 2026-09-18, old rows still read it
};

/** The time picker. `days` null means all time; 'year' means since Jan 1. */
export const TIME_WINDOWS = [
  { key: '30',   label: 'Last 30 days', days: 30 },
  { key: '60',   label: 'Last 60 days', days: 60 },
  { key: '90',   label: 'Last 90 days', days: 90 },
  { key: 'year', label: 'This year',    days: 'year' },
  { key: 'all',  label: 'All time',     days: null },
];
export const DEFAULT_TIME_WINDOW = '60';

const DAY = 86_400_000;

/** The date a proposal is measured by: when it was sent, else when it was made. */
export function proposalDate(p) {
  const raw = p?.sentAt || p?.createdAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Is this proposal inside the window? `days` is a number of days back from
 * `now`, 'year' for since January 1 of now's year, or null for everything.
 * A proposal with no usable date only shows under all time.
 */
export function withinWindow(p, days, now = new Date()) {
  if (days == null) return true;
  const t = proposalDate(p);
  if (t == null) return false;
  const nowT = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (days === 'year') {
    const d = new Date(nowT);
    return t >= new Date(d.getFullYear(), 0, 1).getTime() && t <= nowT;
  }
  return t >= nowT - Number(days) * DAY && t <= nowT;
}

/** The client name a proposal row carries, from the project first. */
export function proposalClientName(p) {
  return p?.project?.client?.name || p?.clientName || '';
}

/** Distinct client names across the loaded rows, alphabetical. */
export function distinctClients(proposals) {
  const names = new Set();
  for (const p of proposals || []) {
    const n = proposalClientName(p).trim();
    if (n) names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
