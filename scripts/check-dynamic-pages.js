/**
 * check-dynamic-pages.js
 *
 * Runs in preBuild (before npm run build) to ensure every server-rendered
 * page under src/app/(app) exports `force-dynamic`.
 *
 * Without force-dynamic, Next.js 14 may attempt static rendering, which
 * causes cookies() to throw "called outside a request scope" in production
 * (Amplify Lambda), crashing the page with Application Error.
 *
 * Client components ('use client') are exempt, they're always dynamic.
 * Exit 1 fails the Amplify build so broken code is never deployed.
 */

const fs   = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', 'src', 'app', '(app)');

function getAllPageFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllPageFiles(full));
    } else if (entry.name === 'page.jsx' || entry.name === 'page.tsx') {
      files.push(full);
    }
  }
  return files;
}

const pages  = getAllPageFiles(APP_DIR);
const broken = [];

for (const p of pages) {
  const src = fs.readFileSync(p, 'utf8');
  const isClient  = src.includes("'use client'") || src.includes('"use client"');
  const isDynamic = src.includes('force-dynamic');
  if (!isClient && !isDynamic) broken.push(p.replace(path.join(__dirname, '..'), ''));
}

if (broken.length > 0) {
  console.error('\n❌ BUILD BLOCKED: pages missing force-dynamic:\n');
  broken.forEach(f => console.error(`   ${f}`));
  console.error('\nFix: add this line to the top of each file above:');
  console.error("   export const dynamic = 'force-dynamic';\n");
  process.exit(1);
} else {
  console.log(`✓ check-dynamic-pages: all ${pages.length} (app) pages OK`);
}
