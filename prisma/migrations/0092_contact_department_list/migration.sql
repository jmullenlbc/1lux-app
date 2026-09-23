-- 0092 — the CRM person's department becomes a controlled list (2026-09-19).
--
-- Mike's eight, from CRM ORGANIZATION.xlsx: Corporate, Preconstruction,
-- Construction, Procurement, Design, Development, Architect, Interior Design.
-- Until now ClientContact.department was a free-text box with a five-word
-- suggestion list on one screen, so the same department could be spelled four
-- ways and nothing could be grouped or filtered by it.
--
-- No schema change: the column stays TEXT. This migration only rewrites the
-- text already in it into the keys the app now stores, matching the alias
-- table in src/lib/contactDepartments.js. Case, spaces, hyphens and the two
-- spellings of "pre-construction" are all handled.
--
-- Nothing is deleted. Anything that matches no department is LEFT EXACTLY AS
-- TYPED rather than blanked — the app falls back to showing the raw text, so a
-- person never silently loses their department. 'Finance' is not one of Mike's
-- eight but was on the old suggestion list, so it is kept as a readable-only
-- key that no picker offers.
UPDATE "ClientContact"
SET "department" = CASE UPPER(TRIM(REGEXP_REPLACE("department", '[-_/]+', ' ', 'g')))
  WHEN 'CORPORATE'          THEN 'CORPORATE'
  WHEN 'CORP'               THEN 'CORPORATE'
  WHEN 'HEAD OFFICE'        THEN 'CORPORATE'
  WHEN 'EXECUTIVE'          THEN 'CORPORATE'
  WHEN 'PRECONSTRUCTION'    THEN 'PRECONSTRUCTION'
  WHEN 'PRE CONSTRUCTION'   THEN 'PRECONSTRUCTION'
  WHEN 'PRECON'             THEN 'PRECONSTRUCTION'
  WHEN 'PRE CON'            THEN 'PRECONSTRUCTION'
  WHEN 'CONSTRUCTION'       THEN 'CONSTRUCTION'
  WHEN 'FIELD'              THEN 'CONSTRUCTION'
  WHEN 'OPERATIONS'         THEN 'CONSTRUCTION'
  WHEN 'PROCUREMENT'        THEN 'PROCUREMENT'
  WHEN 'PURCHASING'         THEN 'PROCUREMENT'
  WHEN 'BUYING'             THEN 'PROCUREMENT'
  WHEN 'DESIGN'             THEN 'DESIGN'
  WHEN 'DEVELOPMENT'        THEN 'DEVELOPMENT'
  WHEN 'DEVELOPER'          THEN 'DEVELOPMENT'
  WHEN 'DEV'                THEN 'DEVELOPMENT'
  WHEN 'ARCHITECT'          THEN 'ARCHITECT'
  WHEN 'ARCHITECTURE'       THEN 'ARCHITECT'
  WHEN 'ARCHITECTURAL'      THEN 'ARCHITECT'
  WHEN 'INTERIOR DESIGN'    THEN 'INTERIOR_DESIGN'
  WHEN 'INTERIOR DESIGNER'  THEN 'INTERIOR_DESIGN'
  WHEN 'INTERIORS'          THEN 'INTERIOR_DESIGN'
  WHEN 'ID'                 THEN 'INTERIOR_DESIGN'
  WHEN 'FINANCE'            THEN 'FINANCE'
  WHEN 'ACCOUNTING'         THEN 'FINANCE'
  ELSE "department"
END
WHERE "department" IS NOT NULL AND TRIM("department") <> '';
