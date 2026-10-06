/**
 * Bundle desk steps by person (Mike and Maram, 10-5): "Tasks for the same
 * person due within a rolling week merge into one, with an alert."
 *
 * Pure: no imports, safe in the browser and in tests. Callers pass the items
 * of one desk group (Overdue, Today, This week, Later). Snoozed and Paused
 * items never come here.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Same rule as deskDue in ./desk.js: snooze end, else reminder, else due date. */
function dueOf(a, now) {
  if (a.snoozedUntil && new Date(a.snoozedUntil) > now) return new Date(a.snoozedUntil);
  const d = a.remindAt || a.dueDate;
  if (!d) return null;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
}

/**
 * Returns bundles in the order their first item appears:
 * [{ key, contactId, who, items, alert }]
 * Two or more steps for one contact whose dates all sit inside a rolling
 * window (default 7 days from the earliest dated step), or that have no date,
 * form one bundle with alert true. Every row is kept; nothing is dropped.
 * Steps with no contactId are each their own bundle.
 */
export function groupStepsByPerson(items, { now = new Date(), windowDays = 7 } = {}) {
  const span = windowDays * DAY;
  // Soonest first, undated last, so each bundle's first dated step is its earliest.
  const t = a => dueOf(a, now)?.getTime() ?? Infinity;
  const sorted = [...(items || [])].sort((x, y) => t(x) - t(y));
  const out = [];
  const open = new Map(); // contactId -> bundle still accepting items

  for (const a of sorted) {
    const cid = a.contactId || null;
    if (!cid) {
      out.push({ key: `solo:${a.id}`, contactId: null, who: a.who || a.contactName || '', items: [a], alert: false });
      continue;
    }
    const due = dueOf(a, now);
    const b = open.get(cid);
    if (b && (due === null || b.start === null || due.getTime() - b.start.getTime() <= span)) {
      b.items.push(a);
      continue;
    }
    const next = { key: `${cid}:${a.id}`, contactId: cid, who: a.who || a.contactName || '', items: [a], alert: false, start: due };
    out.push(next);
    open.set(cid, next);
  }

  return out.map(({ start, ...b }) => ({ ...b, alert: b.items.length > 1 }));
}
