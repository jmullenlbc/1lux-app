-- Unit Selections: who is answering, known rather than typed.
--
-- A staff member opening the survey is its respondent automatically, so their
-- response row now carries their user id. Null for anybody outside ILC (they
-- will arrive on a share link) and for rows recorded on somebody's behalf.
-- Additive only.

ALTER TABLE "UnitSelectionResponse" ADD COLUMN "userId" TEXT;

CREATE INDEX "UnitSelectionResponse_surveyId_userId_idx" ON "UnitSelectionResponse"("surveyId", "userId");
