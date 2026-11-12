/* Data adapters. The app only talks to these two objects:
 *   catalog.load()            -> CLIQ items (read-only)
 *   store.list/put/del(coll)  -> saved jobs and test cases
 * Three back ends, picked at start-up:
 *   artifact  claude.ai artifact: NetSuite connector (read-only SuiteQL) + artifact db
 *   server    Replit / any host: GET /api/catalog, /api/store/:coll (see server.js)
 *   offline   no catalog (DN sheet prices only) + this browser's localStorage
 * NetSuite is never written to from here. Planned writes are documented in docs/netsuite-writes.md.
 */
import { normItem } from './engine.js';
import { CATALOG_SQL } from './catalog-sql.js';

export { CATALOG_SQL };

const NS_SERVER = 'NetSuite';
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

function nsError(e) {
  switch (e?.code) {
    case 'server_not_connected': case 'server_not_found': return 'NetSuite isn’t connected for your account. Add the NetSuite connector in claude.ai settings, then reload.';
    case 'needs_reauth': return 'Your NetSuite connection expired. Reconnect NetSuite in claude.ai settings.';
    case 'not_in_manifest': case 'approval_required': case 'consent_required': return 'Allow this page to read NetSuite when asked, then try again.';
    case 'blocked_by_policy': return 'Your organization blocks NetSuite for this page.';
    case 'server_unavailable': return 'NetSuite didn’t respond. Try again in a moment.';
    default: return e?.message ? String(e.message).slice(0, 300) : 'NetSuite request failed.';
  }
}

function localStore() {
  const k = c => 'cliq-layout:' + c;
  const read = c => { try { return JSON.parse(localStorage.getItem(k(c)) || '{}'); } catch { return {}; } };
  const write = (c, o) => { try { localStorage.setItem(k(c), JSON.stringify(o)); return true; } catch { return false; } };
  return {
    kind: 'browser',
    async list(c) { return Object.values(read(c)); },
    async put(c, id, doc) { const o = read(c); o[id] = { ...doc, id }; if (!write(c, o)) throw new Error('This browser blocked saving.'); },
    async del(c, id) { const o = read(c); delete o[id]; write(c, o); }
  };
}
function dbStore(db) {
  return {
    kind: 'shared',
    async list(c) { const snap = await db.collection(c).limit(500).get(); return snap.docs.map(d => ({ ...d.data(), id: d.id })); },
    async put(c, id, doc) { await db.collection(c).doc(id).set(JSON.parse(JSON.stringify({ ...doc, id }))); },
    async del(c, id) { await db.collection(c).doc(id).delete(); }
  };
}
function serverStore() {
  const j = async r => { if (!r.ok) throw new Error(`Server ${r.status}`); return r.json(); };
  return {
    kind: 'server',
    async list(c) { return j(await fetch(`/api/store/${c}`)); },
    async put(c, id, doc) { await j(await fetch(`/api/store/${c}/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...doc, id }) })); },
    async del(c, id) { await j(await fetch(`/api/store/${c}/${encodeURIComponent(id)}`, { method: 'DELETE' })); }
  };
}

export async function connect({ subsidiary = 11, dnLevel = 32 } = {}) {
  /* 1. claude.ai artifact */
  if (window.claude?.use) {
    const [mcp, db] = await Promise.all([withTimeout(window.claude.use('mcp'), 11000), withTimeout(window.claude.use('db'), 11000)]);
    const store = db ? dbStore(db) : localStore();
    const catalog = {
      available: !!mcp, source: 'NetSuite (read-only)',
      async load() {
        if (!mcp) throw new Error('NetSuite isn’t available in this view. Open the page inside Claude.');
        const sql = CATALOG_SQL(subsidiary, dnLevel); let rows = [], page = 0, pages = 1;
        try {
          do {
            const res = await mcp.callTool(NS_SERVER, 'ns_runCustomSuiteQL', { sqlQuery: sql, description: 'CLIQ layout prototype: catalog (read-only)', pageSize: 1000, pageIndex: page }, { cache: { staleTime: 30 * 60 * 1000, gcTime: 30 * 60 * 1000 } });
            let p = res?.payload; if (typeof p === 'string') { try { p = JSON.parse(p); } catch { throw new Error('NetSuite: ' + p.slice(0, 200)); } }
            if (p?.error) throw new Error('NetSuite: ' + p.error);
            rows = rows.concat(p?.data || []); pages = p?.numberOfPages || 1; page++;
          } while (page < pages);
        } catch (e) { throw new Error(nsError(e)); }
        return rows.map(normItem).filter(r => !r.p?.legacy);
      }
    };
    return { mode: 'artifact', store, catalog };
  }
  /* 2. own server (Replit) */
  try {
    const h = await withTimeout(fetch('/api/health').then(r => r.ok ? r.json() : null).catch(() => null), 3000);
    if (h?.ok) {
      return {
        mode: 'server', store: serverStore(),
        catalog: {
          available: !!h.netsuite, source: h.netsuite ? 'NetSuite via server (read-only)' : 'No catalog configured on the server',
          async load() { const r = await fetch('/api/catalog'); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Catalog request failed (${r.status})`); return (await r.json()).map(normItem).filter(x => !x.p?.legacy); }
        }
      };
    }
  } catch { /* fall through */ }
  /* 3. offline */
  return { mode: 'offline', store: localStore(), catalog: { available: false, source: 'None (DN sheet prices only)', async load() { return []; } } };
}
