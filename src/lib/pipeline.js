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

// Per-pipeline status (each board carries its own). This is the PICKER list —
// what somebody can set a board to today.
//
// Maram 9-17 / Mike 9-18: "Completed" is gone from the picker (a won job that
// finished is still simply Won — finishing work is not a sales status) and
// "On Hold" is new. On Hold is neither open nor decided: it drops out of the
// open-pipeline totals and out of the win-rate denominator, and it has its own
// revenue figure so a parked deal is never mistaken for a dead one.
export const PIPELINE_STATUS = [
  { key: 'OPEN',      label: 'Open' },
  { key: 'ON_HOLD',   label: 'On Hold' },
  { key: 'WON',       label: 'Won' },
  { key: 'LOST',      label: 'Lost' },
  { key: 'ABANDONED', label: 'Abandoned' },
];
// Read-side only: rows that were set to Completed before 2026-09-18 keep
// reading as "Completed" and still count as won. Nobody can pick it any more.
export const LEGACY_STATUS = [
  { key: 'COMPLETED', label: 'Completed' },
];
export const STATUS_LABEL = Object.fromEntries([...LEGACY_STATUS, ...PIPELINE_STATUS].map(s => [s.key, s.label]));
/** Keys a board may be SET to (the picker). COMPLETED is deliberately not here. */
export const SETTABLE_STATUS_KEYS = PIPELINE_STATUS.map(s => s.key);
/** Every key a board may currently HOLD, legacy included. */
export const ALL_STATUS_KEYS = Object.keys(STATUS_LABEL);
export const ON_HOLD_STATUSES = ['ON_HOLD'];
export function isOnHold(status) { return ON_HOLD_STATUSES.includes(status); }

// ── Win rate — ONE definition, used everywhere (Mike, 2026-07-06) ─────────────
// Won ÷ every project that has moved PAST Open. A COMPLETED job was won and then
// delivered, so it counts as a win — otherwise finishing work would lower the rate.
// Never redefine this locally; import it. Two numbers under one label is the bug
// this replaces (the CRM stats bar and the dashboard disagreed).
//
// Re-confirmed by Mike, 2026-09-08: "Win rate should always be win divided by
// lost+abandoned. Open is neither win or loss." Abandoned counts against the
// rate; an open deal is not in the denominator at all.
export const WON_STATUSES     = ['WON', 'COMPLETED'];
export const DECIDED_STATUSES = ['WON', 'COMPLETED', 'LOST', 'ABANDONED']; // i.e. everything past OPEN (On Hold is NOT decided)
export const WIN_RATE_DESCRIPTION =
  'Won ÷ every project past Open (won + completed, over won + completed + lost + abandoned). Open and On Hold are left out.';
// Maram 9-17 asked for a second win rate beside the first. The first already
// leaves Open out, so the useful second figure is the one that keeps everything
// in: won ÷ every project on the board, open and on hold included. It answers
// "of everything we have ever chased, how much did we land?"
export const WIN_RATE_ALL_DESCRIPTION =
  'Won ÷ every project on this board, including the ones still open or on hold.';

/** Win rate as a 0–100 number, or null when nothing has been decided yet. */
export function winRate(projects, statusField = 'procurementStatus') {
  const decided = projects.filter(p => DECIDED_STATUSES.includes(p[statusField]));
  if (!decided.length) return null;
  const won = decided.filter(p => WON_STATUSES.includes(p[statusField]));
  return Math.round((won.length / decided.length) * 100);
}

/** Win rate over EVERY project on the board (open and on hold included), or null when empty. */
export function winRateAllProjects(projects, statusField = 'procurementStatus') {
  if (!projects.length) return null;
  const won = projects.filter(p => WON_STATUSES.includes(p[statusField]));
  return Math.round((won.length / projects.length) * 100);
}

// ── Probability — the average of the two entered values ───────────────────────
// probabilityToWin + probabilityToMoveForward; falls back to whichever exists,
// then to the legacy single field. Mirrors the sales dashboard provider so the
// CRM card and the dashboard can never show different numbers.
//
// Maram 9-17: on screen this is called "Weighted Probability %" everywhere.
// The function keeps its name — it is still the average of the two — but every
// label reads from here so the wording can never drift screen to screen.
export const WEIGHTED_PROBABILITY_LABEL = 'Weighted Probability %';
export const WEIGHTED_PROBABILITY_HINT  = 'Weighted Probability % — win % and move-forward % averaged.';
export const WEIGHTED_REVENUE_LABEL     = 'Weighted Revenue';
export const FORECAST_WINDOW_DAYS       = 90;

// Mike 9-23: probability is picked from set steps, not typed. An older job
// holding an off-list number (e.g. 60) keeps it as an extra option, so opening
// the picker never quietly changes what is saved.
export const PROBABILITY_STEPS = [5, 20, 50, 80, 90, 100];
export function probabilityOptions(current) {
  const steps = [...PROBABILITY_STEPS];
  const n = current === '' || current == null ? null : Number(current);
  if (n != null && Number.isFinite(n) && !steps.includes(n)) steps.push(n);
  steps.sort((a, b) => a - b);
  return [{ value: '', label: '—' }, ...steps.map(v => ({ value: String(v), label: `${v}%` }))];
}
export function averageProbability(project) {
  const parts = [project?.probabilityToWin, project?.probabilityToMoveForward]
    .filter(v => v != null && v !== '');
  if (parts.length) return Math.round(parts.reduce((a, b) => a + Number(b), 0) / parts.length);
  return project?.pipelineProbability ?? null;
}

// Full Design / Design Assist carry a design fee → they appear in BOTH boards
// (and are the only ones with a design status / the out-of-sync badge).
export const DESIGN_SERVICE_TYPES = ['fullDesign', 'designAssist'];
// Maram 9-17: a Peer Review that carries a design fee is design work too, so
// it sits on the Design board as well. No fee → Procurement only, as before.
export const FEE_OPTIONAL_DESIGN_TYPES = ['peerReview'];

export function inProcurementPipeline(_serviceType) { return true; } // every project sells product
/**
 * inDesignPipeline(projectOrServiceType)
 * Takes the whole project when you have it (so a Peer Review with a design fee
 * counts); a bare serviceType string still works for the two always-design types.
 */
export function inDesignPipeline(projectOrType) {
  const serviceType = typeof projectOrType === 'string' ? projectOrType : projectOrType?.serviceType;
  if (DESIGN_SERVICE_TYPES.includes(serviceType)) return true;
  if (typeof projectOrType === 'object' && projectOrType && FEE_OPTIONAL_DESIGN_TYPES.includes(serviceType)) {
    return Number(projectOrType.designContractValue) > 0;
  }
  return false;
}

export function stageFieldFor(pipeline)  { return pipeline === 'DESIGN' ? 'designStage'  : 'procurementStage'; }
export function statusFieldFor(pipeline) { return pipeline === 'DESIGN' ? 'designStatus' : 'procurementStatus'; }

// Procurement → product sale; Design → design fee.
export function revenueFor(project, pipeline) {
  return pipeline === 'DESIGN' ? (project.designContractValue ?? null) : (project.contractValue ?? null);
}

/** Revenue on one board × the project's Weighted Probability %. 0 when either is blank. */
export function weightedRevenue(project, pipeline) {
  return (revenueFor(project, pipeline) || 0) * (averageProbability(project) ?? 0) / 100;
}

/** True when `date` falls between today and `days` days from now (inclusive). Blank dates never qualify. */
export function isWithinDays(date, days, now = new Date()) {
  if (!date) return false;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return false;
  // Compared as calendar days, not instants. A date typed on a form is stored
  // as midnight UTC, which in Denver is 6 pm the evening BEFORE — so an instant
  // comparison against local midnight quietly dropped today's orders.
  const day      = Math.floor(t / 86400000);
  const startDay = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  return day >= startDay && day <= startDay + days;
}

/**
 * Weighted N-day forecast for one board: the open projects whose Expected Order
 * Date lands within the window, each counted at revenue × Weighted Probability %.
 * Mike 9-18: the 90-day figure must be WEIGHTED and say so.
 */
export function weightedForecast(projects, pipeline, days = FORECAST_WINDOW_DAYS, now = new Date()) {
  const sf = statusFieldFor(pipeline);
  return projects
    .filter(p => p[sf] === 'OPEN' && isWithinDays(p.expectedOrderDate, days, now))
    .reduce((sum, p) => sum + weightedRevenue(p, pipeline), 0);
}

/**
 * Buyout duration — Mike 9-19: "days from entering the buyout stage to the day
 * it went into CA/Procurement stage. We are trying to see when we enter buyout
 * stage how long does it take for us to order."
 *
 * So it is read from the stage HISTORY, never from the two expected dates: the
 * first move INTO Buyout, then the first move INTO CA / Procurement after it,
 * on the same board. The Procurement board is the one that orders, so it wins;
 * a job that only ever moved on the Design board falls back to that board.
 * Null until both moves exist (a job still sitting in Buyout has no duration
 * yet). Same-day moves read 0.
 *
 * Stage moves are the `deal_stage` lines on the project's History tab
 * (ProjectActivity rows with metadata { pipeline, fromStage, toStage }).
 * Pass them as `project.stageEvents` or as the second argument.
 */
export const BUYOUT_STAGE = 'BUYOUT';
export const BUYOUT_END_STAGE = 'CONSTRUCTION';   // labelled "CA / Procurement"

/** ProjectActivity rows → [{ pipeline, fromStage, toStage, at }] oldest first. */
export function stageEventsFromActivities(activities) {
  const out = [];
  for (const a of activities || []) {
    if (a?.type && a.type !== 'deal_stage') continue;
    let meta = a?.metadata;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = null; } }
    const at = a?.at ?? a?.createdAt;
    if (!meta?.toStage || !at) continue;
    out.push({ pipeline: meta.pipeline || 'PROCUREMENT', fromStage: meta.fromStage ?? null, toStage: meta.toStage, at });
  }
  return out.sort((x, y) => new Date(x.at) - new Date(y.at));
}

export function buyoutDays(project, events) {
  const list = stageEventsFromActivities(events ?? project?.stageEvents ?? project?.activities);
  for (const board of ['PROCUREMENT', 'DESIGN']) {
    const mine  = list.filter(e => e.pipeline === board);
    const start = mine.find(e => normalizeStage(e.toStage) === BUYOUT_STAGE);
    if (!start) continue;
    const t0  = new Date(start.at).getTime();
    const end = mine.find(e => normalizeStage(e.toStage) === BUYOUT_END_STAGE && new Date(e.at).getTime() >= t0);
    if (!end) return null;
    return Math.round((new Date(end.at).getTime() - t0) / 86400000);
  }
  return null;
}

// ── The two boards, and what each one is worth ────────────────────────────────
// Mike, 2026-09-08: "It counts once, but shows on 2 dashboards. Each dashboard
// only cares about product sales (PROCUREMENT) or design fees (DESIGN)."
export const PIPELINES = [
  { key: 'PROCUREMENT', label: 'Procurement', revenueLabel: 'Product Sales' },
  { key: 'DESIGN',      label: 'Design',      revenueLabel: 'Design Fees'   },
];
export const PIPELINE_KEYS         = PIPELINES.map(p => p.key);
export const PIPELINE_LABEL        = Object.fromEntries(PIPELINES.map(p => [p.key, p.label]));
export const PIPELINE_REVENUE_LABEL = Object.fromEntries(PIPELINES.map(p => [p.key, p.revenueLabel]));

/** Which boards a project sits on. Every project sells product; design types add Design. */
export function pipelinesFor(project) {
  return inDesignPipeline(project) ? ['PROCUREMENT', 'DESIGN'] : ['PROCUREMENT'];
}

/**
 * One project → one row per board it is on.
 *
 * This is the unit everything counts and sums. A Full Design job really is two
 * deals: Mike, 2026-09-05 — "we can win a design and lose the procurement. we
 * can also lose the design and later win the procurement." So each row carries
 * its own stage, its own status and its own revenue, and the project itself is
 * still one job that simply appears on both boards.
 */
export function boardRows(project) {
  return pipelinesFor(project).map(pipeline => ({
    pipeline,
    stage:   project[stageFieldFor(pipeline)],
    status:  project[statusFieldFor(pipeline)],
    revenue: revenueFor(project, pipeline),
  }));
}

/** Product sales + design fees on one job — never stored, always summed from the boards. */
export function combinedRevenue(project) {
  return boardRows(project).reduce((sum, row) => sum + (row.revenue || 0), 0);
}

// ── Out-of-sync rule ──────────────────────────────────────────────────────────
// Both boards share one stage list (2026-09-04), so a dual-pipeline project is
// in sync exactly when its two stages match. Legacy design keys are normalized
// first so an un-migrated row doesn't false-flag.
export function stagesOutOfSync(project) {
  if (!inDesignPipeline(project)) return false; // only dual-pipeline projects
  const design = normalizeStage(project.designStage);
  const proc   = normalizeStage(project.procurementStage);
  if (!design || !proc) return false; // unknown stage — don't false-flag
  return design !== proc;
}
