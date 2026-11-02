'use client';
import { useState } from 'react';
import SectionTabs, { EVENTS_TABS } from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import { WidgetLoading } from '@/components/ui/WidgetFrame';
import { BTN_COMPACT, BTN_COMPACT_PRIMARY, CARD_PADDED, CARD_TITLE, H1, HELPER, INPUT, LABEL } from '@/components/ui/tokens';
import { MEMBERSHIP_INCLUDE, verticalLabel, regionLabel } from '@/lib/conferences/constants';
import { useConferences, money, moneyCents, NotLoaded } from '@/components/events/eventsShared';

const SCENARIOS = [['lean', 'Lean', 'Tier A only'], ['core', 'Core', 'Tier A and B'], ['full', 'Full', 'Everything we could go to'], ['current', 'Current plan', 'What is ticked on Plan']];

function Breakdown({ title, rows, label = (k) => k }) {
  return (
    <div>
      <h3 className={`${LABEL} mb-1`}>{title}</h3>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(b => (
            <tr key={b.key} className="border-b border-slate-100">
              <td className="py-1 pr-2">{label(b.key)}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{b.events}</td>
              <td className="py-1 text-right tabular-nums">{money(b.planned)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Memberships({ result, canEdit, save }) {
  return (
    <div className={CARD_PADDED}>
      <h2 className={`${CARD_TITLE} mb-1`}>Memberships</h2>
      <p className={`${HELPER} mb-3`}>Automatic turns on when a ticked event needs the membership, and off when none does.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-3 font-medium">Membership</th>
              <th className="py-1 pr-3 font-medium">Include</th>
              <th className="py-1 pr-3 font-medium text-right">Dues</th>
              <th className="py-1 pr-3 font-medium text-right">Counted</th>
              <th className="py-1 font-medium text-right">Events unlocked</th>
            </tr>
          </thead>
          <tbody>
            {result.memberships.map(m => (
              <tr key={m.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 min-w-[160px]">
                  <span className="font-medium text-slate-900">{m.orgName}</span>
                  {m.notes && <p className="text-slate-500 mt-0.5">{m.notes}</p>}
                </td>
                <td className="py-2 pr-3">
                  {canEdit ? (
                    <select className="border border-slate-300 rounded px-1 py-0.5 text-xs bg-white" aria-label={`Include ${m.orgName}`} value={m.include}
                      onChange={e => save(`/api/conferences/memberships/${m.id}`, { include: e.target.value })}>
                      {MEMBERSHIP_INCLUDE.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  ) : MEMBERSHIP_INCLUDE.find(o => o.key === m.include)?.label}
                </td>
                <td className="py-2 pr-3 text-right">
                  {canEdit ? (
                    <input key={`${m.id}-${m.annualDues}`} type="number" min="0" className="border border-slate-300 rounded px-1 py-0.5 text-xs w-24 text-right tabular-nums"
                      aria-label={`Dues for ${m.orgName}`} defaultValue={m.annualDues ?? ''} placeholder="Not priced"
                      onBlur={e => { if ((e.target.value === '' ? null : Number(e.target.value)) !== m.annualDues) save(`/api/conferences/memberships/${m.id}`, { annualDues: e.target.value }); }} />
                  ) : money(m.annualDues)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{m.on ? money(m.duesCounted) : ''}</td>
                <td className="py-2 text-right tabular-nums">{m.unlocks.length ? m.unlockedCount : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const pct = (n) => Math.round(n * 1000) / 10;
const NumberBox = ({ label, value, onChange, step = 'any', suffix }) => (
  <label className="block">
    <span className={LABEL}>{label}</span>
    <span className="flex items-center gap-1">
      <input type="number" step={step} className={`${INPUT} tabular-nums`} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
      {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
    </span>
  </label>
);

// Every number the score and cost math reads. Weights show as percents.
function PlanningRules({ data, save }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(null);
  const [cap, setCap] = useState(data.plan.budgetCap ?? '');
  const [busy, setBusy] = useState(false);
  const settings = s || data.settings;

  const put = (head, sub, v) => setS(prev => {
    const next = structuredClone(prev || data.settings);
    if (sub === null) next[head] = v; else next[head][sub] = v;
    return next;
  });
  const weightTotal = Math.round(Object.values(settings.weights).reduce((a, b) => a + (b || 0), 0) * 1000) / 10;

  async function submit() {
    setBusy(true);
    const ok = await save('/api/conferences/plan', { settings, budgetCap: cap });
    setBusy(false);
    if (ok) setS(null);
  }

  return (
    <div className={CARD_PADDED}>
      <button type="button" className={`${CARD_TITLE} w-full text-left`} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        Planning rules <span className="font-normal text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-5">
          <div className="max-w-xs"><NumberBox label="Budget cap" value={cap === '' ? '' : Number(cap)} onChange={v => setCap(Number.isNaN(v) ? '' : v)} /></div>
          <section>
            <h3 className={`${LABEL} mb-2`}>Score weights {weightTotal !== 100 && <span className="text-red-600">Adds up to {weightTotal}%, should be 100%</span>}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.keys(settings.weights).map(k => (
                <NumberBox key={k} label={k.replace(/([A-Z])/g, ' $1').toLowerCase()} suffix="%" value={pct(settings.weights[k])} onChange={v => put('weights', k, v / 100)} />
              ))}
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-2`}>Tiers and headcount</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <NumberBox label="Tier A score" value={settings.tiers.A} onChange={v => put('tiers', 'A', v)} />
              <NumberBox label="Tier B score" value={settings.tiers.B} onChange={v => put('tiers', 'B', v)} />
              {['A', 'B', 'C'].map(t => <NumberBox key={t} label={`Going, Tier ${t}`} value={settings.headcount[t]} onChange={v => put('headcount', t, v)} />)}
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-2`}>Vertical priority and market fit (1 to 5)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.keys(settings.verticalPriority).map(k => <NumberBox key={k} label={verticalLabel(k)} value={settings.verticalPriority[k]} onChange={v => put('verticalPriority', k, v)} />)}
              {Object.keys(settings.marketFit).map(k => <NumberBox key={k} label={k.toLowerCase()} value={settings.marketFit[k]} onChange={v => put('marketFit', k, v)} />)}
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-2`}>Score bands: attendance, then cost per person</h3>
            <div className="grid grid-cols-4 gap-3">
              {settings.reachBands.map((v, i) => <NumberBox key={`r${i}`} label={`Attendance ${5 - i}`} value={v} onChange={x => put('reachBands', i, x)} />)}
              {settings.costBands.map((v, i) => <NumberBox key={`c${i}`} label={`Cost ${5 - i}`} value={v} onChange={x => put('costBands', i, x)} />)}
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-2`}>Travel</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <NumberBox label="Hotel a night" value={settings.hotelDefault} onChange={v => put('hotelDefault', null, v)} />
              <NumberBox label="Per diem" value={settings.perDiem} onChange={v => put('perDiem', null, v)} />
              <NumberBox label="Days if no dates" value={settings.defaultDays} onChange={v => put('defaultDays', null, v)} />
              <NumberBox label="Extra hotel nights" value={settings.extraHotelNights} onChange={v => put('extraHotelNights', null, v)} />
              <NumberBox label="Contingency" suffix="%" value={pct(settings.contingency)} onChange={v => put('contingency', null, v / 100)} />
              <NumberBox label="Sponsor placeholder" value={settings.sponsorPlaceholder} onChange={v => put('sponsorPlaceholder', null, v)} />
            </div>
          </section>
          <section>
            <h3 className={`${LABEL} mb-1`}>Airfare from Denver, by state</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-10 gap-2">
              {Object.keys(settings.airfareByState).map(k => <NumberBox key={k} label={k} value={settings.airfareByState[k]} onChange={v => put('airfareByState', k, v)} />)}
            </div>
          </section>
          <button type="button" className={BTN_COMPACT_PRIMARY} disabled={busy} onClick={submit}>{busy ? 'Saving...' : 'Save rules'}</button>
        </div>
      )}
    </div>
  );
}

// What the plan costs under each scenario, with memberships on top.
export default function BudgetClient() {
  const { data, err, loading, save } = useConferences();
  const result = data?.result;

  return (
    <div className="px-4 py-6 pb-28">
      <SectionTabs tabs={EVENTS_TABS} className="mb-5" />
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={H1}>Budget</h1>
            <p className="text-xs text-slate-500 mt-0.5">The {data?.plan?.year || ''} plan under each scenario. Totals include contingency.</p>
          </div>
          {data?.loaded && <a href="/api/conferences/export" className={BTN_COMPACT}>Export to Excel</a>}
        </div>
        {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        {loading ? <WidgetLoading /> : data && !data.loaded ? <div className={CARD_PADDED}><NotLoaded canLoad={data.canEdit} /></div> : result && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {SCENARIOS.map(([key, label, hint]) => {
                const s = result.scenarios[key];
                return <StatTile key={key} label={label} value={moneyCents(s.total)} sub={`${s.events} events, ${s.attendeeTrips} trips. ${hint}. Subtotal ${money(s.subtotal)} plus ${money(s.contingency)} contingency.`} />;
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatTile label="Current plan plus memberships" value={moneyCents(result.grandTotal)} tone="brand" />
              <StatTile label="Dues counted" value={moneyCents(result.dues)} />
              <StatTile label="Against budget cap" value={result.vsCap == null ? 'No cap set' : moneyCents(Math.abs(result.vsCap))}
                sub={result.vsCap == null ? 'Set one under Planning rules' : result.vsCap < 0 ? 'Over' : 'Under'}
                tone={result.vsCap != null && result.vsCap < 0 ? 'danger' : 'default'} />
            </div>

            <Memberships result={result} canEdit={data.canEdit} save={save} />

            <div className={CARD_PADDED}>
              <h2 className={`${CARD_TITLE} mb-3`}>Where the current plan goes</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Breakdown title="By quarter" rows={result.byQuarter} label={k => (k === 'TBD' ? 'Date TBD' : k)} />
                <Breakdown title="By vertical" rows={result.byVertical} label={verticalLabel} />
                <Breakdown title="By region" rows={result.byRegion} label={regionLabel} />
              </div>
            </div>

            {data.canEdit && <PlanningRules data={data} save={save} />}
          </>
        )}
      </div>
    </div>
  );
}
