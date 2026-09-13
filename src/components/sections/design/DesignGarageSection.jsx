'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard from '@/components/sections/QuestionCard';
import StandardsHint from '@/components/wizard/StandardsHint';
import { PRICING } from '@/lib/pricing';

export default function DesignGarageSection({
  responses,
  projectData,
  pricing,
  emergencyStrategy,
  onSaveResponses,
  onNext,
  onPrev,
}) {
  const P = pricing || PRICING;
  const existing = responses || {};
  const [ans, setAns] = useState({
    garageDesignLevel: existing.garageDesignLevel || 'medium',
    garageControls:    existing.garageControls    || 'none',
  });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setAns(a => ({ ...a, [k]: v })); }

  const garageSf = Number(projectData?.garageSf) || 0;

  // Base rate from master pricing (engine: designGarage.baseMediumPerSf / baseHighPerSf).
  const DG = P.designGarage || {};
  const GARAGE_MED  = DG.baseMediumPerSf ?? 0.20;
  const GARAGE_HIGH = DG.baseHighPerSf   ?? 0.25;
  const baseRate = ans.garageDesignLevel === 'high' ? GARAGE_HIGH : GARAGE_MED;
  const OCC = DG.occSensorAdderPerSf ?? 0.02;
  // Garage batteries are priced on the Emergency step whenever the building has
  // no generator (Mike 2026-09-12), so the battery choices here only add their
  // battery cost when the chosen emergency strategy is 'generator'. Mirrors the
  // double-charge guard in calculations.js.
  const batteriesOnEmergency = (emergencyStrategy || 'frogeyes') !== 'generator' && garageSf > 0;
  const BATT     = batteriesOnEmergency ? 0   : (DG.batteryAdderPerSf     ?? 0.05);
  const BATT_OCC = batteriesOnEmergency ? OCC : (DG.batteryAndSensorPerSf ?? 0.06);
  const ctrlAdder = { none: 0, occSensor: OCC, battery: BATT, batteryAndSensor: BATT_OCC }[ans.garageControls] ?? 0;
  const totalRate  = baseRate + ctrlAdder;
  const liveTotal  = garageSf * totalRate;

  async function handleNext() {
    setSaving(true);
    // Merge into corridors section so garage keys coexist with corridor keys
    await onSaveResponses({ ...existing, ...ans });
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Garage Lighting</h2>
        <p className="text-slate-500 text-sm mt-1">
          Structured enclosed parking garage only. Surface lots and carports are
          covered in the Exterior section.
        </p>
      </div>

      <StandardsHint category="GARAGE" />

      {/* Scope */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Garage Scope</div>
        <div className="grid grid-cols-2 gap-3 text-center max-w-xs">
          <div className="bg-white rounded-lg border border-slate-100 p-3">
            <div className="text-xl font-bold text-slate-900">
              {garageSf > 0 ? garageSf.toLocaleString() : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Garage SF</div>
          </div>
          {garageSf > 0 && (
            <div className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-xl font-bold text-amber-700">
                ${liveTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Est. Garage Product</div>
            </div>
          )}
        </div>
        {garageSf === 0 && (
          <p className="text-xs text-slate-400 mt-2">
            Enter Enclosed Garage SF in Project Data to see live estimates.
          </p>
        )}
      </div>

      {/* Footcandle info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">IES Parking Structure Footcandle Standards</p>
        <ul className="space-y-0.5 text-xs text-blue-700 list-disc list-inside">
          <li>IES RP-20 minimum: 5 fc maintained at floor level</li>
          <li>Ramp transitions: 50 fc minimum (day-to-night adaptation)</li>
          <li>Painting ceiling and walls white is the single highest-ROI upgrade — can cut fixture count by 25–30%</li>
        </ul>
      </div>

      {/* Design level */}
      <QuestionCard
        question="Garage fixture design level?"
        note={`Standard eLuma-spec linear LED troffer vs. premium spec. ${garageSf > 0 ? `(${garageSf.toLocaleString()} SF)` : ''}`}
        costSuffix="/SF"
        options={[
          { value: 'medium', label: 'Medium — Standard spec',  sub: `$${GARAGE_MED}/SF — eLuma linear LED or equivalent`, cost: GARAGE_MED },
          { value: 'high',   label: 'High — Premium spec',     sub: `$${GARAGE_HIGH}/SF — Higher-end linear LED`, cost: GARAGE_HIGH },
        ]}
        value={ans.garageDesignLevel}
        onChange={v => set('garageDesignLevel', v)}
      />

      {/* Controls / emergency */}
      <QuestionCard
        question="Garage controls & emergency backup approach?"
        note={batteriesOnEmergency
          ? 'Occupancy sensors dim fixtures when no motion is detected — required by most energy codes. With no building generator, the garage battery (every other fixture) is already priced on the Emergency step, so the battery choices below add only the sensor cost.'
          : 'Occupancy sensors dim fixtures when no motion is detected — required by most energy codes. Integrated battery backup (every other fixture) provides code-compliant emergency egress lighting without separate frogeye fixtures.'}
        costSuffix="/SF adder"
        options={[
          { value: 'none',             label: 'None — no added controls',                        sub: batteriesOnEmergency ? 'Manual switch only; garage battery still priced on the Emergency step' : 'Manual switch only; the building generator covers emergency egress', cost: 0 },
          { value: 'occSensor',        label: 'Integrated occupancy sensors',                   sub: `+$${OCC}/SF — dims to 10% on vacancy; code compliant`,        cost: OCC },
          { value: 'battery',          label: 'Integrated battery backup (every other fixture)', sub: batteriesOnEmergency ? '$0 here — the battery is priced on the Emergency step' : `+$${BATT}/SF — eliminates separate frogeye fixtures`, cost: BATT },
          { value: 'batteryAndSensor', label: 'Battery + occupancy sensors',                    sub: batteriesOnEmergency ? `+$${BATT_OCC}/SF for the sensors — battery priced on the Emergency step (recommended)` : `+$${BATT_OCC}/SF — best all-in solution (recommended)`, cost: BATT_OCC },
        ]}
        value={ans.garageControls}
        onChange={v => set('garageControls', v)}
      />

      {/* Paint info */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">Ceiling & Wall Paint</p>
        <p className="text-xs text-amber-800">
          Painting the garage ceiling and structural concrete white (or light gray) is not
          a lighting line item but is the most cost-effective way to meet footcandle
          requirements — worth flagging to the owner or GC.
        </p>
      </div>

      {/* Live cost */}
      {garageSf > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Live Estimate</div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between text-slate-600">
              <span className="text-xs">Base ({garageSf.toLocaleString()} SF × ${baseRate}/SF)</span>
              <span className="font-mono text-xs font-semibold">${(garageSf * baseRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {ctrlAdder > 0 && (
              <div className="flex justify-between text-slate-600">
                <span className="text-xs">Controls/battery adder ({garageSf.toLocaleString()} SF × +${ctrlAdder}/SF)</span>
                <span className="font-mono text-xs font-semibold">${(garageSf * ctrlAdder).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-300 pt-2 mt-2 font-bold text-slate-900">
              <span className="text-sm">Total Garage Product</span>
              <span className="font-mono text-sm">${liveTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save &amp; Continue to Corridors
        </Button>
      </div>
    </div>
  );
}
