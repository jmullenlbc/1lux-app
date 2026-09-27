'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDeskCount } from './useDeskCount';

// Phone bottom bar (Mike 9-26): Desk, Notes, People, Search, and Menu for
// everything else (opens the side menu). Hidden from tablet width up.
export const OPEN_MENU = 'ilc:open-menu';

const TABS = [
  { href: '/sales/desk', label: 'Desk',   d: 'M3 7h18M3 12h18M3 17h12', match: p => p.startsWith('/sales/desk') },
  { href: '/crm/notes',  label: 'Notes',  d: 'M9 12h6m-6 4h6M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z', match: p => p.startsWith('/crm/notes') },
  { href: '/crm/contacts', label: 'People', d: 'M17 20h5v-2a4 4 0 00-5-3.87M9 20H2v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z', match: p => p.startsWith('/clients') || p.startsWith('/crm/contacts') },
  { href: '/search',     label: 'Search', d: 'M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z', match: p => p.startsWith('/search') },
];

function Icon({ d }) {
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export default function MobileTabBar() {
  const pathname = usePathname() || '';
  const desk = useDeskCount(pathname);
  const cell = 'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-medium';
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex bg-white border-t border-slate-200 print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {TABS.map(t => {
        const on = t.match(pathname);
        return (
          <Link key={t.href} href={t.href} className={`${cell} relative ${on ? 'text-amber-600' : 'text-slate-500'}`}>
            <Icon d={t.d} />
            {t.label}
            {t.label === 'Desk' && desk > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 min-w-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-[18px] text-center">{desk > 99 ? '99+' : desk}</span>
            )}
          </Link>
        );
      })}
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_MENU))} className={`${cell} text-slate-500`}>
        <Icon d="M4 6h16M4 12h16M4 18h16" />
        Menu
      </button>
    </nav>
  );
}
