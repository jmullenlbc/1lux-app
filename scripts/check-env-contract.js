#!/usr/bin/env node
/**
 * check-env-contract — the next.config.mjs `env` block is a production contract.
 *
 * Amplify Hosting Gen 1 does NOT propagate console-set env vars to the SSR Lambda
 * runtime; they exist at build time only. Anything the server bundle reads through
 * process.env must therefore be baked into next.config.mjs's `env` block, or it
 * inlines as undefined in production and the feature fails SILENTLY.
 *
 * This has bitten us three times: DATABASE_URL, the S3 credentials, and
 * ANTHROPIC_API_KEY (which made every AI parser return null in prod).
 *
 * JWT_SECRET is deliberately NOT baked in — auth.js bundles differently and it
 * needs separate analysis. Flag it if someone adds it without that analysis.
 */
const fs = require('fs');

const CONFIG = 'next.config.mjs';
if (!fs.existsSync(CONFIG)) {
  console.log('• check-env-contract: no next.config.mjs (skipping)');
  process.exit(0);
}

const src = fs.readFileSync(CONFIG, 'utf8');
const block = src.match(/\benv\s*:\s*\{([\s\S]*?)\n\s*\},/);
if (!block) {
  console.error('❌ check-env-contract: could not find the `env: { ... }` block in next.config.mjs');
  process.exit(1);
}
const env = block[1];

// Server-bundled code reads these through process.env — they MUST be baked in.
const REQUIRED = [
  ['DATABASE_URL',         'Prisma has no DB connection in the Lambda; every API route fails'],
  ['ANTHROPIC_API_KEY',    'all AI parsers (fixture schedule, schedule extract, RFI) return null'],
  ['S3_BUCKET',            'uploads fall back to the ephemeral Lambda disk and vanish'],
  ['S3_REGION',            'the S3 client cannot resolve a region'],
  ['S3_ACCESS_KEY_ID',     'the AWS SDK throws CredentialsProviderError'],
  ['S3_SECRET_ACCESS_KEY', 'the AWS SDK throws CredentialsProviderError'],
  ['MCP_API_TOKEN',        'the /api/mcp Librarian refuses every bearer request with 503'],
];

// Present here without a deliberate decision = suspicious.
const DISALLOWED = [
  ['JWT_SECRET', 'auth.js bundles differently; baking this in needs separate analysis first'],
];

const missing    = REQUIRED.filter(([k]) => !new RegExp(`\\b${k}\\s*:`).test(env));
const unexpected = DISALLOWED.filter(([k]) => new RegExp(`\\b${k}\\s*:`).test(env));

if (missing.length || unexpected.length) {
  console.error('\n❌ BUILD BLOCKED — next.config.mjs env contract violated:\n');
  for (const [k, why] of missing) {
    console.error(`   MISSING  ${k}`);
    console.error(`            without it in the env block: ${why}\n`);
  }
  for (const [k, why] of unexpected) {
    console.error(`   UNEXPECTED  ${k}`);
    console.error(`               ${why}\n`);
  }
  console.error('   Amplify Gen 1 console env vars do NOT reach the SSR Lambda —');
  console.error('   anything the server reads must be baked into the env block.\n');
  process.exit(1);
}

console.log(`✓ check-env-contract: all ${REQUIRED.length} server env vars baked into next.config.mjs`);
