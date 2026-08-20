/**
 * The budget objects — Design Bid Matrix (design / design-assist work) and
 * Peer Review Item (peer-review / bid work). Two shapes, one rule.
 *
 * Both carry a per-unit DN alongside a per-unit CN on the same row, which makes
 * them the highest-risk objects in the schema: a single forgotten column on a
 * client-facing surface hands over the whole margin structure for the job.
 *
 * ProjectData is here too rather than in project.js because it is where the
 * rates live, and `marginPct` is the field that makes every CN on these rows
 * reversible into a DN. It is the reason redaction has to be a boundary rather
 * than a per-field habit.
 */

export const FixtureSchedule = {
  key:   'FixtureSchedule',
  model: 'fixtureSchedule',
  label: 'Fixture Schedule',
  description:
    'A versioned list of fixture types for a project. Published versions become the ' +
    'source for a Design Bid Matrix. state tracks draft/published; version increments.',

  properties: {
    id:             { type: 'string',   sensitivity: 'client_ok' },
    projectId:      { type: 'string',   sensitivity: 'client_ok' },
    state:          { type: 'string',   sensitivity: 'client_ok' },
    version:        { type: 'int',      sensitivity: 'client_ok' },
    publishedAt:    { type: 'datetime', sensitivity: 'client_ok' },
    submissionTag:  { type: 'string',   sensitivity: 'client_ok' },
    createdAt:      { type: 'datetime', sensitivity: 'client_ok' },
    updatedAt:      { type: 'datetime', sensitivity: 'client_ok' },
    publishedById:  { type: 'string',   sensitivity: 'ilc_only' },
  },

  links: {
    project: { object: 'Project',              via: 'projectId',  cardinality: 'one'  },
    items:   { object: 'FixtureScheduleItem',  via: 'scheduleId', cardinality: 'many' },
  },

  actions: [],
};

export const FixtureScheduleItem = {
  key:   'FixtureScheduleItem',
  model: 'fixtureScheduleItem',
  label: 'Fixture Schedule Item',
  description:
    'One fixture type on a schedule: manufacturer, catalog number, and the electrical ' +
    'and finish attributes. aiFlagged/aiConfidence mark rows a vision parse produced ' +
    'rather than a human — provenance, kept for the accuracy ledger.',

  properties: {
    id:            { type: 'string', sensitivity: 'client_ok' },
    scheduleId:    { type: 'string', sensitivity: 'client_ok' },
    type:          { type: 'string', sensitivity: 'client_ok', desc: 'fixture type code, e.g. F1' },
    location:      { type: 'string', sensitivity: 'client_ok' },
    description:   { type: 'string', sensitivity: 'client_ok' },
    manufacturer:  { type: 'string', sensitivity: 'client_ok' },
    catalogNumber: { type: 'string', sensitivity: 'client_ok' },
    finish:        { type: 'string', sensitivity: 'client_ok' },
    cct:           { type: 'string', sensitivity: 'client_ok' },
    lumens:        { type: 'string', sensitivity: 'client_ok' },
    wattage:       { type: 'string', sensitivity: 'client_ok' },
    voltage:       { type: 'string', sensitivity: 'client_ok' },
    dimming:       { type: 'string', sensitivity: 'client_ok' },
    mounting:      { type: 'string', sensitivity: 'client_ok' },
    notes:         { type: 'string', sensitivity: 'client_ok' },
    sortOrder:     { type: 'int',    sensitivity: 'client_ok' },
    isAlternate:   { type: 'boolean', sensitivity: 'client_ok' },
    alternateOf:   { type: 'string',  sensitivity: 'client_ok' },
    drawingSheetReference: { type: 'string', sensitivity: 'client_ok' },
    createdAt:     { type: 'datetime', sensitivity: 'client_ok' },
    updatedAt:     { type: 'datetime', sensitivity: 'client_ok' },

    // Provenance — ILC-only. A client seeing "our system guessed this at 0.62
    // confidence" is a support call, not transparency.
    aiFlagged:     { type: 'boolean', sensitivity: 'ilc_only' },
    aiConfidence:  { type: 'float',   sensitivity: 'ilc_only' },
    internalNotes: { type: 'string',  sensitivity: 'ilc_only' },
  },

  links: {
    schedule: { object: 'FixtureSchedule', via: 'scheduleId', cardinality: 'one' },
  },

  actions: [],
};

export const DesignBidMatrix = {
  key:   'DesignBidMatrix',
  model: 'designBidMatrix',
  label: 'Design Bid Matrix',
  description:
    'A versioned priced budget pushed from a published Fixture Schedule. matrixType ' +
    'distinguishes the layout. Each version is an immutable snapshot — new pushes ' +
    'create a new version rather than editing an old one.',

  properties: {
    id:               { type: 'string',   sensitivity: 'client_ok' },
    projectId:        { type: 'string',   sensitivity: 'client_ok' },
    sourceScheduleId: { type: 'string',   sensitivity: 'client_ok' },
    version:          { type: 'int',      sensitivity: 'client_ok' },
    matrixType:       { type: 'string',   sensitivity: 'client_ok' },
    submissionTag:    { type: 'string',   sensitivity: 'client_ok' },
    createdAt:        { type: 'datetime', sensitivity: 'client_ok' },
    changeSummary:    { type: 'json',     sensitivity: 'ilc_only', desc: 'JSON-as-string diff vs prior version' },
    pushedById:       { type: 'string',   sensitivity: 'ilc_only' },
  },

  links: {
    project:        { object: 'Project',             via: 'projectId', cardinality: 'one'  },
    sourceSchedule: { object: 'FixtureSchedule',     via: 'sourceScheduleId', cardinality: 'one' },
    items:          { object: 'DesignBidMatrixItem', via: 'matrixId',  cardinality: 'many' },
  },

  actions: [],
};

export const DesignBidMatrixItem = {
  key:   'DesignBidMatrixItem',
  model: 'designBidMatrixItem',
  label: 'Design Bid Matrix Item',
  description:
    'One priced line on a budget version. cnPerUnit/cnTotal are the client sell price; ' +
    'dnPerUnit is what ILC pays. salesRep and rfqStatus are ILC procurement state.',

  properties: {
    id:            { type: 'string',   sensitivity: 'client_ok' },
    matrixId:      { type: 'string',   sensitivity: 'client_ok' },
    sourceItemId:  { type: 'string',   sensitivity: 'client_ok' },
    type:          { type: 'string',   sensitivity: 'client_ok' },
    description:   { type: 'string',   sensitivity: 'client_ok' },
    locationTag:   { type: 'string',   sensitivity: 'client_ok' },
    manufacturer:  { type: 'string',   sensitivity: 'client_ok' },
    partNumber:    { type: 'string',   sensitivity: 'client_ok' },
    qty:           { type: 'int',      sensitivity: 'client_ok' },
    qtyType:       { type: 'string',   sensitivity: 'client_ok' },
    cnPerUnit:     { type: 'money',    sensitivity: 'client_ok', desc: 'client net per unit' },
    cnTotal:       { type: 'money',    sensitivity: 'client_ok' },
    notes:         { type: 'string',   sensitivity: 'client_ok' },
    sortOrder:     { type: 'int',      sensitivity: 'client_ok' },
    isArchived:    { type: 'boolean',  sensitivity: 'client_ok' },
    createdAt:     { type: 'datetime', sensitivity: 'client_ok' },
    updatedAt:     { type: 'datetime', sensitivity: 'client_ok' },

    // ── the hard boundary ── (globalDeny: see ChangeOrderLineItem.originalDN)
    dnPerUnit:          { type: 'money',    sensitivity: 'ilc_only', globalDeny: true, desc: 'dealer net per unit — ILC buy price' },
    salesRep:           { type: 'string',   sensitivity: 'ilc_only', globalDeny: true, desc: 'which manufacturer rep ILC is working' },
    rfqStatus:          { type: 'string',   sensitivity: 'ilc_only', globalDeny: true, desc: "ILC's own RFQ pipeline state" },
    internalNotes:      { type: 'string',   sensitivity: 'ilc_only', globalDeny: true },
    pricingLastUpdated: { type: 'datetime', sensitivity: 'ilc_only' },
  },

  links: {
    matrix:     { object: 'DesignBidMatrix',     via: 'matrixId',     cardinality: 'one' },
    sourceItem: { object: 'FixtureScheduleItem', via: 'sourceItemId', cardinality: 'one' },
  },

  actions: [],
};

export const PeerReviewItem = {
  key:   'PeerReviewItem',
  model: 'peerReviewItem',
  label: 'Peer Review Item',
  description:
    'One line of a peer-review or bid budget. The SPEC side (specManufacturer/specModel) ' +
    'is what the drawings called for; the PROP side is what ILC proposes instead. ' +
    'propUnitPrice is the client sell price, propUnitDN is the ILC buy price.',

  properties: {
    id:            { type: 'string',   sensitivity: 'client_ok' },
    projectId:     { type: 'string',   sensitivity: 'client_ok' },
    section:       { type: 'string',   sensitivity: 'client_ok' },
    typeCode:      { type: 'string',   sensitivity: 'client_ok' },
    description:   { type: 'string',   sensitivity: 'client_ok' },
    location:      { type: 'string',   sensitivity: 'client_ok' },
    notes:         { type: 'string',   sensitivity: 'client_ok' },
    qty:           { type: 'float',    sensitivity: 'client_ok' },
    prevQty:       { type: 'float',    sensitivity: 'client_ok' },
    qtyType:       { type: 'string',   sensitivity: 'client_ok' },
    altChoices:    { type: 'string',   sensitivity: 'client_ok' },
    specManufacturer: { type: 'string', sensitivity: 'client_ok' },
    specModel:        { type: 'string', sensitivity: 'client_ok' },
    specDetails:      { type: 'string', sensitivity: 'client_ok' },
    propManufacturer: { type: 'string', sensitivity: 'client_ok' },
    propModel:        { type: 'string', sensitivity: 'client_ok' },
    propUnitPrice:    { type: 'money',  sensitivity: 'client_ok', desc: 'ILC proposed sell price per unit' },
    unitSavings:      { type: 'money',  sensitivity: 'client_ok', desc: 'spec price minus proposed price — the pitch' },
    totalSavings:     { type: 'money',  sensitivity: 'client_ok' },
    sortOrder:     { type: 'int',      sensitivity: 'client_ok' },
    createdAt:     { type: 'datetime', sensitivity: 'client_ok' },
    updatedAt:     { type: 'datetime', sensitivity: 'client_ok' },

    // ── the hard boundary ──
    propUnitDN:         { type: 'money',  sensitivity: 'ilc_only', globalDeny: true, desc: 'ILC buy price per unit' },
    internalNotes:      { type: 'string', sensitivity: 'ilc_only', globalDeny: true },
    rfqStatus:          { type: 'string', sensitivity: 'ilc_only', globalDeny: true },
    repName:            { type: 'string', sensitivity: 'ilc_only', globalDeny: true },
    repEmail:           { type: 'string', sensitivity: 'ilc_only', globalDeny: true },
    propManufacturerId: { type: 'string', sensitivity: 'ilc_only' },
    propProductId:      { type: 'string', sensitivity: 'ilc_only' },
  },

  links: {
    project: { object: 'Project', via: 'projectId', cardinality: 'one' },
  },

  actions: [],
};

export const ProjectData = {
  key:   'ProjectData',
  model: 'projectData',
  label: 'Project Data',
  description:
    'The physical inputs and commercial rates that drive the conceptual budget engine: ' +
    'square footages, unit and fixture counts, and the four rates (sales tax, freight, ' +
    'warehousing, margin) plus manual adders.',

  properties: {
    id:        { type: 'string', sensitivity: 'client_ok' },
    projectId: { type: 'string', sensitivity: 'client_ok' },

    // ── physical inputs: facts about the building, not about our pricing ──
    grossSf:              { type: 'float', sensitivity: 'client_ok' },
    unitsSf:              { type: 'float', sensitivity: 'client_ok' },
    numUnits:             { type: 'int',   sensitivity: 'client_ok' },
    numBuildings:         { type: 'int',   sensitivity: 'client_ok' },
    numBedrooms:          { type: 'int',   sensitivity: 'client_ok' },
    numBalconies:         { type: 'int',   sensitivity: 'client_ok' },
    numBathrooms:         { type: 'int',   sensitivity: 'client_ok' },
    numVanities:          { type: 'int',   sensitivity: 'client_ok' },
    numEgressStairwells:  { type: 'int',   sensitivity: 'client_ok' },
    numFans:              { type: 'int',   sensitivity: 'client_ok' },
    numAccentDownlights:  { type: 'int',   sensitivity: 'client_ok' },
    numSurfaceParking:    { type: 'int',   sensitivity: 'client_ok' },
    numCarports:          { type: 'int',   sensitivity: 'client_ok' },
    numGarages:           { type: 'int',   sensitivity: 'client_ok' },
    numExteriorDoors:     { type: 'int',   sensitivity: 'client_ok' },
    exteriorAmenitySf:    { type: 'float', sensitivity: 'client_ok' },
    interiorAmenitySf:    { type: 'float', sensitivity: 'client_ok' },
    lotSf:                { type: 'float', sensitivity: 'client_ok' },
    buildingFootprintSf:  { type: 'float', sensitivity: 'client_ok' },
    corridorSf:           { type: 'float', sensitivity: 'client_ok' },
    garageSf:             { type: 'float', sensitivity: 'client_ok' },
    bohSf:                { type: 'float', sensitivity: 'client_ok' },

    // ── rates the client is entitled to see on a quote ──
    salesTaxPct:     { type: 'percent', sensitivity: 'client_ok' },
    freightPct:      { type: 'percent', sensitivity: 'client_ok' },
    warehousingPct:  { type: 'percent', sensitivity: 'client_ok' },

    // ── the one that reverses every CN in the system ──
    // dn = cn × (1 - marginPct). Publishing this publishes the buy price on
    // every line item the client can already see. It stays ilc_only forever.
    marginPct:            { type: 'percent', sensitivity: 'ilc_only', globalDeny: true, desc: 'ILC margin — DN is derivable from any CN with this' },
    contingencyPct:       { type: 'percent', sensitivity: 'ilc_only', globalDeny: true },
    bohManualAdder:       { type: 'money',   sensitivity: 'ilc_only', globalDeny: true },
    garageManualAdder:    { type: 'money',   sensitivity: 'ilc_only', globalDeny: true },
    exitSignsManualAdder: { type: 'money',   sensitivity: 'ilc_only', globalDeny: true },
    clientInitialBudget:  { type: 'money',   sensitivity: 'ilc_only', globalDeny: true, desc: "what the client said their budget was — negotiating context" },
  },

  links: {
    project: { object: 'Project', via: 'projectId', cardinality: 'one' },
  },

  actions: [],
};
