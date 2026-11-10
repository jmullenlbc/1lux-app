// The public side of a Sales Docs link (0137): find the link, say whether it
// still works, list what it shows, and check the visitor's pass.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { clientIp } from '@/lib/rateLimit';
import { readPass } from './cookie.js';
import { shareAllowed } from './pricingScan.js';
import { jwtSecretString } from '../jwtSecret';

export const PASSWORD_FAIL_LIMIT = 10;
export const PASSWORD_FAIL_WINDOW_MS = 15 * 60 * 1000;
export const MAX_RANGE_BYTES = 3 * 1024 * 1024;

/** 24 url-safe characters; a guess space no one walks. */
export const newToken = () => crypto.randomBytes(18).toString('base64url');

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Who it was without keeping the address itself. */
export function ipHashOf(request) {
  const salt = jwtSecretString();
  return crypto.createHash('sha256').update(`${salt}:${clientIp(request)}`).digest('hex').slice(0, 32);
}

export const hashPassword = (pw) => bcrypt.hash(String(pw), 10);
export const checkPassword = (pw, hash) => bcrypt.compare(String(pw || ''), hash || '');

const VERSION_SELECT = {
  id: true, version: true, fileName: true, sizeBytes: true, storageKey: true, pageCount: true,
  truncated: true, scanStatus: true, processStatus: true,
  sheets: { where: { hidden: false }, orderBy: { index: 'asc' }, select: { index: true, name: true, rowCount: true, colCount: true, truncated: true } },
};
const DOC_SELECT = { id: true, title: true, kind: true, archivedAt: true, currentVersion: { select: VERSION_SELECT } };

export async function loadLink(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  return prisma.salesDocLink.findUnique({
    where: { token },
    include: {
      doc: { select: DOC_SELECT },
      space: {
        select: {
          id: true, name: true, description: true, archivedAt: true,
          items: { orderBy: [{ sortOrder: 'asc' }], select: { section: true, sortOrder: true, doc: { select: DOC_SELECT } } },
        },
      },
    },
  });
}

/** OK | MISSING | REVOKED | EXPIRED | ARCHIVED */
export function linkState(link, now = new Date()) {
  if (!link || (!link.doc && !link.space)) return 'MISSING';
  if (link.revokedAt) return 'REVOKED';
  if (link.expiresAt && new Date(link.expiresAt) <= now) return 'EXPIRED';
  if (link.doc?.archivedAt || link.space?.archivedAt) return 'ARCHIVED';
  return 'OK';
}

/** A doc can be shown when its current version is read and clear to share. */
export const docShowable = (d) => !!d && !d.archivedAt && d.currentVersion?.processStatus === 'READY' && shareAllowed(d.currentVersion.scanStatus);

/** The docs this link shows, in order, each with its Space section. */
export function linkDocs(link) {
  if (!link) return [];
  if (link.doc) return docShowable(link.doc) ? [{ ...link.doc, section: null }] : [];
  return (link.space?.items || []).filter((i) => docShowable(i.doc)).map((i) => ({ ...i.doc, section: i.section || null }));
}

/** What the viewer is told about one doc. No storage keys, no scan detail. */
export function publicDoc(d) {
  const v = d.currentVersion;
  return {
    id: d.id,
    title: d.title,
    kind: d.kind,
    section: d.section ?? null,
    pageCount: v.pageCount ?? 0,
    sizeBytes: v.sizeBytes,
    truncated: v.truncated,
    sheets: d.kind === 'XLSX' ? v.sheets : [],
  };
}

/** The visitor's pass for this link when the link still works, else null. */
export async function requirePass(link) {
  if (linkState(link) !== 'OK') return null;
  return readPass(link.id);
}

/** Find a showable doc on this link by id. */
export function docOnLink(link, docId) {
  return linkDocs(link).find((d) => d.id === docId) || null;
}

export async function recentPasswordFails(linkId, ipHash) {
  return prisma.salesDocEvent.count({
    where: { linkId, ipHash, type: 'PASSWORD_FAIL', createdAt: { gte: new Date(Date.now() - PASSWORD_FAIL_WINDOW_MS) } },
  });
}

/** Parse "bytes=a-b" into an inclusive range capped at MAX_RANGE_BYTES. */
export function parseRange(header, size) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(String(header || '').trim());
  if (!m || !size) return null;
  const start = Number(m[1]);
  if (start >= size) return null;
  const want = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (want < start) return null;
  const end = Math.min(want, start + MAX_RANGE_BYTES - 1);
  return { start, end };
}
