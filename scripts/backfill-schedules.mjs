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

// ── Inline schedule parser (mirrors src/lib/parseSchedule.js) ──────────────

const MON_MAP = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
function pad(n) { return String(n).padStart(2,'0'); }
function toIso(y,m,d) { if(!y||!m||!d) return null; return `${y}-${pad(m)}-${pad(d)}`; }
function twoDigitYear(y) { return y < 30 ? 2000+y : 1900+y; }

function parseDMY(str) {
  const m = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return null;
  const mo = MON_MAP[m[2].toLowerCase()];
  if (!mo) return null;
  let y = parseInt(m[3]);
  if (y < 100) y = twoDigitYear(y);
  return toIso(y, mo, parseInt(m[1]));
}

function parseToken(tok) {
  tok = tok.trim().replace(/\s*A$/, '');
  let iso = parseDMY(tok); if (iso) return iso;
  const sl = tok.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (sl) { let y=parseInt(sl[3]); if(y<100) y=twoDigitYear(y); return toIso(y,parseInt(sl[1]),parseInt(sl[2])); }
  const iso_m = tok.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso_m) return toIso(parseInt(iso_m[1]),parseInt(iso_m[2]),parseInt(iso_m[3]));
  return null;
}

const TOKEN_RE = /\b\d{1,2}-[A-Za-z]{3}-\d{2,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
function datesInWindow(text) {
  const dates = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const iso = parseToken(m[0]);
    if (iso) dates.push(iso);
  }
  return dates;
}

function isYear(iso) { if(!iso) return false; const y=parseInt(iso.split('-')[0]); return y>=2015&&y<=2040; }

const WINDOW = 200;
const START_KW = [/ntp\s*\/?\s*start\s+construction/i,/\bntp\b/i,/notice\s+to\s+proceed/i,/start\s+construction/i,/commence\s+construction/i,/\bmobiliz/i,/ground\s+break/i,/begin\s+construction/i,/construction\s+start/i];
const MEP_KW   = [/start\s+mep/i,/mep\s+rough/i,/mep\s+start/i,/\bmep\b.{0,20}start/i,/electrical\s+rough/i,/mechanical\s+rough/i,/plumbing\s+rough/i];
const END_KW   = [/general\s+milestone/i,/final\s+(?:substantial\s+)?completion/i,/substantial\s+completion/i,/project\s+(?:final\s+)?completion/i,/project\s+complete/i,/overall\s+project\s+duration/i,/certificate\s+of\s+occupancy/i];

function findAllHits(flat, keywords, mode='first') {
  const candidates = [];
  for (const re of keywords) {
    const globalRe = new RegExp(re.source, re.flags.replace('g','')+'g');
    let m;
    while ((m = globalRe.exec(flat)) !== null) {
      const win = flat.slice(m.index, m.index + WINDOW);
      const dates = datesInWindow(win).filter(isYear);
      if (dates.length) candidates.push(mode==='last' ? dates[dates.length-1] : dates[0]);
    }
  }
  return candidates;
}

function parseScheduleFields(text) {
  if (!text || text.length < 20) return {};
  const flat = text.replace(/\r?\n/g, ' ');
  const startC = findAllHits(flat, START_KW, 'first');
  const mepC   = findAllHits(flat, MEP_KW, 'first');
  const endC   = findAllHits(flat, END_KW, 'last');
  const all    = datesInWindow(flat).filter(isYear);
  const earliest = a => a.filter(isYear).sort()[0]??null;
  const latest   = a => a.filter(isYear).sort().at(-1)??null;
  return {
    constructionStartDate: earliest(startC) ?? earliest(all),
    mepRoughInDate:        earliest(mepC),
    constructionEndDate:   latest(endC),
  };
}

function parseTags(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// ── Process files ───────────────────────────────────────────────────────────

const files = await prisma.projectFile.findMany({
  where: { tab: 'ca' },
  select: { id:true, originalName:true, storedPath:true, projectId:true, tags:true },
});

const scheduleFiles = files.filter(f => parseTags(f.tags).includes('Construction Schedule'));
console.log(`Found ${scheduleFiles.length} construction schedule file(s).\n`);

for (const file of scheduleFiles) {
  const ext = file.originalName.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') { console.log(`Skipping non-PDF: ${file.originalName}`); continue; }

  const fullPath = path.join(projectRoot, 'uploads', file.storedPath);
  if (!existsSync(fullPath)) { console.log(`Missing on disk: ${file.originalName}`); continue; }

  console.log(`Processing: ${file.originalName}`);
  try {
    const buffer = await readFile(fullPath);
    const text   = await extractText(buffer);

    // Also store text content
    await prisma.projectFile.update({ where: { id: file.id }, data: { textContent: text } });

    const fields = parseScheduleFields(text);
    const update = {};
    if (fields.constructionStartDate) update.constructionStartDate = fields.constructionStartDate;
    if (fields.mepRoughInDate)        update.mepRoughInDate        = fields.mepRoughInDate;
    if (fields.constructionEndDate)   update.constructionEndDate   = fields.constructionEndDate;

    if (Object.keys(update).length > 0) {
      // Use raw SQL to bypass stale Prisma generated client
      const sets = [];
      const vals = [];
      if (fields.constructionStartDate) { sets.push('"constructionStartDate" = ?'); vals.push(fields.constructionStartDate); }
      if (fields.mepRoughInDate)        { sets.push('"mepRoughInDate" = ?');        vals.push(fields.mepRoughInDate); }
      if (fields.constructionEndDate)   { sets.push('"constructionEndDate" = ?');   vals.push(fields.constructionEndDate); }
      vals.push(file.projectId);
      await prisma.$executeRawUnsafe(`UPDATE "Project" SET ${sets.join(', ')} WHERE "id" = ?`, ...vals);
      console.log(`  → start=${fields.constructionStartDate??'—'}  mep=${fields.mepRoughInDate??'—'}  end=${fields.constructionEndDate??'—'}`);
    } else {
      console.log(`  → no dates found`);
    }
  } catch (e) {
    console.log(`  → ERROR: ${e.message}`);
  }
}

await prisma.$disconnect();
