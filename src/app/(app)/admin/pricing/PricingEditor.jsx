'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';

// Flat definition of every editable pricing field
// key = dot-notation path into the pricing object
const PRICING_FIELDS = [
  // ── BASE ──────────────────────────────────────────────────────────────
  { group: 'Base Unit Rate', key: 'base.perSf', label: 'Per SF Rate', desc: '$/SF of residential units gross SF', unit: '$/SF' },

  // ── UNDERCABINET ──────────────────────────────────────────────────────
  { group: 'Undercabinet Lighting', key: 'undercabinet.lineVoltage.product', label: 'Line Voltage', desc: '120V line voltage per unit', unit: '$/unit' },
  { group: 'Undercabinet Lighting', key: 'undercabinet.lowVoltage.product',  label: 'Low Voltage LED Tape', desc: 'LED tape + channel + driver per unit', unit: '$/unit' },

  // ── KITCHEN PENDANTS ──────────────────────────────────────────────────
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.threeSmallLow.product',    label: '(3) Small — Low',           desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.threeSmallMedium.product', label: '(3) Small — Medium',         desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.twoMediumLow.product',     label: '(2) Medium — Low',           desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.twoMediumMedium.product',  label: '(2) Medium — Medium',        desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.oneLarge.product',         label: '(1) Large Statement',        desc: 'Per unit', unit: '$/unit' },
  { group: 'Kitchen Island Pendants', key: 'kitchenPendants.oneLinear.product',        label: '(1) Linear over Island',     desc: 'Per unit', unit: '$/unit' },

  // ── CEILING FANS ──────────────────────────────────────────────────────
  { group: 'Ceiling Fans', key: 'fans.adderPerFan', label: 'Net Adder Per Fan', desc: 'Gross fan cost minus disk credit', unit: '$/fan' },
  { group: 'Ceiling Fans', key: 'fans.diskCredit',  label: 'Disk Credit',       desc: 'Base disk removed when fan installed', unit: '$/fan' },
  { group: 'Ceiling Fans', key: 'fans.totalPerFan', label: 'Gross Per Fan',     desc: 'Full product cost before credit', unit: '$/fan' },

  // ── VANITY LIGHTING ───────────────────────────────────────────────────
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.illuminatedMirrorLow.product',    label: 'Illuminated Mirror — Low',    desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.illuminatedMirrorMedium.product', label: 'Illuminated Mirror — Medium', desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.illuminatedMirrorHigh.product',   label: 'Illuminated Mirror — High',   desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.bathBarMedium.product',           label: 'Bath Bar — Medium',           desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanity.bathBarHigh.product',             label: 'Bath Bar — High',             desc: 'Gross product price', unit: '$/vanity' },
  { group: 'Vanity Lighting (gross — credit applied by tool)', key: 'vanityBathBarCredit',                    label: 'Bath-Bar Credit (subtracted)', desc: 'Base $0.38/SF includes a bath bar — subtracted from every vanity upgrade', unit: '$/vanity' },

  // ── BALCONY ───────────────────────────────────────────────────────────
  { group: 'Balcony Fixtures (net adders)', key: 'balcony.sconcelow.product',    label: 'Sconce — Low',    desc: 'Upgrade adder over base disk', unit: '$/balcony' },
  { group: 'Balcony Fixtures (net adders)', key: 'balcony.sconceMedium.product', label: 'Sconce — Medium', desc: 'Upgrade adder over base disk', unit: '$/balcony' },
  { group: 'Balcony Fixtures (net adders)', key: 'balcony.sconceHigh.product',   label: 'Sconce — High',   desc: 'Upgrade adder over base disk', unit: '$/balcony' },

  // ── CORRIDORS ─────────────────────────────────────────────────────────
  { group: 'Corridors & Stairwells', key: 'corridors.diskPerSf',                       label: 'Corridor Disk Rate',       desc: '7" disk @ 10ft spacing, flat $/SF', unit: '$/SF' },
  { group: 'Corridors & Stairwells', key: 'corridors.stairwellPerLanding.product',     label: 'Stairwell Per Landing',    desc: '4ft LED strip + occupancy + battery', unit: '$/landing' },
  { group: 'Corridors & Stairwells', key: 'corridorSconce.low.product',                label: 'Unit Entry Sconce — Low',  desc: 'Per unit', unit: '$/unit' },
  { group: 'Corridors & Stairwells', key: 'corridorSconce.medium.product',             label: 'Unit Entry Sconce — Medium', desc: 'Per unit', unit: '$/unit' },
  { group: 'Corridors & Stairwells', key: 'corridorSconce.high.product',               label: 'Unit Entry Sconce — High', desc: 'Per unit', unit: '$/unit' },
  { group: 'Corridors & Stairwells', key: 'corridorSconce.integrated.product',         label: 'Unit Entry Integrated',    desc: 'Unit number + light per unit', unit: '$/unit' },

  // ── BOH / GARAGE ──────────────────────────────────────────────────────
  { group: 'BOH & Garage', key: 'boh.perSf',    label: 'BOH / Core + Shell Rate', desc: '$/SF of BOH area', unit: '$/SF' },
  { group: 'BOH & Garage', key: 'garage.perSf', label: 'Enclosed Garage Rate',    desc: '$/SF of garage area', unit: '$/SF' },

  // ── INTERIOR AMENITIES ────────────────────────────────────────────────
  { group: 'Interior Amenities', key: 'interiorAmenities.low',    label: 'Low Finish',    desc: '$/SF', unit: '$/SF' },
  { group: 'Interior Amenities', key: 'interiorAmenities.medium', label: 'Medium Finish', desc: '$/SF', unit: '$/SF' },
  { group: 'Interior Amenities', key: 'interiorAmenities.high',   label: 'High Finish',   desc: '$/SF', unit: '$/SF' },

  // ── EXTERIOR AMENITIES ────────────────────────────────────────────────
  { group: 'Exterior Amenities', key: 'exteriorAmenities.low',               label: 'Low Finish',        desc: '$/SF', unit: '$/SF' },
  { group: 'Exterior Amenities', key: 'exteriorAmenities.medium',            label: 'Medium Finish',     desc: '$/SF', unit: '$/SF' },
  { group: 'Exterior Amenities', key: 'exteriorAmenities.high',              label: 'High Finish',       desc: '$/SF', unit: '$/SF' },
  { group: 'Exterior Amenities', key: 'exteriorAmenities.nighttimeMultiplier', label: 'Nighttime Multiplier', desc: 'Multiplied when open after sunset', unit: '×' },

  // ── EXTERIOR SITE ─────────────────────────────────────────────────────
  // Key was `perStall` until 2026-07-18, but nothing reads that — pricing.js defines
  // `perFixture` and both the engine and the UI preview read `perFixture`, so every
  // edit made through this field was silently discarded. Label was misleading too:
  // $1,325 buys one area light + pole covering ~9 stalls, not one stall.
  { group: 'Exterior Site', key: 'exterior.surfaceParking.perFixture',   label: 'Surface Parking — Per Fixture', desc: 'Area light + 30ft pole (covers ~9 stalls)', unit: '$/fixture' },
  { group: 'Exterior Site', key: 'exterior.surfaceParking.stallsPerFixture', label: 'Stalls Per Fixture',    desc: 'How many stalls one area light covers', unit: 'stalls' },
  { group: 'Exterior Site', key: 'exterior.carport.diskEveryOther',      label: 'Carport Disk (every other)', desc: '7" disk per every other bay', unit: '$/disk' },
  { group: 'Exterior Site', key: 'exterior.detachedGarage.sconcePerDoor', label: 'Garage Sconce Per Door',   desc: 'Per detached garage door', unit: '$/door' },
  { group: 'Exterior Site', key: 'exterior.exteriorDoor.primarySconce',  label: 'Exterior Door — Primary',   desc: 'First sconce of each pair', unit: '$/door' },
  { group: 'Exterior Site', key: 'exterior.exteriorDoor.secondarySconce', label: 'Exterior Door — Secondary', desc: 'Second sconce of each pair', unit: '$/door' },
  { group: 'Exterior Site', key: 'exterior.exteriorDoor.wallpackWithBattery', label: 'Wallpack + Battery',   desc: 'Egress wallpack w/ battery backup — not yet wired to the formula', unit: '$/door' },
  { group: 'Exterior Site', key: 'exterior.pathway.minTotal',            label: 'Pathway Lighting Floor',    desc: 'Minimum pathway lighting for sites with a minimal walkway network', unit: '$' },
  // Provisional — not yet driving any budget. See the evidence note in pricing.js.
  { group: 'Exterior Site', key: 'exterior.pathway.bollardsPerUnit.singleFamily', label: 'Bollards/Unit — Single Family',   desc: 'TIER 1. Horizontal product, same model as BTR townhomes', unit: 'per unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.bollardsPerUnit.townHouses',   label: 'Bollards/Unit — Townhouses',      desc: 'TIER 1. Only rate grounded in actuals — 6 NexMetro BTR photometric-priced budgets (median 0.517), reduced ~30% since NexMetro runs heavier than typical BTR', unit: 'per unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.bollardsPerUnit.stackedFlats', label: 'Bollards/Unit — Stacked Flats',   desc: 'TIER 1. NO DATA — horizontal-ish, set just below townhome. Needs calibration', unit: 'per unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.bollardsPerUnit.garden',       label: 'Bollards/Unit — Garden',          desc: 'TIER 1. Mike: garden runs more like townhomes than podium/wrap. NOTE: conceptual budgets show only 0.062 — that gap is likely under-estimation at concept stage', unit: 'per unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.bollardsPerUnit.wrap',         label: 'Bollards/Unit — Wrap',            desc: 'TIER 2. Runs higher when surface parking is present; observed spread 0.018–0.085 reflects exactly that', unit: 'per unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.bollardsPerUnit.gurban',       label: 'Bollards/Unit — Urban Garden',    desc: 'TIER 2. NO DATA — grouped with wrap', unit: 'per unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.bollardsPerUnit.podium',       label: 'Bollards/Unit — Podium',          desc: 'TIER 3. Structured parking + interior circulation = least site lighting. Observed 0.025', unit: 'per unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.bollardsPerUnit.midRise',      label: 'Bollards/Unit — Mid Rise',        desc: 'TIER 3. NO DATA — least site lighting', unit: 'per unit' },
  { group: 'Exterior Site', key: 'exterior.pathway.bollardsPerUnit.highRise',     label: 'Bollards/Unit — High Rise',       desc: 'TIER 3. Least site lighting. Observed 0.045', unit: 'per unit' },
  { group: 'Exterior Site', key: 'exterior.landscape.pctOfNetLotSf',     label: 'Landscape % of Lot SF',     desc: 'Landscape lighting as a % of lot SF (0.02 = 2%)', unit: 'decimal' },
  { group: 'Exterior Site', key: 'exterior.landscape.maxTotal',          label: 'Landscape Cap',             desc: 'Hard ceiling on landscape lighting regardless of lot size', unit: '$' },
  { group: 'Exterior Site', key: 'exterior.miscBufferPct',               label: 'Misc Buffer %',             desc: '% of exterior subtotal before misc', unit: '%' },

  // ── EMERGENCY ─────────────────────────────────────────────────────────
  { group: 'Emergency — Frogeyes', key: 'emergency.strategies.frogeyes.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Frogeyes', key: 'emergency.strategies.frogeyes.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },
  { group: 'Emergency — Frogeyes', key: 'emergency.strategies.frogeyes.garagePerSf',   label: 'Garage $/SF',   desc: '', unit: '$/SF' },

  { group: 'Emergency — Frogeyes + Inverters', key: 'emergency.strategies.frogeyes_inv.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Frogeyes + Inverters', key: 'emergency.strategies.frogeyes_inv.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },

  { group: 'Emergency — Integrated + Frogeyes', key: 'emergency.strategies.integrated_frogeyes.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Integrated + Frogeyes', key: 'emergency.strategies.integrated_frogeyes.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },

  { group: 'Emergency — Integrated + Inverters', key: 'emergency.strategies.integrated_inverters.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Integrated + Inverters', key: 'emergency.strategies.integrated_inverters.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },

  { group: 'Emergency — Inverters', key: 'emergency.strategies.inverters.corridorPerSf', label: 'Corridor $/SF', desc: '', unit: '$/SF' },
  { group: 'Emergency — Inverters', key: 'emergency.strategies.inverters.amenityPerSf',  label: 'Amenity $/SF',  desc: '', unit: '$/SF' },
  { group: 'Emergency — Inverters', key: 'emergency.strategies.inverters.garagePerSf',   label: 'Garage $/SF',   desc: '', unit: '$/SF' },

  { group: 'Emergency — Battery Backup (Garage)', key: 'emergency.batteryGarage.sfPerFixture',   label: 'SF Per Fixture',     desc: '1 fixture per N SF', unit: 'SF' },
  { group: 'Emergency — Battery Backup (Garage)', key: 'emergency.batteryGarage.fixtureEvery',   label: 'Battery Every N Fixtures', desc: 'Every other = 2', unit: 'fixtures' },
  { group: 'Emergency — Battery Backup (Garage)', key: 'emergency.batteryGarage.costPerFixture', label: 'Cost Per Fixture',   desc: 'Per battery-integrated fixture', unit: '$/fixture' },

  // ── EXIT SIGNS ────────────────────────────────────────────────────────
  { group: 'Exit Signs', key: 'exitSigns.perSf', label: 'Rate', desc: '% of total gross SF (0.025 = 2.5%)', unit: 'decimal' },
  { group: 'Exit Signs', key: 'exitSigns.largeProjectThreshold', label: 'Large-Project Threshold', desc: 'Above this SF, halve the exit-sign cost', unit: 'SF' },

  // ── EMERGENCY LIGHTING ────────────────────────────────────────────────
  { group: 'Emergency Lighting', key: 'emergency.frogeyesPerSf', label: 'Frogeyes — Flat Rate', desc: '"Frogeyes everywhere" strategy: flat $/SF across corridors, amenities, and garage', unit: '$/SF' },

  // ── CONTROLS (by building type — $/SF; single universal $ cap) ─────────
  { group: 'Controls — Building Type Rates', key: 'controls.rates.singleFamily.perSf', label: 'Single Family (1–2 Lvl)', unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.townHouses.perSf',   label: 'Town Houses (2–3 Lvl)',   unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.stackedFlats.perSf', label: 'Stacked Flats (3 Lvl)',   unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.garden.perSf',       label: 'Garden (3 Lvl)',          unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.gurban.perSf',       label: 'Urban (4–5 Lvl)',         unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.wrap.perSf',         label: 'Wrap (3–5 Lvl)',          unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.podium.perSf',       label: 'Podium (3–8 Lvl)',        unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.midRise.perSf',      label: 'Mid Rise (9–12 Lvl)',     unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.rates.highRise.perSf',     label: 'High Rise (12+ Lvl)',     unit: '$/SF' },
  { group: 'Controls — Building Type Rates', key: 'controls.cap',                      label: 'Controls Cap (max $)',    desc: 'Controls never exceed this, regardless of SF', unit: '$' },
  { group: 'Controls — Building Type Rates', key: 'controls.energyCreditAdderPct',     label: 'Energy Credit Adder',     desc: '% of lighting subtotal (0.03 = 3%)', unit: 'decimal' },

  // ── DESIGN-LEVEL PRICING ──────────────────────────────────────────────
  { group: 'Ceiling Fans — Design Levels (gross)', key: 'designFanLevels.low',    label: 'Fan (Low)',    desc: 'Gross, before disk credit', unit: '$/fan' },
  { group: 'Ceiling Fans — Design Levels (gross)', key: 'designFanLevels.medium', label: 'Fan (Medium)', desc: 'Gross, before disk credit', unit: '$/fan' },
  { group: 'Ceiling Fans — Design Levels (gross)', key: 'designFanLevels.high',   label: 'Fan (High)',   desc: 'Gross, before disk credit', unit: '$/fan' },

  { group: 'Garage — Design Levels', key: 'designGarage.baseMediumPerSf', label: 'Base (Medium)', desc: 'eLuma garage fixture', unit: '$/SF' },
  { group: 'Garage — Design Levels', key: 'designGarage.baseHighPerSf',   label: 'Base (High)',   desc: 'Higher-end linear LED', unit: '$/SF' },

  { group: 'Corridors — Design', key: 'designCorridors.accentDownlightEach',    label: 'Recessed Accent Downlight', desc: '1-hr fire-rated, each', unit: '$/ea' },
  { group: 'Corridors — Design', key: 'designCorridors.stairwellElevatedAdder', label: 'Stairwell Elevated Adder',  desc: 'Per landing above code', unit: '$/landing' },

  { group: 'Unit Design Upgrades', key: 'designUpgrades.entryway12inch',  label: '12" Statement Entry Disk', desc: 'Per unit', unit: '$/unit' },
  { group: 'Unit Design Upgrades', key: 'designUpgrades.entryDecorative', label: 'Decorative Entry Mount',   desc: 'Per unit', unit: '$/unit' },
  { group: 'Unit Design Upgrades', key: 'designUpgrades.boilerRoomDisk',  label: 'Boiler Room Disk',         desc: 'Per unit', unit: '$/unit' },
  { group: 'Unit Design Upgrades', key: 'designUpgrades.fanSize52Adder',  label: '52" Fan Upcharge',         desc: 'Over 48" (0 = no upcharge)', unit: '$/fan' },

  // ── FREIGHT / WAREHOUSING ─────────────────────────────────────────────
  { group: 'Freight & Warehousing', key: 'freight',     label: 'Freight Rate',     desc: '% of product subtotal (0.06 = 6%)', unit: 'decimal' },
  { group: 'Freight & Warehousing', key: 'warehousing', label: 'Warehousing Rate', desc: '% of product subtotal (0.03 = 3%)', unit: 'decimal' },
];

/** Read a nested value from an object using dot-notation key */
function getNestedValue(obj, key) {
  return key.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

/** Set a nested value in a (deeply cloned) object using dot-notation key */
function setNestedValue(obj, key, value) {
  const keys = key.split('.');
  const clone = JSON.parse(JSON.stringify(obj));
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}

export default function PricingEditor({ initialPricing, initialPricingIntel }) {
  const [pricing, setPricing] = useState(initialPricing);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  // ── Pricing Intelligence config ──────────────────────────────────────────
  const [piThreshold, setPiThreshold] = useState(
    initialPricingIntel?.pricing_alert_threshold ?? '10'
  );
  const [piWindow, setPiWindow] = useState(
    initialPricingIntel?.pricing_alert_window_months ?? '12'
  );
  const [piSaving, setPiSaving] = useState(false);
  const [piSaved,  setPiSaved]  = useState(false);

  async function savePricingIntel() {
    setPiSaving(true); setPiSaved(false);
    try {
      await fetch('/api/system-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pricing_alert_threshold:      String(piThreshold),
          pricing_alert_window_months:  String(piWindow),
        }),
      });
      setPiSaved(true);
      setTimeout(() => setPiSaved(false), 2500);
    } finally {
      setPiSaving(false);
    }
  }

  function handleChange(key, rawValue) {
    const num = parseFloat(rawValue);
    const val = isNaN(num) ? rawValue : num;
    setPricing(prev => setNestedValue(prev, key, val));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
    } catch (e) {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Group fields by their group label
  const groups = [];
  const seen = {};
  for (const field of PRICING_FIELDS) {
    if (!seen[field.group]) {
      seen[field.group] = true;
      groups.push({ name: field.group, fields: [] });
    }
    groups[groups.length - 1].fields.push(field);
  }
  // Re-group properly
  const groupMap = {};
  for (const field of PRICING_FIELDS) {
    if (!groupMap[field.group]) groupMap[field.group] = [];
    groupMap[field.group].push(field);
  }
  const groupList = Object.entries(groupMap);

  return (
    <div>
      {/* Sticky save bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-slate-500">
          Changes take effect immediately for all new budget calculations.
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          {saved && !saving && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          <Button variant="amber" loading={saving} onClick={handleSave}>
            Save All Changes
          </Button>
        </div>
      </div>

      {/* Pricing table */}
      <div className="divide-y divide-slate-100">
        {groupList.map(([groupName, fields]) => (
          <div key={groupName} className="px-6 py-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
              {groupName}
            </h3>
            <div className="space-y-0 border border-slate-200 rounded-lg overflow-hidden">
              {fields.map((field, i) => {
                const currentVal = getNestedValue(pricing, field.key);
                return (
                  <div
                    key={field.key}
                    className={`flex items-center px-4 py-2.5 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                  >
                    {/* Label + description */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{field.label}</div>
                      {field.desc && <div className="text-xs text-slate-400 mt-0.5">{field.desc}</div>}
                    </div>
                    {/* Unit badge */}
                    <div className="text-xs text-slate-400 font-mono mx-4 w-20 text-right shrink-0">
                      {field.unit}
                    </div>
                    {/* Input */}
                    <div className="w-32 shrink-0">
                      <input
                        type="number"
                        step="any"
                        value={currentVal ?? ''}
                        onChange={e => handleChange(field.key, e.target.value)}
                        className="w-full text-right text-sm font-mono border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 text-xs text-slate-400 border-t border-slate-100">
        Decimal rates: enter as decimal (e.g. 0.06 = 6%, 0.38 = $0.38/SF). Dollar amounts: enter as whole number (e.g. 125 = $125).
      </div>

      {/* ── Pricing Intelligence config ──────────────────────────────────── */}
      <div className="border-t border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Pricing Intelligence</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Controls when price increase alerts appear on budget line items.
              Alerts fire when a product's price has increased more than this % vs. any prior budget sent in the last N months.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Price increase alert threshold</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max="100" step="1"
                value={piThreshold}
                onChange={e => { setPiThreshold(e.target.value); setPiSaved(false); }}
                className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Price history lookback window</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max="60" step="1"
                value={piWindow}
                onChange={e => { setPiWindow(e.target.value); setPiSaved(false); }}
                className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-sm text-slate-500">months</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={savePricingIntel}
            disabled={piSaving}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {piSaving ? 'Saving…' : 'Save'}
          </button>
          {piSaved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          When dept roles have behavioral meaning, this section will also require the Pre-construction dept role.
        </p>
      </div>

    </div>
  );
}
