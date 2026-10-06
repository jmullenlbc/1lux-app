-- 0119: who added a person to the CRM (Mike 10-5: "we need to know who adds
-- them"). Additive only. People added before this stay null and count only in
-- the team total on Sales Activity.
ALTER TABLE "ClientContact" ADD COLUMN "createdById" TEXT;
CREATE INDEX "ClientContact_createdById_idx" ON "ClientContact"("createdById");
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
