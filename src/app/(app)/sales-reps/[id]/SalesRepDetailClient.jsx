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

// One rep (Mike 10-29, 0144): details, emails, manufacturers by office, RFQs
// sent to them, and the history of every change.

const FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'abbreviation', label: 'Abbreviation' },
  { key: 'mainPhone', label: 'Main phone' },
  { key: 'secondPhone', label: 'Second phone' },
  { key: 'street', label: 'Street' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
];

async function patch(id, body) {
  const res = await fetch(`/api/sales-reps/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res) return 'No signal reaching our server. Nothing was saved. Check the connection and try again. (REP_OFFLINE)';
  if (!res.ok) return d?.error || `Our server said no (${res.status}). Nothing was saved. (REP_${res.status})`;
  return null;
}

export default function SalesRepDetailClient({ rep, offices, manufacturers }) {
  const router = useRouter();
  const [form, setForm] = useState(() => Object.fromEntries([...FIELDS.map((f) => [f.key, rep[f.key] || '']), ['notes', rep.notes || '']]));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const dirty = [...FIELDS.map((f) => f.key), 'notes'].some((k) => (form[k] || '') !== (rep[k] || ''));

  const done = () => { router.refresh(); setVersion((v) => v + 1); };

  async function save(body) {
    setBusy(true); setErr('');
    const e = await patch(rep.id, body);
    setBusy(false);
    if (e) { setErr(e); return e; }
    done();
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-6 py-8 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/sales-reps" className="hover:underline">Sales Reps</Link><span>/</span><span className="text-slate-600">{rep.name}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-900">{rep.name}</h1>
          {!rep.active && <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">Archived</span>}
          <div className="ml-auto">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => save({ active: !rep.active })}>
              {rep.active ? 'Archive' : 'Restore'}
            </Button>
          </div>
        </div>
        {!rep.active && <p className="text-sm text-slate-500 mt-1">Archived reps are hidden and never picked for an RFQ. Their past RFQs stay. Nothing is deleted.</p>}
      </div>

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</span>
                  <input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
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
                <Button size="sm" disabled={busy || !form.name.trim()} onClick={() => save(form)}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => { setForm(Object.fromEntries([...FIELDS.map((f) => [f.key, rep[f.key] || '']), ['notes', rep.notes || '']])); setErr(''); }}>Cancel</Button>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Emails" />
          <CardBody>
            <EmailLists key={rep.emails.map((e) => e.id).join()} emails={rep.emails} onSave={(emails) => save({ emails })} />
          </CardBody>
        </Card>

        <RepLinksCard side="rep" ownerId={rep.id} links={rep.links} offices={offices} options={manufacturers} onChanged={done} />

        <Card>
          <CardHeader title="RFQs sent to this rep" />
          <CardBody>
            {!rep.rfqs.length && <p className="text-sm text-slate-400">None yet.</p>}
            {rep.rfqs.length > 0 && (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {rep.rfqs.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5 font-mono text-slate-700">{rfqNumber(r.number)}</td>
                      <td className="py-1.5"><Link href={`/project/${r.project.id}?tab=rfqs`} className="text-slate-800 hover:text-orange-600">{r.project.name}</Link></td>
                      <td className="py-1.5 text-slate-500">Sent {showDate(r.createdAt)}</td>
                      <td className="py-1.5 text-slate-500">{r.status === 'RECEIVED' ? 'Received' : `Need by ${showDate(r.needBy)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <RecordHistory type="SALES_REP" id={rep.id} version={version} />
      </div>
    </div>
  );
}
