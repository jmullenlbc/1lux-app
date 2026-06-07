'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/sales/automation/rules',     label: 'Rules' },
  { href: '/sales/automation/templates', label: 'Templates' },
  { href: '/sales/automation/knowledge', label: 'Bot Knowledge' },
];

export default function AutomationNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 mb-6 -mt-1">
      {TABS.map(tab => {
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
