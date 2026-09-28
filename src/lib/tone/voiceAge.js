/**
 * How much an email counts by its age (Mike 9-27: "My emails from the last
 * year should have much more weight than 5 years ago. I am getting better at
 * how I word things. From the last few months even more.").
 *
 * One table drives three things: which emails a big mailbox keeps when it is
 * read, which emails the bot studies when it learns the voice, and the weights
 * shown on the Voice screen.
 *
 * Pure: no imports. Runs in the browser and on the server.
 */

const DAY = 86_400_000;

// weight: how much one email in this period counts next to one from 2 to 3 years ago.
// keep:   how many a big mailbox keeps from this period when it is read.
export const AGE_BANDS = [
  { key: 'M3',  label: 'Last 3 months',      toDays: 91,       weight: 8,    keep: 300 },
  { key: 'M12', label: '3 to 12 months ago', toDays: 365,      weight: 4,    keep: 300 },
  { key: 'Y2',  label: '1 to 2 years ago',   toDays: 730,      weight: 2,    keep: 200 },
  { key: 'Y3',  label: '2 to 3 years ago',   toDays: 1096,     weight: 1,    keep: 150 },
  { key: 'Y5',  label: '3 to 5 years ago',   toDays: 1827,     weight: 0.5,  keep: 150 },
  { key: 'OLD', label: 'Over 5 years ago',   toDays: Infinity, weight: 0.25, keep: 100 },
];
export const UNDATED = { key: 'NONE', label: 'No date', toDays: null, weight: 1, keep: 50 };
const ALL = [...AGE_BANDS, UNDATED];

/** Most a single mailbox keeps: every period's `keep` added up. */
export const KEEP_PER_MAILBOX = ALL.reduce((n, b) => n + b.keep, 0);

export const ts = v => (v instanceof Date ? v.getTime() : Number(v) || 0);

export function bandOf(when, now = Date.now()) {
  const t = ts(when);
  if (!t) return UNDATED;
  const days = (now - t) / DAY;
  return AGE_BANDS.find(b => days < b.toDays) || AGE_BANDS[AGE_BANDS.length - 1];
}

export const weightOf = (when, now = Date.now()) => bandOf(when, now).weight;

/** Evenly spread picks from a list, so one busy week is not the whole period. */
export function spread(rows, n) {
  if (n <= 0) return [];
  if (rows.length <= n) return rows;
  const step = rows.length / n;
  return Array.from({ length: n }, (_, i) => rows[Math.floor(i * step)]);
}

/** Rows grouped by period, each group newest first. */
export function groupByAge(rows, { now = Date.now(), dateOf = r => r.date } = {}) {
  const groups = new Map(ALL.map(b => [b.key, []]));
  for (const r of rows) groups.get(bandOf(dateOf(r), now).key).push(r);
  for (const list of groups.values()) list.sort((a, b) => ts(dateOf(b)) - ts(dateOf(a)));
  return groups;
}

/**
 * Share `n` slots across the periods in proportion to share(band, count),
 * never more than a period has. What a thin period cannot use goes to the
 * others. Every period with emails gets at least one, so the oldest years
 * still show up when the writing is compared over time.
 */
export function allocate(counts, n, share) {
  const slots = Object.fromEntries(ALL.map(b => [b.key, 0]));
  let left = Math.min(n, ALL.reduce((s, b) => s + (counts[b.key] || 0), 0));
  let open = ALL.filter(b => counts[b.key] > 0);
  while (left > 0 && open.length) {
    const total = open.reduce((s, b) => s + share(b, counts[b.key]), 0) || 1;
    let given = 0;
    for (const b of open) {
      if (given >= left) break;
      const want = Math.max(1, Math.floor((left * share(b, counts[b.key])) / total));
      const g = Math.min(want, counts[b.key] - slots[b.key], left - given);
      slots[b.key] += g; given += g;
    }
    if (!given) break;
    left -= given;
    open = open.filter(b => slots[b.key] < counts[b.key]);
  }
  return slots;
}

/**
 * Reading a big mailbox: keep a spread across every year, tilted to the newest,
 * instead of only the newest few hundred. Returns newest first.
 */
export function keepByAge(emails, { now = Date.now(), max = KEEP_PER_MAILBOX, dateOf = e => e.date } = {}) {
  const groups = groupByAge(emails, { now, dateOf });
  const counts = Object.fromEntries([...groups].map(([k, v]) => [k, v.length]));
  const slots = allocate(counts, max, b => b.keep);
  return ALL.flatMap(b => spread(groups.get(b.key), slots[b.key]))
    .sort((a, b) => ts(dateOf(b)) - ts(dateOf(a)));
}

/**
 * Learning the voice: pick `n` emails to study, each period's share set by
 * (emails in it) x (its weight). Returns { picks, plan }: picks newest first,
 * each with .band; plan is one line per period for the screen.
 */
export function pickWeighted(rows, n, { now = Date.now(), dateOf = r => r.date } = {}) {
  const groups = groupByAge(rows, { now, dateOf });
  const counts = Object.fromEntries([...groups].map(([k, v]) => [k, v.length]));
  const slots = allocate(counts, n, (b, c) => b.weight * c);
  const studied = Object.values(slots).reduce((s, v) => s + v, 0) || 1;
  const picks = ALL.flatMap(b => spread(groups.get(b.key), slots[b.key]).map(r => ({ ...r, band: b.key })));
  const plan = ALL.filter(b => counts[b.key] > 0).map(b => ({
    key: b.key, label: b.label, weight: b.weight, emails: counts[b.key],
    studied: slots[b.key], share: Math.round((slots[b.key] / studied) * 100),
  }));
  return { picks, plan };
}
