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

> **Completed 2026-08-04:** Tasks 23 (intake /start submit wiring), 24 (admin intake queue), 25 (portal nav UX), 26 (cadence health badge) all merged to main and deployed. Schema migration 0053 (ConceptualSubmission) was already live.
> **Completed 2026-07-27:** Tasks 20 (global contacts + CRM links), 21 (budget contingency), 22 (portal conceptual budget) merged to main as PRs #16, #17, #18.
> **Completed 2026-07-09:** Tasks 14–16 (security fixes, CRM list polish, win rate stats) merged (commits 206f1fb, 51968e7, 720fd55).
> **Completed 2026-07-08:** Tasks 10–13 (brief links, notes badge, probability edit, CSV export) merged.
> **Completed 2026-07-07:** Tasks 6–9 (needs attention, stats bar, morning brief, quick-note) merged.
> **Completed 2026-06-24:** Tasks 1–5 (dirty tracking, section adders, activity filters, old→new values, budget history) merged.

---

## Recent guidance from Sean

- **(2026-08-04)** Task 27 queued. This is the last piece of the external intake flow — closes the loop between submission approval and the submitter getting portal access to view their budget. No schema changes needed.
- **(2026-07-27)** Tasks 23–26 all shipped and deployed.
- **(2026-07-09)** Tasks 14–16 all merged. Good sprint.
- **(2026-06-23)** Engine math is validated and trusted. Do not touch `src/lib/calculations.js` unless a task explicitly asks.
