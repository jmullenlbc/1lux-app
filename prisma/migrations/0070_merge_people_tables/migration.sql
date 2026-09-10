-- 0070_merge_people_tables
--
-- Two tables described the same humans:
--   "ClientContact" — people at a client. Carries the project links, the email
--                     links, and everything the client People tab renders.
--   "Contact"       — people we know, company optional. Carries the note links
--                     and the relationship-cadence columns (last in person,
--                     next check-in).
-- So one person's last email lived on one row and their last coffee on another,
-- and no screen could show both at once.
--
-- "ClientContact" survives, because three foreign keys already point at it
-- (ProjectContact, EmailContactLink, Client.contacts) and moving those would
-- rewrite far more rows than moving the one that points at "Contact".
--
-- NO PERSON IS DELETED HERE, and no column is dropped. The old "Contact" table is renamed to
-- "ContactLegacy" and left in place, so this migration can be undone by hand if
-- prod turns up something local did not. A later migration drops it, once Mike
-- has seen the merged screens with real data.
--
-- (The one thing this does delete is a note-to-person LINK that would have
-- existed twice after the merge. The note and both people survive.)
--
-- Do NOT run `prisma db push` against production while "ContactLegacy" exists —
-- it is deliberately absent from schema.prisma, and push would drop it. Amplify
-- runs `prisma migrate deploy`, which leaves it alone.

-- ── 1. A person no longer has to belong to a company ─────────────────────────
-- ...and deleting a company must not delete the human. It used to cascade,
-- which was only ever safe while the table held employees of a client.
ALTER TABLE "ClientContact" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "ClientContact" DROP CONSTRAINT "ClientContact_clientId_fkey";
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. Room for everything the other table knew ──────────────────────────────
ALTER TABLE "ClientContact" ADD COLUMN "contactNumber"    INTEGER;
ALTER TABLE "ClientContact" ADD COLUMN "preferredName"    TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "company"          TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "notes"            TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "cadenceTier"      TEXT;
ALTER TABLE "ClientContact" ADD COLUMN "cadenceDays"      INTEGER;
ALTER TABLE "ClientContact" ADD COLUMN "lastInPersonAt"   TIMESTAMP(3);
ALTER TABLE "ClientContact" ADD COLUMN "lastTouchpointAt" TIMESTAMP(3);
ALTER TABLE "ClientContact" ADD COLUMN "nextCheckInAt"    TIMESTAMP(3);
ALTER TABLE "ClientContact" ADD COLUMN "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── 3. Who is the same person twice? ─────────────────────────────────────────
-- Email is the only thing we can trust to say "same human". A name match alone
-- would happily merge two different Mike Smiths, so names are NOT used.
--
-- And an email only counts if it appears EXACTLY ONCE on each side. A shared
-- address (info@, or one person entered under two companies) would otherwise
-- merge one person into two rows at once, hand both the same contact number,
-- and fail the unique index at step 7 — which halts the deploy. Anything
-- ambiguous is left alone and comes across at step 5 as its own row: a visible
-- duplicate somebody can clean up, instead of a broken deploy.
CREATE TEMPORARY TABLE "_people_match" AS
WITH old_once AS (
  SELECT lower(btrim("email")) AS e, min("id") AS "id"
    FROM "Contact"
   WHERE "email" IS NOT NULL AND btrim("email") <> ''
   GROUP BY lower(btrim("email"))
  HAVING count(*) = 1
), new_once AS (
  SELECT lower(btrim("email")) AS e, min("id") AS "id"
    FROM "ClientContact"
   WHERE "email" IS NOT NULL AND btrim("email") <> ''
   GROUP BY lower(btrim("email"))
  HAVING count(*) = 1
)
SELECT o."id" AS "oldId", n."id" AS "newId"
  FROM old_once o JOIN new_once n ON n.e = o.e;

-- ── 4. Same person: fill in only what the surviving row does not already know ─
UPDATE "ClientContact" cc
   SET "contactNumber"    = COALESCE(cc."contactNumber",    c."contactNumber"),
       "preferredName"    = COALESCE(cc."preferredName",    c."preferredName"),
       "company"          = COALESCE(cc."company",          c."company"),
       "notes"            = COALESCE(cc."notes",            c."notes"),
       "title"            = COALESCE(cc."title",            c."title"),
       "phone"            = COALESCE(cc."phone",            c."phone"),
       "linkedInUrl"      = COALESCE(cc."linkedInUrl",      c."linkedInUrl"),
       "clientId"         = COALESCE(cc."clientId",         c."clientId"),
       "cadenceTier"      = COALESCE(cc."cadenceTier",      c."cadenceTier"),
       "cadenceDays"      = COALESCE(cc."cadenceDays",      c."cadenceDays"),
       "nextCheckInAt"    = COALESCE(cc."nextCheckInAt",    c."nextCheckInAt"),
       -- Dates take the LATER of the two, never the first one found.
       "lastInPersonAt"   = GREATEST(cc."lastInPersonAt",   c."lastInPersonAt"),
       "lastTouchpointAt" = GREATEST(cc."lastTouchpointAt", c."lastTouchpointAt"),
       -- "Known since" is the one date that goes the other way: keep the
       -- EARLIER of the two, so merging two records of the same person never
       -- makes it look like we met them later than we did.
       "createdAt"        = LEAST(cc."createdAt",           c."createdAt")
  FROM "Contact" c
  JOIN "_people_match" m ON m."oldId" = c."id"
 WHERE cc."id" = m."newId";

-- ── 5. Everyone else moves across, keeping their own id ──────────────────────
INSERT INTO "ClientContact" (
  "id", "clientId", "name", "firstName", "lastName", "preferredName", "title",
  "company", "email", "phone", "linkedInUrl", "notes", "contactNumber",
  "cadenceTier", "cadenceDays", "lastInPersonAt", "lastTouchpointAt",
  "nextCheckInAt", "createdAt", "updatedAt"
)
SELECT c."id", c."clientId", c."name",
       -- Same first/last split migration 0063 used on the other table.
       CASE WHEN position(' ' in btrim(c."name")) = 0 THEN btrim(c."name")
            ELSE btrim(substring(btrim(c."name") from 1
                 for length(btrim(c."name")) - position(' ' in reverse(btrim(c."name")))))
       END,
       CASE WHEN position(' ' in btrim(c."name")) = 0 THEN NULL
            ELSE btrim(substring(btrim(c."name")
                 from length(btrim(c."name")) - position(' ' in reverse(btrim(c."name"))) + 2))
       END,
       c."preferredName", c."title", c."company", c."email", c."phone",
       c."linkedInUrl", c."notes", c."contactNumber", c."cadenceTier",
       c."cadenceDays", c."lastInPersonAt", c."lastTouchpointAt",
       c."nextCheckInAt", c."createdAt", c."updatedAt"
  FROM "Contact" c
 WHERE c."id" NOT IN (SELECT "oldId" FROM "_people_match");

-- ── 6. Notes follow their person ─────────────────────────────────────────────
-- Rows whose person was a duplicate move to the survivor; the rest already carry
-- the right id, because step 5 kept it.
--
-- This is written as insert-then-delete, NOT as an UPDATE. One person can only
-- be on one note once, and a straight UPDATE trips that unique index the moment
-- the survivor already has a link to the same note — Postgres checks it per row,
-- immediately, so a dedupe afterwards never gets to run and the deploy halts
-- mid-migration. Inserting with DISTINCT + ON CONFLICT DO NOTHING can't collide,
-- with itself or with what is already there.
INSERT INTO "NoteContact" ("id", "noteId", "contactId", "createdAt")
SELECT DISTINCT ON (nc."noteId", m."newId")
       md5(nc."noteId" || ':' || m."newId"), nc."noteId", m."newId", nc."createdAt"
  FROM "NoteContact" nc
  JOIN "_people_match" m ON m."oldId" = nc."contactId"
 ORDER BY nc."noteId", m."newId", nc."createdAt"
ON CONFLICT ("noteId", "contactId") DO NOTHING;

DELETE FROM "NoteContact"
 WHERE "contactId" IN (SELECT "oldId" FROM "_people_match");

ALTER TABLE "NoteContact" DROP CONSTRAINT "NoteContact_contactId_fkey";
ALTER TABLE "NoteContact" ADD CONSTRAINT "NoteContact_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 6b. Three loose links that no foreign key protects ───────────────────────
-- These columns hold a person's id as plain text, with no foreign key behind
-- them, so nothing above has touched them:
--
--   PlaybookAssignment.contactId    who signs / who gets invoiced
--   PlaybookDistribution.contactId  who receives budgets, schedules, RFIs
--   NoteAction.contactId            the person a follow-up is about
--
-- For anyone step 4 merged, the id they point at has just left the live table.
-- Without this they would quietly read as "nobody" — a proposal signer or a
-- distribution seat going blank, with no error anywhere. So they are pointed at
-- the surviving row, the same way the notes were.
UPDATE "PlaybookAssignment" a
   SET "contactId" = m."newId"
  FROM "_people_match" m
 WHERE a."contactId" = m."oldId";

UPDATE "PlaybookDistribution" d
   SET "contactId" = m."newId"
  FROM "_people_match" m
 WHERE d."contactId" = m."oldId";

UPDATE "NoteAction" n
   SET "contactId" = m."newId"
  FROM "_people_match" m
 WHERE n."contactId" = m."oldId";


-- ── 7. Everyone gets a contact number ────────────────────────────────────────
-- Only the old table ever issued them, so most people have none. Numbering runs
-- oldest first so the numbers read like the order we met people.
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id")
         + COALESCE((SELECT MAX("contactNumber") FROM "ClientContact"), 0) AS n
    FROM "ClientContact"
   WHERE "contactNumber" IS NULL
)
UPDATE "ClientContact" cc
   SET "contactNumber" = numbered.n
  FROM numbered
 WHERE cc."id" = numbered."id";

CREATE UNIQUE INDEX "ClientContact_contactNumber_key" ON "ClientContact"("contactNumber");
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- ── 8. The old table is kept, not dropped ────────────────────────────────────
ALTER TABLE "Contact" RENAME TO "ContactLegacy";
