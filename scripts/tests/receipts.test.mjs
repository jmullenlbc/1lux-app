import test from 'node:test';
import assert from 'node:assert/strict';
import {
  receiptExt, sniffReceipt, receiptState, parseReceiptReply, receiptReadFailure,
  READ_STUCK_MS, RECEIPT_ACCEPT, UNREADABLE_MESSAGE,
} from '../../src/lib/sales/receipts.js';

test('file names and types map to the four kinds, nothing else', () => {
  assert.equal(receiptExt('a.PDF', ''), 'pdf');
  assert.equal(receiptExt('a.jpeg', ''), 'jpg');
  assert.equal(receiptExt('a.xlsx', ''), 'xlsx');
  assert.equal(receiptExt('a.xls', ''), 'xls');
  assert.equal(receiptExt('photo', 'image/png'), 'png');
  assert.equal(receiptExt('photo', 'image/jpeg'), 'jpg');
  assert.equal(receiptExt('a.exe', 'application/octet-stream'), '');
  assert.equal(receiptExt('a.docx', ''), '');
  for (const kind of ['.pdf', '.xlsx', '.xls', '.jpg', '.jpeg', '.png']) assert.ok(RECEIPT_ACCEPT.includes(kind));
});

test('the bytes decide what a file is, not its name', () => {
  assert.equal(sniffReceipt(Buffer.from('%PDF-1.7 rest')), 'pdf');
  assert.equal(sniffReceipt(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'jpg');
  assert.equal(sniffReceipt(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(sniffReceipt(Buffer.from('PK\x03\x04rest', 'latin1')), 'xlsx');
  assert.equal(sniffReceipt(Buffer.from('<html>not a receipt</html>')), '');
  assert.equal(sniffReceipt(Buffer.from('')), '');
});

test('a read answer turns into clean fields', () => {
  const r = parseReceiptReply('{"vendor":"Fogo","total":"$1,234.50","date":"2026-10-30","category":"MEAL"}');
  assert.equal(r.ok, true);
  assert.equal(r.vendor, 'Fogo');
  assert.equal(r.amountCents, 123450);
  assert.equal(r.spentOn, '2026-10-30');
  assert.equal(r.category, 'MEAL');
});

test('a read with one field missing still helps, one with nothing does not', () => {
  const part = parseReceiptReply('{"vendor":"Fogo","total":null,"date":null,"category":null}');
  assert.equal(part.ok, true);
  assert.equal(part.amountCents, null);
  const none = parseReceiptReply('{"vendor":null,"total":null,"date":null,"category":null}');
  assert.equal(none.ok, false);
  assert.equal(none.message, UNREADABLE_MESSAGE);
  assert.equal(parseReceiptReply('sorry, no idea').ok, false);
});

test('a read never invents a bad date or a non money amount', () => {
  const r = parseReceiptReply('{"vendor":"Fogo","total":"lots","date":"last week","category":"NONSENSE"}');
  assert.equal(r.amountCents, null);
  assert.equal(r.spentOn, null);
  assert.equal(r.category, null);
});

test('read failures name whose side it was', () => {
  assert.match(receiptReadFailure({ status: 400, message: 'credit balance is too low' }), /RECEIPT_READ_CREDIT/);
  assert.match(receiptReadFailure({ status: 401, message: 'x' }), /RECEIPT_READ_401/);
  assert.match(receiptReadFailure({ status: 429, message: 'x' }), /RECEIPT_READ_429/);
  assert.match(receiptReadFailure({ message: 'x' }), /RECEIPT_READ_NO_ANSWER/);
});

test('a read that never came back stops looking busy', () => {
  const now = Date.now();
  const at = (ms) => new Date(now - ms).toISOString();
  assert.equal(receiptState({ aiStatus: 'READ' }, now), 'READ');
  assert.equal(receiptState({ aiStatus: 'FAILED' }, now), 'FAILED');
  assert.equal(receiptState({ aiStatus: 'WAITING' }, now), 'WAITING');
  assert.equal(receiptState({ aiStatus: 'READING', updatedAt: at(1000) }, now), 'READING');
  assert.equal(receiptState({ aiStatus: 'READING', updatedAt: at(READ_STUCK_MS + 1000) }, now), 'STUCK');
});
