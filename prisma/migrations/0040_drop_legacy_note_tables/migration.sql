-- Drop the legacy split note tables. Superseded by the unified "Note" table
-- (noteType discriminator). The SalesNote* tables were never populated in prod
-- (Sean's count: all 0). MeetingNote HAD 4 real prod rows — preserve them into
-- the unified Note table (as PROJECT_MEETING) BEFORE dropping.

-- Preserve EVERY MeetingNote row → Note. If the linked project was deleted, keep
-- the note with projectId = NULL (nullable) rather than dropping it, so nothing is
-- lost and the FK still holds. Idempotent via ON CONFLICT.
INSERT INTO "Note" (
  "id", "noteType", "title", "body", "meetingDate", "attendees",
  "meetingLink", "isExternalVisible", "isPublished", "projectId", "createdAt", "updatedAt"
)
SELECT
  m."id",
  'PROJECT_MEETING',
  m."title",
  m."content",
  CASE WHEN m."meetingDate" ~ '^\d{4}-\d{2}-\d{2}' THEN m."meetingDate"::timestamp ELSE NULL END,
  COALESCE(m."attendees", '[]'),
  m."meetingLink",
  m."isExternalVisible",
  true,
  CASE WHEN m."projectId" IN (SELECT "id" FROM "Project") THEN m."projectId" ELSE NULL END,
  m."createdAt",
  m."updatedAt"
FROM "MeetingNote" m
ON CONFLICT ("id") DO NOTHING;

-- Now drop the legacy tables.
DROP TABLE IF EXISTS "SalesNoteContact" CASCADE;
DROP TABLE IF EXISTS "SalesNoteClient" CASCADE;
DROP TABLE IF EXISTS "SalesNoteDeal" CASCADE;
DROP TABLE IF EXISTS "SalesNote" CASCADE;
DROP TABLE IF EXISTS "MeetingNote" CASCADE;
