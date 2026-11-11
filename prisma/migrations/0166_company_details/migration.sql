-- Company details for documents (Jason, 2026-11-10): client PDFs and emails now carry the job's company instead of
-- ILC Studios. LOGIQ's trade name, address and email are the ones Mike's public budget tool already prints
-- (src/lib/intake/brand.js). SAGE and Shift stay blank until their details are typed in Admin → Companies.
-- Only fills blanks, so nothing an admin typed is overwritten. Data only, no schema change.
UPDATE "BusinessUnit" SET "legalName" = 'Logiq Supply' WHERE "id" = 'bu_logiq' AND ("legalName" IS NULL OR "legalName" = 'LOGIQ');
UPDATE "BusinessUnit" SET "address" = '2727 W 2nd Ave, Denver, CO 80219' WHERE "id" = 'bu_logiq' AND "address" IS NULL;
UPDATE "BusinessUnit" SET "ordersEmail" = 'mike@logiqsupply.com' WHERE "id" = 'bu_logiq' AND "ordersEmail" IS NULL;
UPDATE "BusinessUnit" SET "website" = 'logiqsupply.com' WHERE "id" = 'bu_logiq' AND "website" IS NULL;

-- Our Offices came seeded (0144) with ILC's phone and orders@ilcstudios.com, which RFQs print. Those no longer
-- reach anyone, so they are cleared where they are still the seeded values; RFQs then fall back to the job's
-- company. Addresses are left for an admin to correct in Admin → Our Offices.
UPDATE "OurOffice" SET "phone" = NULL WHERE "phone" = '720-248-8208';
UPDATE "OurOffice" SET "pricingEmail" = NULL WHERE "pricingEmail" = 'orders@ilcstudios.com';
UPDATE "OurOffice" SET "ordersEmail" = NULL WHERE "ordersEmail" = 'orders@ilcstudios.com';
