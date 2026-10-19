/**
 * The budget breakdown lines, one per category with its detail lines, from a
 * budget's `sections`. Words and dollars only, so the public page can use
 * it: no prices per fixture, no rules. Every line has a stable `key` so two
 * budgets can be lined up side by side (the portal compare, Mike 10-17).
 *
 * @see src/app/(app)/project/[id]/summary/SummaryBudgetBreakdown.jsx
 * @see src/lib/intake/compareBudgets.js
 */
// Words only, '@/lib/siteFeatures' carries the price defaults and must not
// reach the public page.
import { siteFeatureLineLabel } from './siteFeatureWords.js';

// " (approx. 47 area lights)" on the public budget; staff budgets carry no
// `approx` field and print nothing extra here (their counts live on the sidebar).
const approxSuffix = (line) => line?.approx ? ` (${line.approx})` : '';

// A court and a pool line up with the court and pool of another budget: the key
// is the feature type, then a count when a budget has two of the same type.
function siteFeatureLines(items) {
  const seen = {};
  return items.map(i => {
    const t = i.type || i.label || 'feature';
    seen[t] = (seen[t] || 0) + 1;
    return { ...i, key: `site:${t}${seen[t] > 1 ? `:${seen[t]}` : ''}` };
  });
}

/** [{ key, label, value, details: [{ key, label, value }] }] */
export function budgetLineItems(sections) {
  return [
    {
      key: 'units',
      label: 'Residential Units',
      value: sections?.units?.total?.product || 0,
      details: [
        { key: 'base', label: 'Base design',      value: sections?.units?.base?.product        || 0 },
        { key: 'undercabinet', label: 'Undercabinet',     value: sections?.units?.undercabinet?.product || 0 },
        { key: 'pendants', label: 'Kitchen pendants', value: sections?.units?.pendants?.product     || 0 },
        { key: 'fans', label: 'Ceiling fans',     value: sections?.units?.fans?.product         || 0 },
        { key: 'vanity', label: 'Vanity lighting',  value: sections?.units?.vanity?.product       || 0 },
        { key: 'balcony', label: 'Balcony fixtures', value: sections?.units?.balcony?.product      || 0 },
        ...(sections?.units?.manualAdder > 0
          ? [{ key: 'manualAdder', label: 'Manual adder', value: sections?.units?.manualAdder }]
          : []),
      ],
    },
    {
      key: 'corridors',
      label: 'Corridors & Stairwells',
      value: sections?.corridors?.total?.product || 0,
      details: [
        { key: 'disks', label: 'Corridor disks',     value: sections?.corridors?.disks?.product      || 0 },
        { key: 'sconces', label: 'Unit entry sconces', value: sections?.corridors?.sconces?.product    || 0 },
        { key: 'stairwells', label: sections?.corridors?.stairwells?.breezeway
                   ? `Breezeway stairs (${sections.corridors.stairwells.breezeway.landings} landings, ${sections.corridors.stairwells.breezeway.style === 'long' ? 'long' : 'small'} breezeway)`
                   : 'Stairwell fixtures',
          value: sections?.corridors?.stairwells?.product || 0 },
        { key: 'accents', label: 'Accent downlights',  value: sections?.corridors?.accents?.product    || 0 },
        ...(sections?.corridors?.manualAdder > 0
          ? [{ key: 'manualAdder', label: 'Manual adder', value: sections?.corridors?.manualAdder }]
          : []),
      ],
    },
    {
      key: 'boh',
      label: 'BOH / Core + Shell',
      value: sections?.boh?.product || 0,
      details: [
        ...(sections?.boh?.manualAdder > 0
          ? [{ key: 'manualAdder', label: 'Manual adder', value: sections?.boh?.manualAdder }]
          : []),
      ],
    },
    {
      key: 'interior',
      label: 'Interior Amenities',
      value: sections?.interior?.product || 0,
      details: [
        ...(sections?.interior?.manualAdder > 0
          ? [{ key: 'manualAdder', label: 'Manual adder', value: sections?.interior?.manualAdder }]
          : []),
      ],
    },
    {
      key: 'garage',
      label: 'Enclosed Garage',
      value: sections?.garage?.product || 0,
      details: [
        ...(sections?.garage?.manualAdder > 0
          ? [{ key: 'manualAdder', label: 'Manual adder', value: sections?.garage?.manualAdder }]
          : []),
      ],
    },
    {
      key: 'exterior',
      label: 'Exterior & Site',
      value: sections?.exterior?.total?.product || 0,
      details: [
        { key: 'amenities', label: 'Exterior amenities', value: sections?.exterior?.amenities?.product || 0 },
        { key: 'parking', label: (sections?.exterior?.solar
            ? `Surface parking (solar × ${sections.exterior.solar.multiplier})`
            : 'Surface parking') + approxSuffix(sections?.exterior?.parking),
          value: sections?.exterior?.parking?.product || 0 },
        { key: 'carports', label: 'Carports',           value: sections?.exterior?.carports?.product  || 0 },
        { key: 'garages', label: 'Garages',            value: sections?.exterior?.garages?.product   || 0 },
        { key: 'wallpacks', label: 'Building wallpacks' + approxSuffix(sections?.exterior?.wallpacks), value: sections?.exterior?.wallpacks?.product || 0 },
        { key: 'pathway', label: sections?.exterior?.pathway?.suppressedByManual
            ? 'Pathway (manual entry)'
            : (sections?.exterior?.pathway?.solarMultiplier || 1) > 1
              ? `Pathway lighting (solar × ${sections.exterior.pathway.solarMultiplier})`
              : 'Pathway lighting',
          value: sections?.exterior?.pathway?.product || 0 },
        { key: 'landscape', label: 'Landscape / adder',  value: sections?.exterior?.landscape?.product || 0 },
        // One detail per found feature so the dollars are traceable.
        ...(sections?.exterior?.siteFeatures?.items?.length
          ? siteFeatureLines(sections.exterior.siteFeatures.items).map(i => ({ key: i.key, label: siteFeatureLineLabel(i) + approxSuffix(i), value: i.product || 0 }))
          : [{ key: 'siteFeatures', label: 'Site features', value: 0 }]),
        { key: 'misc', label: '5% misc buffer',     value: sections?.exterior?.misc?.product      || 0 },
      ],
    },
    {
      key: 'emergency',
      label: 'Emergency Lighting',
      value: sections?.emergency?.product || 0,
      details: [
        ...(sections?.emergency?.manualAdder > 0
          ? [{ key: 'manualAdder', label: 'Manual adder', value: sections?.emergency?.manualAdder }]
          : []),
      ],
    },
    {
      key: 'exitSigns',
      label: 'Exit Signs',
      value: sections?.exitSigns?.product || 0,
      details: [
        ...(sections?.exitSigns?.manualAdder > 0
          ? [{ key: 'manualAdder', label: 'Manual adder', value: sections?.exitSigns?.manualAdder }]
          : []),
      ],
    },
  ];
}
