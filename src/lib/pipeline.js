// Pipeline model — a Project IS the pipeline entity (Deal merged in).
// Board membership is DERIVED from serviceType; never stored as a fixed tag.
// Each board has its OWN stage set and its OWN status.

export const PIPELINE_STAGES = {
  PROCUREMENT: [
    { key: 'QUALIFIED',       label: 'Qualified' },
    { key: 'PRECONSTRUCTION', label: 'Pre-Construction' },
    { key: 'BUYOUT',          label: 'Buyout' },
    { key: 'CONSTRUCTION',    label: 'Construction' },
    { key: 'COMPLETED',       label: 'Completed' },
  ],
  DESIGN: [
    { key: 'DESIGN_QUALIFIED',   label: 'Design Qualified' },
    { key: 'PROPOSAL_SENT',      label: 'Proposal Sent' },
    { key: 'DESIGN',             label: 'Design' },
    { key: 'CONSTRUCTION_ADMIN', label: 'Construction Admin' },
    { key: 'DESIGN_COMPLETED',   label: 'Design Completed' },
  ],
};

export const DEFAULT_STAGE = { PROCUREMENT: 'QUALIFIED', DESIGN: 'DESIGN_QUALIFIED' };

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

export const STAGE_LABEL = Object.fromEntries(
  [...PIPELINE_STAGES.PROCUREMENT, ...PIPELINE_STAGES.DESIGN].map(s => [s.key, s.label])
);

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

// ── Out-of-sync rules (Mike, 2026-06-25) ──────────────────────────────────────
// For dual-pipeline projects, each Design stage has exactly ONE valid Procurement
// stage it must accompany. Any other pairing = out of sync → flag the card.
//   Design Qualified / Proposal Sent  ↔  Procurement Qualified
//   Design                            ↔  Procurement Pre-Construction
//   Construction Admin                ↔  Procurement Construction
//   Design Completed                  ↔  Procurement Completed
const DESIGN_TO_PROCUREMENT = {
  DESIGN_QUALIFIED:   'QUALIFIED',
  PROPOSAL_SENT:      'QUALIFIED',
  DESIGN:             'PRECONSTRUCTION',
  CONSTRUCTION_ADMIN: 'CONSTRUCTION',
  DESIGN_COMPLETED:   'COMPLETED',
};

export function stagesOutOfSync(project) {
  if (!inDesignPipeline(project.serviceType)) return false; // only dual-pipeline projects
  const expectedProcurement = DESIGN_TO_PROCUREMENT[project.designStage];
  if (!expectedProcurement) return false; // unknown stage — don't false-flag
  return expectedProcurement !== project.procurementStage;
}
