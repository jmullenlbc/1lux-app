/**
 * Change Order, a priced change to project scope. CO-00001.
 *
 * This is the object that already leaked twice (see src/lib/redact.js), so the
 * declarations here are deliberately tight.
 *
 * The subtle one is on the line item: `originalDN` is the buy price and is
 * obviously `ilc_only`. But `cnUnitPrice` (the sell price) is `client_ok`, the
 * client is quoted it, and that means the MARGIN can never be client-visible,
 * because `dn = cn × (1 - marginPct)`. Margin lives on ProjectData and is
 * marked `ilc_only` there. Two fields in two objects, one rule; the drift gate
 * in scripts/check-sensitivity-coverage.mjs is what keeps them married.
 */

export const ChangeOrder = {
  key:   'ChangeOrder',
  model: 'changeOrder',
  label: 'Change Order',
  description:
    'A priced change to a project scope, numbered CO-00001. Holds one or more option ' +
    'groups (client picks one); each group holds line items. Can be shared to a ' +
    'contractor by token link and pushed to a budget version or the ship schedule.',

  properties: {
    id:          { type: 'string',   sensitivity: 'client_ok' },
    projectId:   { type: 'string',   sensitivity: 'client_ok' },
    coNumber:    { type: 'string',   sensitivity: 'client_ok', desc: 'CO-00001' },
    title:       { type: 'string',   sensitivity: 'client_ok' },
    date:        { type: 'datetime', sensitivity: 'client_ok' },
    status:      { type: 'enum',     sensitivity: 'client_ok', values: ['DRAFT', 'SENT', 'APPROVED'] },
    notes:       { type: 'string',   sensitivity: 'client_ok', desc: 'client-facing notes; internal notes live elsewhere' },
    createdAt:   { type: 'datetime', sensitivity: 'client_ok' },
    updatedAt:   { type: 'datetime', sensitivity: 'client_ok' },
    rfiId:       { type: 'string',   sensitivity: 'ilc_only' },
    createdById: { type: 'string',   sensitivity: 'ilc_only' },
  },

  links: {
    project:      { object: 'Project',                via: 'projectId',     cardinality: 'one'  },
    optionGroups: { object: 'ChangeOrderOptionGroup', via: 'changeOrderId', cardinality: 'many' },
  },

  actions: [],
};

export const ChangeOrderOptionGroup = {
  key:   'ChangeOrderOptionGroup',
  model: 'changeOrderOptionGroup',
  label: 'Change Order Option Group',
  description: 'One priced option within a change order. The client selects exactly one.',

  properties: {
    id:            { type: 'string',  sensitivity: 'client_ok' },
    changeOrderId: { type: 'string',  sensitivity: 'client_ok' },
    label:         { type: 'string',  sensitivity: 'client_ok', desc: 'e.g. "Option A"' },
    sortOrder:     { type: 'int',     sensitivity: 'client_ok' },
    isSelected:    { type: 'boolean', sensitivity: 'client_ok' },
  },

  links: {
    changeOrder: { object: 'ChangeOrder',          via: 'changeOrderId', cardinality: 'one'  },
    lineItems:   { object: 'ChangeOrderLineItem',  via: 'optionGroupId', cardinality: 'many' },
  },

  actions: [],
};

export const ChangeOrderLineItem = {
  key:   'ChangeOrderLineItem',
  model: 'changeOrderLineItem',
  label: 'Change Order Line Item',
  description:
    'One fixture line on a change order option group. cnUnitPrice is the client sell ' +
    'price; originalDN is what ILC pays the manufacturer and is never client-visible.',

  // The description above names the buy price and explains what it is, so it is
  // ILC-only prose. Without this, describeForAudience() would suppress the
  // description entirely for a client rather than risk shipping it.
  clientDescription:
    'One fixture line on a change order option group. cnUnitPrice is the quoted unit price.',

  properties: {
    id:            { type: 'string',  sensitivity: 'client_ok' },
    optionGroupId: { type: 'string',  sensitivity: 'client_ok' },
    sortOrder:     { type: 'int',     sensitivity: 'client_ok' },
    fixtureType:   { type: 'string',  sensitivity: 'client_ok' },
    qty:           { type: 'float',   sensitivity: 'client_ok' },
    manufacturer:  { type: 'string',  sensitivity: 'client_ok' },
    partNumber:    { type: 'string',  sensitivity: 'client_ok' },
    description:   { type: 'string',  sensitivity: 'client_ok' },
    cnUnitPrice:   { type: 'money',   sensitivity: 'client_ok', desc: 'client net: the quoted sell price' },
    leadTime:      { type: 'string',  sensitivity: 'client_ok' },
    notes:         { type: 'string',  sensitivity: 'client_ok' },
    isOptionRow:   { type: 'boolean', sensitivity: 'client_ok' },
    optionLabel:   { type: 'string',  sensitivity: 'client_ok' },
    isGroupSelected: { type: 'boolean', sensitivity: 'client_ok' },
    parentLineItemId: { type: 'string', sensitivity: 'client_ok' },
    createdAt:     { type: 'datetime', sensitivity: 'client_ok' },
    updatedAt:     { type: 'datetime', sensitivity: 'client_ok' },

    // ── the hard boundary ──
    // globalDeny: the bare field name is unambiguous across all 116 models, so
    // the transport-level redactor in src/lib/redact.js can also strip it from
    // hand-assembled payloads whose object type it does not know.
    originalDN:     { type: 'money',  sensitivity: 'ilc_only', globalDeny: true, desc: 'dealer net / ILC buy price, NEVER to contractors' },
    quoteReference: { type: 'string', sensitivity: 'ilc_only', globalDeny: true, desc: 'manufacturer quote number backing the DN' },
  },

  links: {
    optionGroup: { object: 'ChangeOrderOptionGroup', via: 'optionGroupId', cardinality: 'one' },
  },

  actions: [],
};
