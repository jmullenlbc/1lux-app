/**
 * Gets the Anthropic API key.
 *
 * Order (Mike 10-28: "move the AI key into an Admin setting inside the app"):
 *   1. The key an admin saved on Admin > Users and settings (AppSetting row
 *      `anthropic_api_key`, encrypted). Changing it needs no AWS login and no
 *      redeploy; every server picks it up within a minute.
 *   2. The ANTHROPIC_API_KEY env var (baked in at build on Amplify).
 *   3. The .env file directly, because a system-level ANTHROPIC_API_KEY=''
 *      can override the .env file value in process.env.
 *
 * The saved key is never sent back to the browser, not even in part.
 */
import fs   from 'fs';
import path from 'path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { jwtSecretString } from './jwtSecret';

export const ANTHROPIC_KEY_SETTING = 'anthropic_api_key';
const CACHE_MS = 60_000;
// Lazy, so modules that only sometimes call a model still load under plain Node (unit tests).
const db = async () => (await import('@/lib/db')).prisma;

let _envKey = null;
let _saved = { at: 0, key: null };

function envKey() {
  if (_envKey) return _envKey;
  const sysKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (sysKey) { _envKey = sysKey; return _envKey; }
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const fileKey = envFile.match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim();
    if (fileKey) { _envKey = fileKey; return _envKey; }
  } catch {}
  return null;
}

const aesKey = () => createHash('sha256').update(`anthropic-key:${jwtSecretString()}`).digest();

export function sealKey(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', aesKey(), iv);
  const body = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

export function openKey(sealed) {
  const [v, iv, tag, body] = String(sealed || '').split(':');
  if (v !== 'v1' || !iv || !tag || !body) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', aesKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

async function savedKey() {
  if (Date.now() - _saved.at < CACHE_MS) return _saved.key;
  let key = null;
  try {
    const row = await (await db()).appSetting.findUnique({ where: { key: ANTHROPIC_KEY_SETTING } });
    key = row?.value ? openKey(row.value) : null;
  } catch {}
  _saved = { at: Date.now(), key };
  return key;
}

export async function getAnthropicKey() {
  return (await savedKey()) || envKey();
}

/** Where the key in use comes from, for the Admin card. Never the key itself. */
export async function anthropicKeyStatus() {
  const row = await (await db()).appSetting.findUnique({
    where: { key: ANTHROPIC_KEY_SETTING },
    include: { updatedBy: { select: { name: true, email: true } } },
  }).catch(() => null);
  const saved = row?.value ? openKey(row.value) : null;
  return {
    source: saved ? 'app' : envKey() ? 'server' : 'none',
    savedAt: saved ? row.updatedAt : null,
    savedBy: saved ? (row.updatedBy?.name || row.updatedBy?.email || null) : null,
    unreadable: Boolean(row?.value && !saved),
  };
}

/** Saves (or clears, with an empty value) the admin key. Every server sees it within a minute. */
export async function saveAnthropicKey(plain, userId) {
  const v = String(plain || '').trim();
  await (await db()).appSetting.upsert({
    where:  { key: ANTHROPIC_KEY_SETTING },
    create: { key: ANTHROPIC_KEY_SETTING, value: v ? sealKey(v) : '', updatedById: userId || null },
    update: { value: v ? sealKey(v) : '', updatedById: userId || null },
  });
  _saved = { at: 0, key: null };
}

/** One cheap call to see whether Anthropic accepts a key. Returns the HTTP status only. */
export async function checkAnthropicKey(key) {
  if (!key) return { ok: false, status: 0 };
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
