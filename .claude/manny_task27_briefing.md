# ILC Lighting App — Task 27 Briefing for Claude

**This file is a briefing for a fresh Claude Code session.**
Read everything below, then greet Manny by name and tell him exactly what to do first.

---

## The project

ILC Studios is a lighting consultancy. This app is their internal tool — it manages projects, generates conceptual lighting budgets, runs a CRM, and now has a public intake form at `/start` where developers and architects can submit a budget request.

Stack: Next.js 14 App Router, Tailwind CSS, Prisma 5.22 (SQLite locally / PostgreSQL in production), JWT auth, AWS Amplify SSR. Live at `https://app.ilcstudios.com`, auto-deploys from `main` via Amplify.

Working directory: `C:\Users\bothe\Documents\GitHub\work\ilc-lighting-app`

---

## Who Manny is

Manuel San Ramon — part-time developer (~10 hrs/week). Works on small, well-scoped tasks. Sean reviews and merges everything. Manny NEVER pushes to `main` directly — always opens a PR.

---

## Manny's mandatory workflow (do not skip steps)

1. `git pull` — always first, every session
2. `git checkout -b manny/intake-portal-invite` — new branch for this task
3. Edit files, test with `npm run dev:3000`
4. Commit, then `git push` — pre-push hooks run (~25 sec). If they fail, fix the issue. Never use `--no-verify`.
5. `gh pr create` — open a PR. Ping Sean to review.

Local dev login: `admin@ilcstudios.com` / `ILCadmin2024!`

---

## Critical rules

- Every page under `src/app/(app)/` MUST have `export const dynamic = 'force-dynamic'` at the top. Without it, Next.js caches it at build time and it crashes in production.
- `schema.prisma` stays `provider = "sqlite"` — never commit `provider = "postgresql"`.
- No schema changes at all for this task — the fields we need already exist.
- Every new API route needs `export const dynamic = 'force-dynamic'`.
- Every API route calls `requireAdmin(req)` or `requireAuth(req)` at the top (passing the `req` object).
- Never re-derive win rate or probability — import from `src/lib/pipeline.js`.
- `src/lib/calculations.js` is the budget engine — do not touch it.

---

## Background: what already exists

The intake pipeline is live end-to-end:

- `/start` — public form where external users submit a conceptual budget request. Writes a `ConceptualSubmission` row (status=PENDING).
- `/admin/intake` — admin review queue. ILC staff can review submissions, change status to APPROVED/REJECTED, link to a Client, add a review note.
- The portal at `/portal` — external users log in here to view their projects. The portal invite system uses token-based invites: a `ProjectExternalContact` row with an `inviteToken` → external user visits `/portal/invite/[token]` → sets a name/password → gets a `PortalUser` account and can view their project.

**The gap:** After approving a submission, there's no way to send the submitter a portal invite. They get a "we'll be in touch" message and then hear nothing. Task 27 closes this loop.

---

## Relevant models (already in schema — no changes needed)

**ConceptualSubmission:**
- `id`, `submitterName`, `submitterEmail`, `proposedName`, `buildingType`
- `duplicateMatchId String?` — FK to `Project.id` — this is where we store the linked project
- `duplicateMatch Project? @relation("SubmissionDuplicateMatch", ...)` — the Prisma relation name
- `status` (PENDING / APPROVED / REJECTED), `clientId?`, `reviewedById?`

**ProjectExternalContact:**
- `id`, `project_id`, `name`, `email`, `role`
- `canViewBudgets Boolean @default(false)` — set this to `true` for intake submitters
- `inviteToken String? @unique`, `inviteTokenExpiresAt DateTime?`, `invitedAt DateTime?`
- `acceptedAt DateTime?` — set when they accept the invite

**PortalUser:** created when a contact accepts their invite (name + passwordHash).

---

## Existing code to be aware of

**`src/app/(app)/admin/intake/page.jsx`** — server page, ILC_ADMIN only. Currently fetches submissions and clients. You will add a projects fetch.

**`src/app/(app)/admin/intake/IntakeClient.jsx`** — 'use client'. List of submissions + a detail panel. Currently has: status select, review note, client-link select, Save button. You will add a "Link to Project" dropdown and "Send Portal Invite" button to the detail panel.

**`src/app/api/admin/intake/[id]/route.js`** — PATCH endpoint. Currently accepts `status`, `reviewNote`, `clientId`. You will add `duplicateMatchId`.

**`src/lib/emailTemplates.js`** — has a `portalInvite({ projectName, inviteUrl, contactName })` export that returns `{ subject, html }`. Use this for the invite email.

**Email sending:** The app is in dry-run mode (`NOTIFY_DRY_RUN !== 'false'`). When dry-run, log `[INVITE DRY RUN] to=... url=...` and return the invite URL in the response so the admin can copy it manually. That's fine — the admin will paste it into their own email for now. Look at `src/app/api/projects/[id]/contacts/route.js` for the exact pattern to follow.

---

## Task 27: Intake → Portal Invite Bridge

**Branch:** `manny/intake-portal-invite`
**Estimated time:** ~3 hours
**Files changed:** 3 existing + 1 new

---

### File 1 — `src/app/(app)/admin/intake/page.jsx` (existing, small addition)

Read this file first. Add a projects query after the existing `clients` query:

```js
const projects = await prisma.project.findMany({
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
});
```

Also update the submissions query to include the linked project:
```js
const submissions = await prisma.conceptualSubmission.findMany({
  orderBy: { createdAt: 'desc' },
  include: {
    reviewedBy:     { select: { name: true } },
    client:         { select: { id: true, name: true } },
    duplicateMatch: { select: { id: true, name: true } },  // ← add this line
  },
});
```

Pass `projects` to the client component:
```js
return <IntakeClient submissions={submissions} clients={clients} projects={projects} currentUser={user} />;
```

---

### File 2 — `src/app/api/admin/intake/[id]/route.js` (existing, small addition)

Read this file first. Add `duplicateMatchId` to the destructured body and the Prisma update:

```js
const { status, reviewNote, clientId, duplicateMatchId } = await req.json();

data: {
  status:           status           ?? undefined,
  reviewNote:       reviewNote       ?? undefined,
  clientId:         clientId         ?? undefined,
  duplicateMatchId: duplicateMatchId ?? undefined,   // ← add this line
  reviewedById: user.id,
},
```

---

### File 3 — NEW: `src/app/api/admin/intake/[id]/invite/route.js`

Create this file from scratch:

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

  // Check if a contact record already exists for this email on this project
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
        project_id:           project.id,
        name:                 submission.submitterName,
        email:                submission.submitterEmail,
        role:                 'Client',
        canViewBudgets:       true,
        inviteToken,
        inviteTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedAt:            new Date(),
      },
    });
  }

  const appUrl    = process.env.APP_URL || 'https://app.ilcstudios.com';
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

  return NextResponse.json({
    success:        true,
    alreadyAccepted,
    inviteUrl,
    submitterEmail: submission.submitterEmail,
  });
}
```

---

### File 4 — `src/app/(app)/admin/intake/IntakeClient.jsx` (existing, additions)

Read this file first — understand how the detail panel currently works and where the Save button is.

**New props:** accept `projects` alongside the existing `submissions`, `clients`, `currentUser`.

**New state** (add alongside the existing state declarations):
```js
const [linkedProjectId, setLinkedProjectId] = useState('');
const [inviting,        setInviting]        = useState(false);
const [inviteResult,    setInviteResult]    = useState(null);
const [inviteError,     setInviteError]     = useState(null);
const [copied,          setCopied]          = useState(false);
```

**When a row is clicked** (wherever you set the selected submission), also reset the invite state:
```js
setLinkedProjectId(row.duplicateMatchId ?? '');
setInviteResult(null);
setInviteError(null);
setCopied(false);
```

**Include `linkedProjectId` in the Save PATCH body:**
```js
body: JSON.stringify({
  // ...existing fields...
  duplicateMatchId: linkedProjectId || null,
}),
```

**`handleSendInvite` function:**
```js
async function handleSendInvite() {
  setInviting(true);
  setInviteError(null);
  try {
    const res = await fetch(`/api/admin/intake/${selected.id}/invite`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send invite');
    setInviteResult(data);
  } catch (err) {
    setInviteError(err.message);
  } finally {
    setInviting(false);
  }
}
```

**"Portal Access" section — add below the Save button, but ONLY render when `selected.status === 'APPROVED'`:**

```jsx
{selected.status === 'APPROVED' && (
  <div className="mt-6 pt-6 border-t border-slate-100">
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
      Portal Access
    </p>

    {/* Part A: Link to project */}
    <div className="mb-4">
      <label className="block text-sm font-semibold text-slate-700 mb-1">
        Linked Project
      </label>
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
        Pick the project, save above, then send the invite below.
      </p>
    </div>

    {/* Part B: Send invite */}
    <div>
      {inviteResult?.alreadyAccepted ? (
        <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
          ✓ {inviteResult.submitterEmail} already has portal access for this project.
        </p>
      ) : inviteResult?.inviteUrl ? (
        <div>
          <p className="text-xs text-slate-600 mb-1">
            Invite ready — copy this link and send it to {inviteResult.submitterEmail}:
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteResult.inviteUrl}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono bg-slate-50"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteResult.inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold whitespace-nowrap"
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

      {inviteError && (
        <p className="text-xs text-red-500 mt-2">{inviteError}</p>
      )}
      {!selected.duplicateMatchId && (
        <p className="text-xs text-slate-400 mt-1">
          Link a project above and save first.
        </p>
      )}
    </div>
  </div>
)}
```

---

## Acceptance checklist

Work through this before opening the PR:

1. `/admin/intake` loads, no console errors
2. Clicking a PENDING submission — "Portal Access" section does NOT appear
3. Clicking an APPROVED submission — "Portal Access" section appears with "Linked Project" dropdown and disabled "Send Portal Invite" button
4. Select a project in the dropdown, click Save → page refreshes or optimistically updates; selected.duplicateMatchId is now set
5. "Send Portal Invite" button is now amber and clickable
6. Click it → invite URL appears in a copyable text field
7. Open `npx prisma studio` → ProjectExternalContact table → confirm a new row exists with the submitter's email, `canViewBudgets=true`, and a non-null `inviteToken`
8. Open the invite URL in an incognito window → `/portal/invite/[token]` shows the set-password form (not a 404)
9. Click "Send Portal Invite" again → either resends (new token, same UI) or shows "already has portal access" if they'd accepted
10. `npm run verify` passes all gates

---

## How to open the PR

```bash
gh pr create --title "Task 27: Intake portal invite bridge" --body "Closes the intake loop: approved submissions can now be linked to a project and the submitter sent a portal invite to view their conceptual budget. Adds Link to Project dropdown and Send Portal Invite button to the admin intake detail panel. New endpoint POST /api/admin/intake/[id]/invite creates the ProjectExternalContact and returns the invite URL for manual copy-paste while email is in dry-run mode."
```

Then ping Sean in whatever channel you use.
