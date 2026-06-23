'use client';
import { formatCurrency } from '@/lib/calculations';
import { TooltipBudgetRow } from '@/components/ui/Tooltip';

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-50 print:border-slate-100">
      <span className="text-sm print:text-xs text-slate-500">{label}</span>
      <span className={`text-sm print:text-xs font-mono font-semibold ${value === 0 ? 'text-slate-300' : 'text-slate-900'}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

export default function SummaryBudgetBreakdown({ budget, freightPct, warehousingPct }) {
  const { sections, freight, warehousing, lightingProductSubtotal, subtotalLightingOnly, controls, controlsFreight, controlsWarehousing, totalWithControls } = budget;

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
        { label: 'Stairwell fixtures', value: sections?.corridors?.stairwells?.product || 0 },
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
        { label: 'Surface parking',    value: sections?.exterior?.parking?.product   || 0 },
        { label: 'Carports',           value: sections?.exterior?.carports?.product  || 0 },
        { label: 'Garages',            value: sections?.exterior?.garages?.product   || 0 },
        { label: 'Exterior doors',     value: sections?.exterior?.doors?.product     || 0 },
        { label: 'Landscape / adder',  value: sections?.exterior?.landscape?.product || 0 },
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

      {/* Lighting subtotal */}
      <div className="border-t-2 border-slate-900 pt-3 mt-2 pb-1">
        <div className="flex justify-between font-bold text-base print:text-sm">
          <span>Lighting Subtotal</span>
          <span className="font-mono">{formatCurrency(lightingProductSubtotal)}</span>
        </div>
      </div>

      {/* Lighting freight + warehousing */}
      <div className="print:hidden space-y-0">
        <TooltipBudgetRow label={`Freight (${freightPct}%)`}         value={freight     || 0} details={[]} />
        <TooltipBudgetRow label={`Warehousing (${warehousingPct}%)`} value={warehousing || 0} details={[]} />
      </div>
      <div className="hidden print:block">
        <Row label={`Freight (${freightPct}%)`}         value={freight     || 0} />
        <Row label={`Warehousing (${warehousingPct}%)`} value={warehousing || 0} />
      </div>

      {/* Lighting total */}
      <div className="border-t-2 border-slate-900 pt-2 mt-1 mb-3">
        <div className="flex justify-between font-bold text-base print:text-sm py-1">
          <span>Lighting Total</span>
          <span className="font-mono">{formatCurrency(subtotalLightingOnly)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="print:hidden">
        <TooltipBudgetRow label="Controls (IECC 2021)" value={controls || 0} details={[{ label: 'Controls product', value: controls || 0 }]} />
      </div>
      <div className="hidden print:block">
        <Row label="Controls (IECC 2021)" value={controls || 0} />
      </div>

      {/* Controls freight + warehousing */}
      <div className="print:hidden space-y-0">
        <TooltipBudgetRow label={`Freight (${freightPct}%)`}         value={controlsFreight     || 0} details={[]} />
        <TooltipBudgetRow label={`Warehousing (${warehousingPct}%)`} value={controlsWarehousing || 0} details={[]} />
      </div>
      <div className="hidden print:block">
        <Row label={`Freight (${freightPct}%)`}         value={controlsFreight     || 0} />
        <Row label={`Warehousing (${warehousingPct}%)`} value={controlsWarehousing || 0} />
      </div>

      {/* Grand total */}
      <div className="border-t-2 border-slate-900 pt-3 mt-2">
        <div className="flex justify-between font-bold text-base print:text-sm">
          <span>Total w/ Controls</span>
          <span className="font-mono">{formatCurrency(totalWithControls)}</span>
        </div>
      </div>
    </div>
  );
}
