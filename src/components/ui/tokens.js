// One look for the whole platform (Mike 10-16: "I just want it all the same").
// Every screen pulls its class strings from here instead of retyping them.
// Standards come from UI_UX_AUDIT_2026-10-16.md in the engineering folder.

// Cards. rounded-2xl is for modals only, rounded-lg for inner tiles and inputs.
export const CARD        = 'bg-white rounded-xl border border-slate-200 shadow-sm';
export const CARD_PADDED = `${CARD} p-5`;
export const TILE        = 'bg-slate-50 rounded-lg border border-slate-200 p-3';
export const MODAL       = 'bg-white rounded-2xl border border-slate-200 shadow-xl';

// Buttons. One orange, one size, one compact size for table rows.
export const FOCUS         = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2';
const BTN_BASE             = `inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
export const BTN_PRIMARY   = `${BTN_BASE} px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white`;
export const BTN_SECONDARY = `${BTN_BASE} px-4 py-2 text-sm bg-white hover:bg-slate-50 text-slate-700 border border-slate-300`;
export const BTN_DANGER    = `${BTN_BASE} px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white`;
export const BTN_GHOST     = `${BTN_BASE} px-4 py-2 text-sm text-slate-600 hover:bg-slate-100`;
export const BTN_COMPACT   = `${BTN_BASE} px-3 py-1.5 text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-300`;
export const BTN_COMPACT_PRIMARY = `${BTN_BASE} px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white`;

// Type. h1 page title, h2 section title, card title, uppercase label, body, helper.
export const H1         = 'text-2xl font-bold text-slate-900';
export const H2         = 'text-lg font-semibold text-slate-900';
export const CARD_TITLE = 'text-sm font-semibold text-slate-800';
export const LABEL      = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';
export const BODY       = 'text-sm text-slate-700';
export const HELPER     = 'text-xs text-slate-500';
export const NUM        = 'tabular-nums';
export const STAT_VALUE = 'text-2xl font-bold text-slate-900 tabular-nums';

// Inputs.
export const INPUT  = `w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400`;
export const SELECT = INPUT;

// Status tones: success green, danger red, warning amber. No emerald, rose or yellow.
export const TONE = {
  success: 'bg-green-50 text-green-700 border-green-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info:    'bg-slate-50 text-slate-700 border-slate-200',
  brand:   'bg-orange-50 text-orange-700 border-orange-200',
};

// Active tab or step: orange underline, orange text. Navy only on the dark sidebar.
export const TAB_ACTIVE   = 'border-orange-500 text-orange-600';
export const TAB_INACTIVE = 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300';

// Table headers.
export const TH = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500';
export const TD = 'px-3 py-2 text-sm text-slate-700';
