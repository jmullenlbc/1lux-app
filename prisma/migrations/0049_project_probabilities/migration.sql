-- Two explicit sales probabilities per project. Average Probability is derived
-- (mean of the two) and never stored — computed in the sales dashboard provider.
ALTER TABLE "Project" ADD COLUMN "probabilityToWin" INTEGER;
ALTER TABLE "Project" ADD COLUMN "probabilityToMoveForward" INTEGER;

-- Seed "% to win" from the existing single probability so nothing regresses.
UPDATE "Project" SET "probabilityToWin" = "pipelineProbability" WHERE "probabilityToWin" IS NULL;
