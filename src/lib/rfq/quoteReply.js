// What the AI read of a rep quote comes back as (Mike 10-30). Pure, no SDK or
// database, so the tests can feed it odd answers. The shape matches what the
// spreadsheet reader gives the check screen, so a person checks both the same way.
import { normalizeTag } from '../bidLeveling/normalizeTag.js';
import { toNumber } from '../matrixImport/readMatrix.js';

const TOTAL_KEYS = ['FIXTURES', 'CONTROLS', 'FREIGHT', 'WAREHOUSING', 'SPARES', 'TAX', 'GRAND'];
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) ? String(v).trim() : '');
const amount = (v) => {
  const n = toNumber(v);
  return n == null || n < 0 ? null : n;
};
// A $0 row is a budget item or a row the quote left out, not a free fixture.
const price = (v) => amount(v) || null;

const NOT_READ = 'We read the file, but the answer came back garbled, so nothing was saved. This is on our side, not the file. Press Try again. (RFQ_READ_GARBLED)';
const NO_LINES = 'We read this file and found no quote lines on it, so nothing was saved. If it is not a quote, skip it. If it is, press Type it by hand. (RFQ_READ_NO_LINES)';

/** The AI's reply text to { ok, lines, totals, info, bidderName, notesRaw }, or { ok: false, message }. */
export function parseQuoteReply(raw) {
  const reply = String(raw ?? '');
  const from = reply.indexOf('{');
  const to = reply.lastIndexOf('}');
  if (from < 0 || to <= from) return { ok: false, message: NOT_READ };
  let got;
  try { got = JSON.parse(reply.slice(from, to + 1)); } catch { return { ok: false, message: NOT_READ }; }

  const lines = [];
  (Array.isArray(got.lines) ? got.lines : []).forEach((l) => {
    const typeTagRaw = text(l?.typeTag, 40);
    const description = text(l?.description, 500);
    const mfr = text(l?.mfr, 120);
    const catalog = text(l?.catalog, 200);
    if (!typeTagRaw && !catalog && !description) return;
    const t = typeTagRaw ? normalizeTag(typeTagRaw, { description, catalog, mfr }) : { typeTag: '', variant: '', lengthFt: null };
    const uom = String(l?.uom ?? '').trim().toUpperCase();
    lines.push({
      typeTagRaw, typeTag: t.typeTag, variant: t.variant, lengthFt: t.lengthFt, description, mfr, catalog,
      qty: amount(l?.qty), uom: ['EA', 'LF', 'LOT'].includes(uom) ? uom : 'EA',
      unitPrice: price(l?.unitPrice), extPrice: price(l?.extPrice),
      optionGroup: 'BASE', section: '', sourceRow: lines.length + 1,
    });
  });
  if (!lines.length) return { ok: false, message: NO_LINES };

  const totals = {};
  TOTAL_KEYS.forEach((k) => {
    const n = amount(got.totals?.[k]);
    if (n != null) totals[k] = n;
  });
  return {
    ok: true,
    lines,
    totals,
    info: { quoteNumber: text(got.quoteNumber, 80), quoteDate: day(got.quoteDate), expiresAt: day(got.expiresAt) },
    bidderName: text(got.bidderName, 200),
    notesRaw: text(got.notes, 4000),
  };
}

/** One plain sentence for a failed AI call. The file is already on the project by then. */
export function quoteReadFailure(e) {
  const status = e?.status ?? null;
  const saved = 'The file is saved on the project.';
  if (/credit balance/i.test(e?.message ?? '')) {
    return `Our quote reader is switched off because the AI account is out of credit. This is on our side, not the file. ${saved} Add credit, then press Try again. (RFQ_READ_CREDIT)`;
  }
  if (status === 401 || status === 403) {
    return `Our quote reader could not sign in to the AI service. This is on our side, not the file. ${saved} Check the AI key on Admin, then press Try again. (RFQ_READ_${status})`;
  }
  if (status === 429 || status >= 500) {
    return `The AI service is busy or having trouble. This is on their side, not the file. ${saved} Wait a minute, then press Try again. (RFQ_READ_${status})`;
  }
  if (status) {
    return `The AI service would not take this file as it is. ${saved} Press Try again once. If it fails again, press Type it by hand. (RFQ_READ_${status})`;
  }
  return `Our quote reader lost its connection partway through. This is on our side, not the file. ${saved} Press Try again. (RFQ_READ_LOST)`;
}
