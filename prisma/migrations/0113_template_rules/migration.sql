-- Email Templates (Mike 10-1): more rules than scenario, stage and client type.
-- Service type, pipeline, the contact's role and topic words steer which
-- template the email writers pick as a skeleton. All optional (null = any).
-- Additive only.
ALTER TABLE "MessageTemplate" ADD COLUMN "serviceType" TEXT;
ALTER TABLE "MessageTemplate" ADD COLUMN "pipeline" TEXT;
ALTER TABLE "MessageTemplate" ADD COLUMN "contactRole" TEXT;
ALTER TABLE "MessageTemplate" ADD COLUMN "topicWords" TEXT;
