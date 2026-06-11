'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import QuestionCard from './QuestionCard';
import { formatCurrency } from '@/lib/calculations';
import StandardsHint from '@/components/wizard/StandardsHint';

const DISK_RATES     = { 6: 0.40, 7: 0.35, 8: 0.30, 9: 0.28, 10: 0.25, 11: 0.23, 12: 0.23 };
const RECESSED_RATES = { 6: 3.00, 7: 2.625, 8: 2.25, 9: 2.10, 10: 1.875, 11: 1.725, 12: 1.725 };

export default function CorridorsSection({ responses, projectData, onSaveResponses, onNext, onPrev, isDesign = false }) {
  const existing = responses || {};
  const [ans, setAns] = useState({
    unitSconce:        existing.unitSconce        || 'none',
    // Design-only
    corridorFireRating:existing.corridorFireRating || 'surfaceMount',
    fixtureType:       existing.fixtureType       || 'disk',
    fixtureSpacing:    existing.fixtureSpacing     || '10',
    corridorEnds:      existing.corridorEnds       || 'none',
    corridorSpecial:   existing.corridorSpecial    || 'no',
    elevatorLobby:     existing.elevatorLobby      || 'no',
    stairwellPainting: existing.stairwellPainting  || 'unpainted',
    stairwellDesign:   existing.stairwellDesign    || 'code',
    garageDesignLevel: existing.garageDesignLevel  || undefined,
    garageControls:    existing.garageControls     || undefined,
  });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setAns(a => ({ ...a, [k]: v })); }

  const corridorSf  = Number(projectData?.corridorSf)         || 0;
  const stairwells  = Number(projectData?.numEgressStairwells) || 0;
  const numUnits    = Number(projectData?.numUnits)            || 0;
  const numAccents  = Number(projectData?.numAccentDownlights) || 0;
  const garageSf    = Number(projectData?.garageSf)            || 0;

  // Conceptual: ~1 disk per 50 SF of corridor
  const diskCount = corridorSf > 0 ? Math.round(corridorSf / 50) : null;

  // Design: live corridor product
  // Match the engine: with no fixture-spacing answer, corridors use the flat
  // $0.27/SF default; once a spacing is chosen, use the spacing-rate table.
  const DEFAULT_DISK_RATE = 0.27;
  const hasSpacing    = !!ans.fixtureSpacing;
  const spacing       = parseInt(ans.fixtureSpacing) || 10;
  const fixtureRate   = !hasSpacing
    ? DEFAULT_DISK_RATE
    : (ans.fixtureType === 'recessed'
        ? (RECESSED_RATES[spacing] ?? DEFAULT_DISK_RATE)
        : (DISK_RATES[spacing]     ?? DEFAULT_DISK_RATE));
  const corridorProd  = corridorSf * fixtureRate;
  const stairwellProd = stairwells * 175;
  const stairElevated = ans.stairwellDesign === 'elevated' ? stairwells * 50 : 0;
  const sconceRates   = { none: 0, low: 55, medium: 125, high: 300, integrated: 200 };
  const sconceProd    = numUnits * (sconceRates[ans.unitSconce] ?? 0);
  const accentProd    = numAccents * 120; // matches engine designCorridors.accentDownlightEach
  const liveTotal     = corridorProd + stairwellProd + stairElevated + sconceProd + accentProd;

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

  async function handleNext() {
    setSaving(true);
    // Always merge to preserve exitSignType written by ExitSignsSection
    const payload = {};
    for (const [k, v] of Object.entries({ ...existing, ...ans })) {
      if (v !== undefined) payload[k] = v;
    }
    // Null out design-only keys in conceptual mode
    if (!isDesign) {
      payload.corridorFireRating = null;
      payload.fixtureType        = null;
      payload.fixtureSpacing     = null;
      payload.corridorEnds       = null;
      payload.corridorSpecial    = null;
      payload.elevatorLobby      = null;
      payload.stairwellPainting  = null;
      payload.stairwellDesign    = null;
    }
    await onSaveResponses(payload);
    setSaving(false);
    onNext();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Corridors &amp; Stairwells</h2>
        <p className="text-slate-500 text-sm mt-1">
          {isDesign
            ? 'Interior corridors, egress stairwells, elevator lobbies, unit-entry sconces, and garage lighting.'
            : 'Corridor and stairwell lighting scope. Base design assumes 7" surface-mount disks at 10ft spacing in corridors, and 4ft LED strips with occupancy sensors + battery backup in stairwells.'}
        </p>
      </div>

      <StandardsHint category="CORRIDOR" />

      {/* Scope summary */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          {isDesign ? 'Corridor Scope' : 'Auto-Calculated Scope'}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: 'Corridor SF',        value: corridorSf  > 0 ? corridorSf.toLocaleString() : '—' },
            { label: 'Stairwell Landings', value: stairwells  || '—' },
            { label: 'Total Units',        value: numUnits    || '—' },
            { label: isDesign ? 'Recessed Accents' : 'Corridor Disks (est.)', value: isDesign ? (numAccents || '—') : (diskCount || '—') },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border border-slate-100 p-3">
              <div className="text-xl font-bold text-slate-900">{item.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        {!isDesign && (
          <p className="text-xs text-slate-400 mt-3">
            Base pricing includes corridor disks, stairwell fixtures, and occupancy sensors.
            Enter corridor SF and stairwell landing count in Project Data to see calculations.
          </p>
        )}
      </div>

      {/* ── DESIGN-ONLY: Fire rating note ─────────────────────────────────── */}
      {isDesign && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
          <p className="font-semibold mb-1">Fire-Rating Housing</p>
          <p>Recessed fixtures in fire-rated corridor ceilings require 1-hour rated IC housings (air-tight). Surface-mount disks avoid this requirement entirely — factor into fixture type selection below.</p>
        </div>
      )}

      {/* ── DESIGN-ONLY: Fire rating question ─────────────────────────────── */}
      {isDesign && (
        <QuestionCard
          question="Corridor ceiling fire-rating approach?"
          note="Surface-mount disks avoid fire-rated housing requirements and are significantly less expensive. This selection drives the fixture type recommendation below."
          options={[
            { value: 'surfaceMount', label: 'Surface-mount fixtures — no fire-rated housing required', sub: 'Recommended for cost', cost: 0 },
            { value: '1hr',          label: '1-Hour rated corridor ceilings',                          sub: 'Requires IC-rated, air-tight housings for any recessed fixtures', cost: 0 },
            { value: '2hr',          label: '2-Hour rated corridor ceilings',                          sub: 'Most restrictive; limits fixture type options', cost: 0 },
          ]}
          value={ans.corridorFireRating}
          onChange={v => set('corridorFireRating', v)}
        />
      )}

      {/* ── DESIGN-ONLY: Fixture type ─────────────────────────────────────── */}
      {isDesign && (
        <QuestionCard
          question="Corridor ceiling fixture type?"
          note="Surface-mount disks are the most cost-effective and avoid fire-rating issues. Recessed downlights provide a cleaner, higher-end look but cost significantly more and require fire-rated housings."
          costSuffix=" total"
          options={[
            {
              value: 'disk',
              label: 'Surface-mount disk (recommended)',
              sub:   'Cost-effective; no fire-rated housing required',
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
      )}

      {/* ── DESIGN-ONLY: Spacing ─────────────────────────────────────────── */}
      {isDesign && (
        <QuestionCard
          question={`Fixture spacing — ${ans.fixtureType === 'recessed' ? 'recessed downlights' : 'surface-mount disks'}?`}
          note={`Tighter spacing = more fixtures, higher cost, better uniformity. ${corridorSf > 0 ? `(${corridorSf.toLocaleString()} SF of corridors)` : ''}`}
          costSuffix=" total"
          options={spacingOptions}
          value={ans.fixtureSpacing}
          onChange={v => set('fixtureSpacing', v)}
        />
      )}

      {/* ── DESIGN-ONLY: Corridor ends ────────────────────────────────────── */}
      {isDesign && (
        <QuestionCard
          question="Corridor end treatments — any special fixtures at corridor terminations?"
          note="Adding a sconce or decorative element at corridor dead-ends creates visual interest and makes long corridors feel less institutional."
          options={[
            { value: 'none',        label: 'None — standard fixtures throughout',             cost: 0 },
            { value: 'sconce',      label: 'Sconce at corridor ends',                         sub: 'Decorative accent at dead-ends', cost: 0 },
            { value: 'artLighting', label: 'Art / gallery lighting at corridor ends',         sub: 'Adjustable accent fixtures for artwork', cost: 0 },
          ]}
          value={ans.corridorEnds}
          onChange={v => set('corridorEnds', v)}
        />
      )}

      {/* ── DESIGN-ONLY: Corridor special ────────────────────────────────── */}
      {isDesign && (
        <QuestionCard
          question="Any special corridor lighting requirements or design features?"
          note="Informational — used for scoping notes. Examples: wayfinding accent strips, color-tunable fixtures, or architectural reveals."
          options={[
            { value: 'no',  label: 'No — standard corridor lighting',             cost: 0 },
            { value: 'yes', label: 'Yes — special design features required',      sub: 'Describe in project notes', cost: 0 },
          ]}
          value={ans.corridorSpecial}
          onChange={v => set('corridorSpecial', v)}
        />
      )}

      {/* ── DESIGN-ONLY: Elevator lobby ─────────────────────────────────── */}
      {isDesign && (
        <QuestionCard
          question="Elevator lobby elevated design?"
          note="Elevator lobbies are a natural focal moment — adding a pendant or decorative fixture creates a design signature. Currently informational; cost TBD per project."
          options={[
            { value: 'no',  label: 'Code minimum — match corridor fixtures',         cost: 0 },
            { value: 'yes', label: 'Elevated design — decorative pendant or accent', cost: 0 },
          ]}
          value={ans.elevatorLobby}
          onChange={v => set('elevatorLobby', v)}
        />
      )}

      {/* ── DESIGN-ONLY: Stairwell painting ─────────────────────────────── */}
      {isDesign && (
        <QuestionCard
          question="Are stairwells painted / finished or unfinished (exposed concrete/CMU)?"
          note="Painted stairwells are a sign of a better-quality building and can accommodate surface-mount fixtures more naturally. Unfinished stairwells typically use surface-mount strips only."
          options={[
            { value: 'unpainted', label: 'Unfinished / exposed concrete or CMU', cost: 0 },
            { value: 'painted',   label: 'Painted and finished stairwells',       cost: 0 },
          ]}
          value={ans.stairwellPainting}
          onChange={v => set('stairwellPainting', v)}
        />
      )}

      {/* ── DESIGN-ONLY: Stairwell design level ─────────────────────────── */}
      {isDesign && (
        <QuestionCard
          question="Stairwell lighting approach?"
          note={`Code minimum uses a 4ft LED strip with integrated battery backup at each landing ($175/landing). Elevated design adds $50/landing. ${stairwells > 0 ? `(${stairwells} landings)` : ''}`}
          costSuffix=" total"
          options={[
            {
              value: 'code',
              label: 'Code minimum',
              sub:   '$175/landing — 4ft LED strip w/ integrated battery backup',
              cost:  stairwells * 175,
            },
            {
              value: 'elevated',
              label: 'Elevated design',
              sub:   '$225/landing — aesthetic upgrade (+$50/landing)',
              cost:  stairwells * 225,
            },
          ]}
          value={ans.stairwellDesign}
          onChange={v => set('stairwellDesign', v)}
        />
      )}

      {/* ── Unit entry sconce (both modes) ───────────────────────────────── */}
      <QuestionCard
        question="Would you like a sconce at every unit entry?"
        note={`One sconce per unit, mounted at the unit door in the corridor. The integrated option includes the unit number plate. ${numUnits > 0 ? `(${numUnits} units)` : ''}`}
        costSuffix="/unit"
        options={[
          { value: 'none',       label: 'None — no unit-entry sconce',         cost: 0   },
          { value: 'low',        label: 'Sconce — Low Finish',    sub: '$55 ea',   cost: 55  },
          { value: 'medium',     label: 'Sconce — Medium Finish', sub: '$125 ea',  cost: 125 },
          { value: 'high',       label: 'Sconce — High Finish',   sub: '$300 ea',  cost: 300 },
          { value: 'integrated', label: 'Integrated Unit # + Light', sub: '$200 ea', cost: 200 },
        ]}
        value={ans.unitSconce}
        onChange={v => set('unitSconce', v)}
      />

      {/* ── DESIGN-ONLY: Recessed accents info ──────────────────────────── */}
      {isDesign && numAccents > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
          <p className="font-semibold mb-1">Recessed Accent Downlights</p>
          <p>{numAccents} adjustable recessed accent downlights entered in Project Data × $120 ea (1-hr fire-rated) = {formatCurrency(numAccents * 120)} included in budget.</p>
        </div>
      )}

      {/* ── DESIGN-ONLY: Garage questions (if garageSf > 0) ─────────────── */}
      {isDesign && garageSf > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Enclosed Garage</div>
          <div className="space-y-4">

            <QuestionCard
              question="Garage lighting design level?"
              note={`Applies to ${garageSf.toLocaleString()} SF of enclosed garage. Standard uses LED strip lighting on a grid. Enhanced adds better color rendering and uniformity.`}
              costSuffix=" total"
              options={[
                {
                  value: 'standard',
                  label: 'Standard — LED linear strips on grid',
                  sub:   '$0.30/SF — code-compliant, efficient',
                  cost:  garageSf * 0.30,
                },
                {
                  value: 'enhanced',
                  label: 'Enhanced — better uniformity and CRI',
                  sub:   '$0.45/SF — improved tenant and safety experience',
                  cost:  garageSf * 0.45,
                },
              ]}
              value={ans.garageDesignLevel || 'standard'}
              onChange={v => set('garageDesignLevel', v)}
            />

            <QuestionCard
              question="Garage lighting controls?"
              note="Occupancy sensors in garages are code-required in most jurisdictions. Daylight harvesting adds cost but can generate energy credits."
              options={[
                { value: 'occupancy',   label: 'Occupancy sensors only — code minimum',               sub: 'Required in most jurisdictions', cost: 0 },
                { value: 'daylighting', label: 'Occupancy + daylight harvesting sensors',              sub: 'Additional cost; potential energy credit', cost: 0 },
              ]}
              value={ans.garageControls || 'occupancy'}
              onChange={v => set('garageControls', v)}
            />

          </div>
        </div>
      )}

      {/* ── DESIGN-ONLY: Live cost breakdown ─────────────────────────────── */}
      {isDesign && (corridorSf > 0 || stairwells > 0 || numUnits > 0) && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Live Estimate</div>
          <div className="space-y-1.5 text-sm">
            {[
              { label: `Corridor fixtures (${corridorSf.toLocaleString()} SF × $${fixtureRate.toFixed(3)}/SF)`, value: corridorProd,   show: corridorSf > 0 },
              { label: `Stairwells (${stairwells} landings × $175)`,                                              value: stairwellProd,  show: stairwells > 0 },
              { label: `Stairwell elevated adder (${stairwells} × $50)`,                                          value: stairElevated,  show: stairElevated > 0 },
              { label: `Unit-entry sconces (${numUnits} × $${sconceRates[ans.unitSconce] ?? 0})`,                value: sconceProd,     show: sconceProd > 0 },
              { label: `Recessed accents (${numAccents} × $160)`,                                                 value: accentProd,     show: accentProd > 0 },
            ].filter(r => r.show).map(row => (
              <div key={row.label} className="flex justify-between text-slate-600">
                <span className="text-xs">{row.label}</span>
                <span className="font-mono text-xs font-semibold">{formatCurrency(row.value)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-300 pt-2 mt-2 font-bold text-slate-900">
              <span className="text-sm">Corridor Total (excl. exit signs)</span>
              <span className="font-mono text-sm">{formatCurrency(liveTotal)}</span>
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
