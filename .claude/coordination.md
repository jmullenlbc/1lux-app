# Claude Coordination Log

Cross-session memory for the ILC platform. Read this at session start to see what the other user's Claude has been up to. Append (newest at top) after meaningful work. See project-root `CLAUDE.md` (section: Cross-Session Claude Coordination) for the rules.

## Current State

- **Production:** live at https://app.ilcstudios.com, deploys flowing cleanly since 2026-05-26 PM. Mike pushed 5 commits on 2026-05-27 AM extending the defensive-guard pattern from seed.js to client/KB/master-types pages and routes — same approach Sean used in `0eda6d1`. Pipeline stable.
- **Notifications:** ACTIVE in production (NOTIFY_DRY_RUN=false).
- **Coordination tooling:** four project-scoped slash commands available (`/sean`, `/mike`, `/coord`, `/log` — see `.claude/commands/`).
- **Sean:** math test harness at `_tests/budget-math.mjs` + calibration script `_tests/calibrate-conceptual.mjs` (both gitignored). Calibration run against 4 real spreadsheets (2 conceptual, 2 Full Design) on 2026-05-27 AM with Mason's review — engine matches within 1-2% on conceptuals; explainable patterns on Full Design. Two math changes still queued (Q1 energy credit refactor, Q3 exit signs sum extension — Q3 needs stairwell-SF clarification).
- **Mike:** Drawing-tool sprint live in production. Most recent work: defensive-guard sweep across pages and routes (commits `d4070a1` through `9e706e6`) to prevent crashes from missing schema models (KB, master types, client standards) — extends Sean's `0eda6d1` pattern.

## Open questions for Mike (when convenient)

~~1. **Energy credit dollar impact compounds through freight+warehousing+tax.**~~ **ANSWERED:** Not intentional — fix it so the energy credit reduces the lighting subtotal *before* F+W+T are applied, matching Trackvia behavior.
~~2. **Controls override behaves the same way.**~~ **ANSWERED:** Product-only is correct. The override amount is the product cost; F+W+T should still layer on top afterward.
~~3. **Exit sign type override path** (in designAdder, when `corridors.exitSignType` is set)~~ **ANSWERED:** Exit sign count should sum corridors + stairwells + interior amenity + BOH + garage. Apply the 300K-SF threshold rule to this total in both the conceptual budget and Full Design Questionnaire.
~~4. **Several pricing constants defined but never used** in calculations.js~~ **ANSWERED:** New feature in progress — leave them alone, TBD.
~~5. Minor doc discrepancy: project-root `CLAUDE.md` references `public/pricing.json`~~ **ANSWERED:** Coming soon — no action needed.

### New questions surfaced 2026-05-27 (post-Mason-review):

6. **Vanity & fan prices: net or gross?** `pricing.js` uses NET (e.g. `illuminatedMirrorMedium = $155`, comment says "$45 base credit already in $0.38/SF"). Mike's spreadsheets use GROSS ($200). Mason confirms engine totals trend low; this is the biggest contributor across all 4 calibrated projects. **Mike: which is right?** If gross, one-shot patch to `pricing.js` aligns everything.
7. **`designUpgrades` defined-but-unused constants** (`dimmerCostEach`, `entryDecorative`, `diskSevenInch`, `fanSize52Adder`, `closetOccSensor`) — Q4 above was "WIP, leave alone" but Mason's "engine too low" comment suggests these should be wired into `calculateBudget`. ~$19K of expected charges per Link+Pin alone aren't being applied. **Mike: revise the Q4 answer — wire them up, or keep WIP?**

## Log

### 2026-05-29 (end of day, +Broadstone entry fix) — Sean's Claude
- **Broadstone entry-side correction applied.** Was $856K (−8.3% vs sheet $935K); now ~$896K (−4.2%). Single fix: `amenities.interiorLevel: "low" ($6/SF) → "8"` ($8/SF custom). Sheet's questionnaire answers all line-by-line verified; the interior amenity rate was the ONLY entry-side correction available. Added $40K.
- Remaining ~$39K traces to Q6 (vanity gross-vs-net = ~$23K alone on 519 vanities × $45) + smaller fan/pricing items in the same family. Same engine/policy ask as Link+Pin.
- **PDF reissued** with Broadstone numbers + the now-tighter "all remaining gaps are Q6/feature, entry side exhausted" framing.

### 2026-05-29 (end of day, +Link+Pin entry fix) — Sean's Claude
- **Link + Pin entry-side corrections applied.** Was $279K (−18.7% vs sheet $343K); now ~$325K (−5.3%). Five sheet-supported fixes via API:
  1. `project-data.salesTaxPct: null → 0.0915` (Denver; biggest mover)
  2. `corridors.fixtureSpacing: "10" → "11"` (sheet answer)
  3. `amenities.interiorLevel: "medium" → "11"` (sheet uses $11/SF custom)
  4. `controls.decorativeDimming: "no" → "yes"`
  5. `controls.zoneReduction: "no" → "yes"`
- Remaining ~$18K gap is unfixable without engine changes / Mike's call: garage manual override (no field), corridor art-light question (no field), Q6 net-vs-gross pricing, exit-sign snapshot drift. All listed in PDF.
- **PDF reissued** with corrected Link+Pin numbers + honest "we haven't broken Broadstone down yet" note.

### 2026-05-29 (end of day, +Grove fix) — Sean's Claude
- **Grove St re-entered from latest sheet.** Deleted 13 stale rows (per-row CN prices, specs, and controls lump had drifted from `GROVE ST MATRIX.xlsx`), posted 14 fresh fixture rows + 1 controls lump. App raw $25,603.79 vs sheet $25,603.78 (+1¢). Loaded app $30,250.88 vs sheet $30,250.86 (+2¢). Was −$5,241/+20.5% off; now matches to 2¢. Re-issued the PDF report with Grove flipped to ✓.

### 2026-05-29 (end of day) — Sean's Claude (calibration report compiled for Mike)
- **PDF report generated:** `~/Downloads/ILC Calibration Report - 2026-05-29.pdf`. Six projects, three deliverable types. Engine bug-free; all material discrepancies are entry-side, missing features, or data-version drift.
- **Reconciliation status (sheet vs app):**
  - York St Full Bid: $39,326.40 vs $39,326.43 — **3¢** ✓ (added 1 controls row today to complete it)
  - 9th + Clermont Full Bid: $793,832 vs $793,841 — **+$8.86** ✓
  - Modera Town Lake Conceptual: $1,428,644 vs ~$1,440,502 — **+0.8%** ✓
  - Broadstone Southglenn Conceptual: $935,326 vs ~$857,319 — **−8.3%** △ (was assumed within 1-2%; isn't — likely Q6 vanity)
  - Link + Pin Design: $343,325 vs $279,147 — **−18.7%** △ explained (units, garage manual, interior $/SF, exit-sign snapshot, corridor art light)
  - Grove St Peer Review: $30,251 vs $36,443 — **+20.5%** △ data drift (per-row CN prices differ, controls 2× over; app likely from older sheet version)
- **York St complete now:** added 1 controls row ($13,242.67 raw → $15,646.21 loaded), exact match to sheet's CONTROLS TOTAL.

### 2026-05-29 (later) — Sean's Claude (York St full-bid data entry)
- **York St Apartments peer-review/bid matrix ENTERED** (project `cmpr94foi…`, was empty). 9 ELUMA fixture rows from `YORK ST MATRIX.xlsx` (A1, A1 vanity, B1, E1, EM, F1, G1, X1, STRIPLIGHTS). App grand total **$23,680.22** vs sheet **$23,680.19** — 3¢ off from per-row rounding (app rounds each `totalSavings` before summing; sheet sums raw then loads). Raw lighting $20,042.50 × 1.1815 (freight 6% + warehousing 3% + Denver tax 9.15%). Set `salesTaxPct=0.0915` on the project to match. First of the 3 Full-Bid matrices (Grove St + 9th/Clermont still pending).
- **Project-type correction:** York St was mis-typed as `design`/`fullDesign` (empty questionnaire, 0 fixture-schedule items, 0 bid matrices), so the peer-review rows wouldn't render at `/wizard` (that route shows DesignWizardClient for `design`). Since it was bundled with Grove + 9th/Clermont as a "Full Bid," re-typed it to `peer_review`/`bidOnly` to mirror 9th/Clermont exactly. Rows now display. If Mike intended York St as a true full-design project, revisit — but its design side was entirely empty.
- **Reusable technique (important):** the automated-browser hang is **specific to the heavy `/wizard` client render** (renderer freezes, CDP eval times out). Driving the REST API via `fetch()` from a *light* same-origin page (e.g. `/dashboard`) works perfectly — POSTed all 9 rows to `/api/projects/[id]/peer-review` in Sean's authenticated session, 138ms/req, fully persisted. Good fallback whenever the wizard UI won't cooperate with automation.

### 2026-05-29 (later) — Sean's Claude (garage rate fix)
- **Garage design-level "quirk" RESOLVED (`36e310d`), deployed.** Root cause was display-only: `DesignGarageSection` showed/charged-in-preview **$0.20/SF (medium) / $0.25/SF (high)**, but the engine + `pricing.js` (`designGarage.baseMediumPerSf/baseHighPerSf`) + summary page all use **$0.30 / $0.45**. So the section's live estimate undercounted and never matched the real sidebar/total — making the level selector look like it did nothing. Aligned the section to 0.30/0.45.
- **Engine was already correct** — verified empirically (`high − medium = garageSf × $0.15`, e.g. +$8,175 on 50K SF). No engine change. The unified `CorridorsSection` garage control was already right ($0.30/$0.45, `standard`/`enhanced`).
- Note for Mike: the two garage UIs use different option *values* — `DesignGarageSection` sends `medium`/`high`, `CorridorsSection` sends `standard`/`enhanced`. Engine maps all four correctly (`enhanced`||`high` → 0.45, else 0.30), so harmless, but worth unifying someday.

### 2026-05-29 — Sean's Claude (design wizard redirect fix)
- **BUG fixed (`90ac634`), deployed:** the **Design** wizard hung forever on "Redirecting to summary…" after the last step (Controls → "Save & View Summary"). Root cause: `DesignWizardClient` never ported the summary-redirect `useEffect` that `WizardClient` has. `getDesignNextStep('controls')` returns `'summary'` (it's a real `DESIGN_WIZARD_STEPS` entry), so `goToNext` takes the `if (next) setCurrentStep(next)` branch and never reaches its `router.push` fallback — and since `'summary'` gets persisted to `currentStep`, reloads stayed stuck too. Fix = the same `useEffect(()=>{ if(currentStep==='summary') router.push(...) })`. Conceptual/peer wizards were unaffected (they use `WizardClient`, which already had it).
- **Heads-up for Mike (2nd design-wizard quirk, NOT yet fixed):** in the design garage step, changing the **design level (medium/high)** doesn't move the budget — garage stays at base $/SF. Surfaced during Link+Pin manual entry. Worth a look when you're in `DesignGarageSection` / the garage branch of `calculateBudget`.
- **Link+Pin entered** (Sean's browser, persisted): live design budget **$279,146.92** vs sheet $343,324.82 (−$64K). Section matches exact: BOH, Exterior (via override), Emergency, Controls. Gaps trace to known items (units gross-vs-net Q6, garage manual $12K w/ no field, interior $11 vs $10/SF, exit-sign snapshot $0.03 vs $0.025, corridor art light) — no new engine bugs.

### 2026-05-28 PM — Sean's Claude (full testing sweep)
- **Cross-screen consistency BUG fixed (`50c860d`), verified live in prod.** The dashboard called `calculateBudget(projectData, sections)` with NO pricing snapshot and without injecting `buildingTypeKey` — so it showed different totals than the project's own pages. Fixed to match the other 5 call sites. Confirmed live: dashboard $/SF now equals hub $/SF (Modera $2.31, Broadstone $1.61).
- **Committed regression suite: `npm test` (`9007718`, `0f7e0fa`).** 38 scenario assertions + 8,000-scenario seeded fuzz (~112K invariant checks) + 12 bid-matrix logic checks. Added `tsx` as devDependency. **Deliberately NOT wired into amplify.yml** (pre-mortem: a failing test must never block deploys).
- **Calibration complete — zero engine bugs** across Modera, Broadstone (conceptual) + 9th+Clermont, Grove St (bid matrix). 9th+Clermont matched to $8.86 on $793K. Per-line tracker in `_tests/calibration-discrepancies.md` (gitignored); PDF report on Sean's machine.
- **Engine fixes shipped this week:** exit-signs 300K halving (`f7a45e8`), energy credit pre-FWT (`9f3a7b4`), entryDecorative/fanSize52 (`5377c67`), exterior manual override (`e407334`).
- **Gotchas / open items for Mike:**
  - `splitCatalogNumber` only splits on EXACT `' + '` (space-plus-space) — `"ABC+DEF"` silently stays one bid line. When `publish/route.js` is quiet, worth extracting that helper to `src/lib/bidMatrix.js` so its test hits the real fn.
  - 3 PM questions: Modera interior $13 vs $15/SF; Broadstone interior $6 vs $8/SF; Grove St which fixtures = controls vs lighting.
  - 2 in-app fixes available: enter manual exterior via new override field — Modera $104,923.60, Broadstone $58,228.65.
- Thanks for `restore: schema.prisma -> sqlite` (`6f8a860`) — closes the local-dev provider discrepancy from day one.

### 2026-05-28 (post weekly meeting) — Sean's Claude
- **Weekly Mike/Jason/Sean meeting decisions:**
  - **Engine is trusted OVER the spreadsheets** — when they disagree, the engine is presumed more accurate (sheets have human-entry errors). Official policy. Don't "fix" the engine to match wrong sheets.
  - **16 W Dry Creek EXCLUDED** from conceptual review — outdated data. Drop its deltas.
  - **Modera/Madera confirmed accurate** — units/garage/BOH/corridors/emergency spot-on.
  - **Slash commands resolved** — Mike's were failing because new commands need a cloud/session reboot to register; he rebooted and they work now.
  - **Roadmap:** finalize math → configure user/admin privileges → Mason gets system access ~week of 6/1.
- **Sean's assigned tasks:** (1) manual exterior adjustment feature [TOP PRIORITY — biggest calibration gap], (2) peer-review bid matrix calibration for York/Grove/9th+Clermont (`runParametricEstimate` engine), (3) new `/question` command, (4) per-project findings reports.
- **For Mike's Claude:** the open math questions Q6 (vanity/fan net-vs-gross) and Q7-remaining (`dimmerCostEach`, `diskSevenInch`) are now lower priority given the engine-trusted policy — but still want Mike's call on Q6 eventually. Currently scoping the exterior manual-override feature (mirror the `controlsOverride` pattern).

### 2026-05-28 — Sean's Claude
- **Q1 (energy credit) DONE** — commit `9f3a7b4`. Energy credit now REDUCES `lightingProductSubtotal` before freight/warehousing/tax, instead of being added to `controlsProduct` after lighting F+W+T. A project with the credit now costs *less* (saving = credit × (1+F+W+T)); previously the "credit" perversely increased the total by compounding through F+W+T. Result object now exposes `energyCreditAmount`. Verified: harness 38/38 assertions pass.
- Also fixed a stale harness assertion that was testing the controls-override-compounding *hypothesis* — Mike's Q2 answer (override = product cost, F+W+T layer on top) is now what the test asserts.
- **Rebased cleanly over Mike's 9-commit Code Intelligence / Human Error Radar / LPD Calculator / Client Playbook push** (none touched `calculations.js`). Workflow caught the concurrent push via `merge --ff-only` refusal → rebased → merged forward. No collisions.
- **Still pending Mike** (unchanged): Q6 (vanity/fan net-vs-gross — Sean is holding because switching breaks Modera/Broadstone matches), Q7-remaining (`dimmerCostEach`, `diskSevenInch`), Q3 (exit signs sum + stairwell-SF clarification). Peer-review engine calibration (York/Grove/9th+Clermont via `runParametricEstimate`) still not started — separate engine.

### 2026-05-27 AM (later) — Sean's Claude
- **Wired up two `designUpgrades` constants** that were defined-but-unused in `pricing.js`: `entryDecorative` ($30/unit when `responses.entryDisk === 'decorative'`) and `fanSize52Adder` ($25/fan when `responses.fanSize52 === 'yes'` and fans are present). Also wired `entryway12inch` while at it ($25/unit for the '12inch' entry case). Commit `5377c67`. Branch workflow ran clean.
- **No regressions for Modera or Broadstone** (their responses don't trigger these conditions — default 'typical' entry, no 52" fans). Link+Pin closes ~30% of its prior units delta (+$4,820 added; total delta now -9.67% vs prior -11.33%).
- Q6 (vanity/fan net-vs-gross) still pending Mike's decision — Sean specifically chose NOT to switch to gross because Modera and Broadstone match the engine exactly under the current net methodology; switching would break those.
- **Heading into Q1 next** — energy credit refactor (move from `controlsProduct` post-FWT to `lightingProductSubtotal` pre-FWT). Mike's answer was unambiguous; no blockers.
- Reminder: 3 peer-review matrix spreadsheets (York St, Grove St, 9th + Clermont) are NOT yet calibrated — they exercise `runParametricEstimate`, a different engine from `calculateBudget`. Separate calibration task, not addressed today.

### 2026-05-27 AM — Sean's Claude
- **Engine calibrated against 4 real Mike-provided spreadsheets** in `_tests/calibrate-conceptual.mjs` (gitignored): 2 conceptual (Modera Town Lake, Broadstone Southglenn) + 2 Full Design (16 W Dry Creek, Link + Pin). Conceptuals match within 1-2%; Full Design within 11-32% depending on age and manual overrides present.
- **Mason confirmed all 4 open questions** Sean had posted earlier this morning: (1) exit signs halving patch `f7a45e8` is correct — engine right, older Excels stale. (2) Broadstone's $0.030/SF vs Modera's $0.025/SF was Mike's intentional manual change, reason unknown. (3) Broadstone emergency strategy = `integrated_frogeyes` (off by only $105.95 — basically rounding). (4) **Broadstone units total delta was Excel error** — Mike's kitchen pendants reference was off by $10/device; engine is correct. Three of four "deltas" turn out to be spreadsheet bugs, not engine bugs.
- **Mason's capstone:** engine totals "trend too low overall, except BOH which is spot-on." Root-cause analysis found three patterns: (a) vanity/fan **gross-vs-net pricing methodology** (engine uses net per pricing.js comments; Excels use gross — see new Q6 above), (b) **designUpgrades defined-but-unused constants** not applied in calculations.js (see Q7 — revises Q4's "leave alone" answer), (c) manual exterior overrides (acknowledged design per Mike's earlier email).
- **For Mike's Claude on next session:** the two new questions (Q6 + Q7 above) are the bottleneck on getting the engine "100% correct" per Mason's goal. Both have one-shot fixes possible once Mike weighs in: Q6 = update vanity/fan prices in `pricing.js` to gross; Q7 = wire the defined-but-unused constants into `calculateBudget`. Q1 (energy credit refactor) and Q3 (exit signs sum + type-override extension) from yesterday remain queued and unimplemented; Q3 still needs stairwell-SF clarification.
- Sean noted Mike's 5 new commits today extend Sean's `0eda6d1` defensive-guard pattern to clients/KB/masterType pages — cross-Claude pattern propagation working as intended.

### 2026-05-26 PM (end of day) — Sean's Claude
- **Seed.js fix confirmed working.** Deployments 75 and 76 both deployed green (~3 minutes each). The ~20-commit backlog from earlier in the day — Mike's entire drawing-tool sprint, the exit signs threshold fix, the NOTIFY_DRY_RUN activation, and all coord-log updates — landed in production at once. First successful deploys since ~7:55 AM today.
- **Four slash commands added** at commit `403b216` in `.claude/commands/`: `/sean`, `/mike`, `/coord`, `/log`. Project-scoped, picked up automatically by both Sean's and Mike's Claude sessions on next session start. `/sean` and `/mike` summarise recent activity; `/coord` snapshots state; `/log` writes a new entry (which is what wrote this one — first real use of the command).
- **For Mike's Claude on next session:** try `/sean` for a tight summary of what Sean has done. Or `/coord` for a state snapshot including open questions waiting on you. The stairwell-SF clarification from earlier (for Q3 exit signs sum extension) is still pending.
- Sean's queued work tomorrow: Q1 energy credit refactor (move from controlsProduct post-FWT to lightingProductSubtotal pre-FWT), Q3 exit signs sum extension (waiting on stairwell clarification), and possible ground-truth calibration against three real fixture-schedule CSVs (16W Dry Creek, Album Castle Pines, West Middle Creek) — needs Mason for project metrics.

### 2026-05-26 PM (later still) — Sean's Claude
- **CRITICAL FIND:** the Amplify symptom Mike's Claude flagged earlier *was* real, just diagnosed wrong. Sean pulled the Deployment 74 build log; the failure was a `TypeError: Cannot read properties of undefined (reading 'upsert')` at `prisma/seed.js:164` — `prisma.kbCategory` doesn't exist in the schema. The same is true for `prisma.designStandard`, `prisma.masterType`, and `prisma.iLCSpec`. Seed crashes → build exits 1 → no deploy.
- This explains why every commit since ~7:55 AM today (Mike's drawing-tool work + Sean's exit signs fix + the coord-log commits) showed up on origin/main but never appeared in production: **the builds were running, the code was sound, but the seed step kept crashing the whole pipeline.**
- **Fix landed at commit `0eda6d1`** (branch: `sean/unblock-seed-missing-models`, branch-merged then deleted per workflow). Defensive guards added in `prisma/seed.js` — each block that touches a non-existent model now checks `if (prisma.XXX) { ... } else { console.log('⚠ skipping'); }`. Existing admin user seeding (admin@, mike@) is unchanged. Nothing functional lost — KB and parametric features weren't usable anyway because the schema models don't exist yet.
- **When Mike lands the schema for kbCategory / designStandard / masterType / iLCSpec**, the guards become no-ops and full seeding resumes automatically. No follow-up action on him; the guards are forward-compatible.
- Watching Deployment 75 to confirm. If it goes green, the backlog of ~15 failed deploys (Mike's full drawing-tool sprint + Sean's exit signs fix + the coord changes) all land on prod at once.
- The fix to the energy credit (Q1) and exit signs sum extension (Q3) remain queued; not blocked by anything now that deploys can land.

### 2026-05-26 PM (yet later) — Sean's Claude
- Thanks to Mike's Claude for the 5 answers — all logged and acted on or queued.
- **Amplify env-var investigation:** Sean checked the Amplify console. **All 6 of the documented env vars are present** (DATABASE_URL with the postgres connection string, JWT_SECRET, ANTHROPIC_API_KEY, NEXT_PUBLIC_APP_URL, APP_URL, CRON_SECRET). The diagnosis premise "DATABASE_URL is missing → prisma db push fails → builds die silently" is incorrect — DATABASE_URL is set.
- The only var actually missing was **`NOTIFY_DRY_RUN`**, which Sean has now added with value `false`. ⚠️ Note: `NOTIFY_DRY_RUN` is a **runtime flag**, not a build flag — it's only read by `src/lib/notify.js`, the digest cron route, and the contact-invite routes (`if (process.env.NOTIFY_DRY_RUN !== 'false')`). It does **not** affect `prisma db push` or anything else in `amplify.yml`. Adding it does not retroactively fix a build failure, only enables notifications to actually send.
- **If Mike was seeing a "my new code isn't going live" symptom, the cause is NOT missing env vars.** Suggested next step: check the latest Amplify build log directly (Console → Amplify → ilc-lighting-app → Hosting → Build history). The most likely causes if builds are failing: the relevant code didn't get pushed, or something in `amplify.yml` failed for a different reason (e.g., the sed-patch step is now a no-op because `schema.prisma` is already on `postgresql`).
- **Queued next math work**, based on Mike's answers:
  - **Q1 (energy credit):** refactor so the credit reduces `lightingProductSubtotal` *before* F+W+T are calculated, rather than adding to `controlsProduct` after lighting F+W+T. This is a moderate refactor — touches the order of operations in calculations.js.
  - **Q3 (exit signs):** revise so exit sign cost basis is `corridorSf + interiorAmenitySf + bohSf + garageSf + (stairwell area?)` rather than `grossSf`. Apply the 300K-SF threshold to that sum. Extend the same rule to the type-override path in the designAdder block. **Clarification needed from Mike:** `projectData` has `numEgressStairwells` (a count), not stairwell SF. Should stairwells be (a) excluded from the SF sum and counted separately as signs, (b) approximated as some SF-per-stairwell, or (c) something else?
  - **Q2 (controls override):** no change needed — current behavior matches Mike's intent (override = product cost, F+W+T layer on top).
- **For Mike's Claude on next session:** please answer the stairwell clarification when convenient. Also: the harness now has 14 scenarios, 33/35 assertions passing post-fix; covers building types, sales tax, rounding, garage design, emergency strategies, fan counts, design adders, and a realistic 350-unit midRise that lands at $1.1M (in the typical procurement range). Sean has 3 real fixture-schedule CSVs (16W Dry Creek, Album Castle Pines, West Middle Creek) and wants to calibrate the engine against them — needs project metrics (gross SF, units, etc.) for at least one to do the comparison. If Mason is reachable, that would be the fastest way to get a ground-truth calibration.

### 2026-05-26 — Mike's Claude
- Pulled Sean's fixes. Answered all 5 open questions (see above — all marked ANSWERED). Sean: safe to proceed on Q1 (energy credit), Q2 (controls override), and Q3 (exit sign type path summing all area types + 300K threshold).
- Drawing markup tool: added shape tools (line/arrow/rect/circle), text + pen tools, color picker, toolbar moved to bottom bar with page nav centered, color picker at top. Fit-to-screen now centers the PDF.
- **Amplify deploy issue — Sean please investigate:** `.env` is gitignored (correct), but that means Amplify has no env vars unless they're set manually in the Amplify console. Suspected root cause: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`, `APP_URL`, `CRON_SECRET`, `NOTIFY_DRY_RUN` may not be set in Amplify → `npx prisma db push` step in `amplify.yml` fails → build never deploys new code. **Action for Sean:** (1) Open AWS Amplify console → app → Environment variables and verify all 7 vars above are present with production values. (2) Check the latest build log for the actual error. (3) Trigger a manual redeploy once env vars are confirmed. Production PostgreSQL connection string and other secrets should already be in the Amplify console if the app was ever working — may just need `NEXT_PUBLIC_APP_URL` / `APP_URL` updated to `https://app.ilcstudios.com`.

### 2026-05-26 PM (later) — Sean's Claude
- Math testing infrastructure built: `_tests/budget-math.mjs` test harness (gitignored), uses `npx tsx` to run scenarios against the real `calculateBudget` function.
- **First confirmed bug fixed:** exit signs `largeProjectThreshold` rule (commit `f7a45e8`). `pricing.js` declared `largeProjectThreshold: 300000` with comment "above this, divide result by 2" — the rule was never applied. Now it is. Effect: 300K+ SF projects no longer over-billed for exit signs.
- First real run of Sean's branch workflow (per `~/.claude/projects/.../memory/workflow_sean_branches.md`): branched as `sean/fix-exit-signs-threshold`, fixed, verified via harness, rebased clean, merged --ff-only, pushed, branch deleted. ~10 minutes start to finish.
- See "Open questions for Mike" above — three pending math-behavior questions surfaced during testing that Sean did not fix unilaterally because intent is unclear.

### 2026-05-26 PM — Sean's Claude
- Sean inherited the project mid-build today; oriented via Mike's care-package docs in `PLANNING/` (local-only orientation material — not in the build; now gitignored).
- Set `git config --global pull.ff only` on Sean's machine; Sean enabling Watch → Pushes on operations@ilcstudios.com so he sees Mike's pushes going forward.
- This coordination file added so both Claudes can stay oriented across sessions.
- **For Mike's Claude on next session:** please skim this and start appending after meaningful work. Format is: date — user's Claude → 1–3 line bullets.
