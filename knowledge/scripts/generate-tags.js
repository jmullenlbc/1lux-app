#!/usr/bin/env node
/**
 * knowledge/scripts/generate-tags.js
 * Reads all markdown files in knowledge/codes/, sends sections to Claude
 * in batches for tag enrichment, and rewrites the frontmatter.
 *
 * Usage: node knowledge/scripts/generate-tags.js
 * Requires: ANTHROPIC_API_KEY in environment or .env file
 */

const fs   = require('fs');
const path = require('path');

// Load .env manually (no dotenv dep required)
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k]) process.env[k] = v.join('=').trim();
  }
}

const { default: Anthropic } = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CODES_DIR = path.join(__dirname, '..', 'codes');
const BATCH_SIZE = 10; // sections per Claude call

const AVAILABLE_TAGS = [
  'emergency_lighting', 'egress', 'exit_signage', 'means_of_egress',
  'lpd', 'lighting_power_density', 'energy_compliance', 'ashrae_90_1',
  'occupancy_sensing', 'daylight_harvesting', 'automatic_shutoff',
  'dimming', 'controls', 'time_switch', 'photocell', 'vacancy_sensor',
  'battery_backup', 'inverter', 'generator', 'emergency_power',
  'dwelling_unit', 'multifamily', 'commercial', 'hospitality',
  'healthcare', 'parking', 'exterior', 'interior',
  'luminaire_requirements', 'lamp_efficacy', 'fixture_type',
  'wiring', 'branch_circuit', 'switching', 'wet_location', 'damp_location',
  'recessed', 'track_lighting', 'closet', 'bathroom', 'shower',
  'hotel', 'motel', 'guest_room', 'corridor', 'stairway', 'lobby',
  'office', 'retail', 'education', 'warehouse', 'industrial',
  'foot_candles', 'illuminance', 'uniformity',
  'exit_signs', 'self_luminous', '90_minutes', '1_foot_candle',
  'life_safety', 'nec', 'ibc', 'iecc', 'ifc',
];

// ── Parse markdown frontmatter ────────────────────────────────────────────────
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
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
  return { meta, body: match[2] };
}

function buildFrontmatter(meta) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map(t => `"${t}"`).join(', ')}]`);
    } else {
      lines.push(`${k}: "${String(v).replace(/"/g, '\\"')}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

// ── Find all markdown files ───────────────────────────────────────────────────
function findMarkdownFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMarkdownFiles(fullPath));
    else if (entry.name.endsWith('.md')) results.push(fullPath);
  }
  return results;
}

// ── Claude tag generation for a batch of sections ─────────────────────────────
async function generateTagsForBatch(sections) {
  const sectionList = sections.map(s =>
    `SECTION_ID: ${s.id}\nCODE: ${s.code} ${s.edition} §${s.section}\nTITLE: ${s.title}\nTEXT: ${s.body.trim().substring(0, 600)}`
  ).join('\n\n---\n\n');

  const response = await client.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are tagging building code sections for a lighting design firm's search system.

Available tags (use ONLY these exact strings):
${AVAILABLE_TAGS.join(', ')}

For each section below, assign 3–8 relevant tags. Return ONLY valid JSON with no explanation:
{ "SECTION_ID": ["tag1", "tag2", ...], ... }

${sectionList}`,
    }],
  });

  try {
    const text = response.content[0].text.trim();
    // Extract JSON if wrapped in code fences
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (e) {
    console.error('  ⚠ Tag parse failed for batch:', e.message);
    return {};
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const files = findMarkdownFiles(CODES_DIR);
  console.log(`Found ${files.length} markdown files.\n`);

  // Parse all files
  const sections = [];
  for (const filepath of files) {
    const content = fs.readFileSync(filepath, 'utf-8');
    const { meta, body } = parseFrontmatter(content);
    if (!meta.id) continue;
    sections.push({ filepath, id: meta.id, code: meta.code || '', edition: meta.edition || '', section: meta.section || '', title: meta.title || '', currentTags: meta.tags || [], meta, body });
  }

  console.log(`Parsed ${sections.length} sections. Generating enriched tags in batches of ${BATCH_SIZE}...\n`);

  let updated = 0;
  for (let i = 0; i < sections.length; i += BATCH_SIZE) {
    const batch = sections.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(sections.length/BATCH_SIZE)} (${batch.map(s=>s.section).join(', ')})...`);

    const tagMap = await generateTagsForBatch(batch);

    for (const section of batch) {
      const newTags = tagMap[section.id];
      if (!newTags || !newTags.length) {
        console.log(`  ⚠ No tags returned for ${section.id} — keeping existing`);
        continue;
      }

      // Merge existing tags + new tags (deduplicated)
      const merged = [...new Set([...section.currentTags, ...newTags])];
      const newMeta = { ...section.meta, tags: merged };
      const newContent = `${buildFrontmatter(newMeta)}\n\n${section.body}`;
      fs.writeFileSync(section.filepath, newContent, 'utf-8');
      console.log(`  ✓ ${section.section} → [${merged.join(', ')}]`);
      updated++;
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < sections.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n✅ Done. ${updated}/${sections.length} sections tagged.`);
  console.log('Next: run validate-corpus.js to check corpus health.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
