'use client';
import { cn } from '@/lib/utils';
import { INTERIOR_AMENITY_TIERS, ratesInTier } from '@/lib/interiorAmenityTiers';

/**
 * The interior amenity $/SF picker: $4–$16, one button per dollar, grouped
 * under the three finish tiers. Used by the internal wizard and the public
 * conceptual budget so the two never drift.
 *
 * @param {string} value     the selected rate as a string ('10'), or ''
 * @param {function} onChange receives the picked rate as a string
 */
export default function InteriorTierPicker({ value, onChange }) {
  const selected = String(value ?? '');
  return (
    <div className="space-y-3">
      {INTERIOR_AMENITY_TIERS.map(tier => {
        const tierPicked = ratesInTier(tier).some(r => String(r) === selected);
        return (
          <div
            key={tier.key}
            className={cn(
              'rounded-lg border p-3 transition-colors',
              tierPicked ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200',
            )}
          >
            <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
              <div className={cn('text-sm font-semibold', tierPicked ? 'text-amber-700' : 'text-slate-700')}>
                {tier.label} <span className="font-normal text-slate-400">· ${tier.min}–${tier.max}/SF</span>
              </div>
              <div className="text-xs text-slate-400">{tier.note}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {ratesInTier(tier).map(rate => {
                const isSelected = selected === String(rate);
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => onChange(String(rate))}
                    aria-pressed={isSelected}
                    className={cn(
                      'min-w-[3.75rem] rounded-lg border px-3 py-2 text-center transition-all',
                      isSelected
                        ? 'border-amber-400 bg-amber-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className={cn('text-base font-bold', isSelected ? 'text-amber-600' : 'text-slate-700')}>
                      ${rate}
                    </span>
                    <span className="text-xs text-slate-400">/SF</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
