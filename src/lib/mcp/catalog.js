/**
 * What this server offers, as data — with no database, no session and no app
 * imports behind it.
 *
 * Every tool's identity (its name, the sentence that explains it, the shape of
 * its arguments, and who is allowed to call it) lives here. src/lib/mcp/tools.js
 * imports this file and attaches a `run` to each entry; nothing in the running
 * server declares a name or a description of its own.
 *
 * ── Why the split ────────────────────────────────────────────────────────────
 * Two readers need the catalogue and cannot have the server:
 *
 *   1. `scripts/generate-agents-md.mjs`, which writes agents.md. It runs under
 *      plain Node with no bundler, so it cannot resolve an `@/` import, and it
 *      must not open a database connection just to print a document.
 *   2. The unauthenticated GET on /api/mcp, which needs to say that the server
 *      exists without loading the code that reads rows.
 *
 * **This file must stay pure.** No `@/` imports, no `prisma`, no `next/*`,
 * nothing with a side effect at import time. `scripts/check-mcp-catalog.mjs`
 * fails the build if that stops being true, because the moment it isn't, the
 * agents.md generator stops working and nobody notices until a release.
 *
 * ── audience ─────────────────────────────────────────────────────────────────
 * 'any' — anyone the server has authenticated, ILC or client, may call it. What
 *         comes back is still redacted and still row-scoped; "may call" is not
 *         "may see everything".
 * 'ilc' — ILC staff only. tools.js reads this field and refuses; there is no
 *         second copy of the rule written out inside a run().
 */

// Shared by guards.js, which imports them from here rather than declaring its
// own. The numbers appear in a tool description, so they have to be legible to
// the doc generator too.
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT     = 100;

/** The three ways an obligation can point. Also used by commitments.js. */
export const DIRECTIONS = Object.freeze(['WE_OWE_THEM', 'THEY_OWE_US', 'FOLLOW_UP']);

export const CATALOG = Object.freeze({
  list_models: {
    name: 'list_models',
    audience: 'any',
    description:
      'List the data objects available through this server, with a one-line description of each. ' +
      'Start here — the names returned are the only valid `model` arguments for the other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },

  describe_model: {
    name: 'describe_model',
    audience: 'any',
    description:
      'Describe one object: its fields with types, and its links to other objects. ' +
      'Fields you are not cleared to read are absent from the result, not marked.',
    inputSchema: {
      type: 'object',
      properties: { model: { type: 'string', description: 'model or object name from list_models' } },
      required: ['model'],
      additionalProperties: false,
    },
  },

  query_records: {
    name: 'query_records',
    audience: 'any',
    description:
      'Query records of one model with an optional filter, sort and limit. ' +
      `Returns at most ${MAX_LIMIT} rows (default ${DEFAULT_LIMIT}). ` +
      'Filters may only reference fields you are cleared to read.',
    inputSchema: {
      type: 'object',
      properties: {
        model:   { type: 'string' },
        where:   { type: ['object', 'string'], description: 'Prisma where clause, or a JSON string of one' },
        orderBy: { type: ['object', 'string'] },
        include: { type: ['object', 'string'], description: 'relations to include, by link name' },
        limit:   { type: 'number' },
        skip:    { type: 'number' },
      },
      required: ['model'],
      additionalProperties: false,
    },
  },

  get_record: {
    name: 'get_record',
    audience: 'any',
    description: 'Fetch a single record of one model by id.',
    inputSchema: {
      type: 'object',
      properties: {
        model:   { type: 'string' },
        id:      { type: 'string' },
        include: { type: ['object', 'string'] },
      },
      required: ['model', 'id'],
      additionalProperties: false,
    },
  },

  count_records: {
    name: 'count_records',
    audience: 'any',
    description: 'Count records of one model matching an optional filter. Returns a number, not rows.',
    inputSchema: {
      type: 'object',
      properties: { model: { type: 'string' }, where: { type: ['object', 'string'] } },
      required: ['model'],
      additionalProperties: false,
    },
  },

  search: {
    name: 'search',
    audience: 'any',
    description:
      'Free-text search across project names/numbers and client names. ' +
      'Use when you have a name like "The Approach" and need the record it refers to.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },

  get_project_360: {
    name: 'get_project_360',
    audience: 'any',
    description:
      'Everything about one project in a single call: the project, its client, its budget ' +
      '(design bid matrix versions or peer review items), its fixture schedules, its change ' +
      'orders, and its project data inputs. Accepts an id, a project number, or a name.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId:     { type: 'string' },
        projectNumber: { type: 'number' },
        name:          { type: 'string' },
      },
      additionalProperties: false,
    },
  },

  get_pipeline: {
    name: 'get_pipeline',
    audience: 'ilc',
    description:
      'The sales pipeline: projects with their probability, expected order date and contract value. ' +
      'ILC staff only — these fields are commercial position, not project facts.',
    inputSchema: {
      type: 'object',
      properties: {
        lifecycleStatus: { type: 'string' },
        limit:           { type: 'number' },
      },
      additionalProperties: false,
    },
  },

  get_client_360: {
    name: 'get_client_360',
    audience: 'ilc',
    description: 'One client and all of their projects. ILC staff only.',
    inputSchema: {
      type: 'object',
      properties: { clientId: { type: 'string' }, name: { type: 'string' } },
      additionalProperties: false,
    },
  },

  get_calibration: {
    name: 'get_calibration',
    audience: 'ilc',
    description:
      'How the budget engine is performing against real figures: which rates are drifting, and which ' +
      'budget lines look like they are priced off the wrong thing. ILC staff only — this is the ' +
      'pricing engine talking about itself, and it is never available to a client or an outside caller.',
    inputSchema: {
      type: 'object',
      properties: {
        // 'drift'   → is each rate too high or too low
        // 'drivers' → is each line multiplied by the right thing at all
        // 'both'    → the default
        view: { type: 'string', enum: ['drift', 'drivers', 'both'] },
        // Narrow to one slice of the book, so "what does the data say pathway
        // should be for garden?" is one call rather than a spreadsheet.
        buildingType: { type: 'string' },
        serviceType:  { type: 'string' },
        projectType:  { type: 'string' },
        client:       { type: 'string' },
        lineKey:      { type: 'string' },
      },
      additionalProperties: false,
    },
  },

  get_commitments: {
    name: 'get_commitments',
    audience: 'ilc',
    description:
      'Everything ILC owes somebody, and everything somebody owes ILC, in one list. Composed from ' +
      'the four places obligations are actually recorded — internal tasks, confirmed follow-ups out ' +
      'of meeting and sales notes, the next step on a live deal, and open RFIs. There is no separate ' +
      'commitments table; closing an item on its own screen removes it from here. ILC staff only.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId:  { type: 'string', description: 'only commitments that trace back to this company' },
        projectId: { type: 'string', description: 'only commitments on this job' },
        ownerId:   { type: 'string', description: 'only commitments owned by this ILC user' },
        direction: { type: 'string', enum: [...DIRECTIONS] },
        status:    { type: 'string', enum: ['open', 'overdue', 'all'] },
        limit:     { type: 'integer', minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
  },
});

/** Tool names in the order they are meant to be read, introspection first. */
export const CATALOG_ORDER = Object.freeze(Object.keys(CATALOG));

/** How many tools exist. Safe to answer without authenticating anybody. */
export const TOOL_COUNT = CATALOG_ORDER.length;
