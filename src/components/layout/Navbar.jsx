'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';

export default function Navbar({ user }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="h-16 bg-navy-950 border-b border-navy-800 flex items-center px-6 gap-4 shrink-0 print:hidden">
      {/* Logo / Brand */}
      <Link href="/dashboard" className="flex items-center gap-2.5 mr-6">
        <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
            <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
          </svg>
        </div>
        <div>
          <div className="text-white font-semibold text-sm leading-none">ILC Studios</div>
        </div>
      </Link>

      {/* Nav Links */}
      <nav className="flex items-center gap-1 flex-1">
        <Link
          href="/dashboard"
          className="px-3 py-1.5 rounded-lg text-sm text-navy-300 hover:text-white hover:bg-navy-800 transition-colors"
        >
          Projects
        </Link>
        {(user?.role === 'ILC_ADMIN' || user?.role === 'ADMIN') && (
          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-lg text-sm text-navy-300 hover:text-white hover:bg-navy-800 transition-colors"
          >
            Admin
          </Link>
        )}
        {user?.role === 'ILC_ADMIN' && (
          <Link
            href="/admin/pricing"
            className="px-3 py-1.5 rounded-lg text-sm text-amber-400 hover:text-amber-300 hover:bg-navy-800 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Pricing
          </Link>
        )}
      </nav>

      {/* User info + logout */}
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <div className="text-sm text-white font-medium leading-none">{user?.name || user?.email}</div>
          <div className="text-xs text-navy-400 mt-0.5 capitalize">{user?.role?.replace('_', ' ').toLowerCase()}</div>
        </div>
        <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
          {(user?.name || user?.email || '?')[0].toUpperCase()}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-navy-400 hover:text-white hover:bg-navy-800">
          Sign out
        </Button>
      </div>
    </header>
  );
}
