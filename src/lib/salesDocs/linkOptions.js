// Tracked link options (0137), shared by the create and change routes.
import { hashPassword } from '@/lib/salesDocs/share';
import { normalizeEmail } from '@/lib/salesDocs/matching';

export function linkStatus(l, now = new Date()) {
  if (l.revokedAt) return 'REVOKED';
  if (l.expiresAt && new Date(l.expiresAt) <= now) return 'EXPIRED';
  return 'LIVE';
}

/** Link options from a request body. @returns {Promise<{ data } | { error }>} */
export async function linkOptions(body, { creating }) {
  const data = {};
  if (creating || 'name' in body) {
    const name = String(body.name || '').trim().slice(0, 120);
    if (!name) return { error: 'Give the link a name, like who it is for.' };
    data.name = name;
  }
  if ('recipientEmail' in body) {
    if (body.recipientEmail) {
      const e = normalizeEmail(body.recipientEmail);
      if (!e) return { error: 'The recipient email does not look right.' };
      data.recipientEmail = e;
    } else data.recipientEmail = null;
  }
  if ('clientId' in body) data.clientId = body.clientId || null;
  if ('requireEmail' in body) data.requireEmail = !!body.requireEmail;
  if ('allowDownload' in body) data.allowDownload = !!body.allowDownload;
  if ('notifyOnFirstOpen' in body) data.notifyOnFirstOpen = !!body.notifyOnFirstOpen;
  if ('expiresAt' in body) {
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) return { error: 'The expiry date does not look right.' };
      data.expiresAt = d;
    } else data.expiresAt = null;
  }
  if ('password' in body) {
    if (body.password) {
      if (String(body.password).length < 4) return { error: 'Use at least 4 characters for the password.' };
      data.passwordHash = await hashPassword(body.password);
    } else data.passwordHash = null;
  }
  return { data };
}
