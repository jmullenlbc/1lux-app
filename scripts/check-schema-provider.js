#!/usr/bin/env node
/**
 * check-schema-provider — the committed Prisma provider must stay "sqlite".
 *
 * amplify.yml patches it at build time:
 *   sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
 *
 * If "postgresql" ever gets committed, that sed matches nothing, the swap
 * silently no-ops, and prod builds against the wrong provider — while local dev
 * breaks for everyone at the same time. Cheap to assert, expensive to discover.
 */
const fs = require('fs');

const SCHEMA = 'prisma/schema.prisma';
if (!fs.existsSync(SCHEMA)) {
  console.log('• check-schema-provider: no schema.prisma (skipping)');
  process.exit(0);
}

const src = fs.readFileSync(SCHEMA, 'utf8');
const m = src.match(/datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([^"]+)"/s);

if (!m) {
  console.error('❌ check-schema-provider: could not find a datasource provider in prisma/schema.prisma');
  process.exit(1);
}

if (m[1] !== 'sqlite') {
  console.error(`\n❌ BUILD BLOCKED — committed Prisma provider is "${m[1]}", expected "sqlite".\n`);
  console.error('   amplify.yml swaps sqlite → postgresql at build time. Committing');
  console.error('   "postgresql" makes that sed a no-op and breaks local dev.\n');
  console.error('   Fix: set provider = "sqlite" in prisma/schema.prisma before committing.\n');
  process.exit(1);
}

console.log('✓ check-schema-provider: committed provider is "sqlite" (Amplify swaps it at build)');
