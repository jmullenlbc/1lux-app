/* CLIQ Layout Lab: UI. Engine and rules live in engine.js / layout.js; data access in adapters.js. */
import * as E from './engine.js';
import * as Lx from './layout.js';
import { readMarkups, markupsToRows } from './bluebeam.js';
import { connect } from './adapters.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => n == null ? '—' : '$' + (+n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = n => n == null ? '—' : Math.round(+n).toLocaleString('en-US');
const ft = n => n == null ? '—' : `${Math.round(+n * 10) / 10}′`;
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const opts = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
function toast(msg, ms = 3000) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
const lsGet = k => { try { return JSON.parse(localStorage.getItem('cliq-layout:' + k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem('cliq-layout:' + k, JSON.stringify(v)); } catch { /* blocked */ } };

/* ---------------- state ---------------- */
const SETTINGS_DEFAULT = { engine: { maxPerChannel: 8, channelWatts: 96, leaderFt: 50, jumperFt: 10 }, layout: { cu: 0.75, llf: 0.85 }, price: { ...E.PRICE_DEFAULT } };
const S = {
  view: 'layout', conn: null, catalog: [], catalogState: 'idle', catalogMsg: '',
  settings: clone(SETTINGS_DEFAULT), jobs: [], tests: [], testRes: {},
  job: null, areaId: null,
  plan: { pdf: null, img: null, pages: 1, page: 1, zoom: 1, w: 0, h: 0, mode: 'idle', pts: [], calib: [], drawArea: null, fileName: '' }
};

function exampleJob() {
  const hot = Lx.newArea(1, { name: 'Hot aisles A–D', lengthFt: 144, widthFt: 48, mountFt: 12, rowAlong: 'length', rowMode: 'count', rows: 4, fixtureMode: 'oc', ocFt: 8, endClearFt: 3, emRows: 1, leaderFt: 50, cfg: E.defaultCfg({ len: '48', watts: 24, mount: 'U', optic: 'W' }) });
  const office = Lx.newArea(2, { name: 'Ops office', lengthFt: 60, widthFt: 32, mountFt: 10, rowAlong: 'length', rowMode: 'spacing', rowSpacingFt: 8, fixtureMode: 'target', targetFc: 40, endClearFt: 2, leaderFt: 25, cfg: E.defaultCfg({ len: '48', watts: 24, mount: 'S', fascia: 'WH', optic: 'W' }) });
  const corr = Lx.newArea(3, { name: 'Corridor', lengthFt: 90, widthFt: 8, mountFt: 10, rowAlong: 'length', rowMode: 'count', rows: 1, fixtureMode: 'continuous', endClearFt: 2, leaderFt: 25, cfg: E.defaultCfg({ len: '48', watts: 24, mount: 'S', optic: 'S' }) });
  return { id: 'example', example: true, name: 'Example: data hall (sample numbers, not a Shift job)', areas: [hot, office, corr], plan: { ftPerUnit: null }, updatedAt: Date.now() };
}
const area = () => S.job.areas.find(a => a.id === S.areaId) || S.job.areas[0];

/* ---------------- compute ---------------- */
function compute(job = S.job, { catalog = S.catalog, settings = S.settings } = {}) {
  const areas = job.areas.map(a => {
    const aa = { ...a, cu: a.cu ?? settings.layout.cu, llf: a.llf ?? settings.layout.llf };
    const L = Lx.layoutArea(aa);
    const T = E.runTakeoff(aa.cfg, L.runs, { catalog, settings: settings.engine, price: settings.price });
    return { a, L, T };
  });
  const bom = E.mergeBoms(areas.map(x => x.T));
  const dn = bom.reduce((s, r) => s + (r.dn || 0) * r.qty, 0);
  const cost = bom.reduce((s, r) => s + (r.cost || 0) * r.qty, 0);
  return { areas, bom, dn: E.r2(dn), cost: E.r2(cost), costCovered: bom.every(r => r.cost != null) };
}

/* ---------------- persistence ---------------- */
function saveDraft() { lsSet('draft', { job: S.job, areaId: S.areaId }); }
async function loadStoreData() {
  try { S.jobs = (await S.conn.store.list('jobs')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); } catch { S.jobs = []; }
  try { S.tests = (await S.conn.store.list('tests')).sort((a, b) => String(a.name).localeCompare(b.name)); } catch { S.tests = []; }
  try { const st = (await S.conn.store.list('settings')).find(x => x.id === 'main'); if (st) S.settings = { engine: { ...SETTINGS_DEFAULT.engine, ...st.engine }, layout: { ...SETTINGS_DEFAULT.layout, ...st.layout }, price: { ...E.PRICE_DEFAULT, ...st.price } }; } catch { /* defaults */ }
}
async function saveJob() {
  const j = S.job; if (j.example) { j.id = uid(); j.example = false; j.name = j.name.replace(/^Example: /, '').replace(/ \(sample numbers, not a Shift job\)$/, '') + ' (copy)'; }
  j.updatedAt = Date.now();
  try { await S.conn.store.put('jobs', j.id, j); const i = S.jobs.findIndex(x => x.id === j.id); if (i >= 0) S.jobs[i] = clone(j); else S.jobs.unshift(clone(j)); toast('Job saved'); }
  catch (e) { toast('Not saved: ' + (e?.message || 'storage refused the write')); }
  saveDraft(); render();
}

/* ---------------- routing ---------------- */
const VIEWS = ['layout', 'plan', 'parts', 'tests', 'setup'];
function route() { const h = location.hash.replace('#', ''); S.view = VIEWS.includes(h) ? h : 'layout'; document.querySelectorAll('.nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.view === S.view)); document.querySelectorAll('.nav a[aria-current]').forEach(a => a.setAttribute('aria-current', 'page')); render(); }
window.addEventListener('hashchange', route);

function render() {
  const v = $('#view');
  if (!S.job) { v.innerHTML = '<p class="muted">Loading…</p>'; return; }
  v.innerHTML = ({ layout: viewLayout, plan: viewPlan, parts: viewParts, tests: viewTests, setup: viewSetup }[S.view])();
  if (S.view === 'layout') paintLayoutResults();
  if (S.view === 'plan') paintSheet();
}

/* ---------------- job bar ---------------- */
function jobBar() {
  const list = [...(S.job.example ? [[S.job.id, S.job.name]] : []), ...S.jobs.map(j => [j.id, j.name || 'Untitled job'])];
  if (!S.job.example && !S.jobs.some(j => j.id === S.job.id)) list.unshift([S.job.id, (S.job.name || 'Untitled job') + ' (not saved)']);
  return `<div class="panel row" style="gap:12px">
    <label class="field" style="flex:2 1 260px"><span>Job</span><input type="text" id="job-name" data-job="name" value="${esc(S.job.name)}"></label>
    <label class="field" style="flex:1 1 200px"><span>Open a saved job</span><select id="job-pick" data-act-change="pick-job">${opts(list, S.job.id)}</select></label>
    <div class="row" style="align-self:flex-end"><button class="btn" data-act="new-job">New job</button><button class="btn primary" data-act="save-job">${S.job.example ? 'Save as my job' : 'Save job'}</button>${!S.job.example && S.jobs.some(j => j.id === S.job.id) ? '<button class="btn danger" data-act="del-job" id="del-job">Delete</button>' : ''}</div>
    ${S.job.example ? '<div class="banner info" style="width:100%"><div>This is an example job with made-up rooms. Change anything; real plans and takeoffs replace it once they arrive.</div></div>' : ''}
  </div>`;
}

/* ---------------- layout view ---------------- */
function viewLayout() {
  const a = area(); const c = a.cfg;
  const tabs = S.job.areas.map(x => `<button class="area-tab" data-act="pick-area" data-id="${x.id}" aria-current="${x.id === a.id}">${esc(x.name)} <span class="n" data-area-n="${x.id}"></span></button>`).join('');
  const drawn = a.source === 'drawn';
  const fm = a.fixtureMode;
  return `<div class="page-head"><div><h1>Layout</h1><p>Set out each area by rule, or use rows drawn on the plan. The takeoff and price update as you type.</p></div></div>
  ${jobBar()}
  <div class="row"><div class="areas">${tabs}</div><span class="spacer"></span><button class="btn sm" data-act="add-area">Add area</button><button class="btn sm" data-act="dup-area">Duplicate</button>${S.job.areas.length > 1 ? '<button class="btn sm danger" data-act="del-area">Remove area</button>' : ''}</div>
  <div class="lay">
    <div class="formcol">
      <div class="panel"><fieldset><legend class="label">Area</legend>
        <div class="grid g2"><label class="field"><span>Name</span><input type="text" id="a-name" data-b="name" value="${esc(a.name)}"></label>
        <label class="field"><span>Rows come from</span><select id="a-source" data-b="source" data-rerender>${opts([['rules', 'Rules (room size)'], ['drawn', `Plan drawing (${(a.drawn || []).length} rows)`]], a.source)}</select></label></div>
        ${drawn ? `<div class="grid g2"><label class="field"><span>Floor area, sq ft (for light level)</span><input type="number" id="a-sf" data-b="areaSf" min="0" value="${esc(a.areaSf ?? '')}"></label><label class="field"><span>Mounting height, ft</span><input type="number" id="a-mh" data-b="mountFt" min="0" step="0.5" value="${esc(a.mountFt)}"></label></div>
        <p class="small muted" style="margin:0">Draw rows for this area on the Plan view, or import a Bluebeam markup list there.</p>`
      : `<div class="grid g3"><label class="field"><span>Length, ft</span><input type="number" id="a-l" data-b="lengthFt" min="0" value="${esc(a.lengthFt)}"></label>
        <label class="field"><span>Width, ft</span><input type="number" id="a-w" data-b="widthFt" min="0" value="${esc(a.widthFt)}"></label>
        <label class="field"><span>Mounting height, ft</span><input type="number" id="a-mh" data-b="mountFt" min="0" step="0.5" value="${esc(a.mountFt)}"></label></div>
        <div class="grid g3"><label class="field"><span>Rows run along</span><select id="a-along" data-b="rowAlong">${opts([['length', 'Length'], ['width', 'Width']], a.rowAlong)}</select></label>
        <label class="field"><span>Rows set by</span><select id="a-rowmode" data-b="rowMode" data-rerender>${opts(Lx.ROW_MODES, a.rowMode)}</select></label>
        ${a.rowMode === 'spacing' ? `<label class="field"><span>Row spacing, ft</span><input type="number" id="a-rs" data-b="rowSpacingFt" min="1" step="0.5" value="${esc(a.rowSpacingFt)}"></label>` : `<label class="field"><span>Rows</span><input type="number" id="a-rows" data-b="rows" min="1" value="${esc(a.rows)}"></label>`}</div>`}
      </fieldset></div>
      <div class="panel"><fieldset><legend class="label">Fixtures along each row</legend>
        <div class="grid g2"><label class="field"><span>Place by</span><select id="a-fm" data-b="fixtureMode" data-rerender>${opts(Lx.FIXTURE_MODES, fm)}</select></label>
        ${fm === 'oc' ? `<label class="field"><span>On-center spacing, ft</span><input type="number" id="a-oc" data-b="ocFt" min="1" step="0.5" value="${esc(a.ocFt)}"></label>` : fm === 'gap' ? `<label class="field"><span>Gap between fixtures, ft</span><input type="number" id="a-gap" data-b="gapFt" min="0" step="0.5" value="${esc(a.gapFt)}"></label>` : fm === 'target' ? `<label class="field"><span>Target average, fc</span><input type="number" id="a-fc" data-b="targetFc" min="1" value="${esc(a.targetFc)}"></label>` : '<div></div>'}</div>
        <div class="grid g3"><label class="field"><span>Clear at each end, ft</span><input type="number" id="a-end" data-b="endClearFt" min="0" step="0.5" value="${esc(a.endClearFt)}"></label>
        <label class="field"><span>EM rows</span><input type="number" id="a-em" data-b="emRows" min="0" value="${esc(a.emRows)}"></label>
        <label class="field"><span>Leader, ft</span><input type="number" id="a-lead" data-b="leaderFt" min="1" value="${esc(a.leaderFt)}"></label></div>
      </fieldset></div>
      <div class="panel"><fieldset><legend class="label">CLIQ fixture</legend>
        <div class="grid g3"><label class="field"><span>Length</span><select id="c-len" data-b="cfg.len" data-rerender>${opts([['24', '24"'], ['48', '48"']], c.len)}</select></label>
        <label class="field"><span>Watts</span><select id="c-w" data-b="cfg.watts" data-num>${opts(E.WATTS_BY_LEN[c.len].map(w => [w, w + 'W']), c.watts)}</select></label>
        <label class="field"><span>Optic</span><select id="c-opt" data-b="cfg.optic">${opts(E.OPTICS, c.optic)}</select></label>
        <label class="field"><span>CCT</span><select id="c-cct" data-b="cfg.cct">${opts(E.CCTS, c.cct)}</select></label>
        <label class="field"><span>CRI</span><select id="c-cri" data-b="cfg.cri">${opts(E.CRIS, c.cri)}</select></label>
        <label class="field"><span>Mounting</span><select id="c-mount" data-b="cfg.mount" data-rerender>${opts(E.MOUNTS, c.mount)}</select></label>
        <label class="field"><span>Fascia</span><select id="c-fascia" data-b="cfg.fascia">${opts(E.FASCIAS, c.fascia)}</select></label>
        <label class="field"><span>Enclosure input</span><select id="c-in" data-b="cfg.input">${opts(E.INPUTS, c.input)}</select></label>
        ${c.mount === 'U' ? `<label class="field"><span>Channel cover</span><select id="c-cov" data-b="cfg.coverFinish">${opts(E.COVER_FINISH, c.coverFinish)}</select></label>` : '<div></div>'}</div>
        <div class="row"><label class="check"><input type="checkbox" id="c-os" data-b="cfg.os"${c.os ? ' checked' : ''}>Occupancy sensor</label><label class="check"><input type="checkbox" id="c-pl" data-b="cfg.plenum"${c.plenum ? ' checked' : ''}>Plenum cable</label><label class="check"><input type="checkbox" id="c-sep" data-b="cfg.separate"${c.separate ? ' checked' : ''}>Enclosures per row</label></div>
        <div class="small muted">Part: <span class="sku" id="fx-sku"></span></div>
      </fieldset></div>
    </div>
    <div class="formcol" id="lay-res"></div>
  </div>`;
}

function paintLayoutResults() {
  const box = $('#lay-res'); if (!box) return;
  const R = compute(); const x = R.areas.find(q => q.a.id === area().id); if (!x) return;
  const { L, T } = x; const st = L.stats;
  $('#fx-sku').textContent = E.fixtureSku(area().cfg);
  R.areas.forEach(q => { const el = document.querySelector(`[data-area-n="${q.a.id}"]`); if (el) el.textContent = q.L.stats.fixtures; });
  const msgs = [...L.warnings, ...T.warnings];
  box.innerHTML = `<div class="panel flush"><div class="panel-head"><h2>${esc(area().name)}</h2><div class="legend"><span><i style="background:var(--plan-row)"></i>Row</span><span><i style="background:var(--plan-fx)"></i>Fixture</span><span><i style="background:var(--plan-em)"></i>EM row</span></div></div>
    <div style="padding:14px 16px"><div class="planbox">${areaSvg(L)}</div></div></div>
    <div class="stats">
      <div class="stat"><span class="label">Fixtures</span><span class="v">${int(st.fixtures)}</span><span class="small muted">${st.rows} row${st.rows === 1 ? '' : 's'}${st.rowSpacing ? ` · ${ft(st.rowSpacing)} apart` : ''}</span></div>
      <div class="stat"><span class="label">Est. average</span><span class="v">${st.fc != null ? Math.round(st.fc) + ' fc' : '—'}</span><span class="small muted">${st.wattsPerSf != null ? (Math.round(st.wattsPerSf * 100) / 100) + ' W/sq ft' : 'needs floor area'}</span></div>
      <div class="stat"><span class="label">Channels · enclosures</span><span class="v">${T.stats.channels} · ${T.stats.encs}</span><span class="small muted">${T.stats.em ? T.stats.em + ' EM · ' : ''}${T.stats.util != null ? Math.round(T.stats.util * 100) + '% loaded' : ''}</span></div>
      <div class="stat"><span class="label">DN total</span><span class="v">${money(T.stats.dnTotal)}</span><span class="small muted">this area</span></div>
    </div>
    ${msgs.length ? `<div class="banner"><ul class="list">${msgs.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
    <div class="panel flush"><div class="panel-head"><h3>Rows</h3><span class="small muted">${L.notes.map(esc).join(' ')}</span></div><div class="scroll-x"><table>
      <thead><tr><th>Row</th><th class="num">Length</th><th class="num">Fixtures</th><th>Placement</th><th>EM</th></tr></thead>
      <tbody>${L.rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${ft(r.lengthFt)}</td><td class="num">${r.fill.fixtures}</td><td class="small">${r.fill.continuity === 'continuous' ? 'Continuous' : r.fill.fixtures > 1 ? `${ft(r.fill.gapFt)} gaps` : 'Single'}</td><td>${r.em ? '<span class="chip bad">EM</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No rows yet.</td></tr>'}</tbody></table></div></div>
    <div class="panel flush"><div class="panel-head"><h3>Parts for this area</h3><a class="btn sm" href="#parts">Whole job</a></div>${bomTable(T.bom, false)}</div>
    ${T.assumptions.length ? `<details class="panel"><summary class="label" style="cursor:pointer">Assumptions (${T.assumptions.length})</summary><ul class="list" style="margin-top:8px">${T.assumptions.map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>` : ''}`;
}

function areaSvg(L) {
  const a = L.area; const flen = Lx.fixLenFt(a.cfg.len);
  if (a.source === 'drawn') {
    const rows = L.rows; if (!rows.length) return '<div class="dropzone" style="border:0"><b>No rows drawn yet</b><div class="small">Open the Plan view, attach a plan and draw rows for this area.</div><a class="btn sm" href="#plan">Go to Plan</a></div>';
    const maxL = Math.max(...rows.map(r => r.lengthFt), 10); const Wv = 800, pad = 40, sc = (Wv - pad * 2) / maxL, gap = 34; const Hv = pad * 2 + rows.length * gap;
    return `<svg viewBox="0 0 ${Wv} ${Hv}" role="img" aria-label="Drawn rows">${rows.map((r, i) => { const y = pad + i * gap + 10; const pos = Lx.positions(r.lengthFt, r.fill, a.cfg.len);
      return `<line x1="${pad}" y1="${y}" x2="${pad + r.lengthFt * sc}" y2="${y}" stroke="${r.em ? 'var(--plan-em)' : 'var(--plan-row)'}" stroke-width="2"/>${pos.map(p => `<rect x="${pad + (p - flen / 2) * sc}" y="${y - 4}" width="${Math.max(2, flen * sc)}" height="8" fill="var(--plan-fx)"/>`).join('')}<text x="${pad}" y="${y - 9}" font-size="11" fill="var(--muted)" font-family="Roboto,Arial,sans-serif">${esc(r.name)} · ${ft(r.lengthFt)} · ${r.fill.fixtures}</text>`; }).join('')}</svg>`;
  }
  const along = a.rowAlong === 'width'; const Lr = +L.stats.rowFt || 0, Sp = +L.stats.spanFt || 0;
  if (!(Lr > 0 && Sp > 0)) return '<div class="dropzone" style="border:0"><b>Enter the room length and width</b></div>';
  const RW = along ? Sp : Lr, RH = along ? Lr : Sp; /* room drawn with x = length */
  const Wv = 800, pad = 44, sc = Math.min((Wv - pad * 2) / RW, 420 / RH); const Hv = RH * sc + pad * 2;
  const X = v => pad + v * sc, Y = v => pad + v * sc;
  let g = '';
  const step = RW > 200 ? 20 : RW > 80 ? 10 : 5;
  for (let v = step; v < RW; v += step) g += `<line x1="${X(v)}" y1="${Y(0)}" x2="${X(v)}" y2="${Y(RH)}" stroke="var(--plan-grid)" stroke-width="1"/>`;
  for (let v = step; v < RH; v += step) g += `<line x1="${X(0)}" y1="${Y(v)}" x2="${X(RW)}" y2="${Y(v)}" stroke="var(--plan-grid)" stroke-width="1"/>`;
  let rows = '';
  for (const r of L.rows) {
    const pos = Lx.positions(r.lengthFt, r.fill, a.cfg.len); const col = r.em ? 'var(--plan-em)' : 'var(--plan-row)';
    if (!along) { const y = Y(r.offsetFt); rows += `<line x1="${X(0)}" y1="${y}" x2="${X(Lr)}" y2="${y}" stroke="${col}" stroke-width="1.5" stroke-dasharray="4 3"/>` + pos.map(p => `<rect x="${X(p - flen / 2)}" y="${y - 3.5}" width="${Math.max(2, flen * sc)}" height="7" fill="var(--plan-fx)"/>`).join(''); }
    else { const x = X(r.offsetFt); rows += `<line x1="${x}" y1="${Y(0)}" x2="${x}" y2="${Y(Lr)}" stroke="${col}" stroke-width="1.5" stroke-dasharray="4 3"/>` + pos.map(p => `<rect x="${x - 3.5}" y="${Y(p - flen / 2)}" width="7" height="${Math.max(2, flen * sc)}" fill="var(--plan-fx)"/>`).join(''); }
  }
  const t = (x, y, s, anchor = 'middle') => `<text x="${x}" y="${y}" font-size="11.5" fill="var(--muted)" text-anchor="${anchor}" font-family="Roboto Mono,monospace">${s}</text>`;
  return `<svg viewBox="0 0 ${Wv} ${Hv}" role="img" aria-label="Area plan with rows and fixtures">${g}<rect x="${X(0)}" y="${Y(0)}" width="${RW * sc}" height="${RH * sc}" fill="none" stroke="var(--plan-wall)" stroke-width="2"/>${rows}${t(X(RW / 2), Y(0) - 12, esc(ft(RW)))}${t(X(RW) + 10, Y(RH / 2), esc(ft(RH)), 'start')}</svg>`;
}

/* ---------------- parts view ---------------- */
function bomTable(bom, full = true) {
  if (!bom.length) return '<div class="dropzone" style="border:0">No parts yet.</div>';
  const tot = bom.reduce((s, r) => s + (r.dn || 0) * r.qty, 0);
  return `<div class="scroll-x"><table><thead><tr><th>Part</th>${full ? '<th>Description</th>' : ''}<th class="num">Qty</th><th class="num">DN each</th><th class="num">DN ext</th><th>Stock</th></tr></thead><tbody>
  ${bom.map(r => `<tr><td><span class="sku">${esc(r.sku)}</span>${r.missing && S.catalog.length ? ' <span class="chip warn">not in NetSuite</span>' : ''}</td>${full ? `<td class="desc">${esc(r.descr)}</td>` : ''}<td class="num">${int(r.qty)}</td><td class="num">${money(r.dn)}</td><td class="num">${r.dn != null ? money(r.dn * r.qty) : '<span class="chip warn">no price</span>'}</td><td>${stockChip(r)}</td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="${full ? 4 : 3}">Total at DN</td><td class="num">${money(tot)}</td><td></td></tr></tfoot></table></div>`;
}
function stockChip(r) {
  if (!S.catalog.length || r.kind === 'e2e') return '<span class="faint small">—</span>';
  if (!r.item) return '<span class="chip">—</span>';
  const oh = r.item.onhand || 0;
  return oh >= r.qty ? `<span class="chip good">${int(oh)} on hand</span>` : oh > 0 ? `<span class="chip warn">${int(oh)} of ${int(r.qty)}</span>` : `<span class="chip bad">none${r.item.onorder ? `, ${int(r.item.onorder)} on order` : ''}</span>`;
}
function viewParts() {
  const R = compute(); const fx = R.areas.reduce((s, q) => s + q.L.stats.fixtures, 0);
  const warns = [...new Set(R.areas.flatMap(q => [...q.L.warnings, ...q.T.warnings]))];
  return `<div class="page-head"><div><h1>Parts and price</h1><p>${esc(S.job.name)}. Prices are dealer net from the CLIQ DN sheet${S.catalog.length ? '; stock is live from NetSuite' : ''}. Nothing here is sent to NetSuite.</p></div><div class="row"><button class="btn" data-act="copy-csv">Copy as CSV</button></div></div>
  <div class="stats">
    <div class="stat"><span class="label">Fixtures</span><span class="v">${int(fx)}</span><span class="small muted">${R.areas.length} area${R.areas.length === 1 ? '' : 's'}</span></div>
    <div class="stat"><span class="label">Enclosures</span><span class="v">${int(R.areas.reduce((s, q) => s + q.T.stats.encs, 0))}</span><span class="small muted">${int(R.areas.reduce((s, q) => s + q.T.stats.channels, 0))} channels</span></div>
    <div class="stat"><span class="label">DN total</span><span class="v">${money(R.dn)}</span><span class="small muted">${R.bom.length} lines</span></div>
    <div class="stat"><span class="label">Cost</span><span class="v">${S.catalog.length ? money(R.cost) : '—'}</span><span class="small muted">${S.catalog.length ? (R.costCovered ? 'all lines costed' : 'some lines have no cost') : 'needs NetSuite catalog'}</span></div>
  </div>
  ${warns.length ? `<div class="banner"><ul class="list">${warns.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
  <div class="panel flush"><div class="panel-head"><h2>Parts list</h2></div>${bomTable(R.bom)}</div>
  <div class="panel flush"><div class="panel-head"><h2>By area</h2></div><div class="scroll-x"><table><thead><tr><th>Area</th><th class="num">Rows</th><th class="num">Fixtures</th><th class="num">Channels</th><th class="num">Enclosures</th><th class="num">Est. fc</th><th class="num">DN</th></tr></thead><tbody>
  ${R.areas.map(q => `<tr><td>${esc(q.a.name)}<div class="small muted mono">${esc(E.fixtureSku(q.a.cfg))}</div></td><td class="num">${q.L.stats.rows}</td><td class="num">${q.L.stats.fixtures}</td><td class="num">${q.T.stats.channels}</td><td class="num">${q.T.stats.encs}${q.T.stats.em ? ` (${q.T.stats.em} EM)` : ''}</td><td class="num">${q.L.stats.fc != null ? Math.round(q.L.stats.fc) : '—'}</td><td class="num">${money(q.T.stats.dnTotal)}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

/* ---------------- plan view ---------------- */
function viewPlan() {
  const P = S.plan; const hasFile = !!(P.pdf || P.img); const j = S.job;
  const drawAreas = j.areas.map(a => [a.id, a.name]);
  if (!P.drawArea || !j.areas.some(a => a.id === P.drawArea)) P.drawArea = area().id;
  const scaleTxt = j.plan?.ftPerUnit ? `<span class="chip good">Scale set: 1′ = ${(1 / j.plan.ftPerUnit).toFixed(2)} units</span>` : '<span class="chip warn">Scale not set</span>';
  const rowsList = j.areas.map(a => ({ a, rows: a.drawn || [] })).filter(x => x.rows.length);
  return `<div class="page-head"><div><h1>Plan</h1><p>Attach a lighting plan, set the scale, then draw each row. Rows feed the area you pick and use that area's spacing rules.</p></div>
    <div class="row"><label class="btn" for="plan-file">${hasFile ? 'Replace plan' : 'Attach plan'}</label><input type="file" id="plan-file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden><label class="btn" for="bb-file">Import Bluebeam markups (CSV)</label><input type="file" id="bb-file" accept=".csv,.txt" hidden></div></div>
  ${jobBar()}
  ${hasFile || (j.plan?.w && rowsList.length) ? `<div class="plan-grid"><div class="formcol">
    <div class="panel sheet-tools">
      ${P.pdf ? `<label class="field" style="width:110px"><span>Page</span><select id="pg" data-act-change="page">${opts(Array.from({ length: P.pages }, (_, i) => [i + 1, `${i + 1} of ${P.pages}`]), P.page)}</select></label>` : ''}
      <label class="field" style="width:120px"><span>Zoom</span><select id="zm" data-act-change="zoom">${opts([[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%'], [2, '200%'], [3, '300%']], P.zoom)}</select></label>
      <label class="field" style="width:180px"><span>Draw rows into</span><select id="draw-area" data-act-change="draw-area">${opts(drawAreas, P.drawArea)}</select></label>
      <div class="row" style="align-self:flex-end"><button class="btn" data-act="mode-cal" aria-pressed="${P.mode === 'calibrate'}">Set scale</button><button class="btn primary" data-act="mode-draw" aria-pressed="${P.mode === 'draw'}">Draw row</button>${P.mode !== 'idle' ? '<button class="btn" data-act="mode-idle">Stop</button>' : ''}</div>
      <label class="field" style="width:190px"><span>Or printed scale (full-size PDF)</span><select id="arch-scale" data-act-change="arch-scale">${opts([['', 'Choose…'], [1 / 16, '1/16″ = 1′-0″'], [3 / 32, '3/32″ = 1′-0″'], [1 / 8, '1/8″ = 1′-0″'], [3 / 16, '3/16″ = 1′-0″'], [1 / 4, '1/4″ = 1′-0″']], '')}</select></label>
    </div>
    <div class="row small">${scaleTxt}<span class="muted" id="plan-hint">${planHint()}</span></div>
    ${!hasFile ? '<div class="banner info"><div>The plan file isn’t kept with the job. Attach it again to see rows over the drawing.</div></div>' : ''}
    <div class="sheet${P.mode !== 'idle' ? ' drawing' : ''}" id="sheet"><canvas id="cv"></canvas><svg id="ov"></svg></div>
  </div>
  <div class="formcol"><div class="panel flush"><div class="panel-head"><h3>Drawn rows</h3><span class="small muted">${rowsList.reduce((s, x) => s + x.rows.length, 0)} total</span></div>
    ${rowsList.length ? rowsList.map(x => `<div style="padding:10px 16px;border-bottom:1px solid var(--line)"><div class="row"><b>${esc(x.a.name)}</b><span class="spacer"></span>${x.a.source !== 'drawn' ? `<button class="btn sm" data-act="use-drawn" data-id="${x.a.id}">Use these rows</button>` : '<span class="chip accent">in use</span>'}</div>
      <table style="margin-top:6px"><tbody>${x.rows.map(r => `<tr><td class="small">${esc(r.name)}</td><td class="num small">${ft(r.lengthFt)}</td><td class="num"><button class="btn sm ghost danger" data-act="del-row" data-a="${x.a.id}" data-id="${r.id}" aria-label="Remove ${esc(r.name)}">Remove</button></td></tr>`).join('')}</tbody></table></div>`).join('') : '<div class="dropzone" style="border:0;padding:20px">No rows drawn yet.</div>'}
  </div>
  <div class="panel small muted"><b class="label">Keys</b><div style="margin-top:6px">Click to add points. <span class="kbd">Enter</span> or double-click finishes a row. <span class="kbd">Backspace</span> removes the last point. <span class="kbd">Esc</span> cancels.</div></div></div></div>`
  : `<div class="dropzone" id="plan-drop" data-drop><b>Drop a plan here</b><div class="small">PDF, PNG or JPG. Text PDFs and scans both work, since the page is drawn as an image.</div><div class="row"><label class="btn primary" for="plan-file">Choose a file</label><label class="btn" for="bb-file">Import Bluebeam markups</label></div></div>
     <div class="panel small muted">Bluebeam: in the Markups List, show the Subject, Label, Layer, Length and Count columns, then Summary → CSV. Each length markup becomes a row; markups are grouped into areas by Label (or Layer).</div>`}`;
}
function planHint() {
  const P = S.plan;
  if (P.mode === 'calibrate') return P.calib.length ? 'Click the second end of a known dimension.' : 'Click both ends of a dimension you know (a column grid or dimension string).';
  if (P.mode === 'draw') return S.job.plan?.ftPerUnit ? `Drawing into ${esc(S.job.areas.find(a => a.id === P.drawArea)?.name || '')}. ${P.pts.length ? 'Enter to finish.' : 'Click the start of a row.'}` : 'Set the scale first so row lengths are right.';
  return '';
}
async function loadPlanFile(f) {
  const P = S.plan; P.pdf = null; P.img = null; P.fileName = f.name; P.mode = 'idle'; P.pts = []; P.calib = [];
  try {
    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
      if (!window.pdfjsLib) throw new Error('The PDF reader didn’t load. Reload the page.');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      P.pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise; P.pages = P.pdf.numPages; P.page = 1;
    } else {
      const url = URL.createObjectURL(f); const img = new Image(); await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('That image couldn’t be opened.')); img.src = url; }); P.img = img; P.pages = 1; P.page = 1;
    }
    S.job.plan = { ...(S.job.plan || {}), fileName: f.name };
    toast(`Opened ${f.name}`);
  } catch (e) { toast(e?.message || 'That file couldn’t be opened.'); }
  render();
}
let paintSeq = 0;
async function paintSheet() {
  const P = S.plan; const cv = $('#cv'), ov = $('#ov'); if (!cv || !ov) return;
  const seq = ++paintSeq; const dpr = window.devicePixelRatio || 1;
  if (P.pdf) {
    const page = await P.pdf.getPage(P.page); if (seq !== paintSeq) return;
    const vp1 = page.getViewport({ scale: 1 }); P.w = vp1.width; P.h = vp1.height;
    const vp = page.getViewport({ scale: P.zoom * dpr });
    cv.width = vp.width; cv.height = vp.height; cv.style.width = vp.width / dpr + 'px'; cv.style.height = vp.height / dpr + 'px';
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.catch(() => {});
  } else if (P.img) {
    P.w = P.img.naturalWidth; P.h = P.img.naturalHeight;
    cv.width = P.w * P.zoom * dpr; cv.height = P.h * P.zoom * dpr; cv.style.width = P.w * P.zoom + 'px'; cv.style.height = P.h * P.zoom + 'px';
    const ctx = cv.getContext('2d'); ctx.drawImage(P.img, 0, 0, cv.width, cv.height);
  } else {
    P.w = S.job.plan?.w || 1200; P.h = S.job.plan?.h || 800;
    cv.width = P.w * P.zoom; cv.height = P.h * P.zoom; cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
  }
  if (seq !== paintSeq) return;
  S.job.plan = { ...(S.job.plan || {}), w: P.w, h: P.h, page: P.page };
  paintOverlay();
}
function paintOverlay() {
  const P = S.plan, ov = $('#ov'); if (!ov) return;
  ov.setAttribute('viewBox', `0 0 ${P.w} ${P.h}`); ov.setAttribute('width', P.w * P.zoom); ov.setAttribute('height', P.h * P.zoom);
  const k = 1 / P.zoom; const fpu = S.job.plan?.ftPerUnit;
  let s = '';
  const R = compute();
  for (const q of R.areas) {
    const a = q.a; if (!a.drawn?.length) continue; const flen = Lx.fixLenFt(a.cfg.len);
    for (const d of a.drawn) {
      if (!d.points || d.page && d.page !== P.page) continue;
      const pts = d.points.map(p => p.join(',')).join(' ');
      const row = q.L.rows.find(r => r.drawnId === d.id);
      const col = row?.em ? 'var(--plan-em)' : 'var(--plan-row)';
      s += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${2.5 * k}" stroke-linecap="round" opacity="${a.source === 'drawn' ? 1 : .45}"/>`;
      if (fpu && row && a.source === 'drawn') {
        for (const p of Lx.positions(d.lengthFt, row.fill, a.cfg.len)) { const [x, y, ang] = Lx.pointAlong(d.points, p / fpu); const w = flen / fpu; s += `<rect x="${x - w / 2}" y="${y - 3 * k}" width="${w}" height="${6 * k}" fill="var(--plan-fx)" transform="rotate(${ang * 180 / Math.PI} ${x} ${y})"/>`; }
      }
      const [lx, ly] = d.points[0]; s += `<text x="${lx}" y="${ly - 6 * k}" font-size="${11 * k}" fill="${col}" font-family="Roboto,Arial,sans-serif" font-weight="700">${esc(d.name)} · ${ft(d.lengthFt)}</text>`;
    }
  }
  if (P.pts.length) s += `<polyline points="${P.pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--accent-2)" stroke-width="${2.5 * k}" stroke-dasharray="${6 * k} ${4 * k}"/>` + P.pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${4 * k}" fill="var(--accent-2)"/>`).join('');
  if (P.calib.length) s += P.calib.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${5 * k}" fill="none" stroke="var(--bad)" stroke-width="${2 * k}"/>`).join('');
  ov.innerHTML = s;
  const h = $('#plan-hint'); if (h) h.innerHTML = planHint();
}
function sheetPoint(e) { const r = $('#ov').getBoundingClientRect(); return [(e.clientX - r.left) / S.plan.zoom, (e.clientY - r.top) / S.plan.zoom]; }
function finishRow() {
  const P = S.plan; const fpu = S.job.plan?.ftPerUnit;
  if (P.pts.length < 2) { P.pts = []; paintOverlay(); return; }
  const a = S.job.areas.find(x => x.id === P.drawArea); if (!a) return;
  a.drawn = a.drawn || [];
  const len = fpu ? Lx.polyLengthFt(P.pts, fpu) : 0;
  a.drawn.push({ id: uid(), name: `${a.name} ${a.drawn.length + 1}`, points: P.pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]), lengthFt: Math.round(len * 10) / 10, page: P.page });
  if (a.source !== 'drawn') { a.source = 'drawn'; toast(`${a.name} now uses drawn rows`); }
  P.pts = []; saveDraft(); render();
}
function setCalibration(p2) {
  const P = S.plan; const p1 = P.calib[0]; const units = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  P.calib = [p1, p2]; paintOverlay();
  const box = $('#plan-hint'); if (!box) return;
  box.innerHTML = `<span class="row" style="gap:6px;display:inline-flex">Real length of that line, ft <input type="number" id="cal-ft" min="0.1" step="0.1" style="width:90px" aria-label="Real length in feet"><button class="btn sm primary" data-act="cal-ok" data-u="${units}">Set scale</button></span>`;
  setTimeout(() => $('#cal-ft')?.focus(), 0);
}
function recalcDrawnLengths() {
  const fpu = S.job.plan?.ftPerUnit; if (!fpu) return;
  for (const a of S.job.areas) for (const d of a.drawn || []) if (d.points) d.lengthFt = Math.round(Lx.polyLengthFt(d.points, fpu) * 10) / 10;
}
async function importBluebeam(f) {
  const text = await f.text(); const m = readMarkups(text);
  if (!m.items.length) { toast(m.warnings[0] || 'No markups found.'); return; }
  const groups = markupsToRows(m.items);
  let added = 0;
  for (const g of groups) {
    if (!g.rows.length) continue;
    const a = Lx.newArea(S.job.areas.length + 1, { name: g.name, source: 'drawn', drawn: g.rows, cfg: clone(area().cfg), note: g.counts ? `Bluebeam count markups: ${g.counts}` : '' });
    S.job.areas.push(a); added++;
  }
  const counts = groups.filter(g => g.counts && !g.rows.length);
  toast(`Imported ${added} area${added === 1 ? '' : 's'} from ${f.name}${counts.length ? `; ${counts.length} count-only group${counts.length > 1 ? 's' : ''} skipped` : ''}`, 5000);
  if (added) { S.areaId = S.job.areas[S.job.areas.length - 1].id; location.hash = 'layout'; }
  saveDraft(); render();
}

/* ---------------- tests view ---------------- */
function runTest(t) {
  const R = compute(t.job, { catalog: [], settings: { ...SETTINGS_DEFAULT, layout: { ...SETTINGS_DEFAULT.layout, ...(t.layout || {}) } } });
  const got = new Map(R.bom.map(r => [r.sku, r.qty])); const want = new Map((t.expected || []).map(r => [r.sku, +r.qty]));
  const rows = []; for (const k of new Set([...want.keys(), ...got.keys()])) { const w = want.get(k) ?? 0, g = got.get(k) ?? 0; rows.push({ sku: k, want: w, got: g, ok: w === g }); }
  rows.sort((a, b) => a.ok - b.ok || a.sku.localeCompare(b.sku, 'en', { numeric: true }));
  return { pass: rows.every(r => r.ok), rows, dn: R.dn, at: Date.now() };
}
function viewTests() {
  const n = S.tests.length, res = S.testRes; const ran = S.tests.filter(t => res[t.id]); const passN = ran.filter(t => res[t.id].pass).length;
  return `<div class="page-head"><div><h1>Test cases</h1><p>Each case is a saved job with the parts list it should produce. Run them after any rule change. Cases run without the NetSuite catalog and with the standard price sheet, so results don't drift with stock.</p></div>
    <div class="row"><button class="btn" data-act="add-test">Save current job as a case</button><button class="btn primary" data-act="run-tests"${n ? '' : ' disabled'}>Run all</button></div></div>
  ${ran.length ? `<div class="banner ${passN === ran.length ? 'info' : 'bad'}"><div><b>${passN} of ${ran.length} passing.</b> ${passN === ran.length ? 'The rules reproduce every expected parts list.' : 'Open a failing case to see which parts differ.'}</div></div>` : ''}
  ${n ? S.tests.map(t => { const r = res[t.id]; return `<div class="panel flush"><div class="panel-head"><div><h3>${esc(t.name)}</h3><div class="small muted">${esc(t.source || 'Saved from the app')} · ${(t.job?.areas || []).length} area(s) · ${(t.expected || []).length} expected lines</div></div>
      <div class="row">${r ? (r.pass ? '<span class="pass">Pass</span>' : `<span class="fail">Fail · ${r.rows.filter(x => !x.ok).length} part${r.rows.filter(x => !x.ok).length === 1 ? '' : 's'} differ</span>`) : '<span class="chip">Not run</span>'}
      <button class="btn sm" data-act="open-test" data-id="${t.id}">Open as job</button><button class="btn sm danger" data-act="del-test" data-id="${t.id}">Delete</button></div></div>
      <details style="padding:10px 16px"><summary class="small" style="cursor:pointer">Expected parts${r ? ' vs result' : ''}</summary>
        <div class="scroll-x" style="margin-top:8px"><table class="diff"><thead><tr><th>Part</th><th class="num">Expected</th>${r ? '<th class="num">Result</th><th></th>' : ''}</tr></thead><tbody>
        ${(r ? r.rows : (t.expected || []).map(x => ({ sku: x.sku, want: x.qty }))).map(x => `<tr><td>${esc(x.sku)}</td><td class="num">${x.want}</td>${r ? `<td class="num">${x.got}</td><td>${x.ok ? '' : '<span class="chip bad">differs</span>'}</td>` : ''}</tr>`).join('')}
        </tbody></table></div>
        <label class="field" style="margin-top:10px"><span>Replace expected parts (paste "SKU, qty" per line, e.g. from the team's takeoff)</span><textarea rows="4" id="exp-${t.id}" placeholder="CLIQ-U-48-24W-840-W-BK, 48"></textarea></label>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="set-exp" data-id="${t.id}">Save expected parts</button>${t.notes ? `<span class="small muted">${esc(t.notes)}</span>` : ''}</div>
      </details></div>`; }).join('')
  : '<div class="dropzone"><b>No test cases yet</b><div class="small">Lay out a job, check the parts list is right, then save it as a case. When the real takeoffs arrive, paste their parts lists as the expected results.</div><button class="btn primary" data-act="add-test">Save current job as a case</button></div>'}`;
}

/* ---------------- setup view ---------------- */
function viewSetup() {
  const c = S.conn; const st = S.settings;
  return `<div class="page-head"><div><h1>Setup</h1><p>Where data comes from, the engine limits, and the CLIQ DN price sheet.</p></div><button class="btn primary" data-act="save-settings">Save settings</button></div>
  <div class="grid g2" style="align-items:start">
    <div class="panel"><h2>Data</h2><div class="grid" style="margin-top:10px">
      <div class="row"><span class="label">Runs as</span><span>${esc({ artifact: 'Claude artifact', server: 'Web app (own server)', offline: 'Offline page' }[c?.mode] || '—')}</span></div>
      <div class="row"><span class="label">Catalog</span><span>${esc(c?.catalog.source || '—')}</span>${S.catalog.length ? `<span class="chip good">${S.catalog.length} CLIQ items</span>` : ''}</div>
      <div class="row"><span class="label">Saved jobs and cases</span><span>${esc({ shared: 'Shared with everyone who opens this page', server: 'On the server', browser: 'This browser only' }[c?.store.kind] || '—')}</span></div>
      ${S.catalogMsg ? `<div class="banner ${S.catalogState === 'error' ? 'bad' : 'info'}"><div>${esc(S.catalogMsg)}</div></div>` : ''}
      <div class="row"><button class="btn" data-act="load-catalog"${c?.catalog.available ? '' : ' disabled'}>${S.catalog.length ? 'Refresh catalog' : 'Load catalog from NetSuite'}</button></div>
    </div></div>
    <div class="panel"><h2>Engine</h2><div class="grid g2" style="margin-top:10px">
      <label class="field"><span>Max fixtures per channel</span><input type="number" id="s-mpc" data-s="engine.maxPerChannel" min="1" value="${st.engine.maxPerChannel}"></label>
      <label class="field"><span>Watts per channel</span><input type="number" id="s-cw" data-s="engine.channelWatts" min="1" value="${st.engine.channelWatts}"></label>
      <label class="field"><span>Default jumper, ft</span><input type="number" id="s-jf" data-s="engine.jumperFt" min="1" value="${st.engine.jumperFt}"></label>
      <label class="field"><span>Default leader, ft</span><input type="number" id="s-lf" data-s="engine.leaderFt" min="1" value="${st.engine.leaderFt}"></label>
      <label class="field"><span>Coefficient of utilization</span><input type="number" id="s-cu" data-s="layout.cu" min="0.1" max="1" step="0.01" value="${st.layout.cu}"></label>
      <label class="field"><span>Light loss factor</span><input type="number" id="s-llf" data-s="layout.llf" min="0.1" max="1" step="0.01" value="${st.layout.llf}"></label>
    </div><p class="small muted" style="margin:10px 0 0">Light estimates use the lumen method with these two factors. They size a layout; they don't replace photometrics.</p></div>
  </div>
  <div class="panel flush"><div class="panel-head"><h2>DN price sheet</h2><button class="btn sm" data-act="reset-price">Reset to Q3 2026 sheet</button></div><div class="scroll-x"><table><thead><tr><th>Item</th><th class="num">DN</th></tr></thead><tbody>
    ${E.PRICE_LABELS.map(([k, l]) => `<tr><td>${esc(l)}</td><td class="num" style="width:140px"><input type="number" id="p-${k}" data-s="price.${k}" step="0.01" value="${st.price[k]}" style="text-align:right"></td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="panel"><h2>Planned NetSuite writes (not active)</h2><p class="small muted">This prototype only reads. When the program is vetted, these are the writes it would make, each through the review queue:</p><ul class="list">
    <li>New CLIQ product needed by a layout → item request (queue → purchasing creates the item).</li>
    <li>Quote issued → estimate in the SHIFT subsidiary (read-only copy of the ERP quote).</li>
    <li>Quote won with a customer PO → sales order transformed from that estimate (queue → inside team confirms).</li>
    <li>Short stock → purchase request to Tach (staged; purchasing finalizes the PO in NetSuite).</li></ul></div>`;
}

/* ---------------- events ---------------- */
function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks.at(-1)] = v; }
function valueOf(el) { if (el.type === 'checkbox') return el.checked; if (el.type === 'number' || el.dataset.num !== undefined) return el.value === '' ? '' : +el.value; return el.value; }
let paintT = 0;
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.b) { setPath(area(), el.dataset.b, valueOf(el)); if (el.dataset.b === 'cfg.len') { const ws = E.WATTS_BY_LEN[area().cfg.len]; if (!ws.includes(+area().cfg.watts)) area().cfg.watts = ws.at(-1); }
    if (el.dataset.b === 'name') document.querySelector(`.area-tab[data-id="${area().id}"]`)?.firstChild && (document.querySelector(`.area-tab[data-id="${area().id}"]`).firstChild.textContent = el.value + ' ');
    saveDraft(); if (el.tagName !== 'SELECT' && el.type !== 'checkbox') { clearTimeout(paintT); paintT = setTimeout(paintLayoutResults, 120); } }
  else if (el.dataset.job) { S.job[el.dataset.job] = el.value; saveDraft(); }
  else if (el.dataset.s) setPath(S.settings, el.dataset.s, el.value === '' ? 0 : +el.value);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.b) { if (el.dataset.rerender !== undefined) render(); else paintLayoutResults(); return; }
  const act = el.dataset.actChange;
  if (act === 'pick-job') { const j = el.value === 'example' ? exampleJob() : S.jobs.find(x => x.id === el.value); if (j) { S.job = clone(j); S.areaId = S.job.areas[0]?.id; saveDraft(); render(); } }
  if (act === 'page') { S.plan.page = +el.value; S.plan.pts = []; paintSheet(); }
  if (act === 'zoom') { S.plan.zoom = +el.value; paintSheet(); }
  if (act === 'draw-area') { S.plan.drawArea = el.value; paintOverlay(); }
  if (act === 'arch-scale' && el.value) { if (!S.plan.pdf) { toast('Printed scales only apply to a full-size PDF. Use Set scale on an image.'); el.value = ''; return; } S.job.plan = { ...S.job.plan, ftPerUnit: 1 / (72 * +el.value) }; recalcDrawnLengths(); saveDraft(); toast('Scale set from the printed scale. Check it against a known dimension.'); render(); }
  if (el.id === 'plan-file' && el.files[0]) loadPlanFile(el.files[0]);
  if (el.id === 'bb-file' && el.files[0]) importBluebeam(el.files[0]);
});
const ACT = {
  'pick-area': el => { S.areaId = el.dataset.id; saveDraft(); render(); },
  'add-area': () => { const a = Lx.newArea(S.job.areas.length + 1, { cfg: clone(area().cfg) }); S.job.areas.push(a); S.areaId = a.id; saveDraft(); render(); },
  'dup-area': () => { const a = { ...clone(area()), id: 'a' + uid(), name: area().name + ' copy', drawn: [] }; if (a.source === 'drawn') a.source = 'rules'; S.job.areas.push(a); S.areaId = a.id; saveDraft(); render(); },
  'del-area': el => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Click again to remove'; setTimeout(() => { if (el.isConnected) { el.dataset.confirm = ''; el.textContent = 'Remove area'; } }, 3000); return; } S.job.areas = S.job.areas.filter(a => a.id !== area().id); S.areaId = S.job.areas[0].id; saveDraft(); render(); },
  'new-job': () => { S.job = { id: uid(), name: 'New job', areas: [Lx.newArea(1)], plan: { ftPerUnit: null }, updatedAt: Date.now() }; S.areaId = S.job.areas[0].id; S.plan = { ...S.plan, pdf: null, img: null, mode: 'idle', pts: [], calib: [] }; saveDraft(); render(); },
  'save-job': () => saveJob(),
  'del-job': async el => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Click again to delete'; setTimeout(() => { if (el.isConnected) { el.dataset.confirm = ''; el.textContent = 'Delete'; } }, 3000); return; }
    try { await S.conn.store.del('jobs', S.job.id); S.jobs = S.jobs.filter(j => j.id !== S.job.id); S.job = exampleJob(); S.areaId = S.job.areas[0].id; saveDraft(); toast('Job deleted'); render(); } catch (e) { toast('Not deleted: ' + (e?.message || 'storage refused')); } },
  'mode-cal': () => { S.plan.mode = 'calibrate'; S.plan.calib = []; S.plan.pts = []; render(); },
  'mode-draw': () => { S.plan.mode = 'draw'; S.plan.calib = []; render(); },
  'mode-idle': () => { S.plan.mode = 'idle'; S.plan.pts = []; S.plan.calib = []; render(); },
  'cal-ok': el => { const v = +$('#cal-ft')?.value; if (!(v > 0)) { toast('Enter the real length in feet.'); return; } S.job.plan = { ...S.job.plan, ftPerUnit: v / +el.dataset.u }; recalcDrawnLengths(); S.plan.mode = 'draw'; S.plan.calib = []; saveDraft(); toast('Scale set'); render(); },
  'del-row': el => { const a = S.job.areas.find(x => x.id === el.dataset.a); a.drawn = a.drawn.filter(d => d.id !== el.dataset.id); saveDraft(); render(); },
  'use-drawn': el => { const a = S.job.areas.find(x => x.id === el.dataset.id); a.source = 'drawn'; saveDraft(); render(); },
  'copy-csv': async () => { const R = compute(); const csv = ['SKU,Description,Qty,DN each,DN ext'].concat(R.bom.map(r => [r.sku, `"${String(r.descr).replace(/"/g, '""')}"`, r.qty, r.dn ?? '', r.dn != null ? E.r2(r.dn * r.qty) : ''].join(','))).join('\n');
    try { await navigator.clipboard.writeText(csv); toast('Parts list copied'); } catch { toast('Copy was blocked. Select the table and copy it instead.'); } },
  'add-test': async () => { const R = compute(S.job, { catalog: [], settings: SETTINGS_DEFAULT }); const t = { id: uid(), name: S.job.name || 'Case', source: 'Saved from the app', job: clone(S.job), expected: R.bom.map(r => ({ sku: r.sku, qty: r.qty })), createdAt: Date.now() };
    t.job.example = false; try { await S.conn.store.put('tests', t.id, t); S.tests.push(t); toast('Saved as a test case'); location.hash = 'tests'; render(); } catch (e) { toast('Not saved: ' + (e?.message || 'storage refused')); } },
  'run-tests': () => { for (const t of S.tests) S.testRes[t.id] = runTest(t); render(); },
  'open-test': el => { const t = S.tests.find(x => x.id === el.dataset.id); S.job = { ...clone(t.job), id: uid(), name: t.name + ' (from case)' }; S.areaId = S.job.areas[0]?.id; location.hash = 'layout'; render(); },
  'del-test': async el => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Click again to delete'; return; } try { await S.conn.store.del('tests', el.dataset.id); S.tests = S.tests.filter(t => t.id !== el.dataset.id); delete S.testRes[el.dataset.id]; render(); } catch (e) { toast('Not deleted: ' + (e?.message || '')); } },
  'set-exp': async el => { const t = S.tests.find(x => x.id === el.dataset.id); const txt = $('#exp-' + t.id).value.trim(); if (!txt) { toast('Paste at least one "SKU, qty" line.'); return; }
    const exp = txt.split(/\n+/).map(l => l.split(/[,\t]/).map(s => s.trim())).filter(p => p[0] && !isNaN(+p[1])).map(p => ({ sku: p[0].toUpperCase(), qty: +p[1] }));
    if (!exp.length) { toast('No "SKU, qty" lines found.'); return; }
    t.expected = exp; t.source = 'Expected parts pasted'; try { await S.conn.store.put('tests', t.id, t); delete S.testRes[t.id]; toast(`Saved ${exp.length} expected parts`); render(); } catch (e) { toast('Not saved: ' + (e?.message || '')); } },
  'save-settings': async () => { try { await S.conn.store.put('settings', 'main', S.settings); toast('Settings saved'); } catch (e) { toast('Not saved: ' + (e?.message || '')); } },
  'reset-price': () => { S.settings.price = { ...E.PRICE_DEFAULT }; render(); },
  'load-catalog': () => loadCatalog(true)
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el); return; }
  const ov = e.target.closest('#ov'); if (!ov) return;
  const P = S.plan; const p = sheetPoint(e);
  if (P.mode === 'calibrate') { if (!P.calib.length) { P.calib = [p]; paintOverlay(); } else setCalibration(p); }
  else if (P.mode === 'draw') { if (e.detail > 1) return; P.pts.push(p); paintOverlay(); }
});
document.addEventListener('dblclick', e => { if (e.target.closest('#ov') && S.plan.mode === 'draw') { e.preventDefault(); finishRow(); } });
document.addEventListener('keydown', e => {
  if (S.view !== 'plan' || S.plan.mode === 'idle' || e.target.closest('input,select,textarea')) return;
  if (e.key === 'Enter') { e.preventDefault(); finishRow(); }
  else if (e.key === 'Backspace') { e.preventDefault(); S.plan.pts.pop(); paintOverlay(); }
  else if (e.key === 'Escape') { S.plan.pts = []; S.plan.calib = []; paintOverlay(); }
});
document.addEventListener('dragover', e => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', e => { e.target.closest?.('[data-drop]')?.classList.remove('over'); });
document.addEventListener('drop', e => { const d = e.target.closest('[data-drop]'); if (!d) return; e.preventDefault(); d.classList.remove('over'); const f = e.dataTransfer.files[0]; if (!f) return; if (/\.csv$/i.test(f.name)) importBluebeam(f); else loadPlanFile(f); });

/* ---------------- start ---------------- */
function setConn(state, text) { $('#conn-dot').className = 'dot ' + state; $('#conn-text').textContent = text; }
async function loadCatalog(manual) {
  if (!S.conn.catalog.available) { setConn('', 'No catalog: DN sheet only'); return; }
  S.catalogState = 'loading'; setConn('', 'Loading CLIQ catalog…');
  try { S.catalog = await S.conn.catalog.load(); S.catalogState = 'ready'; S.catalogMsg = ''; setConn('ok', `NetSuite: ${S.catalog.length} items`); if (manual) toast('Catalog loaded'); }
  catch (e) { S.catalog = []; S.catalogState = 'error'; S.catalogMsg = e?.message || 'Catalog failed to load.'; setConn('warn', 'NetSuite unavailable'); }
  render();
}
async function start() {
  const d = lsGet('draft');
  S.job = d?.job?.areas?.length ? d.job : exampleJob(); S.areaId = d?.areaId || S.job.areas[0].id;
  route();
  S.conn = await connect();
  $('#store-text').textContent = { shared: 'Jobs and cases: shared', server: 'Jobs and cases: server', browser: 'Jobs and cases: this browser' }[S.conn.store.kind];
  await loadStoreData(); render();
  loadCatalog(false);
}
start();
