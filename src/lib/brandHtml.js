// The brand mark at the top of server-made PDFs and emails (2026-11-10). No company has a logo file yet except
// Logiq (from Mike's public budget tool), so everyone else gets their name as a bold wordmark. The Logiq logo is
// inline (a data URI) so a PDF needs no network and no runtime file. Server-only: the data URI is large.
import { LOGIQ_LOGO_DATA_URI } from '@/lib/intake/logiqLogo';
import { docName, confidentialLine } from '@/lib/brand';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOGOS = { LOGIQ: LOGIQ_LOGO_DATA_URI };

/** An <img> when the company has a logo, else its name as a wordmark. `height` in px. */
export function brandMarkHtml(brand, { height = 36, color = '#0f172a' } = {}) {
  const logo = brand?.code && LOGOS[brand.code];
  if (logo) return `<img src="${logo}" alt="${esc(docName(brand))}" style="height:${height}px;width:auto"/>`;
  const size = Math.max(14, Math.round(height * 0.6));
  return `<span style="font-size:${size}px;font-weight:800;letter-spacing:-0.5px;color:${color};line-height:${height}px">${esc(brand?.name || '1LUX')}</span>`;
}

/** The company's name for a document, escaped. */
export const brandNameHtml = (brand) => esc(docName(brand));

/** Address on one line, then phone and email on the next; blanks left off. `sep` joins the two lines. */
export function contactBlockHtml(brand, sep = '<br>') {
  const second = [brand?.phone, brand?.email].filter(Boolean).map(esc).join(' | ');
  return [brand?.address ? esc(brand.address) : '', second].filter(Boolean).join(sep);
}

/** The "Confidential: name | address | phone | email" footer, escaped. */
export const confidentialHtml = (brand) => esc(confidentialLine(brand));
