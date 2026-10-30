// The choices a saved-filter list can pick from (0147), as { value, label }.
import { prisma } from '@/lib/db';
import { CONTACT_DEPARTMENTS } from '@/lib/contactDepartments';
import { CLIENT_TYPES } from '@/lib/utils';
import { RULE_FIELDS } from './audience';

const TIERS = [
  { value: 'VIP_CLIENT', label: 'VIP client' },
  { value: 'ACTIVE_DEAL', label: 'Active deal' },
  { value: 'WARM_PROSPECT', label: 'Warm prospect' },
  { value: 'PAST_CLIENT', label: 'Past client' },
  { value: 'COLD_PROSPECT', label: 'Cold prospect' },
];

const distinct = (rows, key) => [...new Set(rows.map((r) => String(r[key] || '').trim()).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));

export async function ruleOptions() {
  const [tags, markets, states, companies] = await Promise.all([
    prisma.contactTag.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { branchMarket: { not: null } }, select: { branchMarket: true } }),
    prisma.client.findMany({ where: { state: { not: null } }, select: { state: true } }),
    // Branches ride with their parent ("Company (and its branches)").
    prisma.client.findMany({ where: { parentClientId: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return {
    fields: Object.entries(RULE_FIELDS).map(([value, label]) => ({ value, label })),
    values: {
      TAG: tags.map((t) => ({ value: t.id, label: t.name })),
      DEPARTMENT: CONTACT_DEPARTMENTS.map((d) => ({ value: d.key, label: d.label })),
      COMPANY_TYPE: CLIENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
      BRANCH_MARKET: distinct(markets, 'branchMarket'),
      CADENCE_TIER: TIERS,
      STATE: distinct(states, 'state'),
      COMPANY: companies.map((c) => ({ value: c.id, label: c.name })),
    },
  };
}
