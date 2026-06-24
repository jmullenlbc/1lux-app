'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import { PRICING } from '@/lib/pricing';
import { formatCurrency } from '@/lib/calculations';
import { cn } from '@/lib/utils';

function calcEmergency(P, strategyKey, corridorSf, intAmenitySf, garageSf) {
  const strat = P.emergency.strategies[strategyKey];
  if (!strat) return 0;
  let total = corridorSf * strat.corridorPerSf + intAmenitySf * strat.amenityPerSf + garageSf * strat.garagePerSf;
  if (strat.batteryGarage && garageSf > 0) {
    const b = P.emergency.batteryGarage;
    const battCount = Math.floor((garageSf / b.sfPerFixture) / b.fixtureEvery);
    total += battCount * b.costPerFixture;
  }
  return Math.round(total);
}

const STRATEGIES = [
  {
    value: 'generator',
    label: 'Building Generator',
    sub:   'Generator covers all lighting circuits — no separate emergency fixtures required. Most cost-effective when a generator already exists.',
  },
  {
    value: 'frogeyes',
    label: 'Frogeyes Everywhere',
    sub:   'Emergency combo units (light head + exit sign) in all spaces. Corridors $0.15/SF · Amenity $0.15/SF · Garage $0.10/SF.',
  },
  {
    value: 'frogeyes_inv',
    label: 'Frogeyes in Corridors + Inverters in Amenity Spaces',
    sub:   'Frogeyes $0.15/SF in corridors. Central inverter $1.25/SF in interior amenity spaces.',
  },
  {
    value: 'integrated_frogeyes',
    label: 'Integrated Batteries in Garage / Frogeyes in Corridors / Inverters in Amenity',
    sub:   'Garage: battery-integrated fixtures ($120 ea, every other). Corridors: frogeyes $0.15/SF. Amenity: inverters $1.25/SF.',
  },
  {
    value: 'integrated_inverters',
    label: 'Integrated Batteries in Garage / Inverters in Corridors + Amenity Spaces',
    sub:   'Garage: battery-integrated fixtures ($120 ea, every other). Corridors: inverters $0.50/SF. Amenity: inverters $1.25/SF. Common for high-rise.',
  },
  {
    value: 'inverters',
    label: 'Central Inverter System Everywhere',
    sub:   'Inverter units power existing fixtures. Corridors $0.50/SF · Amenity $1.25/SF · Garage $0.25/SF. Cost-effective at large scale.',
  },
];

export default function EmergencySection({ responses, projectData, pricing, onSaveResponses, onNext, onPrev }) {
  const P = pricing || PRICING;
  const [answers, setAnswers] = useState({
    strategy: responses.strategy || 'integrated_inverters',
  });
  const [dirty, setDirty] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const corridorSf = Number(projectData?.corridorSf)       || 0;
  const intSf      = Number(projectData?.interiorAmenitySf) || 0;
  const garageSf   = Number(projectData?.garageSf)          || 0;
  const totalEmSf  = corridorSf + intSf + garageSf;

  // Frogeye count: 1 per 25 linear ft, assuming 6ft avg corridor width = 1 per 150 SF
  const FROGEYE_SF_SPACING = 150;
  const strategiesWithFrogeyes = ['frogeyes', 'frogeyes_inv', 'integrated_frogeyes'];
  const selectedHasFrogeyes = strategiesWithFrogeyes.includes(answers.strategy);
  const frogeyes = selectedHasFrogeyes && corridorSf > 0
    ? Math.ceil(corridorSf / FROGEYE_SF_SPACING)
    : 0;

  async function handleNext() {
    setSaving(true);
    if (dirty.size > 0) {
      const payload = {};
      for (const key of dirty) {
        payload[key] = answers[key];
      }
      await onSaveResponses(payload);
    }
    setDirty(new Set());
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Emergency Egress Lighting</h2>
        <p className="text-slate-500 text-sm mt-1">
          Code requires emergency lighting in all common egress paths. Stairwells always include
          integrated battery backup regardless of strategy (already included in corridor line item).
        </p>
      </div>

      {/* Scope summary */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Areas Requiring Emergency Lighting</div>
        <div className={`grid gap-3 text-center ${frogeyes > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {[
            { label: 'Corridor SF',         value: corridorSf.toLocaleString() },
            { label: 'Interior Amenity SF', value: intSf.toLocaleString()      },
            { label: 'Garage SF',           value: garageSf.toLocaleString()   },
            ...(frogeyes > 0 ? [{
              label: 'Est. Frogeye Fixtures',
              value: `~${frogeyes}`,
              sub:   '@ 25 ft spacing',
              amber: true,
            }] : []),
          ].map(item => (
            <div key={item.label} className={`rounded-lg border p-3 ${item.amber ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
              <div className={`text-xl font-bold ${item.amber ? 'text-amber-700' : 'text-slate-900'}`}>{item.value || '—'}</div>
              <div className={`text-xs font-medium mt-0.5 ${item.amber ? 'text-amber-600' : 'text-slate-500'}`}>{item.label}</div>
              {item.sub && <div className="text-xs text-amber-400 mt-0.5">{item.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Strategy selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="font-semibold text-slate-900 mb-1">How do you want to approach emergency egress lighting?</p>
        <p className="text-xs text-slate-400 mb-4">
          Each strategy has different cost and installation complexity trade-offs.
        </p>
        <div className="space-y-2">
          {STRATEGIES.map(opt => {
            const est        = calcEmergency(P, opt.value, corridorSf, intSf, garageSf);
            const isSelected = answers.strategy === opt.value;
            return (
              <label
                key={opt.value}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors',
                  isSelected ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  name="strategy"
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => {
                    setAnswers(a => ({ ...a, strategy: opt.value }));
                    setDirty(d => new Set(d).add('strategy'));
                  }}
                  className="mt-0.5 accent-amber-500 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{opt.sub}</div>
                </div>
                {totalEmSf > 0 && (
                  <div className={cn(
                    'text-xs font-mono font-semibold shrink-0 mt-0.5',
                    est === 0 ? 'text-slate-300' : 'text-amber-600',
                  )}>
                    {est === 0 ? '$0' : formatCurrency(est)}
                  </div>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Note:</strong> Stairwell integrated battery backup is required by code regardless of strategy selected. This cost is included in the Corridors & Stairwells line item.
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save & Continue to Controls
        </Button>
      </div>
    </div>
  );
}
