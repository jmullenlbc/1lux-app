// Notification type constants. Pure data, no database: the notification
// settings screens run in the browser and import these, and notify.js pulls
// in Prisma, which cannot load in a browser (the 9-23 project-page crash).

export const NOTIFICATION_TYPES = {
  // Ship Schedule
  SHIP_ESD_UPDATE:      { label: 'ESD updated',               pattern: 'DIGEST',    external: true },
  SHIP_LEAD_TIME_UPDATE:{ label: 'Lead time updated',          pattern: 'DIGEST',    external: true },
  SHIP_ESD_2WEEKS:      { label: 'ESD in 2 weeks or less',    pattern: 'DIGEST',    external: true },
  SHIP_SHIPPED:         { label: 'Item shipped',              pattern: 'EVENT',     external: true },
  SHIP_DELIVERED:       { label: 'Item delivered',            pattern: 'EVENT',     external: true },
  // Submittals
  SUBMITTAL_UPLOADED:       { label: 'New submittal uploaded',       pattern: 'EVENT',  external: true },
  SUBMITTAL_WITH_COMMENTS:  { label: 'Submittal with comments',      pattern: 'EVENT',  external: true },
  SUBMITTAL_APPROVED:       { label: 'Item approved',                pattern: 'DIGEST', external: true },
  SUBMITTAL_REJECTED:       { label: 'Item rejected',                pattern: 'DIGEST', external: true },
  SUBMITTAL_STALE_60D:      { label: 'Item not approved after 60d',  pattern: 'DIGEST', external: true },
  SUBMITTAL_STALE_30D:      { label: 'Still not approved (+30d)',    pattern: 'DIGEST', external: true },
  // Budgets
  BUDGET_SENT:    { label: 'Budget sent',                   pattern: 'EVENT',     external: true },
  BUDGET_UPDATED: { label: 'Budget updated',                pattern: 'EVENT',     external: true },
  BUDGET_20PCT:   { label: 'Budget 20%+ higher than prev',  pattern: 'THRESHOLD', external: false },
  // Files / Drawings
  DRAWINGS_UPLOADED:        { label: 'New drawings uploaded',    pattern: 'EVENT', external: false },
  SUBMITTAL_FILE_UPLOADED:  { label: 'Submittal file uploaded',  pattern: 'EVENT', external: true },
  CONTRACT_UPLOADED:        { label: 'New contract uploaded',    pattern: 'EVENT', external: false },
  CONTRACT_SIGNED:          { label: 'Contract signed',          pattern: 'EVENT', external: true },
  // Meetings
  MEETING_NOTE: { label: 'New meeting note', pattern: 'EVENT', external: true },
  // Change Orders
  CHANGE_ORDER_NEW: { label: 'New change order', pattern: 'EVENT', external: true },
  // Contracts
  COI_EXPIRING: { label: 'COI expiring in 1 month', pattern: 'THRESHOLD', external: true },
  // Construction Schedule
  CONSCHED_3M: { label: 'Deadline in 3 months', pattern: 'THRESHOLD', external: true },
  CONSCHED_2M: { label: 'Deadline in 2 months', pattern: 'THRESHOLD', external: true },
  CONSCHED_1M: { label: 'Deadline in 1 month',  pattern: 'THRESHOLD', external: true },
  CONSCHED_2W: { label: 'Deadline in 2 weeks',  pattern: 'THRESHOLD', external: true },
  // Design
  DESIGN_SCHEDULE_UPLOADED: { label: 'Design schedule uploaded',   pattern: 'EVENT',     external: false },
  DESIGN_DEADLINE_1M:       { label: 'Design deadline in 1 month', pattern: 'THRESHOLD', external: false },
  DESIGN_DEADLINE_2W:       { label: 'Design deadline in 2 weeks', pattern: 'THRESHOLD', external: false },
  DESIGN_DEADLINE_1W:       { label: 'Design deadline in 1 week',  pattern: 'THRESHOLD', external: false },
  // CRM
  CRM_CLOSE_DATE: { label: 'Project close date in 1 month', pattern: 'THRESHOLD', external: false },
  // Market Intel (0122): a teammate handed you an article
  MARKET_SIGNAL_ASSIGNED: { label: 'Market article assigned to you', pattern: 'EVENT', external: false },
  // Sales Docs (0137): someone opened a link you made
  SALES_DOC_OPENED:    { label: 'Sales doc opened',    pattern: 'EVENT', external: false },
  SALES_DOC_FORWARDED: { label: 'Sales doc forwarded', pattern: 'EVENT', external: false },
  // Warehousing
  WAREHOUSE_RELEASED: { label: 'Item released from warehouse', pattern: 'EVENT', external: true },
  // Misc
  FIXTURE_SCHEDULE_SUBMITTED: { label: 'Fixture schedule submitted', pattern: 'EVENT', external: false },
  TAKEOFF_READY:              { label: 'New takeoff ready',          pattern: 'EVENT', external: false },
  PROPOSAL_SENT:              { label: 'Proposal sent',             pattern: 'EVENT', external: false },
};

// Grouped by module for the settings UI
export const NOTIFICATION_MODULES = [
  { module: 'Ship Schedule',     keys: ['SHIP_ESD_UPDATE','SHIP_LEAD_TIME_UPDATE','SHIP_ESD_2WEEKS','SHIP_SHIPPED','SHIP_DELIVERED'] },
  { module: 'Submittals',        keys: ['SUBMITTAL_UPLOADED','SUBMITTAL_WITH_COMMENTS','SUBMITTAL_APPROVED','SUBMITTAL_REJECTED','SUBMITTAL_STALE_60D','SUBMITTAL_STALE_30D'] },
  { module: 'Budgets',           keys: ['BUDGET_SENT','BUDGET_UPDATED','BUDGET_20PCT'] },
  { module: 'Drawings',          keys: ['DRAWINGS_UPLOADED'] },
  { module: 'Contracts',         keys: ['CONTRACT_UPLOADED','CONTRACT_SIGNED','COI_EXPIRING'] },
  { module: 'Change Orders',     keys: ['CHANGE_ORDER_NEW'] },
  { module: 'Meetings',          keys: ['MEETING_NOTE'] },
  { module: 'Construction Sched',keys: ['CONSCHED_3M','CONSCHED_2M','CONSCHED_1M','CONSCHED_2W'] },
  { module: 'Design Info',       keys: ['DESIGN_SCHEDULE_UPLOADED','DESIGN_DEADLINE_1M','DESIGN_DEADLINE_2W','DESIGN_DEADLINE_1W'] },
  { module: 'Warehousing',       keys: ['WAREHOUSE_RELEASED'] },
  { module: 'CRM',               keys: ['CRM_CLOSE_DATE'] },
  { module: 'Market Intel',      keys: ['MARKET_SIGNAL_ASSIGNED'] },
  { module: 'Sales Docs',        keys: ['SALES_DOC_OPENED','SALES_DOC_FORWARDED'] },
  { module: 'Other',             keys: ['FIXTURE_SCHEDULE_SUBMITTED','TAKEOFF_READY','PROPOSAL_SENT'] },
];
