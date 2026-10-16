'use client';
import { useState, useMemo } from 'react';
import { useLiveAnswers } from '@/components/wizard/useLiveAnswers';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { PRICING } from '@/lib/pricing';
import { formatCurrency, calculateBudget } from '@/lib/calculations';
import { CostImpact, useChoiceDelta } from './QuestionCard';
import { cn } from '@/lib/utils';
import { emergencyStrategyCost } from '@/lib/emergencyCost';

// Same helper the engine uses — the estimate on each option IS the budget line.
function calcEmergency(P, strategyKey, corridorSf, intAmenitySf, garageSf) {
  return Math.round(emergencyStrategyCost(P, strategyKey, { corridorSf, intAmenitySf, garageSf }).total);
}

// Option wording reads the live price sheet so the words match the math.
function strategyOptions(P) {
  const S  = P.emergency?.strategies || {};
  const fe = P.emergency?.frogeyesPerSf ?? 0.17;
  const b  = P.emergency?.batteryGarage || {};
  const batt = `Garage: battery in every other fixture ($${b.costPerFixture ?? 120} ea)`;
  const r = (k, f) => `$${(S[k]?.[f] ?? 0).toFixed(2)}/SF`;
  return [
    {
      value: 'generator',
      label: 'Building generator',
      sub:   'Generator covers all lighting circuits — no separate emergency fixtures or garage batteries required. Most cost-effective when a generator already exists.',
    },
    {
      value: 'frogeyes',
      label: 'Frogeyes everywhere (corridors, amenity and garage)',
      sub:   `Emergency combo units in corridors, amenity spaces and the garage at a flat $${Number(fe).toFixed(2)}/SF.`,
    },
    {
      value: 'frogeyes_inv',
      label: 'Frogeyes in corridors + garage, inverters in amenities',
      sub:   `Frogeyes ${r('frogeyes_inv', 'corridorPerSf')} in corridors and the garage. Central inverter ${r('frogeyes_inv', 'amenityPerSf')} in interior amenity spaces.`,
    },
    {
      value: 'integrated_frogeyes',
      label: 'Integrated batteries in garage / frogeyes in corridors / inverters in amenity spaces',
      sub:   `${batt}. Corridors: frogeyes ${r('integrated_frogeyes', 'corridorPerSf')}. Amenity: inverters ${r('integrated_frogeyes', 'amenityPerSf')}.`,
    },
    {
      value: 'integrated_inverters',
      label: 'Integrated batteries in garage / inverters in corridors + amenity spaces',
      sub:   `${batt}. Corridors: inverters ${r('integrated_inverters', 'corridorPerSf')}. Amenity: inverters ${r('integrated_inverters', 'amenityPerSf')}. Common for high-rise.`,
    },
    {
      value: 'inverters',
      label: 'Inverters everywhere (corridors, amenity and garage)',
      sub:   `Inverter units power existing fixtures. Corridors and garage ${r('inverters', 'corridorPerSf')} · Amenity ${r('inverters', 'amenityPerSf')}.`,
    },
  ];
}

export default function EmergencySection({ responses, projectData, allSections, pricing, onSaveResponses, onNext, onPrev, onLiveAnswers }) {
  const P = pricing || PRICING;
  const [answers, setAnswers] = useState({
    strategy:   responses.strategy   || 'generator',
    manualAdder: responses.manualAdder ?? '',
  });
  const [dirty, setDirty] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  useLiveAnswers(onLiveAnswers, 'emergency', answers); // Mike 10-15: sidebar moves before Next
  // What each answer costs (+ estimated labor), recomputed live as answers
  // change — local answers only save on Next (Mike 2026-09-13).
  const qc = useMemo(
    () => calculateBudget(projectData, { ...(allSections || {}), emergency: { ...(allSections?.emergency || {}), ...answers } }, pricing || null).questionCosts || {},
    [projectData, allSections, answers, pricing],
  );
  const strategyDelta = useChoiceDelta(qc['emergency.strategy'], answers.strategy);

  const corridorSf = Number(projectData?.corridorSf)       || 0;
  const intSf      = Number(projectData?.interiorAmenitySf) || 0;
  const garageSf   = Number(projectData?.garageSf)          || 0;
  const totalEmSf  = corridorSf + intSf + garageSf;
  const selectedEst = calcEmergency(P, answers.strategy, corridorSf, intSf, garageSf);

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
          {strategyOptions(P).map(opt => {
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
                  {isSelected && <CostImpact impact={qc['emergency.strategy']} delta={strategyDelta} />}
                </div>
                {totalEmSf > 0 && (
                  <div className="text-xs font-mono font-semibold shrink-0 mt-0.5 text-right">
                    {/* Mike 10-15: every option shows its own line AND the move
                        from the chosen one, so the choices never look alike. */}
                    <div className={est === 0 ? 'text-slate-400' : 'text-amber-600'}>
                      {est === 0 ? '$0 adder' : formatCurrency(est)}
                    </div>
                    {!isSelected && (
                      <div className={cn('font-normal', est - selectedEst > 0 ? 'text-red-600' : est - selectedEst < 0 ? 'text-green-700' : 'text-slate-400')}>
                        {est === selectedEst ? 'same as current' : `${est > selectedEst ? '+' : '-'}${formatCurrency(Math.abs(est - selectedEst))} vs current`}
                      </div>
                    )}
                  </div>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Note:</strong> Stairwell integrated battery backup is required by code regardless of strategy selected. This cost is included in the Corridors & Stairwells line item.
        {garageSf > 0 && (
          <> Garage: the two Integrated batteries choices put a battery in every other garage fixture; the other choices cover the garage with frogeyes or inverters at the corridor rate. That cost is in the prices above.</>
        )}
      </div>

      {/* Manual adder */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Manual Adder</div>
        <Input
          label="Emergency Lighting manual adder"
          type="number"
          placeholder="0"
          hint="Add an arbitrary dollar amount to bump the emergency lighting total."
          prefix="$"
          value={answers.manualAdder}
          onChange={e => {
            setAnswers(a => ({ ...a, manualAdder: e.target.value }));
            setDirty(d => new Set(d).add('manualAdder'));
          }}
          min={0}
        />
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
