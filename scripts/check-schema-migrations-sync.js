/**
 * check-schema-migrations-sync.js
 *
 * Runs in the pre-push hook AND in Amplify preBuild. Catches the
 * "schema model declared with no migration to create its table" class
 * of bug, production deploy 143 (and 134 → 142 before it) crashed
 * during seed with P2021 "The table public.RoadmapPriority does not
 * exist" because Mike added the model to schema.prisma but never
 * generated a migration. The Prisma client method `prisma.roadmapPriority`
 * exists (so defensive `if (prisma.X)` guards in seed.js return true),
 * but the actual database table is missing.
 *
 * How: parse schema.prisma for every `model Foo { ... }`, then scan
 * every migration's SQL for a corresponding `CREATE TABLE "Foo"`. Any
 * model with no creating CREATE TABLE in any migration is flagged.
 *
 * Honors @@map("custom_name") for models that use a non-default
 * table name. Skips @@ignore models (intentionally not migrated).
 *
 * Exit 1 fails the push / build so the broken state never deploys.
 */

const fs   = require('fs');
const path = require('path');

const SCHEMA_PATH    = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

function readModelsFromSchema() {
  const src = fs.readFileSync(SCHEMA_PATH, 'utf8');
  // Strip block comments and full-line comments so they don't confuse the parser.
  const cleaned = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n');

  const models = [];
  // Match: model ModelName { ... }, capture body via balanced-brace walk.
  const headerRe = /^\s*model\s+([A-Za-z_][\w]*)\s*\{/gm;
  let m;
  while ((m = headerRe.exec(cleaned)) !== null) {
    const name = m[1];
    // Walk braces to find the matching closing }.
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < cleaned.length && depth > 0) {
      const ch = cleaned[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    const body = cleaned.slice(m.index + m[0].length, i - 1);
    const mapMatch    = body.match(/@@map\(\s*"([^"]+)"\s*\)/);
    const ignoreMatch = /@@ignore\b/.test(body);
    const tableName = mapMatch ? mapMatch[1] : name;
    models.push({ modelName: name, tableName, ignored: ignoreMatch });
  }
  return models;
}

function readCreatedTables() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return new Set();
  const tables = new Set();
  for (const entry of fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sql = path.join(MIGRATIONS_DIR, entry.name, 'migration.sql');
    if (!fs.existsSync(sql)) continue;
    const src = fs.readFileSync(sql, 'utf8');
    // Strip SQL line comments to avoid false positives on "-- CREATE TABLE Foo (sample)" lines.
    const cleaned = src.split(/\r?\n/).filter(l => !/^\s*--/.test(l)).join('\n');
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([A-Za-z_][\w]*)"/gi;
    let m;
    while ((m = re.exec(cleaned)) !== null) tables.add(m[1]);
  }
  return tables;
}

const models  = readModelsFromSchema();
const created = readCreatedTables();
const missing = models
  .filter(m => !m.ignored)
  .filter(m => !created.has(m.tableName));

if (missing.length > 0) {
  console.error('\n❌ BUILD BLOCKED: schema models with no migration to create their table:\n');
  for (const m of missing) {
    const note = m.tableName !== m.modelName ? `  (table "${m.tableName}" via @@map)` : '';
    console.error(`  model ${m.modelName}${note}`);
  }
  console.error('');
  console.error('Why this matters: schema.prisma uses these models to generate the Prisma client,');
  console.error('so `prisma.<modelName>` methods exist and defensive `if (prisma.X)` guards pass,');
  console.error('but `prisma migrate deploy` never creates the actual database tables, and any code');
  console.error('that hits the model crashes in production with P2021 "table does not exist".');
  console.error('');
  console.error('To fix: generate a migration that creates each missing table. Workflow:');
  console.error('  1. Temporarily switch schema.prisma provider to "postgresql"');
  console.error('  2. npx prisma migrate dev --name add_<model>');
  console.error('  3. Switch the provider back to "sqlite"');
  console.error('  4. git diff prisma/schema.prisma  # confirm only the provider line moved');
  console.error('See CLAUDE.md → "Rule: New Prisma migrations must be PostgreSQL-compatible".');
  console.error('');
  process.exit(1);
} else {
  console.log(`✓ check-schema-migrations-sync: all ${models.filter(m => !m.ignored).length} models have a creating CREATE TABLE in migrations`);
}
