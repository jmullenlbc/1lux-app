-- Add superAdminOnly flag to DesignStandard for KB entries visible only to ILC_ADMIN / SUPER_ADMIN
ALTER TABLE "DesignStandard" ADD COLUMN "superAdminOnly" BOOLEAN NOT NULL DEFAULT false;
