'use client';
import { cn } from '@/lib/utils';
import { FOCUS } from './tokens';

// One button for the platform (Mike 10-6, 10-16). Primary is orange, secondary
// is white with a slate-300 border, red only for destructive actions. `amber`
// and `orange` stay as aliases of primary so older call sites keep working.
const variants = {
  primary:   'bg-orange-500 hover:bg-orange-600 text-white',
  orange:    'bg-orange-500 hover:bg-orange-600 text-white',
  amber:     'bg-orange-500 hover:bg-orange-600 text-white',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
  ghost:     'hover:bg-slate-100 text-slate-600',
  danger:    'bg-red-600 hover:bg-red-700 text-white',
};

// md is the standard size; sm is the compact size for table rows.
const sizes = {
  sm:  'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md:  'px-4 py-2 text-sm rounded-lg gap-2',
  lg:  'px-4 py-2 text-sm rounded-lg gap-2',
};

export default function Button({
  children,
  variant = 'primary',
  size    = 'md',
  className,
  loading = false,
  disabled,
  ...props
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors duration-150',
        FOCUS,
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
