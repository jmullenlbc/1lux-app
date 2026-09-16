'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QuestionCard from './QuestionCard';
import { formatCurrency } from '@/lib/calculations';
import { PRICING } from '@/lib/pricing';
import { buildingTypeLabel } from '@/lib/utils';
import StandardsHint from '@/components/wizard/StandardsHint';

export default function ControlsSection({ responses, projectData, budget, pricing, onSaveResponses, onNext, onPrev, isLast, isDesign = false }) {
  const P = pricing || PRICING;
  const [answers, setAnswers] = useState({
    energyCredit:       responses.energyCredit       || 'no',
    // Program answer (None/LEED/NGBS/WELL/Other). Older projects only have
    // the yes/no — map a bare 'yes' to 'other' so nothing silently gains LEED.
    energyCreditProgram: responses.energyCreditProgram || (responses.energyCredit === 'yes' ? 'other' : 'none'),
    controlsOverride:   responses.controlsOverride   || '',
    // Design-only
    controlsSystem:     responses.controlsSystem     || 'standalone',
    decorativeDimming:  responses.decorativeDimming  || 'no',
    sceneSwitching:     responses.sceneSwitching     || 'bankSwitches',
    zoneReduction:      responses.zoneReduction      || 'no',
  });
  const [dirty, setDirty] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const grossSf      = projectData?.grossSf || 0;
  const buildingType = projectData?.buildingTypeKey || 'midRise';

  const FALLBACK_RATE = { perSf: 0.45, cap: 175000 };
  const baseRate      = P.controls?.rates?.[buildingType] || P.controls?.rates?.midRise || FALLBACK_RATE;
  // Mirrors the engine: the building type's own cap AND the sheet-wide cap both apply — lower wins.
  const lowerCap      = Math.min(baseRate.cap ?? Infinity, P.controls?.cap ?? Infinity);
  const controlsCap   = Number.isFinite(lowerCap) ? lowerCap : 180000;
  const selectedRate  = { ...baseRate, cap: controlsCap };

  // Town houses / single family (a $0/SF type rate) price controls on the
  // clubhouse SF alone, at the master sheet's clubhouse rate. Mirrors the
  // engine's controlsBasis rule.
  const clubhouseSf     = projectData?.interiorAmenitySf || 0;
  const clubhousePerSf  = P.controls?.clubhousePerSf ?? 0;
  const clubhouseBasis  = (selectedRate.perSf ?? 0) === 0 && clubhouseSf > 0 && clubhousePerSf > 0;
  const basisSf         = clubhouseBasis ? clubhouseSf : grossSf;
  const rateUsed        = clubhouseBasis ? clubhousePerSf : (selectedRate.perSf ?? 0);

  const baseEst           = Math.min(basisSf * rateUsed, selectedRate.cap ?? 175000);
  // Preview the two energy-credit adder line items. The live budget's lighting
  // subtotal already contains the lighting-side adder when the credit is on —
  // back it out so the preview doesn't compound.
  const ecPct             = P.controls?.energyCreditAdderPct ?? 0.03;
  const lightingSubtotal  = (budget?.lightingProductSubtotal ?? 0) - (budget?.energyCreditLighting ?? 0);
  const lightingAdder     = lightingSubtotal * ecPct;
  const controlsAdder     = baseEst * ecPct;
  const creditEst         = baseEst + controlsAdder;
  const isCapped          = basisSf * rateUsed >= selectedRate.cap;

  const overrideVal = parseFloat(answers.controlsOverride);
  const hasOverride = overrideVal > 0;

  async function handleNext() {
    setSaving(true);
    // Only send dirty fields
    const payload = {};
    for (const key of dirty) {
      payload[key] = answers[key];
    }
    // Null out design-only keys in conceptual mode
    if (!isDesign) {
      payload.controlsSystem    = null;
      payload.decorativeDimming = null;
      payload.sceneSwitching    = null;
      payload.zoneReduction     = null;
    }
    if (Object.keys(payload).length > 0) {
      await onSaveResponses(payload);
    }
    setDirty(new Set());
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Controls &amp; Energy Codes</h2>
        <p className="text-slate-500 text-sm mt-1">
          Common area lighting controls required by IECC. Cost is based on building type
          and applied to total gross SF. Each building type has a hard cap.
        </p>
      </div>

      <StandardsHint category="CONTROLS" />

      {/* Building type — read-only, set at project creation */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Controls Scope Basis</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-3">
          {[
            { label: 'Building Type',  value: buildingTypeLabel(buildingType) },
            { label: 'Rate',           value: clubhouseBasis ? `$${clubhousePerSf.toFixed(2)}/Clubhouse SF`
                                              : (selectedRate?.perSf ?? 0) > 0 ? `$${selectedRate.perSf.toFixed(2)}/Gross Bldg SF`
                                              : clubhouseSf > 0 ? 'N/A' : 'N/A (no clubhouse)' },
            { label: 'Cap',            value: selectedRate.cap > 0 ? formatCurrency(selectedRate.cap) : 'None' },
            { label: clubhouseBasis ? 'Clubhouse SF' : 'Gross Bldg SF',  value: basisSf ? basisSf.toLocaleString() : '—' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-sm font-bold text-slate-900 leading-snug">{item.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        {basisSf > 0 && baseEst > 0 && (
          <div className="text-xs text-slate-600 font-medium">
            {hasOverride
              ? <span className="text-amber-700">Formula result: {formatCurrency(baseEst)}{isCapped && ` (capped)`} — <strong>overridden below</strong></span>
              : <>Estimated controls: {formatCurrency(baseEst)}{isCapped && <span className="text-amber-600 ml-2">(capped at {formatCurrency(selectedRate.cap)})</span>}</>
            }
          </div>
        )}
        <p className="text-xs text-slate-400 mt-1.5">
          Building type is set on the Project creation screen.
        </p>
      </div>

      {/* Energy credit */}
      <QuestionCard
        question="Are you trying to achieve better than code allowed LPDs for a lighting energy credit?"
        note={`Targeting better-than-code Lighting Power Densities requires more sophisticated controls and more efficient fixtures. Any program adds ${Math.round(ecPct * 100)}% to the lighting and controls subtotals, shown as its own line item on the budget.`}
        costSuffix=" total"
        options={[
          {
            value: 'none',
            label: 'None',
            sub:   'Standard code-compliant LPDs (IECC minimum)',
            cost:  grossSf > 0 ? baseEst : undefined,
          },
          {
            value: 'leed',
            label: 'LEED',
            sub:   `+${Math.round(ecPct * 100)}% on lighting + controls subtotals (${lightingSubtotal > 0 ? formatCurrency(lightingAdder + controlsAdder) : 'enter project data first'})`,
            cost:  grossSf > 0 ? creditEst : undefined,
          },
          {
            value: 'ngbs',
            label: 'NGBS',
            sub:   `+${Math.round(ecPct * 100)}% on lighting + controls subtotals (${lightingSubtotal > 0 ? formatCurrency(lightingAdder + controlsAdder) : 'enter project data first'})`,
            cost:  grossSf > 0 ? creditEst : undefined,
          },
          {
            value: 'well',
            label: 'WELL',
            sub:   `+${Math.round(ecPct * 100)}% on lighting + controls subtotals (${lightingSubtotal > 0 ? formatCurrency(lightingAdder + controlsAdder) : 'enter project data first'})`,
            cost:  grossSf > 0 ? creditEst : undefined,
          },
          {
            value: 'other',
            label: 'Other',
            sub:   `+${Math.round(ecPct * 100)}% on lighting + controls subtotals (${lightingSubtotal > 0 ? formatCurrency(lightingAdder + controlsAdder) : 'enter project data first'})`,
            cost:  grossSf > 0 ? creditEst : undefined,
          },
        ]}
        value={answers.energyCreditProgram}
        onChange={val => {
          setAnswers(a => ({ ...a, energyCreditProgram: val, energyCredit: val === 'none' ? 'no' : 'yes' }));
          setDirty(d => new Set(d).add('energyCreditProgram').add('energyCredit'));
        }}
      />

      {/* Manual override */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="font-semibold text-slate-900 mb-1">Manual Controls Override</p>
        <p className="text-xs text-slate-400 mb-4">
          If you have a firm controls budget from a vendor or prior project, enter it here to override the formula-calculated amount.
          Leave blank to use the formula above.
        </p>
        <div className="max-w-xs">
          <Input
            label="Override Controls Total ($)"
            type="number"
            placeholder="Formula result"
            prefix="$"
            value={answers.controlsOverride}
            onChange={e => {
              setAnswers(a => ({ ...a, controlsOverride: e.target.value }));
              setDirty(d => new Set(d).add('controlsOverride'));
            }}
            min={0}
          />
        </div>
        {hasOverride && (
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
            <p className="text-xs text-amber-700 font-medium">
              Override active — controls will use {formatCurrency(overrideVal)} instead of the formula result
            </p>
          </div>
        )}
      </div>

      {/* ── DESIGN-ONLY questions ────────────────────────────────────────────── */}
      {isDesign && (
        <>
          {/* Controls system type — dropdown selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="font-semibold text-slate-900 mb-1">Controls System Type</p>
            <p className="text-xs text-slate-400 mb-4">
              Select the controls approach for common areas. Standalone sensors meet code minimum. Networked systems add cost but enable scheduling, remote monitoring, and advanced scene control.
            </p>
            <div className="max-w-sm">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Controls protocol / system
              </label>
              <select
                value={answers.controlsSystem}
                onChange={e => {
                  setAnswers(a => ({ ...a, controlsSystem: e.target.value }));
                  setDirty(d => new Set(d).add('controlsSystem'));
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              >
                <option value="standalone">Standalone occupancy &amp; photosensors (code minimum)</option>
                <option value="zeroTen">0-10V dimming with standalone sensors</option>
                <option value="dali">DALI networked system</option>
                <option value="dmx">DMX / architectural dimming system</option>
                <option value="lutron">Lutron ecosystem (RadioRA / Quantum)</option>
                <option value="custom">Custom / vendor-specified system</option>
              </select>
            </div>
            {answers.controlsSystem !== 'standalone' && (
              <p className="text-xs text-amber-700 mt-3 flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>Networked systems typically increase controls cost above the formula estimate. Use the manual override below if you have a vendor quote.</span>
              </p>
            )}
          </div>

          <QuestionCard
            question="Dim decorative fixtures in public spaces (lobby, clubhouse, corridors)?"
            note="Decorative dimming adds cost for compatible dimmers and wiring. It creates a more hospitality-like feel but is not required by code. Best for high-end projects."
            options={[
              { value: 'no',  label: 'No — on/off switching only for decorative fixtures',              cost: 0 },
              { value: 'yes', label: 'Yes — dim decorative fixtures in public spaces',                  sub: 'Adds dimmer cost; creates hospitality feel', cost: 0 },
            ]}
            value={answers.decorativeDimming}
            onChange={val => {
              setAnswers(a => ({ ...a, decorativeDimming: val }));
              setDirty(d => new Set(d).add('decorativeDimming'));
            }}
          />

          <QuestionCard
            question="Bank of switches vs. scene controller for small spaces with 3 or fewer zones?"
            note="A bank of switches is the most cost-effective option for small spaces. A scene controller (keypads) offers programmed scenes and a more polished look at added cost."
            options={[
              { value: 'bankSwitches',   label: 'Bank of switches — cost-effective, standard',          sub: 'Multiple switches on a single plate', cost: 0 },
              { value: 'sceneController',label: 'Scene controller / keypad',                             sub: 'Programmed scenes; premium appearance; higher cost', cost: 0 },
            ]}
            value={answers.sceneSwitching}
            onChange={val => {
              setAnswers(a => ({ ...a, sceneSwitching: val }));
              setDirty(d => new Set(d).add('sceneSwitching'));
            }}
          />

          <QuestionCard
            question="Minimize zones to reduce controls cost?"
            note="Each independently controlled zone requires additional wiring and devices. Reducing zones where practical can significantly lower controls cost, with minimal impact on tenant experience."
            options={[
              { value: 'no',  label: 'No — design zones based on ideal flexibility',                    cost: 0 },
              { value: 'yes', label: 'Yes — minimize zones to reduce controls cost where possible',     sub: 'Recommended for budget-conscious projects', cost: 0 },
            ]}
            value={answers.zoneReduction}
            onChange={val => {
              setAnswers(a => ({ ...a, zoneReduction: val }));
              setDirty(d => new Set(d).add('zoneReduction'));
            }}
          />
        </>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          {isLast ? 'Save & View Summary' : 'Save & Continue'}
        </Button>
      </div>
    </div>
  );
}
