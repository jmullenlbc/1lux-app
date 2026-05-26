# Claude Coordination Log

Cross-session memory for the ILC platform. Read this at session start to see what the other user's Claude has been up to. Append (newest at top) after meaningful work. See project-root `CLAUDE.md` (section: Cross-Session Claude Coordination) for the rules.

## Current State

- **Production:** live at https://app.ilcstudios.com and **fully current as of 2026-05-26 PM**. Deployments 75 (`0eda6d1`) and 76 (`518da7d`) both green; the day's backlog of ~20 commits — all of Mike's drawing-tool sprint, Sean's exit signs fix, the coordination updates, NOTIFY_DRY_RUN activation — landed in production at once.
- **Notifications:** **ACTIVE in production** (NOTIFY_DRY_RUN=false set in Amplify, took effect with Deployment 75/76). Digest cron, contact invites, and notify.js helpers are now actually sending.
- **Coordination tooling:** four project-scoped slash commands available in both Claude sessions (`/sean`, `/mike`, `/coord`, `/log` — see `.claude/commands/`). The `/log` command is what wrote this entry — `/log` is now the deliberate-write side of cross-Claude coordination.
- **Sean:** math testing infrastructure in place at `_tests/budget-math.mjs` (gitignored scratch space, run with `npx tsx _tests/budget-math.mjs`). Two real branch-fix-merge cycles completed today (exit signs, seed.js guards). Two math changes still queued from Mike's answers (Q1 energy credit refactor, Q3 exit signs sum + type-override extension).
- **Mike:** drawing-tool sprint work from today is now live in production. Recent sprints include drawing markup tool (zoom/pan/drag, scale system, symbol library, shape + text + pen tools, color picker), notification system, contractor portal, parametric estimating engine.

## Open questions for Mike (when convenient)

~~1. **Energy credit dollar impact compounds through freight+warehousing+tax.**~~ **ANSWERED:** Not intentional — fix it so the energy credit reduces the lighting subtotal *before* F+W+T are applied, matching Trackvia behavior.
~~2. **Controls override behaves the same way.**~~ **ANSWERED:** Product-only is correct. The override amount is the product cost; F+W+T should still layer on top afterward.
~~3. **Exit sign type override path** (in designAdder, when `corridors.exitSignType` is set)~~ **ANSWERED:** Exit sign count should sum corridors + stairwells + interior amenity + BOH + garage. Apply the 300K-SF threshold rule to this total in both the conceptual budget and Full Design Questionnaire.
~~4. **Several pricing constants defined but never used** in calculations.js~~ **ANSWERED:** New feature in progress — leave them alone, TBD.
~~5. Minor doc discrepancy: project-root `CLAUDE.md` references `public/pricing.json`~~ **ANSWERED:** Coming soon — no action needed.

## Log

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
