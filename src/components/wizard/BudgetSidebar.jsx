'use client';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TooltipBudgetRow } from '@/components/ui/Tooltip';
import { siteFeatureLineLabel } from '@/lib/siteFeatureWords';

function Divider() {
  return <div className="border-t border-slate-100 my-2" />;
}

function PlainRow({ label, value, indent, highlight, bold }) {
  return (
    <div className={cn('flex items-center justify-between py-1', indent && 'pl-3')}>
      <span className={cn(
        'text-xs',
        bold      ? 'font-bold text-slate-900'
        : highlight ? 'font-semibold text-slate-700'
        : indent    ? 'text-slate-400'
        : 'text-slate-500',
      )}>
        {label}
      </span>
      <span className={cn(
        'text-xs font-mono',
        bold      ? 'font-bold text-slate-900'
        : highlight ? 'font-semibold text-slate-800'
        : 'text-slate-500',
        value === 0 && 'text-slate-300',
      )}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

// `range` ({ low, high }) is passed only by the public no-drawings form, whose
// server estimate carries a ±10% band; the internal wizard never passes it.
// `areaNotes` ({ [area]: node }) and `areaSummary` are the staff-only area
// alerts, passed only by the internal wizards — never by the public form.
export default function BudgetSidebar({ budget, projectData, currentStep, range = null, areaNotes = null, areaSummary = null }) {
  if (!budget) return null;

  const { sections, freight, warehousing, freightRate, warehousingRate, lightingProductSubtotal, subtotalLightingOnly, controls, controlsFreight, controlsWarehousing, totalWithControls, perSf, perUnit, energyCreditPct, energyCreditLighting, energyCreditControls } = budget;
  const ecPctLabel = Math.round((energyCreditPct || 0) * 100);
  const hasData = (projectData?.grossSf || 0) > 0;
  const fPct = Math.round((freightRate ?? 0.06) * 100);
  const wPct = Math.round((warehousingRate ?? 0.03) * 100);

  return (
    <aside className="w-64 bg-white border-l border-slate-100 flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-4 bg-navy-950 border-b border-navy-800">
        <div className="text-xs font-semibold text-navy-400 uppercase tracking-widest mb-1">Live Budget</div>
        <div className="text-2xl font-bold text-white tabular-nums">
          {hasData ? formatCurrency(totalWithControls) : '—'}
        </div>
        {hasData && (
          <div className="flex gap-3 mt-1.5">
            {perSf   > 0 && <span className="text-xs text-navy-400">${perSf.toFixed(2)}/SF</span>}
            {perUnit > 0 && <span className="text-xs text-navy-400">{formatCurrency(perUnit)}/unit</span>}
          </div>
        )}
        {hasData && range && (
          <div className="mt-2 text-xs text-navy-300 tabular-nums leading-snug">
            Likely between {formatCurrency(range.low)} and {formatCurrency(range.high)}
          </div>
        )}
      </div>

      {/* Breakdown */}
      <div className="flex-1 px-4 py-3 overflow-y-auto">
        {!hasData && (
          <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
            Enter project data in Step 1 to see your live budget estimate.
          </p>
        )}

        {hasData && (
          <>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Breakdown</div>
            {areaSummary}

            {/* Units — with full tooltip */}
            <TooltipBudgetRow
              label="Residential Units"
              value={sections.units?.total?.product || 0}
              highlight={currentStep === 'units'}
              details={[
                { label: 'Base design',      value: sections.units?.base?.product        || 0 },
                { label: 'Undercabinet',     value: sections.units?.undercabinet?.product || 0 },
                { label: 'Kitchen pendants', value: sections.units?.pendants?.product     || 0 },
                { label: 'Ceiling fans',     value: sections.units?.fans?.product         || 0 },
                { label: 'Vanity lighting',  value: sections.units?.vanity?.product       || 0 },
                { label: 'Balcony fixtures', value: sections.units?.balcony?.product      || 0 },
              ]}
            />
            {areaNotes?.units}

            <Divider />

            <TooltipBudgetRow
              label="Corridors & Stairwells"
              value={sections.corridors?.total?.product || 0}
              highlight={currentStep === 'corridors'}
              details={[
                { label: 'Corridor disks',       value: sections.corridors?.disks?.product      || 0 },
                { label: 'Unit entry sconces',   value: sections.corridors?.sconces?.product    || 0 },
                { label: sections.corridors?.stairwells?.breezeway
                           ? `Breezeway stairs (${sections.corridors.stairwells.breezeway.landings} landings)`
                           : 'Stairwell fixtures',
                  value: sections.corridors?.stairwells?.product || 0 },
                { label: 'Accent downlights',    value: sections.corridors?.accents?.product    || 0 },
              ]}
            />
            {areaNotes?.corridors}
            <TooltipBudgetRow label="BOH / Core + Shell"   value={sections.boh?.product            || 0} details={[]} />
            {areaNotes?.boh}
            <TooltipBudgetRow
              label="Interior Amenities"
              value={sections.interior?.product || 0}
              highlight={currentStep === 'amenities'}
              details={[{ label: 'Interior amenity SF', value: sections.interior?.product || 0 }]}
            />
            {areaNotes?.interior}
            <TooltipBudgetRow label="Garage"               value={sections.garage?.product          || 0} details={[]} />
            {areaNotes?.garage}
            <TooltipBudgetRow
              label="Exterior & Site"
              value={sections.exterior?.total?.product || 0}
              highlight={currentStep === 'exterior'}
              details={[
                { label: 'Exterior amenities', value: sections.exterior?.amenities?.product || 0 },
                { label: sections.exterior?.solar
                    ? `Surface parking (solar × ${sections.exterior.solar.multiplier})`
                    : 'Surface parking',
                  value: sections.exterior?.parking?.product || 0 },
                { label: 'Carports',           value: sections.exterior?.carports?.product  || 0 },
                { label: 'Garages',            value: sections.exterior?.garages?.product   || 0 },
                { label: 'Building wallpacks', value: sections.exterior?.wallpacks?.product || 0 },
                { label: sections.exterior?.pathway?.suppressedByManual
                    ? 'Pathway (manual entry)'
                    : (sections.exterior?.pathway?.solarMultiplier || 1) > 1
                      ? `Pathway lighting (solar × ${sections.exterior.pathway.solarMultiplier})`
                      : 'Pathway lighting',
                  value: sections.exterior?.pathway?.product || 0 },
                { label: 'Landscape',          value: sections.exterior?.landscape?.product || 0 },
                // One detail per found feature (dog park, courtyard, …) so the
                // dollars are traceable; a single $0 line when there are none.
                ...(sections.exterior?.siteFeatures?.items?.length
                  ? sections.exterior.siteFeatures.items.map(i => ({ label: siteFeatureLineLabel(i), value: i.product || 0 }))
                  : [{ label: 'Site features', value: 0 }]),
                { label: '5% misc buffer',     value: sections.exterior?.misc?.product      || 0 },
              ]}
            />
            {areaNotes?.exterior}
            <TooltipBudgetRow
              label="Emergency Lighting"
              value={sections.emergency?.product || 0}
              highlight={currentStep === 'emergency'}
              details={[{ label: 'Emergency egress', value: sections.emergency?.product || 0 }]}
            />
            {areaNotes?.emergency}
            <TooltipBudgetRow label="Exit Signs" value={sections.exitSigns?.product || 0} details={[]} />
            {areaNotes?.exitSigns}

            <Divider />

            {energyCreditLighting > 0 && (
              <PlainRow label={`Energy Credit (${ecPctLabel}%)`} value={energyCreditLighting} indent />
            )}
            <PlainRow label="Lighting Subtotal"   value={lightingProductSubtotal || 0} highlight />
            <PlainRow label={`Freight (${fPct}%)`}     value={freight     || 0} indent />
            <PlainRow label={`Whsg. (${wPct}%)`}       value={warehousing || 0} indent />
            <PlainRow label="Lighting Total"      value={subtotalLightingOnly    || 0} highlight />

            <Divider />

            <TooltipBudgetRow
              label="Controls (IECC)"
              value={controls || 0}
              highlight={currentStep === 'controls'}
              details={[{ label: 'Controls product', value: controls || 0 }]}
            />
            {areaNotes?.controls}
            {energyCreditControls > 0 && (
              <PlainRow label={`Energy Credit (${ecPctLabel}%)`} value={energyCreditControls} indent />
            )}
            <PlainRow label={`Freight (${fPct}%)`}     value={controlsFreight     || 0} indent />
            <PlainRow label={`Whsg. (${wPct}%)`}       value={controlsWarehousing || 0} indent />

            <Divider />

            <PlainRow label="TOTAL W/ CONTROLS" value={totalWithControls || 0} bold />

            <p className="text-xs text-slate-300 mt-4 leading-relaxed">
              Hover any line for breakdown. Conceptual estimate only.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
