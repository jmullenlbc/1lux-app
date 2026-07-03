-- Park the deferred Sales-bot capabilities so they aren't lost. Idempotent.
INSERT INTO "RoadmapPriority" ("id", "name", "status", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('rmcrmbottext0001', '[CRM] Sales bot: send texts from note action items (Text method) — bot can''t text yet', 'todo', 9001, NOW(), NOW()),
  ('rmcrmbotcall0001', '[CRM] Sales bot: place/log calls from note action items (Call method) — bot can''t call yet', 'todo', 9002, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
