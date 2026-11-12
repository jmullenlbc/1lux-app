/* Bluebeam Markups Summary (CSV) -> rows and counts.
 * Provisional: written to the documented Markups List export (Subject, Label, Layer, Page Label,
 * Length / Measurement, Count…). Check against a real Shift export and adjust COLS below.
 */
const COLS = {
  subject: ['subject', 'type'], label: ['label', 'symbol'], layer: ['layer'], page: ['page label', 'page', 'page index'],
  length: ['length', 'measurement', 'total length'], count: ['count', 'quantity'], comments: ['comments', 'detail']
};

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  const t = String(text).replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

/* "45'-6\"", "45' 6\"", "45.5'", "45.5 ft", "540\"", "13.87 m" -> feet */
export function parseFeet(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/,/g, '');
  if (!s) return null;
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*-?\s*(\d+(?:\.\d+)?)?\s*(?:"|in|inch(?:es)?)?$/);
  if (m) return +m[1] + (m[2] ? +m[2] / 12 : 0);
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:"|in|inch(?:es)?)$/); if (m) return +m[1] / 12;
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*m$/); if (m) return +m[1] * 3.28084;
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*mm$/); if (m) return +m[1] / 304.8;
  m = s.match(/^(-?\d+(?:\.\d+)?)$/); if (m) return +m[1];
  return null;
}

export function readMarkups(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { items: [], warnings: ['The file has no markup rows.'] };
  const head = rows[0].map(h => String(h).trim().toLowerCase());
  const col = key => { for (const name of COLS[key]) { const i = head.indexOf(name); if (i >= 0) return i; } return -1; };
  const C = Object.fromEntries(Object.keys(COLS).map(k => [k, col(k)]));
  const warnings = [];
  if (C.length < 0 && C.count < 0) warnings.push('No Length, Measurement or Count column found. Export the Markups List with those columns showing.');
  const items = [];
  for (const r of rows.slice(1)) {
    const get = k => (C[k] >= 0 ? String(r[C[k]] ?? '').trim() : '');
    const subject = get('subject'), label = get('label'), layer = get('layer');
    const lengthFt = parseFeet(get('length'));
    const cnt = parseFloat(get('count'));
    const isCount = /count/i.test(subject) || (!(lengthFt > 0) && cnt > 0);
    const group = label || layer || subject || 'Markups';
    if (lengthFt > 0 && !isCount) items.push({ kind: 'length', group, label, layer, subject, page: get('page'), lengthFt, comments: get('comments') });
    else if (cnt > 0) items.push({ kind: 'count', group, label, layer, subject, page: get('page'), count: cnt, comments: get('comments') });
  }
  if (!items.length) warnings.push('No length or count markups were found.');
  return { items, warnings, columns: head };
}

/* Group markups into areas: each group's lengths become drawn rows. */
export function markupsToRows(items) {
  const groups = new Map();
  for (const it of items) {
    if (!groups.has(it.group)) groups.set(it.group, { name: it.group, rows: [], counts: 0 });
    const g = groups.get(it.group);
    if (it.kind === 'length') g.rows.push({ id: 'bb' + Math.random().toString(36).slice(2, 8), name: `${it.group} ${g.rows.length + 1}`, lengthFt: Math.round(it.lengthFt * 10) / 10, points: null, page: it.page });
    else g.counts += it.count;
  }
  return [...groups.values()];
}
