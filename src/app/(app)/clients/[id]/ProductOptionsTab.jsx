'use client';
import { useState, useEffect, useCallback } from 'react';
import { CARD, MODAL, CARD_TITLE, HELPER, LABEL, INPUT, BTN_COMPACT, BTN_COMPACT_PRIMARY } from '@/components/ui/tokens';
import { WidgetLoading } from '@/components/ui/WidgetFrame';

// Product Options funnel (matches the LAC "Alternate Options" sheet): options grouped
// by category, each a card with picture + name + notes + price estimate + price target,
// approved / rejected / pending. Approved options feed the standard fixture schedule.

const money = v => (v == null || v === '' ? '' : `$${Number(v).toLocaleString()}`);

export default function ProductOptionsTab({ clientId, canEdit }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoad]    = useState(true);
  const [busyId, setBusyId]   = useState(null);
  const [catModal, setCatModal] = useState(false);

  const load = useCallback(async () => {
    setLoad(true);
    const r = await fetch(`/api/clients/${clientId}/product-options`);
    setOptions(r.ok ? (await r.json()).options || [] : []);
    setLoad(false);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  async function addOption(category) {
    const r = await fetch(`/api/clients/${clientId}/product-options`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, name: 'New option', sortOrder: options.filter(o => o.category === category).length }),
    });
    if (r.ok) { const o = (await r.json()).option; setOptions(os => [...os, o]); }
  }
  async function addCategory(cat) {
    const c = (cat || '').trim(); if (!c) return;
    setCatModal(false); await addOption(c);
  }
  async function patch(optionId, body) {
    setOptions(os => os.map(o => o.id === optionId ? { ...o, ...body } : o));
    const r = await fetch(`/api/clients/${clientId}/product-options`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId, ...body }),
    });
    if (r.ok) { const o = (await r.json()).option; setOptions(os => os.map(x => x.id === optionId ? o : x)); }
  }
  async function del(optionId) {
    if (!confirm('Remove this option?')) return;
    setOptions(os => os.filter(o => o.id !== optionId));
    await fetch(`/api/clients/${clientId}/product-options?optionId=${optionId}`, { method: 'DELETE' });
  }
  async function renameCategory(from, to) {
    const t = (to || '').trim();
    if (!t || t === from) return;
    setOptions(os => os.map(o => (o.category || 'Uncategorized') === from ? { ...o, category: t } : o));
    await fetch(`/api/clients/${clientId}/product-options`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renameCategory: { from: from === 'Uncategorized' ? '' : from, to: t } }),
    });
  }
  async function deleteCategory(cat) {
    const n = options.filter(o => (o.category || 'Uncategorized') === cat).length;
    if (!confirm(`Delete the "${cat}" category and its ${n} option${n === 1 ? '' : 's'}?`)) return;
    setOptions(os => os.filter(o => (o.category || 'Uncategorized') !== cat));
    await fetch(`/api/clients/${clientId}/product-options?category=${encodeURIComponent(cat === 'Uncategorized' ? '' : cat)}`, { method: 'DELETE' });
  }
  function uploadImage(optionId, file) {
    const reader = new FileReader();
    reader.onload = () => patch(optionId, { imageBase64: reader.result, imageContentType: file.type });
    reader.readAsDataURL(file);
  }
  // Paste a product link → unfurl its thumbnail + title (name only if still default).
  async function fetchFromLink(o, url) {
    const link = (url || '').trim();
    await patch(o.id, { productUrl: link });
    if (!link) return;
    setBusyId(o.id);
    try {
      const r = await fetch('/api/link-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link }) });
      if (r.ok) {
        const d = await r.json();
        const upd = {};
        if (d.imageKey) upd.imageKey = d.imageKey;
        if (d.title && (!o.name || o.name === 'New option')) upd.name = d.title.slice(0, 120);
        if (Object.keys(upd).length) await patch(o.id, upd);
      }
    } finally { setBusyId(null); }
  }
  async function toSchedule(o) {
    const r = await fetch(`/api/clients/${clientId}/standard-fixtures`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId: o.id, description: o.name }),
    });
    if (r.ok) alert(`Added "${o.name}" to the Standard Fixture Schedule.`);
  }

  if (loading) return <WidgetLoading>Loading product options...</WidgetLoading>;

  const cats = [...new Set(options.map(o => o.category || 'Uncategorized'))];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className={CARD_TITLE}>Product Options</h3>
          <p className={HELPER}>Present options per category, approve the ones the client blesses. Approved options feed the standard fixture schedule.</p>
        </div>
        {canEdit && (
          <button onClick={() => setCatModal(true)} className={BTN_COMPACT_PRIMARY}>+ Category</button>
        )}
      </div>

      {cats.length === 0 && (
        <div className={`${CARD} p-10 text-center text-sm text-slate-500`}>
          No product options yet.{canEdit && <> Add a category above to start.</>}
        </div>
      )}

      {cats.map(cat => (
        <div key={cat} className={`${CARD} p-4`}>
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {canEdit
                ? <input defaultValue={cat} onBlur={e => e.target.value.trim() !== cat && renameCategory(cat, e.target.value)}
                    className="text-sm font-bold text-slate-800 bg-transparent border border-transparent hover:border-slate-200 focus:border-orange-500 rounded-lg px-1 py-0.5 outline-none max-w-[280px]" />
                : <h4 className="text-sm font-bold text-slate-800">{cat}</h4>}
              <span className="text-[11px] font-semibold text-green-600 whitespace-nowrap tabular-nums">
                {options.filter(o => (o.category || 'Uncategorized') === cat && o.status === 'APPROVED').length} approved
              </span>
            </div>
            {canEdit && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => addOption(cat === 'Uncategorized' ? '' : cat)} className={BTN_COMPACT}>+ Option</button>
                <button onClick={() => deleteCategory(cat)} title="Delete category" className="px-1.5 py-1 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 text-xs">🗑</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {options.filter(o => (o.category || 'Uncategorized') === cat).map(o => (
              <OptionCard key={o.id} o={o} canEdit={canEdit} busy={busyId === o.id}
                onPatch={patch} onDelete={del} onUpload={uploadImage} onToSchedule={toSchedule} onLink={fetchFromLink} />
            ))}
          </div>
        </div>
      ))}

      {catModal && <CategoryModal onCreate={addCategory} onClose={() => setCatModal(false)} />}
    </div>
  );
}

function CategoryModal({ onCreate, onClose }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className={`${MODAL} w-full max-w-sm p-5`} onClick={e => e.stopPropagation()}>
        <h3 className={`${CARD_TITLE} mb-1`}>New category</h3>
        <p className={`${HELPER} mb-3`}>e.g. Vanity, Kitchen Pendants, Ceiling Fans</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onCreate(name); if (e.key === 'Escape') onClose(); }}
          placeholder="Category name"
          className={INPUT} />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className={BTN_COMPACT}>Cancel</button>
          <button onClick={() => onCreate(name)} disabled={!name.trim()} className={BTN_COMPACT_PRIMARY}>Create</button>
        </div>
      </div>
    </div>
  );
}

function OptionCard({ o, canEdit, busy, onPatch, onDelete, onUpload, onToSchedule, onLink }) {
  const ring = o.status === 'APPROVED' ? 'border-green-500 ring-4 ring-green-100'
    : o.status === 'REJECTED' ? 'border-red-600 ring-4 ring-red-100 opacity-70' : 'border-slate-200';
  return (
    <div className={`rounded-xl border-2 ${ring} bg-white shadow-sm p-2.5 flex flex-col gap-1.5 transition-all`}>
      <div className="relative aspect-square w-full rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
        {o.imageUrl
          ? <img src={o.imageUrl} alt="" className="w-full h-full object-contain" />
          : <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">{busy ? 'Loading...' : 'paste a link below'}</div>}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-xs font-semibold text-orange-600">Loading...</div>}
        {canEdit && (
          <>
            <button onClick={() => document.getElementById(`opt-${o.id}`)?.click()}
              className="absolute bottom-1 right-1 text-xs font-semibold bg-white/90 border border-slate-300 rounded-lg px-1.5 py-0.5 text-slate-600 hover:bg-slate-100">upload</button>
            <input id={`opt-${o.id}`} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(o.id, f); e.target.value = ''; }} />
          </>
        )}
      </div>
      <input defaultValue={o.name} disabled={!canEdit} placeholder="Name"
        onBlur={e => e.target.value !== o.name && onPatch(o.id, { name: e.target.value })}
        className="text-xs font-semibold text-slate-800 bg-transparent border border-transparent hover:border-slate-200 focus:border-orange-500 rounded-lg px-1 py-0.5 outline-none" />
      <label className={`block ${LABEL}`}>Hyperlink
        <input defaultValue={o.productUrl || ''} disabled={!canEdit} placeholder="Paste product link, auto-fills image"
          onBlur={e => e.target.value !== (o.productUrl || '') && onLink(o, e.target.value)}
          className="mt-0.5 w-full text-xs text-orange-600 border border-slate-300 rounded-lg px-1.5 py-1 outline-none focus:border-orange-500 truncate normal-case" />
      </label>
      <div className="flex gap-1">
        <label className={`flex-1 ${HELPER}`}>Budget
          <input type="number" defaultValue={o.priceEstimate ?? ''} disabled={!canEdit}
            onBlur={e => String(o.priceEstimate ?? '') !== e.target.value && onPatch(o.id, { priceEstimate: e.target.value })}
            className="w-full text-xs text-slate-700 tabular-nums bg-transparent border border-slate-300 focus:border-orange-500 rounded-lg px-1 py-0.5 outline-none" /></label>
        <label className={`flex-1 ${HELPER}`}>Target
          <input type="number" defaultValue={o.priceTarget ?? ''} disabled={!canEdit}
            onBlur={e => String(o.priceTarget ?? '') !== e.target.value && onPatch(o.id, { priceTarget: e.target.value })}
            className="w-full text-xs font-semibold text-slate-800 tabular-nums bg-transparent border border-slate-300 focus:border-orange-500 rounded-lg px-1 py-0.5 outline-none" /></label>
      </div>
      <input defaultValue={o.notes || ''} disabled={!canEdit} placeholder="Notes"
        onBlur={e => e.target.value !== (o.notes || '') && onPatch(o.id, { notes: e.target.value })}
        className="text-xs text-slate-500 bg-transparent border border-transparent hover:border-slate-200 focus:border-orange-500 rounded-lg px-1 py-0.5 outline-none" />
      {canEdit && (
        <div className="flex items-center gap-1 mt-0.5">
          <button onClick={() => onPatch(o.id, { status: o.status === 'APPROVED' ? 'PENDING' : 'APPROVED' })}
            className={`flex-1 text-xs font-semibold rounded-lg px-1.5 py-1 ${o.status === 'APPROVED' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
            {o.status === 'APPROVED' ? '✓ Approved' : 'Approve'}
          </button>
          <button onClick={() => onPatch(o.id, { status: o.status === 'REJECTED' ? 'PENDING' : 'REJECTED' })}
            className={`text-xs font-semibold rounded-lg px-1.5 py-1 ${o.status === 'REJECTED' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>✕</button>
          {o.status === 'APPROVED' && <button onClick={() => onToSchedule(o)} title="Add to fixture schedule" className="text-xs font-semibold text-slate-600 hover:text-orange-600 px-1">to schedule</button>}
          <button onClick={() => onDelete(o.id)} title="Delete" className="text-xs text-slate-600 hover:text-red-600 px-0.5">🗑</button>
        </div>
      )}
    </div>
  );
}
