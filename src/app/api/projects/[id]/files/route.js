import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { logActivity, TAB_LABELS } from '@/lib/activity';
import { sendNotification } from '@/lib/notify';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { extractScheduleMilestones } from '@/lib/scheduleExtract';

// Anthropic client created per-request inside the POST handler so env vars are available

const VALID_TABS = ['drawings', 'correspondence', 'submittals', 'ca', 'contracts', 'meetings', 'designInfo', 'takeoffs', 'budgets', 'fixture-schedule', 'unit-matrix'];

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return user.role === 'ILC_ADMIN' || project.createdById === user.id;
}

async function extractPdfText(buffer) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const uint8    = new Uint8Array(buffer);
    const doc      = await pdfjsLib.getDocument({ data: uint8 }).promise;
    let text = '';
    const maxPages = Math.min(doc.numPages, 60);
    for (let i = 1; i <= maxPages; i++) {
      const page    = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    const trimmed = text.trim();
    if (trimmed.length > 50) return trimmed;
  } catch {}
  return null;
}

async function parseTakeoff(buffer, fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'xls'].includes(ext)) return null;
  try {
    const { parseTakeoffBuffer } = await import('@/lib/parseTakeoff.js');
    return parseTakeoffBuffer(buffer);
  } catch {
    return null;
  }
}

function parseTags(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function GET(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get('tab');

  const files = await prisma.projectFile.findMany({
    where: { projectId: params.id, ...(tab ? { tab } : {}) },
    include: { uploadedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ files });
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  if (!await canAccess(params.id, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const anthropic = new Anthropic({ apiKey: getAnthropicKey() });

  const formData = await request.formData();
  const file     = formData.get('file');
  const tab      = formData.get('tab');
  let tagsRaw  = formData.get('tags') || null;
  const tags   = parseTags(tagsRaw);

  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!VALID_TABS.includes(tab))         return NextResponse.json({ error: 'Invalid tab' },      { status: 400 });

  const bytes    = await file.arrayBuffer();
  const buffer   = Buffer.from(bytes);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const stored   = `${Date.now()}-${safeName}`;
  const dir      = path.join(process.cwd(), 'uploads', params.id, tab);

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, stored), buffer);

  let textContent  = null;
  let takeoffData  = null;
  let parsedAmount = null;

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    textContent = await extractPdfText(buffer);
  }

  if (tab === 'takeoffs') {
    const parsed = await parseTakeoff(buffer, file.name);
    if (parsed) takeoffData = JSON.stringify(parsed);
  }

  // ── Budgets: parse grand total + line items ────────────────────────────
  if (tab === 'budgets' && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
    if (textContent) {
      try {
        const { parseBudgetFields } = await import('@/lib/parseBudget.js');
        const fields = parseBudgetFields(textContent);
        if (fields.budgetTotal != null) parsedAmount = fields.budgetTotal;
      } catch {}
    }
    try {
      const { parseBudgetLineItemsFromBuffer } = await import('@/lib/parseBudgetLineItems.js');
      const lineItems = await parseBudgetLineItemsFromBuffer(buffer);
      if (lineItems.length > 0) takeoffData = JSON.stringify({ lineItems });
    } catch {}
  }

  // ── Contracts: tag-aware value/date extraction + COI expiry ──────────────
  let contractUpdate = null;
  if (tab === 'contracts' && textContent) {
    try {
      const { parseContractFields, parseCOIFields } = await import('@/lib/parseContract.js');
      const isCOI          = tags.includes('COI');
      const isDesignExec   = tags.some(t => /design.*executed/i.test(t) || /executed.*design/i.test(t));
      const isSupplyExec   = !isDesignExec && tags.some(t => /supply.*executed/i.test(t) || /executed.*supply/i.test(t));
      const isAnyExec      = !isDesignExec && !isSupplyExec && tags.some(t => t.toLowerCase().includes('executed'));
      const isSOV          = tags.includes('SOV');
      const update         = {};

      if (isCOI) {
        // COI — parse expiry date and embed in tags as "COI_EXPIRY:YYYY-MM-DD"
        const { expiryDate } = parseCOIFields(textContent);
        if (expiryDate) {
          const expiryTag = `COI_EXPIRY:${expiryDate}`;
          if (!tags.includes(expiryTag)) tags.push(expiryTag);
          tagsRaw = JSON.stringify(tags);
        }
      } else {
        const fields = parseContractFields(textContent);
        if (isDesignExec) {
          if (fields.contractValue      != null) update.designContractValue      = fields.contractValue;
          if (fields.contractSignedDate != null) update.designContractSignedDate = fields.contractSignedDate;
        } else if (isSupplyExec || isAnyExec) {
          if (fields.contractValue      != null) update.contractValue      = fields.contractValue;
          if (fields.contractSignedDate != null) update.contractSignedDate = fields.contractSignedDate;
        } else if (isSOV) {
          if (fields.contractValue != null) update.contractValue = fields.contractValue;
        }
      }

      if (Object.keys(update).length > 0) {
        await prisma.project.update({ where: { id: params.id }, data: update });
        contractUpdate = update;
      }
    } catch {}
  }

  // ── CA Change Orders: parse dollar amount per file ─────────────────────
  if (tab === 'ca' && tags.includes('Change Order') && textContent) {
    try {
      const { parseChangeOrderAmount } = await import('@/lib/parseContract.js');
      const amount = parseChangeOrderAmount(textContent);
      if (amount != null) parsedAmount = amount;
    } catch {}
  }

  // ── Design Info: Design Schedule AI milestone extraction ─────────────
  let designScheduleUpdate = null;
  if (tab === 'designInfo' && tags.includes('Design Schedule') && textContent) {
    try {
      const { extractDesignMilestonesWithAI } = await import('@/lib/parseDesignSchedule.js');
      const milestones = await extractDesignMilestonesWithAI(textContent);
      if (milestones && milestones.length > 0) {
        takeoffData          = JSON.stringify({ milestones });
        designScheduleUpdate = { milestones };
        // Persist to questionnaire responses so widget pre-populates on reload
        await prisma.questionnaireResponse.upsert({
          where:  { projectId_section_questionKey: { projectId: params.id, section: 'design-info', questionKey: 'designMilestones' } },
          update: { answerValue: JSON.stringify(milestones) },
          create: { projectId: params.id, section: 'design-info', questionKey: 'designMilestones', answerValue: JSON.stringify(milestones) },
        });
      }
    } catch {}
  }

  // ── CA Construction Schedule: row-structured, whole-document extraction ──
  let scheduleUpdate = null;
  if (tab === 'ca' && tags.includes('Construction Schedule')) {
    try {
      const { text: schedText, milestones } = await extractScheduleMilestones(buffer, anthropic);
      if (schedText) textContent = schedText; // store the clean row text
      if (milestones && milestones.length > 0) {
        takeoffData    = JSON.stringify({ milestones });
        scheduleUpdate = { milestones };
        // Legacy project-level date columns (rough-in may have -N suffix; pick earliest)
        const get = (id) => milestones.find(m => m.id === id)?.date ?? null;
        const getEarliest = (prefix) => {
          const dates = milestones
            .filter(m => m.id === prefix || m.id.startsWith(prefix + '-'))
            .map(m => m.date).filter(Boolean).sort();
          return dates[0] ?? null;
        };
        const start = get('construction-start');
        const mep   = getEarliest('mep-rough');
        const end   = get('construction-end');
        const cols = [], vals = [];
        if (start) { cols.push('"constructionStartDate" = ?'); vals.push(start); }
        if (mep)   { cols.push('"mepRoughInDate" = ?');        vals.push(mep); }
        if (end)   { cols.push('"constructionEndDate" = ?');   vals.push(end); }
        if (cols.length > 0) {
          vals.push(params.id);
          await prisma.$executeRawUnsafe(`UPDATE "Project" SET ${cols.join(', ')} WHERE "id" = ?`, ...vals);
        }
      }
    } catch (e) { console.error('[upload schedule extraction] failed:', e?.message ?? e); }
  }

  // Prepend YY.MM.DD date prefix for drawing and fixture-schedule uploads
  const DATE_PREFIX_TABS = new Set(['drawings', 'ca', 'fixture-schedule', 'designInfo']);
  function withDatePrefix(name) {
    if (/^\d\d\.\d\d\.\d\d/.test(name)) return name;
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yy}.${mm}.${dd} ${name}`;
  }
  const displayName = DATE_PREFIX_TABS.has(tab) ? withDatePrefix(file.name) : file.name;

  const record = await prisma.projectFile.create({
    data: {
      projectId:    params.id,
      tab,
      originalName: displayName,
      storedPath:   path.join(params.id, tab, stored),
      size:         buffer.length,
      mimeType:     file.type || null,
      tags:         tagsRaw   || null,
      textContent:  textContent,
      takeoffData:  takeoffData,
      parsedAmount: parsedAmount,
      uploadedById: user.id,
    },
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  const tabLabel = TAB_LABELS[tab] || tab;
  await logActivity(
    params.id,
    user,
    'file_upload',
    `Uploaded **${file.name}** to ${tabLabel}`,
    { fileId: record.id, fileName: file.name, tab, size: buffer.length },
  );

  // ── Notification triggers based on tab and tags ──────────────────────────
  try {
    if (tab === 'drawings') {
      sendNotification(params.id, 'DRAWINGS_UPLOADED', { fileName: file.name }).catch(() => {});
    } else if (tab === 'submittals') {
      sendNotification(params.id, 'SUBMITTAL_FILE_UPLOADED', { fileName: file.name }).catch(() => {});
    } else if (tab === 'contracts') {
      sendNotification(params.id, 'CONTRACT_UPLOADED', { fileName: file.name }).catch(() => {});
    } else if (tab === 'designInfo' && tags.includes('Design Schedule')) {
      sendNotification(params.id, 'DESIGN_SCHEDULE_UPLOADED', { fileName: file.name }).catch(() => {});
    } else if (tab === 'ca' && tags.includes('Change Order')) {
      sendNotification(params.id, 'CHANGE_ORDER_NEW', { fileName: file.name }).catch(() => {});
    }
  } catch {}

  return NextResponse.json({ file: record, contractUpdate, scheduleUpdate, designScheduleUpdate }, { status: 201 });
}
