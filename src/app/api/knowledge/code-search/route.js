import { NextResponse } from 'next/server';
import { NO_DASHES_RULE } from '@/lib/bot/emailStyle';
import { requireAuth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, answerBudget } from '@/lib/aiModels';

// ── Parse markdown frontmatter ────────────────────────────────────────────────
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

// ── Load all corpus sections from markdown files ───────────────────────────────
function findMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMarkdownFiles(fullPath));
    else if (entry.name.endsWith('.md')) results.push(fullPath);
  }
  return results;
}

function loadCorpus() {
  const codesDir = path.join(process.cwd(), 'knowledge', 'codes');
  const files    = findMarkdownFiles(codesDir);
  const sections = [];

  for (const filepath of files) {
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      const parsed  = parseFrontmatter(content);
      if (!parsed || !parsed.meta.id) continue;
      sections.push({
        id:      parsed.meta.id,
        code:    parsed.meta.code     || '',
        edition: parsed.meta.edition  || '',
        section: parsed.meta.section  || '',
        title:   parsed.meta.title    || '',
        tags:    Array.isArray(parsed.meta.tags) ? parsed.meta.tags : [],
        body:    parsed.body,
      });
    } catch { /* skip bad files */ }
  }

  return sections;
}

// ── Tag-based pre-filtering ────────────────────────────────────────────────────
// Maps common query keywords → corpus tags so we can narrow context before
// sending to Claude. Keeps cost down as corpus grows past 200 sections.
const KEYWORD_TO_TAGS = {
  'emergency':      ['emergency_lighting', 'emergency_power', 'battery_backup', 'life_safety'],
  'egress':         ['egress', 'means_of_egress', 'emergency_lighting'],
  'exit sign':      ['exit_signage', 'exit_signs', 'self_luminous'],
  'exit':           ['exit_signage', 'egress', 'means_of_egress'],
  'lpd':            ['lpd', 'lighting_power_density', 'ashrae_90_1'],
  'lumen':          ['lamp_efficacy', 'lpd', 'lighting_power_density'],
  'watt':           ['lpd', 'lighting_power_density', 'ashrae_90_1'],
  'w/ft':           ['lpd', 'lighting_power_density', 'ashrae_90_1'],
  'foot-candle':    ['illuminance', 'foot_candles', '1_foot_candle', 'emergency_lighting'],
  'footcandle':     ['illuminance', 'foot_candles', '1_foot_candle'],
  'illumin':        ['illuminance', 'foot_candles', 'emergency_lighting', 'egress'],
  'occupancy sensor': ['occupancy_sensing', 'vacancy_sensor', 'automatic_shutoff'],
  'vacancy sensor': ['vacancy_sensor', 'occupancy_sensing'],
  'sensor':         ['occupancy_sensing', 'vacancy_sensor', 'photocell', 'daylight_harvesting'],
  'daylight':       ['daylight_harvesting', 'photocell', 'controls'],
  'photosensor':    ['daylight_harvesting', 'photocell'],
  'photocell':      ['photocell', 'exterior', 'daylight_harvesting'],
  'dimmer':         ['dimming', 'controls', 'automatic_shutoff'],
  'dimming':        ['dimming', 'controls'],
  'control':        ['controls', 'automatic_shutoff', 'time_switch', 'occupancy_sensing'],
  'exterior':       ['exterior', 'photocell', 'time_switch'],
  'battery':        ['battery_backup', 'emergency_power', '90_minutes'],
  'generator':      ['generator', 'emergency_power'],
  '90 minute':      ['90_minutes', 'battery_backup', 'emergency_power'],
  'hotel':          ['hotel', 'guest_room', 'motel', 'hospitality'],
  'motel':          ['motel', 'guest_room', 'hotel'],
  'guest room':     ['guest_room', 'hotel', 'motel'],
  'parking':        ['parking', 'exterior'],
  'garage':         ['parking'],
  'corridor':       ['corridor', 'egress', 'means_of_egress'],
  'stairway':       ['stairway', 'egress', 'means_of_egress'],
  'stairwell':      ['stairway', 'egress'],
  'lobby':          ['lobby', 'corridor'],
  'office':         ['office', 'lpd', 'lighting_power_density'],
  'classroom':      ['education', 'lpd'],
  'hospital':       ['healthcare', 'life_safety'],
  'healthcare':     ['healthcare', 'life_safety'],
  'healthcare':     ['healthcare', 'life_safety', 'emergency_lighting'],
  'operating room': ['healthcare', 'life_safety'],
  'retail':         ['retail', 'lpd'],
  'warehouse':      ['warehouse', 'industrial', 'lpd'],
  'recessed':       ['recessed', 'luminaire_requirements'],
  'wet location':   ['wet_location', 'luminaire_requirements'],
  'damp':           ['damp_location', 'wet_location', 'luminaire_requirements'],
  'track':          ['track_lighting', 'branch_circuit'],
  'closet':         ['closet', 'luminaire_requirements'],
  'bathroom':       ['bathroom', 'wet_location', 'damp_location'],
  'shower':         ['shower', 'wet_location'],
  'listing':        ['luminaire_requirements', 'wet_location'],
  'listed':         ['luminaire_requirements'],
  'multifamily':    ['multifamily', 'dwelling_unit', 'corridor'],
  'residential':    ['multifamily', 'dwelling_unit'],
  'dwelling unit':  ['dwelling_unit', 'multifamily'],
  'ashrae':         ['ashrae_90_1', 'lpd', 'lighting_power_density'],
  'nec':            ['nec', 'branch_circuit', 'wiring'],
  'ibc':            ['ibc', 'egress', 'emergency_lighting'],
  'ifc':            ['ifc', 'egress', 'emergency_lighting'],
  'iecc':           ['iecc', 'energy_compliance'],
  'energy':         ['energy_compliance', 'lpd', 'ashrae_90_1'],
};

function filterSections(sections, query) {
  const q = query.toLowerCase();

  // Find matching tags from query keywords
  const matchedTags = new Set();
  for (const [kw, tags] of Object.entries(KEYWORD_TO_TAGS)) {
    if (q.includes(kw)) tags.forEach(t => matchedTags.add(t));
  }

  // If we found relevant tags, filter to matching sections
  if (matchedTags.size > 0) {
    const filtered = sections.filter(s =>
      s.tags.some(tag => matchedTags.has(tag))
    );
    // Always include at least 10 sections, fall back to all if filter is too narrow
    if (filtered.length >= 5) return filtered;
  }

  // No keyword match or too few results, return all (Claude handles it)
  return sections;
}

// ── Module-level cache (persists across requests in same worker) ───────────────
let _corpus = null;
function getCorpus() {
  if (!_corpus) _corpus = loadCorpus();
  return _corpus;
}

function buildCorpusText(sections) {
  const byCode = {};
  for (const s of sections) {
    const key = `${s.code} ${s.edition}`;
    if (!byCode[key]) byCode[key] = [];
    byCode[key].push(s);
  }

  let text = '';
  for (const [codeKey, sects] of Object.entries(byCode)) {
    text += `\n${'═'.repeat(70)}\nCODE: ${codeKey}\n${'─'.repeat(70)}\n`;
    for (const s of sects) {
      text += `\n[§${s.section}] ${s.title}\n${s.body}\n`;
    }
  }
  return text.trim();
}

function getCorpusMeta(sections) {
  const byCode = {};
  for (const s of sections) {
    const key = `${s.code} ${s.edition}`;
    if (!byCode[key]) byCode[key] = 0;
    byCode[key]++;
  }
  return Object.entries(byCode).map(([k, count]) => ({ code: k, sectionCount: count }));
}

// ── POST /api/knowledge/code-search ──────────────────────────────────────────
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { getAnthropicKey } = await import('@/lib/anthropicKey');
  const apiKey = getAnthropicKey();
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }

  const { query, history = [], projectContext = null } = body;
  if (!query?.trim()) return NextResponse.json({ error: 'query is required' }, { status: 400 });

  // Load full corpus then pre-filter by query tags
  const allSections = getCorpus();
  const sections    = filterSections(allSections, query);
  const corpusText  = buildCorpusText(sections);
  const corpusMeta  = getCorpusMeta(sections);

  // ── Project context block ──────────────────────────────────────────────────
  let projectBlock = '';
  if (projectContext) {
    const { projectName, buildingType, city, state, codes = {} } = projectContext;
    const parts = [];
    if (projectName)  parts.push(`Project: ${projectName}`);
    if (buildingType) parts.push(`Building Type: ${buildingType} (multifamily residential)`);
    if (city && state)   parts.push(`Location: ${city}, ${state}`);
    else if (state)      parts.push(`State: ${state}`);
    else if (city)       parts.push(`City: ${city}`);

    // Individual adopted code editions for this project
    const codeEditions = [
      codes.iecc   ? `IECC ${codes.iecc}`          : null,
      codes.ibc    ? `IBC ${codes.ibc}`            : null,
      codes.nec    ? `NEC ${codes.nec}`            : null,
      codes.ashrae ? `ASHRAE 90.1-${codes.ashrae}` : null,
      codes.nfpa   ? `NFPA 101-${codes.nfpa}`      : null,
    ].filter(Boolean);
    if (codeEditions.length) parts.push(`Adopted codes: ${codeEditions.join(', ')}`);

    if (parts.length) {
      projectBlock = `\nPROJECT CONTEXT: scope your answer to this specific project:\n${parts.map(p => `  • ${p}`).join('\n')}\n\nIMPORTANT: This is always a multifamily residential project (apartments, condos, BTR, or similar). Do not reference office, retail, healthcare, warehouse, or other non-residential occupancy types unless directly asked.\n\nWhen specific code editions are listed above, cite those exact editions in your answer. When the state is known, note any state energy code amendments (e.g., California Title 24, Washington State Energy Code) that override the base code.\n`;
    }
  }

  // ── System prompt, static instruction block (not cached, cheap) ──────────
  const instructionBlock = {
    type: 'text',
    text: NO_DASHES_RULE.trim() + '\n\n' + `You are an expert code consultant for ILC Studios, a professional lighting design firm specializing in multifamily residential projects (apartments, condos, build-to-rent, podium/wrap, garden-style, high-rise). All projects are multifamily residential unless explicitly stated otherwise.

Answer questions about building codes relevant to lighting design. Always cite the specific section (e.g., "ASHRAE 90.1-2022 §9.5.1" or "IBC 2021 §1006"). Be direct. Designers use this on the job.
${projectBlock}
CONFIDENCE. End every answer with one of these:
- ✅ CERTAIN: code text directly answers the question
- ⚠️ LIKELY: code implies this but exceptions or amendments may apply
- 🔍 VERIFY WITH EOR: life safety or egress; always confirm with stamping engineer

RULES: Use **bold** for numbers (W/ft², foot-candles, distances, durations). Do not invent requirements not in the corpus. For egress or life-safety questions always recommend VERIFY WITH EOR. Keep answers focused on multifamily residential occupancies (R-2 in IBC terms).

Searching ${sections.length} of ${allSections.length} total sections (pre-filtered by topic).`,
  };

  // ── Corpus block, cached (the expensive part) ────────────────────────────
  const corpusBlock = {
    type: 'text',
    text: `${'═'.repeat(70)}\nCODE CORPUS (${corpusMeta.map(m => `${m.code}: ${m.sectionCount}§`).join(' | ')})\n${'═'.repeat(70)}\n\n${corpusText}`,
    cache_control: { type: 'ephemeral' },
  };

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: query.trim() },
  ];

  // ── Stream from Claude ─────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        // Recorded: see src/lib/agent/ledger.js. This one streams, so the entry
        // is written when the stream finishes rather than before it returns.
        const client   = wrapClient(new Anthropic({ apiKey }), 'knowledge.codeSearch', { userId: user?.id || null });
        const streamer = client.messages.stream({
          ...modelParams('code.search'),
          max_tokens: answerBudget('code.search', 1500),
          system:     [instructionBlock, corpusBlock],
          messages,
        });

        for await (const event of streamer) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
      } catch (e) {
        console.error('[code-search] error:', e?.message ?? e);
        controller.enqueue(enc.encode(`\n\nError: ${e?.message ?? 'Unknown error'}`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// ── GET, corpus metadata ─────────────────────────────────────────────────────
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sections = getCorpus();
  const meta     = getCorpusMeta(sections);
  return NextResponse.json({ sections: sections.length, codes: meta });
}
