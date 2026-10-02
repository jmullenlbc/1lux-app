// Email writers use the closest template as a skeleton (Mike 10-1). Pure, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topicWords, topicOverlap, sharedWords, bestTemplate, templateSection } from '../../src/lib/bot/templateMatch.js';

const T = [
  { id: 'a', name: 'Proposal follow-up', scenario: 'follow_up', dealStage: 'PROPOSAL', body: 'Hi {contactFirstName}, checking in on the proposal for {projectName}.' },
  { id: 'b', name: 'General follow-up', scenario: 'follow_up', dealStage: null, body: 'Hi {contactFirstName}, any news on {projectName}?' },
  { id: 'c', name: 'Peer review budget delivery', scenario: 'custom', direction: 'When the peer review budget goes out.', subject: 'Peer review budget', body: 'Attached is the peer review budget for {projectName}. The fixture schedule and the unit counts are in the first tab.' },
  { id: 'd', name: 'Lunch catch up', scenario: 'custom', body: 'It has been a while. Lunch or coffee one day next week to catch up?' },
  { id: 'e', name: 'GC only intro', scenario: 'new_intro', clientType: 'GC', body: 'Intro for a general contractor about the lighting package and fixture schedule.' },
  { id: 'f', name: 'Off', scenario: 'custom', isActive: false, body: 'peer review budget fixture schedule unit counts' },
];

test('topic words drop stop words, placeholders and blanks', () => {
  assert.deepEqual([...topicWords('The Peer Review budget for {projectName} on [date] is attached')], ['peer', 'review', 'budget', 'attached']);
  assert.equal(sharedWords('proposal fee hourly scope', 'Proposal follow-up'), 1);
  assert.equal(topicOverlap(['proposal', 'fee', 'hourly', 'scope'], 'proposal fee lump sum'), 0.5);
  assert.equal(topicOverlap('', 'anything'), 0);
});

test('stage match wins, then topic, then the scenario with no stage, else nothing', () => {
  assert.equal(bestTemplate(T, { scenario: 'follow_up', stage: 'PROPOSAL', text: 'peer review budget fixture schedule' }).template.id, 'a');
  const topic = bestTemplate(T, { scenario: 'follow_up', stage: 'KICKOFF', text: 'Mason Flats peer review budget fixture schedule unit counts' });
  assert.equal(topic.template.id, 'c');
  assert.equal(topic.how, 'topic');
  assert.equal(bestTemplate(T, { scenario: 'follow_up', stage: 'KICKOFF', text: 'Mason Flats' }).template.id, 'b');
  assert.equal(bestTemplate(T, { text: 'Mason Flats' }), null);
  assert.equal(bestTemplate(T, { text: 'keep in touch catch up coffee lunch quick call' }).template.id, 'd');
});

test('client type and switched-off templates are never picked', () => {
  assert.equal(bestTemplate(T, { scenario: 'new_intro', clientType: 'ARCHITECT', text: 'general contractor lighting package' }), null);
  assert.equal(bestTemplate(T, { scenario: 'new_intro', clientType: 'GC', text: 'general contractor lighting package' }).template.id, 'e');
  assert.equal(bestTemplate([T[5]], { text: 'peer review budget fixture schedule unit counts' }), null);
});

test('the prompt hands the template in as a skeleton, never as the answer', () => {
  const s = templateSection(bestTemplate(T, { text: 'peer review budget fixture schedule' }));
  assert.match(s, /Closest template on file \("Peer review budget delivery"\)\. When the peer review budget goes out\./);
  assert.match(s, /Use it as a skeleton/);
  assert.match(s, /Never send it word for word/);
  assert.match(s, /Subject: Peer review budget\nAttached is the peer review budget/);
  assert.equal(templateSection(null), '');
});

test('service type, pipeline and contact role rules (Mike 10-1)', () => {
  const R = [
    { id: 'p', name: 'Peer review follow-up', scenario: 'follow_up', serviceType: 'peerReview', body: 'Peer review check in.' },
    { id: 'o', name: 'Owner follow-up', scenario: 'follow_up', contactRole: 'owner principal', body: 'Owner check in.' },
    { id: 'd', name: 'Design pipeline follow-up', scenario: 'follow_up', pipeline: 'DESIGN', body: 'Design check in.' },
    { id: 'g', name: 'General', scenario: 'follow_up', body: 'Check in.' },
  ];
  assert.equal(bestTemplate(R, { scenario: 'follow_up', serviceType: 'fullDesign', pipeline: 'PROCUREMENT', contactTitle: 'Project Manager' }).template.id, 'g');
  assert.equal(bestTemplate(R, { scenario: 'follow_up', serviceType: 'peerReview' }).template.id, 'p');
  assert.equal(bestTemplate(R, { scenario: 'follow_up', contactTitle: 'Managing Owner' }).template.id, 'o');
  assert.equal(bestTemplate(R, { scenario: 'follow_up', pipeline: 'DESIGN', contactTitle: 'Project Manager' }).template.id, 'd');
  // unknown email values never rule a template out
  assert.ok(bestTemplate([R[0]], { scenario: 'follow_up' }));
  // topic words steer the topic match
  const tw = { id: 't', name: 'x', scenario: 'custom', topicWords: 'punch list closeout warranty', body: 'Thanks.' };
  assert.equal(bestTemplate([tw], { text: 'closeout warranty punch list walk' }).template.id, 't');
});
