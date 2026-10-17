'use client';
import { useState, useMemo } from 'react';
import { TAB_ACTIVE, TAB_INACTIVE } from '@/components/ui/tokens';

const CATEGORY_META = {
  database: { label: 'Database',      color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  auth:     { label: 'Auth',          color: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  infra:    { label: 'Infrastructure',color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  api:      { label: 'API',           color: 'bg-green-100 text-green-700',dot: 'bg-green-500' },
  ui:       { label: 'UI',            color: 'bg-pink-100 text-pink-700',     dot: 'bg-pink-500' },
  deps:     { label: 'Dependencies',  color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
  fix:      { label: 'Fix',           color: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
  feat:     { label: 'Feature',       color: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-500' },
  other:    { label: 'Other',         color: 'bg-slate-100 text-slate-500',   dot: 'bg-slate-400' },
};

const STACK = [
  { label: 'Framework',        value: 'Next.js 14',          note: 'App Router · SSR · Server Components',   color: 'orange' },
  { label: 'Hosting',          value: 'AWS Amplify SSR',      note: 'Auto-deploys on push to main',           color: 'orange' },
  { label: 'Styling',          value: 'Tailwind CSS',         note: 'Utility-first, no component library',   color: 'slate' },
  { label: 'ORM',              value: 'Prisma 5',             note: 'Schema-first · typed queries',           color: 'slate' },
  { label: 'DB (Local)',        value: 'SQLite',               note: 'dev.db · no Docker needed',              color: 'slate' },
  { label: 'DB (Production)',   value: 'PostgreSQL',           note: 'AWS RDS via Amplify env vars',           color: 'slate' },
  { label: 'Auth',             value: 'JWT (jose)',            note: 'httpOnly cookie · 7-day expiry',         color: 'slate' },
  { label: 'AI',               value: 'Anthropic Claude API', note: '@anthropic-ai/sdk · model per job (src/lib/aiModels.js)',  color: 'slate' },
  { label: 'Language',         value: 'JavaScript (JSX)',      note: 'No TypeScript, plain .js/.jsx',         color: 'slate' },
  { label: 'Version Control',  value: 'GitHub',               note: 'OperationsILC/ilc-lighting-app',         color: 'slate' },
];

const CRITICAL_RULES = [
  { rule: 'force-dynamic on every (app)/ page',               why: 'Without it Next.js static-renders at build time. cookies() throws. Build script auto-fails if missing.' },
  { rule: 'Never commit provider = "postgresql"',              why: 'Breaks local dev. Amplify patches this with sed during build.' },
  { rule: 'DATABASE_URL in next.config.mjs env block',        why: 'Amplify Lambda can\'t read runtime env for webpack-bundled code. All API routes return "Network error" without it.' },
  { rule: 'JSON fields stored as strings in SQLite',           why: 'JSON.stringify before write, JSON.parse after read for: permissions, rateSnapshot, milestoneSplit, tags.' },
  { rule: 'Always use npm run dev:3000',                       why: 'Kills port 3000 first. npm run dev directly causes ghost-process errors.' },
  { rule: 'prisma db push --accept-data-loss in Amplify',     why: 'Intentional, may drop columns. Test schema changes locally first. No rollback.' },
];

const DIR_TREE = [
  { indent: 0, name: 'src/',                  desc: '' },
  { indent: 1, name: 'app/(app)/',            desc: 'Authenticated routes, layout enforces auth' },
  { indent: 2, name: 'admin/',               desc: 'User mgmt, changelog, pricing, KB, tech stack' },
  { indent: 2, name: 'project/[id]/',        desc: 'Project hub, all project tabs' },
  { indent: 2, name: 'crm/',                 desc: 'Pipeline, projects, notes' },
  { indent: 2, name: 'sales/',               desc: 'Proposals, templates, automation' },
  { indent: 2, name: 'market-intel/',        desc: 'Market Intelligence signals' },
  { indent: 1, name: 'app/api/',             desc: 'All route handlers, data mutations' },
  { indent: 1, name: 'app/portal/',          desc: 'Client-facing portal (CLIENT_VIEWER role)' },
  { indent: 1, name: 'lib/',                 desc: '' },
  { indent: 2, name: 'auth.js',             desc: 'JWT helpers + requireAuth/requireAdmin' },
  { indent: 2, name: 'db.js',               desc: 'PrismaClient singleton' },
  { indent: 2, name: 'activity.js',         desc: 'logActivity() helper' },
  { indent: 1, name: 'components/',          desc: 'Shared UI components' },
  { indent: 0, name: 'prisma/',              desc: '' },
  { indent: 1, name: 'schema.prisma',        desc: 'Always sqlite, patched to postgresql on deploy' },
  { indent: 1, name: 'seed.js',             desc: 'Upserts admin users + calls sub-seeds' },
  { indent: 1, name: 'seeds/',              desc: 'Modular seed files' },
  { indent: 0, name: 'scripts/',             desc: '' },
  { indent: 1, name: 'generate-deploy-log.js', desc: 'git log → deploy-log.json at every build' },
  { indent: 1, name: 'check-dynamic-pages.js', desc: 'Fails build if force-dynamic missing' },
  { indent: 0, name: 'amplify.yml',          desc: 'Amplify build pipeline config' },
  { indent: 0, name: 'next.config.mjs',      desc: 'DATABASE_URL baked here, critical' },
  { indent: 0, name: 'deploy.ps1',           desc: 'git add + commit + push script' },
];

function CommitRow({ c }) {
  const meta = CATEGORY_META[c.category] || CATEGORY_META.other;
  const msg  = c.message || c.subject || '';
  const short = msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
  const date  = c.date ? new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${meta.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-700 leading-snug">{short}</div>
        {date && <div className="text-[11px] text-slate-500 mt-0.5">{date} · {c.hash?.slice(0, 7) || ''}</div>}
      </div>
      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${meta.color}`}>{meta.label}</span>
    </div>
  );
}

export default function TechStackClient({ deps, commits, nodeVersion }) {
  const [activeTab,    setActiveTab]    = useState('overview');
  const [catFilter,    setCatFilter]    = useState('all');
  const [commitSearch, setCommitSearch] = useState('');

  const filteredCommits = useMemo(() => {
    let list = commits || [];
    if (catFilter !== 'all') list = list.filter(c => c.category === catFilter);
    if (commitSearch.trim()) {
      const q = commitSearch.toLowerCase();
      list = list.filter(c => (c.message || c.subject || '').toLowerCase().includes(q));
    }
    return list;
  }, [commits, catFilter, commitSearch]);

  const TABS = [
    { id: 'overview',   label: 'Stack Overview' },
    { id: 'deps',       label: `Dependencies (${deps?.length || 0})` },
    { id: 'directory',  label: 'Directory Layout' },
    { id: 'rules',      label: 'Critical Rules' },
    { id: 'changelog',  label: `Changelog (${commits?.length || 0})` },
  ];

  const tabCls = id => `px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
    activeTab === id
      ? TAB_ACTIVE
      : TAB_INACTIVE
  }`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center text-white font-black text-sm shrink-0">ILC</div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">Tech Stack</h1>
                <p className="text-xs text-slate-500 mt-0.5">Architecture, dependencies & change history, auto-updated from every deploy</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {nodeVersion && (
              <span className="text-[11px] font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">Node {nodeVersion}</span>
            )}
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-600 border border-orange-200">Super Admin Only</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 flex-wrap border-b border-slate-200">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={tabCls(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">

        {/* ── Stack Overview ─────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {STACK.map(s => (
                <div key={s.label} className={`rounded-xl border p-4 bg-white shadow-sm ${s.color === 'orange' ? 'border-orange-200' : 'border-slate-200'}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{s.label}</div>
                  <div className={`text-sm font-bold ${s.color === 'orange' ? 'text-orange-600' : 'text-slate-900'}`}>{s.value}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{s.note}</div>
                </div>
              ))}
            </div>

            {/* Auth flow */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-3">Auth Flow</h2>
              <div className="text-xs text-slate-600 space-y-1.5">
                <p>Session = httpOnly cookie <code className="bg-slate-100 text-orange-600 px-1.5 py-0.5 rounded font-mono text-[11px]">ilc_session</code> → 7-day JWT signed with <code className="bg-slate-100 text-orange-600 px-1.5 py-0.5 rounded font-mono text-[11px]">JWT_SECRET</code></p>
                <p>Every API route: <code className="bg-slate-100 text-orange-600 px-1.5 py-0.5 rounded font-mono text-[11px]">const {'{ user, error }'} = await requireAuth(request)</code></p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[['ILC_ADMIN / SUPER_ADMIN', 'orange'], ['COMPANY_ADMIN / ADMIN', 'violet'], ['USER', 'blue'], ['CLIENT_VIEWER', 'slate']].map(([r, c]) => (
                    <span key={r} className={`text-[11px] font-bold px-2 py-1 rounded-full bg-${c}-100 text-${c}-700`}>{r}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Deploy pipeline */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-3">Deploy Pipeline</h2>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {['npm run deploy -- "msg"', '→', 'git push origin main', '→', 'Amplify detects push', '→', 'npm ci', '→', 'sed sqlite→postgresql', '→', 'prisma db push', '→', 'seed.js', '→', 'next build', '→', '🟢 Live at app.ilcstudios.com'].map((s, i) => (
                  s === '→'
                    ? <span key={i} className="text-slate-300 font-bold">›</span>
                    : <span key={i} className={`px-2 py-1 rounded-lg font-mono ${s.startsWith('🟢') ? 'bg-green-100 text-green-700 font-bold font-sans' : 'bg-slate-100 text-slate-600'}`}>{s}</span>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-3">Build time: 3 to 5 minutes. Monitor at AWS Amplify console.</p>
            </div>
          </div>
        )}

        {/* ── Dependencies ────────────────────────────────────────────────── */}
        {activeTab === 'deps' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Package</th>
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Version</th>
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deps?.map(d => (
                  <tr key={d.key} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{d.key}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded">{d.version}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{d.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
              <p className="text-[11px] text-slate-500">Versions read live from <code className="font-mono">package.json</code>, always current.</p>
            </div>
          </div>
        )}

        {/* ── Directory Layout ─────────────────────────────────────────────── */}
        {activeTab === 'directory' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-900 px-4 py-2.5">
              <span className="text-xs font-mono text-slate-400">C:\ilc-studios-live\</span>
            </div>
            <div className="p-4 font-mono text-xs leading-7 text-slate-700">
              {DIR_TREE.map((node, i) => (
                <div key={i} style={{ paddingLeft: node.indent * 20 }}>
                  <span className={node.name.endsWith('/') || node.name.endsWith('.json') || node.name.endsWith('.mjs') || node.name.endsWith('.ps1') || node.name.endsWith('.yml') ? 'text-orange-500 font-semibold' : 'text-slate-900 font-semibold'}>{node.name}</span>
                  {node.desc && <span className="text-slate-500 ml-2 font-sans not-italic text-[11px]">: {node.desc}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Critical Rules ───────────────────────────────────────────────── */}
        {activeTab === 'rules' && (
          <div className="space-y-3">
            {CRITICAL_RULES.map((r, i) => (
              <div key={i} className="bg-white rounded-xl border border-red-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50">
                  <span className="text-red-500 font-black text-sm shrink-0">!</span>
                  <code className="text-xs font-mono text-red-700 font-semibold">{r.rule}</code>
                </div>
                <div className="px-4 py-3 text-xs text-slate-600">{r.why}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Changelog ────────────────────────────────────────────────────── */}
        {activeTab === 'changelog' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
              <input
                value={commitSearch}
                onChange={e => setCommitSearch(e.target.value)}
                placeholder="Search commits…"
                className="flex-1 min-w-48 text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => setCatFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${catFilter === 'all' ? "bg-orange-50 border border-orange-400 text-orange-700" : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                  All
                </button>
                {Object.entries(CATEGORY_META).filter(([k]) => k !== 'other').map(([k, v]) => (
                  <button key={k} onClick={() => setCatFilter(k === catFilter ? 'all' : k)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${catFilter === k ? "bg-orange-50 border border-orange-400 text-orange-700" : ` border border-transparent hover:opacity-80`}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Commit list */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {filteredCommits.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">No commits match this filter.</div>
              ) : (
                <div className="px-4">
                  {filteredCommits.map((c, i) => <CommitRow key={i} c={c} />)}
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              Showing last {(commits || []).length} commits from <code className="font-mono">deploy-log.json</code>, regenerated on every build.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
