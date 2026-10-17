/**
 * The ontology registry, the single semantic description of ILC's data.
 *
 * Plain JS objects describing existing Prisma models. No new tables, no engine,
 * no versioning, no lineage graph. We are borrowing Palantir's Object / Link /
 * Action vocabulary and the single-source-of-truth discipline, and nothing else.
 *
 * What it buys, concretely:
 *
 *   1. An agent introspecting the platform sees "a Change Order has many Option
 *      Groups" rather than a column dump it has to infer relationships from.
 *   2. Field sensitivity is declared exactly once, on the property, and every
 *      consumer inherits it, the MCP read path today, share links and PDFs as
 *      they get folded on.
 *   3. Undeclared means `ilc_only`. A column added next week is invisible to
 *      non-ILC callers until somebody deliberately widens it.
 *
 * Deliberately does NOT import @prisma/client. The registry is a description,
 * and keeping it dependency-free means it unit-tests under plain `node --test`.
 * The registry-vs-real-schema comparison lives in
 * scripts/check-sensitivity-coverage.mjs, which does load the DMMF and fails the
 * build when the two drift apart.
 */
import { Project } from './objects/project.js';
import { Client } from './objects/client.js';
import { ChangeOrder, ChangeOrderOptionGroup, ChangeOrderLineItem } from './objects/changeOrder.js';
import {
  FixtureSchedule, FixtureScheduleItem,
  DesignBidMatrix, DesignBidMatrixItem,
  PeerReviewItem, ProjectData,
} from './objects/budget.js';
import { Task, Note, NoteAction, Contact, RFI, SalesExpense } from './objects/crm.js';
import { SENSITIVITY, DEFAULT_SENSITIVITY, NEVER_READABLE } from './sensitivity.js';

const ALL = [
  Project,
  Client,
  ChangeOrder, ChangeOrderOptionGroup, ChangeOrderLineItem,
  FixtureSchedule, FixtureScheduleItem,
  DesignBidMatrix, DesignBidMatrixItem,
  PeerReviewItem, ProjectData,
  Task, Note, NoteAction, Contact, RFI, SalesExpense,
];

/** objectKey → definition. e.g. objects.ChangeOrder */
export const objects = Object.freeze(Object.fromEntries(ALL.map(o => [o.key, o])));

/** prisma model name (camelCase) → definition. e.g. byModel.changeOrder */
export const byModel = Object.freeze(Object.fromEntries(ALL.map(o => [o.model, o])));

export const objectKeys = Object.freeze(ALL.map(o => o.key));

/** Look up by object key OR prisma model name, case-insensitively on the key. */
export function getObject(keyOrModel) {
  if (!keyOrModel || typeof keyOrModel !== 'string') return null;
  if (objects[keyOrModel]) return objects[keyOrModel];
  if (byModel[keyOrModel]) return byModel[keyOrModel];
  const lower = keyOrModel.toLowerCase();
  return ALL.find(o => o.key.toLowerCase() === lower || o.model.toLowerCase() === lower) || null;
}

/** The declared sensitivity of one property, or the fail-closed default. */
export function sensitivityOf(objectKey, prop) {
  const obj = getObject(objectKey);
  return obj?.properties?.[prop]?.sensitivity || DEFAULT_SENSITIVITY;
}

/**
 * Every field name declared `ilc_only` anywhere in the registry.
 *
 * This is what src/lib/redact.js consumes, so the name-keyed transport-level
 * strip and the object-aware fail-closed strip are driven by the same
 * declarations. Adding `sensitivity: 'ilc_only'` to a property here is what
 * makes the field disappear from share links and PDFs too, there is no second
 * list to remember.
 */
export function ilcOnlyFieldNames() {
  const names = new Set();
  for (const obj of ALL) {
    for (const [prop, def] of Object.entries(obj.properties || {})) {
      if ((def.sensitivity || DEFAULT_SENSITIVITY) === SENSITIVITY.ILC_ONLY) names.add(prop);
    }
  }
  return names;
}

/**
 * Field names that are safe to strip globally by NAME across arbitrary nested
 * payloads, the set consumed by the transport-level redactor.
 *
 * Not every `ilc_only` property qualifies. `notes`, `status` and `createdAt` are
 * `ilc_only` on some objects and `client_ok` on others; stripping them by bare
 * name everywhere would blank out client-facing data. So a name only makes the
 * global list if it is `ilc_only` on EVERY object that declares it, and is not
 * `client_ok` or `public` anywhere. Ambiguous names are left to the object-aware
 * redactor, which knows which object it is looking at.
 */
export function globallyIlcOnlyFieldNames() {
  const ilcOnly = new Set();
  const widerSomewhere = new Set();
  for (const obj of ALL) {
    for (const [prop, def] of Object.entries(obj.properties || {})) {
      if ((def.sensitivity || DEFAULT_SENSITIVITY) === SENSITIVITY.ILC_ONLY) ilcOnly.add(prop);
      else widerSomewhere.add(prop);
    }
  }
  for (const name of widerSomewhere) ilcOnly.delete(name);
  return ilcOnly;
}

/**
 * Buy-price and rate fields on models the registry does not describe yet.
 *
 * These are name-strips only, an interim measure. The real fix for each is an
 * object definition, because an undeclared object is unreachable to a non-ILC
 * MCP caller anyway (redactObject throws rather than guessing). This list exists
 * for the OTHER path: hand-assembled transport payloads that never pass through
 * the object-aware redactor.
 *
 * Deliberately absent: `cost` (ManufacturerProduct.cost, the catalog buy price).
 * The name is used as a local key in a couple of dozen pricing components, and
 * stripping it by bare name would blank out client-facing quote rows to close a
 * hole that the fail-closed allowlist already covers. It gets an object
 * definition instead.
 */
const UNREGISTERED_GLOBAL_DENY = Object.freeze([
  'budget_cost',      // ILCSpec, catalog buy cost
  'rateSnapshot',     // Proposal, frozen rates, same shape as pricingSnapshot
  'adderPct',         // Proposal
  'defaultAdderPct',  // ProposalTemplate
]);

/**
 * The transport-level denylist: every property flagged `globalDeny` in the
 * registry, plus the unregistered supplement above.
 *
 * `globalDeny: true` is a stronger claim than `sensitivity: 'ilc_only'`. It says
 * the bare field NAME is unambiguous across all 116 models, so seeing it in a
 * payload of unknown shape is enough to strip it. `marginPct` qualifies;
 * `notes` never could. src/lib/redact.js consumes exactly this set, so there is
 * no second list to keep in sync, flagging a property here is what makes it
 * disappear from share links and PDFs.
 */
export function globalDenyFieldNames() {
  const names = new Set(UNREGISTERED_GLOBAL_DENY);
  for (const obj of ALL) {
    for (const [prop, def] of Object.entries(obj.properties || {})) {
      if (def.globalDeny) names.add(prop);
    }
  }
  return names;
}

/** Names that are ilc_only on one object but client-visible on another. */
export function ambiguousFieldNames() {
  const all = ilcOnlyFieldNames();
  const global = globallyIlcOnlyFieldNames();
  return new Set([...all].filter(n => !global.has(n)));
}

/**
 * Sanity-check the registry shape. Called by the unit tests and by the
 * coverage gate; cheap enough to also call at server start.
 * Returns an array of human-readable problems, empty means clean.
 */
export function validateRegistry() {
  const problems = [];
  const seenKeys = new Set();
  const seenModels = new Set();
  const validLevels = new Set(Object.values(SENSITIVITY));

  for (const obj of ALL) {
    if (!obj.key)   problems.push(`an object has no key: ${JSON.stringify(obj).slice(0, 80)}`);
    if (!obj.model) problems.push(`${obj.key}: no prisma model name`);
    if (!obj.description) problems.push(`${obj.key}: no description, introspection needs it to be useful`);
    if (seenKeys.has(obj.key))     problems.push(`duplicate object key: ${obj.key}`);
    if (seenModels.has(obj.model)) problems.push(`duplicate prisma model: ${obj.model}`);
    seenKeys.add(obj.key);
    seenModels.add(obj.model);

    for (const [prop, def] of Object.entries(obj.properties || {})) {
      if (!def.sensitivity) {
        problems.push(`${obj.key}.${prop}: no sensitivity declared (would default to ilc_only, declare it explicitly)`);
      } else if (!validLevels.has(def.sensitivity)) {
        problems.push(`${obj.key}.${prop}: unknown sensitivity "${def.sensitivity}"`);
      }
      if (NEVER_READABLE.has(prop)) {
        problems.push(`${obj.key}.${prop}: declared in the registry but is in NEVER_READABLE, remove it from the object`);
      }
      if (def.globalDeny && def.sensitivity !== SENSITIVITY.ILC_ONLY) {
        problems.push(`${obj.key}.${prop}: globalDeny is set but sensitivity is "${def.sensitivity}", globalDeny only makes sense on ilc_only`);
      }
    }

    for (const [name, link] of Object.entries(obj.links || {})) {
      if (!link.object) problems.push(`${obj.key}.links.${name}: no target object`);
      else if (!ALL.some(o => o.key === link.object)) {
        problems.push(`${obj.key}.links.${name}: points at "${link.object}", which is not in the registry`);
      }
      if (!['one', 'many'].includes(link.cardinality)) {
        problems.push(`${obj.key}.links.${name}: cardinality must be 'one' or 'many'`);
      }
    }
  }

  // The globalDeny invariant. A name on the transport denylist is stripped from
  // every payload by bare name, so if any object declares that same name as
  // client-visible, one of the two declarations is a bug, either a client
  // surface is about to go blank, or a buy price is about to ship. Catch it here
  // rather than in a support ticket.
  const flaggedGlobal = new Set();
  for (const obj of ALL) {
    for (const [prop, def] of Object.entries(obj.properties || {})) {
      if (def.globalDeny) flaggedGlobal.add(prop);
    }
  }
  for (const obj of ALL) {
    for (const [prop, def] of Object.entries(obj.properties || {})) {
      if (!flaggedGlobal.has(prop)) continue;
      if ((def.sensitivity || DEFAULT_SENSITIVITY) !== SENSITIVITY.ILC_ONLY) {
        problems.push(
          `${obj.key}.${prop}: is "${def.sensitivity}" here but flagged globalDeny elsewhere. ` +
          `The transport redactor strips it by name everywhere, so this declaration can never take effect.`
        );
      }
    }
  }

  return problems;
}

export { SENSITIVITY, DEFAULT_SENSITIVITY, NEVER_READABLE };
