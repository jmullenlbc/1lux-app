'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AutoNumber from '@/components/ui/AutoNumber';
import EventFields from '@/components/events/EventFields';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { BTN_COMPACT, CARD_PADDED, CARD_TITLE, H1, HELPER, INPUT, LABEL, SELECT } from '@/components/ui/tokens';
import { EDITION_STATUSES } from '@/lib/conferences/constants';
import { money, moneyCents, dateText, placeText, TierPill, EventMarks, Pill, FIELD, goingPatch } from '@/components/events/eventsShared';

const Fact = ({ label, children }) => (children == null || children === '' ? null : (
  <div>
    <dt className={LABEL}>{label}</dt>
    <dd className="text-sm text-slate-800 mt-0.5 whitespace-pre-line">{children}</dd>
  </div>
));

// Reg + air + hotel + meals = per person, times who is going = planned.
function Ledger({ e }) {
  const lines = [
    ['Registration', e.priceLabel, e.reg],
    ['Airfare', e.isLocal ? 'Local, none' : `To ${e.state}`, e.airfare],
    ['Hotel', `${e.hotelNights} nights at ${money(e.hotelRate)}`, e.hotel],
    ['Meals', `${e.days} days at ${money(e.settings.perDiem)}`, e.meals],
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map(([label, how, amount]) => (
          <tr key={label} className="border-b border-slate-100">
            <td className="py-1.5 pr-3">{label}</td>
            <td className="py-1.5 pr-3 text-xs text-slate-500">{how}</td>
            <td className="py-1.5 text-right tabular-nums">{moneyCents(amount)}</td>
          </tr>
        ))}
        <tr className="border-b border-slate-200 font-medium">
          <td className="py-1.5 pr-3" colSpan={2}>Per person</td>
          <td className="py-1.5 text-right tabular-nums">{moneyCents(e.perPerson)}</td>
        </tr>
        <tr className="font-semibold">
          <td className="py-1.5 pr-3" colSpan={2}>Planned for {e.headcount} going</td>
          <td className="py-1.5 text-right tabular-nums">{moneyCents(e.plannedCost)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function EventClient({ id }) {
  const [e, setE] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [err, setErr] = useState('');
  const [people, setPeople] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conferences/editions/${id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `This event did not load on our server. Refresh to try again. (HTTP ${res.status})`);
      setE(body.edition);
      setCanEdit(body.canEdit);
      setErr('');
    } catch (x) {
      setErr(x instanceof TypeError ? 'No signal reaching our server. Check your connection and refresh.' : x.message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/users?department=SALES_MARKETING').then(r => (r.ok ? r.json() : { users: [] })).then(d => setPeople(d.users || [])).catch(() => {});
  }, []);

  async function save(body) {
    setErr('');
    try {
      const res = await fetch(`/api/conferences/editions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `The change did not save on our server. Try again. (HTTP ${res.status})`);
      await load();
      return true;
    } catch (x) {
      setErr(x instanceof TypeError ? 'No signal reaching our server. That change was not saved. Check your connection and try again.' : x.message);
      return false;
    }
  }

  const changed = e && (e.tierOverride || e.includeOverride !== null || e.headcountOverride !== null);

  return (
    <div className="px-4 py-6 pb-28">
      <div className="max-w-4xl mx-auto space-y-5">
        <Link href="/sales/events/plan" className="text-xs text-orange-600 hover:underline">Back to Plan</Link>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        {!e ? (!err && <WidgetLoading />) : (
          <>
            <div>
              <h1 className={H1}>{e.name}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{dateText(e)} · {placeText(e)}{e.organizer ? ` · ${e.organizer}` : ''}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <TierPill tier={e.tier} />
                <Pill>Score {e.score?.toFixed(2)}</Pill>
                {e.rank != null && <Pill>Rank {e.rank}</Pill>}
                <EventMarks r={e} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className={CARD_PADDED}>
                <h2 className={`${CARD_TITLE} mb-3`}>Cost model</h2>
                <Ledger e={e} />
              </div>

              <div className={CARD_PADDED}>
                <h2 className={`${CARD_TITLE} mb-3`}>Our plan</h2>
                {canEdit ? (
                  <div className="space-y-3">
                    <label className="block"><span className={LABEL}>Status</span>
                      <select className={SELECT} value={e.status} onChange={x => save({ status: x.target.value })}>
                        {EDITION_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </label>
                    <label className="block"><span className={LABEL}>Owner</span>
                      <select className={SELECT} value={e.ownerId || ''} onChange={x => save({ ownerId: x.target.value })}>
                        <option value="">Nobody yet</option>
                        {people.map(p => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
                      </select>
                    </label>
                    <label className="block"><span className={LABEL}>Going</span>
                      <AutoNumber className={`${FIELD} block w-20 text-right tabular-nums`} step="1" value={e.headcount} label="Going" onSave={v => save(goingPatch(v))} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block"><span className={LABEL}>Hotel a night</span>
                        <AutoNumber className={INPUT} value={e.hotelRateOverride} label="Hotel a night" placeholder={money(e.settings.hotelDefault)} onSave={v => save({ hotelRateOverride: v })} />
                      </label>
                      <label className="block"><span className={LABEL}>Airfare</span>
                        <AutoNumber className={INPUT} value={e.airfareOverride} label="Airfare" placeholder={money(e.airfare)} onSave={v => save({ airfareOverride: v })} />
                      </label>
                    </div>
                    <p className={HELPER}>Blank follows the planning rules. 0 means free.</p>
                    <label className="block"><span className={LABEL}>Notes</span>
                      <textarea key={`n${e.planNotes}`} rows={3} className={INPUT} defaultValue={e.planNotes || ''}
                        onBlur={x => { if (x.target.value.trim() !== (e.planNotes || '')) save({ planNotes: x.target.value }); }} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {changed && (
                        <button type="button" className={BTN_COMPACT} onClick={() => save({ tierOverride: null, includeOverride: null, headcountOverride: null })}>
                          Back to automatic tier, include and headcount
                        </button>
                      )}
                      <button type="button" className={BTN_COMPACT} onClick={async () => { await save({ archived: true }); window.location.href = '/sales/events/plan'; }}>
                        Archive this event
                      </button>
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-3">
                    <Fact label="Status">{e.statusLabel}</Fact>
                    <Fact label="Owner">{e.ownerName || 'Nobody yet'}</Fact>
                    <Fact label="Notes">{e.planNotes}</Fact>
                  </dl>
                )}
              </div>
            </div>

            <div className={CARD_PADDED}>
              <h2 className={`${CARD_TITLE} mb-3`}>Overview</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {canEdit ? <EventFields e={e} onSave={save} /> : (
                  <>
                    <Fact label="Vertical">{e.verticalLabel}</Fact>
                    <Fact label="Focus">{e.tagLabels.join(', ')}</Fact>
                    <Fact label="Format">{e.format}</Fact>
                    <Fact label="Access">{e.access}</Fact>
                    <Fact label="Registration">{money(e.reg)}</Fact>
                  </>
                )}
                <Fact label="Scope">{e.scopeLabel}</Fact>
                <Fact label="Region">{e.regionLabel}</Fact>
                <Fact label="Attendance">{e.attendance ? e.attendance.toLocaleString('en-US') : null}</Fact>
                <Fact label="Audience">{e.audience}</Fact>
                <Fact label="Last held">{e.priorDates}</Fact>
                <Fact label="Registration detail">{e.regCostDetail}</Fact>
                <Fact label="Sponsor starts at">{e.sponsorMinText}</Fact>
                <Fact label="Supplier limits">{e.supplierRestrictions}</Fact>
              </dl>
              <dl className="mt-4 space-y-4">
                <Fact label="About">{e.description}</Fact>
                <Fact label="Research notes">{e.researchNotes}</Fact>
              </dl>
              {(e.url || e.sources.length > 0) && (
                <div className="mt-4">
                  <p className={LABEL}>Links</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {[...new Set([e.url, ...e.sources].filter(Boolean))].map(u => (
                      <li key={u} className="truncate"><a href={u} target="_blank" rel="noreferrer" className="text-orange-600 hover:underline">{u}</a></li>
                    ))}
                  </ul>
                </div>
              )}
              {e.addedFrom && <p className={`${HELPER} mt-4`}>Added from: {e.addedFrom}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
