'use client';
import { useMemo } from 'react';

function parseTags(raw) {
  if (!raw) return [];
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
}

function formatDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

function Widget({ label, children, aside }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        {aside}
      </div>
      {children}
    </div>
  );
}

function DateWidget({ label, date }) {
  const display = formatDate(date);
  return (
    <Widget label={label}>
      {display
        ? <p className="text-base font-semibold text-slate-800">{display}</p>
        : <p className="text-sm text-slate-300 italic">Upload construction schedule PDF</p>
      }
    </Widget>
  );
}

export default function CAScheduleWidgets({ files }) {
  const { coTotal, coParsed, coFiles, rfiCount } = useMemo(() => {
    const tags  = f => parseTags(f.tags);
    const coFiles  = files.filter(f => tags(f).includes('Change Order'));
    const coParsed = coFiles.filter(f => f.parsedAmount != null);
    const coTotal  = coParsed.reduce((s, f) => s + f.parsedAmount, 0);
    const rfiCount = files.filter(f => tags(f).includes('RFI')).length;
    return { coTotal, coParsed, coFiles, rfiCount };
  }, [files]);

  const allCOParsed  = coParsed.length === coFiles.length;
  const noCOParsed   = coParsed.length === 0;

  const coDisplay = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(coTotal);

  return (
    <div className="space-y-3 mb-6">
      {/* Row 1: Change Order Total + RFIs */}
      <div className="grid grid-cols-2 gap-3">
        <Widget
          label="Change Order Total"
          aside={
            coFiles.length > 0 && !allCOParsed ? (
              <span className="text-[10px] text-amber-500 font-medium">
                {coParsed.length} of {coFiles.length} parsed
              </span>
            ) : coFiles.length > 0 ? (
              <span className="text-[10px] text-slate-300 font-medium">
                {coFiles.length} change order{coFiles.length !== 1 ? 's' : ''}
              </span>
            ) : null
          }
        >
          {noCOParsed || coFiles.length === 0
            ? <p className="text-sm text-slate-300 italic">Upload change order PDFs to calculate total</p>
            : <p className="text-base font-semibold text-slate-800">{coDisplay}</p>
          }
        </Widget>

        <Widget label="RFIs">
          {rfiCount > 0
            ? <p className="text-base font-semibold text-slate-800">
                {rfiCount} <span className="text-sm font-normal text-slate-500">filed</span>
              </p>
            : <p className="text-sm text-slate-300 italic">No RFIs uploaded</p>
          }
        </Widget>
      </div>

    </div>
  );
}
