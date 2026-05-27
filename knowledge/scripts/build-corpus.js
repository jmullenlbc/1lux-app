#!/usr/bin/env node
/**
 * knowledge/scripts/build-corpus.js
 * Converts the flat JSON code files → proper markdown files with YAML frontmatter
 * in the structured directory layout the search API expects.
 *
 * Usage: node knowledge/scripts/build-corpus.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..');
const CODES_DIR = path.join(ROOT, 'codes');

// Map from flat JSON file → output directory
const FILE_MAP = [
  { src: 'ashrae-901-2022.json', code: 'ASHRAE 90.1', edition: '2022', dir: 'ashrae/90.1-2022' },
  { src: 'ibc-2021.json',        code: 'IBC',          edition: '2021', dir: 'ibc/2021'          },
  { src: 'iecc-2021-commercial.json', code: 'IECC', edition: '2021-commercial', dir: 'iecc/2021-commercial' },
  { src: 'nec-2020.json',        code: 'NEC',          edition: '2020', dir: 'nec/2020'           },
];

function slugify(str) {
  return str.replace(/[^a-zA-Z0-9.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function buildFrontmatter(fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map(t => `"${t}"`).join(', ')}]`);
    } else {
      lines.push(`${k}: "${String(v).replace(/"/g, '\\"')}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

let totalWritten = 0;
let totalSkipped = 0;

for (const entry of FILE_MAP) {
  const srcPath = path.join(CODES_DIR, entry.src);
  if (!fs.existsSync(srcPath)) {
    console.log(`SKIP (not found): ${entry.src}`);
    continue;
  }

  const data    = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
  const outDir  = path.join(CODES_DIR, entry.dir);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\nProcessing ${entry.code} ${entry.edition} (${data.sections.length} sections)...`);

  for (const section of data.sections) {
    const filename = `${slugify(section.id)}.md`;
    const filepath = path.join(outDir, filename);

    const frontmatter = buildFrontmatter({
      id:       `${entry.code.toLowerCase().replace(/[\s.]/g, '-')}-${entry.edition}-${section.id}`,
      code:     entry.code,
      edition:  entry.edition,
      section:  section.id,
      title:    section.title,
      tags:     section.tags || [],
      built_at: new Date().toISOString().split('T')[0],
    });

    const content = `${frontmatter}\n\n${section.text}\n`;
    fs.writeFileSync(filepath, content, 'utf-8');
    console.log(`  ✓ ${filename}`);
    totalWritten++;
  }
}

console.log(`\n✅ Done. ${totalWritten} markdown files written, ${totalSkipped} skipped.`);
console.log('Next: run generate-tags.js to enrich tags via Claude, then validate-corpus.js to check health.');
