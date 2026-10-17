/**
 * Minimal in-process rate limiter.
 *
 * Built for the public conceptual-budget intake, which is the first
 * unauthenticated WRITE surface in the platform. Every drawing parse costs a
 * real Anthropic API call, so an open endpoint with no throttle is a way for a
 * stranger to spend money on our behalf.
 *
 * ── KNOWN LIMITATION, READ BEFORE RELYING ON THIS ──
 * State lives in module memory. On Amplify's SSR Lambda that means the counter
 * is PER WARM INSTANCE, not global: N concurrent instances allow roughly N×
 * the limit, and a cold start resets the window. This is a speed bump that
 * stops casual abuse and accidental double-submits, it is NOT a defense
 * against a determined attacker.
 *
 * The durable fix is a shared store (a DB table keyed by IP+window, or a
 * managed WAF rate rule). Do that before this endpoint is advertised publicly.
 * Deliberately dependency-free: adding a Redis client for this would be a
 * bigger change than the problem warrants right now.
 */

const buckets = new Map(); // key -> { count, resetAt }

// Bound the map so a flood of unique IPs can't grow it without limit.
const MAX_KEYS = 10_000;

function sweep(now) {
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * @param key      identity to limit on (usually an IP)
 * @param limit    max requests per window
 * @param windowMs window length in ms
 * @returns { allowed, remaining, retryAfterSec }
 */
export function rateLimit(key, { limit = 10, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const id = String(key || 'unknown');

  if (buckets.size > MAX_KEYS) sweep(now);

  const bucket = buckets.get(id);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count++;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

/**
 * Best-effort client IP.
 *
 * Behind Amplify/CloudFront the left-most x-forwarded-for entry is the client.
 * This header is caller-controlled and trivially spoofable, so treat the result
 * as a usage hint, never as identity or an authorization input.
 */
export function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip')
      || request.headers.get('cf-connecting-ip')
      || 'unknown';
}
