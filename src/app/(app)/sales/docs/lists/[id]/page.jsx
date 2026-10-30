'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import SectionTabs, { SALES_DOCS_TABS } from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import { WidgetLoading, WidgetEmpty } from '@/components/ui/WidgetFrame';
import { CARD_PADDED, CARD_TITLE, H1, HELPER, INPUT, LABEL, TD, BTN_COMPACT, BTN_COMPACT_PRIMARY } from '@/components/ui/tokens';
import { jsonCall } from '@/components/campaigns/CampaignUi';

// One email list (0147). A rules list: pick field and value rows; rows on the
// same field mean "any of these", different fields mean "and". A picked list:
// search people and add them; remove with the row checkboxes.

export default function EmailListPage({ params }) {
  const { id } = params;
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const load = useCallback(async () => {
    const res = await fetch(`/api/campaign-lists/${id}`);
    if (!res.ok) { setErr('We could not load this list. It may have been moved. Nothing changed. Go back to Email lists. (CAMPAIGN_LIST_LOAD)'); return; }
    const data = await res.json();
    setD(data);
    setName(data.list.name);
    setNotes(data.list.notes || '');
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function patch(body, done) {
    setErr(''); setMsg('');
    const r = await jsonCall(`/api/campaign-lists/${id}`, 'PATCH', body);
    if (r.error) { setErr(r.error); return; }
    setMsg(done);
    load();
  }

  if (err && !d) return <div className="px-4 py-6"><p className="text-sm text-red-600">{err}</p></div>;
  if (!d) return <div className="px-4 py-6"><WidgetLoading /></div>;
  const { list, counts } = d;
  const archived = !!list.archivedAt;

  return (
    <div className="px-4 py-6">
      <SectionTabs tabs={SALES_DOCS_TABS} active="lists" className="mb-5" />
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href="/sales/docs/lists" className="text-xs text-slate-500 hover:text-orange-600">Email lists</Link>
            <h1 className={H1}>{list.name}{archived && <span className="ml-2 text-sm font-normal text-slate-500">Archived</span>}</h1>
            <p className={HELPER}>{list.kind === 'FIXED' ? 'Picked people' : 'Rules list: follows the CRM by itself'}</p>
          </div>
          <button type="button" className={BTN_COMPACT} onClick={() => patch({ archived: !archived }, archived ? 'Restored.' : 'Archived.')}>{archived ? 'Restore' : 'Archive'}</button>
        </div>

        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        {msg && <p className="text-xs text-emerald-700">{msg}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Will get it" value={counts.ready} />
          <StatTile label="No email" value={counts.noEmail} />
          <StatTile label="Do not email" value={counts.suppressed} />
          <StatTile label="Same address twice" value={counts.duplicate} />
        </div>

        <div className={CARD_PADDED}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={LABEL}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} /></label>
            <label className="block"><span className={LABEL}>Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} /></label>
          </div>
          <button type="button" className={`${BTN_COMPACT} mt-3`} disabled={!name.trim()} onClick={() => patch({ name, notes }, 'Saved.')}>Save</button>
        </div>

        {list.kind === 'FILTER'
          ? <RulesEditor list={list} onSave={(rules) => patch({ rules }, 'Rules saved.')} />
          : <Members id={id} members={d.members} onChanged={load} onError={setErr} />}

        <div className={CARD_PADDED}>
          <p className={CARD_TITLE}>Who it reaches</p>
          <p className={`${HELPER} mt-0.5`}>The first 50 people, plus anyone held back by the do-not-email list.</p>
          <div className="mt-3 overflow-x-auto">
            {!d.sample.length ? <WidgetEmpty>Nobody yet.</WidgetEmpty> : (
              <table className="min-w-full">
                <tbody className="divide-y divide-slate-100">
                  {d.sample.map((r) => (
                    <tr key={`${r.contactId}-${r.email}`}>
                      <td className={TD}>{r.name || r.email}</td>
                      <td className={`${TD} text-xs text-slate-500`}>{r.email}</td>
                      <td className={`${TD} text-xs`}>{r.suppressed ? <span className="text-red-600">Do not email</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RulesEditor({ list, onSave }) {
  const [opts, setOpts] = useState(null);
  const [rules, setRules] = useState(() => (list.rules || []).map((r) => ({ field: r.field, value: r.value })));
  const [field, setField] = useState('');
  useEffect(() => {
    fetch('/api/campaign-lists/options').then((r) => (r.ok ? r.json() : null)).then(setOpts).catch(() => setOpts(null));
  }, []);
  if (!opts) return <div className={CARD_PADDED}><WidgetLoading /></div>;
  const fieldLabel = Object.fromEntries(opts.fields.map((f) => [f.value, f.label]));
  const valueLabel = (f, v) => opts.values[f]?.find((o) => o.value === v)?.label || v;
  const add = (value) => {
    if (!value || rules.some((r) => r.field === field && r.value === value)) return;
    setRules([...rules, { field, value }]);
  };
  const grouped = opts.fields.map((f) => ({ ...f, rows: rules.filter((r) => r.field === f.value) })).filter((g) => g.rows.length);

  return (
    <div className={CARD_PADDED}>
      <p className={CARD_TITLE}>Rules</p>
      <p className={`${HELPER} mt-0.5`}>Values under one heading mean any of them. Different headings must all match.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={field} onChange={(e) => setField(e.target.value)} className={`${INPUT} w-auto`}>
          <option value="">Pick what to match</option>
          {opts.fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {field && (
          <select value="" onChange={(e) => add(e.target.value)} className={`${INPUT} w-auto`}>
            <option value="">Add a {fieldLabel[field].toLowerCase()}</option>
            {(opts.values[field] || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {!grouped.length && <WidgetEmpty>No rules yet. With no rules, the list reaches nobody.</WidgetEmpty>}
        {grouped.map((g) => (
          <div key={g.value}>
            <span className={LABEL}>{g.label}</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {g.rows.map((r) => (
                <span key={r.value} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {valueLabel(r.field, r.value)}
                  <button type="button" aria-label="Take off" className="text-slate-400 hover:text-red-600" onClick={() => setRules(rules.filter((x) => x !== r))}>x</button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className={`${BTN_COMPACT_PRIMARY} mt-3`} onClick={() => onSave(rules)}>Save rules</button>
    </div>
  );
}

function Members({ id, members, onChanged, onError }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const inList = useMemo(() => new Set(members.map((m) => m.contactId)), [members]);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setHits([]); return undefined; }
    const t = setTimeout(() => {
      fetch(`/api/crm/contacts?search=${encodeURIComponent(s)}`).then((r) => (r.ok ? r.json() : { contacts: [] })).then((d) => setHits((d.contacts || []).slice(0, 15))).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function send(ids, remove) {
    const r = await jsonCall(`/api/campaign-lists/${id}/members`, 'POST', { ids, remove });
    if (r.error) { onError(r.error); return; }
    setPicked(new Set());
    onChanged();
  }
  const toggle = (cid) => setPicked((p) => { const n = new Set(p); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });
  const allOn = members.length > 0 && picked.size === members.length;

  return (
    <div className={CARD_PADDED}>
      <p className={CARD_TITLE}>People on this list</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people to add" className={`${INPUT} mt-3 max-w-md`} />
      {hits.length > 0 && (
        <ul className="mt-2 max-w-md divide-y divide-slate-100 rounded-lg border border-slate-200">
          {hits.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span>{c.name}<span className="ml-2 text-xs text-slate-500">{c.email || 'No email'}</span></span>
              {inList.has(c.id) ? <span className="text-xs text-slate-500">On the list</span> : <button type="button" className={BTN_COMPACT} onClick={() => send([c.id], false)}>Add</button>}
            </li>
          ))}
        </ul>
      )}
      {picked.size > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
          <span className="text-sm text-slate-700">{picked.size} picked</span>
          <button type="button" className={BTN_COMPACT} onClick={() => send([...picked], true)}>Remove from list</button>
        </div>
      )}
      <div className="mt-3 overflow-x-auto">
        {!members.length ? <WidgetEmpty>Nobody yet. Search above to add people.</WidgetEmpty> : (
          <table className="min-w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="accent-orange-500" aria-label="Select all" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(members.map((m) => m.contactId)))} /></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Person</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Company</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2"><input type="checkbox" className="accent-orange-500" checked={picked.has(m.contactId)} onChange={() => toggle(m.contactId)} /></td>
                  <td className={TD}>{m.contact.name}<div className="text-xs text-slate-500">{m.contact.email || 'No email'}</div></td>
                  <td className={TD}>{m.contact.client ? <Link href={`/clients/${m.contact.client.id}`} className="hover:text-orange-600">{m.contact.client.name}</Link> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
