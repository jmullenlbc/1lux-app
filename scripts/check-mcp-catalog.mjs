#!/usr/bin/env node
/**
 * The MCP catalogue is the one description of this server. Keep it that way.
 *
 * Four things can quietly break, and all four look fine locally:
 *
 *   1. Somebody adds an import to src/lib/mcp/catalog.js. The moment it imports
 *      anything with an `@/` alias, or anything that reaches a database,
 *      scripts/generate-agents-md.mjs stops being able to load it under plain
 *      Node — and the failure shows up in CI, not in the editor.
 *   2. A tool gets a name, description or argument schema written directly in
 *      tools.js instead of the catalogue, so agents.md silently stops describing
 *      the real server.
 *   3. A tool says "ILC staff only" in its description but not in its `audience`,
 *      which reads as private and behaves as public.
 *   4. agents.md drifts from the catalogue because somebody changed a tool and
 *      did not regenerate the document.
 *
 * Run: node scripts/check-mcp-catalog.mjs
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { CATALOG, CATALOG_ORDER, TOOL_COUNT } from '../src/lib/mcp/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// ── 1. catalog.js stays pure ────────────────────────────────────────────────
const catalogSrc = readFileSync(path.join(ROOT, 'src/lib/mcp/catalog.js'), 'utf8');
const imports = [...catalogSrc.matchAll(/^\s*import\s.*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
for (const spec of imports) {
  problems.push(
    `src/lib/mcp/catalog.js imports "${spec}". It must import nothing at all — ` +
    'scripts/generate-agents-md.mjs loads it under plain Node with no bundler.',
  );
}
if (/\brequire\s*\(/.test(catalogSrc)) {
  problems.push('src/lib/mcp/catalog.js uses require(). It must stay a pure ES module with no imports.');
}

// ── 2. every entry is well formed ───────────────────────────────────────────
for (const key of CATALOG_ORDER) {
  const tool = CATALOG[key];
  if (tool.name !== key) {
    problems.push(`CATALOG.${key} is named "${tool.name}". The key and the name must match.`);
  }
  if (tool.audience !== 'any' && tool.audience !== 'ilc') {
    problems.push(`${key} has audience "${tool.audience}". It must be 'any' or 'ilc'.`);
  }
  if (!tool.description || tool.description.length < 20) {
    problems.push(`${key} has no usable description.`);
  }
  if (tool.inputSchema?.type !== 'object') {
    problems.push(`${key} has no object inputSchema.`);
  }
  if (tool.inputSchema && tool.inputSchema.additionalProperties !== false) {
    // A schema that accepts extra keys invites a caller to send something the
    // guards were never written to inspect.
    problems.push(`${key} does not set additionalProperties: false.`);
  }
  // 3. the description and the audience must agree
  const saysIlcOnly = /ILC staff only/i.test(tool.description);
  if (saysIlcOnly && tool.audience !== 'ilc') {
    problems.push(`${key} says "ILC staff only" in its description but its audience is "${tool.audience}".`);
  }
  if (!saysIlcOnly && tool.audience === 'ilc') {
    problems.push(`${key} is ILC-only but its description does not say so. Agents read the description.`);
  }
}

// ── 4. tools.js does not keep a second copy ─────────────────────────────────
const toolsSrc = readFileSync(path.join(ROOT, 'src/lib/mcp/tools.js'), 'utf8');
const spreads = new Set([...toolsSrc.matchAll(/\.\.\.CATALOG\.(\w+)/g)].map(m => m[1]));
for (const key of CATALOG_ORDER) {
  if (!spreads.has(key)) {
    problems.push(`tools.js does not spread CATALOG.${key}. Every tool takes its identity from the catalogue.`);
  }
}
if (spreads.size !== TOOL_COUNT) {
  problems.push(`tools.js spreads ${spreads.size} catalogue entries but the catalogue has ${TOOL_COUNT}.`);
}
// A tool object that still declares its own name is a second source of truth.
const ownName = [...toolsSrc.matchAll(/^\s{2}name:\s*'(\w+)',$/gm)].map(m => m[1]);
for (const name of ownName) {
  if (CATALOG[name]) {
    problems.push(`tools.js declares name: '${name}' directly. That belongs in the catalogue.`);
  }
}

// ── 5. agents.md is current ─────────────────────────────────────────────────
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/generate-agents-md.mjs'), '--check'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
} catch {
  problems.push('agents.md is out of date. Run: node scripts/generate-agents-md.mjs');
}

if (problems.length) {
  console.error('MCP catalogue check failed:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(`MCP catalogue ok (${TOOL_COUNT} tools, agents.md current).`);
process.exit(0);
