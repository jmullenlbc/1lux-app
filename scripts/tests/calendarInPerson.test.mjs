/**
 * Knowing a meeting was in person from its title or its location.
 *
 * Mike, 2026-09-07: "when we sync with Microsoft the system should know it's in
 * person through a title or location."
 *
 * These run against pure functions — no database, no network, no Microsoft. They
 * are the layer that has to work when there is no API key and no rules set up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  IN_PERSON_TYPES, BUSINESS_TYPES, isInPersonType, isBusinessType,
  normalizeActivityType, isVirtualLocation, isPhysicalLocation,
  activityTypeFromTitle, classifyByTitleAndLocation,
} from '../../src/lib/calendar/inPerson.js';

import {
  isPersonalEvent, isNotAMeeting, excludeFromNotes, isAutoBooking,
} from '../../src/lib/calendar/personal.js';
import {
  isWorthANote, travelDays, travelDates, dedupeOverlappingMeetings,
} from '../../src/lib/calendar/worthANote.js';

import { fromGraphEvent, fromLooseEvent, normalizeEvent } from '../../src/lib/calendar/normalize.js';

// ── The in-person set ────────────────────────────────────────────────────────

test('the five in-person types are the ones the CRM has always used', () => {
  assert.deepEqual([...IN_PERSON_TYPES].sort(),
    ['COFFEE', 'GOLF', 'HAPPY_HOUR', 'MEAL', 'SITE_VISIT']);
  assert.equal(isInPersonType('MEAL'), true);
  assert.equal(isInPersonType('meal'), true);       // case does not matter
  assert.equal(isInPersonType('CALL'), false);
  assert.equal(isInPersonType(null), false);
  assert.equal(isInPersonType(undefined), false);
});

// Mike, 2026-09-07: "change to meals and include work breakfast, lunch and
// dinners." Notes written before the rename still say LUNCH and must keep
// working, which is what normalizeActivityType is for.

test('a note written before the rename still counts as a meal', () => {
  assert.equal(normalizeActivityType('LUNCH'),     'MEAL');
  assert.equal(normalizeActivityType('dinner'),    'MEAL');
  assert.equal(normalizeActivityType('Breakfast'), 'MEAL');
  assert.equal(normalizeActivityType('GOLF'),      'GOLF');
  assert.equal(normalizeActivityType(''),          null);
  assert.equal(isInPersonType('LUNCH'), true);
  assert.equal(isInPersonType('lunch'), true);
});

// Mike, 2026-09-07: "so should a work business trip. we should look at how many
// days people are traveling to see clients."

test('travel and events count as business without counting as meetings', () => {
  assert.deepEqual([...BUSINESS_TYPES].sort(),
    ['COFFEE', 'EVENT', 'GOLF', 'HAPPY_HOUR', 'MEAL', 'SITE_VISIT', 'TRAVEL']);
  // Kept by the import…
  assert.equal(isBusinessType('TRAVEL'), true);
  assert.equal(isBusinessType('EVENT'),  true);
  // …but a travel day is not a meeting in a room, so it never inflates the
  // in-person count Mike checks by hand.
  assert.equal(isInPersonType('TRAVEL'), false);
  assert.equal(isInPersonType('EVENT'),  false);
  assert.equal(isBusinessType('CALL'),   false);
});

// ── Reading the location box ─────────────────────────────────────────────────

test('a Teams or Zoom location is read as virtual', () => {
  assert.equal(isVirtualLocation({ location: 'Microsoft Teams Meeting' }), true);
  assert.equal(isVirtualLocation({ location: 'https://zoom.us/j/12345' }), true);
  assert.equal(isVirtualLocation({ location: 'Webex' }), true);
  assert.equal(isVirtualLocation({ location: 'Conference Call' }), true);
});

test('a join link beats whatever the location box says', () => {
  const ev = { location: "Ruth's Chris Steak House", onlineMeetingUrl: 'https://teams.microsoft.com/l/x' };
  assert.equal(isVirtualLocation(ev), true);
  assert.equal(isPhysicalLocation(ev), false);
});

test('a real address is read as a real place', () => {
  assert.equal(isPhysicalLocation({ location: '4200 Westheimer Rd, Houston' }), true);
  assert.equal(isPhysicalLocation({ location: 'Brookhaven Country Club' }), true);
});

test('an empty location proves nothing either way', () => {
  assert.equal(isVirtualLocation({ location: '' }), false);
  assert.equal(isPhysicalLocation({ location: '' }), false);
  assert.equal(isPhysicalLocation({}), false);
});

// ── Reading the title ────────────────────────────────────────────────────────

test('the title names the activity', () => {
  assert.equal(activityTypeFromTitle('Coffee with Dave'),               'COFFEE');
  assert.equal(activityTypeFromTitle('Lunch — Greystar'),               'MEAL');
  assert.equal(activityTypeFromTitle('Dinner with the Alliance team'),  'MEAL');
  assert.equal(activityTypeFromTitle('Breakfast with Alliance'),        'MEAL');
  assert.equal(activityTypeFromTitle('Golf at Brookhaven'),             'GOLF');
  assert.equal(activityTypeFromTitle('Happy hour w/ JPI'),              'HAPPY_HOUR');
  assert.equal(activityTypeFromTitle('Site visit - Trailhead'),         'SITE_VISIT');
  assert.equal(activityTypeFromTitle('Site walk, Skyline Ridge'),       'SITE_VISIT');
  assert.equal(activityTypeFromTitle('Weekly sync'),                    'CALL');
  assert.equal(activityTypeFromTitle('MFE Conference'),                 'EVENT');
});

test('a title with nothing in it says nothing', () => {
  assert.equal(activityTypeFromTitle(''),            null);
  assert.equal(activityTypeFromTitle('   '),         null);
  assert.equal(activityTypeFromTitle(null),          null);
  assert.equal(activityTypeFromTitle('Hold'),        null);
  assert.equal(activityTypeFromTitle('Kershner/Doe'), null);
});

test('golf beats lunch when the title says both', () => {
  assert.equal(activityTypeFromTitle('Golf and lunch with Greystar'), 'GOLF');
});

// ── Title and location together ──────────────────────────────────────────────

test('lunch at a restaurant is in person, and sure of it', () => {
  const v = classifyByTitleAndLocation({ title: 'Lunch with Dave', location: 'Rise Souffle, Dallas' });
  assert.equal(v.activityType, 'MEAL');
  assert.equal(v.isInPerson,   true);
  assert.equal(v.source,       'keyword');
  assert.ok(v.confidence >= 90, `expected high confidence, got ${v.confidence}`);
});

test('lunch with no location typed is still in person, just less sure', () => {
  const v = classifyByTitleAndLocation({ title: 'Lunch with Dave' });
  assert.equal(v.activityType, 'MEAL');
  assert.equal(v.isInPerson,   true);
  assert.ok(v.confidence >= 85 && v.confidence < 95);
});

// Mike, 2026-09-07: "anything with the words golf, lunch, coffee, happy hour in
// the title should automatically be in person." The location box does not argue
// with those four.

test('golf, lunch, coffee and happy hour in the title are in person, full stop', () => {
  const cases = [
    ['Golf with Greystar',   'GOLF'],
    ['Lunch and learn',      'MEAL'],
    ['Breakfast with JPI',   'MEAL'],
    ['Coffee with Dave',     'COFFEE'],
    ['Happy hour w/ JPI',    'HAPPY_HOUR'],
  ];
  for (const [title, type] of cases) {
    // Even with a Teams location AND a join link on the invite.
    const v = classifyByTitleAndLocation({
      title, location: 'Microsoft Teams Meeting',
      onlineMeetingUrl: 'https://teams.microsoft.com/l/x',
    });
    assert.equal(v.activityType, type,  `${title} should be ${type}`);
    assert.equal(v.isInPerson,   true,  `${title} should be in person`);
    assert.ok(v.confidence >= 85, `${title} should be a confident read, got ${v.confidence}`);
  }
});

test('dinner and drinks ride the same rule as lunch and happy hour', () => {
  const dinner = classifyByTitleAndLocation({ title: 'Dinner with Alliance', location: 'Zoom' });
  assert.equal(dinner.activityType, 'MEAL');
  assert.equal(dinner.isInPerson,   true);

  const drinks = classifyByTitleAndLocation({ title: 'Drinks with JPI', location: 'https://zoom.us/j/1' });
  assert.equal(drinks.activityType, 'HAPPY_HOUR');
  assert.equal(drinks.isInPerson,   true);
});

test('a site walk is the one in-person word a Teams link can still overrule', () => {
  const v = classifyByTitleAndLocation({ title: 'Site walk review', location: 'Microsoft Teams Meeting' });
  assert.equal(v.isInPerson,   false);
  assert.equal(v.activityType, 'CALL');

  // On a real site it is still a site visit.
  const real = classifyByTitleAndLocation({ title: 'Site walk - Trailhead', location: '1717 McKinney Ave, Dallas' });
  assert.equal(real.activityType, 'SITE_VISIT');
  assert.equal(real.isInPerson,   true);
});

test('a nothing title with a real address is still read as in person', () => {
  const v = classifyByTitleAndLocation({ title: 'Hold', location: '1717 McKinney Ave, Dallas' });
  assert.equal(v.isInPerson,   true);
  assert.equal(v.activityType, 'OTHER');
  // Weak on purpose — the AI layer gets a chance to do better than this.
  assert.ok(v.confidence < 85, `expected a low-confidence read, got ${v.confidence}`);
});

test('a nothing title with a Teams link is read as a call', () => {
  const v = classifyByTitleAndLocation({ title: 'Hold', location: 'Microsoft Teams Meeting' });
  assert.equal(v.isInPerson,   false);
  assert.equal(v.activityType, 'CALL');
});

test('nothing in the title and nothing in the location gives no answer', () => {
  assert.equal(classifyByTitleAndLocation({ title: 'Hold', location: '' }), null);
  assert.equal(classifyByTitleAndLocation({}), null);
});

// ── The Microsoft seam ───────────────────────────────────────────────────────

const GRAPH_EVENT = {
  id:        'AAMkAGI2_event_1',
  iCalUId:   '040000008200E00074C5B7101A82E008',
  subject:   'Lunch with Greystar',
  location:  { displayName: 'Rise Souffle, Dallas' },
  start:     { dateTime: '2026-09-04T17:00:00.0000000', timeZone: 'UTC' },
  end:       { dateTime: '2026-09-04T18:30:00.0000000', timeZone: 'UTC' },
  organizer: { emailAddress: { address: 'Mike@ILCStudios.com', name: 'Mike Kershner' } },
  attendees: [
    { emailAddress: { address: 'Dave@greystar.com', name: 'Dave Reed' }, type: 'required' },
    { emailAddress: { address: 'sam@greystar.com',  name: 'Sam Lee'   }, type: 'optional' },
  ],
  bodyPreview:  'Looking forward to it',
  isCancelled:  false,
  isOnlineMeeting: false,
  webLink: 'https://outlook.office365.com/x',
};

test('a Microsoft event becomes the neutral shape', () => {
  const ev = fromGraphEvent(GRAPH_EVENT, 'mike@ilcstudios.com');
  assert.equal(ev.externalId,      'AAMkAGI2_event_1');
  assert.equal(ev.title,           'Lunch with Greystar');
  assert.equal(ev.location,        'Rise Souffle, Dallas');
  assert.equal(ev.organizerEmail,  'mike@ilcstudios.com');   // lowercased
  assert.equal(ev.durationMinutes, 90);
  assert.equal(ev.isCancelled,     false);
  assert.equal(ev.startAt.toISOString(), '2026-09-04T17:00:00.000Z');
});

test('the organizer is counted as one of the people in the room', () => {
  const ev = fromGraphEvent(GRAPH_EVENT, 'mike@ilcstudios.com');
  assert.equal(ev.attendeeCount, 3);                       // Mike + Dave + Sam
  assert.equal(ev.attendees[0].email, 'mike@ilcstudios.com');
  assert.equal(ev.attendees[0].isOrganizer, true);
  assert.equal(ev.attendees.some(a => a.email === 'dave@greystar.com'), true);
});

test('an organizer already on the guest list is not counted twice', () => {
  const ev = fromGraphEvent({
    ...GRAPH_EVENT,
    attendees: [
      { emailAddress: { address: 'mike@ilcstudios.com' }, type: 'required' },
      { emailAddress: { address: 'dave@greystar.com'  }, type: 'required' },
    ],
  }, 'mike@ilcstudios.com');
  assert.equal(ev.attendeeCount, 2);
  assert.equal(ev.attendees.filter(a => a.email === 'mike@ilcstudios.com').length, 1);
});

test('a Teams meeting carries its join link through', () => {
  const ev = fromGraphEvent({
    ...GRAPH_EVENT,
    isOnlineMeeting: true,
    onlineMeeting:   { joinUrl: 'https://teams.microsoft.com/l/meetup-join/x' },
    location:        { displayName: 'Microsoft Teams Meeting' },
  }, 'mike@ilcstudios.com');
  assert.equal(ev.onlineMeetingUrl, 'https://teams.microsoft.com/l/meetup-join/x');
  assert.equal(isVirtualLocation(ev), true);
});

test('a Microsoft event reads end to end as in person', () => {
  const ev = fromGraphEvent(GRAPH_EVENT, 'mike@ilcstudios.com');
  const v  = classifyByTitleAndLocation(ev);
  assert.equal(v.activityType, 'MEAL');
  assert.equal(v.isInPerson,   true);
});

test('a loose event from the test panel reads the same way', () => {
  const ev = fromLooseEvent({
    id: 'evt-9', title: 'Golf at Brookhaven', location: 'Brookhaven Country Club',
    attendees: ['dave@greystar.com', 'mike@ilcstudios.com'],
    startAt: '2026-09-04T14:00:00Z', endAt: '2026-09-04T18:00:00Z',
  });
  assert.equal(ev.attendeeCount,   2);
  assert.equal(ev.durationMinutes, 240);
  const v = classifyByTitleAndLocation(ev);
  assert.equal(v.activityType, 'GOLF');
  assert.equal(v.isInPerson,   true);
});

test('the shape is worked out without being told which one it is', () => {
  assert.equal(normalizeEvent(GRAPH_EVENT).externalId, 'AAMkAGI2_event_1');
  assert.equal(normalizeEvent({ id: 'evt-1', title: 'Coffee' }).title, 'Coffee');
});

test('a cancelled meeting is carried through as cancelled', () => {
  const ev = fromGraphEvent({ ...GRAPH_EVENT, isCancelled: true }, 'mike@ilcstudios.com');
  assert.equal(ev.isCancelled, true);
});

test('an event with no attendees and no times does not blow up', () => {
  const ev = fromGraphEvent({ id: 'x', subject: 'Hold' }, '');
  assert.equal(ev.attendeeCount,   0);
  assert.equal(ev.durationMinutes, null);
  assert.equal(ev.startAt,         null);
  assert.equal(classifyByTitleAndLocation(ev), null);
});

// ── Travel days ──────────────────────────────────────────────────────────────
// Mike, 2026-09-07: "so should a work business trip. we should look at how many
// days people are traveling to see clients."

test('a trip reads as travel, not as a meeting', () => {
  for (const title of ['Austin trip', 'Business trip — Phoenix', 'Travel day',
                       'Flight to Denver', 'Out of town all week']) {
    const v = classifyByTitleAndLocation({ title });
    assert.equal(v.activityType, 'TRAVEL', `${title} should read as travel`);
    assert.equal(v.isInPerson,   false,    `${title} is not a meeting in a room`);
    assert.equal(isBusinessType(v.activityType), true, `${title} should be kept`);
  }
});

test('a Teams invite about a trip is a call, not a day on the road', () => {
  const v = classifyByTitleAndLocation({ title: 'Austin trip planning', location: 'Microsoft Teams Meeting' });
  assert.equal(v.activityType, 'CALL');
  assert.equal(v.isInPerson,   false);
});

test('a trip is counted in days, and overlapping trips are only counted once', () => {
  const d = s => new Date(s);
  // An all-day block's end date is the morning after — 3 nights is 3 days.
  assert.equal(travelDays(d('2026-05-04T00:00:00Z'), d('2026-05-07T00:00:00Z'), { isAllDay: true }), 3);
  // A same-day flight is one day, not zero.
  assert.equal(travelDays(d('2026-05-04T09:00:00Z'), d('2026-05-04T11:00:00Z')), 1);
  assert.equal(travelDays(d('2026-05-04T09:00:00Z'), null), 1);
  assert.equal(travelDays(null, null), 0);

  const dates = travelDates([
    { start: d('2026-05-04T00:00:00Z'), end: d('2026-05-07T00:00:00Z'), isAllDay: true },
    { start: d('2026-05-06T00:00:00Z'), end: d('2026-05-08T00:00:00Z'), isAllDay: true },  // overlaps
  ]);
  assert.deepEqual([...dates].sort(), ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07']);
});

// ── The personal stop-list ───────────────────────────────────────────────────
// Mike, 2026-09-07: "all personal events like soccer practice, tennis match,
// doctors appts, therapy should be excluded."

test('personal appointments never reach the CRM', () => {
  for (const title of ['Soccer practice', 'Tennis match', 'Doctor appointment',
                       'Therapy', 'Dentist', 'Haircut', 'Massage', 'Dog grooming',
                       'PT appt', 'Vacation', 'Family trip']) {
    assert.equal(isPersonalEvent({ title }).personal, true, `${title} should be personal`);
    assert.equal(excludeFromNotes({ title }).excluded, true, `${title} should be excluded`);
  }
});

// These are the exact titles that were still slipping through on 2026-09-07.
// Every one carried a real street address, so the location rules read it as a
// genuine in-person meeting and it would have landed in a CRM the team can see.
test('the medical shorthand in his own calendar is caught too', () => {
  for (const title of ['Appt with Dr. Rao ENT', 'Allergy results appt.',
                       'Quest Diagnostics Blood Test', 'PT with Andrzej',
                       'Dr. Nguyen follow up', 'Appointment at LabCorp']) {
    assert.equal(isPersonalEvent({ title }).personal, true, `${title} should be personal`);
    assert.equal(
      isWorthANote({ title, location: '2525 S Downing St, Denver', attendeeEmails: [], attendeeCount: 0 }).bucket,
      'personal',
      `${title} should land in the personal bucket`,
    );
  }
});

test('a work meeting is not mistaken for a personal one', () => {
  for (const title of ['Golf with Greystar', 'Lunch — Greystar', 'Site visit - Trailhead',
                       'Catalina Golf Mixer', 'Austin trip',
                       'Coffee: Mike (ILC) / Cliff (Greystar)', 'Happy hour at the Ptarmigan']) {
    assert.equal(isPersonalEvent({ title }).personal, false, `${title} should not be personal`);
  }
});

test('a reminder to yourself is not a meeting with anybody', () => {
  assert.equal(isNotAMeeting({ title: 'Send golf email' }).notAMeeting, true);
  assert.equal(isNotAMeeting({ title: 'Hold' }).notAMeeting,            true);
  assert.equal(isNotAMeeting({ title: 'Focus time' }).notAMeeting,      true);
  assert.equal(isNotAMeeting({ title: '' }).notAMeeting,                true);
  assert.equal(isNotAMeeting({ title: 'Lunch with Dave' }).notAMeeting, false);
});

// ── What becomes a note ──────────────────────────────────────────────────────

test('the Catalina Golf Mixer survives with nobody invited and a repeating flag', () => {
  const v = isWorthANote({
    title: "ILC Studios Presents 'The Catalina Golf Mixer'",
    location: 'Catalina Golf Club',
    attendeeEmails: [], attendeeCount: 0,
    isRecurring: true, isAllDay: false,
  });
  assert.equal(v.keep,   true);
  assert.equal(v.bucket, 'business title');
  assert.equal(v.verdict.activityType, 'GOLF');
});

test('a repeating meeting is only thrown away when everyone on it works here', () => {
  const internal = isWorthANote({
    title: 'Weekly team standup', location: 'Microsoft Teams Meeting',
    attendeeEmails: ['mike@ilcstudios.com', 'sean@ilcstudios.com'], attendeeCount: 2,
    isRecurring: true,
  });
  assert.equal(internal.keep,   false);
  assert.equal(internal.bucket, 'internal only');

  const external = isWorthANote({
    title: 'Weekly project check', location: 'Microsoft Teams Meeting',
    attendeeEmails: ['mike@ilcstudios.com', 'dave@greystar.com'], attendeeCount: 2,
    isRecurring: true,
  });
  assert.equal(external.keep,   true);
  assert.equal(external.bucket, 'candidate');
});

test('an all-day trip is kept, an all-day nothing is not', () => {
  const trip = isWorthANote({ title: 'Austin trip', attendeeEmails: [], attendeeCount: 0, isAllDay: true });
  assert.equal(trip.keep, true);
  assert.equal(trip.verdict.activityType, 'TRAVEL');

  const block = isWorthANote({ title: 'Kershner/Doe', attendeeEmails: [], attendeeCount: 0, isAllDay: true });
  assert.equal(block.keep, false);
});

test('cancelled and personal beat everything else', () => {
  const cancelled = isWorthANote({ title: 'Lunch with Dave', isCancelled: true, attendeeCount: 2 });
  assert.equal(cancelled.keep,   false);
  assert.equal(cancelled.bucket, 'cancelled');

  // A ski trip reads as travel on its title alone, so the stop-list has to run
  // first or Mike's holidays would land in the CRM as client travel.
  const ski = isWorthANote({ title: 'Ski trip', attendeeCount: 3,
                             attendeeEmails: ['a@example.com', 'b@example.com', 'c@example.com'] });
  assert.equal(ski.keep,   false);
  assert.equal(ski.bucket, 'personal');
});

// ── Mike's rulings of 2026-09-07 (round 2) ───────────────────────────────────

test('a booking an app wrote is not a second meeting', () => {
  for (const title of ['Reservation at Guard and Grace', 'Reservation for 4',
                       'Booking at Tavernetta', 'Table for 2',
                       'Your table at Barolo Grill is confirmed']) {
    assert.equal(isAutoBooking({ title }).autoBooking, true, `${title} should read as a booking`);
    assert.equal(isWorthANote({ title, attendeeCount: 0 }).bucket, 'auto booking', title);
  }
});

test('a meal Mike titled himself is still a meal', () => {
  // The narrow patterns matter: these are real meetings, not app confirmations,
  // and the overlap rule — not the stop-list — is what stops a double count.
  for (const title of ['Dinner reservation at Guard and Grace', 'Lunch — Greystar',
                       'Dinner with Cliff']) {
    assert.equal(isAutoBooking({ title }).autoBooking, false, `${title} should not read as a booking`);
    assert.equal(isWorthANote({ title, attendeeCount: 0 }).keep, true, title);
  }
});

test('a hotel stay is a day on the road', () => {
  for (const title of ['Hotel Stay: Marriott Tampa Westshore',
                       'Stay at Courtyard by Marriott Orlando',
                       'Hotel reservation - Denver',
                       '2 nights at the Ritz']) {
    assert.equal(activityTypeFromTitle(title), 'TRAVEL', title);
  }
});

test('a hotel PROJECT is not a hotel stay', () => {
  // ILC designs hotels. A bare /hotel/ would turn every design review on a hotel
  // job into a travel day, which is why the lodging patterns need a stay word.
  assert.notEqual(activityTypeFromTitle('Virgin Hotel design review'), 'TRAVEL');
  assert.notEqual(activityTypeFromTitle('Fox Park Hotel budget'), 'TRAVEL');
  assert.equal(activityTypeFromTitle('Site visit - Virgin Hotel'), 'SITE_VISIT');
});

test('one meeting per time period — the mixer listed three times counts once', () => {
  // The real listings sit minutes apart — the tee times in his calendar are
  // 3:10p and 3:20p — which is why the window is half an hour and not longer.
  const at = (h, m, mins) => ({ start: new Date(Date.UTC(2025, 4, 8, h, m)),
                                end: new Date(Date.UTC(2025, 4, 8, h, m + mins)) });
  const events = [
    { ...at(15, 0,  240), activityType: 'GOLF', title: 'The Catalina Golf Mixer' },
    { ...at(15, 10, 240), activityType: 'GOLF', title: 'Catalina Golf Mixer Season 2' },
    { ...at(15, 20, 200), activityType: 'GOLF', title: 'Catalina Golf Mixer Season 3' },
  ];
  const { kept, dropped } = dedupeOverlappingMeetings(events);
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 2);
  assert.equal(kept[0].title, 'The Catalina Golf Mixer');
});

test('two meetings that merely touch are two meetings', () => {
  const events = [
    { start: new Date(Date.UTC(2025, 4, 8, 9)),  end: new Date(Date.UTC(2025, 4, 8, 10)),
      activityType: 'COFFEE', title: 'Coffee with Cliff' },
    { start: new Date(Date.UTC(2025, 4, 8, 10)), end: new Date(Date.UTC(2025, 4, 8, 11)),
      activityType: 'COFFEE', title: 'Coffee with Dennis' },
  ];
  assert.equal(dedupeOverlappingMeetings(events).kept.length, 2);
});

test('a named meal beats an unnamed entry over the same hour', () => {
  const events = [
    { start: new Date(Date.UTC(2025, 4, 8, 12)), end: new Date(Date.UTC(2025, 4, 8, 12, 30)),
      activityType: 'OTHER', title: 'Guard and Grace' },
    { start: new Date(Date.UTC(2025, 4, 8, 12)), end: new Date(Date.UTC(2025, 4, 8, 13, 30)),
      activityType: 'MEAL',  title: 'Lunch with Greystar' },
  ];
  const { kept } = dedupeOverlappingMeetings(events);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, 'Lunch with Greystar');
});

test('an all-day block never swallows the meetings underneath it', () => {
  const events = [
    { start: new Date(Date.UTC(2025, 4, 8)), end: new Date(Date.UTC(2025, 4, 9)),
      isAllDay: true, activityType: 'EVENT', title: 'Conference day 1' },
    { start: new Date(Date.UTC(2025, 4, 8, 12)), end: new Date(Date.UTC(2025, 4, 8, 13)),
      activityType: 'MEAL', title: 'Lunch with Greystar' },
    { start: new Date(Date.UTC(2025, 4, 8, 15)), end: new Date(Date.UTC(2025, 4, 8, 16)),
      activityType: 'COFFEE', title: 'Coffee with Cliff' },
  ];
  assert.equal(dedupeOverlappingMeetings(events).kept.length, 3);
});

test('a week of travel never swallows that week of meetings', () => {
  const events = [
    { start: new Date(Date.UTC(2025, 4, 5)), end: new Date(Date.UTC(2025, 4, 9)),
      activityType: 'TRAVEL', title: 'Austin trip' },
    { start: new Date(Date.UTC(2025, 4, 6, 12)), end: new Date(Date.UTC(2025, 4, 6, 13)),
      activityType: 'MEAL', title: 'Lunch in Austin' },
  ];
  assert.equal(dedupeOverlappingMeetings(events).kept.length, 2);
});

test('a real coffee inside a long golf mixer is still its own meeting', () => {
  // The first version of the overlap rule got this wrong: the mixer is a
  // four-hour block, so overlap on its own swallowed genuine meetings that
  // happened to fall inside it.
  const events = [
    { start: new Date(Date.UTC(2025, 4, 8, 15)), end: new Date(Date.UTC(2025, 4, 8, 19)),
      activityType: 'GOLF', title: 'ILC Catalina Golf Mixer' },
    { start: new Date(Date.UTC(2025, 4, 8, 16)), end: new Date(Date.UTC(2025, 4, 8, 17)),
      activityType: 'COFFEE', title: 'Coffee: Mike (ILC) / Jonathan Hafemann' },
    { start: new Date(Date.UTC(2025, 4, 8, 17)), end: new Date(Date.UTC(2025, 4, 8, 18)),
      activityType: 'MEAL', title: 'Lunch: Mike (ILC) / Luke (Shaw)' },
  ];
  assert.equal(dedupeOverlappingMeetings(events).kept.length, 3);
});

test('a confirmation only collapses into a meeting that starts with it', () => {
  const dinner = { start: new Date(Date.UTC(2025, 4, 8, 18)), end: new Date(Date.UTC(2025, 4, 8, 20)),
                   activityType: 'MEAL', title: 'Dinner with Cliff' };
  const onTop  = { start: new Date(Date.UTC(2025, 4, 8, 18)), end: new Date(Date.UTC(2025, 4, 8, 19)),
                   activityType: 'OTHER', title: 'Guard and Grace' };
  const later  = { start: new Date(Date.UTC(2025, 4, 8, 19, 45)), end: new Date(Date.UTC(2025, 4, 8, 21)),
                   activityType: 'OTHER', title: 'Something else entirely' };
  assert.equal(dedupeOverlappingMeetings([dinner, onTop]).kept.length, 1);
  assert.equal(dedupeOverlappingMeetings([dinner, later]).kept.length, 2);
});

test('a delivery window is not a meeting and cannot outrank one', () => {
  // "IKEA delivery- 438646230" beat a real client visit for the same slot in the
  // 2026-09-07 run, because it was the longer block. It is not a meeting at all.
  for (const title of ['IKEA delivery- 438646230', 'Comcast service window',
                       'Appliance delivery', 'Installation window']) {
    assert.equal(isNotAMeeting({ title }).notAMeeting, true, title);
  }
  const visit = isWorthANote({ title: 'Visit: Mike (ILC) / John & team (Tryba)',
                               location: '1620 Market St, Denver', attendeeCount: 3,
                               attendeeEmails: ['a@tryba.com', 'b@tryba.com', 'mike@ilcstudios.com'] });
  assert.equal(visit.keep, true);
});

test('a hotel stay written brand-first still reads as travel', () => {
  assert.equal(activityTypeFromTitle('Hilton Stay Ft. Collins'), 'TRAVEL');
  assert.equal(activityTypeFromTitle('Marriott stay - Tampa'),   'TRAVEL');
  // Still not a travel day just because a hotel is the client.
  assert.notEqual(activityTypeFromTitle('Hilton Garden Inn budget review'), 'TRAVEL');
});

test("the kids' activities are his life, not the company's", () => {
  for (const title of ['Reid gymnastics', 'Karate', 'Cheer practice']) {
    assert.equal(isPersonalEvent({ title }).personal, true, title);
  }
});
