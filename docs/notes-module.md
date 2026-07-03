# Notes Module — Design & Build Record

_Last updated: 2026-06-23. Owner: Mike. Status: unified table built + both features repointed + unified search done (debugged). Next: action extraction (#3 below)._

This document records how the ILC Notes module is being built — the decisions, the data model, and the roadmap — so we have a permanent reference.

---

## 1. Goal

Take Mike's raw thoughts from a sales meeting and turn them into **structured, actionable follow-ups for the Sales Bot** — while keeping note capture fast and natural. Secondary goal: make **Sales Notes** and project **Meeting Notes** one searchable system.

---

## 2. What the real notes look like (Keep export analysis)

Analyzed Mike's full Google Keep export — **354 notes, 235 archived**, plus the calendar Takeout.

- Notes are **action-item lists**, not prose paragraphs. Example:
  > **Bob from Brinkmann** — talk to Ron about The Felix · intro to Tom at Holland · make sure Bob is on golf list · intro to Jeff Ayres
- Dominant activity: **introductions** ("intro" appears in 167 notes), plus talk-to / set-up-coffee / send-deck / add-to-golf-league.
- Titles are inconsistent (person name, project name, or activity).
- **Key finding:** title is unreliable for classification — notes titled "Archery dodgeball" still contain real sales actions. **Classify on content, not title.**
- Many lines are **relationship intel** ("Sibbel does multi-family"), not to-dos — these must NOT become follow-ups.

### Calendar correlation
The Takeout `.ics` holds **9,200 events, ~946 business** (coffee/lunch/golf/happy hour) back to 2016, with `SUMMARY` encoding activity type + names ("Coffee: Mike (ILC) / Casey (Weitz)"). A yearly summary confirms cadence: ~100–140 in-person business events/year. → A note can be **auto-matched to its calendar event** by date + name to self-populate contact, date, and activity type.

---

## 3. Data model — unified `Note` table

The two note types are merged into one table (no real data existed, so zero migration risk). Migration `0035_unified_note`.

`Note` (superset):
- **Discriminator:** `noteType` = `SALES` | `PROJECT_MEETING`
- **Shared:** `title`, `body`, `meetingDate`, `attendees`, `createdById`, `isPublished`/`publishedAt`, timestamps
- **Sales-specific:** `activityType`, `isInPerson`, `classificationSource`, `classificationConfidence`, `noteNumber`
- **Meeting-specific:** `meetingLink`, `isExternalVisible`
- **Links:** `projectId` (nullable) + join tables `NoteContact` / `NoteClient` / `NoteDeal` (a note can attach to a project AND/OR clients/deals/contacts)

Retires the old `SalesNote` (+ `SalesNoteContact/Client/Deal`) and `MeetingNote` tables.

**Why one table:** cross-searchable in one place, notes can be cross-linked, and there's a single feed for the bot pipeline.

### Keeping each UI/UX
Nothing visible changes. Each screen queries `Note` filtered by `noteType` and renders its own form:
- **Sales Notes** (`/crm/notes`) → `noteType='SALES'` (activity type, publish gate, client/deal/contact links, AI classification).
- **Project → Meeting Notes** → `noteType='PROJECT_MEETING'` + `projectId` (title, content→body, meeting link, external-visible).
- A **unified search** queries the one table and links each result back to its native screen.

---

## 4. Prose → actions (the actionable part)

**Principle: keep writing prose; the system structures it.** On publish, Claude reads the note (+ meeting context) and extracts each line into a typed **action** with linked contacts. Mike reviews/edits the proposed tags (one click), then they flow to the Bot Queue. Fast capture *and* structured output — not "less prose."

Each extracted action:
```
{ type, contacts[] (from CRM), company/project, rawText, dueDate?, status }
```
Intros carry two contacts (from → to).

### Two buckets
- **Actions** → become Bot Queue follow-ups / tasks.
- **Intel** (facts about a person/company) → land on the contact/company as knowledge; never generate a follow-up.

### Action taxonomy (the "big list" for the bot knowledge module)
**Introductions** — Inbound intro (they → me to X) · Outbound intro (I → them to X)
**Touchpoints** — Set up coffee/lunch/breakfast/happy hour/drinks · Schedule meeting with their colleagues · Add to golf league (email list + calendar event)
**Reach-outs** — Reach out to a referral they flagged · Send materials (capabilities deck / TI / pricing / case study) · Connect on LinkedIn
**Project / pipeline** — Get drawings for a project · Get info for a project · New lead/opportunity → create a Deal · Budget/quote request
**Internal** — Ask/remind a teammate · Research a company/person
**Intel** — Relationship fact about a person/company (knowledge, not a to-do)

### Bot knowledge module
The taxonomy is the source of truth; each action type carries a **"how to execute" recipe** (e.g., Outbound intro → double-opt-in intro email template; Add to golf league → add to distribution list + create calendar invite; Send TI deck → attach standard deck). The bot knows *what* and *how*.

---

## 5. Build roadmap

1. **Unified `Note` table** — ✅ built (migration `0035`), schema valid.
2. **Repoint** Sales Notes + project Meeting Notes onto `Note` + unified search (`/api/notes/search`) — ✅ done & debugged. Meeting APIs converted from raw SQL → `prisma.note` with `content ↔ body` aliasing so the UI is unchanged. (Cleanup TODO: drop the now-unused `SalesNote`/`MeetingNote` tables.)
3. **`NoteAction` extraction** — ✅ built & tested. On publish (or a manual "Extract" button), Claude (`extractNoteActions`, Haiku 4.5) turns the note's prose into typed `NoteAction` rows (taxonomy in `src/lib/noteActions.js`), splitting ACTIONS vs INTEL and resolving people to CRM contacts. Reviewed/confirmed/dismissed as chips in the note detail (`/api/crm/notes/[id]/actions`). Live test on a real Keep note correctly produced INTRO_OUTBOUND / GOLF_LEAGUE / SETUP_MEAL and flagged "X does student housing" as INTEL. _Next layer: hand confirmed actions to the Bot Queue as drafts/tasks._
4. **Calendar auto-link** (future) — match a note to its calendar event to auto-fill contact/date/activity type. **Easy once on Microsoft 365:** Microsoft Graph's calendar API returns events with subject/start/attendees, so matching is a clean API call (no Takeout `.ics` parsing).

---

## 6. Key decisions log
- **Merge into one table** (not two + a search view) — chosen because there's no data to migrate and it enables cross-linking + one bot feed.
- **Classify on content, not title** — Keep analysis showed titles are unreliable.
- **Prose-in, AI-structures-out, human-confirms** — preserves fast capture while producing structured tags/actions.
- **Actions vs Intel split** — prevents relationship facts from generating spurious follow-ups.

---

## 7. v2 — Admin-controlled, method-based taxonomy (Session 38)

The intent-based taxonomy in §4 was replaced by a **method-based** one stored in the
DB (`NoteActionType`) and managed by an admin at **`/admin/note-actions`**. The type now
names the **executor** — what the bot does — so classification maps cleanly to execution.

**Default types (auto-seeded, templates blank for the admin to fill):**
Email · Text · Call · Schedule an event · Expect intro (email/text) · Send materials
(DocSend links built into its template) · Add to list (e.g. golf league) · Internal task ·
Intel (fact, no action) · Other.

**Per type:** `label`, `executor`, `kind` (ACTION/INTEL), `description` (feeds the AI
classifier), `emailTemplate` (message methods only — blank to start), `instructions`
(how the bot executes), `sortOrder`, `isActive`.

**Expect-intro reminder (not hardcoded):**
- Admin default `NoteActionType.reminderDays` (seeded 7).
- Per-line-item override `NoteAction.reminderDays` — editable on the action; falls back to the type default.

**Wiring:** `extractNoteActions(note, candidates, actionTypes)` is now DB-agnostic — the
route loads active types via `getActiveActionTypes()` and passes them in; the prompt is
built from the live taxonomy. The note dropdown fetches `/api/crm/note-action-types?active=1`.
API: `GET/POST/PATCH/DELETE /api/crm/note-action-types` (GET any authed user, writes admin-only).

**Built (Session 38 cont.):**
- **Permission + placement:** taxonomy editor lives on the Sales Automation tab (`/sales/automation/actions`), gated by the new **Sales Admin** permission (or Super Admin) — `isSalesAdmin`/`requireSalesAdmin`, toggle in Admin → Users, exposed via `/api/auth/me`.
- **Contact-tag chips** on actions (link/relink/unlink to a CRM contact).
- **Relationship Intel** view (`/crm/intel`, `/api/crm/intel`): searchable/filterable, link-to-contact, confirm/dismiss. This is "where intel goes" — aggregated, attached to people, confirmable as verified knowledge.
- **Light-theme restyle** of the Sales Notes screen.
- **Bot Queue executor** (`executeNoteAction.js`): confirm → message methods draft a `BotDraft` (FOLLOW_UP) from the template; Expect-intro schedules `remindAt`; processor `/api/bot/process-note-actions` fires due reminders. `NoteAction` gained `confirmedAt/executedAt/remindAt/botDraftId` (migration `0038`).

**Built (Session 38, automation refactor):**
- **Zapier-style engine** `src/lib/bot/ruleEngine.js` — `TRIGGERS` (note/email/calendar) + `ACTIONS` primitive registry + `evaluateConditions` + `runTrigger()` (baseline + user rules + `AutomationLog`). Note-action confirm now flows through it. See memory `project-automation-architecture`.
- **If-Then builder** `/sales/automation/triggers` (Sales-Admin): When→If→Then composer, rule list, learning scorecard (accept/edit/reject per rule). APIs: `rule-meta`, `activity`, reuse `bot-rules`.
- **Learning loop** `AutomationLog` (migration `0040`); outcomes from queue edit→EDITED, cancel→REJECTED.
- **Intake layer (app side of M365 sync)** `src/lib/bot/intake.js` + `POST /api/automation/intake/{email,calendar}` — normalize raw payloads → `runTrigger`. M365 Graph will POST here later.
- **Testable without M365:** `runTrigger` `dryRun` mode + `POST /api/automation/test` + a "Test a trigger" panel in the builder (dry run shows matches; run-for-real queues drafts).

**Still pending:** wire the reminder processor to the `CRON_SECRET` cron · connect M365 Graph to the intake endpoints (delta poll / webhooks) · record ACCEPTED when live send (Phase B) lands · real `CREATE_TASK`/`ADD_TO_LIST` integrations · richer queue rendering for note-action drafts.
