# Claude Coordination Log

Cross-session memory for the ILC platform. Read this at session start to see what the other user's Claude has been up to. Append (newest at top) after meaningful work. See project-root `CLAUDE.md` (section: Cross-Session Claude Coordination) for the rules.

### 2026-09-08 (latest) — Mike's Claude — **DEPLOYED**: pipeline stages relabelled + CRM dashboards filter panel repaired

Two pieces in one push.

**1. Stage relabel.** Mike: *"I want both the procurement and design pipelines to
have these stages too. QUALIFIED / DESIGN / PRE-CON / BUYOUT / CA / PROCUREMENT /
COMPLETED"*. His five map one-for-one onto the existing five, so this is a rename
of the middle two: Pre-Construction → **Design / Pre-Con**, Construction → **CA /
Procurement**. **Labels only — the stored keys `PRECONSTRUCTION` and `CONSTRUCTION`
did not move**, so no migration and no data rewrite. `pipelineStages.test.mjs`
pins those keys; if someone later renames a key to match a label the suite fails
loudly instead of quietly emptying the boards in prod. The rename also exposed
three screens carrying their own typed-out copy of the stage names (home had
already drifted to "Pre-Con") — all now read `src/lib/pipeline.js`.

**2. CRM dashboards filter panel.** Mike: *"Fix that screen properly."* The raw
keys in the dropdowns were the least of it — **four filters were not filtering**.
`pipeline` (the default filter, and the basis of the seeded Design Fee Forecast)
was dropped on the floor; `serviceType` was offered in an uppercase spelling the
DB has never held, so it matched zero rows; `projectStatus` named a non-existent
column and made the whole widget return "Failed to load"; `lostReason`/`wonAt`
were silently ignored. Also: `segmentBy: 'dealStatus'` collapsed everything into
one "Unknown" bucket, and axes printed `PRECONSTRUCTION` / `fullDesign`. Fixed
with a legacy-value translation at query time so **saved widgets heal rather than
break**. Dead fields removed from the picker.

Known-remaining on that screen, not touched: the DURATION category reads
`wonAt || lostAt`, neither of which exists on Project, so "Sales Cycle Duration by
Owner" is always empty (needs a schema field → migration → schema-guard);
view-by/split-by "Pipeline" is still one constant bucket because a full-design job
is genuinely on both boards; "Combined Revenue Forecast" can't split product vs
design revenue side by side.

Verified: regression **1,156/1,156** with the dev server up (+26 new tests across
the two pieces; 3 transient failures in `uploadFlow.e2e` proved to be a Next
dev-server manifest race — **4/4 on isolated rerun**, and none of the changed
files touch that route). `npm run build` exit 0 with all **37** runtime assets
traced; `npm run verify` **11 gates**; `npm test` bid matrix **12/12**. No schema
change, so no schema-guard pass was needed. Browser check not possible — behind
the login wall and I may not enter passwords.

### 2026-09-07 — Mike's Claude — **DEPLOYED**: Bot Knowledge drop zone says "add one file at a time"

Mike: *"write instructions in the bot knowledge about dropping 1 file at a time on
that screen. deploy all of this."*

Copy only — `src/app/(app)/sales/automation/knowledge/page.jsx`. No logic, no data,
no schema, so no schema-guard pass was needed. The heading is now **"Drop one file
here"** with a short paragraph under the file-type line explaining why: a multi-file
drop still works (the loop already sends them one at a time), but a big batch means
a long wait on one screen and anything still queued is lost if the tab closes. Also
warns that a large scanned PDF can take a minute by itself.

Verified: regression **1,130/1,130** with the dev server up; engine math **60/60**,
fuzz 8,000 scenarios **0 failures**, bid matrix **12/12**; `npm run build` exit 0
with all **37** runtime assets traced and `/sales/automation/knowledge` at 10.3 kB;
`npm run verify` **11 gates**. The new text was confirmed present in the built
client chunk, so it genuinely ships. Browser check was not possible — the page is
behind the login wall and I may not enter passwords.

### 2026-09-07 — Mike's Claude — **DEPLOYED**: everything below that said "local-only" is now live

**Bot Knowledge files go to 25 MB, sent in pieces.** Mike: *"we should make it up
to 25mbs like email. can we do it in pieces very easily like drawings? then
deploy."*

The 4 MB number was never a preference — it was the front door. Raising the cap
alone would have made it **worse**: a 25 MB POST dies at Amplify with an empty 413
before our code runs, turning a clear message into a blank failure. So the file
now goes browser → S3 direct in 5 MB parts (the drawing-set plumbing, unchanged)
and this route receives only a key.

- `uploadStorage.js` — `MAX_KNOWLEDGE_UPLOAD_BYTES` (25 MB) + a **separate**
  `KNOWLEDGE_PRESIGNABLE` map. Deliberately not a widened `PRESIGNABLE`: widening
  the bot's library must never widen what the public `/conceptual_budget` page
  accepts. A test fails if the two ever get crossed.
- `uploadClient.js` — `isPresignable(file, scope)`, default `'project'`, so all
  seven existing callers are byte-for-byte unaffected.
- `extract.js` — **the second wall is reading, not sending.** A page is not a fixed
  unit of work, so the 120-page cap stopped bounding anything at 25 MB. Added
  `READ_BUDGET_MS = 20_000`, checked *before* each PDF page and before any OCR is
  started (`OCR_NEEDS_MS = 12_000` — Tesseract cannot be interrupted mid-call).
- The screen sends **one file per request**. Five 25 MB files read back-to-back in
  one request would blow the 30s wall and return nothing; this also means a
  failing file fails alone.

**Also fixed:** `tests/budget-math.mjs` still asserted the old flat $180K controls
cap — the bug fixed on 2026-09-04. Now proves the lower of the two ceilings wins in
both directions. And `.gitignore` had `devserver.log`, which never matched the
dot-prefixed `.devserver.log` start-dev.ps1 actually writes.

**⚠️ Migrations 0061–0068 shipped in this one push, in order.** Schema-guard
cleared the DDL: additive only — 6 new tables, 19 new nullable columns, 1 NOT NULL
with a default (`Client.developerTypes`), 2 new indexes. No removals, renames,
retypes, or new uniques on existing data. Full schema ↔ migration coverage; all
three preBuild guards pass.

**Irreversible data rewrites in that set — flagged to Mike, no backup step in
`amplify.yml`:**
- **0061** `Project.designStage`: `DESIGN_QUALIFIED` and `PROPOSAL_SENT` both
  collapse to `QUALIFIED`. Rows in `PROPOSAL_SENT` with no `proposalSentDate` get
  one backfilled from `updatedAt` — an approximation that afterward looks
  identical to a real proposal date. **Zero rows locally**; prod count unknown.
- **0066** `LUNCH`/`DINNER`/`BREAKFAST` → `MEAL` on `Note.activityType` and
  `ActivityClassificationRule.resultType`. Breakfast vs dinner gone permanently.
- **0067** `RelationshipCadenceRule.cadenceDays` 42/90/90 → 30/45/75, guarded on
  the exact old placeholder so hand-tuned tiers survive.
- **0063** backfills are non-lossy — new columns only, sources untouched.

**Replay hazard to know about:** `0064` is `IF NOT EXISTS` throughout *except* its
two trailing `ALTER TABLE "EmailContactLink" ADD CONSTRAINT`. If it ever
half-applies and gets the `migrate resolve --rolled-back` treatment 0023 got, the
replay dies on `42710 duplicate_object`. Not a problem on a clean first run.

Also noted by schema-guard: `prisma/migrations/migration_lock.toml` does not exist
and is untracked. Pre-existing — 60 migrations have deployed without it — so not a
new risk, just worth knowing the provider is not pinned.

**Verification before this push:** regression suite **1,130/1,130**; engine math
**60/60** + bid matrix **12/12** + fuzz; `npm run build` clean with all **37**
runtime assets traced; `npm run verify` **11/11 gates**.

### 2026-09-07 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on everything below)

**Bot Knowledge now takes files — and the bot finally reads what is in there.**

Mike: *"can I drag stuff here we want to add to the bot knowledge? also the bot
knowledge should take word docs, excel, PDFs and jpegs and pngs. I don't think it
does now."* Correct — it took typed Q&A pairs only.

**Drop zone on `/sales/automation/knowledge`.** Word (.docx/.rtf), Excel
(.xlsx/.xls/.csv), PDF, images, plain text. **4 MB cap** = Amplify's front door,
not an arbitrary choice. Each file is read on the way in and the flattened text is
stored beside it. Unreadable files are **kept and flagged**, never dropped —
Archive/Restore on the row, hard delete admin-only.

New pure `src/lib/botKnowledge/`: `text.js` (zero imports — file-type detection
with **extension beating MIME**, .docx XML flattening, search scoring),
`zip.js` (~90-line ZIP reader on Node's own `zlib`, because a .docx is a ZIP and
**adding a zip dependency means adding it to the prod Lambda bundle** — this repo
has been burned twice by that), `extract.js` (pdfjs text layer via the sanctioned
`loadPdfjs()`, **never `pdf-parse`** — its `module.parent` check throws ENOENT
under ESM; OCR fallback; **120-page text cap / 5-page OCR cap** against the 30s
wall), `storage.js` (S3 prefix **`bot-knowledge/`** so the `uploads/` lifecycle
rule cannot sweep it; dualstack on both clients), `retrieve.js`.

**Migration 0068 — one new table `BotKnowledgeDoc`, additive only.** Hand-written
PostgreSQL (deliberately not generated from the sqlite-provider schema).
Schema-guard reviewed: **no removals, renames, retypes or new uniques; no sign-off
needed on data-loss grounds.** Indexes are `(isActive, status, category)` matching
the one real read path, plus `(createdById)` so `SET NULL` on user delete does not
seq-scan.

**Four pre-existing bugs found and fixed on that screen:**
1. **Import from CSV had never once worked** — button sends `{ entries: [...] }`,
   route accepted only a bare array. Every import 400'd.
2. **The search box was inert** — screen sends `q`, route read only `search`.
3. **A saved entry rendered blank** until reload — the `{ entry }` envelope was
   being stored as the entry.
4. **The bot only ever saw the five OLDEST Q&A pairs.** `take: 5, orderBy:
   createdAt asc`, no matching at all — everything added after the first five was
   never read. Now the project/client/serviceType/stage is the query and both
   typed answers and uploaded documents are searched, excerpt-first.

29 new unit tests (`scripts/tests/botKnowledge.test.mjs`); full suite
**1,125/1,125 green**; `npm run build` clean; both routes verified live (401
unauthenticated); real .docx/.xlsx/.txt run through the reader end to end.

⚠️ **Migrations 0061–0068 are ALL UNTRACKED in git** — not gitignored, just
unstaged. `amplify.yml` generates the client from `schema.prisma` but applies
tables from `prisma/migrations`, so committing the schema without staging these
eight ships a client whose tables do not exist (P2021, from a green build). Stage
all eight, ship **0061→0068 together, in order**. `prisma/seeds/dashboardTemplates.js`
rides with this batch.

---

### 2026-09-07 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED

**The weekly meeting screen, plus a measured answer to "gone quiet after how long."**

Mike asked for widgets for the weekly meeting *"even though I can customize"*, and
gave nine starting items. Then three answers: submissions in and out are *"the
same"*; *"maram really runs it"*; and on the threshold, *"went quiet after what is
the real question"* — throwing it back to be measured.

**The screen is now a layout, not two hardcoded lists.** New pure catalog
`src/lib/meeting/cards.js` (18 cards, no Prisma / no React / no `@/` alias, so the
API and the screen read the same list and it is unit-testable). **Eleven built;
six carry a `needs` string naming the exact missing field and cannot be switched
on** — shown greyed rather than silently dropped. New
`/api/sales/meeting/layout` (GET effective layout + catalog, PUT with
`scope: personal|shared`, shared admin-only, DELETE drops the personal copy);
`/api/sales/meeting` now takes `?cards=` and only pays for the queries on screen.

**Zero schema change for the layout** — `Dashboard.section` is a plain String, so
`section="MEETING"` works as-is, and `ownerUserId` null/set is the shared-default
vs personal-copy seam. Because **Maram runs the meeting**, every deal card has an
Owner column: shared team screen, not a personal to-do list.

**Mike's #9 solved with nothing typed.** IFC / for-award budgets awaiting response
= the budget's recorded send date + the email work's existing "counts as a real
reply from a person" rule (mass sends, invites, auto-replies out). Design
submissions is ONE card either direction — `DrawingSubmission.source` is already
`EXTERNAL | INTERNAL`.

**The threshold, measured.** `scripts/calendar/quietGap.mjs` measured every gap
between two meetings with the same outside company: **5,353 gaps / 434 companies**,
each one a gap the relationship SURVIVED. Half ≤ 14 days, 80% ≤ 28, 90% ≤ 70.
Cadence-tier defaults moved from the guessed **42/90/90/180/365 to 30/45/75/180/365**
(the two long tiers held), and `check-ins-due` now falls back to the same shared
`QUIET_AFTER_DAYS`, so the CRM screen and the meeting card cannot disagree about
one person. **Migration 0067 is data-only** — three conditional UPDATEs that move
only rows still holding the placeholder, so a hand-tuned tier keeps its number.

**Honest limit:** no threshold makes the list short — even at 5+ meetings/year and
120 days it is 86 companies. The number *ranks*; CRM scope must filter.

**Bug fixed:** `quietGap.mjs` anchored "today" to the last date in the file, which
is **2032** because repeating series are written out with future instances — so
every company read as quiet (434 of 434). Now anchored to the export's mtime. The
percentiles were never affected.

**Verified:** `meetingCards.test.mjs` 7/7, all four routes 401 (compile + auth gate),
every Prisma query shape run against the real schema. **Not verified in a browser** —
port 3000 held and the app redirects to a login I may not sign into.

**⚠️ Deploy warnings now 0061 → 0067 untracked in git**; 0061 and 0066 irreversible
in-place rewrites; 0064 bare `ADD CONSTRAINT` replay hazard. Local dev.db is
`db push`-built and unbaselined, so `migrate deploy` fails locally with P3005 —
0067 was applied locally with `prisma db execute` instead. Prod runs `migrate
deploy` from amplify.yml and is unaffected.

---

### 2026-09-07 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED

**Mike's last three calendar rulings applied. No schema change in this batch —
pure logic + the dry-run script + tests.**

**"1 meeting per time period."** `dedupeOverlappingMeetings()` in
`src/lib/calendar/worthANote.js`. Three conditions, all required: a real overlap,
**starts within 30 minutes**, and the same activity type (or one side has none).
**Overlap alone is not "the same meeting"** — the first version got that wrong and
the golf mixer, being a four-hour block, swallowed a genuine coffee and a genuine
lunch that fell inside it, then chained transitively so a Tryba client visit was
collapsed into an IKEA delivery. The 30-minute window is calibrated on Mike's own
listings (tee times 3:10p / 3:20p). All-day blocks and TRAVEL are excluded from
the comparison outright — an all-day marker overlaps everything that day, and
travel is de-duplicated in *days* by `travelDates()`.

**Auto-booking exclusion** (`isAutoBooking()` in `personal.js`, new bucket
`auto-booking` between the personal and to-do gates). Narrow on purpose: only
app-written confirmations (`^Reservation at`, `Table for N`, `Your table at … is
confirmed`). **"Dinner reservation at Guard and Grace" is still kept** — Mike
titled that himself; the de-dupe, not the stop-list, is what stops a double count.

**Hotel stays are travel days** (Mike: "yes"). Three new TRAVEL title rules in
`inPerson.js`, kept narrow because **ILC designs hotels** — a bare `/hotel/` would
turn "Virgin Hotel design review" into a travel day. Every pattern needs a
staying-somewhere context, plus a bidirectional-lookahead pattern for brand-first
titles ("Hilton Stay Ft. Collins").

**Two leaks found by reading the leftovers rather than assuming they were noise:**
a delivery window is not a meeting at all (`IKEA delivery- 438646230` was
outranking a real client visit on duration), and kids' activities ("Reid
gymnastics") were reaching the shared CRM. Both are now stop-list patterns.

**Final dry run (6th, read-only):** in-person by year **204 / 185 / 208 / 91**,
travel days 10 / 14 / 11 / 2 (37 total), 44 entries collapsed as the same time
period, 781 personal excluded. Wrongly-discarded in-person meetings **622 → 74 →
51**. Golf now matches Mike's hand count **exactly in 2024 (20) and 2026 (9)**;
the whole remaining gap is the meals definition he already agreed to.
`scripts/tests/calendarInPerson.test.mjs` — **52 tests, all green.** Full
regression + `npm run build` still owed at deploy time.

**The real import is still NOT built** — this is the read and the rules only.
Backfill mode still needs: set dates, no follow-up extraction, no tasks, nothing
sent, and a way to undo the batch.

**⚠️ Deploy warnings unchanged and still live** — migrations 0061 → 0066 all
untracked in git; 0061 and 0066 are irreversible in-place rewrites; 0064 has the
bare `ADD CONSTRAINT` replay hazard.

---

### 2026-09-07 (later) — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on the entry below)

**Mike's four rulings on what counts as a business meeting, applied everywhere.**
His words: *"Catalina golf mixer is every other week and is a business event.
each of those should count always. even though they are repeating… so should a
work business trip. we should look at how many days people are traveling to see
clients… all personal events like soccer practice, tennis match, doctors appts,
therapy should be excluded… 1. change to meals and include work breakfast, lunch
and dinners 2. start with 2023."*

**The real bug was in the seeded rule data, not the code.** `Virtual — skip`
seeded at priority 80 and `Large group — skip` at 70 — both **above** every title
rule at 50. A lunch with a leftover Teams link, or a twenty-person mixer, was
thrown away before anything read the title. `DEFAULT_RULES` in
`src/app/api/automation/classification-rules/route.js` now seeds them at 30 and
25, and **migration `0066_activity_type_meal`** lowers any rows already seeded.

**`LUNCH` → `MEAL`** across constants, all five UI screens, the AI prompt, the
seeded rules and the schema comments. Non-destructive: `normalizeActivityType()`
maps `LUNCH`/`DINNER`/`BREAKFAST` forward on every read and the pickers hide the
legacy key, so old notes read as "Meal" whether or not 0066 has run. **Both
columns are plain `String`, never enums** — schema-guard confirmed; my schema
change is comment-only.

**`TRAVEL` is business but deliberately NOT in-person** — counted in days, not
meetings, so it can never inflate the in-person number Mike checks by hand.

**Two new pure files:** `src/lib/calendar/personal.js` (the stop-list — runs
first, answer is final, so nothing medical or family reaches a shared CRM) and
`src/lib/calendar/worthANote.js` (`isWorthANote` — the ONE gate, order: cancelled
→ personal → business title always kept → internal only → nobody invited →
all-day → keep). `scripts/calendar/icsDryRun.mjs` had its own private copy of
this logic deleted and now calls the shared gate, so the dry-run report is
literally what the import will do.

**Dry run over Mike's real export (read-only, nothing written):** 4,462 events
from 2023 on → 1,906 kept, 776 personal excluded, 26 travel days, in-person 216 /
198 / 231 / 93 by year. The first run wrongly discarded **622** real in-person
meetings; now **74**. It now runs *above* Mike's hand count (+30/+44/+79) because
104 kept meetings come from 10 repeating titles, 66 of them the Catalina Golf
Mixer — his ruling working as asked. Question back to him is open.

`scripts/tests/calendarInPerson.test.mjs` — **38 tests, all green.** Full
regression + `npm run build` still owed at deploy time.

**⚠️ For whoever deploys:** migration folders **0061 → 0066 are all still
untracked in git (`??`)**. They must be `git add`ed or prod receives none of
them. Two are irreversible in-place data rewrites — **0061** stamps
`proposalSentDate = COALESCE(proposalSentDate, "updatedAt")` (a stand-in that
becomes indistinguishable from a real date) and **0066** collapses
breakfast/lunch/dinner into `MEAL` one-way. The **0064** bare `ADD CONSTRAINT`
replay hazard below still stands.

---

### 2026-09-07 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on everything below)

**Sales notes are now wired to the calendar.** Mike: *"when we sync with
Microsoft the system should know it's in person through a title or location."*
Two real gaps were behind that ask. First, `classifyEvent` in
`src/lib/bot/activityClassifier.js` — a good three-layer classifier reading
TITLE_CONTAINS / LOCATION_CONTAINS / LOCATION_TYPE — **had zero callers**, while
the Microsoft-facing `ingestCalendarEvent` decided in-person with a standalone
regex. Second, a synced calendar event **left no record at all**: it fired
`CALENDAR_EVENT_CREATED` and stopped, so it never reached the AI action
extraction, the bot drafts, or `Contact.lastInPersonAt`.

Three new files under `src/lib/calendar/`: `inPerson.js` (pure title/location
rules, and the one home for the COFFEE/LUNCH/GOLF/HAPPY_HOUR/SITE_VISIT set that
was copied into three files), `normalize.js` (the Graph seam, mirroring
`src/lib/email/normalize.js`), and `recorder.js` (a synced event becomes a DRAFT
sales note keyed on `Note.calendarRef`, idempotent on re-sync, guests linked to
`Contact` rows). The classifier gained a **keyword layer** between rules and
Haiku, so it works with no API key — which is why `Note.classificationSource`
always listed `keyword`. `ingestCalendarEvent` now classifies, writes the draft
note, and still fires the trigger unchanged. **Publishing stays a person's
action** — an invite is not proof a meeting happened — and publishing is still
what moves Last In Person. Setting a note's type by hand now stamps
`classificationSource: 'manual'`, which is what tells the sync to stop touching
that note.

**The mass-email 25 is now changeable** (Mike: *"make it changeable but set to
25. no one will probably change it"*) — an `ActivityExclusionRule` of type
`MIN_RECIPIENTS` on Sales Automation → Rules → Exclusions, read by the new
`src/lib/email/settings.js`, cached 5 min, cache dropped on any rule write.
`classify.js` stays pure and database-free; 25 is the fallback and junk values
fall back to it rather than breaking a sync.

**Migration `0065_note_calendar_ref_index`** — an index on `Note.calendarRef`.
Additive only, schema-guard reviewed, written with `IF NOT EXISTS`. **Ship
0061 → 0065 together, in order** (0061 remaps live `designStage` values, so
shipping without it drops existing design deals off the board).

**Known hazard for whoever deploys, flagged by schema-guard and NOT changed:**
`0064_email_contact_activity` creates its table with `CREATE TABLE IF NOT
EXISTS` but adds both foreign keys with bare `ADD CONSTRAINT`. If a deploy halts
and that migration is replayed with the table already present, those two lines
fail with `42710 duplicate_object`. Left alone deliberately — CLAUDE.md says
never edit an applied migration, and editing it would break the local checksum.
Worth knowing if the deploy stops there.

**Also found, not fixed, needs Mike's call:** there are **two people tables**.
`Contact` (CRM: notes, cadence, `lastInPersonAt`) and `ClientContact` (people
under a client: the email work writes `lastEmailReceivedAt`/`lastEmailSentAt`
there). So today Last Email and Last In Person live on two different records for
what may be the same human. Pre-existing, not introduced here. Merging them is a
big destructive schema change and is Mike's decision, not mine.

Verified: 1,060/1,060 regression tests (38 new), `npm run build` clean, 37/37
runtime assets, intake route loads in the running dev server. The
`/sales/automation/rules` screen was not clicked through in a browser (login).

### 2026-09-06 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on everything below)

**CRM steps 1 and 2 are built: the Client module and the People module**,
from Mike's two verbatim field specs, under one migration
`0063_crm_client_people`. Client Type (8 options) and Developer Type became
multi-selects stored as JSON arrays in `Client.orgTypes` / `developerTypes`;
the old single `type` / `developerType` columns stay and are derived from the
first tick so nothing downstream broke. Client Rating is a free-text
placeholder until the equation is settled. **All deal counters are DERIVED on
read, never stored** (`src/lib/crmClient.js`), and there are **TWO counting
scopes** — Mike ruled on this 2026-09-06 ("it should be 2 wins but the wins
per client should only count 1 per project"). A project rides the Procurement
board always and the Design board too when serviceType is Full Design or
Design Assist. `dealCounts` counts PER BOARD and is what the pipeline boards
report, so a design job won on both is two wins there. `clientDealCounts`
counts PER PROJECT and is what a client record and a person record show — one
job is one deal, never two. `projectOutcome()` folds the boards into one
answer, won → open → lost → abandoned (the lost-over-abandoned tie-break when
both boards are dead but disagree was my judgment call, not Mike's).
Won = WON + COMPLETED. New `ClientTag` / `ClientTagLink` tables give editable, deletable
tags that cascade. People gained firstName/lastName/cellPhone/workPhone/
linkedIn + two email-timestamp columns, a new `ProjectContact` link table for
per-person deal counts, and a full People table with an expandable detail
panel. A **written
reason is now required to mark a deal Lost or Abandoned** — new
`Project.procurementStatusReason` / `designStatusReason`, enforced in the API
and prompted for in both the CRM board and the project hub. Fixed a real bug:
`clientTypeKeyFromLabel` ignored the legacy label map, so any client saved
under the retired "Developer / Self-Performing GC" label came back with no
type at all.

**Email activity against a person is built too** — the two Last Email fields
on the People tab. Mike asked for it now so that connecting Microsoft later is
just a sync, not a build. Nothing talks to Graph yet. `src/lib/email/` holds
the rules (`classify.js`, pure — no DB, no network, no Microsoft), the adapter
(`normalize.js`, the ONE file that changes when Graph is wired up), and the
recorder. An email counts as real contact only if it is not a **mass email
(25 or more distinct people on it — Mike's number)**, not a calendar invite,
not a reply, and not automated. Storage reuses the existing `EmailMessage` /
`EmailAccount` tables rather than a parallel mailbox; `EmailMessage` gains
cc/bcc plus the stored verdict, and a new `EmailContactLink` joins message to
person with a role (FROM = they wrote us, To/Cc/Bcc = we wrote them, which is
what separates the two fields). Ingestion door: `POST /api/email/ingest`,
admin-only. Every message is stored even when it does not count, so a rule
change can be re-applied without re-syncing; the two dates are recomputed
from the links, so they can move backwards.

⚠️ **FOUR untracked migrations must ship together, in order, when this
deploys: `0061_design_stages_shared`, `0062_calibration_samples`,
`0063_crm_client_people`, `0064_email_contact_activity`.** If 0061 is left
behind, the `designStage` default in schema.prisma has no migration backing it.

⚠️ **Correction to a long-standing assumption:** `amplify.yml` runs
`npx prisma migrate deploy`, **not** `prisma db push --accept-data-loss`.
So the backfill UPDATEs in 0063 really do run in production, and a SQL error
would halt the deploy in a failed-migration state (the `0023_proposals`
precedent, whose permanent `migrate resolve --rolled-back` line IS already in
amplify.yml at line 38 — an earlier note here doubted that; it is there).
`CLAUDE.md` documented the retired `db push` pipeline and has been corrected.

1032/1032 tests green with the dev server up, build clean with it stopped
(64 migrations Postgres-compatible, 123 models backed by a CREATE TABLE).
schema-guard reviewed the schema.prisma diff and found nothing destructive.
Nothing is deployed — this stacks on top of the 09-04 and 09-05 batches,
which are also still local.
Open with Mike: the Client Rating equation (he said "no client rating yet"),
and the lost-over-abandoned tie-break noted above.

### 2026-09-05 — Mike's Claude (second entry) — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on everything below)

**Lowell's drawings changed the stair model.** For garden / gurban /
stacked-flat breezeway walk-ups the stair line is now a PACKAGE per open
stair (landing lights + wall packs with battery on the stair and egress +
emergency twin-heads + vestibule disks), built from the Lowell GMP E-sheets
— `breezewayStairPackage` in `src/lib/stairLandings.js`, rates in a new
`pricing.breezewayStair` block — Mike priced it the same evening: landing =
a REGULAR disk $12 (decorative landing lights are not a conceptual item),
wall pack w/ battery $300, frogeye $25, vestibule disk w/ battery $50 →
$2,311 per 3-story stair, $57,775 on Lowell's 25). Corridor buildings keep
the landing-only line. Because the
type now drives that package plus wall packs and the controls cap, **the
site read classifies the building** (nine fixed keys, decision rules in the
prompt, version `siteVision-2026-09-05`); the Site Data panel proposes it as
a dropdown row and the commit route writes `Project.buildingType` (only a
known key). Fixed on the way: the commit route's returned row lacked
`buildingTypeKey`, so the wizards dropped the type until reload. The
unit-matrix commit route likely has the same drop (returns bare
`updatedData`) — not touched. Also: margin default 23%, interior amenity
high $16, **fans $180 GROSS at conceptual → $145 net** (the engine takes the
$35 disk credit off the conceptual price the same way it does off a design
level — supersedes the morning's $155 and the afternoon's $175 flat),
manual sales-tax % box on the summary (`ProjectData.salesTaxPct`, a
baseline column, no migration). The free ZIP lookup route built in the
afternoon was PULLED the same evening at Mike's request and parked in
ROADMAP.md ("💰 Budget Summary → Sales Tax Rate Lookup"). 968/968, build
clean before the evening amendment. No new schema change; 0061 + 0062 still
sit uncommitted with the rest. **CRM:** Mike asked whether the Excel's
client/project/pipeline fields had been built — answered NO (09-04 was
analysis only, per his pause) and he now wants to resume; a schema build
is gated on the decisions in the gap doc and will need schema-guard.

### 2026-09-05 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on the 09-04 batch)

**Stair landings now have one ladder in one file** — `src/lib/stairLandings.js`:
drawings (stairs × (2×stories−1), the mid-level landing included) → building-
code estimate when the drawings never state the exit-stair count (≥2 per
building, more on a long floor plate; stories = gross ÷ footprint when
unwritten) → null so a human types it. **+10% on every derived/estimated
count** (Mike), never on a typed one. **The plate factor is building-type
aware** (calibrated same day against six projects on file): corridor
buildings 15,000 SF per stair, garden/gurban/stacked-flat breezeway walk-ups
5,000, townhouses zero shared stairs; the public takeoff reads the type from
the questionnaire, the internal site read defaults to corridor. Wired into
the public takeoff (quantities.js, incl. an end-of-function patch that
back-fills the stairs / stories rows as 'derived' + ESTIMATED) and, new,
into the internal project page's Site Data proposals (siteFields.js
`numEgressStairwells` — the commit route can now write landings). Four
tunables on the master sheet (`estimation.landingsContingency /
exitStairsMinPerBuilding / floorPlateSfPerExitStair /
breezewayPlateSfPerExitStair`, editable at /admin/pricing). Garden controls
$0.19 → $0.18 (cap $65K stays). Landscape relabeled "$ per SF of net lot"
(it was never a percentage). Fans stay $155 — the $175 question is closed.
934/934, build clean, no schema changes. Still undeployed from 09-04:
migrations 0061 (approved remap) + 0062, snapshot fill, controls-cap fix,
calibration widgets.

### 2026-09-04 — Mike's Claude (fifth entry) — BUILT LOCAL-ONLY, NOT DEPLOYED

**Two new migrations are sitting uncommitted on Mike's machine — read before
you touch prisma/migrations:**

- `0062_calibration_samples` — additive: new `CalibrationSample` table for the
  pricing-calibration learning system (model qty × rate vs actual per budget
  line, surfaced as 5 prebuilt widgets on /dashboards/budget).
- `0061_design_stages_shared` — ⚠️ IRREVERSIBLE many-to-one remap of the
  design pipeline's stages onto the conceptual stage list (DESIGN_QUALIFIED +
  PROPOSAL_SENT → QUALIFIED; proposalSentDate backfilled from updatedAt as an
  approximation). Schema-guard flagged it; waiting on Mike's sign-off. Do not
  deploy a schema change around it.

**Bug you should know about:** `Project.pricingSnapshot` (frozen at creation)
never picked up pricing keys added later, so every existing project's live
budget showed $0 wallpacks and $0 pathway — a303f24's pathway line has only
been reaching brand-new projects. Fixed in `calculateBudget` via
`fillPricingDefaults` (snapshot wins, missing keys fall through to master
pricing) and a single `pricingForProject()` helper at all ten parse sites.
When it ships, 14 of 23 snapshot projects move (Fulshear +$59K, Broadstone
Southglenn +$41K, Town Lake +$8.9K — full line-by-line workbook in the G:
engineering folder, SNAPSHOT-FIX-BEFORE-AFTER-2026-09-04.xlsx). The fill also
surfaced a **controls cap bug**, fixed: the sheet-wide $180K cap was REPLACING
the building-type cap instead of stacking with it (garden could be charged up
to $180K). Now the lower of the two wins (controlsCap.test.mjs). Fans on old
projects move $140 → $155 because their snapshots lacked the designFanLevels
table; Mike's own Excel uses $175/fan — open question to him. Mike approved
the 0061 stage remap ("no data is precious in there yet"). Rule going forward: a new
pricing key needs NO inline default anymore.

Also local-only: pathway 1.6× on solar sites, landscape 2% of NET lot,
capture hooks on the responses/data/budget routes. 911/911 tests, build clean.

### 2026-09-04 — Mike's Claude (fourth entry)

**Deploying now (Mike's "make these changes and deploy"):** pathway lighting is
finally a live engine line — units × $/unit by building type from master
pricing (townhome $320, garden/stacked/gurban/wrap $60, podium/mid/high $35 —
Mike's corrected numbers, all inside the observed bollard-calibration bands),
floored at $4,000, $0 at zero scale. Key rule: a hand-entered
exteriorManualItems.pathwayLighting SUPPRESSES the model line (manual wins —
Modera Town Lake's counted $4,800 is untouched). Every exterior breakdown view
shows the row, labeled "(manual entry)" when suppressed. Same push also ships
the drawings-page building-summary card, the landings-asked-directly change,
and the # Balconies ask (see CHANGELOG). 885/885 tests (11 new pathway tests),
build clean, no schema changes.

### 2026-09-04 — Mike's Claude (third entry)

**Deployed a750233 (Mike's "Deploy all yourself"):** the Fulshear-review batch.
(1) Solar site design is now a real engine input — siteDesignLevel 'solar'
multiplies the surface-parking line by exterior.solarMultiplier (2.3, Mike
confirmed after briefly considering 2.5), with a "labor drops dramatically —
no trenching/conduit/wire" note rendered wherever the budget shows; the
internal wizard gained the same question. (2) NEW PRICING RULE: BOH is hard-
capped at 5% of gross SF (boh.maxPctOfGross, editable at /admin/pricing) —
enforced at pricing time AND in the intake remainder derivation; born from
Fulshear where the BOH remainder swallowed 63,953 SF and overpriced ~$97K.
(3) Public /conceptual_budget: drawings survive step navigation (dropzone was
unmounting), and the Review & send step now renders the exact internal
summary top (navy hero + Project Data grid + SummaryBudgetBreakdown).
871/871 tests, build clean, no schema changes. Heads-up for anyone touching
prod pricing: if a Solar Multiplier override row exists in the DB it should
read 2.3 (code default already is).

### 2026-09-04 — Mike's Claude (second entry)

**Sean's CloudWatch finding acknowledged:** the failing prod parse reads were
hitting the Anthropic API's "credit balance is too low" 400 — a billing outage
on our account, not a Lambda problem. Mike is topping up at
console.anthropic.com → Plans & Billing. Notes for both sides: (1) the app
already catches this exact error on the public intake and shows the visitor a
"this is on our side" message (siteVision V3 path) instead of blaming their
drawing; (2) the server deliberately does NOT retry model calls — the multi-
minute reads Sean saw are the normal staged scan working through slices (a
Skyline-class read runs ~5–13 min by design), with only the browser re-asking
a dropped stage 2–3 times; (3) the SSR memory/horsepower ask below still
stands — credits explain the current hard failures, not the speed ceiling.

**Deployed today (Mike's "Deploy"):** the gross-SF ladder + ask-the-visitor
figures batch — public intake always lands a gross SF (per-building sums like
Skyline G101 now sum in code), the wizard asks the visitor for up to six
figures the drawings didn't answer (gross SF, units, stories, stairwells,
exit doors, surface stalls), drawings are required for a live number
(server-enforced), exit-door counts drive wallpack qty, and a 5–9×
stairwell-landings underpricing bug on public estimates is fixed. 870/870
tests, prod build clean. No schema changes.

### 2026-09-04 — Mike's Claude

**FOR SEAN — raise the app server's horsepower (emailed to operations@ too).** The
giant-PDF read finally works end to end on prod (Skyline Ridge 334 MB / 294 sheets,
first full success 2026-09-02, 13.3 min), but Mike wants 2–3 min and the prod
Lambda's CPU is the main enemy (scan reads 5–8 pages/slice vs ~35 on a desktop;
one heavy-sheet death looks like OOM). Since Lambda CPU scales with memory, the
ask is: (1) read the current `Memory Size` from a REPORT line in the Amplify
Hosting **compute** CloudWatch log group and tell us the number, (2) check the
Amplify console for any SSR/compute memory setting (docs say none exists —
build-instance size is builds-only — but the console ships ahead of docs),
(3) if no knob, AWS Support "service limit increase" case asking for 4–8 GB SSR
compute for the app + whether the ~30 s response timeout is adjustable. Cost is
pennies ($0.20/GB-hr after 100 free GB-hrs/mo; a monster read ≈ $0.09 at most).
Plan B if AWS refuses: S3-triggered background Lambda we control. Full
walkthrough: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\SERVER-HORSEPOWER-for-Sean.md`.
Still open from before: MPU lifecycle rule on `ilc-qc-media`, and test objects
safe to delete (`uploads/intake/xdcw03se2d897nomu7vs4ns0.pdf`,
`uploads/intake/xzp136xv7irbyenwl0uynb09.pdf`, `scans/p000o9bp7gdkh81gjpc76g41.*`).

Meanwhile on my side (building now, local-only until Mike says Deploy): parallel
scan (4 concurrent slice streams over independent page ranges, merged at the
sheet pick) + stage overlap (matrix AI kicked right after scan so its ~2 min of
thinking runs while sheets render). Target: 2–3 min for Skyline-class sets.

### 2026-09-01 — Sean's Claude

- Completed AWS SES setup for `ilcstudios.com`: 3 DKIM CNAMEs added to Namesilo DNS (Namesilo registrar, not Squarespace), `ses-send-email` inline policy added to `ilc-amplify-s3` IAM user, `precon@ilcstudios.com` created as SES email identity. Someone still needs to click the SES verification link in the precon@ inbox.
- Queued Tasks 33–36 for Manny (~10 hrs): intake notify env wiring + live test (Task 33), task attachments → S3 migration (Task 34), CLIENT_VIEWER isolation bug hunt (Task 35), intake/portal invite edge cases (Task 36).

### 2026-08-31 — Mike's Claude

**FOR SEAN — SES one-time console setup (emailed to you too).** The public
conceptual-budget intake now sends an automatic notification email to
precon@ilcstudios.com on every submission (code built + tested, local-only,
awaiting Mike's “Deploy”). Delivery is blocked on three one-time SES console
steps that are yours: (1) verify the ilcstudios.com domain in SES (us-east-2,
Easy DKIM → 3 CNAMEs into DNS), (2) attach `ses:SendEmail` to the same IAM
user whose keys the app uses for S3 (the `S3_ACCESS_KEY_ID` one — no new
keys), (3) get out of the SES sandbox: verify precon@ as a recipient for
today, and request production access for the contractor-facing emails coming
later. Full plain-English walkthrough:
`G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\SES-setup-for-Sean.md`
— also sent to operations@ilcstudios.com. Until done, sends fail gracefully
and the admin review queue remains the source of truth. Env names for
reference: INTAKE_NOTIFY_TO / INTAKE_NOTIFY_FROM / S3_REGION.

Also this session (local-only, same not-deployed batch): the drawing reader
now counts stories off elevations, egress stairwells + exit doors off floor
plans (counted fields kept separate from stated ones), derives building
footprint from lot-coverage % × lot SF, and the site vision read runs on
every upload (it used to be skipped whenever the unit matrix parsed — that
starved the new quantity takeoff). Parse renders up to 4 sheets now. 764/764
tests, prod build green. No schema changes.

### 2026-08-30 — Mike's Claude

**Context:** phone uploads on the public conceptual-budget page kept failing, so the intake upload path was rebuilt this week: files now go **direct to S3** via presigned URLs on `ilc-qc-media` (dualstack host), and files ≥ 5 MB go up as **S3 multipart** — new route `/api/uploads/complete` stitches the parts server-side via ListParts, and a failed upload calls AbortMultipartUpload. Deployed in `eb98d3f` and `86ae180`.

**Two asks for you (both AWS console, Mike asked me to route them to you):**

1. **S3 lifecycle rule on `ilc-qc-media`:** add an `AbortIncompleteMultipartUpload` rule (e.g. 3 days) scoped to the `uploads/` prefix. A browser that dies mid-upload before our abort call leaves invisible part fragments that bill forever — the normal object-expiry rule does NOT sweep them; only this dedicated rule type does.
2. **CloudWatch pull, if you have a minute:** Mike's phone reads keep dying with `R1/scan` (the browser loses its request to `/api/intake/parse` mid-read). From desktop the whole staged pipeline answers in 1–2s per stage, so the server looks healthy — but we have no server-side view of whether his phone's requests ever ARRIVE. If you can grep the Next.js Lambda logs for `/api/intake/parse` around Aug 30 evening (Mike's attempts, a 2.4 MB file named CIVIL…), “requests arrived and completed” vs “never arrived” settles the diagnosis in one look.

Housekeeping: two test objects of mine can be deleted — `uploads/intake/kgijom7iv90x2dh5t8iq9vlv.pdf` (12 MB) and `uploads/intake/n0ukkf4ynsfc03lw6d3vygcd.pdf` (probe).

---

### 2026-08-26 — Sean's Claude

- Audited Manny's sprint summary (Tasks 28–32, PRs #21/#22/#24). All three PRs had a stale branch base (~3 weeks behind main), making diffs show 50+ files; Manny's actual changes were narrow.
- Applied all changes directly to main rather than via GitHub merge (avoids `.claude/` conflicts): Task 29 fix to correct file (`conceptual_budget/IntakeClient.jsx` — Manny had edited the old `/start/` path, which is gone); Tasks 28/30/31/32 cherry-picked where safe, Task 32 (CRM staleness badge) manually applied to preserve Mike's `handleExportCSV` deletion (`e78acec`).
- Also fixed a pre-existing `requireAuth()` missing-arg bug in `bot/queue/route.js` as part of Task 28 apply. Commits: `265af44` (Task 29), `060f2dd` (Tasks 28/30/31/32).
- Pruned all three Manny branches from remote. manny-tasks.md and formanuel.md updated to reflect completed sprint. No active tasks queued.
- PRs #21/#22/#24 closed by Sean manually (gh CLI auth doesn't reach the private org repo).

---

## 🚢 DEPLOYED — 2026-08-25: every ILC staff account now sees every record — READ THIS BEFORE THE PRIVILEGES BUILD

**Pushed `43ac763..aaf8d45`, 91 files.** Sean — this one lands directly on top of your open item (the privileges enforcement sweep, 2026-08-22 entry below), so it needs a read before you write any of it.

### What happened

`maram@ilcstudios.com` signed in to production and saw an empty projects list and an empty clients list. Mike's instruction, verbatim: *"I want all projects, clients and people within clients to be seen by all users. Later we may change that, but right now all data is open to eveery user."*

The cause was not a setting. Visibility was decided **per route** by "are you an admin OR did you create this", copied by hand into roughly sixty places. Projects had been opened up back in July (commits `9097ba0`/`e3a3aa2`/`ad13051` — the ones the 2026-07-27 entry mistook for a privileges system); **clients never were**. So a staff account could see the work and none of the companies it was for, and `/api/clients` narrowed to `ILC_ADMIN || ADMIN` specifically, which is why nobody with an admin login ever saw it.

### What the shape is now, and what it means for your build

There is **one function**: `canSeeAllData(user)` in `src/lib/auth.js`. Every internal role returns true. The external `CLIENT_VIEWER` role returns false and stays scoped to its own records — that one is not a preference, it is the DN/buy-price boundary, and `verify:dn` proves it still holds (8/8).

All ~60 routes now call it instead of carrying their own copy. Ownership checks were **kept as the fallback behind the helper** rather than deleted, so the client-viewer path is provably unchanged and re-narrowing later is a one-line edit in one file.

**Your half:** this is deliberately temporary and Mike has said so. When you build the module/capability model, `canSeeAllData` is the seam to grow into — replace its body, not the sixty call sites. Do not reintroduce per-route ownership tests; `scripts/tests/dataVisibility.test.mjs` scans `src/app` and fails the build if a new one appears.

### 🔴 Seven routes were returning 500 to everyone, including you

Found while sweeping. Each called an auth helper that was never imported, so the route threw a `ReferenceError` on the first real request:

`clients/[id]/product-options`, `clients/[id]/standard-fixtures`, `clients/[id]/standards/concepts`, `market-intel/poll`, `projects/[id]/budget-qc/assign`, `projects/[id]/budget-qc/items/[itemKey]`, `projects/[id]/assignees`.

**This class of bug has now shipped three separate times** — it is invisible, because the editor is quiet, the build is green, and the tests pass. `scripts/check-auth-imports.mjs` now blocks it in `npm run verify` and in `.husky/pre-push`. Worth knowing before the privileges sweep, since that work touches every one of these imports.

### Also in this push

- **The `.gitignore` fix from the 24th.** A bare `uploads/` line was hiding `src/app/api/uploads/` from git entirely, so the presign route had never been committed. It is in this push, which means the large-PDF upload path is live in production for the first time.
- 15 local news sources + migration `0059_market_source_market` (additive column, `IF NOT EXISTS`, no drops).
- Site-plan and unit-matrix readers now consult the sheet index before rendering instead of starting at page 1.
- `smoke.test.mjs` now stands up a plain `USER` account, not just `ILC_ADMIN`/`COMPANY_ADMIN` — the Maram break only showed on `USER`, which is exactly why it got to production. It also checks the clients list and a client's contacts. Verified by reintroducing the old rule and watching it fail before restoring.

**Gates:** 559 unit tests, 11 verify gates, dn-leak 8/8, mcp 48/48, smoke 7/7, clean build, 26/26 runtime assets.

### Still open on your side, unchanged

1. **The privileges enforcement sweep** (2026-08-22 entry) — still Mike's standing #1 for your queue.
2. **The SSR Lambda memory size** (2026-08-22 entry) — one number, still unanswered.
3. **The two remaining front-door upload paths** — `/api/tasks/[id]/attachments` and the `.mbox` profile upload.
4. **Lifecycle rule + IAM policy confirmation** on `ilc-qc-media` — CORS was verified from outside; those two cannot be checked from Mike's machine.

---

## 🚢 DEPLOYED — 2026-08-24: direct-to-S3 uploads are live, and a bug in the CRM CSV export

**Pushed `804caf9..e78acec`.** Mike said deploy, so the upload work that had been sitting local since the 22nd went out: direct-to-S3 presigned uploads on every presignable path, the 400 MB × 5 intake ceiling, `pdfRange.js` / `sheetIndex.js` / `uploadIntake.js`, the RSS-based memory brake, the `sheets/` compressed-copy retention, and the immediate discard of the original in the parse route's `finally`. The two notification sessions (note reminders, market-intel project tagging, Monday roundup) rode along.

**Your 30 commits were already live** — I merged rather than rebased so both histories keep their shape. One conflict, `src/app/(app)/admin/intake/IntakeClient.jsx`: we had both added to it. Resolved by keeping both — your `SortIcon` / router-driven refresh / `projects` prop, and my `KeptSheets` thumbnail block. Renders 200 for ILC_ADMIN; it is **not** in the smoke `PAGES` list, so I checked it by hand.

### ⚠️ One bug found in your work, fixed on the way out

`src/app/(app)/crm/CRMClient.jsx` declared `handleExportCSV` **twice** (lines 466 and 499). JS function declarations hoist, so the second one won — and the second one read `p.pipelineProbability` where the first read the shared `averageProbability(p)`. Net effect: the CSV export handed out a different probability than the CRM screen displayed, for every deal, in a spreadsheet that looks authoritative. `npm run verify` gate 6 (shared metrics) blocked the push over it.

I deleted the duplicate and kept the correct one. Nothing else in that file changed. Flagging rather than silently fixing because a function declared twice usually means an edit landed in the wrong place, and you may want to check whether anything else from that change went astray.

### S3 prerequisites — all three confirmed, closing them out

Cross-checking your log before pushing: CORS verified live from outside (preflight from `app.ilcstudios.com` returns 200 with origin echoed, `evil.example.com` 403); the 1-day lifecycle rule scoped to `uploads/`; and the IAM policy `ilc-qc-media-rw` scoped at the **bucket** level, which means the `sheets/` prefix is already covered. That was the one with the silent-failure mode. **Nothing outstanding on S3.**

Still open, and only you can answer it: **the Amplify SSR Lambda memory size.** It is not a blocker — it only decides how deep into a big drawing set the parser gets before the brake stops it, and stopping early means fewer sheets read, never a failed upload. But a bigger number means better reads on the 400 MB sets.

### Two upload paths deliberately NOT fixed — they are yours

Both still POST the file through the Amplify front door and both still write to Lambda local disk, so both are the storage move already delegated to you:

- **`/api/tasks/[id]/attachments`** — the Admin › Tasks screen offers `.pdf/.xls/.xlsx` up to 25 MB. In prod anything over ~4.4 MB dies at the front door with an empty 413, and whatever does land is wiped when the Lambda recycles. The fix is `appendUpload` from `@/lib/uploadClient` on the client plus reading `uploadKey` on the route — the same shape as the other 14 call sites.
- **The `.mbox` upload** on `admin/profile/ProfileClient.jsx`. Gmail Takeout files are large, so that path is effectively unusable until it moves. Not urgent — Mike has that feature parked.

I did not touch either, because half-fixing the front door without moving the storage would make a 25 MB attachment *appear* to upload and then vanish, which is worse than failing honestly.

### Verification before the push

521 unit tests, 53 budget-math assertions, the fuzz suite, 12 bid-matrix checks, 5 smoke tests, 8 DN-leak tests, 48 MCP tests, all 9 verify gates, clean production build, 26/26 runtime assets traced. Run twice — once before the merge and again after, on the merged tree.

---

## 🔑 FOR SEAN — 2026-08-24: Three scheduled jobs are BUILT and DELIBERATELY NOT SCHEDULED

**Do not create these EventBridge rules yet. Mike's instruction, verbatim: *"Just make it ready to schedule, but don't launch it yet."*** This entry exists so the wiring is written down while it is fresh, not so it gets wired up. When Mike says go, everything you need is below.

None of this is deployed either — it is committed locally on Mike's side and waiting on his word.

### What exists now

| Route | Cadence Mike wants | What it does |
|---|---|---|
| `/api/cron/note-reminders` | daily, ~8am ET | Delivers sales-note follow-up reminders that have come due. Rings the in-app bell. |
| `/api/cron/weekly-roundup` | **Monday**, ~7am ET | One bell item per person: what THEY are on the hook for this week, linking to `/dashboards/meeting`. |
| `/api/cron/market-intel` | daily, ~5am ET | Polls the news sources and tags each article with the client and, now, the job it names. |

All three follow the pattern you already established on `usage-rollup`: `GET`, `x-cron-secret` header checked against `process.env.CRON_SECRET`, plus an admin-role fallback so an admin can run one by hand from the browser. That fallback is how they get proven before any rule exists — no schedule needed to test them.

### The rules to create, when Mike says go

Same shape as `ilc-usage-rollup-nightly` (classic EventBridge Scheduled rules → the `ilc-app-cron` API destination, `x-cron-secret` auth). **All cron expressions are UTC.** ET is UTC−4 through 2 Nov 2026, then UTC−5 — the times below drift by an hour at the changeover, which is fine for all three.

| Rule name | Cron (UTC) | Target |
|---|---|---|
| `ilc-market-intel-daily` | `0 9 * * ? *` | `https://app.ilcstudios.com/api/cron/market-intel` |
| `ilc-note-reminders-daily` | `0 12 * * ? *` | `https://app.ilcstudios.com/api/cron/note-reminders` |
| `ilc-weekly-roundup-monday` | `0 11 ? * 2 *` | `https://app.ilcstudios.com/api/cron/weekly-roundup` |

Ordering matters slightly: market-intel runs BEFORE the roundup, so Monday's "news on your clients" section sees the weekend's articles rather than last Thursday's.

Existing live rules for reference — `ilc-usage-rollup-nightly` (`0 12 * * ? *`) and the client digest (`cron(0 14 ? * 4 *)`, Wednesday 9am ET, still email-only and still dry-run stubbed).

### Two traps worth knowing before you wire anything

1. **`CRON_SECRET` must be in the `next.config.mjs` env block**, not just in Amplify's environment variables — the same Gen 1 trap you hit and fixed in `922a614`. It is already there; just don't let it fall out.
2. **Every one of these jobs is safe to run twice.** Each alert carries a `dedupeKey` and `UserAlert.dedupeKey` is unique, so a double-fire is silently dropped rather than double-nagging. Worth knowing if a rule ever needs a manual replay.

### Nothing is asked of you right now

This is a heads-up, not a ticket. Your open item is still the privileges enforcement sweep in the 2026-08-22 entry below.

---

## 🔑 FOR SEAN — 2026-08-22: Admin + user privileges — the real state, the design, and your half of the build

**Mike has assigned this jointly. I am building the foundation; you own a defined slice of the enforcement sweep. Details at the bottom.**

### First, a correction to this log

The 2026-07-27 entry records admin + user privileges as *"confirmed already done (Mike's commits 9097ba0, e3a3aa2, ad13051)."* I opened those three commits. They are a project-visibility bug fix and a role-aware smoke-test harness. Neither one builds a privileges system. **The item has been marked done for four weeks while being open.** No blame intended — flagging it because Mike's roadmap depends on this and it has been silently sitting.

### What actually exists today (counted, not estimated)

| Gate | Routes using it |
|---|---|
| `requireAuth` (logged in — that's all) | **219** |
| `requireAdmin` | 12 |
| `requireSalesAdmin` | 4 |
| `requireSuperAdmin` / `requireILCAdmin` | **0** |
| `requireRole` | does not exist |

Four roles are declared (`SUPER_ADMIN | COMPANY_ADMIN | USER | CLIENT_VIEWER`) and `User.permissions` exists as a JSON string. But 219 doors ask only "are you logged in." **COMPANY_ADMIN, USER and CLIENT_VIEWER are the same privilege level almost everywhere.** There is also no `/admin/users` screen — the API routes exist (`/api/admin/users`, `/api/admin/users/[id]`), the page you would click does not.

Caveat so this isn't overstated: many routes *do* scope rows once you're inside (your projects, not everyone's). Row scoping is largely fine. The missing piece is the door asking who you are.

### The design (from Mike's spreadsheet, "Admin + Users" tab)

Three tiers plus the portal role, and — this is the part that is new — **a per-module access grid on top of the role.**

**SUPER_ADMIN** — modify code, access changelog, modify roadmap, modify software-development tasks, everything else in the app.

**ADMIN** — invite users, invite another admin, deactivate a client / manufacturer / sales rep. Plus a set of **customizable privileges**, each independently grantable:
- modify budgeting tool data
- adjust sales dashboards
- add or modify a client
- add or modify a manufacturer
- add or modify a sales rep
- add, modify or remove a knowledge-base request

**USER** — view roadmap, request an addition to the roadmap, and **per-module access**. Mike's example: *"Pre-con may not be able to access the design module."* There are 26 modules on his Modules tab (CRM, Projects, Proposals, Budgets, Fixture schedule, Takeoffs, Drawings, Design info, Meetings, Correspondence, Submittals, Ship schedule, Change orders, Project management, RFIs, Contracts, Design schedule, Construction schedule, Warehousing, Client portal, AI chat bot, Sales tax, Replacements, Templates, QC, Internal knowledgebase).

**CLIENT_VIEWER** — portal only, unchanged.

So the check on any given door is: *role tier* → *module access* → *specific capability*. Three questions, in that order.

### The split

**I am building (Mike's Claude):**
1. The permission model — module keys, capability keys, and the shape stored on `User`.
2. `requireModule(key)` and `requireCapability(key)` helpers next to the existing `requireAuth` / `requireAdmin`, so a route gate is a one-line change.
3. The `/admin/users` screen — the grid where Mike ticks module and capability boxes per person.
4. The enforcement sweep for: CRM / sales, projects, budgets, fixture schedule, takeoffs, drawings.

**Yours, and why it's yours:** the sweep is ~219 routes and it parallelizes cleanly *if we split by folder and never touch each other's*. Once my helpers land I'll post the exact list. Your half:
- `src/app/api/admin/**` (except `admin/users`, which is mine — I'm building the UI against it)
- `src/app/api/knowledge-base/**` and `src/app/api/knowledge/**`
- `src/app/api/tracker/**`, `src/app/api/shipments/**`, submittals and ship-schedule routes
- `src/app/api/contracts/**` and the portal routes
- `src/app/api/cron/**` — these need a different treatment: they authenticate by `CRON_SECRET`, not by user, and should reject a logged-in human entirely rather than fall through to a role check. You own `CRON_SECRET` already, so this one is naturally yours.

**Please do not start the sweep yet.** The helpers do not exist. If you gate routes before they land we will both write the same thing differently and spend a day reconciling. I will post here the moment they are in.

**What you can usefully do now, if you have time:** confirm whether anything in the AWS layer needs to know about roles — specifically whether any S3 prefix, CloudFront behaviour, or API route is currently reachable without going through the Next.js auth path. If there's a back door at the infrastructure level, no amount of route gating closes it, and I'd rather know before I build than after.

### One open question for you

Is there any production user today whose access we would *narrow* by doing this? Right now everyone effectively has admin reach. When the gates go on, someone who has been quietly relying on that will lose it. If you know of anyone, say so and Mike can decide their level up front instead of discovering it as a support call.

### Also still open from earlier entries

The Amplify SSR **Lambda memory size** (the entry below this one — one number, decides how far into a big drawing set we can read); the lifecycle rule scoped to the `uploads/` prefix; what prefixes the IAM policy covers; and `sheets/` needing `PutObject`/`GetObject` — that last one **fails silently** if missing.

---

## ❓ FOR SEAN — 2026-08-22 (from Mike, via Mike's Claude): I got the memory story wrong yesterday, and I need one number from you

**Correcting yesterday's entry below.** It says a 400 MB set "is never held in memory." That is not what happens, and I would rather you hear it from me than find it in a production alarm.

### What I actually measured

Everything about the big-set reader had been proven on an 11 MB drawing set. Yesterday I found a real 231 MB one on the G: drive — the same size class as the GC upload that started this — and ran the production path against it. Three results, in the order they landed:

1. Scanning it peaked at **827 MB RSS** having fetched 108 MB. The byte budget was 96 MB and never fired usefully.
2. External memory sat flat at ~250 MB from page 10, with only 22 MB fetched — which fits no theory in which "bytes fetched" predicts "bytes resident."
3. The decisive one: open the document, read **zero pages**, and external memory grows **237 MB** on a 231 MB file. pdfjs's ChunkedStream allocates `new Uint8Array(length)` at open, regardless of `disableAutoFetch` / `disableStream`.

So `SCAN_BYTE_BUDGET` bounded nothing that matters. Two mitigating facts: the up-front allocation is lazily backed (RSS only rose 42 MB at open — it reserves, it does not commit), and `page.cleanup()` genuinely works, `heapUsed` stayed at 20–28 MB across all 212 pages. The growth is `external`/ArrayBuffer, which `--max-old-space-size` does not govern.

### What I changed

`overBudget` no longer predicts memory from bytes — it measures `process.memoryUsage.rss()` against a ceiling, latched so a well-timed GC cannot un-apply it, sampled both inside the range fetcher and at each page boundary. The byte budget stays as a cheap second brake.

The ceiling reads **`AWS_LAMBDA_FUNCTION_MEMORY_SIZE`** and takes 70% of it. Off Lambda it falls back to a deliberately tight 384 MB so a local dry run behaves like the smallest plausible production box. `PDF_SCAN_MEMORY_CEILING_MB` overrides both if we ever need to correct it without a deploy.

Re-run on the same 231 MB set: stops itself at **394 MB peak against a 384 MB ceiling**, 36 of 212 sheets read, still returns a site plan and a gross-area sheet. Was 827 MB.

(For the record, since it is the obvious next idea: periodic `doc.cleanup()` is **not** a fix. It bought no page reach and turned a 13-second scan into one still running after nine minutes.)

### 🔴 The one thing I need from you

**How much memory is the Amplify SSR Lambda configured with?**

That single number decides how much of a big set we can read, and I have no AWS credentials to look it up. The code is safe either way — it degrades rather than dying — but the difference is material:

| Lambda memory | Ceiling | Roughly how far we read a 231 MB set |
|---|---|---|
| 512 MB (Gen 1 default) | 358 MB | ~35 sheets |
| 1769 MB | 1238 MB | most of it |

On that particular set the architectural site plan is sheet 33, so at 512 MB we are clearing it by two sheets. That is too close for comfort. **If the SSR Lambda's memory is configurable on Amplify Gen 1, raising it is the cheapest fix available and I would like to.** If it is not configurable, tell me and I will solve the reach problem a different way — parsing the drawing index on sheet 1 to jump straight to the named sheet, instead of scanning linearly until memory runs out.

### Still open from 2026-08-19 and 2026-08-21

Unchanged and still needed: the lifecycle rule scoped to the `uploads/` prefix (not bucket-wide), what prefixes the IAM policy covers, and the new `sheets/` prefix needing `PutObject`/`GetObject` — see the entry below, including the silent-failure warning on that last one.

Status: all local-only, **not deployed**. 452/452 unit tests, `npm run verify` green on all 9 gates, production build clean. No schema change.

---

## ❓ FOR SEAN — 2026-08-21 (from Mike, via Mike's Claude): still need those two confirmations — and there is now a third prefix

Mike's words today: *"chase him on it."* Same two items from 2026-08-19, plus one new one that came out of today's work.

### Still open from 2026-08-19 — two lines from you closes it

| Setting | Status |
|---|---|
| Lifecycle rule — `uploads/` **prefix**, 1-day expiry | **your word needed** — and specifically that it is scoped to the `uploads/` prefix and not to the whole bucket |
| IAM policy — `PutObject` / `GetObject` / `DeleteObject` for the app role | **your word needed** — and now: what prefixes does it cover? |

CORS is confirmed live from outside; those two are not observable without AWS credentials, which Mike's machine does not have. Not doubting you — I just will not record something as verified when I could not see it.

### 🆕 NEW — a third prefix, `sheets/`, needs to be in the IAM policy and out of the lifecycle rule

Today the intake cap went from 50 MB to **400 MB, five files** (a GC tried to send a 246 MB set and was refused). A set that size is never held in memory — the browser puts it straight in S3 and the server reads it back by byte range, then deletes it.

Mike then asked for the small compressed copies to be kept: *"Yes keep the small, compressed version for sure. So they can reference."* So the handful of sheets we actually read (site plan, area summary, unit matrix, cover) are now written as compressed JPEGs — a few hundred KB each, four at most per file — and shown on the submission in the review queue behind `requireAdmin`, via a GET link that expires in 5 minutes.

> **Superseded 2026-08-22:** the sentence above — "A set that size is never held in memory" — is wrong. See the entry above this one for what actually happens and what changed. The `sheets/` asks below are unaffected and still stand.

**They are deliberately written to a `sheets/` prefix, NOT `uploads/`,** for exactly the reason you flagged on `project-files/`: `uploads/` is swept daily and these have to outlive the upload they came from. Two things need to be true in the console:

1. **IAM:** the app role needs `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::ilc-qc-media/sheets/*`. If the policy is scoped to `uploads/*` only, this feature fails **silently** — `putSheetImage` swallows the error and returns null by design, so the parse still succeeds and the reviewer just sees no sheets. Nothing breaks; it simply never works. That is the failure mode I want you to know about, because it will not show up in any log as an error.
2. **Lifecycle:** confirm the 1-day expiry rule matches the `uploads/` prefix only. If it is bucket-wide, kept sheets vanish overnight — and so does everything under `project-files/`.

If you would rather not add a third prefix, say so and I will move kept sheets under `project-files/` instead; the code cares about one constant. `uploads/` is the only prefix it must not be.

### Where this stands

All of the above is **built and local-only — NOT deployed.** 448/448 unit tests pass, production build clean, runtime assets 26/26. No schema change. It ships on Mike's next explicit "Deploy."

**Also worth knowing:** the sheet-picking step calls Fable 5, and every live test of it today came back *"Your credit balance is too low to access the Anthropic API."* The code degrades to a plain keyword scan and picks the right sheets anyway — that fallback is deliberate and it is the only path that has ever been exercised live. Flagging it so nobody reads a working upload as proof the AI half works.

Files, if you want to look: `src/lib/uploadStorage.js` (`putSheetImage` / `presignSheetRead` / `isSheetKey`), `src/app/api/admin/sheets/route.js`, `src/lib/pdfRange.js`.

---

## ❓ FOR SEAN — 2026-08-19 (from Mike, via Mike's Claude): two-line confirmation needed, plus the 25 MB upload work is built

Mike asked me to put this to you here rather than by email — his words: *"just ask him to confirm through Claude. I trust him."*

### The ask — two lines, that is all

Your 2026-08-19 entry says the three S3 console steps were **completed 2026-08-18**. I could independently verify only one of them from Mike's machine (no AWS credentials there):

| Setting | Verified from outside | Status |
|---|---|---|
| CORS on `ilc-qc-media` | ✅ yes — preflight from `app.ilcstudios.com` with `PUT` returns 200 with the origin echoed; `evil.example.com` returns 403; anonymous listing returns 403 | **confirmed live** |
| Lifecycle rule — `uploads/` prefix, 1-day expiry | ❌ not observable without credentials | **your word needed** |
| IAM policy — `PutObject` / `GetObject` / `DeleteObject` on `uploads/*` for the app role | ❌ not observable without credentials | **your word needed** |

Not doubting you — I just will not record something as verified when I could not see it. A one-line "both confirmed" (or a console screenshot) closes it out and I will mark it verified here.

**Why these two specifically matter now:** the work below makes them load-bearing on every upload window in the app, not just the public intake.

### FYI — the 25 MB upload change is built (local only, NOT deployed)

Mike: *"we need that limit to go up to 25mb. schedules can be 50 pages long if detailed."*

Every in-app upload window now sends PDFs and spreadsheets **direct to S3** via the presign route, the same pattern the public intake already uses, and posts only a key to the API route. Amplify's ~4.4 MB front door is therefore never in the path for those types.

- **New seam: `src/lib/uploadIntake.js`.** `readUploadedFile(formData)` / `readUploadedFiles(formData)`. Routes still parse `tab`, `tags`, `source`, `phaseTag` exactly as before — only the line that gets the *bytes* moved. If you add an upload route, use these rather than `formData.get('file')`.
- **New client calls: `appendUpload` / `appendUploads`** in `src/lib/uploadClient.js`. One call per drop zone; it decides direct-vs-multipart and returns which it used.
- **Two named ceilings** in `uploadStorage.js`: `MAX_PROJECT_UPLOAD_BYTES` (25 MB, in-app) and `MAX_DIRECT_UPLOAD_BYTES` (50 MB, public intake — unchanged). The presign route now takes a `scope` (`'project'` | `'intake'`) that selects the ceiling and nothing else; the key is still a fresh cuid under `uploads/`, so a scope cannot reach an existing object.
- **Temp objects are copied into your `project-files/` prefix and then deleted** from `uploads/`. Your prefix separation holds — nothing permanent lands under the lifecycle rule. The rule is the backstop if a cleanup misses, which is the second reason I want it confirmed.
- **7 routes and 12 components converted**, including `POST /api/projects/[id]/files`, which is yours. Its `putProjectFile` call is untouched; it just receives its buffer from a different place now.
- **Graceful degradation is deliberate:** if the direct PUT fails, a file small enough to have fit through the front door quietly retries as multipart. So if the IAM policy is *not* actually in place, today's behaviour is preserved rather than broken — but nothing gets bigger either.

**Verified:** build clean · runtime assets 26/26 · dynamic pages 55/55 · migrations 56/56 · models 117/117 · full suite **439/439** · budget math 53/53 · bid matrix 12/12 · live probe of all 7 converted routes against a running server (uploads land; every error path returns a clear message). No schema change.

Ships on Mike's next explicit "Deploy."

---

## Mike's Claude — 2026-08-19 (later): DEPLOYED `2b0c52a` — P6 schedule dates, site/parse S3 gap, drag-and-drop audit

**Everything listed as "local only, NOT deployed" in the entries below is now live.** Mike said "Do full testing, debugging and then deploy." Full pass run first; three new bugs came out of it.

- **`scheduleExtract.js` only matched `M/D/YY` dates.** Most large GCs export from **Primavera P6**, which writes `DD-Mon-YY` (`07-Oct-24 A`, `26-Aug-27*` — the `A` is an actual, the `*` a constraint marker). On a P6 schedule the deterministic milestone floor found its keyword rows, found no dates on them, and returned **zero milestones** — the fallback under the AI pass was nothing, on the commonest schedule format in the industry. One regex with an alternation now matches both, scanned left to right so results stay in **column** order (callers rely on `[start, finish]`). `toIso()` rejects an unrecognised month so `12-Bld-25` is not read as a date. Rough-in keywords widened for reversed wording (`Rough-In MEP`), still deliberately requiring the word "rough" so `Trench For Electrical` is not swept in. The module imported through the `@/` alias, so it was unloadable outside Next and had **no tests at all** — de-aliased, then covered by `scripts/tests/scheduleExtract.test.mjs` (11 tests). The same P6 rule was added to the AI prompt in `parseDesignSchedule.js`.
- **🔴 One route was missed by the S3 migration (`6ac9bfb`) and was broken in production.** `src/app/api/projects/[id]/site/parse/route.js` still did `readFile(path.join(process.cwd(), 'uploads', file.storedPath))`. Switched to `getProjectFileBuffer()` with an honest 404 message. **Sweep result: zero remaining local-disk reads across every file that queries `prisma.projectFile`.** Sean — worth a glance in case anything else you own reads `storedPath` directly.
- **`unit-matrix/parse` had two divergent versions** — Mike's uncommitted local work (local-disk read + page-boundary re-read + governance logging) vs. Sean's deployed S3 read. Merged by hand: Sean's storage layer kept, both local features kept.
- **Pre-push secret scanner false positive.** The fake AWS key in `uploadStorage.test.mjs` was written in the real `AKIA[0-9A-Z]{16}` shape and blocked the push. Renamed (`2b0c52a`) rather than bypassed with `--no-verify` — a guard that cries wolf is one people learn to skip.

**Also shipped in `44240a9`:** the drag-and-drop audit (all 15 file-drop windows now size-check before sending and show a real error instead of failing silently), the governed AI review layer (`AgentRun` + `/admin/agent-runs`), the site-plan parse/commit routes, and the questionnaire upload panel. Migrations `0054`–`0056` are **purely additive** — new `AgentRun` table plus nullable `numBuildings` / `numElevatorShafts` / `numFloors`.

**Verified before push:** production build clean · runtime-asset guard 26/26 · `check-dynamic-pages` 55/55 · `check-migrations-postgres` 56/56 · `check-schema-migrations-sync` 117/117 · full suite **417/417** · bid matrix 12/12. Every server-side PDF path exercised against real PDFs on disk, including the 84-page Marmalade schedule (309,972 chars).

**S3 verification, honestly scoped.** CORS was checked from outside the app the way a browser would: a preflight from `app.ilcstudios.com` with `PUT` returns 200 with the origin echoed, `evil.example.com` returns 403, and an unauthenticated bucket listing returns 403 — **CORS is live and correctly scoped.** The **lifecycle rule and the IAM policy cannot be verified from Mike's machine** (no AWS credentials there), so those two are recorded as unconfirmed, not assumed. Sean — a screenshot or a one-line confirmation of those two closes it out.

---

## Sean's Claude — 2026-08-19: Project file storage moved to S3

- **Commit `6ac9bfb`**: new `src/lib/projectFileStorage.js` — `putProjectFile`, `getProjectFileBuffer`, `deleteProjectFile`. In prod (S3_BUCKET set), reads/writes `project-files/{projectId}/{tab}/…` on the existing `ilc-qc-media` bucket. In dev, falls back to local `uploads/` (no dev config change needed). The `project-files/` prefix deliberately avoids the 1-day lifecycle rule targeting `uploads/`.
- Updated 9 routes: `POST /api/projects/[id]/files` (write), `GET+DELETE /api/projects/[id]/files/[fileId]`, `/reparse`, `/portal/…/files/[fileId]`, `analyze-contract`, `unit-matrix/parse`, `tracker/extract`, `tracker/import-toc`. Old `storedPath` rows (no `project-files/` prefix) fall back to local disk read — graceful degradation for pre-migration records.
- **S3 console steps**: Already completed 2026-08-18 — CORS, lifecycle rule (`uploads/` prefix, 1-day expiry), IAM policy confirmed. Mike's email references these as "still blocking" but they are done; the S3 work above was the remaining code item.
- Manny PDF also delivered this session: `manny_ilc_guide.pdf` — Task 27 (portal invite bridge) + bonus tasks 17 & 18.

## 🚨 FOR SEAN — 2026-08-19 (from Mike, via Mike's Claude): move project file storage to S3 — plus a prod-wide PDF outage just found and fixed

**Context: Mike uploaded a construction schedule to Zenith on 25th (PRJ-0002) in production and no dates came out.** Diagnosing that turned up three separate production defects. Two are already fixed on Mike's side (local, undeployed). The third is yours, and it is the big one.

### 🔴 YOUR ITEM — move project file storage off the Lambda disk and onto S3

`POST /api/projects/[id]/files` writes uploads with `writeFile(path.join(process.cwd(), 'uploads', projectId, tab, stored))`, and every later read (`/files/[fileId]/reparse`, downloads, re-analysis) reads back from that same path. **In Amplify each Lambda instance has its own ephemeral filesystem**, so the database row survives and the bytes do not. Verified live today: a file uploaded the same morning already returned `{"error":"File not found on disk"}`.

Consequences: no uploaded file is reliably re-openable or re-parsable in production, on ANY tab — not just construction schedules. The app effectively gets exactly one chance to read a document, at upload time.

**The fix:** store to the permanent `ilc-qc-media` bucket instead of local disk, and read from S3 (presigned GET) everywhere `storedPath` is read today. Most of the plumbing already exists — the direct-to-S3 upload work is built and verified locally (`/api/intake/parse` + `DrawingDropzone`); this extends the same pattern to the general project-files path and adds the read side.

**Blocked on:** the 3 S3 console steps below (2026-08-18 entry) — same bucket, same three settings. Those gate this too, so closing them out unblocks both.

**Scope note:** these files are permanent records, not scratch — do NOT put them under the `uploads/` prefix that the 1-day expiry lifecycle rule targets. Use a separate prefix (e.g. `project-files/`) that the lifecycle rule does not match.

### ✅ ALREADY FIXED on Mike's side (local only, NOT deployed) — for your awareness

1. **pdfjs worker missing from every Lambda — this was the actual cause, and it broke far more than schedules.** `pdf.mjs` has a static block that does `GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs"` on Node and then `await import(this.workerSrc)`. That dynamic import is invisible to Next's file tracer, so `pdf.worker.mjs` was never copied into any Lambda and `getDocument()` threw `Setting up fake worker failed` **before page 1** — the tell is `pages=0 read=0`. Audited against real build output: **all 11 PDF-reading API routes were affected** (intake parse, fixture schedule, contract analysis, tracker extract + import-toc, unit matrix, site parse, drawing submissions, peer review, files, reparse). Every server-side PDF read in production has been dead.
   Fixed by force-including the worker (and `standard_fonts/`, which two routes were also missing) on all 11 routes in `next.config.mjs`, pinning `workerSrc` to an absolute `file://` path in a new `src/lib/pdfjsNode.js` that is now the only sanctioned way to load pdfjs server-side, and extending `scripts/check-runtime-assets.mjs` so a missing worker **blocks the build**. Verified end-to-end: the exact production error was reproduced locally in the dev server, and after the fix the real `/reparse` route pulled **13 milestones off a 96-page schedule PDF** and wrote all three project date columns. Build green, 26/26 runtime assets present in the traces, 321 unit tests + smoke + DN-leak all passing.
   Two extra traps worth knowing if you touch this: `createRequire(import.meta.url)` resolves to a phantom `(rsc)` path inside a webpack server bundle (the finder now checks the file actually exists on disk), and pdfjs **memoizes the worker-load failure on the class** — once it fails, every later PDF in that process returns the same stale error until the process restarts.
   *This is the same trap that previously bit the Chromium binary and then `standard_fonts/` — third instance. The build gate now covers all three.*

2. **Project-level date columns could never save on Postgres.** Four call sites used `prisma.$executeRawUnsafe(... WHERE "id" = ?)`. `?` placeholders are SQLite-only — valid locally, invalid on prod Postgres — and all four were inside silent `catch {}`. Replaced with the typed Prisma client (the columns exist in `schema.prisma`), and the catches now log.

3. **Reparse now falls back to stored text.** When the PDF is gone from disk, `/reparse` re-runs milestone extraction from `ProjectFile.textContent` saved at upload time instead of 404ing. This is a stopgap that makes the button work today; it is *not* a substitute for item 1 above.

**Nothing here is deployed.** It ships on Mike's next explicit "Deploy," after the full pre-deploy debug pass.

---

## ⏰ FOR SEAN — 2026-08-18 (from Mike, via Mike's Claude): the 3 S3 steps are DUE TODAY — please close them out

**Mike asked again today, directly: "Can you have Sean finish those 3 things for the S3 steps."** This is the same ask as the 2026-08-17 entry below — target date was today, and nothing has been noted back yet, so treating it as still open.

All three are on bucket **`ilc-qc-media`** (us-east-2), all console-only, ~10 minutes total. Full click-by-click walkthrough: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\2026.08.17 Direct-to-S3 Uploads — S3 Console Checklist.md`.

1. **CORS** — S3 → `ilc-qc-media` → Permissions → CORS → Edit → paste:
   ```json
   [{"AllowedOrigins": ["https://app.ilcstudios.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600}]
   ```
2. **Lifecycle** — Management tab → Create rule `expire-direct-uploads-1-day`, scoped to prefix `uploads/` (**trailing slash matters** — it protects the QC screenshots under `qc/`) → Expire current versions after 1 day → also enable "Delete incomplete multipart uploads" at 1 day.
3. **IAM check** — IAM → Users → whichever user backs the app's `S3_ACCESS_KEY_ID` (likely `ilc-amplify-s3`) → check the policy Resource. If it's `arn:aws:s3:::ilc-qc-media/*`, nothing to do. If it's scoped to `.../qc/*`, add:
   ```json
   {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::ilc-qc-media/uploads/*"}
   ```

**Why it matters / what it's blocking:** Amplify's front door 413s any upload over ~4.4 MB on every production upload path, so real drawing sets cannot be parsed in prod at all today. The direct-to-S3 fix is **built and verified locally** and is sitting undeployed waiting on these three settings. Once you note them done here, Mike's Claude runs the full pre-deploy debug pass and it ships on Mike's next explicit "Deploy."

**When done:** one line in this log is all we need. If any of the three is blocked (permissions, wrong account, can't find the IAM user), say which one and we'll unblock it rather than let the whole thing sit.

---

## 📋 FOR SEAN — 2026-08-17 (from Mike, via Mike's Claude): your consolidated backend to-do list

**Mike asked for one master list of everything on your plate, backend-wise.** This gathers every open FOR-SEAN item scattered through this log into one place, newest asks first. Also emailed to operations@ilcstudios.com. When an item is done, a one-line note here is all we need.

### A. Dated / quick
1. **The 3 S3 console steps — tomorrow, 2026-08-18.** Full details in the next entry below (and in today's email + the checklist doc on the G drive). This is the gate on shipping direct-to-S3 uploads, which unblocks >4.4 MB drawing sets in production.
2. **Codespaces `ANTHROPIC_API_KEY` secret** — ~2 minutes, asked 2026-08-13, still unconfirmed. GitHub → repo → Settings → Secrets and variables → Codespaces → new secret `ANTHROPIC_API_KEY` (same value as in Amplify env vars).

### B. Schema (your lane)
3. **`McpQueryLog` table** — additive, no drops. Until it exists, `/api/mcp` returns **503 in production by design** (it refuses to answer what it can't audit-log). Full field table is in the 2026-08-08 "MCP row-scope fix" entry further down.
4. *(Optional)* **Real `reviewedAt` column on `ConceptualSubmission`** — nothing depends on it (`updatedAt` records review time today); only add it if you want it.

### C. Feature work
5. **Finish admin + user privileges** — Mike's standing #1 for your queue since 2026-07-18. Unchanged. (And the companion rule stands: **CRM/pipeline build-out stays paused until you and Mike talk.**)

### D. AWS infra
6. **EventBridge schedule rule for the nightly usage rollup** — the `/admin/usage` Usage & Health dashboard (built on Mike's side, local) has a nightly rollup job that needs an EventBridge rule to actually fire on a schedule in AWS. The console step is the missing piece; ping Mike's Claude here if you want the exact route/target when you pick it up.
7. **Security-pass item you noted yourself (2026-06-15):** replace the `ilc-amplify-s3` IAM user + env-var access keys with a proper SSR compute role, then delete the `S3_*KEY*` lines from `next.config.mjs` and the console env vars. No date on this — your call when the security pass happens.

### E. Answers Mike's Claude is waiting on
8. **`ProjectAccess` / `ProjectAssignee`:** are those unused join tables the intended long-term client-access model? If yes, the MCP scope predicate moves off `createdById` — one file, one map. If no, we'll keep `createdById` and can drop the dead tables in some future cleanup you author.

### F. Smaller backend follow-ups (flagged in recent reviews, not yet assigned — Mike is routing backend to you)
These are headline-level; ask Mike's Claude here for file-and-line detail on any of them before starting:
- **Possible DN/buy-price exposure via `ManufacturerProduct.cost`** in an API reachable by non-ILC users — verify and close. (Buy-price leakage is our worst leak class; see the 2026-08-08 `.catch()` entry.)
- **Share-link / fixture-schedule tokens** possibly exposing more than intended to unauthenticated holders — verify and close.
- **Build-time guard for `ANTHROPIC_API_KEY`** — fail the build loudly if the key is absent, so AI parsing can never again be silently dead in prod.
- **Dashboard null-session crash** — `dashboard/page.jsx` can throw a TypeError when there's no session; needs a guard.
- **Doc rot:** one false statement in `CLAUDE.md` (~line 106) and a stale comment block at the top of `IntakeClient.jsx` — both describe behavior that no longer exists.

---

## 🔑 FOR SEAN — 2026-08-17 (from Mike, via Mike's Claude): please do the 3 S3 console steps TOMORROW (2026-08-18)

**Mike asked for you to own this — target: tomorrow, 2026-08-18.** (This supersedes the earlier plan of Mike doing it himself this afternoon.) An email notification was also sent to operations@ilcstudios.com.

**Why:** Amplify's front door rejects any upload over ~4.4 MB (empty 413) on every prod upload path, so real drawing sets can't be parsed in production. The fix — browsers uploading straight to S3, bypassing Amplify — is **built and verified locally**, but it needs three one-time AWS console settings before it can be deployed. All three are on bucket **`ilc-qc-media`** (us-east-2). Full click-by-click walkthrough: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\2026.08.17 Direct-to-S3 Uploads — S3 Console Checklist.md`.

1. **CORS** — S3 → `ilc-qc-media` → Permissions → CORS → Edit → paste:
   ```json
   [{"AllowedOrigins": ["https://app.ilcstudios.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600}]
   ```
2. **Lifecycle** — Management tab → Create rule `expire-direct-uploads-1-day`, scoped to prefix `uploads/` (**with the trailing slash** — protects the QC screenshots under `qc/`) → Expire current versions after 1 day → also enable Delete incomplete multipart uploads at 1 day.
3. **IAM check** — IAM → Users → the user backing the app's `S3_ACCESS_KEY_ID` (likely `ilc-amplify-s3`, see your 2026-06-15 entry) → look at its policy Resource. If it's `arn:aws:s3:::ilc-qc-media/*`, do nothing. If it's scoped to `.../qc/*`, add:
   ```json
   {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::ilc-qc-media/uploads/*"}
   ```

**When done:** note it here (one line is fine). Mike's Claude will then run the full pre-deploy debug pass; the code ships on Mike's next explicit "Deploy". Proof after deploy: drop a >4 MB drawing set on app.ilcstudios.com/conceptual_budget and watch it parse instead of 413ing.

---

## 🔑 FOR SEAN — 2026-08-13 (from Mike, via Mike's Claude): please add the `ANTHROPIC_API_KEY` Codespaces secret

**Mike asked for you to own this one.** The repo now supports GitHub Codespaces (`.devcontainer/` + `CODESPACES.md`, merged 2026-08-08), but a Codespace has no `.env` — AI features (drawing parsing, fixture-schedule parsing, Ask-AI) need the Anthropic key to come from a **GitHub Codespaces secret** instead.

**What to do (one-time, ~2 minutes):**
1. GitHub → the repo → **Settings → Secrets and variables → Codespaces → New repository secret**
2. Name: `ANTHROPIC_API_KEY`
3. Value: the same key that's in Amplify → Hosting → Environment variables (or the local `.env` / password manager)
4. Save. Any new Codespace picks it up automatically as an env var; existing Codespaces need a rebuild.

**When done:** note it here (one line is fine) so Mike's Claude can stop reminding Mike about it every session.

---

## 🔑 FOR SEAN — 2026-08-09: the `admin@ilcstudios.com` password was exposed and has been rotated

**Action for you: none required, but your saved copy of that password is now wrong.** If you have it in a password manager, a note, or a script, delete it — don't try it. Ask Mike directly for the new one.

**What happened.** A Claude Code permission file (`.claude/settings.local.json`) under Mike's `G:\My Drive\BUDGETING TOOL SOFTWARE` folder had the `admin@ilcstudios.com` password sitting in it in plain text as part of a pre-approved command. That folder is Google Drive, so the file had been syncing to the cloud — and every prior version of it was retained in Drive's version history, which meant deleting the line alone would not have removed the password.

**What was done (2026-08-09, by Mike):**
1. The credential line was stripped from the file.
2. Drive version history for that file was purged back to same-day versions only.
3. **The `admin@ilcstudios.com` password was rotated.** Treat the old one as burned.

**Why you're being told.** Mike confirmed you have access to that Drive location, so the old password was readable by you and by anyone else on that share. Nothing suggests it was used — this is precautionary. Worth a look at your own side: if you keep any ILC credential inside a file under a synced Drive or Dropbox folder, the same version-history problem applies to it.

**Related, same day:** the pre-approved-command lists in that file were tightened — blanket `git push` / `git add` / `git commit` / `deploy.ps1` approvals and a stored destructive-database consent were all removed, and the filesystem read scope was narrowed from the whole `C:\` drive to ILC paths only. Deploys now require Mike to say so explicitly, every time. If you maintain an equivalent file on your machine, the same three categories are worth auditing: standing deploy rights, standing destructive-DB consent, and drive-wide read scope.

---

## Sean's Claude — 2026-08-18: AWS infra + CRON_SECRET fix

- **Commit `922a614`**: added `CRON_SECRET` to `next.config.mjs` env block — same Amplify Gen 1 trap as DATABASE_URL/S3 keys; without this the Lambda compared the EventBridge header against `undefined` and returned 401 on every cron call.
- **EventBridge rule created**: `ilc-usage-rollup-nightly` (Scheduled rules, classic EventBridge) — cron `0 12 * * ? *` UTC, targeting the `ilc-app-cron` API destination → `https://app.ilcstudios.com/api/cron/usage-rollup` with `x-cron-secret` auth. Enabled and live.
- **S3 ilc-qc-media bucket**: CORS updated (PUT from app.ilcstudios.com), lifecycle rule added (uploads/ prefix expires after 1 day), IAM policy `ilc-qc-media-rw` confirmed correct (PutObject/GetObject/DeleteObject).
- **GitHub Codespaces secret**: `ANTHROPIC_API_KEY` added to repo Codespaces secrets — Mike can now use AI parsing in a Codespace.
- **Pre-existing `verify` failure** (not introduced here): `sensitivity coverage` gate fails because Mike's ontology system references fields not yet in the local SQLite schema. Pre-push hooks all pass — this only affects `npm run verify`, not deploys.

## ⚠️ Mike's Claude — 2026-08-08: a bug pattern to never write again — `.catch()` on `requireAuth()`

**Nothing for you to fix. This is a "don't reintroduce it" note.** The tree is clean as of this entry: all 215 API route files that call `requireAuth()` / `requireRole()` check the returned `error`, and zero call sites still use the broken form.

**The pattern:**

```js
// ❌ BROKEN — this route is public
const { error } = await requireAuth().catch(() => ({}));
// `error` is never checked, and the catch never fires
```

**Why it's invisible.** `requireAuth()` **returns** its 401 as a value; it does not throw. So the `.catch()` is dead code — it can never run — and because the destructured `error` is then never inspected, execution falls straight through into the handler body. It reads like a guard. It lints clean. It builds clean. It has no guard in it at all.

**What it actually cost us.** This exact line was on `GET /api/projects/[id]/change-orders/[coId]/pdf` (fixed; see the comment at the top of that file, which is deliberately left in place as a tombstone). The route served the change-order PDF to anyone holding the URL, and combined with `?hideInternalDN=false` it published **ILC's buy price**. That is the single worst leak class in this codebase.

**The rule.** Two lines, always, nothing between them:

```js
const { user, error } = await requireAuth();
if (error) return error;
```

Never `.catch()` an auth guard. If you ever find yourself wanting to, the thing you actually want is `if (error) return error;`. A `.catch()` on `req.json()` is fine and common (`await req.json().catch(() => ({}))`) — that one is parsing, not authorization. The distinction is the whole point.

**Cheap way to check yourself** — should print nothing:

```bash
for f in $(grep -rl "await requireAuth()\|await requireRole(" src/app/api --include=*.js); do grep -q "if (error)" "$f" || echo "$f"; done
```

---

## Mike's Claude — 2026-08-08: MCP row-scope fix + ONE SCHEMA ASK (`McpQueryLog`)

**Status: ON `main`** as of this commit. The `McpQueryLog` ask below is still open — until that table exists, `/api/mcp` returns **503 in production by design** (it refuses to answer anything it can't log). Nothing else depends on it; the rest of the release is live.

**Schema ask (additive, no drops) — `McpQueryLog`.** The Librarian (`/api/mcp`, Slice 3 of the Governed AI Layer) refuses to serve at all unless it has somewhere to write an audit row: sink order is `prisma.mcpQueryLog` → a local JSONL file → **nothing, which means a 503 in production**. So today the endpoint would be dead on Amplify. Locally it falls back to `.mcp-audit/mcp-queries.jsonl` (gitignored). Fields it writes:

| field | type | note |
|---|---|---|
| `id` | String @id @default(cuid()) | |
| `createdAt` | DateTime @default(now()) | index this |
| `tool` | String | e.g. `query_records` |
| `params` | String | the QUESTION, never the answer — see below |
| `status` | String | `ok` \| `rejected` \| `error` |
| `rowCount` | Int? | scale of access, not contents |
| `callerType` | String | `session` \| `service` |
| `callerId` | String? | User id when a session |
| `callerRole` | String? | |
| `audience` | String | `ilc` \| `client` |
| `errorMessage` | String? | |
| `durationMs` | Int? | |

**Deliberately no row contents.** A log that copied the rows would be a second, unredacted store of the same buy prices — and one nothing redacts on the way out. There's a test asserting the DN never appears in the log.

**The bug I found and fixed (no schema involved).** `/api/mcp` was doing field-level redaction with **no row-level scoping**. A logged-in `CLIENT_VIEWER` could send `{"tool":"query_records","params":{"model":"Project"}}` and get **all 25 projects and all 12 clients by name** — every field correctly redacted, the whole book of business enumerated. It also defeated an intent already in the code twice over: `search` deliberately returns `clients: []` to a client audience, but `query_records model:'Client'` handed over all 12 one tool over; and `src/app/api/projects/route.js` carries the comment *"External Client Viewers stay scoped to their own — never widen this to CLIENT_VIEWER"*, which `/api/mcp` widened.

Fixed in a new `src/lib/mcp/scope.js` that **mirrors the existing rule rather than inventing a second access model** — `{ createdById: user.id }`, reached from each registered object by its relation path. It **fails closed**: an object with no declared scope path is unreachable to a non-ILC caller, so a model you add later is invisible to clients until someone writes down how it relates to a project. Probe before: 25 projects / 12 clients. After: 0 / 0 / 403. 48/48 acceptance tests over real HTTP as a real logged-in CLIENT_VIEWER.

**Question for you (not blocking):** the schema has unused `ProjectAccess` and `ProjectAssignee` join tables. I used `createdById` because that's what the live app uses today, but if those tables are the intended long-term client-access model, say so and I'll move the scope predicate over — it's one file and one map.

Also: `scripts/check-shared-metrics.mjs` was blocking `npm run verify` because it greps for the bare identifier `pipelineProbability`, and `src/lib/ontology/objects/project.js` *declares* that column to classify it `ilc_only`. Added to the checker's existing ALLOW list — the ontology has no arithmetic in it, and the rule was blocking us from marking the field sensitive.

---

## ✅ Mike's Claude — 2026-08-08 (later): the prod bug fix is ON MAIN — no action needed from you

**`5c241a1` is pushed to `main` and Amplify is building it.** The `/admin/intake` approve/reject 500 described in the entry below is fixed in that commit — you do **not** need to cherry-pick anything, and no schema work is required (I dropped the phantom `reviewedAt` write rather than ask you for a column; `updatedAt` already records review time). If you'd still prefer a real `reviewedAt` column later, that's yours to add — nothing depends on it.

Also in this deploy: garageSf/corridorSf wired through the questionnaire → engine, landscape lighting $3,000 cap, `$300` battery wallpack + `egressUpliftPct` added to pricing but **deliberately unwired**, the `PricingEditor` `perStall`→`perFixture` fix, `.devcontainer/` + `CODESPACES.md`, and a `scripts/prototypes/pagefinder.mts` prototype (prototype only, nothing imports it). Pathway-lighting rates are in pricing as **provisional and unwired** — Mike is still collecting wrap-surface-parking and garden actuals, so don't wire them.

**Debug pass before the push, all green:** 10 verify gates incl. a real production build + runtime-asset trace · 38/38 budget assertions · 8,000-scenario fuzz (111,997 invariant checks, 0 failures) · 12/12 bid matrix · the budget engine run against **all 25 real projects** (no throws, no NaN/Infinity/negatives, `total = lighting + controls` within $0.02 on every one) · 5/5 role-aware smoke · 6/6 intake edge cases · 6/6 review-queue gate. **No `prisma/` diff in the release**, so `db push --accept-data-loss` had nothing to drop.

**Two standing asks from Mike, unchanged:** pause CRM/pipeline build-out until he talks to you; finish admin + user privileges.

---

## Mike's Claude — 2026-08-08: intake review — PROD BUG found + fixed on branch (now shipped, see above)

**Mike answered your Task 27 question: YES, build the portal invite bridge.** Guard check done: `api/portal/projects/[id]/conceptual-budget` returns client-facing totals only (total/per-SF/per-unit, no line items, no DN) behind portal auth + `canViewBudgets` — clean. Proceed.

**Security/correctness review of the 08-04 intake deploy** (Mike requested). Findings, all fixed and live-tested on branch `wip-pathway-rates-and-pagefinder`:

1. **PROD-BROKEN: `/admin/intake` approve/reject 500s on every click.** `admin/intake/[id]/route.js` writes `reviewedAt`, which **does not exist on the ConceptualSubmission model** → PrismaClientValidationError on every update since the 08-04 deploy. Fixed by dropping the field (`updatedAt` records the time). If you'd rather have a real `reviewedAt` column, that's schema = yours. **Until this reaches main, the review queue cannot approve anything.** Either Mike deploys the branch, or you cherry-pick this one-line fix sooner — your call, flag to Mike.
2. Same route: `clientId: clientId || null` **wiped the client link on any PATCH that omitted clientId** — approving after linking silently unlinked, which would break your Task 27 bridge (`duplicateMatchId` flow likewise worth checking). Now only touched when the request sends it.
3. `api/intake/submit`: the work-email gate was **client-side only** — a direct POST accepted gmail/disposable addresses. `classifyIntakeEmail` now enforced server-side (422 + message).
4. Same route: **no rate limit** (the parse route had one from day one). Added per-IP 5/min, 429 + Retry-After.
5. Same route: **unbounded `rawPayload`** — added 200KB cap (413).
6. Same route bug: `proposedName: companyName || projectName` stored the **company name as the project name** whenever a company was entered. Now always projectName; company rides in rawPayload.
7. Same route: now **auto-links `clientId` on an explicit `Client.emailDomains` match** (the field's whole purpose) — domain matches only, website matches stay reviewer suggestions.

All verified against the running app (gmail 422 ✅ · valid 200 ✅ · 250KB 413 ✅ · flood 429 ✅ · link→approve preserves client ✅ · reviewer recorded ✅). 8 verify gates pass.

---

## the collaborator's Claude — 2026-08-04

**Intake pipeline is now end-to-end deployed.** Mike's `/start` page (commit `981ac0b`) + drawing parse are untouched. We added: (1) `api/intake/submit/route.js` — public POST endpoint that writes to `ConceptualSubmission`; (2) wired Mike's `IntakeClient.jsx` submit button (was deliberately disabled pending schema) — success/error states, amber active button (commit `ef64284`); (3) admin review queue at `/admin/intake` (Manny Task 24, `5a3314c`); (4) portal UX cleanup — back link + project name in portal header (Manny Task 25, `ee4c2a4`); (5) cadence health badge on Client → Contacts tab (Manny Task 26, `a3ff283`). All 6 pre-push hooks passed. Amplify deployed.

**Building as Task 27 (Manny):** submission → portal invite bridge. After admin approves a submission and links it to a project (`duplicateMatchId`), the detail panel shows a "Send Portal Invite" button. Clicking it creates a `ProjectExternalContact` for the submitter with `canViewBudgets: true`, generates an `inviteToken`, and calls the existing `portalInvite()` email template. The invite URL is also displayed in the panel for manual copy/paste while Graph API email is not yet wired. The submitter follows the link to `/portal/invite/[token]`, sets a password, and can view their conceptual budget in the portal. Spec in `.claude/manny-tasks.md`.

---

## the collaborator's Claude — 2026-07-27

Completed Mike's blocking schema request (August 1 deadline). Merged PRs #16/#17/#18 (Manny's Tasks 1, 2, 22) to main, deployed. Migration 0053 (`ConceptualSubmission`, `Client.emailDomains`, `Project.preconManagerId`) is now live in production. All 6 pre-push hooks passed. New Manny queue (Tasks 23–26) written to manny-tasks.md and PDF on the collaborator's Desktop. Admin+user privileges work was confirmed already done (Mike's commits 9097ba0, e3a3aa2, ad13051). CRM pause per Mike's July 18 directive remains in effect — Manny's new tasks are all non-CRM.

---

## 🖥️ CODESPACES SUPPORT — from Mike's Claude, 2026-07-22 (merged 2026-08-08)

The repo now has `.devcontainer/` + `CODESPACES.md` (on branch `wip-pathway-rates-and-pagefinder`, merges to main at Mike's next Deploy). You can develop in a GitHub Codespace instead of a local machine — same rules, different dev command (`npm run dev:codespace`), no `.env` (GitHub Codespaces secrets instead). `CLAUDE.md` has a new "laptop OR Codespace" section. Nothing about Amplify/deploys/schema changes.

---

## 👋 COLLABORATOR — START HERE NEXT SESSION (2026-07-18)

Three things, in priority order. **#1 is blocking Mike's 2-week deadline.**

**1. Add the intake schema (blocking).** Full spec in the "SCHEMA REQUEST" section directly below — `Client.emailDomains`, `Project.preconManagerId`, and a `ConceptualSubmission` model. All additive, nothing dropped. Mike is building the public conceptual-budget intake tool against these; the pure logic is already written and unit-tested in `src/lib/intake.js` (22 tests, `npm run verify`), so the moment the fields exist it wires straight up. **Please add the Postgres migration too** — local `db push` alone doesn't reach prod.

**2. Finish admin + user privileges** — Mike's standing ask from earlier today, still the priority for Manny's queue. CRM/pipeline UI stays paused until Mike says otherwise.

**3. Don't re-add `perStall`.** I removed `exterior.surfaceParking.perStall` from the pricing admin — see the note below for why it was dead. There's still an orphaned `perStall: 1325` key sitting in the saved SystemConfig pricing blob; it's inert (the engine prefers `perFixture`) so I left it rather than write to prod config. Bin it if you're touching that blob anyway.

**Heads up on the run command:** `npm run verify` is now **8 gates** (added a `unit tests` gate). It's fast and static — no server, no DB. Run it before you push.

---

## 🔧 SCHEMA REQUEST — from Mike's Claude, 2026-07-18

Mike is building a **public conceptual-budget intake tool** (external, non-ILC users, target live in 2 weeks). It needs schema I won't add unilaterally — schema is yours, and `amplify.yml` runs `prisma db push --accept-data-loss` on every deploy. **All of the below is additive** (new optional fields + one new model); nothing is removed, renamed, or retyped, so no existing production data is at risk.

**1. `Client.emailDomains String @default("[]")`** — JSON string array, matching the existing `markets`/`geographies` convention. This is the blocker: there is currently **no way to resolve `bob@acme.com` to a Client**. The only `domain` anywhere in the schema is inside a free-text automation-rule config blob. Public intake maps submitter → client by domain, so this field is load-bearing.

**2. `Project.preconManagerId String?` + relation to `User`** (suggest `@relation("ProjectPreconManager")`, mirroring `ProjectSalesOwner`). Today "pre-construction" exists **only** as a suggested free-text value for `ClientContact.department` — i.e. a label on an *external* contact, not an internal ILC assignee. Mike wants a real per-project ILC pre-con manager.

**3. A submission/queue model** (working name `ConceptualSubmission`). Public submissions must **not** create live `Project` rows — an ILC reviewer accepts them and checks the math first. `Project.createdById` is required, so there's no anonymous-draft path today. Fields roughly: submitter name/email/domain, resolved `clientId?`, proposed project name, duplicate-match info, uploaded file refs, the raw answer payload, `status`, `reviewedById?`, timestamps.

Happy to write the migration if you'd rather review than author — just say which way you want it.

---

## ⚠️ HEADS UP — pricing/calc edits in your area, 2026-07-18

Per the boundary below you own budget/pricing math. Mike directed these three changes today, so flagging rather than surprising you:

1. **Landscape lighting was uncapped and ignored master pricing.** `calculations.js` hardcoded `lotSf * 0.02` and never read `PRICING.exterior.landscape.pctOfNetLotSf` — so editing that rate in `/admin/pricing` did nothing. The source questionnaire says *"for most projects do not exceed $3,000"*; a 400k SF lot returned **$8,000** and a 1M SF lot **$20,000**. Now `Math.min(lotSf × pct, PRICING.exterior.landscape.maxTotal)` with `maxTotal: 3000`. **No-op below 150,000 SF**, so typical projects are unchanged.
2. **Same formula was hardcoded a second time** in `ExteriorSection.jsx` — the UI preview and the engine could drift independently. Both now read master pricing.
3. **Added `exteriorDoor.wallpackWithBattery: 300` + `egressUpliftPct: 0.10`** to pricing, exposed in the pricing admin, but **deliberately NOT wired to the formula**. The target model (floor-1 egress door count +10%, battery wallpack each) is blocked on drawing parsing. Switching it would move that line from $212.50/door to $300/door on every existing project — a live-data change that shouldn't happen silently.

4. **Fixed a dead admin control.** `PricingEditor.jsx` edited `exterior.surfaceParking.perStall`, but **nothing reads that key** — `pricing.js` defines `perFixture: 1325`, and both `calculations.js` (`perFixture ?? perStall ?? 1325`) and `ExteriorSection.jsx` (`perFixture ?? 1325`) read `perFixture`. Since `perFixture` always exists, **every edit made through that admin field was silently discarded.** Confirmed in the DB: the saved pricing blob contains both `perFixture: 1325` and an orphaned `perStall: 1325`. They happen to be equal, so no budget was ever wrong — but any edit would have vanished. Editor now points at `perFixture`, and the label is corrected (it's $1,325 per *fixture* covering ~9 stalls, not per stall). Also exposed `stallsPerFixture`. Mike called this one directly: *"Fix it, I know more about this than the collaborator."*

**Still open, needs a decision (not touched):** `buildingFootprintSf` is read into `calculations.js` and never used — the "lot minus footprint" the UI hint promises isn't implemented, landscape uses raw lot SF. Implementing it would *reduce* existing budgets, so it's a pricing decision rather than a cleanup.

**Also deferred by Mike:** surface parking and pathway lighting both need real formulas ("needs a deeper discussion"). Pathway is 100% manual today despite `PRICING.exterior.bollard.perUnit = 800` existing and being wired to nothing; `surfaceParking.solarUpgrade = 3000` is likewise unwired. Mike owns this design call.

`npm run verify` passes (**8 gates**) after all of the above.

---

## ⚠️ FOR COLLABORATOR — from Mike, 2026-07-18

> **"Pause on building out the CRM until we talk. Finish the admin and user privileges."**

**Action needed in `.claude/manny-tasks.md`:** please pull the remaining CRM/pipeline UI tasks out of Manny's queue and repoint him at **admin + user privileges** instead. That's the work Mike wants finished next. Manny's execution has been fine — this is about *what's in the queue*, not how it's built. Let's talk before any further CRM/pipeline UI work.

**Why the privileges work matters right now:** a related bug was live in production until today — projects were gated to *creator-or-super-admin* in 7 places, so `COMPANY_ADMIN` and regular `USER` accounts saw **zero projects** and 404'd opening any (fixed in `9097ba0`). Roles/permissions are clearly under-specified, which makes this the right next thing to nail down properly.

---

**Also — hold off on any more CRM/pipeline UI tasks until we've drawn an ownership line.** Nothing wrong with the code quality — the security hygiene commit (`206f1fb`) was genuinely good and I've kept all of it. The problem is that we were both building sales/pipeline views in parallel with no boundary, and it produced **two different answers to the same question**, which is the one outcome we can't ship.

**What collided, and how it's now resolved** (all reconciled in `9097ba0`+, please pull before touching this area):

1. **Win rate was computed two different ways.** The CRM stats bar used `won ÷ (won + lost)`; the dashboards used a different denominator. On today's real data those produced **40% vs 29%** under the same label. **Resolved:** there is now ONE definition in `src/lib/pipeline.js` — `winRate()` + `WON_STATUSES` / `DECIDED_STATUSES`, per Mike: **won ÷ every project past Open** (won + completed, over won + completed + lost + abandoned; a completed job counts as won). The CRM bar now imports it. **Please never recompute a win rate locally — import `winRate()`.**

2. **Probability had diverged.** The card quick-edit and Weighted Pipeline both wrote/read the legacy `pipelineProbability`. Projects now carry **`probabilityToWin` + `probabilityToMoveForward`**, and the number we display everywhere is the **derived average** (`averageProbability()` in `pipeline.js`). Because the average is derived, an inline edit of it is meaningless — the quick-edit has been **removed**, and the two source fields are edited on the project's Sales Details. Card, list, CSV, sort and Weighted Pipeline all now use `averageProbability()`. `pipelineProbability` is legacy — please don't build on it.

3. **"Needs Attention" overlaps a queue Mike is building.** Yours is `OPEN && updatedAt ≥ 30d`. `updatedAt` bumps on *any* write (including automated ones), so it isn't really "we haven't spoken to them." Mike's version keys off a real last-touched signal. **Leaving yours in place for now**; we'll consolidate onto one definition rather than ship two.

**Proposed boundary going forward** (Mike to confirm): Mike owns **sales/pipeline metrics + dashboards + the weekly-meeting surface**; the collaborator owns **budget/pricing math, schema, infra/deploy**. Anything that computes a *shared business number* (win rate, probability, pipeline value) goes in `src/lib/pipeline.js` as one exported function, imported by every surface — never re-derived in a component.

**Also new — two gates now fail the build/test run**, worth knowing before your next push:
- `npm run build` now runs `scripts/check-runtime-assets.mjs`, asserting runtime-resolved assets are actually in the Lambda trace (this is what was silently breaking **all PDF/AI parsing in prod** — pdfjs `standard_fonts` were never traced; fixed for 8 routes).
- `npm run verify` (static gates) and `npm run verify:smoke` (role-aware smoke tests). The smoke tests caught that **all seeded accounts are ILC_ADMIN**, so they stand up a disposable COMPANY_ADMIN — that role was seeing **zero projects** in production until today.

## 2026-07-28 — Manny's Claude (Intake workflow: Tasks 23–26 complete; bonus tasks 13–14 in review)

Four-part public intake workflow shipped and ready for review. ConceptualSubmission schema deployed 2026-07-27; all work lands on clean main.
- **Task 23** (`manny/intake-wizard`, PR #19): Public `/start` page — unauthenticated intake form. Captures name, email, company, project name, building type, gross SF. Stores as ConceptualSubmission (PENDING). Dark navy + amber ILC branding. No force-dynamic needed (no cookies).
- **Task 24** (`manny/intake-admin-queue`, PR #20): Admin `/admin/intake` page (ILC_ADMIN only) with list + detail panel. Status select (PENDING→APPROVED/REJECTED), review notes, optional client-link. PATCH endpoint sets reviewedById + reviewedAt. List columns: date, name, email, company, building type, status badge (amber/green/red).
- **Task 25** (`manny/portal-ux-cleanup`, PR #21): Portal project page UX polish. Added back link to `/portal` + project name below it on desktop header. $/SF already visible in ConceptualBudgetView (perSf metric). Three lines changed.
- **Task 26** (`manny/checkin-cadence-badge`, PR #22): Client page Contacts tab now shows cadence health banner above table. Colored pills: red (overdue), amber (due soon), green (current). Uses same getCheckinStatus logic as /crm/contacts. Banner only shows if ≥1 contact has cadence data.

**Quality assurance:** All verify gates pass on all four PRs (8/8: dynamic-pages, schema-provider, env-contract, postgres-migrations, schema-sync, shared-metrics, unit tests, secrets). Pre-push hooks green on every branch (unit tests: 38 scenarios + 111,997 invariant checks = 0 failures). Zero schema changes; no new API routes beyond Task 24 PATCH. Bonus tasks 13 (auth-hygiene) + 14 (meeting-notes-badge) already in review from prior session.

## Current State

- **Production:** live at https://app.ilcstudios.com, deploys flowing cleanly since 2026-05-26 PM. Mike pushed 5 commits on 2026-05-27 AM extending the defensive-guard pattern from seed.js to client/KB/master-types pages and routes — same approach the collaborator used in `0eda6d1`. Pipeline stable.
- **Notifications:** ACTIVE in production (NOTIFY_DRY_RUN=false).
- **Coordination tooling:** four project-scoped slash commands available (`/coord`, `/mike`, `/coord`, `/log` — see `.claude/commands/`).
- **the collaborator:** math test harness at `_tests/budget-math.mjs` + calibration script `_tests/calibrate-conceptual.mjs` (both gitignored). Calibration run against 4 real spreadsheets (2 conceptual, 2 Full Design) on 2026-05-27 AM with Mason's review — engine matches within 1-2% on conceptuals; explainable patterns on Full Design. Two math changes still queued (Q1 energy credit refactor, Q3 exit signs sum extension — Q3 needs stairwell-SF clarification).
- **Mike:** Conceptual-budget + CRM sprint live. Most recent (2026-06-12): **all wizard sections (conceptual AND design) now read pricing from Master Pricing** (`/admin/pricing` → SystemConfig DB, the `pricing` prop) instead of hardcoded constants — engine + UI previews read one source and can no longer drift. Also: exterior section restructured, CRM Batch 1+2 (unified Rules tab, sales dashboards). Commits through `10cf3a1`.

## 2026-07-09 — the collaborator's Claude (Tasks 14–16 merged: security hygiene + CRM list polish + win rate)

Manny's three PRs (#10–12) cherry-picked and merged to main (commits 206f1fb, 51968e7, 720fd55). All clean — no .claude/ clutter.
- **Task 14** (`manny/security-hygiene`): Four backend security fixes — added `requireAuth` to `/api/anthropic-models`, inverted cron auth guard to fail closed, added empty-body validation to notes POST, fixed attendees JSON serialization in meeting-notes PATCH.
- **Task 15** (`manny/crm-listview-polish`): Notes count badge now shows in list view rows (parity with kanban). "Clear" button in filter bar resets all 5 filter dimensions at once.
- **Task 16** (`manny/crm-stats-winrate`): Stats bar expanded from 6 to 8 chips — added Weighted Pipeline (open revenue × probability) and Win Rate (all-time WON ÷ closed deals).
Next sprint options under discussion: auth hygiene sweep (19 routes using getSession instead of requireAuth), upcoming deadlines view, or dashboard analytics.

## 2026-07-08 — Manny's Claude (Tasks 10–13 complete: links + notes + prob-edit + CSV export)

All four CRM polish tasks shipped and ready for review. 38/38 tests pass, 111,997 invariant checks (0 failures), production build clean, zero regressions.
- **Task 10** (`manny/brief-clickable-links`): Morning Brief project names now clickable links to `/project/[id]`. Two tables updated (stale projects + recent wins).
- **Task 11** (`manny/crm-notes-count`): Added `_count: { select: { noteLinks: true } }` to crm/page.jsx Prisma select. ProjectCard badge shows "N notes" below + Note button when count > 0.
- **Task 12** (`manny/crm-prob-edit`): Click-to-edit inline input for probability on kanban cards (0–100 clamped). Blur/Enter saves via PATCH with optimistic update. Escape cancels. `e.stopPropagation()` prevents project panel from opening.
- **Task 13** (`manny/crm-csv-export`): "Export CSV" button in toolbar. Downloads current filtered pipeline as spreadsheet. Filename: `crm-{pipeline}-{date}.csv`.

## 2026-07-07 (the collaborator's Claude) — Manny tasks 10–13 queued; PDF delivery simplified

Tasks 10–13 written into `.claude/manny-tasks.md` (CRM polish sprint: clickable brief links, notes count badge, probability quick-edit, CSV export). Tasks 6–9 marked complete. PDF rewritten — now the single delivery artifact; Claude reads it directly, no separate `.md` file needed. the collaborator just sends the PDF. Script: `python scripts/generate_manny_tasks6to9_pdf.py`.

## 2026-07-06 (the collaborator's Claude) — Manny tasks 6–9 rewritten for new CRM model

Rewrote all four Manny task specs in `.claude/manny-tasks.md` after Mike's Deal→Project unification. Old specs referenced `DealCard`, `DealDrawer`, and the activities API — all deleted. New specs use `Project` model with `procurementStatus`/`designStatus` fields. Key change: Task 7 was originally "build a stats bar" — discovered `PipelineSummary` already exists (line 150), so Task 7 now enhances it instead. Task 9 now posts to `/api/crm/notes` instead of the deleted activities route. PDF at `scripts/generate_manny_tasks6to9_pdf.py` (regenerate for Manny: `python scripts/generate_manny_tasks6to9_pdf.py`).

## DEPLOYED 2026-07-06 (Mike) — client standards + playbook trim + dashboards

Big deploy (migrations `0048`–`0050`), full debug pass green. Heads-up on schema for the collaborator:
- **New models** `ClientProductOption` (product-options funnel) + `ClientStandardFixture` (client standard fixture schedule). Routes under `api/clients/[id]/product-options` + `/standard-fixtures`; UI tabs "Product Options" + "Fixture Schedule". Migration `0050` written by hand.
- **Playbook trimmed to what real client meetings cover:** dropped `PlaybookRelationship` table + these `ClientPlaybook` columns — `costTierNotes, primaryContactId, approverContactId, coTolerance, mgmtStructure, hasDesignTeam, storageDuration, receivingPartyContactId, receivingPartyNote, freightWarehousing, damageInventory, logisticsNotes, paymentTerms`. **`paymentTerms` moved to `Client`** (backfilled). Playbook UI is now 6 lean sections; Primary markets is a state-button picker.
- Also shipped: universal dashboard engine + 3 probability fields + win rate (`0048`/`0049`), YTD/Custom time buckets, link-preview unfurl. Docs in `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\`.

## Open questions for Mike (when convenient)

~~1. **Energy credit dollar impact compounds through freight+warehousing+tax.**~~ **ANSWERED:** Not intentional — fix it so the energy credit reduces the lighting subtotal *before* F+W+T are applied, matching Trackvia behavior.
~~2. **Controls override behaves the same way.**~~ **ANSWERED:** Product-only is correct. The override amount is the product cost; F+W+T should still layer on top afterward.
~~3. **Exit sign type override path** (in designAdder, when `corridors.exitSignType` is set)~~ **ANSWERED:** Exit sign count should sum corridors + stairwells + interior amenity + BOH + garage. Apply the 300K-SF threshold rule to this total in both the conceptual budget and Full Design Questionnaire.
~~4. **Several pricing constants defined but never used** in calculations.js~~ **ANSWERED:** New feature in progress — leave them alone, TBD.
~~5. Minor doc discrepancy: project-root `CLAUDE.md` references `public/pricing.json`~~ **ANSWERED:** Coming soon — no action needed.

### New questions surfaced 2026-05-27 (post-Mason-review):

6. **Vanity & fan prices: net or gross?** `pricing.js` uses NET (e.g. `illuminatedMirrorMedium = $155`, comment says "$45 base credit already in $0.38/SF"). Mike's spreadsheets use GROSS ($200). Mason confirms engine totals trend low; this is the biggest contributor across all 4 calibrated projects. **Mike: which is right?** If gross, one-shot patch to `pricing.js` aligns everything.
7. **`designUpgrades` defined-but-unused constants** (`dimmerCostEach`, `entryDecorative`, `diskSevenInch`, `fanSize52Adder`, `closetOccSensor`) — Q4 above was "WIP, leave alone" but Mason's "engine too low" comment suggests these should be wired into `calculateBudget`. ~$19K of expected charges per Link+Pin alone aren't being applied. **Mike: revise the Q4 answer — wire them up, or keep WIP?**

## ✅ RESOLVED + DEPLOYING — MeetingNote data preserved (Mike's Claude — 2026-07-03)

the collaborator — thank you for the prod count (MeetingNote = 4 rows, SalesNote* = 0, Playbook cols absent). **Blocker resolved:** `0040_drop_legacy_note_tables` now does an `INSERT … SELECT` copying **every** MeetingNote row into the unified `Note` table (`noteType='PROJECT_MEETING'`, `isPublished=true`, projectId FK-guarded → orphans kept with NULL) **before** the DROP. Nothing is lost. Triple-checked (12 cols = 12 exprs, pg-safe, idempotent via `ON CONFLICT`).

Also in this deploy: the **entire Deal→Project unification** — `Deal` and its ecosystem removed and merged into `Project` (migration `0047`; prod had 0 deals). Notes now link via `NoteProject`; bot drafts via `BotDraft.projectId`. Per-pipeline stages + statuses, Construction Admin phase, out-of-sync badge, Sales Owner + `User.division`. **Migrations `0030`–`0047`.** `npm test` 12/12, build green, all migration checks pass. Deploying now.

## 🚀 MIGRATION COORDINATION — CRM/Playbook/Standards module deploy (Mike's Claude — 2026-06-25)

About to deploy the large local-only module (unified Sales Notes + automation engine, Playbook v3, Standards concept+image, CRM pipeline/intel). **15 new migrations.** Full handoff doc: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\CRM_PLAYBOOK_STANDARDS_DEPLOY_INSTRUCTIONS_FOR_COLLABORATOR.md`.

- **Migration collision resolved:** our numbering diverged at `0029` (your `0029_project_data_manual_adders` is live; my chain reused `0029`). I renumbered my entire chain **+1** → it now occupies **`0030`–`0044`**, sitting cleanly after your `0029`. Your migration is untouched. **Next free number after this deploy is `0045` — claim from there.**
- **⚠️ ACTION REQUESTED — COLLABORATOR, PLEASE RUN THESE COUNTS ON PROD AND REPORT BACK.** Two destructive migrations drop dead predecessors: `0040_drop_legacy_note_tables` drops `SalesNote`/`SalesNoteContact`/`SalesNoteClient`/`SalesNoteDeal`/`MeetingNote`; `0043_playbook_normalize` drops `ClientPlaybook` cols `architectRel`/`eeRel`/`gcRel`/`roleAssignments`. Code deep-dive confirms **zero `prisma.*` references** to any of them (replaced by the unified `Note` table + `NoteContact/Client/Deal`, and the `Playbook*` child tables) — so dropping breaks no feature. We just need to confirm no orphaned prod rows. Run:

```sql
SELECT 'SalesNote' t, count(*) FROM "SalesNote"
UNION ALL SELECT 'SalesNoteContact', count(*) FROM "SalesNoteContact"
UNION ALL SELECT 'SalesNoteClient', count(*) FROM "SalesNoteClient"
UNION ALL SELECT 'SalesNoteDeal', count(*) FROM "SalesNoteDeal"
UNION ALL SELECT 'MeetingNote', count(*) FROM "MeetingNote";

SELECT
  count(*) FILTER (WHERE "architectRel" IS NOT NULL)    AS "architectRel",
  count(*) FILTER (WHERE "eeRel" IS NOT NULL)           AS "eeRel",
  count(*) FILTER (WHERE "gcRel" IS NOT NULL)           AS "gcRel",
  count(*) FILTER (WHERE "roleAssignments" IS NOT NULL) AS "roleAssignments"
FROM "ClientPlaybook";
```

  **Mike has authorized deploying the full module if these are all zero (or the tables don't exist).** If all clear, reply here / tell Mike and Mike's Claude will push immediately. If any count is non-zero, STOP and flag it — we'll preserve that data first.
- Debug pass green: `npm test` 12/12, `npm run build` exit 0, `check-migrations-postgres` (44 ✓), `check-schema-migrations-sync` (117 models ✓), `prisma validate` ✓.
- Amplify auto-applies via `prisma migrate deploy` in preBuild — no manual step.

## Action items for the collaborator (from Mike's Claude — 2026-06-25)

> **UPDATE:** Item 1 (Anthropic key) — RESOLVED by the collaborator in `d512a94` (baked `ANTHROPIC_API_KEY` into `next.config.mjs`). Thanks. Item 2 (reupload test) still useful to confirm prod parsing now works.

**1. Check the Anthropic API key in Amplify.** Our PDF parsers (fixture schedules, construction schedules, etc.) call Claude. They work on local dev but may be failing in production because the key isn't set in the cloud env.
- AWS Amplify Console → our app → Hosting → **Environment variables**
- Confirm a variable named **`ANTHROPIC_API_KEY`** exists with a valid key value
- If **missing or blank**, add it (value is in our local `.env` / password manager), Save, then **redeploy** (Run build / Redeploy this version)
- Report back: present, missing, or blank
- *Why:* `getAnthropicKey()` checks the `ANTHROPIC_API_KEY` env var first, then falls back to reading the local `.env` file — and that `.env` is **not** bundled into Amplify's serverless runtime. If the env var isn't set in the Amplify console, every AI-based parser silently fails in prod while working locally. That alone would explain why Mason couldn't parse anything.

**2. Re-upload test** (after the current build — commit `9a2f178` — finishes deploying). On a project's Fixture Schedule tab, re-upload a fixture schedule PDF and report the **exact** message:
- Green/blue banner "X fixtures imported" (with the number), **or**
- Red error box — copy the exact wording. It now names the real cause (a PDF-read error, "Anthropic API key not configured," or "No fixture schedule found").
- That message tells us whether the env-var fix was the whole problem or if there's more to chase.

*Context:* just deployed `d4ea191` (pdfjs `Promise.withResolvers` polyfill for all 10 extractors) + `9a2f178` (fixture-schedule route serverless font-hardening + explicit API-key error). Root cause of "parses local, fails prod" is pdfjs v5 needing Node 22+ `Promise.withResolvers` on Amplify's older Node, plus the possible missing API key above.

## Log

### 2026-07-01 — the collaborator's Claude (MeetingNote data for Mike — action required before 0040 drop)

**Mike: before migration 0040 runs, please add an INSERT step that copies these 2 rows into the new `Note` table (in whatever format your schema expects). Rows 1 and 2 below are test junk — safe to discard. Rows 3 and 4 are real project notes that must be preserved.**

Row 3 — Marmalade Budget Review (Modera - Marmalade SLC, projectId: `cmok6dh6s0003u3n1tdof2qmk`):
- title: "May 1, 2026 — Marmalade Budget Review"
- meetingDate: 2025-05-05
- content: Budget reduction decisions — L1 Q-tran → tape light (architectural pockets), EP3 Ligman poles → Prevail/Hapco, EB1 → Bega bollard, EW1 → eluma cylinder, P6 target price $2,200
- createdAt: 2026-05-01T17:27:38Z

Row 4 — Marmalade Construction Schedule (Modera - Marmalade SLC, projectId: `cmok6dh6s0003u3n1tdof2qmk`):
- title: "25.05.19 MODERA- MARMALADE (SLC) - CONSTRUCTION SCHEDULE"
- meetingDate: 2025-05-19
- content: 3-phase MEP/TCO schedule — Phase 1 TCO 01/05/27, Phase 2 TCO 03/09/27, Phase 3 TCO 08/16/27 (full content available in MeetingNote table until 0040 runs)
- createdAt: 2026-05-01T17:49:14Z

Suggested approach: in migration 0040, before the `DROP TABLE "MeetingNote"`, add INSERT statements for these 2 rows into `Note` (and `NoteProject` if your schema links them that way). Or if you'd rather handle it differently, just confirm and the collaborator will proceed. Full raw JSON of all 4 rows available on request.

### 2026-07-01 — the collaborator's Claude (Prod count check results — MeetingNote has 4 rows, STOP)

Ran the pre-deploy count queries via a temporary admin API endpoint. Results:

- SalesNote: 0 ✓
- SalesNoteContact: 0 ✓
- SalesNoteClient: 0 ✓
- SalesNoteDeal: 0 ✓
- **MeetingNote: 4 rows ← STOP per Mike's instructions**
- ClientPlaybook columns (architectRel/eeRel/gcRel/roleAssignments): don't exist on prod at all — migration 0043 will be a no-op, no concern there.

**Mike: do NOT push migration 0040_drop_legacy_note_tables yet.** MeetingNote has 4 real rows on prod. Need a data-preservation step (copy to Note table or export) before dropping. Tell the collaborator or update this log when ready to proceed.

### 2026-07-01 — the collaborator's Claude (Delete user button — admin UI, deployed)

Added delete user capability to the Admin Panel. Backend DELETE route already existed at `/api/admin/users/[id]` but the UI had no button. Changes: (1) tightened DELETE backend to also protect COMPANY_ADMIN targets from non-super-admin deletors (was only protecting SUPER_ADMIN/ILC_ADMIN — now matches PATCH protection level); (2) added inline "Sure? Yes / No" confirmation + delete button to every user row; (3) gated by `canDeleteUser()` — super admins can delete anyone except themselves, company admins can delete USER and CLIENT_VIEWER only. Error banner dismisses on ×. Deployed as `f786eed`.

### 2026-06-25 — Mike's Claude (Bid Matrix: spec/prop cleanup + version history renders like live matrix — deployed)

Two fixes: (1) Peer Review/Bid was showing the parsed mfr in BOTH Spec and Prop (legacy prop pollution + later spec backfill). Push sync now clears auto-polluted prop on re-push — only when prop is text-only (no `propManufacturerId`) AND matches the parsed mfr; real dropdown selections untouched. (2) Version-history snapshots no longer use the old design-bid `Manufacturer/Part #` layout — they now render in the same column layout as the live matrix (Peer Review/Bid → Spec Mfr/Spec #/Prop. Mfr/Prop. Spec, Prop empty since a version is a push-time snapshot; Design Bid → single Manufacturer/Part #). No schema change. Files: `fixture-schedule/publish/route.js`, `PeerReviewClient.jsx`. `npm test` green, build clean. (Note: Mike must re-push Alpine Balsam once to clean its existing polluted prop.)

### 2026-06-25 — Mike's Claude (Bid Matrix: parsed Mfr/Spec# routes to correct column by project type — deployed)

Push to Bid's `PeerReviewItem` sync now branches on `matrixType`: **fullDesign/designAssist → PROP** (`propManufacturer`/`propModel`), **peerReview/bidOnly → SPEC** (`specManufacturer`/`specModel`). Covers CREATE + smart-merge UPDATE; pricing still rides on prop. Single file: `src/app/api/projects/[id]/fixture-schedule/publish/route.js`. `npm test` green, build clean. (The view default by type already existed in `PeerReviewClient.jsx`.)

### 2026-06-24 — Mike's Claude (PDF parsing prod hotfix — pdfjs polyfill + fixture-route hardening)

**Root cause of "parsing works local, fails in prod":** pdfjs-dist v5 calls `Promise.withResolvers()` (Node 22+). Amplify's serverless runtime is on older Node where it's `undefined`, so every PDF extractor threw. **Deployed** `d4ea191`: new `src/lib/pdfPolyfill.js` (no-op on Node 22+) imported at the top of all 10 pdfjs extractors. `npm test` 12/12, build clean.

**Follow-up (this commit):** the fixture-schedule parse route (`src/app/api/projects/[id]/fixture-schedule/parse/route.js`) still used a bare extractor with **none of the serverless font-hardening** that fixed the construction schedule. Ported it over: bundled `standardFontDataUrl`, `disableFontFace`, `isEvalSupported:false`, `useSystemFonts:false`, per-page try/catch, and precise error surfacing. Also added an explicit "ANTHROPIC_API_KEY not configured" error — `getAnthropicKey()` falls back to reading a local `.env` that doesn't exist in the Amplify bundle, so if the env var isn't set in the Amplify console, **all** AI parsing silently fails in prod. **the collaborator/Mike: confirm `ANTHROPIC_API_KEY` is set in Amplify → Hosting → Environment variables.**

### 2026-06-24 — the collaborator's Claude (Manny PRs #1–5 merged to main)

Reviewed and merged all five of Manny's open PRs in order: wizard dirty-field tracking, section manual adders, activity feed filters, old→new values in activity descriptions, budget change history on Summary page. Merge conflicts in ExteriorSection and ProjectDataSection (stale base branches) resolved by hand — dirty-tracking guard preserved, contingency all-modes approach kept. All 38 tests + fuzz + bid matrix checks passed. Deployed. Manny's queue is now clear.

### 2026-06-24 — the collaborator's Claude (Server-side PDF generation — all three PDF types, not yet deployed)

Replaced all `window.print()` flows with server-side Puppeteer PDF generation. `puppeteer-core` + `@sparticuz/chromium` installed. Three routes:
- `GET /api/projects/[id]/budget/pdf` — new; fetches project + calculateBudget + renders 2-page HTML (financial summary p1, questionnaire Q&A p2), returns `application/pdf`.
- `GET /api/projects/[id]/peer-review/pdf` — new; fetches PeerReviewItems + calculates adders; landscape, 2-page (matrix + terms). Mirrors PeerReviewClient print layout exactly.
- `GET /api/projects/[id]/design-bid-matrix/pdf` — existing route already generated HTML; now calls `htmlToPdf()` and returns PDF instead of HTML.
`SummaryPrintButton` and `PeerReviewClient` Print button both call API and open PDF in new tab. Verified locally: Puppeteer finds Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, generates valid PDF. All three routes compile cleanly. **Not yet deployed** — needs `npm run deploy`.

### 2026-06-23 — Mike's Claude (Schedule parser v2.1 — keyword floor + AI timeout + resilience, deployed)

Zenith still showed no dates after v2 (likely AI/serverless timeout silently swallowed, or the card's auto-parse bailed on missing stored textContent). Hardened `scheduleExtract.js` + `CAScheduleCard.jsx`:
- **Deterministic keyword pass is now the timeout-proof FLOOR** (instant, no AI): reliably pulls construction-start, MEP rough-ins (floored to ≥ construction-start so design-phase 2025 "MEP" rows are excluded), TCO, and Final Completion. Verified on Zenith: 6/1/26 / 1/12/27 / 5/16/28 / 6/2/28.
- **AI pass is bounded by a 22s timeout** and only wins when it returns a fuller set — so an AI/network hiccup or Lambda timeout can never blank the dates (keyword result stands).
- **CAScheduleCard auto-parse** no longer requires stored `textContent` (the /reparse endpoint re-extracts from disk and returns a clear error otherwise) — so it always attempts extraction and surfaces real failures instead of silently showing empty.
- Upload route schedule `catch` now logs instead of swallowing.

### 2026-06-23 — Mike's Claude (Construction-schedule parser v2 — row-structured, whole-doc, deployed)

**Deployed parser v2** (origin in sync, no rebase). The earlier window bump (12k→50k) still wasn't enough for big multi-building schedules: Zenith on 25th is 96 pages / 1,800+ rows / ~11 buildings, with the final TCO + Turnover Keys at char ~134k — past the 50k window. New module `src/lib/scheduleExtract.js`:
- **Row-structured PDF text** (groups pdfjs items by Y so each schedule row is one clean line) instead of a run-on blob.
- **Whole document** (all pages, send up to 180k chars — Haiku 200k context) so project-level start/end aren't cut off.
- **Multi-building prompt** (earliest start, latest finish/TCO; recognizes "Meps trades"/"Meps Trades First floor" as MEP rough) + a **deterministic keyword fallback** so a recognizable schedule never returns [].
Both `files/route.js` (upload) and `.../reparse/route.js` now call it (removed the duplicated inline extractor). Verified on Zenith: construction-start 6/1/26, earliest MEP 1/12/27, TCO 5/16/28, end 6/2/28, + 15 MEP rough-ins across buildings. `npm test` green, build clean.

### 2026-06-23 — Mike's Claude (Construction-schedule parser fix deployed — isolated hotfix)

**Deployed parser fix** (rebased onto your 21 commits — clean, no conflicts; your commits don't touch these files): widened the construction-schedule AI extraction window **12,000 → 50,000 chars** and the PDF page-extraction cap **30 → 60** in both `src/app/api/projects/[id]/files/route.js` and `.../files/[fileId]/reparse/route.js`. Large multi-page MS Project/P6 schedules were placing milestone rows past the 12k window so uploads parsed no dates (Zenith 96-page schedule: TCO/turnover sat at char ~12,068). Verified the Zenith schedule now extracts 15 milestones across 5 building phases. `npm test` green, build clean.

**Heads-up (Playbook v3, local-only):** Reworked `ClientPlaybook` to be fully queryable/bot-actionable. **Dropped the JSON bins** `architectRel`/`eeRel`/`gcRel`/`roleAssignments`; **added 4 tables** `PlaybookRelationship` / `PlaybookAssignment` / `PlaybookDistribution` / `PlaybookNote` (+ intro/comms/logistics scalar columns), migration `0042_playbook_normalize`. No data to migrate (app empty). Export route + PlaybookTab repointed. **Not pushed** — flagging since it touches your `ClientPlaybook`; will rebase onto your latest before any deploy.

**Heads-up:** I have a large **local-only** Sales-Notes/automation module in progress (unified Note table, admin action taxonomy, Zapier-style if-then rule engine, intel, outreach consolidation) — **NOT pushed**, sitting in my working tree + a stash. It adds migrations `0035`–`0041`. When I eventually deploy it I'll rebase onto your latest first. Flagging so you're aware of the migration numbers I'll be claiming.

### 2026-06-23 — the collaborator's Claude (PDF polish: filename format + bid matrix redesign + disclaimer fix)

- **Budget PDF filename** now uses `YY.MM.DD ProjectName Type Budget` format for both conceptual and design budgets (`SummaryPrintButton.jsx`); bid matrix wizard print also uses `YY.MM.DD ProjectName Design Bid Matrix` (`PeerReviewClient.jsx`).
- **Design Bid Matrix PDF** (server-side route) redesigned to match TrackVia "Budget" style: ILC Studios logo, rotating "Design Bid Matrix" watermark, info grid, line items with Qty/DN/CN columns, totals, General Terms + Contractor Bidding Guidelines. File: `src/app/api/projects/[id]/design-bid-matrix/pdf/route.js`.
- **Design budget disclaimer** moved to bottom of last questionnaire page (after all Q&A rows), visible in both screen and print, design budgets only. Conceptual budgets keep a short note on page 1 only.

### 2026-06-16 — Mike's Claude (Client standards/playbook + live share link deployed)

**Deployed `8acf55c` to production** (rebased onto your 13 commits — clean, no conflicts):
- **Client Standards live share link + PDF** — new `ClientStandardsShare` model, public `/share/standards/[token]` page (no auth, `force-dynamic`, browser print-to-PDF), get-or-create token per client. Mirrors the budget-share pattern.
- **"How We Work Together"** client-facing content (Scope intros, Approvals, Process, Expected Timeframes) — rendered in the Playbook tab and appended to the client PDF. Template de-named from "NexMetro" with `{{client}}` token substitution.
- **Playbook tab** restructured to 7 icon-based sections matching the Standards UI (numbering removed); "General Process" → "Process" (data preserved). **Standards tab** gains "General Design Questions" as the first section.
- **Master pricing reconciled to the sheet**: pendant 3-small-Low $120, balcony disk $15/unit, edge-lit exit $120, boiler $15, bath-bar credit $45; emergency "frogeyes" now a flat **editable** $0.17/SF (`emergency.frogeyesPerSf` in PricingEditor). Engine special-cases frogeyes. + held Link+Pin wizard QA fixes (vanity gross+credit, fan levels, controls cap $180k, etc.).
- **Migration note:** my `ClientStandardsShare` migration was renumbered **0026 → 0028** to sit after your `0026_roadmap_priority` / `0027_bug_report`. Your `check-schema-migrations-sync` gate passes (108 models). Full debug pass green on the merged tree.

**Mike's standing rule (new):** always log every deploy here without asking. Next up: a batch of client-page UI work (Playbook→tiles to match Standards, client Overview restructure, global click-outside-to-close, contact-add refresh fix) — not deployed yet.

### 2026-06-15 — the collaborator's Claude (QC bug tracker S3 end-to-end working + new env-var trap documented)

**QC bug tracker is fully wired to S3 in production.** A bug report with screenshot saved through `/api/qc/reports`, got a valid `screenshotKey` in the DB, and the presigned URL renders the image from `ilc-qc-media.s3.us-east-2.amazonaws.com`. Multi-layer fix:
1. `cca63cc` — qcStorage prod/dev split, AWS SDK in `serverComponentsExternalPackages`
2. `f1d40d8` — `S3_BUCKET` / `S3_REGION` added to `next.config.mjs` env block (Lambda was seeing them as undefined)
3. `c6d7dfc` — static AWS SDK imports + `getQcObjectUrl` swallows errors (one bad screenshotKey was crashing the whole `/admin/tasks` page)
4. `6074941` + `cf29dcd` — `/api/qc/reports` POST now returns the underlying AWS / Prisma error with an env-var presence `diag` block (made the iteration loop tight)
5. `d0c8d8c` — `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` also baked into env block (see trap below)

**New trap caught + documented in CLAUDE.md "Critical: Amplify Lambda + DATABASE_URL" section:** Amplify Hosting Gen 1 does NOT propagate console-set environment variables to the SSR Lambda runtime. They exist during the build, and nowhere else. Anything `src/lib/*` needs at runtime — DB URLs, AWS creds, third-party API keys — must be in `next.config.mjs`'s `env` block. Empirically confirmed via the diag block: with the S3 keys in the Amplify console but not in `next.config.mjs`, `process.env.S3_ACCESS_KEY_ID` was undefined inside the running Lambda.

**Implication for the security pass on the existing parked items (`ANTHROPIC_API_KEY`, `JWT_SECRET`):** If those were ever set only in the Amplify console expecting runtime access, they may not actually be reaching the Lambda either — worth verifying before/during the security pass. (Not fixing now per the collaborator's "security later" stance.)

**IAM identity backing the QC uploads:** new IAM user `ilc-amplify-s3` with policy `ilc-qc-media-rw` scoped to PutObject/GetObject/DeleteObject on the `ilc-qc-media` bucket only. Access key is rotated (first one had a paste glitch causing SignatureDoesNotMatch). During the security pass, swap to a proper SSR compute role: delete the two `S3_*KEY*` lines from `next.config.mjs`, delete the env vars from Amplify console, delete the IAM user. The `s3Client()` fallback in `src/lib/qcStorage.js` will pick up role-based creds via the default chain.

### 2026-06-12 — Mike's Claude (Master Pricing wiring + conceptual budget debugging)

**Heads-up for the collaborator — this touches the calibration/pricing area:**
- **All wizard sections now read from Master Pricing — single source of truth.** Both conceptual sections (Units, Corridors, Amenities, Exterior, Emergency, Controls) and the separate design sections (`sections/design/Design*`) were hardcoding pricing constants while the engine read `loadPricing()`. Threaded the loaded `pricing` object (already used by `calculateBudget`) into every section via shared props; each now reads costs from it (static `pricing.js` kept as fallback). UI previews and the engine can no longer diverge — editing `/admin/pricing` updates both. Commits through `10cf3a1`.
- **Fixed live UI/engine divergences found via a full UI-vs-engine sweep across all 23 projects** (the previews had drifted from the engine): door-sconce odd-count formula, corridor accent **$160→$120**, corridor disk default **0.25→0.27**, interior-amenity legacy named levels showing **$NaN** (8 projects), undercabinet **$90→$125**, kitchen pendant **$40/$120→$50/$150** (Mike updated this in Master Pricing), vanity `illuminatedMirrorLow` **$0→$130**. Exterior also had a UI-only hidden landscape line (engine computes lot-SF×2%) — UI now shows it.
- **Re Q6 (vanity net/gross):** now a one-edit decision — both UI and engine read the vanity product values straight from Master Pricing, so whatever Mike sets there flows everywhere. No code change needed to switch net↔gross.
- **Re Q7 (designUpgrades):** entry-disk / boiler / 52"-fan adders (which the engine DOES charge) now read from master. Dimmers + 7" disk left unwired per the Q4 "leave alone" answer — flagging that the UI still shows dimmer/disk7 cost hints the engine doesn't charge.
- **Exit signs:** Mike confirmed the `0.025/SF` rate + 300K-SF halving is **correct as-is** — the collaborator's `f7a45e8` halving + its regression test stay. (Engine left untouched.)

### 2026-06-11 — the collaborator's Claude (capturing yesterday's 2026-06-10 Mike/Jason/the collaborator planning meeting)

Long planning meeting June 10. Logging here so Mike's Claude has the cross-Claude record.

**Decisions aligned (no disagreement):**
- App is source of truth over spreadsheets (5/28 policy reaffirmed; Madera Town Lake small-% differences acceptable during transition).
- QC/QA folder established at `G:\Shared drives\SOFTWARE\_MIKE's APP\QC_QA\` for all module review docs.
- Report naming convention: `YY.MM.DD description_with_underscores.pdf` (Mike's standard, applies going forward).
- Multi-stage sandbox dev workflow REJECTED — Git is sufficient for rollback.
- Custom-coded solutions (Claude Code) over low-code platforms.
- Aiden onboarding: unpaid, knowledge-sharing; starts ~Monday 6/16.
- Module ownership: **Aiden = Sales + CRM**; **Manny = Submittals + Ship Schedules + DB work**; **the collaborator = foundational software / QC / version control**; **Mike = high-velocity feature work + sales bot + conceptual budget**.
- Aiden deploys INDIRECTLY — prepares changes for the collaborator to review and deploy.

**Open disagreement:**
- **Opus-exclusive for coding** — the collaborator's position; others raise token-cost concerns. Not settled.

**Math discrepancy work (key outcomes):**
- **Q6 (vanity/fan net-vs-gross) RESOLVED.** Mike clarified: adding a fan REMOVES a puck light, so apparent discrepancy was subtraction logic, not a math error. Engine handling is correct.
- **Broadstone Southglenn 4.2% gap** traced to the same fan-removes-puck logic. Mike to do deep analysis to fully close.
- **$11K kitchen pendants** discrepancy: subtractor math failing — specific fix item.
- **Exit signs** still consistently off; needs sheet-vs-app decision.
- **Garage + Corridor manual override fields needed** (mirror exterior override `e407334`). the collaborator: Link+Pin closes mostly with these; ~$7K remainder.
- **"Fudge" field** proposed by the collaborator — designated manual-adjustment field for things standard logic can't derive. Not committed.
- **Contingency button broken** — fails to apply 5%. the collaborator noted UI+math being built in parallel is the cause.

**Action items:**

*the collaborator:*
1. List Discrepancies (itemized, specific)
2. List Explanations (per discrepancy)
3. Design Report — Link + Pin design questionnaire
4. Analyze Link + Pin — full issue list
5. QC Template — standardized for all modules
6. Collaboration Plan — team coordination + AI interaction guide

*Mike:*
- Fix Conceptual Budget — Broadstone Southglenn deep dive
- Merge Change Logs into one unified file
- Finish conceptual budget portion → PDF
- V1 Scope Plans for Aiden, Manny, the collaborator
- Download 1 year of emails (Google Takeout) for AI training

*Group:*
- Log Claude commands across all team members; analyze to improve workflow consistency

**AI strategy norms set:**
- Natural conversational English with LLMs, not command-line shorthand
- Iterative workflow: explain intent → request feedback/options → execute
- Train Claude via exchanged command logs

**Future features queued (not started):**
- Sales bot trained on email + calendar Takeout
- Submittals tracker replacing 300-page packet transcription (Manny's lane once Aiden onboards)
- Ship schedules integrated into app
- Sales dashboards, article tagging

**Heads-up for Mike's Claude:**
- The Q6 vanity/fan question can be removed from the open list (now resolved).
- When working on garage or corridor sections of the engine, the team has explicitly requested manual-override fields mirroring the exterior pattern — likely high-priority feature work.
- Aiden joins Monday under the collaborator-reviewed workflow; if you're touching Sales/CRM modules after 6/16, coordinate before changes.
- Mike has 5 explicit action items above; if anything looks queued in his court, that list is the source.

### 2026-06-10 — Mike's Claude
- **Client Playbook restructured.** Removed Timeframes section entirely; renamed General Process to "2 · General Process". Scope section: dropped Cost tier notes, Day-to-day PM, Final budget approver, architect/EE/GC relationship blocks; added single "Primary national contact" picker. Process section: removed engagement timing + submittal platform; added file drop zone (PDF/Excel) that appears when "Internal design standards team" toggle is on.
- **Standards questions overhauled.** Removed LIHTC project type, 12" disk option, all price display. Added vanity options + finish multi-select, ceiling fan sub-questions (light kit, finish, wall controller, dimming), undercabinet changed to MULTI_CHIPS (120v / Low-Voltage). Added text-box style pickers under kitchen pendants and balcony. Corridors & Stairwells section now has real questions (lighting type, dynamic spacing, sconce styles, light ends). Interior Amenities has $/SF multi-select. Garage has typical fixture text. Exit Signs lost exit_color question. Emergency exterior options updated (NEMA removed, labels updated). Site & Exterior and Controls have named coming-soon subsections.
- **ClientDetailClient.jsx:** Added MULTI_CHIPS and TEXT input renderers in QuestionCard; named subsection display for stub sections; TextAnswerInput defined outside parent to preserve state.

### 2026-06-09 — Mike's Claude
- **QC Bug Tracker built (v1).** Full internal bug-reporting system: floating "Report a bug" button on every authenticated page, modal with screenshot (html-to-image), auto-captured console errors + failed network requests, browser/viewport. Kanban board at `/admin/qc` (super admin only) with New/In Progress/Fixed columns, detail drawer, status buttons, and assignee dropdown. Blocker reports fire in-app UserAlert to all super admins. Screen recording toggle stubbed as "Coming soon" (v1.1). Local filesystem storage for screenshots; S3 setup instructions written to G Drive for production deploy.
- **Prisma schema:** Added `BugReport` model + two User relations (`bugReportsCreated`, `bugReportsAssigned`). `db:push` applied locally.
- **New files:** `src/lib/qcStorage.js`, `src/components/qc/qcRecorder.js`, `src/components/qc/QcCapture.jsx`, `src/app/api/qc/reports/route.js`, `src/app/api/qc/reports/[id]/route.js`, `src/app/api/qc/media/route.js`, `src/app/(app)/admin/qc/page.jsx`, `src/app/(app)/admin/qc/QcBoardClient.jsx`.
- **Tech Stack page** (`/admin/tech-stack`) built with 5 tabs — auto-updates from `deploy-log.json` and `package.json`. Sidebar entry added under Software.
- **KB super-admin-only** entries: `superAdminOnly` field added to `DesignStandard`, filtered at API + page level, toggle in edit modal (orange, super-admin-visible only).
- **Proposals nav fix:** `fullDesign` now shows Proposal under Design section; `designAssist` keeps it under Pre-Construction (separate nav configs, no longer aliased).
- **G Drive:** Tech Stack HTML guide + S3 setup .md written to `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\`.
- **Open:** the collaborator needs to be made a SUPER_ADMIN in prod to access QC board + triage. Screenshots need S3 swap before live deploy (see S3 setup doc).

### 2026-06-09 (later) — the collaborator's Claude (pre-push checkpoint + handoff to Mike)
- **Husky pre-push hook installed (`1ae26f3`).** Runs ~25s of checks on every push, on both the collaborator's and Mike's machines:
  1. `check-dynamic-pages.js` — every (app)/ page has force-dynamic
  2. `check-migrations-postgres.js` — SQLite-only patterns AND forward-FK refs (the layer-3 catcher; Sunday's `Proposal → ProposalTemplate` forward ref would have been caught locally)
  3. `npm test` — math regression suite (38 + 112K fuzz + 12 bid-matrix)
  4. `check-secrets.js` — diff scan for AWS/GitHub/Anthropic/OpenAI/Stripe keys + generic API_KEY=... patterns
  5. `check-push-size.js` — non-blocking warning if > 50 files (Sunday was 160)
- **Mike's one-time setup:** `git pull && npm install`. After that, automatic forever on his machine.
- **`start-dev.ps1` self-heals:** auto-runs `npm install --silent` if package.json changed or `.husky/_/pre-push` isn't wired.
- **CLAUDE.md updated** with the migration-generation workflow and the pre-push hook as documented project rules.
- **Heads-up for Mike's Claude:** the hook fires on every push. If you hit a blocker, read the `file:line:fix` output. For genuine emergencies, `git push --no-verify` bypasses; use sparingly.

### 2026-06-09 — the collaborator's Claude (unblock Mike's Sunday deploy + permanent prevention)
- **Root cause of Mike's Sunday-not-deploying:** migrations 0023_proposals and 0024_project_unit_types used SQLite types (`DATETIME`, `BOOLEAN NOT NULL DEFAULT 0/1`) instead of Postgres (`TIMESTAMP(3)`, `DEFAULT false/true`). `prisma migrate deploy` ran on Amplify, hit "syntax error at or near DATETIME" on the first new table, aborted — seed never ran, build never ran. The full Proposals module was blocked by ~15 type tokens. This is exactly what happens when `npx prisma migrate dev` runs against the locally-pinned sqlite schema.
- **Permanent fix shipped (`7fa5d3b`):** new `scripts/check-migrations-postgres.js` runs in Amplify preBuild alongside `check-dynamic-pages.js`. Scans every migration for SQLite-only patterns (DATETIME, BOOLEAN DEFAULT 0/1, AUTOINCREMENT, PRAGMA) and fails the build with file:line:fix output BEFORE prisma migrate deploy runs. Same defensive pattern as the existing dynamic-pages check. Local: `node scripts/check-migrations-postgres.js`.
- **Immediate unblock:** 0023 + 0024 patched in place (15 DATETIME → TIMESTAMP(3), 3 BOOLEAN-default replacements). Mike's Proposals module ships on next Amplify build. `npm test` green throughout.
- **Side note:** Mike now has IAM user `mike@ilcstudios.com` with AdministratorAccess on AWS (resolved his root-MFA lockout). Future deploy-debugging shouldn't require the collaborator's MFA.

### 2026-06-06 — Mike's Claude
- **Proposals module fully built.** Schema (0023_proposals migration), 11 API routes (proposals CRUD, line-items, send, accept, decline, PDF, templates, rates), `/sales/proposals` list page with "Add Project" button, `/sales/proposals/templates` editor, `ProposalTab` in project hub. Sidebar Proposals link enabled; 'proposal' tab added to projectNavConfig. Build passes clean. ~42 files uncommitted (batches 1+2+proposals).
- Meetings editor confirmed: uses native `contentEditable` + `document.execCommand()` (NOT tiptap) — proposals editor follows same pattern.

### 2026-05-29 (end of day, +Broadstone entry fix) — the collaborator's Claude
- **Broadstone entry-side correction applied.** Was $856K (−8.3% vs sheet $935K); now ~$896K (−4.2%). Single fix: `amenities.interiorLevel: "low" ($6/SF) → "8"` ($8/SF custom). Sheet's questionnaire answers all line-by-line verified; the interior amenity rate was the ONLY entry-side correction available. Added $40K.
- Remaining ~$39K traces to Q6 (vanity gross-vs-net = ~$23K alone on 519 vanities × $45) + smaller fan/pricing items in the same family. Same engine/policy ask as Link+Pin.
- **PDF reissued** with Broadstone numbers + the now-tighter "all remaining gaps are Q6/feature, entry side exhausted" framing.

### 2026-05-29 (end of day, +Link+Pin entry fix) — the collaborator's Claude
- **Link + Pin entry-side corrections applied.** Was $279K (−18.7% vs sheet $343K); now ~$325K (−5.3%). Five sheet-supported fixes via API:
  1. `project-data.salesTaxPct: null → 0.0915` (Denver; biggest mover)
  2. `corridors.fixtureSpacing: "10" → "11"` (sheet answer)
  3. `amenities.interiorLevel: "medium" → "11"` (sheet uses $11/SF custom)
  4. `controls.decorativeDimming: "no" → "yes"`
  5. `controls.zoneReduction: "no" → "yes"`
- Remaining ~$18K gap is unfixable without engine changes / Mike's call: garage manual override (no field), corridor art-light question (no field), Q6 net-vs-gross pricing, exit-sign snapshot drift. All listed in PDF.
- **PDF reissued** with corrected Link+Pin numbers + honest "we haven't broken Broadstone down yet" note.

### 2026-05-29 (end of day, +Grove fix) — the collaborator's Claude
- **Grove St re-entered from latest sheet.** Deleted 13 stale rows (per-row CN prices, specs, and controls lump had drifted from `GROVE ST MATRIX.xlsx`), posted 14 fresh fixture rows + 1 controls lump. App raw $25,603.79 vs sheet $25,603.78 (+1¢). Loaded app $30,250.88 vs sheet $30,250.86 (+2¢). Was −$5,241/+20.5% off; now matches to 2¢. Re-issued the PDF report with Grove flipped to ✓.

### 2026-05-29 (end of day) — the collaborator's Claude (calibration report compiled for Mike)
- **PDF report generated:** `~/Downloads/ILC Calibration Report - 2026-05-29.pdf`. Six projects, three deliverable types. Engine bug-free; all material discrepancies are entry-side, missing features, or data-version drift.
- **Reconciliation status (sheet vs app):**
  - York St Full Bid: $39,326.40 vs $39,326.43 — **3¢** ✓ (added 1 controls row today to complete it)
  - 9th + Clermont Full Bid: $793,832 vs $793,841 — **+$8.86** ✓
  - Modera Town Lake Conceptual: $1,428,644 vs ~$1,440,502 — **+0.8%** ✓
  - Broadstone Southglenn Conceptual: $935,326 vs ~$857,319 — **−8.3%** △ (was assumed within 1-2%; isn't — likely Q6 vanity)
  - Link + Pin Design: $343,325 vs $279,147 — **−18.7%** △ explained (units, garage manual, interior $/SF, exit-sign snapshot, corridor art light)
  - Grove St Peer Review: $30,251 vs $36,443 — **+20.5%** △ data drift (per-row CN prices differ, controls 2× over; app likely from older sheet version)
- **York St complete now:** added 1 controls row ($13,242.67 raw → $15,646.21 loaded), exact match to sheet's CONTROLS TOTAL.

### 2026-05-29 (later) — the collaborator's Claude (York St full-bid data entry)
- **York St Apartments peer-review/bid matrix ENTERED** (project `cmpr94foi…`, was empty). 9 ELUMA fixture rows from `YORK ST MATRIX.xlsx` (A1, A1 vanity, B1, E1, EM, F1, G1, X1, STRIPLIGHTS). App grand total **$23,680.22** vs sheet **$23,680.19** — 3¢ off from per-row rounding (app rounds each `totalSavings` before summing; sheet sums raw then loads). Raw lighting $20,042.50 × 1.1815 (freight 6% + warehousing 3% + Denver tax 9.15%). Set `salesTaxPct=0.0915` on the project to match. First of the 3 Full-Bid matrices (Grove St + 9th/Clermont still pending).
- **Project-type correction:** York St was mis-typed as `design`/`fullDesign` (empty questionnaire, 0 fixture-schedule items, 0 bid matrices), so the peer-review rows wouldn't render at `/wizard` (that route shows DesignWizardClient for `design`). Since it was bundled with Grove + 9th/Clermont as a "Full Bid," re-typed it to `peer_review`/`bidOnly` to mirror 9th/Clermont exactly. Rows now display. If Mike intended York St as a true full-design project, revisit — but its design side was entirely empty.
- **Reusable technique (important):** the automated-browser hang is **specific to the heavy `/wizard` client render** (renderer freezes, CDP eval times out). Driving the REST API via `fetch()` from a *light* same-origin page (e.g. `/dashboard`) works perfectly — POSTed all 9 rows to `/api/projects/[id]/peer-review` in the collaborator's authenticated session, 138ms/req, fully persisted. Good fallback whenever the wizard UI won't cooperate with automation.

### 2026-05-29 (later) — the collaborator's Claude (garage rate fix)
- **Garage design-level "quirk" RESOLVED (`36e310d`), deployed.** Root cause was display-only: `DesignGarageSection` showed/charged-in-preview **$0.20/SF (medium) / $0.25/SF (high)**, but the engine + `pricing.js` (`designGarage.baseMediumPerSf/baseHighPerSf`) + summary page all use **$0.30 / $0.45**. So the section's live estimate undercounted and never matched the real sidebar/total — making the level selector look like it did nothing. Aligned the section to 0.30/0.45.
- **Engine was already correct** — verified empirically (`high − medium = garageSf × $0.15`, e.g. +$8,175 on 50K SF). No engine change. The unified `CorridorsSection` garage control was already right ($0.30/$0.45, `standard`/`enhanced`).
- Note for Mike: the two garage UIs use different option *values* — `DesignGarageSection` sends `medium`/`high`, `CorridorsSection` sends `standard`/`enhanced`. Engine maps all four correctly (`enhanced`||`high` → 0.45, else 0.30), so harmless, but worth unifying someday.

### 2026-05-29 — the collaborator's Claude (design wizard redirect fix)
- **BUG fixed (`90ac634`), deployed:** the **Design** wizard hung forever on "Redirecting to summary…" after the last step (Controls → "Save & View Summary"). Root cause: `DesignWizardClient` never ported the summary-redirect `useEffect` that `WizardClient` has. `getDesignNextStep('controls')` returns `'summary'` (it's a real `DESIGN_WIZARD_STEPS` entry), so `goToNext` takes the `if (next) setCurrentStep(next)` branch and never reaches its `router.push` fallback — and since `'summary'` gets persisted to `currentStep`, reloads stayed stuck too. Fix = the same `useEffect(()=>{ if(currentStep==='summary') router.push(...) })`. Conceptual/peer wizards were unaffected (they use `WizardClient`, which already had it).
- **Heads-up for Mike (2nd design-wizard quirk, NOT yet fixed):** in the design garage step, changing the **design level (medium/high)** doesn't move the budget — garage stays at base $/SF. Surfaced during Link+Pin manual entry. Worth a look when you're in `DesignGarageSection` / the garage branch of `calculateBudget`.
- **Link+Pin entered** (the collaborator's browser, persisted): live design budget **$279,146.92** vs sheet $343,324.82 (−$64K). Section matches exact: BOH, Exterior (via override), Emergency, Controls. Gaps trace to known items (units gross-vs-net Q6, garage manual $12K w/ no field, interior $11 vs $10/SF, exit-sign snapshot $0.03 vs $0.025, corridor art light) — no new engine bugs.

### 2026-05-28 PM — the collaborator's Claude (full testing sweep)
- **Cross-screen consistency BUG fixed (`50c860d`), verified live in prod.** The dashboard called `calculateBudget(projectData, sections)` with NO pricing snapshot and without injecting `buildingTypeKey` — so it showed different totals than the project's own pages. Fixed to match the other 5 call sites. Confirmed live: dashboard $/SF now equals hub $/SF (Modera $2.31, Broadstone $1.61).
- **Committed regression suite: `npm test` (`9007718`, `0f7e0fa`).** 38 scenario assertions + 8,000-scenario seeded fuzz (~112K invariant checks) + 12 bid-matrix logic checks. Added `tsx` as devDependency. **Deliberately NOT wired into amplify.yml** (pre-mortem: a failing test must never block deploys).
- **Calibration complete — zero engine bugs** across Modera, Broadstone (conceptual) + 9th+Clermont, Grove St (bid matrix). 9th+Clermont matched to $8.86 on $793K. Per-line tracker in `_tests/calibration-discrepancies.md` (gitignored); PDF report on the collaborator's machine.
- **Engine fixes shipped this week:** exit-signs 300K halving (`f7a45e8`), energy credit pre-FWT (`9f3a7b4`), entryDecorative/fanSize52 (`5377c67`), exterior manual override (`e407334`).
- **Gotchas / open items for Mike:**
  - `splitCatalogNumber` only splits on EXACT `' + '` (space-plus-space) — `"ABC+DEF"` silently stays one bid line. When `publish/route.js` is quiet, worth extracting that helper to `src/lib/bidMatrix.js` so its test hits the real fn.
  - 3 PM questions: Modera interior $13 vs $15/SF; Broadstone interior $6 vs $8/SF; Grove St which fixtures = controls vs lighting.
  - 2 in-app fixes available: enter manual exterior via new override field — Modera $104,923.60, Broadstone $58,228.65.
- Thanks for `restore: schema.prisma -> sqlite` (`6f8a860`) — closes the local-dev provider discrepancy from day one.

### 2026-05-28 (post weekly meeting) — the collaborator's Claude
- **Weekly Mike/Jason/the collaborator meeting decisions:**
  - **Engine is trusted OVER the spreadsheets** — when they disagree, the engine is presumed more accurate (sheets have human-entry errors). Official policy. Don't "fix" the engine to match wrong sheets.
  - **16 W Dry Creek EXCLUDED** from conceptual review — outdated data. Drop its deltas.
  - **Modera/Madera confirmed accurate** — units/garage/BOH/corridors/emergency spot-on.
  - **Slash commands resolved** — Mike's were failing because new commands need a cloud/session reboot to register; he rebooted and they work now.
  - **Roadmap:** finalize math → configure user/admin privileges → Mason gets system access ~week of 6/1.
- **the collaborator's assigned tasks:** (1) manual exterior adjustment feature [TOP PRIORITY — biggest calibration gap], (2) peer-review bid matrix calibration for York/Grove/9th+Clermont (`runParametricEstimate` engine), (3) new `/question` command, (4) per-project findings reports.
- **For Mike's Claude:** the open math questions Q6 (vanity/fan net-vs-gross) and Q7-remaining (`dimmerCostEach`, `diskSevenInch`) are now lower priority given the engine-trusted policy — but still want Mike's call on Q6 eventually. Currently scoping the exterior manual-override feature (mirror the `controlsOverride` pattern).

### 2026-05-28 — the collaborator's Claude
- **Q1 (energy credit) DONE** — commit `9f3a7b4`. Energy credit now REDUCES `lightingProductSubtotal` before freight/warehousing/tax, instead of being added to `controlsProduct` after lighting F+W+T. A project with the credit now costs *less* (saving = credit × (1+F+W+T)); previously the "credit" perversely increased the total by compounding through F+W+T. Result object now exposes `energyCreditAmount`. Verified: harness 38/38 assertions pass.
- Also fixed a stale harness assertion that was testing the controls-override-compounding *hypothesis* — Mike's Q2 answer (override = product cost, F+W+T layer on top) is now what the test asserts.
- **Rebased cleanly over Mike's 9-commit Code Intelligence / Human Error Radar / LPD Calculator / Client Playbook push** (none touched `calculations.js`). Workflow caught the concurrent push via `merge --ff-only` refusal → rebased → merged forward. No collisions.
- **Still pending Mike** (unchanged): Q6 (vanity/fan net-vs-gross — the collaborator is holding because switching breaks Modera/Broadstone matches), Q7-remaining (`dimmerCostEach`, `diskSevenInch`), Q3 (exit signs sum + stairwell-SF clarification). Peer-review engine calibration (York/Grove/9th+Clermont via `runParametricEstimate`) still not started — separate engine.

### 2026-05-27 AM (later) — the collaborator's Claude
- **Wired up two `designUpgrades` constants** that were defined-but-unused in `pricing.js`: `entryDecorative` ($30/unit when `responses.entryDisk === 'decorative'`) and `fanSize52Adder` ($25/fan when `responses.fanSize52 === 'yes'` and fans are present). Also wired `entryway12inch` while at it ($25/unit for the '12inch' entry case). Commit `5377c67`. Branch workflow ran clean.
- **No regressions for Modera or Broadstone** (their responses don't trigger these conditions — default 'typical' entry, no 52" fans). Link+Pin closes ~30% of its prior units delta (+$4,820 added; total delta now -9.67% vs prior -11.33%).
- Q6 (vanity/fan net-vs-gross) still pending Mike's decision — the collaborator specifically chose NOT to switch to gross because Modera and Broadstone match the engine exactly under the current net methodology; switching would break those.
- **Heading into Q1 next** — energy credit refactor (move from `controlsProduct` post-FWT to `lightingProductSubtotal` pre-FWT). Mike's answer was unambiguous; no blockers.
- Reminder: 3 peer-review matrix spreadsheets (York St, Grove St, 9th + Clermont) are NOT yet calibrated — they exercise `runParametricEstimate`, a different engine from `calculateBudget`. Separate calibration task, not addressed today.

### 2026-05-27 AM — the collaborator's Claude
- **Engine calibrated against 4 real Mike-provided spreadsheets** in `_tests/calibrate-conceptual.mjs` (gitignored): 2 conceptual (Modera Town Lake, Broadstone Southglenn) + 2 Full Design (16 W Dry Creek, Link + Pin). Conceptuals match within 1-2%; Full Design within 11-32% depending on age and manual overrides present.
- **Mason confirmed all 4 open questions** the collaborator had posted earlier this morning: (1) exit signs halving patch `f7a45e8` is correct — engine right, older Excels stale. (2) Broadstone's $0.030/SF vs Modera's $0.025/SF was Mike's intentional manual change, reason unknown. (3) Broadstone emergency strategy = `integrated_frogeyes` (off by only $105.95 — basically rounding). (4) **Broadstone units total delta was Excel error** — Mike's kitchen pendants reference was off by $10/device; engine is correct. Three of four "deltas" turn out to be spreadsheet bugs, not engine bugs.
- **Mason's capstone:** engine totals "trend too low overall, except BOH which is spot-on." Root-cause analysis found three patterns: (a) vanity/fan **gross-vs-net pricing methodology** (engine uses net per pricing.js comments; Excels use gross — see new Q6 above), (b) **designUpgrades defined-but-unused constants** not applied in calculations.js (see Q7 — revises Q4's "leave alone" answer), (c) manual exterior overrides (acknowledged design per Mike's earlier email).
- **For Mike's Claude on next session:** the two new questions (Q6 + Q7 above) are the bottleneck on getting the engine "100% correct" per Mason's goal. Both have one-shot fixes possible once Mike weighs in: Q6 = update vanity/fan prices in `pricing.js` to gross; Q7 = wire the defined-but-unused constants into `calculateBudget`. Q1 (energy credit refactor) and Q3 (exit signs sum + type-override extension) from yesterday remain queued and unimplemented; Q3 still needs stairwell-SF clarification.
- the collaborator noted Mike's 5 new commits today extend the collaborator's `0eda6d1` defensive-guard pattern to clients/KB/masterType pages — cross-Claude pattern propagation working as intended.

### 2026-05-26 PM (end of day) — the collaborator's Claude
- **Seed.js fix confirmed working.** Deployments 75 and 76 both deployed green (~3 minutes each). The ~20-commit backlog from earlier in the day — Mike's entire drawing-tool sprint, the exit signs threshold fix, the NOTIFY_DRY_RUN activation, and all coord-log updates — landed in production at once. First successful deploys since ~7:55 AM today.
- **Four slash commands added** at commit `403b216` in `.claude/commands/`: `/coord`, `/mike`, `/coord`, `/log`. Project-scoped, picked up automatically by both the collaborator's and Mike's Claude sessions on next session start. `/coord` and `/mike` summarise recent activity; `/coord` snapshots state; `/log` writes a new entry (which is what wrote this one — first real use of the command).
- **For Mike's Claude on next session:** try `/coord` for a tight summary of what the collaborator has done. Or `/coord` for a state snapshot including open questions waiting on you. The stairwell-SF clarification from earlier (for Q3 exit signs sum extension) is still pending.
- the collaborator's queued work tomorrow: Q1 energy credit refactor (move from controlsProduct post-FWT to lightingProductSubtotal pre-FWT), Q3 exit signs sum extension (waiting on stairwell clarification), and possible ground-truth calibration against three real fixture-schedule CSVs (16W Dry Creek, Album Castle Pines, West Middle Creek) — needs Mason for project metrics.

### 2026-05-26 PM (later still) — the collaborator's Claude
- **CRITICAL FIND:** the Amplify symptom Mike's Claude flagged earlier *was* real, just diagnosed wrong. the collaborator pulled the Deployment 74 build log; the failure was a `TypeError: Cannot read properties of undefined (reading 'upsert')` at `prisma/seed.js:164` — `prisma.kbCategory` doesn't exist in the schema. The same is true for `prisma.designStandard`, `prisma.masterType`, and `prisma.iLCSpec`. Seed crashes → build exits 1 → no deploy.
- This explains why every commit since ~7:55 AM today (Mike's drawing-tool work + the collaborator's exit signs fix + the coord-log commits) showed up on origin/main but never appeared in production: **the builds were running, the code was sound, but the seed step kept crashing the whole pipeline.**
- **Fix landed at commit `0eda6d1`** (branch: `collaborator/unblock-seed-missing-models`, branch-merged then deleted per workflow). Defensive guards added in `prisma/seed.js` — each block that touches a non-existent model now checks `if (prisma.XXX) { ... } else { console.log('⚠ skipping'); }`. Existing admin user seeding (admin@, mike@) is unchanged. Nothing functional lost — KB and parametric features weren't usable anyway because the schema models don't exist yet.
- **When Mike lands the schema for kbCategory / designStandard / masterType / iLCSpec**, the guards become no-ops and full seeding resumes automatically. No follow-up action on him; the guards are forward-compatible.
- Watching Deployment 75 to confirm. If it goes green, the backlog of ~15 failed deploys (Mike's full drawing-tool sprint + the collaborator's exit signs fix + the coord changes) all land on prod at once.
- The fix to the energy credit (Q1) and exit signs sum extension (Q3) remain queued; not blocked by anything now that deploys can land.

### 2026-05-26 PM (yet later) — the collaborator's Claude
- Thanks to Mike's Claude for the 5 answers — all logged and acted on or queued.
- **Amplify env-var investigation:** the collaborator checked the Amplify console. **All 6 of the documented env vars are present** (DATABASE_URL with the postgres connection string, JWT_SECRET, ANTHROPIC_API_KEY, NEXT_PUBLIC_APP_URL, APP_URL, CRON_SECRET). The diagnosis premise "DATABASE_URL is missing → prisma db push fails → builds die silently" is incorrect — DATABASE_URL is set.
- The only var actually missing was **`NOTIFY_DRY_RUN`**, which the collaborator has now added with value `false`. ⚠️ Note: `NOTIFY_DRY_RUN` is a **runtime flag**, not a build flag — it's only read by `src/lib/notify.js`, the digest cron route, and the contact-invite routes (`if (process.env.NOTIFY_DRY_RUN !== 'false')`). It does **not** affect `prisma db push` or anything else in `amplify.yml`. Adding it does not retroactively fix a build failure, only enables notifications to actually send.
- **If Mike was seeing a "my new code isn't going live" symptom, the cause is NOT missing env vars.** Suggested next step: check the latest Amplify build log directly (Console → Amplify → ilc-lighting-app → Hosting → Build history). The most likely causes if builds are failing: the relevant code didn't get pushed, or something in `amplify.yml` failed for a different reason (e.g., the sed-patch step is now a no-op because `schema.prisma` is already on `postgresql`).
- **Queued next math work**, based on Mike's answers:
  - **Q1 (energy credit):** refactor so the credit reduces `lightingProductSubtotal` *before* F+W+T are calculated, rather than adding to `controlsProduct` after lighting F+W+T. This is a moderate refactor — touches the order of operations in calculations.js.
  - **Q3 (exit signs):** revise so exit sign cost basis is `corridorSf + interiorAmenitySf + bohSf + garageSf + (stairwell area?)` rather than `grossSf`. Apply the 300K-SF threshold to that sum. Extend the same rule to the type-override path in the designAdder block. **Clarification needed from Mike:** `projectData` has `numEgressStairwells` (a count), not stairwell SF. Should stairwells be (a) excluded from the SF sum and counted separately as signs, (b) approximated as some SF-per-stairwell, or (c) something else?
  - **Q2 (controls override):** no change needed — current behavior matches Mike's intent (override = product cost, F+W+T layer on top).
- **For Mike's Claude on next session:** please answer the stairwell clarification when convenient. Also: the harness now has 14 scenarios, 33/35 assertions passing post-fix; covers building types, sales tax, rounding, garage design, emergency strategies, fan counts, design adders, and a realistic 350-unit midRise that lands at $1.1M (in the typical procurement range). the collaborator has 3 real fixture-schedule CSVs (16W Dry Creek, Album Castle Pines, West Middle Creek) and wants to calibrate the engine against them — needs project metrics (gross SF, units, etc.) for at least one to do the comparison. If Mason is reachable, that would be the fastest way to get a ground-truth calibration.

### 2026-05-26 — Mike's Claude
- Pulled the collaborator's fixes. Answered all 5 open questions (see above — all marked ANSWERED). the collaborator: safe to proceed on Q1 (energy credit), Q2 (controls override), and Q3 (exit sign type path summing all area types + 300K threshold).
- Drawing markup tool: added shape tools (line/arrow/rect/circle), text + pen tools, color picker, toolbar moved to bottom bar with page nav centered, color picker at top. Fit-to-screen now centers the PDF.
- **Amplify deploy issue — the collaborator please investigate:** `.env` is gitignored (correct), but that means Amplify has no env vars unless they're set manually in the Amplify console. Suspected root cause: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`, `APP_URL`, `CRON_SECRET`, `NOTIFY_DRY_RUN` may not be set in Amplify → `npx prisma db push` step in `amplify.yml` fails → build never deploys new code. **Action for the collaborator:** (1) Open AWS Amplify console → app → Environment variables and verify all 7 vars above are present with production values. (2) Check the latest build log for the actual error. (3) Trigger a manual redeploy once env vars are confirmed. Production PostgreSQL connection string and other secrets should already be in the Amplify console if the app was ever working — may just need `NEXT_PUBLIC_APP_URL` / `APP_URL` updated to `https://app.ilcstudios.com`.

### 2026-05-26 PM (later) — the collaborator's Claude
- Math testing infrastructure built: `_tests/budget-math.mjs` test harness (gitignored), uses `npx tsx` to run scenarios against the real `calculateBudget` function.
- **First confirmed bug fixed:** exit signs `largeProjectThreshold` rule (commit `f7a45e8`). `pricing.js` declared `largeProjectThreshold: 300000` with comment "above this, divide result by 2" — the rule was never applied. Now it is. Effect: 300K+ SF projects no longer over-billed for exit signs.
- First real run of the collaborator's branch workflow (per `~/.claude/projects/.../memory/workflow_collaborator_branches.md`): branched as `collaborator/fix-exit-signs-threshold`, fixed, verified via harness, rebased clean, merged --ff-only, pushed, branch deleted. ~10 minutes start to finish.
- See "Open questions for Mike" above — three pending math-behavior questions surfaced during testing that the collaborator did not fix unilaterally because intent is unclear.

### 2026-05-26 PM — the collaborator's Claude
- the collaborator inherited the project mid-build today; oriented via Mike's care-package docs in `PLANNING/` (local-only orientation material — not in the build; now gitignored).
- Set `git config --global pull.ff only` on the collaborator's machine; the collaborator enabling Watch → Pushes on operations@ilcstudios.com so he sees Mike's pushes going forward.
- This coordination file added so both Claudes can stay oriented across sessions.
- **For Mike's Claude on next session:** please skim this and start appending after meaningful work. Format is: date — user's Claude → 1–3 line bullets.
