'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RecordHistory from '@/components/RecordHistory';
import EmailLists from '@/components/salesReps/EmailLists';
import RepLinksCard from '@/components/salesReps/RepLinksCard';

const TERMS_OPTIONS = ['NET 30', 'NET 60', 'PAY IN ADVANCE', '1%/10 NET 25th', 'NET 45', 'COD'];
const STATES_US = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

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

function EditableField({ label, value, onSave, type = 'text', options, mono = false }) {
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

  if (type === 'boolean') {
    return (
      <Field label={label}>
        <button onClick={() => onSave(!value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${value ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
          {value ? 'YES' : 'NO'}
        </button>
      </Field>
    );
  }

  if (type === 'select') {
    return (
      <Field label={label}>
        <select value={value ?? ''} onChange={e => onSave(e.target.value || null)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
    );
  }

  return (
    <Field label={label}>
      {editing ? (
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className={`w-full text-sm border border-blue-400 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 ${mono ? 'font-mono' : ''}`}
        />
      ) : (
        <button onClick={start}
          className={`w-full text-left text-sm px-3 py-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all ${mono ? 'font-mono' : ''} ${value == null ? 'text-slate-300' : 'text-slate-800'}`}>
          {value != null ? String(value) : '—'}
        </button>
      )}
    </Field>
  );
}

export default function ManufacturerDetailClient({ manufacturer: initial, offices = [], reps = [] }) {
  const router = useRouter();
  const [mfr, setMfr] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [err, setErr] = useState('');
  const [version, setVersion] = useState(0);

  async function patch(field, value) {
    setSaving(true);
    setSaved(false);
    setErr('');
    const before = mfr[field];
    setMfr(prev => ({ ...prev, [field]: value }));
    const res = await fetch(`/api/manufacturers/${mfr.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const d = await res?.json().catch(() => ({}));
      setMfr(prev => ({ ...prev, [field]: before }));
      setErr(d?.error || `The change was not saved${res ? ` (our server said ${res.status})` : ', no signal reaching our server'}. Try again. (MFR_SAVE)`);
      return;
    }
    setSaved(true);
    setVersion(v => v + 1);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveEmails(emails) {
    const res = await fetch(`/api/manufacturers/${mfr.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) return d?.error || 'The emails were not saved. Try again. (MFR_EMAILS)';
    setMfr(prev => ({ ...prev, emails: d.manufacturer?.emails || prev.emails }));
    setVersion(v => v + 1);
    return null;
  }

  function linksChanged() { router.refresh(); setVersion(v => v + 1); }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/manufacturers" className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Pre-Con</span>
              <span className="text-slate-300">·</span>
              <Link href="/manufacturers" className="text-[10px] text-slate-400 hover:text-slate-600">Manufacturers</Link>
              <span className="text-slate-300">·</span>
              <span className="text-sm font-semibold text-slate-900">{mfr.name}</span>
            </div>
            <p className="text-[10px] text-slate-400">Click any field to edit</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {err && <span className="text-[10px] text-red-600 max-w-xs">{err}</span>}
          {saving && <span className="text-[10px] text-slate-400">Saving…</span>}
          {saved  && <span className="text-[10px] text-green-600">Saved</span>}
          {mfr.setupToSell && (
            <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">Setup to Sell</span>
          )}
          <span className="text-[10px] font-mono text-slate-400">#{mfr.numericId}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">

        {/* Identity */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <EditableField label="Name" value={mfr.name} onSave={v => patch('name', v)} />
            </div>
            <EditableField label="Website" value={mfr.website} onSave={v => patch('website', v)} />
            <EditableField label="Main Phone" value={mfr.mainPhone} onSave={v => patch('mainPhone', v)} />
            <EditableField label="Accounting Email" value={mfr.accountingEmail} onSave={v => patch('accountingEmail', v)} />
            <EditableField label="Acct Last Updated" value={mfr.acctLastUpdated} onSave={v => patch('acctLastUpdated', v)} />
          </div>
        </div>

        {/* Address */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Address</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <EditableField label="Address Line 1" value={mfr.address} onSave={v => patch('address', v)} />
            </div>
            <div className="col-span-2">
              <EditableField label="Address Line 2" value={mfr.address2} onSave={v => patch('address2', v)} />
            </div>
            <EditableField label="City" value={mfr.city} onSave={v => patch('city', v)} />
            <EditableField label="State" value={mfr.state} type="select" options={STATES_US} onSave={v => patch('state', v)} />
            <EditableField label="Zip" value={mfr.zip} onSave={v => patch('zip', v)} />
          </div>
        </div>

        {/* Account / Financial */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Account &amp; Financial</h2>
          <div className="grid grid-cols-2 gap-4">
            <EditableField label="Terms" value={mfr.terms} type="select" options={TERMS_OPTIONS} onSave={v => patch('terms', v)} />
            <EditableField label="Credit Limit" value={mfr.credit != null ? String(mfr.credit) : null} type="number" onSave={v => patch('credit', v)} />
            <EditableField label="FFA" value={mfr.ffa != null ? String(mfr.ffa) : null} type="number" onSave={v => patch('ffa', v)} />
            <EditableField label="Payment Info" value={mfr.paymentInfo} onSave={v => patch('paymentInfo', v)} />
            <Field label="Setup to Sell">
              <button onClick={() => patch('setupToSell', !mfr.setupToSell)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${mfr.setupToSell ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                {mfr.setupToSell ? 'YES' : 'NO'}
              </button>
            </Field>
          </div>
        </div>

        {/* Who quotes it (0144): buy direct uses the emails below, else the rep for the job's office. */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Buying</h2>
          <Field label="Buy direct">
            <button onClick={() => patch('buyDirect', !mfr.buyDirect)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${mfr.buyDirect ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
              {mfr.buyDirect ? 'YES' : 'NO'}
            </button>
          </Field>
          <p className="text-xs text-slate-500 mt-2 mb-4">
            {mfr.buyDirect ? 'RFQs go straight to this manufacturer, not a rep.' : "RFQs go to the default rep for the job's office. Turn on to skip the rep."}
          </p>
          {mfr.buyDirect && <EmailLists key={(mfr.emails || []).map(e => e.id).join()} emails={mfr.emails || []} onSave={saveEmails} />}
        </div>

        {!mfr.buyDirect && (
          <RepLinksCard side="manufacturer" ownerId={mfr.id} links={initial.repLinks || []} offices={offices} options={reps} onChanged={linksChanged} />
        )}

        {/* Notes */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Notes</h2>
          <EditableField label="" value={mfr.notes} onSave={v => patch('notes', v)} />
        </div>

        {/* Products list */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Products <span className="text-slate-400 font-normal">({mfr.products?.length ?? 0})</span>
            </h2>
            <Link href={`/products?mfr=${mfr.id}`}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              View in catalog →
            </Link>
          </div>
          {mfr.products?.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No products on file</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {mfr.products.map(p => (
                <Link key={p.id} href={`/products/${p.id}`}
                  className="flex items-center justify-between py-2 hover:bg-slate-50 -mx-2 px-2 rounded transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-blue-700">{p.partNumber}</span>
                    {p.description && <span className="text-xs text-slate-500 truncate max-w-xs">{p.description}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {p.fixtureType && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${p.fixtureType === 'CONTROL_DEVICE' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                        {p.fixtureType === 'CONTROL_DEVICE' ? 'Control' : 'Fixture'}
                      </span>
                    )}
                    {p.salePrice != null && <span className="text-xs font-mono text-slate-500">{fmtMoney(p.salePrice)}</span>}
                    <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <RecordHistory type="MANUFACTURER" id={mfr.id} version={version} />
      </div>
    </div>
  );
}
