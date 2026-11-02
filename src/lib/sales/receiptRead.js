import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { getAnthropicKey } from '@/lib/anthropicKey';
import { wrapClient } from '@/lib/agent/client';
import { modelParams, answerBudget, textFrom, warnIfTruncated } from '@/lib/aiModels';
import { buildUntrustedPrompt, warnOnInjection, ATTACHED_DOCUMENT_RULE } from '@/lib/agent/untrusted';
import { jobError } from '@/lib/parkedJob';
import { getSalesDocObject } from '@/lib/salesDocs/storage';
import {
  parseReceiptReply, receiptReadFailure, receiptExt,
  MAX_RECEIPT_IMAGE_BYTES, MAX_RECEIPT_PDF_BYTES,
} from './receipts.js';

const JOB = 'expense.receiptRead';

const PROMPT = `You copy what a receipt says into JSON. You never work out, correct or invent a value.`;

const INSTRUCTIONS = `Answer with one JSON object and nothing else: {"vendor": string or null, "total": number or null, "date": "YYYY-MM-DD" or null, "category": one of MEAL, TRAVEL, GOLF, EVENT, GIFT, OTHER or null}.
vendor: the business name on the receipt.
total: the final amount paid including tax and tip. If there is a handwritten total use it. If there is a subtotal and a total use the total. Numbers carry no currency signs or commas.
date: the date of the purchase.
category: MEAL for food, coffee or bars. TRAVEL for flights, hotels, rental cars, rideshare, parking or fuel. GOLF for golf. EVENT for event tickets or registrations. GIFT for gifts. OTHER for anything else.
Use null for anything the receipt does not show. Never guess.`;

async function sheetText(buffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return wb.SheetNames.map((name) => `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`).join('\n\n');
}

// The request for each kind of file. An Excel file goes as text behind the
// untrusted seal; pictures and PDFs go as attachments.
async function requestFor(row, buffer) {
  const ext = receiptExt(row.fileName, row.mimeType);
  if (ext === 'jpg' || ext === 'png') {
    if (buffer.length > MAX_RECEIPT_IMAGE_BYTES) {
      throw jobError(422, { ok: false, message: 'That photo is too big for the reader. The receipt is saved. Type the numbers by hand. (RECEIPT_IMAGE_TOO_BIG)' });
    }
    return {
      system: `${PROMPT}\n\n${ATTACHED_DOCUMENT_RULE}`,
      content: [
        { type: 'image', source: { type: 'base64', media_type: row.mimeType, data: buffer.toString('base64') } },
        { type: 'text', text: INSTRUCTIONS },
      ],
    };
  }
  if (ext === 'pdf') {
    if (buffer.length > MAX_RECEIPT_PDF_BYTES) {
      throw jobError(422, { ok: false, message: 'That PDF is too big for the reader. The receipt is saved. Type the numbers by hand. (RECEIPT_PDF_TOO_BIG)' });
    }
    return {
      system: `${PROMPT}\n\n${ATTACHED_DOCUMENT_RULE}`,
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
        { type: 'text', text: INSTRUCTIONS },
      ],
    };
  }
  const sealed = buildUntrustedPrompt({
    instructions: INSTRUCTIONS,
    system: PROMPT,
    documents: [{ text: await sheetText(buffer), descriptor: row.fileName, maxChars: 60000 }],
  });
  warnOnInjection(JOB, row.id, sealed);
  return { system: sealed.system, content: [{ type: 'text', text: sealed.content }] };
}

// Reads one stored receipt onto its own row. Nothing here creates an expense:
// that waits for a person to say OK.
export async function readStoredReceipt({ receiptId, user }) {
  const row = await prisma.expenseReceipt.findFirst({ where: { id: receiptId, userId: user.id, archivedAt: null } });
  if (!row) throw jobError(404, { ok: false, message: 'That receipt is not on your list any more. Nothing was read. (RECEIPT_GONE)' });
  if (row.expenseId) throw jobError(409, { ok: false, message: 'This receipt is already on a saved expense. Nothing was read. (RECEIPT_ALREADY_SAVED)' });

  await prisma.expenseReceipt.update({ where: { id: row.id }, data: { aiStatus: 'READING', aiError: null } });

  const fail = async (status, payload) => {
    await prisma.expenseReceipt.update({ where: { id: row.id }, data: { aiStatus: 'FAILED', aiError: payload.message } });
    return jobError(status, payload);
  };

  let message;
  try {
    const buffer = await getSalesDocObject(row.storedKey);
    const { system, content } = await requestFor(row, buffer);
    const client = wrapClient(new Anthropic({ apiKey: await getAnthropicKey() }), JOB, { userId: user.id });
    message = await client.messages.stream({
      ...modelParams(JOB),
      max_tokens: answerBudget(JOB, 1000),
      system,
      messages: [{ role: 'user', content }],
    }).finalMessage();
  } catch (e) {
    if (e?.isJobError) throw await fail(e.status, e.payload);
    throw await fail(502, { ok: false, message: receiptReadFailure(e) });
  }

  if (warnIfTruncated(message, JOB)) {
    throw await fail(422, { ok: false, message: 'The reader ran out of room on this receipt. The receipt is saved. Press Try again, or type the numbers by hand. (RECEIPT_READ_CUT_OFF)' });
  }
  const read = parseReceiptReply(textFrom(message));
  if (!read.ok) throw await fail(422, read);

  const receipt = await prisma.expenseReceipt.update({
    where: { id: row.id },
    data: {
      aiStatus: 'READ',
      aiError: null,
      aiVendor: read.vendor,
      aiAmountCents: read.amountCents,
      aiSpentOn: read.spentOn ? new Date(`${read.spentOn}T12:00:00.000Z`) : null,
      aiCategory: read.category,
    },
  });
  return { ok: true, receipt };
}
