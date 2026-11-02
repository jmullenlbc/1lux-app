'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useDeskCount } from './useDeskCount';
import { TAB_ACTIVE } from '@/components/ui/tokens';
import { phoneTabsFor } from '@/lib/deptScreens';

// Phone bottom bar: this person's tabs (Mike 10-31, phoneTabsFor), and Menu for
// everything else (opens the side menu). Hidden from tablet width up.
export const OPEN_MENU = 'ilc:open-menu';

const FOLDERS = 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z';
const BARS = 'M4 20V10m6 10V4m6 16v-7m4 7H3';

const ICONS = {
  expenses: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zm3 5h6m-6 4h6',
  desk:            'M3 7h18M3 12h18M3 17h12',
  notes:           'M9 12h6m-6 4h6M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z',
  people:          'M17 20h5v-2a4 4 0 00-5-3.87M9 20H2v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z',
  marketIntel:     'M3 12a9 9 0 1018 0 9 9 0 00-18 0zm0 0h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  preconDashboard: BARS,
  budgets:         'M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zm1 4h8M8 11h2m3 0h3m-8 4h2m3 0h3',
  rfqs:            'M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  myJobs:          'M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-11 0h16a1 1 0 011 1v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8a1 1 0 011-1zm-1 6h18',
  projects:        FOLDERS,
  shipSchedules:   'M3 6h11v10H3zm11 4h4l3 3v3h-7M7.5 19a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z',
  mainDashboard:   'M4 4h7v7H4zm9 0h7v4h-7zm0 7h7v9h-7zM4 14h7v6H4z',
  salesDashboard:  BARS,
  search:          'M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z',
};

function Icon({ d }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export default function MobileTabBar({ user }) {
  const pathname = usePathname() || '';
  const query = useSearchParams();
  const tabs = phoneTabsFor(user);
  const desk = useDeskCount(pathname, tabs.some(t => t.key === 'desk'));
  const cell = 'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] leading-tight text-center font-semibold border-t-2';
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex bg-white border-t border-slate-200 print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(t => {
        const on = t.match(pathname, query);
        return (
          <Link key={t.key} href={t.href} className={`${cell} relative ${on ? TAB_ACTIVE : 'border-transparent text-slate-500'}`}>
            <Icon d={ICONS[t.key]} />
            {t.label}
            {t.key === 'desk' && desk > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 min-w-[18px] px-1 rounded-full bg-orange-500 text-white text-[11px] font-bold tabular-nums leading-[18px] text-center">{desk > 99 ? '99+' : desk}</span>
            )}
          </Link>
        );
      })}
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_MENU))} className={`${cell} border-transparent text-slate-500`}>
        <Icon d="M4 6h16M4 12h16M4 18h16" />
        Menu
      </button>
    </nav>
  );
}
