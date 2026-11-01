/**
 * The Librarian's tools. Read-only, all of them.
 *
 * Read-only is not a v1 limitation, it is the architecture. Reads go through the
 * Librarian; writes go through the Scribe (Slice 4), which is a different
 * surface with a different ledger and a different approval model. Nothing in
 * this file calls `create`, `update`, `delete` or `$executeRaw`, and nothing in
 * it should ever learn to.
 *
 * Second standing rule: **no pricing math lives here.** `CN = DN / (1 - margin)`
 * stays in src/lib/changeOrderRates.js. An MCP tool that recomputed a price
 * would be a second implementation of the money, and the two would diverge on a
 * Tuesday. These tools return stored values and let the existing engine own
 * arithmetic.
 *
 * Every tool goes through the same pipeline, in this order:
 *   checkModel → parse args → findForbiddenFields → rowScope → clamp → query → redactObject
 * The redaction is last and unconditional. There is no branch in this file that
 * returns a raw Prisma row.
 *
 * Two of those steps look similar and are not. `findForbiddenFields` + `redactObject`
 * decide WHICH FIELDS; `rowScope` decides WHICH ROWS. Field redaction alone let a
 * CLIENT_VIEWER enumerate every project and client in the business, perfectly
 * redacted, and completely listed. See src/lib/mcp/scope.js.
 */
import { prisma } from '@/lib/db';
import { NOT_CO_VERSION } from '@/lib/budgetVersions';
import { objects, objectKeys, getObject } from '@/lib/ontology/index.js';
import { redactObject, describeForAudience, readableProps, canReadObject } from '@/lib/ontology/redact.js';
import {
  checkModel, findForbiddenFields, clampLimit, parseObjectArg,
  withTimeout, DEFAULT_LIMIT, MAX_LIMIT,
} from './guards.js';
import { rowScope, applyScope, DENY } from './scope.js';
import { loadSamplesWithContext } from '@/lib/calibration/capture';
import { rateDriftReport, applySampleFilters, DRIFT_REVIEW_PCT } from '@/lib/calibration/report';
import { driverFindings, describeSuggestion } from '@/lib/calibration/drivers.js';
import { loadCommitments } from './commitments.js';
import { CATALOG } from './catalog.js';

/**
 * An error the CALLER caused. Its message is safe to hand back verbatim; every
 * other error is replaced with a generic string before it leaves the process,
 * because a Prisma error carries column names and query fragments.
 *
 * `status` separates the two things a caller can get wrong, which are not the
 * same thing and should not read the same in an audit log:
 *   400, the request is malformed (unknown tool, bad JSON, missing id).
 *   403, the request is well-formed and refused (this field, this object, this
 *         audience). A 403 is the boundary doing its job, and it is what
 *         scripts/tests/mcp.test.mjs asserts on.
 */
class McpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'McpError';
    this.status = status;
  }
}

/** The request was malformed. */
const fail = (msg) => { throw new McpError(msg, 400); };
/** The request was understood and refused. */
const deny = (msg) => { throw new McpError(msg, 403); };

/**
 * Refuse a tool the caller is not cleared for, by reading the catalogue.
 *
 * The list of ILC-only tools is declared once, in src/lib/mcp/catalog.js, and
 * agents.md is generated from that same field. A tool that says "ILC staff
 * only" in its description and forgets to say so in its audience would read as
 * private and behave as public; this is the one place that rule is enforced, so
 * there is nowhere for the two to disagree.
 */
function requireAudience(toolName, caller) {
  if (CATALOG[toolName]?.audience === 'ilc' && caller.audience !== 'ilc') {
    deny(`${toolName} is not available to this caller.`);
  }
}

/**
 * The row filter for this caller on this object, or a refusal if there is none.
 *
 * The refusal reads identically to the `canReadObject` one on purpose. "Client is
 * registered but has no scope path" and "Client is not readable by you" are
 * different facts internally, and a caller who can tell them apart has learned
 * something about the registry from a denial.
 */
function scopeOrDeny(objectKey, caller) {
  const scope = rowScope(objectKey, caller);
  if (scope === DENY) deny(`"${objectKey}" is not readable by this caller.`);
  return scope;
}

/**
 * `parseObjectArg` throws a plain Error, because guards.js cannot import McpError
 * from this file without a cycle. An unclassified error is treated as OURS by
 * every layer above, logged as `status: 'error'`, answered with 500, and
 * counted against the server in any reliability check. But `where: "{broken"` is
 * the caller's typo, not an outage. Reclassify at the boundary.
 */
function parseClause(value, label) {
  try {
    return parseObjectArg(value, label);
  } catch (err) {
    fail(err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1, introspection
// ─────────────────────────────────────────────────────────────────────────────

const list_models = {
  ...CATALOG.list_models,
  async run({ caller }) {
    return {
      models: objectKeys.map(key => ({
        model: objects[key].model,
        object: key,
        label: objects[key].label,
        description: objects[key].description,
      })),
      audience: caller.audience,
    };
  },
};

const describe_model = {
  ...CATALOG.describe_model,
  async run({ args, caller }) {
    const check = checkModel(args.model);
    if (!check.ok) fail(check.message);
    const described = describeForAudience(check.object.key, caller.audience);
    if (!described) fail(`"${args.model}" has no description available to this caller.`);
    return described;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2, generic reads
// ─────────────────────────────────────────────────────────────────────────────

const query_records = {
  ...CATALOG.query_records,
  async run({ args, caller }) {
    const check = checkModel(args.model);
    if (!check.ok) fail(check.message);
    const obj = check.object;

    if (!canReadObject(obj.key, caller.audience)) deny(`"${obj.key}" is not readable by this caller.`);

    const where   = parseClause(args.where, 'where');
    const orderBy = parseClause(args.orderBy, 'orderBy');
    const include = parseClause(args.include, 'include');
    const take    = clampLimit(args.limit);
    const skip    = Number.isFinite(Number(args.skip)) ? Math.max(0, Math.floor(Number(args.skip))) : 0;

    const forbidden = [
      ...(where   ? findForbiddenFields(where, obj, caller.audience, 'where')     : []),
      ...(orderBy ? findForbiddenFields(orderBy, obj, caller.audience, 'orderBy') : []),
    ];
    if (forbidden.length) {
      // Deliberately vague about WHY. "dnPerUnit is ilc_only" confirms the field
      // exists and what it holds; the caller learns only that the query is not
      // permitted.
      deny(`This query references fields that are not available to you: ${forbidden.join(', ')}`);
    }

    const safeInclude = buildInclude(include, obj, caller.audience);

    // Rows, not fields. Without this a client asks for Project with no filter and
    // receives the whole book of business, every field of it correctly redacted.
    const scopedWhere = applyScope(where, scopeOrDeny(obj.key, caller));

    const rows = await withTimeout(
      prisma[obj.model].findMany({
        ...(scopedWhere ? { where: scopedWhere } : {}),
        ...(orderBy ? { orderBy } : {}),
        ...(safeInclude ? { include: safeInclude } : {}),
        take,
        skip,
      }),
      undefined,
      `query_records(${obj.model})`,
    );

    return {
      model: obj.model,
      count: rows.length,
      limit: take,
      records: rows.map(r => redactObject(obj.key, r, caller.audience)),
    };
  },
};

const get_record = {
  ...CATALOG.get_record,
  async run({ args, caller }) {
    const check = checkModel(args.model);
    if (!check.ok) fail(check.message);
    const obj = check.object;
    if (!args.id || typeof args.id !== 'string') fail('id must be a string.');
    if (!canReadObject(obj.key, caller.audience)) deny(`"${obj.key}" is not readable by this caller.`);

    const safeInclude = buildInclude(parseClause(args.include, 'include'), obj, caller.audience);

    // findFirst, not findUnique: findUnique takes only a unique key, so there is
    // nowhere to AND the scope in. An out-of-scope id therefore reads as "no such
    // record" rather than "not yours", which is also the better answer to give
    // "not yours" confirms the id exists.
    const scopedWhere = applyScope({ id: args.id }, scopeOrDeny(obj.key, caller));

    const row = await withTimeout(
      prisma[obj.model].findFirst({
        where: scopedWhere,
        ...(safeInclude ? { include: safeInclude } : {}),
      }),
      undefined,
      `get_record(${obj.model})`,
    );
    if (!row) return { model: obj.model, record: null };
    return { model: obj.model, record: redactObject(obj.key, row, caller.audience) };
  },
};

const count_records = {
  ...CATALOG.count_records,
  async run({ args, caller }) {
    const check = checkModel(args.model);
    if (!check.ok) fail(check.message);
    const obj = check.object;
    if (!canReadObject(obj.key, caller.audience)) deny(`"${obj.key}" is not readable by this caller.`);

    const where = parseClause(args.where, 'where');
    // A count is still an oracle: `count(where: { dnPerUnit: { gt: N } })` is a
    // binary search over the buy price that never returns a row. Same guard.
    const forbidden = where ? findForbiddenFields(where, obj, caller.audience, 'where') : [];
    if (forbidden.length) {
      deny(`This query references fields that are not available to you: ${forbidden.join(', ')}`);
    }

    // A count over unscoped rows is a census: "how many projects does ILC have"
    // is not a question a client gets to ask, and it needs no rows to answer.
    const scopedWhere = applyScope(where, scopeOrDeny(obj.key, caller));

    const count = await withTimeout(
      prisma[obj.model].count({ ...(scopedWhere ? { where: scopedWhere } : {}) }),
      undefined,
      `count_records(${obj.model})`,
    );
    return { model: obj.model, count };
  },
};

const search = {
  ...CATALOG.search,
  async run({ args, caller }) {
    const q = String(args.query || '').trim();
    if (!q) fail('query must be a non-empty string.');
    const take = clampLimit(args.limit);

    const asNumber = /^\d+$/.test(q) ? parseInt(q, 10) : null;

    const projectWhere = applyScope(
      {
        OR: [
          { name: { contains: q } },
          ...(asNumber !== null ? [{ projectNumber: asNumber }] : []),
        ],
      },
      // AND, so the OR cannot escape the scope. Spreading these together would
      // have produced `{ OR: [...], createdById }`, which Prisma reads as
      // (name matches OR number matches) AND mine, correct by luck, not design.
      // A caller-supplied top-level OR in a future revision would not be.
      scopeOrDeny('Project', caller),
    );

    const [projects, clients] = await withTimeout(Promise.all([
      prisma.project.findMany({ where: projectWhere, take }),
      // A client-audience caller has no business enumerating ILC's account list.
      canReadObject('Client', caller.audience) && caller.audience === 'ilc'
        ? prisma.client.findMany({ where: { name: { contains: q } }, take })
        : Promise.resolve([]),
    ]), undefined, 'search');

    return {
      query: q,
      projects: projects.map(p => redactObject('Project', p, caller.audience)),
      clients:  clients.map(c => redactObject('Client', c, caller.audience)),
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tier 3, curated shapes
//
// These exist because the generic tools make an agent do four round trips to
// answer one obvious question. They are convenience over the same primitives,
// with the same redaction, not a privileged path.
// ─────────────────────────────────────────────────────────────────────────────

const get_project_360 = {
  ...CATALOG.get_project_360,
  async run({ args, caller }) {
    const where =
      args.projectId ? { id: String(args.projectId) }
      : Number.isFinite(Number(args.projectNumber)) ? { projectNumber: Number(args.projectNumber) }
      : args.name ? { name: { contains: String(args.name) } }
      : fail('Provide one of projectId, projectNumber or name.');

    // The widest read in the file, project, client, every change order, every
    // line item, so it is the one that most needs the row filter. A name like
    // "the" would otherwise hand a client the first matching project in the
    // database, whoever it belongs to.
    const scopedWhere = applyScope(where, scopeOrDeny('Project', caller));

    const project = await withTimeout(
      prisma.project.findFirst({
        where: scopedWhere,
        include: {
          client: true,
          projectData: true,
          // Sporadic site features (dog park, courts, …), live rows only, so a
          // bot sees the same list the Project Data grid shows.
          siteFeatures: { where: { archivedAt: null }, orderBy: { createdAt: 'asc' } },
          changeOrders: { include: { optionGroups: { include: { lineItems: true } } } },
          fixtureSchedules: { include: { items: true } },
          designBidMatrices: { where: { archivedAt: null, ...NOT_CO_VERSION }, include: { items: true }, orderBy: { version: 'desc' }, take: 1 },
          peerReviewItems: true,
        },
      }),
      undefined,
      'get_project_360',
    );

    if (!project) return { project: null };
    return { project: redactObject('Project', project, caller.audience) };
  },
};

const get_pipeline = {
  ...CATALOG.get_pipeline,
  async run({ args, caller }) {
    requireAudience("get_pipeline", caller);
    const take = clampLimit(args.limit);
    const rows = await withTimeout(
      prisma.project.findMany({
        ...(args.lifecycleStatus ? { where: { lifecycleStatus: String(args.lifecycleStatus) } } : {}),
        orderBy: { updatedAt: 'desc' },
        take,
        include: { client: true },
      }),
      undefined,
      'get_pipeline',
    );
    return { count: rows.length, projects: rows.map(p => redactObject('Project', p, caller.audience)) };
  },
};

const get_client_360 = {
  ...CATALOG.get_client_360,
  async run({ args, caller }) {
    requireAudience("get_client_360", caller);
    const where =
      args.clientId ? { id: String(args.clientId) }
      : args.name ? { name: { contains: String(args.name) } }
      : fail('Provide clientId or name.');

    const client = await withTimeout(
      prisma.client.findFirst({ where, include: { projects: true } }),
      undefined,
      'get_client_360',
    );
    if (!client) return { client: null };
    return { client: redactObject('Client', client, caller.audience) };
  },
};

const get_calibration = {
  ...CATALOG.get_calibration,
  async run({ args, caller }) {
    requireAudience("get_calibration", caller);
    const view = args.view ? String(args.view) : 'both';

    const all = await withTimeout(loadSamplesWithContext(), undefined, 'get_calibration');
    const filters = ['buildingType', 'serviceType', 'projectType', 'client']
      .filter(f => args[f])
      .map(f => ({ field: f, value: String(args[f]) }));
    const samples = applySampleFilters(all, filters);
    const only = args.lineKey ? String(args.lineKey) : null;

    const out = { samples: samples.length, filters };
    // A filter that matched nothing is a real answer, and a very different one
    // from "the rates all look fine". Say which it is.
    if (!samples.length) {
      out.note = all.length
        ? 'No real figures match that filter yet, so there is nothing to say about it.'
        : 'No real figures have been recorded anywhere yet.';
      return out;
    }

    if (view === 'drift' || view === 'both') {
      // The same rows the dashboard table shows, minus the per-project
      // breakdown, a bot asking "which rates are drifting" wants the lines,
      // not a list of every job behind each one.
      out.driftReviewPct = DRIFT_REVIEW_PCT;
      out.drift = rateDriftReport(samples)
        .filter(row => !only || row.lineKey === only)
        .map(({ details, ...row }) => row);
    }

    if (view === 'drivers' || view === 'both') {
      const found = driverFindings(samples);
      out.minProjectsForDrivers = found.minProjects;
      out.linesWithEnoughJobs   = found.linesRead;
      out.driverSuggestions     = only ? found.suggestions.filter(x => x.lineKey === only) : found.suggestions;
      // Plain sentences, so a bot can answer without inventing its own wording
      // for a statistic it did not compute.
      out.findings              = (only ? out.driverSuggestions : found.suggestions).map(describeSuggestion);
    }

    return out;
  },
};

const get_commitments = {
  ...CATALOG.get_commitments,
  async run({ args, caller }) {
    // Who owes what is ILC's internal running list. A client asking it would
    // learn which of their own requests we have not started, and worse, could
    // fish for commitments on other jobs. Same posture as get_calibration.
    requireAudience("get_commitments", caller);

    return withTimeout(
      loadCommitments({
        clientId:  args.clientId  ? String(args.clientId)  : undefined,
        projectId: args.projectId ? String(args.projectId) : undefined,
        ownerId:   args.ownerId   ? String(args.ownerId)   : undefined,
        direction: args.direction ? String(args.direction) : undefined,
        status:    args.status    ? String(args.status)    : undefined,
        limit:     args.limit,
      }),
      undefined,
      'get_commitments',
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────

export const TOOLS = Object.freeze([
  list_models,
  describe_model,
  query_records,
  get_record,
  count_records,
  search,
  get_project_360,
  get_pipeline,
  get_client_360,
  get_calibration,
  get_commitments,
]);

export const TOOLS_BY_NAME = Object.freeze(Object.fromEntries(TOOLS.map(t => [t.name, t])));

export { McpError };

/**
 * Rebuild a caller-supplied `include` from the object's declared links only.
 *
 * Not a filter over what they sent, a reconstruction from the allowlist. That
 * difference matters: `include: { user: { select: { passwordHash: true } } }`
 * cannot survive a rebuild that only knows how to emit link names, whereas a
 * filter has to anticipate every shape Prisma accepts. Nested selects are
 * dropped entirely; redactObject decides fields, not the caller.
 */
function buildInclude(include, obj, audience) {
  if (!include) return null;
  const out = {};
  for (const key of Object.keys(include)) {
    if (!include[key]) continue;
    const link = obj.links?.[key];
    if (!link) continue;                                   // not a declared link → dropped
    if (!canReadObject(link.object, audience)) continue;    // target unreadable → dropped
    const target = getObject(link.object);
    const nested = typeof include[key] === 'object' && include[key].include
      ? buildInclude(include[key].include, target, audience)
      : null;
    out[key] = nested ? { include: nested } : true;
  }
  return Object.keys(out).length ? out : null;
}
