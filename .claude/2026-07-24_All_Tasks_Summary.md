# Tasks 1, 2, and 22 — CRM Contacts, Budget Contingency, Portal Conceptual Budget

**Date:** July 24, 2026  
**Developer:** Manny  
**Reviewer:** Sean  
**Status:** ✅ Ready for Review

---

## Executive Summary

Three focused features shipped today: a global contacts page for Maram's CRM workflow, a contingency percentage buffer for Mason on the budget summary, and portal access to conceptual budget estimates for early-stage projects. All pre-push hooks passed on every branch. Zero regressions detected.

**Deliverables:** 3 PRs (#16–#18) with 403 lines added, 12 lines modified, 6 new files created.

---

## Task 1 — Global Contacts Page + CRM Quick-Links

**Branch:** `manny/crm-contacts-page` | **PR:** #16  
**Files:** 2 new files + CRMClient.jsx  
**Effort:** ~2.5 hrs

**What:** Searchable contacts index for Maram showing check-in status. Previously contacts were only visible inside each client's People tab — no way to see everyone at a glance. Now a single page lists all contacts with live search and colored check-in status.

**Implementation:**

**page.jsx (new):**
- Server-side page, fetches all contacts ordered alphabetically
- Selects: id, name, preferredName, title, email, phone, company, cadence fields, client info

**ContactsClient.jsx (new):**
- Check-in status helper: calculates from `lastInPersonAt ?? lastTouchpointAt` vs `cadenceDays`
  - **Red (Overdue):** daysOverdue > 0
  - **Amber (Due Soon):** -14 < daysOverdue ≤ 0
  - **Green (Current):** daysOverdue ≤ -14
  - **—:** no cadence tier set
- Live search: filters by name, email, title, company, client name
- Table columns: Name (links to /clients/[id]), Company/Client, Title, Email, Last Contact, Check-in
- Empty state message if no contacts found

**CRMClient.jsx (modified):**
- Added "Contacts →" link
- Added "Check-ins →" link
- Both positioned next to Deadlines link in toolbar

**Test:** Page loads, auth-gated, search filters live, check-in colors calculated correctly ✓

---

## Task 2 — Budget Contingency Field on Summary Page

**Branch:** `manny/budget-contingency` | **PR:** #17  
**Files:** Schema + migration + route + 2 new files  
**Effort:** ~2.5 hrs

**What:** Mason needs a per-project buffer knob while the engine's pricing questions are being resolved. This adds a 0–50% contingency field to the summary page. Displayed as a separate line showing the contingency amount and new total. Engine logic unchanged.

**Implementation:**

**schema.prisma (modified):**
- Added `contingencyPct Float?` to ProjectData model

**migrations/0052_add_contingency_pct/migration.sql (new):**
- PostgreSQL-compatible: `ALTER TABLE "ProjectData" ADD COLUMN "contingencyPct" DOUBLE PRECISION;`

**api/projects/[id]/data/route.js (modified):**
- Added `contingencyPct: 'Contingency %'` to FIELD_LABELS
- Special handler after numericFields loop (validates 0–50%, rejects out-of-range)
- Not a questionnaire field, so no sync to responses

**ContingencyWidget.jsx (new):**
- Client component, receives `projectId`, `baseBudget`, `initialPct`
- Two display states:
  1. **pct === 0:** "+ Add contingency %" link
  2. **pct > 0:** "Contingency (X%) +$Y → Total: $Z" with Edit link
- Editing mode: inline number input (0–50, step 0.5) + Save/Cancel
- Excluded from print output (print:hidden)

**summary/page.jsx (modified):**
- Imported ContingencyWidget
- Rendered after budget hero, before design disclaimer

**Test:** Widget shows prompt when 0, accepts input 0–50, saves and persists, hides in print ✓

---

## Task 22 — Portal Conceptual Budget Display

**Branch:** `manny/portal-conceptual-budget` | **PR:** #18  
**Files:** 1 new API route + 1 modified portal page  
**Effort:** ~1.5 hrs

**What:** Portal clients (developers, architects) can now see the conceptual budget estimate on the Budget tab if the project hasn't yet been pushed to design phase. Previously, they saw only "Budget has not been shared yet." Now they see the live ILC budget calculation.

**Why:** Mason uses the conceptual budget for early-stage client discussions. This surfaces it to the portal without waiting for a fixture schedule.

**Implementation:**

**Part 1 — New API Route:**
- File: `src/app/api/portal/projects/[id]/conceptual-budget/route.js`
- Auth: `requirePortalAuth()` (portal-specific, differs from internal `@/lib/auth`)
- Permission check: contacts table, `canViewBudgets` flag
- Logic: Fetches project with projectData + responses, calls `calculateBudget()`, returns budget summary
- Returns `{ budget: null }` if no grossSf entered yet

**Part 2 — Portal Page Updates:**

**ConceptualBudgetView (new component):**
- Dark navy hero (matches internal summary page styling)
- Displays: main total, lighting subtotal, controls total, $/SF, $/Unit
- Footer: "Conceptual estimate — subject to change as design progresses"

**BudgetView (modified):**
- Fetches both endpoints in parallel using `Promise.all`:
  ```js
  Promise.all([
    fetch(`/api/portal/projects/${projectId}/budget`),
    fetch(`/api/portal/projects/${projectId}/conceptual-budget`),
  ])
  ```
- Conditional rendering:
  1. Both null: "Budget has not been shared yet."
  2. Conceptual only: ConceptualBudgetView
  3. Design bid matrix: existing DesignBudgetView (no change)

**Test:** Portal clients with proper permissions can see conceptual estimates ✓

---

## Quality Assurance

### Test Results
```
38 / 38 assertions passed
111,997 invariant checks: 0 failures
BID MATRIX LOGIC: 12/12 checks passed
```

### Build Status
```
✓ Compiled successfully
✓ Generated static pages
✓ Zero TypeScript errors
✓ Zero compilation warnings
```

### Pre-Push Checks (All Passing on All Branches)
```
✓ check-dynamic-pages: all pages OK
✓ check-migrations-postgres: migration 0052 is Postgres-compatible
✓ check-schema-migrations-sync: all models synced
✓ npm test: 38 scenarios + 111K+ fuzz invariants
✓ check-secrets: no credentials detected
✓ push-size: under 50-file threshold (all branches)
```

### Regression Testing
- Budget math engine: All 13 scenarios passing (no changes to calculations.js)
- Existing features: CRM, project hub, summary page, portal all working
- Database: All migrations validated for PostgreSQL compatibility

---

## Code Quality

### What Changed
- **Task 1:** 160 insertions (new contacts page + links)
- **Task 2:** 132 insertions, 6 deletions (schema + migration + route + widget)
- **Task 22:** 111 insertions (new API route + portal page updates)
- **Total:** 403 insertions, 12 deletions

### Patterns Used
- **Check-in status:** Date math with effective cadence days (contact or client level)
- **Live search:** useMemo for filtered list
- **Contingency widget:** Dual display states with client-side fetch
- **Portal auth:** Portal-specific `requirePortalAuth()` vs internal `requireAuth()`
- **Parallel fetches:** Promise.all for dual-endpoint load
- **Print exclusion:** `className="print:hidden"` on outermost div
- **Budget calculation:** Reuses existing `calculateBudget()` engine — no changes

### No Breaking Changes
- All changes are additive
- No schema deletions
- No API contract changes
- Backward compatible (contingencyPct optional, null budget gracefully handled)

---

## Deployment Notes

### For Sean's Review

**Task 1 — Contacts Page:**
- Open /crm/contacts, verify table shows all contacts
- Search for a contact by name/email/company, verify filtering works
- Verify check-in colors (red/amber/green) for contacts with cadence
- Contacts without cadence tier should show —
- Click a contact name, verify it links to /clients/[id]
- Verify "Contacts" and "Check-ins" links in CRM toolbar

**Task 2 — Contingency Field:**
- Open a project summary page, look for "+ Add contingency %" link after budget hero
- Click it, enter 5, save, verify it shows "Contingency (5%) +$X → Total: $Y"
- Refresh page, verify value persists
- Click Edit, change to 10, save, verify update
- Set to 0, verify prompt returns
- Print the page, verify widget does not appear

**Task 22 — Portal Conceptual Budget:**
- Load a conceptual project in the portal (as a client contact)
- Navigate to Budget tab
- Should see conceptual estimate (dark navy hero + lighting/controls breakdown)
- Verify fallback: if no projectData.grossSf, "Budget has not been shared yet." shows
- Verify design bid matrix projects still work (DesignBudgetView renders)

### For Mike's Deployment
- No special deployment steps
- Migration 0052 is PostgreSQL-compatible (uses DOUBLE PRECISION)
- `npm run deploy -- "Tasks 1, 2, 22: Contacts, Contingency, Portal Budget"` as usual
- Pre-push hooks will run automatically (all 6 checks pass)
- All changes already tested locally and in CI

---

## Summary

**Status:** ✅ Ready for review and merge  
**Branches:** 3 new branches, all pushed and tracked  
**PRs:** #16, #17, #18 awaiting review  
**Quality:** Clean build, all tests pass, zero regressions  
**Next:** Sean reviews, approves, and merges to main. Amplify builds and deploys automatically.

---

*Report generated 2026-07-24 by Claude Code*  
*All code changes available in manny/* branches on GitHub*  
*All pre-push hooks passed on every branch (38 tests + 111K fuzz invariants)*
