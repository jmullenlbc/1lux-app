// Sales Docs (0137) against a running dev server: upload, the pricing guard,
// tracked links, the public gate, views and page time, turning a link off.
// Skips when the server is down.
// Run: node --test scripts/tests/salesDocsE2e.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { BASE, login, get, post, serverUp } from './_auth.mjs';
import { ensureE2eAdmin } from './_e2eAdmin.mjs';

const TAG = `CLAUDE E2E ${Date.now()}`;

async function send(method, path, body, cookie, type = 'application/json') {
  const headers = { 'Content-Type': type };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body ?? {}), redirect: 'manual' });
  const text = await res.text().catch(() => '');
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json, res };
}

/** A small real PDF with one line of text on each page. */
function makePdf(lines) {
  const objs = [];
  const n = lines.length;
  const kids = lines.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  const font = 3 + n * 2;
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  lines.forEach((line, i) => {
    const stream = `BT /F1 18 Tf 72 720 Td (${line}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A workbook: a clean shown sheet, plus (optionally) a hidden sheet with a cost column. */
function makeXlsx({ costHeader = false, hiddenSheet = false } = {}) {
  const wb = XLSX.utils.book_new();
  const head = ['Type', 'Description', 'Qty', costHeader ? 'Dealer Net' : 'Sell'];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ['A1', 'Downlight', 40, 125], ['B2', 'Wall sconce', 12, 210]]), 'Schedule');
  if (hiddenSheet) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Type', 'Buy'], ['A1', 61]]), 'Internal');
    wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function upload(cookie, fileName, buf, title) {
  const fd = new FormData();
  fd.append('file', new Blob([buf]), fileName);
  fd.append('title', title);
  const res = await fetch(`${BASE}/api/sales-docs`, { method: 'POST', headers: { cookie }, body: fd });
  const json = await res.json().catch(() => null);
  assert.equal(res.status, 201, JSON.stringify(json));
  const done = await post(`/api/sales-docs/versions/${json.version.id}/process`, {}, cookie);
  assert.equal(done.status, 200, done.text);
  return { doc: json.doc, version: done.json.version };
}

/** Pass the public gate; returns the pass cookie. */
async function gate(token, body) {
  const r = await send('POST', `/api/share/docs/${token}/gate`, body);
  const set = r.res.headers.getSetCookie?.() || [];
  return { ...r, cookie: set.map((c) => c.split(';')[0]).join('; ') };
}

test('sales docs: guard, links, gate, views, page time, turn off', async (t) => {
  if (!(await serverUp())) { t.skip(`dev server not reachable at ${BASE}`); return; }
  const prisma = new PrismaClient();
  const made = [];
  try {
    const { email, password } = await ensureE2eAdmin(prisma);
    const { cookie } = await login(email, password);

    // T6: a workbook with a cost column is blocked from sharing until an admin clears it.
    const blocked = await upload(cookie, 'schedule-dn.xlsx', makeXlsx({ costHeader: true }), `${TAG} blocked`);
    made.push(blocked.doc.id);
    assert.equal(blocked.version.processStatus, 'READY');
    assert.equal(blocked.version.scanStatus, 'BLOCKED');
    const refused = await post('/api/sales-docs/links', { docId: blocked.doc.id, name: 'Should not work' }, cookie);
    assert.equal(refused.status, 409, refused.text);
    const shortReason = await post(`/api/sales-docs/versions/${blocked.version.id}/override`, { reason: 'ok' }, cookie);
    assert.equal(shortReason.status, 400);
    const cleared = await post(`/api/sales-docs/versions/${blocked.version.id}/override`, { reason: 'Checked by hand, sell prices only' }, cookie);
    assert.equal(cleared.status, 200, cleared.text);
    const nowOk = await post('/api/sales-docs/links', { docId: blocked.doc.id, name: `${TAG} cleared` }, cookie);
    assert.equal(nowOk.status, 201, nowOk.text);

    // T12: a hidden sheet is never listed or drawn for a reader, even after an override.
    const hidden = await upload(cookie, 'schedule-hidden.xlsx', makeXlsx({ hiddenSheet: true }), `${TAG} hidden`);
    made.push(hidden.doc.id);
    assert.equal(hidden.version.scanStatus, 'BLOCKED', 'a hidden sheet blocks sharing');
    await post(`/api/sales-docs/versions/${hidden.version.id}/override`, { reason: 'Hidden tab is notes only' }, cookie);
    const hLink = await post('/api/sales-docs/links', { docId: hidden.doc.id, name: `${TAG} hidden`, requireEmail: false }, cookie);
    assert.equal(hLink.status, 201, hLink.text);
    const hPass = await gate(hLink.json.link.token, {});
    assert.equal(hPass.status, 200, hPass.text);
    const hInfo = await get(`/api/share/docs/${hLink.json.link.token}`, hPass.cookie);
    assert.deepEqual(hInfo.json.docs[0].sheets.map((s) => s.name), ['Schedule']);
    const hSheet = await get(`/api/share/docs/${hLink.json.link.token}/rendered?docId=${hidden.doc.id}&index=1`, hPass.cookie);
    assert.equal(hSheet.status, 404, 'the hidden sheet is not served');
    const shown = await get(`/api/share/docs/${hLink.json.link.token}/rendered?docId=${hidden.doc.id}&index=0`, hPass.cookie);
    assert.equal(shown.status, 200);
    assert.ok(!/Buy|Internal/.test(shown.text), 'nothing from the hidden sheet');

    // T7: a clean PDF, a link that asks for a work email, a view with page time.
    const pdf = await upload(cookie, 'cut-sheets.pdf', makePdf(['Fixture schedule page one', 'Fixture schedule page two']), `${TAG} pdf`);
    made.push(pdf.doc.id);
    assert.equal(pdf.version.scanStatus, 'CLEAN');
    assert.equal(pdf.version.pageCount, 2);
    const link = await post('/api/sales-docs/links', { docId: pdf.doc.id, name: `${TAG} email`, requireEmail: true, allowDownload: false }, cookie);
    assert.equal(link.status, 201, link.text);
    assert.ok(!('passwordHash' in link.json.link));
    const token = link.json.link.token;

    const before = await get(`/api/share/docs/${token}`);
    assert.equal(before.json.state, 'OK');
    assert.equal(before.json.passed, false);
    assert.equal(before.json.brand.name, 'Logiq');
    assert.ok(!before.json.docs, 'no documents before the gate');
    assert.equal((await send('POST', `/api/share/docs/${token}/views`, { docId: pdf.doc.id })).status, 401);
    assert.equal((await gate(token, {})).status, 400, 'email is required');

    const pass = await gate(token, { email: 'Reader@Example-GC.com', name: 'E2E Reader' });
    assert.equal(pass.status, 200, pass.text);
    assert.ok(pass.cookie, 'gate sets the pass cookie');
    const info = await get(`/api/share/docs/${token}`, pass.cookie);
    assert.equal(info.json.passed, true);
    assert.equal(info.json.docs[0].pageCount, 2);
    assert.ok(!/storageKey|passwordHash|ownerId/.test(info.text), 'no internal fields on the public page');

    const file = await fetch(`${BASE}/api/share/docs/${token}/file?docId=${pdf.doc.id}`, { headers: { cookie: pass.cookie, range: 'bytes=0-99' } });
    assert.equal(file.status, 206);
    assert.equal((await send('GET', `/api/share/docs/${token}/download?docId=${pdf.doc.id}`, undefined, pass.cookie)).status, 403, 'downloads are off');

    const view = await send('POST', `/api/share/docs/${token}/views`, { docId: pdf.doc.id }, pass.cookie);
    assert.equal(view.status, 201, view.text);
    const viewId = view.json.viewId;
    const ping = (b) => send('POST', `/api/share/docs/${token}/ping`, JSON.stringify({ viewId, ...b }), pass.cookie, 'text/plain');
    assert.equal((await ping({ unitIndex: 0, label: 'Page 1', deltaMs: 0, entered: true })).status, 204);
    assert.equal((await ping({ unitIndex: 0, label: 'Page 1', deltaMs: 5000 })).status, 204);
    assert.equal((await ping({ unitIndex: 1, label: 'Page 2', deltaMs: 0, entered: true })).status, 204);
    assert.equal((await ping({ unitIndex: 1, label: 'Page 2', deltaMs: 999999 })).status, 204, 'a long gap is clamped, not refused');
    assert.equal((await ping({ unitIndex: 0, label: 'Page 1', deltaMs: 0, entered: true })).status, 204);
    assert.equal((await send('POST', `/api/share/docs/${token}/ping`, JSON.stringify({ viewId, unitIndex: 0, deltaMs: 5000 }), '', 'text/plain')).status, 401, 'no pass, no time');

    const stats = await prisma.salesDocUnitStat.findMany({ where: { viewId }, orderBy: { unitIndex: 'asc' } });
    assert.deepEqual(stats.map((s) => [s.unitIndex, s.visits]), [[0, 2], [1, 1]]);
    assert.equal(stats[0].durationMs, 5000);
    assert.equal(stats[1].durationMs, 10000, 'clamped to 10 seconds');

    const eng = await get(`/api/sales-docs/engagement?linkId=${link.json.link.id}`, cookie);
    assert.equal(eng.status, 200, eng.text);
    assert.equal(eng.json.total, 1);
    assert.equal(eng.json.kpis.timeMs, 15000);
    const csv = await get(`/api/sales-docs/engagement?linkId=${link.json.link.id}&format=csv`, cookie);
    assert.equal(csv.status, 200);
    assert.match(csv.text, /reader@example-gc\.com/i);

    // T10: a password link refuses a wrong password, then locks after ten misses.
    const pw = await post('/api/sales-docs/links', { docId: pdf.doc.id, name: `${TAG} password`, password: 'e2e-pass-word', requireEmail: false }, cookie);
    assert.equal(pw.status, 201, pw.text);
    const pwToken = pw.json.link.token;
    const pwInfo = await get(`/api/share/docs/${pwToken}`);
    assert.equal(pwInfo.json.link.needsPassword, true);
    assert.equal((await gate(pwToken, { password: 'wrong' })).status, 401);
    for (let i = 0; i < 9; i++) await gate(pwToken, { password: `wrong-${i}` });
    assert.equal((await gate(pwToken, { password: 'e2e-pass-word' })).status, 429, 'locked after ten misses, even with the right password');

    // T11: turning a link off shows "no longer available" and stops new views.
    const off = await send('PATCH', `/api/sales-docs/links/${link.json.link.id}`, { revoke: true }, cookie);
    assert.equal(off.status, 200, off.text);
    assert.equal(off.json.link.status, 'REVOKED');
    const gone = await get(`/api/share/docs/${token}`, pass.cookie);
    assert.equal(gone.json.state, 'REVOKED');
    assert.ok(!gone.json.docs);
    assert.equal((await send('POST', `/api/share/docs/${token}/views`, { docId: pdf.doc.id }, pass.cookie)).status, 401);
    assert.equal((await gate(token, { email: 'reader@example-gc.com' })).status, 410);
    assert.equal((await get('/api/share/docs/not-a-real-token')).json.state, 'MISSING');
    const kept = await get(`/api/sales-docs/engagement?linkId=${link.json.link.id}`, cookie);
    assert.equal(kept.json.total, 1, 'views stay on the record');

    // Space: a blocked document stops a Space link.
    const fresh = await upload(cookie, 'schedule-dn-2.xlsx', makeXlsx({ costHeader: true }), `${TAG} blocked 2`);
    made.push(fresh.doc.id);
    const space = await post('/api/sales-docs/spaces', { name: `${TAG} space` }, cookie);
    assert.equal(space.status, 201, space.text);
    const spaceId = space.json.space.id;
    const put = await send('PATCH', `/api/sales-docs/spaces/${spaceId}`, { items: [{ docId: pdf.doc.id, section: 'Cut sheets' }, { docId: fresh.doc.id, section: 'Schedules' }] }, cookie);
    assert.equal(put.status, 200, put.text);
    assert.equal((await post('/api/sales-docs/links', { spaceId, name: `${TAG} space` }, cookie)).status, 409);
    await send('PATCH', `/api/sales-docs/spaces/${spaceId}`, { items: [{ docId: pdf.doc.id, section: 'Cut sheets' }] }, cookie);
    const sLink = await post('/api/sales-docs/links', { spaceId, name: `${TAG} space`, requireEmail: false }, cookie);
    assert.equal(sLink.status, 201, sLink.text);
    const sPass = await gate(sLink.json.link.token, {});
    const sInfo = await get(`/api/share/docs/${sLink.json.link.token}`, sPass.cookie);
    assert.equal(sInfo.json.link.isSpace, true);
    assert.deepEqual(sInfo.json.docs.map((d) => [d.title, d.section]), [[`${TAG} pdf`, 'Cut sheets']]);
    await send('PATCH', `/api/sales-docs/spaces/${spaceId}`, { archived: true }, cookie);
  } finally {
    // Documents are archive-only; take the test ones off the list.
    if (made.length) await prisma.salesDoc.updateMany({ where: { id: { in: made } }, data: { archivedAt: new Date() } }).catch(() => {});
    await prisma.$disconnect();
  }
});
