// Shared constants, no 'use client' so server components can import these too
// Categories are now stored in the database (KbCategory model).
// COLOR_MAP is kept here as a pure UI lookup, no DB needed.

export const COLOR_MAP = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700'   },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
  slate:  { bg: 'bg-slate-50',  border: 'border-slate-200',  text: 'text-slate-700',  dot: 'bg-slate-500',  badge: 'bg-slate-100 text-slate-700'  },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700'  },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700'  },
  rose:   { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-700',   dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700'   },
  cyan:   { bg: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-700',   dot: 'bg-cyan-500',   badge: 'bg-cyan-100 text-cyan-700'   },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   dot: 'bg-teal-500',   badge: 'bg-teal-100 text-teal-700'   },
  sky:    { bg: 'bg-sky-50',    border: 'border-sky-200',    text: 'text-sky-700',    dot: 'bg-sky-500',    badge: 'bg-sky-100 text-sky-700'    },
};
