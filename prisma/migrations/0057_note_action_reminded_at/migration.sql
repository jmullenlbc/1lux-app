-- AddColumn (additive only)
--
-- Records when a note-action reminder was actually delivered. Without it the
-- daily reminder sweep re-fires every day forever: remindAt stays in the past
-- once it has passed, so "is it due?" keeps answering yes.
--
-- Postgres syntax to match the rest of this folder — migrations only ever run
-- against Postgres (Amplify rewrites the provider and runs `migrate deploy`);
-- local SQLite is kept in step with `prisma db push`.
ALTER TABLE "NoteAction" ADD COLUMN IF NOT EXISTS "remindedAt" TIMESTAMP(3);
