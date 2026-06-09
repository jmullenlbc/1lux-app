/**
 * check-migrations-postgres.js
 *
 * Runs in preBuild (before `prisma migrate deploy`) to ensure every
 * Prisma migration uses PostgreSQL-flavored SQL, not SQLite.
 *
 * Why this exists:
 *   schema.prisma always says `provider = "sqlite"` (so local dev works
 *   without Docker — see CLAUDE.md). If a dev runs `npx prisma migrate dev`
 *   locally, Prisma reads the sqlite provider and emits SQLite-flavored
 *   migration SQL (DATETIME, BOOLEAN DEFAULT 0/1). Amplify then sed-patches
 *   the schema to postgresql and runs `prisma migrate deploy` against the
 *   real Postgres database — where DATETIME isn't a recognized type and
 *   BOOLEAN DEFAULT 0 is a syntax error. Result: deploy aborts mid-migration.
 *
 *   This exact failure killed Mike's Sunday June 7 push of the Proposals
 *   module (migrations 0023, 0024).
 *
 * Exit 1 fails the Amplify build so broken migrations are never deployed.
 *
 * The fix for any flagged file: generate the migration against the
 * postgres-flavored schema (`npm run db:migrate:new -- <name>`), OR
 * manually replace:
 *     DATETIME                       -> TIMESTAMP(3)
 *     BOOLEAN ... DEFAULT 0          -> BOOLEAN ... DEFAULT false
 *     BOOLEAN ... DEFAULT 1          -> BOOLEAN ... DEFAULT true
 *     INTEGER PRIMARY KEY AUTOINCREMENT -> use SERIAL / BIGSERIAL or @default(autoincrement())
 *     PRAGMA ...                     -> not portable; remove
 */

const fs   = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

// Each pattern: { name, regex, fix }
// regex must use the `g` flag and have a capture for the offending token if
// we want to show what specifically matched.
const PATTERNS = [
  {
    name: 'DATETIME (SQLite-only)',
    regex: /\bDATETIME\b/g,
    fix:   'replace with TIMESTAMP(3)',
  },
  {
    name: 'BOOLEAN ... DEFAULT 0/1 (SQLite-only)',
    // BOOLEAN possibly followed by NOT NULL, then DEFAULT and a 0 or 1
    regex: /\bBOOLEAN\b[^,;)\n]*?\bDEFAULT\s+[01]\b/g,
    fix:   'replace DEFAULT 0 -> DEFAULT false, DEFAULT 1 -> DEFAULT true',
  },
  {
    name: 'AUTOINCREMENT (SQLite-only)',
    regex: /\bAUTOINCREMENT\b/g,
    fix:   'use SERIAL / BIGSERIAL or Prisma @default(autoincrement())',
  },
  {
    name: 'PRAGMA (SQLite-only)',
    regex: /\bPRAGMA\b/g,
    fix:   'remove; not portable to PostgreSQL',
  },
];

function getMigrationFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sql = path.join(dir, entry.name, 'migration.sql');
    if (fs.existsSync(sql)) files.push(sql);
  }
  return files.sort();
}

const files = getMigrationFiles(MIGRATIONS_DIR);
const findings = []; // [{ file, pattern, line, snippet, fix }]

// Forward-FK detector: within a single migration file, scans CREATE TABLE
// declarations in source order. If a table's body contains REFERENCES "X"
// where X is also CREATE TABLE'd in the same file but later than the
// current table, flag it. PostgreSQL won't allow this; SQLite will.
// Tables referenced that aren't in this file are assumed to come from a
// prior migration and are fine. Self-references are allowed.
function checkForwardForeignKeys(file, src) {
  const declaredAtLine = new Map(); // tableName -> line where its CREATE TABLE starts
  const refs = []; // [{ fromTable, fromLine, toTable, snippet }]
  const lines = src.split(/\r?\n/);
  let currentTable = null;
  let currentTableLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*--/.test(lines[i])) continue; // skip pure comment lines
    const m = lines[i].match(/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([A-Za-z_][\w]*)"/);
    if (m) {
      currentTable = m[1];
      currentTableLine = i + 1;
      if (!declaredAtLine.has(currentTable)) declaredAtLine.set(currentTable, currentTableLine);
      continue;
    }
    if (!currentTable) continue;
    // Capture every REFERENCES "X" inside this table's body (until next CREATE TABLE).
    const refRe = /REFERENCES\s+"([A-Za-z_][\w]*)"/g;
    let r;
    while ((r = refRe.exec(lines[i])) != null) {
      refs.push({ fromTable: currentTable, fromLine: i + 1, toTable: r[1], snippet: lines[i].trim().slice(0, 100) });
    }
  }
  const out = [];
  for (const { fromTable, fromLine, toTable, snippet } of refs) {
    if (fromTable === toTable) continue; // self-ref OK
    if (!declaredAtLine.has(toTable)) continue; // ref to a table from a previous migration is fine
    if (declaredAtLine.get(toTable) > declaredAtLine.get(fromTable)) {
      out.push({
        file:    file.replace(path.join(__dirname, '..'), '').replace(/\\/g, '/'),
        pattern: `forward FK: ${fromTable} -> ${toTable} (declared later in this file)`,
        fix:     `move "CREATE TABLE \\"${toTable}\\"" before "CREATE TABLE \\"${fromTable}\\""`,
        line:    fromLine,
        snippet,
      });
    }
  }
  return out;
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  for (const { name, regex, fix } of PATTERNS) {
    regex.lastIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      // Skip comment-only lines so we don't false-positive on "-- DATETIME notes"
      if (/^\s*--/.test(lines[i])) continue;
      // Match anywhere in the line
      const localRegex = new RegExp(regex.source, regex.flags);
      if (localRegex.test(lines[i])) {
        findings.push({
          file:    file.replace(path.join(__dirname, '..'), '').replace(/\\/g, '/'),
          pattern: name,
          fix,
          line:    i + 1,
          snippet: lines[i].trim().slice(0, 100),
        });
      }
    }
  }
  // Forward-FK pass on the same file
  findings.push(...checkForwardForeignKeys(file, src));
}

if (findings.length > 0) {
  console.error('\n❌ BUILD BLOCKED — migrations contain SQLite-only SQL that will fail on PostgreSQL:\n');
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, items] of byFile) {
    console.error(`  ${file}`);
    for (const it of items) {
      console.error(`    line ${it.line}: ${it.pattern}`);
      console.error(`      ${it.snippet}`);
      console.error(`      fix: ${it.fix}`);
    }
    console.error('');
  }
  console.error('Why: schema.prisma uses sqlite locally so dev works without Docker.');
  console.error('When you run `npx prisma migrate dev` against that, Prisma emits SQLite SQL,');
  console.error('which fails when Amplify runs `prisma migrate deploy` against PostgreSQL.');
  console.error('');
  console.error('To fix: edit each file listed above and apply the replacements shown.');
  console.error('For the next migration, generate it against a Postgres provider — either:');
  console.error('  a) temporarily change schema.prisma provider to "postgresql", run prisma migrate dev,');
  console.error('     then change it back to "sqlite", OR');
  console.error('  b) use `npx prisma migrate diff --from-migrations prisma/migrations \\');
  console.error('       --to-schema-datamodel prisma/schema.prisma --script` (after flipping provider).');
  console.error('');
  process.exit(1);
} else {
  console.log(`✓ check-migrations-postgres: all ${files.length} migrations use Postgres-compatible SQL`);
}
