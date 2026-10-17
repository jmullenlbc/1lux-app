/**
 * Project, the root object almost everything else hangs off.
 *
 * Sensitivity posture: a client sees WHAT and WHERE and WHEN. Everything about
 * how ILC prices, forecasts or staffs the job is `ilc_only`. Probability
 * fields, contract values and the pricing snapshot are commercial position, not
 * project facts, a developer who can read our win probability is reading our
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
    projectSubtype:{ type: 'string',   sensitivity: 'client_ok', desc: 'BUILDING_TYPES key under Project Type: garden | wrap | podium …' },
    budgetType:    { type: 'string',   sensitivity: 'client_ok', desc: 'conceptual | design | peerReview' },
    serviceType:   { type: 'string',   sensitivity: 'client_ok', desc: 'fullDesign | designAssist | peerReview | bid' },
    phase:         { type: 'string',   sensitivity: 'client_ok' },
    status:        { type: 'string',   sensitivity: 'client_ok' },
    lifecycleStatus: { type: 'string', sensitivity: 'client_ok' },
    address:       { type: 'string',   sensitivity: 'client_ok' },
    city:          { type: 'string',   sensitivity: 'client_ok' },
    state:         { type: 'string',   sensitivity: 'client_ok' },
    zip:           { type: 'string',   sensitivity: 'client_ok', desc: '5 digits or ZIP+4' },
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
    expectedContractExecutionDate: { type: 'datetime', sensitivity: 'ilc_only', desc: 'the day the contract is signed, sits above Expected Order Date' },
    proposalSentDate:         { type: 'datetime',sensitivity: 'ilc_only' },
    budgetSentDate:           { type: 'datetime',sensitivity: 'ilc_only' },
    procurementStage:         { type: 'string',  sensitivity: 'ilc_only' },
    designStage:              { type: 'string',  sensitivity: 'ilc_only' },
    procurementStatus:        { type: 'string',  sensitivity: 'ilc_only' },
    designStatus:             { type: 'string',  sensitivity: 'ilc_only' },
    // Why we lost. Never widen these, the reason we lost a job to a competitor
    // is the last thing that should reach the client we lost it to.
    procurementStatusReason:  { type: 'string',  sensitivity: 'ilc_only', desc: 'required note when set to LOST or ABANDONED' },
    designStatusReason:       { type: 'string',  sensitivity: 'ilc_only', desc: 'required note when set to LOST or ABANDONED' },
    // Frozen rate blob, contains marginPct. Never widen this.
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
    contactName:     { type: 'string', sensitivity: 'ilc_only', desc: 'the client-side contact; pairs with contactEmail' },
    archivedAt:      { type: 'datetime', sensitivity: 'ilc_only', desc: 'set = archived; rows are archived, never deleted' },
    archivedById:    { type: 'string',   sensitivity: 'ilc_only' },

    // ── the six Project Team company seats (migration 0071) ──
    // Who else is on the job is ILC's read of the team, not a fact we publish.
    developerId:            { type: 'string', sensitivity: 'ilc_only' },
    generalContractorId:    { type: 'string', sensitivity: 'ilc_only' },
    electricalContractorId: { type: 'string', sensitivity: 'ilc_only' },
    interiorDesignerId:     { type: 'string', sensitivity: 'ilc_only' },
    electricalEngineerId:   { type: 'string', sensitivity: 'ilc_only' },
    architectId:            { type: 'string', sensitivity: 'ilc_only' },
  },

  links: {
    client:            { object: 'Client',             via: 'clientId', cardinality: 'one'  },
    changeOrders:      { object: 'ChangeOrder',        via: 'projectId', cardinality: 'many' },
    fixtureSchedules:  { object: 'FixtureSchedule',    via: 'projectId', cardinality: 'many' },
    designBidMatrices: { object: 'DesignBidMatrix',    via: 'projectId', cardinality: 'many' },
    peerReviewItems:   { object: 'PeerReviewItem',     via: 'projectId', cardinality: 'many' },
    projectData:       { object: 'ProjectData',        via: 'projectId', cardinality: 'one'  },
    notes:             { object: 'Note',               via: 'projectId', cardinality: 'many' },
    rfis:              { object: 'RFI',                via: 'projectId', cardinality: 'many' },
    developer:            { object: 'Client', via: 'developerId',            cardinality: 'one' },
    generalContractor:    { object: 'Client', via: 'generalContractorId',    cardinality: 'one' },
    electricalContractor: { object: 'Client', via: 'electricalContractorId', cardinality: 'one' },
    interiorDesigner:     { object: 'Client', via: 'interiorDesignerId',     cardinality: 'one' },
    electricalEngineer:   { object: 'Client', via: 'electricalEngineerId',   cardinality: 'one' },
    architect:            { object: 'Client', via: 'architectId',            cardinality: 'one' },
  },

  actions: [],  // Slice 3 is read-only. Actions land with Slice 4 / Phase D.
};
