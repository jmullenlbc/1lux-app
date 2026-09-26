'use client';
import { useEffect, useState } from 'react';

// Your own signature details (Mike 9-26). Everyone edits only their own; each
// box saves when you leave it. `onChange(user)` hands the saved row back so
// the page's preview can redraw.
const BOXES = [
  { k: 'signatureName', label: 'Name on your signature', ph: acct => acct || 'Your full name', wide: true,
    help: 'Blank uses your account name. Type "Michael Kershner" here to sign as Michael while the app calls you Mike.' },
  { k: 'jobTitle',    label: 'Title',               ph: () => 'e.g. Director of Sales', wide: true },
  { k: 'phone',       label: 'Cell phone',          ph: () => 'e.g. 857.998.0556' },
  { k: 'officePhone', label: 'Office line (optional)', ph: () => 'e.g. 720.248.8208' },
  { k: 'officeExt',   label: 'Extension (optional)',   ph: () => 'e.g. 103' },
];

export default function MySignatureFields({ onChange }) {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    fetch('/api/users/signature').then(r => r.json()).then(d => { setF(d); onChange?.(d); }).catch(() => setF({}));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(k, v) {
    if ((f?.[k] || '') === v.trim()) return;
    setMsg(null);
    const res = await fetch('/api/users/signature', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [k]: v }) });
    if (res.ok) { const d = await res.json(); setF(d); onChange?.(d); setMsg('Saved.'); } else setMsg('Could not save.');
  }
  if (!f) return null;
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BOXES.map(b => (
          <div key={b.k} className={b.wide ? 'sm:col-span-2' : ''}>
            <label className="block text-xs text-slate-500 mb-1">{b.label}</label>
            <input defaultValue={f[b.k] || ''} placeholder={b.ph(f.name)} onBlur={e => save(b.k, e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            {b.help && <p className="text-[11px] text-slate-400 mt-1">{b.help}</p>}
          </div>
        ))}
      </div>
      {msg && <p className="text-xs mt-2 text-slate-500">{msg}</p>}
    </div>
  );
}
