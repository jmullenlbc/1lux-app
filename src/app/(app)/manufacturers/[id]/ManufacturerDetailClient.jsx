'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import RecordHistory from '@/components/RecordHistory';
import EmailLists from '@/components/salesReps/EmailLists';
import RepLinksCard from '@/components/salesReps/RepLinksCard';
import { rfqNumber, showDate } from '@/lib/rfq/format';

// One manufacturer, built the same as one rep (Mike 10-29): details, buying,
// reps by office, RFQs, products, and the history of every change.

const TERMS_OPTIONS = ['NET 30', 'NET 45', 'NET 60', '1%/10 NET 25th', 'PAY IN ADVANCE', 'COD'];

const FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'website', label: 'Website' },
  { key: 'mainPhone', label: 'Main phone' },
  { key: 'accountingEmail', label: 'Accounting email' },
  { key: 'address', label: 'Street' },
  { key: 'address2', label: 'Street line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
  { key: 'terms', label: 'Terms', options: TERMS_OPTIONS },
  { key: 'credit', label: 'Credit limit' },
  { key: 'ffa', label: 'FFA' },
  { key: 'paymentInfo', label: 'Payment info' },
  { key: 'acctLastUpdated', label: 'Account last updated' },
];
const KEYS = [...FIELDS.map((f) => f.key), 'notes'];
const asText = (v) => (v == null ? '' : String(v));
const formOf = (m) => Object.fromEntries(KEYS.map((k) => [k, asText(m[k])]));

function money(n) {
  return n == null ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function patch(id, body) {
  const res = await fetch(`/api/manufacturers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res) return 'No signal reaching our server. Nothing was saved. Check the connection and try again. (MFR_OFFLINE)';
  if (res.status === 403) return 'Your login cannot edit manufacturer details. Nothing was saved. Ask an admin for the Edit products permission. (MFR_403)';
  if (!res.ok) return d?.error || `Our server said no (${res.status}). Nothing was saved. (MFR_${res.status})`;
  return null;
}

export default function ManufacturerDetailClient({ manufacturer: mfr, offices = [], reps = [], rfqs = [] }) {
  const router = useRouter();
  const [form, setForm] = useState(() => formOf(mfr));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const dirty = KEYS.some((k) => form[k] !== asText(mfr[k]));

  const done = () => { router.refresh(); setVersion((v) => v + 1); };

  async function save(body) {
    setBusy(true); setErr('');
    const e = await patch(mfr.id, body);
    setBusy(false);
    if (e) { setErr(e); return e; }
    done();
    return null;
  }

  // Only the fields that changed go up, so the history shows just those.
  const changed = () => Object.fromEntries(KEYS.filter((k) => form[k] !== asText(mfr[k])).map((k) => [k, form[k]]));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/manufacturers" className="hover:underline">Manufacturers</Link><span>/</span><span className="text-slate-600">{mfr.name}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">{mfr.name}</h1>
          {mfr.setupToSell && <span className="text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5">Setup to sell</span>}
          {mfr.buyDirect && <span className="text-xs font-semibold text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">Buy direct</span>}
          {!mfr.active && <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">Archived</span>}
          <span className="text-xs font-mono text-slate-400">#{mfr.numericId}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => save({ active: !mfr.active })}>
              {mfr.active ? 'Archive' : 'Restore'}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => save({ setupToSell: !mfr.setupToSell })}>
              {mfr.setupToSell ? 'Mark not setup to sell' : 'Mark setup to sell'}
            </Button>
          </div>
        </div>
        {!mfr.active && <p className="text-sm text-slate-500 mt-1">Archived manufacturers are hidden from the list and pickers. Products, reps and history stay. Nothing is deleted.</p>}
      </div>

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</span>
                  {f.options ? (
                    <select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white">
                      <option value="">None</option>
                      {[...new Set([...f.options, form[f.key]].filter(Boolean))].map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.key === 'credit' || f.key === 'ffa' ? money(0) : ''}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                  )}
                </label>
              ))}
            </div>
            <label className="block mt-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[4rem]" />
            </label>
            {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
            {dirty && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" disabled={busy || !form.name.trim()} onClick={() => save(changed())}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => { setForm(formOf(mfr)); setErr(''); }}>Cancel</Button>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Buying" actions={
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => save({ buyDirect: !mfr.buyDirect })}>
              {mfr.buyDirect ? 'Buy through a rep' : 'Buy direct'}
            </Button>
          } />
          <CardBody>
            <p className="text-sm text-slate-500">
              {mfr.buyDirect ? 'RFQs go straight to this manufacturer’s Quotes emails, not a rep.' : 'RFQs go to the default rep for the job’s office, below.'}
            </p>
            {mfr.buyDirect && (
              <div className="mt-3">
                <EmailLists key={(mfr.emails || []).map((e) => e.id).join()} emails={mfr.emails || []} onSave={(emails) => save({ emails })} />
              </div>
            )}
          </CardBody>
        </Card>

        {!mfr.buyDirect && (
          <RepLinksCard side="manufacturer" ownerId={mfr.id} links={mfr.repLinks || []} offices={offices} options={reps} onChanged={done} />
        )}

        <Card>
          <CardHeader title="RFQs for this manufacturer" />
          <CardBody>
            {!rfqs.length && <p className="text-sm text-slate-400">None yet.</p>}
            {rfqs.length > 0 && (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {rfqs.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5 font-mono text-slate-700">{rfqNumber(r.number)}</td>
                      <td className="py-1.5"><Link href={`/project/${r.project.id}?tab=rfqs`} className="text-slate-800 hover:text-orange-600">{r.project.name}</Link></td>
                      <td className="py-1.5 text-slate-500">To {r.toName}</td>
                      <td className="py-1.5 text-slate-500">Sent {showDate(r.createdAt)}</td>
                      <td className="py-1.5 text-slate-500">{r.status === 'RECEIVED' ? 'Received' : `Need by ${showDate(r.needBy)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={`Products (${mfr.products?.length ?? 0})`} actions={
            <Link href={`/products?mfr=${mfr.id}`} className="text-sm text-slate-600 hover:text-orange-600">Open in the catalog</Link>
          } />
          <CardBody>
            {!mfr.products?.length && <p className="text-sm text-slate-400">No products on file.</p>}
            {mfr.products?.length > 0 && (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {mfr.products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-1.5 font-mono"><Link href={`/products/${p.id}`} className="text-slate-800 hover:text-orange-600">{p.partNumber}</Link></td>
                      <td className="py-1.5 text-slate-500">{p.description}</td>
                      <td className="py-1.5 text-slate-500">{p.fixtureType === 'CONTROL_DEVICE' ? 'Control' : p.fixtureType ? 'Fixture' : ''}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">{money(p.salePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <RecordHistory type="MANUFACTURER" id={mfr.id} version={version} />
      </div>
    </div>
  );
}
