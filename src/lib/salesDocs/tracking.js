// Viewer time math for Sales Docs (0137). Pure.
//
// The viewer pings every 5 seconds while the tab is visible and the reader
// touched the page in the last 30 seconds. The server trusts none of the
// numbers it is sent: a delta is cut to 10 seconds, so a tab left open over a
// weekend, or a forged request, adds at most 10 seconds per ping.

export const PING_EVERY_MS = 5000;
export const IDLE_AFTER_MS = 30000;
export const MAX_DELTA_MS = 10000;
export const VIEWING_NOW_MS = 30000;
export const UNIT_SEEN_MS = 5000; // a page or sheet counts as read at 5 seconds

/** A reported delta, made safe to add. */
export function clampDelta(ms) {
  const n = Math.round(Number(ms));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_DELTA_MS);
}

/** Is someone on the page right now? */
export function isViewingNow(lastPingAt, now = Date.now()) {
  if (!lastPingAt) return false;
  return now - new Date(lastPingAt).getTime() <= VIEWING_NOW_MS;
}

/** Share of pages or sheets read for 5 seconds or more, 0 to 1. */
export function completion(unitStats, totalUnits) {
  const total = Number(totalUnits) || 0;
  if (total <= 0) return 0;
  const seen = new Set((unitStats || []).filter((u) => (u.durationMs || 0) >= UNIT_SEEN_MS).map((u) => u.unitIndex));
  return Math.min(1, seen.size / total);
}

/** "3m 20s", "45s", "1h 05m". */
export function formatDuration(ms) {
  const s = Math.round((Number(ms) || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Rough device and browser from a user agent, for the visitor table. */
export function deviceFromUa(ua = '') {
  const s = String(ua);
  const device = /iPad|Tablet/i.test(s) ? 'Tablet' : /Mobi|iPhone|Android/i.test(s) ? 'Phone' : 'Desktop';
  const browser = /Edg\//.test(s) ? 'Edge'
    : /Chrome\//.test(s) ? 'Chrome'
    : /Firefox\//.test(s) ? 'Firefox'
    : /Safari\//.test(s) ? 'Safari'
    : 'Other';
  return { device, browser };
}
