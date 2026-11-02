-- Change orders, what Mike settled 11-1. Additive only.
-- A line picked from the budget keeps what the product was, so the line's own action
-- tells the kind of change and the PDF can print Was and Now.
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "fromBudget" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "wasFixtureType" TEXT;
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "wasQty" DOUBLE PRECISION;
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "wasUnitPrice" DOUBLE PRECISION;
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "wasUnitCost" DOUBLE PRECISION;
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "wasManufacturer" TEXT;
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "wasPartNumber" TEXT;
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "wasDescription" TEXT;

-- A restocking fee row, tied to its credit.
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "isFee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "feeForLineId" TEXT;
CREATE INDEX "ChangeOrderLineItem_feeForLineId_idx" ON "ChangeOrderLineItem"("feeForLineId");
ALTER TABLE "ChangeOrderLineItem" ADD CONSTRAINT "ChangeOrderLineItem_feeForLineId_fkey" FOREIGN KEY ("feeForLineId") REFERENCES "ChangeOrderLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tax only CO lines, and credits at the rate first charged.
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "isTaxLine" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChangeOrderLineItem" ADD COLUMN "creditTaxPct" DOUBLE PRECISION;
ALTER TABLE "ChangeOrder" ADD COLUMN "taxChangeOldPct" DOUBLE PRECISION;
ALTER TABLE "ChangeOrder" ADD COLUMN "taxChangeNewPct" DOUBLE PRECISION;
ALTER TABLE "ChangeOrder" ADD COLUMN "taxChangeDate" TIMESTAMP(3);
ALTER TABLE "ChangeOrder" ADD COLUMN "taxChangeBase" DOUBLE PRECISION;

-- RFQs for change orders. A CO RFQ sits outside the job's drawing rounds.
ALTER TABLE "Rfq" ADD COLUMN "changeOrderId" TEXT;
CREATE INDEX "Rfq_changeOrderId_idx" ON "Rfq"("changeOrderId");
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RfqLine" ADD COLUMN "changeOrderLineItemId" TEXT;
CREATE INDEX "RfqLine_changeOrderLineItemId_idx" ON "RfqLine"("changeOrderLineItemId");
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_changeOrderLineItemId_fkey" FOREIGN KEY ("changeOrderLineItemId") REFERENCES "ChangeOrderLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
