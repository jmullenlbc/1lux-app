'use client';
import { useEffect, useRef } from 'react';

/**
 * Ask AI and Report a bug never float over the page (Mike 10-17: they must
 * never cover something you need to read). The buttons live in the page frame
 * (the sidebar footer in the app, the left rail or header on the public pages)
 * and open their panel with a window event, the same way the phone menu opens
 * on OPEN_MENU.
 */
export const OPEN_AI         = 'ilc:open-ai';
export const OPEN_BUG        = 'ilc:open-bug';
export const OPEN_PUBLIC_BUG = 'ilc:open-public-bug';

export function openHelper(name) {
  window.dispatchEvent(new Event(name));
}

/** Run `fn` each time the event fires; always the latest `fn`. */
export function useHelperEvent(name, fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = () => ref.current();
    window.addEventListener(name, on);
    return () => window.removeEventListener(name, on);
  }, [name]);
}

// A page with its own AI chat (the project hub, the knowledge base) answers
// Ask AI while it is on screen; the platform panel steps aside.
let aiOwners = 0;
export function useClaimAi() {
  useEffect(() => { aiOwners += 1; return () => { aiOwners -= 1; }; }, []);
}
export const aiClaimed = () => aiOwners > 0;
