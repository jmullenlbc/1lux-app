/**
 * check-push-size.js
 *
 * Runs in the pre-push hook. Prints a non-blocking warning if the pending
 * push touches more than 50 files, so the human notices before sending a
 * mega-commit to production.
 *
 * Why: large multi-feature pushes are hard to review, hard to bisect when
 * something fails, and tend to stack multiple unrelated bugs behind each
 * other (Sunday June 7's 160-file push being the canonical example —
 * four separate failure layers behind one commit). This isn't blocked,
 * just flagged. The push proceeds.
 *
 * Always exits 0 — purely informational.
 */

const { execSync } = require('child_process');

const THRESHOLD = 50;

function getChangedFileCount() {
  try {
    const out = execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf8' });
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0; // origin/main not reachable; can't measure; bail quietly
  }
}

const n = getChangedFileCount();
if (n > THRESHOLD) {
  console.warn(`\n⚠  push-size: this push touches ${n} files (threshold ${THRESHOLD}).`);
  console.warn('   Smaller, focused commits are easier to review, easier to bisect when');
  console.warn('   something breaks, and less likely to stack multiple bugs invisibly.');
  console.warn('   Proceeding anyway — this is a heads-up, not a block.\n');
} else if (n > 0) {
  console.log(`✓ push-size: ${n} files (under ${THRESHOLD}-file threshold)`);
}

process.exit(0);
