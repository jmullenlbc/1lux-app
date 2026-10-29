'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';

// Who sells what, by ILC office (0144). Used on both sides:
//   side="rep"           a rep's manufacturers  (pick a manufacturer to add)
//   side="manufacturer"  a manufacturer's reps  (pick a rep to add)
// The default is the rep an RFQ goes to for that office unless the project
// picks another one.

async function send(url, method, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body && { body: JSON.stringify(body) }) }).catch(() => null);
  const d = await res?.json().catch(() => ({}));
  if (!res) return { error: 'No signal reaching our server. Nothing was changed. Check the connection and try again. (LINK_OFFLINE)' };
  if (!res.ok) return { error: d?.error || `Our server said no (${res.status}). Nothing was changed. (LINK_${res.status})` };
  return d;
}

export default function RepLinksCard({ side, ownerId, links, offices, options, onChanged, title }) {
  const [pick, setPick] = useState('');
  const [office, setOffice] = useState(offices[0]?.id || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const other = (l) => (side === 'rep' ? l.manufacturer : l.salesRep);
  const href = (l) => (side === 'rep' ? `/manufacturers/${l.manufacturerId}` : `/sales-reps/${l.salesRepId}`);
  const byName = useMemo(() => new Map(options.map((o) => [o.name.toUpperCase(), o])), [options]);

  const groups = useMemo(() => {
    const out = [...offices.map((o) => ({ id: o.id, name: o.name, links: [] })), { id: null, name: 'All offices', links: [] }];
    for (const l of links.filter((x) => x.active !== false)) (out.find((g) => g.id === (l.officeId || null)) || out[out.length - 1]).links.push(l);
    for (const g of out) g.links.sort((a, b) => (b.isDefault - a.isDefault) || (other(a)?.name || '').localeCompare(other(b)?.name || ''));
    return out.filter((g) => g.links.length || g.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, offices, side]);

  async function run(fn) {
    setBusy(true); setErr('');
    const d = await fn();
    setBusy(false);
    if (d.error) { setErr(d.error); return false; }
    onChanged?.();
    return true;
  }

  async function add() {
    const o = byName.get(pick.trim().toUpperCase());
    if (!o) { setErr(`Pick a ${side === 'rep' ? 'manufacturer' : 'rep'} from the list. Nothing was changed. (LINK_PICK)`); return; }
    const body = side === 'rep' ? { salesRepId: ownerId, manufacturerId: o.id } : { manufacturerId: ownerId, salesRepId: o.id };
    if (await run(() => send('/api/manufacturer-reps', 'POST', { ...body, officeId: office || null }))) setPick('');
  }

  const listId = `link-options-${side}`;
  return (
    <Card>
      <CardHeader title={title || (side === 'rep' ? 'Manufacturers by office' : 'Reps by office')} />
      <CardBody>
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id || 'all'}>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{g.name}</div>
              {!g.links.length && <p className="text-sm text-slate-400">None</p>}
              <ul className="divide-y divide-slate-100">
                {g.links.map((l) => (
                  <li key={l.id} className="py-1.5 flex items-center gap-3 text-sm">
                    <Link href={href(l)} className="text-slate-800 hover:text-orange-600 flex-1 truncate">{other(l)?.name}</Link>
                    {l.notes && <span className="text-xs text-slate-400 truncate max-w-xs" title={l.notes}>{l.notes}</span>}
                    {l.isDefault
                      ? <span className="text-xs font-semibold text-orange-600">Default</span>
                      : <button disabled={busy} className="text-xs text-slate-500 hover:text-orange-600" onClick={() => run(() => send(`/api/manufacturer-reps/${l.id}`, 'PATCH', { isDefault: true }))}>Make default</button>}
                    <button disabled={busy} className="text-xs text-slate-400 hover:text-red-600"
                      onClick={() => window.confirm(`Remove ${other(l)?.name} from ${g.name}?`) && run(() => send(`/api/manufacturer-reps/${l.id}`, 'DELETE'))}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <input list={listId} value={pick} onChange={(e) => setPick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder={side === 'rep' ? 'Add a manufacturer' : 'Add a rep'} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-64" />
            <datalist id={listId}>{options.map((o) => <option key={o.id} value={o.name} />)}</datalist>
            <select value={office} onChange={(e) => setOffice(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value="">All offices</option>
            </select>
            <Button size="sm" onClick={add} disabled={busy || !pick.trim()}>Add</Button>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </CardBody>
    </Card>
  );
}
