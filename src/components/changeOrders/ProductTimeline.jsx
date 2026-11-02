'use client';
import { useEffect, useState } from 'react';
import { CARD } from '@/components/ui/tokens';
import { showDate } from '@/lib/rfq/format';

const usd = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS = { DRAFT: 'Draft', SENT: 'Sent', APPROVED: 'Approved' };

/** Each product's running record across the job's change orders. Same row look as RecordHistory. */
export default function ProductTimeline({ projectId }) {
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/change-orders/products`)
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then((d) => setProducts(d.products || []))
      .catch(() => {});
  }, [projectId]);

  const changed = products.filter((p) => p.events.length > 0);
  if (changed.length === 0) return null;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">Product Timeline</h3>
        <p className="text-xs text-slate-500">Every product a change order touched. Only approved change orders move the numbers.</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px] divide-y divide-slate-100">
          {changed.map((p) => (
            <div key={p.key}>
              <button type="button" onClick={() => setOpen(open === p.key ? null : p.key)}
                className="w-full flex items-center gap-3 px-4 py-2 text-left text-xs hover:bg-slate-50">
                <span className="w-24 font-semibold text-slate-800">{p.type}</span>
                <span className="flex-1 text-slate-600">{[p.now.manufacturer, p.now.partNumber].filter(Boolean).join(' ')}</span>
                <span className="w-32 text-slate-600">Qty {p.start?.qty ?? 0} to {p.now.qty}</span>
                <span className="w-28 text-right font-medium text-slate-800">{usd(p.dollars)}</span>
                <span className="w-24 text-right text-slate-500">{p.fees ? `${usd(p.fees)} fees` : ''}</span>
              </button>
              {open === p.key && (
                <ul className="px-4 pb-2 space-y-1">
                  {p.events.map((e, i) => (
                    <li key={`${e.coId}-${i}`} className="flex items-start gap-3 text-xs text-slate-600">
                      <span className="w-24 shrink-0 text-slate-500">{showDate(e.date)}</span>
                      <span className="w-24 shrink-0 font-medium">{e.coNumber}</span>
                      <span className="flex-1">
                        <span className="font-medium text-slate-800">{e.kind}</span>
                        {e.text ? ` ${e.text}` : ''}
                        {e.status !== 'APPROVED' ? ` (${STATUS[e.status] || e.status}, not approved)` : ''}
                      </span>
                      <span className="w-28 shrink-0 text-right">{usd(e.dollars)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
