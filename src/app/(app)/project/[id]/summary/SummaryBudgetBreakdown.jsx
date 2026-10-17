'use client';
// formatCurrency must come from format.js (NOT calculations.js), this
// component is reused on the public /conceptual_budget review step, and
// importing calculations.js would bundle the PRICING model into the
// public visitor's browser.
import { formatCurrency } from '@/lib/format';
import { TooltipBudgetRow } from '@/components/ui/Tooltip';
// Words only, '@/lib/siteFeatures' carries the price defaults and must not
// reach the public page either.
import { siteFeatureLineLabel } from '@/lib/siteFeatureWords';

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-50 print:border-slate-100">
      <span className="text-sm print:text-xs text-slate-500">{label}</span>
      <span className={`text-sm print:text-xs font-mono font-semibold tabular-nums ${value === 0 ? 'text-slate-300' : 'text-slate-900'}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

// " (approx. 47 area lights)" on the public budget; staff budgets carry no
// `approx` field and print nothing extra here (their counts live on the sidebar).
const approxSuffix = (line) => line?.approx ? ` (${line.approx})` : '';

export default function SummaryBudgetBreakdown({ budget, freightPct, warehousingPct }) {
  // The public budget page passes no percentages, the visitor sees the freight
  // and warehousing dollars, never the rate behind them (Mike, 2026-09-17).
  const freightLabel     = freightPct     == null ? 'Freight'     : `Freight (${freightPct}%)`;
  const warehousingLabel = warehousingPct == null ? 'Warehousing' : `Warehousing (${warehousingPct}%)`;
  const { sections, freight, warehousing, lightingProductSubtotal, subtotalLightingOnly, controls, controlsGarage, controlsFreight, controlsWarehousing, controlsTotal, totalWithControls, contingencyRate, contingencyAmount, totalWithContingency, energyCreditPct, energyCreditLightingPct, energyCreditControlsPct, energyCreditLighting, energyCreditControls, salesTaxPct, lightingTaxAmount, controlsTaxAmount } = budget;
  // Each side carries its own % (WELL = 10% lighting / 30% controls, 10-15).
  const ecPctLabel  = Math.round((energyCreditLightingPct ?? energyCreditPct ?? 0) * 100);
  const ecCtrlLabel = Math.round((energyCreditControlsPct ?? energyCreditPct ?? 0) * 100);
  const contingencyPct = contingencyRate ? Math.round(contingencyRate * 100) : 0;
  const taxLabel = `Sales Tax (${Math.round((salesTaxPct || 0) * 10000) / 100}%)`;

  const lineItems = [
    {
      label: 'Residential Units',
      value: sections?.units?.total?.product || 0,
      details: [
        { label: 'Base design',      value: sections?.units?.base?.product        || 0 },
        { label: 'Undercabinet',     value: sections?.units?.undercabinet?.product || 0 },
        { label: 'Kitchen pendants', value: sections?.units?.pendants?.product     || 0 },
        { label: 'Ceiling fans',     value: sections?.units?.fans?.product         || 0 },
        { label: 'Vanity lighting',  value: sections?.units?.vanity?.product       || 0 },
        { label: 'Balcony fixtures', value: sections?.units?.balcony?.product      || 0 },
        ...(sections?.units?.manualAdder > 0
          ? [{ label: 'Manual adder', value: sections?.units?.manualAdder }]
          : []),
      ],
    },
    {
      label: 'Corridors & Stairwells',
      value: sections?.corridors?.total?.product || 0,
      details: [
        { label: 'Corridor disks',     value: sections?.corridors?.disks?.product      || 0 },
        { label: 'Unit entry sconces', value: sections?.corridors?.sconces?.product    || 0 },
        { label: sections?.corridors?.stairwells?.breezeway
                   ? `Breezeway stairs (${sections.corridors.stairwells.breezeway.landings} landings, ${sections.corridors.stairwells.breezeway.style === 'long' ? 'long' : 'small'} breezeway)`
                   : 'Stairwell fixtures',
          value: sections?.corridors?.stairwells?.product || 0 },
        { label: 'Accent downlights',  value: sections?.corridors?.accents?.product    || 0 },
        ...(sections?.corridors?.manualAdder > 0
          ? [{ label: 'Manual adder', value: sections?.corridors?.manualAdder }]
          : []),
      ],
    },
    {
      label: 'BOH / Core + Shell',
      value: sections?.boh?.product || 0,
      details: [
        ...(sections?.boh?.manualAdder > 0
          ? [{ label: 'Manual adder', value: sections?.boh?.manualAdder }]
          : []),
      ],
    },
    {
      label: 'Interior Amenities',
      value: sections?.interior?.product || 0,
      details: [
        ...(sections?.interior?.manualAdder > 0
          ? [{ label: 'Manual adder', value: sections?.interior?.manualAdder }]
          : []),
      ],
    },
    {
      label: 'Enclosed Garage',
      value: sections?.garage?.product || 0,
      details: [
        ...(sections?.garage?.manualAdder > 0
          ? [{ label: 'Manual adder', value: sections?.garage?.manualAdder }]
          : []),
      ],
    },
    {
      label: 'Exterior & Site',
      value: sections?.exterior?.total?.product || 0,
      details: [
        { label: 'Exterior amenities', value: sections?.exterior?.amenities?.product || 0 },
        { label: (sections?.exterior?.solar
            ? `Surface parking (solar × ${sections.exterior.solar.multiplier})`
            : 'Surface parking') + approxSuffix(sections?.exterior?.parking),
          value: sections?.exterior?.parking?.product || 0 },
        { label: 'Carports',           value: sections?.exterior?.carports?.product  || 0 },
        { label: 'Garages',            value: sections?.exterior?.garages?.product   || 0 },
        { label: 'Building wallpacks' + approxSuffix(sections?.exterior?.wallpacks), value: sections?.exterior?.wallpacks?.product || 0 },
        { label: sections?.exterior?.pathway?.suppressedByManual
            ? 'Pathway (manual entry)'
            : (sections?.exterior?.pathway?.solarMultiplier || 1) > 1
              ? `Pathway lighting (solar × ${sections.exterior.pathway.solarMultiplier})`
              : 'Pathway lighting',
          value: sections?.exterior?.pathway?.product || 0 },
        { label: 'Landscape / adder',  value: sections?.exterior?.landscape?.product || 0 },
        // One detail per found feature so the dollars are traceable.
        ...(sections?.exterior?.siteFeatures?.items?.length
          ? sections.exterior.siteFeatures.items.map(i => ({ label: siteFeatureLineLabel(i) + approxSuffix(i), value: i.product || 0 }))
          : [{ label: 'Site features', value: 0 }]),
        { label: '5% misc buffer',     value: sections?.exterior?.misc?.product      || 0 },
      ],
    },
    {
      label: 'Emergency Lighting',
      value: sections?.emergency?.product || 0,
      details: [
        ...(sections?.emergency?.manualAdder > 0
          ? [{ label: 'Manual adder', value: sections?.emergency?.manualAdder }]
          : []),
      ],
    },
    {
      label: 'Exit Signs',
      value: sections?.exitSigns?.product || 0,
      details: [
        ...(sections?.exitSigns?.manualAdder > 0
          ? [{ label: 'Manual adder', value: sections?.exitSigns?.manualAdder }]
          : []),
      ],
    },
  ];

  return (
    <div>
      {/* Screen: interactive with tooltips. Print: plain rows via CSS. */}
      <div className="print:hidden space-y-0">
        {lineItems.map(item => (
          <TooltipBudgetRow
            key={item.label}
            label={item.label}
            value={item.value}
            details={item.details}
            className="border-b border-slate-50"
          />
        ))}
      </div>

      {/* Print-only: simple rows no hover */}
      <div className="hidden print:block">
        {lineItems.map(item => (
          <Row key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      {/* Solar site design, labor note rides with the budget wherever it's shown */}
      {sections?.exterior?.solar && (
        <div className="mt-2 mb-1 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 print:bg-transparent print:border-amber-300">
          <span className="font-semibold">Solar site lighting</span>: area lighting priced at {sections.exterior.solar.multiplier}× conventional. {sections.exterior.solar.note}
        </div>
      )}

      {/* Energy credit adder, inside the lighting subtotal, shown as its own line */}
      {energyCreditLighting > 0 && (
        <>
          <div className="print:hidden">
            <TooltipBudgetRow label={`Energy Credit (${ecPctLabel}%)`} value={energyCreditLighting} details={[]} />
          </div>
          <div className="hidden print:block">
            <Row label={`Energy Credit (${ecPctLabel}%)`} value={energyCreditLighting} />
          </div>
        </>
      )}

      {/* Lighting subtotal */}
      <div className="border-t-2 border-slate-900 pt-3 mt-2 pb-1">
        <div className="flex justify-between font-bold text-base print:text-sm">
          <span>Lighting Subtotal</span>
          <span className="font-mono tabular-nums">{formatCurrency(lightingProductSubtotal)}</span>
        </div>
      </div>

      {/* Lighting freight + warehousing */}
      <div className="print:hidden space-y-0">
        <TooltipBudgetRow label={freightLabel}         value={freight     || 0} details={[]} />
        <TooltipBudgetRow label={warehousingLabel} value={warehousing || 0} details={[]} />
      </div>
      <div className="hidden print:block">
        <Row label={freightLabel}         value={freight     || 0} />
        <Row label={warehousingLabel} value={warehousing || 0} />
      </div>
      {/* Sales tax on lighting product, only when a rate is on file */}
      {lightingTaxAmount > 0 && (
        <>
          <div className="print:hidden">
            <TooltipBudgetRow label={taxLabel} value={lightingTaxAmount} details={[{ label: 'On lighting product subtotal', value: lightingTaxAmount }]} />
          </div>
          <div className="hidden print:block">
            <Row label={taxLabel} value={lightingTaxAmount} />
          </div>
        </>
      )}

      {/* Lighting total */}
      <div className="border-t-2 border-slate-900 pt-2 mt-1 mb-3">
        <div className="flex justify-between font-bold text-base print:text-sm py-1">
          <span>Lighting Total</span>
          <span className="font-mono tabular-nums">{formatCurrency(subtotalLightingOnly)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="print:hidden">
        <TooltipBudgetRow label="Controls (IECC)" value={controls || 0} details={controlsGarage > 0
          ? [{ label: 'Building controls', value: (controls || 0) - controlsGarage }, { label: 'Garage controls', value: controlsGarage }]
          : [{ label: 'Controls product', value: controls || 0 }]} />
      </div>
      <div className="hidden print:block">
        <Row label="Controls (IECC)" value={controls || 0} />
      </div>

      {/* Energy credit adder on the controls side */}
      {energyCreditControls > 0 && (
        <>
          <div className="print:hidden">
            <TooltipBudgetRow label={`Energy Credit (${ecCtrlLabel}%)`} value={energyCreditControls} details={[]} />
          </div>
          <div className="hidden print:block">
            <Row label={`Energy Credit (${ecCtrlLabel}%)`} value={energyCreditControls} />
          </div>
        </>
      )}

      {/* Controls freight + warehousing */}
      <div className="print:hidden space-y-0">
        <TooltipBudgetRow label={freightLabel}         value={controlsFreight     || 0} details={[]} />
        <TooltipBudgetRow label={warehousingLabel} value={controlsWarehousing || 0} details={[]} />
      </div>
      <div className="hidden print:block">
        <Row label={freightLabel}         value={controlsFreight     || 0} />
        <Row label={warehousingLabel} value={controlsWarehousing || 0} />
      </div>
      {controlsTaxAmount > 0 && (
        <>
          <div className="print:hidden">
            <TooltipBudgetRow label={taxLabel} value={controlsTaxAmount} details={[{ label: 'On controls subtotal', value: controlsTaxAmount }]} />
          </div>
          <div className="hidden print:block">
            <Row label={taxLabel} value={controlsTaxAmount} />
          </div>
        </>
      )}

      {/* Controls total: product + energy credit + freight + warehousing + tax */}
      <div className="border-t-2 border-slate-900 pt-2 mt-1 mb-3">
        <div className="flex justify-between font-bold text-base print:text-sm py-1">
          <span>Controls Total</span>
          <span className="font-mono tabular-nums">{formatCurrency(controlsTotal || 0)}</span>
        </div>
      </div>

      {/* Grand total */}
      <div className="border-t-2 border-slate-900 pt-3 mt-2">
        <div className="flex justify-between font-bold text-base print:text-sm">
          <span>Total w/ Controls</span>
          <span className="font-mono tabular-nums">{formatCurrency(totalWithControls)}</span>
        </div>
      </div>

      {/* Contingency (only shown when selected, none/empty produces no rows) */}
      {contingencyAmount > 0 && (
        <>
          <div className="mt-3 print:hidden">
            <TooltipBudgetRow
              label={`Contingency (${contingencyPct}%)`}
              value={contingencyAmount}
              details={[{ label: `${contingencyPct}% of lighting subtotal`, value: contingencyAmount }]}
            />
          </div>
          <div className="hidden print:block mt-3">
            <Row label={`Contingency (${contingencyPct}%)`} value={contingencyAmount} />
          </div>
          <div className="border-t-2 border-slate-900 pt-3 mt-2">
            <div className="flex justify-between font-bold text-base print:text-sm">
              <span>Total w/ Contingency</span>
              <span className="font-mono tabular-nums">{formatCurrency(totalWithContingency)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
