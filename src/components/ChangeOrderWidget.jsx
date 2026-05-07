'use client';
import { useMemo } from 'react';

function parseTags(raw) {
  if (!raw) return [];
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
}

export default function ChangeOrderWidget({ files }) {
  const { total, parsed, total: _, coFiles } = useMemo(() => {
    const coFiles = files.filter(f => parseTags(f.tags).includes('Change Order'));
    const parsed  = coFiles.filter(f => f.parsedAmount != null);
    const total   = parsed.reduce((sum, f) => sum + f.parsedAmount, 0);
    return { coFiles, parsed, total };
  }, [files]);

  if (coFiles.length === 0) return null;

  const displayTotal = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(total);

  const allParsed  = parsed.length === coFiles.length;
  const noneParsed = parsed.length === 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 mb-6">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Change Order Total
        </p>
        {!allParsed && (
          <span className="text-[10px] text-amber-500 font-medium">
            {parsed.length} of {coFiles.length} parsed
          </span>
        )}
        {allParsed && coFiles.length > 0 && (
          <span className="text-[10px] text-slate-300 font-medium">
            {coFiles.length} change order{coFiles.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {noneParsed ? (
        <p className="text-sm text-slate-300 italic">
          Upload change order PDFs to calculate total
        </p>
      ) : (
        <p className="text-base font-semibold text-slate-800">{displayTotal}</p>
      )}
    </div>
  );
}
