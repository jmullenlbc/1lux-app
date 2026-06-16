'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard from '@/components/sections/QuestionCard';
import StandardsHint from '@/components/wizard/StandardsHint';
import { PRICING } from '@/lib/pricing';

// Static fallbacks — live values come from the master pricing prop (see P below).
const DISK_RATES     = { 6: 0.40, 7: 0.35, 8: 0.30, 9: 0.28, 10: 0.25, 11: 0.23, 12: 0.23 };
const RECESSED_RATES = { 6: 3.00, 7: 2.625, 8: 2.25, 9: 2.10, 10: 1.875, 11: 1.725, 12: 1.725 };

export default function DesignCorridorsSection({
  responses,
  projectData,
  pricing,
  onSaveResponses,
  onNext,
  onPrev,
}) {
  const P = pricing || PRICING;
  const DISK_RATE_TABLE     = P.designCorridors?.diskSpacingRates     || DISK_RATES;
  const RECESSED_RATE_TABLE = P.designCorridors?.recessedSpacingRates || RECESSED_RATES;
  const existing = responses || {};
  const [ans, setAns] = useState({
    fixtureType:       existing.fixtureType       || 'disk',
    fixtureSpacing:    existing.fixtureSpacing     || '10',
    elevatorLobby:     existing.elevatorLobby      || 'no',
    stairwellDesign:   existing.stairwellDesign    || 'code',
    unitSconce:        existing.unitSconce         || 'none',
    // Manual accent qty entered right here; falls back to Project Data
    accentQty:         existing.accentQty ?? (projectData?.numAccentDownlights ?? ''),
    // Carry through keys so we don't wipe them on save
    exitSignType:      existing.exitSignType       || undefined,
    garageDesignLevel: existing.garageDesignLevel  || undefined,
    garageControls:    existing.garageControls     || undefined,
  });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setAns(a => ({ ...a, [k]: v })); }

  const corridorSf    = Number(projectData?.corridorSf)          || 0;
  const stairwells    = Number(projectData?.numEgressStairwells)  || 0;
  const numUnits      = Number(projectData?.numUnits)             || 0;
  const numAccents    = Number(ans.accentQty) || 0;

  // Live corridor product calculation (reads master pricing)
  const DEFAULT_DISK_RATE = P.corridors?.diskPerSf ?? 0.27;
  const spacing     = parseInt(ans.fixtureSpacing) || 10;
  const diskRate    = DISK_RATE_TABLE[spacing]     ?? DEFAULT_DISK_RATE;
  const recessedRate = RECESSED_RATE_TABLE[spacing] ?? DEFAULT_DISK_RATE;
  const fixtureRate = ans.fixtureType === 'recessed' ? recessedRate : diskRate;
  const corridorProduct = corridorSf * fixtureRate;

  // Stairwell product
  const STAIR_EACH  = P.corridors?.stairwellPerLanding?.product ?? 175;
  const STAIR_ELEV  = P.designCorridors?.stairwellElevatedAdder ?? 50;
  const stairwellProduct = stairwells * STAIR_EACH;
  const elevatedStairAdder = ans.stairwellDesign === 'elevated' ? stairwells * STAIR_ELEV : 0;

  // Unit sconce
  const sconceRates = {
    none:       P.corridorSconce?.none?.product       ?? 0,
    low:        P.corridorSconce?.low?.product        ?? 55,
    medium:     P.corridorSconce?.medium?.product     ?? 125,
    high:       P.corridorSconce?.high?.product       ?? 300,
    integrated: P.corridorSconce?.integrated?.product ?? 200,
  };
  const sconceProduct = numUnits * (sconceRates[ans.unitSconce] ?? 0);

  // Accent downlights
  const ACCENT_EACH = P.designCorridors?.accentDownlightEach ?? 120;
  const accentProduct = numAccents * ACCENT_EACH;

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
      ? `$${RECESSED_RATE_TABLE[s]?.toFixed(3)}/SF`
      : `$${DISK_RATE_TABLE[s]?.toFixed(2)}/SF`,
    cost: corridorSf > 0
      ? (ans.fixtureType === 'recessed' ? RECESSED_RATE_TABLE[s] : DISK_RATE_TABLE[s]) * corridorSf
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

      <StandardsHint category="CORRIDOR" />

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
            cost:  corridorSf > 0 ? corridorSf * (DISK_RATE_TABLE[spacing] ?? 0.25) : undefined,
          },
          {
            value: 'recessed',
            label: 'Recessed downlights',
            sub:   'Premium appearance; requires 1-hr fire-rated housing; higher cost',
            cost:  corridorSf > 0 ? corridorSf * (RECESSED_RATE_TABLE[spacing] ?? 1.875) : undefined,
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
            sub:    `$${STAIR_EACH}/landing — 4ft LED strip w/ integrated battery backup`,
            cost:   stairwells * STAIR_EACH,
          },
          {
            value: 'elevated',
            label:  'Elevated design',
            sub:    `$${STAIR_EACH + STAIR_ELEV}/landing — adds aesthetic upgrade (+$${STAIR_ELEV}/landing)`,
            cost:   stairwells * (STAIR_EACH + STAIR_ELEV),
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
          { value: 'none',       label: 'None',                              cost: sconceRates.none },
          { value: 'low',        label: 'Sconce — Low Finish',     cost: sconceRates.low  },
          { value: 'medium',     label: 'Sconce — Medium Finish',  cost: sconceRates.medium },
          { value: 'high',       label: 'Sconce — High Finish',    cost: sconceRates.high },
          { value: 'integrated', label: 'Integrated Unit # + Light', cost: sconceRates.integrated },
        ]}
        value={ans.unitSconce}
        onChange={v => set('unitSconce', v)}
      />

      {/* Recessed accents — manual quantity entered right here */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-amber-900 mb-1">Recessed Accent Downlights</p>
        <p className="text-xs text-amber-800 mb-3">
          Adjustable, 1-hr fire-rated accent downlights (e.g. art / decal lit by an art light) — ${ACCENT_EACH}/ea.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-medium text-amber-900">Quantity</label>
          <input
            type="number"
            min={0}
            value={ans.accentQty}
            onChange={e => set('accentQty', e.target.value)}
            placeholder="0"
            className="w-28 border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <span className="text-xs text-amber-800 font-medium">
            × ${ACCENT_EACH} = ${(numAccents * ACCENT_EACH).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Live cost breakdown */}
      {(corridorSf > 0 || stairwells > 0 || numUnits > 0) && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Live Estimate</div>
          <div className="space-y-1.5 text-sm">
            {[
              { label: `Corridor fixtures (${corridorSf.toLocaleString()} SF × $${fixtureRate.toFixed(3)}/SF)`, value: corridorProduct,    show: corridorSf > 0 },
              { label: `Stairwells (${stairwells} landings × $${STAIR_EACH})`,                                             value: stairwellProduct,   show: stairwells > 0 },
              { label: `Stairwell elevated adder (${stairwells} × $50)`,                                         value: elevatedStairAdder, show: elevatedStairAdder > 0 },
              { label: `Unit-entry sconces (${numUnits} × $${sconceRates[ans.unitSconce] ?? 0})`,               value: sconceProduct,      show: sconceProduct > 0 },
              { label: `Recessed accents (${numAccents} × $${ACCENT_EACH})`,                                                value: accentProduct,      show: accentProduct > 0 },
            ].filter(r => r.show).map(row => (
              <div key={row.label} className="flex justify-between text-slate-600">
                <span className="text-xs">{row.label}</span>
                <span className="font-mono text-xs font-semibold">${row.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-300 pt-2 mt-2 font-bold text-slate-900">
              <span className="text-sm">Corridor Total</span>
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
