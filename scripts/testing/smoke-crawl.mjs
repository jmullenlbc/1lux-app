// Smoke crawl: signs in as each role and opens every page from docs/testing/routes.json in a real browser.
//
//   npm run test:crawl                 (dev server must be running: npm run dev:3000)
//
// Records per visit: HTTP status, where it ended up, console errors, failed API calls, blank renders.
// Then checks every internal link it saw. Writes docs/testing/smoke-results.md and smoke-results.json.
//
// Safety:
//   - Refuses app.ilcstudios.com outright, and any non-local address unless SMOKE_ALLOW_REMOTE=1.
//   - Only reads: page loads and GET requests. It never clicks a button or submits a form.
//   - Local run: makes one throwaway login per role in the local sqlite file and deletes them afterwards.
//   - Remote (staging) run: uses logins you provide, SMOKE_<ROLE>_EMAIL / SMOKE_<ROLE>_PASSWORD. Makes no accounts.
//
// Options (env): SMOKE_BASE_URL, SMOKE_ROLES=SUPER_ADMIN,USER, SMOKE_ONLY=/sales (path prefix),
//   SMOKE_API=0 (skip the GET API pass), SMOKE_INCLUDE_AI=1 (also GET routes that can call the AI),
//   SMOKE_HEADED=1, CHROME_PATH.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs', 'testing');
const env = k => {
  if (process.env[k]) return process.env[k];
  try {
    const line = readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).find(l => new RegExp(`^${k}\\s*=`).test(l));
    return line ? line.replace(/^[^=]+=\s*/, '').replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
};

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const host = new URL(BASE).hostname;
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || /\.(localhost|test)$/.test(host);
if (/ilcstudios\.com$/i.test(host)) { console.error(`Refusing to crawl ${host}: that is production.`); process.exit(2); }
if (!LOCAL && process.env.SMOKE_ALLOW_REMOTE !== '1') {
  console.error(`${host} is not a local address. Set SMOKE_ALLOW_REMOTE=1 and the SMOKE_<ROLE>_EMAIL / _PASSWORD logins to crawl a staging copy.`);
  process.exit(2);
}

const ALL_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'SALES_ADMIN', 'SALES', 'USER', 'CLIENT_VIEWER'];
const ROLES = (process.env.SMOKE_ROLES ? process.env.SMOKE_ROLES.split(',').map(s => s.trim()) : ALL_ROLES).filter(r => ALL_ROLES.includes(r));
const ONLY = process.env.SMOKE_ONLY || '';
const { pages, apis } = JSON.parse(readFileSync(join(OUT, 'routes.json'), 'utf8'));

// ── Accounts ─────────────────────────────────────────────────────────────────
const emailFor = r => `smoke-crawl-${r.toLowerCase().replace(/_/g, '-')}@1lux.test`;
let prisma = null;
async function makeAccounts() {
  if (!LOCAL) {
    return ROLES.map(role => ({ role, email: process.env[`SMOKE_${role}_EMAIL`], password: process.env[`SMOKE_${role}_PASSWORD`] }))
      .filter(a => a.email && a.password);
  }
  if (!env('DATABASE_URL').startsWith('file:')) {
    throw new Error('Local run expects the local sqlite database (DATABASE_URL=file:...). Not making logins in any other database.');
  }
  const { PrismaClient } = await import('@prisma/client');
  const bcrypt = (await import('bcryptjs')).default;
  prisma = new PrismaClient();
  const password = randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);
  for (const role of ROLES) {
    await prisma.user.upsert({
      where: { email: emailFor(role) },
      update: { role, isActive: true, passwordHash, mustChangePassword: false },
      create: { email: emailFor(role), name: `Smoke crawl ${role}`, role, isActive: true, passwordHash, mustChangePassword: false },
    });
  }
  return ROLES.map(role => ({ role, email: emailFor(role), password }));
}
async function removeAccounts() {
  if (!prisma) return;
  for (const role of ROLES) {
    // A throwaway login may have left rows behind (access events, saved layouts); turn it off if it cannot be removed.
    await prisma.user.delete({ where: { email: emailFor(role) } })
      .catch(() => prisma.user.update({ where: { email: emailFor(role) }, data: { isActive: false, passwordHash: null } }).catch(() => {}));
  }
  await prisma.$disconnect().catch(() => {});
}

// ── Sample records for [id] pages ────────────────────────────────────────────
const firstId = (json, field) => {
  const arrays = Array.isArray(json) ? [json] : Object.values(json || {}).filter(Array.isArray);
  const pick = x => (field ? x[field] : (x.id || x.slug || x.key));
  for (const a of arrays) { const hit = a.find(x => x && pick(x)); if (hit) return String(pick(hit)); }
  return null;
};
const SAMPLE_SOURCES = [
  [/^\/project\/\[id\]/, ['/api/projects']],
  [/^\/clients\/\[id\]/, ['/api/clients']],
  [/^\/manufacturers\/\[id\]/, ['/api/manufacturers']],
  [/^\/products\/\[id\]/, ['/api/products']],
  [/^\/sales-reps\/\[id\]/, ['/api/sales-reps']],
  [/^\/sales\/docs\/campaigns\/\[id\]/, ['/api/campaigns']],
  [/^\/sales\/docs\/lists\/\[id\]/, ['/api/campaign-lists']],
  [/^\/sales\/docs\/spaces\/\[spaceId\]/, ['/api/sales-docs/spaces']],
  [/^\/sales\/docs\/\[docId\]/, ['/api/sales-docs']],
  [/^\/sales\/events\/\[id\]/, ['/api/conferences']],
  [/^\/knowledge-base\/\[category\]/, ['/api/knowledge-base/categories', 'key']],
];
const FIXED = { '/dashboards/[section]': ['/dashboards/main', '/dashboards/sales', '/dashboards/meeting', '/dashboards/budget'] };

async function getJson(ctx, path) {
  try { const r = await ctx.request.get(BASE + path, { timeout: 60000 }); return r.ok() ? await r.json() : null; } catch { return null; }
}
async function resolveTargets(ctx) {
  const cache = new Map();
  const sample = async (path, field) => { if (!cache.has(path)) cache.set(path, firstId(await getJson(ctx, path), field)); return cache.get(path); };
  const targets = [];
  for (const p of pages) {
    if (ONLY && !p.url.startsWith(ONLY)) continue;
    if (!p.dynamic) { targets.push({ ...p, visit: p.url }); continue; }
    if (FIXED[p.url]) { FIXED[p.url].forEach(v => targets.push({ ...p, visit: v })); continue; }
    if (p.zone === 'token' || /\[token\]/.test(p.url)) {
      // No real token to hand: a made-up one must give a clean "not found", never a crash.
      targets.push({ ...p, visit: p.url.replace(/\[[^\]]+\]/g, 'smoke-crawl-no-such-token'), bogus: true });
      continue;
    }
    const src = SAMPLE_SOURCES.find(([re]) => re.test(p.url));
    let visit = null, why = 'no rule for this page yet (add it to SAMPLE_SOURCES)';
    if (src) {
      let id = await sample(src[1][0], src[1][1]);
      if (id && src[1][1] === 'key') id = id.toLowerCase();
      why = `no record to open (${src[1][0]} returned none)`;
      if (id) {
        visit = p.url.replace(/\[[^\]]+\]/, id);
        if (/\[coId\]/.test(visit)) {
          const co = await sample(`/api/projects/${id}/change-orders`);
          visit = co ? visit.replace('[coId]', co) : null;
          why = 'no change order on the sample job';
        }
      }
    } else if (p.zone === 'portal') why = 'needs a portal login (not covered yet)';
    targets.push(visit ? { ...p, visit } : { ...p, visit: null, skip: why });
  }
  return targets;
}

// ── One visit ────────────────────────────────────────────────────────────────
const NOISE = /Download the React DevTools|favicon|\[Fast Refresh\]|webpack-hmr|net::ERR_ABORTED|Failed to fetch RSC payload/;
async function visit(page, target) {
  const rec = { url: target.url, visit: target.visit, module: target.module, zone: target.zone, status: null, final: null,
    consoleErrors: [], apiFailures: [], denied: [], blank: false, crash: null, links: [], ms: 0 };
  const onConsole = m => {
    if (m.type() !== 'error' || NOISE.test(m.text())) return;
    const res = m.text().match(/Failed to load resource: the server responded with a status of (\d+)/);
    const where = (m.location()?.url || '').replace(BASE, '').split('?')[0];
    if (res && (res[1] === '401' || res[1] === '403')) { rec.denied.push(`${res[1]} ${where}`); return; } // "not for you" is an answer
    if (res && res[1] === '404' && target.bogus) return;                                                   // made-up token
    rec.consoleErrors.push((res ? `${res[1]} ${where}` : m.text()).slice(0, 300));
  };
  const onPageErr = e => rec.consoleErrors.push('uncaught: ' + String(e.message || e).slice(0, 300));
  const onResp = r => {
    const u = r.url();
    if (!u.startsWith(BASE + '/api/')) return;
    const s = r.status();
    if (target.bogus && s === 404) return;
    if (s >= 500 || s === 404 || s === 400) rec.apiFailures.push(`${s} ${r.request().method()} ${u.slice(BASE.length).split('?')[0]}`);
  };
  page.on('console', onConsole); page.on('pageerror', onPageErr); page.on('response', onResp);
  const t0 = Date.now();
  try {
    let resp;
    for (let attempt = 0; ; attempt++) {
      try { resp = await page.goto(BASE + target.visit, { waitUntil: 'domcontentloaded', timeout: 90000 }); break; }
      catch (e) {
        // The page before was still moving, or the dev server restarted: wait for it and try again (twice at most).
        if (attempt >= 2 || !/interrupted by another navigation|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET/.test(String(e.message))) throw e;
        rec.retried = true;
        for (let i = 0; i < 60; i++) {
          if (await fetch(BASE + '/login', { redirect: 'manual' }).then(r => r.status < 500, () => false)) break;
          await new Promise(r => setTimeout(r, 2000));
        }
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      }
    }
    rec.status = resp ? resp.status() : null;
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    rec.final = page.url().slice(BASE.length) || '/';
    const text = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')).trim();
    rec.blank = text.length < 15;
    const crash = text.match(/Application error: a (client|server)-side exception[^\n]*|Unhandled Runtime Error[^\n]*|Internal Server Error|This page could not be found/);
    if (crash) rec.crash = crash[0].slice(0, 160);
    rec.links = await page.evaluate(() => [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href'))).catch(() => []);
  } catch (e) {
    rec.crash = 'did not load: ' + String(e.message || e).split('\n')[0].slice(0, 200);
  }
  rec.ms = Date.now() - t0;
  page.off('console', onConsole); page.off('pageerror', onPageErr); page.off('response', onResp);
  rec.consoleErrors = [...new Set(rec.consoleErrors)].slice(0, 8);
  rec.apiFailures = [...new Set(rec.apiFailures)].slice(0, 8);
  rec.denied = [...new Set(rec.denied)].slice(0, 8);
  return rec;
}

// What counts as a problem. A bogus token giving 404 is the right answer; a sign-in redirect is recorded, not failed.
const verdict = (r, target) => {
  const redirected = r.final && r.final.split('?')[0] !== r.visit.split('?')[0];
  const out = [];
  if (r.status >= 500) out.push(`HTTP ${r.status}`);
  if (r.crash && !(target.bogus && /could not be found/.test(r.crash))) out.push(r.crash);
  if (r.status === 404 && !target.bogus) out.push('HTTP 404');
  if (r.blank) out.push('blank page');
  if (r.apiFailures.some(a => a.startsWith('5'))) out.push('API 5xx');
  if (r.consoleErrors.length) out.push(`${r.consoleErrors.length} console error${r.consoleErrors.length > 1 ? 's' : ''}`);
  return { problems: out, redirected };
};

// ── Run ──────────────────────────────────────────────────────────────────────
const up = await fetch(BASE + '/login', { redirect: 'manual' }).then(r => r.status < 500, () => false);
if (!up) { console.error(`No app answering at ${BASE}. Start it first (npm run dev:3000).`); process.exit(2); }

const accounts = await makeAccounts();
if (!accounts.length) { console.error('No logins to crawl with.'); process.exit(2); }
const chromePath = env('CHROME_PATH');
const browser = await chromium.launch({
  headless: process.env.SMOKE_HEADED !== '1',
  ...(chromePath && existsSync(chromePath) ? { executablePath: chromePath } : { channel: 'chrome' }),
});

const results = [];       // { role, ...rec, problems, redirected }
const skipped = [];       // pages nobody could open
const linkCheck = [];     // { role, link, status, from }
const apiCheck = [];      // { role, url, status }
const loginFailures = [];
const started = new Date();

try {
  for (const acct of accounts) {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1366, height: 850 } });
    const login = await ctx.request.post(BASE + '/api/auth/login', { data: { email: acct.email, password: acct.password } });
    if (!login.ok()) { loginFailures.push(`${acct.role}: HTTP ${login.status()}`); await ctx.close(); continue; }
    const targets = await resolveTargets(ctx);
    const page = await ctx.newPage();
    const seen = new Map(); // link -> first page it was seen on
    let n = 0;
    for (const t of targets) {
      if (!t.visit) { if (!skipped.some(s => s.url === t.url && s.role === acct.role)) skipped.push({ role: acct.role, url: t.url, module: t.module, why: t.skip }); continue; }
      const rec = await visit(page, t);
      const v = verdict(rec, t);
      results.push({ role: acct.role, ...rec, ...v, bogus: !!t.bogus });
      for (const l of rec.links) { const k = l.split('#')[0]; if (k && !seen.has(k)) seen.set(k, t.visit); }
      n++;
      process.stdout.write(`\r${acct.role.padEnd(14)} ${String(n).padStart(3)}/${targets.filter(x => x.visit).length} ${t.visit.slice(0, 60).padEnd(60)}`);
    }
    process.stdout.write('\n');

    // Links: every internal link seen that the crawl did not already open as a page.
    const opened = new Set(results.filter(r => r.role === acct.role).map(r => r.visit.split('?')[0]));
    for (const [link, from] of seen) {
      const path = link.split('?')[0];
      if (opened.has(path) || /^\/api\/auth\/logout/.test(path)) continue;
      if (/^\/api\//.test(path) && !/\/(file|download|pdf|export)/.test(path)) continue; // API links are covered below
      try {
        const r = await ctx.request.get(BASE + link, { maxRedirects: 5, timeout: 60000 });
        if (r.status() >= 400) linkCheck.push({ role: acct.role, link, status: r.status(), from });
      } catch (e) { linkCheck.push({ role: acct.role, link, status: 'failed', from }); }
    }

    // GET pass over API routes with no [param]: only 5xx is a finding (401/403/404 are answers).
    if (process.env.SMOKE_API !== '0') {
      for (const a of apis) {
        if (a.dynamic || !a.methods.includes('GET')) continue;
        if (ONLY && !a.url.startsWith('/api' + ONLY)) continue;
        if (/^\/api\/(cron|auth\/logout|bot\/process|e\/)/.test(a.url)) continue;          // jobs and tracking pixels
        if (/\/(poll|export|run|sync|send)\b/.test(a.url)) continue;                       // GETs that do work
        if (a.gates.includes('ai') && process.env.SMOKE_INCLUDE_AI !== '1') continue;
        try {
          const r = await ctx.request.get(BASE + a.url, { timeout: 60000 });
          apiCheck.push({ role: acct.role, url: a.url, module: a.module, status: r.status() });
        } catch { apiCheck.push({ role: acct.role, url: a.url, module: a.module, status: 'failed' }); }
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  await removeAccounts();
}

// ── Report ───────────────────────────────────────────────────────────────────
const bad = results.filter(r => r.problems.length);
const mods = [...new Set(pages.map(p => p.module))].sort();
const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const L = [];
L.push('# Smoke crawl results', '',
  `_Run ${started.toISOString().slice(0, 16).replace('T', ' ')} UTC against \`${BASE}\` (${LOCAL ? 'local' : 'remote'}), ${Math.round((Date.now() - started) / 1000)} s. Made by \`npm run test:crawl\`; re-running overwrites this file._`, '',
  `Roles: ${accounts.map(a => a.role).join(', ')}${loginFailures.length ? `. **Sign-in failed:** ${loginFailures.join('; ')}` : ''}.`,
  `Read-only: page loads and GET requests. No button was clicked and no form sent, so this proves pages open, not that features work.`, '',
  `**${results.length} page visits, ${bad.length} with a problem.** ${skipped.length ? `${new Set(skipped.map(s => s.url)).size} pages could not be opened (no record or no login), listed below. ` : ''}${linkCheck.length} broken links. ${apiCheck.filter(a => a.status >= 500 || a.status === 'failed').length} GET API calls failed with 5xx (of ${apiCheck.length}).`, '',
  '## Per module', '', '| Module | Pages | Visits | Problem visits | Pages with a problem | Not opened | API 5xx |', '|:-|-:|-:|-:|-:|-:|-:|');
for (const m of mods) {
  const rs = results.filter(r => r.module === m);
  L.push(`| ${m} | ${pages.filter(p => p.module === m).length} | ${rs.length} | ${rs.filter(r => r.problems.length).length} | ${new Set(rs.filter(r => r.problems.length).map(r => r.url)).size} | ${new Set(skipped.filter(s => s.module === m).map(s => s.url)).size} | ${apiCheck.filter(a => a.module === m && (a.status >= 500 || a.status === 'failed')).length} |`);
}
L.push('', '## Per role', '', '| Role | Visits | Problems | Sent elsewhere (redirect) | Slowest page |', '|:-|-:|-:|-:|:-|');
for (const a of accounts) {
  const rs = results.filter(r => r.role === a.role);
  const slow = [...rs].sort((x, y) => y.ms - x.ms)[0];
  L.push(`| ${a.role} | ${rs.length} | ${rs.filter(r => r.problems.length).length} | ${rs.filter(r => r.redirected).length} | ${slow ? `\`${slow.visit}\` ${(slow.ms / 1000).toFixed(1)} s` : ''} |`);
}

L.push('', '## Problems', '');
if (!bad.length) L.push('None.', '');
else {
  const byPage = new Map();
  for (const r of bad) { const k = r.visit; if (!byPage.has(k)) byPage.set(k, []); byPage.get(k).push(r); }
  L.push('| Page | Module | Roles | What | Detail |', '|:-|:-|:-|:-|:-|');
  for (const [pageUrl, rs] of [...byPage].sort()) {
    const what = [...new Set(rs.flatMap(r => r.problems))].join('; ');
    const detail = [...new Set(rs.flatMap(r => [...r.apiFailures, ...r.consoleErrors]))].slice(0, 4).map(d => esc(d.slice(0, 200))).join('<br>');
    L.push(`| \`${pageUrl}\` | ${rs[0].module} | ${rs.length === accounts.length ? 'all' : rs.map(r => r.role).join(', ')} | ${esc(what)} | ${detail} |`);
  }
  L.push('');
}

L.push('## Broken links', '');
if (!linkCheck.length) L.push('None found on the pages opened.', '');
else {
  const by = new Map();
  for (const l of linkCheck) { const k = `${l.link}|${l.status}`; if (!by.has(k)) by.set(k, { ...l, roles: [] }); by.get(k).roles.push(l.role); }
  L.push('| Link | Status | Seen on | Roles |', '|:-|:-|:-|:-|', ...[...by.values()].map(l => `| \`${esc(l.link)}\` | ${l.status} | \`${l.from}\` | ${l.roles.length === accounts.length ? 'all' : l.roles.join(', ')} |`), '');
}

L.push('## GET API calls that failed (5xx)', '');
const api5 = apiCheck.filter(a => a.status >= 500 || a.status === 'failed');
if (!api5.length) L.push(apiCheck.length ? 'None.' : 'Not run.', '');
else {
  const by = new Map();
  for (const a of api5) { const k = `${a.url}|${a.status}`; if (!by.has(k)) by.set(k, { ...a, roles: [] }); by.get(k).roles.push(a.role); }
  L.push('| Route | Status | Module | Roles |', '|:-|:-|:-|:-|', ...[...by.values()].map(a => `| \`${a.url}\` | ${a.status} | ${a.module} | ${a.roles.length === accounts.length ? 'all' : a.roles.join(', ')} |`), '');
}

L.push('## Pages not opened', '');
if (!skipped.length) L.push('None.', '');
else {
  const by = new Map();
  for (const s of skipped) { const k = `${s.url}|${s.why}`; if (!by.has(k)) by.set(k, { ...s, roles: [] }); by.get(k).roles.push(s.role); }
  L.push('| Page | Module | Why | Roles |', '|:-|:-|:-|:-|', ...[...by.values()].map(s => `| \`${s.url}\` | ${s.module} | ${s.why} | ${s.roles.length === accounts.length ? 'all' : s.roles.join(', ')} |`), '');
}

if (accounts.some(a => a.role === 'CLIENT_VIEWER')) {
  const cvOpen = results.filter(r => r.role === 'CLIENT_VIEWER' && r.zone === 'staff' && !r.redirected && r.status === 200);
  L.push('## Staff pages a Client Viewer can open', '',
    '_The page answered 200 and was not sent elsewhere. "Refused calls" are data requests the server turned down (401/403). A page with none may be showing staff data and needs a look by hand._', '');
  if (!cvOpen.length) L.push('None.', '');
  else L.push('| Page | Module | Refused calls |', '|:-|:-|:-|',
    ...cvOpen.map(r => `| \`${r.visit}\` | ${r.module} | ${r.denied.length ? r.denied.map(d => `\`${d}\``).join(' ') : '**none**'} |`), '');
}

L.push('## Where each role was sent elsewhere', '', '_A redirect is the app saying "not for you" or forwarding to the right page. Listed so the access rules can be checked against Mike\'s USERS_ROLES_AND_PRIVILEGES.md._', '');
const red = new Map();
for (const r of results.filter(r => r.redirected)) { const k = `${r.visit}|${r.final.split('?')[0]}`; if (!red.has(k)) red.set(k, { visit: r.visit, final: r.final.split('?')[0], roles: [] }); red.get(k).roles.push(r.role); }
if (!red.size) L.push('None.', '');
else L.push('| Page | Ended at | Roles |', '|:-|:-|:-|', ...[...red.values()].sort((a, b) => a.visit.localeCompare(b.visit)).map(r => `| \`${r.visit}\` | \`${r.final}\` | ${r.roles.length === accounts.length ? 'all' : r.roles.join(', ')} |`), '');

writeFileSync(join(OUT, 'smoke-results.md'), L.join('\n') + '\n');
writeFileSync(join(OUT, 'smoke-results.json'), JSON.stringify({ base: BASE, started, roles: accounts.map(a => a.role), loginFailures, results: results.map(({ links, ...r }) => r), skipped, linkCheck, apiCheck }, null, 1) + '\n');
console.log(`${results.length} visits, ${bad.length} problems, ${linkCheck.length} broken links, ${api5.length} API 5xx, ${new Set(skipped.map(s => s.url)).size} pages not opened`);
console.log('Wrote docs/testing/smoke-results.md');
process.exit(loginFailures.length ? 1 : 0);
