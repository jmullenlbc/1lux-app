/**
 * Client — the developer/owner organisation ILC works for.
 *
 * Posture note worth stating plainly: almost everything on this object is
 * `ilc_only`. That is not over-caution. A Client row is ILC's CRM read on the
 * account — tier, pipeline value per unit, how many projects a year we expect,
 * who owns the relationship. A portal contact reading their own client record
 * would be reading our account strategy for them. The client already knows
 * their own name and address; they gain nothing and we lose everything.
 *
 * The one deliberate exception is identity (`id`, `name`) so a portal response
 * can say which client a project belongs to without a second lookup.
 */
export const Client = {
  key:   'Client',
  model: 'client',
  label: 'Client',
  description:
    'A developer or owner organisation. Parent of projects, contacts, standards answers ' +
    'and playbooks. type/locationType classify the account; markets, geographies, ' +
    'projectTypes and orgTypes are JSON-as-string arrays.',

  properties: {
    id:   { type: 'string', sensitivity: 'client_ok' },
    name: { type: 'string', sensitivity: 'client_ok' },

    // ── account identity, ILC-internal ──
    clientNumber:  { type: 'int',    sensitivity: 'ilc_only' },
    type:          { type: 'string', sensitivity: 'ilc_only' },
    locationType:  { type: 'string', sensitivity: 'ilc_only' },
    developerType: { type: 'string', sensitivity: 'ilc_only' },
    address:  { type: 'string', sensitivity: 'ilc_only' },
    city:     { type: 'string', sensitivity: 'ilc_only' },
    state:    { type: 'string', sensitivity: 'ilc_only' },
    website:  { type: 'string', sensitivity: 'ilc_only' },
    linkedIn: { type: 'string', sensitivity: 'ilc_only' },
    email:    { type: 'string', sensitivity: 'ilc_only' },
    phone:    { type: 'string', sensitivity: 'ilc_only' },

    // ── contacts: PII, ILC-only through this layer ──
    primaryContact:      { type: 'string', sensitivity: 'ilc_only' },
    primaryContactTitle: { type: 'string', sensitivity: 'ilc_only' },
    primaryContactEmail: { type: 'string', sensitivity: 'ilc_only' },
    primaryContactPhone: { type: 'string', sensitivity: 'ilc_only' },
    emailDomains:        { type: 'json',   sensitivity: 'ilc_only', desc: 'JSON-as-string; drives intake auto-linking' },

    // ── ILC account strategy ──
    tier:            { type: 'string', sensitivity: 'ilc_only' },
    notes:           { type: 'string', sensitivity: 'ilc_only' },
    markets:         { type: 'json',   sensitivity: 'ilc_only' },
    geographies:     { type: 'json',   sensitivity: 'ilc_only' },
    projectTypes:    { type: 'json',   sensitivity: 'ilc_only' },
    orgTypes:        { type: 'json',   sensitivity: 'ilc_only' },
    projectsPerYear: { type: 'int',    sensitivity: 'ilc_only' },
    pipelinePerUnit: { type: 'money',  sensitivity: 'ilc_only', globalDeny: true, desc: 'expected ILC revenue per unit — commercial forecast' },
    paymentTerms:    { type: 'string', sensitivity: 'ilc_only' },
    cadenceDays:     { type: 'int',    sensitivity: 'ilc_only' },
    ownerId:         { type: 'string', sensitivity: 'ilc_only' },
    createdById:     { type: 'string', sensitivity: 'ilc_only' },
    createdAt:       { type: 'datetime', sensitivity: 'ilc_only' },
    updatedAt:       { type: 'datetime', sensitivity: 'ilc_only' },
  },

  links: {
    projects: { object: 'Project', via: 'clientId', cardinality: 'many' },
  },

  actions: [],
};
