/**
 * The personal stop-list, what never becomes a sales note.
 *
 * Mike, 2026-09-07: "all personal events like soccer practice, tennis match,
 * doctors appts, therapy should be excluded."
 *
 * This exists because his calendar export has his whole life in it. Therapy with
 * a named therapist, physical therapy, the dentist, haircuts, the dog's
 * grooming, tennis. Every one of those carries a real street address, so the
 * in-person rules read them as real meetings and they would land in a CRM his
 * team can see. That is not acceptable, so this file runs BEFORE anything else
 * and its answer is final: no note, no classification, no AI call, nothing.
 *
 * Two separate jobs live here:
 *   isPersonalEvent, this is his life, not the business. Never a note.
 *   isNotAMeeting, a to-do or a placeholder he parked on the calendar
 *                      ("Send golf email", "Hold", "Placeholder"). Nobody was in
 *                      a room; it is not a meeting.
 *
 * Pure: no database, no network, no imports. Add to the lists, do not add logic.
 */

/**
 * Words that mean this is Mike's own life.
 *
 * Deliberately generous, the cost of wrongly skipping a business meeting is one
 * note he types by hand ("if we miss 10% we can always manually create a note").
 * The cost of wrongly KEEPING one of these is his therapist's name showing up in
 * a shared CRM. Those are not the same size of mistake.
 */
const PERSONAL_PATTERNS = [
  // Medical and health
  /\btherap(y|ist)\b|\bcounsell?ing\b|\bpsychiatrist\b|\bpsychologist\b/i,
  /\bdoctor\b|\bdr\.? ?(appt|appointment|visit)\b|\bphysician\b|\bclinic\b/i,
  /\bdentist\b|\bdental\b|\borthodont/i,
  /\bpt appt\b|\bphysical therapy\b|\boccupational therapy\b|\bot appt\b|\bchiro/i,
  /\bdermatolog|\boptometr|\bophthalmolog|\beye exam\b|\bpediatric/i,
  /\bsurgery\b|\bmri\b|\bx-?ray\b|\bbloodwork\b|\blab work\b|\bcheck-?up\b|\bphysical exam\b/i,
  /\bvaccine\b|\bflu shot\b|\bpharmacy\b|\burgent care\b/i,
  // The shorthand Mike's own calendar actually uses, found in the 2026-09-07 dry
  // run. "Appt with Dr. Rao ENT", "Allergy results appt.", "Quest Diagnostics
  // Blood Test" and "PT with Andrzej" all carried a real street address, so the
  // location rules read them as genuine in-person meetings.
  /\bdr\.\s*[a-z]/i,
  /\ballerg(y|ies|ist)\b|\bblood (test|draw|work)\b/i,
  /\bquest diagnostics\b|\blabcorp\b|\bimaging center\b/i,
  /^\s*(appt|appointment)\b|\bappt\.?\s*$/i,
  /^\s*pt with\b|\bpt session\b/i,

  // Grooming and personal care
  /\bhaircut\b|\bbarber\b|\bsalon\b|\bmassage\b|\bmani(cure)?\b|\bpedi(cure)?\b|\bspa\b/i,

  // Family, pets, home
  /\bgrooming\b|\bgroomer\b|\bvet appt\b|\bveterinar/i,
  /\bschool\b|\bparent[- ]teacher\b|\bcarpool\b|\bdaycare\b|\bpick ?up kids?\b/i,
  /\brecital\b|\bpiano lesson\b|\bswim lesson\b|\bdance class\b/i,
  // His kids' activities, as they appear in the 2026-09-07 run ("Reid
  // gymnastics"). A first name in front of a sport is a parent's calendar entry.
  /\bgymnastics\b|\bkarate\b|\bmartial arts\b|\btae ?kwon ?do\b|\bcheer(leading)?\b/i,
  /\bplumber\b|\belectrician\b|\bhome (repair|inspection)\b|\bmovers?\b/i,

  // Sport and fitness he plays, not sport he entertains at
  /\bsoccer\b|\btennis\b|\bpickleball\b|\bgym\b|\bworkout\b|\bpersonal train(er|ing)\b/i,
  /\b(baseball|basketball|football|lacrosse|volleyball) (practice|game|match|tournament)\b/i,
  /\bpractice\b(?! ?(management|group|lead))/i,

  // Time off, not a meeting with anybody
  /\bvacation\b|\bpto\b|\bday off\b|\bout of office\b|\booo\b|\bholiday\b/i,
  /\b(ski|camping|family|beach) trip\b/i,
  /\bbirthday\b|\banniversary\b|\bfuneral\b|\bwedding\b/i,
];

/**
 * Titles that are a note-to-self, not a meeting. Nobody sat down with anybody.
 *
 * "Send golf email" is the one the dry run caught: it reads as GOLF because the
 * word is in it, and it is a to-do he parked at 9am on a Tuesday.
 */
const NOT_A_MEETING_PATTERNS = [
  /^\s*(send|email|call back|follow ?up on|remind|write|draft|review|prep|submit|pay|book|order|print)\b/i,
  /\bplace ?holder\b|\bhold\b|\bblocked?\b|\bbusy\b|\btentative\b|\bdo not book\b|\bdnd\b/i,
  /\bfocus time\b|\bdeep work\b|\btravel time\b|\bbuffer\b|\bcatch ?up on\b/i,
  /\breminder\b|\bto ?do\b|\bdeadline\b|\bdue\b/i,
  // A delivery or service window is a slot somebody else booked on him. Found in
  // the 2026-09-07 run, where "IKEA delivery- 438646230" sat over a real client
  // visit and, being the longer block, won the same-time-period comparison.
  /\bdeliver(y|ies)\b|\binstall(ation)? window\b|\bservice (call|window|appointment)\b/i,
  /\b(order|confirmation|tracking) ?#?\s*\d{6,}\b|-\s*\d{8,}\s*$/i,
];

/**
 * Confirmations an app dropped on the calendar, not meetings anybody booked.
 *
 * Mike, 2026-09-07: "exclude those. anything auto populated like a reservation
 * probably has a meeting right over it."
 *
 * OpenTable, Resy and the hotel apps write these straight into the calendar. The
 * dinner they confirm is real, but it is almost always already on the calendar as
 * a proper meeting sitting over the same hour, so counting the confirmation too
 * counts the same dinner twice.
 *
 * A hotel stay is deliberately NOT here. That one is a day on the road, and Mike
 * wants those counted (see the travel keywords in inPerson.js).
 */
const AUTO_BOOKING_PATTERNS = [
  /^\s*reservations?\s+(at|for|with)\b/i,
  /^\s*booking\s+(at|for|with)\b/i,
  /^\s*table\s+for\s+\d/i,
  /\byour (table|reservation|booking) (at|is|for)\b/i,
  /\bopentable\b|\bresy\b|\btock\b confirmation/i,
  /\breservation confirm|\bbooking confirm|\border confirm/i,
];

/**
 * Is this a confirmation an app wrote, rather than a meeting somebody booked?
 *
 * @returns { autoBooking: boolean, reason: string|null }
 */
export function isAutoBooking(event = {}) {
  const title = String(event.title || '');
  if (!title.trim()) return { autoBooking: false, reason: null };

  for (const re of AUTO_BOOKING_PATTERNS) {
    const hit = re.exec(title);
    if (hit) {
      return {
        autoBooking: true,
        reason: `"${hit[0].trim()}" reads as a booking confirmation an app added, the real meeting is usually already on the calendar over the top of it`,
      };
    }
  }
  return { autoBooking: false, reason: null };
}

/**
 * Is this Mike's own life rather than the business?
 *
 * @returns { personal: boolean, reason: string|null }
 */
export function isPersonalEvent(event = {}) {
  const title = String(event.title || '');
  if (!title.trim()) return { personal: false, reason: null };

  for (const re of PERSONAL_PATTERNS) {
    const hit = re.exec(title);
    if (hit) {
      return {
        personal: true,
        reason: `"${hit[0].trim()}" in the title says this is personal, not business`,
      };
    }
  }
  return { personal: false, reason: null };
}

/**
 * Is this a to-do or a placeholder rather than a meeting?
 *
 * @returns { notAMeeting: boolean, reason: string|null }
 */
export function isNotAMeeting(event = {}) {
  const title = String(event.title || '');
  if (!title.trim()) return { notAMeeting: true, reason: 'the event has no title' };

  for (const re of NOT_A_MEETING_PATTERNS) {
    const hit = re.exec(title);
    if (hit) {
      return {
        notAMeeting: true,
        reason: `"${hit[0].trim()}" in the title reads as a to-do or a placeholder, not a meeting`,
      };
    }
  }
  return { notAMeeting: false, reason: null };
}

/**
 * The one gate both the live sync and the calendar import run first.
 *
 * @returns { excluded: boolean, kind: 'personal'|'not-a-meeting'|'auto-booking'|null, reason: string|null }
 */
export function excludeFromNotes(event = {}) {
  const personal = isPersonalEvent(event);
  if (personal.personal) return { excluded: true, kind: 'personal', reason: personal.reason };

  const booking = isAutoBooking(event);
  if (booking.autoBooking) return { excluded: true, kind: 'auto-booking', reason: booking.reason };

  const todo = isNotAMeeting(event);
  if (todo.notAMeeting) return { excluded: true, kind: 'not-a-meeting', reason: todo.reason };

  return { excluded: false, kind: null, reason: null };
}
