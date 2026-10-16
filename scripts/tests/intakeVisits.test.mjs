/**
 * Visitor tracking for the public /conceptual_budget page — the pure rules.
 *
 * The promise this pins: nothing that identifies a stranger is kept. No IP
 * address, no browser string, no full referring address, no email in a tag.
 *
 * Run: node --test scripts/tests/intakeVisits.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isBot, deviceKind, visitorKey, referrerHost, cleanTag, furthestStep,
  visitOutcome, summariseVisits, stepLabel,
} from '../../src/lib/intake/visits.js';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const IPAD   = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';

test('crawlers and blank browsers are not visitors; people are', () => {
  assert.equal(isBot(''), true);
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(isBot('LinkedInBot/1.0'), true);
  assert.equal(isBot('Slackbot-LinkExpanding 1.0'), true);
  assert.equal(isBot('curl/8.4.0'), true);
  assert.equal(isBot(CHROME), false);
  assert.equal(isBot(IPHONE), false);
});

test('phone, tablet, computer', () => {
  assert.equal(deviceKind(CHROME), 'desktop');
  assert.equal(deviceKind(IPHONE), 'mobile');
  assert.equal(deviceKind(IPAD), 'tablet');
  assert.equal(deviceKind('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari'), 'mobile');
  assert.equal(deviceKind('Mozilla/5.0 (Linux; Android 14; SM-X710) Safari'), 'tablet');
});

test('the visitor key is one-way: stable, salted, and holds neither input', () => {
  const a = visitorKey('203.0.113.9', CHROME, 'salt');
  assert.equal(a, visitorKey('203.0.113.9', CHROME, 'salt'));
  assert.notEqual(a, visitorKey('203.0.113.10', CHROME, 'salt'));
  assert.notEqual(a, visitorKey('203.0.113.9', CHROME, 'other-salt'));
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.ok(!a.includes('203'));
});

test('only the referring SITE is kept — never the path or the search words', () => {
  assert.equal(referrerHost('https://www.linkedin.com/feed/?q=pat+example', 'app.ilcstudios.com'), 'linkedin.com');
  assert.equal(referrerHost('https://mail.google.com/mail/u/0/#inbox/abc', ''), 'mail.google.com');
  assert.equal(referrerHost('https://app.ilcstudios.com/conceptual_budget', 'app.ilcstudios.com'), null);
  assert.equal(referrerHost('http://localhost:3000/x', 'localhost:3000'), null);
  assert.equal(referrerHost('not a url', ''), null);
  assert.equal(referrerHost('', ''), null);
});

test('campaign tags: short and plain, never an email address', () => {
  assert.equal(cleanTag(' LinkedIn '), 'linkedin');
  assert.equal(cleanTag('fall-2026_push'), 'fall-2026_push');
  assert.equal(cleanTag('pat@builder-co.com'), null);
  assert.equal(cleanTag('<script>'), null);
  assert.equal(cleanTag('x'.repeat(81)), null);
  assert.equal(cleanTag(null), null);
});

test('going Back never moves a visit backwards; unknown steps are ignored', () => {
  assert.deepEqual(furthestStep(null, 'about'), { stepReached: 'about', stepIndex: 0 });
  assert.deepEqual(furthestStep('about', 'units'), { stepReached: 'units', stepIndex: 2 });
  assert.deepEqual(furthestStep('units', 'about'), { stepReached: 'units', stepIndex: 2 });
  assert.deepEqual(furthestStep('units', 'made-up'), { stepReached: 'units', stepIndex: 2 });
  assert.deepEqual(furthestStep(null, 'made-up'), { stepReached: 'about', stepIndex: 0 });
  assert.equal(stepLabel('review'), 'Summary');
});

test('outcome ladder: sent beats details beats browsing', () => {
  assert.equal(visitOutcome({ submissionId: 's', draftId: 'd', stepIndex: 8 }), 'submitted');
  assert.equal(visitOutcome({ draftId: 'd', stepIndex: 1 }), 'lead');
  assert.equal(visitOutcome({ stepIndex: 3 }), 'browsed');
  assert.equal(visitOutcome({ stepIndex: 0 }), 'looked');
});

test('the summary: visits, returning visitors, leads, sources and the funnel', () => {
  const rows = [
    { visitorKey: 'a', referrerHost: 'linkedin.com', deviceKind: 'desktop', stepIndex: 8, draftId: 'd1', submissionId: 's1' },
    { visitorKey: 'a', referrerHost: null,           deviceKind: 'desktop', stepIndex: 0 },
    { visitorKey: 'b', utmSource: 'newsletter', referrerHost: 'mail.google.com', deviceKind: 'mobile', stepIndex: 2, draftId: 'd2' },
    { visitorKey: 'c', referrerHost: 'linkedin.com', deviceKind: 'tablet', stepIndex: 1 },
  ];
  const s = summariseVisits(rows);
  assert.equal(s.visits, 4);
  assert.equal(s.visitors, 3);
  assert.equal(s.returning, 1);
  assert.equal(s.leads, 2);
  assert.equal(s.submitted, 1);
  assert.equal(s.leadPct, 50);
  assert.deepEqual(s.byDevice, { desktop: 2, tablet: 1, mobile: 1 });
  assert.deepEqual(s.sources[0], { source: 'linkedin.com', count: 2, pct: 50 });
  assert.ok(s.sources.some(x => x.source === 'newsletter'), 'a campaign tag beats the referring site');
  assert.ok(s.sources.some(x => x.source === 'Direct / typed in'));
  assert.equal(s.funnel[0].count, 4);                       // everyone opened the page
  assert.equal(s.funnel[1].count, 3);
  assert.equal(s.funnel[2].count, 2);
  assert.equal(s.funnel[s.funnel.length - 1].count, 1);
  assert.deepEqual(summariseVisits([]).visits, 0);
});

test('the table has no column that could hold an IP address or a browser string', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const model = schema.slice(schema.indexOf('model ConceptualVisit {'));
  const body = model.slice(0, model.indexOf('\n}'));
  assert.ok(body.length > 100);
  assert.ok(!/\b(ip|ipAddress|userAgent|referrer|referrerUrl|email)\s+String/i.test(body), 'identifying column found');
});

test('the public page never imports the server-side tracking library', () => {
  const src = readFileSync(new URL('../../src/app/conceptual_budget/IntakeClient.jsx', import.meta.url), 'utf8');
  assert.ok(!src.includes('intake/visits'));
  assert.ok(src.includes('/api/intake/visit'));
});
