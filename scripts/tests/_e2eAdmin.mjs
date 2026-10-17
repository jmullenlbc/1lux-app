// Admin login for the e2e tests (smoke, mcp, dn-leak).
//
// If E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are set, those are used as before.
// Otherwise a local test admin is created or refreshed with a random
// password kept on this machine only, so nobody has to put a real login in .env. It only
// does that against the local sqlite file and a localhost server, never prod.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import bcrypt from 'bcryptjs';
import { BASE } from './_auth.mjs';

export const E2E_ADMIN_EMAIL = 'e2e-admin@ilcstudios.test';

// The tests do not load .env themselves (Prisma reads it on its own), so read
// DATABASE_URL from the file when the shell did not set it.
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const line = readFileSync('.env', 'utf8').split(/\r?\n/).find(l => /^DATABASE_URL\s*=/.test(l));
    return line ? line.replace(/^DATABASE_URL\s*=\s*/, '').replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}

// node --test runs each file in its own process at the same time, so every file
// must land on the same password or the last one to write wins and the rest get
// a 401. The random password is made once and kept under node_modules (ignored
// by git); the exclusive create means two files racing still agree.
const PW_FILE = 'node_modules/.cache/ilc-e2e-admin.txt';
function sharedPassword() {
  mkdirSync(dirname(PW_FILE), { recursive: true });
  try { writeFileSync(PW_FILE, randomBytes(18).toString('base64url'), { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  return readFileSync(PW_FILE, 'utf8').trim();
}

export async function ensureE2eAdmin(prisma) {
  if (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) {
    return { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
  }
  const localDb = databaseUrl().startsWith('file:');
  const localServer = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE);
  if (!localDb || !localServer) {
    throw new Error('test admin is only made on the local sqlite database and a localhost server. Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run elsewhere.');
  }
  const password = sharedPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where:  { email: E2E_ADMIN_EMAIL },
    update: { role: 'ILC_ADMIN', isActive: true, passwordHash },
    create: { email: E2E_ADMIN_EMAIL, name: 'E2E test admin', role: 'ILC_ADMIN', isActive: true, passwordHash },
  });
  return { email: E2E_ADMIN_EMAIL, password };
}
