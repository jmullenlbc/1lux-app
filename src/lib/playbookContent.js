// ── Playbook "How We Work Together" content ──────────────────────────────────
// Default reference content shown per Playbook section, client-facing (viewable
// + included on the shared PDF). Use {{client}} as a token, it's replaced with
// the client's name at render time (falls back to "the client").
//
// Item shape (recursive):
//   { text: string, meta?: string (e.g. a duration), children?: Item[] }
//
// Section shape:
//   { note?: string, action?: 'none' | 'text', items: Item[] }

export const PLAYBOOK_CONTENT = {
  general: {
    items: [
      { text: 'Weekly kickoff calls', body: 'A standing weekly 1-hour call until the standards are at least 90% complete.' },
      { text: 'Monthly check-ins after standards are set', body: 'A monthly call for 3 to 6 months to make sure everything is going well, and to keep improving our process, scope, and relationships with the outside design and construction teams. (We have learned this is very important.)' },
      { text: 'Development team intro call', body: 'A call with the full development team to introduce ourselves, our process, and our scope, including a discussion of standard soft-cost ranges.' },
    ],
  },

  approvals: {
    items: [
      {
        text: 'Site photometrics',
        children: [
          { text: 'Client must officially sign off on site photometrics in writing.' },
          { text: 'Architect must confirm municipality approval.' },
          { text: 'Electrical engineer must officially sign off on site photometrics in writing.' },
        ],
      },
      {
        text: 'Fixture and Controls Submittals',
        children: [
          { text: 'If there is an awarded GC at the time of making submittals, the submittal approval process will go through the GC’s official process.' },
          { text: 'ILC will have a standard pre-approved fixture submittal for all typical fixtures, which will be submitted in the official process for records.' },
          { text: 'Common area controls will always be a separate submittal, specified per project and included in the official GC submittal review process.' },
        ],
      },
      {
        text: 'Standards modifications per project',
        children: [
          { text: 'Modifications to the client-agreed standards per project will be recorded either in our questionnaire tool or elsewhere in writing.' },
        ],
      },
    ],
  },

  process: {
    items: [
      { text: 'ILC will build a standard fixture schedule to be shared with the {{client}} team.' },
      { text: 'Site photometrics & approval', body: 'How we handle site photometrics and their approval. See the Approvals section for the required sign-offs.' },
      {
        text: 'Project-specific process',
        children: [
          {
            text: 'Engage 1LUX at concept or the beginning of SDs',
            children: [
              { text: 'Create a conceptual budget' },
              { text: 'Design any required site photometrics for municipality approvals' },
            ],
          },
          {
            text: 'Set up an initial 30-minute call with {{client}} for every project to talk through any unique areas and ask questions about those areas.',
            children: [
              { text: 'Discuss unique areas of the site and building' },
              { text: 'Discuss unit adders (e.g. undercabinet lighting or extra ceiling fans)' },
            ],
          },
          { text: '{{client}} to make the introduction to the design team: architect, landscape architect, electrical engineer, and interior design team.' },
          { text: '{{client}} to make the introduction to the GC (if on-board early).' },
          { text: '{{client}} to receive a line-item budget after each submission, starting at 100% DDs.' },
        ],
      },
    ],
  },

  timeframes: {
    action: 'none',
    note: 'Reference only: typical turnaround times, no action required.',
    items: [
      {
        text: 'Site photometrics',
        children: [
          { text: 'Initial site photometric layouts', meta: '2 to 4 weeks' },
          { text: 'Site photometric layout revisions', meta: '1 to 2 weeks' },
        ],
      },
      {
        text: 'Quotes',
        children: [
          { text: 'Initial budget', meta: '1 week' },
          { text: 'Budget revisions', meta: '< 1 week' },
        ],
      },
      { text: 'Submittal creation', meta: '1 week' },
    ],
  },

  precon: {
    items: [
      { text: 'Pricing Tracking', body: 'ILC will start tracking pricing per project and per building area to utilize on future projects.' },
      { text: 'Pricing Expiration', body: 'Pricing is valid for 30 days after a submission of a budget.' },
      { text: 'Common Area Controls', body: 'Bid price is provided by ILC, but formal submittals, drawings, and one-lines will be provided during the submittal process.' },
      { text: 'Low Voltage Fixtures', body: 'Bid price is provided by ILC, but lengths and power-supply takeoffs will be verified during the ordering phase by the contractor.' },
      { text: 'Egress / Emergency Lighting', body: 'When emergency lighting is not on a generator, ILC will provide pricing for emergency frogeyes, remote inverters, and/or integral battery backups.' },
      { text: 'Electrical Contractor Bid Breakout', body: 'Contractor is to break out the lighting fixture and lighting control product package prices from labor and materials. Show the total for lighting fixtures as one line item and lighting controls as a separate line item.' },
      { text: 'Sales Tax', body: 'Sales tax is always included at a rate we estimate, but we must get direction from the GC on use or sales tax paid ahead of time. We can remove or adjust tax at future budget submissions if any or all of the tax will be covered by the contractor.' },
      { text: 'Warehousing / Freight Costs', body: 'Warehousing and freight costs are included. They cover 180 days of storage and 10 deliveries to the jobsite.' },
      { text: 'Final Pricing for P.O.', body: 'Final pricing for the project is based on the assumption that submittals will be approved within 60 days.' },
    ],
  },

  buyout: {
    items: [
      {
        text: 'All submittals must have official approvals by the following:',
        children: [
          { text: 'Developer / Owner' },
          { text: 'Architect' },
          { text: 'Electrical Engineer (code and power-related items)' },
          { text: 'Interior Designer (their scope only)' },
          { text: 'Landscape Architect (their scope only)' },
        ],
      },
      {
        text: 'Construction schedule',
        children: [
          { text: 'A construction schedule must be provided before buyout by the GC.' },
        ],
      },
      {
        text: 'Purchasing relationship',
        children: [
          { text: 'The General Contractor (GC) or Electrical Contractor (EC) can contract directly with us for the purchase of lighting and controls products.' },
        ],
      },
    ],
  },
};

// Replace {{client}} tokens with the client's name (or a generic fallback).
export function fillClientName(text, clientName) {
  return (text || '').replace(/\{\{client\}\}/g, clientName || 'the client');
}
