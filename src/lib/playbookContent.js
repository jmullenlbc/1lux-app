// ── Playbook "How We Work Together" content ──────────────────────────────────
// Default reference content shown per Playbook section, client-facing (viewable
// + included on the shared PDF). Use {{client}} as a token — it's replaced with
// the client's name at render time (falls back to "the client").
//
// Item shape (recursive):
//   { text: string, meta?: string (e.g. a duration), children?: Item[] }
//
// Section shape:
//   { note?: string, action?: 'none' | 'text', items: Item[] }

export const PLAYBOOK_CONTENT = {
  scope: {
    action: 'none',
    note: 'Reference only — no action required.',
    items: [
      { text: 'Introduction to architect and electrical engineer' },
      { text: 'Introduction to GC' },
    ],
  },

  approvals: {
    action: 'text',
    items: [
      { text: 'Site photometrics' },
      { text: 'Submittals' },
      { text: 'Budget' },
      { text: 'Standards design modifications' },
    ],
  },

  process: {
    items: [
      {
        text: 'Set up an initial 30-minute call with {{client}} for every project to talk through any unique areas and ask any questions about those areas.',
        children: [
          { text: 'Discuss unique site areas' },
          { text: 'Discuss unit adders (e.g. undercabinet lighting or extra ceiling fans)' },
        ],
      },
      { text: 'Receive address / portal locations from {{client}} and/or the architect to place lights.' },
      { text: 'Receive site or civil drawings as soon as they are ready in order to start producing site photometrics.' },
      {
        text: '{{client}} to make the introduction to the GC.',
        children: [
          { text: 'Once ILC is introduced to the GC, ILC will have direct conversations with the GC without {{client}} involved. The GC will use the formal process to get approvals from {{client}}.' },
        ],
      },
      {
        text: '{{client}} to make the introduction to the architect and electrical engineer.',
        children: [
          { text: 'ILC will send an email explaining their scope and what is needed from the architect and electrical engineer, then have direct conversations without {{client}} going forward after the introduction.' },
        ],
      },
      {
        text: 'There will be (4) email threads during the design phase. The purchasing and construction phase will have whatever email threads are needed.',
        children: [
          { text: 'Site design and photometrics' },
          { text: 'Unit design' },
          { text: 'Clubhouse' },
          { text: 'Budgets' },
          { text: 'Units and site will be broken out from each other.' },
        ],
      },
      {
        text: 'Transition from pre-con to construction team.',
        children: [
          { text: 'Request that the GC puts the ILC construction PM on the distribution list for submittal approvals (e.g. Procore).' },
        ],
      },
    ],
  },

  timeframes: {
    action: 'none',
    note: 'Reference only — typical turnaround times, no action required.',
    items: [
      {
        text: 'Site photometrics',
        children: [
          { text: 'Initial site photometric layouts', meta: '2–4 weeks' },
          { text: 'Site photometric layout revisions', meta: '1–2 weeks' },
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
};

// Replace {{client}} tokens with the client's name (or a generic fallback).
export function fillClientName(text, clientName) {
  return (text || '').replace(/\{\{client\}\}/g, clientName || 'the client');
}
