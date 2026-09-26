-- Voice training + company signature template (Mike 9-26).
-- Additive only: three new tables, nothing existing changes.

CREATE TABLE "VoiceBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "fileName" TEXT,
    "source" TEXT NOT NULL,
    "emailsAdded" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceBatch_userId_archivedAt_idx" ON "VoiceBatch"("userId", "archivedAt");
ALTER TABLE "VoiceBatch" ADD CONSTRAINT "VoiceBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceBatch" ADD CONSTRAINT "VoiceBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VoiceSample" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "hash" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceSample_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VoiceSample_userId_hash_key" ON "VoiceSample"("userId", "hash");
CREATE INDEX "VoiceSample_batchId_idx" ON "VoiceSample"("batchId");
CREATE INDEX "VoiceSample_userId_archivedAt_sentAt_idx" ON "VoiceSample"("userId", "archivedAt", "sentAt");
ALTER TABLE "VoiceSample" ADD CONSTRAINT "VoiceSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceSample" ADD CONSTRAINT "VoiceSample_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "VoiceBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailSignatureTemplate" (
    "id" TEXT NOT NULL DEFAULT 'company',
    "template" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailSignatureTemplate_pkey" PRIMARY KEY ("id")
);
INSERT INTO "EmailSignatureTemplate" ("id", "template", "updatedAt")
VALUES ('company', E'{name}\n{title}\n{email}\nc: {phone}', CURRENT_TIMESTAMP);
