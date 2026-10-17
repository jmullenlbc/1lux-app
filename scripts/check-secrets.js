/**
 * check-secrets.js
 *
 * Runs in the pre-push hook. Scans staged + recently-committed changes
 * for accidentally committed credentials (AWS keys, GitHub tokens,
 * Anthropic keys, generic env-style secrets). Blocks the push if any
 * are found.
 *
 * Why: a real leak (ANTHROPIC_API_KEY in a tracked file) happened early
 * in this codebase and is on the parked-security list. This guard makes
 * the same class of accident impossible going forward.
 *
 * Scope: diff between HEAD and origin/main (i.e. exactly the commits
 * about to be pushed). Falls back to last commit if origin/main isn't
 * reachable. We don't scan history; that's a separate concern.
 *
 * Exit 1 to abort the push.
 */

const { execSync } = require('child_process');

// Patterns deliberately chosen to be high-signal (false positives are bad
// because they cause people to reach for --no-verify). Each one targets
// a real format that appears in real leaks, not just any 32-char string.
const PATTERNS = [
  { name: 'AWS access key',        regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'AWS secret access key', regex: /aws_secret_access_key\s*=\s*['"]?[A-Za-z0-9/+=]{40}\b/i },
  { name: 'GitHub personal token', regex: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub OAuth token',    regex: /\bgho_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub app token',      regex: /\bghs_[A-Za-z0-9]{30,}\b/ },
  { name: 'Anthropic API key',     regex: /\bsk-ant-(?:api|admin)[0-9]{2}-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API key',        regex: /\bsk-[A-Za-z0-9]{40,}\b/ },
  { name: 'Stripe live secret',    regex: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'Generic API_KEY =...',  regex: /\b(?:API_KEY|SECRET_KEY|PRIVATE_KEY)\s*=\s*['"]?[A-Za-z0-9_-]{20,}/i },
  { name: 'Bearer JWT-ish',        regex: /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\b/ },
];

// Files we never want to scan (binary, lockfiles, etc.), high false-positive risk.
const SKIP_FILES = /(package-lock\.json|yarn\.lock|\.next\/|node_modules\/|\.png|\.jpg|\.jpeg|\.gif|\.pdf|\.zip|deploy-log\.json)$/;

function getDiff() {
  try {
    // Compare current HEAD to origin/main, exactly what's about to be pushed.
    return execSync('git diff --no-color origin/main...HEAD', { encoding: 'utf8' });
  } catch {
    // Fallback: just the last commit (origin/main not reachable on first push).
    try { return execSync('git show HEAD --no-color', { encoding: 'utf8' }); }
    catch { return ''; }
  }
}

const diff = getDiff();
if (!diff.trim()) {
  console.log('✓ check-secrets: no diff to scan');
  process.exit(0);
}

const findings = [];
let currentFile = null;
for (const line of diff.split('\n')) {
  // Track which file we're inside based on diff headers.
  const fileHeader = line.match(/^\+\+\+ b\/(.+)$/);
  if (fileHeader) {
    currentFile = fileHeader[1];
    continue;
  }
  if (!currentFile || SKIP_FILES.test(currentFile)) continue;
  // Only scan additions (lines starting with `+`, not the `+++` header).
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  for (const { name, regex } of PATTERNS) {
    const match = line.match(regex);
    if (match) {
      findings.push({ file: currentFile, name, snippet: match[0].slice(0, 60) + (match[0].length > 60 ? '…' : '') });
    }
  }
}

if (findings.length > 0) {
  console.error('\n❌ PUSH BLOCKED: looks like one or more credentials are in this push:\n');
  for (const f of findings) {
    console.error(`  ${f.file}`);
    console.error(`    ${f.name}: ${f.snippet}`);
  }
  console.error('\nIf this is a false positive, you can override with: git push --no-verify');
  console.error('But please look first. Credentials in git history are very hard to remove cleanly.\n');
  process.exit(1);
} else {
  console.log('✓ check-secrets: no credentials detected in pending push');
}
