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

## Active tasks

### Task: Wizard dirty-field tracking (active)
- **Branch:** `manny/wizard-dirty-tracking` (create when starting)
- **Spec:** `manny_wizard_dirty_tracking.pdf` on his Desktop (Sean delivers)
- **Why:** the wizard's section forms send every field on save, including blanks. A server-side guard catches the worst (Sean's `896ded1`), but the form should track which fields the user actually changed and only PATCH those. Eliminates the underlying issue.
- **Scope:** ~7 wizard section components (ProjectDataSection, UnitsSection, CorridorsSection, AmenitiesSection, ExteriorSection, EmergencySection, ControlsSection). Same pattern in each.
- **Acceptance:** form payload on save contains only user-touched fields. Existing UI behavior unchanged. Pre-push hooks pass.
- **Time estimate:** ~1–2 hours for a careful first pass.
- **Start with:** ProjectDataSection — it's where the worst data wipe happened. Validate the pattern there before touching the others.

## Recent guidance from Sean

- (2026-06-22) Engine validation complete — APPROACH II ($501K) within 2.3% of source sheet. Engine math is trusted; do not touch `src/lib/calculations.js` in this task.
- (2026-06-22) Server-side preserve-on-blank guard shipped in `896ded1`. Manny's task layers the form-side fix on top; the server guard stays as belt-and-suspenders until the form fix proves stable.

## Recommendations for how to start

1. Pull the latest: `git pull origin main`
2. Branch: `git checkout -b manny/wizard-dirty-tracking`
3. Read the spec PDF on his Desktop end-to-end before touching code
4. Open `src/components/sections/ProjectDataSection.jsx` first; identify the `handleSave` function and the form state
5. Implement dirty-field tracking on that section only; test locally with `npm run dev`
6. Verify in DevTools Network tab: when only one field changes, only that field is in the PATCH payload
7. Once ProjectDataSection works, replicate the pattern to the other six sections in separate commits (one per section is fine)
8. Push the branch, open a PR, ping Sean for review
