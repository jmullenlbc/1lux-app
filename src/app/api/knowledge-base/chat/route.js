import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
// Same missing import as peer-review/parse-pdf, `getAnthropicKey` was used
// below without ever being imported, so this route threw a ReferenceError.
import { getAnthropicKey } from '@/lib/anthropicKey';
import { recordRun } from '@/lib/agent/ledger';
import { modelFor } from '@/lib/aiModels';
import { NO_DASHES_RULE } from '@/lib/bot/emailStyle';

const CATEGORY_LABELS = {
  UNIT:         'Unit (Residential Fixtures)',
  CORRIDOR:     'Corridor & Hallway',
  BOH:          'Back of House',
  GARAGE:       'Garage / Parking',
  EXTERIOR:     'Exterior & Site',
  CONTROLS:     'Controls & Dimming Intent',
  FIXTURE_SPEC: 'Fixture Specs (Standard Products)',
  QC:           'QC Process',
  DIMMING:      'Dimming Standards',
  PHOTOMETRICS: 'Photometrics',
};

export async function POST(request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const apiKey = (await getAnthropicKey())?.trim();
  if (!apiKey) {
    return new Response('Error: ANTHROPIC_API_KEY is not set', { headers: { 'Content-Type': 'text/plain' } });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { question, history = [] } = body;
  if (!question?.trim()) return NextResponse.json({ error: 'No question provided' }, { status: 400 });

  // ── Load all active design standards ──────────────────────────────────────
  const standards = await prisma.designStandard.findMany({
    where:   { isActive: true },
    orderBy: [{ category: 'asc' }, { severity: 'asc' }, { createdAt: 'asc' }],
    select:  { id: true, category: true, title: true, content: true, severity: true, tags: true, sourceUrl: true },
  });

  // ── Organise standards by category ─────────────────────────────────────────
  const byCat = {};
  for (const s of standards) {
    if (!byCat[s.category]) byCat[s.category] = [];
    byCat[s.category].push(s);
  }

  // ── Build knowledge-base context block ────────────────────────────────────
  let kbText = '';
  for (const [cat, items] of Object.entries(byCat)) {
    const label = CATEGORY_LABELS[cat] || cat;
    kbText += `\n\n═══ ${label} (${items.length} standard${items.length !== 1 ? 's' : ''}) ═══\n`;
    for (const s of items) {
      const tags = (() => { try { return JSON.parse(s.tags || '[]'); } catch { return []; } })();
      kbText += `\n[${s.severity}] ${s.title}`;
      if (tags.length) kbText += `  #${tags.join(' #')}`;
      kbText += `\n${s.content}\n`;
      if (s.sourceUrl) kbText += `Source: ${s.sourceUrl}\n`;
    }
  }

  if (!kbText.trim()) {
    kbText = '\n(No design standards have been added yet.)';
  }

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemPrompt = `You are an expert AI assistant for ILC Studios, a boutique lighting design firm. You answer questions about ILC Studios' in-house design standards and best practices. Your knowledge comes exclusively from the ILC Studios Design Standards library shown below.

BEHAVIOR RULES:
- Answer questions directly and specifically, cite the exact standard title when referencing a rule
- If a standard says "REQUIRED", emphasise that it is mandatory at ILC Studios
- If something is not in the knowledge base, say so plainly. Do not invent standards
- Use **bold** for key measurements, percentages, and mandatory rules
- Use bullet points for lists of 3 or more items
- Keep answers focused and actionable. Designers are using this on the job
- When multiple standards apply to a question, list each one clearly

Standard severity levels:
- REQUIRED = Mandatory ILC Studios practice, must be followed on every project
- RECOMMENDED = Strong preference, follow unless there is a project-specific reason not to
- NOTE = Background information, context, or useful guidance

──────────────────────────────────────────────────────────────────────────────
ILC STUDIOS DESIGN STANDARDS LIBRARY
Total: ${standards.length} standards across ${Object.keys(byCat).length} categories
──────────────────────────────────────────────────────────────────────────────
${kbText}
──────────────────────────────────────────────────────────────────────────────`;

  // ── Stream response ───────────────────────────────────────────────────────
  const apiMessages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: question },
  ];

  // Recorded: see src/lib/agent/ledger.js. This site speaks raw SSE rather than
  // going through the SDK, so neither wrapClient nor recordRawCall fits, the
  // usage totals only exist inside the event stream. They are picked out of it
  // below: `message_start` carries input_tokens, `message_delta` carries the
  // running output_tokens and the stop reason.
  const MODEL   = modelFor('chat.knowledgeBase');
  const started = Date.now();
  const ledger  = { inputTokens: null, outputTokens: null, stopReason: null };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method:  'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model:      MODEL,
            max_tokens: 1024,
            stream:     true,
            system:     systemPrompt + NO_DASHES_RULE,
            messages:   apiMessages,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          await recordRun({
            task: 'knowledgeBase.chat', model: MODEL, status: 'error',
            durationMs: Date.now() - started, userId: user?.id || null,
            error: `HTTP ${res.status}: ${errText.slice(0, 300)}`,
          });
          controller.enqueue(enc.encode(`Error ${res.status}: ${errText}`));
          controller.close();
          return;
        }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                  controller.enqueue(enc.encode(parsed.delta.text));
                } else if (parsed.type === 'message_start') {
                  ledger.inputTokens = parsed.message?.usage?.input_tokens ?? null;
                } else if (parsed.type === 'message_delta') {
                  ledger.outputTokens = parsed.usage?.output_tokens ?? ledger.outputTokens;
                  ledger.stopReason   = parsed.delta?.stop_reason ?? ledger.stopReason;
                }
              } catch {}
            }
          }
        }
        await recordRun({
          task: 'knowledgeBase.chat', model: MODEL, status: 'ok',
          durationMs: Date.now() - started, userId: user?.id || null,
          inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens,
          stopReason: ledger.stopReason,
        });
      } catch (e) {
        console.error('[kb-chat] error:', e);
        await recordRun({
          task: 'knowledgeBase.chat', model: MODEL, status: 'error',
          durationMs: Date.now() - started, userId: user?.id || null,
          inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens,
          error: e?.message || String(e),
        });
        controller.enqueue(enc.encode(`Error: ${e.message}`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
