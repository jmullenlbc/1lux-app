-- 0120: app-wide settings an admin changes from a screen (Mike 10-7). First
-- use: the password on the public /conceptual_budget tool. Additive only.
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Starting password (Mike 10-7). Change it on Admin > Web budget requests.
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('conceptual_budget_password', 'Lighitngbudget01', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
