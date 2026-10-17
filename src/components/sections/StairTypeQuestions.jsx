'use client';
import QuestionCard from './QuestionCard';
import { PRICING } from '@/lib/pricing';
import { STAIR_TYPES, BREEZEWAY_STYLES, stairTypeFor, breezewayMultiplier } from '@/lib/stairLandings';

/**
 * The stair questions on both Corridors screens (Mike 2026-09-14):
 *  1. Interior corridors + stairwells, or exterior breezeways, one dropdown,
 *     following the building type until someone answers it.
 *  2. Small vs long breezeway, only when the project has drawings to judge
 *     from ("No one will know what that means" otherwise). Without drawings a
 *     breezeway landing prices at the average of the two.
 */
export default function StairTypeQuestions({ ans, set, projectData, pricing, hasDrawings = false, stairwells = 0, impact }) {
  const P = pricing || PRICING;
  const STAIR_EACH = P.corridors?.stairwellPerLanding?.product ?? PRICING.corridors.stairwellPerLanding.product;
  const type = stairTypeFor(ans.stairType, projectData?.buildingTypeKey);
  const rate = s => Math.round(STAIR_EACH * breezewayMultiplier(s, P) * 100) / 100;
  const money = v => `$${Number(v).toLocaleString()}`;
  const landings = stairwells > 0 ? ` (${stairwells} landings)` : '';

  const hint = type === 'interior'
    ? `${money(STAIR_EACH)} a landing, a 4ft LED strip with battery backup.${landings}`
    : hasDrawings
      ? `Pick small or long below, from the drawings.${landings}`
      : `${money(rate('average'))} a landing, halfway between a small (${money(rate('small'))}) and a long (${money(rate('long'))}) breezeway. Once drawings are uploaded you can pick one.${landings}`;

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <label htmlFor="corridors-stair-type" className="block text-sm font-semibold text-slate-900">
          Corridors &amp; stairs, interior or exterior?
        </label>
        <select
          id="corridors-stair-type"
          value={type}
          onChange={e => set('stairType', e.target.value)}
          className="w-full sm:w-96 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          {Object.entries(STAIR_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
        <p className="text-xs text-slate-500">{hint}</p>
        {!ans.stairType && (
          <p className="text-xs text-slate-400">Filled in from the building type, change it if that is wrong.</p>
        )}
      </div>

      {type === 'breezeway' && hasDrawings && (
        <QuestionCard
          question="Breezeway style? (from the drawings)"
          note={`Open breezeway stairs light each landing at the stairwell rate (${money(STAIR_EACH)}) plus the wall packs, disks and frogeyes the breezeway adds.${landings}`}
          costSuffix=" total"
          options={['small', 'long', 'average'].map(s => ({
            value: s,
            label: s === 'average'
              ? 'Not sure, use the average'
              : `${BREEZEWAY_STYLES[s].label} (like ${BREEZEWAY_STYLES[s].like})`,
            sub:   `${money(rate(s))}/landing, ${BREEZEWAY_STYLES[s].fixtures}`,
            cost:  stairwells > 0 ? stairwells * rate(s) : undefined,
          }))}
          value={ans.breezewayStyle === 'small' || ans.breezewayStyle === 'long' ? ans.breezewayStyle : 'average'}
          onChange={v => set('breezewayStyle', v === 'average' ? null : v)}
          impact={impact}
        />
      )}
    </>
  );
}
