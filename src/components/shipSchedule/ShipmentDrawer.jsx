'use client';
import { useState, useEffect } from 'react';
import { deriveShipmentStatus, STATUS_META } from '@/lib/shipmentStatus';

function toInputDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

const FIXTURE_STATUS_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'ORDERED_NOT_DELIVERED',  label: 'Ordered / Not Delivered' },
  { value: 'UNDER_REVIEW',           label: 'Under Review' },
  { value: 'PENDING_COORDINATION',   label: 'Pending Coordination' },
  { value: 'NOT_APPROVED',           label: 'Not Approved' },
  { value: 'REMOVED',                label: 'Removed' },
];

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white';

export default function ShipmentDrawer({ projectId, shipment, onClose, onSaved }) {
  const isEdit = !!shipment;

  const [form, setForm] = useState({
    manufacturer:  shipment?.manufacturer  || '',
    poDate:        toInputDate(shipment?.poDate),
    leadTimeWeeks: shipment?.leadTimeWeeks || '',
    esdDate:       toInputDate(shipment?.esdDate),
    trackingNumber:shipment?.trackingNumber || '',
    deliveredDate: toInputDate(shipment?.deliveredDate),
    notes:         shipment?.notes         || '',
  });

  const [lineItems, setLineItems] = useState(shipment?.lineItems || []);
  const [newItem, setNewItem] = useState({ fixtureType: '', description: '', catalogNo: '', qty: 1, fixtureStatus: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [error, setError] = useState('');

  const previewStatus = deriveShipmentStatus({
    poDate:        form.poDate        || null,
    leadTimeWeeks: form.leadTimeWeeks || null,
    esdDate:       form.esdDate       || null,
    trackingNumber:form.trackingNumber|| null,
    deliveredDate: form.deliveredDate || null,
  });

  const statusMeta = STATUS_META[previewStatus];

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function save() {
    if (!form.manufacturer.trim()) { setError('Manufacturer is required.'); return; }
    setError('');
    setSaving(true);

    const payload = {
      manufacturer:  form.manufacturer.trim(),
      poDate:        form.poDate        || null,
      leadTimeWeeks: form.leadTimeWeeks || null,
      esdDate:       form.esdDate       || null,
      trackingNumber:form.trackingNumber|| null,
      deliveredDate: form.deliveredDate || null,
      notes:         form.notes         || null,
    };

    const url    = isEdit ? `/api/projects/${projectId}/shipments/${shipment.id}` : `/api/projects/${projectId}/shipments`;
    const method = isEdit ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    if (!res.ok) { setError('Save failed. Please try again.'); setSaving(false); return; }
    onSaved();
  }

  async function addLineItem() {
    if (!newItem.fixtureType.trim() || !newItem.description.trim()) {
      setError('Type and description are required for line items.');
      return;
    }
    if (!isEdit) { setError('Save the shipment first, then add line items.'); return; }
    setError('');
    setAddingItem(true);

    const res = await fetch(`/api/projects/${projectId}/shipments/${shipment.id}/line-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newItem, qty: Number(newItem.qty) || 1, fixtureStatus: newItem.fixtureStatus || null }),
    });

    if (res.ok) {
      const item = await res.json();
      setLineItems(prev => [...prev, item]);
      setNewItem({ fixtureType: '', description: '', catalogNo: '', qty: 1, fixtureStatus: '', notes: '' });
    } else {
      setError('Failed to add line item.');
    }
    setAddingItem(false);
  }

  async function removeLineItem(id) {
    await fetch(`/api/projects/${projectId}/shipments/line-items/${id}`, { method: 'DELETE' });
    setLineItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">{isEdit ? 'Edit Shipment' : 'Add Shipment'}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${statusMeta.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                {statusMeta.label}
              </span>
              <span className="text-xs text-slate-400">auto-updates as fields fill</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <Field label="Manufacturer *">
            <input className={inputCls} value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} placeholder="e.g. eLuma" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="PO Date">
              <input type="date" className={inputCls} value={form.poDate} onChange={e => set('poDate', e.target.value)} />
            </Field>
            <Field label="Lead Time (weeks)">
              <input className={inputCls} value={form.leadTimeWeeks} onChange={e => set('leadTimeWeeks', e.target.value)} placeholder="e.g. 12-16" />
            </Field>
            <Field label="ESD">
              <input type="date" className={inputCls} value={form.esdDate} onChange={e => set('esdDate', e.target.value)} />
            </Field>
            <Field label="Tracking Number">
              <input className={inputCls} value={form.trackingNumber} onChange={e => set('trackingNumber', e.target.value)} placeholder="e.g. 1Z999AA1…" />
            </Field>
          </div>

          <Field label="Delivered Date">
            <input type="date" className={inputCls} value={form.deliveredDate} onChange={e => set('deliveredDate', e.target.value)} />
          </Field>

          <Field label="Notes">
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes…" />
          </Field>

          {/* Line items section (edit mode only) */}
          {isEdit && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Line Items</span>
                <span className="text-xs text-slate-400">{lineItems.length} items</span>
              </div>

              {lineItems.length > 0 && (
                <div className="border border-slate-100 rounded-lg overflow-hidden mb-3">
                  {lineItems.map((item, i) => (
                    <div key={item.id} className={`flex items-start gap-2 px-3 py-2.5 text-xs ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <span className="font-mono font-semibold text-slate-700 mr-2">{item.fixtureType}</span>
                        <span className="text-slate-600">{item.description}</span>
                        {item.catalogNo && <span className="text-slate-400 ml-2">· {item.catalogNo}</span>}
                        <span className="text-slate-400 ml-2">· qty {item.qty}</span>
                      </div>
                      <button onClick={() => removeLineItem(item.id)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add line item form */}
              <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Add Line Item</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Type (e.g. L5)" value={newItem.fixtureType} onChange={e => setNewItem(n => ({ ...n, fixtureType: e.target.value }))} />
                  <input className={`${inputCls} col-span-1`} placeholder="Qty" type="number" min={1} value={newItem.qty} onChange={e => setNewItem(n => ({ ...n, qty: e.target.value }))} />
                </div>
                <input className={inputCls} placeholder="Description *" value={newItem.description} onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))} />
                <input className={inputCls} placeholder="Catalog No. (optional)" value={newItem.catalogNo} onChange={e => setNewItem(n => ({ ...n, catalogNo: e.target.value }))} />
                <select className={inputCls} value={newItem.fixtureStatus} onChange={e => setNewItem(n => ({ ...n, fixtureStatus: e.target.value }))}>
                  {FIXTURE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  onClick={addLineItem}
                  disabled={addingItem}
                  className="w-full py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold disabled:opacity-60 transition-colors"
                >
                  {addingItem ? 'Adding…' : '+ Add Line Item'}
                </button>
              </div>
            </div>
          )}

          {!isEdit && (
            <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
              Save the shipment first, then you can add line items.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-4 flex justify-end gap-2 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
            {isEdit ? 'Done' : 'Cancel'}
          </button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Shipment'}
          </button>
        </div>
      </div>
    </div>
  );
}
