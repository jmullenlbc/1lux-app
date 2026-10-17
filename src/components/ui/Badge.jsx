import { cn } from '@/lib/utils';

const variants = {
  draft:     'bg-slate-100 text-slate-600',
  in_review: 'bg-amber-100 text-amber-700',
  complete:  'bg-green-100 text-green-700',
  admin:     'bg-navy-100 text-navy-700',
  ilc_admin: 'bg-purple-100 text-purple-700',
  user:      'bg-blue-100 text-blue-700',
  pending:   'bg-orange-100 text-orange-600',
  default:   'bg-slate-100 text-slate-600',
};

export default function Badge({ children, variant = 'default', className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold',
        variants[variant] ?? variants.default,
        className,
      )}
    >
      {children}
    </span>
  );
}
