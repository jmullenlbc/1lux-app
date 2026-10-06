import Link from 'next/link';

// Tabs across the top of the Sales dashboard, same look as the Sales
// Automation tabs (Mike 10-6: "Budget page visitors and Brief shouldn't be
// buttons, they should be tabs"). + Widget and Share stay buttons.
export const SALES_DASHBOARD_TABS = [
  { key: 'dashboard', href: '/dashboards/sales',              label: 'Dashboard' },
  { key: 'meeting',   href: '/dashboards/sales?tab=meeting',  label: 'Weekly Meeting' },
  { key: 'visitors',  href: '/dashboards/sales?tab=visitors', label: 'Budget page visitors' },
  { key: 'brief',     href: '/dashboards/sales?tab=brief',    label: 'Morning Brief' },
];

export function salesDashboardTab(raw) {
  return SALES_DASHBOARD_TABS.some(t => t.key === raw && t.key !== 'dashboard') ? raw : 'dashboard';
}

export default function SalesDashboardTabs({ active = 'dashboard' }) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 mb-6 -mt-1">
      {SALES_DASHBOARD_TABS.map(tab => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === tab.key
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
