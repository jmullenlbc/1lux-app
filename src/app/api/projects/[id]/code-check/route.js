import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runAllChecks } from '@/lib/fixtureScheduleChecks';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, textFrom, answerBudget } from '@/lib/aiModels';
import { runParkedJob, readJobRequest, jobError } from '@/lib/parkedJob';

// ── Load code corpus (reuse same pattern as code-search route) ────────────────
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

function loadRelevantCorpus() {
  const codesDir = path.join(process.cwd(), 'knowledge', 'codes');
  const RELEVANT_TAGS = new Set([
    'lpd', 'lighting_power_density', 'ashrae_90_1',
    'wet_location', 'damp_location', 'luminaire_requirements',
    'exit_signage', 'exit_signs', 'self_luminous',
    'emergency_lighting', 'emergency_power', 'battery_backup', '90_minutes',
    'egress', 'means_of_egress',
    'occupancy_sensing', 'automatic_shutoff', 'dimming', 'controls',
  ]);

  const results = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(fp); continue; }
      if (!entry.name.endsWith('.md')) continue;
      try {
        const p = parseFrontmatter(fs.readFileSync(fp, 'utf-8'));
        if (!p?.meta.id) continue;
        const tags = Array.isArray(p.meta.tags) ? p.meta.tags : [];
        if (tags.some(t => RELEVANT_TAGS.has(t))) {
          results.push(`[§${p.meta.section}] ${p.meta.title} (${p.meta.code} ${p.meta.edition})\n${p.body}`);
        }
      } catch { /* skip */ }
    }
  }
  walk(codesDir);
  return results.join('\n\n');
}

// ── GET, run deterministic checks ───────────────────────────────────────────
export async function GET(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;

  const projectId = params.id;

  const [scheduleData, takeoffFile, projectData] = await Promise.all([
    prisma.fixtureSchedule.findFirst({
      where: { projectId, state: 'DRAFT' },
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    }),
    prisma.projectFile.findFirst({
      where: { projectId, takeoffData: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { takeoffData: true, originalName: true },
    }),
    prisma.projectData.findUnique({ where: { projectId } }),
  ]);

  const items = scheduleData?.items ?? [];
  const takeoffRaw = takeoffFile?.takeoffData ? JSON.parse(takeoffFile.takeoffData) : null;

  const result = runAllChecks(items, projectData, takeoffRaw);

  return NextResponse.json({
    ...result,
    hasTakeoff: !!takeoffRaw,
    hasSchedule: items.length > 0,
    takeoffFile: takeoffFile ? { name: takeoffFile.originalName } : null,
  });
}

// ── POST, AI-powered deep review ────────────────────────────────────────────
//
// Park-and-poll (src/lib/parkedJob.js). One model call over the schedule plus
// the code corpus runs past Amplify's ~30-second front door. This route used
// to hand the browser a fake stream to keep the socket open, which the front
// door does not honour; now the first request only writes the job down and
// the polls run it and collect it. The answer is the same JSON object.
export const maxDuration = 300;

export async function POST(request, { params }) {
  // `user` is destructured only so the ledger entry can name who ran the check.
  const { user, error } = await requireAuth();
  if (error) return error;

  const apiKey = (await getAnthropicKey())?.trim();
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });

  const { body } = await readJobRequest(request);
  return runParkedJob({
    body, kind: 'codeCheck.review', scope: params.id, args: body.jobKey ? null : {},
    run: () => reviewSchedule({ projectId: params.id, user }),
  });
}

/**
 * The review itself. Returns the parsed JSON object the panel renders, or a
 * body with an `error` string, the same two shapes the stream used to carry.
 */
async function reviewSchedule({ projectId, user }) {
  const apiKey = (await getAnthropicKey())?.trim();
  if (!apiKey) throw jobError(503, { error: 'ANTHROPIC_API_KEY not configured' });

  const [scheduleData, takeoffFile, projectData, project] = await Promise.all([
    prisma.fixtureSchedule.findFirst({
      where: { projectId, state: 'DRAFT' },
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    }),
    prisma.projectFile.findFirst({
      where: { projectId, takeoffData: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { takeoffData: true, originalName: true },
    }),
    prisma.projectData.findUnique({ where: { projectId } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true, buildingType: true, city: true, state: true } }),
  ]);

  const items = scheduleData?.items ?? [];
  if (items.length === 0) {
    throw jobError(400, { error: 'No fixture schedule to review' });
  }

  const takeoffRaw = takeoffFile?.takeoffData ? JSON.parse(takeoffFile.takeoffData) : null;

  // Build schedule summary for Claude
  const scheduleSummary = items
    .filter(i => !i.isAlternate)
    .map(i => {
      const parts = [`Type: ${i.type || '—'}`];
      if (i.description) parts.push(`Desc: ${i.description}`);
      if (i.location)    parts.push(`Location: ${i.location}`);
      if (i.wattage)     parts.push(`Watts: ${i.wattage}`);
      if (i.lumens)      parts.push(`Lumens: ${i.lumens}`);
      if (i.cct)         parts.push(`CCT: ${i.cct}`);
      if (i.dimming)     parts.push(`Dimming: ${i.dimming}`);
      if (i.mounting)    parts.push(`Mounting: ${i.mounting}`);
      if (i.notes)       parts.push(`Notes: ${i.notes}`);
      return parts.join(' | ');
    })
    .join('\n');

  const takeoffSummary = takeoffRaw
    ? Object.entries(takeoffRaw).map(([t, q]) => `${t}: ${q}`).join(', ')
    : 'No takeoff data available';

  const projectInfo = [
    project?.name && `Project: ${project.name}`,
    project?.buildingType && `Building: ${project.buildingType}`,
    project?.city && project?.state && `Location: ${project.city}, ${project.state}`,
    projectData?.corridorSf && `Corridor SF: ${projectData.corridorSf}`,
    projectData?.unitsSf    && `Units SF: ${projectData.unitsSf}`,
    projectData?.garageSf   && `Garage SF: ${projectData.garageSf}`,
    projectData?.interiorAmenitySf && `Amenity SF: ${projectData.interiorAmenitySf}`,
  ].filter(Boolean).join('\n');

  const corpusText = loadRelevantCorpus();

  // Run deterministic checks first to include context
  const detChecks = runAllChecks(items, projectData, takeoffRaw);

  const systemPrompt = `You are a senior lighting design code consultant performing a QC review of a fixture schedule for 1LUX.

Your job: identify code compliance issues, missing data, and design concerns. Be direct and specific. Cite the exact code section for every flag.

RESPONSE FORMAT: return a JSON object exactly matching this schema:
{
  "summary": "1-2 sentence overall assessment",
  "issues": [
    {
      "severity": "FLAG" | "VERIFY" | "WARN" | "PASS",
      "code": "Code citation e.g. NEC 2020 §410.10(A)",
      "title": "Short title of the issue",
      "items": ["Type X: specific issue", "..."],
      "recommendation": "What to do to resolve"
    }
  ],
  "overallStatus": "FLAG" | "VERIFY" | "PASS"
}

Use FLAG for definite violations, VERIFY for items requiring engineer or AHJ confirmation, WARN for best-practice gaps, PASS for confirmed-compliant items.

CODE CORPUS (relevant sections):
${corpusText}`;

  const userMessage = `PROJECT INFO:
${projectInfo}

FIXTURE SCHEDULE (${items.filter(i => !i.isAlternate).length} fixture types):
${scheduleSummary}

TAKEOFF QUANTITIES:
${takeoffSummary}

DETERMINISTIC CHECKS ALREADY RUN:
${detChecks.checks.map(c => `${c.status}, ${c.title}: ${c.summary}`).join('\n')}

Please perform a comprehensive code compliance review of this fixture schedule. Focus on:
1. LPD compliance (ASHRAE 90.1 §9.5.1) with the quantities and areas above
2. Wet/damp location listing requirements (NEC §410.10)
3. Emergency/egress lighting coverage (IFC §1006, §1008)
4. Exit sign compliance (IFC §1013)
5. Controls/dimming requirements (ASHRAE §9.4.1)
6. Any other code issues you identify from the fixture descriptions

Return only the JSON object, no markdown, no explanation outside the JSON.`;

  // Recorded: see src/lib/agent/ledger.js.
  const client = wrapClient(
    new Anthropic({ apiKey }),
    'codeCheck.review',
    { projectId, userId: user?.id || null },
  );

  let response;
  try {
    response = await client.messages.create({
      ...modelParams('code.check'),
      max_tokens: answerBudget('code.check', 2000),
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    });
  } catch (e) {
    return { error: e?.message ?? 'AI review failed' };
  }

  const text = textFrom(response) ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { error: 'No structured response from AI' };
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { error: 'The AI answer could not be read as JSON' };
  }
}
