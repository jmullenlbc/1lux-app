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
 * `{ bearer: '<token>' }`, the MCP tests drive the same endpoint both ways.
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

/**
 * postParked, the test-side twin of src/lib/parkedFetch.js. Every in-app AI
 * read is park-and-poll now (Mike 2026-09-17): the first POST only writes the
 * job down ({ jobKey, queued: true }); each POST { jobKey } after that runs it
 * or reports { waiting: true }. This keeps asking until the real answer comes
 * back, then returns it in the same { status, text, json } shape as post().
 */
export async function postParked(path, body, auth, { pollMs = 1500, maxWaitMs = 4 * 60 * 1000 } = {}) {
  const first = await post(path, body, auth);
  if (!first.json?.jobKey || !first.json?.queued) return first;
  const jobKey = first.json.jobKey;
  const startedAt = Date.now();
  for (;;) {
    const r = await post(path, { jobKey }, auth);
    if (!(r.json && (r.json.waiting || r.json.queued))) {
      if (r.status >= 200 && r.status < 300) post(path, { jobKey, sweep: true }, auth).catch(() => {});
      return r;
    }
    if (Date.now() - startedAt > maxWaitMs) return { status: 504, text: '', json: { error: 'timeout', message: `parked job ${jobKey} never finished` } };
    await new Promise(res => setTimeout(res, pollMs));
  }
}

export async function serverUp() {
  try { const r = await fetch(`${BASE}/login`, { redirect: 'manual' }); return r.status < 500; }
  catch { return false; }
}
