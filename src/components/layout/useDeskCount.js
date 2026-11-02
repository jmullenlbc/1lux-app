'use client';
import { useEffect, useState } from 'react';
import { DESK_CHANGED } from '@/lib/desk/desk';

/** The sidebar number on My Desk: late + today tasks + emails to review. */
export function useDeskCount(pathname, enabled = true) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const load = () => fetch('/api/sales/desk?count=1')
      .then(r => (r.ok ? r.json() : { attention: 0 }))
      .then(d => { if (live) setN(d.attention || 0); })
      .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    window.addEventListener(DESK_CHANGED, load);
    return () => { live = false; clearInterval(t); window.removeEventListener(DESK_CHANGED, load); };
  }, [pathname, enabled]);
  return n;
}
