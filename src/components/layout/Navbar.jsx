'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import Button from '@/components/ui/Button';

function AlertBell({ userId }) {
  const [alerts, setAlerts]     = useState([]);
  const [open, setOpen]         = useState(false);
  const ref                     = useRef(null);

  async function load() {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) setAlerts(await res.json());
    } catch {}
  }

  useEffect(() => { load(); }, [userId]);

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function markAllRead() {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
    setAlerts(prev => prev.map(a => ({ ...a, isRead: true })));
  }

  async function markRead(id) {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) });
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
  }

  const unread = alerts.filter(a => !a.isRead).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-8 h-8 rounded-full flex items-center justify-center text-navy-300 hover:text-white hover:bg-navy-800 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-amber-600 hover:text-amber-700 font-medium">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No notifications</p>
            ) : (
              alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`px-4 py-3 border-b border-slate-50 last:border-0 ${alert.isRead ? '' : 'bg-amber-50'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-slate-800 ${alert.isRead ? '' : 'font-semibold'}`}>
                        {alert.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{alert.message}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {alert.link && (
                          <Link
                            href={alert.link}
                            onClick={() => { markRead(alert.id); setOpen(false); }}
                            className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                          >
                            View →
                          </Link>
                        )}
                        {!alert.isRead && (
                          <button onClick={() => markRead(alert.id)} className="text-xs text-slate-400 hover:text-slate-600">
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                    {!alert.isRead && (
                      <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

      {/* Alerts + User info + logout */}
      <div className="flex items-center gap-3">
        {user?.id && <AlertBell userId={user.id} />}
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
