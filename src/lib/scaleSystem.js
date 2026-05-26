/**
 * ILC Studios — Scale System
 * Addendum to SYMBOL_LIBRARY_AND_DRAWING_TOOLS.md
 *
 * Symbols are defined in real-world inches and converted to canvas pixels via:
 *   toPixels(realWorldInches, scaleRatio, pdfRenderScale)
 *
 * Note on DPI: PDFs use 72dpi internally. pdfjs renders at pdfRenderScale CSS
 * pixels per PDF point. So effective canvas DPI = 72 × pdfRenderScale.
 * We use PDF_DPI = 72 (not screen 96dpi) because the overlay sits on a PDF canvas.
 */

export const PDF_DPI          = 72;   // PDF coordinate system DPI
export const PDF_RENDER_SCALE = 1.5;  // pdfjs viewport scale (matches DrawingMarkupModal)
export const DEFAULT_SCALE    = 1 / 48; // 1/4" = 1'-0"
export const CONTROLS_FIXED_PX = 20;   // fixed px for non-physical controls symbols

// ── Scale presets (30 total) ─────────────────────────────────────────────────
export const SCALE_PRESETS = [
  // PRIMARY — ~80% of ILC projects
  { label: '1/4" = 1\'−0"',    ratio: 1 / 48,   category: 'primary',     note: 'Residential floor plans' },
  { label: '1/8" = 1\'−0"',    ratio: 1 / 96,   category: 'primary',     note: 'Commercial / large multifamily' },
  // COMMON — enlarged plans and unit plans
  { label: '1/2" = 1\'−0"',    ratio: 1 / 24,   category: 'common',      note: 'Unit plans, enlarged plans' },
  { label: '3/16" = 1\'−0"',   ratio: 1 / 64,   category: 'common',      note: 'Mid-size commercial' },
  { label: '3/32" = 1\'−0"',   ratio: 1 / 128,  category: 'common',      note: 'Large floor plans, site' },
  { label: '3/4" = 1\'−0"',    ratio: 1 / 16,   category: 'common',      note: 'Enlarged details' },
  { label: '1" = 1\'−0"',      ratio: 1 / 12,   category: 'common',      note: 'Large details' },
  { label: '1-1/2" = 1\'−0"',  ratio: 1 / 8,    category: 'common',      note: 'Close-up details' },
  { label: '3" = 1\'−0"',      ratio: 1 / 4,    category: 'common',      note: 'Door/window details' },
  { label: '1/16" = 1\'−0"',   ratio: 1 / 192,  category: 'common',      note: 'Site plans, overall' },
  // ENGINEERING / CIVIL
  { label: '1" = 10\'−0"',     ratio: 1 / 120,  category: 'civil',       note: 'Civil / site' },
  { label: '1" = 20\'−0"',     ratio: 1 / 240,  category: 'civil',       note: 'Civil / site' },
  { label: '1" = 30\'−0"',     ratio: 1 / 360,  category: 'civil',       note: 'Civil / site' },
  { label: '1" = 40\'−0"',     ratio: 1 / 480,  category: 'civil',       note: 'Civil / site' },
  { label: '1" = 50\'−0"',     ratio: 1 / 600,  category: 'civil',       note: 'Civil / site' },
  { label: '1" = 60\'−0"',     ratio: 1 / 720,  category: 'civil',       note: 'Civil / site' },
  { label: '1" = 100\'−0"',    ratio: 1 / 1200, category: 'civil',       note: 'Civil / site' },
  // DETAILS
  { label: '6" = 1\'−0"',      ratio: 1 / 2,    category: 'detail',      note: 'Full-size details' },
  { label: 'Full Size',         ratio: 1,         category: 'detail',      note: '1:1' },
  // METRIC
  { label: '1:10',              ratio: 1 / 10,   category: 'metric',      note: 'Metric detail' },
  { label: '1:20',              ratio: 1 / 20,   category: 'metric',      note: 'Metric interior' },
  { label: '1:25',              ratio: 1 / 25,   category: 'metric',      note: 'Metric floor plan' },
  { label: '1:50',              ratio: 1 / 50,   category: 'metric',      note: 'Metric floor plan' },
  { label: '1:100',             ratio: 1 / 100,  category: 'metric',      note: 'Metric site/elevation' },
  { label: '1:200',             ratio: 1 / 200,  category: 'metric',      note: 'Metric site plan' },
  { label: '1:500',             ratio: 1 / 500,  category: 'metric',      note: 'Metric location plan' },
  { label: '1:1000',            ratio: 1 / 1000, category: 'metric',      note: 'Metric key plan' },
  // CUSTOM
  { label: 'Custom…',           ratio: null,      category: 'custom',      note: 'Manual calibration' },
];

export const SCALE_PRESET_CATEGORIES = [
  { id: 'primary', label: 'Primary' },
  { id: 'common',  label: 'Common'  },
  { id: 'civil',   label: 'Engineering / Civil' },
  { id: 'detail',  label: 'Details' },
  { id: 'metric',  label: 'Metric'  },
  { id: 'custom',  label: 'Custom'  },
];

// ── Pixel conversion ──────────────────────────────────────────────────────────
/**
 * Convert a real-world dimension (inches) to canvas pixels.
 * @param {number} realWorldInches   - dimension in inches
 * @param {number} scaleRatio        - from SCALE_PRESETS (e.g. 1/48 for 1/4"=1')
 * @param {number} pdfRenderScale    - pdfjs viewport scale (default 1.5)
 * @returns {number} canvas pixels
 */
export function toPixels(realWorldInches, scaleRatio, pdfRenderScale = PDF_RENDER_SCALE) {
  return realWorldInches * scaleRatio * PDF_DPI * pdfRenderScale;
}

/**
 * Convert canvas pixels back to real-world inches.
 */
export function toRealWorld(pixels, scaleRatio, pdfRenderScale = PDF_RENDER_SCALE) {
  return pixels / (scaleRatio * PDF_DPI * pdfRenderScale);
}

// ── Dimension formatting ──────────────────────────────────────────────────────
/**
 * Format an inch value as feet-inches (e.g. 14.5 → "1'−2½"").
 * Rounds to nearest 1/8".
 */
export function formatDimension(inches) {
  if (!isFinite(inches) || inches < 0) return '—';
  const totalEighths = Math.round(inches * 8);
  const feet         = Math.floor(totalEighths / 96);        // 96 eighths per foot
  const remEighths   = totalEighths % 96;
  const wholeInches  = Math.floor(remEighths / 8);
  const fracEighths  = remEighths % 8;

  const fracs = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
  const fracStr = fracs[fracEighths] || '';

  const inchStr = (wholeInches || fracStr)
    ? `${wholeInches}${fracStr}"`
    : '0"';

  if (feet === 0)          return inchStr;
  if (!wholeInches && !fracStr) return `${feet}'−0"`;
  return `${feet}'−${inchStr}`;
}

// ── AI scale detection → preset matching ─────────────────────────────────────
/**
 * Map an AI-detected scale string to a SCALE_PRESETS entry.
 * Handles common variations: "1/4" = 1'-0"", "1:48", "0.25"=1'", "1/8\"=1\'"
 * Returns { preset, confidence: 'high'|'low'|'none' }
 */
export function matchScalePreset(aiString) {
  if (!aiString) return { preset: null, confidence: 'none' };

  const raw = aiString.trim().toLowerCase();

  // Try ratio notation: "1:48", "1:96", "1 : 48"
  const ratioMatch = raw.match(/1\s*:\s*(\d+(?:\.\d+)?)/);
  if (ratioMatch) {
    const r = 1 / parseFloat(ratioMatch[1]);
    const preset = findClosestPreset(r);
    return { preset, confidence: preset ? 'high' : 'low' };
  }

  // Try architectural: "1/4" = 1'-0"", "3/16" = 1'"
  const archMatch = raw.match(/(\d+)\/(\d+)\s*["'′]?\s*=\s*1\s*[-'′]/);
  if (archMatch) {
    const r = parseFloat(archMatch[1]) / parseFloat(archMatch[2]) / 12;
    const preset = findClosestPreset(r);
    return { preset, confidence: preset ? 'high' : 'low' };
  }

  // Try decimal: "0.25" = 1'"
  const decMatch = raw.match(/([\d.]+)\s*["'′]\s*=\s*1\s*[-'′]/);
  if (decMatch) {
    const r = parseFloat(decMatch[1]) / 12;
    const preset = findClosestPreset(r);
    return { preset, confidence: preset ? 'high' : 'low' };
  }

  return { preset: null, confidence: 'none' };
}

function findClosestPreset(ratio) {
  if (!ratio || !isFinite(ratio)) return null;
  for (const p of SCALE_PRESETS) {
    if (p.ratio && Math.abs(p.ratio - ratio) / ratio < 0.02) return p; // within 2%
  }
  return null;
}

// ── Convenience: get preset by ratio ─────────────────────────────────────────
export function presetFromRatio(ratio) {
  if (!ratio) return SCALE_PRESETS[0]; // default 1/4"
  return SCALE_PRESETS.find(p => p.ratio && Math.abs(p.ratio - ratio) / ratio < 0.001)
    || { label: `Custom 1:${Math.round(1 / ratio)}`, ratio, category: 'custom' };
}
