import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

// ── Load all code files from /knowledge/codes/ ────────────────────────────────
function loadCodeCorpus() {
  const codesDir = path.join(process.cwd(), 'knowledge', 'codes');
  const indexPath = path.join(codesDir, 'index.json');

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch {
    return { text: '(No code files found.)', meta: [] };
  }

  let corpus = '';
  const meta = [];

  for (const entry of index.codes) {
    try {
      const filePath = path.join(codesDir, entry.file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      corpus += `\n${'═'.repeat(70)}\n`;
      corpus += `CODE: ${data.code}\n`;
      corpus += `TITLE: ${data.title}\n`;
      corpus += `PUBLISHER: ${data.publisher} | YEAR: ${data.year}\n`;
      corpus += `${'─'.repeat(70)}\n`;

      for (const section of data.sections) {
        corpus += `\n[${section.id}] ${section.title}\n`;
        corpus += `${section.text}\n`;
        if (section.tags?.length) {
          corpus += `Keywords: ${section.tags.join(', ')}\n`;
        }
      }

      meta.push({
        code: data.code,
        title: data.title,
        publisher: data.publisher,
        year: data.year,
        sectionCount: data.sections.length,
      });
    } catch (err) {
      console.error(`[code-search] Failed to load ${entry.file}:`, err?.message);
    }
  }

  return { text: corpus.trim(), meta };
}

// ── Cached corpus (module-level, persists across requests in the same worker) ─
let _cachedCorpus = null;
function getCorpus() {
  if (!_cachedCorpus) {
    _cachedCorpus = loadCodeCorpus();
  }
  return _cachedCorpus;
}

// ── POST /api/knowledge/code-search ──────────────────────────────────────────
export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }

  const { query, history = [], projectContext = null } = body;
  if (!query?.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  const { text: corpusText, meta: corpusMeta } = getCorpus();

  // ── Build project context block if provided ───────────────────────────────
  let projectBlock = '';
  if (projectContext) {
    const { projectName, buildingType, city, state, serviceType } = projectContext;
    const parts = [];
    if (projectName) parts.push(`Project: ${projectName}`);
    if (buildingType) parts.push(`Building Type: ${buildingType}`);
    if (city && state)   parts.push(`Location: ${city}, ${state}`);
    else if (state)      parts.push(`State: ${state}`);
    else if (city)       parts.push(`City: ${city}`);
    if (serviceType) parts.push(`Service Type: ${serviceType}`);

    if (parts.length) {
      projectBlock = `\nPROJECT CONTEXT (scope your answer to this specific project):
${parts.map(p => `  • ${p}`).join('\n')}

When the project state is known, note if state amendments commonly affect the answer (e.g., California Title 24, Washington State Energy Code). Lead with how the code applies to this specific project type and location, then give the general rule.
`;
    }
  }

  // ── Build the system prompt with prompt caching on the code corpus ─────────
  const systemContent = [
    {
      type: 'text',
      text: `You are an expert code consultant for ILC Studios, a professional lighting design firm. You answer questions about building codes relevant to lighting design: ASHRAE 90.1 (energy/LPD), IBC (life safety/egress), IECC (energy conservation), and NEC/NFPA 70 (electrical).

Your knowledge comes from the code corpus below. Always cite the specific section number (e.g., "ASHRAE 90.1-2022 Section 9.5.1" or "IBC 2021 Section 1006") when referencing a requirement.
${projectBlock}
CONFIDENCE LEVELS — always end your answer with one of these:
- ✅ CERTAIN — The code text directly answers the question
- ⚠️ LIKELY — The code implies this answer but may have exceptions or jurisdiction-specific amendments
- 🔍 VERIFY WITH EOR — The requirement is complex, safety-critical, or jurisdiction-specific; confirm with Engineer of Record

BEHAVIOR RULES:
- Be direct and specific — designers are using this on the job
- Use **bold** for specific numbers (foot-candles, watts/ft², distances, durations)
- For LPD questions, always state the exact W/ft² value from the table
- If the answer depends on the building type or occupancy, ask for clarification or cover multiple cases
- If a question is outside the scope of the loaded codes, say so clearly
- For high-rise, healthcare, or life safety questions, always recommend VERIFY WITH EOR
- Do not invent code requirements not present in the corpus

LOADED CODES (${corpusMeta.length} codes, ${corpusMeta.reduce((s, m) => s + m.sectionCount, 0)} sections):
${corpusMeta.map(m => `  • ${m.code} — ${m.title} (${m.sectionCount} sections)`).join('\n')}`,
    },
    {
      type: 'text',
      text: `${'═'.repeat(70)}\nCODE CORPUS\n${'═'.repeat(70)}\n\n${corpusText}`,
      cache_control: { type: 'ephemeral' }, // Cache the large corpus block
    },
  ];

  // ── Build message history ─────────────────────────────────────────────────
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: query.trim() },
  ];

  // ── Stream from Claude ────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        const client = new Anthropic({ apiKey });

        const stream = client.messages.stream({
          model: 'claude-haiku-4-5',
          max_tokens: 1500,
          system: systemContent,
          messages,
          betas: ['prompt-caching-2024-07-31'],
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta?.type === 'text_delta'
          ) {
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
      } catch (e) {
        console.error('[code-search] Claude API error:', e?.message ?? e);
        controller.enqueue(enc.encode(`\n\nError: ${e?.message ?? 'Unknown error'}`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// ── GET /api/knowledge/code-search — returns corpus metadata ─────────────────
export async function GET(request) {
  const { user, error } = await requireAuth();
  if (error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meta } = getCorpus();
  return NextResponse.json({ codes: meta });
}
