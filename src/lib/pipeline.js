// Pipeline model — a Project IS the pipeline entity (Deal merged in).
// Board membership is DERIVED from serviceType; never stored as a fixed tag.
// Each board has its OWN stage set and its OWN status.

// Mike 2026-09-04: "we still want two pipelines created by the service type of
// that project exactly how we have it right now. we just are going to have the
// same pipeline stages." Both boards now share ONE stage list. The old Design
// keys (DESIGN_QUALIFIED / PROPOSAL_SENT / DESIGN / CONSTRUCTION_ADMIN /
// DESIGN_COMPLETED) were migrated in 0061 and are only kept below as a read-side
// safety net for anything that still carries one.
// Mike 2026-09-07 renamed the middle two so one label reads correctly on BOTH
// boards at once: at that point in a job the design side is doing CA while the
// procurement side is buying, and both projects sit in the same column.
//
// These are LABELS ONLY. The stored keys are untouched on purpose — renaming
// PRECONSTRUCTION or CONSTRUCTION would mean rewriting every project row and
// every saved bot rule, filter and dashboard that names a stage, for no gain
// the user can see. What is on screen is what changed.
const SHARED_STAGES = [
  { key: 'QUALIFIED',       label: 'Qualified' },
  { key: 'PRECONSTRUCTION', label: 'Design / Pre-Con' },
  { key: 'BUYOUT',          label: 'Buyout' },
  { key: 'CONSTRUCTION',    label: 'CA / Procurement' },
  { key: 'COMPLETED',       label: 'Completed' },
];

export const PIPELINE_STAGES = {
  PROCUREMENT: SHARED_STAGES,
  DESIGN:      SHARED_STAGES,
};

export const STAGE_KEYS = SHARED_STAGES.map(s => s.key);

export const DEFAULT_STAGE = { PROCUREMENT: 'QUALIFIED', DESIGN: 'QUALIFIED' };

// Old Design-board keys → the shared key they became (mirrors migration 0061).
export const LEGACY_DESIGN_STAGE = {
  DESIGN_QUALIFIED:   'QUALIFIED',
  PROPOSAL_SENT:      'QUALIFIED',   // "proposal sent" lives on proposalSentDate now
  DESIGN:             'PRECONSTRUCTION',
  CONSTRUCTION_ADMIN: 'CONSTRUCTION',
  DESIGN_COMPLETED:   'COMPLETED',
};

/** Any stage value (shared or legacy design key) → a shared key. */
export function normalizeStage(stage) {
  if (!stage) return null;
  if (STAGE_KEYS.includes(stage)) return stage;
  return LEGACY_DESIGN_STAGE[stage] ?? null;
}

// Discrete next-action vocabulary for the weekly sales meeting (Mike, 2026-07-06).
// "Keep for now, add/remove later." Each deal carries one current next action.
export const NEXT_ACTION_TYPES = [
  { key: 'CALL',               label: 'Call' },
  { key: 'EMAIL',              label: 'Email' },
  { key: 'TEXT',               label: 'Text' },
  { key: 'SEND_PROPOSAL',      label: 'Send proposal' },
  { key: 'CHASE_SIGNATURE',    label: 'Chase signature' },
  { key: 'SEND_BUDGET',        label: 'Send budget' },
  { key: 'SEND_PHOTOMETRICS',  label: 'Send photometrics' },
  { key: 'SCHEDULE_GC_MEETING',label: 'Schedule GC meeting' },
  { key: 'REQUEST_EE_INTRO',   label: 'Request EE intro' },
  { key: 'SEND_INVOICE',       label: 'Send invoice' },
  { key: 'WAITING',            label: 'Waiting / blocked' },
];
export const NEXT_ACTION_LABEL = Object.fromEntries(NEXT_ACTION_TYPES.map(a => [a.key, a.label]));
export const NEXT_ACTION_KEYS  = NEXT_ACTION_TYPES.map(a => a.key);

export const STAGE_LABEL = {
  ...Object.fromEntries(SHARED_STAGES.map(s => [s.key, s.label])),
  // legacy design keys render as the shared stage they map to
  ...Object.fromEntries(Object.entries(LEGACY_DESIGN_STAGE).map(([k, v]) => [k, SHARED_STAGES.find(s => s.key === v).label])),
};

// Per-pipeline status (each board carries its own).
export const PIPELINE_STATUS = [
  { key: 'OPEN',      label: 'Open' },
  { key: 'WON',       label: 'Won' },
  { key: 'LOST',      label: 'Lost' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'ABANDONED', label: 'Abandoned' },
];
export const STATUS_LABEL = Object.fromEntries(PIPELINE_STATUS.map(s => [s.key, s.label]));

// ── Win rate — ONE definition, used everywhere (Mike, 2026-07-06) ─────────────
// Won ÷ every project that has moved PAST Open. A COMPLETED job was won and then
// delivered, so it counts as a win — otherwise finishing work would lower the rate.
// Never redefine this locally; import it. Two numbers under one label is the bug
// this replaces (the CRM stats bar and the dashboard disagreed).
export const WON_STATUSES     = ['WON', 'COMPLETED'];
export const DECIDED_STATUSES = ['WON', 'COMPLETED', 'LOST', 'ABANDONED']; // i.e. everything past OPEN
export const WIN_RATE_DESCRIPTION =
  'Won ÷ every project past Open (won + completed, over won + completed + lost + abandoned).';

/** Win rate as a 0–100 number, or null when nothing has been decided yet. */
export function winRate(projects, statusField = 'procurementStatus') {
  const decided = projects.filter(p => DECIDED_STATUSES.includes(p[statusField]));
  if (!decided.length) return null;
  const won = decided.filter(p => WON_STATUSES.includes(p[statusField]));
  return Math.round((won.length / decided.length) * 100);
}

// ── Probability — the average of the two entered values ───────────────────────
// probabilityToWin + probabilityToMoveForward; falls back to whichever exists,
// then to the legacy single field. Mirrors the sales dashboard provider so the
// CRM card and the dashboard can never show different numbers.
export function averageProbability(project) {
  const parts = [project?.probabilityToWin, project?.probabilityToMoveForward]
    .filter(v => v != null && v !== '');
  if (parts.length) return Math.round(parts.reduce((a, b) => a + Number(b), 0) / parts.length);
  return project?.pipelineProbability ?? null;
}

// Full Design / Design Assist carry a design fee → they appear in BOTH boards
// (and are the only ones with a design status / the out-of-sync badge).
export const DESIGN_SERVICE_TYPES = ['fullDesign', 'designAssist'];

export function inProcurementPipeline(_serviceType) { return true; } // every project sells product
export function inDesignPipeline(serviceType) { return DESIGN_SERVICE_TYPES.includes(serviceType); }

export function stageFieldFor(pipeline)  { return pipeline === 'DESIGN' ? 'designStage'  : 'procurementStage'; }
export function statusFieldFor(pipeline) { return pipeline === 'DESIGN' ? 'designStatus' : 'procurementStatus'; }

// Procurement → product sale; Design → design fee.
export function revenueFor(project, pipeline) {
  return pipeline === 'DESIGN' ? (project.designContractValue ?? null) : (project.contractValue ?? null);
}

// ── Out-of-sync rule ──────────────────────────────────────────────────────────
// Both boards share one stage list (2026-09-04), so a dual-pipeline project is
// in sync exactly when its two stages match. Legacy design keys are normalized
// first so an un-migrated row doesn't false-flag.
export function stagesOutOfSync(project) {
  if (!inDesignPipeline(project.serviceType)) return false; // only dual-pipeline projects
  const design = normalizeStage(project.designStage);
  const proc   = normalizeStage(project.procurementStage);
  if (!design || !proc) return false; // unknown stage — don't false-flag
  return design !== proc;
}
