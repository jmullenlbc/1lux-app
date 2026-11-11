// Whose name is on a page, a PDF or an email (Jason, 2026-11-10). The staff app is 1LUX. Anything a client sees
// carries the job's company (LOGIQ, SAGE or Shift, migration 0165); a job with no company yet carries 1LUX.
// A company's legal name, address, phone and email come from its BusinessUnit row (Admin → Companies); a blank
// detail is simply left off. Import-free apart from the company list, so screens can use it too.
import { spaceOf } from './companySpaces.js';

export const APP_NAME = '1LUX';

/** The brand when no company applies: the staff app, and jobs with no company yet. */
export const DEFAULT_BRAND = Object.freeze({
  code: null, name: APP_NAME, legalName: APP_NAME, address: '', phone: '', email: '', website: '',
});

// One line: line breaks become ", " (without doubling a comma that was already typed).
const clean = (v) => String(v ?? '').replace(/\s*,?\s*\r?\n\s*/g, ', ').replace(/^,\s*|,\s*$/g, '').trim();

/**
 * A brand from a BusinessUnit row (or anything with businessUnitId / code). null or unknown = 1LUX.
 * Pass the row when you have it: the name and details people typed in Admin win over the built-in list.
 */
export function brandFor(unit) {
  if (!unit) return DEFAULT_BRAND;
  const space = spaceOf(unit.id || unit.code || unit.businessUnitId);
  if (!space && !unit.name) return DEFAULT_BRAND;
  const name = clean(unit.name) || space?.label || APP_NAME;
  return {
    code:      space?.code || unit.code || null,
    name,
    legalName: clean(unit.legalName) || name,
    address:   clean(unit.address),
    phone:     clean(unit.phone),
    email:     clean(unit.ordersEmail ?? unit.email),
    website:   clean(unit.website),
  };
}

/** The name a document is from: the legal name when there is one. */
export const docName = (brand) => brand?.legalName || brand?.name || APP_NAME;

/** "Name | address | phone | email", leaving off anything blank. */
export function contactLine(brand, { withName = true } = {}) {
  return [withName ? docName(brand) : '', brand?.address, brand?.phone, brand?.email].filter(Boolean).join(' | ');
}

/** The confidential footer on client PDFs. */
export const confidentialLine = (brand) => `Confidential: ${contactLine(brand)}`;

/** Subject prefix on notification emails, e.g. "[SAGE]". */
export const subjectTag = (brand) => `[${brand?.name || APP_NAME}]`;
