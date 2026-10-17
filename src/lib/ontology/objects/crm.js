/**
 * The CRM and delivery record types, the things that record an OBLIGATION or a
 * CONVERSATION, as opposed to a price.
 *
 * The registry started with money: projects, clients, change orders, budgets.
 * That covers "what is this job worth" and leaves out "what did we agree to do
 * about it". An agent that can read every line of a change order but cannot see
 * the task somebody opened about it, the meeting where it was promised, or the
 * RFI it came from is reading half the file.
 *
 * ── Posture: every field here is ilc_only, on purpose ────────────────────────
 * Not caution-by-default, a deliberate read of what these rows are. A Task is
 * an instruction to an ILC employee. A Note is what was said in a room, often
 * about the client, sometimes about a competitor. A NoteAction is ILC's private
 * follow-up list. A Contact row is a named human being's mobile number and the
 * cadence we keep them on. An RFI is a running argument with a GC about who
 * pays for a clash.
 *
 * None of that is a document we hand a client, and there is no half-measure
 * that makes it one. Declaring even `id` as client-visible would let a portal
 * caller count how many open RFIs a job has, which is itself a fact about the
 * job's health. So: ILC staff and the internal service token, nobody else.
 *
 * That also means NONE of these objects appear in src/lib/mcp/scope.js. An
 * object with no scope entry is unreachable to a non-ILC caller rather than
 * unscoped, the fail-closed direction. Adding a scope path here would be the
 * deliberate act of opening one of these up, and it would need Mike's say-so.
 *
 * Declaring the fields still buys the thing that was missing: an ILC agent
 * asking `describe_model` now gets a real answer for these five, and
 * `query_records` will reach them at all, which it would not before, the model
 * allowlist in guards.js is the ontology registry.
 */

/**
 * Task, the general internal to-do. Not tied to a project; tied to a person.
 */
export const Task = {
  key:   'Task',
  model: 'task',
  label: 'Task',
  description:
    'An internal ILC to-do with an owner and a due date. status is TODO | IN_PROGRESS | IN_REVIEW | DONE ' +
    'and priority is LOW | MEDIUM | HIGH | URGENT. Not attached to a project. For project-bound work see ' +
    'Project.nextActionType and RFI. tags is a JSON-as-string array of menu tag ids.',

  properties: {
    id:          { type: 'string',   sensitivity: 'ilc_only' },
    title:       { type: 'string',   sensitivity: 'ilc_only' },
    description: { type: 'string',   sensitivity: 'ilc_only' },
    status:      { type: 'string',   sensitivity: 'ilc_only', desc: 'TODO | IN_PROGRESS | IN_REVIEW | DONE' },
    priority:    { type: 'string',   sensitivity: 'ilc_only', desc: 'LOW | MEDIUM | HIGH | URGENT' },
    assigneeId:  { type: 'string',   sensitivity: 'ilc_only' },
    createdById: { type: 'string',   sensitivity: 'ilc_only' },
    dueDate:     { type: 'datetime', sensitivity: 'ilc_only' },
    tags:        { type: 'json',     sensitivity: 'ilc_only', desc: 'JSON-as-string array of tag ids' },
    createdAt:   { type: 'datetime', sensitivity: 'ilc_only' },
    updatedAt:   { type: 'datetime', sensitivity: 'ilc_only' },
  },

  links: {},
  actions: [],
};

/**
 * Note, a sales activity or a project meeting, and everything said in it.
 *
 * Two note types share one table because they share one lifecycle: a draft
 * arrives (typed, or synced from the calendar), somebody publishes it, and only
 * then does anything downstream count it. `isPublished` is the gate; an
 * unpublished note is a draft nobody has stood behind yet.
 */
export const Note = {
  key:   'Note',
  model: 'note',
  label: 'Note',
  description:
    'A sales activity or a project meeting. noteType is SALES | PROJECT_MEETING. Sales notes carry ' +
    'activityType (COFFEE | MEAL | HAPPY_HOUR | GOLF | SITE_VISIT | TRAVEL | CALL | EMAIL | TEXT | EVENT | OTHER) ' +
    'and isInPerson. NOTHING downstream counts a note until isPublished is true. calendarRef links a note ' +
    'back to the calendar event it was synced from. attendees is a JSON-as-string array. ' +
    'Archived rows (archivedAt set) are hidden from normal reads.',

  properties: {
    id:         { type: 'string',   sensitivity: 'ilc_only' },
    noteNumber: { type: 'int',      sensitivity: 'ilc_only', desc: 'human-readable number' },
    archivedAt:   { type: 'datetime', sensitivity: 'ilc_only', desc: 'set = archived; rows are archived, never deleted' },
    archivedById: { type: 'string',   sensitivity: 'ilc_only' },

    noteType:    { type: 'string',   sensitivity: 'ilc_only', desc: 'SALES | PROJECT_MEETING' },
    title:       { type: 'string',   sensitivity: 'ilc_only' },
    body:        { type: 'string',   sensitivity: 'ilc_only' },
    meetingDate: { type: 'datetime', sensitivity: 'ilc_only' },
    attendees:   { type: 'json',     sensitivity: 'ilc_only', desc: 'JSON-as-string array' },
    calendarRef: { type: 'string',   sensitivity: 'ilc_only', desc: 'the calendar event id this was synced from' },

    activityType:             { type: 'string',  sensitivity: 'ilc_only' },
    isInPerson:               { type: 'boolean', sensitivity: 'ilc_only' },
    classificationSource:     { type: 'string',  sensitivity: 'ilc_only', desc: 'keyword | rule | ai | manual' },
    classificationConfidence: { type: 'int',     sensitivity: 'ilc_only' },
    isPublished:              { type: 'boolean', sensitivity: 'ilc_only', desc: 'false = draft; nothing counts it yet' },
    publishedAt:              { type: 'datetime', sensitivity: 'ilc_only' },

    meetingLink:       { type: 'string',  sensitivity: 'ilc_only' },
    isExternalVisible: { type: 'boolean', sensitivity: 'ilc_only' },

    projectId:   { type: 'string',   sensitivity: 'ilc_only' },
    createdById: { type: 'string',   sensitivity: 'ilc_only' },
    createdAt:   { type: 'datetime', sensitivity: 'ilc_only' },
    updatedAt:   { type: 'datetime', sensitivity: 'ilc_only' },
  },

  links: {
    project: { object: 'Project',      via: 'projectId', cardinality: 'one' },
    actions: { object: 'NoteAction',   via: 'noteId',    cardinality: 'many' },
    expense: { object: 'SalesExpense', via: 'noteId',    cardinality: 'one' },
  },

  actions: [],
};

/**
 * SalesExpense (0129), one thing a salesperson paid for while courting a
 * client: the meal, the round of golf, the flight, the gift. A row either rides
 * on a sales note (noteId set; the "Amount spent" box) or stands alone.
 *
 * Money a specific ILC employee spent on a specific company is as private as
 * the note it came from, so every field is ilc_only.
 */
export const SalesExpense = {
  key:   'SalesExpense',
  model: 'salesExpense',
  label: 'Sales Expense',
  description:
    'Money a salesperson spent on a client. amountCents is whole cents. category is ' +
    'MEAL | TRAVEL | GOLF | EVENT | GIFT | OTHER. noteId is set when the amount was typed on a sales note ' +
    '(one expense per note); clientId and projectId say who it was for. userId is whose spend it is, ' +
    'createdById who typed it. Archived rows (archivedAt set) are hidden from normal reads.',

  properties: {
    id:           { type: 'string',   sensitivity: 'ilc_only' },
    archivedAt:   { type: 'datetime', sensitivity: 'ilc_only', desc: 'set = archived; rows are archived, never deleted' },
    archivedById: { type: 'string',   sensitivity: 'ilc_only' },
    noteId:       { type: 'string',   sensitivity: 'ilc_only', desc: 'the sales note it was typed on, if any' },
    userId:       { type: 'string',   sensitivity: 'ilc_only', desc: 'the salesperson whose spend it is' },
    clientId:     { type: 'string',   sensitivity: 'ilc_only' },
    projectId:    { type: 'string',   sensitivity: 'ilc_only' },
    spentOn:      { type: 'datetime', sensitivity: 'ilc_only' },
    amountCents:  { type: 'int',      sensitivity: 'ilc_only', desc: 'whole cents' },
    category:     { type: 'string',   sensitivity: 'ilc_only', desc: 'MEAL | TRAVEL | GOLF | EVENT | GIFT | OTHER' },
    description:  { type: 'string',   sensitivity: 'ilc_only' },
    createdById:  { type: 'string',   sensitivity: 'ilc_only' },
    createdAt:    { type: 'datetime', sensitivity: 'ilc_only' },
    updatedAt:    { type: 'datetime', sensitivity: 'ilc_only' },
  },

  links: {
    note:    { object: 'Note',    via: 'noteId',    cardinality: 'one' },
    client:  { object: 'Client',  via: 'clientId',  cardinality: 'one' },
    project: { object: 'Project', via: 'projectId', cardinality: 'one' },
  },

  actions: [],
};

/**
 * NoteAction, one follow-up pulled out of a note.
 *
 * `status` is the whole story. SUGGESTED means the AI read it out of the text
 * and nobody has agreed yet; CONFIRMED means a human said yes and it is now a
 * real obligation; DONE and DISMISSED close it. Only CONFIRMED rows are
 * commitments, and get_commitments reflects that.
 */
export const NoteAction = {
  key:   'NoteAction',
  model: 'noteAction',
  label: 'Note Action',
  description:
    'A follow-up item extracted from a note. kind is ACTION | INTEL. status is ' +
    'SUGGESTED | CONFIRMED | DONE | DISMISSED. Only CONFIRMED is an obligation anyone has agreed to. ' +
    'type is a taxonomy id (INTRO_OUTBOUND, SETUP_MEAL, EXPECT_INTRO, …). contactId soft-links to a ' +
    'Contact when the person was matched; contactName is the name as written when they were not.',

  properties: {
    id:     { type: 'string', sensitivity: 'ilc_only' },
    noteId: { type: 'string', sensitivity: 'ilc_only' },
    kind:   { type: 'string', sensitivity: 'ilc_only', desc: 'ACTION | INTEL' },
    type:   { type: 'string', sensitivity: 'ilc_only', desc: 'taxonomy id' },
    rawText: { type: 'string', sensitivity: 'ilc_only', desc: 'the original line from the note' },
    detail:  { type: 'string', sensitivity: 'ilc_only', desc: 'normalized one-liner' },

    contactId:   { type: 'string', sensitivity: 'ilc_only' },
    contactName: { type: 'string', sensitivity: 'ilc_only', desc: 'person as written, when unmatched' },
    targetName:  { type: 'string', sensitivity: 'ilc_only', desc: 'intro target / third party' },
    company:     { type: 'string', sensitivity: 'ilc_only' },

    dueDate:      { type: 'datetime', sensitivity: 'ilc_only' },
    reminderDays: { type: 'int',      sensitivity: 'ilc_only', desc: 'per-item override; null = type default' },
    status:       { type: 'string',   sensitivity: 'ilc_only', desc: 'SUGGESTED | CONFIRMED | DONE | DISMISSED' },
    source:       { type: 'string',   sensitivity: 'ilc_only', desc: 'ai | manual' },
    confirmedAt:  { type: 'datetime', sensitivity: 'ilc_only' },
    executedAt:   { type: 'datetime', sensitivity: 'ilc_only', desc: 'when the bot acted' },
    remindAt:     { type: 'datetime', sensitivity: 'ilc_only' },
    remindedAt:   { type: 'datetime', sensitivity: 'ilc_only', desc: 'set once delivered, so the sweep stops' },
    botDraftId:   { type: 'string',   sensitivity: 'ilc_only' },
    createdAt:    { type: 'datetime', sensitivity: 'ilc_only' },
    updatedAt:    { type: 'datetime', sensitivity: 'ilc_only' },
  },

  links: {
    note: { object: 'Note', via: 'noteId', cardinality: 'one' },
  },

  actions: [],
};

/**
 * Contact, a human being. Table `ClientContact`, model `Contact` since the two
 * people tables were merged (migration 0070).
 *
 * `clientId` is optional and always was after the merge: we meet people before
 * we know where they work, and deleting a company unhooks the human rather than
 * deleting them.
 */
export const Contact = {
  key:   'Contact',
  model: 'contact',
  label: 'Contact',
  description:
    'A person. clientId is optional: a contact can exist with no company, or with a typed-but-unlinked ' +
    'employer in `company`. department is one of eight keys (CORPORATE | PRECONSTRUCTION | CONSTRUCTION | ' +
    'PROCUREMENT | DESIGN | DEVELOPMENT | ARCHITECT | INTERIOR_DESIGN). lastEmailReceivedAt and ' +
    'lastEmailSentAt are CACHES rebuilt from the mailbox and ignore mass sends, invites and auto-replies. ' +
    'Archived rows (archivedAt set) are hidden from normal reads.',

  properties: {
    id:            { type: 'string', sensitivity: 'ilc_only' },
    contactNumber: { type: 'int',    sensitivity: 'ilc_only' },
    archivedAt:    { type: 'datetime', sensitivity: 'ilc_only' },
    archivedById:  { type: 'string',   sensitivity: 'ilc_only' },
    createdById:   { type: 'string',   sensitivity: 'ilc_only' }, // who added the person (0119)

    clientId:      { type: 'string', sensitivity: 'ilc_only' },
    name:          { type: 'string', sensitivity: 'ilc_only' },
    firstName:     { type: 'string', sensitivity: 'ilc_only' },
    lastName:      { type: 'string', sensitivity: 'ilc_only' },
    preferredName: { type: 'string', sensitivity: 'ilc_only', desc: 'used in the email salutation' },
    title:         { type: 'string', sensitivity: 'ilc_only' },
    company:       { type: 'string', sensitivity: 'ilc_only', desc: 'employer as typed, independent of clientId' },
    email:         { type: 'string', sensitivity: 'ilc_only' },
    phone:         { type: 'string', sensitivity: 'ilc_only', desc: 'legacy single phone, kept in sync with workPhone' },
    cellPhone:     { type: 'string', sensitivity: 'ilc_only' },
    workPhone:     { type: 'string', sensitivity: 'ilc_only' },
    linkedInUrl:   { type: 'string', sensitivity: 'ilc_only' },
    department:    { type: 'string', sensitivity: 'ilc_only', desc: "one of Mike's eight keys" },
    notes:         { type: 'string', sensitivity: 'ilc_only' },

    cadenceTier:      { type: 'string',   sensitivity: 'ilc_only' },
    cadenceDays:      { type: 'int',      sensitivity: 'ilc_only', desc: 'null = use the tier default' },
    lastInPersonAt:   { type: 'datetime', sensitivity: 'ilc_only' },
    lastTouchpointAt: { type: 'datetime', sensitivity: 'ilc_only' },
    nextCheckInAt:    { type: 'datetime', sensitivity: 'ilc_only', desc: 'snoozed until this date' },

    lastEmailReceivedAt: { type: 'datetime', sensitivity: 'ilc_only' },
    lastEmailSentAt:     { type: 'datetime', sensitivity: 'ilc_only' },

    createdAt: { type: 'datetime', sensitivity: 'ilc_only' },
    updatedAt: { type: 'datetime', sensitivity: 'ilc_only' },
  },

  links: {
    client: { object: 'Client', via: 'clientId', cardinality: 'one' },
  },

  actions: [],
};

/**
 * RFI, a question from the field that ILC owes an answer to.
 *
 * The one on this list with a hard clock. `dateDue` is a contractual date, and
 * `shipFlag` means an answer is holding up a shipment.
 */
export const RFI = {
  key:   'RFI',
  model: 'rFI',
  label: 'RFI',
  description:
    'A request for information on a project. status is OPEN | IN_REVIEW | RESPONDED | CLOSED. OPEN and ' +
    'IN_REVIEW are outstanding. receivedFrom is the GC, the EC, or "ILC" when self-initiated. ' +
    'shipFlag true means an unanswered RFI is holding up a shipment. The draft* fields are the ' +
    'pre-written answer and its review state, not the sent answer.',

  properties: {
    id:        { type: 'string', sensitivity: 'ilc_only' },
    projectId: { type: 'string', sensitivity: 'ilc_only' },
    rfiNumber: { type: 'string', sensitivity: 'ilc_only' },
    subject:   { type: 'string', sensitivity: 'ilc_only' },
    receivedFrom: { type: 'string', sensitivity: 'ilc_only', desc: 'GC | EC | ILC' },
    rfiType:      { type: 'string', sensitivity: 'ilc_only' },
    routingMode:  { type: 'string', sensitivity: 'ilc_only', desc: 'DIRECT | THROUGH_ARCHITECT | REVIEW_ONLY' },
    status:       { type: 'string', sensitivity: 'ilc_only', desc: 'OPEN | IN_REVIEW | RESPONDED | CLOSED' },
    assignedToId: { type: 'string', sensitivity: 'ilc_only' },

    procoreRfiId:     { type: 'string', sensitivity: 'ilc_only' },
    procoreProjectId: { type: 'string', sensitivity: 'ilc_only' },

    dateReceived: { type: 'datetime', sensitivity: 'ilc_only' },
    dateDue:      { type: 'datetime', sensitivity: 'ilc_only' },

    shipFlag:             { type: 'boolean', sensitivity: 'ilc_only', desc: 'an answer is holding up a shipment' },
    shipFlagAcknowledged: { type: 'boolean', sensitivity: 'ilc_only' },

    draftText:        { type: 'string',   sensitivity: 'ilc_only' },
    draftStatus:      { type: 'string',   sensitivity: 'ilc_only', desc: 'NONE | GENERATING | READY | REVIEWED | SENT' },
    draftConfidence:  { type: 'string',   sensitivity: 'ilc_only' },
    draftGeneratedAt: { type: 'datetime', sensitivity: 'ilc_only' },
    draftReviewedBy:  { type: 'string',   sensitivity: 'ilc_only' },
    draftReviewedAt:  { type: 'datetime', sensitivity: 'ilc_only' },

    closedAt:  { type: 'datetime', sensitivity: 'ilc_only' },
    closedBy:  { type: 'string',   sensitivity: 'ilc_only' },
    createdAt: { type: 'datetime', sensitivity: 'ilc_only' },
    updatedAt: { type: 'datetime', sensitivity: 'ilc_only' },
  },

  links: {
    project: { object: 'Project', via: 'projectId', cardinality: 'one' },
  },

  actions: [],
};
