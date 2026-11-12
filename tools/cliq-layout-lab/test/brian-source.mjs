const S={settings:{}, catalog:[]}; const r2=n=>Math.round((+n+Number.EPSILON)*100)/100; const int=n=>String(Math.round(n)); const pad3=n=>String(n).padStart(3,'0'); const lbl=(l,k)=>(l.find(([v])=>String(v)===String(k))||[,k])[1];
const PRICE_DEFAULT = { fx24_12: 75, fx24_24: 85, fx48_24: 125, fx48_48: 145, tgrid: 5, cri90: 10, lens24: 15, lens48: 30, os: 40, fs5: 55, enc1: 375, enc2: 575, enc5: 725, enc10: 1350, encEM: 1150, plug: 25, cabBase: 6, cabPerFt: 2, cab25: 40, cab50: 80, cab100: 160, chanPerFt: 1 };
const PRICE_LABELS = [['fx24_12', '24" 12W fixture'], ['fx24_24', '24" 24W fixture'], ['fx48_24', '48" 24W fixture'], ['fx48_48', '48" 48W fixture'], ['tgrid', 'T-Grid mount adder'], ['cri90', '90 CRI adder'], ['lens24', 'Non-wide optic adder, 24"'], ['lens48', 'Non-wide optic adder, 48"'], ['os', 'Occupancy sensor adder'], ['fs5', 'Field-selectable 5CCT adder'], ['enc1', '1CH 120W enclosure'], ['enc2', '2CH 240W enclosure'], ['enc5', '5CH 480W enclosure'], ['enc10', '10CH 960W enclosure'], ['encEM', 'EM enclosure (4CH 400W)'], ['plug', 'Plug input adder (vs flying leads)'], ['cabBase', 'Cable 1–10′: base'], ['cabPerFt', 'Cable 1–10′: per foot'], ['cab25', '25′ cable'], ['cab50', '50′ cable'], ['cab100', '100′ cable'], ['chanPerFt', 'Channel cover, per foot']];
const SO_FORMS = [[319, 'SFT_Sales Order Lot'], [337, 'SFT_Ship Schedule']];
const FORMS = [[315, 'SFT_Quote Line'], [316, 'SFT_Quote Lot']];
const TERMS_FALLBACK = [[9, 'PIA (Payment in Advance)'], [10, 'CBS (Cash Before Shipment)'], [2, 'Net 30'], [28, 'Net 45'], [19, '50% Deposit / Net 30']];
const FREIGHT = [[1, 'Included'], [2, 'Not Included'], [3, 'Freight Allowed (FFA)'], [5, 'Partial FFA'], [6, 'Plus Freight']];
const QSTATUS = [[10, 'Quote (Prospect)'], [19, 'Quote (Customer)'], [18, 'Proposal (Customer Won)'], [13, 'Closed Won'], [14, 'Closed Lost'], [24, 'Closed Customer Change']];
const PM_FALLBACK = [[80, 'Andrew Robbins'], [14, 'Justin Streeb'], [83487, 'Phil Girard']];
const REP_FALLBACK = [[93, 'ALR (Associated Lighting Reps, Inc)'], [15, 'Admin (No Rep)']];
/* configuration vocab */
const MOUNTS = [['U', 'Strut channel'], ['S', 'Surface'], ['G', 'Structural grid']];
const MOUNT_FIX = { U: ['U', 'US', 'UA'], S: ['S', 'G/S'], G: ['G', 'G/S'] };
const MOUNT_ENC = { U: ['U'], S: ['S', 'G/S'], G: ['G/S', 'G'] };
const MOUNT_SKU = { U: 'U', S: 'S', G: 'G' };
const ENC_SKU_MOUNT = { U: 'U', S: 'G/S', G: 'G/S' };
const OPTICS = [['W', 'Wide'], ['S', 'Symmetric'], ['A', 'Asymmetric'], ['B', 'Batwing'], ['N', 'Narrow'], ['F', 'Flat diffuse']];
const CCTS = [['35', '3500K'], ['40', '4000K'], ['50', '5000K']];
const CRIS = [['8', '80 CRI'], ['9', '90 CRI']];
const FASCIAS = [['BK', 'Black'], ['WH', 'White']];
const COVER_FINISH = [['GR', 'Standard gray'], ['BK', 'Black'], ['WH', 'White']];
const INPUTS = [['WIRE', 'Flying leads'], ['515P', '5-15P (15A 120V)'], ['520P', '5-20P (20A 120V)'], ['615P', '6-15P (15A 240V)'], ['620P', '6-20P (20A 240V)'], ['730P', '7-30P (30A 277V)']];
const WATTS_BY_LEN = { '24': [12, 24], '48': [24, 48] };
const LUMENS = { 12: 2017, 24: 4034, 48: 8068 }; /* Rev 08-26, Wide optic */
const STD_CABLE_FT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 25, 50, 100];
const P=()=>({...PRICE_DEFAULT});
/* ============================== CLIQ nomenclature + DN price sheet ============================== */
function parseSku(sku) {
  const s = String(sku || '').toUpperCase().trim();
  let m = s.match(/^CLIQ-(G\/S|G|S|U|UA|US|T9|T15)-(24|48)-(\d+)W-([89])(\d{2}|5C)-([A-Z]{1,2})(?:-(OS|FS5))?-(BK|WH|\*\*)(-L)?$/);
  if (m) return { kind: 'fixture', mount: m[1], len: m[2], watts: +m[3], cri: m[4], cct: m[5], optic: m[6], os: m[7] === 'OS', fs5: m[7] === 'FS5' || m[5] === '5C', fascia: m[8], legacy: !!m[9] };
  m = s.match(/^CLIQ-ENC-(G\/S|G|S|U|T)-(\d+)CH-(\d+)W?-(WIRE|\d{3}P)(-EM)?(?:-(WH|BK))?(-L)?$/);
  if (m) return { kind: 'enc', mount: m[1], ch: +m[2], watts: +m[3], input: m[4], em: !!m[5], color: m[6] || '', legacy: !!m[7] };
  m = s.match(/^CLIQ-(P-)?(CABLE|EXT)-(\d{1,3})(-L)?$/);
  if (m) { const n = +m[3]; const ft = m[3].length === 3 ? n : (n >= 12 ? n / 12 : n); return { kind: m[2] === 'EXT' ? 'ext' : 'cable', plenum: !!m[1], ft, legacy: !!m[4], oldStyle: m[3].length !== 3 }; }
  m = s.match(/^CLIQ-OS-(BK|WH)$/);
  if (m) return { kind: 'sensor', fascia: m[1] };
  m = s.match(/^CLIQ-CHANNEL-(\d{3})(?:-(BK|WH|GR|\*\*))?$/);
  if (m) return { kind: 'cover', ft: +m[1], finish: m[2] === '**' ? 'CUSTOM' : (m[2] || 'GR') };
  return null;
}
function sheetDN(p) {
  if (!p || p.legacy) return null;
  const T = P();
  if (p.kind === 'fixture') {
    const base = T[`fx${p.len}_${p.watts}`]; if (base == null) return null;
    let v = +base;
    if (p.mount === 'T9' || p.mount === 'T15') v += +T.tgrid;
    if (p.cri === '9') v += +T.cri90;
    if (p.optic !== 'W') v += +(p.len === '24' ? T.lens24 : T.lens48);
    if (p.os) v += +T.os;
    if (p.fs5) v += +T.fs5;
    return r2(v);
  }
  if (p.kind === 'enc') {
    let base = null;
    if (p.em) base = (p.ch >= 4 && p.ch <= 5) ? T.encEM : null;
    else base = { 1: T.enc1, 2: T.enc2, 5: T.enc5, 10: T.enc10 }[p.ch] ?? null;
    if (base == null) return null;
    return r2(+base + (p.input !== 'WIRE' ? +T.plug : 0));
  }
  if (p.kind === 'cable' || p.kind === 'ext') {
    if (p.ft >= 1 && p.ft <= 10 && Number.isInteger(p.ft)) return r2(+T.cabBase + +T.cabPerFt * p.ft);
    if (p.ft === 25) return +T.cab25; if (p.ft === 50) return +T.cab50; if (p.ft === 100) return +T.cab100;
    return null;
  }
  if (p.kind === 'cover') return p.finish === 'CUSTOM' ? null : r2(p.ft * +T.chanPerFt);
  return null;
}
function dnOf(it) {
  const s = sheetDN(it.p || parseSku(it.sku));
  if (s != null) return { dn: s, src: 'DN sheet' };
  if (it.nsdn > 0) return { dn: r2(it.nsdn), src: 'NetSuite D/N' };
  if (it.nsbase > 0) return { dn: r2(it.nsbase), src: 'NetSuite base' };
  return { dn: null, src: 'No price' };
}
function costOf(it) {
  if (it.landed > 0) return { cost: r2(it.landed), src: 'Item cost' };
  if (it.avgcost > 0) return { cost: r2(it.avgcost), src: 'Avg cost' };
  if (it.vcost > 0) return { cost: r2(it.vcost), src: 'Vendor price' };
  return { cost: null, src: 'No cost' };
}
const kindOf = it => (it.p?.kind) || (/OS-|SENSOR/i.test(it.sku) ? 'sensor' : 'other');
const KIND_LABEL = { fixture: 'Fixture', enc: 'Power enclosure', cable: 'Cable', ext: 'Extender', cover: 'Channel cover', sensor: 'Sensor', e2e: 'Connector', other: 'Accessory' };
function fixtureSku(c) { return `CLIQ-${MOUNT_SKU[c.mount] || c.mount}-${c.len}-${c.watts}W-${c.cri}${c.cct}-${c.optic}${c.os ? '-OS' : ''}-${c.fascia}`; }
function fixtureName(c) { return `CLIQ ${c.len}" ${c.watts}W · ${lbl(CRIS, c.cri)} · ${lbl(CCTS, c.cct)} · ${lbl(OPTICS, c.optic)} · ${lbl(MOUNTS, c.mount)} · ${lbl(FASCIAS, c.fascia)}${c.os ? ' · Occupancy sensor' : ''}`; }
function findFixture(c) {
  const cat = S.catalog || [];
  const hits = cat.filter(it => it.p?.kind === 'fixture' && it.p.len === c.len && it.p.watts === +c.watts && it.p.cri === c.cri && it.p.cct === c.cct && it.p.optic === c.optic && it.p.os === !!c.os && it.p.fascia === c.fascia && (MOUNT_FIX[c.mount] || [c.mount]).includes(it.p.mount));
  const order = MOUNT_FIX[c.mount] || [];
  hits.sort((a, b) => (b.onhand > 0) - (a.onhand > 0) || order.indexOf(a.p.mount) - order.indexOf(b.p.mount) || b.onhand - a.onhand);
  return hits[0] || null;
}
function cfgFromItem(it, base = {}) { const p = it.p; return { ...base, len: p.len, watts: p.watts, cri: p.cri, cct: p.cct, optic: p.optic, os: p.os, fascia: p.fascia === '**' ? (base.fascia || 'BK') : p.fascia, mount: p.mount.startsWith('U') ? 'U' : p.mount === 'G' ? 'G' : (base.mount === 'G' && p.mount === 'G/S' ? 'G' : 'S') }; }
const MOUNT_OF = m => m.startsWith('U') ? 'U' : m === 'G' ? 'G' : m === 'S' ? 'S' : 'GS';
/* In-stock fixtures, closest to the requested configuration first. Requested mounting is kept. */
function stockFixtures(c, need = 0, n = 4) {
  const okM = MOUNT_FIX[c.mount] || [];
  const score = it => (it.p.len === c.len) * 8 + (it.p.watts === +c.watts) * 6 + (it.p.optic === c.optic) * 4 + (it.p.cct === c.cct) * 3 + (it.p.cri === c.cri) * 2 + (it.p.fascia === c.fascia) * 2 + (it.p.os === !!c.os) * 2;
  return (S.catalog || []).filter(it => it.p?.kind === 'fixture' && it.onhand > 0 && okM.includes(it.p.mount) && it.p.fascia !== '**').map(it => [(need && it.onhand >= need ? 100 : 0) + score(it), it]).sort((a, b) => b[0] - a[0] || b[1].onhand - a[1].onhand).slice(0, n).map(x => x[1]);
}
function nearFixtures(c, n = 4) {
  const cat = (S.catalog || []).filter(it => it.p?.kind === 'fixture');
  const score = it => (it.p.len === c.len) * 8 + (it.p.watts === +c.watts) * 6 + ((MOUNT_FIX[c.mount] || []).includes(it.p.mount)) * 5 + (it.p.optic === c.optic) * 4 + (it.p.cct === c.cct) * 3 + (it.p.cri === c.cri) * 2 + (it.p.fascia === c.fascia) * 2 + (it.p.os === !!c.os) * 2 + (it.onhand > 0);
  return cat.map(it => [score(it), it]).sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
}
function findEnc(mount, ch, watts, input, em) {
  const cat = S.catalog || []; const okM = MOUNT_ENC[mount] || [mount];
  const hits = cat.filter(it => it.p?.kind === 'enc' && it.p.ch === ch && it.p.watts === watts && it.p.input === input && it.p.em === em && okM.includes(it.p.mount));
  hits.sort((a, b) => (b.onhand > 0) - (a.onhand > 0) || (a.p.color ? 1 : 0) - (b.p.color ? 1 : 0) || okM.indexOf(a.p.mount) - okM.indexOf(b.p.mount) || b.onhand - a.onhand);
  return hits[0] || null;
}
function findCable(kind, plenum, ft) {
  const cat = S.catalog || [];
  const hits = cat.filter(it => it.p?.kind === kind && it.p.plenum === !!plenum && it.p.ft === ft);
  hits.sort((a, b) => (b.onhand > 0) - (a.onhand > 0) || (a.p.oldStyle ? 1 : 0) - (b.p.oldStyle ? 1 : 0) || b.onhand - a.onhand);
  return hits[0] || null;
}
function findCover(ft, finish) {
  const hits = (S.catalog || []).filter(it => it.p?.kind === 'cover' && it.p.ft === ft && it.p.finish === finish);
  hits.sort((a, b) => (b.onhand > 0) - (a.onhand > 0) || (/-GR$/i.test(a.sku) ? 1 : 0) - (/-GR$/i.test(b.sku) ? 1 : 0) || b.onhand - a.onhand);
  return hits[0] || null;
}
/* Pieces to cover one gap of open strut: gray comes in 1-4 ft, black/white only in 2 ft (field-cuttable). */
function coverPieces(gapFt, finish) {
  const G = Math.ceil(+gapFt - 1e-9); if (!(G > 0)) return [];
  if (finish !== 'GR') return Array(Math.ceil(G / 2)).fill(2);
  const out = Array(Math.floor(G / 4)).fill(4); if (G % 4) out.push(G % 4); return out;
}
function findSensor(fascia) { return (S.catalog || []).find(it => it.p?.kind === 'sensor' && it.p.fascia === fascia) || null; }

/* ============================== takeoff engine (ported from the Replit CLIQ takeoff) ============================== */
function defaultCfg(extra = {}) {
  const s = S.settings;
  return { len: '48', watts: 24, cri: '8', cct: '40', optic: 'W', mount: s.mount || 'U', fascia: 'BK', os: false, input: s.input || 'WIRE', plenum: false, separate: false, coverFinish: 'GR', ...extra };
}
function newRun(i, extra = {}) { const s = S.settings; return { id: uid(), name: `Run ${i}`, fixtures: 12, continuity: 'spaced', gapFt: +s.gapFt || 8, jumperFt: +s.jumperFt || 10, leaderFt: +s.leaderFt || 50, em: false, ...extra }; }
function chooseCableFt(need) { return STD_CABLE_FT.find(f => f >= need) ?? null; }
function runTakeoff(cfg, runs) {
  const s = S.settings, warnings = [], assumptions = [], notes = [];
  const W = +cfg.watts; const validW = (WATTS_BY_LEN[cfg.len] || []).includes(W);
  if (!validW) warnings.push(`${cfg.len}" fixtures come in ${(WATTS_BY_LEN[cfg.len] || []).join('W or ')}W. Pick one of those.`);
  const budget = +s.channelWatts || 96;
  const loadCap = validW ? Math.floor(budget / W) : 0;
  const cap = Math.max(1, Math.min(+s.maxPerChannel || 8, loadCap || 1));
  if (validW && loadCap < (+s.maxPerChannel || 8)) assumptions.push(`${W}W fixtures: up to ${cap} per channel (${budget}W per-channel share).`);
  const R = (runs || []).filter(r => (+r.fixtures || 0) > 0);
  if (!R.length) warnings.push('Add at least one run with fixtures.');
  /* channels */
  const channels = [];
  for (const r of R) {
    const n = Math.round(+r.fixtures); const k = Math.ceil(n / cap);
    const base = Math.floor(n / k), extra = n % k; let start = 1;
    for (let j = 0; j < k; j++) { const c = base + (j < extra ? 1 : 0); channels.push({ run: r, runName: r.name || 'Run', start, end: start + c - 1, n: c, watts: c * W }); start += c; }
    if (k > 1) assumptions.push(`${r.name || 'Run'}: ${n} fixtures split into ${k} channels of ${base}${extra ? '–' + (base + 1) : ''}.`);
  }
  /* enclosures */
  const encs = [];
  const groupsOf = list => { if (!cfg.separate) return [list]; const m = new Map(); for (const c of list) { if (!m.has(c.run.id)) m.set(c.run.id, []); m.get(c.run.id).push(c); } return [...m.values()]; };
  for (const grp of groupsOf(channels.filter(c => !c.run.em))) {
    let i = 0;
    while (i < grp.length) {
      const rem = grp.length - i; const ch = rem >= 3 ? 5 : rem === 2 ? 2 : 1; const watts = { 5: 480, 2: 240, 1: 120 }[ch];
      const take = grp.slice(i, i + Math.min(ch, rem)); i += take.length;
      encs.push({ ch, watts, em: false, chans: take });
      if (ch > take.length) assumptions.push(`One 5CH enclosure leaves ${ch - take.length} output${ch - take.length > 1 ? 's' : ''} open.`);
    }
  }
  for (const grp of groupsOf(channels.filter(c => c.run.em))) {
    let i = 0;
    while (i < grp.length) { const take = grp.slice(i, i + 4); i += take.length; encs.push({ ch: 4, watts: 400, em: true, chans: take }); }
  }
  for (const e of encs) {
    const per = e.em ? 100 : e.watts / e.ch;
    if (e.chans.some(c => c.watts > per)) warnings.push(`A channel exceeds the ${per}W per-channel share of a ${e.ch}CH enclosure.`);
    e.load = e.chans.reduce((a, c) => a + c.watts, 0);
  }
  encs.forEach((e, k) => { e.no = k + 1; e.chans.forEach((c, j) => { c.enc = e.no; c.out = j + 1; }); });
  /* BOM */
  const rows = new Map();
  const add = (key, row, qty) => { const r = rows.get(key); if (r) r.qty += qty; else rows.set(key, { ...row, qty }); };
  const total = R.reduce((a, r) => a + Math.round(+r.fixtures), 0);
  const fx = { ...cfg, watts: W }; const fsku = fixtureSku(fx); const fitem = findFixture(fx);
  if (total > 0) add('fx', { kind: 'fixture', sku: fitem?.sku || fsku, item: fitem, want: fsku, descr: fitem?.descr || fixtureName(fx) }, total);
  if (!fitem && total) warnings.push(`${fsku} isn’t set up in NetSuite yet. Create the item, or pick a configuration that exists.`);
  for (const e of encs) {
    const it = findEnc(cfg.mount, e.ch, e.watts, cfg.input, e.em);
    const want = `CLIQ-ENC-${ENC_SKU_MOUNT[cfg.mount]}-${e.ch}CH-${e.watts}W-${cfg.input}${e.em ? '-EM' : ''}`;
    e.sku = it?.sku || want;
    add('enc-' + want, { kind: 'enc', sku: e.sku, item: it, want, descr: it?.descr || `CLIQ power supply enclosure, ${lbl(MOUNTS, cfg.mount)}, ${e.ch} channel, ${e.watts}W${e.em ? ', EM battery' : ''}, ${lbl(INPUTS, cfg.input)}` }, 1);
    if (!it) warnings.push(`${want} isn’t set up in NetSuite yet.`);
  }
  const cab = (kind, need, why) => {
    let ft = chooseCableFt(need);
    if (ft == null) { warnings.push(`${need}′ is longer than any standard cable. Price a custom length.`); add('custom-' + need, { kind: 'cable', sku: `CLIQ-${cfg.plenum ? 'P-' : ''}CABLE-CUSTOM-${need}FT`, item: null, want: `Custom ${need}′ cable`, descr: `Custom-length ${cfg.plenum ? 'plenum ' : ''}cable, ${need}′ (${why})`, custom: true }, 1); return null; }
    let it = findCable(kind, cfg.plenum, ft);
    if (!(it?.onhand > 0)) { const alt = STD_CABLE_FT.filter(f => f > ft && f <= Math.max(2 * need, need + 5)).map(f => [f, findCable(kind, cfg.plenum, f)]).find(([, x]) => x?.onhand > 0); if (alt) { swaps.set(`CLIQ-${cfg.plenum ? 'P-' : ''}CABLE-${pad3(ft)}`, alt[1].sku); ft = alt[0]; it = alt[1]; } }
    const want = `CLIQ-${cfg.plenum ? 'P-' : ''}${kind === 'ext' ? 'EXT' : 'CABLE'}-${pad3(ft)}`;
    add(want, { kind, sku: it?.sku || want, item: it, want, descr: it?.descr || `CLIQ ${cfg.plenum ? 'plenum ' : ''}cable, ${ft}′` }, 1);
    if (!it) warnings.push(`${want} isn’t set up in NetSuite yet.`);
    return ft;
  };
  let e2e = 0; const swaps = new Map();
  for (const c of channels) {
    const lead = +c.run.leaderFt || +s.leaderFt || 50; const lf = cab('cable', lead, 'leader'); c.leader = lf;
    const conns = Math.max(0, c.n - 1);
    if (c.run.continuity === 'continuous') e2e += conns;
    else { const gap = +c.run.gapFt || 0; let jf = +c.run.jumperFt || +s.jumperFt || 10; if (gap > jf) { jf = gap; assumptions.push(`${c.run.name || 'Run'}: jumpers lengthened to span the ${gap}′ gap between fixtures.`); } for (let k = 0; k < conns; k++) c.jumper = cab('cable', jf, 'jumper'); }
  }
  /* channel covers: always on strut mounting, filling the open strut between fixtures in each run */
  let coverFt = 0, gapsTotal = 0;
  if (cfg.mount === 'U') {
    const fin = cfg.coverFinish || 'GR';
    for (const r of R) {
      if (r.continuity === 'continuous') continue;
      const gaps = Math.max(0, Math.round(+r.fixtures) - 1); if (!gaps) continue;
      const gap = +r.gapFt || 0;
      if (!(gap > 0)) { warnings.push(`${r.name || 'Run'}: enter the gap between fixtures so channel covers can be quoted.`); continue; }
      const pieces = coverPieces(gap, fin); gapsTotal += gaps; coverFt += gaps * Math.ceil(gap - 1e-9);
      for (const ft of pieces) {
        const it = findCover(ft, fin); const want = `CLIQ-CHANNEL-${pad3(ft)}${fin === 'GR' ? '' : '-' + fin}`;
        add('cov-' + want, { kind: 'cover', sku: it?.sku || want, item: it, want, descr: it?.descr || `CLIQ channel cover, ${ft}′, ${lbl(COVER_FINISH, fin)}` }, gaps);
        if (!it) warnings.push(`${want} isn’t set up in NetSuite yet.`);
      }
    }
    if (gapsTotal) assumptions.push(`Channel covers fill the open strut between fixtures: ${int(gapsTotal)} gap${gapsTotal > 1 ? 's' : ''}, ${int(coverFt)}′ of ${lbl(COVER_FINISH, fin).toLowerCase()} cover${fin === 'GR' ? '' : ' (2′ field-cuttable pieces)'}.`);
  }
  if (e2e) { add('e2e', { kind: 'e2e', sku: 'CLIQ-CONNECT-E2E', item: null, want: 'CLIQ-CONNECT-E2E', descr: 'End-to-end connector for continuous runs', custom: true }, e2e); warnings.push('End-to-end connectors for continuous runs have no published price or NetSuite item. Price them separately.'); }
  for (const [a, b] of swaps) assumptions.push(`Used ${b} (in stock) where ${a} has none available.`);
  if (R.some(r => !r.leaderFt)) assumptions.push(`${s.leaderFt}′ leader per channel where no length was given.`);
  if (channels.length) assumptions.push(`One leader (home run) per channel from the enclosure to the first fixture.`);
  /* rows */
  const bom = [...rows.values()].map(r => { const it = r.item; const d = it ? dnOf(it) : { dn: sheetDN(parseSku(r.want)), src: 'DN sheet' }; return { ...r, dn: d.dn, dnSrc: d.src, missing: !it, short: it ? Math.max(0, r.qty - (it.onhand || 0)) : r.qty }; });
  const order = { fixture: 0, enc: 1, cable: 2, ext: 3, cover: 4, sensor: 5, e2e: 6 };
  bom.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || (parseSku(a.sku)?.ft || 0) - (parseSku(b.sku)?.ft || 0));
  const dnTotal = bom.reduce((a, r) => a + (r.dn || 0) * r.qty, 0);
  const capW = encs.reduce((a, e) => a + (e.em ? 384 : e.watts), 0);
  return {
    cfg: { ...cfg }, runs: R.map(r => ({ ...r })), fixtureSku: fitem?.sku || fsku, fixtureFound: !!fitem, bom, channels, encs,
    stats: { fixtures: total, watts: total * W, channels: channels.length, encs: encs.length, em: encs.filter(e => e.em).length, cap, capW, util: capW ? (total * W) / capW : null, dnTotal, lumens: LUMENS[W] && cfg.optic === 'W' ? LUMENS[W] * total : null, coverFt, short: bom.filter(r => r.short > 0 && r.kind !== 'e2e').length },
    warnings: [...new Set(warnings)], assumptions: [...new Set(assumptions)]
  };
}

export {S, runTakeoff};
