/**
 * Which copy of the app is this, live or staging? (Mike 2026-09-24: "you
 * need something on top big and apparent that makes someone know they are in
 * staging.") Import-free so any screen, public ones included, can use it.
 *
 * Staging sets NEXT_PUBLIC_APP_ENV=staging (Sean's branch env vars). The web
 * address is the fallback, so a staging copy missing that variable still says so.
 */
export const LIVE_ORIGIN = 'https://app.ilcstudios.com';

export function appEnv(envValue, host) {
  const e = String(envValue || '').trim().toLowerCase();
  if (e === 'staging' || e === 'production' || e === 'live') return e === 'staging' ? 'staging' : 'live';
  const h = String(host || '').toLowerCase();
  if (/(^|[.-])staging([.-]|$)/.test(h)) return 'staging';
  return 'live';
}

/** The same page on the live copy. */
export function liveUrl(pathAndQuery = '/') {
  const p = String(pathAndQuery || '/');
  return LIVE_ORIGIN + (p.startsWith('/') ? p : `/${p}`);
}
