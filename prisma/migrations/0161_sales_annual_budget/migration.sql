-- One typed budget and last year spend per area and year (Events and Expenses top numbers).
CREATE TABLE "SalesAnnualBudget" (
  "id" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "budgetCents" INTEGER,
  "typedSpendCents" INTEGER,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesAnnualBudget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesAnnualBudget_area_year_key" ON "SalesAnnualBudget"("area", "year");

ALTER TABLE "SalesAnnualBudget" ADD CONSTRAINT "SalesAnnualBudget_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
