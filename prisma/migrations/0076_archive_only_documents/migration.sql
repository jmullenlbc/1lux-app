-- Project files, drawing sets, budget matrix versions and products are
-- archived, never deleted. Mike, 2026-09-11: "yes drawings and budgets and
-- products should be archive only" and "like budget matrix, conceptual budget,
-- design questionnaire I don't want to be deleted".
--
-- Purely additive, the same shape as 0075: two nullable columns on each of four
-- tables plus a foreign key to the person who archived it. Nothing existing is
-- dropped, renamed or changed, and every row starts out not archived.
--
-- Conceptual budget submissions and questionnaire answers get no columns: no
-- screen or route deletes them, and the app's database client now refuses any
-- delete of them outright (src/lib/archive.js).

ALTER TABLE "ProjectFile" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ProjectFile" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "DrawingSubmission" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "DrawingSubmission" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "ManufacturerProduct" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ManufacturerProduct" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "DesignBidMatrix" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "DesignBidMatrix" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DrawingSubmission" ADD CONSTRAINT "DrawingSubmission_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturerProduct" ADD CONSTRAINT "ManufacturerProduct_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DesignBidMatrix" ADD CONSTRAINT "DesignBidMatrix_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
