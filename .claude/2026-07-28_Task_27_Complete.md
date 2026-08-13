# Task 27 Complete — Intake Portal Invite Bridge
**Date:** 2026-07-28  
**Status:** ✅ Complete, PR #23 open and ready for review  
**Branch:** `manny/intake-portal-invite`  
**Estimated time:** ~3 hours | **Actual:** ~2 hours

---

## Overview

Close the intake loop: approved conceptual submissions can now be linked to a project and the submitter sent a portal invite URL to view their conceptual budget. Admins can send invites directly from the `/admin/intake` detail panel.

**Problem solved:** After approving a submission, there was no way to send the submitter a portal invite. They'd see "we'll be in touch" and then nothing. Task 27 closes that gap.

---

## What Was Built

### Portal Access Section (Approval Path Only)

The admin detail panel now shows a "Portal Access" section **only when status = APPROVED**. It contains:

1. **Linked Project Dropdown** — select which project this submission becomes a portal user for
2. **Send Portal Invite Button** — generates an invite URL and creates a `ProjectExternalContact`
3. **Invite URL Display** — copyable text field (when in dry-run mode, the URL is displayed for manual copy-paste)

### Invite Flow

1. Admin approves submission (status → APPROVED)
2. Portal Access section appears
3. Admin selects a project from dropdown, clicks Save
4. Admin clicks "Send Portal Invite" 
5. System creates `ProjectExternalContact` with `canViewBudgets=true`
6. Invite URL appears in a copyable field
7. Admin copies URL and sends to submitter
8. Submitter visits URL → `/portal/invite/[token]` → sets password → gains portal access

### Edge Cases Handled

- **Contact already exists with token:** Regenerates token and resends
- **Contact already accepted invite:** Shows "Already has portal access" message
- **No project linked:** Button stays disabled until a project is selected and saved
- **Dry-run mode:** Returns invite URL in response for manual copy-paste (email not sent yet)

---

## Files Changed

| File | Type | Changes |
|------|------|---------|
| `src/app/(app)/admin/intake/page.jsx` | Modified | +7 lines: fetch projects, include duplicateMatch |
| `src/app/api/admin/intake/[id]/route.js` | Modified | +1 line: add duplicateMatchId to PATCH data |
| `src/app/(app)/admin/intake/IntakeClient.jsx` | Modified | +85 lines: add Portal Access UI section, invite state, handleSendInvite function |
| `src/app/api/admin/intake/[id]/invite/route.js` | NEW | 75 lines: POST endpoint, creates ProjectExternalContact, returns invite URL |

**Total:** 1 new file, 3 modified files, 168 lines of changes.

---

## Technical Details

### File 1: `src/app/(app)/admin/intake/page.jsx`

Added projects query and included duplicateMatch in submissions:

```js
const projects = await prisma.project.findMany({
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
});

// In submissions include:
duplicateMatch: { select: { id: true, name: true } },

// Pass to client:
return <IntakeClient submissions={submissions} clients={clients} projects={projects} currentUser={user} />;
```

### File 2: `src/app/api/admin/intake/[id]/route.js`

Added `duplicateMatchId` to PATCH body destructuring and data object:

```js
const { status, reviewNote, clientId, duplicateMatchId } = await request.json();

// In update data:
duplicateMatchId: duplicateMatchId || null,
```

### File 3: NEW `src/app/api/admin/intake/[id]/invite/route.js`

**POST endpoint** that:
1. Fetches the submission and its linked project
2. Checks if a contact already exists for this email on this project
3. Creates new contact OR regenerates token if existing
4. Sets `canViewBudgets=true`, `inviteToken`, `invitedAt`, `inviteTokenExpiresAt` (7 days)
5. In dry-run mode: logs and returns the invite URL
6. Returns: `{ success, alreadyAccepted, inviteUrl, submitterEmail }`

**Key logic:**
- If contact exists + already accepted → return "already has access" message
- If contact exists + not accepted → regenerate token
- If contact doesn't exist → create new with 7-day token expiry

### File 4: `src/app/(app)/admin/intake/IntakeClient.jsx`

**New state:**
```js
const [linkedProjectId, setLinkedProjectId] = useState('');
const [inviting, setInviting] = useState(false);
const [inviteResult, setInviteResult] = useState(null);
const [inviteError, setInviteError] = useState(null);
const [copied, setCopied] = useState(false);
```

**New function:**
```js
async function handleSendInvite() {
  // POST to /api/admin/intake/[id]/invite
  // Sets inviteResult or inviteError
}
```

**New UI section** (appears only when `selected.status === 'APPROVED'`):
- Project dropdown (from projects array)
- Send Portal Invite button (disabled until project linked)
- Invite URL display with copy button
- "Already has access" message if applicable
- Error messages

---

## Quality Assurance

### Verify Gates (8/8) ✅
- ✅ Dynamic pages check
- ✅ Schema provider check (sqlite preserved)
- ✅ Env contract check
- ✅ Postgres migrations check
- ✅ Schema ↔ migrations sync
- ✅ Shared metrics check
- ✅ Unit tests: 38 scenarios + 111,997 fuzz checks = 0 failures
- ✅ Secrets scan: no credentials detected

### Pre-Push Hooks ✅
- ✅ Budget math: 38 test scenarios pass, 111,997 invariant checks = 0 failures
- ✅ Bid matrix logic: 12/12 checks pass
- ✅ Secrets scan: no credentials in pending push
- ✅ Push size: 23 files (under 50-file threshold)

### No Breaking Changes ✅
- No schema modifications (fields already existed: `duplicateMatchId`, `inviteToken`, `inviteTokenExpiresAt`, `invitedAt`, `acceptedAt`)
- No changes to existing API contracts
- Backward compatible (Portal Access section only shows for APPROVED submissions)

---

## Testing Checklist for Sean

1. [ ] Navigate to `/admin/intake`, click a PENDING submission
   - Verify: "Portal Access" section does NOT appear
2. [ ] Click an APPROVED submission
   - Verify: "Portal Access" section appears with disabled "Send Portal Invite" button
3. [ ] Select a project in "Linked Project" dropdown
4. [ ] Click Save button
   - Verify: page reloads or updates, submission now shows linked project
5. [ ] "Send Portal Invite" button is now enabled (amber, clickable)
6. [ ] Click "Send Portal Invite"
   - Verify: invite URL appears in copyable text field with Copy button
7. [ ] Open Prisma Studio, check ProjectExternalContact table
   - Verify: new row exists with submitter's email, `canViewBudgets=true`, non-null `inviteToken`
8. [ ] Copy invite URL and open in incognito window
   - Verify: `/portal/invite/[token]` shows password-set form (not 404)
9. [ ] Click "Send Portal Invite" again (resend)
   - Verify: either shows "Already has portal access" or regenerates token
10. [ ] Try creating two submissions for same email on same project
    - Verify: second invite shows "Already has access" (from first)

---

## Dependencies

**No new schema changes** — all required fields already exist:
- ✅ `ConceptualSubmission.duplicateMatchId` (FK to Project)
- ✅ `ProjectExternalContact.inviteToken`
- ✅ `ProjectExternalContact.inviteTokenExpiresAt`
- ✅ `ProjectExternalContact.invitedAt`
- ✅ `ProjectExternalContact.acceptedAt`

---

## Deployment Notes

**What ships:**
- 1 new API endpoint: `POST /api/admin/intake/[id]/invite`
- 3 modified files with Portal Access UI
- 0 database migrations (fields already existed)

**What doesn't:**
- No breaking changes
- No schema changes
- No new dependencies

**Rollback:** Low risk — can remove the feature entirely by reverting the branch with zero data loss.

---

## Summary

✅ Task 27 complete  
✅ All verify gates pass  
✅ All pre-push hooks pass  
✅ No regressions  
✅ Ready for Sean's review

**Submitted by:** Manny (via Claude Code)  
**For review by:** Sean  
**PR:** #23  
**Session date:** 2026-07-28
