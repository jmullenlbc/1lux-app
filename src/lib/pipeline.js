// Pipeline model — a Project IS the pipeline entity (Deal merged in).
// Board membership is DERIVED from serviceType; never stored as a fixed tag.
// Each board has its OWN stage set and its OWN status.

export const PIPELINE_STAGES = {
  PROCUREMENT: [
    { key: 'QUALIFIED',       label: 'Qualified' },
    { key: 'PRECONSTRUCTION', label: 'Pre-Construction' },
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
