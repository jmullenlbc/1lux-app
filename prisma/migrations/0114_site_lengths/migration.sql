-- Homes site lengths (Mike 10-2): the internal wizard's site read records the
-- private drive length and the walkway length, measured off the site plan,
-- so the engine prices drive lights (1 per 81 ft) and bollards / pedestrian
-- poles (1 per 40 ft) without asking. Null = not read. Additive only.
ALTER TABLE "ProjectData" ADD COLUMN "driveLengthFt" DOUBLE PRECISION;
ALTER TABLE "ProjectData" ADD COLUMN "walkwayLengthFt" DOUBLE PRECISION;
