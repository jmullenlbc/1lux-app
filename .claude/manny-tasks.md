# Manny — task queue & session orientation

This file is read by the `/formanuel` slash command at session start.
the collaborator and the collaborator's Claude maintain it. Manny does not edit it.

## Who Manny is

- **Manuel San Ramon** — part-time on the ILC team (~10 hr/week)
- Role: developer focused on small well-scoped fixes and code-hygiene cleanup
- Reviewer: the collaborator. Manny opens PRs on `manny/*` branches; the collaborator reviews and merges.
- AI tooling: Claude Pro for chat, Claude Code in the terminal for actual work

## Operating convention for Manny's sessions

When Manny opens a session:

1. **`git pull --rebase origin main` — always first, every session, no exceptions.** Do not wait for Manny to ask. Do not skip it even if Manny says he already pulled. Main moves fast and stale branches make PRs unreadable.
2. Greet him by name. Confirm what he was working on by checking the **Active tasks** section below and the latest commits on `manny/*` branches.
3. If there's an active task, propose to resume it. Don't restart from zero — pick up where the branch and the commits left off.
4. Tell Claude what to do; Claude handles git, tests, and pushes. Manny reviews proposed changes and approves.
5. Open a PR when the work is ready for the collaborator's review. Never push to `main` without the collaborator's explicit say-so.
6. Pre-push hooks are sacred. If they fail, fix the underlying issue. Never bypass with `--no-verify`.

---

## Active tasks

_No tasks currently queued. Sean will add new tasks here before Manny's next session._

---

### Task 28: Agent-runs queue — project context + filters (~3 hrs) **[COMPLETE — merged 2026-08-26]**

- **Branch:** `manny/agent-runs-filters`
- **Why:** Mike just shipped the AgentRun governance layer (`/admin/agent-runs`). The review queue works, but each row card shows no project name — you can't tell which project a run belongs to without opening the record. Also, the API already supports `?taskType=…` filtering but the UI has no controls for it. As runs accumulate this will become unnavigable.

**Files to touch:**

1. **`src/lib/agent/reviewStore.js`** — The Prisma query is in the `allRows()` function (bottom of the file), not in `listRuns`. Find the `prismaClient.agentRun.findMany(...)` call inside `allRows()`. Add `include: { project: { select: { id: true, name: true } } }` to it:
   ```js
   const rows = await prismaClient.agentRun.findMany({
     orderBy: { createdAt: 'desc' },
     take: 1000,
     include: { project: { select: { id: true, name: true } } },
   });
   ```
   The existing `rows.map(r => ({ ...r, createdAt: ... }))` spread already passes the `project` field through — no other changes to `allRows`. The FILE and MEMORY sinks don't join (they're dev-only), so `r.project` will be `undefined` on those paths — the API and UI both guard with `?.`.

2. **`src/app/api/admin/agent-runs/route.js`** — The `runs.map(…)` on line 56 already serializes the row. Add `projectName: r.project?.name ?? null` to the returned object.

3. **`src/app/(app)/admin/agent-runs/ReviewQueue.jsx`** — Three additions:
   - **Project name in each card**: In the card body, below `taskType`/`feature`, add a small grey line: `{run.projectName && <span className="text-xs text-slate-400">Project: <a href={…} className="underline">{run.projectName}</a></span>}`. Link to `/project/${run.projectId}`.
   - **Project dropdown filter**: Above the status tabs, add a `<select>` populated from `[...new Set(data?.runs?.filter(r => r.projectName).map(r => ({ id: r.projectId, name: r.projectName })))]` (deduplicated). When changed, filter the client-side display (no new API call needed — `limit=200` already fetches enough). An empty option (`— all projects —`) resets the filter.
   - **Task-type pill filters**: Below the status tabs, render a pill for each unique `taskType` present in the loaded runs. Clicking one filters the displayed list client-side. The `tiers` object (already in `data.tiers`) maps `taskType@version` to `{ label }` — use that label for the pill text. An "All types" pill resets.

**Acceptance:**
1. Each card shows the project name as a clickable link
2. Project dropdown appears above the status tabs; selecting a project hides runs from other projects
3. Task-type pills appear below status tabs; clicking one scopes the list
4. "All projects" / "All types" resets the filter
5. Runs with no project (null `projectId`) show "—" instead of crashing
6. Pre-push hooks pass

---

### Task 29: Intake success message — portal invite mention (~30 min) **[COMPLETE — merged 2026-08-26]**

- **Branch:** `manny/intake-success-copy`
- **Why:** `src/app/conceptual_budget/IntakeClient.jsx` line 178-180 says "be in touch within 1–2 business days." Task 27's invite bridge is now live — the admin literally sends a portal link after approval. The success copy should reflect that so submitters know what to expect.

**File to touch:** `src/app/conceptual_budget/IntakeClient.jsx`

Find the success state block (around line 175):
```jsx
<p className="text-xs text-green-700 mt-1">
  An ILC Studios team member will review your submission and be in touch within 1–2 business days.
</p>
```

Replace with:
```jsx
<p className="text-xs text-green-700 mt-1">
  An ILC Studios team member will review your submission and be in touch within 1–2 business days.
  If your project is a fit, you'll receive a secure link to the ILC client portal to view your conceptual budget.
</p>
```

**Acceptance:**
1. Submit the form (use `admin@ilcstudios.com` flow or the public `/conceptual_budget` page)
2. After submit, the green success box shows both sentences
3. No other copy changes — do not touch any other text
4. Pre-push hooks pass

---

### Task 27: Intake → Portal Invite Bridge (~3 hrs)

- **Branch:** `manny/intake-portal-invite`
- **Why:** The `/start` intake form is live and accepting submissions. Admins can approve them at `/admin/intake`. But after approval there's no way to deliver the conceptual budget to the submitter — they get a "we'll be in touch" message and then nothing. This task closes that loop: the admin links the approved submission to a project and sends the submitter a portal invite link so they can log in and view their budget.

**Background (read before starting):**
- `/start` → creates `ConceptualSubmission` (status=PENDING)
- `/admin/intake` → admin reviews, sets status=APPROVED, optionally links a `Client`
- The portal invite system already exists: `ProjectExternalContact` has `inviteToken`, and `/portal/invite/[token]` lets a submitter set a password and get portal access
- `ConceptualSubmission.duplicateMatchId` is a nullable FK to `Project` — this is the field we use to link the submission to its project

**Files to modify:**
- `src/app/(app)/admin/intake/page.jsx` — fetch all projects too
- `src/app/(app)/admin/intake/IntakeClient.jsx` — add "Link to Project" + "Send Portal Invite" to detail panel
- `src/app/api/admin/intake/[id]/route.js` — accept `duplicateMatchId` in PATCH

**New file:**
- `src/app/api/admin/intake/[id]/invite/route.js` — POST: create ProjectExternalContact + send invite

**Status: COMPLETE — merged to main 2026-08-24.**

---

#### Step 1: Update the server page to fetch projects

In `src/app/(app)/admin/intake/page.jsx`, add a projects fetch after the existing clients fetch:

```js
const projects = await prisma.project.findMany({
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
});

return <IntakeClient submissions={submissions} clients={clients} projects={projects} currentUser={user} />;
```

Also update the submissions query to include the linked project:
```js
const submissions = await prisma.conceptualSubmission.findMany({
  orderBy: { createdAt: 'desc' },
  include: {
    reviewedBy:    { select: { name: true } },
    client:        { select: { id: true, name: true } },
    duplicateMatch: { select: { id: true, name: true } },
  },
});
```

---

#### Step 2: Update the PATCH route

In `src/app/api/admin/intake/[id]/route.js`, add `duplicateMatchId` to the accepted fields:

```js
const { status, reviewNote, clientId, duplicateMatchId } = await req.json();

const updated = await prisma.conceptualSubmission.update({
  where: { id: params.id },
  data: {
    status:           status           ?? undefined,
    reviewNote:       reviewNote       ?? undefined,
    clientId:         clientId         ?? undefined,
    duplicateMatchId: duplicateMatchId ?? undefined,
    reviewedById: user.id,
  },
});
```

---

#### Step 3: New invite endpoint

Create `src/app/api/admin/intake/[id]/invite/route.js`:

```js
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { randomUUID } from 'crypto';
import { portalInvite } from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const submission = await prisma.conceptualSubmission.findUnique({
    where: { id: params.id },
    include: { duplicateMatch: { select: { id: true, name: true } } },
  });
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!submission.duplicateMatchId)
    return NextResponse.json({ error: 'Link a project to this submission first' }, { status: 400 });

  const project = submission.duplicateMatch;

  // Check if this email already has a contact record on this project
  const existing = await prisma.projectExternalContact.findFirst({
    where: { project_id: project.id, email: submission.submitterEmail },
  });

  let contact;
  let alreadyAccepted = false;

  if (existing) {
    if (existing.acceptedAt) {
      alreadyAccepted = true;
      contact = existing;
    } else {
      // Regenerate token for resend
      const inviteToken = randomUUID();
      contact = await prisma.projectExternalContact.update({
        where: { id: existing.id },
        data: {
          inviteToken,
          inviteTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedAt: new Date(),
        },
      });
    }
  } else {
    const inviteToken = randomUUID();
    contact = await prisma.projectExternalContact.create({
      data: {
        project_id:    project.id,
        name:          submission.submitterName,
        email:         submission.submitterEmail,
        role:          'Client',
        canViewBudgets: true,
        inviteToken,
        inviteTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedAt: new Date(),
      },
    });
  }

  const appUrl   = process.env.APP_URL || 'https://app.ilcstudios.com';
  const inviteUrl = alreadyAccepted ? null : `${appUrl}/portal/invite/${contact.inviteToken}`;

  if (!alreadyAccepted) {
    if (process.env.NOTIFY_DRY_RUN !== 'false') {
      console.log(`[INVITE DRY RUN] to=${submission.submitterEmail} url=${inviteUrl}`);
    } else {
      const { subject, html } = portalInvite({
        projectName: project.name,
        inviteUrl,
        contactName: submission.submitterName,
      });
      console.log(`[INVITE] Sending to=${submission.submitterEmail} subject="${subject}"`);
      // TODO: Microsoft Graph API sendMail
    }
  }

  return NextResponse.json({ success: true, alreadyAccepted, inviteUrl, submitterEmail: submission.submitterEmail });
}
```

---

#### Step 4: Update IntakeClient.jsx

Accept the new `projects` prop. In the detail panel, below the existing Save button, add a "Portal Access" section. **Only render this section when `selected.status === 'APPROVED'`.**

The section has two parts:

**Part A — Link to Project** (always shown in the section):
```jsx
<div>
  <label className="block text-sm font-semibold text-slate-700 mb-1">Linked Project</label>
  <select
    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
    value={linkedProjectId}
    onChange={e => setLinkedProjectId(e.target.value)}
  >
    <option value="">— not linked —</option>
    {projects.map(p => (
      <option key={p.id} value={p.id}>{p.name}</option>
    ))}
  </select>
  <p className="text-xs text-slate-400 mt-1">
    Link first, then save above, then send the invite below.
  </p>
</div>
```

`linkedProjectId` is a new piece of local state, initialized from `selected.duplicateMatchId ?? ''`. Include it in the existing Save button's PATCH body: `duplicateMatchId: linkedProjectId || null`.

**Part B — Send Portal Invite** (shown below Part A):
```jsx
<div className="mt-4 pt-4 border-t border-slate-100">
  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Portal Invite</p>

  {inviteResult?.alreadyAccepted ? (
    <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
      ✓ {inviteResult.submitterEmail} already has portal access for this project.
    </p>
  ) : inviteResult?.inviteUrl ? (
    <div>
      <p className="text-xs text-green-700 mb-1">Invite generated — copy and send to {inviteResult.submitterEmail}:</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={inviteResult.inviteUrl}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono bg-slate-50"
        />
        <button
          onClick={() => { navigator.clipboard.writeText(inviteResult.inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  ) : (
    <button
      disabled={!selected.duplicateMatchId || inviting}
      onClick={handleSendInvite}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        selected.duplicateMatchId && !inviting
          ? 'bg-amber-500 hover:bg-amber-400 text-white'
          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
      }`}
    >
      {inviting ? 'Sending…' : 'Send Portal Invite'}
    </button>
  )}
  {inviteError && <p className="text-xs text-red-500 mt-1">{inviteError}</p>}
  {!selected.duplicateMatchId && (
    <p className="text-xs text-slate-400 mt-1">Link a project above and save first.</p>
  )}
</div>
```

New state: `const [linkedProjectId, setLinkedProjectId] = useState(selected?.duplicateMatchId ?? '')` — reset in the row-click handler whenever `selected` changes. Also: `const [inviting, setInviting] = useState(false)`, `const [inviteResult, setInviteResult] = useState(null)`, `const [inviteError, setInviteError] = useState(null)`, `const [copied, setCopied] = useState(false)`.

`handleSendInvite`:
```js
async function handleSendInvite() {
  setInviting(true);
  setInviteError(null);
  try {
    const res = await fetch(`/api/admin/intake/${selected.id}/invite`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    setInviteResult(data);
  } catch (err) {
    setInviteError(err.message);
  } finally {
    setInviting(false);
  }
}
```

Reset `inviteResult` and `inviteError` when the selected row changes.

---

**Acceptance:**
1. Detail panel for an APPROVED submission shows "Linked Project" dropdown and "Send Portal Invite" button
2. "Send Portal Invite" is disabled (greyed out) until a project is linked and saved
3. After linking a project and saving, the invite button activates
4. Clicking "Send Portal Invite" → server creates `ProjectExternalContact` (verify in Prisma Studio: `npx prisma studio` → ProjectExternalContact table), returns invite URL
5. Invite URL appears in a copyable field in the detail panel
6. Clicking "Copy" copies the URL to clipboard
7. Visiting the invite URL while logged out → `/portal/invite/[token]` loads the set-password form
8. PENDING submissions show no "Portal Access" section at all
9. `force-dynamic` already on page.jsx — don't remove it
10. No schema changes — `duplicateMatchId` already exists on `ConceptualSubmission`

---

## Bonus tasks (if Manny finishes early)

### Task 30: Agent-runs queue — CSV export (~1.5 hrs) **[COMPLETE — merged 2026-08-26]**

- **Branch:** `manny/agent-runs-csv`
- **Why:** The review queue at `/admin/agent-runs` has no export. Mike needs to pull runs into a spreadsheet for accuracy tracking. You already built CSV export for the CRM (Task 4, July 2026) — same pattern.

**File:** `src/app/(app)/admin/agent-runs/ReviewQueue.jsx`

Add a "Download CSV" button in the toolbar. On click, take the currently visible runs (post-filter from Task 28, or `data?.runs ?? []` if doing this standalone) and build a CSV client-side:

```js
function exportCsv(runs) {
  const cols = ['Date','Task Type','Feature','Project','Model','Status','Verdict','Auto-check pass','Confidence','Correction'];
  const escape = v => v == null ? '' : String(v).includes(',') ? `"${String(v).replace(/"/g,'""')}"` : String(v);
  const rows = runs.map(r => [
    r.createdAt?.slice(0,10) ?? '', r.taskType ?? '', r.feature ?? '', r.projectName ?? '',
    r.model ?? '', r.status ?? '', r.verdict ?? '',
    r.autoCheckPass == null ? '' : r.autoCheckPass ? 'yes' : 'no',
    r.confidence ?? '', r.correction ?? '',
  ].map(escape).join(','));
  const csv = [cols.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = `agent-runs-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}
```

**Acceptance:** Button downloads a correctly-structured CSV respecting active filters. Pre-push hooks pass.

---

### Task 31: Morning brief — client-side check-off (~2 hrs) **[COMPLETE — merged 2026-08-26]**

- **Branch:** `manny/brief-checkoff`
- **Why:** The morning brief you built (`/crm/brief`) shows today's action items but has no way to mark one done during the day. A checkbox with localStorage persistence requires no API or schema changes.

**File:** `src/app/(app)/crm/brief/BriefClient.jsx`

Add checked state, keyed by today's date so it auto-resets each morning:

```js
const TODAY = new Date().toISOString().slice(0, 10);
const LS_KEY = `brief-checked-${TODAY}`;

const [checkedIds, setCheckedIds] = useState(() => {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY)) || []); } catch { return new Set(); }
});

function toggle(id) {
  setCheckedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    localStorage.setItem(LS_KEY, JSON.stringify([...next]));
    return next;
  });
}
```

Add a checkbox at the left of each action-item row. Use the deal's database `id` (not array index) as the stable identifier. Checked rows get `opacity-40 line-through` — keep them visible (context is useful even after handled).

**Acceptance:** Checkbox toggles strikethrough, survives page refresh, auto-resets next day, no API calls. Pre-push hooks pass.

---

### Task 32: CRM deal cards — last-touch staleness badge (~2.5 hrs) **[COMPLETE — merged 2026-08-26]**

- **Branch:** `manny/deal-staleness-badge`
- **Why:** Deal cards don't show when a deal was last touched. A badge on stale cards lets Mike see neglected deals without opening each one.

**Files:** `src/app/(app)/crm/CRMClient.jsx` (badge + helper), `src/app/(app)/crm/page.jsx` (confirm `updatedAt` is in the Prisma select — it probably already is).

Add a helper:
```js
function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
```

On each deal card, render a badge below the deal name:
```jsx
{(() => {
  const d = daysSince(deal.updatedAt);
  if (d === null || d < 5) return null;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
      d >= 14 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
    }`}>{d}d ago</span>
  );
})()}
```

Thresholds: 5–13 days → amber, 14+ → red, < 5 → no badge.

**Critical:** Do not touch any probability logic in this file. `averageProbability()` from `src/lib/pipeline.js` is the only canonical source — do not introduce `pipelineProbability`.

**Acceptance:** Badge appears on stale cards, correct colors, no schema/API changes. Pre-push hooks pass.

---

### Task 17: Auth hygiene sweep — 19 API routes (~1.5 hrs) **[COMPLETE — merged 2026-08-24]**

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

### Task 18: Meeting notes count badge in project hub sidebar (~1 hr) **[COMPLETE — merged 2026-08-24]**

- **Branch:** `manny/meeting-notes-badge`
- **Why:** `ProjectSidebar` already supports a `badges` prop — no infrastructure changes needed. Just wire a count to it.
- **Files:**
  1. `src/app/(app)/project/[id]/page.jsx` — add `_count: { select: { notes: { where: { noteType: 'PROJECT_MEETING' } } } }` inside the `include` block of the Prisma fetch. Pass `meetingNotesCount={project._count?.notes ?? 0}` to `<ProjectHubClient>`.
  2. `src/app/(app)/project/[id]/ProjectHubClient.jsx` — accept `meetingNotesCount = 0` in the function signature, then pass `badges={{ meetings: meetingNotesCount }}` to `<ProjectSidebar>`. Read `ProjectSidebar.jsx` lines 22 and 65–90 first to understand how `badges` works — don't change that file.
- **Acceptance:** Projects with meeting notes show a blue dot (collapsed) or blue number (expanded) on the Meetings tab. Projects with zero notes show nothing extra. Pre-push hooks pass.

---

## Completed tasks

> **Completed 2026-08-26:** Tasks 28 (agent-runs project context + filters), 29 (intake success copy), 30 (agent-runs CSV export), 31 (morning brief check-off), 32 (CRM staleness badge) all merged to main in commits 265af44 (Task 29) and 060f2dd (Tasks 28/30/31/32). Branches deleted.
> **Completed 2026-08-24:** Tasks 27 (intake portal invite bridge), 17 (auth hygiene sweep), 18 (meeting notes badge) all merged to main and deployed.
> **Completed 2026-08-04:** Tasks 23 (intake /start submit wiring), 24 (admin intake queue), 25 (portal nav UX), 26 (cadence health badge) all merged to main and deployed. Schema migration 0053 (ConceptualSubmission) was already live.
> **Completed 2026-07-27:** Tasks 20 (global contacts + CRM links), 21 (budget contingency), 22 (portal conceptual budget) merged to main as PRs #16, #17, #18.
> **Completed 2026-07-09:** Tasks 14–16 (security fixes, CRM list polish, win rate stats) merged (commits 206f1fb, 51968e7, 720fd55).
> **Completed 2026-07-08:** Tasks 10–13 (brief links, notes badge, probability edit, CSV export) merged.
> **Completed 2026-07-07:** Tasks 6–9 (needs attention, stats bar, morning brief, quick-note) merged.
> **Completed 2026-06-24:** Tasks 1–5 (dirty tracking, section adders, activity filters, old→new values, budget history) merged.

---

## Recent guidance from the collaborator

- **(2026-08-26)** Tasks 28–32 all merged. Task 29 had to be applied to the correct file (`conceptual_budget/IntakeClient.jsx` — Manny had used the old `/start/` path). Tasks 30–32 were bonus tasks Manny completed. Branches deleted. No active tasks; Sean will queue new ones before next session.
- **(2026-08-24)** Tasks 28 + 29 queued. Tasks 27, 17, 18 all merged and deployed. Task 28 adds project context + filters to Mike's new AgentRun review queue. Task 29 is a 30-min copy fix on the intake success message.
- **(2026-08-04)** Task 27 queued. This is the last piece of the external intake flow — closes the loop between submission approval and the submitter getting portal access to view their budget. No schema changes needed.
- **(2026-07-27)** Tasks 23–26 all shipped and deployed.
- **(2026-07-09)** Tasks 14–16 all merged. Good sprint.
- **(2026-06-23)** Engine math is validated and trusted. Do not touch `src/lib/calculations.js` unless a task explicitly asks.
