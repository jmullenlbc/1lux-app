'use client';
import { useRef, useState } from 'react';

// Reusable concept image slot for Standards. Placeholder until set; click to
// upload/replace. Durable storage via the concepts API (qcStorage-backed).
// Drop-in: <ConceptImage clientId={id} concept={c} onUpdated={fn} editable />
export default function ConceptImage({ clientId, concept, onUpdated, editable = true, size = 'md' }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(concept?.imageUrl || null);
  const inputRef = useRef(null);

  const dim = size === 'sm' ? 'w-16 h-16' : size === 'lg' ? 'w-28 h-28' : 'w-24 h-24';

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file || !concept?.id) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { alert('PNG, JPG, or WebP only'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('Max 10 MB'); return; }
    setBusy(true);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
      });
      const resp = await fetch(`/api/clients/${clientId}/standards/concepts`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conceptId: concept.id, imageBase64: b64, imageContentType: file.type }),
      });
      const d = await resp.json();
      if (resp.ok) { setUrl(d.concept.imageUrl); onUpdated?.(d.concept); }
      else alert(d.error || 'Upload failed');
    } catch { alert('Upload failed'); }
    setBusy(false);
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <button type="button" onClick={() => editable && inputRef.current?.click()} disabled={busy}
        title={url ? 'Click to replace' : 'Add product image'}
        className={`${dim} rounded-xl overflow-hidden border flex items-center justify-center transition-colors ${url ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-100 hover:border-amber-400'} ${editable ? 'cursor-pointer' : 'cursor-default'}`}>
        {busy ? (
          <span className="text-[10px] text-slate-400">Uploading…</span>
        ) : url ? (
          <img src={url} alt={concept?.description || 'concept'} className="w-full h-full object-cover" />
        ) : (
          <span className="flex flex-col items-center text-slate-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 16.5V6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75v10.5A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25z" />
            </svg>
            {editable && <span className="text-[9px] mt-0.5">Add image</span>}
          </span>
        )}
      </button>
      {concept?.description && <span className="text-[10px] text-slate-500 max-w-[7rem] text-center leading-tight">{concept.description}</span>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPick} />
    </div>
  );
}
