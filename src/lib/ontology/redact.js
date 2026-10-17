/**
 * The object-aware redactor, an allowlist, not a denylist.
 *
 * This is the counterpart to src/lib/redact.js, and the difference between them
 * is the whole design, so it is worth being explicit:
 *
 *   src/lib/redact.js       DENYLIST, by field name, over arbitrary nested JSON.
 *                           Used on transport payloads whose shape we do not
 *                           know statically, a share response, a PDF view
 *                           model. Fails OPEN for a field nobody has named yet.
 *
 *   this file               ALLOWLIST, by declared property, on a known object.
 *                           Used wherever we know which object we are holding
 *                           every MCP read. Fails CLOSED: a column added to
 *                           schema.prisma tomorrow is absent from a non-ILC
 *                           response until someone declares it.
 *
 * The MCP server is a general-purpose read API over 116 models. A denylist there
 * would mean every new column pushed is exposed by default and stays
 * exposed until someone notices. So the read path uses this one, and the
 * denylist stays where it belongs: catching known-dangerous names in payloads
 * that were assembled by hand.
 *
 * `NEVER_READABLE` outranks both, and outranks the ILC audience: password
 * hashes, invite tokens and share-link tokens do not come out of this layer for
 * anybody. An ILC admin has other ways to do their job; a general read API that
 * can hand over a live share token is a different risk class.
 */
import { getObject } from './index.js';
import { canSee, isNeverReadable, DEFAULT_SENSITIVITY } from './sensitivity.js';

/**
 * Can this audience reach this object at all?
 *
 * ILC callers may read any allowlisted model, registered or not, they are
 * cleared for everything, and requiring an ontology entry for all 116 models
 * before an admin can query one would make the server useless on day one.
 *
 * Non-ILC callers may only reach objects that have an explicit registry entry,
 * because only those have per-property sensitivity to enforce. No declaration,
 * no access, that is what makes "fail closed" true rather than aspirational.
 */
export function canReadObject(objectKeyOrModel, audience) {
  if (audience === 'ilc') return true;
  return !!getObject(objectKeyOrModel);
}

/**
 * Strip a single record down to what `audience` is cleared to see.
 *
 * @param {string} objectKeyOrModel  registry key ('ChangeOrder') or prisma model ('changeOrder')
 * @param {object} record            a Prisma row, possibly with included relations
 * @param {'ilc'|'client'|'public'} audience
 * @returns {object|null} a new object; null if the record is null
 * @throws if a non-ILC audience is pointed at an unregistered object
 */
export function redactObject(objectKeyOrModel, record, audience) {
  if (record === null || record === undefined) return null;
  if (Array.isArray(record)) return record.map(r => redactObject(objectKeyOrModel, r, audience));

  const obj = getObject(objectKeyOrModel);

  if (!obj) {
    // ILC gets the row with only the never-readable fields removed. Anyone else
    // gets an error rather than a guess, silently returning {} would look like
    // "no data" and send someone debugging in the wrong direction.
    if (audience === 'ilc') return stripNeverReadable(record);
    throw new Error(
      `redactObject(): "${objectKeyOrModel}" has no ontology definition, so there is no ` +
      `sensitivity to enforce. Non-ILC callers cannot read it. Add it to src/lib/ontology/objects/.`
    );
  }

  const out = {};

  for (const [prop, def] of Object.entries(obj.properties)) {
    if (!(prop in record)) continue;
    if (isNeverReadable(prop)) continue;
    if (!canSee(def.sensitivity || DEFAULT_SENSITIVITY, audience)) continue;
    out[prop] = record[prop];
  }

  // Included relations. Each is redacted as ITS own object, a client reading a
  // change order with `include: { optionGroups: { include: { lineItems: true } } }`
  // must not pick up originalDN two levels down.
  for (const [linkName, link] of Object.entries(obj.links || {})) {
    if (!(linkName in record)) continue;
    const value = record[linkName];
    if (value === null || value === undefined) { out[linkName] = value; continue; }
    if (!canReadObject(link.object, audience)) continue;  // undeclared target → drop the branch
    out[linkName] = Array.isArray(value)
      ? value.map(v => redactObject(link.object, v, audience))
      : redactObject(link.object, value, audience);
  }

  // ILC keeps anything the registry has not caught up with yet (new columns,
  // ad-hoc aggregates like _count) so the internal tools never go blind on a
  // fresh migration. Non-ILC callers never reach this branch, that asymmetry
  // IS the fail-closed guarantee.
  if (audience === 'ilc') {
    for (const key of Object.keys(record)) {
      if (key in out) continue;
      if (isNeverReadable(key)) continue;
      if (obj.links?.[key]) continue;
      out[key] = record[key];
    }
  }

  return out;
}

/** Remove credential and share-token fields at any depth. Applies to every audience. */
export function stripNeverReadable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(stripNeverReadable);
  const out = {};
  for (const key of Object.keys(value)) {
    if (isNeverReadable(key)) continue;
    out[key] = stripNeverReadable(value[key]);
  }
  return out;
}

/**
 * The property names an audience may reference in a `select`, `where` or
 * `orderBy`. Used to reject a query BEFORE it reaches Prisma, filtering on a
 * field you cannot see is a working oracle for its value. `where: { dnPerUnit:
 * { gt: 100 } }` leaks the buy price one comparison at a time even if the
 * response never contains the column.
 */
export function readableProps(objectKeyOrModel, audience) {
  const obj = getObject(objectKeyOrModel);
  if (!obj) return null;   // null = "no declaration"; callers decide what that means
  const out = new Set();
  for (const [prop, def] of Object.entries(obj.properties)) {
    if (isNeverReadable(prop)) continue;
    if (!canSee(def.sensitivity || DEFAULT_SENSITIVITY, audience)) continue;
    out.add(prop);
  }
  for (const linkName of Object.keys(obj.links || {})) {
    if (canReadObject(obj.links[linkName].object, audience)) out.add(linkName);
  }
  return out;
}

/**
 * The introspection view of an object for a given audience: description, links,
 * actions, and only the properties that audience could actually retrieve.
 * An `ilc_only` property is not listed as "redacted" for a client, it is
 * absent. Telling a contractor "there is a field here called dnPerUnit that you
 * may not see" is itself a disclosure.
 */
export function describeForAudience(objectKeyOrModel, audience) {
  const obj = getObject(objectKeyOrModel);
  if (!obj) return null;

  const properties = {};
  for (const [prop, def] of Object.entries(obj.properties)) {
    if (isNeverReadable(prop)) continue;
    if (!canSee(def.sensitivity || DEFAULT_SENSITIVITY, audience)) continue;
    properties[prop] = {
      type: def.type,
      ...(def.desc   ? { description: def.desc } : {}),
      ...(def.values ? { values: def.values }    : {}),
      // Only ILC is told the classification; for others the field is simply present.
      ...(audience === 'ilc' ? { sensitivity: def.sensitivity } : {}),
    };
  }

  const links = {};
  for (const [name, link] of Object.entries(obj.links || {})) {
    if (!canReadObject(link.object, audience)) continue;
    links[name] = { object: link.object, cardinality: link.cardinality };
  }

  return {
    key: obj.key,
    label: obj.label,
    model: obj.model,
    description: descriptionForAudience(obj, audience, properties),
    properties,
    links,
    actions: obj.actions || [],
  };
}

/**
 * The object's prose description, for an audience that may not see every field.
 *
 * Suppressing a field from `properties` is not enough on its own: these
 * descriptions are written for ILC and several of them explain the sensitive
 * fields by name, ChangeOrderLineItem's says outright that `originalDN` is what
 * ILC pays the manufacturer. Shipping that to a contractor discloses the field,
 * its meaning, and the fact that a buy price is stored, which is most of what
 * the property-level redaction just withheld.
 *
 * So: an object may declare `clientDescription` for the non-ILC view. If it does
 * not, and its description names a field this audience cannot read, the
 * description is dropped rather than guessed at, the same fail-closed default
 * as the rest of this file. Losing a sentence of help costs an agent one extra
 * call; leaking it costs the DN rule.
 */
function descriptionForAudience(obj, audience, visibleProperties) {
  if (audience === 'ilc') return obj.description;
  if (obj.clientDescription) return obj.clientDescription;
  if (!obj.description) return obj.description;

  const namesHidden = Object.keys(obj.properties).some(
    prop => !(prop in visibleProperties) && new RegExp(`\\b${escapeRe(prop)}\\b`).test(obj.description),
  );
  return namesHidden ? undefined : obj.description;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
