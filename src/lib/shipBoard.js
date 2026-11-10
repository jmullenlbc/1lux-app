// The cross job Ship Schedules screen (Mike 10-31): one row per manufacturer on
// a job, soonest ship date first. Reads the same rows as the job's Ship Schedule
// tab and adds nothing of its own.
//
// No `@/` imports so the tests can load this file directly.
import { deriveShipmentStatus, enrichLineItem } from './shipScheduleHelpers.js';
import { esdWarning, STATUS_META } from './shipmentStatus.js';

const LINE_DONE = ['DELIVERED', 'RELEASED', 'REMOVED'];

const EXTRA_STATUS = {
  AT_WAREHOUSE:        { label: 'At Warehouse',        color: 'bg-purple-100 text-purple-700' },
  PARTIALLY_DELIVERED: { label: 'Partially Delivered', color: 'bg-orange-100 text-orange-700' },
};

export function shipStatusMeta(status) {
  return STATUS_META[status] || EXTRA_STATUS[status] || STATUS_META.PO_PLACED;
}

export const SHIP_BOARD_SELECT = {
  id: true, manufacturer: true, esdDate: true, deliveredDate: true, status: true,
  lineItems: {
    select: {
      id: true, isRemoved: true, qty: true, esdDate: true, fixtureStatus: true,
      deliveryEvents: { select: { qtyReceived: true } },
      releases:       { select: { status: true, qtyReleased: true, qty: true } },
    },
  },
};

// A line is open until it has all landed, or someone marked it finished.
function isOpen(line) {
  return line.qtyBackordered > 0 && !LINE_DONE.includes(line.fixtureStatus);
}

function firstDate(dates) {
  const times = dates.filter(Boolean).map(d => new Date(d).getTime());
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

/** `projects` carry `shipments` (SHIP_BOARD_SELECT) and `assignees` (this person's PM rows). */
export function shipBoardRows(projects) {
  const rows = [];
  for (const p of projects || []) {
    for (const s of p.shipments || []) {
      const lines  = (s.lineItems || []).filter(l => !l.isRemoved).map(enrichLineItem);
      const open   = lines.filter(isOpen);
      const status = deriveShipmentStatus({ ...s, lineItems: lines });
      const done   = status === 'DELIVERED' || !!s.deliveredDate || (lines.length > 0 && !open.length);
      // A line's own date wins, the manufacturer's date covers the rest.
      const nextShip = done ? null : firstDate(open.length ? open.map(l => l.esdDate || s.esdDate) : [s.esdDate]);
      rows.push({
        id: s.id,
        projectId: p.id,
        jobName: p.name,
        businessUnitId: p.businessUnitId ?? null,
        mine: (p.assignees || []).length > 0,
        manufacturer: s.manufacturer,
        status: done ? 'DELIVERED' : status,
        done,
        nextShip,
        lines: lines.length,
        openLines: open.length,
        warning: esdWarning({ esdDate: nextShip, status: done ? 'DELIVERED' : status }),
      });
    }
  }
  // Soonest first, then no date yet, then finished.
  const rank = r => (r.done ? 2 : r.nextShip ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b)
    || String(a.nextShip || '').localeCompare(String(b.nextShip || ''))
    || a.jobName.localeCompare(b.jobName)
    || a.manufacturer.localeCompare(b.manufacturer));
}
