-- Per-user email tone profile (from mbox upload) + template AI direction field

ALTER TABLE "User" ADD COLUMN "toneProfile"        TEXT;
ALTER TABLE "User" ADD COLUMN "toneProfileBuiltAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "toneProfileSource"  TEXT;

ALTER TABLE "MessageTemplate" ADD COLUMN "direction" TEXT;
