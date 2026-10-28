// Every error a visitor can see must end in a code. stampError() is the choke
// point that guarantees it for server messages; these tests pin its contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_NUMBERS, stampError } from '../../src/lib/intake/errorNumbers.js';

test('stampError appends the mapped number', () => {
  assert.equal(
    stampError('too_large', 'That file is larger than 400 MB.'),
    'That file is larger than 400 MB. (S2)',
  );
  assert.equal(stampError('bad_request', 'Invalid request.'), 'Invalid request. (S1)');
});

test('stampError leaves already-coded messages alone (V-codes from the vision layer)', () => {
  assert.equal(
    stampError('extraction_failed', 'Could not read the drawing. (V1-400)'),
    'Could not read the drawing. (V1-400)',
  );
  assert.equal(stampError('extraction_failed', 'Could not read the drawing. (V2)'),
    'Could not read the drawing. (V2)');
  assert.equal(stampError('ai_unavailable', 'Please email the set. (V3)'),
    'Please email the set. (V3)');
});

test('stampError never ships an uncoded message, even for a code added later', () => {
  assert.equal(stampError('some_future_code', 'A brand-new failure.'),
    'A brand-new failure. (S-some_future_code)');
});

test('a parenthesized size in the middle of a message is not mistaken for a code', () => {
  // The over-limit message contains "(400 MB)" mid-sentence; only a trailing
  // parenthesized token counts as a code.
  assert.equal(
    stampError('too_large', 'This file is past what we can take (400 MB). Send it to us.'),
    'This file is past what we can take (400 MB). Send it to us. (S2)',
  );
});

test('every mapped number is unique', () => {
  const nums = Object.values(ERROR_NUMBERS);
  assert.equal(new Set(nums).size, nums.length);
});

test('every server code used by the intake pipeline has a number', () => {
  for (const code of [
    'bad_request', 'too_large', 'unsupported_type', 'image_not_supported',
    'unreadable', 'no_text_layer', 'parse_failed', 'extraction_failed',
    'bad_output', 'no_pages', 'bad_key', 'scan_expired', 'not_found',
    'unavailable', 'rate_limited', 'presign_failed', 'missing_parts',
    'no_parts', 'ai_unavailable', 'too_big_to_read',
  ]) {
    assert.ok(ERROR_NUMBERS[code], `no number mapped for code "${code}"`);
  }
});

// Mike 10-26: every error in plain terms, saying whose side it is on and what
// to do. A rejected AI key once read "Could not read the drawing. (V1-401)".
import { visionFailure, VISION_GARBLED } from '../../src/lib/aiFailure.js';

test('a failed AI call never blames the drawing and always says what to do', () => {
  const cases = [
    [{ status: 401 }, 'V1-401', /sign in to the AI service/],
    [{ status: 403 }, 'V1-403', /sign in to the AI service/],
    [{ status: 429 }, 'V1-429', /Wait a minute/],
    [{ status: 400 }, 'V1-400', /very large/],
    [{ status: 529 }, 'V1-529', /on their side/],
    [{ status: 500 }, 'V1-500', /on their side/],
    [{}, 'V1', /lost its connection/],
    [{ status: 418 }, 'V1-418', /could not explain/],
    [{ status: 400, message: 'Your credit balance is too low' }, 'V3', /switched off/],
  ];
  for (const [err, tag, words] of cases) {
    const { message } = visionFailure(err);
    assert.ok(message.endsWith(`(${tag})`), message);
    assert.match(message, words);
    assert.match(message, /not your file|Retry/);
    assert.doesNotMatch(message, /Could not read the drawing|[–—]|--/);
  }
  assert.equal(visionFailure({ status: 401 }).code, 'ai_unavailable');
  assert.ok(VISION_GARBLED.endsWith('(V2)'));
});
