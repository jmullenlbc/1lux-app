-- Per-person email signature: job title and mobile phone (Mike 9-26).
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- Mike's own, from his Gmail signature (9-26). Everyone else fills theirs in on Profile.
UPDATE "User" SET "jobTitle" = 'Founder and President of Business Development', "phone" = '857.998.0556'
WHERE lower("email") = 'mike@ilcstudios.com' AND "jobTitle" IS NULL AND "phone" IS NULL;
