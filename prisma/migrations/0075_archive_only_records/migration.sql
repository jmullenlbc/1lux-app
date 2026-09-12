-- Clients, projects, people and notes are archived, never deleted.
-- Mike, 2026-09-11: "yes archive only for everything. it won't be that much data."
--
-- Purely additive: two nullable columns on each of four tables plus a foreign
-- key to the person who archived it. Nothing existing is dropped, renamed or
-- changed, and every row starts out not archived, so every screen looks exactly
-- as it did until somebody archives something.
--
-- The people table is still called ClientContact (model Contact, see 0070).

ALTER TABLE "Client" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "ClientContact" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ClientContact" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "Note" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Note" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "Client" ADD CONSTRAINT "Client_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
