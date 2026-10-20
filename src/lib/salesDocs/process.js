// Read an uploaded Sales Doc once, right after upload (0137): count pages, run
// the pricing guard, and for a workbook draw each shown sheet into a JSON file
// the share viewer serves. The upload route only stores the file; the browser
// then calls the process route, so neither request comes near the 30 second wall.
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { getSalesDocObject, putSalesDocObject, renderedSheetKey } from './storage.js';
import { scanPdfPages, scanWorkbook, shareAllowed } from './pricingScan.js';
import { renderWorkbook } from './renderXlsx.js';

const PDF_SCAN_MS = 20000;
const PDF_SCAN_PAGES = 500;
export const STALE_PROCESS_MS = 2 * 60 * 1000; // a PENDING this old can be started again

async function readPdf(buffer) {
  const { loadPdfjs, pdfDocOptions } = await import('@/lib/pdfjsNode.js');
  const pdfjsLib = await loadPdfjs();
  const doc = await pdfjsLib.getDocument(pdfDocOptions(buffer)).promise;
  try {
    const pageCount = doc.numPages;
    const started = Date.now();
    const pages = [];
    for (let i = 1; i <= Math.min(pageCount, PDF_SCAN_PAGES); i++) {
      if (Date.now() - started > PDF_SCAN_MS) break;
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => it.str).join(' '));
      page.cleanup();
    }
    return { pageCount, scan: scanPdfPages(pages), sheets: [], truncated: false };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

async function readWorkbook(buffer, docId, versionId) {
  // cellStyles is what makes SheetJS report hidden rows and columns.
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellStyles: true });
  const decode = XLSX.utils.decode_range;
  const scan = scanWorkbook(wb, decode);
  const rendered = renderWorkbook(wb, decode);
  for (const s of rendered) {
    if (!s.render) continue;
    await putSalesDocObject(renderedSheetKey(docId, versionId, s.index), Buffer.from(JSON.stringify(s.render)), 'application/json');
  }
  const sheets = rendered.map((s) => ({
    index: s.index,
    name: s.name,
    hidden: s.hidden,
    rowCount: s.render?.rowCount ?? 0,
    colCount: s.render?.colCount ?? 0,
    truncated: !!s.render?.truncated,
  }));
  return {
    pageCount: sheets.filter((s) => !s.hidden).length,
    scan,
    sheets,
    truncated: sheets.some((s) => s.truncated),
  };
}

function plainError(err, kind) {
  const m = String(err?.message || err || '');
  if (/password/i.test(m) || err?.name === 'PasswordException') {
    return `This ${kind === 'PDF' ? 'PDF' : 'workbook'} has a password. Remove it and upload again.`;
  }
  if (/Invalid PDF|zip|Unsupported|corrupt/i.test(m)) return 'This file could not be read. Save it again and upload.';
  return `Could not read this file: ${m.slice(0, 200)}`;
}

/**
 * Make a version the one links show, once it is read, clear to share, and the
 * newest. Until then links keep showing the last good version.
 * @returns {Promise<boolean>} true when the doc now points at this version
 */
export async function promoteIfReady(versionId, db = prisma) {
  const v = await db.salesDocVersion.findUnique({
    where: { id: versionId },
    select: { id: true, docId: true, version: true, processStatus: true, scanStatus: true },
  });
  if (!v || v.processStatus !== 'READY' || !shareAllowed(v.scanStatus)) return false;
  const newer = await db.salesDocVersion.count({ where: { docId: v.docId, version: { gt: v.version } } });
  if (newer) return false;
  await db.salesDoc.update({ where: { id: v.docId }, data: { currentVersionId: v.id } });
  return true;
}

/**
 * Process one version. Safe to call twice: the first caller claims it, a
 * second caller inside two minutes gets the current state back.
 * @returns {Promise<object>} the version row after processing
 */
export async function processVersion(versionId) {
  const staleBefore = new Date(Date.now() - STALE_PROCESS_MS);
  const claim = await prisma.salesDocVersion.updateMany({
    where: {
      id: versionId,
      processStatus: 'PENDING',
      OR: [{ processStartedAt: null }, { processStartedAt: { lt: staleBefore } }],
    },
    data: { processStartedAt: new Date() },
  });
  const version = await prisma.salesDocVersion.findUnique({ where: { id: versionId }, include: { doc: { select: { id: true, kind: true } } } });
  if (!version || claim.count === 0) return version;

  try {
    const buffer = await getSalesDocObject(version.storageKey);
    const out = version.doc.kind === 'XLSX'
      ? await readWorkbook(buffer, version.docId, version.id)
      : await readPdf(buffer);

    await prisma.$transaction([
      prisma.salesDocScanHit.deleteMany({ where: { versionId } }),
      prisma.salesDocSheet.deleteMany({ where: { versionId } }),
      ...(out.scan.hits.length ? [prisma.salesDocScanHit.createMany({
        data: out.scan.hits.slice(0, 200).map((h) => ({
          versionId, reason: h.reason, sheetName: h.sheetName ?? null, cell: h.cell ?? null, page: h.page ?? null, text: String(h.text).slice(0, 200),
        })),
      })] : []),
      ...(out.sheets.length ? [prisma.salesDocSheet.createMany({ data: out.sheets.map((s) => ({ versionId, ...s })) })] : []),
      prisma.salesDocVersion.update({
        where: { id: versionId },
        data: {
          pageCount: out.pageCount,
          truncated: out.truncated,
          scanStatus: out.scan.status,
          processStatus: 'READY',
          processError: null,
        },
      }),
    ]);
    await promoteIfReady(versionId);
  } catch (err) {
    console.error('[salesDocs] process failed', versionId, err?.message || err);
    await prisma.salesDocVersion.update({
      where: { id: versionId },
      data: { processStatus: 'FAILED', processError: plainError(err, version.doc.kind) },
    });
  }
  return prisma.salesDocVersion.findUnique({ where: { id: versionId } });
}
