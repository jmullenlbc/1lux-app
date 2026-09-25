-- Learn from edits (Mike 2026-09-25): every recap / check-in email keeps the
-- words the bot first wrote, so what a person changed before sending can teach
-- the next draft. Additive only.
ALTER TABLE "BotDraft" ADD COLUMN "aiSubject" TEXT;
ALTER TABLE "BotDraft" ADD COLUMN "aiBody" TEXT;
ALTER TABLE "BotDraft" ADD COLUMN "emailKind" TEXT;

CREATE INDEX "BotDraft_emailKind_idx" ON "BotDraft"("emailKind");
