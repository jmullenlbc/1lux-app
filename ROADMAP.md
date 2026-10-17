# ILC Studios, Product Roadmap

Items are grouped by area. Each entry notes what it is, why it matters, and rough scope.

---

## 🏠 Home Dashboard

### Filterable Dashboard Widgets _(future)_
Right now all widgets show pre-built, hardcoded data views. The goal is to let each widget be a fully configurable report, similar to Pipedrive Insights, where the user can set:
- **Metric** (pipeline value, deal count, won value, project count, etc.)
- **Filters** (pipeline type, stage, probability threshold, date range, owner, client, etc.)
- **Visualization** (number, bar chart, list, table)
- **Date range** (this month, this year, next 12 months, custom, etc.)

Each widget would save its config as a named report in the DB. Widgets become containers that run a saved report query. Users can have multiple instances of the same "type" with different filters (e.g., one "Pipeline Value" widget filtered to PROCUREMENT ≥80% and another filtered to DESIGN).

**Scope:** Large (2 to 3 weeks). Requires a report builder UI, a saved-report DB model, and a query engine that maps report configs to Prisma queries.

---

## 💰 Budget Summary

### Sales Tax Rate Lookup _(deferred 2026-09-05)_
The summary page has a manual "sales tax %" box (saved to the project as `salesTaxPct`, applied to lighting and controls product, never freight). A look-up-by-ZIP helper was built on 2026-09-05, a small server route proxied a free ZIP-to-rate estimate (SalesTaxZip) and pre-filled the box, with the typed number always winning, and pulled the same day at Mike's request ("Forget the sales tax lookup for now. Put in the roadmap."). If it comes back it should use a paid, maintained rate source (TaxJar / Avalara-style) rather than a free estimate, and pre-fill from the project address ZIP automatically.

**Scope:** Small. One API route + a ZIP field on the widget; the manual box stays the source of truth.

---

## 🏗️ CRM / Deals

### Convert Deal → Project _(planned)_
When a deal is marked WON, offer a "Convert to Project" action in the DealDrawer. Pre-fill a new project with the deal's name, client, city, state, building type, service type, and number of units. Link the project back to the originating deal.

**Scope:** Medium. Needs a new API route, a confirmation modal in DealDrawer, and a `dealId` FK on the Project model.

---

## 🤖 Sales Bot + Automation

### Phase B, Live Follow-Up Drafting _(done)_
Bot scans open deals daily via BotRules (DEAL_STALE trigger). When a deal exceeds the configured stale threshold, Claude Haiku drafts a contextual follow-up email using your templates and Bot Knowledge entries. Drafts appear in Bot Queue → Follow-Ups for review, edit, and manual send (copy to clipboard).

---

### Phase C, Market Signal → Draft _(planned)_
When Market Intelligence auto-links a signal to a client (matchStatus: AUTO_LINKED or SUGGESTED), evaluate active BotRules with `MARKET_SIGNAL` trigger. Rules configured with `DRAFT_FOLLOW_UP_EMAIL` generate a BotDraft; rules with `NOTIFY_ONLY` surface a card in the queue without drafting. Connects Market Intel to Bot Queue automatically.

**Scope:** Medium. Requires wiring the Market Intel signal ingestion pipeline (already built) to the BotRule evaluator, and a new `NOTIFY_ONLY` card type in Bot Queue UI.

---

### Phase D, Travel Detection _(future)_
Nightly scan of the deal owner's M365 calendar using Claude Haiku to extract city from event titles/locations. Upserts `UserLocationState` records. Scheduling Rules panel goes live with detected travel state. Slot resolver applies travel buffer on days the user is outside their home base.

**Requires:** M365 calendar read permission.

**Scope:** Medium. `src/app/api/bot/sync-location` route already stubbed.

---

### Phase E, Scheduling Bot _(future)_
Full inbound scheduling intent detection: emails from prospects expressing interest in a meeting are classified by Claude Haiku. Bot resolves available slots against the deal owner's calendar + SchedulingRules + UserLocationState, drafts a reply proposing 2 to 3 times, and places it in Bot Queue → Scheduling for review. After the review window, auto-sends via Microsoft Graph `sendMail`. Confirmation detection closes the loop by creating a calendar event when the prospect accepts.

**Requires:** M365 email webhook, calendar read, sendMail permission.

**Scope:** Large. All schema models (SchedulingRule, BotDraft, UserLocationState) already built in Phase A.

---

## 👥 Sales Reps

### Dedicated SalesRep Model _(future)_
Currently rep data is aggregated from `PeerReviewItem.repName / repEmail`. A proper `SalesRep` model would allow reps to be created independently, assigned to deals/projects directly, and tracked with contact info, territory, and performance history.

**Scope:** Medium. Requires a new Prisma model, migration, and updates to the CRM and Sales Reps pages.

---

---

## ⚖️ Code Intelligence Layer

The Code Intelligence Layer is a multi-phase initiative to embed building code knowledge directly into the ILC workflow, from passive lookup to active QC that flags issues in real project documents before they reach the EOR or client.

### Phase 1, Code Search _(shipped 2026-05-27)_
A searchable database of building codes (ASHRAE 90.1, IBC, IECC, NEC) accessible from the Knowledge Base. Users can ask natural-language questions and get answers with specific section citations and a confidence level (✅ CERTAIN / ⚠️ LIKELY / 🔍 VERIFY WITH EOR). Uses Claude with prompt caching on the code corpus for cost efficiency.

**Live at:** `/knowledge-base/code-search`

---

### LPD Check v2, Takeoff-Driven _(planned)_
The current LPD Check requires a manually prepared spreadsheet upload. The correct approach: pull fixture types and wattages directly from the project's fixture schedule, pull quantities from the takeoff data already in the system, and compute LPD per space automatically without any manual input.

**What changes:**
- No more spreadsheet upload, data sourced entirely from existing project records
- LPD = Σ(qty × watts) per space zone, where qty comes from takeoffs and watts from the fixture schedule
- Results update automatically when the schedule or takeoff changes
- Surfaces directly on the project's Code tab instead of the standalone tool at `/knowledge-base/lpd-check`

**What's required:**
- Takeoff data must be in the system (takeoff rows linked to space types and fixture types)
- Fixture schedule must have wattages populated
- Space areas needed for W/ft² calculation (can be pulled from takeoff area field or manually entered)

**Scope:** Medium. Mostly a new API route + UI component on the project Code tab. No external parsing needed, all data is in the DB.

---

### Phase 2, Document Code Check _(planned)_
Upload a project document, fixture schedule, lighting plan PDF, submittal, or bid, and automatically flag code compliance issues. The system reads the document and cross-references it against the loaded code corpus.

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

### Phase 3, Human Error Radar _(future)_
Cross-document consistency checks that catch the kind of errors that happen when drawings, schedules, and bids are produced by different people. Does not require code knowledge, purely data reconciliation.

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

### Phase 4, Drawing Intelligence (Claude Vision) _(planned)_
Use Claude Vision to read uploaded lighting plan PDFs and extract structured data: fixture locations by space, control devices, emergency fixtures, exit signs, switch legs. ILC's limited symbol vocabulary (~20 to 40 variations between ILC-designed and reviewed drawings) makes this feasible without a full computer vision pipeline.

**Two-folder training corpus:**
ILC would provide ~100 drawings split into two sets:
1. **ILC-designed**, drawings produced by ILC (consistent symbol conventions, control callouts, emergency notation)
2. **Reviewed/third-party**, drawings ILC reviews for peer review engagements

Claude processes both sets to extract a **design pattern library**: what ILC-designed drawings consistently include (occupancy sensors in corridors, controls at every amenity space, EM drivers called out at egress, etc.). These extracted patterns become the QC rubric.

**What it can check from a drawing:**
- Are occupancy/vacancy sensors called out in corridors?
- Are controls shown at interior amenity spaces (gym, club, lounge)?
- Are emergency fixtures placed at all egress doors and stair landings?
- Are controls shown in electrical rooms, mechanical rooms, janitor closets?
- Do fixture types on the plan match the fixture schedule?
- Are exit signs shown at all required locations?

**How it works (per drawing page):**
1. Drawing PDF → convert to images (one per page)
2. Each page sent to Claude Vision with the ILC symbol reference sheet as context
3. Claude returns structured JSON: `{ fixtures: [{type, location, qty}], controls: [{type, location}], flags: [...] }`
4. Results compared against the QC rule library extracted from ILC's training corpus
5. Discrepancies flagged as: PASS / MISSING / VERIFY

**Key insight:** This is NOT general-purpose floor plan analysis (which is hard). ILC's drawings have a very consistent look, same CAD blocks, same annotation style, same layer conventions. Claude Vision with a few reference examples can reliably read them. lighttable.ai is solving a much harder version of this problem across all drawing styles. ILC only needs to solve it for ~40 fixture symbols and their own drawing conventions.

**Scope:** Large, but achievable in phases. Start with corridor/egress controls check (highest code risk), then expand.

---

### Phase 5A, QC Controls Checklist (Schedule-Based) _(planned)_
Automated check that specific control devices are present in every required space type. Phase 5A attempts this using only fixture schedule data, no drawing analysis required.

**Required coverage per ASHRAE 90.1 Section 9.4:**

| Space Type | Required Control |
|---|---|
| Corridors | Occupancy/vacancy sensor |
| Interior amenity spaces (gym, club, lounge) | Occupancy sensor OR manual-on/auto-off |
| Outside egress doors | Photocontrol (daylight linkage) |
| Electrical rooms | Occupancy sensor |
| Mechanical rooms | Occupancy sensor |
| Janitor / storage rooms | Occupancy sensor |
| Conference / meeting rooms | Occupancy sensor |
| Private offices | Occupancy/vacancy sensor |
| Open office > 250 SF | Daylight zone controls at perimeter |
| Parking garages | Occupancy sensor, daylight sensor at entry |

**Concept:** Check if fixture schedule location tags that have luminaires also have corresponding control device rows. Flag spaces with luminaires but no controls.

**Why this is harder than it sounds:**
- Location tags in the schedule (Corridor, BOH, Amenity, etc.) are broad categories, a single tag maps to multiple distinct space types with different control requirements
- Distinguishing a "control device" row from a "luminaire" row requires consistent schedule data entry (manufacturer, description, type code patterns) that may not always be present
- A control device might exist in the schedule but be associated with the wrong space, or not associated with a space at all
- The ASHRAE requirements vary by space function, project type, and jurisdiction adoption, a flat rule check would produce false positives
- The schedule reflects the designer's intent at time of entry, not what's actually placed in drawings, a sensor could be in the schedule but never placed on the plan

**Phase 5B (drawing-verified):** Cross-check Phase 4's drawing extraction output against the required controls table. More reliable since it reads actual placed devices.

**Needs design work before building:** Requires a clear decision on how controls are represented in the schedule, how space types map to control requirements, and what confidence threshold distinguishes a real flag from noise.

---

_Last updated: 2026-06-04_
