-- 0128: (a) MarketSource.pullCursorAt, where a page-by-page permit portal
-- (Salt Lake City's Accela) got to before the 22 s slice ended; (b) MacroStat,
-- one national number on one date from FRED's public CSV, read by the macro
-- strip at the top of Market Intelligence (Mike 10-8). Additive only.
ALTER TABLE "MarketSource" ADD COLUMN "pullCursorAt" TIMESTAMP(3);

CREATE TABLE "MacroStat" (
    "id"        TEXT NOT NULL,
    "series"    TEXT NOT NULL,
    "date"      TIMESTAMP(3) NOT NULL,
    "value"     DOUBLE PRECISION NOT NULL,
    "source"    TEXT NOT NULL DEFAULT 'FRED',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacroStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MacroStat_series_date_key" ON "MacroStat"("series", "date");
