'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import RecordHistory from '@/components/RecordHistory';
import { DEFAULT_RFQ_NOTES } from '@/lib/rfq/format';

// Admin > Our Offices (Mike 10-29, 0144). What prints on the top of each RFQ
// and who the rep replies to. A project picks which office works it.

const FIELDS = [
  { key: 'name', label: 'Office name' },
  { key: 'companyName', label: 'Company name on the RFQ', wide: true },
  { key: 'street', label: 'Street', wide: true },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
  { key: 'phone', label: 'Phone' },
  { key: 'pricingEmail', label: 'Send pricing to' },
  { key: 'ordersEmail', label: 'RFQ email replies to' },
];
const KEYS = [...FIELDS.map((f) => f.key), 'rfqNotes'];
const pick = (o) => Object.fromEntries(KEYS.map((k) => [k, o[k] || '']));

function Office({ office }) {
  const router = useRouter();
  const [form, setForm] = useState(() => pick(office));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const dirty = KEYS.some((k) => form[k] !== (office[k] || ''));

  async function save(body) {
    setBusy(true); setErr('');
    const res = await fetch(`/api/offices/${office.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setErr(d?.error || `The office was not saved${res ? ` (our server said ${res.status})` : ', no signal reaching our server'}. Try again. (OFFICE_SAVE)`); return; }
    router.refresh();
    setVersion((v) => v + 1);
  }

  return (
    <Card>
      <CardHeader title={office.name} actions={
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => save({ active: !office.active })}>{office.active ? 'Mark inactive' : 'Mark active'}</Button>
      } />
      <CardBody>
        {!office.active && <p className="text-sm text-slate-500 mb-3">Inactive. Projects cannot pick it.</p>}
        <div className="grid sm:grid-cols-3 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className={`block ${f.wide ? 'sm:col-span-3' : ''}`}>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</span>
              <input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
            </label>
          ))}
        </div>
        <label className="block mt-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">RFQ notes, one per line (blank uses the standard ones)</span>
          <textarea value={form.rfqNotes} onChange={(e) => setForm({ ...form, rfqNotes: e.target.value })}
            placeholder={DEFAULT_RFQ_NOTES.join('\n')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[6rem]" />
        </label>
        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
        {dirty && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" disabled={busy || !form.name.trim()} onClick={() => save(form)}>Save</Button>
            <Button size="sm" variant="secondary" onClick={() => { setForm(pick(office)); setErr(''); }}>Cancel</Button>
          </div>
        )}
        <div className="mt-4"><RecordHistory type="OUR_OFFICE" id={office.id} version={version} /></div>
      </CardBody>
    </Card>
  );
}

export default function OfficesClient({ offices }) {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/admin" className="hover:underline">Admin</Link><span>/</span><span className="text-slate-600">Our Offices</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Our Offices</h1>
        <p className="text-slate-500 text-sm mt-1">What prints at the top of each RFQ. Each project picks the office that works it.</p>
      </div>
      <div className="p-6 space-y-6">
        {offices.map((o) => <Office key={o.id} office={o} />)}
      </div>
    </div>
  );
}
