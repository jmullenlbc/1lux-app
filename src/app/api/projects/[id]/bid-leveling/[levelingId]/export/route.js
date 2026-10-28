import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { guardLeveling } from '@/lib/bidLeveling/guard';
import { loadLevelingView } from '@/lib/bidLeveling/load';
import { leveledSheets, leveledFileName } from '@/lib/bidLeveling/exportSheet';

const MONEY = '$#,##0.00';

// GET /api/projects/[id]/bid-leveling/[levelingId]/export  the leveled sheet as an Excel file
export async function GET(request, { params }) {
  const g = await guardLeveling(params);
  if (g.error) return g.error;
  const view = await loadLevelingView(params.levelingId);
  if (!view) return NextResponse.json({ error: 'We could not find this leveling, so there is nothing to download. It may have been archived. Go back to the project and open it again. (not-found)' }, { status: 404 });
  const today = new Date();
  const tabs = leveledSheets(view, { projectName: g.project.name, today });
  if (!tabs.length) {
    return NextResponse.json({ error: 'There are no bids on this leveling yet, so there is nothing to download. Add a bid first. (no-bids)' }, { status: 400 });
  }

  const wb = XLSX.utils.book_new();
  for (const t of tabs) {
    const ws = XLSX.utils.aoa_to_sheet(t.rows);
    ws['!cols'] = t.cols.map((wch) => ({ wch }));
    if (t.merges) ws['!merges'] = t.merges;
    for (let r = t.moneyFrom ?? Infinity; r < t.rows.length; r++) {
      for (const c of t.moneyCols || []) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === 'n') cell.z = MONEY;
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, t.name.slice(0, 31));
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = leveledFileName(g.project.name, g.leveling.name, today);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
