// The CRM clean up sheet (Mike 10-28) read into rows the importer loads.
// Browser safe: no database here. The Admin page runs this for the dry run
// preview and sends the same rows to /api/admin/crm-import in small batches.
//
// Mike's rules: the sheet already applied Projects = sheet > Hive > Pipedrive and
// Companies + People = Pipedrive > Google. Left to bill is dropped; designer,
// lead designer and PM are parked. Hive "CA" = Construction. A project whose
// company is not on the Companies tab loads with no company.
import { CLIENT_TYPES } from '@/lib/utils';
import { normalizeName } from '@/lib/market-intel/normalizer.js';
import { splitName } from '@/lib/crmClient';

export const CONFIRM_WORDS = 'WIPE AND LOAD';
export const IMPORT_TAG_NOTE = 'Imported 10-28 from the CRM clean up sheet';
export const BATCH = { companies: 25, people: 50, projects: 15 };

const SHEETS = ['Companies', 'People', 'Projects'];

const TYPE_KEYS = {
  developer: 'developer', gc: 'generalContractor', ec: 'electricalContractor',
  architect: 'architect', 'interior designer': 'interiorDesigner', 'client rep': 'clientRep',
};
const SERVICE_KEYS = {
  'design assist': 'designAssist', 'peer review': 'peerReview',
  'full design': 'fullDesign', 'bid only': 'bidOnly',
};
const STATUS_KEYS = { won: 'WON', abandoned: 'ABANDONED', open: 'OPEN', 'on hold': 'ON_HOLD', lost: 'LOST' };

const s = v => String(v ?? '').trim();
const low = v => s(v).toLowerCase();
const list = v => s(v).split(/[;,]/).map(x => x.trim()).filter(Boolean);

export function money(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(s(v).replace(/[$,\s]/g, ''));
  return s(v) && Number.isFinite(n) ? n : null;
}

// "2027-04-14", or an Excel day number when the cell was typed as a date.
// Noon UTC so the day never slips across a time zone.
export function day(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30 + Math.floor(v), 12));
    return d.toISOString();
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toISOString() : null;
}

// Hive phases read like "DESIGN, PRECON/BUDGET / CA": the last stage named wins.
// Trackvia (v7) writes the bare stage: SD, DD, CD or CA.
// Anything else (PRECONSTRUCTION, blank) loads with no phase (Mike 10-28).
export function phaseOf(v) {
  let out = null;
  for (const bit of s(v).toUpperCase().split(/[/,]/).map(x => x.trim())) {
    if (bit === 'CA' || bit === 'CONSTRUCTION') out = 'construction';
    else if (bit === 'CD') out = 'cd';
    else if (bit === 'DD') out = 'dd';
    else if (bit === 'SD') out = 'sd';
  }
  return out;
}

// Broker / real estate services companies are client reps; the rest of "Other"
// has no type of its own yet, so it loads as the app default and gets flagged.
// A blank type stays blank (Mike 10-28: BC Group).
function typeOf(row) {
  if (!s(row.Type)) return { type: '', guessed: false };
  const key = TYPE_KEYS[low(row.Type)];
  if (key) return { type: key, guessed: false };
  if (/broker|real estate services/i.test(s(row['Why this type']))) return { type: 'clientRep', guessed: false };
  return { type: 'developer', guessed: true };
}

// Short words are abbreviations (LA, SLC, DC) unless they start a place name (Los Angeles, San Diego).
const PLACE_WORDS = new Set(['los', 'las', 'san', 'new', 'el', 'del', 'de']);
const titleCase = w => w.length <= 3 && !PLACE_WORDS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
export const marketName = m => s(m).split(/\s+/).map(titleCase).join(' ');

// Finds a company on the Companies tab from however a project or person wrote it.
export function companyMatcher(companies) {
  const exact = new Map(), alias = new Map(), norm = new Map();
  for (const c of companies) {
    exact.set(low(c.name), c.name);
    for (const a of c.aliases) if (!alias.has(low(a))) alias.set(low(a), c.name);
    const n = normalizeName(c.name);
    if (n && !norm.has(n)) norm.set(n, c.name);
  }
  return (raw) => {
    const name = low(raw);
    if (!name) return null;
    if (exact.has(name)) return exact.get(name);
    if (alias.has(name)) return alias.get(name);
    const n = normalizeName(raw);
    if (n && norm.has(n)) return norm.get(n);
    // "Century" for "Century Communities": only when exactly one company fits.
    const starts = companies.filter(c => low(c.name).startsWith(`${name} `) || low(c.name).replace(/^the /, '').startsWith(`${name} `));
    return starts.length === 1 ? starts[0].name : null;
  };
}

// Read the workbook with SheetJS (passed in so this file stays light).
export function readWorkbook(XLSX, data) {
  const wb = XLSX.read(data, { type: 'array' });
  const missing = SHEETS.filter(n => !wb.Sheets[n]);
  if (missing.length) return { error: `This file has no ${missing.join(', ')} tab. Upload the final CRM clean up sheet. Nothing was loaded. (CRM_IMPORT_TABS)` };
  const rows = {};
  for (const n of SHEETS) rows[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' });
  return { rows };
}

export function buildImport(rows) {
  const warnings = [];
  const companies = [];
  const seen = new Set();
  for (const r of rows.Companies) {
    const name = s(r.Company);
    if (!name || seen.has(low(name))) continue;
    seen.add(low(name));
    const { type, guessed } = typeOf(r);
    if (guessed) warnings.push(`${name}: type "${s(r.Type) || 'blank'}" loads as Developer until someone picks one`);
    companies.push({
      name, type,
      orgLabel: CLIENT_TYPES.find(t => t.value === type)?.label || null,
      aliases: list(r['Also written as']).filter(a => low(a) !== low(name)),
      domains: list(r['Email domains']).map(d => d.toLowerCase()),
      markets: list(r.Offices).map(marketName),
      owner: s(r.Owner || r['Pipedrive owner']) || null,
    });
  }
  const match = companyMatcher(companies);

  const people = [];
  const peopleNoCompany = [];
  const byNameCompany = new Map();
  for (const r of rows.People) {
    const email = low(r.Email) || null;
    const name = s(r.Name) || email;
    if (!name) continue;
    const company = match(r.Company);
    if (s(r.Company) && !company) peopleNoCompany.push(`${name} (${s(r.Company)})`);
    // Same name at the same company twice (two work emails) = one person; the
    // second row's emails go on the first as other emails.
    const same = byNameCompany.get(`${low(name)}|${low(company)}`);
    if (same) {
      const more = [email, ...list(r['Other emails']).map(e => e.toLowerCase())].filter(Boolean);
      if (!same.email && more.length) same.email = more.shift();
      for (const e of more) if (e !== same.email && !same.otherEmails.includes(e)) same.otherEmails.push(e);
      same.title ||= s(r.Title) || null;
      same.phone ||= s(r.Phone) || null;
      for (const t of list(r.Tags)) if (!same.tags.includes(t)) same.tags.push(t);
      continue;
    }
    const { firstName, lastName } = splitName(name);
    // "Office: Denver" in Labels puts the person on that branch when the company has one.
    const office = /Office:\s*([^,]+)/i.exec(s(r.Labels));
    const person = {
      key: email || `${low(name)}|${low(company)}`,
      name, firstName, lastName, email, company,
      office: office ? marketName(office[1]) : null,
      title: s(r.Title) || null,
      phone: s(r.Phone) || null,
      otherEmails: list(r['Other emails']).map(e => e.toLowerCase()).filter(e => e !== email),
      tags: list(r.Tags),
      notes: [s(r.Sources) && `${IMPORT_TAG_NOTE} (from ${s(r.Sources)})`, s(r.Labels)].filter(Boolean).join('\n') || null,
    };
    byNameCompany.set(`${low(name)}|${low(company)}`, person);
    people.push(person);
    // A person's office the Companies tab does not list yet becomes a branch.
    const co = person.office && companies.find(c => c.name === company);
    if (co && !co.markets.some(m => low(m) === low(person.office))) co.markets.push(person.office);
  }

  const projects = [];
  const projectNoCompany = [];
  for (const r of rows.Projects) {
    const name = s(r.Project);
    if (!name) continue;
    const company = match(r.Company);
    if (s(r.Company) && !company) projectNoCompany.push(`${name} (${s(r.Company)})`);
    const units = Math.round(money(r.Units) ?? 0);
    const sf = Math.round(money(r['Total SF']) ?? 0);
    projects.push({
      key: `${low(name)}|${low(company)}`,
      name, company,
      serviceType: SERVICE_KEYS[low(r['Service type'])] || null,
      procurementStatus: STATUS_KEYS[low(r['Final status'])] || 'OPEN',
      designStatus: STATUS_KEYS[low(r['Design status'])] || 'OPEN',
      contractValue: money(r['Product sales value']),
      designContractValue: money(r['Design fee']),
      totalInvoiced: money(r['QuickBooks billed to date']),
      expectedOrderDate: day(r['Expected order']),
      phase: phaseOf(r['Hive phase']),
      salesperson: s(r.Salesperson) || null,
      numUnits: units > 0 ? units : null,
      grossSf: sf > 0 ? sf : null,
      city: s(r.City) || null,
      state: s(r.State) || null,
      // "Office" puts the project on that branch of its company (Lincoln, Mike 10-28).
      office: s(r.Office) ? marketName(r.Office) : null,
    });
  }

  const count = (arr, f) => arr.reduce((m, x) => { const k = f(x) || 'blank'; m[k] = (m[k] || 0) + 1; return m; }, {});
  return {
    companies, people, projects,
    summary: {
      companies: companies.length,
      branches: companies.reduce((n, c) => n + (c.markets.length > 0 ? c.markets.length : 0), 0),
      aliases: companies.reduce((n, c) => n + c.aliases.length, 0),
      people: people.length,
      peopleWithCompany: people.filter(p => p.company).length,
      tagged: count(people.flatMap(p => p.tags.map(t => ({ t }))), x => x.t),
      projects: projects.length,
      projectsWithCompany: projects.filter(p => p.company).length,
      byStatus: count(projects, p => p.procurementStatus),
      byService: count(projects, p => p.serviceType),
      owners: [...new Set([...companies.map(c => c.owner), ...projects.map(p => p.salesperson)].filter(Boolean))],
    },
    unmatched: { projectNoCompany, peopleNoCompany },
    warnings,
  };
}

// "Mike Kershner" and "Michael Kershner" are the same login.
const NICK = { mike: 'michael', mick: 'michael' };
const firstLast = n => { const w = low(n).split(/\s+/).filter(Boolean); return [NICK[w[0]] || w[0], w[w.length - 1]]; };
export function matchUser(users, name) {
  if (!name) return null;
  const exact = users.find(u => low(u.name) === low(name));
  if (exact) return exact;
  const [f, l] = firstLast(name);
  const hits = users.filter(u => { const [uf, ul] = firstLast(u.name || ''); return uf === f && ul === l; });
  return hits.length === 1 ? hits[0] : null;
}

export function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
