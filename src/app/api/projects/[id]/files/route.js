import '@/lib/pdfPolyfill';
import { loadPdfjs } from '@/lib/pdfjsNode';
import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { putProjectFile } from '@/lib/projectFileStorage';
import { readUploadedFile } from '@/lib/uploadIntake';
import { logActivity, TAB_LABELS } from '@/lib/activity';
import { sendNotification } from '@/lib/notify';

// The upload itself is quick: store the bytes, pull the text layer, write the
// row. The two schedule reads that used to run in here (design milestones and
// construction milestones) ran past Amplify's ~30-second front door on a real
// P6 export, so they now live in files/[fileId]/reparse behind park-and-poll,
// and the browser starts that read the moment the upload row comes back
// (src/lib/scheduleReadClient.js). Text extraction on a big set still needs
// more than the default.
export const maxDuration = 120;

const VALID_TABS = ['drawings', 'correspondence', 'submittals', 'ca', 'contracts', 'meetings', 'designInfo', 'takeoffs', 'budgets', 'fixture-schedule', 'unit-matrix', 'site-plan'];

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  return canSeeAllData(user) || project.createdById === user.id;
}

async function extractPdfText(buffer) {
  try {
    const pdfjsLib = await loadPdfjs();
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

  const formData = await request.formData();
  const tab      = formData.get('tab');
  let tagsRaw  = formData.get('tags') || null;
  const tags   = parseTags(tagsRaw);

  if (!VALID_TABS.includes(tab)) return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });

  // The bytes arrive one of two ways — as a multipart body (small files, and
  // local dev), or already sitting in S3 because the browser sent them straight
  // there to get past Amplify's ~4.4 MB front door. readUploadedFile hides the
  // difference; from here down nothing knows or cares which it was.
  const upload = await readUploadedFile(formData);
  if (!upload.ok) return NextResponse.json({ error: upload.message }, { status: upload.status });

  const file = { name: upload.name, type: upload.type };
  const buffer = upload.buffer;

  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const stored    = `${Date.now()}-${safeName}`;
  const storedKey = await putProjectFile(buffer, { projectId: params.id, tab, stored, contentType: file.type || 'application/octet-stream' });

  // The staging copy under uploads/ has done its job. Best-effort — the 1-day
  // lifecycle rule on that prefix is the backstop if this misses.
  await upload.cleanup();

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
  let poAmount = null; // a signed supply contract is the "Signed PO" step (0116)
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
          if (fields.contractValue      != null) poAmount = fields.contractValue;
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

  // Schedule milestones (Design Schedule on Design Info, Construction Schedule
  // on CA) are no longer read here. Both come back null and the browser asks
  // files/[fileId]/reparse for them right after this returns — see
  // src/lib/scheduleReadClient.js. The response shape is unchanged.
  const designScheduleUpdate = null;
  const scheduleUpdate       = null;

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
      storedPath:   storedKey,
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

  // The number ladder (0116): a budget PDF's total is the Budget step, a
  // signed supply contract's value is the Signed PO step. Never fatal.
  try {
    const { recordBudgetAmount } = await import('@/lib/budgetAmounts.js');
    if (tab === 'budgets' && parsedAmount != null) {
      await recordBudgetAmount(prisma, { projectId: params.id, tier: 'budget', amount: parsedAmount, source: 'budget-file', fileId: record.id, recordedById: user.id });
    }
    if (poAmount != null) {
      await recordBudgetAmount(prisma, { projectId: params.id, tier: 'po', amount: poAmount, source: 'po-file', fileId: record.id, recordedById: user.id });
    }
  } catch (e) {
    console.error('[files] budget number not saved (non-fatal):', e?.message || e);
  }

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
