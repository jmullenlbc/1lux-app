# Manny — task queue & session orientation

This file is read by the `/formanuel` slash command at session start.
Sean and Sean's Claude maintain it. Manny does not edit it.

## Who Manny is

- **Manuel San Ramon** — part-time on the ILC team (~10 hr/week)
- Role: developer focused on small well-scoped fixes and code-hygiene cleanup
- Reviewer: Sean. Manny opens PRs on `manny/*` branches; Sean reviews and merges.
- AI tooling: Claude Pro for chat, Claude Code in the terminal for actual work

## Operating convention for Manny's sessions

When Manny opens a session:

1. Greet him by name. Confirm what he was working on by checking the **Active tasks** section below and the latest commits on `manny/*` branches.
2. If there's an active task, propose to resume it. Don't restart from zero — pick up where the branch and the commits left off.
3. Tell Claude what to do; Claude handles git, tests, and pushes. Manny reviews proposed changes and approves.
4. Open a PR when the work is ready for Sean's review. Never push to `main` without Sean's explicit say-so.
5. Pre-push hooks are sacred. If they fail, fix the underlying issue. Never bypass with `--no-verify`.

---

## Active tasks

_No active tasks. All five PRs merged to main on 2026-06-24. Await new tasks from Sean._

---

## Manual testing checklist (PRs 1–5)

Sean needs confirmation these work in the browser before closing them out. Use **"THE APPROACH (SEAN'S)"** project on the live site (`app.ilcstudios.com`). Run `npm run dev:3000` locally if you prefer.

1. **Dirty tracking** — open any wizard section, change nothing, hit Save. Check the Activity tab. You should see at most a "no changes detected" entry — not a full re-save of every field.

2. **Old→new in activity log** — in any wizard section, change exactly one answer and save. Activity tab should show `Updated **Field**: old → new`. Change two fields in one save — should fall back to the summarized format.

3. **Section manual adders (questionnaire sections)** — open Units. Scroll to the bottom of the section, enter `5000` in the Manual Adder field, save. Open the Summary page — Units line item should be $5,000 higher and show a "Manual adder" detail line. Clear it back to zero when done. Repeat a spot-check on Corridors and Emergency.

4. **Section manual adders (Project Data)** — open the Project Data wizard step. Scroll to "Section Adders" at the bottom. Enter `3000` in BOH manual adder, save. Summary should reflect it. Clear when done.

5. **Activity feed filters** — Activity tab. Try the Module dropdown (pick "Budgets (Questionnaire)"), the User dropdown, and the date range inputs. Each should narrow the list. Clear Filters button should restore it.

6. **Budget change history** — Summary page, scroll to the bottom. Should see a "Budget Change History" section listing recent saves with date, user, and description.

---

## Completed tasks (Tasks 3–5)

### Task 3: Activity feed filtering

- **Branch:** `manny/activity-feed-filters`
- **Why:** Mike asked for this on 2026-06-22. The activity feed on every project's Activity tab shows a flat list of everything that ever happened — no way to filter by module, user, or date. As projects grow, this becomes noisy. Mason needs to be able to search "what changed in the budget?" without scrolling through file uploads.
- **File:** `src/components/ProjectActivityFeed.jsx` (291 lines — read this in full first)
- **What to build:** Add three filter controls above the activity list:
  1. **Module / tab** — a dropdown populated from the existing `TAB_LABELS` map in `src/lib/activity.js`, plus entries for `questionnaire` (Budget Wizard) and `project_data` (Project Data). When selected, only show activity entries whose `type` matches.
  2. **User** — a dropdown built from the unique `userName` / `userEmail` values in the fetched activity list. When selected, only show that user's entries.
  3. **Date range** — two date inputs (From / To). Filter entries by `createdAt`. Both optional — leaving blank means no date filter.
- **Filtering is client-side.** The activity feed already fetches all entries. Just filter the in-memory array before rendering. No API changes.
- **UI pattern:** look at how other filter UIs in the app work (e.g., `src/app/(app)/admin/qc/QcBoardClient.jsx` has a simple status filter). Match the style.
- **Acceptance:** On the Activity tab, selecting "Budgets" from the module dropdown shows only budget-related entries. Selecting a user shows only their entries. Date range narrows further. Clearing all filters restores full list. Existing display behavior (icons, timestamps, bold text) unchanged.
- **Time estimate:** ~2–3 hours.
- **Start with:** Read `ProjectActivityFeed.jsx` end-to-end. Then add state for the three filters, add the filter UI above the list, then apply the filter logic to the rendered items.

---

### Task 4: Old → new values in activity descriptions (do after Task 3 ships)

- **Branch:** `manny/activity-old-new-values`
- **Why:** Mike asked for "more specificity of what the change was" — currently a budget wizard save says "Updated **Disk Type** in Residential Units · Conceptual Budget" but not what it changed FROM or TO. Mike wants to see the actual change, like Google Sheets does.
- **Files to touch:**
  - `src/lib/activity.js` — update `diffResponses()` and `describeQuestionnaireChange()`
  - `src/app/api/projects/[id]/responses/route.js` — the questionnaire save endpoint
  - `src/app/api/projects/[id]/data/route.js` — the project data save endpoint
- **What to build:**
  1. Update `diffResponses()` to return `{ key, label, oldVal, newVal }` objects instead of just labels.
  2. Update `describeQuestionnaireChange()` to use old/new values when exactly 1 field changed: "Updated **Disk Type**: Flat Edge-Lit → Backlit Rounded · Residential Units · Conceptual Budget". When multiple fields changed, keep the current summarized format.
  3. For project data changes (`data/route.js`), the existing `changedFields` metadata already captures what changed. Update the description string to include old → new for single-field changes.
- **Don't touch the DB schema.** The `metadata` JSON column already stores extra info — if you want to store old/new values for future display, put them there. But the description string itself is what shows in the feed.
- **Acceptance:** Saving a single questionnaire answer shows "Updated **[Field]**: [old] → [new]" in the Activity tab. Saving multiple fields still shows the summarized "Updated N answers" format. Pre-push hooks pass (including `npm test`).
- **Time estimate:** ~2–3 hours.
- **Start with:** Read `src/lib/activity.js` carefully — `diffResponses()` and `describeQuestionnaireChange()` are the core. Then trace how `responses/route.js` calls them. Make the change there first, test it manually in dev, then apply the same pattern to `data/route.js`.

---

### Task 5: Inline budget history on the Summary page (bonus — do if Tasks 3 and 4 are both shipped)

- **Branch:** `manny/summary-budget-history`
- **Why:** Mike wants Mason to be able to look at the bottom of the budget summary and see "what changed in this budget?" without navigating away to the Activity tab.
- **What to build:** At the bottom of `src/app/(app)/project/[id]/summary/page.jsx`, after the questionnaire responses block, add a "Budget change history" section. It should:
  - Fetch activity entries for this project filtered to types `questionnaire` and `project_data` (these are the budget-affecting changes)
  - Show the 10 most recent, newest first
  - Columns: date + time, user name, description
  - Include a "View all in Activity tab →" link
- **How to fetch:** The Summary page is a server component. You can query `prisma.projectActivity` directly there — same pattern as the project and responses queries already in the page. Filter: `where: { projectId: params.id, type: { in: ['questionnaire', 'project_data'] } }, orderBy: { createdAt: 'desc' }, take: 10`.
- **Don't add a new API route** — query Prisma directly in the server component.
- **Acceptance:** The Summary page shows a "Budget change history" section. It lists up to 10 recent budget-affecting changes. Clicking "View all" takes you to the Activity tab. Print output hides this section (`print:hidden`). Pre-push hooks pass.
- **Time estimate:** ~1–2 hours (mostly a read + display task, the data model is already there).

---

## Orientation / training (read these during your first session or between tasks)

These aren't code tasks — they're understanding exercises. Do them once; they'll make every future task faster.

### 1. Read the activity system end-to-end (~20 min)
Read `src/lib/activity.js` in full. Then find 3 places where `logActivity()` is called (`src/app/api/projects/[id]/responses/route.js`, `src/app/api/projects/[id]/data/route.js`, and `src/app/api/projects/[id]/route.js`). For each call site, understand: what type is being logged, what the description string is, and what metadata is being stored. This will make Tasks 3 and 4 much clearer before you touch any code.

### 2. Run the test suite and read it (~15 min)
Run `npm test` from the repo root. It should pass (38 scenario tests + ~112K fuzz checks + 12 bid-matrix checks). While it runs, open `tests/budget-math.mjs` and read through 5–10 of the test scenarios. This gives you a feel for the budget math and what's considered correct. Don't modify it — just read it.

### 3. Read the coordination log (~10 min)
Read `.claude/coordination.md` (the cross-team log). Start from the June 2026 entries and read backwards until you've covered the last 2 months. This gives you the project history — what broke, what was fixed, what decisions were made — faster than any other source.

### 4. Explore one real project in dev (~15 min)
Run `npm run dev:3000`. Log in as `admin@ilcstudios.com` (password in the repo's CLAUDE.md). Open "THE APPROACH (SEAN'S)" — the canonical reference project. Go to the Budget tab, step through a wizard section, then view the Summary page, then check the Activity tab. This gives you a concrete feel for what you're building on top of.

---

## Recent guidance from Sean

- **(2026-06-23)** Tasks 1 (wizard dirty-tracking) and Task 2 (section manual adders) — both complete. Great work. PRs should be open and waiting for review.
- **(2026-06-23)** PDFs (conceptual budget print, design budget print, bid matrix print) — these are Sean's responsibility, not Manny's. Don't overlap with this work.
- **(2026-06-23)** Model tip: Haiku 4.5 is fine for mechanical tasks (reading files, editing patterns, git operations). Switch to Sonnet when you hit a decision point or something isn't working after two tries.
- **(2026-06-22)** Engine validation complete — APPROACH II ($501K) within 2.3% of source sheet. Engine math is trusted; do not touch `src/lib/calculations.js` unless a task explicitly asks you to.
- **(2026-06-22)** Server-side preserve-on-blank guard shipped in `896ded1`. Manny's dirty-tracking task layers the form-side fix on top — the server guard stays as belt-and-suspenders.

---

## Completed tasks (for reference)

- **Task 1: Wizard dirty-field tracking** — merged to main 2026-06-24. Branch: `manny/wizard-dirty-tracking`.
- **Task 2: Section manual adders** — merged to main 2026-06-24. Branch: `manny/section-manual-adders`.
- **Task 3: Activity feed filters** — merged to main 2026-06-24. Branch: `manny/activity-feed-filters`.
- **Task 4: Old→new values in activity descriptions** — merged to main 2026-06-24. Branch: `manny/activity-old-new-values`.
- **Task 5: Budget change history on Summary page** — merged to main 2026-06-24. Branch: `manny/summary-budget-history`.
