-- AlterTable: add BOH, garage, and exit-signs manual adder columns to ProjectData.
-- These fields were already wired in calculations.js (read from projectData) and
-- rendered in ProjectDataSection.jsx, but the schema columns were missing — so
-- the API silently dropped them and the engine always read 0.
ALTER TABLE "ProjectData" ADD COLUMN "bohManualAdder"      DOUBLE PRECISION;
ALTER TABLE "ProjectData" ADD COLUMN "garageManualAdder"   DOUBLE PRECISION;
ALTER TABLE "ProjectData" ADD COLUMN "exitSignsManualAdder" DOUBLE PRECISION;
