/**
 * Was this meeting in person, and what kind of meeting was it?
 *
 * Mike, 2026-09-07: "when we sync with Microsoft the system should know it's in
 * person through a title or location." That is what this file does — it reads a
 * calendar event's title and location and nothing else.
 *
 * Everything here is pure: no database, no network, no mention of Microsoft. The
 * adapter that turns a Graph event into the neutral shape below lives in
 * normalize.js, and the ladder that puts Mike's own rules and the AI ahead of
 * these keywords lives in src/lib/bot/activityClassifier.js. This file is the
 * part that always works, with no API key and no rules set up.
 *
 * The neutral event shape:
 *   {
 *     title            string
 *     location         string?     what the organizer typed in the location box
 *     body             string?
 *     attendeeCount    number?
 *     organizerEmail   string?
 *     durationMinutes  number?
 *     onlineMeetingUrl string?     a Teams/Zoom join link, when the invite has one
 *   }
 */

/**
 * MEAL used to be called LUNCH.
 *
 * Mike, 2026-09-07: "change to meals and include work breakfast, lunch and
 * dinners." One category covers all three; nothing distinguishes a 7am breakfast
 * with a developer from a 7pm dinner with the same developer. Old notes written
 * before the rename still say LUNCH, so every read path accepts both — run
 * anything coming in through normalizeActivityType and stop thinking about it.
 */
const LEGACY_TYPE_ALIASES = { LUNCH: 'MEAL', DINNER: 'MEAL', BREAKFAST: 'MEAL' };

/** The canonical name for an activity type, with the old names mapped forward. */
export function normalizeActivityType(activityType) {
  const t = String(activityType || '').trim().toUpperCase();
  if (!t) return null;
  return LEGACY_TYPE_ALIASES[t] || t;
}

/** The activity types that mean we were physically in the room with somebody. */
export const IN_PERSON_TYPES = new Set([
  'COFFEE', 'MEAL', 'GOLF', 'HAPPY_HOUR', 'SITE_VISIT',
]);

/**
 * A day spent travelling to see clients.
 *
 * Mike, 2026-09-07: "so should a work business trip. we should look at how many
 * days people are traveling to see clients."
 *
 * TRAVEL is deliberately NOT in IN_PERSON_TYPES. A travel day is not a meeting
 * and must not inflate the in-person meeting count Mike checks by hand — it is
 * its own number, counted in days rather than in meetings. What it IS is
 * business, so the import keeps it (see BUSINESS_TYPES).
 */
export const TRAVEL_TYPE = 'TRAVEL';

/**
 * Everything worth keeping. In-person meetings, plus the two that are real
 * business without being a meeting in a room: a networking event and a travel
 * day. Anything in here survives the import filter no matter which bucket the
 * calendar puts it in.
 */
export const BUSINESS_TYPES = new Set([...IN_PERSON_TYPES, 'EVENT', 'TRAVEL']);

/**
 * Mike's rule, 2026-09-07: "anything with the words golf, lunch, coffee, happy
 * hour in the title should automatically be in person."
 *
 * These four override the location box entirely. A Teams link on an invite
 * titled "Lunch with Greystar" does not make it a call — the link is usually
 * left on the invite by habit, or somebody dialled in to a real lunch. The title
 * wins, full stop.
 *
 * SITE_VISIT is deliberately NOT on this list: a "site walk review" genuinely
 * does get held on Teams. It still follows the location.
 */
export const ALWAYS_IN_PERSON_TYPES = new Set(['GOLF', 'MEAL', 'COFFEE', 'HAPPY_HOUR']);

/** Everything a meeting can be classified as. SKIP means "not worth a note". */
export const ACTIVITY_TYPES = [
  'COFFEE', 'MEAL', 'GOLF', 'HAPPY_HOUR', 'SITE_VISIT', 'TRAVEL', 'CALL', 'EVENT', 'OTHER',
];

export function isInPersonType(activityType) {
  return IN_PERSON_TYPES.has(normalizeActivityType(activityType));
}

/** Is this worth keeping in the CRM at all — a meeting, an event or a trip? */
export function isBusinessType(activityType) {
  return BUSINESS_TYPES.has(normalizeActivityType(activityType));
}

/**
 * The words that give a meeting platform away in a location box. Outlook fills
 * this in itself for a Teams meeting, so it is the single most reliable signal
 * that nobody left their desk.
 */
const VIRTUAL_LOCATION_WORDS = [
  'http', 'teams', 'zoom', 'meet.google', 'webex', 'gotomeeting', 'goto meeting',
  'bluejeans', 'ring central', 'ringcentral', 'skype', 'hangout', 'whereby',
  'virtual', 'online', 'conference call', 'dial-in', 'dial in', 'call-in',
  'phone call', 'microsoft teams meeting',
];

/**
 * Does the location say this happened on a screen rather than in a room?
 *
 * A join link beats everything: if the invite carries one, it is virtual no
 * matter what the location box says.
 */
export function isVirtualLocation(event = {}) {
  if (event.onlineMeetingUrl) return true;
  const loc = String(event.location || '').toLowerCase();
  if (!loc) return false;
  return VIRTUAL_LOCATION_WORDS.some(word => loc.includes(word));
}

/**
 * Does the location name a real place?
 *
 * An empty location box is NOT proof of anything — plenty of real coffees get
 * booked with no location typed — so this returns false for blank, and the
 * caller falls back to the title.
 */
export function isPhysicalLocation(event = {}) {
  const loc = String(event.location || '').trim();
  if (!loc) return false;
  return !isVirtualLocation(event);
}

/**
 * Title keywords, strongest first. Order matters: "golf lunch" is golf, and
 * "coffee catch-up call" is a call only if no in-person word appears at all,
 * which is why CALL is tested last.
 */
const TITLE_KEYWORDS = [
  [/\bgolf\b|\btee time\b|\bdriving range\b|\bscramble\b/i,               'GOLF'],
  [/\bhappy hour\b|\bdrinks\b|\bbrewery\b|\bcocktails?\b|\bbar\b/i,       'HAPPY_HOUR'],
  [/\bsite visit\b|\bsite walk\b|\bwalk ?through\b|\bjob ?site\b|\bpunch ?walk\b|\bsite tour\b/i, 'SITE_VISIT'],
  // One category for breakfast, lunch and dinner — Mike's rule, 2026-09-07.
  [/\blunch\b|\bdinner\b|\bbreakfast\b|\bsupper\b|\bbrunch\b/i,           'MEAL'],
  [/\bcoffee\b|\bcafe\b|\bcaf[eé]\b|\bstarbucks\b/i,                      'COFFEE'],
  // Days on the road to see clients. "trip" and "travel" are here; the personal
  // ones (ski trip, family trip) are caught earlier by the stop-list.
  [/\bbusiness trip\b|\btrip to\b|\b\w+ trip\b|\btravel(?:ling|ing)? to\b|\btravel day\b|\bflight\b|\bfly(?:ing)? (?:to|out)\b|\bout of town\b|\bwheels up\b/i, 'TRAVEL'],
  // A night away is a day on the road. Mike, 2026-09-07, asked whether hotel
  // stays should count as travel: "yes".
  //
  // These stay NARROW on purpose. ILC designs hotels, so a bare /hotel/ would
  // turn "Virgin Hotel design review" into a travel day. Every pattern here
  // needs the word in a staying-somewhere context, not just a building type.
  [/\bhotel (stay|reservation|check-?in|check-?out|booking)\b|^\s*hotel stay\b/i, 'TRAVEL'],
  [/\bstay at\b|\bstaying at\b|\bnights? at\b|\bovernight in\b|\blodging\b/i,     'TRAVEL'],
  // "Hilton Stay Ft. Collins" — the way he actually writes it, brand first and
  // no preposition. The word "stay" and a place to stay have to BOTH be there.
  [/\bstay\b(?=.*\b(hotel|inn|resort|lodge|suites|marriott|hilton|hyatt|westin|sheraton|ritz|kimpton|omni|courtyard|residence inn|embassy|doubletree|hampton)\b)|\b(hotel|inn|resort|lodge|suites|marriott|hilton|hyatt|westin|sheraton|ritz|kimpton|omni|courtyard|residence inn|embassy|doubletree|hampton)\b(?=.*\bstay\b)/i, 'TRAVEL'],
  [/\bconference\b|\btrade ?show\b|\bnetworking\b|\bgala\b|\bawards?\b|\bmixer\b|\bgroundbreaking\b|\bribbon cutting\b/i, 'EVENT'],
  [/\bcall\b|\bzoom\b|\bteams\b|\bphone\b|\bcheck ?in\b|\bsync\b/i,       'CALL'],
];

/** The activity type a title gives away, or null if it says nothing useful. */
export function activityTypeFromTitle(title = '') {
  const text = String(title || '');
  if (!text.trim()) return null;
  for (const [re, type] of TITLE_KEYWORDS) {
    if (re.test(text)) return type;
  }
  return null;
}

/**
 * Read the event using only its title and location.
 *
 * Returns the same shape the rule and AI layers return, so the classifier can
 * hand any of the three straight back to the caller:
 *
 *   { activityType, isInPerson, source: 'keyword', confidence, reason }
 *
 * Returns null only when the title and the location BOTH say nothing — which is
 * the one case worth spending an AI call on.
 */
export function classifyByTitleAndLocation(event = {}) {
  const titleType = activityTypeFromTitle(event.title);
  const virtual   = isVirtualLocation(event);
  const physical  = isPhysicalLocation(event);

  // Golf, lunch, coffee and happy hour in the title are in person and that is
  // the end of it — Mike's rule. The location box does not get a vote.
  if (titleType && ALWAYS_IN_PERSON_TYPES.has(titleType)) {
    return {
      activityType: titleType, isInPerson: true, source: 'keyword',
      confidence: virtual ? 90 : (physical ? 95 : 90),
      reason: virtual
        ? `the title says ${titleType.toLowerCase().replace('_', ' ')} — that is in person whatever the location box says`
        : physical
          ? `the title says ${titleType.toLowerCase().replace('_', ' ')} and the location is a real place`
          : `the title says ${titleType.toLowerCase().replace('_', ' ')}`,
    };
  }

  // A site walk is the one in-person word that a Teams link can still overrule —
  // "site walk review" really does get held on a screen.
  if (titleType && IN_PERSON_TYPES.has(titleType)) {
    if (virtual) {
      return {
        activityType: 'CALL', isInPerson: false, source: 'keyword', confidence: 80,
        reason: `the title says ${titleType.toLowerCase().replace('_', ' ')}, but the location is an online meeting`,
      };
    }
    return {
      activityType: titleType, isInPerson: true, source: 'keyword',
      confidence: physical ? 95 : 85,
      reason: physical
        ? `the title says ${titleType.toLowerCase().replace('_', ' ')} and the location is a real place`
        : `the title says ${titleType.toLowerCase().replace('_', ' ')}`,
    };
  }

  // A day on the road. Not a meeting — it is counted in days, not in meetings —
  // but it is business and it must survive the import. A join link on it means
  // it was a call about the trip, not the trip.
  if (titleType === 'TRAVEL') {
    if (virtual) {
      return {
        activityType: 'CALL', isInPerson: false, source: 'keyword', confidence: 80,
        reason: 'the title mentions travel, but the invite is an online meeting',
      };
    }
    return {
      activityType: 'TRAVEL', isInPerson: false, source: 'keyword', confidence: 85,
      reason: 'the title reads as a day travelling for work',
    };
  }

  // A title that names an event or a call, with nothing in the location to argue.
  if (titleType === 'EVENT') {
    return {
      activityType: 'EVENT', isInPerson: !virtual, source: 'keyword',
      confidence: 85, reason: 'the title names an event',
    };
  }
  if (titleType === 'CALL') {
    return {
      activityType: 'CALL', isInPerson: false, source: 'keyword',
      confidence: virtual ? 95 : 80,
      reason: virtual ? 'the title and the location both say it was a call' : 'the title says it was a call',
    };
  }

  // The title said nothing. Fall back to the location on its own.
  if (virtual) {
    return {
      activityType: 'CALL', isInPerson: false, source: 'keyword',
      confidence: 75, reason: 'the location is an online meeting link',
    };
  }
  if (physical) {
    return {
      activityType: 'OTHER', isInPerson: true, source: 'keyword',
      confidence: 65, reason: `the location is a real place (${String(event.location).trim()})`,
    };
  }

  // Nothing in the title, nothing in the location.
  return null;
}
