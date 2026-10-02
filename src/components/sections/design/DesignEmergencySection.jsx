'use client';
import { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard, { CostImpact } from '@/components/sections/QuestionCard';
import { calculateBudget } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';
import { emergencyStrategyCost } from '@/lib/emergencyCost';

export default function DesignEmergencySection({
  responses,
  projectData,
  allSections,
  pricing,
  onSaveResponses,
  onNext,
  onPrev,
}) {
  const P = pricing || PRICING;
  const existing = responses || {};
  const [ans, setAns] = useState({
    strategy: existing.strategy || 'frogeyes',
  });
  const [saving, setSaving] = useState(false);
  // What each answer costs (+ estimated labor), recomputed live as answers
  // change — local answers only save on Next (Mike 2026-09-13).
  const qc = useMemo(
    () => calculateBudget(projectData, { ...(allSections || {}), emergency: { ...(allSections?.emergency || {}), ...ans } }, pricing || null).questionCosts || {},
    [projectData, allSections, ans, pricing],
  );

  const corridorSf    = Number(projectData?.corridorSf)          || 0;
  const intAmenitySf  = Number(projectData?.interiorAmenitySf)   || 0;
  const garageSf      = Number(projectData?.garageSf)            || 0;

  // Rates and garage batteries come from the same helper the engine uses, so
  // the estimate beside each option IS the budget line.
  function calcCost(key) {
    return Math.round(emergencyStrategyCost(P, key, { corridorSf, intAmenitySf, garageSf }).total);
  }
  const S    = P.emergency?.strategies || {};
  const rate = (k, f) => `$${(S[k]?.[f] ?? 0).toFixed(2)}/SF`;
  const fe   = `$${Number(P.emergency?.frogeyesPerSf ?? 0.17).toFixed(2)}/SF`;
  const batt = garageSf > 0 ? ' + garage battery in every other fixture' : '';
  const gar  = garageSf > 0 ? ' (garage at the corridor rate)' : '';

  async function handleNext() {
    setSaving(true);
    await onSaveResponses({ ...existing, ...ans });
    setSaving(false);
    onNext();
  }

  const hasSf = corridorSf > 0 || intAmenitySf > 0 || garageSf > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Emergency &amp; Egress Lighting</h2>
        <p className="text-slate-500 text-sm mt-1">
          Life-safety egress lighting strategy for corridors, amenity spaces, and the
          enclosed parking garage. Exit signs are the next step.
        </p>
      </div>

      {/* Scope */}
      {hasSf && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Emergency Scope</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Corridor SF',       value: corridorSf   > 0 ? corridorSf.toLocaleString()   : '—' },
              { label: 'Interior Amenity',  value: intAmenitySf > 0 ? intAmenitySf.toLocaleString() : '—' },
              { label: 'Garage SF',         value: garageSf     > 0 ? garageSf.toLocaleString()     : '—' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-lg border border-slate-100 p-3">
                <div className="text-xl font-bold text-slate-900">{item.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strategy selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <p className="font-semibold text-slate-900 mb-1">Emergency lighting strategy?</p>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Without a building generator every egress path needs independent battery backup.
          Integrated battery fixtures are the cleanest approach — no visible frogeye bugs.
          Inverter systems provide the best optical consistency.
        </p>
        <div className="space-y-2">
          {[
            {
              key:   'generator',
              label: 'Building generator covers all emergency lighting',
              sub:   'No additional lighting budget required for emergency egress (garage included)',
              tag:   null,
            },
            {
              key:   'frogeyes',
              label: 'Frogeyes everywhere (corridors, amenity and garage)',
              sub:   `Corridors + amenity + garage ${fe}${hasSf ? ` — est. $${calcCost('frogeyes').toLocaleString()}` : ''}`,
              tag:   null,
            },
            {
              key:   'frogeyes_inv',
              label: 'Frogeyes in corridors + garage, inverters in amenity spaces',
              sub:   `Corridors ${rate('frogeyes_inv', 'corridorPerSf')} + amenity ${rate('frogeyes_inv', 'amenityPerSf')}${gar}${hasSf ? ` — est. $${calcCost('frogeyes_inv').toLocaleString()}` : ''}`,
              tag:   null,
            },
            {
              key:   'integrated_frogeyes',
              label: 'Integrated batteries (garage) + frogeyes (corridors) + inverters (amenity)',
              sub:   `Corridors ${rate('integrated_frogeyes', 'corridorPerSf')} + amenity ${rate('integrated_frogeyes', 'amenityPerSf')}${batt}${hasSf ? ` — est. $${calcCost('integrated_frogeyes').toLocaleString()}` : ''}`,
              tag:   null,
            },
            {
              key:   'integrated_inverters',
              label: 'Integrated batteries (garage) + inverters (corridors + amenity)',
              sub:   `Corridors ${rate('integrated_inverters', 'corridorPerSf')} + amenity ${rate('integrated_inverters', 'amenityPerSf')}${batt}${hasSf ? ` — est. $${calcCost('integrated_inverters').toLocaleString()}` : ''}`,
              tag:   'Recommended',
            },
            {
              key:   'inverters',
              label: 'Inverters everywhere (corridors, amenity and garage)',
              sub:   `Corridors ${rate('inverters', 'corridorPerSf')} + amenity ${rate('inverters', 'amenityPerSf')}${gar}${hasSf ? ` — est. $${calcCost('inverters').toLocaleString()}` : ''}`,
              tag:   'Best optics',
            },
          ].map(opt => (
            <label
              key={opt.key}
              className={[
                'flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors',
                ans.strategy === opt.key
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
            >
              <input
                type="radio"
                name="emergency_strategy"
                value={opt.key}
                checked={ans.strategy === opt.key}
                onChange={() => setAns(a => ({ ...a, strategy: opt.key }))}
                className="mt-0.5 accent-amber-500 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                  {opt.tag && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
                      {opt.tag}
                    </span>
                  )}
                </div>
                {opt.sub && (
                  <div className="text-xs text-slate-400 mt-0.5">{opt.sub}</div>
                )}
                {ans.strategy === opt.key && <CostImpact impact={qc['emergency.strategy']} />}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-semibold mb-2">Strategy Comparison</p>
        <div className="space-y-1.5">
          <div><span className="font-medium">Garage:</span> Unless a building generator covers it, every other garage fixture gets an integrated battery under every strategy.</div>
          <div><span className="font-medium">Frogeyes:</span> Battery-backed emergency heads — visible, lower cost, meets code.</div>
          <div><span className="font-medium">Integrated batteries:</span> Battery module inside every other normal fixture — invisible, meets code, cleaner look.</div>
          <div><span className="font-medium">Inverters:</span> Central or room-level inverter powers normal circuits during outage — best optical consistency, highest cost.</div>
          <div className="mt-2 text-blue-700 font-medium">Recommendation: Integrated batteries in garage (cleaner than frogeyes) + inverters in corridors/amenity (best optics where residents see it).</div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save &amp; Continue to Exit Signs
        </Button>
      </div>
    </div>
  );
}
