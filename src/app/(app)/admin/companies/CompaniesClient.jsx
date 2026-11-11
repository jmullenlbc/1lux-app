'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import RecordHistory from '@/components/RecordHistory';
import { brandFor, confidentialLine } from '@/lib/brand';

// Admin > Companies (2026-11-10). What a LOGIQ, SAGE or Shift job's client PDFs and emails print. A blank field
// is left off the documents. Jobs with no company yet print 1LUX.

const FIELDS = [
  { key: 'name', label: 'Short name (badges, email subjects)' },
  { key: 'legalName', label: 'Name on documents', wide: true },
  { key: 'address', label: 'Address (one line)', wide: true },
  { key: 'phone', label: 'Phone' },
  { key: 'ordersEmail', label: 'Email on documents' },
  { key: 'website', label: 'Website' },
];
const KEYS = FIELDS.map((f) => f.key);
const pick = (o) => Object.fromEntries(KEYS.map((k) => [k, o[k] || '']));

function Company({ unit }) {
  const router = useRouter();
  const [form, setForm] = useState(() => pick(unit));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const dirty = KEYS.some((k) => form[k] !== (unit[k] || ''));

  async function save() {
    setBusy(true); setErr('');
    const res = await fetch(`/api/business-units/${unit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setErr(d?.error || `The company was not saved${res ? ` (our server said ${res.status})` : ', no signal reaching our server'}. Try again.`); return; }
    router.refresh();
    setVersion((v) => v + 1);
  }

  return (
    <Card>
      <CardHeader title={unit.name} />
      <CardBody>
        <div className="grid sm:grid-cols-3 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className={`block ${f.wide ? 'sm:col-span-3' : ''}`}>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</span>
              <input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          PDF footer: <span className="text-slate-700">{confidentialLine(brandFor({ ...unit, ...form }))}</span>
        </p>
        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
        {dirty && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" disabled={busy || !form.name.trim()} onClick={save}>Save</Button>
            <Button size="sm" variant="secondary" onClick={() => { setForm(pick(unit)); setErr(''); }}>Cancel</Button>
          </div>
        )}
        <div className="mt-4"><RecordHistory type="BUSINESS_UNIT" id={unit.id} version={version} /></div>
      </CardBody>
    </Card>
  );
}

export default function CompaniesClient({ units }) {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/admin" className="hover:underline">Admin</Link><span>/</span><span className="text-slate-600">Companies</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
        <p className="text-slate-500 text-sm mt-1">
          What each company&apos;s client PDFs and emails print. A blank field is left off. Jobs with no company yet print 1LUX.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {units.map((u) => <Company key={u.id} unit={u} />)}
      </div>
    </div>
  );
}
