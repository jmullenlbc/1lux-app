'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const FIXTURE_TYPES = ['FIXTURE', 'CONTROL_DEVICE'];

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      {children}
    </div>
  );
}

function EditableField({ label, value, onSave, type = 'text', options, mono = false, prefix = '' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  function start() { setVal(value != null ? String(value) : ''); setEditing(true); }
  function commit() {
    setEditing(false);
    const trimmed = String(val).trim();
    const out = trimmed === '' ? null
      : type === 'number' ? (isNaN(parseFloat(trimmed)) ? null : parseFloat(trimmed))
      : trimmed;
    if (out !== (value ?? null)) onSave(out);
  }

  if (type === 'select') {
    return (
      <Field label={label}>
        <select value={value ?? ''} onChange={e => onSave(e.target.value || null)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400">
          <option value="">—</option>
          {options.map(o => (
            <option key={o} value={o}>
              {o === 'CONTROL_DEVICE' ? 'Control Device' : o === 'FIXTURE' ? 'Fixture' : o}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  return (
    <Field label={label}>
      {editing ? (
        <div className="flex gap-2">
          <input autoFocus value={val} onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className={`flex-1 text-sm border border-blue-400 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 ${mono ? 'font-mono' : ''}`}
          />
        </div>
      ) : (
        <button onClick={start}
          className={`w-full text-left text-sm px-3 py-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all ${mono ? 'font-mono' : ''} ${value == null ? 'text-slate-300' : 'text-slate-800'}`}>
          {prefix}{value != null ? String(value) : '—'}
        </button>
      )}
    </Field>
  );
}

export default function ProductDetailClient({ product: initial, manufacturers, isAdmin }) {
  const [product, setProduct] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
    router.push('/products');
  }

  async function patch(field, value) {
    setSaving(true);
    setSaved(false);
    setProduct(prev => ({ ...prev, [field]: value }));
    await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const typeLabel = product.fixtureType === 'CONTROL_DEVICE' ? 'Control Device' : product.fixtureType === 'FIXTURE' ? 'Fixture' : null;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/products" className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Pre-Con</span>
              <span className="text-slate-300">·</span>
              <Link href="/products" className="text-[10px] text-slate-400 hover:text-slate-600">Product Catalog</Link>
              <span className="text-slate-300">·</span>
              <span className="text-sm font-semibold text-slate-900 font-mono">{product.partNumber}</span>
            </div>
            <p className="text-[10px] text-slate-400">Click any field to edit</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-[10px] text-slate-400">Saving…</span>}
          {saved  && <span className="text-[10px] text-green-600">Saved</span>}
          {typeLabel && (
            <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${product.fixtureType === 'CONTROL_DEVICE' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
              {typeLabel}
            </span>
          )}
          <span className="text-[10px] font-mono text-slate-400">#{product.numericId}</span>
          {isAdmin && (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Manufacturer banner */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 mb-6 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Manufacturer</div>
            <Link href={`/manufacturers/${product.manufacturerId}`}
              className="text-base font-bold text-slate-900 hover:text-blue-600 transition-colors">
              {product.manufacturer?.name}
            </Link>
          </div>
          <Link href={`/manufacturers/${product.manufacturerId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-600 transition-colors">
            View Manufacturer
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>

        {/* Core fields */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5 mb-4">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Product Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <EditableField label="Part Number" value={product.partNumber} mono onSave={v => patch('partNumber', v)} />
            <Field label="Type">
              <select value={product.fixtureType ?? ''} onChange={e => patch('fixtureType', e.target.value || null)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">—</option>
                <option value="FIXTURE">Fixture</option>
                <option value="CONTROL_DEVICE">Control Device</option>
              </select>
            </Field>
            <div className="col-span-2">
              <EditableField label="Description" value={product.description} onSave={v => patch('description', v)} />
            </div>
          </div>
        </div>

        {/* Spec fields */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5 mb-4">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Specifications</h2>
          <div className="grid grid-cols-3 gap-4">
            <EditableField label="CCT" value={product.cct} onSave={v => patch('cct', v)} />
            <EditableField label="Wattage" value={product.wattage != null ? String(product.wattage) : null} type="number" onSave={v => patch('wattage', v)} />
            <EditableField label="Dimming" value={product.dimming} onSave={v => patch('dimming', v)} />
            <EditableField label="Finish" value={product.finish} onSave={v => patch('finish', v)} />
            <EditableField label="Voltage" value={product.voltage} onSave={v => patch('voltage', v)} />
            <EditableField label="Mounting" value={product.mounting} onSave={v => patch('mounting', v)} />
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5 mb-4">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <EditableField label="Cost (DN)" value={product.cost != null ? String(product.cost) : null} type="number" onSave={v => patch('cost', v)} />
              <p className="text-[10px] text-slate-400 mt-1 px-3">Dealer net / ILC internal cost</p>
            </div>
            <div>
              <EditableField label="Sale Price (CN)" value={product.salePrice != null ? String(product.salePrice) : null} type="number" onSave={v => patch('salePrice', v)} />
              <p className="text-[10px] text-slate-400 mt-1 px-3">Client net — what client pays</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Notes</h2>
          <EditableField label="" value={product.notes} onSave={v => patch('notes', v)} />
        </div>

      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Delete product?</div>
                <div className="text-xs text-slate-500 font-mono mt-0.5">{product.partNumber}</div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-5">This permanently removes the product from the catalog. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
