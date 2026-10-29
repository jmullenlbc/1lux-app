// Read the three Trackvia rep exports (Mike 10-29, 0144) into one load plan.
// Browser safe and pure: the Admin > Sales Rep upload page reads the CSVs
// here, shows the plan, then posts it in batches.
//
//   Sales Reps         one row per rep, keyed by TRACKVIA SALES REP #
//   Manufacturer Reps  one row per rep + manufacturer + office ("REP - MFR")
//   Project Reps       which rep link each past job used; the most used link
//                      per manufacturer and office becomes the default
//
// Logiq and AMPS are left out entirely (Mike 10-29).

export const OFFICE_FROM_LOCATION = { DENVER: 'Denver', 'LOS ANGELES': 'Long Beach', FLORIDA: 'Florida' };
export const BATCH = { reps: 40, links: 80 };

const DROP_RE = /\b(LOGIQ|AMPS)\b/i;
export const dropped = (name) => DROP_RE.test(String(name || ''));

const t = (v) => String(v ?? '').trim();
const key = (s) => t(s).toUpperCase().replace(/\s+/g, ' ');

/** Which export a sheet is, from its headers. */
export function kindOf(headers) {
  const h = new Set(headers.map((x) => t(x).toUpperCase()));
  if (h.has('PROJECT') && h.has('SALES REP')) return 'projectReps';
  if (h.has('MANUFACTURER') && h.has('SALES REP')) return 'mfrReps';
  if (h.has('NAME') && [...h].some((x) => x.startsWith('TRACKVIA'))) return 'reps';
  return null;
}

/** Rows from a CSV, read with SheetJS so quoted commas and line breaks are handled. */
export function readCsv(XLSX, text) {
  const wb = XLSX.read(text, { type: 'string', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
}

const col = (row, name) => {
  if (name in row) return row[name];
  const want = name.toUpperCase().replace(/\s+/g, ' ');
  const k = Object.keys(row).find((x) => x.toUpperCase().replace(/\s+/g, ' ').trim() === want);
  return k ? row[k] : '';
};

/** { reps, mfrReps, projectReps } rows -> the load plan with a summary. */
export function buildRepLoad({ reps = [], mfrReps = [], projectReps = [] }) {
  const skipped = { reps: [], links: 0, noRep: [] };

  const repByName = new Map();
  const outReps = [];
  for (const r of reps) {
    const name = t(col(r, 'Name'));
    if (!name) continue;
    if (dropped(name)) { skipped.reps.push(name); continue; }
    const rep = {
      trackviaId: t(col(r, 'TRACKVIA SALES REP #')) || null,
      name,
      abbreviation: t(col(r, 'ABBREVIATION')) || null,
      mainPhone: t(col(r, 'Main Phone Number')) || null,
      secondPhone: t(col(r, 'Secondary Phone Number')) || null,
      street: t(col(r, 'STREET ADDRESS')) || null,
      city: t(col(r, 'CITY')) || null,
      state: t(col(r, 'STATE')) || null,
      zip: t(col(r, 'ZIP CODE')) || null,
      notes: t(col(r, 'Notes')) || null,
      quotes: t(col(r, 'EMAILS FOR QUOTES')),
      orders: t(col(r, 'EMAILS FOR ORDERS')),
    };
    outReps.push(rep);
    if (!repByName.has(key(name))) repByName.set(key(name), rep);
  }

  // How many past jobs used each link, per manufacturer and office.
  const used = new Map();
  for (const p of projectReps) {
    const link = key(col(p, 'SALES REP'));
    if (!link || link === '-' || link.startsWith('TBD')) continue;
    const office = OFFICE_FROM_LOCATION[key(col(p, 'LOCATION'))] || '';
    const k = `${link}|${office}`;
    used.set(k, (used.get(k) || 0) + 1);
  }

  const links = [];
  for (const m of mfrReps) {
    const manufacturer = t(col(m, 'MANUFACTURER'));
    const repName = t(col(m, 'SALES REP'));
    if (!manufacturer || !repName) continue;
    if (dropped(manufacturer) || dropped(repName)) { skipped.links += 1; continue; }
    const rep = repByName.get(key(repName));
    if (!rep) { skipped.noRep.push(`${repName} - ${manufacturer}`); continue; }
    const office = OFFICE_FROM_LOCATION[key(col(m, 'LOCATION'))] || '';
    const recordId = key(col(m, 'Record ID')) || key(`${repName} - ${manufacturer}`);
    links.push({
      trackviaId: rep.trackviaId, repName: rep.name, manufacturer, office,
      notes: t(col(m, 'Notes')) || null,
      active: key(col(m, 'INACTIVE')) !== 'YES',
      jobs: used.get(`${recordId}|${office}`) || 0,
      isDefault: false,
    });
  }

  // Default per manufacturer and office: the active link used on the most
  // jobs. A tie at the top is left for a person to settle on the rep page.
  const ties = [];
  const groups = new Map();
  for (const l of links) {
    if (!l.active) continue;
    const g = `${key(l.manufacturer)}|${l.office}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(l);
  }
  for (const list of groups.values()) {
    if (list.length === 1) { list[0].isDefault = true; continue; }
    const top = Math.max(...list.map((l) => l.jobs));
    const best = list.filter((l) => l.jobs === top);
    if (top > 0 && best.length === 1) best[0].isDefault = true;
    else ties.push(`${list[0].manufacturer} (${list[0].office || 'any office'}): ${best.map((l) => l.repName).join(', ')}`);
  }

  const manufacturers = [...new Set(links.map((l) => l.manufacturer))];
  return {
    reps: outReps,
    links,
    summary: {
      reps: outReps.length,
      links: links.length,
      inactiveLinks: links.filter((l) => !l.active).length,
      defaults: links.filter((l) => l.isDefault).length,
      manufacturers: manufacturers.length,
      ties,
      skipped,
    },
  };
}

export function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
