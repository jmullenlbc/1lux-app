// Mike's phone kept failing with U3 "connection dropped" about 10% into a
// 12 MB drawing set, at home, on wifi (2026-08-30). Two completely different
// things produce that same message, and they need opposite fixes:
//
//   a weak signal  -> dies at a random point, different every time. Retrying
//                     is the fix, and the chunked upload does it automatically.
//   a hard wall    -> dies at the SAME point every time, because something on
//                     the way is refusing the transfer at a fixed size. No
//                     amount of retrying will ever get past it.
//
// We cannot tell which from a screenshot of the old message, and we are not
// going to ask a GC on a job site to upload five times and report percentages.
// So the browser measures it during the one failure it already had. These
// tests pin that measurement.
import { test } from 'node:test';
import assert from 'node:assert';
import { stoppedAtTheSamePlace, describeDrop } from '../../src/lib/uploadClient.js';

const MB = 1024 * 1024;

test('one attempt proves nothing — never call it a wall on a single sample', () => {
  assert.equal(stoppedAtTheSamePlace([1.2 * MB]), false);
  assert.equal(stoppedAtTheSamePlace([]), false);
});

test('stopping at the same place every time is a wall, not a weak signal', () => {
  // Mike's actual shape: ~1.2 MB in, over and over.
  assert.equal(stoppedAtTheSamePlace([1.20 * MB, 1.21 * MB, 1.19 * MB, 1.20 * MB]), true);
});

test('stopping somewhere different each time is a weak signal', () => {
  assert.equal(stoppedAtTheSamePlace([0.4 * MB, 3.1 * MB, 1.8 * MB]), false);
});

test('failing before a single byte moved is not a wall — it never got started', () => {
  // Nothing sent at all is a reachability problem (the bucket unreachable on an
  // IPv6-only carrier looked exactly like this), and 0 vs 0 would otherwise
  // divide by zero and read as a perfect match.
  assert.equal(stoppedAtTheSamePlace([0, 0, 0]), false);
});

const stats = (over) => ({ pct: 10, sentBytes: 1.2 * MB, part: 1, parts: 3,
                           startedAt: Date.now() - over * 1000 });

test('the wall message tells the user to stop retrying and email it instead', () => {
  const msg = describeDrop(stats(21), [1.2 * MB, 1.2 * MB, 1.21 * MB, 1.19 * MB]);
  assert.match(msg, /same point/i);
  assert.match(msg, /limit/i);
  assert.match(msg, /budgets@ilcstudios\.com/);
  assert.doesNotMatch(msg, /stronger connection/i);
});

test('the weak-signal message tells the user to try again', () => {
  const msg = describeDrop(stats(30), [0.4 * MB, 3.1 * MB, 1.2 * MB]);
  assert.match(msg, /stronger connection/i);
  assert.doesNotMatch(msg, /same point/i);
});

test('the message carries the numbers that identify the failure from a screenshot', () => {
  // Percentage, which part of how many, megabytes sent, seconds elapsed, tries,
  // and the code. These are the only things that survive a photo of a phone
  // screen, and chasing this bug without them cost a day.
  const msg = describeDrop(stats(21), [1.2 * MB, 1.2 * MB, 1.2 * MB]);
  assert.match(msg, /10% in/);
  assert.match(msg, /part 1 of 3/);
  assert.match(msg, /1\.2 MB/);
  assert.match(msg, /21s/);
  assert.match(msg, /3 tries/);
  assert.match(msg, /\(U3\)$/);
});

test('a single-part upload does not talk about parts', () => {
  const msg = describeDrop({ pct: 40, sentBytes: 2 * MB, part: 1, parts: 1, startedAt: Date.now() },
                           [2 * MB, 2 * MB]);
  assert.doesNotMatch(msg, /part/i);
});

test('a drop before the first byte says so rather than claiming 0%', () => {
  const msg = describeDrop({ pct: null, sentBytes: 0, part: null, parts: 1, startedAt: Date.now() }, [0, 0]);
  assert.match(msg, /before it started/);
});
