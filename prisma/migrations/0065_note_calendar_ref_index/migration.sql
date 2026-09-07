-- 0065_note_calendar_ref_index
--
-- The calendar sync finds a note by the calendar event's own id on every pass,
-- so that lookup gets an index. Without it, every synced event scans the whole
-- Note table.
--
-- Not unique on purpose: calendarRef can also be typed by hand on a note, and a
-- duplicate must never make a sync fail.
--
-- IF NOT EXISTS so a replay after a halted deploy is harmless.

CREATE INDEX IF NOT EXISTS "Note_calendarRef_idx" ON "Note"("calendarRef");
