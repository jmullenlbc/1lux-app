#!/usr/bin/env node
/**
 * check-source-tracked — nothing under src/ or prisma/migrations/ may be invisible to git.
 *
 * ── Why this gate exists ──
 * .gitignore held the line `uploads/`. Git applies a pattern with no leading
 * slash to a directory of that name ANYWHERE in the tree, so it did not just
 * ignore the runtime scratch folder at the repo root — it also swallowed
 * src/app/api/uploads/. The direct-to-S3 presign route was written there. It
 * worked locally, passed every test, passed the build, was "deployed", and
 * returned 404 in production, because it was never in the commit. Nothing
 * anywhere said so: git status does not mention ignored files, and a build
 * against a checkout that lacks a route simply does not have that route.
 *
 * The general shape is "code that runs locally and 404s in production". It is
 * expensive to find by hand and free to find here: anything under src/ or
 * prisma/ that git is ignoring is either a mistake in .gitignore or a file in
 * the wrong place, and both are worth stopping for.
 *
 * Escape hatch: put a genuinely-local file somewhere else. There is no
 * allowlist on purpose — an allowlist is how the next one gets waved through.
 */
import { execSync } from 'node:child_process';

// prisma/ itself is not swept: prisma/dev.db is the local SQLite file and is
// ignored on purpose. The migrations are what have to ship.
const DIRS = ['src', 'prisma/migrations'];

let ignored = [];
for (const dir of DIRS) {
  // --ignored=matching lists the ignored paths themselves rather than only the
  // directory that contains them.
  const out = execSync(`git status --porcelain --ignored=matching -- ${dir}`, { encoding: 'utf8' });
  for (const line of out.split('\n')) {
    if (line.startsWith('!! ')) ignored.push(line.slice(3).trim());
  }
}

if (ignored.length) {
  console.error('Files under src/ or prisma/migrations/ are being ignored by git:\n');
  for (const p of ignored) {
    let why = '';
    try {
      why = execSync(`git check-ignore -v -- "${p}"`, { encoding: 'utf8' }).trim().split('\t')[0];
    } catch { /* no rule reported */ }
    console.error(`  ${p}${why ? `   (${why})` : ''}`);
  }
  console.error(`
These will never be committed and never reach production, however well they
work locally. Either fix the .gitignore rule — a pattern needs a leading slash
to mean "at the repo root only" — or move the file out of src/ and prisma/migrations/.`);
  process.exit(1);
}

console.log('✓ check-source-tracked: nothing under src/ or prisma/migrations/ is gitignored');
