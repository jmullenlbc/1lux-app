'use client';
// The STAGING stripe across the top of every page on the staging copy — the
// login and public pages too. Live shows nothing. See src/lib/appEnv.js.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { appEnv, liveUrl } from '@/lib/appEnv';

const TAG = 'STAGING · ';

export default function EnvironmentBar() {
  const [env, setEnv] = useState(() => appEnv(process.env.NEXT_PUBLIC_APP_ENV, null));
  const pathname = usePathname() || '/';

  useEffect(() => {
    const e = appEnv(process.env.NEXT_PUBLIC_APP_ENV, window.location.hostname);
    setEnv(e);
    if (e !== 'staging') return;
    document.documentElement.dataset.appEnv = 'staging';
    // Every browser tab title starts with STAGING, so a tab can't pass for live.
    const tag = () => { if (!document.title.startsWith(TAG)) document.title = TAG + document.title; };
    tag();
    const head = document.querySelector('head');
    const obs = new MutationObserver(tag);
    if (head) obs.observe(head, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, []);

  if (env !== 'staging') return null;
  return (
    <div role="alert" className="env-bar fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-4 px-4 text-sm font-bold text-black print:hidden">
      <span className="rounded bg-black px-2 py-0.5 text-xs font-black tracking-widest text-yellow-300">STAGING</span>
      <span className="truncate">Test copy — nothing here touches real clients, deals or budgets.</span>
      <a href={liveUrl(pathname)} className="shrink-0 rounded border-2 border-black bg-white px-2 py-0.5 text-xs font-black hover:bg-yellow-100">
        Go to live →
      </a>
    </div>
  );
}
