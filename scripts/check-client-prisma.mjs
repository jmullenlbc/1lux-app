// Guard: no browser component may pull in Prisma, even several imports deep.
// A 'use client' file that reaches @/lib/db builds green and then crashes in
// the browser with "PrismaClient is unable to run in this browser
// environment", which is how every project page broke on 2026-09-23
// (NotificationSettingsTab -> notify.js -> db.js). Keep browser-side data in
// pure files (e.g. src/lib/notificationTypes.js).
import fs from 'fs'; import path from 'path';
const root = path.resolve('src');
function resolve(from, spec) {
  let p = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!p) return null;
  for (const c of [p, p+'.js', p+'.jsx', p+'.mjs', path.join(p,'index.js'), path.join(p,'index.jsx')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}
function deps(f) { const s = fs.readFileSync(f,'utf8'); const out=[]; for (const m of s.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]||m[2]); return out; }
function walk(dir, acc=[]) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if (e.isDirectory()) walk(p,acc); else if (/\.(jsx?|mjs)$/.test(e.name)) acc.push(p);} return acc; }
let bad = 0;
const files = walk(root).filter(f => /^\s*['"]use client['"]/.test(fs.readFileSync(f,'utf8')));
for (const f of files) {
  const seen = new Map([[f,null]]); const q=[f];
  while (q.length) { const cur=q.shift(); for (const d of deps(cur)) { if (d==='@prisma/client' || /lib[\/]db(\.js)?$/.test(d)) { const chain=[cur]; let x=seen.get(cur); while(x){chain.push(x);x=seen.get(x);} bad++; console.error('  ✗', path.relative(root,f),'<=',chain.reverse().map(c=>path.relative(root,c)).join(' -> '),'->',d); q.length=0; break; } const r=resolve(cur,d); if (r && !seen.has(r)) { seen.set(r,cur); q.push(r);} } }
}
if (bad) { console.error(`\n${bad} browser component(s) import Prisma. Move the shared constants into a file with no database import.`); process.exit(1); }
console.log(`client-prisma: ${files.length} browser components, none reach Prisma`);
