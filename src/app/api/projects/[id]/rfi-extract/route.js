import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';

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

    const msg = await wrapClient(raw, 'rfi.extractQuestion', ctx).messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are reading an RFI (Request for Information) document from a construction project.

Extract ONLY the actual question or information being requested. Ignore all header information (project name, date, RFI number, addresses, from/to fields, company names, contractor info).

Return only 1-3 sentences describing what is being asked. Be concise and specific. Start directly with the request content, not with "This RFI asks..." or similar.

RFI text:
${file.textContent.slice(0, 6000)}`,
      }],
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
    const msg = await wrapClient(raw, 'rfi.parseEmail', ctx).messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are reading an email that contains or references an RFI (Request for Information) for a construction project.

Extract the following and return as JSON only (no explanation):
{
  "subject": "email subject or RFI title",
  "rfiNumber": "RFI number if found, else null",
  "question": "1-3 sentence summary of exactly what information is being requested — ignore headers/boilerplate",
  "from": "sender name or company if identifiable, else null",
  "date": "date string if found, else null"
}

Email content:
${body.emailContent.slice(0, 8000)}`,
      }],
    });

    const raw  = msg.content[0]?.text?.trim() || '{}';
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    let parsed  = {};
    try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch {}

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
