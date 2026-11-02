'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
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
  // On a phone the strip scrolls sideways, so bring the open tab into view.
  const strip = useRef(null);
  useEffect(() => {
    const el = strip.current;
    const tab = el?.querySelector('[aria-current="page"]');
    if (!tab || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += tab.getBoundingClientRect().left - el.getBoundingClientRect().left - (el.clientWidth - tab.offsetWidth) / 2;
  }, [current]);
  return (
    <div ref={strip} className={`flex items-center gap-1 border-b border-slate-200 overflow-x-auto [scrollbar-width:none] ${className}`}>
      {tabs.map(tab => {
        const key = tab.key || tab.href;
        return (
          <Link
            key={key}
            href={tab.href}
            aria-current={current === key ? 'page' : undefined}
            className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
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
  { key: 'permits', href: '/market-intel/permits', label: 'Municipal' },
  { key: 'sources', href: '/market-intel/sources', label: 'Sources' },
  { key: 'forecast', href: '/market-intel/forecast', label: 'Pipeline forecast' },
];

export const ACTIVITY_TABS = [
  { key: 'activity', href: '/sales/activity',          label: 'Sales Activity' },
  { key: 'expenses', href: '/sales/activity/expenses', label: 'Expenses' },
];

export const PROPOSAL_TABS = [
  { key: 'proposals', href: '/sales/proposals',               label: 'Proposals' },
  { key: 'templates', href: '/sales/proposals?tab=templates', label: 'Templates' },
];

export const SALES_DOCS_TABS = [
  { key: 'docs',       href: '/sales/docs',            label: 'Documents' },
  { key: 'spaces',     href: '/sales/docs/spaces',     label: 'Folders' },
  { key: 'links',      href: '/sales/docs/links',      label: 'Links' },
  { key: 'campaigns',  href: '/sales/docs/campaigns',  label: 'Campaigns' },
  { key: 'lists',      href: '/sales/docs/lists',      label: 'Email lists' },
];
