/**
 * Tests for who is allowed to see which records.
 *
 * Mike, 2026-08-25: a staff account signed in to the live app and saw an empty
 * projects list and an empty clients list. Every record in the system had been
 * created by somebody else, and sixty-odd routes each carried their own copy
 * of "you may look at this if you are an admin OR you made it". The rule is
 * now one function, canSeeAllData, and everything defers to it.
 *
 * Two things are worth pinning:
 *
 *   1. The function itself. Every internal role sees everything; the external
 *      CLIENT_VIEWER role does not. That last part is not a preference, buy
 *      and DN pricing is on these records and contractors must never reach it.
 *
 *   2. That nobody quietly puts the old rule back. A new route written by
 *      copying an old one is exactly how the first sixty happened, so this
 *      scans the route tree for ownership tests that are not guarded by the
 *      client-viewer check.
 *
 * auth.js cannot be imported here, it pulls in next/headers, which only
 * exists inside a Next request. So the function is read out of the source file
 * and evaluated on its own, which also means the test fails if somebody
 * renames or deletes it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const authSrc = readFileSync('src/lib/auth.js', 'utf8');

function extract(name) {
  const start = authSrc.indexOf(`export function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing from src/lib/auth.js`);
  const open = authSrc.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < authSrc.length; i++) {
    if (authSrc[i] === '{') depth++;
    else if (authSrc[i] === '}' && --depth === 0) break;
  }
  return authSrc.slice(start, i + 1).replace(/^export /, '');
}

const { canSeeAllData } = new Function(
  `${extract('isClientViewer')}\n${extract('canSeeAllData')}\nreturn { canSeeAllData };`
)();

// ── The rule ────────────────────────────────────────────────────────────────

const INTERNAL = ['SUPER_ADMIN', 'ILC_ADMIN', 'COMPANY_ADMIN', 'ADMIN', 'USER'];

test('every internal role sees every record', () => {
  for (const role of INTERNAL) {
    assert.equal(canSeeAllData({ role }), true, `${role} should see everything`);
  }
});

test('an external client viewer does not', () => {
  assert.equal(canSeeAllData({ role: 'CLIENT_VIEWER' }), false);
});

test('a role nobody has heard of is still internal, not a client viewer', () => {
  // New roles get added; the safe default for a staff-side role is to see the
  // work. Only the one explicitly external role is held back.
  assert.equal(canSeeAllData({ role: 'ESTIMATOR' }), true);
});

test('it takes a user object or a bare role string', () => {
  assert.equal(canSeeAllData('CLIENT_VIEWER'), false);
  assert.equal(canSeeAllData('USER'), true);
});

test('a missing user is treated as internal, so callers must still require auth', () => {
  // This function answers "which records", never "is this person logged in".
  // requireAuth does that, first, in every route.
  assert.equal(canSeeAllData(undefined), true);
  assert.equal(canSeeAllData({}), true);
});

// ── That the old rule does not come back ────────────────────────────────────

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

test('no route gates records on who created them', () => {
  const offenders = [];

  for (const file of walk('src/app')) {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (!/createdById\s*(===|!==)/.test(line)) return;
      // The two legitimate shapes: the client-viewer exception, and the
      // fallback that runs after canSeeAllData has already said no.
      if (/isClientViewer|canSeeAllData/.test(line)) return;
      offenders.push(`${file}:${i + 1}  ${line.trim()}`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'These lines decide visibility from ownership instead of canSeeAllData:\n  ' +
      offenders.join('\n  ')
  );
});

test('the projects and clients lists are unfiltered for staff', () => {
  for (const file of ['src/app/api/projects/route.js', 'src/app/api/clients/route.js']) {
    const src = readFileSync(file, 'utf8');
    assert.match(
      src,
      /isClientViewer\(|canSeeAllData\(/,
      `${file} must decide its list scope through the shared helper`
    );
    assert.doesNotMatch(
      src,
      /role === 'ILC_ADMIN'[^\n]*\?/,
      `${file} still narrows the list by role`
    );
  }
});
