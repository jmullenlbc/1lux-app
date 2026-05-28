# ILC Studios — Product Roadmap

Items are grouped by area. Each entry notes what it is, why it matters, and rough scope.

---

## 🏠 Home Dashboard

### Filterable Dashboard Widgets _(future)_
Right now all widgets show pre-built, hardcoded data views. The goal is to let each widget be a fully configurable report — similar to Pipedrive Insights — where the user can set:
- **Metric** (pipeline value, deal count, won value, project count, etc.)
- **Filters** (pipeline type, stage, probability threshold, date range, owner, client, etc.)
- **Visualization** (number, bar chart, list, table)
- **Date range** (this month, this year, next 12 months, custom, etc.)

Each widget would save its config as a named report in the DB. Widgets become containers that run a saved report query. Users can have multiple instances of the same "type" with different filters (e.g., one "Pipeline Value" widget filtered to PROCUREMENT ≥80% and another filtered to DESIGN).

**Scope:** Large (2–3 weeks). Requires a report builder UI, a saved-report DB model, and a query engine that maps report configs to Prisma queries.

---

## 🏗️ CRM / Deals

### Convert Deal → Project _(planned)_
When a deal is marked WON, offer a "Convert to Project" action in the DealDrawer. Pre-fill a new project with the deal's name, client, city, state, building type, service type, and number of units. Link the project back to the originating deal.

**Scope:** Medium. Needs a new API route, a confirmation modal in DealDrawer, and a `dealId` FK on the Project model.

---

## 👥 Sales Reps

### Dedicated SalesRep Model _(future)_
Currently rep data is aggregated from `PeerReviewItem.repName / repEmail`. A proper `SalesRep` model would allow reps to be created independently, assigned to deals/projects directly, and tracked with contact info, territory, and performance history.

**Scope:** Medium. Requires a new Prisma model, migration, and updates to the CRM and Sales Reps pages.

---

---

## ⚖️ Code Intelligence Layer

The Code Intelligence Layer is a multi-phase initiative to embed building code knowledge directly into the ILC workflow — from passive lookup to active QC that flags issues in real project documents before they reach the EOR or client.

### Phase 1 — Code Search _(shipped 2026-05-27)_
A searchable database of building codes (ASHRAE 90.1, IBC, IECC, NEC) accessible from the Knowledge Base. Users can ask natural-language questions and get answers with specific section citations and a confidence level (✅ CERTAIN / ⚠️ LIKELY / 🔍 VERIFY WITH EOR). Uses Claude with prompt caching on the code corpus for cost efficiency.

**Live at:** `/knowledge-base/code-search`

---

### Phase 2 — Document Code Check _(planned)_
Upload a project document — fixture schedule, lighting plan PDF, submittal, or bid — and automatically flag code compliance issues. The system reads the document and cross-references it against the loaded code corpus.

**What it checks:**

| Document Type | What Gets Checked |
|---|---|
| **Fixture Schedule** | LPD per space vs. ASHRAE 90.1 limits; missing control annotations; wet/damp location listing required; exit sign wattage compliance |
| **Lighting Plan / Drawing PDF** | Emergency lighting coverage on egress paths; exit sign placement at required locations; spacing to identify missing fixtures |
| **Bid / Submittal** | Fixture spec vs. schedule discrepancies; listed-for-use compliance (wet/damp markings); wattage vs. LPD budget |
| **Cut Sheets** | Wet/damp/dry location marking present; UL/ETL listing confirmed; IC rating if recessed above insulation |

**How it works:**
1. User uploads document(s) to a project or directly to the Code Check tool
2. User selects which codes apply (ASHRAE, IBC, NEC, IECC)
3. Claude reads the document and applies code checks from Phase 1's corpus
4. Returns a flagged report: `PASS`, `FLAG`, or `VERIFY` per check item
5. Flags are surfaced in the project view and exportable as a PDF QC report

**Scope:** Large. Requires a document parsing pipeline (PDF text extraction + OCR for drawings), a check library (structured JSON rules per code section), and a report UI. The existing `pdf-parse` and `tesseract.js` packages are already in the project.

---

### Phase 3 — Human Error Radar _(future)_
Cross-document consistency checks that catch the kind of errors that happen when drawings, schedules, and bids are produced by different people. Does not require code knowledge — purely data reconciliation.

**Three engines:**

#### Quantity Radar (Drawing ↔ Schedule ↔ Bid)
Parses fixture counts from each document type and flags when they don't match.
- Drawing PDF fixture count vs. schedule row count per type
- Schedule row count vs. bid line-item quantities
- Catches: dropped fixtures, double-counted types, renamed fixtures across documents

#### Specification Radar (Schedule Internal Consistency)
Checks within a single fixture schedule for contradictions or missing data.
- Fixture marked for wet location but no listing annotation
- Dimmer-compatible fixture with no dimmer protocol specified
- Same catalog number with different wattages in different rows
- Emergency fixtures without EM driver or battery backup noted
- CCT/CRI inconsistency across same space type (e.g., 3000K lobby, 2700K lobby alcove)

#### Bid Radar (Bid vs. Schedule Reconciliation)
Compares a received bid against the fixture schedule line by line.
- Line items in bid not found in schedule
- Schedule items missing from bid
- Wattage or lumen output mismatch between bid and schedule
- Alternate products in bid flagged for designer review
- Unit pricing outliers (vs. historical project data)

**How it works:**
1. User uploads two or more documents (e.g., schedule + bid, or drawing + schedule + bid)
2. System extracts structured data from each using OCR + Claude
3. Matching engine aligns items by catalog number, description, and room/space
4. Discrepancies above a configurable threshold are flagged
5. Report shows matched vs. unmatched items and highlights conflicts

**Scope:** Very large. Requires robust document parsing for each format, a matching engine, a historical pricing index for bid outlier detection, and a full report UI. Phase 2 is a prerequisite.

---

_Last updated: 2026-05-27_
