'use client';
import { formatCurrency } from '@/lib/calculations';

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BudgetLineItemWidget({ files = [] }) {
  // Find the most recently uploaded budget PDF that has parsed line items
  const budgetFilesWithItems = files
    .filter(f => {
      if (!f.takeoffData) return false;
      try {
        const d = JSON.parse(f.takeoffData);
        return Array.isArray(d.lineItems) && d.lineItems.length > 0;
      } catch { return false; }
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const latestFile = budgetFilesWithItems[0];

  if (!latestFile) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h7.5c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m-7.5 0h7.5" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Top 10 Line Items: CN Price</h3>
            <p className="text-xs text-slate-400 mt-0.5">Extracted from latest uploaded budget PDF</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6 text-center">
          <p className="text-sm text-slate-400 mb-1">No budget PDF with parseable line items found.</p>
          <p className="text-xs text-slate-300">
            Upload a budget PDF below and the top line items will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  let lineItems = [];
  try {
    lineItems = JSON.parse(latestFile.takeoffData).lineItems || [];
  } catch {}

  const top10 = lineItems.slice(0, 10);
  const grandTotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
  const top10Total = top10.reduce((sum, item) => sum + (item.total || 0), 0);

  const tags = latestFile.tags ? JSON.parse(latestFile.tags) : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      {/* Phones: the total drops under the title when the row is too narrow (Mike 10-29) */}
      <div className="flex flex-wrap gap-y-3 items-start justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h7.5c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m-7.5 0h7.5" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Top 10 Line Items: CN Price</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-slate-400 truncate max-w-xs">{latestFile.originalName}</p>
              {tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">{t}</span>
              ))}
              <span className="text-[10px] text-slate-300">{formatDate(latestFile.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0 ml-4">
          <div className="text-xs text-slate-400">Top 10 Total</div>
          <div className="text-base font-bold text-slate-900 tabular-nums">{formatCurrency(top10Total)}</div>
          {lineItems.length > 10 && (
            <div className="text-[10px] text-slate-300 mt-0.5">{lineItems.length} items parsed total</div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14">Type</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Description</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Manufacturer</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Part #</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-14">Qty</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Unit Price</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total CN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {top10.map((item, i) => {
              const pct = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0;
              return (
                <tr key={i} className={i === 0 ? 'bg-amber-50/40' : 'hover:bg-slate-50 transition-colors'}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                      {item.type || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-800 leading-snug">{item.description || '—'}</div>
                    {/* Mini bar showing share of total */}
                    <div className="mt-1 h-1 bg-slate-100 rounded-full w-24">
                      <div
                        className="h-1 bg-amber-400 rounded-full transition-all"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{item.manufacturer || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">{item.partNo || '—'}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700 tabular-nums">{item.qty}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(item.total)}</span>
                    <div className="text-[10px] text-slate-300 tabular-nums">{pct.toFixed(1)}%</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Extracted from PDF text, best effort. Accuracy depends on PDF structure. Manufacturer and Part # columns require the PDF to use a structured table format.
          Once native budgets are built in-system, this will populate automatically and precisely.
        </p>
      </div>
    </div>
  );
}
