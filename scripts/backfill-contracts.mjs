import { PrismaClient } from '@prisma/client';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const prisma      = new PrismaClient();

async function extractText(buffer) {
  const uint8 = new Uint8Array(buffer);
  const doc   = await pdfjsLib.getDocument({ data: uint8 }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(i => i.str).join(' ') + '\n';
  }
  return text.trim();
}

// ── Inline parsers (avoid ESM/generated-client issues) ─────────────────────

const MONTH_MAP = {
  january:1,february:2,march:3,april:4,may:5,june:6,
  july:7,august:8,september:9,october:10,november:11,december:12,
  jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
};
function pad(n) { return String(n).padStart(2,'0'); }
function toIso(y,m,d) { const Y=parseInt(y),M=parseInt(m),D=parseInt(d); if(!Y||!M||!D) return null; return `${Y}-${pad(M)}-${pad(D)}`; }
function parseMonth(s) { return MONTH_MAP[s.toLowerCase()]??null; }
function toSigned(sign, numStr) { const n=parseFloat(numStr.replace(/,/g,'')); return sign==='-'?-n:n; }

const VALUE_PATTERNS = [
  /contract\s+sum[^$\n]{0,80}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /total\s+contract\s+(?:amount|price|value|fee)[^$\n]{0,60}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /contract\s+(?:amount|price|value)[^$\n]{0,60}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /grand\s+total[^$]{0,30}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:order|po|purchase\s+order)\s+total[^$]{0,30}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /total\s+(?:design\s+)?fee[^$\n]{0,60}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /for\s+the\s+sum\s+of\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /sum\s+of\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /lump\s+sum\s*:?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /^total\s*:?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/im,
  /\btotal\b\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  /compensation[^$\n]{0,80}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
];

function extractValue(flat) {
  for (const p of VALUE_PATTERNS) {
    const m = flat.match(p);
    if (m) { const n=parseFloat(m[1].replace(/,/g,'')); if(n>=1000&&n<=50_000_000) return n; }
  }
  return null;
}

const MR = '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)';
const DATE_PATTERNS = [
  { re: new RegExp(`as\\s+of\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+day\\s+of\\s+(${MR})\\s*,?\\s*(\\d{4})`,'i'), fn:m=>toIso(m[3],parseMonth(m[2]),m[1]) },
  { re: new RegExp(`as\\s+of\\s+(${MR})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,\\s*(\\d{4})`,'i'), fn:m=>toIso(m[3],parseMonth(m[1]),m[2]) },
  { re: new RegExp(`dated[^,\\n]{0,30}(\\d{1,2})(?:st|nd|rd|th)?\\s+day\\s+of\\s+(${MR})\\s*,?\\s*(\\d{4})`,'i'), fn:m=>toIso(m[3],parseMonth(m[2]),m[1]) },
  { re: new RegExp(`dated[^,\\n]{0,40}(${MR})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`,'i'), fn:m=>toIso(m[3],parseMonth(m[1]),m[2]) },
  { re: new RegExp(`(?:effective|agreement|contract|execution)\\s+date\\s*:?\\s*(${MR})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`,'i'), fn:m=>toIso(m[3],parseMonth(m[1]),m[2]) },
  { re: /(?:effective\s+)?date\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i, fn:m=>toIso(m[3],m[1],m[2]) },
  { re: new RegExp(`executed\\s+(?:as\\s+of|on)\\s+(${MR})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`,'i'), fn:m=>toIso(m[3],parseMonth(m[1]),m[2]) },
  { re: /(?:date|signed|executed)\s*:?\s*(\d{4})-(\d{2})-(\d{2})/i, fn:m=>toIso(m[1],m[2],m[3]) },
  { re: new RegExp(`(${MR})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,\\s*(\\d{4})`,'i'), fn:m=>toIso(m[3],parseMonth(m[1]),m[2]), topOnly:true },
];

function parseContractFields(text) {
  if (!text || text.length < 20) return {};
  const flat = text.replace(/\r?\n/g,' ');
  const top  = flat.slice(0,3000);
  let contractValue = extractValue(flat);
  let contractSignedDate = null;
  for (const {re,fn,topOnly} of DATE_PATTERNS) {
    const m = (topOnly?top:flat).match(re);
    if (m) { const iso=fn(m); if(iso){const yr=parseInt(iso.split('-')[0]);if(yr>=2010&&yr<=2040){contractSignedDate=iso;break;}} }
  }
  return { contractValue, contractSignedDate };
}

// ILC change order format: allow negatives, handle "TOTAL SALES TAX INCREASE $X"
function parseChangeOrderAmount(text) {
  if (!text || text.length < 10) return null;
  const flat = text.replace(/\r?\n/g, ' ');

  // "TOTAL CHANGE -$X" or "TOTAL CHANGE $X"
  let m = flat.match(/\btotal\s+change\s+(-?)\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (m) return toSigned(m[1], m[2]);

  // "TOTAL -$X" or "TOTAL $X" (ILC summary line)
  m = flat.match(/\btotal\s+(-?)\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (m) return toSigned(m[1], m[2]);

  // "TOTAL [WORDS] $X", e.g. "TOTAL SALES TAX INCREASE $4,521.81"
  m = flat.match(/\btotal\s+(?:[a-zA-Z]+\s+){1,6}\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));

  // Fall back to standard contract value patterns
  return extractValue(flat);
}

function parseTags(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// ── Process files ───────────────────────────────────────────────────────────

const files = await prisma.projectFile.findMany({
  where: { tab: { in: ['contracts', 'ca'] } },
  select: { id: true, originalName: true, storedPath: true, projectId: true, tags: true, tab: true },
});

console.log(`Processing ${files.length} file(s).\n`);

for (const file of files) {
  const ext  = file.originalName.split('.').pop()?.toLowerCase();
  const tags = parseTags(file.tags);

  if (ext !== 'pdf') { console.log(`Skipping non-PDF: ${file.originalName}`); continue; }

  const fullPath = path.join(projectRoot, 'uploads', file.storedPath);
  if (!existsSync(fullPath)) { console.log(`Missing on disk: ${file.originalName}`); continue; }

  console.log(`Processing: ${file.originalName} [${tags.join(', ')}]`);
  try {
    const buffer = await readFile(fullPath);
    const text   = await extractText(buffer);

    // Always update textContent (uses known field, works with old client)
    await prisma.projectFile.update({ where: { id: file.id }, data: { textContent: text } });

    if (file.tab === 'contracts') {
      const fields     = parseContractFields(text);
      const isExecuted = tags.some(t => t.toLowerCase().includes('executed'));
      const isSOV      = tags.includes('SOV');
      const update     = {};
      if (isExecuted) {
        if (fields.contractValue      != null) update.contractValue      = fields.contractValue;
        if (fields.contractSignedDate != null) update.contractSignedDate = fields.contractSignedDate;
      } else if (isSOV) {
        if (fields.contractValue != null) update.contractValue = fields.contractValue;
      }
      if (Object.keys(update).length > 0) {
        await prisma.project.update({ where: { id: file.projectId }, data: update });
        console.log(`  → project: value=${fields.contractValue ?? '—'}  date=${fields.contractSignedDate ?? '—'}`);
      } else {
        console.log(`  → no project update (tag not Executed/SOV)`);
      }
    }

    if (file.tab === 'ca' && tags.includes('Change Order')) {
      const amount = parseChangeOrderAmount(text);
      // Use raw SQL to bypass stale Prisma generated client (parsedAmount field is new)
      await prisma.$executeRawUnsafe(
        `UPDATE "ProjectFile" SET "parsedAmount" = ? WHERE "id" = ?`,
        amount, file.id
      );
      console.log(`  → CO amount: ${amount ?? 'not found'}`);
    }

  } catch (e) {
    console.log(`  → ERROR: ${e.message}`);
  }
}

await prisma.$disconnect();
