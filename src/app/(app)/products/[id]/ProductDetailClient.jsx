'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ConfirmArchiveModal, { setArchived, KEPT_ON_ARCHIVE_PAGE } from '@/components/salesAutomation/ConfirmArchiveModal';

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

  // Products are archived, never deleted (Mike, 2026-09-11).
  async function handleArchive() {
    setDeleting(true);
    const problem = await setArchived(`/api/products/${product.id}`);
    if (problem) {
      setDeleting(false);
      setConfirmDelete(false);
      alert(problem);
      return;
    }
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-700 border border-amber-200 hover:bg-amber-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              Archive
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

      <ConfirmArchiveModal
        open={confirmDelete}
        title="Archive this product?"
        what={product.partNumber}
        body={`It comes off the product catalog and out of the pickers. ${KEPT_ON_ARCHIVE_PAGE}`}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleArchive}
      />

    </div>
  );
}
