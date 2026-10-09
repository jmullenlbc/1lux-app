// Sales activity by month or quarter. Pure, no imports, so a test can pin it.
//
// bucketByPeriod(notes, { period: 'month' | 'quarter', months: 12, now })
//   -> [{ key, label, perUser: { [userId]: count }, team: count }]
//
// Each note needs a date (meetingDate, else createdAt) and a person
// (createdById, else createdBy.id). Notes outside the window are ignored.
// Oldest period first, every period present even when empty, so the table
// always has the same rows.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => (n < 10 ? '0' + n : String(n));

function noteDate(n) {
  const raw = n.meetingDate || n.spentOn || n.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}

function noteUser(n) {
  return n.createdById || n.createdBy?.id || n.userId || null;
}

function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function quarterKey(d) { return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`; }

function monthLabel(d) { return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function quarterLabel(d) { return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`; }

// `weight` (0129) sums a number per row instead of counting rows: the Spent
// metric passes expenses with weight = amountCents and reads dollars out.
export function bucketByPeriod(notes, { period = 'month', months = 12, now = new Date(), weight = null } = {}) {
  const ref = new Date(now);
  const byQuarter = period === 'quarter';
  const buckets = [];
  const index = new Map();

  if (byQuarter) {
    // The last N quarters, N = months / 3 (12 months -> 4 quarters), ending
    // with the quarter we are in.
    const count = Math.max(1, Math.round(months / 3));
    const qStartMonth = Math.floor(ref.getMonth() / 3) * 3;
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(ref.getFullYear(), qStartMonth - i * 3, 1);
      const b = { key: quarterKey(d), label: quarterLabel(d), perUser: {}, team: 0 };
      buckets.push(b); index.set(b.key, b);
    }
  } else {
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      const b = { key: monthKey(d), label: monthLabel(d), perUser: {}, team: 0 };
      buckets.push(b); index.set(b.key, b);
    }
  }

  for (const n of notes || []) {
    const d = noteDate(n);
    if (!d) continue;
    const b = index.get(byQuarter ? quarterKey(d) : monthKey(d));
    if (!b) continue;
    const w = weight ? (Number(weight(n)) || 0) : 1;
    b.team += w;
    const u = noteUser(n);
    if (u) b.perUser[u] = (b.perUser[u] || 0) + w;
  }
  return buckets;
}

// Same rows, but from pre-counted monthly totals such as
// /api/crm/contacts/created-by-month: [{ month: 'YYYY-MM', userId, count }].
// A row with no userId (people added before we recorded who added them)
// counts in the team total only.
export function bucketCountsByPeriod(rows, opts = {}) {
  const buckets = bucketByPeriod([], opts);
  const index = new Map(buckets.map(b => [b.key, b]));
  const byQuarter = opts.period === 'quarter';
  for (const r of rows || []) {
    const m = /^(\d{4})-(\d{2})$/.exec(r?.month || '');
    if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    const b = index.get(byQuarter ? quarterKey(d) : monthKey(d));
    if (!b) continue;
    const n = Number(r.count) || 0;
    b.team += n;
    if (r.userId) b.perUser[r.userId] = (b.perUser[r.userId] || 0) + n;
  }
  return buckets;
}
