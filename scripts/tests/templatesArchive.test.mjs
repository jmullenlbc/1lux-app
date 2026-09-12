// Email templates are archived, never deleted.
//
// Mike, 2026-09-11: "Do it for email templates in the CRM definitely." Same rule
// as the bot's library: archiving (isActive false) takes a template out of
// everything that picks one, and keeps it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs)$/.test(f)) out.push(p);
  }
  return out;
}

test('nothing in the app hard-deletes a message template', () => {
  const offenders = walk(new URL('src', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    .filter(p => /messageTemplate\.delete(Many)?\(/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('the delete route refuses with a 405 and says to archive instead', () => {
  const src = read('src/app/api/automation/templates/[id]/route.js');
  assert.match(src, /export async function DELETE/);
  assert.match(src, /status: 405/);
  assert.match(src, /[Aa]rchive/);
});

test('the bot only ever picks a template that is not archived', () => {
  const src = read('src/lib/bot/followUpDrafter.js');
  const finds = src.match(/messageTemplate\.find\w+\(\{[^]*?\}\)/g) || [];
  assert.ok(finds.length >= 2);
  for (const f of finds) assert.match(f, /isActive: true/);
});

test('the Templates screen has no delete, and archiving asks first', () => {
  const src = read('src/app/(app)/sales/automation/templates/page.jsx');
  assert.doesNotMatch(src, /method: 'DELETE'/);
  assert.match(src, /ConfirmArchiveModal/);
  assert.match(src, /Archived templates/);
});
