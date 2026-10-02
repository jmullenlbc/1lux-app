-- Voice Training (Mike 10-1): template suggestions refill themselves. Each one
-- remembers the topic words of the group of emails it was written from, so a
-- saved or put-away template never comes back as a near-twin and the open
-- slots go to new kinds of email. Additive only.
ALTER TABLE "VoiceTemplateSuggestion" ADD COLUMN "topic" TEXT NOT NULL DEFAULT '';
