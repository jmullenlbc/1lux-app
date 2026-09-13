-- Project location on public conceptual-budget requests. Mike, 2026-09-12:
-- "we need a city and state and zip code. We need location for data tracking."
--
-- Purely additive: three nullable text columns on ConceptualSubmission.
-- Nothing existing is dropped, renamed or changed. Requests made before this
-- have no location and stay blank; the form and /api/intake/submit require it
-- from now on. Columns rather than answer rows, so "every request in Texas" is
-- one plain query.

ALTER TABLE "ConceptualSubmission" ADD COLUMN "city" TEXT;
ALTER TABLE "ConceptualSubmission" ADD COLUMN "state" TEXT;
ALTER TABLE "ConceptualSubmission" ADD COLUMN "zip" TEXT;
