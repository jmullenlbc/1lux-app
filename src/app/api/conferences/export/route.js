import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireAuth, isClientViewer } from '@/lib/auth';
import { loadConferencePlan } from '@/lib/conferences/server';
import { settingRowsFrom } from '@/lib/conferences/engine';

export const dynamic = 'force-dynamic';

// GET /api/conferences/export: the plan as a workbook with the same four tabs
// as the research file (Ranked, Budget, Conferences, Assumptions).
const dates = (r) => (r.start ? (r.end && r.end !== r.start ? `${r.start} to ${r.end}` : r.start) : 'TBD');
const place = (r) => [r.city, r.state].filter(Boolean).join(', ');

function rankedSheet(rows) {
  return rows.filter(r => r.tier !== 'X').map(r => ({
    Rank: r.rank, Tier: r.tier, Include: r.include ? 'Yes' : 'No', Event: r.name, Vertical: r.verticalLabel,
    Dates: dates(r), Location: place(r), Score: r.score, 'Per person': r.perPerson, Headcount: r.headcount,
    Planned: r.plannedCost, Status: r.statusLabel, Clash: r.clash ? 'Yes' : '',
  }));
}

function budgetSheet(result) {
  const rows = [['Scenario', 'Events', 'Trips', 'Subtotal', 'Contingency', 'Total']];
  for (const [label, key] of [['Lean', 'lean'], ['Core', 'core'], ['Full', 'full'], ['Current plan', 'current']]) {
    const s = result.scenarios[key];
    rows.push([label, s.events, s.attendeeTrips, s.subtotal, s.contingency, s.total]);
  }
  rows.push([], ['Membership', 'Include', 'Dues', 'Counted', 'Events unlocked']);
  for (const m of result.memberships) rows.push([m.orgName, m.include, m.annualDues, m.duesCounted, m.unlockedCount]);
  rows.push([], ['Dues counted', result.dues], ['Grand total', result.grandTotal], ['Budget cap', result.budgetCap ?? ''], ['Against cap', result.vsCap ?? '']);
  for (const [label, list] of [['Quarter', result.byQuarter], ['Vertical', result.byVertical], ['Region', result.byRegion]]) {
    rows.push([], [label, 'Events', 'Planned']);
    for (const b of list) rows.push([b.key, b.events, b.planned]);
  }
  return rows;
}

function conferencesSheet(rows) {
  return rows.map(r => ({
    Event: r.name, Organizer: r.organizer, Vertical: r.verticalLabel, Focus: r.tagLabels.join(', '), Format: r.format,
    Access: r.access, Dates: dates(r), 'Date status': r.dateStatus, Location: place(r), Region: r.regionLabel, Scope: r.scopeLabel,
    Attendance: r.attendance, Registration: r.reg, 'Price status': r.priceLabel, Airfare: r.airfare, 'Hotel nights': r.hotelNights,
    'Hotel rate': r.hotelRate, Days: r.days, 'Per person': r.perPerson,
  }));
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (isClientViewer(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const data = await loadConferencePlan();
  if (!data.loaded) return NextResponse.json({ error: 'The conference list is not loaded yet. An admin loads it on the Conference Load page.' }, { status: 404 });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rankedSheet(data.rows)), 'Ranked');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(budgetSheet(data.result)), 'Budget');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conferencesSheet(data.rows)), 'Conferences');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settingRowsFrom(data.settings).map(r => ({ Rule: r.key, Value: r.value }))), 'Assumptions');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Conference Plan ${data.plan.year}.xlsx"`,
    },
  });
}
