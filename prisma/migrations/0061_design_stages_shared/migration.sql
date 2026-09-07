-- Both CRM pipelines share ONE stage list (Mike, 2026-09-04): the Design board
-- keeps its own column (designStage) and its own membership (service type), but
-- its stages are now Qualified / Pre-Construction / Buyout / Construction /
-- Completed — the same keys as the Procurement board.
--
-- Data remap of the old Design-only keys (mirrors LEGACY_DESIGN_STAGE in
-- src/lib/pipeline.js). "Proposal Sent" was a stage; it is now the
-- proposalSentDate column, so rows sitting in it keep that date and drop to
-- Qualified. Idempotent — re-running finds nothing to update.
UPDATE "Project" SET "proposalSentDate" = COALESCE("proposalSentDate", "updatedAt")
  WHERE "designStage" = 'PROPOSAL_SENT';

UPDATE "Project" SET "designStage" = 'QUALIFIED'       WHERE "designStage" IN ('DESIGN_QUALIFIED', 'PROPOSAL_SENT');
UPDATE "Project" SET "designStage" = 'PRECONSTRUCTION' WHERE "designStage" = 'DESIGN';
UPDATE "Project" SET "designStage" = 'CONSTRUCTION'    WHERE "designStage" = 'CONSTRUCTION_ADMIN';
UPDATE "Project" SET "designStage" = 'COMPLETED'       WHERE "designStage" = 'DESIGN_COMPLETED';

-- New rows start where the Procurement board starts.
ALTER TABLE "Project" ALTER COLUMN "designStage" SET DEFAULT 'QUALIFIED';
