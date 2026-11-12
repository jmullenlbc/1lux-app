// Code inventory for testing (read-only: reads src/ and prisma/schema.prisma, writes docs/testing/).
//
//   npm run test:inventory
//
// Writes:
//   docs/testing/routes.json     every page and API route with its module (the smoke crawl reads this)
//   docs/testing/inventory.md    docs/testing/inventory-findings.md (hand-written) + the generated tables
//
// Nothing here starts the app or opens a database.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const APP = join(SRC, 'app');
const OUT = join(ROOT, 'docs', 'testing');

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const posix = p => p.split(sep).join('/');
const read = p => readFileSync(p, 'utf8');

// ── Modules. First match wins; names follow Mike's MODULE_DOCS_INDEX.md. ─────
const MODULE_RULES = [
  [/change-orders|\/share\/co/, 'Change orders'],
  [/bid-leveling|bid-comparison|spec-swaps|peer-review/, 'Bid leveling and comparison'],
  [/rfqs?\b|rfq-freight|sales-reps|manufacturer-reps|\/offices/, 'RFQs and sales reps'],
  [/ship-schedules?|shipments/, 'Ship schedule'],
  [/unit-selections|decorative/, 'Unit selections'],
  [/fixture-schedule|drawing|placed-fixtures|annotations|unit-matrix|\/areas|\/site\b|rfi|share\/fixture|share\/standards|lpd|code-check/, 'Drawings, fixture schedule, compliance'],
  [/fixture-library|\/products|\/manufacturers|master-types/, 'Products and fixture library'],
  [/^\/(api\/)?portal/, 'Company portal'],
  [/conceptual_budget|\/intake|^\/(api\/)?e\//, 'Public conceptual budget and intake'],
  [/market-intel/, 'Market Intel'],
  [/sales\/docs|sales-docs|share\/docs|campaign/, 'Sales Docs and campaigns'],
  [/sales\/events|conference/, 'Conferences and memberships'],
  [/expenses|annual-budgets/, 'Expenses'],
  [/sales\/desk|\/tasks|task-tags/, 'My Desk and tasks'],
  [/automation|\/bot|bot-queue|\/voice|signature/, 'Automation and bot'],
  [/proposal/, 'Proposals'],
  [/\/notes|meeting-notes|note-action/, 'Notes'],
  [/^\/(api\/)?email|calendar|correspondence/, 'Email and calendar'],
  [/^\/api\/cron|notification|\/alerts|alert-feedback/, 'Notifications and scheduled jobs'],
  [/dashboards?|^\/home|sales\/meeting|\/figures|first-project-cost/, 'Dashboards'],
  [/knowledge|\/search|\/archive|\/history/, 'Search, archive, knowledge base'],
  [/^\/(api\/)?crm|\/clients|contact-tags|\/tags|check-ins|visitors|sales\/activity|introductions|\/pipeline|field-suggestions|cadence/, 'CRM'],
  [/pricing|calibration|\/qc|budget-qc|verification/, 'Pricing, QC, verification'],
  [/^\/(api\/)?admin|\/users?\b|^\/api\/auth|^\/(login|register|change-password)|\/mcp|system-config|business-units|roadmap|uploads|anthropic-models|link-preview|sales-tax/, 'Admin and platform'],
  [/^\/(api\/)?projects?|my-jobs|pre-con|^\/open/, 'Project hub, bid matrix, budgets'],
];
const moduleOf = url => (MODULE_RULES.find(([re]) => re.test(url)) || [, 'Other'])[1];

const MODEL_RULES = [
  [/^ChangeOrder/, 'Change orders'],
  [/^Submittal/, 'Project hub, bid matrix, budgets'],
  [/^Conceptual/, 'Public conceptual budget and intake'],
  [/^(Bid[A-Z]|Bid$|BrandGrade)/, 'Bid leveling and comparison'],
  [/^RFI/, 'Drawings, fixture schedule, compliance'],
  [/^(DesignStandard|ILCSpec|StandardsAnswer)/, 'Client standards and playbook'],
  [/^(SchedulingRule|MessageTemplate|Activity(Exclusion|Classification)Rule|RuleProposal|SuppressionRule)/, 'Automation and bot'],
  [/^(SignalFeedback|MacroStat)/, 'Market Intel'],
  [/^(MeetingBrief|Chat)/, 'Dashboards'],
  [/^(Pipeline|CrmMerge)/, 'CRM'],
  [/^RepEmail/, 'RFQs and sales reps'],
  [/^AppSetting/, 'Admin and platform'],
  [/^(Rfq|SalesRep|ManufacturerRep|OurOffice|ProjectRepPick)/, 'RFQs and sales reps'],
  [/^(BidLevel|BidComparison|SpecSwap|PeerReview|Leveling)/, 'Bid leveling and comparison'],
  [/^(Shipment|ShipSchedule|WarehouseRelease|ManufacturerDelivery)/, 'Ship schedule'],
  [/^(UnitSelection|Decorative|LookBoard)/, 'Unit selections'],
  [/^(FixtureSchedule|Drawing|PlacedFixture|Annotation|UnitMatrix|Takeoff|Rfi|Symbol|Sheet|Site|Compliance|Lpd|Code)/, 'Drawings, fixture schedule, compliance'],
  [/^(Product|Manufacturer|FixtureLibrary|MasterType|Fixture)/, 'Products and fixture library'],
  [/^Portal/, 'Company portal'],
  [/^(Intake|PublicBudget|WebBudget|Questionnaire|PublicVisitor|Visitor)/, 'Public conceptual budget and intake'],
  [/^(Market|Permit|LandOffer|Forecast)/, 'Market Intel'],
  [/^(SalesDoc|Campaign|EmailList)/, 'Sales Docs and campaigns'],
  [/^Conference/, 'Conferences and memberships'],
  [/^(SalesExpense|ExpenseReceipt|SalesAnnualBudget)/, 'Expenses'],
  [/^(SalesTask|Task|Desk)/, 'My Desk and tasks'],
  [/^(Automation|Bot|Trigger|Voice|Knowledge|Agent|EmailTemplate|ClassificationRule|ExclusionRule)/, 'Automation and bot'],
  [/^Proposal/, 'Proposals'],
  [/^(Note|SalesNote|MeetingNote)/, 'Notes'],
  [/^(Email|Calendar|Correspondence|Mail)/, 'Email and calendar'],
  [/^(Notification|Alert|Digest)/, 'Notifications and scheduled jobs'],
  [/^(Dashboard|Widget|Verification)/, 'Dashboards'],
  [/^(RecordHistory|Archive|Search|Kb)/, 'Search, archive, knowledge base'],
  [/^(Client|Contact|Company|Tag|CheckIn|Cadence|Introduction|Relationship|Playbook|Duplicate|Merge)/, 'CRM'],
  [/^(Pricing|Calibration|BudgetQC|Qc|QC|MasterPric)/, 'Pricing, QC, verification'],
  [/^(User|Mcp|SystemConfig|BusinessUnit|Department|Roadmap|BugReport|Upload|RateLimit|ParkedJob|AiUsage|Usage)/, 'Admin and platform'],
  [/^(Project|DesignBidMatrix|Budget|Contract)/, 'Project hub, bid matrix, budgets'],
];
const modelModule = name => (MODEL_RULES.find(([re]) => re.test(name)) || [, 'Other'])[1];

// ── Pages ────────────────────────────────────────────────────────────────────
const toUrl = file => {
  const rel = posix(relative(APP, file)).replace(/\/?(page|route)\.(jsx?|tsx?)$/, '');
  const url = '/' + rel.split('/').filter(s => s && !/^\(.*\)$/.test(s)).join('/');
  return url === '/' ? '/' : url.replace(/\/$/, '');
};
const zoneOf = file => {
  const rel = posix(relative(APP, file));
  if (rel.startsWith('(app)/')) return 'staff';
  if (rel.startsWith('(auth)/')) return 'auth';
  if (rel.startsWith('portal/')) return 'portal';
  if (rel.startsWith('share/') || rel.startsWith('e/')) return 'token';
  if (rel.startsWith('conceptual_budget')) return 'public';
  return 'root';
};

const appFiles = walk(APP);
const pages = appFiles.filter(f => /[\\/]page\.(jsx?|tsx?)$/.test(f)).map(f => {
  const src = read(f);
  const url = toUrl(f);
  return {
    url, zone: zoneOf(f), module: moduleOf(url), file: posix(relative(ROOT, f)),
    dynamic: /\[/.test(url),
    forceDynamic: /export const dynamic\s*=\s*['"]force-dynamic['"]/.test(src),
    client: /^\s*['"]use client['"]/.test(src),
  };
}).sort((a, b) => a.url.localeCompare(b.url));

// ── API routes ───────────────────────────────────────────────────────────────
const GUARDS = ['requireSuperAdmin', 'requireILCAdmin', 'requireAdmin', 'requireSalesAdmin', 'requireStaff',
  'requirePermission', 'requireIntakeReviewer', 'requireSalesDocsUser', 'requireSourceAdmin', 'requireAuth',
  'requirePortalAuth', 'requirePublicBudgetAccess', 'requirePass', 'guardLeveling', 'getSession', 'getPortalSession'];
const GATES = {
  ai: /@anthropic-ai\/sdk|anthropicKey|getAnthropic|aiModels|callClaude|parkedJob/,
  email: /client-ses|sendEmail|sendMail|SESClient|@\/lib\/email|@\/lib\/notify|notify\(/,
  s3: /client-s3|s3-request-presigner|projectFileStorage|qcStorage|S3Client/,
  cron: /CRON_SECRET/,
  pdf: /puppeteer|@sparticuz\/chromium|@\/lib\/pdf['"]/,
};
const libCache = new Map();
const resolveLib = spec => {
  const base = join(SRC, spec.replace(/^@\//, ''));
  for (const c of [base, base + '.js', base + '.mjs', base + '.jsx', join(base, 'index.js')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
};
const libText = spec => {
  if (!libCache.has(spec)) { const f = resolveLib(spec); libCache.set(spec, f ? read(f) : ''); }
  return libCache.get(spec);
};

const apis = appFiles.filter(f => /[\\/]route\.(js|ts)$/.test(f)).map(f => {
  const src = read(f);
  const url = toUrl(f);
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter(m =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b`).test(src));
  const guards = GUARDS.filter(g => new RegExp(`\\b${g}\\(`).test(src));
  const imports = [...src.matchAll(/from\s+['"](@\/lib\/[^'"]+)['"]/g)].map(m => m[1]);
  const hop = src + '\n' + imports.map(libText).join('\n');
  const gates = Object.entries(GATES).filter(([, re]) => re.test(hop)).map(([k]) => k);
  return {
    url, module: moduleOf(url), file: posix(relative(ROOT, f)), methods, guards, gates,
    dynamic: /\[/.test(url),
    hardDelete: /\.(delete|deleteMany)\(/.test(src),
    unguardedJson: /await\s+(request|req)\.json\(\)(?!\s*\.catch)/.test(src) && !/try\s*\{[^}]*await\s+(request|req)\.json\(\)/s.test(src),
  };
}).sort((a, b) => a.url.localeCompare(b.url));

// ── Server actions ───────────────────────────────────────────────────────────
const srcFiles = walk(SRC).filter(f => /\.(jsx?|mjs|tsx?)$/.test(f));
const srcText = new Map(srcFiles.map(f => [f, read(f)]));
const serverActions = [...srcText].filter(([, t]) => /^\s*['"]use server['"]/m.test(t)).map(([f]) => posix(relative(ROOT, f)));

// ── Prisma models ────────────────────────────────────────────────────────────
const schema = read(join(ROOT, 'prisma', 'schema.prisma'));
const allSrc = [...srcText.values()].join('\n');
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(m => {
  const name = m[1];
  const fields = m[2].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('@@'));
  const camel = name[0].toLowerCase() + name.slice(1);
  return {
    name, module: modelModule(name), fields: fields.length,
    archivable: /\barchivedAt\b/.test(m[2]),
    usedInSrc: new RegExp(`\\.${camel}\\b`).test(allSrc),
  };
});

// ── Internal links that point at no page ─────────────────────────────────────
const pageRes = pages.map(p => new RegExp('^' + p.url.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+') + '$'));
const extra = [/^\/api\//, /^\/start$/, /^\/_next/, /^\/uploads/, /\.(png|svg|ico|pdf|json|webmanifest|mjs|js|css|jpg|txt|xml)$/];
const badLinks = new Map();
for (const [f, t] of srcText) {
  const found = [
    ...t.matchAll(/href=\{?["'`](\/[^"'`$?#{}\s]*)(?=["'`?#])/g),
    ...t.matchAll(/router\.(?:push|replace)\(\s*["'`](\/[^"'`$?#{}\s]*)["'`]/g),
    ...t.matchAll(/redirect\(\s*["'`](\/[^"'`$?#{}\s]*)["'`]/g),
  ].map(m => m[1].replace(/\/$/, '') || '/');
  for (const link of new Set(found)) {
    if (extra.some(re => re.test(link)) || pageRes.some(re => re.test(link))) continue;
    if (!badLinks.has(link)) badLinks.set(link, []);
    badLinks.get(link).push(posix(relative(ROOT, f)));
  }
}

// ── TODO / unfinished markers in code ────────────────────────────────────────
const MARK = /\b(TODO|FIXME|HACK|XXX)\b|not tried in production|not tried on a real|coming soon|not built yet|not wired|stub(bed)?\b/i;
const markers = [];
for (const [f, t] of srcText) {
  t.split('\n').forEach((line, i) => {
    if (!MARK.test(line) || /placeholder=/.test(line)) return;
    const rel = posix(relative(ROOT, f));
    markers.push({ file: rel, line: i + 1, text: line.trim().slice(0, 160), module: moduleOf('/' + rel.replace(/^src\/(app\/)?(\(app\)\/)?/, '')) });
  });
}

// ── Write ────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'routes.json'), JSON.stringify({ pages, apis }, null, 1) + '\n');

const byModule = {};
const bucket = m => (byModule[m] ||= { pages: [], apis: [], models: [], markers: [] });
pages.forEach(p => bucket(p.module).pages.push(p));
apis.forEach(a => bucket(a.module).apis.push(a));
models.forEach(m => bucket(m.module).models.push(m));
markers.forEach(m => bucket(m.module).markers.push(m));
const names = Object.keys(byModule).sort();

const L = [];
const findings = join(OUT, 'inventory-findings.md');
if (existsSync(findings)) L.push(read(findings).trimEnd(), '');
L.push('---', '', '# Generated code inventory', '',
  '_Made by `npm run test:inventory` (scripts/testing/inventory.mjs) from the code on disk. Do not edit below this line; edit `inventory-findings.md` instead._', '',
  `Totals: **${pages.length} pages**, **${apis.length} API route files** (${apis.reduce((n, a) => n + a.methods.length, 0)} handlers), **${serverActions.length} server actions**, **${models.length} Prisma models**.`, '',
  '## Counts per module', '',
  '| Module | Pages | API routes | Handlers | Models | AI | Email | S3 | Cron | Code markers |', '|:-|-:|-:|-:|-:|-:|-:|-:|-:|-:|');
for (const n of names) {
  const b = byModule[n]; const g = k => b.apis.filter(a => a.gates.includes(k)).length;
  L.push(`| ${n} | ${b.pages.length} | ${b.apis.length} | ${b.apis.reduce((s, a) => s + a.methods.length, 0)} | ${b.models.length} | ${g('ai')} | ${g('email')} | ${g('s3')} | ${g('cron')} | ${b.markers.length} |`);
}
L.push('', '_AI / Email / S3 / Cron = API routes whose file, or a `@/lib` file it imports directly, uses that service (one hop; deeper use is not counted)._', '');

L.push('## Checks from the code', '');
const noGuard = apis.filter(a => !a.guards.length);
L.push(`### API routes with no auth helper in the file (${noGuard.length})`, '', 'Public by design or guarded another way (cron secret, token, bearer). Each needs a look.', '',
  '| Route | Methods | Uses |', '|:-|:-|:-|', ...noGuard.map(a => `| \`${a.url}\` | ${a.methods.join(' ')} | ${a.gates.join(', ')} |`), '');
const noDyn = pages.filter(p => p.zone === 'staff' && !p.forceDynamic && !p.client);
L.push(`### Staff pages (server components) without \`force-dynamic\` (${noDyn.length})`, '', ...(noDyn.length ? noDyn.map(p => `- \`${p.url}\``) : ['None.']), '');
L.push(`### Links in code that match no page (${badLinks.size})`, '', ...(badLinks.size ? ['| Link | Used in |', '|:-|:-|', ...[...badLinks].sort().map(([l, fs]) => `| \`${l}\` | ${[...new Set(fs)].slice(0, 3).join(', ')}${fs.length > 3 ? ` +${fs.length - 3}` : ''} |`)] : ['None.']), '');
const unused = models.filter(m => !m.usedInSrc);
L.push(`### Models never read or written from \`src\` (${unused.length})`, '', unused.length ? unused.map(m => `\`${m.name}\``).join(', ') : 'None.', '');
L.push(`### Hard deletes: ${apis.filter(a => a.hardDelete).length} route files call \`.delete(\` / \`.deleteMany(\``, '',
  `### JSON body read without a guard (rough check): ${apis.filter(a => a.unguardedJson).length} route files`, '');

for (const n of names) {
  const b = byModule[n];
  L.push(`## ${n}`, '');
  if (b.pages.length) L.push('**Pages**', '', '| URL | Zone | Notes |', '|:-|:-|:-|',
    ...b.pages.map(p => `| \`${p.url}\` | ${p.zone} | ${[p.client ? 'client page' : '', p.zone === 'staff' && !p.forceDynamic && !p.client ? 'no force-dynamic' : ''].filter(Boolean).join(', ')} |`), '');
  if (b.apis.length) L.push('**API routes**', '', '| Route | Methods | Guard | Uses | Flags |', '|:-|:-|:-|:-|:-|',
    ...b.apis.map(a => `| \`${a.url}\` | ${a.methods.join(' ')} | ${a.guards.join(', ') || '**none**'} | ${a.gates.join(', ')} | ${[a.hardDelete ? 'hard delete' : '', a.unguardedJson ? 'json unguarded' : ''].filter(Boolean).join(', ')} |`), '');
  if (b.models.length) L.push('**Models** (' + b.models.length + '): ' + b.models.map(m => `\`${m.name}\`${m.usedInSrc ? '' : ' (unused)'}`).join(', '), '');
  if (b.markers.length) L.push('**Code markers**', '', ...b.markers.slice(0, 40).map(m => `- \`${m.file}:${m.line}\` ${m.text.replace(/\|/g, '\\|')}`), ...(b.markers.length > 40 ? [`- … ${b.markers.length - 40} more`] : []), '');
}
if (serverActions.length) L.push('## Server actions', '', ...serverActions.map(f => `- \`${f}\``), '');
else L.push('## Server actions', '', 'None. No file in `src` has a `"use server"` directive; every write goes through `src/app/api/**/route.js`.', '');

writeFileSync(join(OUT, 'inventory.md'), L.join('\n') + '\n');
console.log(`pages ${pages.length}, api routes ${apis.length}, models ${models.length}, server actions ${serverActions.length}`);
console.log(`no-guard routes ${noGuard.length}, links to no page ${badLinks.size}, unused models ${unused.length}, markers ${markers.length}`);
console.log('modules:', names.map(n => `${n} ${byModule[n].pages.length}/${byModule[n].apis.length}/${byModule[n].models.length}`).join(' | '));
