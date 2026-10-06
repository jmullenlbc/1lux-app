'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// One tab strip for every Sales module with sibling views (Mike 10-6: "all
// sales modules that have multiple things like that" get the Sales Automation
// tab look). Pass `active` (a tab key) to pick the tab yourself, otherwise the
// longest href that matches the current path wins.
export default function SectionTabs({ tabs, active = null, className = 'mb-6 -mt-1' }) {
  const pathname = usePathname() || '';
  let current = active;
  if (current == null) {
    let best = '';
    for (const t of tabs) {
      const path = t.href.split('?')[0];
      if ((pathname === path || pathname.startsWith(path + '/')) && path.length > best.length) {
        best = path;
        current = t.key || t.href;
      }
    }
  }
  return (
    <div className={`flex items-center gap-1 border-b border-slate-200 ${className}`}>
      {tabs.map(tab => {
        const key = tab.key || tab.href;
        return (
          <Link
            key={key}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              current === key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export const PIPELINE_TABS = [
  { key: 'pipeline', href: '/crm',             label: 'Pipeline' },
  { key: 'contacts', href: '/crm/contacts',    label: 'Contacts' },
  { key: 'checkins', href: '/sales/check-ins', label: 'Check-ins' },
];

export const MARKET_INTEL_TABS = [
  { key: 'intel',   href: '/market-intel',         label: 'Market Intelligence' },
  { key: 'sources', href: '/market-intel/sources', label: 'Sources' },
];

export const PROPOSAL_TABS = [
  { key: 'proposals', href: '/sales/proposals',               label: 'Proposals' },
  { key: 'templates', href: '/sales/proposals?tab=templates', label: 'Templates' },
];
