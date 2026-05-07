'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard from '@/components/sections/QuestionCard';

const DISK_RATES     = { 6: 0.40, 7: 0.35, 8: 0.30, 9: 0.28, 10: 0.25, 11: 0.23, 12: 0.23 };
const RECESSED_RATES = { 6: 3.00, 7: 2.625, 8: 2.25, 9: 2.10, 10: 1.875, 11: 1.725, 12: 1.725 };

export default function DesignCorridorsSection({
  responses,
  projectData,
  onSaveResponses,
  onNext,
  onPrev,
}) {
  const existing = responses || {};
  const [ans, setAns] = useState({
    fixtureType:       existing.fixtureType       || 'disk',
    fixtureSpacing:    existing.fixtureSpacing     || '10',
    elevatorLobby:     existing.elevatorLobby      || 'no',
    stairwellDesign:   existing.stairwellDesign    || 'code',
    unitSconce:        existing.unitSconce         || 'none',
    exitSignType:      existing.exitSignType       || 'thermoplastic',
    // Carry through garage keys so we don't wipe them
    garageDesignLevel: existing.garageDesignLevel  || undefined,
    garageControls:    existing.garageControls     || undefined,
  });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setAns(a => ({ ...a, [k]: v })); }

  const corridorSf    = Number(projectData?.corridorSf)          || 0;
  const stairwells    = Number(projectData?.numEgressStairwells)  || 0;
  const numUnits      = Number(projectData?.numUnits)             || 0;
  const grossSf       = Number(projectData?.grossSf)              || 0;
  const numAccents    = Number(projectData?.numAccentDownlights)  || 0;

  // Live corridor product calculation
  const spacing     = parseInt(ans.fixtureSpacing) || 10;
  const diskRate    = DISK_RATES[spacing]     ?? 0.25;
  const recessedRate = RECESSED_RATES[spacing] ?? 1.875;
  const fixtureRate = ans.fixtureType === 'recessed' ? recessedRate : diskRate;
  const corridorProduct = corridorSf * fixtureRate;

  // Stairwell product
  const stairwellProduct = stairwells * 175; // $175/landing (code min)
  const elevatedStairAdder = ans.stairwellDesign === 'elevated' ? stairwells * 50 : 0;

  // Unit sconce
  const sconceRates = { none: 0, low: 55, medium: 125, high: 300, integrated: 200 };
  const sconceProduct = numUnits * (sconceRates[ans.unitSconce] ?? 0);

  // Accent downlights
  const accentProduct = numAccents * 160;

  // Exit signs
  const signCount = grossSf > 0 ? Math.max(1, Math.ceil(grossSf / 5000)) : 0;
  const signRates = { thermoplastic: 22, mixed: 75, edgelit: 127 };
  const exitSignProduct = signCount * (signRates[ans.exitSignType] ?? 22);

  const liveTotal = corridorProduct + stairwellProduct + elevatedStairAdder + sconceProduct + accentProduct;

  async function handleNext() {
    setSaving(true);
    // Build payload: merge garage keys through, remove undefined values
    const payload = {};
    for (const [k, v] of Object.entries({ ...existing, ...ans })) {
      if (v !== undefined) payload[k] = v;
    }
    await onSaveResponses(payload);
    setSaving(false);
    onNext();
  }

  const spacingOptions = [6, 7, 8, 9, 10, 11, 12].map(s => ({
    value: String(s),
    label: `${s} ft on center`,
    sub:   ans.fixtureType === 'recessed'
      ? `$${RECESSED_RATES[s]?.toFixed(3)}/SF`
      : `$${DISK_RATES[s]?.toFixed(2)}/SF`,
    cost: corridorSf > 0
      ? (ans.fixtureType === 'recessed' ? RECESSED_RATES[s] : DISK_RATES[s]) * corridorSf
      : undefined,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Corridors &amp; Stairwells</h2>
        <p className="text-slate-500 text-sm mt-1">
          Interior corridors, egress stairwells, elevator lobbies, and unit-entry sconces.
        </p>
      </div>

      {/* Scope */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Corridor Scope</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: 'Corridor SF',         value: corridorSf  > 0 ? corridorSf.toLocaleString()  : '—' },
            { label: 'Stairwell Landings',  value: stairwells  || '—' },
            { label: 'Total Units',         value: numUnits    || '—' },
            { label: 'Recessed Accents',    value: numAccents  || '—' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-xl font-bold text-slate-900">{item.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Fire rating info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-semibold mb-1">Fire-Rating Housing</p>
        <p>
          Recessed fixtures in fire-rated corridor ceilings require 1-hour rated housings
          (IC-rated, air-tight). Surface-mount disks avoid this requirement entirely —
          factor into fixture type selection below.
        </p>
      </div>

      {/* Fixture type */}
      <QuestionCard
        question="Corridor ceiling fixture type?"
        note="Surface-mount disks are the most cost-effective and avoid fire-rating issues. Recessed downlights provide a cleaner, higher-end look but cost significantly more and require fire-rated housings."
        costSuffix=" total"
        options={[
          {
            value: 'disk',
            label: 'Surface-mount disk (recommended)',
            sub:   'Cost-effective; no fire-rated housing required; 5" or 7" options',
            cost:  corridorSf > 0 ? corridorSf * (DISK_RATES[spacing] ?? 0.25) : undefined,
          },
          {
            value: 'recessed',
            label: 'Recessed downlights',
            sub:   'Premium appearance; requires 1-hr fire-rated housing; higher cost',
            cost:  corridorSf > 0 ? corridorSf * (RECESSED_RATES[spacing] ?? 1.875) : undefined,
          },
        ]}
        value={ans.fixtureType}
        onChange={v => set('fixtureType', v)}
      />

      {/* Spacing */}
      <QuestionCard
        question={`Fixture spacing — ${ans.fixtureType === 'recessed' ? 'recessed downlights' : 'surface-mount disks'}?`}
        note={`Tighter spacing = more fixtures, higher cost, better uniformity. ${corridorSf > 0 ? `(${corridorSf.toLocaleString()} SF of corridors)` : ''}`}
        costSuffix=" total"
        options={spacingOptions}
        value={ans.fixtureSpacing}
        onChange={v => set('fixtureSpacing', v)}
      />

      {/* Elevator lobbies */}
      <QuestionCard
        question="Elevator lobby elevated design?"
        note="Elevator lobbies are a natural focal moment — adding a pendant or decorative fixture creates a design signature. Currently an informational note; cost TBD per project."
        options={[
          { value: 'no',  label: 'Code minimum — match corridor fixtures'        },
          { value: 'yes', label: 'Elevated design — decorative pendant or accent' },
        ]}
        value={ans.elevatorLobby}
        onChange={v => set('elevatorLobby', v)}
      />

      {/* Stairwell design */}
      <QuestionCard
        question="Stairwell lighting approach?"
        note={`Code minimum uses a 4ft LED strip with integrated battery backup at each landing ($175/landing). Elevated design adds $50/landing for enhanced aesthetics. ${stairwells > 0 ? `(${stairwells} landings)` : ''}`}
        costSuffix=" total"
        options={[
          {
            value: 'code',
            label:  'Code minimum',
            sub:    '$175/landing — 4ft LED strip w/ integrated battery backup',
            cost:   stairwells * 175,
          },
          {
            value: 'elevated',
            label:  'Elevated design',
            sub:    '$225/landing — adds aesthetic upgrade (+$50/landing)',
            cost:   stairwells * 225,
          },
        ]}
        value={ans.stairwellDesign}
        onChange={v => set('stairwellDesign', v)}
      />

      {/* Unit entry sconce */}
      <QuestionCard
        question="Unit-entry sconce?"
        note={`A sconce at each unit front door creates a residential feel and helps tenants identify their unit. ${numUnits > 0 ? `(${numUnits} units)` : ''}`}
        costSuffix="/unit"
        options={[
          { value: 'none',       label: 'None',                              cost: 0   },
          { value: 'low',        label: 'Sconce — Low Finish',   sub: '$55 ea',   cost: 55  },
          { value: 'medium',     label: 'Sconce — Medium Finish', sub: '$125 ea', cost: 125 },
          { value: 'high',       label: 'Sconce — High Finish',  sub: '$300 ea',  cost: 300 },
          { value: 'integrated', label: 'Integrated Unit # + Light', sub: '$200 ea', cost: 200 },
        ]}
        value={ans.unitSconce}
        onChange={v => set('unitSconce', v)}
      />

      {/* Recessed accents info */}
      {numAccents > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
          <p className="font-semibold mb-1">Recessed Accent Downlights</p>
          <p>
            {numAccents} adjustable recessed accent downlights entered in Project Data ×
            $160 ea (1-hr fire-rated) = ${(numAccents * 160).toLocaleString()} included in budget.
          </p>
        </div>
      )}

      {/* Exit signs */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Exit Signs</div>
        <QuestionCard
          question="Exit sign type?"
          note={`${grossSf > 0 ? `Approx. ${signCount} exit sign${signCount !== 1 ? 's' : ''} for this project (1 per 5,000 gross SF).` : ''} Thermoplastic is code-compliant at lowest cost. Edge-lit is low-profile and design-forward. Mixed is recommended for design buildings with a back-of-house garage.`}
          costSuffix=" total"
          options={[
            {
              value: 'thermoplastic',
              label:  'Thermoplastic',
              sub:    '~$22 ea — code-compliant, bulkier profile; use throughout',
              cost:   signCount * 22,
            },
            {
              value: 'mixed',
              label:  'Mixed — Edge-lit FOH + Thermoplastic BOH/Garage',
              sub:    '~$75 ea blended avg — design-forward in lobby/corridors, code-min in BOH',
              cost:   signCount * 75,
            },
            {
              value: 'edgelit',
              label:  'Edge-lit everywhere',
              sub:    '~$127 ea — cleanest appearance throughout; highest cost',
              cost:   signCount * 127,
            },
          ]}
          value={ans.exitSignType}
          onChange={v => set('exitSignType', v)}
        />
      </div>

      {/* Live cost breakdown */}
      {(corridorSf > 0 || stairwells > 0 || numUnits > 0) && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Live Estimate</div>
          <div className="space-y-1.5 text-sm">
            {[
              { label: `Corridor fixtures (${corridorSf.toLocaleString()} SF × $${fixtureRate.toFixed(3)}/SF)`, value: corridorProduct,       show: corridorSf > 0 },
              { label: `Stairwells (${stairwells} landings × $175)`,                                             value: stairwellProduct,      show: stairwells > 0 },
              { label: `Stairwell elevated adder (${stairwells} × $50)`,                                         value: elevatedStairAdder,    show: elevatedStairAdder > 0 },
              { label: `Unit-entry sconces (${numUnits} × $${sconceRates[ans.unitSconce] ?? 0})`,               value: sconceProduct,         show: sconceProduct > 0 },
              { label: `Recessed accents (${numAccents} × $160)`,                                                value: accentProduct,         show: accentProduct > 0 },
              { label: `Exit signs (${signCount} × $${signRates[ans.exitSignType] ?? 22})`,                      value: exitSignProduct,       show: signCount > 0 },
            ].filter(r => r.show).map(row => (
              <div key={row.label} className="flex justify-between text-slate-600">
                <span className="text-xs">{row.label}</span>
                <span className="font-mono text-xs font-semibold">${row.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-300 pt-2 mt-2 font-bold text-slate-900">
              <span className="text-sm">Corridor Total (excl. exit signs)</span>
              <span className="font-mono text-sm">${liveTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onPrev}>Back</Button>
        <Button variant="amber" size="lg" loading={saving} onClick={handleNext}>
          Save &amp; Continue to Amenities
        </Button>
      </div>
    </div>
  );
}
