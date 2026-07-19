# CHANGELOG — ILC Studios Lighting Budget Tool

All notable changes to this project are recorded here.
Format: each session is a dated entry with features added, bugs fixed, and files changed.

---

## [Site/exterior pricing audit — conceptual budget prep] · July 18, 2026

Audited the exterior engine line-by-line against the source questionnaire ("ILC Studios Conceptual lighting_controls design multifamily questionnaire") ahead of the public conceptual-budget intake tool. **7 of 9 lines already matched** — surface parking ($1,325 / 9 stalls), carports (disk every other), detached garage sconces ($80), exterior amenities ($/SF × night multiplier), exterior door sconces (`d × (350+75)/2`, algebraically identical to the sheet's `(d/2)×350 + (d/2)×75`), and the 5% misc buffer. Two gaps found.

### Fixed
- **Landscape lighting ran away on large sites.** `calculations.js` hardcoded `lotSf × 0.02` with no ceiling, against a questionnaire that states *"for most projects do not exceed $3,000"*. A 400,000 SF lot returned **$8,000**; a 1M SF lot returned **$20,000**. Now capped via `Math.min(lotSf × pct, PRICING.exterior.landscape.maxTotal)`. **No-op below 150,000 SF** — typical projects are unchanged. This matters most for the public tool, where an outside user types the lot size unsupervised.
- **The landscape formula ignored master pricing.** `PRICING.exterior.landscape.pctOfNetLotSf` already existed but was never read — editing that rate in `/admin/pricing` had no effect on any budget. Both the rate and the new cap now come from master pricing.
- **The same formula was hardcoded twice.** `ExteriorSection.jsx` carried its own copy of `lotSf * 0.02`, so the UI preview and the engine could drift apart independently. Both now read master pricing — the same "one definition" rule `check-shared-metrics` enforces for win rate.

### Added
- `exterior.exteriorDoor.wallpackWithBattery: 300` and `egressUpliftPct: 0.10` in master pricing, exposed in the pricing admin. **Deliberately not wired to the formula** — the target model (count floor-1 egress doors, add 10%, price a battery wallpack each) is blocked on drawing parsing, and switching it would move that line from $212.50/door to $300/door on every existing project.
- Landscape rate + cap surfaced as editable rows in `PricingEditor.jsx`.

- **A dead pricing admin control.** `PricingEditor.jsx` edited `exterior.surfaceParking.perStall`, but nothing reads that key — the engine and the UI preview both read `perFixture`. Since `perFixture` always exists, **every edit made through that field was silently discarded.** Confirmed in the saved pricing config, which holds both `perFixture: 1325` and an orphaned `perStall: 1325`; they happen to be equal, so no budget was ever wrong, but any edit would have vanished. Editor now targets `perFixture`, the label is corrected ($1,325 buys one fixture covering ~9 stalls, not one stall), and `stallsPerFixture` is now editable.

### Added — public intake groundwork
- **`src/lib/intake.js`** — dependency-free, DB-free helpers for the public conceptual-budget tool: work-email gating (free-mail and disposable-domain blocklists), `resolveClientByDomain`, project-name normalization, and duplicate detection. Written pure so it can be unit-tested without a database and called from an unauthenticated route.
  - Work-email gating does double duty: the domain **is** the client-mapping key, and requiring a corporate domain is most of the spam defense on a form with no CAPTCHA.
  - `resolveClientByDomain` treats an explicit `emailDomains` hit as authoritative but a `website` hit as a **low-confidence suggestion only** — `Client.website` is free text and must never auto-assign a client.
  - Deliberately does **not** reuse `market-intel/normalizer.js#normalizeName`: that normalizer strips "development"/"residential"/"properties" as company noise, which would collapse "Lincoln Avenue" and "Lincoln Avenue Residential" into a false duplicate. Project names get their own lighter normalizer.
- **`scripts/tests/intake.test.mjs`** — 22 unit tests, zero dependencies (`node:test`), wired into `npm run verify` as a new `unit tests` gate. **`npm run verify` is now 8 gates.**

- **A breakdown label that contradicted its own value.** After the cap landed, the line read `Landscape (762,000 SF lot × 2%)` next to `$3,000` — implying $15,240 and looking like a bug. It now shows its work: `Landscape (762,000 SF lot × 2% = $15,240, capped at $3,000)`.

### Impact on existing projects
**6 of 25 affected**, all conceptual, none previously sent outside the company (confirmed by Mike), so no issued quote is contradicted.

| Project | Lot SF | Landscape | Total change |
|---|---:|---|---:|
| Echo Trail Townhomes | 762,000 | $15,240 → $3,000 | **−$14,009 (−8.77%)** |
| Fulshear Lakes | 545,000 | $10,900 → $3,000 | −$9,042 (−1.84%) |
| Modera Easton Park | 453,459 | $9,069 → $3,000 | −$6,946 (−1.32%) |
| Broadstone Southglenn | 221,284 | $4,426 → $3,000 | −$1,632 (−0.20%) |
| Modera Lake Pointe | 209,088 | $4,182 → $3,000 | −$1,353 (−0.16%) |
| Sheridan and Colfax – Option A | 154,809 | $3,096 → $3,000 | −$110 (−0.02%) |

Echo Trail is the case that proves the bug: 64 townhomes on a 762,000 SF lot, where landscape alone was **9.5% of the entire budget**. Townhome/BTR projects have a very large lot relative to building SF, so they are structurally the projects an uncapped lot-SF percentage hits hardest. Every other project moves under 2%.

### Verification
Regression suite 38/38 budget-math assertions, **111,997 fuzz invariant checks** across 8,000 scenarios (0 failures), 12/12 bid matrix. `npm run verify` 8 gates. Production build clean, all 11 runtime assets traced. UI confirmed against the running app on Echo Trail — wizard breakdown and live budget panel both match the engine to the cent.

Full sheet-vs-engine reconciliation: `EXTERIOR_SITE_ENGINE_VS_GOOGLE_SHEET.md` (Software engineering shared drive).

### Flagged, not changed
- `buildingFootprintSf` is read into `calculations.js` and never used — the "lot minus footprint" the UI hint promises is not implemented. Landscape uses raw lot SF. Correcting it would *reduce* existing budgets, so it needs a decision.
- **Surface parking and pathway lighting still need real formulas** (deferred by Mike, "needs a deeper discussion"). Pathway is 100% manual despite `PRICING.exterior.bollard.perUnit = 800` existing and being wired to nothing; `surfaceParking.solarUpgrade = 3000` is likewise unwired.

### Routed to Sean
Schema for the public intake tool (all additive): `Client.emailDomains`, `Project.preconManagerId`, and a `ConceptualSubmission` review-queue model — public submissions must not create live projects until an ILC reviewer accepts them. See `.claude/coordination.md`.

---

## [Verification harness — Slice 2 complete] · July 18, 2026

### Added
- **`check-schema-provider.js`** — fails if `postgresql` is committed. `amplify.yml` sed-swaps `sqlite`→`postgresql` at build; committing the swapped value makes the sed a silent no-op *and* breaks local dev for everyone.
- **`check-env-contract.js`** — asserts all 6 server env vars are baked into `next.config.mjs`. Amplify Gen 1 console vars never reach the SSR Lambda, so a missing one makes a feature return null in prod with no error. **This is the exact class of bug that silently broke all AI parsing.**
- **`check-shared-metrics.mjs`** — fails if a component re-derives win rate or reads legacy `pipelineProbability`. Caught a real defect on its first run: `crm/page.jsx` and `api/pipeline/route.js` selected only the legacy column, so `averageProbability()` was silently falling back instead of showing the true average.
- **`CLAUDE.md` binding** — "You do not decide when a task is done; `npm run verify` decides," a table mapping each gate to the production bug it prevents, and a standing rule that schema changes route to Sean.
- **`.claude/agents/schema-guard.md`** — read-only reviewer that blocks schema diffs, classifies them additive vs destructive, checks a migration exists, and drafts the coordination note. Matters because `db push --accept-data-loss` makes a field removal an irreversible dropped production column.

`npm run verify` now runs **7 static gates**; every one was proven red-then-green.

### Deferred
- Playwright browser verification (Step 9) — the only remaining Slice 2 item; needs a new dev dependency, deprioritised against the conceptual-budget deadline.

---

## [Verification harness — Slice 2, first pass] · July 6, 2026

> Turns two conventions that only prose enforced into **gates that fail**. Both were chosen because they catch the exact bugs the team hit today.

### Added
- **`npm run verify`** (`scripts/verify.mjs`) — runs the gates cheapest-first, stops at the first failure, writes `.claude/last-verify.json`. `--full` adds the production build + runtime-asset check. *The model doing the work no longer decides the work is done.*
- **`scripts/check-runtime-assets.mjs`** — asserts, against the real build trace, that every route needing a **runtime-resolved asset** actually ships it in its Lambda (pdfjs `standard_fonts` × 8 routes, `@sparticuz/chromium` × 3). This is the class of bug where prod silently returns 0 rows while local works. **Wired into `npm run build`**, so it can't regress.
- **`npm run verify:smoke`** (`scripts/tests/smoke.test.mjs`, `node:test`, zero new deps) — logs in and asserts no page/API 500s, that **every ILC role sees projects**, and that any role can open a project it didn't create. The seeded accounts are all ILC_ADMIN and would *not* have caught the visibility bug, so the test stands up a disposable **COMPANY_ADMIN** and deletes it afterwards.

### Proven to actually fail
Both gates were verified red-then-green, not just written:
- Removed the fonts include → `check-runtime-assets` failed naming `/api/projects/[id]/fixture-schedule/parse — missing: standard_fonts`; restored → green.
- Reverted the visibility fix → smoke test failed with `COMPANY_ADMIN sees 0 projects`; restored → 5/5 green, no stray test user left behind.

---

## [Live-app fixes: project visibility + prod PDF parsing] · July 6, 2026

> **Local only — NOT deployed.** Both are production bugs reported by the team.

### Fixed
- **Team couldn't see each other's projects.** Project access was gated to *creator-or-super-admin* in **7 places** (`/api/projects`, `/api/projects/[id]`, the `/dashboard` list, `/pre-con`, and the project `page` / `summary` / `tracker` / `wizard` pages). `isSuperAdmin()` excludes `COMPANY_ADMIN` and `USER`, so e.g. Sean (COMPANY_ADMIN) saw **zero** of the 25 projects (all created by one admin) and got a 404 opening any of them. Projects are now visible to **all ILC staff**; external **Client Viewers stay scoped to their own** — deliberately not widened to `CLIENT_VIEWER`. Verified: as COMPANY_ADMIN, 25 projects returned (was 0) and a non-created project opens 200 (was 404). Also fixed an inconsistency where `/api/projects/[id]` checked `role !== 'ILC_ADMIN'`, which locked out SUPER_ADMINs too.
- **PDF/AI parsing worked locally but returned 0 rows in production.** `pdfjs-dist/standard_fonts/` is resolved at **runtime** via a constructed `file://` path (`ocr.js`, `scheduleExtract.js`, `fixture-schedule/parse`), so Next's output-file tracing never included it — the Lambda traced only `pdfjs-dist/legacy/build`. In prod `standardFontDataUrl` pointed at a missing directory, text extraction yielded nothing, and every AI parse silently returned 0 rows. Same class of bug as the Chromium binary. Added `outputFileTracingIncludes` for the fonts on **all 8 pdfjs routes** (804K / 16 files). Verified in the build trace: 0 → 16 font files per route.

---

## [Weekly Sales Meeting dashboard (v1) + Buyout stage] · July 6, 2026

> **Local only — NOT deployed.** Migration `0051` (additive) pending. Built from analysis of 13 weekly sales-meeting notes: the meetings are a manual, project-by-project status recital (chasing signatures + follow-ups) read off a stale doc — so this replaces the doc with a live, self-maintaining board.

### Added
- **Buyout** procurement stage — inserted between Pre-Construction and Construction in `PIPELINE_STAGES`; flows automatically to the CRM board, project stage selector, dashboards, and bot rules (no migration — `procurementStage` is free text).
- **Weekly Meeting dashboard** — a new **Dashboards → (Sales) → Weekly Meeting** tab (`/dashboards/meeting`): a curated run-of-show, not the field-picker builder. **v1 = two live queues you work down and edit in the meeting**, so the pipeline maintains itself (no carried-forward doc):
  - **① Awaiting signature** — deals with a proposal out (proposal-sent date or Proposal-Sent stage), sorted by days waiting, aged red at 14+ days; a **Signed ✓** action advances the deal off the queue.
  - **② Next actions due** — every open next action, soonest/overdue first, overdue in red; **Done ✓** clears it.
  - Inline **discrete** next-action editor on every row: **Action type** (Call / Chase signature / Send budget / Send photometrics / Schedule GC meeting / Request EE intro / … — `NEXT_ACTION_TYPES`) + **Owner** + **Due date**. Edits PATCH the project and the queues update live.
- **Four discrete Project fields** (migration `0051`): `proposalSentDate`, `nextActionType`, `nextActionOwnerId`, `nextActionDueDate`. New endpoint `GET /api/sales/meeting` computes both queues (days-waiting, overdue) server-side.

### Fixed
- `validDesignStages` in the project PATCH route was missing `CONSTRUCTION_ADMIN` — you couldn't set that design stage via the API. Added.

### Next passes
- More queues (Gone quiet / aging · Closing this month · Ready to invoice · Nexmetro account) + a scorecard strip; auto-stamp `proposalSentDate`/last-touched from activity.

---

## [Client Product Options + Standard Fixture Schedule — matched to LAC] · July 4, 2026

> **Local only — NOT deployed. Schema is Sean's** (see `.claude/coordination.md`): Postgres migration needed for two new models. Modeled directly on the real **Lincoln Avenue** workbook (National Lighting Schedule + Alternate Options sheets); the existing `ClientStandardsAnswer` question bank stays the decision layer.

### Added
- **Product Options approval funnel** — new **Product Options** tab on `clients/[id]`: options grouped by **category** (Vanity, Kitchen Pendants, Ceiling Fans, sconces…), each an **option card** with picture, name, product link, **price estimate + price target**, notes, and **Approve / Reject** (green ring / dimmed). Approved options can be pushed **→ to the fixture schedule**. Full CRUD: **add / edit / remove options** (inline edit; delete with confirm) and **manage categories** (add, **rename** inline, **delete** a whole category). New model `ClientProductOption` + API `/api/clients/[id]/product-options` (incl. bulk `renameCategory` / delete-by-`category`). Matches the LAC "Alternate Options" sheet exactly.
- **Paste-a-link unfurl** — new `POST /api/link-preview`: paste a product URL on an option and it fetches the page's Open Graph image + title, **downloads the thumbnail into storage**, and auto-fills the card (name stays editable) — no manual download/upload. Basic SSRF guard (http/https only, private hosts blocked, timeouts, 8 MB cap).
- **Standard Fixture Schedule table within the client** — **Fixture Schedule** tab: editable, spreadsheet-style table mirroring the LAC "National Lighting Schedule" columns (Type / Location / Description / **Manufacturer / Catalog #** / Finish / CCT / Lumens / Watts / Voltage / Dim / Mounting / Notes) + Target $ and a product image. The exact SKU stays basis-of-design/optional — picked per project. New model `ClientStandardFixture` + API `/api/clients/[id]/standard-fixtures`.
- **Seeded the real LAC standard** (Lincoln Avenue, local): **24 fixtures** (C1–X3, ELUMA/NORA/etc.) + **58 product options** across 6 categories, straight from the workbook.
- **Dashboards: Year-to-Date + Custom Range** time buckets — the Time bucket field now offers **Annual / Year to Date / Custom Range** (with From/To date pickers); YTD/Custom restrict the date window and bucket by month. (`engine.js`, `DashboardView` editor)

### Refinements (July 6)
- **Fixture Schedule**: removed the Image + Target $ columns (those belong to Product Options); table now has **cell borders** like a real schedule; fixed the Location dropdown (text no longer under the arrow).
- **Product Options**: "+ Category" is now a **popup modal** (not an inline field); the link field is a **labeled "Hyperlink" boxed input**; image boxes are **square with object-contain** (fits the whole product image); **thicker** green/red approve/reject frames.
- **Standards tab**: removed three style-picker questions now covered by Product Options — *Preferred pendant styles*, *Preferred balcony fixture styles*, *Unit entry sconce — preferred styles*.
- **Playbook trim** (grounded in the real LAC meeting notes — kept only what was actually discussed): removed the **Logistics** section, **Standing Relationships** (architect/engineer/GC + GC model), cost-tier notes, CO tolerance, mgmt structure, and has-design-team; slimmed **Approvals** from 7 roles to 3 (standards signer, project signer, invoices-to). **Primary markets** is now a **button-per-state** picker (like geographies) instead of a text line. Kept: project types, projects/year, markets, Introductions, Communication, Process & Timeframes, Manual Notes.
- **Payment terms moved to the client Overview** (off the Playbook) — new `Client.paymentTerms`, edited in the Overview modal, shown on the Overview.
- **Schema (migration `0050`)**: new `ClientProductOption` + `ClientStandardFixture` tables; `Client.paymentTerms` added (backfilled from Playbook); dormant `ClientPlaybook` columns dropped; `PlaybookRelationship` table removed.

> **DEPLOYED 2026-07-06** — this deploy ships everything since the last release: the universal dashboard engine + probabilities + win rate (migrations `0048`/`0049`), the client Product Options / Standard Fixture Schedule + Playbook trim (`0050`), and all UI refinements. Full debug pass green (build + 3 migration checks + API smoke + runtime UI).

### Known follow-ups (next passes)
- Phase 3: seed a project `FixtureSchedule` from the client standard table (person picks the SKU per project).
- Controls narrative (A–K per space) — third LAC sheet, not yet built.
- Playbook trim (pending Mike's go) — drop sections not grounded in real LAC discussions.
- Sean: Postgres migration for `ClientProductOption` + `ClientStandardFixture`.

---

## [Universal drag-and-drop dashboard engine — one engine for every department] · July 3, 2026

> **Local only — NOT deployed.** Migrations `0048` + `0049` (both additive) pending. Verified end-to-end against 25 real projects (engine + live API + browser UI + full production build).

### Added
- **One field-picker dashboard engine, per section** (Main / Sales / Pre-Con · Budget) — every dashboard is now built from the same guided widget builder, drag-to-reorder, half/full width, admin-authored default + per-user tweak, shareable.
  - **Curated, layman-labeled field catalog** (`src/lib/dashboards/fieldCatalog.js`) — the picker only ever offers vetted fields, each tagged with an MCP `tier` for the future redact layer.
  - **Guided formula evaluator** (`formula.js`) — Sum/Avg/Count/Min/Max/Median per measure, plus two-measure math (A+B, A−B, A×B, A÷B, A/B ratio, A/B %). No free-form code.
  - **Engine** (`engine.js`) — group by any dimension, time-bucket (week/month/quarter), or **numeric bucket** (e.g. probability tiers); per-group formula eval, filters, ordered/value sort. Bar + line only (no pie).
  - **Section data providers** (`providers.js`) — seam so Budget/MCP-gated sources swap in later without touching the engine.
  - Schema (`0048`): `Dashboard.section` + `ownerUserId` (null = admin default), `DashboardWidget.chartType` + `dataSpec`, new `DashboardShare`.
  - Routes: `/api/dashboards` (resolve/create), `[id]` (rename/delete), `[id]/fork`, `[id]/share`, `[id]/widgets(/[widgetId])`, `/render`. Page `/dashboards/[section]` + `DashboardView` builder + `Chart` (CSP-safe SVG).
- **Three probability fields per project** (`0049`) — **Probability to Win** and **Probability to Move Forward** (editable in the project's Sales Details), plus a derived **Average Probability** (mean of the two, never stored — computed in the sales provider and shown read-only). All three are catalog measures; `probabilityToWin` is backfilled from the legacy single probability so nothing regresses.
- **Win rate on the one engine** — new status-conditional count measures (**Won / Lost / Abandoned / Lost+Abandoned / Decided**, each a filtered count on `procurementStatus`). Win Rate = Won ÷ Decided (%), where Decided = Won + Lost + Abandoned. The formula evaluator now supports a `where` predicate on a measure (`in`/`not_in`/`is`/`gte`/`lte`), which powers these.
- **9 of 10 templates translated to native field-picker widgets** (Revenue forecasts, Pipeline Value by Stage, Deals by Org, Win Rate by Owner/Project Type, Open Pipeline by Probability, Lost+Abandoned by Stage) + a going-forward **template library** (`TEMPLATES_BY_SECTION`) that seeds a new admin default so it's never blank. (Sales Cycle Duration stays on the legacy bridge — needs close timestamps.)
- **Department-level dashboard nav** — a **Dashboard** sub-item under Home (`/dashboards/main`), Sales (`/dashboards/sales`), and Pre-con (`/dashboards/budget`), matching the section menus.
- **Global filter bar** — `/render` returns per-dimension facets from the full row set; `DashboardView` renders a dropdown per plain dimension (Client / Service Type / Stage / Status…), filtering every widget live. Empty-facet dimensions auto-hide.
- **Layman labels everywhere** — dashboards never show raw field values. `serviceType` uses the platform-wide `SERVICE_TYPES` map (Full Design / Design Assist / Peer Review / Bid Only), and Status / Stage / Phase get proper labels too, via a `valueLabels` map on catalog dimensions applied in both charts and the filter bar.
- **Project Type is now a controlled vocabulary** (`PROJECT_TYPES` in `utils.js`) including **BTR (Build to Rent)** — a dropdown in the project's Sales Details, distinct from building form.
- **Overview retired** — `/home` and `/` now redirect to `/dashboards/main`; the "Overview" nav item is gone (legacy `HomeClient` kept in-tree, unused). The **Main dashboard is an executive overview**: New Projects by Month, Product Revenue by Client, Projects by Phase / Service Type / Status / Sales Owner, and company Win Rate. The Main field catalog gained revenue, status, owner, and phase.

### Fixed
- **Seeded template widgets rendered as a single meaningless "Total: 25" bar.** Legacy `category/metric/viewBy` widgets have `dataSpec=null`; the new engine reads only `dataSpec`. `/api/dashboards/render` now bridges any non-`FIELD` empty-spec widget through the original `dashboardEngine.runWidget`, flattening its multi-segment output to `[{label,value}]`. (`src/app/api/dashboards/render/route.js`)
- **Creating a section default didn't demote the existing one** — `POST /api/dashboards` now demotes any existing default in a transaction so there's only ever one.

- **Pre-con (BUDGET) dashboard is live with real budget dollars.** The provider computes each project's product budget the same way the summary does (`calculateBudget` over `pricingSnapshot`/responses → `totalWithControls`) and resolves a single **Budget Value** by priority: a **priced Bid Matrix** > **Design-Questionnaire** budget > **Conceptual** budget (a draft/$0 matrix does not hide the conceptual number). Exposes `budgetValue`, `budgetSource`, `conceptualTotal`, `bidMatrixTotal`. 8 default widgets (Budgets by Type, Budget Value by Client / Source / Month, Budgets Created-by-Month, by Service/Project Type, by Client). Main also grew to 8 (added Projects by Project Type).
- **Default dashboards baked into the seed** — canonical widget lineups live in one CommonJS module (`prisma/seeds/dashboardTemplates.js`) shared by the app and `seed.js`, so they never drift. `seed.js` creates the Main / Sales / Pre-Con admin defaults on deploy (idempotent — only if missing, never clobbers a customized default). **Not yet deployed** — pending local review.

### Known follow-ups
- **Sales Cycle Duration** template needs project close timestamps (`wonAt`/`lostAt`) to move off the legacy bridge.
- Pre-con budget computation runs `calculateBudget` per project on each dashboard load — fine at current scale; revisit (snapshot column) if the project count grows large.

---

## [Project ⇄ Pipeline unification + CRM/Playbook/Standards/Automation module] · July 3, 2026

> **Major release.** Migrations `0030`–`0047`. `MeetingNote`'s 4 prod rows are preserved into the unified `Note` table before the legacy drop.

### Added
- **A project IS the pipeline entity** — the `Deal` model is fully removed and merged into `Project`. One record across budgets, the pipeline, and the CRM; edit any field anywhere → reflected everywhere (no drift).
  - Board membership derived from `serviceType` (Procurement = all; Design = Full Design / Design Assist).
  - **Per-pipeline stages** (`procurementStage` / `designStage`) incl. the new **Construction Admin** design phase; **per-pipeline statuses** (`procurementStatus` / `designStatus`: Open/Won/Lost/Completed/Abandoned).
  - **Out-of-sync badge** with real rules (each Design phase pairs to exactly one Procurement phase).
  - **Sales Owner** = one owner field platform-wide, drawn from Sales-division users (new `User.division`).
  - Pipeline board renders projects; Project Dashboard shows an editable **Sales Details** section.
- **CRM / Sales Notes / Automation module** — unified `Note` table, `NoteAction` taxonomy, Zapier-style if-then `BotRule` engine + `AutomationLog`, intake, bot follow-up (retargeted to projects), CRM pipeline/intel.
- **Playbook v3** — normalized `ClientPlaybook` (`PlaybookRelationship`/`Assignment`/`Distribution`/`Note`), JSON bins dropped.
- **Standards** — `StandardsAnswerConcept` (concept + image).

### Migration notes
- `0040` preserves the 4 `MeetingNote` rows into `Note` (PROJECT_MEETING) **before** dropping the legacy tables; SalesNote* were empty in prod (Sean's count).
- `0043` playbook-JSON drop is a no-op in prod (columns never existed there).
- `0047` removes `Deal` + ecosystem (prod had 0 deals); notes now link via `NoteProject`, drafts via `BotDraft.projectId`.

### Known follow-ups
- Home "upcoming actions" widget empty (projects carry no next-action field yet); dashboard filters on `pipeline`/`lostReason`/`numberOfUnits` are no-ops.

---

## [Bid Matrix — Peer Review/Bid spec routing cleanup + version history renders like the live matrix] · June 25, 2026

> **Deployed to production.**

### Fixed
- **Peer Review / Bid showed the parsed manufacturer in BOTH the Spec and Prop columns.** Projects pushed before the spec/prop routing fix had `propManufacturer` written by the old parse; the later fix backfilled `specManufacturer` too, and the smart-merge never wipes prop — so both populated. The Push to Bid sync now clears auto-polluted prop on re-push: only when prop is text-only (`propManufacturerId` is null — i.e. not a real manufacturer-dropdown selection) **and** its text matches the parsed manufacturer. Genuine ILC proposed products (picked from the dropdown) are never touched. (`src/app/api/projects/[id]/fixture-schedule/publish/route.js`)
- **Version history opened into a separate, design-bid-styled read-only snapshot** (single Manufacturer / Part # column) that looked nothing like the live Budget Matrix. Historical versions now render in the **same column layout as the live matrix** for the project type: Peer Review/Bid show Spec Mfr / Spec # / Prop. Mfr / Prop. Spec (Prop empty — a version is a push-time snapshot, before ILC fills proposed alternates); Design Bid keeps the single Manufacturer / Part # column. No schema change — same stored data, mapped into the right columns. (`src/app/(app)/project/[id]/PeerReviewClient.jsx`)

### Files changed
- `src/app/api/projects/[id]/fixture-schedule/publish/route.js`
- `src/app/(app)/project/[id]/PeerReviewClient.jsx`

---

## [Bid Matrix — parsed Manufacturer/Spec # routes to the right column by project type] · June 25, 2026

> **Deployed to production.**

### Added
- **Push to Bid now routes the parsed fixture Manufacturer + Catalog # to the correct Bid Matrix columns based on `serviceType`:**
  - **Design Bid** projects (`fullDesign` / `designAssist`) → **PROP MFR / PROP SPEC** (`propManufacturer` / `propModel`) — unchanged; these types only ever use the single manufacturer/spec column (the Design Bid View hides the original-Spec columns).
  - **Peer Review / Bid** projects (`peerReview` / `bidOnly`) → **SPEC MFR / SPEC #** (`specManufacturer` / `specModel`), leaving the Prop columns open for ILC's proposed alternates.
- The branch is keyed on the existing `matrixType` derivation in `src/app/api/projects/[id]/fixture-schedule/publish/route.js` and covers both the CREATE and the smart-merge UPDATE paths. Pricing still rides on the prop fields.

### Files changed
- `src/app/api/projects/[id]/fixture-schedule/publish/route.js` — `serviceType`-based spec-vs-prop column routing in the PeerReviewItem sync.

---

## [Hotfix — PDF parsing fixed in production (pdfjs polyfill + fixture-route hardening)] · June 24, 2026

> **Deployed to production** (commit `d4ea191` polyfill, then this commit for the fixture-schedule route — both isolated from the in-progress Sales-Notes/Playbook work).

### Fixed
- **All PDF parsing worked locally but failed in production.** Root cause: `pdfjs-dist` v5 calls `Promise.withResolvers()`, which only exists on Node 22+. Amplify's serverless runtime runs an older Node where it's `undefined`, so every extractor threw before producing text. New `src/lib/pdfPolyfill.js` (a no-op on Node 22+) is imported at the top of all 10 pdfjs extractors.
- **Fixture-schedule parsing returned "0 fixtures imported."** That route still used a bare extractor with none of the serverless font-hardening that fixed the construction schedule. Ported it over to `src/app/api/projects/[id]/fixture-schedule/parse/route.js`: bundled `standardFontDataUrl`, `disableFontFace`, `isEvalSupported:false`, `useSystemFonts:false`, per-page `try/catch`, and precise error surfacing (a blank extraction now reports the real page error instead of a generic message).
- **Made a missing API key explicit.** `getAnthropicKey()` falls back to reading a local `.env` file that doesn't exist in the Amplify bundle. If `ANTHROPIC_API_KEY` isn't set as an Amplify environment variable, every AI parser fails silently in prod. The route now returns a clear "Anthropic API key not configured" error instead.

### Files changed
- `src/lib/pdfPolyfill.js` (new) + import added to all 10 pdfjs extractors (`d4ea191`).
- `src/app/api/projects/[id]/fixture-schedule/parse/route.js` — serverless font-hardening + explicit key check.

---

## [Hotfix — Construction-schedule parser rebuilt for large multi-building schedules] · June 23, 2026

> **Deployed to production** (commits `3cb06d0` window bump, then `a5a903e` v2 rewrite — both isolated from the Session 38 work below).

### Fixed
- **Large construction schedules parsed no milestone dates.** The extractor only fed the AI the first **12,000 characters** and read **30 pages**, and it joined PDF text into a run-on blob. Big multi-building MS Project / P6 exports — Zenith on 25th is **96 pages, 1,800+ rows, ~11 buildings** — place the project-level TCO + Turnover Keys ~character **134,000**, far past the window, so uploads came back empty.
- **First pass** (`3cb06d0`): widened the window to 50k and the page cap to 60. Still cut off the true project end on Zenith (page 48).
- **v2 rewrite** (`a5a903e`, new `src/lib/scheduleExtract.js`):
  - **Row-structured extraction** — groups PDF text items by Y position so each schedule row is one clean line, instead of a run-on stream.
  - **Whole document** — reads all pages and sends up to **180,000 chars** to Claude Haiku (200k context), so project-level start/end aren't truncated.
  - **Multi-building prompt** — earliest start, latest finish/TCO across all buildings; recognizes this schedule's vocabulary ("Meps trades", "Meps Trades First floor" = MEP rough-in).
  - **Deterministic keyword fallback** — if the AI returns nothing, a keyword+date scanner still pulls the core milestones, so a recognizable schedule never yields [].
  - Both the upload and reparse routes now share this module (removed the duplicated inline extractor).
- Verified on the Zenith PDF: **Construction Start 6/1/26, earliest MEP 1/12/27, TCO 5/16/28, Final Completion 6/2/28**, plus 15 MEP rough-ins across buildings A–K. Pure code change — no schema/migration.

---

## [Session 38 — Unified Notes module + actionable AI extraction + admin method taxonomy] · June 23, 2026

> Local only — **not deployed**. Awaiting Mike's "Deploy".

### Added
- **Unified `Note` table** (migration `0035_unified_note`) merging Sales Notes + project Meeting Notes behind a `noteType` discriminator (`SALES` | `PROJECT_MEETING`). Each UI/UX is preserved by filtering on `noteType` and aliasing `content ↔ body` for meeting notes (`toMeetingNote()` helper). Join tables `NoteContact`/`NoteClient`/`NoteDeal`. All sales-notes, project meeting-notes, portal meeting-notes, and project-chat routes repointed to `prisma.note`. Unified search at `GET /api/notes/search?q=&type=`.
- **AI action extraction** (`src/lib/bot/extractNoteActions.js`, Claude Haiku 4.5): turns a note's terse prose into structured **action items** + **intel**, soft-resolving person names to CRM contacts. Runs **automatically** — on note open (if empty), debounced after edits, and on publish. `NoteAction` model (migration `0036`) stores `kind` (ACTION/INTEL), `type`, `rawText`, `detail`, contact/target/company, `status` (SUGGESTED→CONFIRMED/DONE/DISMISSED), `source`. Confirmed/dismissed items are protected from re-extraction.
- **Admin-controlled method taxonomy** (`NoteActionType`, migration `0037_note_action_types`). Action types are now **methods** that tell the bot what to do: **Email, Text, Call, Schedule an event, Expect intro, Send materials, Add to list, Internal task, Intel**. Each type carries an editable **message template** (blank to start; built for DocSend links on Send materials) + **bot instructions**, plus `executor`, `kind`, `description` (feeds the AI classifier), `sortOrder`, `isActive`.
  - **Expect-intro reminder logic** is not hardcoded: an **admin default** "remind after N days" (`NoteActionType.reminderDays`, default 7) **plus a per-line-item override** (`NoteAction.reminderDays`) editable on the action itself.
  - Admin editor at **`/admin/note-actions`** (`NoteActionTypesEditor.jsx`) — light theme, full CRUD, active toggle, template/instructions/reminder fields shown contextually per executor. Sidebar link added (admins).
  - API `GET/POST/PATCH/DELETE /api/crm/note-action-types` (GET any authed user; writes admin-gated). Auto-seeds the 10 default method types on first access (`noteActionTypesStore.js`).
- The note action dropdown + extractor now read the **live DB taxonomy** (not a hardcoded list); the note UI shows the per-item intro reminder (`⏰ remind in Nd`) with an override input.
- **Sales Admin permission + relocation.** The taxonomy editor moved from `/admin/note-actions` to the **Sales Automation tab** (`/sales/automation/actions`, new "Action Types" sub-tab in `AutomationNav`), gated to **Sales Admin or Super Admin**. New `salesAdmin` permission flag (`isSalesAdmin`/`requireSalesAdmin` in `auth.js`; toggle in the Admin → Users editor; surfaced via `/api/auth/me`). Super Admin always qualifies.
- **Contact-tag chips** on action items (`ContactChip` + inline `ContactLinkPicker` in `NotesClient`): the person is a real chip — solid + ✓ when linked to a CRM contact, dashed when unmatched — with a search picker to link/relink/unlink (writes `contactId`).
- **Relationship Intel section** — new `/crm/intel` page (`IntelClient`) + `GET /api/crm/intel`: all INTEL across notes, searchable by person/company/keyword, filter All vs Verified, link each fact to a CRM contact, Confirm (→ verified knowledge) / Dismiss. Sidebar link added under CRM.
- **Light-theme restyle** of the Sales Notes screen (`NotesClient.jsx`) — converted from dark slate-900/800 to the app's light theme.
- **Bot Queue executor** (`src/lib/bot/executeNoteAction.js`): confirming an action hands it to the queue. Message methods (Email/Text/Send materials) create a `BotDraft` (type `FOLLOW_UP`, `PENDING_REVIEW`) from the type's template with `{{firstName}}/{{name}}/{{company}}/{{target}}` substitution, addressed to the linked contact. **Expect-intro** schedules `remindAt = now + reminderDays` (per-item override or type default); the processor `POST /api/bot/process-note-actions` (cron `x-cron-secret` or admin) fires due reminders as queue drafts. Call/Schedule/Add-to-list/Internal-task are marked confirmed to-dos. New `NoteAction` fields `confirmedAt`/`executedAt`/`remindAt`/`botDraftId` (migration `0038_note_action_execution`).

### Automation platform refactor (Zapier-in-app)
- **Generic if-then rule engine** (`src/lib/bot/ruleEngine.js`): a trigger registry (`NOTE_ACTION_CONFIRMED`, `NOTE_PUBLISHED`, `EMAIL_RECEIVED`, `CALENDAR_EVENT_CREATED` — email/calendar marked not-yet-live pending M365 sync), a JSON **condition evaluator** (`match all/any` of `{field, op, value}`), and an **action primitive registry** (`DRAFT_EMAIL`, `NOTIFY`, `SCHEDULE_REMINDER`, `CREATE_TASK`, `ADD_TO_LIST`). `runTrigger()` runs the method's **baseline** action and then every matching **user rule**, logging each fire. Primitives are code; the wiring is data the sales team builds.
- **Note-action confirm rerouted** through the engine (was a hardcoded call) — baseline behavior preserved, user rules layer on top.
- **If-Then builder UI** at `/sales/automation/triggers` (Sales-Admin gated, new `AutomationNav` tab): a When → If (condition rows from the trigger's fields) → Then (action + config) composer, a rule list with active toggle/delete, and a **learning-review table** (fired / accepted / edited / rejected per rule). Reuses `BotRule` for storage; `GET /api/automation/rule-meta` + `GET /api/automation/activity` back the UI.
- **Learning loop ledger** `AutomationLog` (migration `0040_automation_log`): one row per fire with `outcome` (PENDING/ACCEPTED/EDITED/REJECTED). Outcomes recorded from the queue — draft edit → EDITED, cancel → REJECTED (`recordDraftOutcome`). ACCEPTED wires up when real send (Phase B) lands.
- **Legacy tables dropped** (migration `0039_drop_legacy_note_tables`): `SalesNote` + `SalesNoteContact/Client/Deal` + `MeetingNote` removed (superseded by the unified `Note`). Repointed the last live consumer — the Sales Activity dashboard (`dashboardEngine.runSalesActivity`) — to `prisma.note` (`noteType: 'SALES'`). Removed the 5 dead back-relation fields.
- **Bot is gated behind publish (with pause on revert).** Nothing the bot does — drafting emails, scheduling reminders, firing if-then rules — happens while a note is a **draft**. Confirming an action in draft just records it; the publish toggle is the bot's "go" switch. `src/lib/bot/noteActionRunner.js` (`fireNoteActionConfirmed`, `executeNotePublished`, `pauseNoteOnUnpublish`): on publish, every confirmed action runs; on an already-published note, confirming/linking runs immediately. **Reverting to draft pauses the bot** — unsent drafts go to a paused `DRAFT` status (out of the review queue) and reminders clear, but the draft (and any human edits) is preserved; re-publishing **reactivates the same draft** and folds in anything added while paused. Expect-intro reminders count from the publish day. (Pause→edit→re-publish cycle verified.) The note panel shows "✉ on publish" while in draft.
- **One email per contact, automatically (no button).** Confirming an Email / Send-materials / Schedule action no longer drafts one email per item. `composeOutreach.js` consolidates ALL of a contact's confirmed asks into ONE cohesive email (Claude Haiku, deterministic fallback). **Recompose-aware:** an untouched pending draft is fully recomposed as asks are added (one email, verified). **Edit-preserving:** once you've hand-edited the draft, your text is kept and each new ask is appended as a **new paragraph** (AI-written, no extra greeting/sign-off) rather than overwriting your edits. **No double-sends:** asks already on a sent/cancelled draft are never re-included; a genuinely new ask after a send starts a fresh draft. (All three branches verified.) `GET/POST /api/crm/notes/[id]/draft-outreach` retained.
- **Roadmap:** parked "Sales bot: send texts" and "place/log calls" from note actions under CRM (`RoadmapPriority`, migration `0041`) so the deferred Text/Call automation isn't lost.
- **Text & Call are now plain to-dos.** The bot can't send texts or place calls yet (down the road), so confirming a Text/Call action just marks it a confirmed to-do — no draft. (`executeNoteAction` simplified; the per-template draft path removed.)
- **Add a contact from a note action chip.** When a person on an action item isn't in the CRM (e.g. "Rebecca"), the contact-link picker now has **"+ Add new contact"** — enter name + email (+ company, prefilled), it `POST`s to `/api/crm/contacts` and links the action to the new contact. Once linked, the consolidated email picks them up automatically.
- **Merge-token autocomplete in template editors.** Shared token registry + fill (`src/lib/bot/mergeTokens.js`: `{{firstName}}`, `{{name}}`, `{{company}}`, `{{target}}`) is now the single source of truth for both the editors and the bot's fill step. New `TemplateTextarea` component: typing `{` opens a filterable variable menu (↑/↓/Enter), plus a clickable token legend. Wired into the Action Types template field and the If-Then `DRAFT_EMAIL` template; `ruleEngine` + `executeNoteAction` both fill via the shared function (engine now substitutes all tokens, not just firstName).
- **Email/calendar intake layer (app side of M365 sync) + test harness.** `src/lib/bot/intake.js` normalizes a raw provider email/calendar payload into the engine's field shape (`fromDomain` parsing, activity-type inference from the title, in-person vs virtual detection), resolves the ILC owner + CRM contact by email, and fires the trigger. Endpoints `POST /api/automation/intake/email` and `/calendar` (cron-secret or Sales Admin) are the stable boundary M365 Graph sync will call. `EMAIL_RECEIVED`/`CALENDAR_EVENT_CREATED` are now `live` (with a `needsSync` UI hint). **Testable without M365:** `runTrigger` gained a `dryRun` mode (evaluate + report, mutate nothing); `POST /api/automation/test` simulates an event; the If-Then builder has a **"Test a trigger"** panel — fill sample fields, *Dry run* shows which rules would fire, *Run for real* fires and queues drafts.

### Notes
- Verified end-to-end locally: extraction taxonomy; executor drafts + intro reminders; rule engine (conditions match/filter, multiple rules fire, learning outcomes group per rule); dashboard repoint. Checks green (40 migrations, 49 app pages, 112 models).
- Infra TODO: schedule `POST /api/bot/process-note-actions` on the existing `CRON_SECRET` cron. Follow-ups: wire email/calendar **ingestion** to call `runTrigger` (triggers already defined); record ACCEPTED when sending goes live; real `CREATE_TASK`/`ADD_TO_LIST` integrations (currently log-only).

---

## [Session 37 — Standards/Playbook restructure, live share link, pricing] · June 15, 2026

### Added
- **Live share link for Client Standards** (`Share standards` button on the Standards tab → `ShareStandardsButton.jsx`). One persistent, get-or-create token per client; the public page always reflects current selections (`force-dynamic`).
  - New `ClientStandardsShare` model + migration `0028_client_standards_share` (Postgres) / `db push` for local SQLite.
  - API: `POST/GET/DELETE /api/clients/[id]/standards/share` (admin or client creator); `POST /api/share/standards/[token]` for view tracking.
  - Public page `src/app/share/standards/[token]/page.jsx` (no auth) — branded, renders Color Temperature + answered Q&A sections; **Download PDF** via browser print (`PrintButton.jsx`), matching the budget-share pattern.
- **General Design Questions** added to the Standards tab as the **first** section (above Color Temperature) in `src/lib/standards-questions.js`. (Note: the Standards tab reads `standards-questions.js`; `standardsSections.js` is dead/unused scaffold.)

### Changed
- **Playbook tab restructured** into 7 icon-based sections matching the Standards UI (icons + color chips, numbering removed): Scope & Relationships, Approvals, **Process** (renamed from "General Process", data preserved), Expected Timeframes, Pre-con + Bidding, Buyout + Ordering, RFI's + Change Orders. The 5 new sections are "coming soon" placeholders to be built out. Process/relationship topics live in the Playbook, not Standards.
- **Master pricing reconciled to the sheet** (`src/lib/pricing.js`): kitchen pendant 3-small-Low **$150 → $120** ($40/ea); balcony 5″ disk **$0 → $15/unit**; design edge-lit exit sign **$127 → $120**; boiler room disk confirmed $15/unit; bath-bar credit confirmed $45. Regression suite green (budget-math 38/38, fuzz 0 failures, bid-matrix 12/12).
- **Emergency "frogeyes" → flat $0.17/SF** everywhere (was corridor $0.15 / amenity $0.15 / garage $0.10). New single editable knob `emergency.frogeyesPerSf` exposed in the master pricing editor under **Emergency Lighting**; engine special-cases the frogeyes strategy to use it. Other emergency strategies unchanged.
- **Link + Pin wizard QA fixes** (held from earlier this session, included in this deploy): vanity now stores **gross** in master pricing with the engine netting out the $45 bath-bar credit; design ceiling-fan levels ($142/$190/$270) net of the disk credit with a sensible "medium" default; controls hard cap unified at **$180,000**; 7″ disk and unit dimmers shown as **$0** (included in base); balcony fixture always visible and priced from master pricing; corridor **recessed accent downlights** now a manual quantity entered in the section (falls back to Project Data). PricingEditor expanded so all of these (controls building-type rates, fan levels, garage adders, accent rates, vanity gross + credit) are editable.

- **Playbook content — "How We Work Together"** (`src/lib/playbookContent.js` + recursive renderer `src/components/PlaybookContent.jsx`). Populated Scope (intros), Approvals, Process, and Expected Timeframes with the client's standard workflow. Durations render as badges; `{{client}}` tokens substitute the client name (de-named from the NexMetro template). Rendered in the Playbook tab (above the existing forms) and appended to the client share/PDF as a "How We Work Together" block. Sections without content still show "coming soon".

### Notes
- Approvals items are listed; per-item explanatory text still to come from Mike.
- Deployed to production (Mike approved). Migration `0026` applies on Amplify via `prisma migrate deploy`.

---

## [Session 36 — Notification management] · June 12, 2026

### Added
- **Delete individual notifications** — trash-can icon on each notification in the sidebar bell dropdown. New `DELETE /api/alerts` (body `{ ids: [...] }`), scoped to the current user (`userId`) so you can only delete your own. Optimistic UI with restore-on-failure.
- **Mark individual as read** — already supported under the "Dismiss" label; relabeled to **"Mark read"** for clarity. ("Mark all read" unchanged.)
- The in-app bell lives in `Sidebar.jsx`.

### Removed
- **Deleted `src/components/layout/Navbar.jsx`** — dead code. It held a duplicate (and already-drifted) copy of the notification bell but was imported nowhere; the app layout renders `Sidebar`. Verified no references before removing.

---

## [Session 35 — Conceptual Budget Fixes (Broadstone reconciliation)] · June 11, 2026

### Changed
- **Kitchen pendants `threeSmallLow` → $150/unit** (3 × $50, was 3 × $40). Updated static `pricing.js` (product + label) and synced the local DB master-pricing record (`SystemConfig`). Mike had already updated the production master pricing. Verified: Broadstone 359 units × $150 = $53,850 (matches sheet). `npm test` 38/38 + fuzz green.

### Added
- **Exterior section restructured into two parts:**
  - **Exterior Formula Breakdown (frozen / read-only):** the lines the formula auto-calculates — Surface parking, Carports, Detached garages, Exterior door sconces, Miscellaneous (5% buffer). Each shows the underlying **math in parentheses** (e.g. "54 stalls ÷ 9 = 6 fixtures × $1,325"). Updates live from project data; not editable. **Exterior amenities are NOT listed here** — they're configured + shown by the amenity question cards above (now with their own total line), so the breakdown excludes them to avoid double-display. Breakdown subtotal = formula total − amenities; amenities + breakdown = formula total (budget unchanged).
  - **Exterior Lighting Manual Adder (editable):** the 3 items the formula does NOT compute — Pathway lighting, Parking entrances, Manual exterior adder. Stored as JSON in `exterior.exteriorManualItems`. These **ADD** on top of the formula subtotal (no double-counting). Exterior amenities removed from this section (it lives in the frozen breakdown).
  - **Exterior Total = Formula Subtotal + Manual Adder Total** (or the lump override, which still replaces everything when set). Engine returns `manualAdderTotal`. Verified end-to-end (formula + manual = total, override precedence, suite 38/38 + fuzz green). Replaces the earlier "itemized build / pre-populate" approach.

### Changed — wizard sections now read from Master Pricing (root-cause fix for drift)
The repeated UI/engine drifts all had one cause: section previews **hardcoded** pricing constants while the engine read from Master Pricing (`/admin/pricing` → DB, via `loadPricing`). Fixed at the root: the wizard page already loads that pricing and passes it to `WizardClient`/`DesignWizardClient` — now added `pricing` to the shared section props, and each section reads its costs from it (with the static `pricing.js` as a safety fallback). The section previews and the engine now read **one source**, so they can't diverge, and editing Master Pricing updates both at once.
- **Units:** base $/SF, undercabinet, kitchen pendants, vanity, balcony, entry-disk, boiler, 52" fan — all driven from `pricing`. (This also resolves the vanity conceptual/Q6 display split — the card now shows whatever Master Pricing says.)
- **Corridors:** disk/recessed spacing tables, flat disk rate, stairwell, elevated adder, unit sconces, accent downlights, garage levels — all from `pricing`; stale "× $160" / "× $175" labels now dynamic.
- **Exterior:** amenity $/SF rates, parking, carport, garage, door sconces, misc buffer — all from `pricing` (landscape 2% / door-averaging kept hardcoded to match the engine's own hardcodes).
- **Amenities:** interior $/SF named-level rates from `pricing`.
- **Emergency:** `calcEmergency` now takes the live pricing object.

**Design Questionnaire** uses a separate set of components (`sections/design/Design*`) — these were ALSO hardcoded (and carried the same live divergences). Converted all of them to read from `pricing` too:
- **DesignCorridors:** accent **$160→$120**, disk default 0.25→0.27, stairwell/sconce/elevated rates — all from master + stale "$160/$175" labels now dynamic.
- **DesignUnits:** undercabinet line-voltage **$90→$125**, kitchen pendant **$40/$120→$50/$150**, vanity `illuminatedMirrorLow` **$0→$130** (and all vanity/pendant/entry/boiler costs) — from master.
- **DesignInteriorAmenities** ($6/$10/$15), **DesignGarage** ($0.30/$0.45 base; control adders kept hardcoded to match engine), **DesignEmergency** (strategy rates + battery), and **Controls** (rate table + energy-credit %) — all from master.
- Verified: build compiles (116 pages), suite 38/38 + fuzz, exterior UI matches engine on all 23 projects.

### Fixed (UI-vs-engine debugging sweep, all wizard sections)
Systematically replicated every section's client-side preview math and compared to `calculateBudget` across all 23 real projects. Fixed each section-preview that had drifted from the engine (the engine/sidebar was always authoritative — these were display bugs):
- **Corridors — accent downlights:** UI hardcoded $160/ea; engine uses $120 (`designCorridors.accentDownlightEach`). Fixed UI → $120.
- **Corridors — disk rate default:** with no fixture-spacing answer the UI used $0.25/SF; engine uses the $0.27/SF flat default. Fixed UI → $0.27 (undercounted 10 projects, e.g. Broadstone −$1,153).
- **Interior Amenities — legacy named levels:** projects with `interiorLevel` = `low`/`medium`/`high` (8 of 23) showed "$NaN" because the UI did `Number('low')`. Fixed UI to map named→rate (low 6 / medium 10 / high 15), matching the engine.
- **Units — kitchen pendant card:** still showed "$40 ea / $120" (pre-change); updated to "$50 ea / $150" to match master pricing.
- **Units — undercabinet line voltage card:** showed "+$90/unit"; master is $125. Fixed → $125.
- Verified: Corridors, Amenities, Emergency, and Exterior previews now match the engine on all 23 projects.
- **KNOWN / not changed:** Units **vanity** option costs differ in conceptual mode (UI 100/250/75/175 vs engine net 155/205/80/205) — tied to the open Q6 (vanity net-vs-gross). Left for Mike's decision; changing it touches calibration.

- **Exterior door sconces UI/engine divergence (odd door counts).** Debugging sweep compared the Exterior section's client-side preview against the engine across all 23 projects. The UI priced door sconces as `ceil(doors/2)×$350 + floor(doors/2)×$75` (rounds up for odd counts), but the engine + spreadsheet use `doors × ($350+$75)/2`. On odd door counts (e.g. Sheridan & Colfax, 15 doors) the section showed ~$144 more than the sidebar. Fixed the UI to the averaged formula; UI now matches the engine on all 23 projects. (Found via a full-DB engine validation: all totals finite/non-negative, exterior reconciles, manual-adder edge cases — malformed JSON, non-numeric, negatives, legacy 9-key data — all handled without crash or double-count.)
- **Exterior UI/engine divergence (landscape).** The Exterior section's local preview hard-coded `autoLandscape = 0`, but the engine computes Landscape = 2% of lot SF. On projects with `lotSf` (e.g. Modera Town Lake, lot 117,612) this made the in-section "Exterior Total" ($48,456.45) disagree with the sidebar "Exterior & Site" ($50,926.30) by $2,469.85 (= $2,352.24 landscape × 1.05 buffer). Fixed the UI to compute landscape from `projectData.lotSf` and show a "Landscape (lot SF × 2%)" line in the frozen breakdown. Engine unchanged — budget/calibration untouched; the two now agree.

### Confirmed correct (no change)
- **Exit signs:** app uses `perSf 0.025` and halves above 300K SF. Mike confirmed this is correct as-is — leaving the 300K halving rule and Sean's regression test in place.

---

## [Session 34 — CRM Batch 2: Sales Dashboards + Disabled Sections] · June 11, 2026

### Added

**Sales-activity dashboard widgets** (`src/lib/dashboardEngine.js` + `DashboardsClient.jsx`):
- New **Sales Activity** category — queries `SalesNote`. Metrics: Activities, In-Person Meetings, Unique Clients. View by month/quarter/rep/activity type/organization.
- New **Proposals** category — queries `Proposal`. Metrics: Sent, Accepted, Accepted Value ($), Acceptance Rate (%). View by month/quarter/rep/organization/status/type.
- Category-aware view-by options (`viewByOptionsFor`), per-category stat strips, and $/% Y-axis formatting.
- Both run through the existing `runWidget` engine — no new API routes. Verified against live data (643 activities, proposals sent/accepted).

**Location Type → CreatableSelect** on Scheduling Rules — admins can type-to-add new location types (mirrors the meeting-type pattern); seeds from defaults + existing rules.

**Collapsible "Disabled" sections** (`components/salesAutomation/DisabledSection.jsx`):
- Bot Rules, Templates, and Bot Knowledge now move soft-disabled items into a collapsed "Disabled" section, keeping the active list clean. Re-enable via the toggle (Bot Rules) or edit drawer (Templates/Knowledge). Knowledge "Archived" entries moved out of the inline category lists into this section.

### Verification
- All edited files pass esbuild syntax checks; `/sales/automation/{rules,templates,knowledge}` and `/crm/dashboards` compile and respond. New dashboard runners smoke-tested against the real DB (7 metric/view-by combos, no query errors).

---

## [Session 33 — CRM Batch 1: Tab Consolidation + Publish Gating] · June 11, 2026

### Added / Changed

**Sales Note publish-gating (no automations until published):**
- `SalesNote.isPublished` / `publishedAt` (migration 0022). Notes are drafts by default — the bot does not act on a deal while any of its contacts has an unpublished note.
- `hasDraftNote(contactIds)` in `followUpDrafter.js`; `check-followup` skips and logs deals waiting on a human to publish.
- Calendar-imported notes (have `calendarRef`) are auto-published — they came from accepted events.

**Unified Rules tab (Bot Rules + Scheduling merged):**
- `/sales/automation/rules` is now the single home: **Bot Rules on top**, then a "Scheduling & Relationship" group (Review Window, Scheduling Rules, Exclusion Rules, Classification Rules, Relationship Cadence).
- Bot Rules extracted into `components/salesAutomation/BotRulesPanel.jsx` (reusable panel).
- **Follow-Up Thresholds section removed** — it was a redundant view of Bot Rules where trigger = Deal Stale. Manage those in Bot Rules now.
- Old `/sales/automation/scheduling` route redirects to `/sales/automation/rules`.

**Check-ins merged into Bot Queue** — Bot Queue now has Scheduling / Follow-Ups / Check-ins tabs.

**Other Batch 1 items:**
- Soft-disable via `isActive` instead of hard delete on Scheduling Rules (migration 0022); disabled rules stop affecting automations but are kept for history.
- Days-of-week as checkboxes on Scheduling Rules.
- User picker on Sales Activity (view any sales user's activity, not just your own).
- "+ Add Tier" on Relationship Cadence.

**Migration 0022:** `SalesNote.isPublished` + `publishedAt`; `SchedulingRule.isActive`.

### Verification
- All automation routes (rules, scheduling-redirect, templates, knowledge), bot-queue, and activity compile and respond cleanly. Edited files pass esbuild syntax checks.

---

## [Session 32 — Tone Profile + Template Direction] · June 5, 2026

### Added

**Per-User Email Tone Profile:**
- `User.toneProfile`, `toneProfileBuiltAt`, `toneProfileSource` — stores Claude Sonnet analysis of user's writing voice
- `POST /api/users/tone-profile` — upload a `.mbox` file (from Google Takeout Sent folder), parses up to 200 emails, runs Sonnet analysis, stores JSON profile: summary, formality, tone adjectives, openers, closers, characteristic phrases, what to avoid, structural patterns
- `GET /api/users/tone-profile` — returns current user's profile
- `DELETE /api/users/tone-profile` — clears profile
- **Profile page UI** (Settings → Profile) — "Email Tone Profile" section with upload button, profile preview (summary, tone tags, avoid tags, example opener), re-upload option
- Each user has their own profile — not shared across the team

**Template AI Direction field:**
- `MessageTemplate.direction String?` — plain-English instructions the AI reads before drafting
- Shown in template form as an amber "AI Direction" section below Body
- Example: "If we had an in-person meeting in the last 30 days, open with a warm reference. End with a specific ask. Never say 'I hope this finds you well.'"
- The Body is the starting point / goal; Direction is how to personalize it

**Migration 0021:** `toneProfile`, `toneProfileBuiltAt`, `toneProfileSource` on User; `direction` on MessageTemplate

### Next: Upgraded followUpDrafter.js
When the `.mbox` file arrives and is uploaded, the drafter will be upgraded to:
- Claude Sonnet (instead of Haiku) for prose quality
- Inject tone profile into every draft
- Use template Direction as system prompt
- Include full relationship context (last in-person activity, recent note content)

---

## [Session 31 — Activity Classification Intelligence] · June 4, 2026

### Added

**`ActivityClassificationRule` model (migration 0020):**
Ordered priority rules for classifying calendar events into activity types. Highest priority wins; first match is final. If no rule matches, Claude Haiku classifies the event.

**9 condition types:**
- `TITLE_CONTAINS` — keyword in event title
- `LOCATION_CONTAINS` — keyword in event location
- `LOCATION_TYPE` — "virtual" (Zoom/Teams URL) or "in_person"
- `ATTENDEE_MIN` / `ATTENDEE_MAX` — attendee count thresholds
- `ORGANIZER_DOMAIN` — organizer email domain
- `DURATION_MIN` / `DURATION_MAX` — meeting duration in minutes
- `BODY_CONTAINS` — keyword in event description

**15 default rules seeded:** Virtual meetings → Skip, Large groups → Skip, Location "golf" → Golf, plus all keyword title rules (coffee, lunch, dinner, golf, happy hour, site visit, etc.)

**`src/lib/bot/activityClassifier.js`** — Three-layer classifier:
1. User-defined rules (checked priority-descending, first match wins)
2. Claude Haiku AI fallback — uses title, location, attendee count, duration, organizer, body to determine type + confidence score
3. Returns null (unclassified) if Haiku is uncertain

**`SalesNote` additions:**
- `classificationSource String?` — 'keyword' | 'rule' | 'ai' | 'manual'
- `classificationConfidence Int?` — AI confidence 0-100

**New API routes:**
- `GET/POST /api/automation/classification-rules` (+ seed endpoint with 15 defaults)
- `PATCH/DELETE /api/automation/classification-rules/[id]`

**Scheduling Rules UI — new section:**
Activity Classification Rules table: priority, rule name, condition type + value (color-coded), result pill (color by type), active toggle, edit/delete on hover, + Add Rule button, Seed Defaults button when empty.

**`invalidateRulesCache()`** — called on every create/update/delete to ensure next classification uses fresh rules.

**Ready for M365 Phase D:** When calendar sync goes live, `classifyEvent()` is called on each incoming event. Rules run first (instant, no API cost), Haiku only for unmatched events (~$0.001 each).

---

## [Session 30 — Calendar Import Fix: PARTSTAT Filter] · June 4, 2026

### Fixed — Calendar Import Quality

**Problem:** Initial import included 63 events Mike didn't actually attend:
- `PARTSTAT=NEEDS-ACTION` (391 total) — invites never responded to (e.g. "North Texas BUILT: Uchiba Dinner", "South FL BUILT Happy Hour!")
- `PARTSTAT=DECLINED` (403 total) — invites Mike rejected
- `PARTSTAT=TENTATIVE` (143 total) — uncertain attendance

**Fix:** Re-parsed the .ics file filtering to only `PARTSTAT=ACCEPTED` (Mike explicitly accepted) or `PARTSTAT=NONE` (Mike was the organizer = attended by definition).

**Result:** Re-imported 669 clean events (was 732). All 2022+ events now represent meetings Mike actually attended.

**Note:** "Lunch: Mike (ILC) / Mark+Mark+Duke (Swinerton)" still appears — it was `PARTSTAT=ACCEPTED` at export time but was later deleted from the calendar. Manually delete from Sales Notes.

**Remaining known noise:** Catalina Golf Mixer recurring weekly entries are correct (ACCEPTED) — use Sales Automation → Scheduling Rules → Activity Exclusion Rules → "Weekly recurring meetings" to filter these from relationship tracking.

---

## [Session 29 — Market Intel: Fuzzy Match Quality + Manual Rejection] · June 4, 2026

### Fixed — Fuzzy Matching False Positives

**Root cause:** Normalizer was stripping "property" as a noise word, collapsing "Lincoln Property" → "lincoln" — a single generic token that Fuse.js then matched to "Lincoln Avenue Communities" with high confidence.

**Fix 1 — Normalizer (`src/lib/market-intel/normalizer.js`):**
- Guard: if stripping noise words leaves a single token of ≤ 7 characters, keep the pre-noise version
- "Lincoln Property" → stays "lincoln property" (not "lincoln")
- "Riverfront Properties" → still becomes "riverfront" (10 chars > 7, safe to strip)
- Multi-token results still strip normally: "Mill Creek Residential Trust" → "mill creek"

**Fix 2 — Fuzzy matcher (`src/lib/market-intel/fuzzy-matcher.js`):**
- Tightened Fuse.js threshold from 0.35 → 0.28 (stricter initial filter)
- Raised `minMatchCharLength` from 4 → 5
- Single-token normalized names now require much higher confidence: AUTO_LINKED needs 0.97 (was 0.92), SUGGESTED needs 0.90 (was 0.72)
- Added feedback loop: loads previously REJECTED pairs from `FuzzyMatchFeedback` and skips them on future polls
- Added `recordMatchFeedback()` export called when user confirms or rejects a match

**Fix 3 — Manual rejection UI (`src/app/(app)/market-intel/page.jsx`):**
- AUTO_LINKED cards now have a ✗ button (appears on hover) to reject wrong matches
- REJECTED signals show "No match" label instead of ghost developer name
- Rejection PATCH now records feedback in `FuzzyMatchFeedback` so the false positive is never suggested again
- `src/app/api/market-intel/signals/[id]/route.js` updated to call `recordMatchFeedback()` on confirm/reject

### How the system now learns
1. User clicks ✗ on a wrong AUTO_LINKED or SUGGESTED match
2. Signal marked REJECTED + feedback recorded: "Lincoln Property" → NOT Lincoln Avenue Communities
3. `invalidateClientCache()` called — next poll rebuilds the rejection set
4. "Lincoln Property" in any future article is skipped for Lincoln Avenue Communities forever

---

## [Session 28 — Market Intelligence: Search, Client Filter, Mile High CRE] · June 4, 2026

### Added

**Market Intelligence — Search bar**
- "Search signals…" input in top-right header, below Manage Sources button
- Debounced 350ms — searches title, summary, and developer names
- X button to clear; clears filter counter

**Market Intelligence — Client filter**
- "All clients" dropdown appears automatically when any signals are matched to clients
- Populated from `/api/market-intel/clients` — only shows clients that have at least one linked signal
- Filters signals by `linkedClientId` — shows all articles fuzzy-matched to that client
- Example: filter to "Ryan Companies" → shows every article where Ryan Companies was detected as the developer

**New API route:** `GET /api/market-intel/clients` — returns distinct clients with linked signals, sorted alphabetically

**New source: Mile High CRE** (`milehighcre.com/feed/`)
- Colorado-focused CRE publication — relevant for ILC's Denver market
- Added to both the DB seed and the Manage Sources page default list
- Poll run: 114 new signals inserted (190 total), including Mile High CRE Colorado transaction reports
- First Mile High CRE article matched Ryan Companies immediately on first poll

### Files Modified
- `src/app/(app)/market-intel/page.jsx` — search bar, client filter dropdown, debounce
- `src/app/(app)/market-intel/sources/page.jsx` — added Mile High CRE to seed list
- `src/app/api/market-intel/signals/route.js` — added `search` param (title/summary/developerNames contains)
- `src/app/api/market-intel/clients/route.js` — new

---

## [Session 27 — Relationship Intelligence] · June 4, 2026

### Added

**New Prisma Models (migration 0019):**
- `RelationshipCadenceRule` — per-tier default cadence (VIP Client / Active Deal / Warm Prospect / Past Client / Cold Prospect). Unique by tier.
- `ActivityExclusionRule` — filter rules for mass emails and project coordination meetings (RECURRING_WEEKLY, KEYWORD_SUBJECT, MIN_RECIPIENTS, etc.)
- `SalesNoteContact` — join table linking Sales Notes to specific Contact records (replaces JSON attendees string)

**New Contact fields:** `cadenceTier`, `cadenceDays`, `lastInPersonAt`, `lastTouchpointAt`, `nextCheckInAt`
**New Client field:** `cadenceDays` (company-level override)
**New SalesNote fields:** `activityType` (COFFEE|LUNCH|HAPPY_HOUR|GOLF|SITE_VISIT|CALL|EMAIL|EVENT|OTHER), `isInPerson` (auto-computed)

**New pages:**
- `/sales/check-ins` — Check-ins queue: contacts grouped by OVERDUE / DUE THIS WEEK / UPCOMING. Each card shows last in-person activity with emoji, deal context, Log Activity / Snooze / Edit Cadence buttons. Quick-log form expands inline to create a Sales Note and update lastInPersonAt.
- `/sales/activity` — Sales Activity dashboard: per-rep in-person count, unique contacts touched, activity type breakdown, recent activity feed.

**Sales Automation → Scheduling Rules additions:**
- **Relationship Cadence** section: tier table with editable cadenceDays + active toggle. "Seed Defaults" button creates 5 default tiers.
- **Activity Exclusion Rules** section: table + drawer to add/edit rules that filter project coordination meetings, mass emails, and recurring meetings from relationship tracking.

**Sales Notes improvements:**
- Activity type pill picker (Coffee/Lunch/Golf/etc.) with in-person types highlighted orange
- Contact attendee picker (links real Contact records via SalesNoteContact)
- Saving a note with in-person activity type auto-updates Contact.lastInPersonAt

**Navigation:** Check-ins and Sales Activity added to Sales section in sidebar.

**New API routes:**
- `GET/POST /api/crm/cadence-rules` (+ seed endpoint)
- `PATCH/DELETE /api/crm/cadence-rules/[id]`
- `GET/POST /api/automation/exclusion-rules`
- `PATCH/DELETE /api/automation/exclusion-rules/[id]`
- `GET /api/crm/contacts/check-ins-due` — contacts past cadence with effectiveCadenceDays fallback
- `PATCH /api/crm/contacts/[id]/cadence` — update per-contact cadence fields

**How the cadence hierarchy works:**
1. Contact.cadenceDays (person-level override, set from alert)
2. Client.cadenceDays (company-level override)
3. RelationshipCadenceRule matching contact.cadenceTier (Sales Automation defaults)
4. Fallback: 90 days

---

## [Session 26 — CRM People / Contacts Redesign] · June 4, 2026

### Added

**New schema fields — migration 0018:**
- `DealContact.isPrimary Boolean` — star this person; bot emails primary contact first
- `DealContact.dealRole String?` — free-form role on this deal (Decision Maker, Day-to-Day, etc.)
- `DealContact.dealNotes String?` — one-line note specific to this person's involvement
- `Contact.linkedInUrl String?` — for Phase C LinkedIn automation
- `Contact.preferredName String?` — "Ryan" instead of "Ryan Johnson" — used in bot email salutation
- `Contact.company String?` — employer as typed (independent of clientId)

**DealDrawer Contacts tab — full redesign:**
- **Contact cards** with colored avatar, name, title, company, email/phone/LinkedIn links
- **⭐ Primary star** — click any contact to set as primary; only one per deal; bot uses this person
- **"Primary" badge** on the starred contact card
- **Inline deal role** — click "+ Add role" → editable text field, saves on blur
- **Inline deal notes** — click "+ Add note" → editable text field, saves on blur
- **Two add modes:**
  - **Search existing** — search by name/email across all Contact records, link to deal
  - **+ New person** — inline form (Name, Preferred name, Title, Company, Email, Phone, LinkedIn) → creates Contact + links to deal in one step
- Primary contact always sorted first; others in creation order

**Bot automation fix:**
- `followUpDrafter.js` now selects `isPrimary` contact first (not just `contacts[0]`)
- Email salutation uses `preferredName || firstName` — "Hi Ryan" instead of "Hi Ryan Johnson"

### Fixed
- `skipDuplicates` not supported in Prisma `createMany` inside transactions for SQLite — replaced with explicit pre-filter query
- Contacts POST returns contact object directly; UI was destructuring `{ contact }` — fixed to `const contact = await res.json()`

### Files Modified
- `prisma/schema.prisma` — DealContact + Contact new fields
- `prisma/migrations/0018_contact_model_improvements/migration.sql` — new
- `src/app/api/crm/deals/[id]/route.js` — updated include (isPrimary sort, new fields), addContacts handler, new updateContact handler
- `src/app/api/crm/contacts/route.js` — POST accepts linkedInUrl, preferredName, company
- `src/app/(app)/crm/DealDrawer.jsx` — full ContactsTab rewrite + ContactCard component + avatarColor helper
- `src/lib/bot/followUpDrafter.js` — isPrimary contact selection + preferredName salutation

---

## [Session 25 — Sales Automation Phase B: Live Follow-Up Drafting] · June 4, 2026

### Added

**Phase B — Bot Follow-Up Drafting (live, no M365 required)**

- **`src/lib/bot/followUpDrafter.js`** — core drafter: finds last activity date from DealActivity records, selects best matching email template (follow_up scenario, stage-specific or catch-all), loads relevant BotKnowledgeEntry records, calls Claude Haiku to generate a natural contextual follow-up email, returns `{ toEmail, toName, subject, body }`
- **`/api/bot/check-followup`** — upgraded from stub to real implementation: loads active DEAL_STALE BotRules, finds matching open stale deals (pipeline + stage + staleDays), skips deals with existing PENDING_REVIEW drafts, generates draft per deal, creates BotDraft + UserAlert, returns `{ ok, log: { checked, stale, drafted, skipped, errors } }`
- **`/api/bot/draft-follow-up`** — manual trigger: POST `{ dealId }` → generates draft immediately for a specific deal, useful for "Draft Follow-Up" button on deal cards
- **Bot Queue Follow-Ups tab** — upgraded from empty state to real draft cards with:
  - Deal name, pipeline, "N days stale" label, recipient name + email
  - Full subject + body preview with "Edit & Review" expand
  - **Edit panel**: editable subject + body textarea (monospace), Save edits button, Copy to clipboard button
  - "Email sending via M365 coming in Phase E" note (honest UX)
  - Dismiss button → cancels draft

**Sales Automation UX fix:**
- Added `AutomationNav` tab bar (Bot Rules | Templates | Bot Knowledge | Scheduling Rules) to all 4 Sales Automation pages — previously no way to navigate between them
- Bot Rules stages field changed from text input to pill-toggle multi-select (Qualified, Pre-Construction, Construction, Completed — swaps to Design stages when Design pipeline selected)

### Files Modified
- `src/lib/bot/followUpDrafter.js` — new
- `src/app/api/bot/check-followup/route.js` — full implementation replacing stub
- `src/app/api/bot/draft-follow-up/route.js` — new
- `src/app/(app)/sales/bot-queue/page.jsx` — real draft cards with edit panel, onUpdate handler
- `src/components/salesAutomation/AutomationNav.jsx` — new shared tab nav
- `src/app/(app)/sales/automation/rules/page.jsx` — AutomationNav + stages pill-select
- `src/app/(app)/sales/automation/templates/page.jsx` — AutomationNav
- `src/app/(app)/sales/automation/knowledge/page.jsx` — AutomationNav
- `src/app/(app)/sales/automation/scheduling/page.jsx` — AutomationNav

---

## [Session 24 — Submittal Review Intelligence QA + Phase 6 Response Drafting] · June 4, 2026

### Fixed — TrackerPanel QA
- **Category badges missing from review cards** — added `CategoryBadge` component with color-coded chips for all 13 categories (FINISH/MODEL/VOLTAGE/LUMEN/WET_LOCATION/DRAWING_SYNC/DISCONTINUED/LED_TAPE/CODE/CRI/ACCESSORY) — now visible per review note in the detail panel
- **AI badge missing from review cards** — added ✦ AI indicator (yellow chip) when `isExtracted=true`
- **Page numbers missing** — now shows `p.{n}` on extracted reviews

### Added — Phase 6: ILC Response Drafting

**New Prisma Model (migration 0017):**
- `SubmittalResponse` — one per `SubmittalReview`; fields: `body`, `status` (DRAFT/APPROVED/SENT), `generatedBy` (AI/userId), `editedAt`, `approvedAt`; backrelation on `SubmittalReview.response`

**New API Route:**
- `POST /api/projects/[id]/tracker/reviews/[reviewId]/respond` — calls Claude Haiku (`claude-haiku-4-5`) with full project/fixture/reviewer context; upserts SubmittalResponse; skips BOILERPLATE notes
- `PATCH /api/projects/[id]/tracker/reviews/[reviewId]/respond` — update response body or approve/revert status

**TrackerPanel UI additions:**
- **`ResponseBlock` component** per review note:
  - "✦ Draft ILC Response" button → calls Haiku → draft appears inline in amber box
  - Edit: inline textarea, Save/Cancel
  - Approve: turns green "✓ ILC Response" with "Revert to draft" option
  - ↺ regenerate button always visible
  - Response persists across page reloads (DB-backed)
- Responses not shown for BOILERPLATE notes (no text to respond to)

**Tracker GET updated** to include `response` in each review's include chain

**Prompt engineering:**
- Haiku instructed to use specific fixture type code, manufacturer, category context
- Authoritative but collaborative tone ("Acknowledged.", "ILC will coordinate...")
- Not generic — references actual reviewer comment content

### Files Modified
- `prisma/schema.prisma` — SubmittalResponse model, backrelation on SubmittalReview + User
- `prisma/migrations/0017_submittal_response/migration.sql` — new
- `src/components/tracker/TrackerPanel.jsx` — CategoryBadge, AI badge, page number, ResponseBlock
- `src/app/api/projects/[id]/tracker/route.js` — include response in reviews
- `src/app/api/projects/[id]/tracker/reviews/[reviewId]/respond/route.js` — new

---

## [Session 23 — Sales Automation + Bot Queue Phase A] · June 4, 2026

### Added

**New Prisma Models (migration 0016):**
- `BotConfig` — per-user bot settings (scheduling enabled, follow-up enabled, review window, proposal count)
- `SchedulingRule` — per-user or company-default (userId=null) meeting scheduling rules
- `BotDraft` — AI-generated draft emails waiting for review or auto-send
- `BotRule` — automation rules engine (trigger + action config as JSON; replaces separate FollowUpRule + BotDefaultRule models from spec)
- `MessageTemplate` — email / LinkedIn / meeting agenda templates with `{variable}` placeholders
- `BotKnowledgeEntry` — searchable FAQ knowledge base the bot draws from when drafting
- `UserLocationState` — travel detection state (one row per day outside home base)
- `User.homeBaseCity` / `User.homeBaseAddress` — added for bot travel detection

**Navigation:**
- "Bot Queue" (robot icon) and "Sales Automation" (sparkles icon) added to Sales nav section
- Both pages keep the Sales section open (`startsWith('/sales/')` added to `crmRelated`)

**Bot Queue** (`/sales/bot-queue`):
- Two tabs: Scheduling | Follow-Ups (URL-driven via `?tab=`)
- Draft cards: deal name, to email, subject preview, status pill, countdown timer (amber <10min, red <5min)
- Edit & Send (disabled, Phase B) and Cancel buttons per pending draft
- Clean empty state with Phase A info banner

**Sales Automation** (`/sales/automation` → redirects to `/rules`):
- **Templates** (`/sales/automation/templates`): Email / LinkedIn / Meeting Agendas sub-tabs; table with Name, Scenario, Client Type, Stage, Default, Active columns; drawer editor with variable hints; one-click seed of 7 email + 4 LinkedIn stub templates
- **Bot Knowledge** (`/sales/automation/knowledge`): Grouped accordion by category; search + category filter; Add Entry drawer; CSV import modal with client-side parsing and preview
- **Bot Rules** (`/sales/automation/rules`): Rules table with trigger/action pills and active toggle; two-panel WHEN/THEN rule editor drawer with dynamic config fields per trigger/action type
- **Scheduling Rules** (`/sales/automation/scheduling`): Review window (manual/auto/immediate); scheduling rules table + Add Rule drawer; follow-up thresholds derived from BotRule DEAL_STALE records; Location & Travel section (Phase D placeholder)

**API Routes (17 total):**
- `GET/POST /api/automation/templates`, `PATCH/DELETE /api/automation/templates/[id]`, `POST /api/automation/templates/seed`
- `GET/POST /api/automation/knowledge`, `PATCH/DELETE /api/automation/knowledge/[id]`, `POST /api/automation/knowledge/import`
- `GET/POST /api/automation/bot-rules`, `PATCH/DELETE /api/automation/bot-rules/[id]`
- `GET/PUT /api/bot/config`, `GET/POST /api/bot/rules/scheduling`, `PATCH/DELETE /api/bot/rules/scheduling/[id]`
- `GET /api/bot/queue`, `GET/PATCH /api/bot/drafts/[id]`, `POST /api/bot/drafts/[id]/send` (501 stub), `POST /api/bot/drafts/[id]/cancel`
- `POST /api/bot/process-queue` (cron stub, x-cron-secret protected)
- `POST /api/bot/check-followup` (cron stub, x-cron-secret protected)

**Environment:**
- `CRON_SECRET` in `.env` set to strong random value (add to Amplify console before Phase B)

### Fixed
- `BotRule` create 500 — Prisma required `connect` syntax for named relation `BotRuleCreator`; fixed route to use `createdBy: { connect: { id: user.id } }`
- `triggerConfig`/`actionConfig` double-stringification — page pre-stringifies before send; route now checks `typeof` before stringifying again
- Prisma client stale after schema changes — force-regenerated with `prisma generate` after killing server

### Files Modified
- `prisma/schema.prisma` — 7 new models + User fields + Deal backrelation
- `prisma/migrations/0016_sales_bot_phase_a/migration.sql` — new
- `src/components/layout/Sidebar.jsx` — new icons + nav items + crmRelated path
- `src/app/(app)/sales/bot-queue/page.jsx` — new
- `src/app/(app)/sales/automation/page.jsx` — redirect to rules
- `src/app/(app)/sales/automation/templates/page.jsx` — new
- `src/app/(app)/sales/automation/knowledge/page.jsx` — new
- `src/app/(app)/sales/automation/rules/page.jsx` — new
- `src/app/(app)/sales/automation/scheduling/page.jsx` — new
- All 17 API routes under `src/app/api/automation/` and `src/app/api/bot/` — new
- `.env` — CRON_SECRET updated to strong random value

---

## [Session 22 — Ship Schedule v2 QA + Bug Fixes (ILC Internal + Portal)] · June 4, 2026

### Fixed — ILC Internal
- **`+ Add Row` endpoint mismatch** — `addRow()` was calling `/shipments/${ship}/items` (404); corrected to `/shipments/${ship}/line-items` ✅
- **ESD / Lead Time / Tracking not persisting** — `esdDate`, `leadTimeWeeks`, `trackingNumber` were missing from `ShipmentLineItem` schema; added via migration 0014 so inline edits now save correctly per line item (fall back to shipment-level when null)

### Fixed — Portal
- **`ReferenceError: pending is not defined`** — Stale `{pending && <ReleaseModal ...>}` line from old shipment-level release design was left in the portal page JSX; removed (new per-item modal at line 224 was already wired correctly)
- **Release request POST → 500 FK violation** — `WarehouseRelease.releasedById` was non-nullable `String` (FK to User), but PENDING releases have no approving ILC user yet; made nullable via migration 0015; removed `releasedById` from the portal release-requests route create call
- **`NOT_ORDERED` showing raw text** — Added `NOT_ORDERED: ['bg-slate-100 text-slate-400', 'Not ordered']` to portal `StatusPill` map

### New Migrations
- **`0014_shipment_line_item_esd_fields`** — adds `leadTimeWeeks`, `esdDate`, `trackingNumber` to `ShipmentLineItem`
- **`0015_warehouse_release_nullable_releasedby`** — makes `WarehouseRelease.releasedById` nullable

### QA Results — ILC Internal (all ✅)
- Expander row (▶ toggle) — opens/closes delivery + release sections
- Log Delivery modal — fields (date, carrier, tracking, qty, notes), submit appends row instantly
- Status dropdown — all 9 options present, color badge updates, saves on change
- Inline cell edit — description, type, manufacturer, etc. open input on click, save on blur
- ESD date input — native date picker, saves on blur, persists on reload (after migration 0014)
- `+ Add Row` (top-right button) — creates blank row in DB, appends to table (after URL fix)

### QA Results — Portal (all ✅)
- Table renders with correct columns (Type, Description, Manufacturer, ESD, Status, Ordered, At Warehouse, On Site)
- D1 row: "In warehouse" status pill, ESD Aug 31 2026, 30 at warehouse shown in blue
- Row 2 (empty): disabled checkbox, "Not ordered" pill (after StatusPill fix)
- Clicking D1 row checks checkbox, "1 fixture type selected" bar appears, Request Release button enables
- Request Release modal: shows D1 / Test downlight / 30 available / qty pre-filled to 30
- Submit → modal closes, success toast appears, selection resets (after migration 0015 fix)
- Stats now accurate: "In warehouse: 1", "On order: 1" (after stats fix)

### QA Results — Approve/Decline Flow (all ✅)
- Amber "Pending Warehouse Release Requests (2)" banner appears on ILC side after portal submissions
- Approve: banner drops from 2→1, Released count +5, Remaining −5 instantly in table
- Decline: banner disappears, counts unchanged (declined request has no effect)
- Expander release history shows both entries: Jun 4 / Mike Test / ILC Admin / −5 and Jun 4 / Mike Test / Declined / −30

### Files Modified
- `prisma/schema.prisma` — `ShipmentLineItem` gets `leadTimeWeeks`/`esdDate`/`trackingNumber`; `WarehouseRelease.releasedById` made nullable
- `prisma/migrations/0014_shipment_line_item_esd_fields/migration.sql` — new
- `prisma/migrations/0015_warehouse_release_nullable_releasedby/migration.sql` — new
- `src/components/shipSchedule/ShipScheduleTab.jsx` — fixed `addRow()` endpoint URL
- `src/app/portal/projects/[id]/page.jsx` — removed stale `pending` reference, added `NOT_ORDERED` to StatusPill, removed invalid `releasedById` from release-request create
- `src/app/api/portal/projects/[id]/release-requests/route.js` — removed `releasedById` from PENDING create
- `src/app/api/portal/projects/[id]/shipments/route.js` — stats now count line items by `fixtureStatus` instead of shipments by `status`

---

## [Session 21 — Ship Schedule v2: Delivery Events, Release Approval Workflow, Portal Release Request] · June 3, 2026

### Added

- **`ManufacturerDeliveryEvent` model** (migration 0013) — records each physical delivery batch from manufacturer → ILC warehouse with carrier, tracking #, qty received, date, notes
- **`WarehouseRelease` extended** — added `status` (PENDING/APPROVED/DECLINED), `requestedByPortalUserId`, `approvedAt`, `approvedById`, `qtyReleased`, `requestedAt` for full approval workflow
- **`destinationType` on `Shipment`** — WAREHOUSE | DIRECT_TO_SITE
- **`shipScheduleHelpers.js`** — shared `enrichLineItem()` + `LINE_ITEM_INCLUDE` + `deriveShipmentStatus()` used by all ship schedule routes

- **ILC Internal — Pending Release Approvals Banner**: amber banner at top of Ship Schedule tab when any PENDING `WarehouseRelease` records exist; one row per pending request with Approve/Decline buttons; approve calls PATCH, updates optimistically
- **ILC Internal — Expander rows**: click `▶` on any line item row to expand delivery history + release history; amber highlight on rows with pending releases
- **ILC Internal — Log Delivery modal**: "+ Log Delivery" button in expander → modal with date, carrier, tracking, qty, notes → `POST .../deliveries`
- **Portal — Flat line-item table**: replaced shipment-level table with per-fixture-type flat table; checkboxes on rows where `qtyAtWarehouse > 0`
- **Portal — Release request bar**: sticky bar showing selected count + "Request Release" button; disabled until items selected
- **Portal — Release request modal**: table of selected items with editable qty inputs, submit → `POST /api/portal/projects/[id]/release-requests`; success toast on submit
- **`enrichLineItem()`** now used in portal shipments GET — `qtyAtWarehouse`, `qtyOnSite`, `qtyBackordered` derived on read, never stored

### New API Routes
- `POST /api/projects/[id]/shipments/line-items/[itemId]/deliveries` — log delivery event
- `POST /api/projects/[id]/shipments/release-requests/[releaseId]` — approve or decline (ILC only)
- `POST /api/portal/projects/[id]/release-requests` — contractor submits release request

### Files Modified
- `prisma/schema.prisma` — new fields on Shipment, WarehouseRelease; new ManufacturerDeliveryEvent model; backrelations on User, PortalUser, ShipmentLineItem
- `src/components/shipSchedule/ShipScheduleTab.jsx` — pending banner, expander rows, Log Delivery modal, enriched load
- `src/app/portal/projects/[id]/page.jsx` — ShipScheduleView rewritten with flat item table, checkboxes, release request modal
- `src/app/api/projects/[id]/shipments/route.js` — includes deliveryEvents + releases in GET
- `src/app/api/portal/projects/[id]/shipments/route.js` — includes enriched qty fields

---

## [Session 20 — Submittal Review Intelligence (Phases 1–4)] · June 3, 2026

### Added

- **Submittal Review Intelligence — Phases 1–4** — AI extraction of reviewer notes from submitted PDFs
  - **Phase 1 — PDF Extraction**: `POST /api/projects/[id]/tracker/extract` — accepts a submitted PDF, runs pdfjs text extraction, scans for 25+ reviewer prefix patterns (ILC, BOKA POWELL, MEPDD, KTGY, OZ, RJA, TRIO, SDDS, etc.), links notes to fixture type codes, auto-creates `SubmittalSubmission` + `SubmittalItemVersion` + `SubmittalReview` records in one transaction
  - **Phase 2 — Claude Haiku Classification**: After rule-based extraction, any note in the `OTHER` category is sent to `claude-haiku-4-5` for classification into 12 categories: FINISH, MODEL, ACCESSORY, VOLTAGE, LUMEN, WET_LOCATION, DRAWING_SYNC, DISCONTINUED, LED_TAPE, CODE, CRI, BOILERPLATE. Estimated <$0.05/package.
  - **Phase 3 — Review UI**: `⚡ Extract Notes` button in submittal tracker toolbar; green result banner showing notes extracted + new types added; AI-tagged review cards (amber "AI" badge, category label, page number); flag chips on tracker rows (FINISH / VOLTAGE / ACCESSORY / DISC / WET)
  - **Phase 4 — Open Items + Repeat Detection**: `SubmittalOpenItem` model tracks unresolved notes across rounds; repeat detection (same type + category, prior round still open); `GET /api/projects/[id]/tracker/open-items` grouped by responsible party; open items panel in tracker with 🔄 repeat badge

- **`src/lib/submittalExtractor.js`** — extraction library
  - `extractPdfPages()` — pdfjs text extraction per page
  - `extractNotesFromPages()` — prefix scanner + fixture type attribution
  - `categorizeNote()` — 12-category rule engine (no Claude call)
  - `inferResponsibleParty()` — derives ARCH/EE/ID/CONTRACTOR/ILC from note text + category
  - `detectRepeats()` — compares new notes against existing open items

### Schema Changes (migration 0012)
- `SubmittalItemVersion` — added `isDiscontinued Boolean?`, `wetLocationRequired Boolean?`
- `SubmittalReview` — added `noteCategory String?`, `isExtracted Boolean @default(false)`, `pageNumber Int?`
- New model: `SubmittalOpenItem` — cross-round open item tracker with repeat detection

### Files Created
- `prisma/migrations/0012_submittal_intelligence/migration.sql`
- `src/lib/submittalExtractor.js`
- `src/app/api/projects/[id]/tracker/extract/route.js`
- `src/app/api/projects/[id]/tracker/open-items/route.js`

### Files Modified
- `prisma/schema.prisma` — schema changes above
- `src/components/tracker/SubmittalTrackerClient.jsx` — Extract Notes button, open items panel, result banner
- `src/components/tracker/TrackerTable.jsx` — flag chips on rows, AI badge on extracted reviews

---

## [Session 19 — RFI Module (Sprints 1–3): AI Pre-Write Draft Engine] · June 3, 2026

### Added

- **RFI Module — Sprints 1–3** — full AI-assisted RFI management system
  - **Data model** (migration 0011): `RFI`, `RFIActivity`, `RFIAttachment`, `RFIImpactItem`, `DrawingRevisionFlag` models
  - `rfiRoutingMode` added to `Project`; `rfiId @unique` added to `ChangeOrder`; `drawingSheetReference` added to `FixtureScheduleItem`
  - **RFI list** — sortable work queue: ⚡ Draft Ready first, then OPEN by due date; columns: RFI#, Subject, Type, From, Due, Status, Draft Status
  - **Intake drawer** — log inbound RFI with RFI#, subject, received from, type, due date, assignee, full question text; `shipFlag` auto-set by scanning subject against active `ShipmentLineItem` records
  - **RFI detail** — two-column layout: left=thread (INBOUND gray / OUTBOUND dark), right=context panel (details, impact items, linked CO)
  - **Draft Zone** — 6 states: NONE → auto-generates on open → GENERATING (spinner + 2s poll) → READY (amber banner + editable text) → REVIEWED (edited) → SENT (recorded in thread)
  - **AI draft engine** — `claude-haiku-4-5` with ILC voice prompt (ALL CAPS, directive, no hedging, always signed); context assembly pulls fixture type, mounting height, catalog#, drawing sheet ref, ship status; confidence scoring: HIGH/MEDIUM/LOW/SUBSTITUTION
  - **MULTI_QUESTION** — numbered items parsed from AI response → per-item `RFIImpactItem` records with itemConfidence (HIGH/MEDIUM/LOW); overall = worst item
  - **Routing modes** — DIRECT (uppercase directive), THROUGH_ARCHITECT (same text + routing note), REVIEW_ONLY (sentence-case review comment, no send button)
  - **LOW confidence fast-path** — no Claude call; draft zone shows blank + manual compose area
  - **Approve & Send** — atomic: OUTBOUND RFIActivity created + RFI status → RESPONDED + draftStatus → SENT
  - **Ship flag gate** — SUBSTITUTION RFIs with active shipment require confirmation modal before approve
  - **Regenerate** button — re-runs draft generation, overwrites current draft
  - `GET /api/projects/[id]/rfis/summary` — 4-number widget: Open, Overdue, Draft Ready, Closed This Month

- **`extractFixtureTypes` utility** (`src/lib/extractFixtureTypes.js`) — parses free text for fixture type codes matching the project's actual schedule; normalizes to uppercase; used by shipFlag auto-set and draft engine

- **RFIs moved to Construction section** in project nav for all service types (was in Design / Pre-Construction)

### Fixed
- Old `RFITab` (file-upload-based) replaced entirely by new `RFIModule`

### Files Created
- `prisma/migrations/0011_rfi_module/migration.sql`
- `src/lib/extractFixtureTypes.js`
- `src/components/rfi/RFIModule.jsx`
- `src/app/api/projects/[id]/rfis/route.js` (GET list + POST create)
- `src/app/api/projects/[id]/rfis/[rfiId]/route.js` (GET detail + PATCH)
- `src/app/api/projects/[id]/rfis/[rfiId]/generate-draft/route.js`
- `src/app/api/projects/[id]/rfis/[rfiId]/approve-draft/route.js`
- `src/app/api/projects/[id]/rfis/summary/route.js`

### Files Modified
- `prisma/schema.prisma` — 5 new models + fields on Project, ChangeOrder, FixtureScheduleItem, User, ProjectFile
- `src/lib/projectNavConfig.js` — RFIs moved to Construction section, removed from Design/Pre-Construction
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` — RFIModule replaces old RFITab

---

## [Session 18 — Correspondence Tab, Budget QC, Pricing Intelligence, Portal v2, Sidebar, Many More] · June 2–3, 2026

### Added

- **Correspondence Tab (Phase A)** — Gmail-style email view under Communications → Correspondence
  - `EmailAccount`, `EmailMessage`, `EmailAttachment` Prisma models (migration 0007)
  - Thread list: search, filter pills (per-tag, multi-select AND logic), unread dots, avatar hash colors, relative time
  - Thread detail: collapsed/expanded messages, DOMPurify HTML sanitization, attachment rows ("Download coming soon")
  - Mark-as-read on open (optimistic), reply bar placeholder
  - Empty state, loading skeleton, no-results state
  - Seed script: `prisma/seed-correspondence.js` — accepts project ID or name arg, seeds 6 mock threads
  - Special seed: `prisma/seed-candelas-emails.js` — real Candelas email threads from exported PDFs
  - 3 API routes: `GET /api/projects/[id]/correspondence/threads`, thread detail, PATCH mark-as-read

- **Project Sidebar — Collapse/Pin** — second project sidebar now collapses to 44px icon rail
  - Pin button (amber) in header; collapses to icon-only rail with tooltips; unpin re-expands
  - localStorage persistence per user (`sidebar_collapsed_[userId]`), SSR-safe useEffect pattern
  - Lucide icons added to all 14 nav items in `projectNavConfig.js`

- **Client Portal v2** — full rewrite from card-grid to sidebar + bottom-tab nav
  - Ship Schedule: stats bar, description column, release confirmation modal, ESD on mobile
  - Budget: live data from `DesignBidMatrix` (CN pricing only — DN never shown), CO summary bar, PDF download
  - Change Orders: live data from `ChangeOrder` model, per-CO PDF download, "Contact rep" button per pending CO
  - Meeting Notes: expand/collapse, mobile layout
  - Construction Schedule: phases (Pre-Construction/Procurement/Installation/Closeout), progress bar, first delivery callout, overdue states
  - Contracts/Submittals: PDF download on every file
  - New API routes: `/api/portal/projects/[id]/budget`, `/api/portal/projects/[id]/change-orders`
  - Upgraded: shipments (stats + first delivery), construction (first delivery from shipments)
  - Portal layout updated to `h-screen flex-col` for full-height nav

- **Budget QC Checklist** — persistent pre-flight checklist tied to each project's budget
  - `BudgetQCChecklist` + `BudgetQCItem` Prisma models (migration 0009)
  - 13 checklist items: 4 system auto-checks (emergency fixtures, controls, qty drift, price drift), 5 fixture QC, 4 pricing/commercial
  - QC strip bar docked below topbar: stage dots (DD→GMP→IFC), progress fill, reviewer avatar, "View Checklist →"
  - Right-side drawer: per-item checkboxes with checked-by stamps, auto-check results, reviewer assignment (admin only)
  - Small `QC · 4/13` badge on Budget tab main screen
  - Send gate: soft confirm dialog on DD/GMP, hard block (cannot send) on IFC until all items checked
  - 3 API routes: GET (auto-creates on first load), PATCH item, PATCH assign reviewer

- **Pricing Intelligence — Feature 1: Cross-project price increase alerts**
  - `ProductPriceHistory` model (migration 0010) — records price on every Email Bid send
  - `GET /api/pricing/price-check` — reads threshold/window from `SystemConfig`, compares vs. history
  - Amber `⚠ +23%` badge on budget unit price cells with hover tooltip (prior price, prior project, date)
  - Write trigger: fire-and-forget in `openMailto()` in `EmailBidPopup`
  - Divide-by-zero guard, normalized manufacturer/partNumber keys

- **Pricing Intelligence — Feature 2: Retail price check (Amenity fixtures)**
  - `ProductPriceCache` model — permanent until manual refresh, normalized keys
  - `POST /api/pricing/retail-lookup` — SerpAPI integration, merged with refresh (forceRefresh flag), graceful no-op if `SERPAPI_KEY` missing
  - `GET /api/pricing/retail-cache` — batched, background fetch after items load (not blocking)
  - Colored dot on Amenity line items: green (>10% below retail) / amber (within 10%) / red (at or above retail)
  - Hover tooltip: per-retailer prices with links, % vs retail, "Refresh ↻" button
  - Retail cache fires as background `useEffect` after items load — never blocks render

- **Pricing Intelligence — Admin Config** — Settings → Master Pricing → "Pricing Intelligence" card
  - Two configurable fields: alert threshold % and lookback window months
  - Backed by `SystemConfig` table (key-value), falls back to 10%/12mo defaults
  - `GET/PATCH /api/system-config` — generic system config upsert (ILC_ADMIN only)

- **User Department Roles** — multi-select role assignment on Users admin page
  - 6 roles: Operations, Finance, Design, Pre-construction, Construction, Sales
  - Stored as JSON array on `User.deptRoles` (migration 0008)
  - Shown as color-coded pills in the user list table; multi-select pill UI in edit modal
  - Edit User modal redesigned as 2-column layout with scrollable body + sticky footer buttons

- **Drawing Phase Auto-Update** — uploading a drawing set auto-advances project phase
  - SD/DD/CD/IFC tags → advance to matching phase; ASI/RFI → advance to Construction
  - Only advances (never goes backward); green toast banner confirms phase change
  - `PERMIT` tag removed from drawing tags
  - Date prefix (`YY.MM.DD`) auto-prepended to filenames for drawings, CA, and design schedule uploads

- **Fixture Schedule — Delete/Rename Versions** — on published versions (v1, v2, etc.)
  - Pencil icon → inline rename (submissionTag), save on Enter
  - Trash icon → "Delete version?" confirm modal with red warning; removes all items in that version
  - API routes: `PATCH/DELETE /api/projects/[id]/fixture-schedule/versions/[versionId]`

- **Budget Matrix — Delete/Rename Versions** — same pattern as fixture schedule
  - API routes: `PATCH/DELETE /api/projects/[id]/design-bid-matrix/[matrixId]`

- **Project Rename** — inline rename on project header
  - Hover over project title → pencil icon fades in; click → inline input at same font size
  - Saves to DB via existing `PATCH /api/projects/[id]`

- **Budget Type field removed** from new project form (`/project/new`)

### Fixed

- **Fixture Schedule PDF parse — multiple fixes**
  - Missing `import { getAnthropicKey }` in parse route → silent crash, empty 500 response
  - Wrong model name `claude-opus-4-5` → corrected to `claude-haiku-4-5`
  - `max_tokens: 4096` too low for large schedules → raised to `8192`
  - `mkdir`/`writeFile` outside try/catch → crashes before response → wrapped with graceful skip
  - Missing `source`/`sourceFileUrl` fields on `FixtureSchedule` model → removed from update
  - Added top-level try/catch to always return JSON, never empty 500
  - Added truncation recovery: salvages complete rows from truncated AI responses
  - PDF parse drag/drop missing `onDragOver`/`onDragLeave`/`onDrop` handlers in `ParseFromPdfModal`
  - **AI parsing quality:** added post-processing type-code validation (catches `WM_WALL PACK` → `WM`)
  - **AI prompt:** multi-manufacturer or-equal rows now split into separate lines; leftmost-column rule for type codes

- **TYPE column in fixture schedule** — widened from 3% → 6%, `whitespace-nowrap font-mono` — `LT-400` no longer wraps

- **getAnthropicKey missing** from 6 additional API routes (`analyze-contract`, `chat`, `code-check`, `fixture-schedule/parse`, `peer-review/parse-pdf`, `tracker/import-toc`)

- **Portal layout** — updated to `h-screen flex-col` so sidebar nav fills viewport; projects list page got `max-w-2xl mx-auto px-4 py-8` padding

### Files Created
- `prisma/migrations/0007_correspondence_models/`, `0008_user_dept_roles/`, `0009_budget_qc_checklist/`, `0010_pricing_intelligence/`
- `prisma/seed-correspondence.js`, `prisma/seed-candelas-emails.js`
- `src/components/correspondence/CorrespondenceTab.jsx`
- `src/components/budgetQC/BudgetQCStrip.jsx`, `BudgetQCDrawer.jsx`, `BudgetQCBadge.jsx`
- `src/components/pricing/PriceAlertBadge.jsx`, `RetailPriceDot.jsx`
- `src/lib/budgetQCItems.js`, `src/lib/budgetQCAutoChecks.js`, `src/lib/pricingIntelligence.js`
- `src/app/api/projects/[id]/correspondence/threads/route.js` + detail + read
- `src/app/api/projects/[id]/budget-qc/route.js` + items/[itemKey] + assign
- `src/app/api/projects/[id]/fixture-schedule/versions/[versionId]/route.js`
- `src/app/api/projects/[id]/design-bid-matrix/[matrixId]/route.js`
- `src/app/api/pricing/price-history/`, `price-check/`, `retail-lookup/`, `retail-cache/`
- `src/app/api/system-config/route.js`
- `src/app/api/portal/projects/[id]/budget/route.js`, `change-orders/route.js`

### Files Modified
- `prisma/schema.prisma` — added EmailAccount, EmailMessage, EmailAttachment, BudgetQCChecklist, BudgetQCItem, ProductPriceHistory, ProductPriceCache models; `deptRoles` on User; `defaultDiscountPct` on Manufacturer
- `src/lib/projectNavConfig.js` — icons added to all nav items
- `src/components/project/ProjectSidebar.jsx` — full rewrite with collapse/pin + icon rail
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` — userId prop, sidebar collapse, correspondence tab, budget QC badge, budget rename/delete
- `src/app/(app)/project/[id]/PeerReviewClient.jsx` — budget QC strip + send gate, pricing badges, budget rename/delete, dept roles
- `src/app/(app)/project/[id]/FixtureScheduleEditor.jsx` — delete/rename version UI, type column fix, drag/drop fix, parse improvements
- `src/app/(app)/project/[id]/DrawingsTab.jsx` — remove PERMIT, phase auto-update toast
- `src/app/(app)/project/[id]/wizard/page.jsx` — pass currentUser + allUsers to PeerReviewClient
- `src/app/(app)/admin/AdminClient.jsx` — 2-column edit modal, department roles multi-select + display
- `src/app/(app)/admin/pricing/PricingEditor.jsx` — Pricing Intelligence config card
- `src/app/(app)/admin/pricing/page.jsx` — load SystemConfig pricing intel values
- `src/app/(app)/project/new/NewProjectForm.jsx` — remove Budget Type field
- `src/app/api/projects/[id]/drawing-submissions/route.js` — date prefix, phase auto-update
- `src/app/api/projects/[id]/files/route.js` — date prefix for drawing/CA/designInfo tabs
- `src/app/api/admin/users/[id]/route.js` — deptRoles PATCH + response
- `src/app/portal/layout.jsx` — h-screen flex-col layout
- `src/app/portal/projects/[id]/page.jsx` — full v2 rewrite
- `src/app/portal/projects/page.jsx` — padding fix

---

## [Session 17 — CRM Dashboards, Tasks Enhancements, Sidebar Restructure, Rich Text Editor] · May 21, 2026

### Added
- **CRM Dashboards** — full Pipedrive-style analytics system replacing the "coming soon" placeholder
  - One concept: dashboards contain widgets; each widget is a configured chart (no separate "reports" layer)
  - Auto-seeds a default "Main Dashboard" with 10 pre-built charts on first visit
  - 10 starter widgets: Procurement Revenue Forecast, Design Fee Forecast, Combined Revenue Forecast, Pipeline Value by Stage, Open Deals by Organization, Win Rate by Owner, Win Rate by Project Type, Open Pipeline by Probability, Lost Deal Analysis, Sales Cycle Duration
  - 5 chart categories: REVENUE, DEAL_COUNT, CONVERSION, FORECAST, DURATION
  - View by dimension (X-axis): month, quarter, client/org, owner, stage, projectType, serviceType, probabilityTier, lostReason, state
  - Segment by dimension (color/stack): pipeline, serviceType, dealStatus, projectType, owner
  - Full filter builder: enum multi-select, numeric operators (≥/≤/=), relative date periods (this_month, next_12_months, last_quarter, etc.)
  - Full/half width widget layout with smart grid pairing
  - Multiple dashboards with tab navigation; "+ New Dashboard" creation
  - Add/edit/delete widgets via modal with live category → metric → viewBy → segmentBy → filters → width flow
  - Stat cards per widget (total open $, won $, deal count, win rate %)
  - Filter summary tags shown on each widget card
  - Recharts bar charts with custom tooltips, dollar formatting ($1.2M), stacked/grouped modes
  - Conversion category uses horizontal bar chart showing win rate % per dimension
  - Revenue/Forecast auto-formats Y-axis ($K/$M)
- **Tasks: Tags, Assignee, Attachments** — three new fields on the Software > Tasks kanban
  - **Tags** — predefined tags grouped by nav section (Home, CRM, Pre-con, Software, Settings, General) with color-coded pill selector
  - **Assignee** — dropdown of all active system users pulled from the DB
  - **Attachments** — file upload supporting PDF, Excel (.xls/.xlsx), JPG, PNG, GIF, WebP up to 25 MB
  - Task cards show: priority badge, tags (max 3 + overflow count), assignee avatar, attachment count, due date
  - New task flow: create first → modal re-opens in edit mode for immediate attachment upload
  - `TaskAttachment` Prisma model with `onDelete: Cascade` from task
  - `POST /api/tasks/[id]/attachments` — stores files in `uploads/tasks/[taskId]/`
  - `DELETE /api/tasks/attachments/[attachmentId]` — deletes file from disk + DB
- **Rich Text Editor** — reusable Tiptap editor component (`src/components/RichTextEditor.jsx`)
  - Toolbar: Bold, Italic, Underline, Strikethrough, H2, H3, Bullet list, Ordered list, Blockquote, Code block, Insert table, Insert/edit link, Clear formatting
  - Table support (paste from Google Sheets preserves structure)
  - Placeholder: "Write content here, or paste from Google Docs or Microsoft Word to preserve formatting…"
  - `RichContent` export: auto-detects HTML vs plain text; old plain-text KB entries render with `whitespace-pre-wrap`
  - Used in: Client KB sections (auto-save with 1.5s debounce), Knowledge Base standard modals
- **Sidebar restructure** — full nav reorganization
  - CRM: Clients moved to first position (above Pipeline)
  - Pre-con: now collapsible section header containing Manufacturers, Sales Reps, Products
  - Software section (ILC Admin only): Changelog, Roadmap, Tasks submenus
  - Settings: Profile submenu added (all users); "Pricing" renamed to "Master Pricing"; Import Excel removed
  - Knowledge Base moved from main nav to submenu under Home
- **Profile page** — `/admin/profile` accessible to all users for name editing + password change
- **Roadmap** — search bar added; sections filterable by keyword; "Request Feature" button (UI placeholder)
- **Changelog** — Notes tab redesigned to match Deploy History layout (stats left, search right)

### Fixed
- **RichTextEditor Tiptap v3** — all extension imports changed from default (`import Table from '...'`) to named exports (`import { Table } from '...'`); Tiptap v3 dropped default exports causing `TypeError: Cannot read properties of undefined (reading 'configure')`
- **CRM Dashboards db import** — all dashboard routes used `import db from '@/lib/db'` (default, resolves to `undefined`); corrected to `import { prisma as db } from '@/lib/db'` across all 7 files

### Files Created
- `src/components/RichTextEditor.jsx` — Tiptap rich text editor + `RichContent` read-only renderer
- `src/app/(app)/admin/profile/page.jsx` + `ProfileClient.jsx`
- `src/app/(app)/admin/tasks/TasksClient.jsx` — full rewrite with tags/assignee/attachments
- `src/app/(app)/crm/dashboards/DashboardsClient.jsx` — full dashboard UI with Recharts widgets
- `src/lib/dashboardEngine.js` — filter → Prisma where clause engine + widget query runner
- `src/lib/defaultDashboard.js` — 10 pre-built widget seed configs
- `src/app/api/crm/dashboards/route.js` — GET list + POST create + auto-seed
- `src/app/api/crm/dashboards/[id]/route.js` — PATCH + DELETE
- `src/app/api/crm/dashboards/[id]/run/route.js` — POST run all widgets
- `src/app/api/crm/dashboards/[id]/widgets/route.js` — POST add widget
- `src/app/api/crm/dashboards/[id]/widgets/[widgetId]/route.js` — PATCH + DELETE + POST run single
- `src/app/api/tasks/[id]/attachments/route.js` — file upload endpoint
- `src/app/api/tasks/attachments/[attachmentId]/route.js` — delete attachment

### Files Modified
- `prisma/schema.prisma` — added `Dashboard`, `DashboardWidget`, `TaskAttachment` models; `dashboards` relation on `User`
- `src/components/layout/Sidebar.jsx` — full restructure with Pre-con + Software collapsible sections
- `src/app/(app)/admin/tasks/page.jsx` — loads users list for assignee dropdown
- `src/app/(app)/admin/changelog/ChangelogClient.jsx` — stats+search layout matching Deploy History
- `src/app/(app)/admin/roadmap/RoadmapClient.jsx` + `page.jsx` — search bar, Request Feature button
- `src/app/(app)/clients/[id]/ClientDetailClient.jsx` — KB sections use RichTextEditor
- `src/app/(app)/knowledge-base/KnowledgeBaseClient.jsx` — standard modals use RichTextEditor
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` — Design Bid Matrix tab removed
- `src/app/api/tasks/route.js` + `[id]/route.js` — include attachments + assignee in all queries

---

## [Session 16 — Bid Matrix Print Fixes + Product Catalog + Delete Feature] · May 2026

### Added
- **Delete product** — super admins (ILC_ADMIN / SUPER_ADMIN) can now delete products from the catalog
  - Trash icon appears on hover in the product list row; inline Yes/No confirm before deleting
  - Red "Delete" button in product detail top bar; confirmation modal shows part number before deleting
  - `DELETE /api/products/[id]` endpoint added
  - `isAdmin` prop passed from server to both `ProductsClient` and `ProductDetailClient`
- **ILC Studios logo in Bid Matrix print** — replaced SVG text approximation with actual company logo (`/public/ilc-studios-logo.jpg`)
- **Terms page in Bid Matrix print** — new page appended after the main bid matrix when printing:
  - General Terms (5 bullets: sales tax, 20% mobilization, 90-day lead time, Net 15, warehousing/freight)
  - Contractor Bidding Guidelines (5 subsections: Quote Submission, Material Allowance, Bid Alternates, Change Orders, Scope of Work)
  - Questions section (uses project creator email)
  - ILC Studios logo header + orange HR divider + footer on terms page
- **Sidebar label change** — rotating sidebar text changed from "Bid Matrix" to "Budget" on print

### Fixed
- **Print only showing 1 page** — root cause was `h-screen overflow-hidden` on the app layout div; fixed with `@media print { html, body, * { overflow: visible !important; height: auto !important; } }` in `PeerReviewClient.jsx`
- **Right margin too tight in print** — updated `@page` margins to `0.4in 0.6in 0.4in 0.45in` (added more right buffer)
- **"ILC Studios" text in print header** — removed duplicate company name text from top-right address block (logo already identifies the company)
- **React key warning on print table rows** — `item.id` can be undefined; fixed with fallback `key={item.id || \`${tag.id}-row-${idx}\`}`

### Files Created
- `public/ilc-studios-logo.jpg` (copied from G:\Shared drives\MARKETING\...)
- `src/app/api/products/[id]/route.js` — added DELETE handler

### Files Modified
- `src/app/(app)/project/[id]/PeerReviewClient.jsx` (print CSS, logo, terms page, sidebar label, key fix)
- `src/app/(app)/products/ProductsClient.jsx` (isAdmin prop, trash icon, inline confirm, delete fetch)
- `src/app/(app)/products/[id]/ProductDetailClient.jsx` (isAdmin prop, Delete button, confirmation modal)
- `src/app/(app)/products/page.jsx` (requireAuth, isAdmin computation)
- `src/app/(app)/products/[id]/page.jsx` (requireAuth, isAdmin computation)
- `src/app/api/manufacturers/[id]/products/[productId]/route.js` (DELETE requires super admin)

---

## [Session 15 cont. — Budget Type Conversion] · May 2, 2026

### Added
- **In-place budget type conversion** — clicking "Upgrade to Design Budget" from within an existing project now converts the current project (PATCHes `budgetType`) instead of navigating to `/project/new?type=design`
  - All existing project data and questionnaire answers carry over (same DB records)
  - Design wizard shows additional questions on top; existing answers are not deleted
  - Downgrade (design → conceptual) hides design answers but does not delete them
- **Amber confirmation banner** — shown inline when conversion is requested; explains what carries over; requires "Yes, convert" click
- **`budgetType` in PATCH API** — `/api/projects/[id]/route.js` now accepts and validates `budgetType` in PATCH body
- **Activity logging** for budget type conversion — logged to project activity feed with label (e.g., "Converted to **Design Budget**")
- **Budget tab cards redesign:**
  - Active type → `<Link>` to wizard (opens immediately)
  - Inactive type → `<button>` that triggers confirmation banner
  - "Upgrade to Design Budget" label (was "Create Design Budget")
  - Peer Review remains a disabled placeholder

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (conversion state, confirmation banner, card redesign)
- `src/app/api/projects/[id]/route.js` (budgetType in PATCH + activity log)

---

## [Session 15 — Design Budget Math Fixes + Schema Additions] · May 2, 2026

### Fixed (9 calculation bugs — all found by reconciling against Link + Pin Excel ground-truth)

1. **Base SF rate applied to `grossSf` not `unitsSf`**
   - `baseProduct = grossSf * PRICING.base.perSf` (was `unitsSf * rate`)
   - Impact: ~$28,000 delta on a 129K SF building

2. **Sales tax from `projectData.salesTaxPct` (numeric), not response string**
   - Was reading `responses.salesTax` which stored 'exempt'/'yes'/'tbd' strings → always 0
   - Now reads `pd.salesTaxPct` (stored as decimal, e.g. 0.0915 for 9.15%)
   - Impact: ~$6,500 delta

3. **Fan count now respects `numFans` override field**
   - `fanCount = n(pd.numFans) > 0 ? n(pd.numFans) : Math.round(numUnits * fanMult)`
   - Excel showed 14 fans for 149 units (only 3BR units get fans); the unit-mix multiplier approach over-counted
   - Impact: ~$3,000 delta

4. **Landscape uses total `lotSf` (not net lot SF)**
   - `autoLandscape = lotSf > 0 ? lotSf * 0.02 : 0`
   - Impact: minor

5. **Exterior doors averaged per door (not ceil/floor split)**
   - `avgDoorCost = (primarySconce + secondarySconce) / 2`; `extDoorProduct = exteriorDoors * avgDoorCost`
   - Impact: minor

6. **Controls basis is `grossSf` (not corridor+amenity SF)**
   - `controlsProduct = Math.min(grossSf * ctrlRate.perSf, ctrlRate.cap)`
   - Impact: ~$2,000 delta

7. **Sales tax applied to product subtotals only (not freight or warehousing)**
   - `lightingTaxAmount = lightingProductSubtotal * salesTaxPct`
   - `controlsTaxAmount = controlsProduct * salesTaxPct`
   - Freight and warehousing are now tax-exempt
   - Impact: ~$1,500 delta

8. **Garage key alignment** — CorridorsSection sends `'standard'`/`'enhanced'` and `'occupancy'`/`'daylighting'`; calculations.js was checking legacy keys `'high'`/`'medium'` and `'batteryAndSensor'`
   - Fixed key matching; updated pricing: standard = $0.30/SF, enhanced = $0.45/SF, daylighting adds $0.10/SF

9. **Removed double-counted design adders** — `diskSevenInch`, `entryDecorative`, `entryway12inch`, `fanSize52Adder` were already baked into the grossSf × $0.38 base rate after fixing bug #1; removing them eliminated ~$4,000 double-count

### Added
- **`numFans` field** — explicit fan count in ProjectData; overrides unit-mix multiplier when set
- **`numAccentDownlights` field** — recessed accent count in ProjectData (was in schema/labels but not saved)
- **`salesTaxPct` field** — jurisdiction sales tax rate in ProjectData (decimal, e.g. 0.0915); displayed as % in UI
- **`salesTaxPct` in ProjectDataSection** — new "Freight, Warehousing & Tax" group with freight %, warehousing %, and sales tax % fields; all use `PCT_FIELDS` conversion (display % ↔ stored decimal)
- **Stairwell elevated adder** — `stairwells × $50` when `corridors.stairwellDesign === 'elevated'`
- `calculateBudget()` return value extended with `salesTaxPct`, `lightingTaxAmount`, `controlsTaxAmount`, `fanCount`

### Updated Pricing
- `designGarage.baseMediumPerSf`: 0.20 → 0.30 (now called 'standard')
- `designGarage.baseHighPerSf`: 0.25 → 0.45 (now called 'enhanced')
- `designGarage.daylightingAdderPerSf`: 0.10 (new)

### Files Modified
- `src/lib/calculations.js` (complete rewrite with 9 bug fixes)
- `src/lib/pricing.js` (garage rates updated)
- `src/app/api/projects/[id]/data/route.js` (added `numFans`, `numAccentDownlights`, `salesTaxPct` to numeric fields)
- `src/components/sections/ProjectDataSection.jsx` (added `numFans`, `numAccentDownlights`, `salesTaxPct` fields; removed broken salesTax QuestionCard)
- `prisma/schema.prisma` (added `numFans Int?`, `salesTaxPct Float?` to `ProjectData`)

---

## [Session 14 — Project Dashboard Tab + Activity Feed] · May 2, 2026

### Added
- **Dashboard tab** — first/leftmost tab in project hub; project home screen with key widgets:
  - Initial Budget, Current Budget, Supply Contract Total, Change Order Total
  - Latest uploaded drawing set with link to PDF
- **`ProjectActivityFeed.jsx`** — activity log component wired into Dashboard tab below `ProjectDashboard`
- **`ProjectActivityFeed`** imported into `ProjectHubClient.jsx`, rendered below `ProjectDashboard` in the Dashboard tab

### Files Created
- `src/components/ProjectActivityFeed.jsx`

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (Dashboard tab, activity feed)

---

## [Session 13 — Submittal Tracker] · May 1–2, 2026

### Added
- **Submittal Tracker** — separate full-screen page linked from Submittals tab via "Open Tracker" button
  - Import fixture schedule from CSV/Excel (Type/Manufacturer/Model columns)
  - Table: fixture types as rows, consultants as columns, latest review status as cells
  - Review statuses: Approved, Approved as Noted, Rejected, etc.
  - Expand row → full version history of review rounds
  - Add/edit review entries manually
  - Date-based versioning (flexible, not strict submission numbering)
  - Configurable consultant list per project (defaults: Developer, Architect, Landscape Architect, Interior Designer, EE)
- New Prisma models: `SubmittalTracker`, `SubmittalFixture`, `SubmittalReview`

### Files Created
- `src/app/(app)/project/[id]/tracker/page.jsx`
- `src/components/tracker/SubmittalTrackerClient.jsx`
- API routes for tracker CRUD

### Files Modified
- `prisma/schema.prisma` (submittal tracker models)

---

## [Session 12 — Meetings Tab as Rich Note Editor] · May 1, 2026

### Added
- Meetings tab "Add New Note" button creates a new timestamped note entry per click
- Notes linked to project; date-stamped
- Rich text / paste-friendly note area
- Meetings tab retains drag-and-drop alongside note creation
- `MeetingNote` Prisma model (or stored as `ProjectFile` type `meeting_note`)

### Files Created
- New API route for meeting notes CRUD

### Files Modified
- `prisma/schema.prisma` (MeetingNote model)
- `src/app/(app)/project/[id]/ProjectHubClient.jsx`

---

## [Session 11 — Budgets Tab + Budget Progression Chart] · April 30, 2026

### Added
- Budgets tab drag-and-drop PDF upload (in addition to existing conceptual/design budget widgets)
- Vertical bar chart — total budget per uploaded submission (SD → DD → CD → Buyout progression)
- Tab order reordered: Dashboard → Budgets → Takeoffs → Drawings → Design Info → Meetings → Correspondence → Submittals → CA → Contracts

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx`

---

## [Session 10 — Contracts + CA Tab Widgets] · April 29–30, 2026

### Added
- **Contracts tab widgets:**
  - Supply Contract Value (parsed from Executed or SOV PDFs)
  - Supply Contract Signed Date
  - Design Contract Value and Design Contract Signed Date
- **CA tab widgets:**
  - Change Order Total (summed from all "Change Order" tagged files)
  - RFI Count (count of "RFI" tagged files)
  - Construction Start Date (earliest date in construction schedule PDFs)
  - MEP/Electrical Rough-In Date (keyword match in construction schedule)
  - Construction End Date (completion date from schedule)
- PDF parsing for dollar amounts: regex patterns to extract contract totals from Executed/SOV documents
- Multiple date format support in PDF date parser

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (Contracts and CA widget rows)
- `src/app/api/projects/[id]/files/route.js` (PDF parsing logic)

---

## [Session 9 — Takeoffs Comparison Dashboard] · April 29, 2026

### Added
- `src/lib/parseTakeoff.js` — Excel/CSV parser for Countfire takeoff format
  - Reads last sheet, finds header row where first cell = "Count", locates "Total" column dynamically
  - Returns `{ fixtureType: quantity }` dictionary
- Takeoff parsed JSON stored in `ProjectFile.parsedData` on upload
- Takeoffs tab comparison dashboard:
  - Vertical bar chart — quantities per fixture type across all uploaded versions
  - Table — fixture types as rows, each submission as a column, quantity at each stage
  - Filterable by tag (SD/DD/CD/IFC/ASI/RFI), sortable by upload date

### Fixed
- Comparison showing 0 for one submission's counts when actual was 188 — fixed column detection in parser (was reading wrong column)

### Files Created
- `src/lib/parseTakeoff.js`

### Files Modified
- `src/app/api/projects/[id]/files/route.js` (parse takeoff Excel on upload)
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (takeoffs comparison UI)

---

## [Session 8 — Claude AI Chat / RAG Integration] · April 29, 2026

### Added
- `/api/projects/[id]/chat/route.js` — streaming chat endpoint via `@anthropic-ai/sdk`
  - Pulls all files with extracted `textContent` from DB, grouped by tab
  - System prompt includes project name, client, location, and all document text
  - Streams responses using `ReadableStream` (SSE-style)
  - Model: `claude-sonnet-4-6`
- Chat UI panel added to project hub (available from every tab)
- `/api/anthropic-models` debug endpoint to verify API key and available models
- `.env.local` with `ANTHROPIC_API_KEY`

### Fixed
- Multiple API key configuration issues, model name errors, and network errors in chat endpoint
- PDF text extraction returning empty in chat context — required dynamic import of `pdf-parse`

### Files Created
- `src/app/api/projects/[id]/chat/route.js`
- `.env.local`

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx` (chat UI added)

---

## [Session 7 — Tag System for File Uploads] · April 29, 2026

### Added
- Per-tab tag taxonomy:
  - **Submittals:** New Submittal, Submittal with Comments
  - **CA:** RFI, Change Order, Construction Schedule, Ship Schedule
  - **Drawings:** SD, DD, CD, IFC, ASI, RFI
  - **Contracts:** Executed, SOV, Proposal (also accepts Excel/CSV)
  - **Correspondence:** General, Email, Meeting Notes
  - **Design Info:** Code Research, Product Research, Design Standards
  - **Meetings:** Meeting Notes, Action Items
  - **Budgets:** SD, DD, CD, Buyout
- Tags required on upload — modal popup forces selection when dragging files in
- Per-tab tag filter chips above each file list

### Files Modified
- `src/app/(app)/project/[id]/ProjectHubClient.jsx`

---

## [Session 6 — File Upload Infrastructure + PDF Text Extraction] · April 28–29, 2026

### Added
- `ProjectFile` DB model: projectId, tab, fileType, originalName, storedPath, size, mimeType, tags (JSON), textContent (extracted for search), uploadedById, createdAt
- `/api/projects/[id]/files/route.js` — GET (list by tab) + POST (upload, extract PDF text via `pdf-parse`, store to `uploads/`)
- `/api/projects/[id]/files/[fileId]/route.js` — DELETE endpoint
- Multi-select in file lists (checkbox per file) with bulk-delete action
- Upload date displayed next to each file in all tabs
- Takeoffs tab accepts PDF, Excel, and CSV
- Meetings and Design Info tabs added

### Fixed
- PDF text extraction returning empty — fixed `pdf-parse` import for Next.js App Router (requires dynamic import)

### Files Created
- `src/app/api/projects/[id]/files/route.js`
- `src/app/api/projects/[id]/files/[fileId]/route.js`

### Files Modified
- `prisma/schema.prisma` (added `ProjectFile` model)
- `src/app/(app)/project/[id]/ProjectHubClient.jsx`

---

## [Session 5 — Dashboard Redesign + Project Hub (Tabbed)] · April 28, 2026

### Added
- **Dashboard rewrite** (`DashboardClient.jsx`):
  - Phase filter chips (SD/DD/CD/IFC/Construction/Closeout)
  - Service type filter chips (Full Design/Design Assist/Peer Review/Bid Only)
  - "My Projects" toggle, "Flagged" toggle
  - Search across name, client, city, state, location
  - Columns: Project (with assignee avatar bubbles), Client, Location, Service type badge, Building type, Phase badge, Budget ($/SF sub-line), Updated date, Actions (open/duplicate/delete on hover)
- **Project detail page** rebuilt as tabbed hub (`ProjectHubClient.jsx`):
  - Initial tabs: Budgets, Drawings, Correspondence, Submittals, CA, Contracts, Design Info, Meetings
  - Drag-and-drop PDF upload per tab
  - File metadata in new `ProjectFile` DB model
- `/api/projects/[id]/assignees/route.js` — GET/POST/DELETE for multi-user project assignment

### Fixed
- Adding a new client from new project form lost all entered project data — fixed flow
- Tabs not refreshing when returning — fixed with `router.refresh()`
- "Add Client" button navigating to wrong destination — fixed

### Files Created
- `src/app/api/projects/[id]/assignees/route.js`

### Files Modified
- `src/app/(app)/dashboard/DashboardClient.jsx` (full rewrite)
- `src/app/(app)/project/[id]/page.jsx` → `ProjectHubClient.jsx` (full rewrite as tabbed hub)
- `prisma/schema.prisma` (added `ProjectFile`, `ProjectAssignee` models)
- `src/lib/utils.js` (added `phaseLabel`, `serviceTypeLabel`, `PROJECT_PHASES`, `SERVICE_TYPES`)

---

## [Session 4 — Architecture Review + Project Schema Redesign] · April 28, 2026

### Decisions Made
- Reviewed Pipedrive exports (deals → projects, organizations → clients) to align data structures
- Budget tools live under projects (not standalone)
- Conceptual and design budgets unified: one tool, show/hide questions by detail level

### Added
- New `Project` model fields:
  - `phase` (`sd` | `dd` | `cd` | `ifc` | `construction` | `closeout`)
  - `serviceType` (`fullDesign` | `designAssist` | `peerReview` | `bidOnly` | `other`)
  - `city`, `state` (replacing generic `location` for filtering)
  - `flagged` (boolean — alert/issue flag)
- `ProjectAssignee` join model (many-to-many `Users` ↔ `Projects`)

### Files Modified
- `prisma/schema.prisma` (major expansion of `Project` model, added `ProjectAssignee`)

---

## [Session 3 — Design Budget Wizard] · April 27–28, 2026

### Added
- **Design Budget** budget type (`budgetType` field: `conceptual` | `design` | `peer_review`)
- Expanded 50+ question wizard sections for design-stage budgets:
  - `DesignUnitsSection.jsx` — disk size (5"/7"), 12" entry disk upgrade, dimmers per unit (0–3), boiler room disk, undercabinet, kitchen pendants, living room fan, bedroom fans (master/secondary/all), fan size (48"/52"/60"), vanity, closet control (switch vs occupancy sensor), balcony fixture
  - Additional design sections for corridors, amenities, emergency, controls/energy
- Design wizard shares calculation engine with conceptual; routes to different section components based on `budgetType`

### Fixed
- Design Budget wizard not saving answers correctly — investigated and fixed section routing

### Files Created
- `src/components/sections/design/DesignUnitsSection.jsx`
- Additional design section components (`DesignCorridorsSection`, `DesignAmenitiesSection`, etc.)

### Files Modified
- `prisma/schema.prisma` (added `budgetType` field to `Project`)

---

## [Session 2 — Sidebar + Clients Module] · April 27, 2026

### Added
- **Sidebar navigation** — replaced top `Navbar` with Vercel-style left sidebar (`Sidebar.jsx`) in navy (#0a1929) with ILC brand colors
  - Nav items: Projects, Clients, Budgets (disabled), Takeoffs (disabled)
  - Settings sub-nav: Pricing (ILC_ADMIN only), Users/Admin, Import Excel
  - User avatar with initials, role display, sign-out button at bottom
- **Clients module** — full CRUD:
  - `Client` Prisma model: name, type, locationType, email, phone, website, address, city, state, notes
  - `clientId` foreign key on `Project`
  - `/api/clients/route.js` — GET (list) + POST (create)
  - `/api/clients/[id]/route.js` — GET (with linked projects), PATCH, DELETE (unlinks projects first)
  - `/clients/page.jsx` — clients list
  - `/clients/[id]/page.jsx` — client detail with linked projects

### Files Created
- `src/components/layout/Sidebar.jsx`
- `src/app/api/clients/route.js`
- `src/app/api/clients/[id]/route.js`
- `src/app/(app)/clients/page.jsx`
- `src/app/(app)/clients/[id]/page.jsx`

### Files Modified
- `src/app/(app)/layout.jsx` (Navbar → Sidebar, side-by-side layout)
- `prisma/schema.prisma` (added `Client` model, `clientId` on `Project`)

---

## [Session 1 — Foundations] · Pre-April 27, 2026

### Added
- **Next.js 14 App Router** project scaffolded with Tailwind CSS, Prisma/SQLite, and JWT-based auth
- **User roles:** `ILC_ADMIN` and `USER`; role-gated routes and API handlers
- **Conceptual Budget Wizard** — multi-section form wizard:
  - Project Data (building metrics, area breakdowns, parking/exterior)
  - Units section (fixture choices per space type)
  - Corridors, Amenities, Emergency, Controls sections
- **`calculations.js`** — core budget engine: reads project data + questionnaire responses → outputs line-item budget with totals
- **`pricing.js`** — centralized pricing constants for all fixture types and rates
- **Budget Summary page** — formatted output of all line items, subtotals, and grand total; print/PDF-ready
- **Shareable budget links** — token-based public share page (`/share/[token]`) with view count tracking
  - `ShareViewTracker.jsx`, `share/layout.jsx` (public/no-auth layout)
- **`SendBudgetModal.jsx`** — send budget to multiple recipients with custom message; past-sends list with view counts
- **`SendBudgetButton.jsx`** — added to summary page header
- **New project autocomplete** — `NewProjectForm.jsx` dropdown matches existing projects; keyboard navigation (arrows/Enter/Escape); auto-fills fields when selecting existing project
- **Excel bulk import** — `excelImportParser.js` (deterministic XLSX parser with dynamic ANSWER column detection), `/api/admin/import/route.js`, `/admin/import/page.jsx` — drag-drop UI with stages: upload → parsing → review → importing → done
- **Dashboard** — project list table with created/modified date columns, sortable headers, action buttons (pencil/copy/trash/Summary icons)
- **PDF summary** — divider between Project Data and Budget Breakdown sections; section headers bold/black for screen and print

### Fixed
- Excel parser: `xlsx` not in `serverComponentsExternalPackages` — added to external packages, switched to static import
- Excel parser: hardcoded `ANSWER_COL = 2` was fragile — fixed by dynamically scanning header row for ANSWER column
- Dashboard not auto-refreshing on back navigation — added `staleTimes: { dynamic: 0 }` in `next.config.mjs`, `router.refresh()` in `useEffect`, window focus listener
- Project/Type columns being cut off — switched from fixed `w-*` to `min-w-*` and `whitespace-nowrap`
- Action buttons (copy/trash/Summary) not visible — fixed with `w-px whitespace-nowrap` on actions column
- Prisma `skipDuplicates` not supported — removed option (each import creates a fresh project ID)

### Files Created
- `src/app/share/layout.jsx`
- `src/app/share/[token]/ShareViewTracker.jsx`
- `src/app/share/[token]/page.jsx`
- `src/components/ui/SendBudgetModal.jsx`
- `src/app/(app)/project/[id]/summary/SendBudgetButton.jsx`
- `src/app/(app)/project/new/NewProjectForm.jsx`
- `src/lib/excelImportParser.js`
- `src/app/api/admin/import/route.js`
- `src/app/(app)/admin/import/page.jsx`

### Files Modified
- `src/app/(app)/project/[id]/summary/page.jsx`
- `src/app/(app)/project/new/page.jsx` (converted to server component)
- `src/app/(app)/dashboard/DashboardClient.jsx`
- `next.config.mjs`

---

## Known Gaps / Future Work

- **Garage "Other" custom override** — Excel projects can use a custom flat dollar amount for garage. The app has no "Other" option or manual dollar input. Discrepancy noted but not yet resolved (project-specific workaround needed).
- **AmenitiesSection.jsx** — not yet upgraded with `isDesign` prop for design-wizard-only questions
- **EmergencySection.jsx** — not yet upgraded to full design wizard quality
- **BudgetSnapshot** — architecture designed but not built
- **Changelog admin UI** — planned for super-admin; this file is the interim solution
- **Chrome extension pairing** — intermittent failures connecting the browser extension for in-app testing; all math verification was done by hand calculation
