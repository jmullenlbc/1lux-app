// Job Loader, the writing side (Mike 10-31). See jobLoader.js. No AI and no
// parsing here: the sheet already says what each file and record is. Every
// loader skips what is already there and reports the rest as
// { created, skipped, problems }, so one bad row never stops a run. Original
// dates go on the rows, so the job reads as it happened, not as loaded today.
import { recordBudgetAmount, BUDGET_TIERS } from '@/lib/budgetAmounts';
import { deriveShipmentStatus } from '@/lib/shipmentStatus';
import { logHistory } from '@/lib/recordHistory';
import { putProjectFile, keepProjectUpload } from '@/lib/projectFileStorage';
import { deleteUploadedObject, typesForScope } from '@/lib/uploadStorage';
import { saveQuote } from '@/lib/rfq/intakeQuote';
import { LINE_STATUS } from '@/lib/rfq/format';
import { lineTotal as moneyLine } from '@/lib/money';

const VALID_TABS = ['drawings', 'correspondence', 'submittals', 'ca', 'contracts', 'meetings', 'designInfo', 'takeoffs', 'budgets', 'fixture-schedule', 'unit-matrix', 'site-plan', 'rfqs'];
const DRAWING_TAGS = ['SD', 'DD', 'CD', 'IFC', 'ASI', 'RFI', 'PERMIT', 'OTHER'];
const PROJECT_FIELDS = {
  phase: ['sd', 'dd', 'cd', 'ifc', 'construction', 'closeout'],
  budgetType: ['conceptual', 'design', 'peer_review'],
  peerReviewMatrixType: ['PEER_REVIEW', 'DESIGN_BID'],
};
const RATE_FIELDS = ['freightPct', 'warehousingPct', 'salesTaxPct'];
const RFI_TYPES = ['DIMENSION', 'CLASH_RELOCATION', 'CONTROLS', 'DRAWING_CLARIFICATION', 'SUBSTITUTION', 'MULTI_QUESTION', 'ILC_INITIATED', 'OTHER'];
const RFI_ROUTING = ['DIRECT', 'THROUGH_ARCHITECT', 'REVIEW_ONLY'];
const RFI_STATUS = ['OPEN', 'IN_REVIEW', 'RESPONDED', 'CLOSED'];
const RFI_ANSWER_FILES = ['ILC_MARKUP', 'ASI', 'PRICING_DOC'];
const CO_STATUS = ['DRAFT', 'SENT', 'APPROVED'];
const REVIEW_STATUS = ['Approved', 'ApprovedAsNoted', 'Rejected', 'NotReviewed'];

const tally = () => ({ created: 0, skipped: 0, problems: [] });
const blank = v => (v === '' || v === undefined ? null : v);
const when = v => (v ? new Date(v) : null);
const dayOnly = v => (v ? String(v).slice(0, 10) : null);
const oneOf = (list, v, or) => (list.includes(v) ? v : or);

// What the project holds now, so the page can tell what still needs sending.
export async function heldFiles(db, projectId) {
  const [files, drawings] = await Promise.all([
    db.projectFile.findMany({ where: { projectId }, select: { id: true, tab: true, originalName: true, size: true } }),
    db.drawingFile.findMany({
      where: { submission: { projectId, archivedAt: null } },
      select: { id: true, submissionId: true, fileName: true, size: true },
    }),
  ]);
  return { projectId, files, drawings };
}

// One file. Comes either as an Amazon key (the bytes went straight there) or as
// a buffer (dev, where there is no Amazon). The name stays as it is on the drive.
export async function loadFile(db, user, projectId, row, { buffer = null, uploadKey = null }) {
  const name = String(row?.name || '');
  const tab = String(row?.tab || '');
  if (!name || !VALID_TABS.includes(tab)) {
    return { error: `${name || 'A file'} has tab "${tab}", which the app does not know. Fix the Tab column. (JOB_LOADER_BAD_TAB)` };
  }
  const size = Number(row.size) || buffer?.length || 0;
  const already = tab === 'drawings'
    ? await db.drawingFile.findFirst({ where: { fileName: name, size, submission: { projectId, archivedAt: null } }, select: { id: true } })
    : await db.projectFile.findFirst({ where: { projectId, tab, originalName: name, size }, select: { id: true } });
  if (already) {
    if (uploadKey) await deleteUploadedObject(uploadKey).catch(() => {});
    return { skipped: true };
  }

  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : 'bin';
  const contentType = typesForScope('knowledge')[ext] || 'application/octet-stream';
  const stored = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  let storedPath;
  let bytes = size;
  if (uploadKey) {
    ({ storedPath, size: bytes } = await keepProjectUpload(uploadKey, { projectId, tab, stored }));
    await deleteUploadedObject(uploadKey).catch(() => {});
  } else {
    storedPath = await putProjectFile(buffer, { projectId, tab, stored, contentType });
    bytes = buffer.length;
  }

  const tags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];
  const stamp = when(row.date);
  if (tab === 'drawings') {
    await db.drawingSubmission.create({
      data: {
        projectId, phaseTag: oneOf(DRAWING_TAGS, tags[0], 'OTHER'), source: row.source === 'INTERNAL' ? 'INTERNAL' : 'EXTERNAL',
        uploadedById: user.id, ...(stamp && { createdAt: stamp }),
        files: { create: [{ fileName: name, storedPath, size: bytes, mimeType: contentType }] },
      },
    });
    return { created: true };
  }
  await db.projectFile.create({
    data: {
      projectId, tab, originalName: name, storedPath, size: bytes, mimeType: contentType,
      tags: tags.length ? JSON.stringify(tags) : null, parsedAmount: row.amount ?? null,
      uploadedById: user.id, ...(stamp && { createdAt: stamp }),
    },
  });
  return { created: true };
}

export async function loadProject(db, user, projectId, rows) {
  const out = tally();
  const data = {};
  const rates = {};
  let specSection = null;
  for (const { field, value } of rows) {
    if (field === 'submittalSpecSection') { specSection = value; continue; }
    const rate = Number(value);
    if (RATE_FIELDS.includes(field) && value !== '' && rate >= 0 && rate < 1) rates[field] = rate;
    else if (PROJECT_FIELDS[field]?.includes(value)) data[field] = value;
    else out.problems.push(`Project tab: ${field} = ${value} is not something the app knows, so it was left alone.`);
  }
  if (Object.keys(data).length) await db.project.update({ where: { id: projectId }, data });
  if (specSection) {
    await db.submittalTracker.upsert({ where: { projectId }, create: { projectId, specSection }, update: { specSection } });
  }
  // Same two places the Project Data screen writes a rate.
  if (Object.keys(rates).length) {
    await db.projectData.upsert({ where: { projectId }, update: rates, create: { projectId, ...rates } });
    for (const [questionKey, rate] of Object.entries(rates)) {
      const key = { projectId, section: 'project-data', questionKey };
      await db.questionnaireResponse.upsert({
        where: { projectId_section_questionKey: key },
        update: { answerValue: String(rate) }, create: { ...key, answerValue: String(rate) },
      });
    }
  }
  out.created = Object.keys(data).length + Object.keys(rates).length + (specSection ? 1 : 0);
  return out;
}

const lineTotal = r => (r.qty != null && r.propUnitPrice != null ? moneyLine(r.qty, r.propUnitPrice) : null);

// The hub's Budget reads totalSavings on a Design Bid row, which the matrix keeps
// at qty x CN. One row per sheet row: a type with several parts keeps each part.
function matrixItem(projectId, r) {
  return {
    projectId, section: r.section, typeCode: r.typeCode, description: r.description, location: r.location,
    notes: r.notes, internalNotes: r.internalNotes, qty: r.qty, qtyType: r.qtyType, sortOrder: r.row,
    specManufacturer: blank(r.specManufacturer), specModel: blank(r.specModel),
    propManufacturer: blank(r.propManufacturer), propModel: blank(r.propModel),
    propUnitDN: r.propUnitDN, propUnitPrice: r.propUnitPrice, repName: blank(r.repName), repEmail: blank(r.repEmail),
    totalSavings: lineTotal(r),
  };
}

const scheduleItem = r => ({
  type: r.typeCode, location: r.location, description: r.description,
  manufacturer: blank(r.propManufacturer || r.specManufacturer), catalogNumber: blank(r.propModel || r.specModel),
  notes: blank(r.notes), internalNotes: blank(r.internalNotes), sortOrder: r.row,
});

const bidItem = r => ({
  type: r.typeCode, description: r.description, locationTag: r.section,
  manufacturer: blank(r.propManufacturer || r.specManufacturer), partNumber: blank(r.propModel || r.specModel),
  salesRep: blank(r.repName), qty: r.qty == null ? null : Math.round(r.qty),
  qtyType: r.qtyType, dnPerUnit: r.propUnitDN, cnPerUnit: r.propUnitPrice, cnTotal: lineTotal(r),
  notes: blank(r.notes), internalNotes: blank(r.internalNotes), sortOrder: r.row,
});

// Matrix rows, plus the schedule they would have come from: published v1, the
// fresh draft a publish always leaves, and the matching Design Bid matrix.
export async function loadMatrix(db, user, projectId, rows) {
  const out = tally();
  const have = await db.peerReviewItem.findMany({ where: { projectId }, select: { typeCode: true, sortOrder: true } });
  const seen = new Set(have.map(h => `${h.typeCode}|${h.sortOrder}`));
  const fresh = rows.filter(r => !seen.has(`${r.typeCode}|${r.row}`));
  out.skipped = rows.length - fresh.length;
  if (!fresh.length) return out;

  const schedules = await db.fixtureSchedule.findMany({
    where: { projectId }, select: { id: true, state: true, _count: { select: { items: true } } },
  });
  const draft = schedules.find(x => x.state === 'DRAFT');
  const leaveSchedule = schedules.some(x => x.state === 'PUBLISHED') || draft?._count.items > 0;
  if (leaveSchedule) out.problems.push('A fixture schedule with items is already on this job, so it was left as it is. The Budget Matrix rows still loaded.');

  await db.$transaction(async (tx) => {
    await tx.peerReviewItem.createMany({ data: fresh.map(r => matrixItem(projectId, r)) });
    if (leaveSchedule) return;
    const items = rows.map(scheduleItem);
    const stamp = { state: 'PUBLISHED', version: 1, publishedAt: new Date(), publishedById: user.id, items: { create: items } };
    const published = draft
      ? await tx.fixtureSchedule.update({ where: { id: draft.id }, data: stamp })
      : await tx.fixtureSchedule.create({ data: { projectId, ...stamp } });
    await tx.fixtureSchedule.create({ data: { projectId, state: 'DRAFT', version: 0, items: { create: items } } });
    const rate = await tx.projectData.findUnique({ where: { projectId }, select: { salesTaxPct: true, freightPct: true, warehousingPct: true, freightOverride: true, warehousingOverride: true } });
    await tx.designBidMatrix.create({
      data: {
        projectId, sourceScheduleId: published.id, version: 1, pushedById: user.id, matrixType: 'DESIGN_BID',
        salesTaxPct: rate?.salesTaxPct ?? null,
        freightPct: rate?.freightPct ?? 0.06,
        warehousingPct: rate?.warehousingPct ?? 0.03,
        freightOverride: rate?.freightOverride ?? null,
        warehousingOverride: rate?.warehousingOverride ?? null,
        items: { create: rows.map(bidItem) },
      },
    });
  }, { timeout: 30000 });
  out.created = fresh.length;
  return out;
}

const oldRfqTag = oldRfq => `Trackvia ${oldRfq}.`;
const findOldRfq = (db, projectId, oldRfq) => db.rfq.findFirst({
  where: { projectId, notes: { startsWith: oldRfqTag(oldRfq) } }, select: { id: true },
});

// The app gives each RFQ its next number, as if it had been sent from here, so a
// jump to the old Trackvia numbers never lands on the next real one. The old
// number stays at the front of the notes, which is also how a rerun finds it.
export async function loadRfqs(db, user, projectId, rows) {
  const out = tally();
  const items = await db.peerReviewItem.findMany({ where: { projectId }, select: { id: true, sortOrder: true } });
  const itemAt = new Map(items.map(i => [i.sortOrder, i.id]));

  for (const r of rows) {
    if (await findOldRfq(db, projectId, r.oldRfq)) { out.skipped += 1; continue; }
    const notes = r.notes.startsWith(oldRfqTag(r.oldRfq)) ? r.notes : `${oldRfqTag(r.oldRfq)} ${r.notes}`.trim();
    const sent = when(r.sentDate) || new Date();
    const lines = r.lines.map((l, i) => ({
      peerReviewItemId: itemAt.get(l.matrixRow) ?? null, typeCode: l.typeCode, manufacturer: l.manufacturer,
      partNumber: l.partNumber, qty: l.qty, sortOrder: i,
      ...(l.dnPrice != null && { dnPrice: l.dnPrice, priceSource: 'TYPED', receivedAt: when(l.receivedDate) || when(r.receivedDate) || sent }),
    }));
    out.problems.push(...r.lines.filter(l => l.matrixRow != null && !itemAt.has(l.matrixRow))
      .map(l => `${r.oldRfq}: Matrix Row ${l.matrixRow} (${l.typeCode}) is not on the Budget Matrix.`));

    for (let tries = 0; ; tries += 1) {
      try {
        await db.$transaction(async (tx) => {
          const top = await tx.rfq.aggregate({ _max: { number: true } });
          const rfq = await tx.rfq.create({
            data: {
              number: (top._max.number || 0) + 1, projectId, toName: r.toName || 'Unknown', sentTo: r.sentTo,
              needBy: when(r.needBy) || sent, notes, sentById: user.id, sentByName: user.name || user.email,
              status: r.status === 'RECEIVED' ? 'RECEIVED' : 'SENT', receivedAt: when(r.receivedDate), createdAt: sent,
              lines: { create: lines },
            },
          });
          for (const l of lines) {
            if (!l.peerReviewItemId) continue;
            await tx.peerReviewItem.updateMany({
              where: { id: l.peerReviewItemId },
              data: { repName: r.toName || null, repEmail: blank(r.sentTo), rfqStatus: l.dnPrice != null ? LINE_STATUS.RECEIVED : LINE_STATUS.SENT },
            });
          }
          await logHistory({ entityType: 'RFQ', entityId: rfq.id, action: 'SEND', user, db: tx, note: `Loaded from the job folder. ${oldRfqTag(r.oldRfq)}` });
        }, { timeout: 30000 });
        break;
      } catch (e) {
        if (e?.code !== 'P2002' || tries >= 3) throw e;
      }
    }
    out.created += 1;
  }
  return out;
}

// Quotes go through the same save as a dropped quote, minus the AI read, so they
// match to lines the same way. Sent oldest first, so the newest price wins.
export async function loadQuotes(db, user, projectId, rows) {
  const out = tally();
  for (const q of rows) {
    const there = await db.rfqQuote.findFirst({
      where: { projectId, fileName: q.fileName, quoteNumber: q.quoteNumber || null }, select: { id: true },
    });
    if (there) { out.skipped += 1; continue; }
    const rfq = q.oldRfq ? await findOldRfq(db, projectId, q.oldRfq) : null;
    if (q.oldRfq && !rfq) out.problems.push(`${q.fileName}: ${q.oldRfq} is not on this job, so the quote matched across every RFQ.`);
    const res = await saveQuote({
      projectId, user, rfqId: rfq?.id ?? null, fileId: q.fileId ?? null, source: 'DROP', fileName: q.fileName,
      quoteNumber: q.quoteNumber, fromName: q.fromName, fromEmail: q.fromEmail, quoteDate: q.quoteDate, total: q.total, lines: q.lines,
    });
    if (res.error) { out.problems.push(`${q.fileName}: ${res.error}`); continue; }
    out.created += 1;

    // saveQuote stamps today. Put the quote's own date back.
    const stamp = when(q.quoteDate);
    if (!stamp) continue;
    await db.rfqQuote.update({ where: { id: res.quote.id }, data: { createdAt: stamp } });
    const priced = res.quote.lines.filter(l => l.status === 'AUTO' && l.rfqLineId).map(l => l.rfqLineId);
    if (priced.length) await db.rfqLine.updateMany({ where: { id: { in: priced } }, data: { receivedAt: stamp } });
    if (rfq) await db.rfq.updateMany({ where: { id: rfq.id, receivedAt: { not: null } }, data: { receivedAt: stamp } });
  }
  return out;
}

export async function loadRfis(db, user, projectId, rows) {
  const out = tally();
  for (const r of rows) {
    if (await db.rFI.findFirst({ where: { projectId, rfiNumber: r.number }, select: { id: true } })) { out.skipped += 1; continue; }
    const received = when(r.received) || new Date();
    const answered = when(r.responseDate) || received;
    const att = f => ({ fileUrl: f.url, fileName: f.name, attachmentType: f.type || 'OTHER' });
    const asked = r.files.filter(f => !r.response || !RFI_ANSWER_FILES.includes(f.type));
    const replied = r.response ? r.files.filter(f => RFI_ANSWER_FILES.includes(f.type)) : [];
    await db.rFI.create({
      data: {
        projectId, rfiNumber: r.number, subject: r.subject || r.number, receivedFrom: r.from || 'Unknown',
        rfiType: oneOf(RFI_TYPES, r.type, 'OTHER'), routingMode: oneOf(RFI_ROUTING, r.routing, 'DIRECT'),
        status: oneOf(RFI_STATUS, r.status, 'OPEN'), dateReceived: received, dateDue: when(r.due), closedAt: when(r.closed),
        draftStatus: 'NONE', createdAt: received,
        activities: {
          create: [
            {
              direction: 'INBOUND', authoredBy: r.from || 'Unknown', bodyText: r.question || r.subject || r.number,
              sentAt: received, createdAt: received, attachments: { create: asked.map(att) },
            },
            ...(r.response ? [{
              direction: 'OUTBOUND', authoredBy: r.responseBy || 'ILC Studios', bodyText: r.response,
              sentAt: answered, createdAt: answered, attachments: { create: replied.map(att) },
            }] : []),
          ],
        },
      },
    });
    out.created += 1;
  }
  return out;
}

// A whole percent, 8.45 for 8.45%. 0 is real, a tax only change order has no tax of its own.
const fairTax = v => v === 0 || (v >= 1 && v <= 25);

export async function loadChangeOrders(db, user, projectId, rows) {
  const out = tally();
  const job = await db.projectData.findUnique({ where: { projectId }, select: { salesTaxPct: true, freightPct: true, warehousingPct: true } });
  const rate = job?.salesTaxPct ?? null;
  const fees = { freightPct: job?.freightPct ?? 0.06, warehousingPct: job?.warehousingPct ?? 0.03 };
  for (const c of rows) {
    if (await db.changeOrder.findFirst({ where: { projectId, coNumber: c.number }, select: { id: true } })) { out.skipped += 1; continue; }

    // One change order per RFI in the app, so a second one loads without the link.
    let rfiId = null;
    if (c.rfi) {
      const rfi = await db.rFI.findFirst({ where: { projectId, rfiNumber: c.rfi }, select: { id: true, changeOrder: { select: { coNumber: true } } } });
      if (!rfi) out.problems.push(`${c.number}: ${c.rfi} is not on this job, so the link was left off.`);
      else if (rfi.changeOrder) out.problems.push(`${c.number}: ${c.rfi} already links to ${rfi.changeOrder.coNumber}, so the link was left off.`);
      else rfiId = rfi.id;
    }
    const stamp = when(c.date) || new Date();
    const groups = c.options.length ? c.options : [{ label: 'Default', isSelected: true, lines: [] }];
    const discount = {
      discountPct: c.discountPct != null ? c.discountPct / 100 : null,
      discountAmount: c.discountPct != null ? null : (c.discountAmount ?? null),
      discountNote: blank(c.discountNote),
    };
    const takesDiscount = groups.find(o => o.isSelected) || (groups.length === 1 ? groups[0] : null);
    const status = oneOf(CO_STATUS, c.status, 'DRAFT');
    const ownTax = c.salesTaxPct != null && fairTax(c.salesTaxPct) ? Math.round(c.salesTaxPct * 1e4) / 1e6 : null;
    if (c.salesTaxText && ownTax == null) out.problems.push(`${c.number}: sales tax "${c.salesTaxText}" is not a percent like 8.45, so it took the job rate.`);
    if (!takesDiscount && (c.discountAmount != null || c.discountPct != null)) out.problems.push(`${c.number}: no option is chosen, so the discount was left off.`);
    await db.changeOrder.create({
      data: {
        projectId, coNumber: c.number, title: c.title || c.number, date: stamp, status, salesTaxPct: ownTax ?? (status === 'DRAFT' ? rate : (rate ?? 0)), ...(status !== 'DRAFT' && fees),
        notes: blank(c.notes), createdById: user.id, createdAt: stamp, rfiId,
        ...(status === 'APPROVED' && {
          approvals: { create: { action: 'APPROVED', via: 'STAFF', userId: user.id, note: 'Loaded with Job Loader', optionLabel: takesDiscount?.label ?? null, createdAt: stamp } },
        }),
        optionGroups: {
          create: groups.map((o, i) => ({
            label: o.label, sortOrder: i, isSelected: o.isSelected || groups.length === 1,
            ...(o === takesDiscount && discount),
            lineItems: {
              create: o.lines.map(l => ({
                sortOrder: l.sortOrder, fixtureType: l.fixtureType, qty: l.qty, manufacturer: blank(l.manufacturer),
                partNumber: blank(l.partNumber), description: blank(l.description), cnUnitPrice: l.cnUnitPrice,
                quoteReference: blank(l.quoteReference), leadTime: blank(l.leadTime), notes: blank(l.notes),
              })),
            },
          })),
        },
      },
    });
    out.created += 1;
  }
  return out;
}

const shipKey = (manufacturer, poDate, tracking, firstType, count) =>
  [manufacturer, dayOnly(poDate?.toISOString?.() ?? poDate), tracking || '', firstType || '', count].join('|').toLowerCase();

export async function loadShipments(db, user, projectId, rows) {
  const out = tally();
  const have = await db.shipment.findMany({
    where: { project_id: projectId },
    select: { manufacturer: true, poDate: true, trackingNumber: true, lineItems: { select: { fixtureType: true, sortOrder: true } } },
  });
  const seen = new Set(have.map((h) => {
    const first = [...h.lineItems].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    return shipKey(h.manufacturer, h.poDate, h.trackingNumber, first?.fixtureType, h.lineItems.length);
  }));
  for (const r of rows) {
    if (seen.has(shipKey(r.manufacturer, r.poDate, r.trackingNumber, r.lines[0]?.fixtureType, r.lines.length))) { out.skipped += 1; continue; }
    const dates = { poDate: when(r.poDate), esdDate: when(r.esdDate), deliveredDate: when(r.deliveredDate) };
    await db.shipment.create({
      data: {
        project_id: projectId, manufacturer: r.manufacturer, ...dates, leadTimeWeeks: blank(r.leadTimeWeeks),
        trackingNumber: blank(r.trackingNumber), destinationType: oneOf(['WAREHOUSE', 'DIRECT_TO_SITE'], r.destinationType, 'WAREHOUSE'),
        // Status is never set by hand, the same rule as every other shipment.
        status: deriveShipmentStatus({ ...dates, leadTimeWeeks: blank(r.leadTimeWeeks), trackingNumber: blank(r.trackingNumber) }),
        notes: blank(r.notes),
        lineItems: {
          create: r.lines.map((l, i) => ({
            fixtureType: l.fixtureType, description: l.description, catalogNo: blank(l.catalogNo), qty: l.qty,
            qtyType: blank(l.qtyType), fixtureStatus: blank(l.fixtureStatus), notes: blank(l.notes), sortOrder: i, sourceType: 'MANUAL',
          })),
        },
      },
    });
    out.created += 1;
  }
  return out;
}

const trackerFor = (db, projectId) => db.submittalTracker.upsert({
  where: { projectId }, create: { projectId }, update: {}, select: { id: true },
});

export async function loadSubmittalItems(db, user, projectId, rows) {
  const out = tally();
  const tracker = await trackerFor(db, projectId);
  const have = await db.submittalItem.findMany({ where: { trackerId: tracker.id, archivedAt: null }, select: { typeCode: true } });
  const seen = new Set(have.map(h => h.typeCode.toLowerCase()));
  const fresh = rows.filter(r => !seen.has(r.typeCode.toLowerCase()));
  if (fresh.length) {
    await db.submittalItem.createMany({
      data: fresh.map((r, i) => ({ trackerId: tracker.id, typeCode: r.typeCode, description: r.description, location: r.location, sortOrder: have.length + i })),
    });
  }
  out.created = fresh.length;
  out.skipped = rows.length - fresh.length;
  return out;
}

export async function loadSubmissions(db, user, projectId, rows) {
  const out = tally();
  const tracker = await trackerFor(db, projectId);
  const items = await db.submittalItem.findMany({ where: { trackerId: tracker.id, archivedAt: null }, select: { id: true, typeCode: true } });
  const itemId = new Map(items.map(i => [i.typeCode.toLowerCase(), i.id]));
  for (const sub of rows) {
    if (await db.submittalSubmission.findFirst({ where: { trackerId: tracker.id, name: sub.name, archivedAt: null }, select: { id: true } })) {
      out.skipped += 1;
      continue;
    }
    const known = sub.versions.filter((v) => {
      if (itemId.has(v.typeCode.toLowerCase())) return true;
      out.problems.push(`${sub.name}: type ${v.typeCode} is not on the Submittal items tab, so it was left off.`);
      return false;
    });
    await db.submittalSubmission.create({
      data: {
        trackerId: tracker.id, name: sub.name, submittedDate: blank(sub.date), notes: blank(sub.notes),
        versions: {
          create: known.map(v => ({
            itemId: itemId.get(v.typeCode.toLowerCase()), manufacturer: v.manufacturer, modelNumber: v.modelNumber,
            reviews: {
              create: v.reviews.map(x => ({
                reviewerRole: x.reviewerRole, reviewerName: blank(x.reviewerName), status: oneOf(REVIEW_STATUS, x.status, 'NotReviewed'),
                dateNoted: blank(x.dateNoted), notes: blank(x.notes), noteCategory: blank(x.noteCategory), pageNumber: x.pageNumber,
                isExtracted: true, createdById: user.id,
              })),
            },
          })),
        },
      },
    });
    out.created += 1;
  }
  return out;
}

// Sent oldest first: each new figure retires the one before it, the same as the
// app does when a Budget file lands, so the ladder ends on today's number.
export async function loadBudgets(db, user, projectId, rows) {
  const out = tally();
  for (const b of rows) {
    if (!BUDGET_TIERS.includes(b.tier) || b.amount == null) {
      out.problems.push(`${b.name}: tier "${b.tier}" or amount "${b.amount}" is not usable, so this row was left off.`);
      continue;
    }
    const there = await db.projectBudgetAmount.findFirst({
      where: { projectId, tier: b.tier, amount: b.amount, fileId: b.fileId ?? null }, select: { id: true },
    });
    if (there) { out.skipped += 1; continue; }
    const stamp = when(b.date) || new Date();
    const row = await recordBudgetAmount(db, {
      projectId, tier: b.tier, amount: b.amount, source: b.tier === 'po' ? 'po-file' : 'budget-file',
      fileId: b.fileId ?? null, note: blank(b.note) ?? blank(b.name), recordedById: user.id, now: stamp,
    });
    if (!row) { out.problems.push(`${b.name}: the app would not take this figure.`); continue; }
    await db.projectBudgetAmount.update({ where: { id: row.id }, data: { createdAt: stamp } });
    out.created += 1;
  }
  return out;
}

const hasTag = (file, tag) => { try { return JSON.parse(file.tags || '[]').includes(tag); } catch { return false; } };

// Both schedule cards keep one whole list, so these replace rather than add.
// The Construction card only reads the newest tagged file, and runs an AI read
// when that file has no milestones, so they go on that exact file.
export async function loadMilestones(db, user, projectId, rows) {
  const out = tally();
  const pick = kind => rows.filter(r => r.kind === kind).map(r => ({ id: r.id, label: r.label, date: dayOnly(r.date) }));
  const design = pick('design');
  const construction = pick('construction');

  if (design.length) {
    const answerValue = JSON.stringify(design);
    await db.questionnaireResponse.upsert({
      where: { projectId_section_questionKey: { projectId, section: 'design-info', questionKey: 'designMilestones' } },
      update: { answerValue }, create: { projectId, section: 'design-info', questionKey: 'designMilestones', answerValue },
    });
    out.created += design.length;
  }
  if (!construction.length) return out;

  const ca = await db.projectFile.findMany({ where: { projectId, tab: 'ca' }, select: { id: true, tags: true, takeoffData: true, createdAt: true } });
  const newest = ca.filter(f => hasTag(f, 'Construction Schedule')).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!newest) {
    out.problems.push('No file on the job is tagged Construction Schedule, so the construction dates were left off. Load that file, then press Continue.');
    return out;
  }
  let kept = {};
  try { kept = JSON.parse(newest.takeoffData || '{}') || {}; } catch { kept = {}; }
  await db.projectFile.update({ where: { id: newest.id }, data: { takeoffData: JSON.stringify({ ...kept, milestones: construction }) } });

  const on = id => construction.find(m => m.id === id)?.date ?? null;
  const mep = construction.filter(m => (m.id === 'mep-rough' || m.id.startsWith('mep-rough-')) && m.date).map(m => m.date).sort()[0] ?? null;
  await db.project.update({
    where: { id: projectId },
    data: { constructionStartDate: on('construction-start'), mepRoughInDate: mep, constructionEndDate: on('construction-end') },
  });
  out.created += construction.length;
  return out;
}

export const LOADERS = {
  project: loadProject, matrix: loadMatrix, rfqs: loadRfqs, quotes: loadQuotes, rfis: loadRfis,
  changeOrders: loadChangeOrders, shipments: loadShipments, submittalItems: loadSubmittalItems,
  submissions: loadSubmissions, budgets: loadBudgets, milestones: loadMilestones,
};
