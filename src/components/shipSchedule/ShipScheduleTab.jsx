'use client';
import { useState, useEffect, useCallback } from 'react';
import { STATUS_META, esdWarning } from '@/lib/shipmentStatus';
import ShipmentDrawer from './ShipmentDrawer';
import ShipScheduleImport from './ShipScheduleImport';

function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const FIXTURE_STATUS_LABELS = {
  ORDERED_NOT_DELIVERED:  'Ordered / Not Delivered',
  UNDER_REVIEW:           'Under Review',
  PENDING_COORDINATION:   'Pending Coordination',
  NOT_APPROVED:           'Not Approved',
  REMOVED:                'Removed',
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.PO_PLACED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function EsdWarningIcon({ level }) {
  if (!level) return null;
  const color = level === 'red' ? 'text-red-500' : 'text-amber-500';
  const title = level === 'red' ? 'ESD has passed — not yet delivered' : 'ESD within 14 days';
  return (
    <svg className={`w-4 h-4 ${color} shrink-0`} title={title} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function ShipmentRow({ shipment, onEdit, onDelete, onLineItemChange }) {
  const [expanded, setExpanded] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const warning = esdWarning(shipment);

  async function deleteLineItem(itemId) {
    setDeletingItem(itemId);
    await fetch(`/api/projects/${shipment.project_id}/shipments/line-items/${itemId}`, { method: 'DELETE' });
    setDeletingItem(null);
    onLineItemChange();
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden mb-3">
      {/* Shipment header */}
      <div className="bg-slate-50 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{shipment.manufacturer}</span>
            <StatusBadge status={shipment.status} />
            <EsdWarningIcon level={warning} />
            {warning === 'amber' && <span className="text-xs text-amber-600">ESD approaching</span>}
            {warning === 'red'   && <span className="text-xs text-red-600">ESD passed</span>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-500">
            {shipment.poDate        && <span>PO: {fmt(shipment.poDate)}</span>}
            {shipment.leadTimeWeeks && <span>Lead: {shipment.leadTimeWeeks} wks</span>}
            {shipment.esdDate       && <span>ESD: {fmt(shipment.esdDate)}</span>}
            {shipment.trackingNumber&& <span>Tracking: {shipment.trackingNumber}</span>}
            {shipment.deliveredDate && <span>Delivered: {fmt(shipment.deliveredDate)}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(shipment)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(shipment)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Line items */}
      {expanded && (
        <div>
          {shipment.lineItems.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400 italic">No line items — add them via Edit.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-2 text-slate-400 font-medium">Type</th>
                  <th className="text-left px-4 py-2 text-slate-400 font-medium">Description</th>
                  <th className="text-left px-4 py-2 text-slate-400 font-medium hidden sm:table-cell">Catalog No.</th>
                  <th className="text-center px-4 py-2 text-slate-400 font-medium">Qty</th>
                  <th className="text-left px-4 py-2 text-slate-400 font-medium hidden md:table-cell">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shipment.lineItems.map(item => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-mono font-semibold text-slate-700">{item.fixtureType}</td>
                    <td className="px-4 py-2 text-slate-600">{item.description}</td>
                    <td className="px-4 py-2 text-slate-500 hidden sm:table-cell">{item.catalogNo || '—'}</td>
                    <td className="px-4 py-2 text-center text-slate-700 font-medium">{item.qty}</td>
                    <td className="px-4 py-2 hidden md:table-cell">
                      {item.fixtureStatus ? (
                        <span className="text-slate-500">{FIXTURE_STATUS_LABELS[item.fixtureStatus] || item.fixtureStatus}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => deleteLineItem(item.id)}
                        disabled={deletingItem === item.id}
                        className="text-slate-300 hover:text-red-400 transition-colors disabled:opacity-40"
                        title="Remove line item"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function ShipScheduleTab({ projectId }) {
  const [shipments, setShipments] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = new, object = edit
  const [importOpen, setImportOpen] = useState(false);
  const [deleting,  setDeleting]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/projects/${projectId}/shipments`);
      const data = await res.json();
      setShipments(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  function openNew()          { setEditTarget(null); setDrawerOpen(true); }
  function openEdit(shipment) { setEditTarget(shipment); setDrawerOpen(true); }

  async function handleDelete(shipment) {
    if (!confirm(`Delete shipment for ${shipment.manufacturer}? This removes all line items too.`)) return;
    setDeleting(shipment.id);
    await fetch(`/api/projects/${projectId}/shipments/${shipment.id}`, { method: 'DELETE' });
    setDeleting(null);
    load();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Ship Schedule</h2>
          <p className="text-sm text-slate-400 mt-0.5">Track PO → delivery per manufacturer.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Import Excel
          </button>
          <button
            onClick={openNew}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Shipment
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading…</div>
      ) : shipments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <p className="font-medium text-slate-600 mb-1">No shipments yet</p>
          <p className="text-sm text-slate-400 mb-4">Add a shipment manually or import from Excel.</p>
          <div className="flex gap-2">
            <button onClick={() => setImportOpen(true)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Import Excel</button>
            <button onClick={openNew} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400">Add Shipment</button>
          </div>
        </div>
      ) : (
        <div>
          {shipments.map(s => (
            <ShipmentRow
              key={s.id}
              shipment={s}
              onEdit={openEdit}
              onDelete={handleDelete}
              onLineItemChange={load}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <ShipmentDrawer
          projectId={projectId}
          shipment={editTarget}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => { setDrawerOpen(false); load(); }}
        />
      )}

      {/* Import modal */}
      {importOpen && (
        <ShipScheduleImport
          projectId={projectId}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); load(); }}
        />
      )}
    </div>
  );
}
