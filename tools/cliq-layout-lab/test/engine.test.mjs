/* Checks the ported engine against Brian's original code (test/brian-source.mjs, extracted from the artifact)
 * on random inputs, plus a few hand-worked cases. Run: node test/engine.test.mjs */
import * as E from '../public/engine.js';
import { layoutArea, newArea, fillRow } from '../public/layout.js';
import { readMarkups, parseFeet } from '../public/bluebeam.js';

let ref = null;
try { ref = await import('./brian-source.mjs'); } catch { console.log('(reference source not present, skipping parity check)'); }

let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const SETTINGS = { maxPerChannel: 8, channelWatts: 96, leaderFt: 50, jumperFt: 10, gapFt: 8, mount: 'U', input: 'WIRE' };

function makeCatalog() {
  const skus = [];
  for (const m of ['U', 'S', 'G/S', 'G']) for (const [len, ws] of [['24', [12, 24]], ['48', [24, 48]]]) for (const w of ws) for (const f of ['BK', 'WH'])
    if (Math.random() < 0.5) skus.push(`CLIQ-${m}-${len}-${w}W-840-W-${f}`);
  for (const m of ['U', 'G/S']) for (const [ch, w] of [[1, 120], [2, 240], [5, 480]]) if (Math.random() < 0.7) skus.push(`CLIQ-ENC-${m}-${ch}CH-${w}W-WIRE`);
  skus.push('CLIQ-ENC-U-4CH-400W-WIRE-EM');
  for (const ft of [1, 2, 3, 4, 5, 6, 8, 10, 25, 50, 100]) if (Math.random() < 0.8) skus.push(`CLIQ-CABLE-${String(ft).padStart(3, '0')}`);
  for (const ft of [1, 2, 3, 4]) skus.push(`CLIQ-CHANNEL-${String(ft).padStart(3, '0')}`);
  skus.push('CLIQ-CHANNEL-002-BK');
  return skus.map((sku, i) => ({ id: i + 1, sku, descr: sku, onhand: Math.random() < 0.5 ? Math.floor(Math.random() * 40) : 0, landed: 10, p: E.parseSku(sku) }));
}
function randomCase() {
  const len = rnd(['24', '48']); const watts = rnd(E.WATTS_BY_LEN[len]);
  const cfg = E.defaultCfg({ len, watts, mount: rnd(['U', 'S', 'G']), fascia: rnd(['BK', 'WH']), coverFinish: rnd(['GR', 'BK']), separate: Math.random() < 0.3 });
  const runs = Array.from({ length: 1 + Math.floor(Math.random() * 5) }, (_, i) => ({ id: 'r' + i, name: 'Run ' + (i + 1), fixtures: 1 + Math.floor(Math.random() * 40), continuity: Math.random() < 0.2 ? 'continuous' : 'spaced', gapFt: rnd([0, 2, 6, 8, 12, 14.5]), jumperFt: rnd([10, 0]), leaderFt: rnd([0, 20, 50, 80, 140]), em: Math.random() < 0.2 }));
  return { cfg, runs };
}
const key = bom => bom.map(r => `${r.sku}|${r.qty}|${r.dn}`).join('\n');

if (ref) {
  for (let t = 0; t < 400; t++) {
    const cat = t % 2 ? makeCatalog() : [];
    const { cfg, runs } = randomCase();
    ref.S.settings = { ...SETTINGS }; ref.S.catalog = cat.map(x => ({ ...x }));
    const a = ref.runTakeoff(JSON.parse(JSON.stringify(cfg)), JSON.parse(JSON.stringify(runs)));
    const b = E.runTakeoff(JSON.parse(JSON.stringify(cfg)), JSON.parse(JSON.stringify(runs)), { catalog: cat.map(x => ({ ...x })), settings: SETTINGS });
    ok(key(a.bom) === key(b.bom), `bom differs case ${t}\n${JSON.stringify({ cfg, runs })}\nREF:\n${key(a.bom)}\nNEW:\n${key(b.bom)}`);
    ok(JSON.stringify({ ...a.stats }) === JSON.stringify({ ...b.stats, dnTotal: a.stats.dnTotal }) && Math.abs(a.stats.dnTotal - b.stats.dnTotal) < 0.01, `stats differ case ${t}`);
    if (cat.length) ok(JSON.stringify(a.warnings) === JSON.stringify(b.warnings), `warnings differ case ${t}: ${a.warnings} vs ${b.warnings}`);
  }
}

/* hand-worked: 12 × 48" 24W on strut, 8' gaps, 50' leaders, 10' jumpers */
{
  const r = E.runTakeoff(E.defaultCfg(), [{ name: 'R1', fixtures: 12, continuity: 'spaced', gapFt: 8, jumperFt: 10, leaderFt: 50 }], { settings: SETTINGS });
  const q = Object.fromEntries(r.bom.map(x => [x.sku, x.qty]));
  ok(q['CLIQ-U-48-24W-840-W-BK'] === 12, 'fixtures 12');
  ok(r.stats.channels === 3, '3 channels of 4');
  ok(q['CLIQ-ENC-U-5CH-480W-WIRE'] === 1, 'one 5CH enclosure');
  ok(q['CLIQ-CABLE-050'] === 3, 'three 50ft leaders');
  ok(q['CLIQ-CABLE-010'] === 9, 'nine 10ft jumpers');
  ok(q['CLIQ-CHANNEL-004'] === 22, '11 gaps × two 4ft covers');
  ok(r.stats.dnTotal === 12 * 125 + 725 + 3 * 80 + 9 * 26 + 22 * 4, 'dn total ' + r.stats.dnTotal);
}
/* layout */
{
  ok(fillRow(100, { len: '48', fixtureMode: 'oc', ocFt: 10, endClearFt: 2 }).fixtures === 10, 'oc fill 100ft @10oc -> 10');
  ok(fillRow(100, { len: '48', fixtureMode: 'continuous', endClearFt: 2 }).fixtures === 24, 'continuous 96/4');
  ok(fillRow(100, { len: '48', fixtureMode: 'gap', gapFt: 6, endClearFt: 2 }).fixtures === 10, 'gap 6 -> 10');
  const L = layoutArea(newArea(1, { lengthFt: 120, widthFt: 40, rows: 4, fixtureMode: 'oc', ocFt: 10 }));
  ok(L.runs.length === 4 && L.runs[0].fixtures === 12, 'area 4 rows × 12');
  ok(L.stats.fc > 0, 'fc estimate');
  const T = layoutArea(newArea(1, { lengthFt: 100, widthFt: 50, rows: 5, fixtureMode: 'target', targetFc: 30 }));
  ok(T.stats.fc >= 30, 'target met ' + T.stats.fc);
}
/* bluebeam */
{
  ok(Math.abs(parseFeet(`45'-6"`) - 45.5) < 1e-9, 'feet-inches');
  ok(parseFeet('45.5 ft') === 45.5 && Math.abs(parseFeet('13.87 m') - 45.505) < 0.01, 'units');
  const csv = 'Subject,Label,Layer,Page Label,Length,Count\nPolylength,L1,Lighting,E1.01,"120\' 6""",\nCount,L1,Lighting,E1.01,,14\n';
  const m = readMarkups(csv);
  ok(m.items.length === 2 && m.items[0].lengthFt === 120.5 && m.items[1].count === 14, 'markups parse ' + JSON.stringify(m.items));
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
