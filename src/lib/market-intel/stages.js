/**
 * Municipal stage of a city filing (Mike 10-9: "filterable by the stage of
 * that project"). Pure, so the card and the signals route agree.
 *
 * Stored kinds: PERMIT (building permit), CONCEPT (planning case from the
 * concept feeds) and, once the agenda reader exists, COUNCIL. A CONCEPT row
 * whose case type is a land use approval (rezoning, PUD, conditional use,
 * plat) is a site entitlement; the rest (site plan, concept plan, design
 * review) is a concept submission. No migration: kind stays a plain string.
 */
export const STAGES = [
  { value: 'CONCEPT',     label: 'Concept submissions',    chip: 'Concept submission', color: 'bg-amber-100 text-amber-800' },
  { value: 'ENTITLEMENT', label: 'Site entitlements',      chip: 'Site entitlement',   color: 'bg-yellow-100 text-yellow-800' },
  { value: 'COUNCIL',     label: 'City council approvals', chip: 'Council approval',   color: 'bg-sky-100 text-sky-700' },
  { value: 'PERMIT',      label: 'Permit submissions',     chip: 'Permit',             color: 'bg-orange-100 text-orange-700' },
];
export const STAGE_BY_VALUE = Object.fromEntries(STAGES.map(s => [s.value, s]));
export const MUNICIPAL_KINDS = ['PERMIT', 'CONCEPT', 'COUNCIL'];

// Words in a case type that make it a land use approval.
export const ENTITLEMENT_WORDS = ['zoning', 'rezon', 'planned unit', 'pud', 'planned development', 'conditional use', 'special use', 'annex', 'plat', 'subdivision', 'variance', 'entitle'];

export function isEntitlementClass(permitClass) {
  const c = String(permitClass || '').toLowerCase();
  return !!c && ENTITLEMENT_WORDS.some(w => c.includes(w));
}

/** The stage of one signal, or null for an article. */
export function municipalStage(signal = {}) {
  if (signal.kind === 'PERMIT')  return 'PERMIT';
  if (signal.kind === 'COUNCIL') return 'COUNCIL';
  if (signal.kind === 'CONCEPT') return isEntitlementClass(signal.permitClass) ? 'ENTITLEMENT' : 'CONCEPT';
  return null;
}

/** Prisma where fragment for a stage list ("ALL", "PERMIT", "CONCEPT,ENTITLEMENT"). */
export function stageWhere(stageParam) {
  const raw    = String(stageParam || 'ALL').toUpperCase().split(',').map(s => s.trim()).filter(Boolean);
  const stages = raw.includes('ALL') ? STAGES.map(s => s.value) : raw.filter(s => STAGE_BY_VALUE[s]);
  if (!stages.length) return { kind: { in: MUNICIPAL_KINDS } };
  const entitlement = { OR: ENTITLEMENT_WORDS.map(w => ({ permitClass: { contains: w, mode: 'insensitive' } })) };
  const parts = [];
  if (stages.includes('PERMIT'))  parts.push({ kind: 'PERMIT' });
  if (stages.includes('COUNCIL')) parts.push({ kind: 'COUNCIL' });
  const concept = stages.includes('CONCEPT'), ent = stages.includes('ENTITLEMENT');
  if (concept && ent) parts.push({ kind: 'CONCEPT' });
  // A blank case type is a concept submission; SQL NOT on a null would drop it.
  else if (concept)   parts.push({ kind: 'CONCEPT', OR: [{ permitClass: null }, { NOT: entitlement }] });
  else if (ent)       parts.push({ kind: 'CONCEPT', ...entitlement });
  return parts.length === 1 ? parts[0] : { OR: parts };
}
