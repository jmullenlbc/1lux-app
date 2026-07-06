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

> **Note (2026-07-06):** Mike pushed a major deploy that merged the Deal model into Project.
> `DealCard`, `DealDrawer`, and the activities API are all gone. Tasks 6–9 below are
> rewritten against the new model. The pipeline entity is now `Project`. All pipeline
> state lives on `Project` fields: `procurementStage`, `procurementStatus`, `designStage`,
> `designStatus`, `contractValue`, `designContractValue`. Status values: `OPEN`, `WON`,
> `LOST`, `COMPLETED`, `ABANDONED`. The existing `PipelineSummary` component (line 150 of
> `CRMClient.jsx`) already shows 5 stats chips — don't replace it, enhance it.

---

### Task 6: CRM "Needs Attention" filter

- **Branch:** `manny/crm-needs-attention`
- **Why:** Mike needs a one-click view of every open project that hasn't been touched in 30+ days so nothing slips through the cracks.
- **File:** `src/app/(app)/crm/CRMClient.jsx`
- **Key architecture facts before you start:**
  - The pipeline entity is now `Project` (not `Deal`). State array is `projects`.
  - Active pipeline is tracked with the `pipeline` state (`'PROCUREMENT'` or `'DESIGN'`).
  - Current pipeline's status field: `project[statusFieldFor(pipeline)]` — returns `procurementStatus` or `designStatus`. Both imported from `@/lib/pipeline` (already at top of file).
  - Valid statuses: `'OPEN'`, `'WON'`, `'LOST'`, `'COMPLETED'`, `'ABANDONED'`.
  - There is **no** `daysSince()` function in this file — you need to add one.
  - Staleness is based on `project.updatedAt` (no activities array on projects).
  - The `filtered` useMemo is at **line 294**. The filter controls render at lines **371–391** inside the header `<div>`.
- **What to build:**
  1. Add a `daysSince(dateStr)` helper **outside the component** near the other formatters (~line 37):
     ```js
     function daysSince(dateStr) {
       if (!dateStr) return 999;
       return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
     }
     ```
  2. Add a `needsAttention` boolean state inside `CRMClient` (default `false`).
  3. Add a `needsAttentionFiltered` derived value (via `useMemo`) that computes the attention list:
     ```js
     const needsAttentionFiltered = useMemo(() => {
       const sf = statusFieldFor(pipeline);
       return projects
         .filter(p => inBoard(p) && p[sf] === 'OPEN' && daysSince(p.updatedAt) >= 30)
         .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt)); // most stale first
     }, [projects, pipeline]);
     ```
  4. Add a "Needs Attention" button in the filter row (lines 371–391), after the status pills. Style: amber outline normally; filled amber (`bg-amber-500 text-white`) when active. Show the count when > 0: `⚠ Needs Attention (3)`.
  5. When `needsAttention` is `true`: render `needsAttentionFiltered` instead of `filtered`, and force `viewMode` to `'list'` (override the view-mode variable, don't call `setViewMode`).
  6. Clicking again sets `needsAttention` to `false`, restoring the normal `filtered` list and freeing `viewMode`.
- **What NOT to touch:** `ProjectCard` internals, any API routes, the `filtered` useMemo logic, the `PipelineSummary` component.
- **Acceptance:** Clicking "Needs Attention" shows only open projects in the current pipeline that haven't been updated in 30+ days, sorted most-stale first, in list view. Clicking again restores normal state. Switching the PROCUREMENT/DESIGN pipeline tab while Needs Attention is on re-runs the filter for the new pipeline. Pre-push hooks pass.
- **Time estimate:** ~2 hours.
- **Start with:** Read `CRMClient.jsx` top-to-bottom (~420+ lines). Map the `projects` state, `pipeline`, `filtered` useMemo, `viewMode`, and the header JSX before writing a single line. Then add `daysSince`, then `needsAttention` state, then the derived list, then the button.

---

### Task 7: Enhance the existing pipeline stats bar

- **Branch:** `manny/crm-stats-enhance`
- **Why:** The `PipelineSummary` component already exists and shows 5 stats — but it's missing a "Needs Attention" count (the most actionable number) and shows "Won all time" instead of the more useful "Won this month."
- **File:** `src/app/(app)/crm/CRMClient.jsx` — the `PipelineSummary` component at **line 150**
- **What to build:** Two changes to `PipelineSummary`:
  1. **Replace "Won (all time)"** with **"Won this month"** — change the filter from `p[sf] === 'WON'` to `p[sf] === 'WON' && daysSince(p.updatedAt) <= 30`. Update the label to `'Won (30 days)'`.
  2. **Add a "Needs Attention" chip** — count of open projects in the current pipeline where `daysSince(p.updatedAt) >= 30`. Color it amber when > 0, grey when 0:
     ```js
     const stale = open.filter(p => daysSince(p.updatedAt) >= 30);
     // Add to stats array:
     { label: 'Needs Attention', value: stale.length, color: stale.length > 0 ? 'text-amber-600' : 'text-slate-400' }
     ```
  `PipelineSummary` already receives `projects` (already filtered to the current pipeline's board members) and `pipeline` as props — no new props needed.
  **Note:** `daysSince()` is added by Task 6. If you do Task 7 first, add `daysSince()` yourself in this file (same definition as in Task 6 spec). Either way, it must exist only once in the file.
- **What NOT to change:** Don't add API calls. Don't restructure `PipelineSummary`. Don't touch `ProjectCard` or the main state.
- **Acceptance:** Stats bar shows 6 chips. "Needs Attention" chip is amber when > 0. "Won (30 days)" replaces "Won (all time)". Counts update when the pipeline tab switches. Pre-push hooks pass.
- **Time estimate:** ~1 hour.
- **Start with:** Read `PipelineSummary` (lines 150–176). Understand how it builds the `stats` array from the `projects` prop. Then apply the two changes.

---

### Task 8: Morning Brief page (do after Tasks 6 and 7 ship)

- **Branch:** `manny/crm-morning-brief`
- **Why:** Mike needs a single-page daily overview — stale projects, pipeline counts by stage, recent wins — without clicking through the kanban. This is the "what do we need to do today?" view.
- **Files to create:**
  - `src/app/(app)/crm/brief/page.jsx` — server component; **must include `export const dynamic = 'force-dynamic'`**
  - `src/app/(app)/crm/brief/BriefClient.jsx` — client display component (`'use client'` at top)
- **Key architecture facts:**
  - Pipeline entity is `Project`, not `Deal`. Use `prisma.project` everywhere.
  - Status field per pipeline: `procurementStatus` for procurement, `designStatus` for design.
  - Valid status values: `'OPEN'`, `'WON'`, `'LOST'`, `'COMPLETED'`, `'ABANDONED'`.
  - Stage fields: `procurementStage`, `designStage`.
  - You can import `PIPELINE_STAGES`, `stageFieldFor`, `statusFieldFor` from `@/lib/pipeline` — this file is SSR-safe (no `'use client'`, no React imports).
  - Model the page's data fetching on `src/app/(app)/crm/page.jsx` — same auth pattern, same Prisma import.
- **What to build:** Three sections:
  1. **Needs Attention** — top 10 open projects not updated in 30+ days. Prisma query:
     ```js
     const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
     const stale = await prisma.project.findMany({
       where: {
         OR: [{ procurementStatus: 'OPEN' }, { designStatus: 'OPEN' }],
         updatedAt: { lt: thirtyDaysAgo },
       },
       orderBy: { updatedAt: 'asc' },
       take: 10,
       select: {
         id: true, name: true, procurementStage: true, designStage: true,
         procurementStatus: true, designStatus: true, updatedAt: true,
         client: { select: { name: true } },
       },
     });
     ```
     Display: table with columns Project, Client, Stage, Days since update. If empty: green "All caught up — no stale open projects."
  2. **Pipeline snapshot** — open project count per stage for each pipeline. Two separate `groupBy` calls:
     ```js
     const procSnapshot = await prisma.project.groupBy({
       by: ['procurementStage'],
       where: { procurementStatus: 'OPEN' },
       _count: { id: true },
     });
     const designSnapshot = await prisma.project.groupBy({
       by: ['designStage'],
       where: { designStatus: 'OPEN' },
       _count: { id: true },
     });
     ```
     Display: two side-by-side tables (Procurement | Design), each with Stage | Count columns. Use `PIPELINE_STAGES` from `@/lib/pipeline` to set the stage order and labels.
  3. **Won last 30 days** — projects that became Won recently:
     ```js
     const recentWins = await prisma.project.findMany({
       where: {
         OR: [{ procurementStatus: 'WON' }, { designStatus: 'WON' }],
         updatedAt: { gte: thirtyDaysAgo },
       },
       orderBy: { updatedAt: 'desc' },
       select: { id: true, name: true, procurementStatus: true, designStatus: true, updatedAt: true, client: { select: { name: true } } },
     });
     ```
     Display: list with project name, client, which pipeline(s) won, date.
  Fetch all three with `Promise.all`. Pass as props to `BriefClient`.
  **Add a "Brief →" link** in `CRMClient.jsx`'s header (near the "New Project" button, lines 359–368) pointing to `/crm/brief`.
- **Acceptance:** `/crm/brief` loads without errors. Three sections render. `force-dynamic` present. Auth gates the page (model on `crm/page.jsx`). "Brief →" link appears on the CRM header. Pre-push hooks pass.
- **Time estimate:** ~3–4 hours.
- **Start with:** Read `src/app/(app)/crm/page.jsx` in full (it's the model for this page's structure). Then create `brief/page.jsx` first (data fetching), then `brief/BriefClient.jsx` (display).

---

### Task 9: Project quick-note from the kanban card (do after Tasks 6–8 ship)

- **Branch:** `manny/crm-project-quicknote`
- **Why:** Adding a note to a project currently requires navigating into the project. A one-line note right on the pipeline card is low-friction enough that it'll actually get used for quick "just called them" entries.
- **File:** `src/app/(app)/crm/CRMClient.jsx` — modify the `ProjectCard` component at **line 41**
- **Notes API — read this before writing anything:**
  Route: `POST /api/crm/notes`
  Minimal body to create a project-linked note:
  ```js
  {
    noteBody: "the note text",
    projectIds: ["project-id-here"],  // links the note to this project
    title: "",
    meetingDate: null,
    attendees: "[]",
    calendarRef: null,
    clientIds: [],
    activityType: null,
    contactIds: [],
  }
  ```
  On success: `201 Created`. On error: `4xx` with `{ error: "..." }` JSON.
- **What to build:** At the very bottom of `ProjectCard`'s returned JSX:
  1. A small `＋ Note` text link (low visual weight — `text-xs text-slate-400 hover:text-slate-600`).
  2. On click: reveal a single-line `<input>` + "Save" button + `✕` cancel. `autoFocus` the input.
  3. On Save: POST to `/api/crm/notes` with the body above. Disable Save while the request is in flight. Keep Save disabled when input is empty.
  4. On success: clear + hide the input. Show a brief "Saved ✓" flash (1.5 s) then remove it.
  5. On error: show a short error message inline. Keep the input open so the user can retry.
  6. `ProjectCard` already gets `project` as a prop — use `project.id` as the `projectIds` value.
- **State:** Add two `useState` hooks inside `ProjectCard`: `const [noteOpen, setNoteOpen] = useState(false)` and `const [noteText, setNoteText] = useState('')`. These are local — no prop drilling needed.
- **What NOT to change:** The notes API route. The `ProjectCard` prop signature beyond local state. Any other component.
- **Acceptance:** Clicking `＋ Note` on a project card opens an inline input. Saving posts to `/api/crm/notes`. Empty note is blocked. Success shows "Saved ✓" flash. Error message stays visible until the user retries or cancels. Pre-push hooks pass.
- **Time estimate:** ~2 hours.
- **Start with:** Read `ProjectCard` (lines 41–140ish) in full first. Then read `src/app/api/crm/notes/route.js` — understand the POST body. Then add the UI at the bottom of the card's JSX.

---

## Manual testing checklist (PRs 1–5)

These were confirmed working on `app.ilcstudios.com` using "THE APPROACH (SEAN'S)":

1. **Dirty tracking** — wizard section save with no changes produces at most a "no changes detected" entry.
2. **Old→new in activity log** — single-field change shows `Updated **Field**: old → new`. Multi-field falls back to summarized format.
3. **Section manual adders (questionnaire sections)** — enter `5000` in Units manual adder, save; Summary shows $5,000 higher with "Manual adder" detail line.
4. **Section manual adders (Project Data)** — Section Adders group at bottom of Project Data step; BOH/Garage/Exit Signs inputs save and flow through to Summary.
5. **Activity feed filters** — Module, User, and date range dropdowns all narrow the activity list. Clear Filters restores it.
6. **Budget change history** — Summary page bottom shows "Budget Change History" with date, user, and description.

---

## Completed tasks (for reference)

- **Task 1: Wizard dirty-field tracking** — merged to main 2026-06-24. Branch: `manny/wizard-dirty-tracking`.
- **Task 2: Section manual adders** — merged to main 2026-06-24. Branch: `manny/section-manual-adders`.
- **Task 3: Activity feed filters** — merged to main 2026-06-24. Branch: `manny/activity-feed-filters`.
- **Task 4: Old→new values in activity descriptions** — merged to main 2026-06-24. Branch: `manny/activity-old-new-values`.
- **Task 5: Budget change history on Summary page** — merged to main 2026-06-24. Branch: `manny/summary-budget-history`.

---

## Orientation / training (read these once, between tasks)

### 1. Read the activity system end-to-end (~20 min)
Read `src/lib/activity.js` in full. Then find where `logActivity()` is called in `responses/route.js`, `data/route.js`, and `project/[id]/route.js`. For each call, understand: what type is logged, what the description string is, what metadata is stored.

### 2. Run the test suite and read it (~15 min)
`npm test` from repo root. Should pass (38 scenario + ~112K fuzz + 12 bid-matrix). Read 5–10 test scenarios in `tests/budget-math.mjs`. Don't modify — just read.

### 3. Read the coordination log (~10 min)
Read `.claude/coordination.md` top-to-bottom from the June 2026 entries. Fastest way to understand project history and decisions.

### 4. Explore a real project in dev (~15 min)
`npm run dev:3000`. Log in as `admin@ilcstudios.com`. Open "THE APPROACH (SEAN'S)". Step through the Budget wizard, view Summary, check Activity tab, then open the CRM. This makes every future task concrete.

---

## Recent guidance from Sean

- **(2026-07-06)** Tasks 6–9 rewritten. Mike's deploy merged Deal→Project — old specs referenced deleted entities (DealCard, DealDrawer, activities API). New specs use Project model with procurementStatus/designStatus fields. Task 7 now enhances the existing PipelineSummary instead of building a second bar. Task 9 now posts to /api/crm/notes instead of the deleted activities route. Work in order: 6 → 7 → 8 → 9. Tasks 6 and 7 can be done in either order (they're both small); 7 depends on the `daysSince` helper that 6 adds, so do 6 first or add `daysSince` yourself if doing 7 first.
- **(2026-06-24)** Tasks 1–5 all merged. Great sprint.
- **(2026-06-23)** PDFs (budget print, bid matrix) — Sean's job, not Manny's.
- **(2026-06-23)** Model tip: Haiku 4.5 is fine for mechanical tasks. Switch to Sonnet when stuck or at a decision point.
- **(2026-06-22)** Engine math is validated and trusted. Do not touch `src/lib/calculations.js` unless a task explicitly asks.
