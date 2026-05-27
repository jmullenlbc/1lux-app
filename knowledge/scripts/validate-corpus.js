#!/usr/bin/env node
/**
 * knowledge/scripts/validate-corpus.js
 * Checks every markdown file for required fields, non-empty body, and tag coverage.
 * Exits with code 1 if any errors found so CI can catch regressions.
 *
 * Usage: node knowledge/scripts/validate-corpus.js
 */

const fs   = require('fs');
const path = require('path');

const CODES_DIR = path.join(__dirname, '..', 'codes');
const REQUIRED_FIELDS = ['id', 'code', 'edition', 'section', 'title', 'tags'];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^"|"$/g, '');
    }
    meta[k] = v;
  }
  return { meta, body: match[2].trim() };
}

function findMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMarkdownFiles(fullPath));
    else if (entry.name.endsWith('.md')) results.push(fullPath);
  }
  return results;
}

const files = findMarkdownFiles(CODES_DIR);
let errors = 0, warnings = 0;
const stats = { byCode: {}, totalSections: 0 };

console.log(`\n📋 Validating ${files.length} corpus files...\n`);

for (const filepath of files) {
  const rel = path.relative(CODES_DIR, filepath);
  const content = fs.readFileSync(filepath, 'utf-8');
  const parsed = parseFrontmatter(content);

  if (!parsed) {
    console.log(`  ❌ ERROR: No frontmatter — ${rel}`);
    errors++; continue;
  }

  const { meta, body } = parsed;

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!meta[field] || (Array.isArray(meta[field]) && meta[field].length === 0)) {
      console.log(`  ❌ ERROR: Missing "${field}" — ${rel}`);
      errors++;
    }
  }

  // Body not empty
  if (!body || body.length < 20) {
    console.log(`  ❌ ERROR: Body too short (${body?.length ?? 0} chars) — ${rel}`);
    errors++;
  }

  // At least 3 tags
  const tagCount = Array.isArray(meta.tags) ? meta.tags.length : 0;
  if (tagCount < 3) {
    console.log(`  ⚠ WARN: Only ${tagCount} tags — ${rel}`);
    warnings++;
  }

  // Track stats
  const code = meta.code || 'UNKNOWN';
  stats.byCode[code] = (stats.byCode[code] || 0) + 1;
  stats.totalSections++;
}

// Summary
console.log('\n' + '─'.repeat(60));
console.log('📊 CORPUS SUMMARY');
console.log('─'.repeat(60));
for (const [code, count] of Object.entries(stats.byCode).sort()) {
  console.log(`  ${code.padEnd(20)} ${count} sections`);
}
console.log('─'.repeat(60));
console.log(`  ${'TOTAL'.padEnd(20)} ${stats.totalSections} sections`);
console.log('─'.repeat(60));
console.log(`\n  ❌ Errors:   ${errors}`);
console.log(`  ⚠  Warnings: ${warnings}`);

if (errors > 0) {
  console.log('\n🚫 Validation FAILED — fix errors before deploying.');
  process.exit(1);
} else {
  console.log('\n✅ Validation PASSED — corpus is healthy.');
}
