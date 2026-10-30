// Who a campaign list reaches (0147). A FILTER list is saved rules (same field
// ORs, different fields AND); a FIXED list is people picked by hand. Either
// way: people with a good email, not archived, not on the do-not-email list,
// one send per address.
import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/salesDocs/matching';

export const RULE_FIELDS = {
  TAG: 'Tag',
  DEPARTMENT: 'Department',
  COMPANY_TYPE: 'Company type',
  BRANCH_MARKET: 'Branch market',
  CADENCE_TIER: 'Check-in tier',
  STATE: 'Company state',
  COMPANY: 'Company (and its branches)',
};

function ruleCondition(field, values) {
  switch (field) {
    case 'TAG': return { tagLinks: { some: { tagId: { in: values } } } };
    case 'DEPARTMENT': return { department: { in: values } };
    case 'CADENCE_TIER': return { cadenceTier: { in: values } };
    case 'COMPANY_TYPE': return { client: { type: { in: values } } };
    case 'BRANCH_MARKET': return { client: { branchMarket: { in: values } } };
    case 'STATE': return { client: { state: { in: values } } };
    case 'COMPANY': return { OR: [{ clientId: { in: values } }, { client: { parentClientId: { in: values } } }] };
    default: return null;
  }
}

/** Prisma where for a FILTER list, or null when it has no usable rules (never "everyone"). */
export function rulesWhere(rules) {
  const byField = new Map();
  for (const r of rules || []) {
    if (r.archivedAt || !RULE_FIELDS[r.field] || !String(r.value || '').trim()) continue;
    byField.set(r.field, [...(byField.get(r.field) || []), String(r.value).trim()]);
  }
  const and = [...byField].map(([f, vals]) => ruleCondition(f, vals)).filter(Boolean);
  return and.length ? { AND: and } : null;
}

const PERSON_SELECT = { id: true, name: true, firstName: true, preferredName: true, email: true };

async function listPeople(list) {
  if (list.kind === 'FILTER') {
    const where = rulesWhere(list.rules);
    if (!where) return [];
    return prisma.contact.findMany({ where, select: PERSON_SELECT, orderBy: { name: 'asc' } });
  }
  const members = await prisma.campaignListMember.findMany({ where: { listId: list.id, archivedAt: null }, select: { contactId: true } });
  if (!members.length) return [];
  return prisma.contact.findMany({ where: { id: { in: members.map((m) => m.contactId) } }, select: PERSON_SELECT, orderBy: { name: 'asc' } });
}

/** Addresses on the do-not-email list right now, from the ones given. */
export async function suppressedSet(emails) {
  if (!emails.length) return new Set();
  const rows = await prisma.campaignSuppression.findMany({ where: { email: { in: emails }, liftedAt: null }, select: { email: true } });
  return new Set(rows.map((r) => r.email));
}

/**
 * { recipients: [{contactId, email, name, firstName}], skipped: [{...,reason}], counts }
 * listId or a loaded list ({ id, kind, rules }).
 */
export async function resolveAudience(listOrId) {
  const list = typeof listOrId === 'string'
    ? await prisma.campaignList.findUnique({ where: { id: listOrId }, include: { rules: { where: { archivedAt: null } } } })
    : listOrId;
  const counts = { people: 0, noEmail: 0, suppressed: 0, duplicate: 0, ready: 0 };
  if (!list || list.archivedAt) return { recipients: [], skipped: [], counts };
  const people = await listPeople(list);
  counts.people = people.length;
  const seen = new Set();
  const withEmail = [];
  for (const p of people) {
    const email = normalizeEmail(p.email);
    if (!email) { counts.noEmail += 1; continue; }
    if (seen.has(email)) { counts.duplicate += 1; continue; }
    seen.add(email);
    withEmail.push({ contactId: p.id, email, name: p.name, firstName: p.preferredName || p.firstName || null });
  }
  const blocked = await suppressedSet(withEmail.map((r) => r.email));
  const recipients = [];
  const skipped = [];
  for (const r of withEmail) {
    if (blocked.has(r.email)) { skipped.push({ ...r, reason: 'SUPPRESSED' }); counts.suppressed += 1; } else recipients.push(r);
  }
  counts.ready = recipients.length;
  return { recipients, skipped, counts };
}
