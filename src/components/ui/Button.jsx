'use client';
import { cn } from '@/lib/utils';

const variants = {
  primary:   'bg-navy-800 hover:bg-navy-900 text-white shadow-sm',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm',
  amber:     'bg-amber-500 hover:bg-amber-600 text-white shadow-sm',
  ghost:     'hover:bg-slate-100 text-slate-600',
  danger:    'bg-red-600 hover:bg-red-700 text-white shadow-sm',
};

const sizes = {
  sm:  'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md:  'px-4 py-2 text-sm rounded-lg gap-2',
  lg:  'px-5 py-2.5 text-base rounded-xl gap-2',
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
        'inline-flex items-center justify-center font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
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
