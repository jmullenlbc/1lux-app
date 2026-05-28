'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

// ── Alert Bell ────────────────────────────────────────────────────────────────

function AlertBell({ userId, expanded }) {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen]     = useState(false);
  const [pos, setPos]       = useState({ bottom: 0, left: 248 });
  const ref                 = useRef(null);
  const btnRef              = useRef(null);

  async function load() {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) setAlerts(await res.json());
    } catch {}
  }

  useEffect(() => { if (userId) load(); }, [userId]);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ bottom: window.innerHeight - r.bottom, left: r.right + 8 });
    }
    setOpen(o => !o);
  }

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
        ref={btnRef}
        onClick={toggle}
        title={!expanded ? 'Notifications' : undefined}
        className={`w-full flex items-center py-1.5 rounded-lg text-xs font-medium transition-colors ${expanded ? 'gap-2.5 px-3' : 'justify-center px-0'} relative`}
        style={{ color: open ? '#e2e8f0' : '#627d98', backgroundColor: open ? '#1e293b' : 'transparent' }}
        onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.backgroundColor = '#1e293b'; }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.color = '#627d98'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
      >
        <span className="relative shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full text-white text-[8px] font-bold flex items-center justify-center leading-none">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </span>
        {expanded && <span className="flex-1 text-left whitespace-nowrap">Notifications</span>}
        {expanded && unread > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white leading-none min-w-[18px] text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
          style={{ bottom: pos.bottom, left: pos.left, zIndex: 9999 }}>
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
                <div key={alert.id} className={`px-4 py-3 border-b border-slate-50 last:border-0 ${alert.isRead ? '' : 'bg-amber-50'}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm text-slate-800 ${alert.isRead ? 'font-medium' : 'font-semibold'}`}>{alert.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{alert.message}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {alert.link && (
                          <Link href={alert.link} onClick={() => { markRead(alert.id); setOpen(false); }}
                            className="text-xs text-amber-600 hover:text-amber-700 font-medium">
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
                    {!alert.isRead && <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />}
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

// ── Icons ────────────────────────────────────────────────────────────────────

function IconGrid() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>;
}
function IconFolder() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>;
}
function IconUsers() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
}
function IconSales() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>;
}
function IconPrecon() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" /></svg>;
}
function IconConstruction() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>;
}
function IconFinance() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IconDesign() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg>;
}
function IconBook() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>;
}
function IconCog() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function IconTag() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>;
}
function IconUserCircle() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function IconBuilding() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>;
}
function IconChangelog() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>;
}
function IconRoadmap() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>;
}
function IconPipeline() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>;
}
function IconDashboardWidget() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
}
function IconNotes() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}
function IconDoc() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}
function IconNews() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" /></svg>;
}
function IconFixture() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>;
}
function IconFactory() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" /></svg>;
}
function IconPackage() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg>;
}
function IconLogout() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>;
}
function IconPin({ locked }) {
  return locked
    ? <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5l-2 2v2h5v7l1 1 1-1v-7h5v-2l-2-2z"/></svg>
    : <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5l-2 2v2h5v7l1 1 1-1v-7h5v-2l-2-2z"/></svg>;
}
function IconSoftware() {
  return <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 7.409A2.25 2.25 0 012.25 5.493V5.25" /></svg>;
}
function IconTask() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IconClientUsers() {
  return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
}

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({ href, icon, label, active, disabled, badge, expanded }) {
  const base = 'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors select-none';
  const activeClass   = 'bg-navy-800 text-white';
  const normalClass   = 'text-navy-300 hover:text-white hover:bg-navy-800/60';
  const disabledClass = 'text-navy-600 cursor-not-allowed';

  const content = (
    <>
      <span className="shrink-0">{icon}</span>
      <span className={`flex-1 whitespace-nowrap transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>{label}</span>
      {badge != null && expanded && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white leading-none min-w-[18px] text-center">
          {badge}
        </span>
      )}
      {disabled && expanded && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-navy-800 text-navy-500 leading-none">soon</span>
      )}
    </>
  );

  if (disabled) return <div className={`${base} ${disabledClass}`} title={label}>{content}</div>;

  return (
    <Link href={href} className={`${base} ${active ? activeClass : normalClass}`} title={!expanded ? label : undefined}>
      {content}
    </Link>
  );
}

function SubNavItem({ href, icon, label, active, disabled, expanded }) {
  const base = `flex items-center gap-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors select-none ${expanded ? 'pl-8 pr-3' : 'px-3 justify-center'}`;
  const activeClass   = 'text-white bg-navy-800';
  const normalClass   = 'text-navy-400 hover:text-white hover:bg-navy-800/60';
  const disabledClass = 'text-navy-600 cursor-not-allowed';

  const content = (
    <>
      <span className="shrink-0 opacity-75">{icon}</span>
      {expanded && <span className="whitespace-nowrap">{label}</span>}
      {disabled && expanded && <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-navy-800 text-navy-500 leading-none ml-auto">soon</span>}
    </>
  );

  if (disabled) return <div className={`${base} ${disabledClass}`} title={label}>{content}</div>;
  return (
    <Link href={href} className={`${base} ${active ? activeClass : normalClass}`} title={!expanded ? label : undefined}>
      {content}
    </Link>
  );
}

// ── Collapsible section header ────────────────────────────────────────────────

function SectionHeader({ icon, label, isActive, isOpen, expanded, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors select-none cursor-pointer ${
        isActive ? 'text-white' : 'hover:text-white'
      }`}
      style={isActive
        ? { backgroundColor: '#1e3a5f', color: 'white' }
        : { color: '#94b4d1' }
      }
    >
      <span className="shrink-0">{icon}</span>
      {expanded && (
        <>
          <span className="flex-1 whitespace-nowrap">{label}</span>
          <svg
            className="w-3 h-3 shrink-0 transition-transform duration-150"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: '#4a6fa5' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar({ user }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [locked,   setLocked]   = useState(false);
  const [hovered,  setHovered]  = useState(false);
  const hoverTimer = useRef(null);

  const isAdmin    = user?.role === 'ILC_ADMIN' || user?.role === 'ADMIN' ||
                     user?.role === 'SUPER_ADMIN' || user?.role === 'COMPANY_ADMIN';
  const isIlcAdmin = user?.role === 'ILC_ADMIN' || user?.role === 'SUPER_ADMIN';

  // Persist locked state
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-locked');
    if (stored === 'true') setLocked(true);
  }, []);
  function toggleLock() {
    const next = !locked;
    setLocked(next);
    localStorage.setItem('sidebar-locked', String(next));
    if (!next) setHovered(false);
  }

  const expanded = locked || hovered;

  const at         = (path) => pathname === path;
  const startsWith = (path) => pathname.startsWith(path);

  // ── Route groupings ──────────────────────────────────────────────────────────
  const homeRelated     = at('/home') || startsWith('/dashboard') ||
                          (startsWith('/project') && !startsWith('/project/new')) ||
                          startsWith('/knowledge-base');
  const crmRelated      = startsWith('/crm') || startsWith('/clients');
  const preconRelated   = startsWith('/pre-con') || startsWith('/manufacturers') ||
                          startsWith('/sales-reps') || startsWith('/products');
  const softwareRelated = startsWith('/admin/changelog') || startsWith('/admin/roadmap') ||
                          startsWith('/admin/tasks') || startsWith('/fixture-library');

  // ── Collapsible open states ───────────────────────────────────────────────────
  const [homeOpen,     setHomeOpen]     = useState(true);
  const [crmOpen,      setCrmOpen]      = useState(true);
  const [preconOpen,   setPreconOpen]   = useState(false);
  const [softwareOpen, setSoftwareOpen] = useState(false);

  // Auto-open when navigating to a related path
  useEffect(() => {
    if (homeRelated)     setHomeOpen(true);
    if (crmRelated)      setCrmOpen(true);
    if (preconRelated)   setPreconOpen(true);
    if (softwareRelated) setSoftwareOpen(true);
  }, [pathname]);

  async function handleLogout() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  function handleMouseEnter() {
    if (locked) return;
    clearTimeout(hoverTimer.current);
    setHovered(true);
  }
  function handleMouseLeave() {
    if (locked) return;
    hoverTimer.current = setTimeout(() => setHovered(false), 200);
  }

  const sidebarW = expanded ? 'w-60' : 'w-16';

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${sidebarW} shrink-0 flex flex-col h-screen overflow-hidden transition-all duration-200 ease-in-out print:hidden z-30`}
      style={{ backgroundColor: '#0a1929' }}
    >
      {/* ── Logo + pin ── */}
      <div className="px-3 py-4 shrink-0 flex items-center justify-between overflow-hidden">
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
              <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
            </svg>
          </div>
          {expanded && (
            <div className="min-w-0">
              <div className="text-white font-semibold text-sm leading-tight whitespace-nowrap">ILC Studios</div>
              <div className="text-[10px] leading-tight whitespace-nowrap" style={{ color: '#4a6fa5' }}>Budget Platform</div>
            </div>
          )}
        </Link>
        {expanded && (
          <button onClick={toggleLock} title={locked ? 'Unpin sidebar' : 'Pin sidebar open'}
            className="shrink-0 p-1 rounded transition-colors hover:bg-white/10"
            style={{ color: locked ? '#f59e0b' : '#4a6fa5' }}>
            <IconPin locked={locked} />
          </button>
        )}
      </div>

      {/* ── Main nav ── */}
      <nav className="flex-1 px-2 pb-4 space-y-0.5 overflow-y-auto overflow-x-hidden">

        {/* ── Home (collapsible) ── */}
        <div>
          <SectionHeader
            icon={<IconGrid />}
            label="Home"
            isActive={homeRelated}
            isOpen={homeOpen}
            expanded={expanded}
            onClick={() => expanded ? setHomeOpen(o => !o) : router.push('/home')}
          />
          {expanded && homeOpen && (
            <div className="mt-0.5 space-y-0.5 ml-1">
              <SubNavItem href="/home"      icon={<IconGrid />}   label="Overview"  expanded={expanded} active={at('/home')} />
              <SubNavItem href="/dashboard" icon={<IconFolder />} label="Projects"  expanded={expanded} active={at('/dashboard') || (startsWith('/project') && !startsWith('/project/new'))} />
              <SubNavItem href="/knowledge-base" icon={<IconBook />} label="Knowledge Base" expanded={expanded} active={startsWith('/knowledge-base')} />
            </div>
          )}
        </div>

        {/* ── CRM (collapsible) ── */}
        <div>
          <SectionHeader
            icon={<IconSales />}
            label="Sales"
            isActive={crmRelated}
            isOpen={crmOpen}
            expanded={expanded}
            onClick={() => expanded ? setCrmOpen(o => !o) : router.push('/crm')}
          />
          {expanded && crmOpen && (
            <div className="mt-0.5 space-y-0.5 ml-1">
              <SubNavItem href="/clients"        icon={<IconClientUsers />}     label="Clients"     expanded={expanded} active={startsWith('/clients')} />
              <SubNavItem href="/crm"            icon={<IconPipeline />}        label="Pipeline"    expanded={expanded} active={at('/crm') || (crmRelated && !startsWith('/crm/dashboards') && !startsWith('/crm/notes') && !startsWith('/clients'))} />
              <SubNavItem href="/crm/dashboards" icon={<IconDashboardWidget />} label="Dashboards"  expanded={expanded} active={startsWith('/crm/dashboards')} />
              <SubNavItem href="/crm/notes"      icon={<IconNotes />}           label="Sales Notes" expanded={expanded} active={startsWith('/crm/notes')} />
              <SubNavItem href="#" icon={<IconDoc />}      label="Proposals"        expanded={expanded} disabled />
              <SubNavItem href="/market-intel" icon={<IconNews />} label="Market Intelligence" expanded={expanded} active={startsWith('/market-intel')} />
            </div>
          )}
        </div>

        {/* ── Pre-con (collapsible) ── */}
        <div>
          <SectionHeader
            icon={<IconPrecon />}
            label="Pre-con"
            isActive={preconRelated}
            isOpen={preconOpen}
            expanded={expanded}
            onClick={() => expanded ? setPreconOpen(o => !o) : router.push('/pre-con')}
          />
          {expanded && preconOpen && (
            <div className="mt-0.5 space-y-0.5 ml-1">
              <SubNavItem href="/manufacturers" icon={<IconFactory />} label="Manufacturers" expanded={expanded} active={startsWith('/manufacturers')} />
              <SubNavItem href="/sales-reps"    icon={<IconTag />}     label="Sales Reps"    expanded={expanded} active={startsWith('/sales-reps')} />
              <SubNavItem href="/products"      icon={<IconPackage />} label="Products"      expanded={expanded} active={startsWith('/products')} />
            </div>
          )}
        </div>

        <NavItem href="#" icon={<IconConstruction />} label="Construction" disabled expanded={expanded} />
        <NavItem href="#" icon={<IconDesign />}       label="Design"       disabled expanded={expanded} />
        <NavItem href="#" icon={<IconFinance />}      label="Finance"      disabled expanded={expanded} />

        {/* ── Software (Super Admin only) ── */}
        {isIlcAdmin && (
          <div>
            <SectionHeader
              icon={<IconSoftware />}
              label="Software"
              isActive={softwareRelated}
              isOpen={softwareOpen}
              expanded={expanded}
              onClick={() => expanded ? setSoftwareOpen(o => !o) : router.push('/admin/changelog')}
            />
            {expanded && softwareOpen && (
              <div className="mt-0.5 space-y-0.5 ml-1">
                <SubNavItem href="/admin/changelog"  icon={<IconChangelog />} label="Changelog"       expanded={expanded} active={startsWith('/admin/changelog')} />
                <SubNavItem href="/admin/roadmap"   icon={<IconRoadmap />}   label="Roadmap"         expanded={expanded} active={startsWith('/admin/roadmap')} />
                <SubNavItem href="/admin/tasks"     icon={<IconTask />}      label="Tasks"           expanded={expanded} active={startsWith('/admin/tasks')} />
                <SubNavItem href="/fixture-library" icon={<IconFixture />}   label="Fixture Library" expanded={expanded} active={startsWith('/fixture-library')} />
              </div>
            )}
          </div>
        )}

        {/* ── Settings ── */}
        <div className="my-3" style={{ borderTop: '1px solid #1e293b' }} />

        {expanded && (
          <div className="px-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#2d4a6a' }}>Settings</span>
          </div>
        )}

        <SubNavItem href="/admin/profile"  icon={<IconUserCircle />} label="Profile"        expanded={expanded} active={startsWith('/admin/profile')} />
        {isIlcAdmin && <SubNavItem href="/admin/pricing" icon={<IconTag />}       label="Master Pricing" expanded={expanded} active={startsWith('/admin/pricing')} />}
        {isAdmin    && <SubNavItem href="/admin"         icon={<IconUsers />}     label="Users"          expanded={expanded} active={at('/admin')} />}
        <SubNavItem href="#" icon={<IconBuilding />} label="Company" disabled expanded={expanded} />
      </nav>

      {/* ── User footer ── */}
      <div className="shrink-0 px-2 py-3 overflow-hidden" style={{ borderTop: '1px solid #1e293b' }}>
        {expanded ? (
          <div className="flex items-center gap-2.5 mb-2 px-1">
            <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium leading-tight truncate" style={{ color: '#e2e8f0' }}>
                {user?.name || user?.email}
              </div>
              <div className="text-[10px] leading-tight capitalize" style={{ color: '#4a6fa5' }}>
                {({ SUPER_ADMIN: 'Super Admin', ILC_ADMIN: 'Super Admin', COMPANY_ADMIN: 'Company Admin', ADMIN: 'Company Admin', USER: 'User', CLIENT_VIEWER: 'Client Viewer' })[user?.role] || user?.role}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-2">
            <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold">
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </div>
          </div>
        )}
        <AlertBell userId={user?.id} expanded={expanded} />
        <button onClick={handleLogout} disabled={signingOut}
          className={`w-full flex items-center py-1.5 rounded-lg text-xs font-medium transition-colors ${expanded ? 'gap-2.5 px-3' : 'justify-center px-0'}`}
          style={{ color: '#627d98' }}
          title={!expanded ? 'Sign out' : undefined}
          onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.backgroundColor = '#1e293b'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#627d98'; e.currentTarget.style.backgroundColor = 'transparent'; }}>
          <IconLogout />
          {expanded && (signingOut ? 'Signing out…' : 'Sign out')}
        </button>
      </div>
    </aside>
  );
}
