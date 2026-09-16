'use client';
// One count of my waiting calendar drafts, shared by the banner and the sidebar
// badge. Re-checked on every page change, and straight away when a note is
// published or archived (the notes screen calls draftsChanged()).
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export const DRAFTS_CHANGED = 'ilc:drafts-changed';

// The banner and the sidebar both ask on the same page change; they share one
// request instead of making two.
let inflight = null;
function load() {
  if (!inflight) {
    inflight = fetch('/api/crm/notes/drafts-reminder', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
    inflight.then(() => setTimeout(() => { inflight = null; }, 0));
  }
  return inflight;
}

export function draftsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DRAFTS_CHANGED));
}

export function useDraftReminder() {
  const pathname = usePathname();
  const [state, setState] = useState(null);

  useEffect(() => {
    let live = true;
    const refresh = () => load().then(d => { if (live && d) setState(d); });
    refresh();
    window.addEventListener(DRAFTS_CHANGED, refresh);
    return () => { live = false; window.removeEventListener(DRAFTS_CHANGED, refresh); };
  }, [pathname]);

  return state;
}
