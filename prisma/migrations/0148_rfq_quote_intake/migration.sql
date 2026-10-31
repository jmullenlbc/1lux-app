-- 0148 RFQ quote intake (Mike 10-30). Additive only.
-- A rep quote can be dropped in as a file, so it keeps its original, the company
-- on it, its date and total. source says how it reached us: DROP now, EMAIL and
-- MICROSOFT once forwarding and the Microsoft connection are built.
ALTER TABLE "RfqQuote" ADD COLUMN "fileId" TEXT;
ALTER TABLE "RfqQuote" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DROP';
ALTER TABLE "RfqQuote" ADD COLUMN "fromName" TEXT;
ALTER TABLE "RfqQuote" ADD COLUMN "fromEmail" TEXT;
ALTER TABLE "RfqQuote" ADD COLUMN "quoteDate" TIMESTAMP(3);
ALTER TABLE "RfqQuote" ADD COLUMN "total" DOUBLE PRECISION;

ALTER TABLE "RfqQuote" ADD CONSTRAINT "RfqQuote_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
