// Pure text helpers for Bot Knowledge documents.
//
// No imports on purpose: this file is the part worth unit-testing, and keeping
// it free of Prisma, pdfjs and the `@/` alias means the test runner can load it
// directly.

// What kind of file did somebody just drop on the page. Extension first,
// because browsers lie about MIME types often enough to matter — Windows sends
// .docx as application/octet-stream more often than not.
const BY_EXTENSION = {
  pdf:  'pdf',
  doc:  'word',  docx: 'word',  rtf: 'word',
  xls:  'excel', xlsx: 'excel', xlsm: 'excel', csv: 'excel',
  png:  'image', jpg: 'image',  jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image',
  txt:  'text',  md:  'text',
};

export const SUPPORTED_EXTENSIONS = Object.keys(BY_EXTENSION);

// What the file picker should advertise, and what the drop zone accepts.
export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.map(e => `.${e}`).join(',');

export function detectFileType(fileName = '', mimeType = '') {
  const ext = String(fileName).split('.').pop()?.toLowerCase() || '';
  if (BY_EXTENSION[ext]) return BY_EXTENSION[ext];

  const mime = String(mimeType).toLowerCase();
  if (mime.startsWith('image/'))                      return 'image';
  if (mime === 'application/pdf')                     return 'pdf';
  if (mime.includes('wordprocessing') || mime.includes('msword'))   return 'word';
  if (mime.includes('spreadsheet')    || mime.includes('ms-excel')) return 'excel';
  if (mime.startsWith('text/'))                       return 'text';
  return null;
}

// A human label for the type, for the UI.
export function fileTypeLabel(type) {
  return { pdf: 'PDF', word: 'Word', excel: 'Excel', image: 'Image', text: 'Text' }[type] || 'File';
}

/**
 * Flatten the XML inside a .docx into readable text.
 *
 * Word wraps every run of text in <w:t> tags, and a paragraph in <w:p>. Stripping
 * all tags blindly would run every paragraph together into one wall of text, so
 * paragraph and line breaks are turned into newlines BEFORE the rest of the tags
 * are dropped. Tabs are kept because tables in Word are tab-separated once
 * flattened, and losing them turns a schedule into gibberish.
 */
export function docxXmlToText(xml) {
  if (!xml) return '';
  return String(xml)
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')            // every remaining tag
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')             // last, or "&amp;lt;" would double-decode
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Collapse runaway whitespace without destroying paragraph structure.
export function tidyText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// A file that produced almost nothing is a failure worth reporting, not a
// success with an empty body. Scanned pages and photos of whiteboards land here.
export const MIN_USEFUL_CHARS = 25;

export function isUsefulText(text) {
  return tidyText(text).length >= MIN_USEFUL_CHARS;
}

/**
 * Split a search phrase into the words worth matching on.
 * Very short words and the obvious filler are dropped — matching "the" against
 * every document in the library ranks nothing.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'our', 'with', 'this', 'that',
  'from', 'have', 'has', 'was', 'were', 'what', 'when', 'how', 'why', 'does',
  'can', 'will', 'would', 'about', 'into', 'they', 'their', 'them', 'its',
]);

export function searchTerms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9$%.\-]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Score how well a piece of knowledge answers a query.
 *
 * Weighted by where the hit lands, because the fields are not equally telling:
 * somebody typed the keywords and the title on purpose, so a match there means
 * more than the same word appearing once in the body of a 40-page PDF.
 */
export function scoreText({ title = '', keywords = '', body = '' }, terms) {
  if (!terms.length) return 0;
  const t = title.toLowerCase();
  const k = keywords.toLowerCase();
  const b = body.toLowerCase();

  let score = 0;
  let matched = 0;
  for (const term of terms) {
    let termScore = 0;
    if (k.includes(term)) termScore += 10;
    if (t.includes(term)) termScore += 6;
    if (b.includes(term)) termScore += 2;
    if (termScore) matched += 1;
    score += termScore;
  }
  // Something matching every word beats something matching one word many times.
  if (matched === terms.length && terms.length > 1) score += 5 * terms.length;
  return score;
}

/**
 * Pull the part of a long document that is actually about the query, so the bot
 * is handed the relevant paragraph instead of the first page of a 40-page PDF.
 */
export function excerptAround(body, terms, radius = 400) {
  const text = tidyText(body);
  if (!text) return '';
  if (text.length <= radius * 2) return text;

  const lower = text.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return `${text.slice(0, radius * 2)}…`;

  const start = Math.max(0, at - radius);
  const end   = Math.min(text.length, at + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
