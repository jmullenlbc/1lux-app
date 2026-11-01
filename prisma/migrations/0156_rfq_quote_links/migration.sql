-- Which RFQ lines a quote row prices. One row can price several RFQ lines, and several
-- rows (housing, trim, optic) add up on one RFQ line (Mike 10-31). RfqQuoteLine.rfqLineId
-- stays in the table but nothing reads it after this.
CREATE TABLE "RfqQuoteLink" (
    "id" TEXT NOT NULL,
    "quoteLineId" TEXT NOT NULL,
    "rfqLineId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqQuoteLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RfqQuoteLink_quoteLineId_rfqLineId_key" ON "RfqQuoteLink"("quoteLineId", "rfqLineId");
CREATE INDEX "RfqQuoteLink_rfqLineId_idx" ON "RfqQuoteLink"("rfqLineId");

ALTER TABLE "RfqQuoteLink" ADD CONSTRAINT "RfqQuoteLink_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "RfqQuoteLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RfqQuoteLink" ADD CONSTRAINT "RfqQuoteLink_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "RfqLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each RFQ line keeps only the row that set its price today. The rest would add up
-- on the next reprice and change a price nobody touched. A typed or cleared price
-- keeps no row. Rows left out keep their status and read as replaced on screen.
INSERT INTO "RfqQuoteLink" ("id", "quoteLineId", "rfqLineId")
SELECT 'link_' || s."id", s."id", s."rfqLineId"
FROM (
  SELECT q."id", q."rfqLineId",
         ROW_NUMBER() OVER (
           PARTITION BY q."rfqLineId"
           ORDER BY CASE WHEN q."unitPrice" = r."dnPrice" THEN 0 ELSE 1 END, q."createdAt" DESC
         ) AS n
  FROM "RfqQuoteLine" q
  JOIN "RfqLine" r ON r."id" = q."rfqLineId"
  WHERE q."status" IN ('AUTO', 'PICKED') AND r."priceSource" IN ('AUTO', 'PICKED')
) s
WHERE s.n = 1;
