import '@/lib/pdfPolyfill';
/**
 * Submittal Review Extractor — Phases 1–4
 *
 * Extracts reviewer notes from submittal PDFs using:
 *   1. pdfjs-dist text extraction (already installed, no new deps)
 *   2. Prefix dictionary scanner for known reviewer stamp patterns
 *   3. Fixture type code detection (co-located with notes on page)
 *   4. Status parsing (A / AN / R / NA and long forms)
 *   5. Claude Haiku classification for noteCategory (Phase 2)
 */

// ── NOTE CATEGORY DEFINITIONS ────────────────────────────────────────────────

export const NOTE_CATEGORIES = {
  FINISH:       'FINISH',
  MODEL:        'MODEL',
  ACCESSORY:    'ACCESSORY',
  VOLTAGE:      'VOLTAGE',
  LUMEN:        'LUMEN',
  WET_LOCATION: 'WET_LOCATION',
  DRAWING_SYNC: 'DRAWING_SYNC',
  DISCONTINUED: 'DISCONTINUED',
  LED_TAPE:     'LED_TAPE',
  REPEAT:       'REPEAT',
  CODE:         'CODE',
  BOILERPLATE:  'BOILERPLATE',
  CRI:          'CRI',
  OTHER:        'OTHER',
};

// ── RESPONSIBLE PARTY MAP ─────────────────────────────────────────────────────

export const RESPONSIBLE_PARTIES = {
  ARCH:       'ARCH',
  EE:         'EE',
  ID:         'ID',
  CONTRACTOR: 'CONTRACTOR',
  ILC:        'ILC',
  OWNERSHIP:  'OWNERSHIP',
};

// ── REVIEWER PREFIX DICTIONARY (Section 4.3 of training doc) ─────────────────
// These prefixes reliably identify reviewer-added notes vs. ILC-authored content.

const REVIEWER_PREFIXES = [
  { pattern: /^SA:/i,                          firm: 'ILC',          role: 'ILC' },
  { pattern: /^ILC\s+STUDIOS?/i,               firm: 'ILC',          role: 'ILC' },
  { pattern: /^BOKA\s+POWELL/i,                firm: 'BOKA POWELL',  role: 'Architect' },
  { pattern: /^DIG\s+STUDIO/i,                 firm: 'DIG STUDIO',   role: 'LA' },
  { pattern: /^KTGY/i,                         firm: 'KTGY',         role: 'Architect' },
  { pattern: /^OZ\s+ARCH/i,                    firm: 'OZ',           role: 'Architect' },
  { pattern: /^MEPDD/i,                        firm: 'MEPDD',        role: 'EE' },
  { pattern: /^MEP\s+DELTA/i,                  firm: 'MEPDD',        role: 'EE' },
  { pattern: /^RJA/i,                          firm: 'RJA',          role: 'EE' },
  { pattern: /^KAZIN/i,                        firm: 'Kazin',        role: 'EE' },
  { pattern: /^SDDS/i,                         firm: 'SDDS',         role: 'ID' },
  { pattern: /^SWAN\s+DIVE/i,                  firm: 'Swan Dive',    role: 'ID' },
  { pattern: /^VCA/i,                          firm: 'VCA',          role: 'Architect' },
  { pattern: /^359\s+DESIGN/i,                 firm: '359 Design',   role: 'Architect' },
  { pattern: /^TRIO/i,                         firm: 'TRIO',         role: 'Contractor' },
  { pattern: /^ALLIANCE/i,                     firm: 'Alliance',     role: 'Contractor' },
  { pattern: /^CSI/i,                          firm: 'CSI',          role: 'Contractor' },
  // Action words that indicate reviewer content
  { pattern: /^(RESELECT|RESELECTED|RESUBMIT)/i, firm: null, role: 'Reviewer' },
  { pattern: /^MISSING\b/i,                    firm: null,           role: 'Reviewer' },
  { pattern: /^SUBMIT\b/i,                     firm: null,           role: 'Reviewer' },
  { pattern: /^CONFIRM\b/i,                    firm: null,           role: 'Reviewer' },
  { pattern: /^COLOR\s+TO\s+BE/i,              firm: null,           role: 'Reviewer' },
  { pattern: /^FINISH\s+TO\s+BE/i,             firm: null,           role: 'Reviewer' },
  { pattern: /^CANNOT\s+FIND/i,               firm: null,           role: 'Reviewer' },
  { pattern: /^INTERIOR\s+DESIGNER\s+TO/i,    firm: null,           role: 'Reviewer' },
  { pattern: /^ENSURE\s+WET\s+LOCATION/i,     firm: null,           role: 'Reviewer' },
  { pattern: /^INSTALL\s+HEIGHT/i,            firm: null,           role: 'Reviewer' },
  { pattern: /^TV\s+SHOWS/i,                  firm: null,           role: 'Reviewer' },
  { pattern: /^NOT\s+REVIEWED/i,              firm: null,           role: 'Reviewer' },
];

// ── STATUS PARSING ────────────────────────────────────────────────────────────
// Maps ILC standard codes to the tracker's status enum values.

const STATUS_MAP = [
  { patterns: [/\bAN\b/, /APPROVED\s+AS\s+NOTED/i, /FURNISH\s+AS\s+(CORRECTED|NOTED)/i],  status: 'ApprovedAsNoted' },
  { patterns: [/\bA\b/,  /NO\s+EXCEPTIONS?\s+TAKEN/i, /\bAPPROVED\b(?!\s+AS)/i],           status: 'Approved' },
  { patterns: [/\bR\b/,  /REVISE\s+AND\s+RESUBMIT/i, /REJECTED/i, /RESUBMIT/i],            status: 'Resubmit' },
  { patterns: [/\bNA\b/, /NO\s+ACTION\s+TAKEN/i, /NOT\s+REVIEWED/i],                       status: 'NoAction' },
];

function parseStatus(text) {
  for (const { patterns, status } of STATUS_MAP) {
    for (const p of patterns) {
      if (p.test(text)) return status;
    }
  }
  return null;
}

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

// ── FIXTURE TYPE CODE EXTRACTION FROM TEXT ────────────────────────────────────

const TYPE_CODE_REGEX = /\b([A-Z]{1,3}\d*[A-Z]?(?:\s*\([A-Z]+\))?)\b/g;

export function extractTypeCodesFromText(text, knownTypeCodes) {
  if (!text || !knownTypeCodes?.size) return [];
  const upper = text.toUpperCase();
  const candidates = [...upper.matchAll(TYPE_CODE_REGEX)].map(m => m[1].replace(/\s+/g, ''));
  return [...new Set(candidates.filter(c => knownTypeCodes.has(c)))];
}

// ── PDF TEXT EXTRACTION ───────────────────────────────────────────────────────

export async function extractPdfPages(buffer) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    const text    = content.items.map(item => item.str).join(' ');
    pages.push({ pageNumber: i, text });
  }

  return pages;
}

// ── STRUCTURED TABLE PARSER ───────────────────────────────────────────────────
// Handles "Notes Summary" tables in ILC-style submittals:
//   Type | Notes | Pg.
//   SP1  | ELECTRICAL ENGINEER TO VERIFY... | 2
//   D1   | HAZE MATTE / POWDER WHITE...     | 63
// These tables appear on the first few pages and are the richest source of notes.

export function extractNotesFromTable(pages, knownTypeCodes) {
  const results = [];

  for (const { pageNumber, text } of pages) {
    // Only parse pages that are Notes Summary pages, not product data TOC pages.
    // Notes Summary pages contain "Notes Summary" header OR a "Type Notes Pg." column pattern.
    // Product data pages contain "Type Manufacturer Model Number Pg." — skip those.
    const isNotesSummary = /notes\s+summary/i.test(text);
    const hasNotesColumns = /\bType\s+Notes?\s+(Pg\.?|Page)\b/i.test(text);
    const isProductTable  = /\bType\s+Manufacturer\s+Model/i.test(text) && !isNotesSummary && !hasNotesColumns;
    if (!isNotesSummary && !hasNotesColumns) continue;  // skip product data pages
    if (isProductTable) continue;

    // Parse: split into segments where a type code starts a segment
    // Pattern: [TYPE_CODE] [note text] [page number at end]
    // The text is extracted as a flat string — we need to find the structure
    const upper = text.toUpperCase();

    // Find overall status for this section
    const sectionStatus =
      /RESUBMIT/i.test(text) ? 'Resubmit' :
      /APPROVED\s+AS\s+NOTED/i.test(text) ? 'ApprovedAsNoted' :
      /NO\s+ACTION/i.test(text) ? 'NoAction' :
      /APPROVED/i.test(text) ? 'Approved' : null;

    // Extract type+note pairs using regex:
    // matches: [TypeCode] [text not starting with another TypeCode] [optional page#]
    const TYPE_NOTE_REGEX = /\b([A-Z]{1,3}\d*[A-Z]?(?:-[A-Z])?(?:\s*\([A-Z]+\))?)\s+((?:[A-Z][^\n]{5,200?}))\s+\d+(?=\s|$)/g;
    const matches = [...upper.matchAll(TYPE_NOTE_REGEX)];

    // Simpler approach: split by known type codes appearing at word boundaries
    // and capture the text between them
    if (knownTypeCodes?.size) {
      const typePattern = [...knownTypeCodes].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const splitRegex  = new RegExp(`\\b(${typePattern})\\b`, 'g');
      const segments    = upper.split(splitRegex);

      // segments: ['prefix', 'TYPE', 'note text', 'TYPE2', 'note text2', ...]
      for (let i = 1; i < segments.length; i += 2) {
        const typeCode = segments[i];
        const noteRaw  = (segments[i + 1] || '').trim();

        // Strip trailing page numbers and table headers
        const noteText = noteRaw
          .replace(/\s+\d{1,4}\s*$/, '')   // trailing page number
          .replace(/^(TYPE|NOTES?|PG\.?)\s+/i, '')
          // Strip continuation block headers (e.g. "RESUBMIT (continued) Type Notes Pg. L2 EC...")
          // Keep only the part after the last column header
          .replace(/^(RESUBMIT|APPROVED(\s+AS\s+NOTED)?|NO\s+ACTION|APPROVED)\s*(\(continued\))?\s*(Type\s+(Notes?\s+)?(Pg\.?)?)?\s*/i, '')
          .trim();

        if (!noteText || noteText.length < 12) continue;
        if (/^(TYPE|MANUFACTURER|MODEL\s+NUMBER|PAGE?)\s*$/i.test(noteText)) continue;
        // Skip table header continuation rows
        if (/^(RESUBMIT|APPROVED|NO\s+ACTION)(\s*\(continued\))?\s+(Type|Manufacturer|Model)/i.test(noteText)) continue;
        // Skip notes that are just continuation headers with no real content after them
        if (/^(RESUBMIT|APPROVED|NO\s+ACTION)\s*(\(continued\))?\s*(Type\s+Notes?\s+(Pg\.?)?)?$/i.test(noteText.trim())) continue;
        // Skip lines that are just manufacturer+model (product data, not reviewer notes)
        // Real notes have verbs, directives, or multi-word sentences
        const wordCount = noteText.split(/\s+/).length;
        const hasVerb   = /\b(verify|confirm|provide|ensure|check|submit|review|approved|rejected|resubmit|required|update|replace|change|add|remove|install|coordinate|contact|refer|see|note|use|match|needs?|must|shall|to be|to verify|to confirm)\b/i.test(noteText);
        if (wordCount < 4 && !hasVerb) continue; // likely a model number or short code
        // Skip lines that are just a manufacturer name + model number pattern (all-caps alphanumeric)
        if (/^[A-Z\s\-]+\s+[A-Z0-9\-\/]+$/.test(noteText) && wordCount <= 5) continue;

        const noteCategory = categorizeNote(noteText);

        results.push({
          fixtureType:  typeCode,
          reviewerFirm: 'ILC',
          reviewerRole: 'ILC',
          noteText:     noteText.slice(0, 500),
          status:       sectionStatus || 'NoAction',
          pageNumber,
          noteCategory,
        });
      }
    }
  }

  return deduplicateNotes(results);
}

// ── MAIN EXTRACTION PIPELINE ──────────────────────────────────────────────────
// Returns array of { fixtureType, reviewerFirm, reviewerRole, status, noteText, pageNumber, noteCategory }

export function extractNotesFromPages(pages, knownTypeCodes) {
  // Run both parsers and merge, deduplicating by type+notetext
  const tableNotes  = extractNotesFromTable(pages, knownTypeCodes);
  const prefixNotes = extractNotesFromPrefixes(pages, knownTypeCodes);
  return deduplicateNotes([...tableNotes, ...prefixNotes]);
}

// Original prefix-scanner (renamed so table parser can call it)
function extractNotesFromPrefixes(pages, knownTypeCodes) {
  const results = [];

  for (const { pageNumber, text } of pages) {
    // Split page into lines for scanning
    const lines = text.split(/\s{3,}|\n/).map(l => l.trim()).filter(Boolean);

    // Find type codes present on this page (context for note attribution)
    const typesOnPage = extractTypeCodesFromText(text, knownTypeCodes);

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];

      // Try each reviewer prefix
      for (const prefixDef of REVIEWER_PREFIXES) {
        if (!prefixDef.pattern.test(line)) continue;

        // Collect note text: this line + up to 3 following lines until we hit a new type code or prefix
        let noteLines = [line];
        for (let ni = li + 1; ni < Math.min(li + 4, lines.length); ni++) {
          const nextLine = lines[ni];
          const isNewPrefix = REVIEWER_PREFIXES.some(p => p.pattern.test(nextLine));
          const isTypeCode  = knownTypeCodes && extractTypeCodesFromText(nextLine, knownTypeCodes).length > 0 && nextLine.length < 10;
          if (isNewPrefix || isTypeCode) break;
          noteLines.push(nextLine);
        }

        const noteText = noteLines.join(' ').trim();
        if (noteText.length < 5) continue;

        // Find which fixture type this note is about
        // Look backward in the page for the nearest type code before this note
        const noteStartIdx = text.indexOf(line);
        const textBefore   = noteStartIdx > 0 ? text.slice(Math.max(0, noteStartIdx - 200), noteStartIdx) : '';
        const typesBefore  = extractTypeCodesFromText(textBefore, knownTypeCodes);

        const targetTypes = typesBefore.length > 0
          ? [typesBefore[typesBefore.length - 1]] // nearest type code before this note
          : typesOnPage.length > 0
            ? typesOnPage // all types on page if can't narrow down
            : ['GENERAL'];

        const status       = parseStatus(noteText) || parseStatus(textBefore.slice(-100)) || null;
        const noteCategory = categorizeNote(noteText);

        for (const fixtureType of targetTypes) {
          results.push({
            fixtureType,
            reviewerFirm: prefixDef.firm || 'Unknown',
            reviewerRole: prefixDef.role || 'Reviewer',
            noteText,
            status: status || 'NoAction',
            pageNumber,
            noteCategory,
          });
        }
        break; // one prefix match per line
      }
    }
  }

  return deduplicateNotes(results);
}

// Remove near-duplicate notes (same type + very similar text on same page)
function deduplicateNotes(notes) {
  const seen = new Set();
  return notes.filter(n => {
    const key = `${n.fixtureType}|${n.reviewerFirm}|${n.noteText.slice(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── REPEAT DETECTION (Phase 4) ────────────────────────────────────────────────
// Compare newly extracted notes against existing open items for this project.

export function detectRepeats(newNotes, existingOpenItems) {
  return newNotes.map(note => {
    const match = existingOpenItems.find(item =>
      item.typeCode === note.fixtureType &&
      item.noteCategory === note.noteCategory &&
      !item.closedRound
    );
    return { ...note, isRepeat: !!match, previousItemId: match?.id ?? null };
  });
}
