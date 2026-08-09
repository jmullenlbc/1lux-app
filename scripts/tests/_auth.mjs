// Shared login helper for smoke tests. Talks to a running dev server and returns
// the session cookie, so tests exercise the real auth path rather than mocking it.
export const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

export async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: HTTP ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() || [res.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookie.map(c => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`login for ${email} returned no session cookie`);
  const body = await res.json().catch(() => ({}));
  return { cookie, user: body.user || null };
}

export async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

/**
 * POST JSON to a route. `auth` is either a session cookie string or
 * `{ bearer: '<token>' }` — the MCP tests drive the same endpoint both ways.
 */
export async function post(path, body, auth) {
  const headers = { 'Content-Type': 'application/json' };
  if (typeof auth === 'string') headers.cookie = auth;
  else if (auth?.bearer) headers.authorization = `Bearer ${auth.bearer}`;

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
    redirect: 'manual',
  });
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

export async function serverUp() {
  try { const r = await fetch(`${BASE}/login`, { redirect: 'manual' }); return r.status < 500; }
  catch { return false; }
}
