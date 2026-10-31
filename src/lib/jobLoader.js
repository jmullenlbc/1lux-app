// Job Loader (Mike 10-31). Brings one finished job into a project from a load
// sheet and the job's folder: files first, then the records that point at them.
// Browser safe, the page reads the sheet and the folder here; the writing is
// jobLoaderLoad.js. A loader, not an import of live work: every step skips what
// is already there, so a stopped run is finished by pressing Continue.
import { chunks, day, money } from '@/lib/crmImport';

export const FILE_WORKERS = 3;
export const STOP_AFTER_FAILS = 3;

// The order matters: RFQ lines need the Matrix, quotes need the RFQs, RFIs come
// before change orders so a change order can point at its RFI.
export const STEPS = [
  { key: 'project',        label: 'Project settings',  batch: 50 },
  { key: 'matrix',         label: 'Budget Matrix',     batch: 2000 },
  { key: 'rfqs',           label: 'RFQs',              batch: 5 },
  { key: 'quotes',         label: 'Rep quotes',        batch: 1 },
  { key: 'rfis',           label: 'RFIs',              batch: 5 },
  { key: 'changeOrders',   label: 'Change orders',     batch: 5 },
  { key: 'shipments',      label: 'Ship schedule',     batch: 10 },
  { key: 'submittalItems', label: 'Submittal items',   batch: 500 },
  { key: 'submissions',    label: 'Submittal reviews', batch: 1 },
  { key: 'budgets',        label: 'Budget ladder',     batch: 20 },
  { key: 'milestones',     label: 'Schedules',         batch: 500 },
];
export const STEP_KEYS = STEPS.map(st => st.key);

const SHEETS = [
  'Files', 'Project', 'Matrix', 'RFQs', 'RFQ lines', 'Quotes', 'Quote lines', 'RFIs', 'RFI files',
  'Change orders', 'CO lines', 'Shipments', 'Shipment lines', 'Submittal items', 'Submissions',
  'Submittal reviews', 'Budgets', 'Milestones',
];

const s = v => String(v ?? '').trim();
const num = v => money(v);
const whole = (v, or = 0) => { const n = money(v); return n == null ? or : Math.round(n); };

// One path spelled the same way whether it came off the sheet or the folder.
export function cleanPath(p) {
  return s(p).normalize('NFC').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').toLowerCase();
}
export const baseName = p => s(p).replace(/\\/g, '/').split('/').pop();

function groupBy(rows, key) {
  const out = new Map();
  for (const r of rows) {
    const k = s(r[key]);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
}

function fileRow(r) {
  return {
    action: s(r.Action).toLowerCase() === 'load' ? 'load' : 'skip',
    tab: s(r.Tab),
    tags: s(r.Tag).split(';').map(t => t.trim()).filter(Boolean),
    path: s(r.Path),
    name: baseName(r.Path),
    size: whole(r.Bytes),
    date: day(r.Date),
    source: s(r.Source).toUpperCase() === 'INTERNAL' ? 'INTERNAL' : 'EXTERNAL',
    amount: num(r.Amount),
  };
}

const matrixRow = r => ({
  row: whole(r.Row), section: s(r.Section) || 'other', typeCode: s(r.Type), description: s(r.Description),
  location: s(r.Location), qty: num(r.Qty), qtyType: s(r.QtyType) || 'Unit',
  specManufacturer: s(r['Spec Mfr']), specModel: s(r['Spec Model']),
  propManufacturer: s(r['Prop Mfr']), propModel: s(r['Prop Model']),
  propUnitDN: num(r['Prop DN']), propUnitPrice: num(r['Prop CN']),
  repName: s(r['Rep Name']), repEmail: s(r['Rep Email']),
  notes: s(r.Notes), internalNotes: s(r['Internal Notes']),
});

function rfqRows(rfqs, lines) {
  const by = groupBy(lines, 'Old RFQ');
  return rfqs.map(r => ({
    oldRfq: s(r['Old RFQ']), toName: s(r.To), sentTo: s(r['Sent To']), sentDate: day(r['Sent Date']),
    needBy: day(r['Need By']), status: s(r.Status).toUpperCase(), receivedDate: day(r['Received Date']),
    notes: s(r.Notes),
    lines: (by.get(s(r['Old RFQ'])) || []).map(l => ({
      matrixRow: whole(l['Matrix Row'], null), typeCode: s(l.Type), manufacturer: s(l.Mfr),
      partNumber: s(l.Part), qty: num(l.Qty), dnPrice: num(l['DN Price']), receivedDate: day(l['Received Date']),
    })),
  }));
}

function quoteRows(quotes, lines) {
  const by = groupBy(lines, 'File path');
  return quotes.map(q => ({
    oldRfq: s(q['Old RFQ']), path: s(q['File path']), fileName: baseName(q['File path']),
    quoteNumber: s(q['Quote number']), fromName: s(q['From name']), fromEmail: s(q['From email']),
    quoteDate: day(q['Quote date']), total: num(q.Total),
    lines: (by.get(s(q['File path'])) || []).map(l => ({
      typeTag: s(l.Type), mfr: s(l.Mfr), catalog: s(l.Catalog), description: s(l.Description),
      qty: num(l.Qty), unitPrice: num(l['Unit price']),
    })),
  }));
}

function rfiRows(rfis, files) {
  const by = groupBy(files, 'Number');
  return rfis.map(r => ({
    number: s(r.Number), subject: s(r.Subject), from: s(r.From), type: s(r.Type).toUpperCase(),
    routing: s(r.Routing).toUpperCase(), status: s(r.Status).toUpperCase(), received: day(r.Received),
    due: day(r.Due), closed: day(r.Closed), question: s(r.Question), response: s(r.Response),
    responseDate: day(r['Response date']), responseBy: s(r['Response by']),
    files: (by.get(s(r.Number)) || []).map(f => ({ path: s(f.Path), name: baseName(f.Path), type: s(f.Type).toUpperCase() })),
  }));
}

function changeOrderRows(cos, lines) {
  const by = groupBy(lines, 'Number');
  return cos.map(c => {
    const options = new Map();
    for (const l of by.get(s(c.Number)) || []) {
      const label = s(l.Option) || 'Default';
      if (!options.has(label)) options.set(label, { label, isSelected: false, lines: [] });
      const o = options.get(label);
      if (s(l.Selected).toLowerCase() === 'yes') o.isSelected = true;
      o.lines.push({
        sortOrder: whole(l.Sort), fixtureType: s(l.Type), qty: num(l.Qty) ?? 0, manufacturer: s(l.Mfr),
        partNumber: s(l.Part), description: s(l.Description), cnUnitPrice: num(l['CN Unit']) ?? 0,
        quoteReference: s(l['Quote ref']), leadTime: s(l['Lead time']), notes: s(l.Notes),
      });
    }
    return {
      number: s(c.Number), title: s(c.Title), date: day(c.Date), status: s(c.Status).toUpperCase(),
      notes: s(c.Notes), rfi: s(c.RFI), options: [...options.values()],
      discountAmount: num(c.Discount), discountPct: num(c['Discount pct']), discountNote: s(c['Discount note']),
    };
  });
}

function shipmentRows(ships, lines) {
  const by = groupBy(lines, 'Key');
  return ships.map(r => ({
    manufacturer: s(r.Manufacturer), poDate: day(r['PO date']), leadTimeWeeks: s(r['Lead time']),
    esdDate: day(r.ESD), trackingNumber: s(r.Tracking), deliveredDate: day(r.Delivered),
    destinationType: s(r.Destination).toUpperCase(), notes: s(r.Notes),
    lines: (by.get(s(r.Key)) || []).map(l => ({
      fixtureType: s(l.Type), description: s(l.Description), catalogNo: s(l.Catalog), qty: whole(l.Qty, 1),
      qtyType: s(l['Qty type']), fixtureStatus: s(l.Status), notes: s(l.Notes),
    })),
  }));
}

// One version per type within a submission, carrying whatever reviews it drew.
// A row with no Role is a version nobody reviewed.
function submissionRows(subs, reviews) {
  const by = groupBy(reviews, 'Submission');
  return subs.map(r => {
    const versions = new Map();
    for (const v of by.get(s(r.Name)) || []) {
      const key = [s(v.Type), s(v.Manufacturer), s(v.Model)].join('|').toLowerCase();
      if (!versions.has(key)) versions.set(key, { typeCode: s(v.Type), manufacturer: s(v.Manufacturer), modelNumber: s(v.Model), reviews: [] });
      if (s(v.Role)) {
        versions.get(key).reviews.push({
          reviewerRole: s(v.Role), reviewerName: s(v.Reviewer), status: s(v.Status) || 'NotReviewed',
          dateNoted: s(v.Date), notes: s(v.Notes), noteCategory: s(v.Category), pageNumber: whole(v.Page, null),
        });
      }
    }
    return { name: s(r.Name), date: s(r.Date), notes: s(r.Notes), versions: [...versions.values()] };
  });
}

// Reads the whole sheet into rows that each carry their own children, so a batch
// of parents is complete. Dates come through as text or as Excel day numbers.
export function readLoadSheet(XLSX, data) {
  const wb = XLSX.read(data, { type: 'array' });
  const missing = SHEETS.filter(n => !wb.Sheets[n]);
  if (missing.length) {
    return { error: `This file has no ${missing.join(', ')} tab. Upload the Job Loader sheet. Nothing was changed. (JOB_LOADER_SHEET)` };
  }
  const t = {};
  for (const n of SHEETS) t[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' });

  const records = {
    project: t.Project.filter(r => s(r.Field)).map(r => ({ field: s(r.Field), value: s(r.Value) })),
    matrix: t.Matrix.filter(r => s(r.Type)).map(matrixRow),
    rfqs: rfqRows(t.RFQs.filter(r => s(r['Old RFQ'])), t['RFQ lines']),
    quotes: quoteRows(t.Quotes.filter(r => s(r['File path'])), t['Quote lines']),
    rfis: rfiRows(t.RFIs.filter(r => s(r.Number)), t['RFI files']),
    changeOrders: changeOrderRows(t['Change orders'].filter(r => s(r.Number)), t['CO lines']),
    shipments: shipmentRows(t.Shipments.filter(r => s(r.Manufacturer)), t['Shipment lines']),
    submittalItems: t['Submittal items'].filter(r => s(r.Type)).map(r => ({ typeCode: s(r.Type), description: s(r.Description), location: s(r.Location) })),
    submissions: submissionRows(t.Submissions.filter(r => s(r.Name)), t['Submittal reviews']),
    budgets: t.Budgets.filter(r => s(r.Tier)).map(r => ({
      name: s(r.Name), date: day(r.Date), tier: s(r.Tier).toLowerCase(), amount: num(r.Amount), path: s(r.File), note: s(r.Note),
    })),
    milestones: t.Milestones.filter(r => s(r.Kind)).map(r => ({
      kind: s(r.Kind).toLowerCase(), id: s(r.Id), label: s(r.Label), date: day(r.Date),
    })),
  };
  return { files: t.Files.filter(r => s(r.Path)).map(fileRow), records };
}

// Every picked file by its path inside the folder. The first segment is the
// folder the person picked, which the sheet does not carry.
export function folderIndex(picked) {
  const index = new Map();
  for (const f of picked) {
    const rel = s(f.webkitRelativePath || f.name).replace(/\\/g, '/').split('/').slice(1).join('/');
    index.set(cleanPath(rel), f);
  }
  return index;
}

const fileKey = (tab, name, size) => `${tab}|${name}|${size}`.toLowerCase();

// What the app already holds on this project, by the same key the sheet makes.
function heldKeys(held) {
  const keys = new Map();
  for (const f of held.files || []) {
    keys.set(fileKey(f.tab, f.originalName, f.size), { id: f.id, url: `/api/projects/${held.projectId}/files/${f.id}` });
  }
  for (const d of held.drawings || []) {
    keys.set(fileKey('drawings', d.fileName, d.size), { id: null, url: `/api/projects/${held.projectId}/drawing-submissions/${d.submissionId}/files/${d.id}` });
  }
  return keys;
}

// The dry run. Nothing here touches the app.
export function planFiles(rows, index, held) {
  const keys = heldKeys(held);
  const plan = { toLoad: [], already: [], missing: [], changed: [], skipped: [], notOnSheet: [] };
  const onSheet = new Set();
  const sending = new Set();
  for (const row of rows) {
    onSheet.add(cleanPath(row.path));
    if (row.action !== 'load') { plan.skipped.push(row); continue; }
    const key = fileKey(row.tab, row.name, row.size);
    // The same file in two folders only goes once; both rows then point at it.
    if (keys.has(key) || sending.has(key)) { plan.already.push(row); continue; }
    const file = index.get(cleanPath(row.path));
    if (!file) plan.missing.push(row);
    else if (file.size !== row.size) plan.changed.push(row);
    else { sending.add(key); plan.toLoad.push({ ...row, file }); }
  }
  for (const [rel, file] of index) {
    if (!onSheet.has(rel)) plan.notOnSheet.push(file.webkitRelativePath || file.name);
  }
  return plan;
}

// The records point at files by their path on the sheet. Turn that into the
// app's own link now the files are in, so the folder need not be picked again.
export function fileRefs(rows, held) {
  const keys = heldKeys(held);
  const byPath = new Map(rows.map(r => [cleanPath(r.path), r]));
  return (path) => {
    const row = byPath.get(cleanPath(path));
    return row ? keys.get(fileKey(row.tab, row.name, row.size)) || null : null;
  };
}

// Puts the app's file links on one step's rows. A path that finds no file is
// reported and the record still loads.
export function withFiles(step, rows, ref) {
  const missed = [];
  const look = (path, label) => {
    if (!path) return null;
    const hit = ref(path);
    if (!hit) missed.push(`${label}: ${baseName(path)} is not in the app.`);
    return hit;
  };
  const out = rows.map((r) => {
    if (step === 'quotes') return { ...r, fileId: look(r.path, r.quoteNumber || r.fileName)?.id ?? null };
    if (step === 'budgets') return { ...r, fileId: look(r.path, r.name)?.id ?? null };
    if (step === 'rfis') {
      return { ...r, files: r.files.map(f => ({ ...f, url: look(f.path, r.number)?.url ?? null })).filter(f => f.url) };
    }
    return r;
  });
  return { rows: out, missed };
}

export function batchesFor(step, rows) {
  const size = STEPS.find(st => st.key === step)?.batch || 1;
  return chunks(rows, size);
}

export function stepCounts(records) {
  return Object.fromEntries(STEP_KEYS.map(k => [k, (records[k] || []).length]));
}
