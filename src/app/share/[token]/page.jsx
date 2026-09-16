import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { responsesToSections } from '@/lib/utils';
import { calculateBudget, formatCurrency } from '@/lib/calculations';
import { OPTION_LABELS } from '@/lib/pricing';
import { normalizeAmenityLevel } from '@/lib/amenityLevel';
import { loadPricing, pricingForProject } from '@/lib/pricingLoader';
import ShareViewTracker from './ShareViewTracker';
import SummaryBudgetBreakdown from '@/app/(app)/project/[id]/summary/SummaryBudgetBreakdown';

export default async function SharePage({ params }) {
  const share = await prisma.projectShare.findUnique({
    where: { token: params.token },
    include: {
      project: {
        include: { projectData: true, responses: true },
      },
    },
  });

  if (!share) notFound();

  const project    = share.project;
  const pricing    = pricingForProject(project.pricingSnapshot, await loadPricing());
  const sections   = responsesToSections(project.responses);
  const projectData = { ...(project.projectData || {}), buildingTypeKey: project.buildingType };
  const budget     = calculateBudget(projectData, sections, pricing);
  const pd         = projectData;

  const freightPct     = Math.round((budget.freightRate     ?? 0.06) * 100);
  const warehousingPct = Math.round((budget.warehousingRate ?? 0.03) * 100);
  const today          = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  function getLabel(cat, key) { return OPTION_LABELS[cat]?.[key] || key || '—'; }

  const projectDataRows = [
    { label: 'Total Gross SF',         value: pd.grossSf             ? pd.grossSf.toLocaleString()           : null },
    { label: 'Units Gross SF',         value: pd.unitsSf             ? pd.unitsSf.toLocaleString()           : null },
    { label: '# of Units',             value: pd.numUnits            ? pd.numUnits.toLocaleString()          : null },
    { label: '# of Bathrooms',         value: pd.numBathrooms        ? pd.numBathrooms.toLocaleString()      : null },
    { label: '# of Balconies',         value: pd.numBalconies        ? pd.numBalconies.toLocaleString()      : null },
    { label: 'Corridor SF',            value: pd.corridorSf          ? pd.corridorSf.toLocaleString()        : null },
    { label: 'Interior Amenity SF',    value: pd.interiorAmenitySf   ? pd.interiorAmenitySf.toLocaleString() : null },
    { label: 'Exterior Amenity SF',    value: pd.exteriorAmenitySf   ? pd.exteriorAmenitySf.toLocaleString() : null },
    { label: 'Garage SF',              value: pd.garageSf            ? pd.garageSf.toLocaleString()          : null },
    { label: 'Surface Parking Stalls', value: pd.numSurfaceParking   ? pd.numSurfaceParking.toString()       : null },
  ].filter(r => r.value);

  const answerRows = [
    { section: 'Residential Units', rows: [
      { q: 'Undercabinet',      a: getLabel('undercabinet',      sections.units?.undercabinet    || 'none') },
      { q: 'Kitchen Pendants',  a: getLabel('kitchenPendants',   sections.units?.kitchenPendants || 'none') },
      { q: 'Ceiling Fans',      a: getLabel('fans',              sections.units?.fans            || 'none') },
      { q: 'Vanity Lighting',   a: getLabel('vanity',            sections.units?.vanity          || 'bathBarLow') },
      { q: 'Balcony Fixture',   a: getLabel('balcony',           sections.units?.balcony         || 'none') },
    ]},
    { section: 'Corridors', rows: [
      { q: 'Unit Entry Sconce', a: getLabel('corridorSconce',    sections.corridors?.unitSconce  || 'none') },
    ]},
    { section: 'Amenities', rows: [
      { q: 'Interior Level',    a: getLabel('interiorAmenities', sections.amenities?.interiorLevel || 'medium') },
      { q: 'Exterior Level',    a: getLabel('exteriorAmenities', normalizeAmenityLevel(sections.exterior?.amenityLevel)) },
      { q: 'Amenity Hours',     a: getLabel('amenityHours',      sections.exterior?.amenityHours   || 'beforeDusk') },
    ]},
    { section: 'Emergency & Controls', rows: [
      { q: 'Emergency Strategy', a: getLabel('emergency',    sections.emergency?.strategy       || 'frogeyes') },
      { q: 'Building Type',      a: getLabel('buildingType', pd.buildingTypeKey                 || 'midRise') },
      { q: 'Energy Credit',      a: getLabel('energyCredit', sections.controls?.energyCredit    || 'no') },
    ]},
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Branded top bar */}
      <div className="bg-navy-950 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor">
              <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
            </svg>
          </div>
          <span className="text-white font-semibold text-sm">ILC Studios</span>
        </div>
        <span className="text-navy-400 text-xs">{today}</span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Track view client-side */}
        <ShareViewTracker token={params.token} />

        {/* Hero */}
        <div
          className="rounded-2xl p-6 mb-6 text-white"
          style={{ backgroundColor: '#0f172a' }}
        >
          <div className="text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>
            ILC Studios — Conceptual Lighting &amp; Controls Budget
          </div>
          <div className="text-3xl font-bold tabular-nums mb-1">{formatCurrency(budget.totalWithControls)}</div>
          <div className="text-lg font-semibold mb-3" style={{ color: '#e2e8f0' }}>{project.name}</div>
          {project.location && <div className="text-sm mb-3" style={{ color: '#94a3b8' }}>{project.location}</div>}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div><span style={{ color: '#94a3b8' }}>Lighting Only: </span><span className="font-semibold">{formatCurrency(budget.subtotalLightingOnly)}</span></div>
            <div><span style={{ color: '#94a3b8' }}>Controls: </span><span className="font-semibold">{formatCurrency(budget.controlsTotal)}</span></div>
            {budget.perSf   > 0 && <div><span style={{ color: '#94a3b8' }}>$/SF: </span><span className="font-semibold">${budget.perSf.toFixed(2)}</span></div>}
            {budget.perUnit > 0 && <div><span style={{ color: '#94a3b8' }}>$/Unit: </span><span className="font-semibold">{formatCurrency(budget.perUnit)}</span></div>}
          </div>
          <p className="text-xs mt-3" style={{ color: '#475569' }}>
            Conceptual estimate only. {budget.salesTaxPct > 0
              ? `Includes ${Math.round(budget.salesTaxPct * 10000) / 100}% sales tax on product.`
              : 'Does not include sales tax.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Project Data */}
          {projectDataRows.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-3">Project Data</h3>
              <div className="space-y-1.5">
                {projectDataRows.map(r => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <span className="text-slate-500">{r.label}</span>
                    <span className="font-semibold text-slate-900 tabular-nums">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budget Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Budget Breakdown</h3>
            <SummaryBudgetBreakdown budget={budget} freightPct={freightPct} warehousingPct={warehousingPct} />
          </div>
        </div>

        {/* Design Selections */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mt-6">
          <h3 className="font-semibold text-slate-900 mb-4">Design Selections</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {answerRows.map(group => (
              <div key={group.section}>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 pb-1 border-b border-slate-100">{group.section}</div>
                {group.rows.map(row => (
                  <div key={row.q} className="flex py-1 text-sm border-b border-slate-50">
                    <span className="text-slate-500 w-40 shrink-0">{row.q}</span>
                    <span className="text-slate-800 font-medium">{row.a}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400 mb-3">
            This is a conceptual budget prepared by ILC Studios for planning purposes only. Actual costs will vary.
          </p>
          <p className="text-sm text-slate-500">
            Questions? Contact{' '}
            <a href="mailto:precon@ilcstudios.com" className="text-amber-600 hover:underline">precon@ilcstudios.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
