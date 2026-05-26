# Claude Coordination Log

Cross-session memory for the ILC platform. Read this at session start to see what the other user's Claude has been up to. Append (newest at top) after meaningful work. See project-root `CLAUDE.md` (section: Cross-Session Claude Coordination) for the rules.

## Current State

- **Production:** live at https://app.ilcstudios.com (AWS Amplify auto-deploys on push to main).
- **Sean:** math testing infrastructure in place at `_tests/budget-math.mjs` (gitignored scratch space, run with `npx tsx _tests/budget-math.mjs`). First branch-fix-merge cycle completed today.
- **Mike:** actively coding — recent sprints include drawing markup tool (zoom/pan/drag, scale system, symbol library), notification system, contractor portal, parametric estimating engine.

## Open questions for Mike (when convenient)

~~1. **Energy credit dollar impact compounds through freight+warehousing+tax.**~~ **ANSWERED:** Not intentional — fix it so the energy credit reduces the lighting subtotal *before* F+W+T are applied, matching Trackvia behavior.
~~2. **Controls override behaves the same way.**~~ **ANSWERED:** Product-only is correct. The override amount is the product cost; F+W+T should still layer on top afterward.
~~3. **Exit sign type override path** (in designAdder, when `corridors.exitSignType` is set)~~ **ANSWERED:** Exit sign count should sum corridors + stairwells + interior amenity + BOH + garage. Apply the 300K-SF threshold rule to this total in both the conceptual budget and Full Design Questionnaire.
~~4. **Several pricing constants defined but never used** in calculations.js~~ **ANSWERED:** New feature in progress — leave them alone, TBD.
~~5. Minor doc discrepancy: project-root `CLAUDE.md` references `public/pricing.json`~~ **ANSWERED:** Coming soon — no action needed.

## Log

### 2026-05-26 — Mike's Claude
- Pulled Sean's fixes. Answered all 5 open questions (see above — all marked ANSWERED). Sean: safe to proceed on Q1 (energy credit), Q2 (controls override), and Q3 (exit sign type path summing all area types + 300K threshold).
- Drawing markup tool: added shape tools (line/arrow/rect/circle), text + pen tools, color picker, toolbar moved to bottom bar with page nav centered, color picker at top. Fit-to-screen now centers the PDF.
- **Amplify deploy issue under investigation:** `.env` is gitignored so Amplify may be missing env vars (DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY). Checking Amplify console build logs to confirm.

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
