'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { href: '/sales/automation/rules',     label: 'Rules' },
  { href: '/sales/automation/templates', label: 'Templates' },
  { href: '/sales/automation/knowledge', label: 'Bot Knowledge' },
  { href: '/sales/automation/timeline',  label: 'Reminder Timeline' },
];

// Shown only to Sales Admins / Super Admins.
const ADMIN_TABS = [
  { href: '/sales/automation/triggers', label: 'If-Then Rules' },
  { href: '/sales/automation/actions', label: 'Action Types' },
];

export default function AutomationNav() {
  const pathname = usePathname();
  const [salesAdmin, setSalesAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setSalesAdmin(!!d.salesAdmin); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const tabs = salesAdmin ? [...TABS, ...ADMIN_TABS] : TABS;

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 mb-6 -mt-1">
      {tabs.map(tab => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              active
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
