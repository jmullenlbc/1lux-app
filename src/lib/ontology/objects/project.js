/**
 * Project — the root object almost everything else hangs off.
 *
 * Sensitivity posture: a client sees WHAT and WHERE and WHEN. Everything about
 * how ILC prices, forecasts or staffs the job is `ilc_only`. Probability
 * fields, contract values and the pricing snapshot are commercial position, not
 * project facts — a developer who can read our win probability is reading our
 * negotiating hand.
 *
 * Anything not listed here is `ilc_only` by default and is simply absent from a
 * non-ILC response. That includes every field added tomorrow.
 */
export const Project = {
  key:   'Project',
  model: 'project',
  label: 'Project',
  description:
    'A lighting job. Carries a budget (Design Bid Matrix or Peer Review), a fixture ' +
    'schedule, change orders, and a ship schedule. Numbered sequentially via projectNumber. ' +
    'budgetType distinguishes conceptual / design / peer-review work.',

  properties: {
    id:            { type: 'string',   sensitivity: 'client_ok', desc: 'cuid' },
    projectNumber: { type: 'int',      sensitivity: 'client_ok', desc: 'sequential ILC project number' },
    name:          { type: 'string',   sensitivity: 'client_ok' },
    buildingType:  { type: 'string',   sensitivity: 'client_ok' },
    projectType:   { type: 'string',   sensitivity: 'client_ok' },
    budgetType:    { type: 'string',   sensitivity: 'client_ok', desc: 'conceptual | design | peerReview' },
    serviceType:   { type: 'string',   sensitivity: 'client_ok', desc: 'fullDesign | designAssist | peerReview | bid' },
    phase:         { type: 'string',   sensitivity: 'client_ok' },
    status:        { type: 'string',   sensitivity: 'client_ok' },
    lifecycleStatus: { type: 'string', sensitivity: 'client_ok' },
    address:       { type: 'string',   sensitivity: 'client_ok' },
    city:          { type: 'string',   sensitivity: 'client_ok' },
    state:         { type: 'string',   sensitivity: 'client_ok' },
    location:      { type: 'string',   sensitivity: 'client_ok' },
    date:          { type: 'string',   sensitivity: 'client_ok' },
    constructionStartDate: { type: 'string', sensitivity: 'client_ok' },
    constructionEndDate:   { type: 'string', sensitivity: 'client_ok' },
    mepRoughInDate:        { type: 'string', sensitivity: 'client_ok' },
    createdAt:     { type: 'datetime', sensitivity: 'client_ok' },
    updatedAt:     { type: 'datetime', sensitivity: 'client_ok' },
    clientId:      { type: 'string',   sensitivity: 'client_ok' },

    // ── ILC commercial position ──
    contractValue:            { type: 'money',   sensitivity: 'ilc_only' },
    designContractValue:      { type: 'money',   sensitivity: 'ilc_only' },
    totalInvoiced:            { type: 'money',   sensitivity: 'ilc_only' },
    contractSignedDate:       { type: 'string',  sensitivity: 'ilc_only' },
    designContractSignedDate: { type: 'string',  sensitivity: 'ilc_only' },
    pipelineProbability:      { type: 'int',     sensitivity: 'ilc_only', desc: 'legacy single probability' },
    probabilityToWin:         { type: 'int',     sensitivity: 'ilc_only' },
    probabilityToMoveForward: { type: 'int',     sensitivity: 'ilc_only' },
    expectedOrderDate:        { type: 'datetime',sensitivity: 'ilc_only' },
    proposalSentDate:         { type: 'datetime',sensitivity: 'ilc_only' },
    budgetSentDate:           { type: 'datetime',sensitivity: 'ilc_only' },
    procurementStage:         { type: 'string',  sensitivity: 'ilc_only' },
    designStage:              { type: 'string',  sensitivity: 'ilc_only' },
    procurementStatus:        { type: 'string',  sensitivity: 'ilc_only' },
    designStatus:             { type: 'string',  sensitivity: 'ilc_only' },
    // Frozen rate blob — contains marginPct. Never widen this.
    pricingSnapshot:          { type: 'json',    sensitivity: 'ilc_only', globalDeny: true, desc: 'JSON-as-string rate snapshot; contains margin' },
    // ── ILC internal workflow ──
    salesOwnerId:    { type: 'string',  sensitivity: 'ilc_only' },
    preconManagerId: { type: 'string',  sensitivity: 'ilc_only' },
    createdById:     { type: 'string',  sensitivity: 'ilc_only' },
    flagged:         { type: 'boolean', sensitivity: 'ilc_only' },
    flagNote:        { type: 'string',  sensitivity: 'ilc_only' },
    nextActionType:    { type: 'string',   sensitivity: 'ilc_only' },
    nextActionOwnerId: { type: 'string',   sensitivity: 'ilc_only' },
    nextActionDueDate: { type: 'datetime', sensitivity: 'ilc_only' },
    currentStep:     { type: 'string', sensitivity: 'ilc_only' },
    completedSteps:  { type: 'json',   sensitivity: 'ilc_only' },
    budgetNumber:    { type: 'string', sensitivity: 'ilc_only' },
    contactEmail:    { type: 'string', sensitivity: 'ilc_only' },
    peerReviewMatrixType: { type: 'string', sensitivity: 'ilc_only' },
    rfiRoutingMode:  { type: 'string', sensitivity: 'ilc_only' },
  },

  links: {
    client:            { object: 'Client',             via: 'clientId', cardinality: 'one'  },
    changeOrders:      { object: 'ChangeOrder',        via: 'projectId', cardinality: 'many' },
    fixtureSchedules:  { object: 'FixtureSchedule',    via: 'projectId', cardinality: 'many' },
    designBidMatrices: { object: 'DesignBidMatrix',    via: 'projectId', cardinality: 'many' },
    peerReviewItems:   { object: 'PeerReviewItem',     via: 'projectId', cardinality: 'many' },
    projectData:       { object: 'ProjectData',        via: 'projectId', cardinality: 'one'  },
  },

  actions: [],  // Slice 3 is read-only. Actions land with Slice 4 / Phase D.
};
