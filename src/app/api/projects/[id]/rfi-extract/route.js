import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { buildUntrustedPrompt, warnOnInjection } from '@/lib/agent/untrusted';

// POST /api/projects/[id]/rfi-extract
// Body: { fileId } — extracts just the RFI question/request from a file's textContent
// Body: { emailContent } — parses a pasted email and creates an RFI record
export async function POST(req, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  // Recorded: see src/lib/agent/ledger.js. The two modes below are named
  // separately — one reads a stored file, the other parses a pasted email —
  // and they fail for different reasons, so the rollup should keep them apart.
  const raw = new Anthropic({ apiKey: getAnthropicKey() });
  const ctx = { projectId: params.id, userId: user.id };

  // ── Mode 1: Extract question from existing file ──────────────────────────
  if (body.fileId) {
    const file = await prisma.projectFile.findUnique({
      where: { id: body.fileId },
      select: { id: true, textContent: true, originalName: true, analysisData: true },
    });
    if (!file || !file.textContent) {
      return NextResponse.json({ error: 'File not found or not readable' }, { status: 404 });
    }

    // Check if already extracted
    let existing = null;
    try { existing = JSON.parse(file.analysisData || '{}'); } catch {}
    if (existing?.rfiQuestion) {
      return NextResponse.json({ question: existing.rfiQuestion });
    }

    // An RFI is written by the contractor asking the question, so its text is
    // third-party input and goes inside the fence. See src/lib/agent/untrusted.js.
    const sealed = buildUntrustedPrompt({
      instructions: `You are reading an RFI (Request for Information) document from a construction project.

Extract ONLY the actual question or information being requested. Ignore all header information (project name, date, RFI number, addresses, from/to fields, company names, contractor info).

Return only 1-3 sentences describing what is being asked. Be concise and specific. Start directly with the request content, not with "This RFI asks..." or similar.`,
      documents: [{ text: file.textContent, descriptor: file.originalName || 'RFI', maxChars: 6000 }],
    });
    warnOnInjection('rfi.extractQuestion', params.id, sealed);

    const msg = await wrapClient(raw, 'rfi.extractQuestion', ctx).messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 300,
      system:     sealed.system,
      messages:   [{ role: 'user', content: sealed.content }],
    });

    const question = msg.content[0]?.text?.trim() || null;

    if (question) {
      // Cache in analysisData
      const updated = { ...(existing || {}), rfiQuestion: question };
      await prisma.projectFile.update({
        where: { id: body.fileId },
        data:  { analysisData: JSON.stringify(updated) },
      });
    }

    return NextResponse.json({ question });
  }

  // ── Mode 2: Parse a pasted email and create an RFI record ────────────────
  if (body.emailContent) {
    // A pasted email is the most obviously attacker-shaped input in the app —
    // it arrives from outside, unmodified, and a sender chooses every word of it.
    const sealed = buildUntrustedPrompt({
      instructions: `You are reading an email that contains or references an RFI (Request for Information) for a construction project.

Extract the following and return as JSON only (no explanation):
{
  "subject": "email subject or RFI title",
  "rfiNumber": "RFI number if found, else null",
  "question": "1-3 sentence summary of exactly what information is being requested — ignore headers/boilerplate",
  "from": "sender name or company if identifiable, else null",
  "date": "date string if found, else null"
}`,
      documents: [{ text: body.emailContent, descriptor: 'pasted email', maxChars: 8000 }],
    });
    warnOnInjection('rfi.parseEmail', params.id, sealed);

    const msg = await wrapClient(raw, 'rfi.parseEmail', ctx).messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 500,
      system:     sealed.system,
      messages:   [{ role: 'user', content: sealed.content }],
    });

    // Named `answer`, not `raw`. It used to be `const raw`, which shadowed the
    // Anthropic client of the same name declared above — and because `const` is
    // block-scoped, the `wrapClient(raw, …)` call earlier in THIS block was
    // reading the shadowed binding while it was still in its temporal dead zone.
    // Mode 2 threw `Cannot access 'raw' before initialization` on every pasted
    // email, before any model call was made.
    const answer = msg.content[0]?.text?.trim() || '{}';
    const start  = answer.indexOf('{');
    const end    = answer.lastIndexOf('}');
    let parsed   = {};
    try { parsed = JSON.parse(answer.slice(start, end + 1)); } catch {}

    // Create a ProjectFile record for this email-sourced RFI
    const rfiFile = await prisma.projectFile.create({
      data: {
        projectId:    params.id,
        tab:          'ca',
        originalName: parsed.subject || 'RFI via Email',
        storedPath:   `${params.id}/ca/email-${Date.now()}`,
        size:         body.emailContent.length,
        mimeType:     'text/plain',
        tags:         JSON.stringify(['RFI']),
        textContent:  body.emailContent,
        analysisData: JSON.stringify({ rfiQuestion: parsed.question, rfiNumber: parsed.rfiNumber, from: parsed.from }),
        uploadedById: user.id,
      },
      include: { uploadedBy: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ file: rfiFile, parsed }, { status: 201 });
  }

  return NextResponse.json({ error: 'Provide fileId or emailContent' }, { status: 400 });
}
