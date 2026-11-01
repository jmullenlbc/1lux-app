'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CARD, MODAL, BTN_PRIMARY, BTN_SECONDARY, BTN_COMPACT, BTN_COMPACT_PRIMARY, LABEL, HELPER, TH } from '@/components/ui/tokens';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// A date with no time, stored at midnight UTC. Without this a US screen shows the day before.
function fmtDay(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtCurrency(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `−$${str}` : `$${str}`;
}

function fmtSize(b) {
  if (!b) return '';
  if (b > 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

function daysUntil(d) {
  if (!d) return null;
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const tgt = new Date(d); tgt.setHours(12, 0, 0, 0);
  return Math.round((tgt - now) / 86400000);
}

function StatusPill({ status }) {
  const map = {
    NOT_ORDERED:         ['bg-slate-100 text-slate-400',  'Not ordered'],
    PO_PLACED:           ['bg-slate-100 text-slate-600',  'On order'],
    LEAD_TIME_CONFIRMED: ['bg-slate-100 text-slate-700',  'Lead time set'],
    ESD_CONFIRMED:       ['bg-slate-100 text-slate-700',  'ESD confirmed'],
    SHIPPED:             ['bg-amber-50 text-amber-700',   'Shipped'],
    IN_TRANSIT:          ['bg-amber-50 text-amber-700',   'In transit'],
    AT_WAREHOUSE:        ['bg-orange-50 text-orange-700', 'In warehouse'],
    PARTIALLY_RELEASED:  ['bg-orange-50 text-orange-700', 'In warehouse'],
    RELEASED:            ['bg-green-100 text-green-700',  'Released to site'],
    DELIVERED:           ['bg-green-100 text-green-700',  'Released to site'],
    UNDER_REVIEW:        ['bg-slate-100 text-slate-700',  'Under review'],
    REMOVED:             ['bg-slate-100 text-slate-400',  'Removed'],
  };
  const [cls, label] = map[status] || ['bg-slate-100 text-slate-500', status || '—'];
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

// ── Release modal ─────────────────────────────────────────────────────────────

function ReleaseModal({ shipment, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${MODAL} w-full max-w-sm p-6`}>
        <h3 className="text-base font-bold text-slate-800 mb-2">Confirm Release</h3>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Release <strong className="text-slate-700">{shipment.manufacturer}</strong> fixtures from
          ILC warehouse to job site? This notifies ILC to arrange delivery.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className={BTN_SECONDARY}>
            Cancel
          </button>
          <button onClick={onConfirm} className={BTN_PRIMARY}>
            Confirm Release
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ship Schedule ─────────────────────────────────────────────────────────────

function ShipScheduleView({ projectId }) {
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState({}); // lineItemId → qty
  const [showRelModal,  setShowRelModal]  = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [relError,      setRelError]      = useState('');

  const load = () => {
    fetch(`/api/portal/projects/${projectId}/shipments`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [projectId]);

  if (loading) return <Spinner />;
  if (!data?.shipments?.length) return <Empty text="The Ship Schedule has not been published yet." />;

  const { shipments, stats } = data;

  // Flat list of all line items with enriched qty fields
  const allLineItems = shipments.flatMap(s =>
    (s.lineItems || []).map(li => ({
      ...li,
      manufacturer:  s.manufacturer,
      esdDate:       li.esdDate || s.esdDate,
      trackingNumber: s.trackingNumber,
    }))
  ).filter(li => !li.isRemoved)
   .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.fixtureType.localeCompare(b.fixtureType));

  const selectedCount = Object.keys(selected).filter(id => (selected[id] || 0) > 0).length;

  function toggleSelect(li) {
    if ((li.qtyAtWarehouse || 0) <= 0) return;
    setSelected(prev => {
      const next = { ...prev };
      if (next[li.id]) { delete next[li.id]; } else { next[li.id] = li.qtyAtWarehouse; }
      return next;
    });
  }

  async function submitRequest() {
    setSubmitting(true);
    setRelError('');
    const items = Object.entries(selected)
      .filter(([, qty]) => qty > 0)
      .map(([lineItemId, qtyRequested]) => ({ lineItemId, qtyRequested: parseInt(qtyRequested) }));
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/release-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
      if (res.ok) {
        setSubmitted(true);
        setSelected({});
        setShowRelModal(false);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setRelError(d.error || `The request did not go through on our side. Nothing was requested. Try again or call your rep. (Code ${res.status})`);
      }
    } catch {
      setRelError('We could not reach ILC Studios. Nothing was requested. Check your connection and try again.');
    } finally { setSubmitting(false); }
  }

  return (
    <>
      {data.publishedAt && <p className={`${HELPER} mb-3`}>Published {fmtDate(data.publishedAt)}</p>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Delivered to site', val: stats.toSite },
          { label: 'In warehouse',      val: stats.inWarehouse },
          { label: 'In transit',        val: stats.inTransit },
          { label: 'On order',          val: stats.onOrder },
        ].map(s => (
          <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className={`${LABEL} mb-1`}>{s.label}</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Submitted toast */}
      {submitted && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2 mb-3">
          <span>✓</span> Release request submitted, you'll receive a confirmation email shortly.
          <button onClick={() => setSubmitted(false)} className="ml-auto text-green-600 hover:text-green-800 text-xs">✕</button>
        </div>
      )}

      {/* Sticky release request bar */}
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border mb-3 transition-all ${selectedCount > 0 ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200'}`}>
        <span className="text-sm text-slate-600">
          {selectedCount > 0 ? `${selectedCount} fixture type${selectedCount !== 1 ? 's' : ''} selected` : 'Select fixtures at warehouse to request a release'}
        </span>
        <button
          disabled={selectedCount === 0}
          onClick={() => setShowRelModal(true)}
          className={`${BTN_PRIMARY} disabled:opacity-40 disabled:cursor-not-allowed gap-1.5`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
          </svg>
          Request Release ({selectedCount})
        </button>
      </div>

      {/* Flat line-item table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto mb-3">
        <table className="w-full text-xs min-w-[560px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-8 px-2 py-2" />
              {['Type','Description','Manufacturer','ESD','Status','Ordered','At Warehouse','On Site'].map(h => (
                <th key={h} className={`${TH} whitespace-nowrap`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allLineItems.map((li, i) => {
              const canSelect  = (li.qtyAtWarehouse || 0) > 0;
              const isSelected = !!selected[li.id];
              return (
                <tr key={li.id}
                  onClick={() => canSelect && toggleSelect(li)}
                  className={`border-b border-slate-50 last:border-0 transition-colors ${canSelect ? 'cursor-pointer' : 'cursor-default'} ${isSelected ? 'bg-orange-50' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/30 hover:bg-slate-50'}`}
                >
                  <td className="px-2 py-2.5">
                    <input type="checkbox" checked={isSelected} readOnly disabled={!canSelect}
                      className="accent-orange-600 cursor-pointer" />
                  </td>
                  <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{li.fixtureType}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[160px] truncate">{li.description}</td>
                  <td className="px-3 py-2.5 text-slate-500">{li.manufacturer || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDay(li.esdDate)}</td>
                  <td className="px-3 py-2.5"><StatusPill status={li.fixtureStatus || 'NOT_ORDERED'} /></td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{li.qty ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 tabular-nums">{li.qtyAtWarehouse ?? 0}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-green-700">{li.qtyOnSite ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={HELPER}>Check items at warehouse to request a release · Contact your rep with questions</p>

      {/* Release request modal */}
      {showRelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`${MODAL} w-full max-w-lg`}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Request Warehouse Release</h3>
              <button onClick={() => setShowRelModal(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">✕</button>
            </div>
            <div className="px-6 py-4">
              <table className="w-full text-xs mb-4">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className={`${TH} px-0 pb-2`}>Type</th>
                    <th className={`${TH} px-0 pb-2`}>Description</th>
                    <th className={`${TH} px-0 pb-2 text-right`}>At Warehouse</th>
                    <th className={`${TH} px-0 pb-2 text-right`}>Request Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {allLineItems.filter(li => selected[li.id]).map(li => {
                    const reqQty     = selected[li.id] || li.qtyAtWarehouse;
                    const wouldRemain = (li.qtyAtWarehouse || 0) - reqQty;
                    return (
                      <tr key={li.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2 font-mono font-bold text-slate-800">{li.fixtureType}</td>
                        <td className="py-2 text-slate-500 truncate max-w-[120px]">{li.description}</td>
                        <td className="py-2 text-right text-slate-600">{li.qtyAtWarehouse}</td>
                        <td className="py-2 text-right">
                          <input
                            type="number" min="1" max={li.qtyAtWarehouse}
                            value={reqQty}
                            onChange={e => setSelected(prev => ({ ...prev, [li.id]: parseInt(e.target.value) || 1 }))}
                            className="w-16 text-right border border-slate-200 rounded-lg px-1.5 py-0.5 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          {wouldRemain < 0 && <span className="text-red-600 text-[11px] ml-1">max {li.qtyAtWarehouse}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {relError && <p className="text-xs text-red-600 mb-3">{relError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowRelModal(false)} className={`${BTN_SECONDARY} flex-1`}>Cancel</button>
                <button onClick={submitRequest} disabled={submitting}
                  className={`${BTN_PRIMARY} flex-1 disabled:opacity-60`}>
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Budget ────────────────────────────────────────────────────────────────────

function ConceptualBudgetView({ budget }) {
  return (
    <div>
      <div
        className="rounded-xl p-6 mb-5 text-white bg-navy-950 shadow-sm"
      >
        <p className="text-xs font-medium mb-1 text-slate-400">
          ILC Studios, Conceptual Lighting & Controls Budget
        </p>
        <p className="text-3xl font-bold tabular-nums mb-2">
          {fmtCurrency(budget.totalWithControls)}
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>
            <span className="text-slate-400">Lighting: </span>
            <span className="font-semibold">{fmtCurrency(budget.subtotalLightingOnly)}</span>
          </span>
          <span>
            <span className="text-slate-400">Controls: </span>
            <span className="font-semibold">{fmtCurrency(budget.controlsTotal)}</span>
          </span>
          {budget.perSf > 0 && (
            <span>
              <span className="text-slate-400">$/SF: </span>
              <span className="font-semibold">${budget.perSf.toFixed(2)}</span>
            </span>
          )}
          {budget.perUnit > 0 && (
            <span>
              <span className="text-slate-400">$/Unit: </span>
              <span className="font-semibold">{fmtCurrency(budget.perUnit)}</span>
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 text-center">
        Conceptual budget, subject to change as design progresses
      </p>
    </div>
  );
}

function BudgetView({ projectId }) {
  const [data,        setData]        = useState(null);
  const [conceptual,  setConceptual]  = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/portal/projects/${projectId}/budget`).then(r => r.json()),
      fetch(`/api/portal/projects/${projectId}/conceptual-budget`).then(r => r.json()),
    ])
      .then(([budgetData, conceptualData]) => {
        setData(budgetData);
        setConceptual(conceptualData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) return <Spinner />;
  if (!data?.matrix && !conceptual?.budget) return <Empty text="Budget has not been shared yet." />;
  if (!data?.matrix) return <ConceptualBudgetView budget={conceptual.budget} />;

  const { matrix, coSummary } = data;
  const { items, salesTaxRate, freightRate, warehousingRate } = matrix;

  const subtotal  = items.reduce((s, i) => s + (i.cnTotal || 0), 0);
  const freight   = subtotal * ((freightRate || 0) / 100);
  const warehousing = subtotal * ((warehousingRate || 0) / 100);
  const tax       = subtotal * ((salesTaxRate || 0) / 100);
  const total     = subtotal + freight + warehousing + tax;
  const revised   = total + (coSummary.approvedTotal || 0);

  // Group items by locationTag
  const groups = [];
  let currentGroup = null;
  for (const item of items) {
    const tag = item.locationTag || '';
    if (!currentGroup || currentGroup.tag !== tag) {
      currentGroup = { tag, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  }

  return (
    <div>
      {/* Budget as-of date */}
      {matrix.createdAt && (
        <p className="text-xs text-slate-500 mb-3 tabular-nums">
          Budget as of {new Date(matrix.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* CO summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
          <div>
            <p className={`${LABEL} mb-1`}>CO's approved</p>
            <p className="text-base font-bold text-green-700 tabular-nums">{fmtCurrency(coSummary.approvedTotal)}</p>
          </div>
          {coSummary.approvedCount > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 tabular-nums">{coSummary.approvedCount} CO</span>
          )}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
          <div>
            <p className={`${LABEL} mb-1`}>CO's pending</p>
            <p className="text-base font-bold text-amber-700 tabular-nums">{fmtCurrency(coSummary.pendingTotal)}</p>
          </div>
          {coSummary.pendingCount > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 tabular-nums">{coSummary.pendingCount} CO's</span>
          )}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className={`${LABEL} mb-1`}>Revised total</p>
          <p className="text-base font-bold text-slate-800 tabular-nums">{fmtCurrency(revised)}</p>
          <p className="text-xs text-slate-500">w/ approved</p>
        </div>
      </div>

      {/* PDF download */}
      <div className="flex justify-end mb-3">
        <a
          href={`/api/projects/${projectId}/bid-matrix/pdf`}
          target="_blank" rel="noreferrer"
          className={`${BTN_COMPACT} gap-1.5`}
        >
          <svg className="w-3.5 h-3.5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Download PDF
        </a>
      </div>

      {/* Items table: hidden on small screens, full on large */}
      <div className="hidden sm:block border border-slate-200 rounded-xl overflow-hidden overflow-x-auto mb-3">
        <table className="w-full text-xs min-w-[520px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Type','Description','Manufacturer','Qty','Unit (CN)','Total'].map(h => (
                <th key={h} className={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <>
                {g.tag && (
                  <tr key={`hdr-${g.tag}`} className="bg-orange-50">
                    <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-orange-700">{g.tag}</td>
                  </tr>
                )}
                {g.items.map((item, i) => (
                  <tr key={item.id} className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-3 py-2 font-mono text-slate-700">{item.type}</td>
                    <td className="px-3 py-2 text-slate-600">{item.description}</td>
                    <td className="px-3 py-2 text-slate-500">{item.manufacturer || '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{item.qty ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{item.cnPerUnit != null ? fmtCurrency(item.cnPerUnit) : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800 tabular-nums">{item.cnTotal != null ? fmtCurrency(item.cnTotal) : '—'}</td>
                  </tr>
                ))}
              </>
            ))}
            <tr className="bg-slate-50 border-t border-slate-200">
              <td colSpan={5} className="px-3 py-2 text-right text-slate-500">Subtotal</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtCurrency(subtotal)}</td>
            </tr>
            {freightRate > 0 && (
              <tr className="text-slate-500">
                <td colSpan={5} className="px-3 py-1.5 text-right text-[11px]">Freight ({freightRate}%)</td>
                <td className="px-3 py-1.5 text-right text-[11px] tabular-nums">{fmtCurrency(freight)}</td>
              </tr>
            )}
            {warehousingRate > 0 && (
              <tr className="text-slate-500">
                <td colSpan={5} className="px-3 py-1.5 text-right text-[11px]">Warehousing ({warehousingRate}%)</td>
                <td className="px-3 py-1.5 text-right text-[11px] tabular-nums">{fmtCurrency(warehousing)}</td>
              </tr>
            )}
            {salesTaxRate > 0 && (
              <tr className="text-slate-500">
                <td colSpan={5} className="px-3 py-1.5 text-right text-[11px]">Sales tax ({salesTaxRate}%)</td>
                <td className="px-3 py-1.5 text-right text-[11px] tabular-nums">{fmtCurrency(tax)}</td>
              </tr>
            )}
            <tr className="bg-navy-950 text-white">
              <td colSpan={5} className="px-3 py-2.5 text-right font-bold">Contract total</td>
              <td className="px-3 py-2.5 text-right font-bold text-sm">{fmtCurrency(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile: totals only + download */}
      <div className="sm:hidden border border-slate-200 rounded-xl overflow-hidden overflow-x-auto mb-3">
        <table className="w-full text-xs min-w-[280px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Type','Description','Total'].map(h => (
                <th key={h} className={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <>
                {g.tag && (
                  <tr key={`mhdr-${g.tag}`} className="bg-orange-50">
                    <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-orange-700">{g.tag}</td>
                  </tr>
                )}
                {g.items.map(item => (
                  <tr key={item.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 font-mono text-slate-700">{item.type}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{item.description}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-700 tabular-nums">{item.cnTotal != null ? fmtCurrency(item.cnTotal) : '—'}</td>
                  </tr>
                ))}
              </>
            ))}
            <tr className="bg-slate-50 border-t border-slate-200">
              <td colSpan={2} className="px-3 py-2 text-right text-slate-500">Subtotal</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmtCurrency(subtotal)}</td>
            </tr>
            <tr className="bg-navy-950 text-white">
              <td colSpan={2} className="px-3 py-2.5 text-right font-bold">Total</td>
              <td className="px-3 py-2.5 text-right font-bold">{fmtCurrency(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className={HELPER}>
        Pricing shown is your contracted sell rate (CN) · ILC buy price not disclosed · Contact your rep for questions
      </p>
    </div>
  );
}

// ── Change Orders ─────────────────────────────────────────────────────────────

function ChangeOrdersView({ projectId, onChanged }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [confirming, setConfirming] = useState(null);
  const [approving,  setApproving]  = useState(false);
  const [err,        setErr]        = useState('');

  const load = useCallback(() => {
    fetch(`/api/portal/projects/${projectId}/change-orders`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function approve(co) {
    setApproving(true);
    setErr('');
    const res = await fetch(`/api/portal/projects/${projectId}/change-orders/${co.id}/approve`, { method: 'POST' }).catch(() => null);
    setApproving(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}));
      setErr(body?.error || `We could not approve ${co.coNumber}. Nothing was changed. Try again or contact your ILC rep.`);
      return;
    }
    setConfirming(null);
    load();
    onChanged?.();
  }

  if (loading) return <Spinner />;
  if (!data?.changeOrders?.length) return <Empty text="No change orders on this project yet." />;

  const { changeOrders, approvedTotal, pendingTotal, canApprove } = data;
  const pending  = changeOrders.filter(c => c.status === 'SENT');
  const approved = changeOrders.filter(c => c.status === 'APPROVED');

  return (
    <div>
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
          <div>
            <p className={`${LABEL} mb-1`}>Net approved</p>
            <p className="text-base font-bold text-green-700 tabular-nums">{fmtCurrency(approvedTotal)}</p>
          </div>
          {approved.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 tabular-nums">{approved.length} approved</span>
          )}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-2">
          <div>
            <p className={`${LABEL} mb-1`}>Pending</p>
            <p className="text-base font-bold text-amber-700 tabular-nums">{fmtCurrency(pendingTotal)}</p>
          </div>
          {pending.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 tabular-nums">{pending.length} pending</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {changeOrders.map(co => (
          <div key={co.id} className={`${CARD} p-4`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="font-semibold text-slate-800 text-sm">{co.coNumber} · {co.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">{fmtDate(co.date)}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                co.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                co.status === 'SENT'    ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-500'
              }`}>
                {co.status === 'SENT' ? 'Pending' : co.status.charAt(0) + co.status.slice(1).toLowerCase()}
              </span>
            </div>
            {co.hasChosenOption ? (
              <p className={`text-sm font-semibold mb-1 tabular-nums ${co.total < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                {co.total >= 0 ? '+' : ''}{fmtCurrency(co.total)}
                {co.chosenOption && <span className="ml-2 text-xs font-normal text-slate-500">{co.chosenOption}</span>}
              </p>
            ) : (
              <p className="text-sm text-slate-600 mb-1">Your ILC rep still needs to confirm the option on this change order. The PDF shows the options.</p>
            )}
            {co.notes && <p className="text-xs text-slate-500 leading-relaxed">{co.notes}</p>}
            {co.status === 'APPROVED' && (co.approvedByName || co.approvedAt) && (
              <p className="text-xs text-green-700 mt-1">
                Approved{co.approvedByName ? ` by ${co.approvedByName}` : ''}{co.approvedAt ? ` on ${fmtDate(co.approvedAt)}` : ''}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <a
                href={`/api/projects/${projectId}/change-orders/${co.id}/pdf`}
                target="_blank" rel="noreferrer"
                className={`${BTN_COMPACT} gap-1.5`}
              >
                <svg className="w-3.5 h-3.5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Download PDF
              </a>
              {co.status === 'SENT' && (
                <a
                  href="mailto:orders@ilcstudios.com"
                  className={`${BTN_COMPACT} ml-auto gap-1.5`}
                >
                  Contact rep
                </a>
              )}
              {co.status === 'SENT' && canApprove && co.hasChosenOption && (
                <button type="button" onClick={() => { setConfirming(co.id); setErr(''); }} className={BTN_COMPACT_PRIMARY}>
                  Approve
                </button>
              )}
            </div>
            {confirming === co.id && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-sm text-slate-700">Approve {co.coNumber}{co.chosenOption ? `, ${co.chosenOption},` : ''} for {fmtCurrency(co.total)}? This is binding per your contract terms.</p>
                {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
                <div className="flex gap-2 mt-2">
                  <button type="button" disabled={approving} onClick={() => approve(co)} className={BTN_COMPACT_PRIMARY}>
                    {approving ? 'Saving…' : 'Confirm approval'}
                  </button>
                  <button type="button" disabled={approving} onClick={() => setConfirming(null)} className={BTN_COMPACT}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className={`${HELPER} mt-3`}>
        Contact your ILC rep to discuss pending CO's · Approved CO's are binding per contract terms
      </p>
    </div>
  );
}

// ── Meeting Notes ─────────────────────────────────────────────────────────────

function MeetingNotesView({ projectId }) {
  const [notes,    setNotes]   = useState([]);
  const [loading,  setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/meeting-notes`)
      .then(r => r.json()).then(d => { setNotes(d.notes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) return <Spinner />;
  if (!notes.length) return <Empty text="No meeting notes have been shared yet." />;

  return (
    <div className="space-y-3">
      {notes.map(n => (
        <div key={n.id} className="border border-slate-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-800 text-sm">{n.title || 'Untitled'}</p>
              {n.meetingDate && <p className="text-xs text-slate-500 mt-0.5 tabular-nums">{fmtDate(n.meetingDate)}</p>}
            </div>
          </div>
          {n.content && (
            <>
              <div
                className={`text-xs text-slate-500 leading-relaxed mt-2 overflow-hidden transition-all ${expanded[n.id] ? '' : 'max-h-10'}`}
                dangerouslySetInnerHTML={{ __html: n.content }}
              />
              <button
                onClick={() => setExpanded(e => ({ ...e, [n.id]: !e[n.id] }))}
                className="text-[11px] text-orange-600 mt-1.5 inline-flex items-center gap-1 hover:text-orange-700"
              >
                {expanded[n.id] ? 'Show less' : 'Show more'}
              </button>
            </>
          )}
        </div>
      ))}
      <p className={HELPER}>Only notes marked shared by ILC Studios are visible here</p>
    </div>
  );
}

// ── Construction Schedule ─────────────────────────────────────────────────────

function ConstructionScheduleView({ projectId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/construction`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) return <Spinner />;
  if (!data)   return <Empty text="Unable to load schedule." />;

  const { projectDates, aiMilestones, firstDelivery } = data;
  const today = new Date(); today.setHours(12, 0, 0, 0);

  // Build phase structure from project dates + AI milestones
  const projectMilestones = [
    projectDates.constructionStartDate && { label: 'Construction start',    date: projectDates.constructionStartDate },
    projectDates.mepRoughInDate        && { label: 'MEP rough-in',          date: projectDates.mepRoughInDate },
    projectDates.constructionEndDate   && { label: 'Substantial completion', date: projectDates.constructionEndDate },
  ].filter(Boolean);

  const allMilestones = [...projectMilestones, ...aiMilestones];
  const hasData = allMilestones.length > 0 || firstDelivery;
  if (!hasData) return <Empty text="Construction schedule dates have not been set yet." />;

  // Classify each milestone
  function classify(dateStr) {
    if (!dateStr) return 'pending';
    const d = new Date(dateStr); d.setHours(12, 0, 0, 0);
    const days = Math.round((d - today) / 86400000);
    if (days < -1) return 'done';
    if (days <= 14) return 'active';
    return 'pending';
  }

  const done    = allMilestones.filter(m => classify(m.date) === 'done').length;
  const total   = allMilestones.length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
  const nextUp  = allMilestones.find(m => classify(m.date) !== 'done');

  // Group AI milestones by phase if they have phase labels; otherwise flat
  const hasPhases = aiMilestones.some(m => m.phase);

  return (
    <div>
      {/* Progress header */}
      {total > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">{done} of {total} milestones complete</span>
            <span className="text-sm text-slate-500 tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          {nextUp && (
            <p className="text-xs text-slate-500 mt-2">
              Next: <span className="font-semibold text-slate-700">{nextUp.label} · {fmtDate(nextUp.date)}</span>
            </p>
          )}
        </div>
      )}

      {/* First delivery callout */}
      {firstDelivery?.esdDate && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5 flex items-center gap-3">
          <svg className="w-6 h-6 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l1 1h2M13 16l1-8h3l3 4v4h-2M13 16H9" />
          </svg>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700 mb-0.5">First delivery</p>
            <p className="text-sm font-bold text-slate-800">{firstDelivery.manufacturer}</p>
            <p className="text-sm font-semibold text-orange-600">{fmtDay(firstDelivery.esdDate)}</p>
          </div>
        </div>
      )}

      {/* Key project dates */}
      {projectMilestones.length > 0 && (
        <div className="mb-5">
          <h3 className={`${LABEL} mb-3`}>Key Dates</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {projectMilestones.map(m => {
              const state = classify(m.date);
              const days = daysUntil(m.date);
              return (
                <div key={m.label} className={`border rounded-xl p-3 ${state === 'done' ? 'bg-slate-50 border-slate-200' : state === 'active' ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}`}>
                  <p className={`${LABEL} mb-1`}>{m.label}</p>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">{fmtDate(m.date)}</p>
                  {days !== null && (
                    <p className={`text-[11px] mt-1 font-medium ${days < 0 ? 'text-slate-400' : days <= 14 ? 'text-orange-600' : 'text-slate-500'}`}>
                      {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'Today' : `In ${days} days`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI milestones */}
      {aiMilestones.length > 0 && (
        <div>
          <h3 className={`${LABEL} mb-3`}>Detailed Schedule</h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {aiMilestones.map((m, i) => {
              const state = classify(m.date);
              const days  = daysUntil(m.date);
              return (
                <div key={m.id || i} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-slate-50' : ''} ${state === 'active' ? 'bg-orange-50/60' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      state === 'done'   ? 'bg-green-500' :
                      state === 'active' ? 'bg-orange-500 shadow-[0_0_0_3px_rgba(234,88,12,0.15)]' :
                      'bg-slate-300'
                    }`} />
                    <span className={`text-sm ${state === 'done' ? 'text-slate-400' : state === 'active' ? 'text-orange-700 font-semibold' : 'text-slate-700'}`}>
                      {m.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {m.date && <span className="text-xs text-slate-500 tabular-nums">{fmtDate(m.date)}</span>}
                    {days !== null && (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        state === 'done'   ? 'bg-slate-100 text-slate-400' :
                        days <= 0         ? 'bg-red-50 text-red-600' :
                        days <= 14        ? 'bg-orange-50 text-orange-700' :
                        days <= 30        ? 'bg-amber-50 text-amber-700' :
                        'bg-green-50 text-green-700'
                      }`}>
                        {state === 'done' ? 'Done' : days === 0 ? 'Today' : days < 0 ? `${Math.abs(days)}d ago` : `In ${days}d`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className={`${HELPER} mt-4`}>
        Lighting milestones only · Managed by ILC Studios · Dates subject to change
      </p>
    </div>
  );
}

// ── Files (Submittals / Contracts) ────────────────────────────────────────────

function FilesView({ projectId, tab, label }) {
  const [files,   setFiles]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/projects/${projectId}/files?tab=${tab}`)
      .then(r => r.json()).then(d => { setFiles(d.files || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId, tab]);

  if (loading) return <Spinner />;
  if (!files.length) return <Empty text={`No ${label.toLowerCase()} on file yet.`} />;

  return (
    <div className="space-y-2">
      {files.map(f => (
        <a
          key={f.id}
          href={`/api/portal/projects/${projectId}/files/${f.id}`}
          target="_blank" rel="noreferrer"
          className={`${CARD} px-4 py-3 flex items-center gap-3 hover:border-orange-300 transition-all group`}
        >
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-700 font-medium truncate group-hover:text-orange-700 transition-colors">{f.originalName}</p>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">{fmtDate(f.createdAt)}{f.size ? ` · ${fmtSize(f.size)}` : ''}</p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            Download
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </div>
        </a>
      ))}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Spinner() {
  return <WidgetLoading />;
}

function Empty({ text }) {
  return <WidgetEmpty>{text}</WidgetEmpty>;
}

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: 'canViewShipSchedule',      id: 'ship',         label: 'Ship schedule',         shortLabel: 'Ship',     icon: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l1 1h2M13 16l1-8h3l3 4v4h-2M13 16H9' },
  { key: 'canViewBudgets',           id: 'budget',       label: 'Budgets',               shortLabel: 'Budget',   icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'canViewChangeOrders',      id: 'cos',          label: "Change orders",         shortLabel: 'CO\'s',    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', hasBadge: true },
  { key: 'canViewMeetings',          id: 'meetings',     label: 'Meeting notes',         shortLabel: 'Meetings', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'canViewConstructionSched', id: 'construction', label: 'Construction schedule', shortLabel: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { key: 'canViewSubmittals',        id: 'subs',         label: 'Submittals',            shortLabel: 'Subs',     icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'canViewContracts',         id: 'contracts',    label: 'Contracts',             shortLabel: 'Contracts',icon: 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13' },
];

// ── Main portal page ──────────────────────────────────────────────────────────

export default function PortalProjectPage({ params }) {
  const router = useRouter();
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [activeId,      setActiveId]      = useState(null);
  const [pendingCOCount, setPendingCOCount] = useState(0);
  const [coRefresh,      setCoRefresh]      = useState(0);

  useEffect(() => {
    fetch(`/api/portal/projects/${params.id}`)
      .then(r => {
        if (r.status === 401) { router.replace('/portal/login'); return null; }
        if (r.status === 403 || r.status === 404) { router.replace('/portal/projects'); return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setData(d);
        // Default to first available section
        const first = NAV_ITEMS.find(n => d.permissions[n.key]);
        if (first) setActiveId(first.id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id, router]);

  // Load pending CO count for badge
  useEffect(() => {
    if (!data?.permissions?.canViewChangeOrders) return;
    fetch(`/api/portal/projects/${params.id}/change-orders`)
      .then(r => r.json())
      .then(d => {
        const pending = (d.changeOrders || []).filter(c => c.status === 'SENT').length;
        setPendingCOCount(pending);
      })
      .catch(() => {});
  }, [params.id, data?.permissions?.canViewChangeOrders, coRefresh]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <WidgetLoading />
    </div>
  );
  if (!data) return null;

  const { project, permissions } = data;
  const available = NAV_ITEMS.filter(n => permissions[n.key]);
  const active = available.find(n => n.id === activeId) ?? available[0];

  async function logout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' });
    router.replace('/portal/login');
  }

  function NavIcon({ pathD }) {
    return (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d={pathD} />
      </svg>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-52 shrink-0 flex-col bg-white border-r border-slate-200 h-full">
        <div className="px-4 py-3 border-b border-slate-200">
          <p className="text-[11px] font-semibold text-orange-600 mb-1">ILC Studios</p>
          <p className="font-bold text-slate-800 text-sm leading-tight">{project.name}</p>
          {(project.city || project.state) && (
            <p className="text-xs text-slate-500 mt-0.5">{[project.city, project.state].filter(Boolean).join(', ')}</p>
          )}
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {available.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveId(item.id)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all border-l-2 ${
                active?.id === item.id
                  ? 'border-orange-500 text-orange-600 bg-orange-50/60 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <NavIcon pathD={item.icon} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.hasBadge && pendingCOCount > 0 && (
                <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full tabular-nums">{pendingCOCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-slate-200">
          <button onClick={() => router.push('/portal/projects')} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1.5 mb-1.5">
            ← All projects
          </button>
          <button onClick={logout} className="text-xs text-slate-500 hover:text-slate-700">Sign out</button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <div>
            <p className="font-bold text-slate-800 text-sm">{project.name}</p>
            {(project.city || project.state) && (
              <p className="text-xs text-slate-500">{[project.city, project.state].filter(Boolean).join(', ')}</p>
            )}
          </div>
          <button onClick={logout} className="text-xs text-slate-500 hover:text-slate-700">Sign out</button>
        </div>

        {/* Section title (desktop) */}
        {active && (
          <div className="hidden md:block px-6 pt-5 pb-0 shrink-0">
            <a href="/portal/projects" className="text-xs text-slate-500 hover:text-orange-600 transition-colors">
              ← Back to projects
            </a>
            <p className="text-sm text-slate-500 mt-1">{project.name}</p>
            <h2 className="text-lg font-bold text-slate-800 mt-3">{active.label}</h2>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 pb-24 md:pb-6">
          {!active ? (
            <Empty text="No sections have been shared with you yet. Contact your ILC project manager." />
          ) : (
            <>
              {active.id === 'ship'         && <ShipScheduleView         projectId={params.id} />}
              {active.id === 'budget'       && <BudgetView               projectId={params.id} />}
              {active.id === 'cos'          && <ChangeOrdersView         projectId={params.id} onChanged={() => setCoRefresh(n => n + 1)} />}
              {active.id === 'meetings'     && <MeetingNotesView         projectId={params.id} />}
              {active.id === 'construction' && <ConstructionScheduleView projectId={params.id} />}
              {active.id === 'subs'         && <FilesView projectId={params.id} tab="submittals" label="Submittals" />}
              {active.id === 'contracts'    && <FilesView projectId={params.id} tab="contracts"  label="Contracts" />}
            </>
          )}
        </div>

        {/* ── Mobile bottom nav ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-40">
          {available.slice(0, 7).map(item => (
            <button
              key={item.id}
              onClick={() => setActiveId(item.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 relative ${
                active?.id === item.id ? 'text-orange-600' : 'text-slate-400'
              }`}
            >
              <div className="relative">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active?.id === item.id ? 2 : 1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.hasBadge && pendingCOCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full" />
                )}
              </div>
              <span className={`text-[11px] whitespace-nowrap ${active?.id === item.id ? 'font-semibold' : ''}`}>
                {item.shortLabel}
              </span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
