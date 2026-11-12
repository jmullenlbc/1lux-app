/* CLIQ Layout Lab — server for Replit (or any Node 20+ host). No dependencies.
 * - Serves public/ (the same files as the claude.ai artifact).
 * - GET  /api/health            -> { ok, netsuite }
 * - GET  /api/catalog           -> CLIQ items from NetSuite, READ-ONLY (SuiteQL over REST, token-based auth)
 * - GET  /api/store/:coll        -> [docs]          (jobs | tests | settings)
 * - PUT  /api/store/:coll/:id    -> saves one doc
 * - DELETE /api/store/:coll/:id  -> removes one doc
 * Store: a JSON file (DATA_FILE, default ./data/store.json). Swap for Postgres when the ERP takes this over.
 *
 * NetSuite secrets (Replit → Secrets). Leave them out to run without a catalog:
 *   NS_ACCOUNT_ID, NS_CONSUMER_KEY, NS_CONSUMER_SECRET, NS_TOKEN_ID, NS_TOKEN_SECRET
 * Optional: NS_SUBSIDIARY (default 11 = SHIFT Innovations), NS_DN_LEVEL (default 32), APP_PASSWORD (basic gate).
 * The integration role should have only: SuiteAnalytics Workbook / REST Web Services, Items (View),
 * Inventory (View), Pricing (View). It is never given create or edit permissions.
 */
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_SQL } from './public/catalog-sql.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUB = join(ROOT, 'public');
const PORT = +process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || join(ROOT, 'data', 'store.json');
const COLLS = new Set(['jobs', 'tests', 'settings']);
const env = process.env;
const NS_ON = !!(env.NS_ACCOUNT_ID && env.NS_CONSUMER_KEY && env.NS_CONSUMER_SECRET && env.NS_TOKEN_ID && env.NS_TOKEN_SECRET);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/* ---------- store ---------- */
let db = null;
async function loadDb() { if (db) return db; try { db = JSON.parse(await readFile(DATA_FILE, 'utf8')); } catch { db = {}; } return db; }
let saving = Promise.resolve();
function persist() { saving = saving.then(async () => { await mkdir(dirname(DATA_FILE), { recursive: true }); await writeFile(DATA_FILE, JSON.stringify(db)); }); return saving; }

/* ---------- NetSuite SuiteQL (read-only, OAuth 1.0a TBA, HMAC-SHA256) ---------- */
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function authHeader(method, url) {
  const u = new URL(url); const realm = env.NS_ACCOUNT_ID.toUpperCase().replace(/-/g, '_');
  const o = { oauth_consumer_key: env.NS_CONSUMER_KEY, oauth_token: env.NS_TOKEN_ID, oauth_signature_method: 'HMAC-SHA256', oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_nonce: randomBytes(12).toString('hex'), oauth_version: '1.0' };
  const params = [...Object.entries(o), ...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : (a[0] < b[0] ? -1 : 1));
  const base = [method.toUpperCase(), enc(u.origin + u.pathname), enc(params.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  const sig = createHmac('sha256', `${enc(env.NS_CONSUMER_SECRET)}&${enc(env.NS_TOKEN_SECRET)}`).update(base).digest('base64');
  return 'OAuth ' + [`realm="${realm}"`, ...Object.entries({ ...o, oauth_signature: sig }).map(([k, v]) => `${k}="${enc(v)}"`)].join(', ');
}
async function suiteql(q) {
  const host = `https://${env.NS_ACCOUNT_ID.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
  let offset = 0, items = [];
  for (;;) {
    const url = `${host}?limit=1000&offset=${offset}`;
    const r = await fetch(url, { method: 'POST', headers: { Authorization: authHeader('POST', url), 'Content-Type': 'application/json', Prefer: 'transient' }, body: JSON.stringify({ q }) });
    if (!r.ok) throw new Error(`NetSuite ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json(); items = items.concat(j.items || []);
    if (!j.hasMore) break; offset += 1000;
  }
  return items.map(({ links, ...rest }) => rest);
}
let catCache = { at: 0, data: null };

/* ---------- http ---------- */
function gate(req, res) {
  if (!env.APP_PASSWORD) return true;
  const h = req.headers.authorization || ''; const pass = Buffer.from(h.replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(pass), b = Buffer.from(env.APP_PASSWORD);
  if (a.length === b.length && timingSafeEqual(a, b)) return true;
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="CLIQ Layout Lab"' }); res.end('Sign in'); return false;
}
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
async function body(req) { let s = ''; for await (const c of req) { s += c; if (s.length > 5e6) throw new Error('Too large'); } return JSON.parse(s || '{}'); }

http.createServer(async (req, res) => {
  try {
    if (!gate(req, res)) return;
    const url = new URL(req.url, 'http://x'); const p = url.pathname;
    if (p === '/api/health') return json(res, 200, { ok: true, netsuite: NS_ON });
    if (p === '/api/catalog') {
      if (!NS_ON) return json(res, 503, { error: 'NetSuite isn’t configured on this server.' });
      if (!catCache.data || Date.now() - catCache.at > 30 * 60 * 1000) catCache = { at: Date.now(), data: await suiteql(CATALOG_SQL(env.NS_SUBSIDIARY || 11, env.NS_DN_LEVEL || 32)) };
      return json(res, 200, catCache.data);
    }
    const m = p.match(/^\/api\/store\/([a-z]+)(?:\/([^/]+))?$/);
    if (m) {
      const [, coll, id] = m; if (!COLLS.has(coll)) return json(res, 404, { error: 'Unknown collection' });
      const d = await loadDb(); d[coll] = d[coll] || {};
      if (req.method === 'GET' && !id) return json(res, 200, Object.values(d[coll]));
      if (req.method === 'PUT' && id) { d[coll][decodeURIComponent(id)] = { ...(await body(req)), id: decodeURIComponent(id) }; await persist(); return json(res, 200, { ok: true }); }
      if (req.method === 'DELETE' && id) { delete d[coll][decodeURIComponent(id)]; await persist(); return json(res, 200, { ok: true }); }
      return json(res, 405, { error: 'Method not allowed' });
    }
    /* static */
    const file = normalize(join(PUB, p === '/' ? 'index.html' : p));
    if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    let data = await readFile(file).catch(() => null);
    if (!data) { res.writeHead(404); return res.end('Not found'); }
    if (file.endsWith('index.html')) data = Buffer.from(SHELL_HEAD + data.toString() + '</body></html>');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch (e) { json(res, 500, { error: e.message }); }
}).listen(PORT, () => console.log(`CLIQ Layout Lab on :${PORT} (NetSuite catalog ${NS_ON ? 'on, read-only' : 'off'})`));

/* index.html is written for the claude.ai artifact, which adds this skeleton itself. */
const SHELL_HEAD = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
