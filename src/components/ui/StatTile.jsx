import { cn } from '@/lib/utils';
import { CARD, LABEL, STAT_VALUE, HELPER } from './tokens';

// The one big-number tile (Mike 10-16). Label above, value, optional helper
// line. `tone` colors the value only: success green, danger red, warning amber.
const TONES = {
  default: 'text-slate-900',
  success: 'text-green-600',
  danger:  'text-red-600',
  warning: 'text-amber-600',
  brand:   'text-orange-600',
  muted:   'text-slate-400',
};

export default function StatTile({ label, value, sub, tone = 'default', inset = false, className, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        inset ? 'bg-slate-50 rounded-lg border border-slate-200 p-3' : `${CARD} p-4`,
        'text-left',
        onClick && 'hover:border-orange-300 transition-colors',
        className,
      )}
    >
      <p className={LABEL}>{label}</p>
      <p className={cn(STAT_VALUE, 'mt-1 leading-tight', TONES[tone] || TONES.default)}>{value ?? ''}</p>
      {sub ? <p className={cn(HELPER, 'mt-1')}>{sub}</p> : null}
    </Tag>
  );
}
