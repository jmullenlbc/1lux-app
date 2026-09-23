#!/usr/bin/env node
/**
 * Write agents.md — the page an AI assistant reads before it calls this server.
 *
 * ── Why this is generated and not written by hand ────────────────────────────
 * A hand-written version of this document is a promise that stops being true the
 * first time somebody adds a tool and forgets the doc. The one thing worse than
 * no instructions for an agent is instructions that describe a tool that no
 * longer takes those arguments. So the whole thing comes out of
 * src/lib/mcp/catalog.js, and `npm run verify` regenerates it and fails if the
 * committed copy differs.
 *
 * ── Why it is not published ──────────────────────────────────────────────────
 * This file lives in the repository and behind the authenticated /api/mcp
 * surface. It is NOT served at a public URL on app.ilcstudios.com. It names the
 * tools, which is the same thing the unauthenticated server card deliberately
 * withholds — publishing it would undo that decision in a different place.
 *
 * Run:    node scripts/generate-agents-md.mjs
 * Check:  node scripts/generate-agents-md.mjs --check   (exit 1 if out of date)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { CATALOG, CATALOG_ORDER, DEFAULT_LIMIT, MAX_LIMIT, TOOL_COUNT } from '../src/lib/mcp/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'agents.md');

/** One tool's argument table. Required arguments are marked; nothing else is. */
function argumentTable(schema) {
  const props = schema?.properties || {};
  const names = Object.keys(props);
  if (!names.length) return '_Takes no arguments._\n';

  const required = new Set(schema.required || []);
  const lines = [
    '| Argument | Type | Required | Notes |',
    '| --- | --- | --- | --- |',
  ];
  for (const name of names) {
    const p = props[name] || {};
    const type = Array.isArray(p.type) ? p.type.join(' or ') : (p.type || '');
    const notes = [
      p.description || '',
      p.enum ? `one of: ${p.enum.join(', ')}` : '',
      Number.isFinite(p.minimum) || Number.isFinite(p.maximum)
        ? `${Number.isFinite(p.minimum) ? `min ${p.minimum}` : ''}${
            Number.isFinite(p.minimum) && Number.isFinite(p.maximum) ? ', ' : ''
          }${Number.isFinite(p.maximum) ? `max ${p.maximum}` : ''}`
        : '',
    ].filter(Boolean).join('; ');
    lines.push(`| \`${name}\` | ${type} | ${required.has(name) ? 'yes' : '' } | ${notes} |`);
  }
  return lines.join('\n') + '\n';
}

function render() {
  const anyTools = CATALOG_ORDER.filter(k => CATALOG[k].audience !== 'ilc');
  const ilcTools = CATALOG_ORDER.filter(k => CATALOG[k].audience === 'ilc');

  const out = [];
  const w = (...lines) => out.push(...lines);

  w(
    '<!--',
    '  GENERATED FILE — do not edit by hand.',
    '  Source: src/lib/mcp/catalog.js',
    '  Regenerate: node scripts/generate-agents-md.mjs',
    '  `npm run verify` fails if this file and the catalogue disagree.',
    '-->',
    '',
    '# Working with ILC Studios data',
    '',
    'This describes the read-only API an AI assistant uses to answer questions about',
    "ILC Studios' projects, clients, budgets and sales pipeline. It is internal; it is",
    'not served at a public address.',
    '',
    '## The one rule',
    '',
    '**Everything here is read-only.** There is no tool that creates, edits or deletes',
    'anything, and there never will be on this endpoint. If a question needs something',
    'changed, say what needs changing and who should change it — do not look for a way',
    'to do it here.',
    '',
    '## What you can see',
    '',
    'Not everything, and not the same things as everybody else. Two separate limits',
    'apply to every answer, and neither one is something you can argue with:',
    '',
    '- **Which rows.** You only ever see records that belong to whoever the key was',
    '  issued to. A client sees their own jobs. Asking about somebody else\'s job',
    '  returns nothing at all — not an error, just nothing.',
    '- **Which columns.** Buy prices, margins and other internal figures are removed',
    '  from the answer before you get it. They are not marked as removed; they are',
    '  simply absent. Do not try to work them out from what is left, and do not filter',
    '  on a field you cannot see — that request is refused outright.',
    '',
    'If a tool refuses you, that is the answer. Say so plainly and move on; do not try',
    'the same question a different way.',
    '',
    '## How to start',
    '',
    'Call `list_models` first. It tells you the names of the things you can ask about,',
    'and those names are the only valid `model` argument for every other tool. Then',
    '`describe_model` for the fields on one of them. Guessing a model name wastes a',
    'call and is recorded as a failed request.',
    '',
    'To find a record when you only have a name like "The Approach", use `search`',
    'rather than a filter — it looks across project names, project numbers and client',
    'names in one go.',
    '',
    '## Limits',
    '',
    `- A query returns at most **${MAX_LIMIT}** rows, and **${DEFAULT_LIMIT}** if you do not ask for a number.`,
    '  Ask a narrower question rather than paging through everything.',
    '- There is a per-minute cap on requests. If you hit it, wait — retrying',
    '  immediately just burns the allowance.',
    '- **Every call is recorded** against the person whose key you are using: which',
    '  tool, which arguments, and whether it was refused. The answer itself is not',
    '  recorded. Ask the question you actually need answered.',
    '',
    '## The tools',
    '',
    `There are ${TOOL_COUNT}. ${anyTools.length} are available to anyone the server has`,
    `authenticated; ${ilcTools.length} are ILC staff only and are refused to everybody else.`,
    '',
  );

  for (const key of CATALOG_ORDER) {
    const tool = CATALOG[key];
    w(
      `### \`${tool.name}\``,
      '',
      tool.audience === 'ilc' ? '**ILC staff only.**' : '',
      tool.description,
      '',
      argumentTable(tool.inputSchema),
      '',
    );
  }

  w(
    '## How to call it',
    '',
    'Standard MCP over JSON-RPC 2.0 at `/api/mcp`, with your key as a bearer token:',
    '',
    '```json',
    '{"jsonrpc":"2.0","id":1,"method":"tools/call",',
    ' "params":{"name":"search","arguments":{"query":"The Approach"}}}',
    '```',
    '',
    '`initialize`, `tools/list` and `ping` work as the protocol specifies. `tools/list`',
    'returns only the tools you are allowed to call, so it is the honest list for you',
    'specifically — shorter than the one above if your key is not an ILC one.',
    '',
    'Keys are issued per person under **ILC Admin → AI Access Keys**, and a key never',
    'shows more than the person it belongs to could already see in the app.',
    '',
  );

  // A single trailing newline, no blank-line runs longer than one.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
}

const body = render();

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { current = ''; }
  // Compare with line endings normalised: git may check the file out as CRLF on
  // Windows, and a doc that is byte-identical apart from that is not stale.
  const norm = s => s.replace(/\r\n/g, '\n');
  if (norm(current) !== norm(body)) {
    console.error('agents.md is out of date with src/lib/mcp/catalog.js.');
    console.error('Run: node scripts/generate-agents-md.mjs');
    process.exit(1);
  }
  console.log('agents.md is current.');
  process.exit(0);
}

writeFileSync(OUT, body, 'utf8');
console.log(`Wrote agents.md (${TOOL_COUNT} tools).`);
process.exit(0);
