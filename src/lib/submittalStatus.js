// Submittal review statuses and note sorting (Mike 10-29, 0146).
// No imports, so the tracker screens, the hand-typed review routes and the PDF
// extractor all share it without pulling pdf.js into a route that does not
// read PDFs.

// The four statuses, in this order everywhere.
export const REVIEW_STATUSES = [
  { code: 'Approved',        label: 'Approved' },
  { code: 'ApprovedAsNoted', label: 'Approved as noted' },
  { code: 'Rejected',        label: 'Rejected' },
  { code: 'NotReviewed',     label: 'Not reviewed' },
];
export const REVIEW_STATUS_CODES = REVIEW_STATUSES.map((s) => s.code);
export const statusLabel = (code) => REVIEW_STATUSES.find((s) => s.code === code)?.label || code;

// A review in one of these leaves something to fix, so its note opens (or
// keeps open) an open item. Approved closes the type's open items.
export const OPENS_ITEM = ['ApprovedAsNoted', 'Rejected', 'NotReviewed'];

// ── RULE-BASED NOTE CATEGORY FLAGS ───────────────────────────────────────────
// Phase 4: These run on every extracted note. No Claude call needed.

const CATEGORY_RULES = [
  { category: 'FINISH',       patterns: [/\bfinish\b/i, /\bcolor\b.*\bconfirm/i, /arch.*verify.*finish/i, /id.*verify.*finish/i, /ownership.*verify.*finish/i, /finish.*needs.*to.*be/i] },
  { category: 'MODEL',        patterns: [/\bold cutsheet/i, /wrong cutsheet/i, /does not match.*cutsheet/i, /resubmit.*cutsheet/i, /tv shows.*diff/i, /different spec/i, /model number.*cutsheet/i] },
  { category: 'ACCESSORY',    patterns: [/mounting kit/i, /\bjumpers\b/i, /end pieces/i, /mounting clips/i, /provide.*accessori/i, /accessories.*required/i] },
  { category: 'VOLTAGE',      patterns: [/\b277v\b/i, /\b120v\b/i, /univ.*voltage/i, /elv.*triac/i, /triac.*elv/i, /no.*0.10.*spec/i, /0-10.*not.*support/i, /dimming.*protocol/i, /cri.*should/i] },
  { category: 'LUMEN',        patterns: [/design.*lumen/i, /lumen.*mismatch/i, /lumen.*output.*match/i, /lumen.*package/i, /\blumens\b.*proposed/i] },
  { category: 'WET_LOCATION', patterns: [/wet.*location/i, /shower/i, /damp.*rated/i, /\bc1-w\b/i, /wet.*rated.*option/i] },
  { category: 'DRAWING_SYNC', patterns: [/not.*shown.*electrical/i, /not.*on.*electrical/i, /electrical.*drawings/i, /update.*drawings.*to.*match/i] },
  { category: 'DISCONTINUED', patterns: [/discontinued/i, /no longer available/i, /product.*discontinu/i] },
  { category: 'LED_TAPE',     patterns: [/verify.*lengths/i, /verify.*reel/i, /drivers.*needed/i, /field.*verify.*lengths/i, /reel.*length/i, /tape.*connector/i] },
  { category: 'CODE',         patterns: [/wet.*location.*code/i, /ul\/etl/i, /iecc/i, /120v\/208v/i, /ul.*listed/i] },
  { category: 'CRI',          patterns: [/\bcri\b/i, /color.*rendering/i, /90.*cri/i, /80.*cri/i] },
  { category: 'BOILERPLATE',  patterns: [/quantities not reviewed/i, /general conformance/i, /contractor is responsible/i, /corrections.*do not relieve/i] },
];

export function categorizeNote(text) {
  const t = text || '';
  for (const { category, patterns } of CATEGORY_RULES) {
    for (const p of patterns) {
      if (p.test(t)) return category;
    }
  }
  return 'OTHER';
}

// Responsible party inference from note text
export function inferResponsibleParty(noteText, noteCategory) {
  const t = noteText || '';
  if (/arch.*verify|arch.*confirm|aor/i.test(t))              return 'ARCH';
  if (/id.*verify|interior.*designer|ownership.*verify/i.test(t)) return 'ID';
  if (/\bee\b|electrical.*engineer|not.*shown.*electrical/i.test(t)) return 'EE';
  if (/contractor/i.test(t))                                   return 'CONTRACTOR';
  if (/ilc|ilcstudios/i.test(t))                              return 'ILC';

  // Category-based defaults
  const defaults = {
    FINISH:       'ARCH',
    WET_LOCATION: 'CONTRACTOR',
    DRAWING_SYNC: 'EE',
    ACCESSORY:    'CONTRACTOR',
    VOLTAGE:      'CONTRACTOR',
    LUMEN:        'ILC',
    MODEL:        'CONTRACTOR',
    DISCONTINUED: 'ILC',
    LED_TAPE:     'CONTRACTOR',
    CODE:         'CONTRACTOR',
    CRI:          'ILC',
  };
  return defaults[noteCategory] || 'CONTRACTOR';
}
