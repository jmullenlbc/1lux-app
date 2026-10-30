// Turns a campaign into one person's email (0147): HTML, plain text and the
// unsubscribe headers Gmail and Yahoo ask bulk senders for. Every link goes
// through our click route so a click is counted; document cards land on the
// person's own tracked Sales Docs link.
import { prisma } from '@/lib/db';
import { escapeHtml } from '@/lib/notify';
import { fromAddress } from './sender';

export const BLOCK_KINDS = ['HEADING', 'TEXT', 'BUTTON', 'IMAGE', 'DOC', 'FOLDER'];
export const FOOTER_ADDRESS_KEY = 'campaignFooterAddress';
export const NO_ADDRESS = 'Add the mailing address for the email footer first. The law asks for a real postal address in every marketing email. Your campaign is saved. (CAMPAIGN_NO_ADDRESS)';

export async function getFooterAddress() {
  const row = await prisma.appSetting.findUnique({ where: { key: FOOTER_ADDRESS_KEY } }).catch(() => null);
  return row?.value?.trim() || '';
}

export async function setFooterAddress(value, userId) {
  const v = String(value || '').trim().slice(0, 300);
  return prisma.appSetting.upsert({
    where: { key: FOOTER_ADDRESS_KEY },
    create: { key: FOOTER_ADDRESS_KEY, value: v, updatedById: userId || null },
    update: { value: v, updatedById: userId || null },
  });
}

export const isWebUrl = (u) => /^https?:\/\/[^\s<>"']+$/i.test(String(u || '').trim());

const fill = (text, firstName) => String(text || '').replace(/\{\{\s*first_name\s*\}\}/gi, firstName || 'there');

/**
 * campaign: { subject, previewText }, blocks: active blocks in order (with salesDoc/space titles),
 * person: { token, email, firstName }, baseUrl: absolute app origin, address: footer address.
 */
export function renderEmail({ campaign, blocks, person, baseUrl, address }) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const click = (b) => `${base}/api/e/c/${person.token}/${b.id}`;
  const unsubscribeUrl = `${base}/e/u/${person.token}`;
  const oneClickUrl = `${base}/api/e/u/${person.token}`;
  const from = fromAddress();
  const subject = fill(campaign.subject, person.firstName).trim();

  const html = [];
  const text = [];
  for (const b of blocks) {
    const body = fill(b.text, person.firstName);
    if (b.kind === 'HEADING' && body.trim()) {
      html.push(`<h2 style="margin:24px 0 8px;font-size:20px;color:#111827">${escapeHtml(body)}</h2>`);
      text.push(body.toUpperCase());
    } else if (b.kind === 'TEXT' && body.trim()) {
      for (const para of body.split(/\n{2,}/)) {
        html.push(`<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`);
      }
      text.push(body);
    } else if (b.kind === 'BUTTON' && isWebUrl(b.url)) {
      const label = body.trim() || 'Open';
      html.push(button(click(b), label));
      text.push(`${label}: ${click(b)}`);
    } else if (b.kind === 'IMAGE' && isWebUrl(b.url)) {
      html.push(`<p style="margin:0 0 14px"><img src="${escapeHtml(b.url)}" alt="${escapeHtml(body)}" style="max-width:100%;height:auto;border:0"></p>`);
    } else if ((b.kind === 'DOC' && b.salesDoc) || (b.kind === 'FOLDER' && b.space)) {
      const title = b.kind === 'DOC' ? b.salesDoc.title : b.space.name;
      const note = body.trim();
      html.push(`<table role="presentation" width="100%" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px"><tr><td style="padding:16px">`
        + `<div style="font-size:16px;font-weight:600;color:#111827">${escapeHtml(title)}</div>`
        + (note ? `<div style="margin-top:6px;font-size:14px;color:#4b5563">${escapeHtml(note)}</div>` : '')
        + `<div style="margin-top:12px">${button(click(b), b.kind === 'DOC' ? 'Open the document' : 'Open the folder')}</div></td></tr></table>`);
      text.push(`${title}${note ? `\n${note}` : ''}\nOpen: ${click(b)}`);
    }
  }

  const footer = `${escapeHtml(from.name)}<br>${escapeHtml(address).replace(/\n/g, '<br>')}<br><br>`
    + `You are getting this because you work with ${escapeHtml(from.name)}. `
    + `<a href="${unsubscribeUrl}" style="color:#6b7280">Unsubscribe</a>`;
  const preview = fill(campaign.previewText, person.firstName).trim();

  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f3f4f6">`
    + (preview ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div>` : '')
    + `<table role="presentation" width="100%" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:8px"><tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">`
    + html.join('\n')
    + `</td></tr><tr><td style="padding:16px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;border-top:1px solid #e5e7eb">${footer}</td></tr></table>`
    + `</td></tr></table><img src="${base}/api/e/o/${person.token}" width="1" height="1" alt="" style="display:block;border:0"></body></html>`;

  const plain = `${text.join('\n\n')}\n\n${from.name}\n${address}\nUnsubscribe: ${unsubscribeUrl}\n`;

  return {
    subject,
    html: page,
    text: plain,
    headers: {
      'List-Unsubscribe': `<${oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

function button(href, label) {
  return `<a href="${href}" style="display:inline-block;padding:10px 18px;background:#f97316;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">${escapeHtml(label)}</a>`;
}

/** Where the app lives, for links inside an email. */
export function appBaseUrl(request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  try { return new URL(request.url).origin; } catch { return ''; }
}
