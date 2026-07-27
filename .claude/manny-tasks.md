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

**Do these in order. Tasks 23 and 24 use the ConceptualSubmission schema that just deployed (2026-07-27). Start with 23.**

### Task 23: /start — Public intake wizard (~3 hrs)

- **Branch:** `manny/intake-wizard`
- **Why:** Developers and architects sometimes reach out to ILC cold wanting a rough budget estimate before any formal relationship. This adds a self-serve public page at `/start` where they fill in a short form. The submission is stored in `ConceptualSubmission` as PENDING — ILC admins review it in Task 24.

**Files:**
- `src/app/start/page.jsx` — new public page (NO auth guard, NOT under `(app)/`)
- `src/app/api/intake/submit/route.js` — new public POST endpoint (no requireAuth)

**Page fields:**
- Contact name (required) → `submitterName`
- Contact email (required) → `submitterEmail`; auto-extract domain → `submitterDomain`
- Company name (required) → `proposedName`
- Project name (required) → stored in `rawPayload` JSON
- Building type (optional, select) → `buildingType`
- Gross SF approx (optional, number) → stored in `rawPayload` JSON

**Building type select options:**
```js
const BUILDING_TYPES = [
  { value: 'singleFamily',  label: 'Single Family' },
  { value: 'townHouses',    label: 'Townhouses' },
  { value: 'garden',        label: 'Garden / Low-Rise Apartments' },
  { value: 'wrap',          label: 'Wrap' },
  { value: 'podium',        label: 'Podium' },
  { value: 'midRise',       label: 'Mid-Rise' },
  { value: 'highRise',      label: 'High-Rise' },
  { value: 'mixedUse',      label: 'Mixed Use' },
  { value: 'commercial',    label: 'Commercial' },
  { value: 'other',         label: 'Other / Not Sure' },
];
```

**API route (`src/app/api/intake/submit/route.js`):**
```js
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { contactName, contactEmail, companyName,
          projectName, buildingType, grossSf } = await req.json();

  if (!contactName || !contactEmail || !companyName || !projectName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const emailLower = contactEmail.toLowerCase().trim();
  const domain = emailLower.split('@')[1] ?? '';

  const submission = await prisma.conceptualSubmission.create({
    data: {
      submitterName:   contactName,
      submitterEmail:  emailLower,
      submitterDomain: domain,
      proposedName:    companyName,
      buildingType:    buildingType || null,
      rawPayload: JSON.stringify({
        projectName,
        grossSf: grossSf ? Number(grossSf) : null,
        submittedAt: new Date().toISOString(),
      }),
    },
  });

  return NextResponse.json({ id: submission.id });
}
```

**Page design:** Client component (`'use client'`), useState for form + submitted state. Dark navy header bar at top with "ILC Studios" in amber. Centered white/light-gray card with the form. Amber submit button. On success: replace form with "Thanks — we'll be in touch within 1-2 business days." No redirect.

**⚠ NO `force-dynamic` on the page** (it reads no cookies). The API route does need it.

**Acceptance:**
1. `/start` loads while logged out — no auth redirect
2. Submit with valid data → confirmation message, Network tab shows 200 with `{ id }`
3. Empty required field → inline error, no API call
4. Row appears in `prisma.conceptualSubmission` with status PENDING

---

### Task 24: Admin intake review queue (~3 hrs)

- **Branch:** `manny/intake-admin-queue`
- **Why:** Submissions from `/start` need to be reviewed by ILC admins before becoming real projects.

**Files:**
- `src/app/(app)/admin/intake/page.jsx` — server page, ILC_ADMIN only
- `src/app/(app)/admin/intake/IntakeClient.jsx` — 'use client', list + detail panel
- `src/app/api/admin/intake/[id]/route.js` — PATCH to update status/note/clientId

**Server page:**
```js
export const dynamic = 'force-dynamic';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import IntakeClient from './IntakeClient';

export default async function IntakePage() {
  const { user, error } = await requireAdmin(cookies());
  if (error) return error;

  const submissions = await prisma.conceptualSubmission.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      reviewedBy: { select: { name: true } },
      client:     { select: { id: true, name: true } },
    },
  });

  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return <IntakeClient submissions={submissions} clients={clients} currentUser={user} />;
}
```

**IntakeClient list columns:** Submitted date, Name, Email, Company (`proposedName`), Building type, Status badge (PENDING=amber, APPROVED=green, REJECTED=red).

**Detail panel (click a row):** Shows all fields + a status select, review note textarea, optional client-link select, and Save button.

**PATCH route:**
```js
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const { status, reviewNote, clientId } = await req.json();

  const updated = await prisma.conceptualSubmission.update({
    where: { id: params.id },
    data: {
      status:       status     ?? undefined,
      reviewNote:   reviewNote ?? undefined,
      clientId:     clientId   ?? undefined,
      reviewedById: user.id,
    },
  });

  return NextResponse.json(updated);
}
```

**Acceptance:**
1. `/admin/intake` loads for ILC_ADMIN, shows submissions
2. Non-admin gets 403/redirect
3. Clicking a row → detail panel opens
4. Changing status + saving → badge updates, persists on refresh
5. `force-dynamic` on page.jsx

---

### Task 25: Portal nav / UX cleanup (~2 hrs)

- **Branch:** `manny/portal-ux`
- **File:** `src/app/portal/projects/[id]/page.jsx` — three small fixes, no new files, no API routes, no schema

**Fix 1 — Project name in header:**
The project name doesn't appear until you're inside a tab. Add it below the portal header title:
```jsx
<p className="text-sm text-slate-400 mt-1">{project.name}</p>
```

**Fix 2 — Back to projects link:**
No navigation back to the project list. Add above the project name:
```jsx
<a href="/portal" className="text-xs text-slate-400 hover:text-amber-600 transition-colors">
  ← Back to projects
</a>
```

**Fix 3 — $/SF on conceptual budget hero:**
`git pull` first — Task 22 already shipped `ConceptualBudgetView`. Read the component. If `budget.perSf` is already displayed and legible, this fix is done — note it in the PR. If it's missing or very small, make it visible alongside the other metrics.

**Acceptance:**
1. Portal project page shows project name below header
2. Back link navigates to /portal
3. $/SF visible in conceptual budget hero when `perSf > 0`
4. Zero new API routes or schema changes

---

### Task 26: Cadence health badge on Client page (~2 hrs)

- **Branch:** `manny/checkin-cadence-badge`
- **Why:** The `/crm/contacts` page shows per-contact check-in status. The Client detail page's Contacts tab doesn't summarize this — no quick way to see if a client's contacts are mostly overdue.

**Step 1:** Run `ls src/app/(app)/clients/[id]/` to see the file structure. Find where the Contacts tab renders.

**Step 2:** Read `src/app/(app)/crm/contacts/ContactsClient.jsx` — the `checkInStatus()` helper is already there. Copy it (rename to avoid conflicts).

**Status logic:**
```js
function getCheckinStatus(contact) {
  const cadenceDays = contact.cadenceDays ?? contact.client?.defaultCadenceDays;
  if (!cadenceDays) return 'none';
  const lastTouch = contact.lastInPersonAt ?? contact.lastTouchpointAt;
  if (!lastTouch) return 'overdue';
  const daysSince = (Date.now() - new Date(lastTouch)) / 86400000;
  const daysOverdue = daysSince - cadenceDays;
  if (daysOverdue > 0)   return 'overdue';
  if (daysOverdue > -14) return 'due-soon';
  return 'current';
}
```

**Banner (add above the contacts table):**
```jsx
// Count contacts
const counts = { overdue: 0, 'due-soon': 0, current: 0, none: 0 };
contacts.forEach(c => counts[getCheckinStatus(c)]++);

// Only show if at least one contact has cadence set
{(counts.overdue + counts['due-soon'] + counts.current) > 0 && (
  <div className="flex gap-2 mb-3 flex-wrap">
    {counts.overdue > 0 && (
      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700">
        {counts.overdue} overdue
      </span>
    )}
    {counts['due-soon'] > 0 && (
      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
        {counts['due-soon']} due soon
      </span>
    )}
    {counts.current > 0 && (
      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
        {counts.current} current
      </span>
    )}
  </div>
)}
```

**Acceptance:**
1. Client with cadence-tracked contacts shows colored pills above the contacts table
2. Client with no cadence data shows no banner (not zero counts)
3. Colors match `/crm/contacts` — red/amber/green same logic
4. No new API routes or schema changes

---

## Bonus tasks (if Manny finishes early)

### Task 17: Auth hygiene sweep — 19 API routes (~1.5 hrs)

- **Branch:** `manny/auth-hygiene-sweep`
- **Why:** 19 API routes use the older `getSession()` pattern instead of `requireAuth(request)`. Consistent pattern makes future logging/middleware apply everywhere.
- **The swap:**
  ```js
  // OLD — replace this pattern:
  import { getSession } from '@/lib/auth';
  export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // uses: session.id, session.role
  }

  // NEW — with this pattern:
  import { requireAuth } from '@/lib/auth';
  export async function GET(request) {
    const { user, error } = await requireAuth(request);
    if (error) return error;
    // uses: user.id, user.role
  }
  ```
- **Files (19):** `src/app/api/link-preview/route.js`, `src/app/api/clients/[id]/standard-fixtures/route.js`, `src/app/api/clients/[id]/standards/concepts/route.js`, `src/app/api/clients/[id]/product-options/route.js`, `src/app/api/clients/[id]/playbook/route.js`, `src/app/api/alerts/route.js`, `src/app/api/market-intel/signals/[id]/route.js`, `src/app/api/market-intel/signals/route.js`, `src/app/api/market-intel/clients/route.js`, `src/app/api/clients/[id]/standards/route.js`, `src/app/api/market-intel/sources/[id]/route.js`, `src/app/api/market-intel/sources/route.js`, `src/app/api/market-intel/poll/route.js`, `src/app/api/projects/[id]/estimate/route.js`, `src/app/api/fixture-library/specs/[id]/route.js`, `src/app/api/fixture-library/fixture-types/route.js`, `src/app/api/fixture-library/master-types/[code]/route.js`, `src/app/api/fixture-library/fixture-types/[code]/route.js`, `src/app/api/fixture-library/fixture-types/import/route.js`
- **Special case — `auth/me`:** It re-fetches the user from Prisma and assigns it to a variable also called `user`. Use `user: jwtUser` in destructuring to avoid the name collision.
- **Do NOT touch page files** under `src/app/(app)/` — pages use `getSession()` to `redirect()`, which stays.
- **Acceptance:** All 19 files changed. `grep -r "import.*getSession.*from '@/lib/auth'" src/app/api/` returns zero hits. App runs. Pre-push hooks pass.

### Task 18: Meeting notes count badge in project hub sidebar (~1 hr)

- **Branch:** `manny/meeting-notes-badge`
- **Why:** `ProjectSidebar` already supports a `badges` prop — no infrastructure changes needed. Just wire a count to it.
- **Files:**
  1. `src/app/(app)/project/[id]/page.jsx` — add `_count: { select: { notes: { where: { noteType: 'PROJECT_MEETING' } } } }` inside the `include` block of the Prisma fetch. Pass `meetingNotesCount={project._count?.notes ?? 0}` to `<ProjectHubClient>`.
  2. `src/app/(app)/project/[id]/ProjectHubClient.jsx` — accept `meetingNotesCount = 0` in the function signature, then pass `badges={{ meetings: meetingNotesCount }}` to `<ProjectSidebar>`. Read `ProjectSidebar.jsx` lines 22 and 65–90 first to understand how `badges` works — don't change that file.
- **Acceptance:** Projects with meeting notes show a blue dot (collapsed) or blue number (expanded) on the Meetings tab. Projects with zero notes show nothing extra. Pre-push hooks pass.

---

## Completed tasks

> **Completed 2026-07-27:** Tasks 20 (global contacts + CRM links), 21 (budget contingency), 22 (portal conceptual budget) merged to main as PRs #16, #17, #18.
> **Completed 2026-07-09:** Tasks 14–16 (security fixes, CRM list polish, win rate stats) merged (commits 206f1fb, 51968e7, 720fd55).
> **Completed 2026-07-08:** Tasks 10–13 (brief links, notes badge, probability edit, CSV export) merged.
> **Completed 2026-07-07:** Tasks 6–9 (needs attention, stats bar, morning brief, quick-note) merged.
> **Completed 2026-06-24:** Tasks 1–5 (dirty tracking, section adders, activity filters, old→new values, budget history) merged.

---

## Recent guidance from Sean

- **(2026-07-27)** Tasks 23–26 queued. CRM work remains paused per Mike's direction — none of the new tasks touch CRM. Task 23 first since it connects to the schema that just deployed.
- **(2026-07-27)** ConceptualSubmission schema (migration 0053) is live in production as of today.
- **(2026-07-09)** Tasks 14–16 all merged. Good sprint.
- **(2026-06-23)** Engine math is validated and trusted. Do not touch `src/lib/calculations.js` unless a task explicitly asks.
