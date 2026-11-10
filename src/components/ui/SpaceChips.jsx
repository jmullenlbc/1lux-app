import Link from 'next/link';
import { spaceFilterChoices } from '@/lib/companySpaces';

// A row of company links for list pages that filter on the server (My Jobs, Ship Schedules): All, then the
// person's own companies, then the others and "No company yet". The choice lives in the address as ?space=.
export default function SpaceChips({ basePath, current = '', mySpaces = [] }) {
  const chips = [['', 'All'], ...spaceFilterChoices(mySpaces)];
  return (
    <div className="flex flex-wrap gap-1.5 mb-4" role="navigation" aria-label="Company">
      {chips.map(([value, label]) => {
        const active = (current || '') === value;
        return (
          <Link
            key={value || 'all'}
            href={value ? `${basePath}?space=${encodeURIComponent(value)}` : basePath}
            aria-current={active ? 'page' : undefined}
            className={`min-h-[32px] inline-flex items-center rounded-full px-3 text-xs font-semibold border transition-colors ${
              active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
