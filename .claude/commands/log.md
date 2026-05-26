---
description: Append a new entry to .claude/coordination.md summarising the current session's significant work, then commit and push
---

Write a new log entry into `.claude/coordination.md` summarising what's been accomplished in this conversation. Steps:

### 1. Identify the user

Run `git config user.email`:
- `operations@ilcstudios.com` → tag the entry as **Sean's Claude**
- `mike@innovateilluminate.com` (or anything else mapping to Mike) → tag as **Mike's Claude**

### 2. Read the current coordination file

Read `.claude/coordination.md` to understand the existing format and what's already logged. Newest entries go at the **top** of the `## Log` section, immediately after the heading.

### 3. Synthesise the conversation

Write a tight entry — 3–5 bullets max, factual and specific. Include:
- Concrete accomplishments (commit SHAs, files changed, decisions made)
- Open questions or things you're waiting on
- Anything worth flagging to the other user's Claude

Follow the entry format already in the file: `### YYYY-MM-DD [time qualifier] — [User]'s Claude` heading, then bullets.

### 4. Update Current State (only if it changed)

If production status, what's blocked, what's deployed, or who's working on what has *materially* changed, update the relevant lines at the top of the file. Do NOT update Current State for routine progress.

### 5. Pull, commit, push

```bash
git pull --ff-only
git add .claude/coordination.md
git commit -m "Coord log: <one-line summary>"
git push
```

If `git pull --ff-only` refuses because main moved, `git pull --rebase` to bring in the latest, then `git push`.

### 6. Confirm

Brief one-line confirmation to the user: e.g., *"Logged at commit `<sha>`. The other Claude will see this on next session start."*

### What counts as worth logging

Append when something is worth the other Claude knowing — a feature landed, a decision was made, an open question surfaced, a gotcha was discovered, or a bug got fixed. **Skip routine micro-steps.** This is a logbook for the other side, not a journal of your own actions.
