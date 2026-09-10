-- 0073 — the memory behind "Things Needing a Look" on the Main dashboard.
--
-- Mike, 2026-09-09: "do we need to have a verification area for things that are
-- conflicting or need attention in general but it can't be overwhelming. like
-- maybe a few a week at most."
--
-- The five checks themselves are worked out fresh every time the card loads, so
-- no problem is ever stored. This table holds only the two things a live
-- recompute cannot know:
--
--   SHOWN     — this item has already been put in front of somebody. Written
--               once, ever, per item. It is the whole reason "at most five new
--               ones a week" is true rather than aspirational: without it, every
--               page load would look like a brand new week.
--   DISMISSED — somebody pressed "That's fine", so the item is buried. A
--               DISMISSED row also carries a snapshot of what the item said, so
--               the archive can still show it in plain words after the record
--               behind it has been fixed, and a restoredAt stamp for when it is
--               brought back. Nothing in this table is ever deleted.
--
-- Purely additive. One new table, its two indexes and one foreign key. No
-- existing table, column, default or type is touched, so there is nothing here
-- that can lose data. The table starts empty.
--
-- The foreign key is ON DELETE SET NULL on purpose, not by habit: with CASCADE,
-- deactivating an employee would delete every item that person had buried and
-- all of them would silently reappear on the dashboard. Losing the name is
-- fine; losing the decision is not.

CREATE TABLE "VerificationAction" (
  "id"        TEXT NOT NULL,
  "itemKey"   TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "userId"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Snapshot of the item as it read when it was buried. Nullable because a
  -- SHOWN row has no use for it.
  "title"      TEXT,
  "detail"     TEXT,
  "href"       TEXT,
  "hrefLabel"  TEXT,

  -- Stamped when somebody pulls the item back out of the archive. NULL means
  -- still buried. Un-burying updates this row rather than deleting it.
  "restoredAt" TIMESTAMP(3),

  CONSTRAINT "VerificationAction_pkey" PRIMARY KEY ("id")
);

-- One row per item per kind, company-wide. "That's fine" is a statement about
-- the data, not about the person who pressed it, so a bury holds for everyone.
CREATE UNIQUE INDEX "VerificationAction_itemKey_kind_key" ON "VerificationAction"("itemKey", "kind");

-- The card counts SHOWN rows written since Monday on every load; this is that
-- count's index.
CREATE INDEX "VerificationAction_kind_createdAt_idx" ON "VerificationAction"("kind", "createdAt");

ALTER TABLE "VerificationAction" ADD CONSTRAINT "VerificationAction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
