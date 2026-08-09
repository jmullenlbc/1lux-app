/**
 * Safety middleware: what may be queried, by whom, how wide, and for how long.
 *
 * Four independent guards, each of which must pass:
 *
 *   1. MODEL ALLOWLIST — default deny. Only ontology-registered models are
 *      reachable, for every audience including ILC.
 *   2. FIELD VALIDATION — a `where`, `select` or `orderBy` may only name fields
 *      the caller could read anyway.
 *   3. ROW CAP — 25 by default, 100 hard maximum.
 *   4. TIMEOUT — a query that hangs must not hold a Lambda open.
 *
 * ── Why the allowlist covers ILC too ─────────────────────────────────────────
 * `canReadObject(model, 'ilc')` returns true for unregistered models, because
 * redaction policy has nothing to enforce there and an ILC admin is cleared for
 * everything. That is a statement about REDACTION. This is a statement about
 * REACHABILITY, and it is stricter on purpose: an agent with a service token is
 * not a person exercising judgment, and "the agent can read any of 116 tables
 * including EmailAccount" is a much larger blast radius than the Ask AI feature
 * needs. Models join the allowlist by getting an ontology definition, which is
 * the same act as deciding what is safe to show. Two guards, two questions.
 *
 * ── Why field validation is not optional ─────────────────────────────────────
 * Filtering on a field you cannot see is a working oracle for its value. A
 * client who can send `where: { dnPerUnit: { gt: 100 } }` and observe which rows
 * come back has read the buy price, one binary search at a time, without the
 * column ever appearing in a response. Redacting the output is not sufficient;
 * the input has to be constrained too.
 */
import { byModel, objectKeys, objects } from '@/lib/ontology/index.js';
import { readableProps } from '@/lib/ontology/redact.js';
import { isNeverReadable } from '@/lib/ontology/sensitivity.js';

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT     = 100;
export const QUERY_TIMEOUT_MS = 10_000;

/**
 * Prisma filter/relation keywords that are structure, not field names.
 *
 * The second group is the nested-relation arguments. A caller reading a change
 * order with `include: { optionGroups: { include: { lineItems: true } } }` is
 * describing shape, not naming a column — but the walker cannot tell the
 * difference without being told, and treating `include` as an unreadable field
 * rejected every legitimate nested read.
 *
 * Listing them as structure does NOT widen what comes back: the walker descends
 * through each one and still checks every field name underneath it against the
 * audience's readable set, using the LINKED object's set once it crosses a
 * relation. `select: { originalDN: true }` is still rejected for a client — it
 * is now rejected one level deeper, which is where it was always meant to be.
 *
 * These names are reserved by Prisma and cannot collide with a real column.
 */
const OPERATORS = new Set([
  'AND', 'OR', 'NOT',
  'equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte',
  'contains', 'startsWith', 'endsWith', 'search', 'mode',
  'some', 'every', 'none', 'is', 'isNot',
  'has', 'hasEvery', 'hasSome', 'isEmpty',
  'sort', 'nulls', '_count',

  // nested-relation arguments
  'select', 'include', 'orderBy', 'take', 'skip', 'distinct', 'cursor',
]);

/** Every model this server will touch, for any caller. */
export function allowedModels() {
  return new Set(Object.keys(byModel));
}

/**
 * Is this model addressable through MCP at all?
 *
 * Audience-independent by design — the allowlist is the same for everyone, and
 * what differs by audience is which FIELDS come back. Keeping reachability and
 * visibility as separate questions is what stops "ILC can see everything" from
 * quietly becoming "the endpoint exposes everything."
 *
 * @returns {{ok: true, object: object} | {ok: false, message: string}}
 */
export function checkModel(modelName) {
  if (!modelName || typeof modelName !== 'string') {
    return { ok: false, message: 'A model name is required.' };
  }
  const obj = byModel[modelName] || objects[modelName] ||
    Object.values(objects).find(o => o.key.toLowerCase() === modelName.toLowerCase() ||
                                     o.model.toLowerCase() === modelName.toLowerCase());
  if (!obj) {
    // The error names the allowlist rather than confirming or denying that the
    // requested model exists in the schema. "No such table" and "that table is
    // off limits" are different disclosures.
    return {
      ok: false,
      message: `"${modelName}" is not available through MCP. Available: ${objectKeys.join(', ')}.`,
    };
  }
  return { ok: true, object: obj };
}

/**
 * Walk a `where` / `orderBy` / `select` tree and reject any field the caller
 * could not read directly.
 *
 * @param {*} tree            the user-supplied clause
 * @param {object} object     the ontology object being queried
 * @param {string} audience
 * @param {string} label      'where' | 'orderBy' | 'select', for the error text
 * @returns {string[]} rejected dotted paths; empty means clean
 */
export function findForbiddenFields(tree, object, audience, label = 'where', path = '') {
  const bad = [];
  const allowed = readableProps(object.key, audience);
  walk(tree, path);
  return bad;

  function walk(node, at) {
    if (node === null || typeof node !== 'object') return;
    if (node instanceof Date) return;
    if (Array.isArray(node)) { node.forEach((n, i) => walk(n, `${at}[${i}]`)); return; }

    for (const [key, value] of Object.entries(node)) {
      const here = at ? `${at}.${key}` : key;

      // Credentials are refused for every audience, ILC included. An admin does
      // not get to binary-search a bcrypt hash through a filter either.
      if (isNeverReadable(key)) { bad.push(`${label}.${here}`); continue; }

      if (OPERATORS.has(key)) { walk(value, here); continue; }

      // ILC is cleared for undeclared columns, so only the never-readable check
      // above applies to them. Non-ILC callers are held to the declared set.
      if (audience !== 'ilc') {
        if (!allowed || !allowed.has(key)) { bad.push(`${label}.${here}`); continue; }

        // Descend into a relation using ITS object's readable set, not this one's.
        const link = object.links?.[key];
        if (link) {
          const nested = findForbiddenFields(value, objects[link.object], audience, label, here);
          bad.push(...nested);
          continue;
        }
      }
      walk(value, here);
    }
  }
}

/** Clamp a caller-supplied limit into [1, MAX_LIMIT]. */
export function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

/**
 * Some MCP clients send object arguments as JSON strings. Accept both rather
 * than failing on a client-library quirk, but never accept a string that is not
 * valid JSON — silently treating `"{broken"` as `{}` would turn a malformed
 * filter into an unfiltered full-table read.
 */
export function parseObjectArg(value, label) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null || typeof parsed !== 'object') {
        throw new Error(`${label} must be an object, got ${typeof parsed}`);
      }
      return parsed;
    } catch (err) {
      throw new Error(`${label} is not valid JSON: ${err.message}`);
    }
  }
  throw new Error(`${label} must be an object or a JSON string.`);
}

/** Reject a query that runs long rather than holding a Lambda open until it dies. */
export function withTimeout(promise, ms = QUERY_TIMEOUT_MS, label = 'query') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms and was cancelled.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
