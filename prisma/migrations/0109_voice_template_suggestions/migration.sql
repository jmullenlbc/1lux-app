-- Voice section (Mike 9-27). Additive only.
--   VoiceTemplateSuggestion   emails a salesperson writes over and over,
--                             written up as templates they can save.

CREATE TABLE "VoiceTemplateSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whenToUse" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "basedOn" INTEGER NOT NULL DEFAULT 0,
    "recentCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "messageTemplateId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceTemplateSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceTemplateSuggestion_userId_status_idx" ON "VoiceTemplateSuggestion"("userId", "status");
ALTER TABLE "VoiceTemplateSuggestion" ADD CONSTRAINT "VoiceTemplateSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceTemplateSuggestion" ADD CONSTRAINT "VoiceTemplateSuggestion_messageTemplateId_fkey" FOREIGN KEY ("messageTemplateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
