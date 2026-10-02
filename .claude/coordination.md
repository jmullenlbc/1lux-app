# Claude Coordination Log

Cross-session memory for the ILC platform. Read this at session start to see what the other user's Claude has been up to. Append (newest at top) after meaningful work. See project-root `CLAUDE.md` (section: Cross-Session Claude Coordination) for the rules.

### 2026-10-01 (newest) - Mike's Claude - **DEPLOYED a97e404**, migration 0113 (additive): courtyards count 2 poles each, Email Template rules

- Unmeasured courtyard = 60 ft each (2 poles); public intake asks a courtyard count (`figureCourtyards`). `COURTYARD_FT_EACH` in `siteFeatureWords.js`.
- `MessageTemplate` gains `serviceType`, `pipeline`, `contactRole`, `topicWords` (all nullable); `templateMatch.js` filters and tie-breaks on them; `followUpDrafter.js` passes the context.

### 2026-10-01 (later, 99042af) - Mike's Claude - **DEPLOYED 99042af**, migration 0112: Voice Training 250 emails, refilling templates, templates feed the email writers

- Relearn studies 250 emails; Save or Not useful on a template suggestion triggers a parked refill (`/api/sales/voice/templates/refill`) so 8 stay on screen. `VoiceTemplateSuggestion.topic` (0112, additive) stops near twins.
- New `templateMatch.js` / `templatePick.js`: follow-up, recap/nudge and keep-in-touch writers hand the closest MessageTemplate in as a skeleton (stage match, then topic words, then scenario default).
- Big orange Relearn button at the top of Voice Training. Mike presses Relearn once in prod.

### 2026-10-01 (later, 64478ba) - Mike's Claude - **DEPLOYED 64478ba**, no migration: away rules widened (out sick, office closed, hand-off lines)

- `autoMail.js`: OOO_LEAD now catches any "I will be out / away / unavailable" line, out sick, out of town, team away lines; new OFFICE_CLOSED and AWAY_REDIRECT (names under a hand-off line go too); `isAwayTemplate` (name, subject, body) guards template suggestions when written and when retired.
- Mike presses Relearn once in prod.

### 2026-10-01 (later, eae3c50) - Mike's Claude - **DEPLOYED eae3c50**, no migration: Voice Training away sentences removed, templates per group

- `stripAwayLines`/`isAwaySentence` in `src/lib/tone/autoMail.js` cut out-of-office and focus-time sentences from every email, on save and retroactively on Relearn (`putAsideAutoMail` rewrites VoiceSample.body; under 40 chars left is archived OUT_OF_OFFICE). Away template suggestions go REPLACED; saved ones get MessageTemplate.isActive=false.
- Template suggestions now one model call per topic group (they came back empty when all 8 were asked for in one answer). Same-topic groups merge.
- Mike presses Relearn once in prod to clean his 1241 emails.

### 2026-10-01 (later, 88ff4ec) - Mike's Claude - **DEPLOYED 88ff4ec**, migration 0111: Voice Training auto mail, resume, Q&A, topics
- 0111_voice_auto_mail: adds a nullable column `archiveReason` to `VoiceSample` (OUT_OF_OFFICE | CALENDAR | KEPT). VoiceBatch.source comment now lists INTERVIEW. Additive only (schema-guard PASS). Next migration 0112.
- Out-of-office and calendar mail left out at read, save and paste (`src/lib/tone/autoMail.js`); Relearn archives saved ones, "Set aside" card with Put back. Big .mbox files resume where they stopped. Q&A starter (`src/lib/tone/interview.js`, 12 situations, source INTERVIEW).
- `voiceInsights.js`: Top 20 sentences, "over and over" grouped by topic (one per thread, names left out), "How you get personal" kinds passed to the bot with a never-invent guard.
- After deploy: each person presses Relearn once.

### 2026-09-30 (later, 7c77722) - Mike's Claude - **DEPLOYED 7c77722**, migration 0110: Market Intel ask box
- 0110 (additive, schema-guard PASS 9-27): tables MarketQuestion, MarketAnswerRow (FK Client), MarketAnswerYear, MarketAnswerSource. Next migration 0111.
- Market Intel page: ask any market question (any US metro, open web only). `src/lib/market-intel/ask.js` (job `marketIntel.ask`, web search), park-and-poll `/api/market-intel/ask`; year totals and order computed in `ranking.js`, never by the model. Add to CRM is a button, never automatic. Questions archive-only.

### 2026-09-30 (later, 6fe0161) - Mike's Claude - **DEPLOYED 6fe0161**, no migration: alerts test fixed and gated
- `scripts/tests/alerts.test.mjs` failed 7/13: its fake Prisma had no `alertMute`, which `notifyUser` checks before every write since 0093 (c8d8393). Real client has it, so prod alerts were never affected; `src/lib/alerts.js` unchanged. Fake now supports mutes, +3 mute tests, file added to the verify.mjs unit-test list.
- Pushed ONLY those 3 files (verify.mjs and CHANGELOG staged hunk by hunk). Still NOT deployed, left in the working tree: Market Intel ask box + migration 0110 (incl. its `marketAsk.test.mjs` entry in verify.mjs). Next migration 0111.
- Tip: two sessions running `next build` in this folder at once clobber `.next` (ENOENT on rename). Run one at a time.

### 2026-09-30 - Mike's Claude - **DEPLOYED e54bf43**, no migration: Voice Training progress bar and read failures
- Voice Training drop area: one progress bar across all files (GB read, emails found, time left), plus saving and relearn. Leaving mid-read asks first.
- Chrome's "network error" on Mike's single 38 GB Takeout = the browser lost read access to the local file (still downloading, moved, or a streaming Drive/OneDrive folder). A failed read now SAVES what it read (`partialEmails` on the error, `src/lib/tone/mbox.js`), tries once more, then says how far it got. Save POSTs retry 3x; duplicates skipped.
- NOT in this push (Mike: not yet): Market Intel ask box + migration 0110, still in the working tree. Also left out: another session's `scripts/tests/alerts.test.mjs` + its CHANGELOG entry. Next migration 0111.

### 2026-09-27 (later, 9889c52) - Mike's Claude - **DEPLOYED 9889c52**, migration 0109: voice weighting, insights, template suggestions
- 0109 (additive, schema-guard PASS): table `VoiceTemplateSuggestion` (FK User cascade, FK MessageTemplate set null). Next migration 0110.
- Voice library: newer emails weighted (8x last 3 months down to a quarter over 5 years); mailbox read keeps up to 1250 spread over every year, not the newest 500. Takeout .zip parts read in the browser.
- Voice screen: top 10 phrases, how the writing changed by period, repeated emails written up as templates (save copies into MessageTemplate). One extra AI call per relearn (`user.voiceTemplates`).

### 2026-09-27 (later, 4dffcc9) - Mike's Claude - **DEPLOYED 4dffcc9**, migration 0108: shared notes
- 0108 (additive, schema-guard clean): tables `NoteOwner` + `NoteChange`, columns `NoteAction.leadUserId` (nullable) + `BotDraft.senderPending` (default false). Backfills each note's creator as first owner.
- Owners multi-select on a note; step lead (none = every owner); History box; shared-note follow-up waits for a sender pick (409 on /send until picked). `AlertMark.jsx` is the one alert symbol.
- Calendar sync: every salesperson on the invite owns the note (`pickSalesOwners`).
- FOR SEAN: Outlook hookup doc in the shared drive, WAIT until the 1Lux move. Next migration 0109.

### 2026-09-26 (later, 01a0a4b) - Mike's Claude - **DEPLOYED 01a0a4b**, no migration: company page on phones
- `/clients/[id]`: tabs scroll sideways, header chips/Export hidden on phones, Info grids stack, Call/Email buttons per person on phones, hover-only buttons (`md:opacity-0 md:group-hover:opacity-100`) now visible on touch.
- Project pages ON HOLD (Mike). Next migration still 0108.

### 2026-09-26 (later, 1fcc9d1) - Mike's Claude - **DEPLOYED 1fcc9d1**, no migration: phone layout
- Bottom bar on phones (`MobileTabBar.jsx`: Desk / Notes / People / Search / Menu); Menu fires `ilc:open-menu` and `Sidebar.jsx` slides out.
- New `/search` page + `GET /api/search?q=` (people, companies, projects; 403 for client viewers).
- Notes list/detail stack on phones; People table hides 4 columns on phones; floating buttons lifted.
- Home screen icon: `public/manifest.webmanifest` + `public/icons/`, linked from `src/app/(app)/layout.jsx` metadata ONLY (public intake/portal never get it).
- Next: company page (`/clients/[id]`) phone pass. Project pages on hold (Mike). Next migration still 0108.

### 2026-09-26 (later, fcd42f7) - Mike's Claude - **DEPLOYED fcd42f7**, **migrations 0106 + 0107**: check-in emails + Quick Note + My Desk flags
- 0106 `BotDraft.contactId`: check-in drafts (type CHECK_IN, emailKind KEEP_IN_TOUCH) written a DAY AHEAD by `/api/cron/note-reminders` (20s budget); desk "Write email" does one by hand; snooze withdraws unedited ones. Rules `src/lib/checkIns/`.
- 0107 `ClientContact.ownerId` (FK User, SetNull) + `Note.peopleSkippedAt`. Owner order: person, company, last note writer, active users only (`pickOwner`).
- Quick Note on My Desk (`src/components/desk/QuickNote.jsx`), kept in localStorage `ilc.quickNote.v1` until publish succeeds.
- Desk flags: "Met someone not in the system" (own in-person SALES notes, last 7 days, `src/lib/desk/needsPerson.js` + `meetingPeople.js`) and "Nobody looks after these people" (company-wide, everyone sees it, Mike 9-26; `takeContact` 409s if already owned).
- Nothing auto-sends. Next migration: 0108.

### 2026-09-26 (later still) - Mike's Claude - **DEPLOYED 101d8ed**, **migration 0105**: My Desk (`/sales/desk`)
- One place per salesperson: reminders (own published notes' CONFIRMED ACTION steps), PENDING_REVIEW BotDrafts (shared `src/components/sales/DraftCard.jsx`), check-ins due, notes to finish.
- `NoteAction.snoozedUntil` / `pausedAt` (0105). Snooze sets remindAt = snoozedUntil, clears remindedAt. Pause: `sendDueWaitReminders` and `/api/cron/note-reminders` both filter `pausedAt: null`; an unshared PENDING_REVIEW nudge draft is cancelled.
- Rules pure in `src/lib/desk/desk.js`; `actOnStep` = note owner or admin only. Bell links now go to `/sales/desk`.
- Dashboard card `kind: 'desk'` (chartType DESK) on SALES; reaches existing dashboards via `appendMissingPrebuilt`.
- Bot Queue removed from the sidebar (page still at /sales/bot-queue).
- Next migration: 0106.

### 2026-09-26 (newer) - Mike's Claude - **DEPLOYED 4bd2555**, no migration: Intel shows under each person ("Notes and personal" toggle, read-only "Noted in meetings" list via `/api/crm/intel?contactId=`). Intel stays notes only, never steps (Mike). `/api/crm/intel` now 403s client viewers. Next migration still 0105.

### 2026-09-26 (later) - Mike's Claude - **DEPLOYED 4246e70**, migrations 0102 + 0103 + 0104 in one push. Activity to-dos now also save the interest ("Likes to golf"). Next migration 0105. Mike must re-upload his Sent .mbox on Voice Training in prod.

### 2026-09-26 (earlier) - Mike's Claude - **migration 0104**: personal facts, signature name/office line, Outlook uploads
- `ContactPersonalFact` rows (archive-only, staff-only). Filled by `readNote()` in `extractNoteActions.js` (same AI call now returns `{actions, personal}`; `extractNoteActions()` still returns actions only) via `savePersonalFacts()` from publish + re-extract. Meeting Prep block `personal`; writers use `personalPromptFor()`.
- User.signatureName / officePhone / officeExt; `{office}` in the default signature layout. A saved company layout without `{office}` never shows it.
- `src/lib/tone/outlook.js`: browser-side .pst (Unicode only) / .olm / .msg readers. Sources PST/OLM/MSG (string column, no migration).
- Next migration: 0105.

### 2026-09-26 (later) - Mike's Claude - built, NOT deployed, **migration 0103**: Voice Training library + company signature layout
- VoiceBatch / VoiceSample / EmailSignatureTemplate (0103). Samples are rows; dedupe by `sampleHash` before createMany (no skipDuplicates on SQLite). Not covered by the db.js archive filter: active = `{archivedAt:null, batch:{archivedAt:null}}`.
- Relearn is parked: `/api/sales/voice/rebuild`, call with `postParked`. Upload/archive routes never call the model.
- `senderVoice(userId)` (`src/lib/bot/voice.js`) = user + company signature layout + 4 real samples; used by composeOutreach, followUpDrafter, ruleEngine DRAFT_EMAIL.
- `ownWords` now strips typed/picture signatures and two-line "On ... wrote:".
- Next migration: 0104.

### 2026-09-26 - Mike's Claude - built, NOT deployed, **migration 0102**: bot email style (no dashes, bullets, per-salesperson signature + tone)
- `src/lib/bot/emailStyle.js` (pure): stripDashes, signatureBlock, toneSection, PLAIN_VOICE_RULES. Used by composeOutreach, followUpDrafter, ruleEngine.
- Draft sender = `group.ownerUserId` (engine passes `note.createdById`). Edit lessons now filtered by that userId.
- User.jobTitle / User.phone (0102). Signature is appended by code; the model is told to stop at the sign-off.
- Tone .mbox parsed in the browser (`src/lib/tone/mbox.js`), POSTed as JSON. Route still accepts small legacy formData.
- Next migration: 0103.

### 2026-09-25 (deploy) — Mike's Claude — DEPLOYED 59a6955: 9-24 + 9-25 sales notes / Meeting Prep / follow-up watch, **migrations 0100 + 0101**
- Ships everything in the three entries below, plus: recap subject "Coffee follow-up" style (never "today/yesterday"); recap + check-in emails learn from human edits (`src/lib/bot/editLearning.js`, BotDraft.aiSubject/aiBody/emailKind, 0101); Reminder Timeline editable by the sales team (`isSalesTeam` in auth.js).
- **@Sean (still open):** EventBridge for `/api/cron/note-reminders` (daily) and `/api/cron/meeting-prep` (every 30 min). Graph attachment expansion for filenames.
- Next migration: 0102.

### 2026-09-25 (later) — Mike's Claude — built, NOT deployed, **migration 0100**: meeting follow-up watch + Reminder Timeline
- Publishing a sales note now confirms its next steps, drafts the recap email, and starts "waiting" steps (they reply / send drawings / send an invite / make an intro). Incoming email + calendar sync close a step when it arrives and cancel any unsent check-in draft. `src/lib/followUp/watch.js` (pure rules) + `engine.js` (sweep, ladder).
- If nothing comes, a check-in draft (PENDING_REVIEW, never auto-sent) is made on a day ladder, default 14/30/60, editable at `/sales/automation/timeline` (Sales Admin / Super Admin).
- **@Sean:** `/api/cron/note-reminders` must run **daily** for the ladder sweep. The meeting-prep cron from the entry below still needs its EventBridge rule too.
- **@Sean:** Graph mail sync should expand attachments so filenames reach the watcher; fallback today is the `hasAttachments` flag + a files word in the subject/body.
- Trap fixed: `composeOutreach.js` stamps `executedAt` on every action in the recap group incl. wait steps, so `noteActionRunner.js` now judges wait steps by `remindAt/reminderCount/fulfilledAt`.
- Notes are archive-only again — the SALES-note DELETE built earlier today was taken back out (Mike). `crmArchive.test.mjs` wording is correct as-is.
- Demo (local SQLite only, refuses otherwise): `node --env-file=.env --import ./scripts/demo/alias.mjs scripts/demo/coffeeWithLee.mjs`. Tests: `scripts/tests/followUp.test.mjs` (14), in verify.

### 2026-09-25 — Mike's Claude — built, NOT deployed, no migration: Sales Meetings screen (Prep + Notes tabs), accepted-invite rules, salesperson owner, calendar link, delete
- Accepted invites only; decline/cancel after accepting archives the draft (sync archive has `archivedById: null`, so a re-accept restores it). Owner = SALES_MARKETING person on the invite. Hand-made notes with a matching `meetingLink` are adopted by the sync. Screen rebuilt as an agenda with Prep/Notes tabs; archive + real DELETE open to everyone for SALES notes.
- **@Sean:** new `GET /api/cron/meeting-prep` (x-cron-secret) builds briefs for meetings in the next 48h. Needs an EventBridge rule, every 30 min is plenty.
- `recorder.js` now uses relative imports and loads the AI classifier lazily (so tests can run it with a fake db).
- `crmArchive.test.mjs` still passes (non-SALES notes still 405 on DELETE) but its wording still describes notes as archive-only — Mike to approve updating it.

### 2026-09-24 (late) — Mike's Claude — built, NOT deployed, no migration: sales notes + Meeting Prep fixes
New sales-note button (was 400), people on notes saved/shown, last-met on publish only, calendar guests kept, meeting time kept, calendar sync no longer locked out by opening a draft, stats count finished notes only; Meeting Prep keeps the note's own people, skips archived/drafts, real error on unreadable AI reply. New `src/lib/noteLinks.js`, `src/lib/noteAttendees.js`, `scripts/tests/salesNotes.test.mjs`. Still missing (needs Mike/Sean): any live calendar feed — nothing calls `POST /api/automation/intake/calendar`.

### 2026-09-24 (after deploy) — Mike's Claude — 🚀 DEPLOYED 23ec391, no migration: size-aware (20% vs questionnaire, 30% of normal size) questionnaire alerts + test logins moved to .env
- **@Sean:** `npm run verify:dn`, `verify:mcp` and `verify:smoke` now need `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` in your `.env` (the admin login used to be typed in the test files). Mike is changing the live admin password.

### 2026-09-24 (late night) — Mike's Claude — 🚀 **DEPLOYED 3ee8c00: migrations 0098 (figure sources + ConfirmedGuess) + 0099 (ProjectAreaCheck)** — learn only from real numbers, on-screen figure alerts, per-area budget alerts (staff only), STAGING stripe. Both migrations additive. `verify --full` passed (15 gates). **Next free migration is 0100.**
- **@Sean:** staging stripe turns on with `NEXT_PUBLIC_APP_ENV=staging` on the staging app. Live shows nothing.

### 2026-09-24 (night) — Mike's Claude — built, NOT deployed: per-area budget alerts (**migration 0099**, additive `ProjectAreaCheck`) + the STAGING stripe
- **@Sean:** the STAGING stripe is built. It turns on from `NEXT_PUBLIC_APP_ENV=staging` on the staging branch (or any host containing "staging"). Nothing else needed from you for it; live shows nothing.
- 0098 + 0099 both waiting on Mike's "Deploy". **Next free migration is 0100.**

### 2026-09-24 (evening) — Mike's Claude — 🚀 **DEPLOYED 53ec878 + 64ff93f: Mill Creek feedback (Modera Town Lake) + migration 0097** (data-only: master pricing sheet `controls.cap` 180000 → 190000, only if still 180000). **Next free migration is 0098.** Balconies 0/1 per unit (`src/lib/unitRules.js`), whole baths + bath ladder (drawings → typed → bedroom rule 1/1/1/2/2 → 1 per unit), controls $/SF math on the public page/PDF (the ONE approved math exception, `controlsWords.js`), design choices under the breakdown + on the PDF, per-level amenity SF from area-by-level tables (`amenityLevels`, prompt `unitMatrix-2026-09-24b`), exterior amenity SF required when not read, Download PDF at the top of the public summary. 0097 already applied to local SQLite.

### 2026-09-24 — Mike's Claude — 📋 **FOR SEAN: set up a staging copy of the app** (Mike approved 9-24)
Mike wants a staging site he can flip to from inside live. **Sean's console steps (Mike's Claude can't do these):**
1. **Amplify:** connect a new `staging` git branch to the same Amplify app (Mike's Claude will create the branch from `main`).
2. **Domain:** add subdomain `staging.app.ilcstudios.com` (or whatever Sean prefers — tell us) pointing at that branch.
3. **Database:** create a SECOND small Postgres (separate from prod — staging must never touch real clients/deals). Put its URL in the staging branch's `DATABASE_URL`. `amplify.yml` already runs `migrate deploy`, so it builds its own schema.
4. **Env vars on the staging branch:** copy prod's, but with a **different `JWT_SECRET`** (a staging login must never open live) and add `NEXT_PUBLIC_APP_ENV=staging`. Point S3 at a separate prefix or bucket if easy; email/SES should stay OFF on staging.
5. Reply here with the staging URL when it's up.
**@Sean — message from Mike (9-24):** Mike wants this so he can test new features (starting with Unit Selections fake data) before real users see them. No rush on timing, but please reply here with (a) a rough ETA, (b) the subdomain you picked, and (c) the monthly cost of the second database once you know it.
**Mike's Claude will build (hidden until staging exists):** admin-only "Live ⇄ Staging" toggle in the top bar that jumps to the same page on the other copy; a "STAGING" stripe on every staging page; deploy flow = push `staging` first, then promote to `main`. **Until staging exists, "Deploy" still means straight to live (Mike 9-24).**

### 2026-09-23 (late night) — Mike's Claude — 🚀 **DEPLOYED 2026-09-24 (2f12659): Unit Selections redesign + migration 0096** (`UnitSelectionResponse.userId`, nullable + index). Next free migration is **0097**. Survey now: pick-a-look boards (`src/lib/unitSelections/looks.js`, import-free) + one finish + walk-the-unit floor plan + heart/X cards + who-agrees grid; caller auto-answers via responses POST `{me:true}`; skipped fixtures added back via survey `overrides.include` (engine brings them in at medium). Outsiders see "≈ $X est." (rounded CN). 0096 applied to local SQLite + `prisma generate` run.

### 2026-09-23 (night) — Mike's Claude — ✅ **DEPLOYED dc52923**: removed the amber "Your project is ready" banner from the project page (`ProjectHubClient.jsx`, state + localStorage `budget_nudge_*` effect gone). No migration; next free is still 0096. Unit Selections screen is being redesigned next (Mike: floor-plan "walk the unit" + this-or-that cards + pick-a-look), not deployed.

### 2026-09-23 (evening) — Mike's Claude — ✅ **DEPLOYED 0bbd018**: Maram's cards (below) + project-page crash fix + probability pick list — **no migration. Next free migration is still 0096.**

**Prod bug fixed:** every project page threw "PrismaClient is unable to run in this browser environment". Chain: `ProjectHubClient` → `NotificationSettingsTab` ('use client') → `src/lib/notify.js` → `@/lib/db`. The constants `NOTIFICATION_TYPES`/`NOTIFICATION_MODULES` moved to the pure `src/lib/notificationTypes.js`; `notify.js` re-exports them. New verify gate `no prisma in browser` (`scripts/check-client-prisma.mjs`) walks every 'use client' import graph and fails on `@/lib/db` / `@prisma/client`. **Sean: never import notify.js (or anything that reaches db.js) from a browser component.** Also: probability to win / move forward are pickers of `PROBABILITY_STEPS` = 5/20/50/80/90/100 (`src/lib/pipeline.js`); off-list saved values are kept as an extra option. verify --full 15/15.

### 2026-09-23 (later) — Mike's Claude — Maram's Procurement Revenue cards (deployed in the evening entry above), no migration

Source: 9-16 Gemini notes docx on Mike's Desktop — a screenshot of Maram's Pipedrive "Procurement Revenue" dashboard + the buyout / on-hold discussion. Five Sales cards added to `TEMPLATES_BY_SECTION.SALES` with a new `dataSpec.tpl` identity: `prebuiltKey()` returns `tpl:<name>` for them, so `appendMissingPrebuilt` puts them on every existing Sales dashboard (personal copies too) and a removed one stays removed, but they stay ordinary editable field charts (no `kind`). Engine: `timeBucket: 'next12'` (this month + 11, $0 months kept), `cumulative`, `hideZero`, filter op `in`. Editor now keeps a card's `filters`/`cumulative`/`tpl` through a save — before, `specFromWidget` silently dropped `filters`. `fieldCatalog.js` now imports `../utils.js` / `../pipeline.js` relatively so the engine loads under plain `node --test`. verify 12/12; new `procurementForecast.test.mjs` + `dashboardPrebuilt.test.mjs` now in the unit-test gate.

### 2026-09-23 — Mike's Claude — ✅ **DEPLOYED c8d8393**: everything built 9-19 plus today's widget save fix. **Migrations 0092 + 0093 + 0094 + 0095** (all additive, no DROP). **Next free migration is 0096.**
- **Mike 9-23:** "Yes" to "Deploy everything now?"
- **Debug pass before the push:** `verify --full` 14/14 (incl. production build + runtime assets), smoke 7/7, upload-flow e2e 4/4.
- **Widget save fix:** the 9-18 fix went into the old `/crm/dashboards` screen (not in the nav). The live one is `/dashboards/[section]/DashboardView.jsx`. Three faults: (1) legacy widgets (`dataSpec` null) opened with Save disabled, and now save title/width only unless a measure is picked; (2) a failed save closed the editor silently, and now the error shows in red; (3) the fork mapped widgets by position only, and positions repeat, so it now matches position + name.
- **Unit Selections is live but steps 5–8 are unbuilt on purpose**, waiting on Mike's review of the flow. The seeded fixture prices are placeholders.
- **Sean:** `MCP_API_TOKEN` in Amplify env is still needed, plus the EventBridge rule for the usage rollup.
- **Open:** Maram's procurement-revenue widget list. Mike says it is in last week's call transcript; not located yet.

### 2026-09-19 (unit selections) — Mike's Claude — 🔧 **BUILT LOCALLY, NOT DEPLOYED**: Unit Selections steps 1–4 — **migration 0095** (additive: 6 models). **Next free migration is 0096.** ⛔ **STOPPED ON PURPOSE at step 4** — the plan's own instruction: *"Stop after 4 and show Mike. Steps 5 through 8 are worthless if the flow is wrong."*
- **Mike 9-19 verbatim:** *"Yes knock them all out so we can push those to Z_COMPLETED."* Last item in his build order. Ships in the same push as 0092 + 0093 + 0094.
- **The pure/DB split is mandatory here and the tests enforce it.** `src/lib/unitSelections/engine.js` imports only `../pricing.js` — no `@/`, no Prisma — because `scripts/tests/*.test.mjs` run under plain `node --test` with relative `.js` imports, and **a module using an `@/` alias cannot be loaded by a unit test at all**. `index.js` holds `@/lib/db` + `@/lib/pricing` + `@/lib/pricingLoader` and re-exports with `export * from './engine.js'`. Same convention as `src/lib/calibration/`.
- **`eligibleOptions` cuts in a fixed order and every cut returns a sentence, not a boolean:** wrong category or retired → wrong rating (`ew1` needs wet, `v1` needs damp, and a wet fixture satisfies damp) → sticks out more than 4in when the entry sconce mounts at or below 6'-8" → wrong size for the island → over the target. The route hands the screen `{options, hidden:[{id,name,reason}]}` and **the screen must render the reasons when `options` is empty** — an unexplained empty panel reads as a broken feature.
- **`factsSnapshot` is frozen on purpose and carries its own overrides inside it.** GET returns `facts` (frozen) AND `liveFacts` (what the questionnaire says now) so the screen can say they have drifted. PATCH re-derives from the stored overrides and refreezes. **A blank target box deletes the override** — it means "go back to what the job says", not "target nothing". A typed target on a **skipped** category does nothing, by design: `deriveFacts` short-circuits skipped categories before the override ladder, and the screen never shows a skipped category anyway.
- **`dnPrice` is absent from the route's select shape, not filtered afterwards.** Same reasoning as the share routes. Verified no `dnPrice` string survives into the survey payload or the rendered page.
- **404 never 403 everywhere**, so a stranger cannot enumerate survey or response ids. `loadResponseForUser(responseId, user, canSeeAll)` returns null for both "not there" and "not yours" and **lives in `index.js`, not in a route file — a Next.js route file may only export HTTP methods** (hit this; the first draft exported a helper from `route.js`).
- **One PICK per person per category, enforced by a `deleteMany` before the upsert** — `reconcileCategory` counts picks across people, so two picks from one person would quietly outvote the room. REJECTs are unlimited and are kept. Re-clicking the same pick+finish deletes the row (undo); changing the finish on a picked fixture is an update, not an undo.
- **Storage prefix `fixtures/` added to `src/lib/uploadStorage.js` — permanent, like `sheets/`, NOT like `uploads/`** which a lifecycle rule sweeps after one day. A fixture photograph that vanishes overnight is worse than no photograph.
- **Nav:** `unit-selections` added to `projectNavConfig.js` for **fullDesign and designAssist only** (peerReview's drawings/fixture-schedule pair sits in a different section — left alone), `Lightbulb` registered in `ProjectSidebar.jsx`'s `ICON_MAP`, and the tab body wired in `ProjectHubClient.jsx` before the TAKEOFFS block. **`ProjectHubClient.jsx` and `ProjectSidebar.jsx` are CRLF; `Sidebar.jsx` is LF** — a `node -e` replace matching on `\n` against a CRLF file fails **silently and exits 0**. Always detect the newline and assert the match before writing.
- **The 49 seeded fixtures carry placeholder prices.** They are structurally right (categories, ratings, projections, finishes) but the dollars are invented. Real prices want loading before this is shown to a client.
- **Verified:** `npm run verify` **12/12** (unit-test file count now **37** — `scripts/verify.mjs`'s GATES array and its unit-test list are **both hand-maintained, not globs**, so adding a test file is two edits), 27 engine unit tests, and a 20-check end-to-end run against the dev server. Test surveys and the `ZZ CLAUDE SMOKE (auto-delete)` respondents were removed afterwards.
- **Not built, waiting on Mike seeing the flow:** share tokens for outside respondents (every response row already carries a `shareToken`), the reconcile/divergence table, push-to-fixture-schedule, and the budget write-back. The `$ / $$ / $$$` band for external viewers **is** built (`showPrices={false}`) and is computed against the target, never against buy price.
- **Status:** *UNIT_SELECTIONS_BUILD_PLAN.md* stays OPEN in the Software engineering folder until Mike signs off on the flow — steps 5–8 are unbuilt. **Mike's whole plan-document queue is otherwise cleared.**

### 2026-09-19 (MCP) — Mike's Claude — 🔧 **BUILT LOCALLY, NOT DEPLOYED**: the five MCP gaps, all closed — **migration 0094** (additive: `McpApiKey`). **Next free migration is 0095.**
- **Mike 9-19 verbatim:** *"Yes knock them all out so we can push those to Z_COMPLETED."* This is gaps 1–6 of *ILC_MCP_SERVER_BUILD_PLAN (1).md*, ships in the same push as 0092 + 0093.
- **Per-person keys (0094, `src/lib/mcp/apiKeys.js`).** A key resolves to a `User` and the caller inherits that person's role and row scope — a `CLIENT_VIEWER` key gets the client view, not the ILC one. **Only a SHA-256 of the key is stored**; the plaintext is returned once by the POST that mints it and never again, including to a Super Admin. Revoke = `isActive: false`, checked on every request (no cache), and **there is no DELETE route** — archive-only, like everything else.
- **`src/lib/mcp/rateLimit.js`** — per-key per-minute cap, in-process Map. Deliberately NOT global: on Amplify each Lambda has its own counter, so the card says "per connection" rather than claiming a company-wide number it cannot enforce. A JSON-RPC **batch spends one unit per request in the batch**, otherwise the batch shape is a free pass around the cap.
- **`get_commitments` composes, it does NOT store.** There is no `Commitment` table and the plan's wording implied one. It reads internal tasks, published note action items, live-deal next actions and open RFIs, derives `WE_OWE_THEM` / `THEY_OWE_US` / `FOLLOW_UP` per row, and closing an item on its own screen removes it here. **Ask Mike before ever turning this into a real table.**
- **Ontology expanded to the CRM** (`src/lib/ontology/objects/crm.js`): companies, people, notes, tasks, RFIs. Fail-closed default (`ilc_only` when unmarked) is unchanged and is what makes this safe to extend. `prisma.rFI` is the accessor for model `RFI`.
- **`src/lib/mcp/catalog.js` is the ONE source of tool identity — and it MUST stay pure.** Zero imports, no `@/`, no Prisma, so `scripts/generate-agents-md.mjs` can load it under plain Node. `tools.js` spreads `...CATALOG.<name>` and attaches only `run`. `audience: 'any' | 'ilc'` is data now, read by `requireAudience()` — the four hand-written ILC gates are gone. `scripts/check-mcp-catalog.mjs` (new verify gate, **12 gates now**) fails on: an import in catalog.js, a `name:` declared in tools.js, a description that says "ILC staff only" without `audience: 'ilc'` **or the reverse**, and a stale `agents.md`.
- **`agents.md` is GENERATED and is in the repo, not on the web.** Regenerate with `node scripts/generate-agents-md.mjs`; verify fails if it drifts. It names the tools, which is exactly what the public card now withholds — publishing it would undo that in a different place.
- **The unauthenticated GET no longer lists tools.** It returns service / protocolVersion / readOnly / available / limits / **toolCount** only. Sign in and you get `tools`, filtered by audience. Same filter applied to `tools/list` **and** to the unknown-tool error message, which was listing all eleven names to any caller with a typo. `list_models` was checked and deliberately left alone — `canReadObject` returns true for every registered object for every audience, so row scope is the boundary there, not the object list.
- **`scripts/tests/mcp.test.mjs` pins the tool list in THREE places now:** the sorted `assert.deepEqual(names, [...])` on the **authenticated** GET, `assert.equal(tools.length, 11)` in the `tools/list` test, and `assert.equal(names.length, 7)` in the new client-viewer test. Tool count is **11**. Callers in that file are `ilc` (staff) and `viewer` (client).
- **Verified:** `npm run verify` **12/12**; `node --env-file=.env --test scripts/tests/mcp.test.mjs` **65/65** against the dev server.
- **Still switched off in production** — needs Sean to set `MCP_API_TOKEN` in Amplify. `MCP_API_TOKEN` is already in the `next.config.mjs` env block and must stay there (Amplify Gen 1 does not pass console env vars into the SSR Lambda); the plan document says not to add it and the plan document is wrong on that point.
- **Status:** *ILC_MCP_SERVER_BUILD_PLAN.md*, *ILC_MCP_SERVER_BUILD_PLAN (1).md* and *WHY_MCP_SERVER.md* filed to `Z_Completed`. *MCP_ONTOLOGY_LAYER_ADDENDUM.md* filed too — Phases A/B/C built; Phase D (the Actions runner) is governed **writes**, which this endpoint deliberately does not have. **Next up in Mike's order: Unit Selections (migration 0095).**

### 2026-09-19 (calibration) — Mike's Claude — 🔧 **BUILT LOCALLY, NOT DEPLOYED**: calibration Phase 3 — is the line priced off the right thing at all? — **no migration**. **Next free migration is still 0094.**
- **Mike 9-19 verbatim:** *"Yes knock them all out so we can push those to Z_COMPLETED."* Build order given: privileges leftovers → calibration Phase 3 → MCP gaps → Unit Selections. Phase 3 ships in the same push as 0092 + 0093.
- **Phase 3 needed NO schema change, and that was the whole discovery.** Every driver figure is already recorded as a `quantity` on some line of the same project's `CalibrationSample` rows — units on `exterior.pathway`, gross SF on `total`, corridor SF on `corridors.disks`, net lot SF on `exterior.landscape`, and so on. New `src/lib/calibration/drivers.js` pivots those into one driver profile per project. **Before writing a migration, check whether the figure is already sitting on another row.**
- **`src/lib/calibration/drivers.js` is pure — no `@/` imports, no database.** It imports only `./lines.js`, so the test file can load it directly. Same convention as the rest of `src/lib/calibration/`. Input is exactly what `loadSamplesWithContext()` returns.
- **Candidates are ranked by SPREAD, not by correlation.** Raw Pearson r is meaningless at n=3–4 and is easily fooled by a driver that merely trends the same way. The robust spread (median absolute deviation ÷ median) is what you can actually price on. `scripts/tests/calibrationDrivers.test.mjs` pins this with pathway dollars that follow the lot at exactly $2/SF and unit counts as a plausible decoy — rank by r and you pick the decoy.
- **Hard floor: `MIN_DRIVER_PROJECTS = 5`, and a test fails if anyone lowers it.** Nothing below five is reported on screen or to a bot. `MIN_FIT = 0.7`, `SPREAD_IMPROVEMENT = 0.25` are pinned the same way.
- **Two prebuilt BUDGET dashboard cards, and they need no migration** — `appendMissingPrebuilt` in `src/app/api/dashboards/route.js` adds any missing prebuilt card to every existing dashboard, matched by `prebuiltKey()` (what the card *is*), skipping ones the user removed (`DashboardHiddenWidget`, 0074). Confirmed live: the existing Budget dashboard went to 16 widgets on its own.
- **`CalibrationTable.jsx` was hard-coded to the rate-drift shape** and would have crashed on `r.details.map(...)` for any other TABLE payload. Fixed with `table.kind`: `'drift'` keeps the hand-built layout (Apply button + nested breakdown), anything else renders through the new column-driven `PlainTable`. **A new calibration TABLE report must set `kind`.**
- **An empty card now says WHICH kind of empty.** "Nothing is wrong" and "we have nothing to go on" rendered identically and mean opposite things. Found by reading the live render output, not by a test.
- **The "Ask-AI wiring" half of the plan landed on the MCP server, deliberately.** `src/components/GlobalAIButton.jsx` is a 65-line "Coming soon" placeholder with no API call, and project chat has no tool registry — so there is no bot to wire it into. New `get_calibration` tool (**ILC staff only**, `caller.audience !== 'ilc'` → deny) takes `view` + the same four slice filters as the dashboard, and returns the same plain-English `findings` sentences the screen shows so a bot never invents wording for a statistic it did not compute. Drift rows are stripped of `details` on the way out.
- **`scripts/tests/mcp.test.mjs` pins the tool list on purpose — TWO places to update:** the sorted `assert.deepEqual(names, [...])` and `assert.equal(tools.length, N)` near line 864. Tool count is now **10**. The ILC-staff caller in that file is `ilc`; the client caller is `viewer`; there is no `staff`.
- **Real bug found in the verify gate itself.** The "unit tests" gate in `scripts/verify.mjs` is a **hand-maintained file list, not a glob** — `deptScreens.test.mjs` (yesterday's privileges work) and `calibrationDrivers.test.mjs` were both on disk and **not running**. Both added. **Adding a test file is two steps; the second one is editing `verify.mjs`.** Correcting my own earlier claim in the 0093 entry above: verify was passing 11/11 but was not running those six privileges tests at the time.
- **Verified:** `npm run verify` 11/11; 11 driver tests; MCP e2e **49/49** against the dev server incl. the client-refusal test; both cards render live with correct empty-state text.
- **Status:** *PRICING-CALIBRATION-LEARNING-SYSTEM.md* is complete end to end and filed to `Z_Completed`. Still no "record the actual" form — actuals arrive through `/api/calibration/actuals` only. **Next up in Mike's order: the five MCP gaps, then Unit Selections.**

### 2026-09-19 (privileges) — Mike's Claude — 🔧 **BUILT LOCALLY, NOT DEPLOYED**: the three gaps left by the privileges plan — **migration 0093** (additive: `AlertFeedback`, `AlertMute`). **Next free migration is 0094.**
- **Mike 9-19 verbatim:** *"Yes knock them all out so we can push those to Z_COMPLETED."* Ships with the 0092 work in the same push.
- **`ProjectAccess` has been in the schema since `0001_baseline` with ZERO code reading it.** Per-project access for Client Viewers therefore needed **no migration at all** — the table was already there. Standing lesson: a model in `schema.prisma` is not a shipped feature; grep `src/` before assuming one is.
- **`src/lib/projectScope.js` is now the ONLY answer to "which jobs may this person open"** — `projectScopeWhere(user)`, `canOpenProject(db, user, project)`, `grantedProjectIds`, `setProjectAccess`. Eight hand-written `{ createdById: user.id }` copies replaced (projects API, dashboard, pre-con board, project API, and the four project screens). A hand-written scoping clause is the old, wrong answer — route every new one through this file.
  - The bug it was hiding: a Client Viewer was scoped to jobs they created, and a Client Viewer cannot create a job, so the list was **always empty**.
  - `setProjectAccess` creates rows **one at a time** and swallows P2002 — `createMany` + `skipDuplicates` is **Postgres-only and throws on the SQLite dev DB** (same trap as 0073).
  - Grants/revokes write `PROJECT_ACCESS` rows on `UserAccessEvent`, carrying the job name **as it read that day**, so a rename cannot rewrite history. Names are looked up for `[...added, ...removed]` — a revoked job is not in the list being sent.
- **Alert feedback (0093).** Useful / Don't need on every alert; three "Don't need" on the same type asks whether to stop it; Admin → **Notification feedback** reports counts only, **no names**.
  - The mute is checked **inside `notifyUser` before the row is written**, and the check and the write use the **same resolved `alertType`** — guarding on raw `type` lets an untyped alert (stored `GENERAL`) slip past a `GENERAL` mute.
  - Reminder for anyone touching alerts: **`UserAlert.dedupeKey` is unique across the WHOLE table, not per user** — hence `scopedKey(userId, dedupeKey)` in `alerts.js`.
- **`src/lib/deptScreens.js` — departments shape the screen.** Sidebar sections open on your own department; people dropdowns (job assignees, RFI, budget QC) lead with the relevant department via `src/components/people/PeopleOptions.jsx`.
  - **Two rules are pinned by `scripts/tests/deptScreens.test.mjs` and must not be broken:** (1) no departments recorded → the sidebar behaves exactly as before; (2) no departments recorded → the person still appears, under "Everyone else". This is a convenience layer only — it never hides a screen or blocks a save. Access still lives in `permissions.js`.
- **Status:** *ILC Admin and User Privileges Plan 2026-09-14* is now complete end to end and filed to `Z_Completed`, along with *Design vs Conceptual Questionnaire Match - 2026-09-12*. `npm run verify` 11/11.

### 2026-09-19 (later) — Mike's Claude — 🔧 **BUILT LOCALLY, NOT DEPLOYED**: Service Type loses "Other", CRM people get Mike's eight departments — **migration 0092** (data-only, no schema change). **Next free migration is 0093.**
- **Mike 9-19 verbatim:** *"1. No full design is fine. Remove other it's useless. 2. Yes build it."* — answering the two questions left open on the 9-05 CRM gap analysis. Label stays **"Full Design"** (the "Full-Service Design" rename is REFUSED, never re-ask).
- **The pattern, twice:** settable list + `LEGACY_*` list + `ALL_*` union for reading, exactly as `PIPELINE_STATUS` / `LEGACY_STATUS` in `pipeline.js`. Plus a per-row `*Options(current)` helper — **a `<select>` whose current value is absent from its options shows the first option and writes it back on the next save.** That helper is the only thing standing between a legacy row and a silent reassignment; do not "simplify" it away.
- **`src/lib/utils.js` is now the ONLY service-type list.** `SERVICE_TYPES` (4, settable), `LEGACY_SERVICE_TYPES` (`other`), `ALL_SERVICE_TYPES`, `SETTABLE_SERVICE_TYPE_KEYS`, `serviceTypeOptions(current)`, `serviceTypeLabel(key)`. Five hand-typed copies removed (`createProject.js`, `api/projects/[id]/route.js`, `dashboards/fieldCatalog.js`, `CRMClient.jsx`, `ProjectDashboard.jsx`) — same drift class as the pipeline stage names in b1fc0f0. **Pickers use `serviceTypeOptions`; filters and labels use `ALL_SERVICE_TYPES`.** The project History line now prints the label, not the key.
- **Real bug found:** `PipelineSidePanel` forced a blank serviceType to `'other'` on first touch. Now a blank "— Select —" that stays blank.
- **`src/lib/contactDepartments.js` (NEW)** — the CRM person's department at THEIR company: `CORPORATE, PRECONSTRUCTION, CONSTRUCTION, PROCUREMENT, DESIGN, DEVELOPMENT, ARCHITECT, INTERIOR_DESIGN` (Mike's eight, his order, from CRM ORGANIZATION.xlsx). `FINANCE` is legacy-readable only. `normalizeContactDepartment()` (~26 aliases), `cleanDepartment()` (what the API stores), `departmentOptions(current)`, `contactDepartmentLabel()`, `isSettableContactDepartment()`.
- **`cleanDepartment` keeps an unrecognised word EXACTLY AS TYPED** — a bulk import must never blank somebody's department because it used a word we had not seen. That person's dropdown shows their own word marked "(old)".
- **NOT `src/lib/departments.js`** (the ILC *staff* department list behind `UserDepartment`, migration 0079/0085). Two different questions about two different kinds of person. `serviceAndDepartments.test.mjs` fails if they ever merge.
- **Migration 0092** is one `UPDATE "ClientContact" … CASE UPPER(TRIM(REGEXP_REPLACE(department,'[-_/]+',' ','g'))) … ELSE "department" END` — converts known spellings to keys, changes nothing else, blanks nothing. Postgres-only syntax (`REGEXP_REPLACE` with the `'g'` flag); local SQLite never runs it.
- **Screens:** client People tab edits department as a dropdown that saves on change (free-text input + `<datalist id="dept-options">` gone); `PersonField` gained an `options` prop. CRM Contacts gained a Department column, a department filter beside the search, and department text inside the search. `PlaybookTab` groups by the label, not the raw value. Three API routes clean on the way in: `api/clients/[id]/contacts` POST, `api/clients/[id]/contacts/[contactId]` PATCH, `api/crm/contacts` POST.
- **Verified:** new `scripts/tests/serviceAndDepartments.test.mjs` 10/10, added to the verify unit gate. `verify --full` **13/13 incl. the production build**. Live against the dev server: "Pre-construction" → `PRECONSTRUCTION`, "Weird Team" → kept as typed, "purchasing" → `PROCUREMENT`, blank → cleared, `DESIGN` visible on the CRM contacts feed; `/crm/contacts` renders the filter + column; a project page offers exactly four service types and no "Other". Two `CLAUDE E2E … (auto-delete)` rows created and removed.
- **Trap re-confirmed:** contact DELETE routes 405 by design (archive-only, 0075). Test rows named `CLAUDE E2E … (auto-delete)` must be removed with a raw Prisma delete, not the API.

**Open items carried over from the plan documents filed into `Z_Completed` on 2026-09-19 — nothing below is built:**
- **Meeting Prep Agent, Phase 1** (a "Prep brief" button on the client page, deterministic blocks assembled in code, Claude writes only the 3–5 talking points, each citing its fact, saved as ROWS not a JSON blob). Phase 2 (automatic briefs) is blocked on the Microsoft 365 calendar connection. Phase 4 siblings are already built — skip them. **Both source plans say `db push`; that is wrong and dangerous here (it drops `ContactLegacy`). Numbered migrations only.**
- **MCP server:** still three gaps — one shared key for everybody (no per-caller key, so the audit log cannot say who asked), only four record types (projects, clients, budgets, change orders), and it stays 503 in prod until **Sean sets `MCP_API_TOKEN` in Amplify**. Two code comments still claim prod runs `db push` and should be corrected.
- **Conceptual budget, two accuracy items Mike has not ruled on:** should every garage without a generator get battery emergency units (Greenville + Ross, $37.4K workbook vs $15–25K tool)? and townhome pathway lighting — the tool adds $320/home ($20.5K at Echo Trail) where Echo's workbook had $0.
- **Calendar dry run v2:** the rules are built and deployed; what is left is Mike eyeballing the real Outlook feed once M365 is connected.
- **Pre-beta checklist:** the build items are done; the remaining lines are Mike's own sign-off, plus the three SES console steps that are Sean's.
- **Still open from earlier:** Maram's emailed procurement-revenue widget list; telling Maram the 9-19 CRM work is live; client-portal reframe; all-studio fan edge case. Rating equation parked. Pipelines = TWO, settled.

**Second batch of plan documents triaged 2026-09-19 — four more filed into `Z_Completed`, five stay in the folder. Nothing in this list is built:**
- **Calibration learning, Phase 3** — driver analysis (which project traits predict the drift) and wiring the drift report into Ask-AI. Zero hits for `driver|correlat` in `src/lib/calibration`, zero hits for `calibration` anywhere in the AI/bot/MCP layers. Phases 1 + 2 ARE built and deployed: `src/lib/calibration/{capture,lines,report}.js`, the propose-a-rate button in `CalibrationTable.jsx` (admin-only, guarded on `row.pricingKey && row.suggestedRate != null`), `/api/calibration/{actuals,apply-rate,backfill}`, `DRIFT_REVIEW_PCT = 15`, `MIN_SAMPLES = 3`. There is still no "record the actual" form — actuals arrive through the API only.
- **Privileges plan, three leftovers.** (1) `model ProjectAccess` sits in `prisma/schema.prisma:805` with back-relations at lines 40 and 677 and has **ZERO references anywhere in `src/`** — giving a Client Viewer specific jobs is NOT built. **A model in the schema is not a feature; never read the schema as evidence a thing shipped.** (2) The "not useful / do not need this" buttons on alerts (Step 6) do not exist — `notUseful|not_useful|alertFeedback` matches only an unrelated comment at `src/lib/pricing.js:414`. (3) Nothing opens a menu to your own department or filters a dropdown by it. Steps 1-3, Step 5 and the access-history half of Step 4 ARE built and deployed (`src/lib/accessEvents.js`, `UserAccessEvent` at schema:751, `api/admin/users/[id]/history`, `scripts/tests/accessEvents.test.mjs`, `scripts/tests/dn-leak.test.mjs`, and the share-link scoping at `src/app/api/share/fixture/[token]/route.js:59` where every edit is scoped to the shared project and DRAFT state, and `internalNote` is never selected).
- **MCP build plan, five leftovers.** `src/lib/mcp/tools.js` registers exactly NINE tools (list_models, describe_model, query_records, get_record, count_records, search, get_project_360, get_pipeline, get_client_360) — **`get_commitments` is absent**. `src/lib/ontology/objects/` holds only `budget.js`, `changeOrder.js`, `client.js`, `project.js` — four record types, and `canReadObject()` returns true for an unregistered model, so the real gate is `readableProps()` / `isNeverReadable()` at the FIELD level, not a model list. No rate limit anywhere (`rateLimit|429` = zero hits). No `agents.md`, no server card. Auth is one shared `MCP_API_TOKEN` (min 32 chars) resolving to a fixed ILC_ADMIN, plus the ordinary `ilc_session` cookie — no per-user keys, no OAuth. **Still 503 in prod until Sean sets `MCP_API_TOKEN` in Amplify.**
- **Unit Selections — NOT STARTED.** `UnitSelection` / `DecorativeOption` return zero hits across `prisma/schema.prisma` and all of `src`. No code exists.
- **Design vs Conceptual questionnaire match — ONE item left, and it is Mike’s call.** The public page defaults a balcony to "Exterior balcony sconce (Low finish)" (`src/lib/intake/questionnaire.js:141`) while the internal page defaults to `none` (`src/components/sections/UnitsSection.jsx:29`). The report recommended matching internal; doing that LOWERS every public budget where the visitor never touches the question, so it is a money decision, not a silent fix.
- **Two beta-test items are also still open** and were re-checked today: fix #9 "warn instead of silently fixing" does not exist (no warn strings in `src/lib/numberInput.js`, `src/lib/intake/*.js` or `QuestionCard.jsx`), and the "add X to tighten this budget" hint still does not name the specific missing field.

**Fixed today while triaging — LOCAL ONLY, rides with the 0092 work, no migration:**
- **The 52-inch fan note was lying.** `UnitsSection.jsx` prose read "+$25/fan adder" as a hardcoded string while the chip beside it correctly read `P.designUpgrades.fanSize52Adder`, which is **0** (`pricing.js:555` — 52 inch is no upcharge over 48 inch, per Mike). The note now derives from the sheet and says there is no upcharge when the adder is 0. **Standing lesson: a price can read right while the words beside it lie — the chip and its label are two different code paths.**
- **`PricingEditor.jsx` gained five rows that were code-only:** `designGarage.daylightingAdderPerSf` and all four `designExitSigns.*` (`thermoplasticPerSign`, `mixedPerSign`, `edgelitPerSign`, `sfPerSign`) under a new "Exit Signs — Design Levels" group. Pre-con could not change any of those before. `PRICING_FIELDS` is consumed only inside `PricingEditor.jsx`, and `api/admin/pricing/route.js` has **no key allowlist** — it is a dot-path merge, so adding a row is all it takes. The three `designGarage` keys marked legacy (`occSensorAdderPerSf`, `batteryAdderPerSf`, `batteryAndSensorPerSf`) were deliberately left off: nothing reads them.
- Verified: `npm run verify` 11/11 gates green; both edited files parse clean through esbuild.

### 2026-09-19 — Mike's Claude — ✅ **DEPLOYED d3306e2**: Maram's whole CRM list (wording → statuses/widgets → sales notes) — **migration 0091** (additive: `Project.expectedContractExecutionDate DateTime?`, `Project.projectSubtype String?`). **Next free migration is 0092.**
- **Vocabulary now lives in `src/lib/pipeline.js` only:** `PIPELINE_STATUS` (picker: OPEN / ON_HOLD / WON / LOST / ABANDONED), `LEGACY_STATUS` (COMPLETED — readable, still won, never settable), `STATUS_LABEL` covers both, `SETTABLE_STATUS_KEYS` / `ALL_STATUS_KEYS`, `ON_HOLD_STATUSES`, `isOnHold()`. `DECIDED_STATUSES` excludes ON_HOLD. New: `winRateAllProjects()`, `weightedRevenue(p, board)`, `isWithinDays()` (compares CALENDAR days via UTC day numbers — a date-only input is stored as UTC midnight = 6 pm previous day in Denver, so instant maths put "today" outside the window), `weightedForecast()` (OPEN only, `FORECAST_WINDOW_DAYS = 90`), `buyoutDays(project, events)` (Mike 9-19: from the `deal_stage` ProjectActivity rows — first move INTO BUYOUT → first move INTO CONSTRUCTION on the same board, Procurement first, Design fallback; `stageEventsFromActivities()` parses the JSON metadata; screens use the `useBuyoutDays` hook against `/api/projects/[id]/activity?type=deal_stage`; the sales-rows provider includes those activities), `WEIGHTED_PROBABILITY_LABEL` / `WEIGHTED_REVENUE_LABEL`. **`inDesignPipeline()` now takes the PROJECT** (a `peerReview` with `designContractValue > 0` is on the Design board; `FEE_OPTIONAL_DESIGN_TYPES`); a bare serviceType string still works for the two always-design types. Engine `pipelineWhere()` DESIGN branch is an OR — `dashboardFilters.test.mjs` pins the new shape.
- **Dashboards:** catalog measures `weightedRevenue`, `weightedDesignFee`, `onHoldRevenue`, `onHoldDesignFee`, `buyoutDays` (unit `'days'`, Chart.jsx renders it); dimensions `projectSubtype` (values = `BUILDING_TYPES` keys from utils.js, picker on the popup and hub — Mike 9-19), `designStatus`; date axis `expectedContractExecutionDate`. Providers map the derived fields per row. **`formula.js` `nums()` now drops null/undefined/'' before `Number()`** — a blank cell was counting as 0 in averages (one 30-day buyout over 27 rows read 1.1 days).
- **Proposals:** `SCOPE_LETTER` out of all three type pickers; `EXPIRED` moved to `LEGACY_STATUS_META` (badge lookup falls through so old rows still read). **Meeting:** `MEETING_LEVELS`, `cardLevel()`, every card stamped `level`; layout route passes it; `MeetingDashboard` has Projects / People tabs. **Calendar:** `fromGraphEvent` returns `responseStatus`; `notAcceptedReason()` in worthANote.js; `isWorthANote` rule 1b (bucket `'not accepted'`) sits BEFORE the business-title rule; `recordCalendarEvent` skips / retitles before classification. **`ingestCalendarEvent` now returns `{ skipped: true, reason, fired: [] }` and fires NO CALENDAR_EVENT_CREATED rule when `notAcceptedReason(event)` is set** (Mike 9-19). ICS sources carry no response status → pass.
- **Trap hit this pass:** `String.prototype.replace(str, replacement)` treats `$'` in the replacement as "text after the match". A catalog line containing `unit: '$'` got the rest of the file spliced in three times and the Sales dashboard 500'd. Always pass a function: `s.replace(a, () => b)`. Caught by the dev-server page smoke, not by the unit tests (the catalog is only imported by screens).
- **Verified:** `pipelineStatus` (new, 11) + `dashboardFilters` + `dashboardPrebuilt` 49/49; nine changed screens 200 on the dev server; every new measure rendered through `POST /api/dashboards/render`; ON_HOLD + both dates + subtype round-tripped through `PATCH /api/projects/[id]` on Marmalade and restored. **`verify --full` 13/13 incl. production build, exit 0.**
- **Mike 9-19 settled:** Win Rate (all) = won ÷ all incl. open/on hold ✅; buyout = stage history ✅; subtype = building-type list ✅; "add a new person" = link ✅; bot trigger accepted-only ✅. Waiting on Maram's procurement-revenue widget email. Rating equation parked. Still open: client-portal reframe; **Sean — `MCP_API_TOKEN` in Amplify env**; department menus; all-studio fan edge case.

### 2026-09-18 (latest deployed) — Mike's Claude — ✅ **DEPLOYED 7f7fce1**: the whole 9-16 → 9-18 queue in ONE push — **migrations 0088 + 0089 + 0090** (all additive / data-only) + app-wide comma tolerance
- **What shipped together:** Lone Tree v3 reconciliation (0088 fans $175), site features as rows (0089), findings + per-feature Exterior lines, landscape sheet always read, public math strip, visitor tracking + `/sales/visitors` (0090), intake → project hand-off, public freight/warehousing % hidden + 3-upload cap, approx counts on the public page, park-and-poll on all ten in-app AI/PDF reads, Maram's four CRM bugs + annotations guard, and **commas in every number field** (`src/lib/numberInput.js`: `parseLooseNumber` / `looseNumberOrNull` / `looseInteger` / `isUnreadableNumber` / `cleanNumberInput` / `NUMBER_HELP`, pure, public-bundle safe; 32 server files + 3 client files read through it; `parseFloat("226,000") === 1` is gone). **Next free migration is 0091.**
- **Extended pre-deploy pass (Mike: "do a lot more"):** `verify --full` 13/13 incl. production build, run TWICE (before and after the two fixes below); `npm test` exit 0; all 97 `scripts/tests/*.test.mjs` = 1,711 tests; 108-point scripted signed-in / signed-out sweep (every changed screen + API: 200 signed in, 307/401/404 signed out, zero 500s; public estimate 200 with no DN / rates / working-out keys; anonymous visit ping never errors); smoke rows 0 left.
- **Two real finds, both fixed:** (1) the public no-drawings gate (`questionnaire.js` `digitsOnly`) only stripped commas/spaces, so "$300" or "250,000 SF" never priced — now `looseInteger`; (2) `uploadFlow.e2e` asked the parse routes once → **`scripts/tests/_auth.mjs` now exports `postParked(path, body, cookie)`**, the test-side twin of `parkedFetch.postParked`. Any new e2e test against a parked route must use it, or it will see `{ jobKey, queued: true }` and fail. 4/4 on re-run.
- **Traps confirmed this pass:** `code-check` starts with no file (reads the project's own schedule) — a bare POST queues a real job, so sweep it (`{ jobKey, sweep: true }` → 204). `/home` → `/dashboards/main` and `/sales/automation` → `/sales/automation/rules` are 307s by design. `/api/proposals/[id]` is **PUT**, not PATCH.
- **Prod watch after Amplify runs `migrate deploy`:** 0088 is a guarded `jsonb_set` on SystemConfig `pricing` (fans.conceptualPerFan → 175); 0089/0090 create tables + FKs only. If 0088 reports 0 rows changed, the master sheet already had 175 or the key path differs — check `/admin/pricing`.
- **Next (Maram's list, Mike's order):** wording changes → statuses/widgets → sales-notes changes; notify Maram. Mike is reproducing the Marmalade error himself. Rating equation parked. Still open: client-portal reframe; **Sean — `MCP_API_TOKEN` in Amplify env for main**; department menus; all-studio fan edge case.

### 2026-09-18 — Mike's Claude — 🔧 **BUILT LOCALLY, NOT DEPLOYED** (ships WITH the three entries below in one push, no migration): park-and-poll on ALL ten in-app AI/PDF reads, approx counts on the public page, Maram's four CRM bugs
- **Park-and-poll everywhere:** `src/lib/parkedJob.js` (`runParkedJob`, `readJobRequest`, `jobError`, `uploadToJobArgs`, `loadJobUpload`) + `src/lib/parkedFetch.js` (`postParked(url, body, opts)` → `{ok,status,data}`). Ten routes wrapped: site/parse (3 sheets, one per poll), files upload (NO longer reads schedules inline — browser calls reparse via `src/lib/scheduleReadClient.js`), files/[fileId]/reparse, analyze-contract, drawing-set extract, bid-matrix parse, peer-review parse, rfi-extract (dead code, nobody calls it), chat document read. **Pinned by `scripts/tests/parkedRoutes.test.mjs`** (greps the ten route files + callers). Timed through a simulated 30 s front door: 55.6 s read completed, longest browser-side wait 2.3 s.
- **Maram's bugs:** (1) DashboardsClient `handleSave` checks `res.ok`, shows the error, never passes an error body to `onSave`. (2) Marmalade NOT reproduced locally; hardened: `project/[id]/page.jsx` slices `textContent` to 600 chars per file (was ~1 MB total), `dateInputValue()` guard on `expectedOrderDate` in PipelineSidePanel + ProjectDashboard, new `project/[id]/error.jsx` shows message + digest. (3) `PATCH /api/projects/[id]` has `toMoney()` (strips `[^0-9.-]`, 400 if no digit); both screens send digits via `cleanMoney`. (4) `api/proposals/route.js` returned an undefined `dealRecord` and both proposal routes included a non-existent `deal` relation — removed.
- **Side fix:** `api/projects/[id]/annotations` guards the missing `markupAnnotation` model (was a 500 on every project).
- Tests: parkedRoutes + parkedJob + intakePublicMath + pipelineStages 57/57; scripted signed-in checks on throwaway rows, cleaned up. `verify --full` NOT yet run. **Next free migration is still 0091.**
- **Maram's list, Mike's order (go given 9-18):** four bugs ✅ → wording changes → statuses/widgets → sales-notes changes. Rating equation parked ("no wait").

### 2026-09-17 — Mike's Claude — 🔧 **BUILT LOCALLY, NOT DEPLOYED** (ships WITH the two entries below in one push): public math strip, visitor tracking (**migration 0090**), intake → project hand-off, landscape sheet always read
- **Public math:** `publicIntakeEstimate()` in `src/lib/intake/estimate.js` is a NAMED allow-list; `/api/intake/estimate` + `/api/intake/pdf` must use it, never `computeIntakeEstimate` (pinned by `intakePublicMath.test.mjs`). `computeIntakeEstimate` now also returns `sections` — staff hand-off only, never passed on publicly.
- **Visits:** `ConceptualVisit` (0090), pure rules in `src/lib/intake/visits.js`, public `POST /api/intake/visit` (rate-limited, bots 204, never errors), `IntakeClient` pings per step via sessionStorage visit id. **No IP / user-agent / full referrer stored** — one-way salted hash only (`VISIT_SALT` || `JWT_SECRET`). Staff page `/sales/visitors` (`requireIntakeReviewer`), button on `/dashboards/sales`, Sidebar line.
- **Hand-off:** `src/lib/intake/handoff.js` — pure `planHandoff()` + `applyHandoff()` (one transaction: ProjectData upsert, QuestionnaireResponse upserts incl. `project-data` mirror rows, `writeSiteFeature`). Wired into `api/admin/intake/[id]/create-project`; plan computed BEFORE `createProject` so `buildingType` comes from the questionnaire (the public form never sent one). Non-fatal by design. Closes the "Open" item in the entry below.
- **Site read:** `SHEETS_TO_READ = 3` in `api/projects/[id]/site/parse` (Mike: always read the landscape sheet). Watch the 30 s wall.
- **0090 is used; next free migration is 0091.** Tests: three new files in the verify gate; related set 189/189; scripted signed-in smoke 23/23, rows cleaned up. `verify --full` NOT yet run.
- **Maram's CRM list CONFIRMED by Mike 9-17 with corrections, still NOT built (waiting on his go + order):** buyout-duration tracker = a Sales dashboard widget option; 90-day forecast revenue is WEIGHTED (gross × probability) and labeled so; sales notes pull ACCEPTED invites only and get "Pre-meeting info" + "Meeting notes" sections.
- **9-17 also local:** public freight/warehousing % hidden (dollars stay), public drawing uploads capped at 3 and stated. **Site-read timing: multi-sheet sets take 41–70s in one request — over the 30s wall even at the live 2 sheets. Needs the read split into steps; not built yet.**

### 2026-09-16 — Mike's Claude — 🔧 **BUILT LOCALLY, NOT DEPLOYED** (ships WITH the entry below in one push): outdoor amenity measured off a scaled site plan, scale ladder, six sporadic site features as structured rows — **migration 0089** (additive: `SiteFeature`)
- **Mike's rules (verbatim prices):** dog park 1 area light @ $1,400; courtyard 1 pole / 30 ft @ $2,000; playground 2 poles; tennis + pickleball 4 area lights / court; turf play 1 pole / 50 ft. Courts priced when present. Amenity boundary = hardscape touching the clubhouse (no drives / parking / public walk) + pool enclosure. **No guessing: absent = $0.**
- **`src/lib/siteFeatures.js`** (pure: types, rules, `priceSiteFeatures`, grid rows ⇄ list) and **`src/lib/siteFeatureRows.js`** (server: `SITE_FEATURE_INCLUDE` / `SITE_FEATURE_SELECT`, `engineProjectData(project)`, `writeSiteFeature`). **Every `calculateBudget` reader must spread the include/select and call `engineProjectData(project)`** instead of `{ ...projectData, buildingTypeKey }` — 15 call sites + MCP `get_project_360` + duplicate done. The archive `$extends` filter does NOT reach the nested include; the helper filters `archivedAt: null` itself. `/data` PUT with `dogParks: 0` archives the live row (never deletes). `'siteFeature'` is in `NEVER_DELETED`.
- **Engine:** `calculations.js` prices `pd.siteFeatures` → `sections.exterior.siteFeatures {product, items, areaLights, pedestrianPoles}`, added before the 5% misc. `sections.exterior.total` is `{ product }` (an object). New pricing keys under `exterior.siteFeatures` (PricingEditor rows). `/api/projects/[id]/budget` now passes `buildingTypeKey` like the pages (it used to pass the bare ProjectData row).
- **Site read:** `siteVision.js` scale ladder written scale → printed dimension → 9×18 ft stall / 24 ft aisle → 3 ft door, reported in `scaleBasis` (door-based measurement flagged; no basis = refused); `exteriorAmenitySfMeasured`; `siteFeatures[]` by word search. `sheetIndex.js` knows `landscapePlan`, opened only when the site plan gave no amenity area. `SITE_VISION_PROMPT_VERSION = siteVision-2026-09-16b-…` → re-upload to see it. `quantities.js` ~640: amenity ladder printed → measured (amber, names sheet + basis) → typed → $0 + ask.
- **0088 AND 0089 are used; next free migration is 0090.** 0089 folder is Postgres; SQLite applied locally by hand (`prisma db execute`).
- Tests: new `siteFeatures.test.mjs` 17/17; all `scripts/tests/*.test.mjs` 1634/1634 (3 `uploadFlow.e2e` cold-compile flakes on a fresh dev server, 4/4 on re-run). Signed-in smoke on throwaway projects: rows → $7,400 line, pages / PDF / duplicate / archive-on-zero all good; no 500s signed out. **`verify --full` NOT yet run — deploy pass pending Mike's "Deploy".**
- **Same day, Mike's build order — findings spelled out + per-feature cost lines:** `src/lib/siteFeatureWords.js` (NEW, no prices, no imports: kinds/labels/grid rows + `siteFeatureFindings()` → "1 dog park (sheet 4)", `siteFeatureLineLabel()` → "Courtyard, 90 ft — 3 pedestrian poles") is the ONLY site-feature file the public bundle may import (DrawingDropzone, mergeProposals, combineReads, combineResult, stagedParse, SummaryBudgetBreakdown, BudgetSidebar, IntakeClient) — pinned by a test that greps those files. `src/lib/siteFeatures.js` = pricing half (`priceSiteFeatures`, `siteFeatureCostLine()` → "3 pedestrian poles (12 ft) × $2,000 = $6,000"), re-exports the words. DrawingDropzone done lines + rollup ("Found on the drawings: …" / none-found sentence), SiteDataUpload review panel, ExteriorSection (one line per feature with the math, or "none found … — $0"), sidebar, summary, chat budget read-out. `siteFeatures.test.mjs` 21/21; screen smoke public + internal clean; chat route answers with the per-feature lines.
- **Settled by Mike 9-16:** linear length = longest dimension; prices are gross selling prices. **Assessed only:** visitor tracking on `/conceptual_budget` (structured visit row) — not built until asked.
- **Open:** intake → project conversion carries no SiteFeature rows (the `create-project` hand-off carries no figures at all).

### 2026-09-16 — Mike's Claude — 🔧 **BUILT LOCALLY, NOT DEPLOYED**: Lone Tree v3 reconciliation — stairs × buildings, corridor ladder + cap, carports/buildings counted off the site plan, editable Project Data grid on the Drawings page, fans $175 from the master sheet — **migration 0088** (data-only, sets saved `fans.conceptualPerFan` → 175)
- **Stairs (`quantities.js` ~760):** drawing-stated/counted stairs are PER BUILDING → × `buildings` row (`bldgMult`); typed or `correct*` totals never multiplied. `estimateStairLandings({stories, stairsPerBuilding, buildings})` is the per-building form (`stairLandings.js`, `perBuildingGiven`). Lone Tree 3 × 4 × 7 → 172 landings.
- **Buildings row:** stated `site.buildingCount` → `site.buildingsCounted` (new extract field, flagged) → `figureBuildings`. **Corridor ladder (~580):** printed (capped at `pricing.corridors.maxPctOfGross`, default 0.15, new PricingEditor row) → typed `figureCorridorSf` → `typeShare('corridorPctOfGross')` (12% corridor types / 0 breezeway, NOT manual-gated) → null + ask. **BOH remainder only runs once corridorSf != null** — never absorbs corridors. **Carports:** stated → `carportsCounted` (bays or canopy ÷ 189 SF, flagged) → typed → guess. `siteFields.js` maps the counted fallbacks; `siteVision.js` warns on stated-vs-counted for carports/buildings. `EXTRACT_PROMPT_VERSION = unitMatrix-2026-09-16b` (corridor synonyms).
- **UI:** `IntakeClient.jsx` — one `projectDataGrid()` on Drawings AND Review (amber NEEDED boxes, corrections + undo); Units-page ask card and read-only summary removed. No-drawings blanks read "Not entered — type it in." `DrawingDropzone` conflict card names the kept file.
- **0088 is used (and 0089 by the entry above); next free migration is 0090.** Postgres `jsonb_set` on SystemConfig key `pricing`, guarded/idempotent; frozen snapshots untouched.
- Tests: `quantities` 66/66 (+16), `stairLandings` 17/17 (+2), `siteVision` 30/30 (+1), `fansConceptual` 13/13 (+1); all `scripts/tests/*.test.mjs` 1617/1617 (glob, not the dir — Node 24 on Windows); `npm test` exit 0. Full `verify --full` deploy pass NOT yet run — do it before pushing.
- **Not built:** measuring corridor SF off scaled floor plans (assessed for Mike; later last resort). Known: ARCH site plan prints 36 DU × 4 = 144 vs settled 168.

### 2026-09-16 — Mike's Claude — ✅ **DEPLOYED 512b740**: no figures until every dropped drawing is read + priority order for which file speaks first — no migration
- **Hold:** new `src/lib/intake/combineReads.js` (`combineReads(items, kept)` → `{merged, reading, done, failed, total}`; `merged` is null while any item is queued/uploading/parsing). `DrawingDropzone` uses it for the rollup and for `publish()`, which now calls `onResults(merged, status)`; publishes added in `addFiles` and at parseOne's uploading/parsing steps so a Retry re-holds. `IntakeClient` keeps `drawingsReading`; both autosave effects `return` while it is > 0 (a mid-read null must never overwrite a saved read); footer says "Reading N drawings — your figures appear once every file is read".
- **Priority in `mergeProposals.js`:** totals (except gross SF, already best-confidence) and site fields are taken via `byPriority()`: schedule file → higher confidence (`overallConfidence` / `siteData.confidence`) → upload order. Both conflict values carry `file`. `siteData.sources` stays in upload order. Rollup gains "Unit count taken from <file> — …".
- Tests: `drawingExtract` 58/58 (4 new), `combineReads` 8/8 (new, added to verify gate + `verify:units`), `quantities` 51/51, `stagedParse` 46/46.
- Debug pass: `verify --full` 13/13 incl. build; `npm test` exit 0, 111,997 fuzz checks 0 failures, bid-matrix 12/12.
- **Still open:** client-portal reframe (Client Viewer = portal login, invited per project); `verify:units` vs `verify.mjs` drift; **Sean — `MCP_API_TOKEN` in Amplify env for main.**

### 2026-09-16 — Mike's Claude — ✅ **DEPLOYED fb1bada**: 188-vs-168 authoritative unit schedule, "NaN vs NaN", failed reads keep the upload, pick/site in-flight markers — no migration
- **188 vs 168 (Lone Tree v2):** `mergeProposals.js` unioned ARCH's two low-confidence estimated rows on top of GEN's complete 7-row matrix. Now ONE file is the counted schedule (`scoreSchedule`/`pickSchedule`: rows sum to its printed total > confidence > units); other files' rows only confirm/conflict; unmatched codes go to `uncountedUnitTypes` + one summary conflict, never into the count. Output gains `unitSchedule` + `uncountedUnitTypes`. Union survives only when no file prints a total AND no codes are shared.
- **Free-text totals never conflict** (`buildingType` words compared as numbers → "NaN vs NaN"); `DrawingDropzone` `fmt` is string-safe.
- **Retry re-uploaded 25.7 MB every time:** `runStagedParse`'s `finally` `done` deleted the S3 object even after a FAILED read. Now sends `keepUpload: true` on failure (not on abort/success); `stageDone(scanKey, state, { keepUpload })`.
- **Pick + site could run twice:** no in-flight marker → hang-up retry re-ran the same model call on a 2nd Lambda. Now `pickStateKeyFor`/`siteStateKeyFor` markers (`.attempt.json` via `putScanAttempt`), 90 s in-flight, ≤3 kicks, `waiting: true` answers; client polls (`POLL_WAITS_MS`, `MAX_PICK_POLLS` 100 / `MAX_SITE_POLLS` 75), polls don't count as slices/sheets. `stageDone` clears both markers. Same pattern as the matrix kick-and-park.
- Debug pass: `verify --full` 13/13 incl. build; `drawingExtract` 54/54, `quantities` 51/51, `stagedParse` 46/46; `npm test` 61/61, 111,997 fuzz checks 0 failures, 12/12.
- **Next (Mike 9-16): no figures shown until EVERY dropped drawing is read; then one merge decides real vs guessed.** Built locally — see the entry above.

### 2026-09-16 — Mike's Claude — ✅ **DEPLOYED c3123dc**: fans per bedroom, BOH read off drawings, resumable conceptual drafts + "Unfinished budgets" leads card, 108-vs-168 unit fix, clubhouse controls, memory brake — **migration 0087** (additive: `ConceptualDraft`, `ConceptualDraftField`)
- **Fans (Mike): counted per bedroom; living room is per unit.** The takeoff (`quantities.js` ~440–510) already did this; the bug was `estimate.js` never handing `ceilingFans` to the engine, so `calculateBudget` fell back to `numUnits × FAN_ROOMS[...]` and studios got a master fan. Fix is one seam: `numFans: num(q.ceilingFans)` in projectData; engine uses `pd.numFans` when > 0, multiplier otherwise. **Edge case left open:** an all-studio building with a bedroom-only answer gives takeoff 0, which the engine reads as "unset" and falls back to the multiplier.
- **BOH (Mike): "always take what the drawings say, not add to it to hit the cap."** New `projectTotals.bohSf` in the extract schema (printed areas only, never a % of gross, never corridors/amenity), merged first-non-null in `mergeProposals.js`. Ladder in `quantities.js`: drawing-stated → typed `figureBohSf` → remainder → no-drawings guess; the 5% cap only trims a stated figure (flagged). `EXTRACT_PROMPT_VERSION = unitMatrix-2026-09-16` — existing projects see a printed BOH only after re-upload.
- **108 vs 168:** the reader wrote bedroom counts as unit codes; the merge folded same-code rows. Same-code rows now stay apart when qty differs and (same file OR size/bedrooms/label differs). Only the merged result is stored → Lone Tree Ranch Test v1 needs re-upload or units typed to 168.
- **Drafts:** browser save (inputs only), server draft 3 s after each change once contact details are valid, token hashed at rest, resume link behind `RESUME_LINK_ENABLED=false` until email works. **SQLite trap:** 0087 is Postgres SQL — locally strip `ALTER TABLE … ADD CONSTRAINT` and change `TIMESTAMP(3)` → `DATETIME` before `prisma db execute`. Prod file untouched.
- **`tests/budget-math.mjs` Scenario 7 changed:** townHouses/singleFamily controls now = interiorAmenitySf × `PRICING.controls.clubhousePerSf` (5,000 × $5 = $25,000), $0 with no clubhouse. Don't "fix" it back.
- Debug pass: `verify --full` 13/13 incl. build; `node --test` 169/169 (intake + fan files); `npm test` 61/61, 111,997 fuzz checks 0 failures, 12/12 bid-matrix.
- **Still open:** client-portal reframe (Client Viewer = portal login, invited per project); `verify:units` vs `verify.mjs` drift; **Sean — `MCP_API_TOKEN` in Amplify env for main** (`/api/mcp` answers 503 until set).

### 2026-09-15 — Mike's Claude — ✅ **DEPLOYED 98c2eb5**: conceptual-budget unit count + manual corrections + exterior amenity, and step 4 (access history) — no new migration
- **The undercount's root cause was in `mergeProposals.js`, not the takeoff.** A unit-matrix row with a blank/absent `code` was dropped outright, deleting its units from the project. A blank code is a LABELLING failure — `quantities.js` counts by `qty` and never reads `code`. Unnamed rows are now kept and keyed by a CONTENT signature (`blankKey()`: qty/unitSf/bedrooms/bathrooms/balconies/label), so rule 1 (same matrix on N sheets must not sum) still holds while two different unnamed types both survive. Lone Tree Ranch Test v1's 108-vs-168 and 294-vs-472 are both ≈0.623 of truth — one consistent missing slice.
- **Every quantity row is now correctable, and a `correct*` answer OUTRANKS a drawing-stated figure.** Namespace matters: `figure*` answers sit BELOW a drawing, `correct*` above one. Keeping them apart is what preserves `parkingLadder.test.mjs`. `/api/intake/estimate` does not whitelist answer keys, so `correct*` passes straight through.
- **⚠️ The trap worth remembering: a correction lands on the ROW, but a local variable captured before `add()` still holds the misread number.** Corrected gross SF sat on screen while BOH was still taken off the old total. `add()` now RETURNS the settled figure and every caller feeding later math uses that return value — `areaRow`, gross SF, unit SF, the area rows. The unit count had already been special-cased this way; nothing else had. **If you add a row that feeds a later calculation, use `add()`'s return, never the local you passed in.**
- **Second trap, same shape:** `estimate.js`'s `quantities` projection is a NAMED field list (deliberately — it's what keeps PRICING out of a public browser). `corrected`/`wasValue` were computed correctly and then silently dropped there, so the grid consumed a field the API never sent. Unit tests on `computeQuantities` passed the whole time. **A new row field must be added to that projection or it does not exist to the client.**
- Debug pass: `verify --full` 13/13 incl. build; verify unit-tests gate 376/376; `npm test` exit 0 — 60/60 budget-math, 111,997 fuzz invariant checks 0 failures, 12/12 bid-matrix. **Note: the CHANGELOG's inherited "1514/1514" was never a real number from `npm test`; don't propagate it.**
- **Housekeeping for whoever gets there first:** `verify:units` in package.json (47 files) and the `unit tests` gate in `scripts/verify.mjs` (18 files) have drifted into two divergent lists. Left alone on purpose — not inside a bug-fix push.
- **For Sean — still open:** set **`MCP_API_TOKEN`** (random, 32+ characters) in Amplify env vars for main. `/api/mcp` answers 503 until you do.

### 2026-09-15 — Mike's Claude — ✅ **DEPLOYED 3e7db3b**: every Sept 14–15 "LOCAL ONLY" entry below, migrations 0080–0085
- Ships the three 9-14 entries below plus the 9-15 fixture-share lockdown. Debug pass: `verify --full` 13/13 incl. build, `npm test` 1498/1498.
- **0080 changed before shipping (Mike 9-15: "We just need the master pricing inside the live app to show $200"):** it now sets the saved sheet's `corridors.stairwellPerLanding.product` to 200 whatever it reads, not only while it reads 175. Old jobs are NOT re-run.
- **Mike 9-15, settled:** "Other" energy code keeps +3%; exit signs stay halved over 300k SF; the MCP key may read DN (ILC-only — "Clients or external groups can never see DN pricing"); calendar DRAFT notes never expire (a never-dismissed reminder is coming instead); townhome controls only when there's a clubhouse (coming).
- **For Sean — action still needed:** set **`MCP_API_TOKEN`** (random, 32+ characters) in Amplify env vars for main. `/api/mcp` answers 503 until you do.

### 2026-09-14 — Mike's Claude — (shipped in 3e7db3b) admin and user privileges, steps 1–3 — migrations 0084 + 0085
- **Live account check:** `getSession()`/`requireAuth()` now load the user from the DB on every request (role, active, permissions, departments), so turning someone off or changing a role applies on the next click.
- **One permissions table:** `src/lib/permissions.js`. `can(user, action)` for `editMasterPricing` (Pre-con), `editJobMoney` (Construction, Operations, Finance), `editProducts` (Pre-con, Design, Construction) and `manageUsers`. Admins always pass. **A USER in OPERATIONS = COMPANY_ADMIN** (`effectiveRole`/`actsAsAdmin`). CLIENT_VIEWER is always false. `requirePermission(req, action)` in auth.js returns the plain-English 403. **Use `actsAsAdmin(user)`, never `isAnyAdmin(user.role)`** — a test fails on any new `isAnyAdmin(` outside auth.js.
- **0085:** PROJECT_MANAGEMENT rows are moved into CONSTRUCTION, labelled "Construction".
- **Leak closed:** change-order GETs and `/api/products` returned DN/cost to CLIENT_VIEWER; they now 403.
- **For Sean:** if you add a change-order, manufacturer, product or fixture-library write route, gate it with `requirePermission`. `privileges.test.mjs` scans those folders and will fail otherwise.
- The 0080–0085 folders must be committed together with `schema.prisma`. 0083 is the on-hold work-history table: empty and additive. **Mike: 0083 rides along in the next deploy.**
- **Mike: only ILC staff can be admins.** Company Admin is not a client-side role. All hand-typed `['SUPER_ADMIN','ILC_ADMIN','COMPANY_ADMIN'].includes(...)` lists replaced with `actsAsAdmin(user)`. A test now fails on any new one. Client components get `isAdmin` computed server-side (see `crm/notes/page.jsx`).
- **Bug fixed:** `/api/admin/agent-runs` and its `[id]/verdict` called `isSuperAdmin(user)` with the object, which is always false. A test now fails if auth.js's role checks are handed a person.
- **2026-09-15, security (still local):** `/api/share/fixture/[token]` returned every FixtureScheduleItem column (incl. `internalNotes`), and its PATCH wrote `{[field]: value}` to ANY item id, on any job. Now an allowlist (`src/lib/share/fixtureShare.js`) plus a row-must-be-on-this-link's-draft check; `shareLinks.test.mjs`. **For Sean:** any new public share route should return an allowlist, never a raw row. **This is live in prod until the next deploy.**
- **Mike, 2026-09-15:** sales reps are editable by anyone on staff (not a locked area).

### 2026-09-14 — Mike's Claude — 🛠 LOCAL ONLY (not deployed): interior/exterior stair dropdown, Meeting Prep budgets + jobs per person + work history — migration 0083
- **Stairs without drawings:** Small/Long breezeway replaced by one Interior/Exterior dropdown; Exterior = average of the two breezeway rates, **$235/landing**.
- **Meeting Prep sell figures allowed (Mike):** budget (latest priced Bid Matrix, else calculateBudget totalWithControls), contractValue, designContractValue. Still staff-only; CLIENT_VIEWER 403. `mentionsBuyPrice` drops any fact/point naming DN, dealer net, buy price, net cost, margin, rebates, spiffs. Budgets: `src/lib/meetingPrep/budgets.js`.
- **New fact blocks:** "Work history" and "Jobs with them" (count, lead, board stages, budget total).
- **Migration 0083 `ContactEmployment`** (additive): work history rows per contact. Staff paste a LinkedIn Experience section; Haiku (`bot.workHistory`, QUICK) extracts jobs. Never scraped. Archive-only, added to NEVER_DELETED. Route `/api/clients/[id]/contacts/[contactId]/work-history` (DELETE → 405). UI: `WorkHistoryPanel.jsx` on the People tab. **⏸ ON HOLD same day (Mike): no LinkedIn pasting — "a feature for later when we can connect to LinkedIn." Button hidden behind `WORK_HISTORY_READY = false`; table/route/panel stay dormant. Do not re-enable without a LinkedIn connection.**
- The 0080–0083 folders must be committed together with `schema.prisma`.

### 2026-09-14 — Mike's Claude — 🛠 LOCAL ONLY (not deployed): $200 stair landings, small/long breezeways, trenching per foot, MCP audit table, Meeting Prep — migrations 0080 + 0081 + 0082
- **Stairs:** master rate $175 → **$200 a landing** (Mike: "We have seen a cost increase"). The flat 2.2× breezeway multiplier is gone. There are now two breezeway styles on the Corridors screens, "Breezeway style?":
  - small (like Lowell + I76) ×1.125 = **$225**, the default;
  - long (like Lone Tree Ranch) ×1.225 = **$245**.
  - ⚠️ Old garden/stacked/gurban budgets drop from about $385 to about $197 a landing: a frozen $175 × the small multiplier.
- **Migration 0080** moves the saved master sheet 175 → 200, but only while it still reads 175. Frozen project snapshots are not touched.
- **Trenching:** $15/ft × 60 ft = $900 per wired pole (labor only, never in a total). Garage/carport boxes on the internal Project Data screen follow the public form's building-type rule.
- **Meeting Prep (0082, four new tables):** a "Prep for this meeting" panel on each sales note (not on clients, per Mike). It gathers what the CRM holds on the note's companies, people and deals into numbered facts. Haiku (`bot.meetingPrep`, QUICK) then writes 3–5 talking points that each cite their facts. Dollar figures are stripped before anything is saved or sent to the model. CLIENT_VIEWER gets a 403. Code: `src/lib/meetingPrep/`, route `/api/crm/notes/[id]/meeting-prep`, test `meetingPrep.test.mjs` (in `verify.mjs`).
- **Local DB trap:** `prisma db push` locally now wants to drop `ContactLegacy` (4 rows). I did not accept. Local tables go in by hand-written SQLite DDL + `prisma db execute`, then `prisma generate`.
- Schema-guard: 0080/0081/0082 are additive; nothing dropped. The 0080–0082 folders must be committed together with `schema.prisma`.
- **For Sean — action needed:** when this ships, please set **`MCP_API_TOKEN`** (a random value, **32+ characters**) in the Amplify console environment variables for main. Migration **0081** creates `McpQueryLog`. Until both are in place, `/api/mcp` answers 503 on purpose, because the read API does not run unlogged. That closes the request below.

### 2026-09-13 — Mike's Claude — ✅ **DEPLOYED d4cdeb0**: drive-lane lights by drive length + garages/carports on the public form (no migration)
- One area light per 81 ft of private drive (townhouse/single-family), new knob `exterior.surfaceParking.driveLaneFtPerLight`; drawing reader measures `driveLengthFtMeasured` off scaled site plans. Drawing-read townhome budgets now get the ½-per-home estimate instead of 0.
- Public form: # Garages (single family, townhouses, stacked flats, garden) and # Carport bays (same + wrap); other types price neither. Townhomes with no drawings default to 1 garage/home, flagged.
- Tests `driveLength` (15) + `garagesCarports` (10), both now in `verify.mjs`. Debug pass: `verify --full` 13/13 incl. build, `npm test` green (60/60, fuzz 0 failures, 12/12).
- **For Sean:** Mike asked to compare two outside plans (Meeting Prep Agent, MCP server). Finding: `/api/mcp` answers nothing in prod until the `McpQueryLog` migration lands (request still open below). Two comments (`src/lib/mcp/audit.js`, `.claude/agents/schema-guard.md`) wrongly say Amplify runs `db push`. Awaiting Mike's call.

### 2026-09-13 — Mike's Claude — ✅ **DEPLOYED 94fa973**: labor numbers corrected to Mike's answers (no migration)
- Undercabinet 5 ft/kitchen; frogeye 1 per 25 ft of corridor (corridor SF ÷ new `labor.corridorWidthFt` 6); walking-path lights $500 labor each (count = pathway line ÷ $800); solar sites credit back 70% of wired-pole labor (`labor.solarPoleCreditPct`) as a negative "labor saved" line; garage batteries stay no labor. New pricing-screen rows. Labor still never enters a total, so no budget dollars move.
- Files: `pricing.js`, `calculations.js`, `PricingEditor.jsx`, `QuestionCard.jsx` (green "Estimated labor saved"), `questionCosts.test.mjs` (11 tests).
- Accuracy triple check (report on G:): real figures verified; corrected 5.7% / 4.9% average miss, 7 of 9 / 8 of 9 within 10% (Sheridan A+B counted once). "Other" energy code keeps its 3% credit (Mike).
- Debug pass: `verify --full` 13/13 gates incl. build, offline units 957/957, `npm test` green, dev-server smoke/dn-leak/mcp 63/63.

### 2026-09-13 — Mike's Claude — ✅ **DEPLOYED c884238**: everything from Sept 12–13 + per-answer cost & labor, migrations 0077 + 0078 + 0079

- **Per-answer cost + estimated labor.** `calculateBudget` now returns `questionCosts`, keyed `"section.field"`, shaped `{ lines:[{label,count,countLabel,each,product,laborEach,labor}], product, labor }`. `CostImpact` (in QuestionCard.jsx) prints the chosen answer's entry under it on every internal screen and on the public form.
  - **Labor is never added to any total.** Rates come from the new top-level `PRICING.labor` (raw, no OH&P; `fillPricingDefaults` reaches old snapshots). $/SF and pathway lines carry `count:null, labor:0`.
  - The public form reads `estimate.budget.questionCosts` from `/api/intake/estimate`. It still has no PRICING/calculations import, and `intakePdf.test` + `questionCosts.test` pin that.
  - Internal screens recompute live with `useMemo(calculateBudget(...))`, because answers only save on Next. They need the `allSections` prop; DesignWizardClient sharedProps now passes it.
- **Migrations 0077–0079** ship together. Schema-guard found them additive only; nothing dropped, and ContactLegacy is untouched. One flag: `UserDepartment` rows cascade-delete with their user; `division`/`deptRoles` still hold the source data.
- Also in this push: the low-finish lighted mirror on the public form, plus every Sept 12 "LOCAL ONLY" entry below (single-family bollards/drive lanes, one area-light count, Frogeyes default, design matches conceptual, calibration + clubhouse + ±10% range, departments + bug-report archive, beta prep, location required, stories + stalls form). Intended deletions: `src/lib/divisions.js` (→ departments.js) and `DesignCommonSection.jsx`.
- Debug pass: offline 1,346/1,346, dev-server tests 67/67, `npm test` green, `npm run build` clean.

### 2026-09-13 — Mike's Claude — (shipped in the push above) Low-finish lighted mirror on the public form

- `vanityLighting` in `src/lib/intake/questionnaire.js` gains 'Illuminated mirror (Low finish)' → `illuminatedMirrorLow`, matching Units/Design screens. Test in designMatch.test.mjs. No schema change.

### 2026-09-12 — Mike's Claude — 🛠 LOCAL ONLY (not deployed): single-family bollards/drive lanes, one area-light count, desktop range, Frogeyes default

- `singleFamily` joins townHouses in `pathwayAsksBollards` (engine + ExteriorSection), the public filter (`BOLLARD_PROJECT_TYPES`) and `driveLaneLightsPerUnit` (0.5). ⚠️ Existing single-family projects drop pathway until answered Yes.
- New `exterior.areaLightsQty` ('auto' = cleared, via `priceOverride`) replaces lot poles + drive lanes together; engine returns `parking.qtyOverridden`. New card on ExteriorSection.
- `BudgetSidebar` takes an optional `range` prop; only the public form passes it.
- Emergency fallback `'integrated_inverters'` → `'frogeyes'` in calculations.js, both Emergency screens, DesignGarageSection, summary, PDF, share page, calibration lines (excelImportParser left alone). ⚠️ Projects with no saved strategy reprice lower.
- No schema change. Tests ✓.

### 2026-09-12 — Mike's Claude — 🛠 LOCAL ONLY (not deployed): Design budget matches Conceptual — garage batteries, townhome bollard Yes/No, project type on the Drawings step

- **Garage batteries:** every emergency strategy except `generator` now buys a battery in every other garage fixture (625 SF/fixture, $120). One copy of the math, `src/lib/emergencyCost.js` (client-safe, reads only master pricing), used by `calculations.js` and BOTH Emergency screens. frogeyes/inverters garage $/SF dropped. Design garage `battery` adds $0 / `batteryAndSensor` adds only the sensor when Emergency already buys the batteries.
- **Townhome pathway:** `exterior.pathwayBollards` Yes/No, townHouses only; No/blank = $0. ⚠️ Existing townhome projects drop their pathway line until answered Yes.
- **Public intake:** project type moved to the Drawings step (both paths, required to continue); question section renamed `'Project type'`; Controls step shows Energy codes only; bollard question renders only for Town Houses.
- Design screens/summary/PDF now read the price sheet (exit signs 120/75/22, garage 0.20/0.25). `DesignCommonSection.jsx` deleted (unused).
- No schema change, no migration. Build ✓, `npm test` ✓, new `scripts/tests/designMatch.test.mjs`.

### 2026-09-12 — Mike's Claude — 🛠 LOCAL ONLY (not deployed): conceptual accuracy calibration, clubhouse question, ±10% range, departments + bug-report archive (migration 0079)

**Accuracy:**
- `noDrawingGuesses.js` was re-calibrated against ten real budgets. It covers amenity/garage/
  exterior amenity/vanities per unit by type, BOH % of gross by type (under the 5% cap), a new
  `clubhouseSfWhenYes`, and `driveLaneLightsPerUnit` (townhouses 0.5).
- `quantities.js` manual block: new `hasClubhouse` answer (`CLUBHOUSE_KEY`, whitelisted
  yes/no in `validateAnswers`) and a new `driveLaneLights` row.
- The engine seam is `sections.exterior.driveLaneLightsQty` → added to the parking fixture count
  in `calculations.js`.
- Breezeway landings = `breezewayLandingMultiplier` 2.2 × $175. When no stair count is known,
  stairs = units ÷ `breezewayUnitsPerStair` (15).
- `computeIntakeEstimate` now returns `range {low, high, pct}` (±10%, typed-in only; null with
  drawings). The public form shows it.
- Average miss: 17% → 5% (required only) and 11% → 6% (all answers); 9/10 within 10% each run.

**0079 (additive):**
- user departments, multi-select, from `src/lib/departments.js` (replaces `divisions.js`);
- QC bug reports are archive-only.
- **Commit 0077 + 0078 + 0079 together with schema.prisma.**

**Checks:** related tests all pass; verify:units passes. Waiting on Mike's "Deploy".

### 2026-09-12 — Mike's Claude — 🛠 LOCAL ONLY (not deployed): beta prep — duplicate flag + fill-blanks merge, Sales intake review, public bug button, intake PDF, migration 0078

**Intake matching:** `src/lib/intake/duplicateMatch.js` (`findLikelyProject`) scores name +
city/state + email domain. The submit route stores `suggestedProjectId`; the visitor never sees
it. **Migration 0078** is additive (suggestion FK + `suggestionDismissedAt` on
`ConceptualSubmission`). **Mike approved 0078 (9-12).** **Commit 0077 and
0078 together with schema.prisma.** Linking goes through `mergeRequest.js`, which fills blanks
only; conflicts come back side by side and the project value wins unless picked.
`/api/admin/intake/[id]/link` and `/create-project` (the latter via shared
`src/lib/projects/createProject.js`). The old hand-set `linkedProjectId` is gone from the UI.
**Auth:** new `requireIntakeReviewer` (admins + active SALES-division users). Portal invites
stay admin-only. `User.division` is not in the JWT, so it is a DB read.
**Sales:** submit alerts SALES-division users via `notifyUsers` (`NEW_WEB_REQUEST` is
deliberately NOT in notify.js `NOTIFICATION_TYPES` — that list is per-project settings). /crm
shows PENDING unlinked requests as sky cards in the first stage column plus a banner. Cards are
not draggable. The verification card has a 6th check, `checkRequestLooksLikeJob`, which runs
first (90-day scope; skips linked/dismissed/non-pending).
**Public page:** `PublicBugButton` → `/api/intake/bug-report` (3/min/IP, BugReport
`source 'PUBLIC'`, reporterId null, shown as "Beta client" on QC). `/api/intake/pdf` recomputes via
shared `computeIntakeEstimate` (estimate route now uses it too) and renders with chromium. It is
registered in next.config + check-runtime-assets (44). There is a leak test for DN/buy/margin/
ILC_ONLY_FIELDS and a test that IntakeClient never imports pricing. The email button is
disabled on purpose (no mail connection).
**Pre-existing, not touched:**
- The QC board still HARD-deletes bug reports; a task chip was offered.
- ~~Schema drift~~ **Fixed 9-12:** the schema's reporter relation is now `onDelete: NoAction`, and
  the three 0027 indexes are declared as `@@index`. This is a schema-only change; there is no
  migration.
**Follow-up 9-12:** every public contact string is now `precon@ilcstudios.com` (was budgets@):
`INTAKE_PDF_CONTACT`, the share page, uploadClient, stagedParse, siteVision and DrawingDropzone.
The commented-out Resend line in the share route is untouched.
**Checks:** verify:units 915/915, build clean, all guards OK. Local PDF total $321,710.23,
matching the estimate. Staff screens were not clicked through because the preview browser is not
logged in. Waiting on Mike's "Deploy".

### 2026-09-12 — Mike's Claude — 🛠 LOCAL ONLY (not deployed): project location required on conceptual requests, migration 0077

Mike: *"We need a city and state and zip code. We need location for data tracking."* Every public
conceptual-budget request now requires **city, state and zip** on About You. **Migration 0077**
adds three nullable TEXT columns to `ConceptualSubmission` (`city`, `state`, `zip`). It is
additive only and ships via `migrate deploy`; schema-guard: PASS. Old rows stay blank. They are
real columns rather than answer rows, so "every request in Texas" is one query. One shared
check, `checkLocation()` in the new `src/lib/usStates.js` (50 states + DC; ZIP+4 stored as
`12345-6789`), runs in the form and in `/api/intake/submit`, which answers **422** without it
(verified with a direct POST; no row was created). The location shows in the /admin/intake queue as a
new column plus a block in the panel, and as a LOCATION line in the precon email. The panel had
labelled the project name "Company", now fixed to "Project". The landings estimate note on the
public form is now one short sentence (`estNote`), and reviewers still see the full reasoning.
**Heads-up:** `Project` has city/state but no zip. `duplicateMatchId` is still hand-set only; an
auto-flag for likely duplicates has been proposed to Mike, not built. Commit the 0077 folder
together with schema.prisma. Verified in the local preview at desktop and 375px, with no console
or server errors. `noDrawings.test.mjs` and `usStates.test.mjs` are now registered in
verify:units, and the suite passes 849/849.
Waiting on Mike's "Deploy".

### 2026-09-12 — Mike's Claude — 🛠 LOCAL ONLY (not deployed): no-drawings form asks for stories + surface stalls, adds a progress bar

Mike approved: the no-drawings form now **requires # stories and # surface parking stalls**
along with type, units and size. **0 stalls is a real answer** (all-garage), so it has its own
zero-allowed check in `noDrawingsReady`, `validateAnswers` and quantities.js `statedCount`;
0 stories is still rejected. New copy ("the more detail you give us, the more accurate your
budget") and a bar, "You've given us N of 14 figures". The stories/parking guesses in
`noDrawingGuesses.js` stay as a backstop for older submissions. No schema change. Tests
1,322 pass; verified in the local preview (podium, 0 stalls → ready, $472,817, no errors).
Same batch, a layout clean-up of the figure boxes (Mike: fields hold 8 characters at most). A new
`FigureField` in IntakeClient.jsx uses a CSS subgrid so boxes in a row stay aligned. Boxes are
capped by `figureBoxCls` (`max-w-[11rem]`, on the wrapper, because the ESTIMATE pill is
absolute). The optional grid is 2/3 columns, and the "Optional" tags are gone. Measured at
1280px and 375px: 14 boxes, all labels on one line, rows aligned, no sideways scroll.
Waiting on Mike's "Deploy".

### 2026-09-12 — Mike's Claude — ✅ **DEPLOYED e93c9c3**: migration 0076 + no-drawings conceptual budget + auth/me fix + questionnaire wording

Mike said "deploy". Full debug pass first: `npm test` exit 0 with 0 failures; `npm run build`
clean; check-runtime-assets 43/43. One push carries the two entries below (both were local)
plus: the amenity-hours question now says "external amenities" and asks for the exterior pool's
open/close schedule, "Other" removed (old saved "Other" still reads as `beforeDusk`), and "IECC
2021" reads "IECC" on every screen/PDF label. amplify.yml runs `migrate deploy`, so 0076
applies on this build. `package-lock.json` left unstaged as usual.
Mike also said **no** to Google/Outlook live calendar sync — the calendar is a one-time import.

**Calendar import to prod: DONE 2026-09-12.** Mike's 1,866 meetings went through
`POST /api/automation/intake/calendar` from his logged-in browser (organizer moved into
attendees, `ownerEmail: mike@ilcstudios.com`). Result: **883 DRAFT notes created, 983 skipped
by the normal worth-a-note rules** (cancelled, ILC-only, personal, same-slot duplicates, nothing
business-like), **0 errors**, 252s. Owner verified: notes show created by Mike Kershner. Keyed
on `calendarRef`, so a re-run updates instead of duplicating. 0 BotRules → no automations
fired. Temp batch copies deleted. After the build went live `/api/auth/me` returns 200.

### 2026-09-11 — Mike's Claude — (shipped in e93c9c3) files, drawing sets, budget versions and products are archive-only, migration 0076

Sign-off: Mike, in chat (*"yes drawings and budgets and products should be archive only"*,
*"like budget matrix, conceptual budget, design questionnaire I don't want to be deleted"*).

**Migration 0076_archive_only_documents** (additive only; schema-guard PASS): `archivedAt` +
`archivedById` (FK User, SET NULL) on ProjectFile, DrawingSubmission, ManufacturerProduct,
DesignBidMatrix. **The 0076 folder must be committed together with schema.prisma.** Local
SQLite took the ADD COLUMNs via `prisma db execute`; its `ADD CONSTRAINT` lines fail on
SQLite (expected — Postgres runs them in `migrate deploy`).

- `src/lib/archive.js`: those four join the filter, and **also on `findFirst`** ("latest
  file/budget" must never be an archived one). `NEVER_DELETED` makes `delete`/`deleteMany`
  THROW `DeleteRefusedError` for them plus DrawingFile, ConceptualSubmission,
  ConceptualSubmissionAnswer, QuestionnaireResponse. Throwaway test rows must be cleaned up
  with a raw `new PrismaClient()`.
- Five DELETE routes → 405 + archive/restore POST (products, manufacturer products,
  design-bid-matrix, drawing-submissions, files). One sheet archives its whole set.
- Manufacturer DELETE (with products) and fixture-schedule-version DELETE (a budget was
  built from it) → 409; the screens now show the reason instead of dropping the row.
- Next budget version numbers count archived ones (`INCLUDE_ARCHIVED`).
- **Same batch, separate fix:** `/api/auth/me` used an undefined `jwtUser.id` → 500 on every
  call in prod → AutomationNav (its only caller) never showed the ADMIN_TABS. Now
  `session.id`; pinned by `scripts/tests/authMe.test.mjs`.
- **Calendar import to prod: NOT done yet.** 1,866 meetings from Mike's Outlook .ics are
  batched; nothing has been sent to prod (the dry run never reached the server). Production
  has 0 BotRules, so an import fires no automations.
- `/archive` has Files / Drawing sets / Budget versions / Products (products only for
  see-everything users). History tab: `file_archive` / `file_restore`.
- Tests: `scripts/tests/documentArchive.test.mjs` (13).

### 2026-09-11 — Mike's Claude — (shipped in e93c9c3) conceptual budget without drawings + interior amenity tiers + parking ladder

- **No-drawings path** on /conceptual_budget. It asks "Do you have drawings?"
  - **No** opens a figures form. Required: project type, units, and gross SF or average unit SF.
  - Blanks get flagged guesses from `src/lib/intake/noDrawingGuesses.js`, a server-only module that is imported only by `quantities.js`.
  - Marker: answer row `noDrawings: 'yes'`.
  - `/api/intake/estimate` enforces `noDrawingsReady()` server-side and ignores drawings sent with a no-drawings answer.
  - The old rule that "drawings are the ticket in" is relaxed by Mike's request.
- **Prefilled estimates** (Mike: "fill out the field but say it's an estimate"): once the required three are in, the optional boxes show our derived number in amber with an ESTIMATE tag; typing replaces it, clearing restores it. Pure display — the payload still carries only what was typed.
- **Back of house SF**: new `figureBohSf` figure; manual mode estimates BOH = gross − units − corridors − amenity, capped at `pricing.boh.maxPctOfGross` (5%). Drawing-read budgets still leave BOH null on an estimated gross. Manual budgets now price BOH, so they read higher.
- **Interior amenity tiers**: $4–16 per SF (Low 4–8, Medium 9–12, High 13–16 — Mike picked option 2).
- **Parking ladder**: stated count → typed figure → provided minus garages/carports → units × required ratio → counted stalls → no-drawings guess.
  - `siteVision` reads `parkingRatioRequired` and `surfaceParkingCounted`. Prompt version `siteVision-2026-09-11`.
- No migration. Tests 1305/1305 after one flaky rerun. Build clean.
- **Waiting on Mike**:
  - the tier edges
  - whether the default guesses are right
  - "Deploy"

### 2026-09-11 — Mike's Claude — ✅ **DEPLOYED**: companies, projects, people and notes are archive-only, migration 0075

Mike: *"yes archive only for everything. it won't be that much data."*

**Migration 0075**: `archivedAt DateTime?` + `archivedById String?` (FK User, SET NULL) on
Client, Project, ClientContact (model `Contact`) and Note. Additive only; schema guard
approved. Local SQLite got it through `prisma db execute`, never `db push`.

**One rule, not fifty filters.** `src/lib/archive.js` → `withArchiveFilter`, a Prisma
`$extends` query extension wrapped around the client in `src/lib/db.js`. It adds
`archivedAt: null` to `findMany`, `count` and `groupBy` on the four models unless the
`where` already names `archivedAt`. Deliberately NOT on `findUnique`/`findFirst`
(archived pages still open) or `aggregate` (next-number lookups). **Nested `include`s
and `_count` are NOT covered by the extension — filter those by hand** (done in the
client list, client page, CRM page, project page, contacts routes).
`...INCLUDE_ARCHIVED` (`{archivedAt: undefined}`) opts a query back in: used by the
budget-number lookup (unique column), the Project Team seat check and the admin
user-delete counts.

**Routes:** DELETE on clients/[id], projects/[id], contacts/[contactId], crm/notes/[id]
and meeting-notes/[noteId] returns 405 `deleteRefused()`. New POST `{archived: bool}` on
each (400 without the flag) writes `archiveData()`. Project archive/restore logs
`project_archived`/`project_restored` activity. Client archive no longer nulls
`Project.clientId`. Screens use the shared `ConfirmArchiveModal`; `ArchivedBanner`
on the client and project pages; `/archive` lists and restores all four.

**Pre-existing bug fixed:** `POST /api/clients` passed `type: null` into a required
column (default "developer"), so any company made with no Client Type ticked 500'd —
Prisma reports it as the misleading "Argument `createdBy` is missing". Now `undefined`.

**Tests:** `crmArchive.test.mjs` (14, incl. an e2e). `uploadFlow.e2e` cleans up with
Prisma `deleteMany`. Full suite 1277/1277 with the dev server up; build clean; both
migration checks clean.

### 2026-09-11 — Mike's Claude — ✅ **DEPLOYED (65f8d7f)**: email templates archive-only + removed prebuilt dashboard cards stay removed, migration 0074

Mike: *"Do it for email templates in the CRM definitely."* / *"Make it stick."*

**1. Email templates (`MessageTemplate`) are archive-only.** `DELETE
/api/automation/templates/[id]` now returns 405 with a plain-English refusal (kept, not
removed — same reasoning as the two bot-knowledge routes). Archive = `isActive: false`
via the existing PATCH. The screen's Active checkbox is replaced by Archive / Restore in
the drawer footer plus a hover Archive on each row, behind the amber
`ConfirmArchiveModal` — **now its own file at
`src/components/salesAutomation/ConfirmArchiveModal.jsx`**, imported by both the
knowledge and templates pages. `followUpDrafter.findTemplate` already filtered
`isActive: true` in both queries; `templatesArchive.test.mjs` pins that and forbids any
`messageTemplate.delete*` anywhere in `src`. Pre-existing bug fixed: the drawer passed the
`{ template }` response wrapper to the list instead of the template.

**2. Removing a prebuilt dashboard card sticks. Migration 0074** adds
`DashboardHiddenWidget (dashboardId, widgetKey, hiddenById?, hiddenAt)`, unique on
(dashboardId, widgetKey), **CASCADE on Dashboard** (so Reset to default — which deletes
the personal copy — brings every card back) and SET NULL on User. Purely additive; the
schema guard reviewed it and found nothing destructive.
- **Cards are keyed by identity, not title:** `prebuiltKey()` in
  `src/lib/dashboards/prebuilt.js` = `dataSpec.kind`, or `kind:report` for the
  calibration set. `appendMissingPrebuilt` used to match by NAME, so a retitled prebuilt
  card got a duplicate — fixed.
- Widget DELETE records the hide in the same `$transaction` (upsert, never
  `skipDuplicates`). GET `/api/dashboards` skips hidden keys and returns `hiddenCards`;
  new `POST /api/dashboards/[id]/hidden { key }` puts one back (clears the preference
  row). DashboardView shows a **Put back a card (N)** select beside Reset.
- Fork copies the source's hidden rows, so an admin's removal from the default survives
  the first personal edit.
- **Ownership gap closed:** widget PATCH and DELETE never checked
  `widget.dashboardId === params.id`, so owning one dashboard let you edit or delete a
  widget on another by id. Both now 404 in that case.

**Local DB:** table created with `prisma db execute` (SQLite DDL) — `db push` still wants
to drop `ContactLegacy`. **Prod gets it from `migrate deploy`.** Commit the 0074 folder
together with the schema change.

**Still open with Mike:** archive-only for clients, projects and people (recommended,
not built — deleting a company still silently blanks its Project Team seats).

### 2026-09-10 — Mike's Claude — ✅ **DEPLOYED (add8bec)**: nothing gets deleted any more — the bot's library is archive-only, buried cards go to an archive, plus the "Things Needing a Look" card and migration 0073

Mike: *"I think we should make all knowledge base probably be archived and not be deleted
at all if it takes it out of the bot box reach... I don't think these cards should ever
get deleted. they should get archived somewhere into an archive that is accessible but
not easily."* Three things went out in this one push.

**1. Delete is gone from Bot Knowledge — files and typed answers, everywhere it appeared.**
Archiving already did the whole job: `src/lib/botKnowledge/retrieve.js` filters
`isActive: true` on **both** `botKnowledgeEntry` and `botKnowledgeDoc`, so an archived item
is out of `rankedLibrary`, `findRelevantKnowledge`, `knowledgeContextBlock` and
`knowledgeReach` — while the row, the extracted `text` column and the S3 file all survive.
Deleting only ever added the chance of losing something for good, and for a document it
also destroyed the S3 file. The old `ConfirmDeleteModal` is now `ConfirmArchiveModal`
(amber, **Keep it as is** / **Archive it**) and warns in Mike's words that the bot will not
be able to reach the item. Archived docs stay in the same list, greyed with an **Archived**
badge; archived answers gained a real **Restore** button.

**⚠️ Both DELETE routes were kept and made to refuse (405), not removed** —
`api/automation/knowledge/[id]` and `api/automation/knowledge/docs/[id]`. Deliberate: an
old open tab, a bookmark, or anything written later cannot quietly destroy a row or an S3
file by calling a URL the screen no longer uses. **If a hard delete is ever genuinely
needed, that is now a deliberate code change, not a button.**

**2. "That's fine" on the verification card archives instead of burying for good.**
Company-wide dismissal is unchanged and is what Mike asked for. What changed is where it
goes: a small closed line at the bottom of the card reading **Put away (N)**, fetched only
when somebody opens it. Restoring **stamps `restoredAt` on the existing row** — no row is
ever deleted, so who put it away and when survives a restore.

**Migration 0073 was extended before it ever applied anywhere.** It was untracked and had
never run (and `prisma/dev.db` has no `_prisma_migrations` table at all), so editing it in
place carried no checksum risk. `VerificationAction` now also carries `title` / `detail` /
`href` / `hrefLabel` / `restoredAt`. The four text columns are a **snapshot of the item's
own words, taken server-side from a fresh recompute at the moment somebody buries it** —
necessary because the checks recompute from scratch on every load, so once the underlying
record is fixed the item stops being produced at all and the archive would have nothing
left to show but a machine key. `/api/verification/archive` prefers current wording and
falls back to the snapshot, and reports `stillTrue` so the screen can say *Still reads this
way* vs *Has been sorted out since*.

**New shared loader `src/lib/verification/load.js`** — `runChecksFromDb()` and
`loadActions()`. All three routes (`/api/verification`, `/dismiss`, `/archive`) go through
it so the Prisma selects cannot drift apart. Note `Project`'s contact relation is
`contactLinks`, not `contacts`.

**3. The "Things Needing a Look" card itself**, built earlier the same day, shipped in the
same push. A card on `/dashboards/main` surfacing at most five records that disagree with
each other, never more than five NEW ones a week, scoped to open jobs plus anything closed
in the last 90 days. Five checks: Pipeline-tab architect/GC text vs the job's Architect/GC
company seats; a person with no company; a won/lost job with no close date or an
`approximated` one; two people sharing an email; a job with people but no main contact.

The card reaches prod dashboards **without a data migration**: `appendMissingPrebuilt()` at
`src/app/api/dashboards/route.js:12` appends any template with a `dataSpec.kind` by widget
NAME at request time, on personal copies and on the admin default alike. The seed gap does
not matter.

Still true, unchanged: **removing this card from a personal dashboard does not stick** —
there is no table recording a hidden prebuilt widget, so `appendMissingPrebuilt` puts it
back.

Debugging pass: **1245/1249 tests pass**; the 4 failures are all in `uploadFlow.e2e` and
are the **Anthropic API returning "credit balance is too low"**. Not a code fault.
**⚠️ Sean should know: with the API credits exhausted, the live drawing reader and the
sales bot are down in production too, not just in tests.** `npm run build` clean, all three
verification routes in the route table, all 43 runtime assets present; guard scripts green
(73/73 Postgres migrations, 125/125 schema-migration sync).

Local `VerificationAction` columns were added with `prisma db execute`, **not `db push`** —
push still wants to drop `ContactLegacy`. That trap is unchanged.

### 2026-09-09 — Mike's Claude — ✅ **DEPLOYED**: the whole 2026-09-09 CRM queue in one push, migrations 0070 + 0071 + 0072

Everything that had been sitting BUILT-NOT-DEPLOYED went out together: the people-table
merge (0070), Project Team + Project People (0071), items D/E/B/F/A, plus three final
things Mike asked for after reading the last round. **Three migrations rode along in
this push, applied oldest first, halting at the first failure.**

- **Bot Knowledge delete now asks with a real in-app confirmation.** Mike: *"it pulls
  that data out of the bot which could be hugely detrimental."* One shared
  `ConfirmDeleteModal` in `sales/automation/knowledge/page.jsx` serves all three delete
  surfaces (doc rows, active Q&A, archived Q&A), offers **Archive instead** wherever the
  item is still active, and disables while the request is in flight. `confirm()` and
  `alert()` are both gone from that file.
- **Client Info tab edits in place.** `EditModal` and `Inp` are deleted from
  `clients/[id]/ClientDetailClient.jsx` — no pop-out, no Save button, no Edit button in
  the top bar. All twenty fields save on blur with an optimistic update and rollback.
  **Trap for anyone editing this:** `PATCH /api/clients/[id]` returns the client's own
  scalar columns plus `tagLinks` and **nothing else** — no `projects`, `contacts`,
  `owner` or `createdBy`. Merging the whole response into page state wipes those, so
  `patchClient` takes back only server-derived scalars and re-fetches when `ownerId`
  changes. Same class of trap as `PATCH /api/projects/[id]`.
- **0072_project_wording_reseed** — data-only. Renames the five pieces of wording that
  were seeded into the database and therefore could not be fixed by changing code:
  `RelationshipCadenceRule.label` 'Active Deal' → 'Active Project', and four
  `DashboardWidget.name` rows (Open Deals by Organization, Deals by Service Type, Lost
  Deal Analysis, Deals Won by Owner). Neither model has an `@@map`, so the Postgres
  table names are the quoted model names. `prisma/seeds/dashboardTemplates.js` was
  corrected to match so new dashboards are born right.
- **Two fixes to 0070, caught by schema-guard before it shipped.** (1)
  `PlaybookAssignment.contactId`, `PlaybookDistribution.contactId` and
  `NoteAction.contactId` are soft links with no foreign key — the merge was not
  remapping them, so for any deduped person a proposal signer / distribution seat /
  note follow-up would have silently read as nobody. New step 6b remaps all three off
  `_people_match`. (2) Step 4 now keeps `LEAST(createdAt)` so a merged person's "known
  since" cannot move forward.

**Standing warning that survives this push:** from now on, `prisma db push` against prod
DROPS `ContactLegacy` — the only pre-merge copy of every CRM contact. `amplify.yml` runs
`prisma migrate deploy`, not `db push`, which is what keeps it. There is no backup step
in `amplify.yml`. Do not point `db push` at production.

Checks before the push: 1,220/1,220 regression tests pass with the dev server up; clean
production build with it stopped, all 43 runtime assets present; migration-Postgres,
schema-sync and dynamic-page guards all pass; 0072 executed against a real database to
prove every table and column name in it exists. 0070 is Postgres-only, so it has never
run locally — its first execution is against production.

### 2026-09-09 — Mike's Claude — ✅ **DEPLOYED**: items D, E, B, F, A — the rest of the CRM queue

Finishes the approved queue from the 2026-09-09 CRM review (0 → C → D → E → B → A, F
anywhere). **No migration and no schema change in any of this** — it is all screens
plus one new derived helper.

- **D — Related Projects.** A client screen now lists the jobs where that company sits
  in one of the six Project Team seats but does not own the job, with a chip per seat.
  Query lives in `clients/[id]/page.jsx`, AND-ing `teamMemberWhere(clientId)` with
  `NOT clientId`, scoped by `canSeeAllData()`.
- **E — Pipeline side panel.** `src/components/crm/PipelineSidePanel.jsx`. Clicking a
  card on `/crm` opens it instead of navigating away. Writes through
  `PATCH /api/projects/[id]` — the same fields and the same server-side Lost/Abandoned
  reason rule as the project screen, so the two cannot drift. Note for anyone editing
  it: that PATCH returns `projectData` + `TEAM_INCLUDE` only, **not** `client` or
  `salesOwner`, so the panel re-attaches the owner's name itself before handing the row
  back to the board.
- **B — People tab rebuilt** on the client screen: two lines per person, every field
  click-to-edit through `PATCH /api/clients/[id]/contacts/[contactId]` (which already
  returns the contact with its project links), and the Open/Won/Lost/Abandoned numbers
  now hover to list and click to open the jobs behind them. **Pre-existing bug fixed:**
  the page loaded `contacts` with no `projectLinks`, so those four numbers were blank
  for everyone. New `contactDealProjects()` in `src/lib/crmClient.js` shares
  `projectOutcome` with `contactDealCounts`, so a chip's number and the list it opens
  can never disagree.
- **F — Bot Knowledge hard delete.** UI only. `DELETE /api/automation/knowledge/docs/[id]`
  and `.../knowledge/[id]` already removed the S3 blob and the row and were already
  admin-gated; there was simply no button. Archive is untouched.
- **A — "Deal" → "Project" across the app.** Display text only, ~20 files. Identifiers,
  enum keys, API fields, rule keys (`DEAL_STALE`, `dealStatus`, `deal_stage`, …) are all
  unchanged on purpose. Two pinned test strings in `statusEvents.test.mjs` moved with the
  history wording. **Careful:** the cadence tier label `Active Deal` and the three
  starter dashboard names live in DB rows seeded from
  `api/crm/cadence-rules/route.js` and `lib/defaultDashboard.js` — the code says
  "Project" now, but the saved rows keep the old names until those defaults are
  re-seeded.

**Checks:** 1,220/1,220 regression tests green with the dev server up; `npm run build`
clean with 43/43 runtime assets; migration-Postgres (71), schema-sync (124) and
provider guards all pass.

**Still queued, unchanged:** Phase B of the weekly-meeting widgets and the "gone quiet"
card are ON HOLD by Mike; the real calendar import is still a dry run only; the
Pipedrive import waits on Maram.

---

### 2026-09-09 — Mike's Claude — ✅ **DEPLOYED**: item C — six Project Team companies, Project People, and one main contact

Item C of the approved CRM queue. Mike, 2026-09-09: *"we have six project team fields
and they connect to clients"* and *"you can just kind of choose people are you want
connected."* Maram, same call: *"there always has to be like the one main point person
and that's the only person that's going to be considered for those fields."*

**Six named FK columns on `Project`, not a role-tagged join table.** `developerId`,
`generalContractorId`, `electricalContractorId`, `interiorDesignerId`,
`electricalEngineerId`, `architectId` — every one optional, every one
`onDelete: SetNull`, six matching `@@index`. Schema-guard endorsed the shape and named
the costs plainly: a seventh role is a migration plus six code touchpoints; a seat can
never carry anything extra (no per-seat contact, date or note); and a project now has
two shapes for "who is involved" — people via `ProjectContact`, companies via six
columns. The single source of truth for the six is `src/lib/projectTeam.js`, so a
seventh role is that file plus the schema, not a hunt through screens.

**Migration 0071 is purely additive** — 6 `ADD COLUMN`, 6 `ADD CONSTRAINT`, 6
`CREATE INDEX`. No drops, renames, retypes, NOT NULLs or unique indexes. Schema-guard
reviewed it and found schema and SQL in exact agreement (Prisma-convention constraint
and index names, `ON UPDATE CASCADE` matching Prisma's default for an optional
relation). `prisma validate` passes because the other six `Client`↔`Project` relations
are named. Locally only the 6 columns + 6 indexes were applied — **SQLite cannot
`ALTER TABLE ... ADD CONSTRAINT`**, and Prisma does not need the FKs locally.

⚠️ **0071 rides behind 0070 in the same `migrate deploy`.** Prisma applies migrations in
filename order and halts on the first failure. If 0070 fails — likeliest at its
`CREATE UNIQUE INDEX "ClientContact_contactNumber_key"` — Prisma rolls that file back,
records it as failed, and **0071 never applies**. Recovery is manual:
`npx prisma migrate resolve --rolled-back "0070_merge_people_tables"` on the console.
Deploy these two on a quiet moment, not mid-day.

**Behaviour change to flag:** deleting a company now silently blanks its seat on every
project's team. The projects survive untouched; the seat just goes empty. The
alternative was refusing to delete any company that sits on any job anywhere.

**Known overlap, deliberately left alone:** the free-text `PipelineProject.architect` /
`gc` boxes on a client's Pipeline tab and the new project Architect / GC seats are two
separate things and can disagree. The old ones are typed words; the new ones are real
links to client records.

**The main-contact rule changed how people's numbers read.** `contactDealCounts` now
counts only the projects a person is `isLead` on. Before, everyone copied onto a big job
inherited credit for winning it. One dependent test in `crmClientModule.test.mjs` was
updated to mark its links `isLead: true` — its intent (one deal per project, junk links
ignored) is unchanged.

**Mike's "flag a person with no company"** is built as three states, since they are not
the same problem: no employer at all (red badge), an employer typed by hand but never
linked to a client record (amber hint), or properly linked. `companyLink()` /
`countMissingCompany()` in `src/lib/crmClient.js`.

Verified: regression **1,219/1,219** with the dev server up; `npm run build` clean
(43/43 runtime assets); all three schema deploy guards green
(`check-migrations-postgres` 71/71, `check-schema-migrations-sync` 124/124,
`check-schema-provider`). New `scripts/tests/projectTeam.test.mjs`, 16 tests.

⚠️ **Not deployed — Mike has not said "Deploy" this session.** 0070 and 0071 are both
sitting in the working tree and would go up together. Next in the queue: D (Related
Projects, which reads C's seats backwards through `teamMemberWhere`), then E (pipeline
side panel), then B (People tab layout), then A (wording), with F anywhere.

---

### 2026-09-09 — Mike's Claude — ✅ **DEPLOYED**: the two people tables are now one

Mike, 2026-09-09, after the CRM review with Maram: *"yes absolutely"* — merge them.

**There were two tables for the same humans.** `ClientContact` (someone who works at a
client, created from a client's People tab, where EMAIL history was recorded) and
`Contact` (someone we know, company optional, created from the CRM contacts screen,
where the CADENCE clock and last in-person were recorded). Same Ryan, two rows, and the
two halves of his history on different records — which is why no screen could ever show
both Last Email and Last In Person.

**Merge direction: the TABLE `ClientContact` survives; the MODEL is renamed `Contact`
with `@@map("ClientContact")`.** Three FKs already pointed at `ClientContact`
(`ProjectContact`, `EmailContactLink`, `Client.contacts`) and only one at `Contact`
(`NoteContact`), so this moves the fewest rows and changes 8 call sites in 4 files
instead of 13 files. `scripts/check-schema-migrations-sync.js` honours `@@map`, so the
gate still finds `CREATE TABLE "ClientContact"` in 0063.

**Migration 0070 is non-destructive.** Nothing is dropped. Step 8 renames the old
`Contact` to `ContactLegacy` and KEEPS it as the rollback copy. ⚠️ **`ContactLegacy` is
deliberately absent from `schema.prisma` — `prisma db push` against prod would DROP it.
amplify.yml runs `prisma migrate deploy`, which leaves it alone. Do not push.**

**Schema-guard caught two deploy-halting bugs, both fixed before anything ran:**
1. Step 6 originally moved note attributions with `UPDATE "NoteContact" SET contactId`,
   which violates `NoteContact_noteId_contactId_key` **before** the dedupe DELETE meant
   to guard it — Postgres checks unique indexes per row, immediately, and they are not
   deferrable, so the DELETE never runs and `migrate deploy` halts mid-migration in
   prod. Replaced with `INSERT ... SELECT DISTINCT ON ... ON CONFLICT DO NOTHING` then
   `DELETE`. (`ON CONFLICT` alone does not protect against duplicates *within* the same
   INSERT — `DISTINCT ON` is required alongside it.)
2. The email match was a plain many-to-many join, so one old row matching two survivors
   would write the same `contactNumber` onto both and break the unique index at step 7.
   Narrowed to emails appearing **exactly once on each side**; anything ambiguous falls
   through as its own visible duplicate row rather than a broken deploy.

**Two behaviour changes Mike has been told about:** deleting a client now unhooks its
people instead of deleting them (`onDelete: SetNull`); deleting a person from the People
tab now also removes their attribution on sales notes (the notes survive, only the
"who was there" link goes).

**Also:** contact numbers now come from one counter (`src/lib/contactNumber.js`) used by
both creation screens. Previously only the CRM screen numbered anyone.

Verified: **1,197/1,197** regression with the dev server up, `npm run verify` 11/11,
`check-migrations-postgres.js` 70/70, `prisma validate` clean, `npm run build` clean
(43/43 runtime assets). New `scripts/tests/peopleTable.test.mjs`, 12 tests, pins the
merge so the tables cannot silently split again.

⚠️ **Not deployed. Schema-guard returned "needs Mike's sign-off" and he has not given it
yet.** Open ask from schema-guard: run a duplicate-email count against PROD before he
signs, so he decides on numbers rather than "probably clean" — local counts (0 overlaps
across 4+2 rows) prove nothing about production.

**This is item 0 of the approved CRM build queue** (Mike, 2026-09-09: *"agreed with your
approach"*): merge → C (six Project Team fields + Project People multi-select) → D
(Related Projects) → E (pipeline side panel) → B (People tab layout) → A ("Deals" →
"Projects" wording, last). F (hard-delete Bot Knowledge items) slots in anywhere. The
merge went FIRST because C's Project People picker points at the people table, and
building it against a table about to change identity means building it twice.

---

### 2026-09-08 — Mike's Claude — ✅ **DEPLOYED 2026-09-09 (599fafa)**: the whole Bot Knowledge library now reaches the sales bot

Mike: *"we just want the bot knowledge to feed into the sales bot like you said. We
need every character or everything we upload to do that. It sounds like it isnt
right now."* He was right on all counts.

**Three separate narrowings, all removed.** `findRelevantKnowledge` was asking for
`categories: ['GENERAL','DEVELOPERS']` only, taking `limit: 5`, cutting each hit to a
`MAX_DOC_CHARS/2` excerpt — and, worst of all, running
`scored.filter(s => s.score > 0)`, which **deleted every document that did not share a
keyword with the project name**. Ranking is now ORDER ONLY; nothing is dropped for
failing to match, no category filter, no limit, whole documents.

**The sales bot has TWO email writers and only one had knowledge.**
`src/lib/bot/followUpDrafter.js` (stale-project, cron + manual) had it;
`src/lib/bot/composeOutreach.js` (consolidated outreach from a sales note) had none at
all. Both now read the library; the lookup in composeOutreach is wrapped in try/catch
because a knowledge failure must never cost us the email.

**The ceiling is the context window, not a policy.** `bot.followUp` /
`bot.outreach.*` are all the `QUICK` tier = `claude-haiku-4-5`, 200K tokens ≈ 800K
characters. `KNOWLEDGE_CHAR_BUDGET = 350_000` (~87K tokens) leaves the prompt, project
context and reply an enormous margin. New pure `packKnowledge()` in
`botKnowledge/text.js` (kept there because that file has ZERO imports, so `node --test`
can reach it) packs whole documents in rank order; anything cut is marked inline with
`[…this document was too long to include in full…]` — never a silent trim.

**New `GET /api/automation/knowledge/reach` + a banner** at the top of
`/sales/automation/knowledge` stating in plain numbers how much of the library goes
into every draft, how much of the ceiling that is, and how many docs are unreadable
(pointing at the "Try again" button from the entry below). Mike had to ask whether
this worked because the screen never said; now it does.

Verified: **1,185/1,185** regression with the dev server up, `npm run verify` 11/11,
clean `npm run build` still reporting **43/43** runtime assets. No schema change, no
migration.

✅ **Shipped together in 599fafa on 2026-09-09** — this and the PDF fix below, one push.
Mike still needs to click "Try again" on each red PDF on the live screen now that the
reader works.

---

### 2026-09-08 — Mike's Claude — ✅ **DEPLOYED 2026-09-09 (599fafa)**: every PDF on the live Bot Knowledge screen fails to open

Mike uploaded files to Bot Knowledge on the live app and a PDF failed. It is not
that PDF — **every PDF uploaded to Bot Knowledge in prod since 2026-09-07 (d78e8f5)
has failed**, and every one of them is sitting there as "Not readable".

**Cause: the runtime-asset trap, on a route the gate did not know about.** The
Lambda trace for `/api/automation/knowledge/docs` shipped 381 files with
`pdf.worker → 0`, `standard_fonts → 0`, `jbig2 → 0` (tesseract 38 and xlsx 5 were
present, which is why Word/Excel/images were fine). No worker means `getDocument()`
throws "Setting up fake worker failed" before page 1; `extractDocumentText` catches
it and files the row `FAILED`. Local was green throughout because local has
node_modules on disk. `check-runtime-assets.mjs` reported a clean 37/37 — the route
was never added to it when the uploads shipped.

**Fixed three ways:** `next.config.mjs` force-includes `PDFJS_RUNTIME_ASSETS` on
`/api/automation/knowledge/docs` and the new reread route;
`scripts/check-runtime-assets.mjs` now lists both (gate reports **43**, and the two
traces verify at worker 1 / fonts 16 / jbig2 4); and a new
`POST /api/automation/knowledge/docs/[id]/reread` + a "Try again" button on any
non-READY doc card, so the already-stored blobs can be re-read in place instead of
deleted and re-uploaded. Mirrors `files/[fileId]/reparse`.

**Standing rule reinforced:** any new route that touches pdfjs must be added to
BOTH `next.config.mjs` and `check-runtime-assets.mjs` in the same commit. The gate
is only as good as its route list.

Verified: 1,177/1,177 regression with the dev server up, `npm run verify` 11/11,
clean build. No schema change, no migration. **Waiting on Mike's word to deploy.**

---

### 2026-09-08 — Mike's Claude — **DEPLOYED**: deal history table (0069) + one job / two board rows + deal moves on the project History tab

**Migration 0069 shipped in this push** and applies on the Amplify build
(`prisma migrate deploy` runs there). Nothing pending on our side.

Closes the three items the entry below listed as known-remaining.

**New table `ProjectStatusEvent`** (Mike: *"We need to record the date a deal was
created and that status of won, lost, abandoned, etc. changed"*). One history per
board per job, because the two boards close independently. Written from all four
creation paths (new / duplicate / Excel import / CRM save) and from the status edit
in `api/projects/[id]`; the write is best-effort and can never block a save.
Backfill seeds openings from `createdAt` and closings from `updatedAt`, and every
seeded closing is stamped **`approximated = true`** — the DURATION chart excludes
those and reports a "No Close Date" count rather than averaging a guess (the 0061
lesson). Idempotent via deterministic `pse_<md5>` ids + `ON CONFLICT DO NOTHING`.

**Board rows.** A project now expands into one row per board — Procurement worth
the product sale, Design worth the design fee, each with its own stage and status.
Side effect worth knowing: `pipeline` / `stage` / `dealStatus` are **no longer SQL
where-clauses**; they are matched in JS after expansion (`rowPassesFilters`). As
SQL they were dropping any job won on Design but open on Procurement. `filtersToWhere`
now returns `{}` for those three; `pipelineWhere` survives only as a safe pre-narrow.

**Project History tab** (Mike: *"All of this should write in the history of a project
right?"* — it did not). Status and stage moves were the one thing the activity log
never recorded. Two new activity types, `deal_status` and `deal_stage`, written in
`api/projects/[id]` from the rows `recordStatusChanges` returns — same source as the
charts, so the timeline and the dashboards cannot disagree. Both have their own
`TYPE_CONFIG` entry and their own Module-filter option in `ProjectActivityFeed.jsx`.
Sentences come from `describeStatusChange()` in `statusEvents.js`, which reads
`PIPELINE_LABEL` / `STATUS_LABEL` — do not type board or status names out again.

**Behaviour change to flag:** the dashboard CONVERSION branch computed
`WON/(WON+LOST)` while `pipeline.js` defines win rate as won ÷ everything past Open.
Realigned to the shared definition — **dashboard win rates will read lower** than
they did. One definition, one number. Mike re-confirmed the definition the same day:
*"Win rate should always be win divided by lost+abandoned. Open is neither win or loss."*

Verified: regression **1,177/1,177** with the dev server up (14 new tests in
`dashboardFilters.test.mjs`, now 28, plus a new `statusEvents.test.mjs`);
`npm run verify` **11 gates** incl. source-tracked; `npm run build` exit 0,
37/37 runtime assets; `npm test` bid matrix 12/12. **schema-guard: PASS** — purely
additive (+30/−0), schema↔migration exact on all nine columns, FKs added by
`ALTER TABLE` after `CREATE TABLE`, backfill proved NOT-NULL-safe.

### 2026-09-08 — Mike's Claude — **DEPLOYED**: pipeline stages relabelled + CRM dashboards filter panel repaired

Two pieces in one push.

**1. Stage relabel.** Mike: *"I want both the procurement and design pipelines to
have these stages too. QUALIFIED / DESIGN / PRE-CON / BUYOUT / CA / PROCUREMENT /
COMPLETED"*. His five map one-for-one onto the existing five, so this is a rename
of the middle two: Pre-Construction → **Design / Pre-Con**, Construction → **CA /
Procurement**. **Labels only — the stored keys `PRECONSTRUCTION` and `CONSTRUCTION`
did not move**, so no migration and no data rewrite. `pipelineStages.test.mjs`
pins those keys; if someone later renames a key to match a label the suite fails
loudly instead of quietly emptying the boards in prod. The rename also exposed
three screens carrying their own typed-out copy of the stage names (home had
already drifted to "Pre-Con") — all now read `src/lib/pipeline.js`.

**2. CRM dashboards filter panel.** Mike: *"Fix that screen properly."* The raw
keys in the dropdowns were the least of it — **four filters were not filtering**.
`pipeline` (the default filter, and the basis of the seeded Design Fee Forecast)
was dropped on the floor; `serviceType` was offered in an uppercase spelling the
DB has never held, so it matched zero rows; `projectStatus` named a non-existent
column and made the whole widget return "Failed to load"; `lostReason`/`wonAt`
were silently ignored. Also: `segmentBy: 'dealStatus'` collapsed everything into
one "Unknown" bucket, and axes printed `PRECONSTRUCTION` / `fullDesign`. Fixed
with a legacy-value translation at query time so **saved widgets heal rather than
break**. Dead fields removed from the picker.

Known-remaining on that screen, not touched: the DURATION category reads
`wonAt || lostAt`, neither of which exists on Project, so "Sales Cycle Duration by
Owner" is always empty (needs a schema field → migration → schema-guard);
view-by/split-by "Pipeline" is still one constant bucket because a full-design job
is genuinely on both boards; "Combined Revenue Forecast" can't split product vs
design revenue side by side.

Verified: regression **1,156/1,156** with the dev server up (+26 new tests across
the two pieces; 3 transient failures in `uploadFlow.e2e` proved to be a Next
dev-server manifest race — **4/4 on isolated rerun**, and none of the changed
files touch that route). `npm run build` exit 0 with all **37** runtime assets
traced; `npm run verify` **11 gates**; `npm test` bid matrix **12/12**. No schema
change, so no schema-guard pass was needed. Browser check not possible — behind
the login wall and I may not enter passwords.

### 2026-09-07 — Mike's Claude — **DEPLOYED**: Bot Knowledge drop zone says "add one file at a time"

Mike: *"write instructions in the bot knowledge about dropping 1 file at a time on
that screen. deploy all of this."*

Copy only — `src/app/(app)/sales/automation/knowledge/page.jsx`. No logic, no data,
no schema, so no schema-guard pass was needed. The heading is now **"Drop one file
here"** with a short paragraph under the file-type line explaining why: a multi-file
drop still works (the loop already sends them one at a time), but a big batch means
a long wait on one screen and anything still queued is lost if the tab closes. Also
warns that a large scanned PDF can take a minute by itself.

Verified: regression **1,130/1,130** with the dev server up; engine math **60/60**,
fuzz 8,000 scenarios **0 failures**, bid matrix **12/12**; `npm run build` exit 0
with all **37** runtime assets traced and `/sales/automation/knowledge` at 10.3 kB;
`npm run verify` **11 gates**. The new text was confirmed present in the built
client chunk, so it genuinely ships. Browser check was not possible — the page is
behind the login wall and I may not enter passwords.

### 2026-09-07 — Mike's Claude — **DEPLOYED**: everything below that said "local-only" is now live

**Bot Knowledge files go to 25 MB, sent in pieces.** Mike: *"we should make it up
to 25mbs like email. can we do it in pieces very easily like drawings? then
deploy."*

The 4 MB number was never a preference — it was the front door. Raising the cap
alone would have made it **worse**: a 25 MB POST dies at Amplify with an empty 413
before our code runs, turning a clear message into a blank failure. So the file
now goes browser → S3 direct in 5 MB parts (the drawing-set plumbing, unchanged)
and this route receives only a key.

- `uploadStorage.js` — `MAX_KNOWLEDGE_UPLOAD_BYTES` (25 MB) + a **separate**
  `KNOWLEDGE_PRESIGNABLE` map. Deliberately not a widened `PRESIGNABLE`: widening
  the bot's library must never widen what the public `/conceptual_budget` page
  accepts. A test fails if the two ever get crossed.
- `uploadClient.js` — `isPresignable(file, scope)`, default `'project'`, so all
  seven existing callers are byte-for-byte unaffected.
- `extract.js` — **the second wall is reading, not sending.** A page is not a fixed
  unit of work, so the 120-page cap stopped bounding anything at 25 MB. Added
  `READ_BUDGET_MS = 20_000`, checked *before* each PDF page and before any OCR is
  started (`OCR_NEEDS_MS = 12_000` — Tesseract cannot be interrupted mid-call).
- The screen sends **one file per request**. Five 25 MB files read back-to-back in
  one request would blow the 30s wall and return nothing; this also means a
  failing file fails alone.

**Also fixed:** `tests/budget-math.mjs` still asserted the old flat $180K controls
cap — the bug fixed on 2026-09-04. Now proves the lower of the two ceilings wins in
both directions. And `.gitignore` had `devserver.log`, which never matched the
dot-prefixed `.devserver.log` start-dev.ps1 actually writes.

**⚠️ Migrations 0061–0068 shipped in this one push, in order.** Schema-guard
cleared the DDL: additive only — 6 new tables, 19 new nullable columns, 1 NOT NULL
with a default (`Client.developerTypes`), 2 new indexes. No removals, renames,
retypes, or new uniques on existing data. Full schema ↔ migration coverage; all
three preBuild guards pass.

**Irreversible data rewrites in that set — flagged to Mike, no backup step in
`amplify.yml`:**
- **0061** `Project.designStage`: `DESIGN_QUALIFIED` and `PROPOSAL_SENT` both
  collapse to `QUALIFIED`. Rows in `PROPOSAL_SENT` with no `proposalSentDate` get
  one backfilled from `updatedAt` — an approximation that afterward looks
  identical to a real proposal date. **Zero rows locally**; prod count unknown.
- **0066** `LUNCH`/`DINNER`/`BREAKFAST` → `MEAL` on `Note.activityType` and
  `ActivityClassificationRule.resultType`. Breakfast vs dinner gone permanently.
- **0067** `RelationshipCadenceRule.cadenceDays` 42/90/90 → 30/45/75, guarded on
  the exact old placeholder so hand-tuned tiers survive.
- **0063** backfills are non-lossy — new columns only, sources untouched.

**Replay hazard to know about:** `0064` is `IF NOT EXISTS` throughout *except* its
two trailing `ALTER TABLE "EmailContactLink" ADD CONSTRAINT`. If it ever
half-applies and gets the `migrate resolve --rolled-back` treatment 0023 got, the
replay dies on `42710 duplicate_object`. Not a problem on a clean first run.

Also noted by schema-guard: `prisma/migrations/migration_lock.toml` does not exist
and is untracked. Pre-existing — 60 migrations have deployed without it — so not a
new risk, just worth knowing the provider is not pinned.

**Verification before this push:** regression suite **1,130/1,130**; engine math
**60/60** + bid matrix **12/12** + fuzz; `npm run build` clean with all **37**
runtime assets traced; `npm run verify` **11/11 gates**.

### 2026-09-07 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on everything below)

**Bot Knowledge now takes files — and the bot finally reads what is in there.**

Mike: *"can I drag stuff here we want to add to the bot knowledge? also the bot
knowledge should take word docs, excel, PDFs and jpegs and pngs. I don't think it
does now."* Correct — it took typed Q&A pairs only.

**Drop zone on `/sales/automation/knowledge`.** Word (.docx/.rtf), Excel
(.xlsx/.xls/.csv), PDF, images, plain text. **4 MB cap** = Amplify's front door,
not an arbitrary choice. Each file is read on the way in and the flattened text is
stored beside it. Unreadable files are **kept and flagged**, never dropped —
Archive/Restore on the row, hard delete admin-only.

New pure `src/lib/botKnowledge/`: `text.js` (zero imports — file-type detection
with **extension beating MIME**, .docx XML flattening, search scoring),
`zip.js` (~90-line ZIP reader on Node's own `zlib`, because a .docx is a ZIP and
**adding a zip dependency means adding it to the prod Lambda bundle** — this repo
has been burned twice by that), `extract.js` (pdfjs text layer via the sanctioned
`loadPdfjs()`, **never `pdf-parse`** — its `module.parent` check throws ENOENT
under ESM; OCR fallback; **120-page text cap / 5-page OCR cap** against the 30s
wall), `storage.js` (S3 prefix **`bot-knowledge/`** so the `uploads/` lifecycle
rule cannot sweep it; dualstack on both clients), `retrieve.js`.

**Migration 0068 — one new table `BotKnowledgeDoc`, additive only.** Hand-written
PostgreSQL (deliberately not generated from the sqlite-provider schema).
Schema-guard reviewed: **no removals, renames, retypes or new uniques; no sign-off
needed on data-loss grounds.** Indexes are `(isActive, status, category)` matching
the one real read path, plus `(createdById)` so `SET NULL` on user delete does not
seq-scan.

**Four pre-existing bugs found and fixed on that screen:**
1. **Import from CSV had never once worked** — button sends `{ entries: [...] }`,
   route accepted only a bare array. Every import 400'd.
2. **The search box was inert** — screen sends `q`, route read only `search`.
3. **A saved entry rendered blank** until reload — the `{ entry }` envelope was
   being stored as the entry.
4. **The bot only ever saw the five OLDEST Q&A pairs.** `take: 5, orderBy:
   createdAt asc`, no matching at all — everything added after the first five was
   never read. Now the project/client/serviceType/stage is the query and both
   typed answers and uploaded documents are searched, excerpt-first.

29 new unit tests (`scripts/tests/botKnowledge.test.mjs`); full suite
**1,125/1,125 green**; `npm run build` clean; both routes verified live (401
unauthenticated); real .docx/.xlsx/.txt run through the reader end to end.

⚠️ **Migrations 0061–0068 are ALL UNTRACKED in git** — not gitignored, just
unstaged. `amplify.yml` generates the client from `schema.prisma` but applies
tables from `prisma/migrations`, so committing the schema without staging these
eight ships a client whose tables do not exist (P2021, from a green build). Stage
all eight, ship **0061→0068 together, in order**. `prisma/seeds/dashboardTemplates.js`
rides with this batch.

---

### 2026-09-07 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED

**The weekly meeting screen, plus a measured answer to "gone quiet after how long."**

Mike asked for widgets for the weekly meeting *"even though I can customize"*, and
gave nine starting items. Then three answers: submissions in and out are *"the
same"*; *"maram really runs it"*; and on the threshold, *"went quiet after what is
the real question"* — throwing it back to be measured.

**The screen is now a layout, not two hardcoded lists.** New pure catalog
`src/lib/meeting/cards.js` (18 cards, no Prisma / no React / no `@/` alias, so the
API and the screen read the same list and it is unit-testable). **Eleven built;
six carry a `needs` string naming the exact missing field and cannot be switched
on** — shown greyed rather than silently dropped. New
`/api/sales/meeting/layout` (GET effective layout + catalog, PUT with
`scope: personal|shared`, shared admin-only, DELETE drops the personal copy);
`/api/sales/meeting` now takes `?cards=` and only pays for the queries on screen.

**Zero schema change for the layout** — `Dashboard.section` is a plain String, so
`section="MEETING"` works as-is, and `ownerUserId` null/set is the shared-default
vs personal-copy seam. Because **Maram runs the meeting**, every deal card has an
Owner column: shared team screen, not a personal to-do list.

**Mike's #9 solved with nothing typed.** IFC / for-award budgets awaiting response
= the budget's recorded send date + the email work's existing "counts as a real
reply from a person" rule (mass sends, invites, auto-replies out). Design
submissions is ONE card either direction — `DrawingSubmission.source` is already
`EXTERNAL | INTERNAL`.

**The threshold, measured.** `scripts/calendar/quietGap.mjs` measured every gap
between two meetings with the same outside company: **5,353 gaps / 434 companies**,
each one a gap the relationship SURVIVED. Half ≤ 14 days, 80% ≤ 28, 90% ≤ 70.
Cadence-tier defaults moved from the guessed **42/90/90/180/365 to 30/45/75/180/365**
(the two long tiers held), and `check-ins-due` now falls back to the same shared
`QUIET_AFTER_DAYS`, so the CRM screen and the meeting card cannot disagree about
one person. **Migration 0067 is data-only** — three conditional UPDATEs that move
only rows still holding the placeholder, so a hand-tuned tier keeps its number.

**Honest limit:** no threshold makes the list short — even at 5+ meetings/year and
120 days it is 86 companies. The number *ranks*; CRM scope must filter.

**Bug fixed:** `quietGap.mjs` anchored "today" to the last date in the file, which
is **2032** because repeating series are written out with future instances — so
every company read as quiet (434 of 434). Now anchored to the export's mtime. The
percentiles were never affected.

**Verified:** `meetingCards.test.mjs` 7/7, all four routes 401 (compile + auth gate),
every Prisma query shape run against the real schema. **Not verified in a browser** —
port 3000 held and the app redirects to a login I may not sign into.

**⚠️ Deploy warnings now 0061 → 0067 untracked in git**; 0061 and 0066 irreversible
in-place rewrites; 0064 bare `ADD CONSTRAINT` replay hazard. Local dev.db is
`db push`-built and unbaselined, so `migrate deploy` fails locally with P3005 —
0067 was applied locally with `prisma db execute` instead. Prod runs `migrate
deploy` from amplify.yml and is unaffected.

---

### 2026-09-07 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED

**Mike's last three calendar rulings applied. No schema change in this batch —
pure logic + the dry-run script + tests.**

**"1 meeting per time period."** `dedupeOverlappingMeetings()` in
`src/lib/calendar/worthANote.js`. Three conditions, all required: a real overlap,
**starts within 30 minutes**, and the same activity type (or one side has none).
**Overlap alone is not "the same meeting"** — the first version got that wrong and
the golf mixer, being a four-hour block, swallowed a genuine coffee and a genuine
lunch that fell inside it, then chained transitively so a Tryba client visit was
collapsed into an IKEA delivery. The 30-minute window is calibrated on Mike's own
listings (tee times 3:10p / 3:20p). All-day blocks and TRAVEL are excluded from
the comparison outright — an all-day marker overlaps everything that day, and
travel is de-duplicated in *days* by `travelDates()`.

**Auto-booking exclusion** (`isAutoBooking()` in `personal.js`, new bucket
`auto-booking` between the personal and to-do gates). Narrow on purpose: only
app-written confirmations (`^Reservation at`, `Table for N`, `Your table at … is
confirmed`). **"Dinner reservation at Guard and Grace" is still kept** — Mike
titled that himself; the de-dupe, not the stop-list, is what stops a double count.

**Hotel stays are travel days** (Mike: "yes"). Three new TRAVEL title rules in
`inPerson.js`, kept narrow because **ILC designs hotels** — a bare `/hotel/` would
turn "Virgin Hotel design review" into a travel day. Every pattern needs a
staying-somewhere context, plus a bidirectional-lookahead pattern for brand-first
titles ("Hilton Stay Ft. Collins").

**Two leaks found by reading the leftovers rather than assuming they were noise:**
a delivery window is not a meeting at all (`IKEA delivery- 438646230` was
outranking a real client visit on duration), and kids' activities ("Reid
gymnastics") were reaching the shared CRM. Both are now stop-list patterns.

**Final dry run (6th, read-only):** in-person by year **204 / 185 / 208 / 91**,
travel days 10 / 14 / 11 / 2 (37 total), 44 entries collapsed as the same time
period, 781 personal excluded. Wrongly-discarded in-person meetings **622 → 74 →
51**. Golf now matches Mike's hand count **exactly in 2024 (20) and 2026 (9)**;
the whole remaining gap is the meals definition he already agreed to.
`scripts/tests/calendarInPerson.test.mjs` — **52 tests, all green.** Full
regression + `npm run build` still owed at deploy time.

**The real import is still NOT built** — this is the read and the rules only.
Backfill mode still needs: set dates, no follow-up extraction, no tasks, nothing
sent, and a way to undo the batch.

**⚠️ Deploy warnings unchanged and still live** — migrations 0061 → 0066 all
untracked in git; 0061 and 0066 are irreversible in-place rewrites; 0064 has the
bare `ADD CONSTRAINT` replay hazard.

---

### 2026-09-07 (later) — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on the entry below)

**Mike's four rulings on what counts as a business meeting, applied everywhere.**
His words: *"Catalina golf mixer is every other week and is a business event.
each of those should count always. even though they are repeating… so should a
work business trip. we should look at how many days people are traveling to see
clients… all personal events like soccer practice, tennis match, doctors appts,
therapy should be excluded… 1. change to meals and include work breakfast, lunch
and dinners 2. start with 2023."*

**The real bug was in the seeded rule data, not the code.** `Virtual — skip`
seeded at priority 80 and `Large group — skip` at 70 — both **above** every title
rule at 50. A lunch with a leftover Teams link, or a twenty-person mixer, was
thrown away before anything read the title. `DEFAULT_RULES` in
`src/app/api/automation/classification-rules/route.js` now seeds them at 30 and
25, and **migration `0066_activity_type_meal`** lowers any rows already seeded.

**`LUNCH` → `MEAL`** across constants, all five UI screens, the AI prompt, the
seeded rules and the schema comments. Non-destructive: `normalizeActivityType()`
maps `LUNCH`/`DINNER`/`BREAKFAST` forward on every read and the pickers hide the
legacy key, so old notes read as "Meal" whether or not 0066 has run. **Both
columns are plain `String`, never enums** — schema-guard confirmed; my schema
change is comment-only.

**`TRAVEL` is business but deliberately NOT in-person** — counted in days, not
meetings, so it can never inflate the in-person number Mike checks by hand.

**Two new pure files:** `src/lib/calendar/personal.js` (the stop-list — runs
first, answer is final, so nothing medical or family reaches a shared CRM) and
`src/lib/calendar/worthANote.js` (`isWorthANote` — the ONE gate, order: cancelled
→ personal → business title always kept → internal only → nobody invited →
all-day → keep). `scripts/calendar/icsDryRun.mjs` had its own private copy of
this logic deleted and now calls the shared gate, so the dry-run report is
literally what the import will do.

**Dry run over Mike's real export (read-only, nothing written):** 4,462 events
from 2023 on → 1,906 kept, 776 personal excluded, 26 travel days, in-person 216 /
198 / 231 / 93 by year. The first run wrongly discarded **622** real in-person
meetings; now **74**. It now runs *above* Mike's hand count (+30/+44/+79) because
104 kept meetings come from 10 repeating titles, 66 of them the Catalina Golf
Mixer — his ruling working as asked. Question back to him is open.

`scripts/tests/calendarInPerson.test.mjs` — **38 tests, all green.** Full
regression + `npm run build` still owed at deploy time.

**⚠️ For whoever deploys:** migration folders **0061 → 0066 are all still
untracked in git (`??`)**. They must be `git add`ed or prod receives none of
them. Two are irreversible in-place data rewrites — **0061** stamps
`proposalSentDate = COALESCE(proposalSentDate, "updatedAt")` (a stand-in that
becomes indistinguishable from a real date) and **0066** collapses
breakfast/lunch/dinner into `MEAL` one-way. The **0064** bare `ADD CONSTRAINT`
replay hazard below still stands.

---

### 2026-09-07 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on everything below)

**Sales notes are now wired to the calendar.** Mike: *"when we sync with
Microsoft the system should know it's in person through a title or location."*
Two real gaps were behind that ask. First, `classifyEvent` in
`src/lib/bot/activityClassifier.js` — a good three-layer classifier reading
TITLE_CONTAINS / LOCATION_CONTAINS / LOCATION_TYPE — **had zero callers**, while
the Microsoft-facing `ingestCalendarEvent` decided in-person with a standalone
regex. Second, a synced calendar event **left no record at all**: it fired
`CALENDAR_EVENT_CREATED` and stopped, so it never reached the AI action
extraction, the bot drafts, or `Contact.lastInPersonAt`.

Three new files under `src/lib/calendar/`: `inPerson.js` (pure title/location
rules, and the one home for the COFFEE/LUNCH/GOLF/HAPPY_HOUR/SITE_VISIT set that
was copied into three files), `normalize.js` (the Graph seam, mirroring
`src/lib/email/normalize.js`), and `recorder.js` (a synced event becomes a DRAFT
sales note keyed on `Note.calendarRef`, idempotent on re-sync, guests linked to
`Contact` rows). The classifier gained a **keyword layer** between rules and
Haiku, so it works with no API key — which is why `Note.classificationSource`
always listed `keyword`. `ingestCalendarEvent` now classifies, writes the draft
note, and still fires the trigger unchanged. **Publishing stays a person's
action** — an invite is not proof a meeting happened — and publishing is still
what moves Last In Person. Setting a note's type by hand now stamps
`classificationSource: 'manual'`, which is what tells the sync to stop touching
that note.

**The mass-email 25 is now changeable** (Mike: *"make it changeable but set to
25. no one will probably change it"*) — an `ActivityExclusionRule` of type
`MIN_RECIPIENTS` on Sales Automation → Rules → Exclusions, read by the new
`src/lib/email/settings.js`, cached 5 min, cache dropped on any rule write.
`classify.js` stays pure and database-free; 25 is the fallback and junk values
fall back to it rather than breaking a sync.

**Migration `0065_note_calendar_ref_index`** — an index on `Note.calendarRef`.
Additive only, schema-guard reviewed, written with `IF NOT EXISTS`. **Ship
0061 → 0065 together, in order** (0061 remaps live `designStage` values, so
shipping without it drops existing design deals off the board).

**Known hazard for whoever deploys, flagged by schema-guard and NOT changed:**
`0064_email_contact_activity` creates its table with `CREATE TABLE IF NOT
EXISTS` but adds both foreign keys with bare `ADD CONSTRAINT`. If a deploy halts
and that migration is replayed with the table already present, those two lines
fail with `42710 duplicate_object`. Left alone deliberately — CLAUDE.md says
never edit an applied migration, and editing it would break the local checksum.
Worth knowing if the deploy stops there.

**Also found, not fixed, needs Mike's call:** there are **two people tables**.
`Contact` (CRM: notes, cadence, `lastInPersonAt`) and `ClientContact` (people
under a client: the email work writes `lastEmailReceivedAt`/`lastEmailSentAt`
there). So today Last Email and Last In Person live on two different records for
what may be the same human. Pre-existing, not introduced here. Merging them is a
big destructive schema change and is Mike's decision, not mine.

Verified: 1,060/1,060 regression tests (38 new), `npm run build` clean, 37/37
runtime assets, intake route loads in the running dev server. The
`/sales/automation/rules` screen was not clicked through in a browser (login).

### 2026-09-06 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on everything below)

**CRM steps 1 and 2 are built: the Client module and the People module**,
from Mike's two verbatim field specs, under one migration
`0063_crm_client_people`. Client Type (8 options) and Developer Type became
multi-selects stored as JSON arrays in `Client.orgTypes` / `developerTypes`;
the old single `type` / `developerType` columns stay and are derived from the
first tick so nothing downstream broke. Client Rating is a free-text
placeholder until the equation is settled. **All deal counters are DERIVED on
read, never stored** (`src/lib/crmClient.js`), and there are **TWO counting
scopes** — Mike ruled on this 2026-09-06 ("it should be 2 wins but the wins
per client should only count 1 per project"). A project rides the Procurement
board always and the Design board too when serviceType is Full Design or
Design Assist. `dealCounts` counts PER BOARD and is what the pipeline boards
report, so a design job won on both is two wins there. `clientDealCounts`
counts PER PROJECT and is what a client record and a person record show — one
job is one deal, never two. `projectOutcome()` folds the boards into one
answer, won → open → lost → abandoned (the lost-over-abandoned tie-break when
both boards are dead but disagree was my judgment call, not Mike's).
Won = WON + COMPLETED. New `ClientTag` / `ClientTagLink` tables give editable, deletable
tags that cascade. People gained firstName/lastName/cellPhone/workPhone/
linkedIn + two email-timestamp columns, a new `ProjectContact` link table for
per-person deal counts, and a full People table with an expandable detail
panel. A **written
reason is now required to mark a deal Lost or Abandoned** — new
`Project.procurementStatusReason` / `designStatusReason`, enforced in the API
and prompted for in both the CRM board and the project hub. Fixed a real bug:
`clientTypeKeyFromLabel` ignored the legacy label map, so any client saved
under the retired "Developer / Self-Performing GC" label came back with no
type at all.

**Email activity against a person is built too** — the two Last Email fields
on the People tab. Mike asked for it now so that connecting Microsoft later is
just a sync, not a build. Nothing talks to Graph yet. `src/lib/email/` holds
the rules (`classify.js`, pure — no DB, no network, no Microsoft), the adapter
(`normalize.js`, the ONE file that changes when Graph is wired up), and the
recorder. An email counts as real contact only if it is not a **mass email
(25 or more distinct people on it — Mike's number)**, not a calendar invite,
not a reply, and not automated. Storage reuses the existing `EmailMessage` /
`EmailAccount` tables rather than a parallel mailbox; `EmailMessage` gains
cc/bcc plus the stored verdict, and a new `EmailContactLink` joins message to
person with a role (FROM = they wrote us, To/Cc/Bcc = we wrote them, which is
what separates the two fields). Ingestion door: `POST /api/email/ingest`,
admin-only. Every message is stored even when it does not count, so a rule
change can be re-applied without re-syncing; the two dates are recomputed
from the links, so they can move backwards.

⚠️ **FOUR untracked migrations must ship together, in order, when this
deploys: `0061_design_stages_shared`, `0062_calibration_samples`,
`0063_crm_client_people`, `0064_email_contact_activity`.** If 0061 is left
behind, the `designStage` default in schema.prisma has no migration backing it.

⚠️ **Correction to a long-standing assumption:** `amplify.yml` runs
`npx prisma migrate deploy`, **not** `prisma db push --accept-data-loss`.
So the backfill UPDATEs in 0063 really do run in production, and a SQL error
would halt the deploy in a failed-migration state (the `0023_proposals`
precedent, whose permanent `migrate resolve --rolled-back` line IS already in
amplify.yml at line 38 — an earlier note here doubted that; it is there).
`CLAUDE.md` documented the retired `db push` pipeline and has been corrected.

1032/1032 tests green with the dev server up, build clean with it stopped
(64 migrations Postgres-compatible, 123 models backed by a CREATE TABLE).
schema-guard reviewed the schema.prisma diff and found nothing destructive.
Nothing is deployed — this stacks on top of the 09-04 and 09-05 batches,
which are also still local.
Open with Mike: the Client Rating equation (he said "no client rating yet"),
and the lost-over-abandoned tie-break noted above.

### 2026-09-05 — Mike's Claude (second entry) — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on everything below)

**Lowell's drawings changed the stair model.** For garden / gurban /
stacked-flat breezeway walk-ups the stair line is now a PACKAGE per open
stair (landing lights + wall packs with battery on the stair and egress +
emergency twin-heads + vestibule disks), built from the Lowell GMP E-sheets
— `breezewayStairPackage` in `src/lib/stairLandings.js`, rates in a new
`pricing.breezewayStair` block — Mike priced it the same evening: landing =
a REGULAR disk $12 (decorative landing lights are not a conceptual item),
wall pack w/ battery $300, frogeye $25, vestibule disk w/ battery $50 →
$2,311 per 3-story stair, $57,775 on Lowell's 25). Corridor buildings keep
the landing-only line. Because the
type now drives that package plus wall packs and the controls cap, **the
site read classifies the building** (nine fixed keys, decision rules in the
prompt, version `siteVision-2026-09-05`); the Site Data panel proposes it as
a dropdown row and the commit route writes `Project.buildingType` (only a
known key). Fixed on the way: the commit route's returned row lacked
`buildingTypeKey`, so the wizards dropped the type until reload. The
unit-matrix commit route likely has the same drop (returns bare
`updatedData`) — not touched. Also: margin default 23%, interior amenity
high $16, **fans $180 GROSS at conceptual → $145 net** (the engine takes the
$35 disk credit off the conceptual price the same way it does off a design
level — supersedes the morning's $155 and the afternoon's $175 flat),
manual sales-tax % box on the summary (`ProjectData.salesTaxPct`, a
baseline column, no migration). The free ZIP lookup route built in the
afternoon was PULLED the same evening at Mike's request and parked in
ROADMAP.md ("💰 Budget Summary → Sales Tax Rate Lookup"). 968/968, build
clean before the evening amendment. No new schema change; 0061 + 0062 still
sit uncommitted with the rest. **CRM:** Mike asked whether the Excel's
client/project/pipeline fields had been built — answered NO (09-04 was
analysis only, per his pause) and he now wants to resume; a schema build
is gated on the decisions in the gap doc and will need schema-guard.

### 2026-09-05 — Mike's Claude — BUILT LOCAL-ONLY, NOT DEPLOYED (stacks on the 09-04 batch)

**Stair landings now have one ladder in one file** — `src/lib/stairLandings.js`:
drawings (stairs × (2×stories−1), the mid-level landing included) → building-
code estimate when the drawings never state the exit-stair count (≥2 per
building, more on a long floor plate; stories = gross ÷ footprint when
unwritten) → null so a human types it. **+10% on every derived/estimated
count** (Mike), never on a typed one. **The plate factor is building-type
aware** (calibrated same day against six projects on file): corridor
buildings 15,000 SF per stair, garden/gurban/stacked-flat breezeway walk-ups
5,000, townhouses zero shared stairs; the public takeoff reads the type from
the questionnaire, the internal site read defaults to corridor. Wired into
the public takeoff (quantities.js, incl. an end-of-function patch that
back-fills the stairs / stories rows as 'derived' + ESTIMATED) and, new,
into the internal project page's Site Data proposals (siteFields.js
`numEgressStairwells` — the commit route can now write landings). Four
tunables on the master sheet (`estimation.landingsContingency /
exitStairsMinPerBuilding / floorPlateSfPerExitStair /
breezewayPlateSfPerExitStair`, editable at /admin/pricing). Garden controls
$0.19 → $0.18 (cap $65K stays). Landscape relabeled "$ per SF of net lot"
(it was never a percentage). Fans stay $155 — the $175 question is closed.
934/934, build clean, no schema changes. Still undeployed from 09-04:
migrations 0061 (approved remap) + 0062, snapshot fill, controls-cap fix,
calibration widgets.

### 2026-09-04 — Mike's Claude (fifth entry) — BUILT LOCAL-ONLY, NOT DEPLOYED

**Two new migrations are sitting uncommitted on Mike's machine — read before
you touch prisma/migrations:**

- `0062_calibration_samples` — additive: new `CalibrationSample` table for the
  pricing-calibration learning system (model qty × rate vs actual per budget
  line, surfaced as 5 prebuilt widgets on /dashboards/budget).
- `0061_design_stages_shared` — ⚠️ IRREVERSIBLE many-to-one remap of the
  design pipeline's stages onto the conceptual stage list (DESIGN_QUALIFIED +
  PROPOSAL_SENT → QUALIFIED; proposalSentDate backfilled from updatedAt as an
  approximation). Schema-guard flagged it; waiting on Mike's sign-off. Do not
  deploy a schema change around it.

**Bug you should know about:** `Project.pricingSnapshot` (frozen at creation)
never picked up pricing keys added later, so every existing project's live
budget showed $0 wallpacks and $0 pathway — a303f24's pathway line has only
been reaching brand-new projects. Fixed in `calculateBudget` via
`fillPricingDefaults` (snapshot wins, missing keys fall through to master
pricing) and a single `pricingForProject()` helper at all ten parse sites.
When it ships, 14 of 23 snapshot projects move (Fulshear +$59K, Broadstone
Southglenn +$41K, Town Lake +$8.9K — full line-by-line workbook in the G:
engineering folder, SNAPSHOT-FIX-BEFORE-AFTER-2026-09-04.xlsx). The fill also
surfaced a **controls cap bug**, fixed: the sheet-wide $180K cap was REPLACING
the building-type cap instead of stacking with it (garden could be charged up
to $180K). Now the lower of the two wins (controlsCap.test.mjs). Fans on old
projects move $140 → $155 because their snapshots lacked the designFanLevels
table; Mike's own Excel uses $175/fan — open question to him. Mike approved
the 0061 stage remap ("no data is precious in there yet"). Rule going forward: a new
pricing key needs NO inline default anymore.

Also local-only: pathway 1.6× on solar sites, landscape 2% of NET lot,
capture hooks on the responses/data/budget routes. 911/911 tests, build clean.

### 2026-09-04 — Mike's Claude (fourth entry)

**Deploying now (Mike's "make these changes and deploy"):** pathway lighting is
finally a live engine line — units × $/unit by building type from master
pricing (townhome $320, garden/stacked/gurban/wrap $60, podium/mid/high $35 —
Mike's corrected numbers, all inside the observed bollard-calibration bands),
floored at $4,000, $0 at zero scale. Key rule: a hand-entered
exteriorManualItems.pathwayLighting SUPPRESSES the model line (manual wins —
Modera Town Lake's counted $4,800 is untouched). Every exterior breakdown view
shows the row, labeled "(manual entry)" when suppressed. Same push also ships
the drawings-page building-summary card, the landings-asked-directly change,
and the # Balconies ask (see CHANGELOG). 885/885 tests (11 new pathway tests),
build clean, no schema changes.

### 2026-09-04 — Mike's Claude (third entry)

**Deployed a750233 (Mike's "Deploy all yourself"):** the Fulshear-review batch.
(1) Solar site design is now a real engine input — siteDesignLevel 'solar'
multiplies the surface-parking line by exterior.solarMultiplier (2.3, Mike
confirmed after briefly considering 2.5), with a "labor drops dramatically —
no trenching/conduit/wire" note rendered wherever the budget shows; the
internal wizard gained the same question. (2) NEW PRICING RULE: BOH is hard-
capped at 5% of gross SF (boh.maxPctOfGross, editable at /admin/pricing) —
enforced at pricing time AND in the intake remainder derivation; born from
Fulshear where the BOH remainder swallowed 63,953 SF and overpriced ~$97K.
(3) Public /conceptual_budget: drawings survive step navigation (dropzone was
unmounting), and the Review & send step now renders the exact internal
summary top (navy hero + Project Data grid + SummaryBudgetBreakdown).
871/871 tests, build clean, no schema changes. Heads-up for anyone touching
prod pricing: if a Solar Multiplier override row exists in the DB it should
read 2.3 (code default already is).

### 2026-09-04 — Mike's Claude (second entry)

**Sean's CloudWatch finding acknowledged:** the failing prod parse reads were
hitting the Anthropic API's "credit balance is too low" 400 — a billing outage
on our account, not a Lambda problem. Mike is topping up at
console.anthropic.com → Plans & Billing. Notes for both sides: (1) the app
already catches this exact error on the public intake and shows the visitor a
"this is on our side" message (siteVision V3 path) instead of blaming their
drawing; (2) the server deliberately does NOT retry model calls — the multi-
minute reads Sean saw are the normal staged scan working through slices (a
Skyline-class read runs ~5–13 min by design), with only the browser re-asking
a dropped stage 2–3 times; (3) the SSR memory/horsepower ask below still
stands — credits explain the current hard failures, not the speed ceiling.

**Deployed today (Mike's "Deploy"):** the gross-SF ladder + ask-the-visitor
figures batch — public intake always lands a gross SF (per-building sums like
Skyline G101 now sum in code), the wizard asks the visitor for up to six
figures the drawings didn't answer (gross SF, units, stories, stairwells,
exit doors, surface stalls), drawings are required for a live number
(server-enforced), exit-door counts drive wallpack qty, and a 5–9×
stairwell-landings underpricing bug on public estimates is fixed. 870/870
tests, prod build clean. No schema changes.

### 2026-09-04 — Mike's Claude

**FOR SEAN — raise the app server's horsepower (emailed to operations@ too).** The
giant-PDF read finally works end to end on prod (Skyline Ridge 334 MB / 294 sheets,
first full success 2026-09-02, 13.3 min), but Mike wants 2–3 min and the prod
Lambda's CPU is the main enemy (scan reads 5–8 pages/slice vs ~35 on a desktop;
one heavy-sheet death looks like OOM). Since Lambda CPU scales with memory, the
ask is: (1) read the current `Memory Size` from a REPORT line in the Amplify
Hosting **compute** CloudWatch log group and tell us the number, (2) check the
Amplify console for any SSR/compute memory setting (docs say none exists —
build-instance size is builds-only — but the console ships ahead of docs),
(3) if no knob, AWS Support "service limit increase" case asking for 4–8 GB SSR
compute for the app + whether the ~30 s response timeout is adjustable. Cost is
pennies ($0.20/GB-hr after 100 free GB-hrs/mo; a monster read ≈ $0.09 at most).
Plan B if AWS refuses: S3-triggered background Lambda we control. Full
walkthrough: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\SERVER-HORSEPOWER-for-Sean.md`.
Still open from before: MPU lifecycle rule on `ilc-qc-media`, and test objects
safe to delete (`uploads/intake/xdcw03se2d897nomu7vs4ns0.pdf`,
`uploads/intake/xzp136xv7irbyenwl0uynb09.pdf`, `scans/p000o9bp7gdkh81gjpc76g41.*`).

Meanwhile on my side (building now, local-only until Mike says Deploy): parallel
scan (4 concurrent slice streams over independent page ranges, merged at the
sheet pick) + stage overlap (matrix AI kicked right after scan so its ~2 min of
thinking runs while sheets render). Target: 2–3 min for Skyline-class sets.

### 2026-09-01 — Sean's Claude

- Completed AWS SES setup for `ilcstudios.com`: 3 DKIM CNAMEs added to Namesilo DNS (Namesilo registrar, not Squarespace), `ses-send-email` inline policy added to `ilc-amplify-s3` IAM user, `precon@ilcstudios.com` created as SES email identity. Someone still needs to click the SES verification link in the precon@ inbox.
- Queued Tasks 33–36 for Manny (~10 hrs): intake notify env wiring + live test (Task 33), task attachments → S3 migration (Task 34), CLIENT_VIEWER isolation bug hunt (Task 35), intake/portal invite edge cases (Task 36).

### 2026-08-31 — Mike's Claude

**FOR SEAN — SES one-time console setup (emailed to you too).** The public
conceptual-budget intake now sends an automatic notification email to
precon@ilcstudios.com on every submission (code built + tested, local-only,
awaiting Mike's “Deploy”). Delivery is blocked on three one-time SES console
steps that are yours: (1) verify the ilcstudios.com domain in SES (us-east-2,
Easy DKIM → 3 CNAMEs into DNS), (2) attach `ses:SendEmail` to the same IAM
user whose keys the app uses for S3 (the `S3_ACCESS_KEY_ID` one — no new
keys), (3) get out of the SES sandbox: verify precon@ as a recipient for
today, and request production access for the contractor-facing emails coming
later. Full plain-English walkthrough:
`G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\SES-setup-for-Sean.md`
— also sent to operations@ilcstudios.com. Until done, sends fail gracefully
and the admin review queue remains the source of truth. Env names for
reference: INTAKE_NOTIFY_TO / INTAKE_NOTIFY_FROM / S3_REGION.

Also this session (local-only, same not-deployed batch): the drawing reader
now counts stories off elevations, egress stairwells + exit doors off floor
plans (counted fields kept separate from stated ones), derives building
footprint from lot-coverage % × lot SF, and the site vision read runs on
every upload (it used to be skipped whenever the unit matrix parsed — that
starved the new quantity takeoff). Parse renders up to 4 sheets now. 764/764
tests, prod build green. No schema changes.

### 2026-08-30 — Mike's Claude

**Context:** phone uploads on the public conceptual-budget page kept failing, so the intake upload path was rebuilt this week: files now go **direct to S3** via presigned URLs on `ilc-qc-media` (dualstack host), and files ≥ 5 MB go up as **S3 multipart** — new route `/api/uploads/complete` stitches the parts server-side via ListParts, and a failed upload calls AbortMultipartUpload. Deployed in `eb98d3f` and `86ae180`.

**Two asks for you (both AWS console, Mike asked me to route them to you):**

1. **S3 lifecycle rule on `ilc-qc-media`:** add an `AbortIncompleteMultipartUpload` rule (e.g. 3 days) scoped to the `uploads/` prefix. A browser that dies mid-upload before our abort call leaves invisible part fragments that bill forever — the normal object-expiry rule does NOT sweep them; only this dedicated rule type does.
2. **CloudWatch pull, if you have a minute:** Mike's phone reads keep dying with `R1/scan` (the browser loses its request to `/api/intake/parse` mid-read). From desktop the whole staged pipeline answers in 1–2s per stage, so the server looks healthy — but we have no server-side view of whether his phone's requests ever ARRIVE. If you can grep the Next.js Lambda logs for `/api/intake/parse` around Aug 30 evening (Mike's attempts, a 2.4 MB file named CIVIL…), “requests arrived and completed” vs “never arrived” settles the diagnosis in one look.

Housekeeping: two test objects of mine can be deleted — `uploads/intake/kgijom7iv90x2dh5t8iq9vlv.pdf` (12 MB) and `uploads/intake/n0ukkf4ynsfc03lw6d3vygcd.pdf` (probe).

---

### 2026-08-26 — Sean's Claude

- Audited Manny's sprint summary (Tasks 28–32, PRs #21/#22/#24). All three PRs had a stale branch base (~3 weeks behind main), making diffs show 50+ files; Manny's actual changes were narrow.
- Applied all changes directly to main rather than via GitHub merge (avoids `.claude/` conflicts): Task 29 fix to correct file (`conceptual_budget/IntakeClient.jsx` — Manny had edited the old `/start/` path, which is gone); Tasks 28/30/31/32 cherry-picked where safe, Task 32 (CRM staleness badge) manually applied to preserve Mike's `handleExportCSV` deletion (`e78acec`).
- Also fixed a pre-existing `requireAuth()` missing-arg bug in `bot/queue/route.js` as part of Task 28 apply. Commits: `265af44` (Task 29), `060f2dd` (Tasks 28/30/31/32).
- Pruned all three Manny branches from remote. manny-tasks.md and formanuel.md updated to reflect completed sprint. No active tasks queued.
- PRs #21/#22/#24 closed by Sean manually (gh CLI auth doesn't reach the private org repo).

---

## 🚢 DEPLOYED — 2026-08-25: every ILC staff account now sees every record — READ THIS BEFORE THE PRIVILEGES BUILD

**Pushed `43ac763..aaf8d45`, 91 files.** Sean — this one lands directly on top of your open item (the privileges enforcement sweep, 2026-08-22 entry below), so it needs a read before you write any of it.

### What happened

`maram@ilcstudios.com` signed in to production and saw an empty projects list and an empty clients list. Mike's instruction, verbatim: *"I want all projects, clients and people within clients to be seen by all users. Later we may change that, but right now all data is open to eveery user."*

The cause was not a setting. Visibility was decided **per route** by "are you an admin OR did you create this", copied by hand into roughly sixty places. Projects had been opened up back in July (commits `9097ba0`/`e3a3aa2`/`ad13051` — the ones the 2026-07-27 entry mistook for a privileges system); **clients never were**. So a staff account could see the work and none of the companies it was for, and `/api/clients` narrowed to `ILC_ADMIN || ADMIN` specifically, which is why nobody with an admin login ever saw it.

### What the shape is now, and what it means for your build

There is **one function**: `canSeeAllData(user)` in `src/lib/auth.js`. Every internal role returns true. The external `CLIENT_VIEWER` role returns false and stays scoped to its own records — that one is not a preference, it is the DN/buy-price boundary, and `verify:dn` proves it still holds (8/8).

All ~60 routes now call it instead of carrying their own copy. Ownership checks were **kept as the fallback behind the helper** rather than deleted, so the client-viewer path is provably unchanged and re-narrowing later is a one-line edit in one file.

**Your half:** this is deliberately temporary and Mike has said so. When you build the module/capability model, `canSeeAllData` is the seam to grow into — replace its body, not the sixty call sites. Do not reintroduce per-route ownership tests; `scripts/tests/dataVisibility.test.mjs` scans `src/app` and fails the build if a new one appears.

### 🔴 Seven routes were returning 500 to everyone, including you

Found while sweeping. Each called an auth helper that was never imported, so the route threw a `ReferenceError` on the first real request:

`clients/[id]/product-options`, `clients/[id]/standard-fixtures`, `clients/[id]/standards/concepts`, `market-intel/poll`, `projects/[id]/budget-qc/assign`, `projects/[id]/budget-qc/items/[itemKey]`, `projects/[id]/assignees`.

**This class of bug has now shipped three separate times** — it is invisible, because the editor is quiet, the build is green, and the tests pass. `scripts/check-auth-imports.mjs` now blocks it in `npm run verify` and in `.husky/pre-push`. Worth knowing before the privileges sweep, since that work touches every one of these imports.

### Also in this push

- **The `.gitignore` fix from the 24th.** A bare `uploads/` line was hiding `src/app/api/uploads/` from git entirely, so the presign route had never been committed. It is in this push, which means the large-PDF upload path is live in production for the first time.
- 15 local news sources + migration `0059_market_source_market` (additive column, `IF NOT EXISTS`, no drops).
- Site-plan and unit-matrix readers now consult the sheet index before rendering instead of starting at page 1.
- `smoke.test.mjs` now stands up a plain `USER` account, not just `ILC_ADMIN`/`COMPANY_ADMIN` — the Maram break only showed on `USER`, which is exactly why it got to production. It also checks the clients list and a client's contacts. Verified by reintroducing the old rule and watching it fail before restoring.

**Gates:** 559 unit tests, 11 verify gates, dn-leak 8/8, mcp 48/48, smoke 7/7, clean build, 26/26 runtime assets.

### Still open on your side, unchanged

1. **The privileges enforcement sweep** (2026-08-22 entry) — still Mike's standing #1 for your queue.
2. **The SSR Lambda memory size** (2026-08-22 entry) — one number, still unanswered.
3. **The two remaining front-door upload paths** — `/api/tasks/[id]/attachments` and the `.mbox` profile upload.
4. **Lifecycle rule + IAM policy confirmation** on `ilc-qc-media` — CORS was verified from outside; those two cannot be checked from Mike's machine.

---

## 🚢 DEPLOYED — 2026-08-24: direct-to-S3 uploads are live, and a bug in the CRM CSV export

**Pushed `804caf9..e78acec`.** Mike said deploy, so the upload work that had been sitting local since the 22nd went out: direct-to-S3 presigned uploads on every presignable path, the 400 MB × 5 intake ceiling, `pdfRange.js` / `sheetIndex.js` / `uploadIntake.js`, the RSS-based memory brake, the `sheets/` compressed-copy retention, and the immediate discard of the original in the parse route's `finally`. The two notification sessions (note reminders, market-intel project tagging, Monday roundup) rode along.

**Your 30 commits were already live** — I merged rather than rebased so both histories keep their shape. One conflict, `src/app/(app)/admin/intake/IntakeClient.jsx`: we had both added to it. Resolved by keeping both — your `SortIcon` / router-driven refresh / `projects` prop, and my `KeptSheets` thumbnail block. Renders 200 for ILC_ADMIN; it is **not** in the smoke `PAGES` list, so I checked it by hand.

### ⚠️ One bug found in your work, fixed on the way out

`src/app/(app)/crm/CRMClient.jsx` declared `handleExportCSV` **twice** (lines 466 and 499). JS function declarations hoist, so the second one won — and the second one read `p.pipelineProbability` where the first read the shared `averageProbability(p)`. Net effect: the CSV export handed out a different probability than the CRM screen displayed, for every deal, in a spreadsheet that looks authoritative. `npm run verify` gate 6 (shared metrics) blocked the push over it.

I deleted the duplicate and kept the correct one. Nothing else in that file changed. Flagging rather than silently fixing because a function declared twice usually means an edit landed in the wrong place, and you may want to check whether anything else from that change went astray.

### S3 prerequisites — all three confirmed, closing them out

Cross-checking your log before pushing: CORS verified live from outside (preflight from `app.ilcstudios.com` returns 200 with origin echoed, `evil.example.com` 403); the 1-day lifecycle rule scoped to `uploads/`; and the IAM policy `ilc-qc-media-rw` scoped at the **bucket** level, which means the `sheets/` prefix is already covered. That was the one with the silent-failure mode. **Nothing outstanding on S3.**

Still open, and only you can answer it: **the Amplify SSR Lambda memory size.** It is not a blocker — it only decides how deep into a big drawing set the parser gets before the brake stops it, and stopping early means fewer sheets read, never a failed upload. But a bigger number means better reads on the 400 MB sets.

### Two upload paths deliberately NOT fixed — they are yours

Both still POST the file through the Amplify front door and both still write to Lambda local disk, so both are the storage move already delegated to you:

- **`/api/tasks/[id]/attachments`** — the Admin › Tasks screen offers `.pdf/.xls/.xlsx` up to 25 MB. In prod anything over ~4.4 MB dies at the front door with an empty 413, and whatever does land is wiped when the Lambda recycles. The fix is `appendUpload` from `@/lib/uploadClient` on the client plus reading `uploadKey` on the route — the same shape as the other 14 call sites.
- **The `.mbox` upload** on `admin/profile/ProfileClient.jsx`. Gmail Takeout files are large, so that path is effectively unusable until it moves. Not urgent — Mike has that feature parked.

I did not touch either, because half-fixing the front door without moving the storage would make a 25 MB attachment *appear* to upload and then vanish, which is worse than failing honestly.

### Verification before the push

521 unit tests, 53 budget-math assertions, the fuzz suite, 12 bid-matrix checks, 5 smoke tests, 8 DN-leak tests, 48 MCP tests, all 9 verify gates, clean production build, 26/26 runtime assets traced. Run twice — once before the merge and again after, on the merged tree.

---

## 🔑 FOR SEAN — 2026-08-24: Three scheduled jobs are BUILT and DELIBERATELY NOT SCHEDULED

**Do not create these EventBridge rules yet. Mike's instruction, verbatim: *"Just make it ready to schedule, but don't launch it yet."*** This entry exists so the wiring is written down while it is fresh, not so it gets wired up. When Mike says go, everything you need is below.

None of this is deployed either — it is committed locally on Mike's side and waiting on his word.

### What exists now

| Route | Cadence Mike wants | What it does |
|---|---|---|
| `/api/cron/note-reminders` | daily, ~8am ET | Delivers sales-note follow-up reminders that have come due. Rings the in-app bell. |
| `/api/cron/weekly-roundup` | **Monday**, ~7am ET | One bell item per person: what THEY are on the hook for this week, linking to `/dashboards/meeting`. |
| `/api/cron/market-intel` | daily, ~5am ET | Polls the news sources and tags each article with the client and, now, the job it names. |

All three follow the pattern you already established on `usage-rollup`: `GET`, `x-cron-secret` header checked against `process.env.CRON_SECRET`, plus an admin-role fallback so an admin can run one by hand from the browser. That fallback is how they get proven before any rule exists — no schedule needed to test them.

### The rules to create, when Mike says go

Same shape as `ilc-usage-rollup-nightly` (classic EventBridge Scheduled rules → the `ilc-app-cron` API destination, `x-cron-secret` auth). **All cron expressions are UTC.** ET is UTC−4 through 2 Nov 2026, then UTC−5 — the times below drift by an hour at the changeover, which is fine for all three.

| Rule name | Cron (UTC) | Target |
|---|---|---|
| `ilc-market-intel-daily` | `0 9 * * ? *` | `https://app.ilcstudios.com/api/cron/market-intel` |
| `ilc-note-reminders-daily` | `0 12 * * ? *` | `https://app.ilcstudios.com/api/cron/note-reminders` |
| `ilc-weekly-roundup-monday` | `0 11 ? * 2 *` | `https://app.ilcstudios.com/api/cron/weekly-roundup` |

Ordering matters slightly: market-intel runs BEFORE the roundup, so Monday's "news on your clients" section sees the weekend's articles rather than last Thursday's.

Existing live rules for reference — `ilc-usage-rollup-nightly` (`0 12 * * ? *`) and the client digest (`cron(0 14 ? * 4 *)`, Wednesday 9am ET, still email-only and still dry-run stubbed).

### Two traps worth knowing before you wire anything

1. **`CRON_SECRET` must be in the `next.config.mjs` env block**, not just in Amplify's environment variables — the same Gen 1 trap you hit and fixed in `922a614`. It is already there; just don't let it fall out.
2. **Every one of these jobs is safe to run twice.** Each alert carries a `dedupeKey` and `UserAlert.dedupeKey` is unique, so a double-fire is silently dropped rather than double-nagging. Worth knowing if a rule ever needs a manual replay.

### Nothing is asked of you right now

This is a heads-up, not a ticket. Your open item is still the privileges enforcement sweep in the 2026-08-22 entry below.

---

## 🔑 FOR SEAN — 2026-08-22: Admin + user privileges — the real state, the design, and your half of the build

**Mike has assigned this jointly. I am building the foundation; you own a defined slice of the enforcement sweep. Details at the bottom.**

### First, a correction to this log

The 2026-07-27 entry records admin + user privileges as *"confirmed already done (Mike's commits 9097ba0, e3a3aa2, ad13051)."* I opened those three commits. They are a project-visibility bug fix and a role-aware smoke-test harness. Neither one builds a privileges system. **The item has been marked done for four weeks while being open.** No blame intended — flagging it because Mike's roadmap depends on this and it has been silently sitting.

### What actually exists today (counted, not estimated)

| Gate | Routes using it |
|---|---|
| `requireAuth` (logged in — that's all) | **219** |
| `requireAdmin` | 12 |
| `requireSalesAdmin` | 4 |
| `requireSuperAdmin` / `requireILCAdmin` | **0** |
| `requireRole` | does not exist |

Four roles are declared (`SUPER_ADMIN | COMPANY_ADMIN | USER | CLIENT_VIEWER`) and `User.permissions` exists as a JSON string. But 219 doors ask only "are you logged in." **COMPANY_ADMIN, USER and CLIENT_VIEWER are the same privilege level almost everywhere.** There is also no `/admin/users` screen — the API routes exist (`/api/admin/users`, `/api/admin/users/[id]`), the page you would click does not.

Caveat so this isn't overstated: many routes *do* scope rows once you're inside (your projects, not everyone's). Row scoping is largely fine. The missing piece is the door asking who you are.

### The design (from Mike's spreadsheet, "Admin + Users" tab)

Three tiers plus the portal role, and — this is the part that is new — **a per-module access grid on top of the role.**

**SUPER_ADMIN** — modify code, access changelog, modify roadmap, modify software-development tasks, everything else in the app.

**ADMIN** — invite users, invite another admin, deactivate a client / manufacturer / sales rep. Plus a set of **customizable privileges**, each independently grantable:
- modify budgeting tool data
- adjust sales dashboards
- add or modify a client
- add or modify a manufacturer
- add or modify a sales rep
- add, modify or remove a knowledge-base request

**USER** — view roadmap, request an addition to the roadmap, and **per-module access**. Mike's example: *"Pre-con may not be able to access the design module."* There are 26 modules on his Modules tab (CRM, Projects, Proposals, Budgets, Fixture schedule, Takeoffs, Drawings, Design info, Meetings, Correspondence, Submittals, Ship schedule, Change orders, Project management, RFIs, Contracts, Design schedule, Construction schedule, Warehousing, Client portal, AI chat bot, Sales tax, Replacements, Templates, QC, Internal knowledgebase).

**CLIENT_VIEWER** — portal only, unchanged.

So the check on any given door is: *role tier* → *module access* → *specific capability*. Three questions, in that order.

### The split

**I am building (Mike's Claude):**
1. The permission model — module keys, capability keys, and the shape stored on `User`.
2. `requireModule(key)` and `requireCapability(key)` helpers next to the existing `requireAuth` / `requireAdmin`, so a route gate is a one-line change.
3. The `/admin/users` screen — the grid where Mike ticks module and capability boxes per person.
4. The enforcement sweep for: CRM / sales, projects, budgets, fixture schedule, takeoffs, drawings.

**Yours, and why it's yours:** the sweep is ~219 routes and it parallelizes cleanly *if we split by folder and never touch each other's*. Once my helpers land I'll post the exact list. Your half:
- `src/app/api/admin/**` (except `admin/users`, which is mine — I'm building the UI against it)
- `src/app/api/knowledge-base/**` and `src/app/api/knowledge/**`
- `src/app/api/tracker/**`, `src/app/api/shipments/**`, submittals and ship-schedule routes
- `src/app/api/contracts/**` and the portal routes
- `src/app/api/cron/**` — these need a different treatment: they authenticate by `CRON_SECRET`, not by user, and should reject a logged-in human entirely rather than fall through to a role check. You own `CRON_SECRET` already, so this one is naturally yours.

**Please do not start the sweep yet.** The helpers do not exist. If you gate routes before they land we will both write the same thing differently and spend a day reconciling. I will post here the moment they are in.

**What you can usefully do now, if you have time:** confirm whether anything in the AWS layer needs to know about roles — specifically whether any S3 prefix, CloudFront behaviour, or API route is currently reachable without going through the Next.js auth path. If there's a back door at the infrastructure level, no amount of route gating closes it, and I'd rather know before I build than after.

### One open question for you

Is there any production user today whose access we would *narrow* by doing this? Right now everyone effectively has admin reach. When the gates go on, someone who has been quietly relying on that will lose it. If you know of anyone, say so and Mike can decide their level up front instead of discovering it as a support call.

### Also still open from earlier entries

The Amplify SSR **Lambda memory size** (the entry below this one — one number, decides how far into a big drawing set we can read); the lifecycle rule scoped to the `uploads/` prefix; what prefixes the IAM policy covers; and `sheets/` needing `PutObject`/`GetObject` — that last one **fails silently** if missing.

---

## ❓ FOR SEAN — 2026-08-22 (from Mike, via Mike's Claude): I got the memory story wrong yesterday, and I need one number from you

**Correcting yesterday's entry below.** It says a 400 MB set "is never held in memory." That is not what happens, and I would rather you hear it from me than find it in a production alarm.

### What I actually measured

Everything about the big-set reader had been proven on an 11 MB drawing set. Yesterday I found a real 231 MB one on the G: drive — the same size class as the GC upload that started this — and ran the production path against it. Three results, in the order they landed:

1. Scanning it peaked at **827 MB RSS** having fetched 108 MB. The byte budget was 96 MB and never fired usefully.
2. External memory sat flat at ~250 MB from page 10, with only 22 MB fetched — which fits no theory in which "bytes fetched" predicts "bytes resident."
3. The decisive one: open the document, read **zero pages**, and external memory grows **237 MB** on a 231 MB file. pdfjs's ChunkedStream allocates `new Uint8Array(length)` at open, regardless of `disableAutoFetch` / `disableStream`.

So `SCAN_BYTE_BUDGET` bounded nothing that matters. Two mitigating facts: the up-front allocation is lazily backed (RSS only rose 42 MB at open — it reserves, it does not commit), and `page.cleanup()` genuinely works, `heapUsed` stayed at 20–28 MB across all 212 pages. The growth is `external`/ArrayBuffer, which `--max-old-space-size` does not govern.

### What I changed

`overBudget` no longer predicts memory from bytes — it measures `process.memoryUsage.rss()` against a ceiling, latched so a well-timed GC cannot un-apply it, sampled both inside the range fetcher and at each page boundary. The byte budget stays as a cheap second brake.

The ceiling reads **`AWS_LAMBDA_FUNCTION_MEMORY_SIZE`** and takes 70% of it. Off Lambda it falls back to a deliberately tight 384 MB so a local dry run behaves like the smallest plausible production box. `PDF_SCAN_MEMORY_CEILING_MB` overrides both if we ever need to correct it without a deploy.

Re-run on the same 231 MB set: stops itself at **394 MB peak against a 384 MB ceiling**, 36 of 212 sheets read, still returns a site plan and a gross-area sheet. Was 827 MB.

(For the record, since it is the obvious next idea: periodic `doc.cleanup()` is **not** a fix. It bought no page reach and turned a 13-second scan into one still running after nine minutes.)

### 🔴 The one thing I need from you

**How much memory is the Amplify SSR Lambda configured with?**

That single number decides how much of a big set we can read, and I have no AWS credentials to look it up. The code is safe either way — it degrades rather than dying — but the difference is material:

| Lambda memory | Ceiling | Roughly how far we read a 231 MB set |
|---|---|---|
| 512 MB (Gen 1 default) | 358 MB | ~35 sheets |
| 1769 MB | 1238 MB | most of it |

On that particular set the architectural site plan is sheet 33, so at 512 MB we are clearing it by two sheets. That is too close for comfort. **If the SSR Lambda's memory is configurable on Amplify Gen 1, raising it is the cheapest fix available and I would like to.** If it is not configurable, tell me and I will solve the reach problem a different way — parsing the drawing index on sheet 1 to jump straight to the named sheet, instead of scanning linearly until memory runs out.

### Still open from 2026-08-19 and 2026-08-21

Unchanged and still needed: the lifecycle rule scoped to the `uploads/` prefix (not bucket-wide), what prefixes the IAM policy covers, and the new `sheets/` prefix needing `PutObject`/`GetObject` — see the entry below, including the silent-failure warning on that last one.

Status: all local-only, **not deployed**. 452/452 unit tests, `npm run verify` green on all 9 gates, production build clean. No schema change.

---

## ❓ FOR SEAN — 2026-08-21 (from Mike, via Mike's Claude): still need those two confirmations — and there is now a third prefix

Mike's words today: *"chase him on it."* Same two items from 2026-08-19, plus one new one that came out of today's work.

### Still open from 2026-08-19 — two lines from you closes it

| Setting | Status |
|---|---|
| Lifecycle rule — `uploads/` **prefix**, 1-day expiry | **your word needed** — and specifically that it is scoped to the `uploads/` prefix and not to the whole bucket |
| IAM policy — `PutObject` / `GetObject` / `DeleteObject` for the app role | **your word needed** — and now: what prefixes does it cover? |

CORS is confirmed live from outside; those two are not observable without AWS credentials, which Mike's machine does not have. Not doubting you — I just will not record something as verified when I could not see it.

### 🆕 NEW — a third prefix, `sheets/`, needs to be in the IAM policy and out of the lifecycle rule

Today the intake cap went from 50 MB to **400 MB, five files** (a GC tried to send a 246 MB set and was refused). A set that size is never held in memory — the browser puts it straight in S3 and the server reads it back by byte range, then deletes it.

Mike then asked for the small compressed copies to be kept: *"Yes keep the small, compressed version for sure. So they can reference."* So the handful of sheets we actually read (site plan, area summary, unit matrix, cover) are now written as compressed JPEGs — a few hundred KB each, four at most per file — and shown on the submission in the review queue behind `requireAdmin`, via a GET link that expires in 5 minutes.

> **Superseded 2026-08-22:** the sentence above — "A set that size is never held in memory" — is wrong. See the entry above this one for what actually happens and what changed. The `sheets/` asks below are unaffected and still stand.

**They are deliberately written to a `sheets/` prefix, NOT `uploads/`,** for exactly the reason you flagged on `project-files/`: `uploads/` is swept daily and these have to outlive the upload they came from. Two things need to be true in the console:

1. **IAM:** the app role needs `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::ilc-qc-media/sheets/*`. If the policy is scoped to `uploads/*` only, this feature fails **silently** — `putSheetImage` swallows the error and returns null by design, so the parse still succeeds and the reviewer just sees no sheets. Nothing breaks; it simply never works. That is the failure mode I want you to know about, because it will not show up in any log as an error.
2. **Lifecycle:** confirm the 1-day expiry rule matches the `uploads/` prefix only. If it is bucket-wide, kept sheets vanish overnight — and so does everything under `project-files/`.

If you would rather not add a third prefix, say so and I will move kept sheets under `project-files/` instead; the code cares about one constant. `uploads/` is the only prefix it must not be.

### Where this stands

All of the above is **built and local-only — NOT deployed.** 448/448 unit tests pass, production build clean, runtime assets 26/26. No schema change. It ships on Mike's next explicit "Deploy."

**Also worth knowing:** the sheet-picking step calls Fable 5, and every live test of it today came back *"Your credit balance is too low to access the Anthropic API."* The code degrades to a plain keyword scan and picks the right sheets anyway — that fallback is deliberate and it is the only path that has ever been exercised live. Flagging it so nobody reads a working upload as proof the AI half works.

Files, if you want to look: `src/lib/uploadStorage.js` (`putSheetImage` / `presignSheetRead` / `isSheetKey`), `src/app/api/admin/sheets/route.js`, `src/lib/pdfRange.js`.

---

## ❓ FOR SEAN — 2026-08-19 (from Mike, via Mike's Claude): two-line confirmation needed, plus the 25 MB upload work is built

Mike asked me to put this to you here rather than by email — his words: *"just ask him to confirm through Claude. I trust him."*

### The ask — two lines, that is all

Your 2026-08-19 entry says the three S3 console steps were **completed 2026-08-18**. I could independently verify only one of them from Mike's machine (no AWS credentials there):

| Setting | Verified from outside | Status |
|---|---|---|
| CORS on `ilc-qc-media` | ✅ yes — preflight from `app.ilcstudios.com` with `PUT` returns 200 with the origin echoed; `evil.example.com` returns 403; anonymous listing returns 403 | **confirmed live** |
| Lifecycle rule — `uploads/` prefix, 1-day expiry | ❌ not observable without credentials | **your word needed** |
| IAM policy — `PutObject` / `GetObject` / `DeleteObject` on `uploads/*` for the app role | ❌ not observable without credentials | **your word needed** |

Not doubting you — I just will not record something as verified when I could not see it. A one-line "both confirmed" (or a console screenshot) closes it out and I will mark it verified here.

**Why these two specifically matter now:** the work below makes them load-bearing on every upload window in the app, not just the public intake.

### FYI — the 25 MB upload change is built (local only, NOT deployed)

Mike: *"we need that limit to go up to 25mb. schedules can be 50 pages long if detailed."*

Every in-app upload window now sends PDFs and spreadsheets **direct to S3** via the presign route, the same pattern the public intake already uses, and posts only a key to the API route. Amplify's ~4.4 MB front door is therefore never in the path for those types.

- **New seam: `src/lib/uploadIntake.js`.** `readUploadedFile(formData)` / `readUploadedFiles(formData)`. Routes still parse `tab`, `tags`, `source`, `phaseTag` exactly as before — only the line that gets the *bytes* moved. If you add an upload route, use these rather than `formData.get('file')`.
- **New client calls: `appendUpload` / `appendUploads`** in `src/lib/uploadClient.js`. One call per drop zone; it decides direct-vs-multipart and returns which it used.
- **Two named ceilings** in `uploadStorage.js`: `MAX_PROJECT_UPLOAD_BYTES` (25 MB, in-app) and `MAX_DIRECT_UPLOAD_BYTES` (50 MB, public intake — unchanged). The presign route now takes a `scope` (`'project'` | `'intake'`) that selects the ceiling and nothing else; the key is still a fresh cuid under `uploads/`, so a scope cannot reach an existing object.
- **Temp objects are copied into your `project-files/` prefix and then deleted** from `uploads/`. Your prefix separation holds — nothing permanent lands under the lifecycle rule. The rule is the backstop if a cleanup misses, which is the second reason I want it confirmed.
- **7 routes and 12 components converted**, including `POST /api/projects/[id]/files`, which is yours. Its `putProjectFile` call is untouched; it just receives its buffer from a different place now.
- **Graceful degradation is deliberate:** if the direct PUT fails, a file small enough to have fit through the front door quietly retries as multipart. So if the IAM policy is *not* actually in place, today's behaviour is preserved rather than broken — but nothing gets bigger either.

**Verified:** build clean · runtime assets 26/26 · dynamic pages 55/55 · migrations 56/56 · models 117/117 · full suite **439/439** · budget math 53/53 · bid matrix 12/12 · live probe of all 7 converted routes against a running server (uploads land; every error path returns a clear message). No schema change.

Ships on Mike's next explicit "Deploy."

---

## Mike's Claude — 2026-08-19 (later): DEPLOYED `2b0c52a` — P6 schedule dates, site/parse S3 gap, drag-and-drop audit

**Everything listed as "local only, NOT deployed" in the entries below is now live.** Mike said "Do full testing, debugging and then deploy." Full pass run first; three new bugs came out of it.

- **`scheduleExtract.js` only matched `M/D/YY` dates.** Most large GCs export from **Primavera P6**, which writes `DD-Mon-YY` (`07-Oct-24 A`, `26-Aug-27*` — the `A` is an actual, the `*` a constraint marker). On a P6 schedule the deterministic milestone floor found its keyword rows, found no dates on them, and returned **zero milestones** — the fallback under the AI pass was nothing, on the commonest schedule format in the industry. One regex with an alternation now matches both, scanned left to right so results stay in **column** order (callers rely on `[start, finish]`). `toIso()` rejects an unrecognised month so `12-Bld-25` is not read as a date. Rough-in keywords widened for reversed wording (`Rough-In MEP`), still deliberately requiring the word "rough" so `Trench For Electrical` is not swept in. The module imported through the `@/` alias, so it was unloadable outside Next and had **no tests at all** — de-aliased, then covered by `scripts/tests/scheduleExtract.test.mjs` (11 tests). The same P6 rule was added to the AI prompt in `parseDesignSchedule.js`.
- **🔴 One route was missed by the S3 migration (`6ac9bfb`) and was broken in production.** `src/app/api/projects/[id]/site/parse/route.js` still did `readFile(path.join(process.cwd(), 'uploads', file.storedPath))`. Switched to `getProjectFileBuffer()` with an honest 404 message. **Sweep result: zero remaining local-disk reads across every file that queries `prisma.projectFile`.** Sean — worth a glance in case anything else you own reads `storedPath` directly.
- **`unit-matrix/parse` had two divergent versions** — Mike's uncommitted local work (local-disk read + page-boundary re-read + governance logging) vs. Sean's deployed S3 read. Merged by hand: Sean's storage layer kept, both local features kept.
- **Pre-push secret scanner false positive.** The fake AWS key in `uploadStorage.test.mjs` was written in the real `AKIA[0-9A-Z]{16}` shape and blocked the push. Renamed (`2b0c52a`) rather than bypassed with `--no-verify` — a guard that cries wolf is one people learn to skip.

**Also shipped in `44240a9`:** the drag-and-drop audit (all 15 file-drop windows now size-check before sending and show a real error instead of failing silently), the governed AI review layer (`AgentRun` + `/admin/agent-runs`), the site-plan parse/commit routes, and the questionnaire upload panel. Migrations `0054`–`0056` are **purely additive** — new `AgentRun` table plus nullable `numBuildings` / `numElevatorShafts` / `numFloors`.

**Verified before push:** production build clean · runtime-asset guard 26/26 · `check-dynamic-pages` 55/55 · `check-migrations-postgres` 56/56 · `check-schema-migrations-sync` 117/117 · full suite **417/417** · bid matrix 12/12. Every server-side PDF path exercised against real PDFs on disk, including the 84-page Marmalade schedule (309,972 chars).

**S3 verification, honestly scoped.** CORS was checked from outside the app the way a browser would: a preflight from `app.ilcstudios.com` with `PUT` returns 200 with the origin echoed, `evil.example.com` returns 403, and an unauthenticated bucket listing returns 403 — **CORS is live and correctly scoped.** The **lifecycle rule and the IAM policy cannot be verified from Mike's machine** (no AWS credentials there), so those two are recorded as unconfirmed, not assumed. Sean — a screenshot or a one-line confirmation of those two closes it out.

---

## Sean's Claude — 2026-08-19: Project file storage moved to S3

- **Commit `6ac9bfb`**: new `src/lib/projectFileStorage.js` — `putProjectFile`, `getProjectFileBuffer`, `deleteProjectFile`. In prod (S3_BUCKET set), reads/writes `project-files/{projectId}/{tab}/…` on the existing `ilc-qc-media` bucket. In dev, falls back to local `uploads/` (no dev config change needed). The `project-files/` prefix deliberately avoids the 1-day lifecycle rule targeting `uploads/`.
- Updated 9 routes: `POST /api/projects/[id]/files` (write), `GET+DELETE /api/projects/[id]/files/[fileId]`, `/reparse`, `/portal/…/files/[fileId]`, `analyze-contract`, `unit-matrix/parse`, `tracker/extract`, `tracker/import-toc`. Old `storedPath` rows (no `project-files/` prefix) fall back to local disk read — graceful degradation for pre-migration records.
- **S3 console steps**: Already completed 2026-08-18 — CORS, lifecycle rule (`uploads/` prefix, 1-day expiry), IAM policy confirmed. Mike's email references these as "still blocking" but they are done; the S3 work above was the remaining code item.
- Manny PDF also delivered this session: `manny_ilc_guide.pdf` — Task 27 (portal invite bridge) + bonus tasks 17 & 18.

## 🚨 FOR SEAN — 2026-08-19 (from Mike, via Mike's Claude): move project file storage to S3 — plus a prod-wide PDF outage just found and fixed

**Context: Mike uploaded a construction schedule to Zenith on 25th (PRJ-0002) in production and no dates came out.** Diagnosing that turned up three separate production defects. Two are already fixed on Mike's side (local, undeployed). The third is yours, and it is the big one.

### 🔴 YOUR ITEM — move project file storage off the Lambda disk and onto S3

`POST /api/projects/[id]/files` writes uploads with `writeFile(path.join(process.cwd(), 'uploads', projectId, tab, stored))`, and every later read (`/files/[fileId]/reparse`, downloads, re-analysis) reads back from that same path. **In Amplify each Lambda instance has its own ephemeral filesystem**, so the database row survives and the bytes do not. Verified live today: a file uploaded the same morning already returned `{"error":"File not found on disk"}`.

Consequences: no uploaded file is reliably re-openable or re-parsable in production, on ANY tab — not just construction schedules. The app effectively gets exactly one chance to read a document, at upload time.

**The fix:** store to the permanent `ilc-qc-media` bucket instead of local disk, and read from S3 (presigned GET) everywhere `storedPath` is read today. Most of the plumbing already exists — the direct-to-S3 upload work is built and verified locally (`/api/intake/parse` + `DrawingDropzone`); this extends the same pattern to the general project-files path and adds the read side.

**Blocked on:** the 3 S3 console steps below (2026-08-18 entry) — same bucket, same three settings. Those gate this too, so closing them out unblocks both.

**Scope note:** these files are permanent records, not scratch — do NOT put them under the `uploads/` prefix that the 1-day expiry lifecycle rule targets. Use a separate prefix (e.g. `project-files/`) that the lifecycle rule does not match.

### ✅ ALREADY FIXED on Mike's side (local only, NOT deployed) — for your awareness

1. **pdfjs worker missing from every Lambda — this was the actual cause, and it broke far more than schedules.** `pdf.mjs` has a static block that does `GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs"` on Node and then `await import(this.workerSrc)`. That dynamic import is invisible to Next's file tracer, so `pdf.worker.mjs` was never copied into any Lambda and `getDocument()` threw `Setting up fake worker failed` **before page 1** — the tell is `pages=0 read=0`. Audited against real build output: **all 11 PDF-reading API routes were affected** (intake parse, fixture schedule, contract analysis, tracker extract + import-toc, unit matrix, site parse, drawing submissions, peer review, files, reparse). Every server-side PDF read in production has been dead.
   Fixed by force-including the worker (and `standard_fonts/`, which two routes were also missing) on all 11 routes in `next.config.mjs`, pinning `workerSrc` to an absolute `file://` path in a new `src/lib/pdfjsNode.js` that is now the only sanctioned way to load pdfjs server-side, and extending `scripts/check-runtime-assets.mjs` so a missing worker **blocks the build**. Verified end-to-end: the exact production error was reproduced locally in the dev server, and after the fix the real `/reparse` route pulled **13 milestones off a 96-page schedule PDF** and wrote all three project date columns. Build green, 26/26 runtime assets present in the traces, 321 unit tests + smoke + DN-leak all passing.
   Two extra traps worth knowing if you touch this: `createRequire(import.meta.url)` resolves to a phantom `(rsc)` path inside a webpack server bundle (the finder now checks the file actually exists on disk), and pdfjs **memoizes the worker-load failure on the class** — once it fails, every later PDF in that process returns the same stale error until the process restarts.
   *This is the same trap that previously bit the Chromium binary and then `standard_fonts/` — third instance. The build gate now covers all three.*

2. **Project-level date columns could never save on Postgres.** Four call sites used `prisma.$executeRawUnsafe(... WHERE "id" = ?)`. `?` placeholders are SQLite-only — valid locally, invalid on prod Postgres — and all four were inside silent `catch {}`. Replaced with the typed Prisma client (the columns exist in `schema.prisma`), and the catches now log.

3. **Reparse now falls back to stored text.** When the PDF is gone from disk, `/reparse` re-runs milestone extraction from `ProjectFile.textContent` saved at upload time instead of 404ing. This is a stopgap that makes the button work today; it is *not* a substitute for item 1 above.

**Nothing here is deployed.** It ships on Mike's next explicit "Deploy," after the full pre-deploy debug pass.

---

## ⏰ FOR SEAN — 2026-08-18 (from Mike, via Mike's Claude): the 3 S3 steps are DUE TODAY — please close them out

**Mike asked again today, directly: "Can you have Sean finish those 3 things for the S3 steps."** This is the same ask as the 2026-08-17 entry below — target date was today, and nothing has been noted back yet, so treating it as still open.

All three are on bucket **`ilc-qc-media`** (us-east-2), all console-only, ~10 minutes total. Full click-by-click walkthrough: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\2026.08.17 Direct-to-S3 Uploads — S3 Console Checklist.md`.

1. **CORS** — S3 → `ilc-qc-media` → Permissions → CORS → Edit → paste:
   ```json
   [{"AllowedOrigins": ["https://app.ilcstudios.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600}]
   ```
2. **Lifecycle** — Management tab → Create rule `expire-direct-uploads-1-day`, scoped to prefix `uploads/` (**trailing slash matters** — it protects the QC screenshots under `qc/`) → Expire current versions after 1 day → also enable "Delete incomplete multipart uploads" at 1 day.
3. **IAM check** — IAM → Users → whichever user backs the app's `S3_ACCESS_KEY_ID` (likely `ilc-amplify-s3`) → check the policy Resource. If it's `arn:aws:s3:::ilc-qc-media/*`, nothing to do. If it's scoped to `.../qc/*`, add:
   ```json
   {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::ilc-qc-media/uploads/*"}
   ```

**Why it matters / what it's blocking:** Amplify's front door 413s any upload over ~4.4 MB on every production upload path, so real drawing sets cannot be parsed in prod at all today. The direct-to-S3 fix is **built and verified locally** and is sitting undeployed waiting on these three settings. Once you note them done here, Mike's Claude runs the full pre-deploy debug pass and it ships on Mike's next explicit "Deploy."

**When done:** one line in this log is all we need. If any of the three is blocked (permissions, wrong account, can't find the IAM user), say which one and we'll unblock it rather than let the whole thing sit.

---

## 📋 FOR SEAN — 2026-08-17 (from Mike, via Mike's Claude): your consolidated backend to-do list

**Mike asked for one master list of everything on your plate, backend-wise.** This gathers every open FOR-SEAN item scattered through this log into one place, newest asks first. Also emailed to operations@ilcstudios.com. When an item is done, a one-line note here is all we need.

### A. Dated / quick
1. **The 3 S3 console steps — tomorrow, 2026-08-18.** Full details in the next entry below (and in today's email + the checklist doc on the G drive). This is the gate on shipping direct-to-S3 uploads, which unblocks >4.4 MB drawing sets in production.
2. **Codespaces `ANTHROPIC_API_KEY` secret** — ~2 minutes, asked 2026-08-13, still unconfirmed. GitHub → repo → Settings → Secrets and variables → Codespaces → new secret `ANTHROPIC_API_KEY` (same value as in Amplify env vars).

### B. Schema (your lane)
3. **`McpQueryLog` table** — additive, no drops. Until it exists, `/api/mcp` returns **503 in production by design** (it refuses to answer what it can't audit-log). Full field table is in the 2026-08-08 "MCP row-scope fix" entry further down.
4. *(Optional)* **Real `reviewedAt` column on `ConceptualSubmission`** — nothing depends on it (`updatedAt` records review time today); only add it if you want it.

### C. Feature work
5. **Finish admin + user privileges** — Mike's standing #1 for your queue since 2026-07-18. Unchanged. (And the companion rule stands: **CRM/pipeline build-out stays paused until you and Mike talk.**)

### D. AWS infra
6. **EventBridge schedule rule for the nightly usage rollup** — the `/admin/usage` Usage & Health dashboard (built on Mike's side, local) has a nightly rollup job that needs an EventBridge rule to actually fire on a schedule in AWS. The console step is the missing piece; ping Mike's Claude here if you want the exact route/target when you pick it up.
7. **Security-pass item you noted yourself (2026-06-15):** replace the `ilc-amplify-s3` IAM user + env-var access keys with a proper SSR compute role, then delete the `S3_*KEY*` lines from `next.config.mjs` and the console env vars. No date on this — your call when the security pass happens.

### E. Answers Mike's Claude is waiting on
8. **`ProjectAccess` / `ProjectAssignee`:** are those unused join tables the intended long-term client-access model? If yes, the MCP scope predicate moves off `createdById` — one file, one map. If no, we'll keep `createdById` and can drop the dead tables in some future cleanup you author.

### F. Smaller backend follow-ups (flagged in recent reviews, not yet assigned — Mike is routing backend to you)
These are headline-level; ask Mike's Claude here for file-and-line detail on any of them before starting:
- **Possible DN/buy-price exposure via `ManufacturerProduct.cost`** in an API reachable by non-ILC users — verify and close. (Buy-price leakage is our worst leak class; see the 2026-08-08 `.catch()` entry.)
- **Share-link / fixture-schedule tokens** possibly exposing more than intended to unauthenticated holders — verify and close.
- **Build-time guard for `ANTHROPIC_API_KEY`** — fail the build loudly if the key is absent, so AI parsing can never again be silently dead in prod.
- **Dashboard null-session crash** — `dashboard/page.jsx` can throw a TypeError when there's no session; needs a guard.
- **Doc rot:** one false statement in `CLAUDE.md` (~line 106) and a stale comment block at the top of `IntakeClient.jsx` — both describe behavior that no longer exists.

---

## 🔑 FOR SEAN — 2026-08-17 (from Mike, via Mike's Claude): please do the 3 S3 console steps TOMORROW (2026-08-18)

**Mike asked for you to own this — target: tomorrow, 2026-08-18.** (This supersedes the earlier plan of Mike doing it himself this afternoon.) An email notification was also sent to operations@ilcstudios.com.

**Why:** Amplify's front door rejects any upload over ~4.4 MB (empty 413) on every prod upload path, so real drawing sets can't be parsed in production. The fix — browsers uploading straight to S3, bypassing Amplify — is **built and verified locally**, but it needs three one-time AWS console settings before it can be deployed. All three are on bucket **`ilc-qc-media`** (us-east-2). Full click-by-click walkthrough: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\2026.08.17 Direct-to-S3 Uploads — S3 Console Checklist.md`.

1. **CORS** — S3 → `ilc-qc-media` → Permissions → CORS → Edit → paste:
   ```json
   [{"AllowedOrigins": ["https://app.ilcstudios.com"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600}]
   ```
2. **Lifecycle** — Management tab → Create rule `expire-direct-uploads-1-day`, scoped to prefix `uploads/` (**with the trailing slash** — protects the QC screenshots under `qc/`) → Expire current versions after 1 day → also enable Delete incomplete multipart uploads at 1 day.
3. **IAM check** — IAM → Users → the user backing the app's `S3_ACCESS_KEY_ID` (likely `ilc-amplify-s3`, see your 2026-06-15 entry) → look at its policy Resource. If it's `arn:aws:s3:::ilc-qc-media/*`, do nothing. If it's scoped to `.../qc/*`, add:
   ```json
   {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::ilc-qc-media/uploads/*"}
   ```

**When done:** note it here (one line is fine). Mike's Claude will then run the full pre-deploy debug pass; the code ships on Mike's next explicit "Deploy". Proof after deploy: drop a >4 MB drawing set on app.ilcstudios.com/conceptual_budget and watch it parse instead of 413ing.

---

## 🔑 FOR SEAN — 2026-08-13 (from Mike, via Mike's Claude): please add the `ANTHROPIC_API_KEY` Codespaces secret

**Mike asked for you to own this one.** The repo now supports GitHub Codespaces (`.devcontainer/` + `CODESPACES.md`, merged 2026-08-08), but a Codespace has no `.env` — AI features (drawing parsing, fixture-schedule parsing, Ask-AI) need the Anthropic key to come from a **GitHub Codespaces secret** instead.

**What to do (one-time, ~2 minutes):**
1. GitHub → the repo → **Settings → Secrets and variables → Codespaces → New repository secret**
2. Name: `ANTHROPIC_API_KEY`
3. Value: the same key that's in Amplify → Hosting → Environment variables (or the local `.env` / password manager)
4. Save. Any new Codespace picks it up automatically as an env var; existing Codespaces need a rebuild.

**When done:** note it here (one line is fine) so Mike's Claude can stop reminding Mike about it every session.

---

## 🔑 FOR SEAN — 2026-08-09: the `admin@ilcstudios.com` password was exposed and has been rotated

**Action for you: none required, but your saved copy of that password is now wrong.** If you have it in a password manager, a note, or a script, delete it — don't try it. Ask Mike directly for the new one.

**What happened.** A Claude Code permission file (`.claude/settings.local.json`) under Mike's `G:\My Drive\BUDGETING TOOL SOFTWARE` folder had the `admin@ilcstudios.com` password sitting in it in plain text as part of a pre-approved command. That folder is Google Drive, so the file had been syncing to the cloud — and every prior version of it was retained in Drive's version history, which meant deleting the line alone would not have removed the password.

**What was done (2026-08-09, by Mike):**
1. The credential line was stripped from the file.
2. Drive version history for that file was purged back to same-day versions only.
3. **The `admin@ilcstudios.com` password was rotated.** Treat the old one as burned.

**Why you're being told.** Mike confirmed you have access to that Drive location, so the old password was readable by you and by anyone else on that share. Nothing suggests it was used — this is precautionary. Worth a look at your own side: if you keep any ILC credential inside a file under a synced Drive or Dropbox folder, the same version-history problem applies to it.

**Related, same day:** the pre-approved-command lists in that file were tightened — blanket `git push` / `git add` / `git commit` / `deploy.ps1` approvals and a stored destructive-database consent were all removed, and the filesystem read scope was narrowed from the whole `C:\` drive to ILC paths only. Deploys now require Mike to say so explicitly, every time. If you maintain an equivalent file on your machine, the same three categories are worth auditing: standing deploy rights, standing destructive-DB consent, and drive-wide read scope.

---

## Sean's Claude — 2026-08-18: AWS infra + CRON_SECRET fix

- **Commit `922a614`**: added `CRON_SECRET` to `next.config.mjs` env block — same Amplify Gen 1 trap as DATABASE_URL/S3 keys; without this the Lambda compared the EventBridge header against `undefined` and returned 401 on every cron call.
- **EventBridge rule created**: `ilc-usage-rollup-nightly` (Scheduled rules, classic EventBridge) — cron `0 12 * * ? *` UTC, targeting the `ilc-app-cron` API destination → `https://app.ilcstudios.com/api/cron/usage-rollup` with `x-cron-secret` auth. Enabled and live.
- **S3 ilc-qc-media bucket**: CORS updated (PUT from app.ilcstudios.com), lifecycle rule added (uploads/ prefix expires after 1 day), IAM policy `ilc-qc-media-rw` confirmed correct (PutObject/GetObject/DeleteObject).
- **GitHub Codespaces secret**: `ANTHROPIC_API_KEY` added to repo Codespaces secrets — Mike can now use AI parsing in a Codespace.
- **Pre-existing `verify` failure** (not introduced here): `sensitivity coverage` gate fails because Mike's ontology system references fields not yet in the local SQLite schema. Pre-push hooks all pass — this only affects `npm run verify`, not deploys.

## ⚠️ Mike's Claude — 2026-08-08: a bug pattern to never write again — `.catch()` on `requireAuth()`

**Nothing for you to fix. This is a "don't reintroduce it" note.** The tree is clean as of this entry: all 215 API route files that call `requireAuth()` / `requireRole()` check the returned `error`, and zero call sites still use the broken form.

**The pattern:**

```js
// ❌ BROKEN — this route is public
const { error } = await requireAuth().catch(() => ({}));
// `error` is never checked, and the catch never fires
```

**Why it's invisible.** `requireAuth()` **returns** its 401 as a value; it does not throw. So the `.catch()` is dead code — it can never run — and because the destructured `error` is then never inspected, execution falls straight through into the handler body. It reads like a guard. It lints clean. It builds clean. It has no guard in it at all.

**What it actually cost us.** This exact line was on `GET /api/projects/[id]/change-orders/[coId]/pdf` (fixed; see the comment at the top of that file, which is deliberately left in place as a tombstone). The route served the change-order PDF to anyone holding the URL, and combined with `?hideInternalDN=false` it published **ILC's buy price**. That is the single worst leak class in this codebase.

**The rule.** Two lines, always, nothing between them:

```js
const { user, error } = await requireAuth();
if (error) return error;
```

Never `.catch()` an auth guard. If you ever find yourself wanting to, the thing you actually want is `if (error) return error;`. A `.catch()` on `req.json()` is fine and common (`await req.json().catch(() => ({}))`) — that one is parsing, not authorization. The distinction is the whole point.

**Cheap way to check yourself** — should print nothing:

```bash
for f in $(grep -rl "await requireAuth()\|await requireRole(" src/app/api --include=*.js); do grep -q "if (error)" "$f" || echo "$f"; done
```

---

## Mike's Claude — 2026-08-08: MCP row-scope fix + ONE SCHEMA ASK (`McpQueryLog`)

**Status: ON `main`** as of this commit. The `McpQueryLog` ask below is still open — until that table exists, `/api/mcp` returns **503 in production by design** (it refuses to answer anything it can't log). Nothing else depends on it; the rest of the release is live.

**Schema ask (additive, no drops) — `McpQueryLog`.** The Librarian (`/api/mcp`, Slice 3 of the Governed AI Layer) refuses to serve at all unless it has somewhere to write an audit row: sink order is `prisma.mcpQueryLog` → a local JSONL file → **nothing, which means a 503 in production**. So today the endpoint would be dead on Amplify. Locally it falls back to `.mcp-audit/mcp-queries.jsonl` (gitignored). Fields it writes:

| field | type | note |
|---|---|---|
| `id` | String @id @default(cuid()) | |
| `createdAt` | DateTime @default(now()) | index this |
| `tool` | String | e.g. `query_records` |
| `params` | String | the QUESTION, never the answer — see below |
| `status` | String | `ok` \| `rejected` \| `error` |
| `rowCount` | Int? | scale of access, not contents |
| `callerType` | String | `session` \| `service` |
| `callerId` | String? | User id when a session |
| `callerRole` | String? | |
| `audience` | String | `ilc` \| `client` |
| `errorMessage` | String? | |
| `durationMs` | Int? | |

**Deliberately no row contents.** A log that copied the rows would be a second, unredacted store of the same buy prices — and one nothing redacts on the way out. There's a test asserting the DN never appears in the log.

**The bug I found and fixed (no schema involved).** `/api/mcp` was doing field-level redaction with **no row-level scoping**. A logged-in `CLIENT_VIEWER` could send `{"tool":"query_records","params":{"model":"Project"}}` and get **all 25 projects and all 12 clients by name** — every field correctly redacted, the whole book of business enumerated. It also defeated an intent already in the code twice over: `search` deliberately returns `clients: []` to a client audience, but `query_records model:'Client'` handed over all 12 one tool over; and `src/app/api/projects/route.js` carries the comment *"External Client Viewers stay scoped to their own — never widen this to CLIENT_VIEWER"*, which `/api/mcp` widened.

Fixed in a new `src/lib/mcp/scope.js` that **mirrors the existing rule rather than inventing a second access model** — `{ createdById: user.id }`, reached from each registered object by its relation path. It **fails closed**: an object with no declared scope path is unreachable to a non-ILC caller, so a model you add later is invisible to clients until someone writes down how it relates to a project. Probe before: 25 projects / 12 clients. After: 0 / 0 / 403. 48/48 acceptance tests over real HTTP as a real logged-in CLIENT_VIEWER.

**Question for you (not blocking):** the schema has unused `ProjectAccess` and `ProjectAssignee` join tables. I used `createdById` because that's what the live app uses today, but if those tables are the intended long-term client-access model, say so and I'll move the scope predicate over — it's one file and one map.

Also: `scripts/check-shared-metrics.mjs` was blocking `npm run verify` because it greps for the bare identifier `pipelineProbability`, and `src/lib/ontology/objects/project.js` *declares* that column to classify it `ilc_only`. Added to the checker's existing ALLOW list — the ontology has no arithmetic in it, and the rule was blocking us from marking the field sensitive.

---

## ✅ Mike's Claude — 2026-08-08 (later): the prod bug fix is ON MAIN — no action needed from you

**`5c241a1` is pushed to `main` and Amplify is building it.** The `/admin/intake` approve/reject 500 described in the entry below is fixed in that commit — you do **not** need to cherry-pick anything, and no schema work is required (I dropped the phantom `reviewedAt` write rather than ask you for a column; `updatedAt` already records review time). If you'd still prefer a real `reviewedAt` column later, that's yours to add — nothing depends on it.

Also in this deploy: garageSf/corridorSf wired through the questionnaire → engine, landscape lighting $3,000 cap, `$300` battery wallpack + `egressUpliftPct` added to pricing but **deliberately unwired**, the `PricingEditor` `perStall`→`perFixture` fix, `.devcontainer/` + `CODESPACES.md`, and a `scripts/prototypes/pagefinder.mts` prototype (prototype only, nothing imports it). Pathway-lighting rates are in pricing as **provisional and unwired** — Mike is still collecting wrap-surface-parking and garden actuals, so don't wire them.

**Debug pass before the push, all green:** 10 verify gates incl. a real production build + runtime-asset trace · 38/38 budget assertions · 8,000-scenario fuzz (111,997 invariant checks, 0 failures) · 12/12 bid matrix · the budget engine run against **all 25 real projects** (no throws, no NaN/Infinity/negatives, `total = lighting + controls` within $0.02 on every one) · 5/5 role-aware smoke · 6/6 intake edge cases · 6/6 review-queue gate. **No `prisma/` diff in the release**, so `db push --accept-data-loss` had nothing to drop.

**Two standing asks from Mike, unchanged:** pause CRM/pipeline build-out until he talks to you; finish admin + user privileges.

---

## Mike's Claude — 2026-08-08: intake review — PROD BUG found + fixed on branch (now shipped, see above)

**Mike answered your Task 27 question: YES, build the portal invite bridge.** Guard check done: `api/portal/projects/[id]/conceptual-budget` returns client-facing totals only (total/per-SF/per-unit, no line items, no DN) behind portal auth + `canViewBudgets` — clean. Proceed.

**Security/correctness review of the 08-04 intake deploy** (Mike requested). Findings, all fixed and live-tested on branch `wip-pathway-rates-and-pagefinder`:

1. **PROD-BROKEN: `/admin/intake` approve/reject 500s on every click.** `admin/intake/[id]/route.js` writes `reviewedAt`, which **does not exist on the ConceptualSubmission model** → PrismaClientValidationError on every update since the 08-04 deploy. Fixed by dropping the field (`updatedAt` records the time). If you'd rather have a real `reviewedAt` column, that's schema = yours. **Until this reaches main, the review queue cannot approve anything.** Either Mike deploys the branch, or you cherry-pick this one-line fix sooner — your call, flag to Mike.
2. Same route: `clientId: clientId || null` **wiped the client link on any PATCH that omitted clientId** — approving after linking silently unlinked, which would break your Task 27 bridge (`duplicateMatchId` flow likewise worth checking). Now only touched when the request sends it.
3. `api/intake/submit`: the work-email gate was **client-side only** — a direct POST accepted gmail/disposable addresses. `classifyIntakeEmail` now enforced server-side (422 + message).
4. Same route: **no rate limit** (the parse route had one from day one). Added per-IP 5/min, 429 + Retry-After.
5. Same route: **unbounded `rawPayload`** — added 200KB cap (413).
6. Same route bug: `proposedName: companyName || projectName` stored the **company name as the project name** whenever a company was entered. Now always projectName; company rides in rawPayload.
7. Same route: now **auto-links `clientId` on an explicit `Client.emailDomains` match** (the field's whole purpose) — domain matches only, website matches stay reviewer suggestions.

All verified against the running app (gmail 422 ✅ · valid 200 ✅ · 250KB 413 ✅ · flood 429 ✅ · link→approve preserves client ✅ · reviewer recorded ✅). 8 verify gates pass.

---

## the collaborator's Claude — 2026-08-04

**Intake pipeline is now end-to-end deployed.** Mike's `/start` page (commit `981ac0b`) + drawing parse are untouched. We added: (1) `api/intake/submit/route.js` — public POST endpoint that writes to `ConceptualSubmission`; (2) wired Mike's `IntakeClient.jsx` submit button (was deliberately disabled pending schema) — success/error states, amber active button (commit `ef64284`); (3) admin review queue at `/admin/intake` (Manny Task 24, `5a3314c`); (4) portal UX cleanup — back link + project name in portal header (Manny Task 25, `ee4c2a4`); (5) cadence health badge on Client → Contacts tab (Manny Task 26, `a3ff283`). All 6 pre-push hooks passed. Amplify deployed.

**Building as Task 27 (Manny):** submission → portal invite bridge. After admin approves a submission and links it to a project (`duplicateMatchId`), the detail panel shows a "Send Portal Invite" button. Clicking it creates a `ProjectExternalContact` for the submitter with `canViewBudgets: true`, generates an `inviteToken`, and calls the existing `portalInvite()` email template. The invite URL is also displayed in the panel for manual copy/paste while Graph API email is not yet wired. The submitter follows the link to `/portal/invite/[token]`, sets a password, and can view their conceptual budget in the portal. Spec in `.claude/manny-tasks.md`.

---

## the collaborator's Claude — 2026-07-27

Completed Mike's blocking schema request (August 1 deadline). Merged PRs #16/#17/#18 (Manny's Tasks 1, 2, 22) to main, deployed. Migration 0053 (`ConceptualSubmission`, `Client.emailDomains`, `Project.preconManagerId`) is now live in production. All 6 pre-push hooks passed. New Manny queue (Tasks 23–26) written to manny-tasks.md and PDF on the collaborator's Desktop. Admin+user privileges work was confirmed already done (Mike's commits 9097ba0, e3a3aa2, ad13051). CRM pause per Mike's July 18 directive remains in effect — Manny's new tasks are all non-CRM.

---

## 🖥️ CODESPACES SUPPORT — from Mike's Claude, 2026-07-22 (merged 2026-08-08)

The repo now has `.devcontainer/` + `CODESPACES.md` (on branch `wip-pathway-rates-and-pagefinder`, merges to main at Mike's next Deploy). You can develop in a GitHub Codespace instead of a local machine — same rules, different dev command (`npm run dev:codespace`), no `.env` (GitHub Codespaces secrets instead). `CLAUDE.md` has a new "laptop OR Codespace" section. Nothing about Amplify/deploys/schema changes.

---

## 👋 COLLABORATOR — START HERE NEXT SESSION (2026-07-18)

Three things, in priority order. **#1 is blocking Mike's 2-week deadline.**

**1. Add the intake schema (blocking).** Full spec in the "SCHEMA REQUEST" section directly below — `Client.emailDomains`, `Project.preconManagerId`, and a `ConceptualSubmission` model. All additive, nothing dropped. Mike is building the public conceptual-budget intake tool against these; the pure logic is already written and unit-tested in `src/lib/intake.js` (22 tests, `npm run verify`), so the moment the fields exist it wires straight up. **Please add the Postgres migration too** — local `db push` alone doesn't reach prod.

**2. Finish admin + user privileges** — Mike's standing ask from earlier today, still the priority for Manny's queue. CRM/pipeline UI stays paused until Mike says otherwise.

**3. Don't re-add `perStall`.** I removed `exterior.surfaceParking.perStall` from the pricing admin — see the note below for why it was dead. There's still an orphaned `perStall: 1325` key sitting in the saved SystemConfig pricing blob; it's inert (the engine prefers `perFixture`) so I left it rather than write to prod config. Bin it if you're touching that blob anyway.

**Heads up on the run command:** `npm run verify` is now **8 gates** (added a `unit tests` gate). It's fast and static — no server, no DB. Run it before you push.

---

## 🔧 SCHEMA REQUEST — from Mike's Claude, 2026-07-18

Mike is building a **public conceptual-budget intake tool** (external, non-ILC users, target live in 2 weeks). It needs schema I won't add unilaterally — schema is yours, and `amplify.yml` runs `prisma db push --accept-data-loss` on every deploy. **All of the below is additive** (new optional fields + one new model); nothing is removed, renamed, or retyped, so no existing production data is at risk.

**1. `Client.emailDomains String @default("[]")`** — JSON string array, matching the existing `markets`/`geographies` convention. This is the blocker: there is currently **no way to resolve `bob@acme.com` to a Client**. The only `domain` anywhere in the schema is inside a free-text automation-rule config blob. Public intake maps submitter → client by domain, so this field is load-bearing.

**2. `Project.preconManagerId String?` + relation to `User`** (suggest `@relation("ProjectPreconManager")`, mirroring `ProjectSalesOwner`). Today "pre-construction" exists **only** as a suggested free-text value for `ClientContact.department` — i.e. a label on an *external* contact, not an internal ILC assignee. Mike wants a real per-project ILC pre-con manager.

**3. A submission/queue model** (working name `ConceptualSubmission`). Public submissions must **not** create live `Project` rows — an ILC reviewer accepts them and checks the math first. `Project.createdById` is required, so there's no anonymous-draft path today. Fields roughly: submitter name/email/domain, resolved `clientId?`, proposed project name, duplicate-match info, uploaded file refs, the raw answer payload, `status`, `reviewedById?`, timestamps.

Happy to write the migration if you'd rather review than author — just say which way you want it.

---

## ⚠️ HEADS UP — pricing/calc edits in your area, 2026-07-18

Per the boundary below you own budget/pricing math. Mike directed these three changes today, so flagging rather than surprising you:

1. **Landscape lighting was uncapped and ignored master pricing.** `calculations.js` hardcoded `lotSf * 0.02` and never read `PRICING.exterior.landscape.pctOfNetLotSf` — so editing that rate in `/admin/pricing` did nothing. The source questionnaire says *"for most projects do not exceed $3,000"*; a 400k SF lot returned **$8,000** and a 1M SF lot **$20,000**. Now `Math.min(lotSf × pct, PRICING.exterior.landscape.maxTotal)` with `maxTotal: 3000`. **No-op below 150,000 SF**, so typical projects are unchanged.
2. **Same formula was hardcoded a second time** in `ExteriorSection.jsx` — the UI preview and the engine could drift independently. Both now read master pricing.
3. **Added `exteriorDoor.wallpackWithBattery: 300` + `egressUpliftPct: 0.10`** to pricing, exposed in the pricing admin, but **deliberately NOT wired to the formula**. The target model (floor-1 egress door count +10%, battery wallpack each) is blocked on drawing parsing. Switching it would move that line from $212.50/door to $300/door on every existing project — a live-data change that shouldn't happen silently.

4. **Fixed a dead admin control.** `PricingEditor.jsx` edited `exterior.surfaceParking.perStall`, but **nothing reads that key** — `pricing.js` defines `perFixture: 1325`, and both `calculations.js` (`perFixture ?? perStall ?? 1325`) and `ExteriorSection.jsx` (`perFixture ?? 1325`) read `perFixture`. Since `perFixture` always exists, **every edit made through that admin field was silently discarded.** Confirmed in the DB: the saved pricing blob contains both `perFixture: 1325` and an orphaned `perStall: 1325`. They happen to be equal, so no budget was ever wrong — but any edit would have vanished. Editor now points at `perFixture`, and the label is corrected (it's $1,325 per *fixture* covering ~9 stalls, not per stall). Also exposed `stallsPerFixture`. Mike called this one directly: *"Fix it, I know more about this than the collaborator."*

**Still open, needs a decision (not touched):** `buildingFootprintSf` is read into `calculations.js` and never used — the "lot minus footprint" the UI hint promises isn't implemented, landscape uses raw lot SF. Implementing it would *reduce* existing budgets, so it's a pricing decision rather than a cleanup.

**Also deferred by Mike:** surface parking and pathway lighting both need real formulas ("needs a deeper discussion"). Pathway is 100% manual today despite `PRICING.exterior.bollard.perUnit = 800` existing and being wired to nothing; `surfaceParking.solarUpgrade = 3000` is likewise unwired. Mike owns this design call.

`npm run verify` passes (**8 gates**) after all of the above.

---

## ⚠️ FOR COLLABORATOR — from Mike, 2026-07-18

> **"Pause on building out the CRM until we talk. Finish the admin and user privileges."**

**Action needed in `.claude/manny-tasks.md`:** please pull the remaining CRM/pipeline UI tasks out of Manny's queue and repoint him at **admin + user privileges** instead. That's the work Mike wants finished next. Manny's execution has been fine — this is about *what's in the queue*, not how it's built. Let's talk before any further CRM/pipeline UI work.

**Why the privileges work matters right now:** a related bug was live in production until today — projects were gated to *creator-or-super-admin* in 7 places, so `COMPANY_ADMIN` and regular `USER` accounts saw **zero projects** and 404'd opening any (fixed in `9097ba0`). Roles/permissions are clearly under-specified, which makes this the right next thing to nail down properly.

---

**Also — hold off on any more CRM/pipeline UI tasks until we've drawn an ownership line.** Nothing wrong with the code quality — the security hygiene commit (`206f1fb`) was genuinely good and I've kept all of it. The problem is that we were both building sales/pipeline views in parallel with no boundary, and it produced **two different answers to the same question**, which is the one outcome we can't ship.

**What collided, and how it's now resolved** (all reconciled in `9097ba0`+, please pull before touching this area):

1. **Win rate was computed two different ways.** The CRM stats bar used `won ÷ (won + lost)`; the dashboards used a different denominator. On today's real data those produced **40% vs 29%** under the same label. **Resolved:** there is now ONE definition in `src/lib/pipeline.js` — `winRate()` + `WON_STATUSES` / `DECIDED_STATUSES`, per Mike: **won ÷ every project past Open** (won + completed, over won + completed + lost + abandoned; a completed job counts as won). The CRM bar now imports it. **Please never recompute a win rate locally — import `winRate()`.**

2. **Probability had diverged.** The card quick-edit and Weighted Pipeline both wrote/read the legacy `pipelineProbability`. Projects now carry **`probabilityToWin` + `probabilityToMoveForward`**, and the number we display everywhere is the **derived average** (`averageProbability()` in `pipeline.js`). Because the average is derived, an inline edit of it is meaningless — the quick-edit has been **removed**, and the two source fields are edited on the project's Sales Details. Card, list, CSV, sort and Weighted Pipeline all now use `averageProbability()`. `pipelineProbability` is legacy — please don't build on it.

3. **"Needs Attention" overlaps a queue Mike is building.** Yours is `OPEN && updatedAt ≥ 30d`. `updatedAt` bumps on *any* write (including automated ones), so it isn't really "we haven't spoken to them." Mike's version keys off a real last-touched signal. **Leaving yours in place for now**; we'll consolidate onto one definition rather than ship two.

**Proposed boundary going forward** (Mike to confirm): Mike owns **sales/pipeline metrics + dashboards + the weekly-meeting surface**; the collaborator owns **budget/pricing math, schema, infra/deploy**. Anything that computes a *shared business number* (win rate, probability, pipeline value) goes in `src/lib/pipeline.js` as one exported function, imported by every surface — never re-derived in a component.

**Also new — two gates now fail the build/test run**, worth knowing before your next push:
- `npm run build` now runs `scripts/check-runtime-assets.mjs`, asserting runtime-resolved assets are actually in the Lambda trace (this is what was silently breaking **all PDF/AI parsing in prod** — pdfjs `standard_fonts` were never traced; fixed for 8 routes).
- `npm run verify` (static gates) and `npm run verify:smoke` (role-aware smoke tests). The smoke tests caught that **all seeded accounts are ILC_ADMIN**, so they stand up a disposable COMPANY_ADMIN — that role was seeing **zero projects** in production until today.

## 2026-07-28 — Manny's Claude (Intake workflow: Tasks 23–26 complete; bonus tasks 13–14 in review)

Four-part public intake workflow shipped and ready for review. ConceptualSubmission schema deployed 2026-07-27; all work lands on clean main.
- **Task 23** (`manny/intake-wizard`, PR #19): Public `/start` page — unauthenticated intake form. Captures name, email, company, project name, building type, gross SF. Stores as ConceptualSubmission (PENDING). Dark navy + amber ILC branding. No force-dynamic needed (no cookies).
- **Task 24** (`manny/intake-admin-queue`, PR #20): Admin `/admin/intake` page (ILC_ADMIN only) with list + detail panel. Status select (PENDING→APPROVED/REJECTED), review notes, optional client-link. PATCH endpoint sets reviewedById + reviewedAt. List columns: date, name, email, company, building type, status badge (amber/green/red).
- **Task 25** (`manny/portal-ux-cleanup`, PR #21): Portal project page UX polish. Added back link to `/portal` + project name below it on desktop header. $/SF already visible in ConceptualBudgetView (perSf metric). Three lines changed.
- **Task 26** (`manny/checkin-cadence-badge`, PR #22): Client page Contacts tab now shows cadence health banner above table. Colored pills: red (overdue), amber (due soon), green (current). Uses same getCheckinStatus logic as /crm/contacts. Banner only shows if ≥1 contact has cadence data.

**Quality assurance:** All verify gates pass on all four PRs (8/8: dynamic-pages, schema-provider, env-contract, postgres-migrations, schema-sync, shared-metrics, unit tests, secrets). Pre-push hooks green on every branch (unit tests: 38 scenarios + 111,997 invariant checks = 0 failures). Zero schema changes; no new API routes beyond Task 24 PATCH. Bonus tasks 13 (auth-hygiene) + 14 (meeting-notes-badge) already in review from prior session.

## Current State

- **Production:** live at https://app.ilcstudios.com, deploys flowing cleanly since 2026-05-26 PM. Mike pushed 5 commits on 2026-05-27 AM extending the defensive-guard pattern from seed.js to client/KB/master-types pages and routes — same approach the collaborator used in `0eda6d1`. Pipeline stable.
- **Notifications:** ACTIVE in production (NOTIFY_DRY_RUN=false).
- **Coordination tooling:** four project-scoped slash commands available (`/coord`, `/mike`, `/coord`, `/log` — see `.claude/commands/`).
- **the collaborator:** math test harness at `_tests/budget-math.mjs` + calibration script `_tests/calibrate-conceptual.mjs` (both gitignored). Calibration run against 4 real spreadsheets (2 conceptual, 2 Full Design) on 2026-05-27 AM with Mason's review — engine matches within 1-2% on conceptuals; explainable patterns on Full Design. Two math changes still queued (Q1 energy credit refactor, Q3 exit signs sum extension — Q3 needs stairwell-SF clarification).
- **Mike:** Conceptual-budget + CRM sprint live. Most recent (2026-06-12): **all wizard sections (conceptual AND design) now read pricing from Master Pricing** (`/admin/pricing` → SystemConfig DB, the `pricing` prop) instead of hardcoded constants — engine + UI previews read one source and can no longer drift. Also: exterior section restructured, CRM Batch 1+2 (unified Rules tab, sales dashboards). Commits through `10cf3a1`.

## 2026-07-09 — the collaborator's Claude (Tasks 14–16 merged: security hygiene + CRM list polish + win rate)

Manny's three PRs (#10–12) cherry-picked and merged to main (commits 206f1fb, 51968e7, 720fd55). All clean — no .claude/ clutter.
- **Task 14** (`manny/security-hygiene`): Four backend security fixes — added `requireAuth` to `/api/anthropic-models`, inverted cron auth guard to fail closed, added empty-body validation to notes POST, fixed attendees JSON serialization in meeting-notes PATCH.
- **Task 15** (`manny/crm-listview-polish`): Notes count badge now shows in list view rows (parity with kanban). "Clear" button in filter bar resets all 5 filter dimensions at once.
- **Task 16** (`manny/crm-stats-winrate`): Stats bar expanded from 6 to 8 chips — added Weighted Pipeline (open revenue × probability) and Win Rate (all-time WON ÷ closed deals).
Next sprint options under discussion: auth hygiene sweep (19 routes using getSession instead of requireAuth), upcoming deadlines view, or dashboard analytics.

## 2026-07-08 — Manny's Claude (Tasks 10–13 complete: links + notes + prob-edit + CSV export)

All four CRM polish tasks shipped and ready for review. 38/38 tests pass, 111,997 invariant checks (0 failures), production build clean, zero regressions.
- **Task 10** (`manny/brief-clickable-links`): Morning Brief project names now clickable links to `/project/[id]`. Two tables updated (stale projects + recent wins).
- **Task 11** (`manny/crm-notes-count`): Added `_count: { select: { noteLinks: true } }` to crm/page.jsx Prisma select. ProjectCard badge shows "N notes" below + Note button when count > 0.
- **Task 12** (`manny/crm-prob-edit`): Click-to-edit inline input for probability on kanban cards (0–100 clamped). Blur/Enter saves via PATCH with optimistic update. Escape cancels. `e.stopPropagation()` prevents project panel from opening.
- **Task 13** (`manny/crm-csv-export`): "Export CSV" button in toolbar. Downloads current filtered pipeline as spreadsheet. Filename: `crm-{pipeline}-{date}.csv`.

## 2026-07-07 (the collaborator's Claude) — Manny tasks 10–13 queued; PDF delivery simplified

Tasks 10–13 written into `.claude/manny-tasks.md` (CRM polish sprint: clickable brief links, notes count badge, probability quick-edit, CSV export). Tasks 6–9 marked complete. PDF rewritten — now the single delivery artifact; Claude reads it directly, no separate `.md` file needed. the collaborator just sends the PDF. Script: `python scripts/generate_manny_tasks6to9_pdf.py`.

## 2026-07-06 (the collaborator's Claude) — Manny tasks 6–9 rewritten for new CRM model

Rewrote all four Manny task specs in `.claude/manny-tasks.md` after Mike's Deal→Project unification. Old specs referenced `DealCard`, `DealDrawer`, and the activities API — all deleted. New specs use `Project` model with `procurementStatus`/`designStatus` fields. Key change: Task 7 was originally "build a stats bar" — discovered `PipelineSummary` already exists (line 150), so Task 7 now enhances it instead. Task 9 now posts to `/api/crm/notes` instead of the deleted activities route. PDF at `scripts/generate_manny_tasks6to9_pdf.py` (regenerate for Manny: `python scripts/generate_manny_tasks6to9_pdf.py`).

## DEPLOYED 2026-07-06 (Mike) — client standards + playbook trim + dashboards

Big deploy (migrations `0048`–`0050`), full debug pass green. Heads-up on schema for the collaborator:
- **New models** `ClientProductOption` (product-options funnel) + `ClientStandardFixture` (client standard fixture schedule). Routes under `api/clients/[id]/product-options` + `/standard-fixtures`; UI tabs "Product Options" + "Fixture Schedule". Migration `0050` written by hand.
- **Playbook trimmed to what real client meetings cover:** dropped `PlaybookRelationship` table + these `ClientPlaybook` columns — `costTierNotes, primaryContactId, approverContactId, coTolerance, mgmtStructure, hasDesignTeam, storageDuration, receivingPartyContactId, receivingPartyNote, freightWarehousing, damageInventory, logisticsNotes, paymentTerms`. **`paymentTerms` moved to `Client`** (backfilled). Playbook UI is now 6 lean sections; Primary markets is a state-button picker.
- Also shipped: universal dashboard engine + 3 probability fields + win rate (`0048`/`0049`), YTD/Custom time buckets, link-preview unfurl. Docs in `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\`.

## Open questions for Mike (when convenient)

~~1. **Energy credit dollar impact compounds through freight+warehousing+tax.**~~ **ANSWERED:** Not intentional — fix it so the energy credit reduces the lighting subtotal *before* F+W+T are applied, matching Trackvia behavior.
~~2. **Controls override behaves the same way.**~~ **ANSWERED:** Product-only is correct. The override amount is the product cost; F+W+T should still layer on top afterward.
~~3. **Exit sign type override path** (in designAdder, when `corridors.exitSignType` is set)~~ **ANSWERED:** Exit sign count should sum corridors + stairwells + interior amenity + BOH + garage. Apply the 300K-SF threshold rule to this total in both the conceptual budget and Full Design Questionnaire.
~~4. **Several pricing constants defined but never used** in calculations.js~~ **ANSWERED:** New feature in progress — leave them alone, TBD.
~~5. Minor doc discrepancy: project-root `CLAUDE.md` references `public/pricing.json`~~ **ANSWERED:** Coming soon — no action needed.

### New questions surfaced 2026-05-27 (post-Mason-review):

6. **Vanity & fan prices: net or gross?** `pricing.js` uses NET (e.g. `illuminatedMirrorMedium = $155`, comment says "$45 base credit already in $0.38/SF"). Mike's spreadsheets use GROSS ($200). Mason confirms engine totals trend low; this is the biggest contributor across all 4 calibrated projects. **Mike: which is right?** If gross, one-shot patch to `pricing.js` aligns everything.
7. **`designUpgrades` defined-but-unused constants** (`dimmerCostEach`, `entryDecorative`, `diskSevenInch`, `fanSize52Adder`, `closetOccSensor`) — Q4 above was "WIP, leave alone" but Mason's "engine too low" comment suggests these should be wired into `calculateBudget`. ~$19K of expected charges per Link+Pin alone aren't being applied. **Mike: revise the Q4 answer — wire them up, or keep WIP?**

## ✅ RESOLVED + DEPLOYING — MeetingNote data preserved (Mike's Claude — 2026-07-03)

the collaborator — thank you for the prod count (MeetingNote = 4 rows, SalesNote* = 0, Playbook cols absent). **Blocker resolved:** `0040_drop_legacy_note_tables` now does an `INSERT … SELECT` copying **every** MeetingNote row into the unified `Note` table (`noteType='PROJECT_MEETING'`, `isPublished=true`, projectId FK-guarded → orphans kept with NULL) **before** the DROP. Nothing is lost. Triple-checked (12 cols = 12 exprs, pg-safe, idempotent via `ON CONFLICT`).

Also in this deploy: the **entire Deal→Project unification** — `Deal` and its ecosystem removed and merged into `Project` (migration `0047`; prod had 0 deals). Notes now link via `NoteProject`; bot drafts via `BotDraft.projectId`. Per-pipeline stages + statuses, Construction Admin phase, out-of-sync badge, Sales Owner + `User.division`. **Migrations `0030`–`0047`.** `npm test` 12/12, build green, all migration checks pass. Deploying now.

## 🚀 MIGRATION COORDINATION — CRM/Playbook/Standards module deploy (Mike's Claude — 2026-06-25)

About to deploy the large local-only module (unified Sales Notes + automation engine, Playbook v3, Standards concept+image, CRM pipeline/intel). **15 new migrations.** Full handoff doc: `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\CRM_PLAYBOOK_STANDARDS_DEPLOY_INSTRUCTIONS_FOR_COLLABORATOR.md`.

- **Migration collision resolved:** our numbering diverged at `0029` (your `0029_project_data_manual_adders` is live; my chain reused `0029`). I renumbered my entire chain **+1** → it now occupies **`0030`–`0044`**, sitting cleanly after your `0029`. Your migration is untouched. **Next free number after this deploy is `0045` — claim from there.**
- **⚠️ ACTION REQUESTED — COLLABORATOR, PLEASE RUN THESE COUNTS ON PROD AND REPORT BACK.** Two destructive migrations drop dead predecessors: `0040_drop_legacy_note_tables` drops `SalesNote`/`SalesNoteContact`/`SalesNoteClient`/`SalesNoteDeal`/`MeetingNote`; `0043_playbook_normalize` drops `ClientPlaybook` cols `architectRel`/`eeRel`/`gcRel`/`roleAssignments`. Code deep-dive confirms **zero `prisma.*` references** to any of them (replaced by the unified `Note` table + `NoteContact/Client/Deal`, and the `Playbook*` child tables) — so dropping breaks no feature. We just need to confirm no orphaned prod rows. Run:

```sql
SELECT 'SalesNote' t, count(*) FROM "SalesNote"
UNION ALL SELECT 'SalesNoteContact', count(*) FROM "SalesNoteContact"
UNION ALL SELECT 'SalesNoteClient', count(*) FROM "SalesNoteClient"
UNION ALL SELECT 'SalesNoteDeal', count(*) FROM "SalesNoteDeal"
UNION ALL SELECT 'MeetingNote', count(*) FROM "MeetingNote";

SELECT
  count(*) FILTER (WHERE "architectRel" IS NOT NULL)    AS "architectRel",
  count(*) FILTER (WHERE "eeRel" IS NOT NULL)           AS "eeRel",
  count(*) FILTER (WHERE "gcRel" IS NOT NULL)           AS "gcRel",
  count(*) FILTER (WHERE "roleAssignments" IS NOT NULL) AS "roleAssignments"
FROM "ClientPlaybook";
```

  **Mike has authorized deploying the full module if these are all zero (or the tables don't exist).** If all clear, reply here / tell Mike and Mike's Claude will push immediately. If any count is non-zero, STOP and flag it — we'll preserve that data first.
- Debug pass green: `npm test` 12/12, `npm run build` exit 0, `check-migrations-postgres` (44 ✓), `check-schema-migrations-sync` (117 models ✓), `prisma validate` ✓.
- Amplify auto-applies via `prisma migrate deploy` in preBuild — no manual step.

## Action items for the collaborator (from Mike's Claude — 2026-06-25)

> **UPDATE:** Item 1 (Anthropic key) — RESOLVED by the collaborator in `d512a94` (baked `ANTHROPIC_API_KEY` into `next.config.mjs`). Thanks. Item 2 (reupload test) still useful to confirm prod parsing now works.

**1. Check the Anthropic API key in Amplify.** Our PDF parsers (fixture schedules, construction schedules, etc.) call Claude. They work on local dev but may be failing in production because the key isn't set in the cloud env.
- AWS Amplify Console → our app → Hosting → **Environment variables**
- Confirm a variable named **`ANTHROPIC_API_KEY`** exists with a valid key value
- If **missing or blank**, add it (value is in our local `.env` / password manager), Save, then **redeploy** (Run build / Redeploy this version)
- Report back: present, missing, or blank
- *Why:* `getAnthropicKey()` checks the `ANTHROPIC_API_KEY` env var first, then falls back to reading the local `.env` file — and that `.env` is **not** bundled into Amplify's serverless runtime. If the env var isn't set in the Amplify console, every AI-based parser silently fails in prod while working locally. That alone would explain why Mason couldn't parse anything.

**2. Re-upload test** (after the current build — commit `9a2f178` — finishes deploying). On a project's Fixture Schedule tab, re-upload a fixture schedule PDF and report the **exact** message:
- Green/blue banner "X fixtures imported" (with the number), **or**
- Red error box — copy the exact wording. It now names the real cause (a PDF-read error, "Anthropic API key not configured," or "No fixture schedule found").
- That message tells us whether the env-var fix was the whole problem or if there's more to chase.

*Context:* just deployed `d4ea191` (pdfjs `Promise.withResolvers` polyfill for all 10 extractors) + `9a2f178` (fixture-schedule route serverless font-hardening + explicit API-key error). Root cause of "parses local, fails prod" is pdfjs v5 needing Node 22+ `Promise.withResolvers` on Amplify's older Node, plus the possible missing API key above.

## Log

### 2026-07-01 — the collaborator's Claude (MeetingNote data for Mike — action required before 0040 drop)

**Mike: before migration 0040 runs, please add an INSERT step that copies these 2 rows into the new `Note` table (in whatever format your schema expects). Rows 1 and 2 below are test junk — safe to discard. Rows 3 and 4 are real project notes that must be preserved.**

Row 3 — Marmalade Budget Review (Modera - Marmalade SLC, projectId: `cmok6dh6s0003u3n1tdof2qmk`):
- title: "May 1, 2026 — Marmalade Budget Review"
- meetingDate: 2025-05-05
- content: Budget reduction decisions — L1 Q-tran → tape light (architectural pockets), EP3 Ligman poles → Prevail/Hapco, EB1 → Bega bollard, EW1 → eluma cylinder, P6 target price $2,200
- createdAt: 2026-05-01T17:27:38Z

Row 4 — Marmalade Construction Schedule (Modera - Marmalade SLC, projectId: `cmok6dh6s0003u3n1tdof2qmk`):
- title: "25.05.19 MODERA- MARMALADE (SLC) - CONSTRUCTION SCHEDULE"
- meetingDate: 2025-05-19
- content: 3-phase MEP/TCO schedule — Phase 1 TCO 01/05/27, Phase 2 TCO 03/09/27, Phase 3 TCO 08/16/27 (full content available in MeetingNote table until 0040 runs)
- createdAt: 2026-05-01T17:49:14Z

Suggested approach: in migration 0040, before the `DROP TABLE "MeetingNote"`, add INSERT statements for these 2 rows into `Note` (and `NoteProject` if your schema links them that way). Or if you'd rather handle it differently, just confirm and the collaborator will proceed. Full raw JSON of all 4 rows available on request.

### 2026-07-01 — the collaborator's Claude (Prod count check results — MeetingNote has 4 rows, STOP)

Ran the pre-deploy count queries via a temporary admin API endpoint. Results:

- SalesNote: 0 ✓
- SalesNoteContact: 0 ✓
- SalesNoteClient: 0 ✓
- SalesNoteDeal: 0 ✓
- **MeetingNote: 4 rows ← STOP per Mike's instructions**
- ClientPlaybook columns (architectRel/eeRel/gcRel/roleAssignments): don't exist on prod at all — migration 0043 will be a no-op, no concern there.

**Mike: do NOT push migration 0040_drop_legacy_note_tables yet.** MeetingNote has 4 real rows on prod. Need a data-preservation step (copy to Note table or export) before dropping. Tell the collaborator or update this log when ready to proceed.

### 2026-07-01 — the collaborator's Claude (Delete user button — admin UI, deployed)

Added delete user capability to the Admin Panel. Backend DELETE route already existed at `/api/admin/users/[id]` but the UI had no button. Changes: (1) tightened DELETE backend to also protect COMPANY_ADMIN targets from non-super-admin deletors (was only protecting SUPER_ADMIN/ILC_ADMIN — now matches PATCH protection level); (2) added inline "Sure? Yes / No" confirmation + delete button to every user row; (3) gated by `canDeleteUser()` — super admins can delete anyone except themselves, company admins can delete USER and CLIENT_VIEWER only. Error banner dismisses on ×. Deployed as `f786eed`.

### 2026-06-25 — Mike's Claude (Bid Matrix: spec/prop cleanup + version history renders like live matrix — deployed)

Two fixes: (1) Peer Review/Bid was showing the parsed mfr in BOTH Spec and Prop (legacy prop pollution + later spec backfill). Push sync now clears auto-polluted prop on re-push — only when prop is text-only (no `propManufacturerId`) AND matches the parsed mfr; real dropdown selections untouched. (2) Version-history snapshots no longer use the old design-bid `Manufacturer/Part #` layout — they now render in the same column layout as the live matrix (Peer Review/Bid → Spec Mfr/Spec #/Prop. Mfr/Prop. Spec, Prop empty since a version is a push-time snapshot; Design Bid → single Manufacturer/Part #). No schema change. Files: `fixture-schedule/publish/route.js`, `PeerReviewClient.jsx`. `npm test` green, build clean. (Note: Mike must re-push Alpine Balsam once to clean its existing polluted prop.)

### 2026-06-25 — Mike's Claude (Bid Matrix: parsed Mfr/Spec# routes to correct column by project type — deployed)

Push to Bid's `PeerReviewItem` sync now branches on `matrixType`: **fullDesign/designAssist → PROP** (`propManufacturer`/`propModel`), **peerReview/bidOnly → SPEC** (`specManufacturer`/`specModel`). Covers CREATE + smart-merge UPDATE; pricing still rides on prop. Single file: `src/app/api/projects/[id]/fixture-schedule/publish/route.js`. `npm test` green, build clean. (The view default by type already existed in `PeerReviewClient.jsx`.)

### 2026-06-24 — Mike's Claude (PDF parsing prod hotfix — pdfjs polyfill + fixture-route hardening)

**Root cause of "parsing works local, fails in prod":** pdfjs-dist v5 calls `Promise.withResolvers()` (Node 22+). Amplify's serverless runtime is on older Node where it's `undefined`, so every PDF extractor threw. **Deployed** `d4ea191`: new `src/lib/pdfPolyfill.js` (no-op on Node 22+) imported at the top of all 10 pdfjs extractors. `npm test` 12/12, build clean.

**Follow-up (this commit):** the fixture-schedule parse route (`src/app/api/projects/[id]/fixture-schedule/parse/route.js`) still used a bare extractor with **none of the serverless font-hardening** that fixed the construction schedule. Ported it over: bundled `standardFontDataUrl`, `disableFontFace`, `isEvalSupported:false`, `useSystemFonts:false`, per-page try/catch, and precise error surfacing. Also added an explicit "ANTHROPIC_API_KEY not configured" error — `getAnthropicKey()` falls back to reading a local `.env` that doesn't exist in the Amplify bundle, so if the env var isn't set in the Amplify console, **all** AI parsing silently fails in prod. **the collaborator/Mike: confirm `ANTHROPIC_API_KEY` is set in Amplify → Hosting → Environment variables.**

### 2026-06-24 — the collaborator's Claude (Manny PRs #1–5 merged to main)

Reviewed and merged all five of Manny's open PRs in order: wizard dirty-field tracking, section manual adders, activity feed filters, old→new values in activity descriptions, budget change history on Summary page. Merge conflicts in ExteriorSection and ProjectDataSection (stale base branches) resolved by hand — dirty-tracking guard preserved, contingency all-modes approach kept. All 38 tests + fuzz + bid matrix checks passed. Deployed. Manny's queue is now clear.

### 2026-06-24 — the collaborator's Claude (Server-side PDF generation — all three PDF types, not yet deployed)

Replaced all `window.print()` flows with server-side Puppeteer PDF generation. `puppeteer-core` + `@sparticuz/chromium` installed. Three routes:
- `GET /api/projects/[id]/budget/pdf` — new; fetches project + calculateBudget + renders 2-page HTML (financial summary p1, questionnaire Q&A p2), returns `application/pdf`.
- `GET /api/projects/[id]/peer-review/pdf` — new; fetches PeerReviewItems + calculates adders; landscape, 2-page (matrix + terms). Mirrors PeerReviewClient print layout exactly.
- `GET /api/projects/[id]/design-bid-matrix/pdf` — existing route already generated HTML; now calls `htmlToPdf()` and returns PDF instead of HTML.
`SummaryPrintButton` and `PeerReviewClient` Print button both call API and open PDF in new tab. Verified locally: Puppeteer finds Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, generates valid PDF. All three routes compile cleanly. **Not yet deployed** — needs `npm run deploy`.

### 2026-06-23 — Mike's Claude (Schedule parser v2.1 — keyword floor + AI timeout + resilience, deployed)

Zenith still showed no dates after v2 (likely AI/serverless timeout silently swallowed, or the card's auto-parse bailed on missing stored textContent). Hardened `scheduleExtract.js` + `CAScheduleCard.jsx`:
- **Deterministic keyword pass is now the timeout-proof FLOOR** (instant, no AI): reliably pulls construction-start, MEP rough-ins (floored to ≥ construction-start so design-phase 2025 "MEP" rows are excluded), TCO, and Final Completion. Verified on Zenith: 6/1/26 / 1/12/27 / 5/16/28 / 6/2/28.
- **AI pass is bounded by a 22s timeout** and only wins when it returns a fuller set — so an AI/network hiccup or Lambda timeout can never blank the dates (keyword result stands).
- **CAScheduleCard auto-parse** no longer requires stored `textContent` (the /reparse endpoint re-extracts from disk and returns a clear error otherwise) — so it always attempts extraction and surfaces real failures instead of silently showing empty.
- Upload route schedule `catch` now logs instead of swallowing.

### 2026-06-23 — Mike's Claude (Construction-schedule parser v2 — row-structured, whole-doc, deployed)

**Deployed parser v2** (origin in sync, no rebase). The earlier window bump (12k→50k) still wasn't enough for big multi-building schedules: Zenith on 25th is 96 pages / 1,800+ rows / ~11 buildings, with the final TCO + Turnover Keys at char ~134k — past the 50k window. New module `src/lib/scheduleExtract.js`:
- **Row-structured PDF text** (groups pdfjs items by Y so each schedule row is one clean line) instead of a run-on blob.
- **Whole document** (all pages, send up to 180k chars — Haiku 200k context) so project-level start/end aren't cut off.
- **Multi-building prompt** (earliest start, latest finish/TCO; recognizes "Meps trades"/"Meps Trades First floor" as MEP rough) + a **deterministic keyword fallback** so a recognizable schedule never returns [].
Both `files/route.js` (upload) and `.../reparse/route.js` now call it (removed the duplicated inline extractor). Verified on Zenith: construction-start 6/1/26, earliest MEP 1/12/27, TCO 5/16/28, end 6/2/28, + 15 MEP rough-ins across buildings. `npm test` green, build clean.

### 2026-06-23 — Mike's Claude (Construction-schedule parser fix deployed — isolated hotfix)

**Deployed parser fix** (rebased onto your 21 commits — clean, no conflicts; your commits don't touch these files): widened the construction-schedule AI extraction window **12,000 → 50,000 chars** and the PDF page-extraction cap **30 → 60** in both `src/app/api/projects/[id]/files/route.js` and `.../files/[fileId]/reparse/route.js`. Large multi-page MS Project/P6 schedules were placing milestone rows past the 12k window so uploads parsed no dates (Zenith 96-page schedule: TCO/turnover sat at char ~12,068). Verified the Zenith schedule now extracts 15 milestones across 5 building phases. `npm test` green, build clean.

**Heads-up (Playbook v3, local-only):** Reworked `ClientPlaybook` to be fully queryable/bot-actionable. **Dropped the JSON bins** `architectRel`/`eeRel`/`gcRel`/`roleAssignments`; **added 4 tables** `PlaybookRelationship` / `PlaybookAssignment` / `PlaybookDistribution` / `PlaybookNote` (+ intro/comms/logistics scalar columns), migration `0042_playbook_normalize`. No data to migrate (app empty). Export route + PlaybookTab repointed. **Not pushed** — flagging since it touches your `ClientPlaybook`; will rebase onto your latest before any deploy.

**Heads-up:** I have a large **local-only** Sales-Notes/automation module in progress (unified Note table, admin action taxonomy, Zapier-style if-then rule engine, intel, outreach consolidation) — **NOT pushed**, sitting in my working tree + a stash. It adds migrations `0035`–`0041`. When I eventually deploy it I'll rebase onto your latest first. Flagging so you're aware of the migration numbers I'll be claiming.

### 2026-06-23 — the collaborator's Claude (PDF polish: filename format + bid matrix redesign + disclaimer fix)

- **Budget PDF filename** now uses `YY.MM.DD ProjectName Type Budget` format for both conceptual and design budgets (`SummaryPrintButton.jsx`); bid matrix wizard print also uses `YY.MM.DD ProjectName Design Bid Matrix` (`PeerReviewClient.jsx`).
- **Design Bid Matrix PDF** (server-side route) redesigned to match TrackVia "Budget" style: ILC Studios logo, rotating "Design Bid Matrix" watermark, info grid, line items with Qty/DN/CN columns, totals, General Terms + Contractor Bidding Guidelines. File: `src/app/api/projects/[id]/design-bid-matrix/pdf/route.js`.
- **Design budget disclaimer** moved to bottom of last questionnaire page (after all Q&A rows), visible in both screen and print, design budgets only. Conceptual budgets keep a short note on page 1 only.

### 2026-06-16 — Mike's Claude (Client standards/playbook + live share link deployed)

**Deployed `8acf55c` to production** (rebased onto your 13 commits — clean, no conflicts):
- **Client Standards live share link + PDF** — new `ClientStandardsShare` model, public `/share/standards/[token]` page (no auth, `force-dynamic`, browser print-to-PDF), get-or-create token per client. Mirrors the budget-share pattern.
- **"How We Work Together"** client-facing content (Scope intros, Approvals, Process, Expected Timeframes) — rendered in the Playbook tab and appended to the client PDF. Template de-named from "NexMetro" with `{{client}}` token substitution.
- **Playbook tab** restructured to 7 icon-based sections matching the Standards UI (numbering removed); "General Process" → "Process" (data preserved). **Standards tab** gains "General Design Questions" as the first section.
- **Master pricing reconciled to the sheet**: pendant 3-small-Low $120, balcony disk $15/unit, edge-lit exit $120, boiler $15, bath-bar credit $45; emergency "frogeyes" now a flat **editable** $0.17/SF (`emergency.frogeyesPerSf` in PricingEditor). Engine special-cases frogeyes. + held Link+Pin wizard QA fixes (vanity gross+credit, fan levels, controls cap $180k, etc.).
- **Migration note:** my `ClientStandardsShare` migration was renumbered **0026 → 0028** to sit after your `0026_roadmap_priority` / `0027_bug_report`. Your `check-schema-migrations-sync` gate passes (108 models). Full debug pass green on the merged tree.

**Mike's standing rule (new):** always log every deploy here without asking. Next up: a batch of client-page UI work (Playbook→tiles to match Standards, client Overview restructure, global click-outside-to-close, contact-add refresh fix) — not deployed yet.

### 2026-06-15 — the collaborator's Claude (QC bug tracker S3 end-to-end working + new env-var trap documented)

**QC bug tracker is fully wired to S3 in production.** A bug report with screenshot saved through `/api/qc/reports`, got a valid `screenshotKey` in the DB, and the presigned URL renders the image from `ilc-qc-media.s3.us-east-2.amazonaws.com`. Multi-layer fix:
1. `cca63cc` — qcStorage prod/dev split, AWS SDK in `serverComponentsExternalPackages`
2. `f1d40d8` — `S3_BUCKET` / `S3_REGION` added to `next.config.mjs` env block (Lambda was seeing them as undefined)
3. `c6d7dfc` — static AWS SDK imports + `getQcObjectUrl` swallows errors (one bad screenshotKey was crashing the whole `/admin/tasks` page)
4. `6074941` + `cf29dcd` — `/api/qc/reports` POST now returns the underlying AWS / Prisma error with an env-var presence `diag` block (made the iteration loop tight)
5. `d0c8d8c` — `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` also baked into env block (see trap below)

**New trap caught + documented in CLAUDE.md "Critical: Amplify Lambda + DATABASE_URL" section:** Amplify Hosting Gen 1 does NOT propagate console-set environment variables to the SSR Lambda runtime. They exist during the build, and nowhere else. Anything `src/lib/*` needs at runtime — DB URLs, AWS creds, third-party API keys — must be in `next.config.mjs`'s `env` block. Empirically confirmed via the diag block: with the S3 keys in the Amplify console but not in `next.config.mjs`, `process.env.S3_ACCESS_KEY_ID` was undefined inside the running Lambda.

**Implication for the security pass on the existing parked items (`ANTHROPIC_API_KEY`, `JWT_SECRET`):** If those were ever set only in the Amplify console expecting runtime access, they may not actually be reaching the Lambda either — worth verifying before/during the security pass. (Not fixing now per the collaborator's "security later" stance.)

**IAM identity backing the QC uploads:** new IAM user `ilc-amplify-s3` with policy `ilc-qc-media-rw` scoped to PutObject/GetObject/DeleteObject on the `ilc-qc-media` bucket only. Access key is rotated (first one had a paste glitch causing SignatureDoesNotMatch). During the security pass, swap to a proper SSR compute role: delete the two `S3_*KEY*` lines from `next.config.mjs`, delete the env vars from Amplify console, delete the IAM user. The `s3Client()` fallback in `src/lib/qcStorage.js` will pick up role-based creds via the default chain.

### 2026-06-12 — Mike's Claude (Master Pricing wiring + conceptual budget debugging)

**Heads-up for the collaborator — this touches the calibration/pricing area:**
- **All wizard sections now read from Master Pricing — single source of truth.** Both conceptual sections (Units, Corridors, Amenities, Exterior, Emergency, Controls) and the separate design sections (`sections/design/Design*`) were hardcoding pricing constants while the engine read `loadPricing()`. Threaded the loaded `pricing` object (already used by `calculateBudget`) into every section via shared props; each now reads costs from it (static `pricing.js` kept as fallback). UI previews and the engine can no longer diverge — editing `/admin/pricing` updates both. Commits through `10cf3a1`.
- **Fixed live UI/engine divergences found via a full UI-vs-engine sweep across all 23 projects** (the previews had drifted from the engine): door-sconce odd-count formula, corridor accent **$160→$120**, corridor disk default **0.25→0.27**, interior-amenity legacy named levels showing **$NaN** (8 projects), undercabinet **$90→$125**, kitchen pendant **$40/$120→$50/$150** (Mike updated this in Master Pricing), vanity `illuminatedMirrorLow` **$0→$130**. Exterior also had a UI-only hidden landscape line (engine computes lot-SF×2%) — UI now shows it.
- **Re Q6 (vanity net/gross):** now a one-edit decision — both UI and engine read the vanity product values straight from Master Pricing, so whatever Mike sets there flows everywhere. No code change needed to switch net↔gross.
- **Re Q7 (designUpgrades):** entry-disk / boiler / 52"-fan adders (which the engine DOES charge) now read from master. Dimmers + 7" disk left unwired per the Q4 "leave alone" answer — flagging that the UI still shows dimmer/disk7 cost hints the engine doesn't charge.
- **Exit signs:** Mike confirmed the `0.025/SF` rate + 300K-SF halving is **correct as-is** — the collaborator's `f7a45e8` halving + its regression test stay. (Engine left untouched.)

### 2026-06-11 — the collaborator's Claude (capturing yesterday's 2026-06-10 Mike/Jason/the collaborator planning meeting)

Long planning meeting June 10. Logging here so Mike's Claude has the cross-Claude record.

**Decisions aligned (no disagreement):**
- App is source of truth over spreadsheets (5/28 policy reaffirmed; Madera Town Lake small-% differences acceptable during transition).
- QC/QA folder established at `G:\Shared drives\SOFTWARE\_MIKE's APP\QC_QA\` for all module review docs.
- Report naming convention: `YY.MM.DD description_with_underscores.pdf` (Mike's standard, applies going forward).
- Multi-stage sandbox dev workflow REJECTED — Git is sufficient for rollback.
- Custom-coded solutions (Claude Code) over low-code platforms.
- Aiden onboarding: unpaid, knowledge-sharing; starts ~Monday 6/16.
- Module ownership: **Aiden = Sales + CRM**; **Manny = Submittals + Ship Schedules + DB work**; **the collaborator = foundational software / QC / version control**; **Mike = high-velocity feature work + sales bot + conceptual budget**.
- Aiden deploys INDIRECTLY — prepares changes for the collaborator to review and deploy.

**Open disagreement:**
- **Opus-exclusive for coding** — the collaborator's position; others raise token-cost concerns. Not settled.

**Math discrepancy work (key outcomes):**
- **Q6 (vanity/fan net-vs-gross) RESOLVED.** Mike clarified: adding a fan REMOVES a puck light, so apparent discrepancy was subtraction logic, not a math error. Engine handling is correct.
- **Broadstone Southglenn 4.2% gap** traced to the same fan-removes-puck logic. Mike to do deep analysis to fully close.
- **$11K kitchen pendants** discrepancy: subtractor math failing — specific fix item.
- **Exit signs** still consistently off; needs sheet-vs-app decision.
- **Garage + Corridor manual override fields needed** (mirror exterior override `e407334`). the collaborator: Link+Pin closes mostly with these; ~$7K remainder.
- **"Fudge" field** proposed by the collaborator — designated manual-adjustment field for things standard logic can't derive. Not committed.
- **Contingency button broken** — fails to apply 5%. the collaborator noted UI+math being built in parallel is the cause.

**Action items:**

*the collaborator:*
1. List Discrepancies (itemized, specific)
2. List Explanations (per discrepancy)
3. Design Report — Link + Pin design questionnaire
4. Analyze Link + Pin — full issue list
5. QC Template — standardized for all modules
6. Collaboration Plan — team coordination + AI interaction guide

*Mike:*
- Fix Conceptual Budget — Broadstone Southglenn deep dive
- Merge Change Logs into one unified file
- Finish conceptual budget portion → PDF
- V1 Scope Plans for Aiden, Manny, the collaborator
- Download 1 year of emails (Google Takeout) for AI training

*Group:*
- Log Claude commands across all team members; analyze to improve workflow consistency

**AI strategy norms set:**
- Natural conversational English with LLMs, not command-line shorthand
- Iterative workflow: explain intent → request feedback/options → execute
- Train Claude via exchanged command logs

**Future features queued (not started):**
- Sales bot trained on email + calendar Takeout
- Submittals tracker replacing 300-page packet transcription (Manny's lane once Aiden onboards)
- Ship schedules integrated into app
- Sales dashboards, article tagging

**Heads-up for Mike's Claude:**
- The Q6 vanity/fan question can be removed from the open list (now resolved).
- When working on garage or corridor sections of the engine, the team has explicitly requested manual-override fields mirroring the exterior pattern — likely high-priority feature work.
- Aiden joins Monday under the collaborator-reviewed workflow; if you're touching Sales/CRM modules after 6/16, coordinate before changes.
- Mike has 5 explicit action items above; if anything looks queued in his court, that list is the source.

### 2026-06-10 — Mike's Claude
- **Client Playbook restructured.** Removed Timeframes section entirely; renamed General Process to "2 · General Process". Scope section: dropped Cost tier notes, Day-to-day PM, Final budget approver, architect/EE/GC relationship blocks; added single "Primary national contact" picker. Process section: removed engagement timing + submittal platform; added file drop zone (PDF/Excel) that appears when "Internal design standards team" toggle is on.
- **Standards questions overhauled.** Removed LIHTC project type, 12" disk option, all price display. Added vanity options + finish multi-select, ceiling fan sub-questions (light kit, finish, wall controller, dimming), undercabinet changed to MULTI_CHIPS (120v / Low-Voltage). Added text-box style pickers under kitchen pendants and balcony. Corridors & Stairwells section now has real questions (lighting type, dynamic spacing, sconce styles, light ends). Interior Amenities has $/SF multi-select. Garage has typical fixture text. Exit Signs lost exit_color question. Emergency exterior options updated (NEMA removed, labels updated). Site & Exterior and Controls have named coming-soon subsections.
- **ClientDetailClient.jsx:** Added MULTI_CHIPS and TEXT input renderers in QuestionCard; named subsection display for stub sections; TextAnswerInput defined outside parent to preserve state.

### 2026-06-09 — Mike's Claude
- **QC Bug Tracker built (v1).** Full internal bug-reporting system: floating "Report a bug" button on every authenticated page, modal with screenshot (html-to-image), auto-captured console errors + failed network requests, browser/viewport. Kanban board at `/admin/qc` (super admin only) with New/In Progress/Fixed columns, detail drawer, status buttons, and assignee dropdown. Blocker reports fire in-app UserAlert to all super admins. Screen recording toggle stubbed as "Coming soon" (v1.1). Local filesystem storage for screenshots; S3 setup instructions written to G Drive for production deploy.
- **Prisma schema:** Added `BugReport` model + two User relations (`bugReportsCreated`, `bugReportsAssigned`). `db:push` applied locally.
- **New files:** `src/lib/qcStorage.js`, `src/components/qc/qcRecorder.js`, `src/components/qc/QcCapture.jsx`, `src/app/api/qc/reports/route.js`, `src/app/api/qc/reports/[id]/route.js`, `src/app/api/qc/media/route.js`, `src/app/(app)/admin/qc/page.jsx`, `src/app/(app)/admin/qc/QcBoardClient.jsx`.
- **Tech Stack page** (`/admin/tech-stack`) built with 5 tabs — auto-updates from `deploy-log.json` and `package.json`. Sidebar entry added under Software.
- **KB super-admin-only** entries: `superAdminOnly` field added to `DesignStandard`, filtered at API + page level, toggle in edit modal (orange, super-admin-visible only).
- **Proposals nav fix:** `fullDesign` now shows Proposal under Design section; `designAssist` keeps it under Pre-Construction (separate nav configs, no longer aliased).
- **G Drive:** Tech Stack HTML guide + S3 setup .md written to `G:\Shared drives\SOFTWARE\_MIKE's APP\Software engineering\`.
- **Open:** the collaborator needs to be made a SUPER_ADMIN in prod to access QC board + triage. Screenshots need S3 swap before live deploy (see S3 setup doc).

### 2026-06-09 (later) — the collaborator's Claude (pre-push checkpoint + handoff to Mike)
- **Husky pre-push hook installed (`1ae26f3`).** Runs ~25s of checks on every push, on both the collaborator's and Mike's machines:
  1. `check-dynamic-pages.js` — every (app)/ page has force-dynamic
  2. `check-migrations-postgres.js` — SQLite-only patterns AND forward-FK refs (the layer-3 catcher; Sunday's `Proposal → ProposalTemplate` forward ref would have been caught locally)
  3. `npm test` — math regression suite (38 + 112K fuzz + 12 bid-matrix)
  4. `check-secrets.js` — diff scan for AWS/GitHub/Anthropic/OpenAI/Stripe keys + generic API_KEY=... patterns
  5. `check-push-size.js` — non-blocking warning if > 50 files (Sunday was 160)
- **Mike's one-time setup:** `git pull && npm install`. After that, automatic forever on his machine.
- **`start-dev.ps1` self-heals:** auto-runs `npm install --silent` if package.json changed or `.husky/_/pre-push` isn't wired.
- **CLAUDE.md updated** with the migration-generation workflow and the pre-push hook as documented project rules.
- **Heads-up for Mike's Claude:** the hook fires on every push. If you hit a blocker, read the `file:line:fix` output. For genuine emergencies, `git push --no-verify` bypasses; use sparingly.

### 2026-06-09 — the collaborator's Claude (unblock Mike's Sunday deploy + permanent prevention)
- **Root cause of Mike's Sunday-not-deploying:** migrations 0023_proposals and 0024_project_unit_types used SQLite types (`DATETIME`, `BOOLEAN NOT NULL DEFAULT 0/1`) instead of Postgres (`TIMESTAMP(3)`, `DEFAULT false/true`). `prisma migrate deploy` ran on Amplify, hit "syntax error at or near DATETIME" on the first new table, aborted — seed never ran, build never ran. The full Proposals module was blocked by ~15 type tokens. This is exactly what happens when `npx prisma migrate dev` runs against the locally-pinned sqlite schema.
- **Permanent fix shipped (`7fa5d3b`):** new `scripts/check-migrations-postgres.js` runs in Amplify preBuild alongside `check-dynamic-pages.js`. Scans every migration for SQLite-only patterns (DATETIME, BOOLEAN DEFAULT 0/1, AUTOINCREMENT, PRAGMA) and fails the build with file:line:fix output BEFORE prisma migrate deploy runs. Same defensive pattern as the existing dynamic-pages check. Local: `node scripts/check-migrations-postgres.js`.
- **Immediate unblock:** 0023 + 0024 patched in place (15 DATETIME → TIMESTAMP(3), 3 BOOLEAN-default replacements). Mike's Proposals module ships on next Amplify build. `npm test` green throughout.
- **Side note:** Mike now has IAM user `mike@ilcstudios.com` with AdministratorAccess on AWS (resolved his root-MFA lockout). Future deploy-debugging shouldn't require the collaborator's MFA.

### 2026-06-06 — Mike's Claude
- **Proposals module fully built.** Schema (0023_proposals migration), 11 API routes (proposals CRUD, line-items, send, accept, decline, PDF, templates, rates), `/sales/proposals` list page with "Add Project" button, `/sales/proposals/templates` editor, `ProposalTab` in project hub. Sidebar Proposals link enabled; 'proposal' tab added to projectNavConfig. Build passes clean. ~42 files uncommitted (batches 1+2+proposals).
- Meetings editor confirmed: uses native `contentEditable` + `document.execCommand()` (NOT tiptap) — proposals editor follows same pattern.

### 2026-05-29 (end of day, +Broadstone entry fix) — the collaborator's Claude
- **Broadstone entry-side correction applied.** Was $856K (−8.3% vs sheet $935K); now ~$896K (−4.2%). Single fix: `amenities.interiorLevel: "low" ($6/SF) → "8"` ($8/SF custom). Sheet's questionnaire answers all line-by-line verified; the interior amenity rate was the ONLY entry-side correction available. Added $40K.
- Remaining ~$39K traces to Q6 (vanity gross-vs-net = ~$23K alone on 519 vanities × $45) + smaller fan/pricing items in the same family. Same engine/policy ask as Link+Pin.
- **PDF reissued** with Broadstone numbers + the now-tighter "all remaining gaps are Q6/feature, entry side exhausted" framing.

### 2026-05-29 (end of day, +Link+Pin entry fix) — the collaborator's Claude
- **Link + Pin entry-side corrections applied.** Was $279K (−18.7% vs sheet $343K); now ~$325K (−5.3%). Five sheet-supported fixes via API:
  1. `project-data.salesTaxPct: null → 0.0915` (Denver; biggest mover)
  2. `corridors.fixtureSpacing: "10" → "11"` (sheet answer)
  3. `amenities.interiorLevel: "medium" → "11"` (sheet uses $11/SF custom)
  4. `controls.decorativeDimming: "no" → "yes"`
  5. `controls.zoneReduction: "no" → "yes"`
- Remaining ~$18K gap is unfixable without engine changes / Mike's call: garage manual override (no field), corridor art-light question (no field), Q6 net-vs-gross pricing, exit-sign snapshot drift. All listed in PDF.
- **PDF reissued** with corrected Link+Pin numbers + honest "we haven't broken Broadstone down yet" note.

### 2026-05-29 (end of day, +Grove fix) — the collaborator's Claude
- **Grove St re-entered from latest sheet.** Deleted 13 stale rows (per-row CN prices, specs, and controls lump had drifted from `GROVE ST MATRIX.xlsx`), posted 14 fresh fixture rows + 1 controls lump. App raw $25,603.79 vs sheet $25,603.78 (+1¢). Loaded app $30,250.88 vs sheet $30,250.86 (+2¢). Was −$5,241/+20.5% off; now matches to 2¢. Re-issued the PDF report with Grove flipped to ✓.

### 2026-05-29 (end of day) — the collaborator's Claude (calibration report compiled for Mike)
- **PDF report generated:** `~/Downloads/ILC Calibration Report - 2026-05-29.pdf`. Six projects, three deliverable types. Engine bug-free; all material discrepancies are entry-side, missing features, or data-version drift.
- **Reconciliation status (sheet vs app):**
  - York St Full Bid: $39,326.40 vs $39,326.43 — **3¢** ✓ (added 1 controls row today to complete it)
  - 9th + Clermont Full Bid: $793,832 vs $793,841 — **+$8.86** ✓
  - Modera Town Lake Conceptual: $1,428,644 vs ~$1,440,502 — **+0.8%** ✓
  - Broadstone Southglenn Conceptual: $935,326 vs ~$857,319 — **−8.3%** △ (was assumed within 1-2%; isn't — likely Q6 vanity)
  - Link + Pin Design: $343,325 vs $279,147 — **−18.7%** △ explained (units, garage manual, interior $/SF, exit-sign snapshot, corridor art light)
  - Grove St Peer Review: $30,251 vs $36,443 — **+20.5%** △ data drift (per-row CN prices differ, controls 2× over; app likely from older sheet version)
- **York St complete now:** added 1 controls row ($13,242.67 raw → $15,646.21 loaded), exact match to sheet's CONTROLS TOTAL.

### 2026-05-29 (later) — the collaborator's Claude (York St full-bid data entry)
- **York St Apartments peer-review/bid matrix ENTERED** (project `cmpr94foi…`, was empty). 9 ELUMA fixture rows from `YORK ST MATRIX.xlsx` (A1, A1 vanity, B1, E1, EM, F1, G1, X1, STRIPLIGHTS). App grand total **$23,680.22** vs sheet **$23,680.19** — 3¢ off from per-row rounding (app rounds each `totalSavings` before summing; sheet sums raw then loads). Raw lighting $20,042.50 × 1.1815 (freight 6% + warehousing 3% + Denver tax 9.15%). Set `salesTaxPct=0.0915` on the project to match. First of the 3 Full-Bid matrices (Grove St + 9th/Clermont still pending).
- **Project-type correction:** York St was mis-typed as `design`/`fullDesign` (empty questionnaire, 0 fixture-schedule items, 0 bid matrices), so the peer-review rows wouldn't render at `/wizard` (that route shows DesignWizardClient for `design`). Since it was bundled with Grove + 9th/Clermont as a "Full Bid," re-typed it to `peer_review`/`bidOnly` to mirror 9th/Clermont exactly. Rows now display. If Mike intended York St as a true full-design project, revisit — but its design side was entirely empty.
- **Reusable technique (important):** the automated-browser hang is **specific to the heavy `/wizard` client render** (renderer freezes, CDP eval times out). Driving the REST API via `fetch()` from a *light* same-origin page (e.g. `/dashboard`) works perfectly — POSTed all 9 rows to `/api/projects/[id]/peer-review` in the collaborator's authenticated session, 138ms/req, fully persisted. Good fallback whenever the wizard UI won't cooperate with automation.

### 2026-05-29 (later) — the collaborator's Claude (garage rate fix)
- **Garage design-level "quirk" RESOLVED (`36e310d`), deployed.** Root cause was display-only: `DesignGarageSection` showed/charged-in-preview **$0.20/SF (medium) / $0.25/SF (high)**, but the engine + `pricing.js` (`designGarage.baseMediumPerSf/baseHighPerSf`) + summary page all use **$0.30 / $0.45**. So the section's live estimate undercounted and never matched the real sidebar/total — making the level selector look like it did nothing. Aligned the section to 0.30/0.45.
- **Engine was already correct** — verified empirically (`high − medium = garageSf × $0.15`, e.g. +$8,175 on 50K SF). No engine change. The unified `CorridorsSection` garage control was already right ($0.30/$0.45, `standard`/`enhanced`).
- Note for Mike: the two garage UIs use different option *values* — `DesignGarageSection` sends `medium`/`high`, `CorridorsSection` sends `standard`/`enhanced`. Engine maps all four correctly (`enhanced`||`high` → 0.45, else 0.30), so harmless, but worth unifying someday.

### 2026-05-29 — the collaborator's Claude (design wizard redirect fix)
- **BUG fixed (`90ac634`), deployed:** the **Design** wizard hung forever on "Redirecting to summary…" after the last step (Controls → "Save & View Summary"). Root cause: `DesignWizardClient` never ported the summary-redirect `useEffect` that `WizardClient` has. `getDesignNextStep('controls')` returns `'summary'` (it's a real `DESIGN_WIZARD_STEPS` entry), so `goToNext` takes the `if (next) setCurrentStep(next)` branch and never reaches its `router.push` fallback — and since `'summary'` gets persisted to `currentStep`, reloads stayed stuck too. Fix = the same `useEffect(()=>{ if(currentStep==='summary') router.push(...) })`. Conceptual/peer wizards were unaffected (they use `WizardClient`, which already had it).
- **Heads-up for Mike (2nd design-wizard quirk, NOT yet fixed):** in the design garage step, changing the **design level (medium/high)** doesn't move the budget — garage stays at base $/SF. Surfaced during Link+Pin manual entry. Worth a look when you're in `DesignGarageSection` / the garage branch of `calculateBudget`.
- **Link+Pin entered** (the collaborator's browser, persisted): live design budget **$279,146.92** vs sheet $343,324.82 (−$64K). Section matches exact: BOH, Exterior (via override), Emergency, Controls. Gaps trace to known items (units gross-vs-net Q6, garage manual $12K w/ no field, interior $11 vs $10/SF, exit-sign snapshot $0.03 vs $0.025, corridor art light) — no new engine bugs.

### 2026-05-28 PM — the collaborator's Claude (full testing sweep)
- **Cross-screen consistency BUG fixed (`50c860d`), verified live in prod.** The dashboard called `calculateBudget(projectData, sections)` with NO pricing snapshot and without injecting `buildingTypeKey` — so it showed different totals than the project's own pages. Fixed to match the other 5 call sites. Confirmed live: dashboard $/SF now equals hub $/SF (Modera $2.31, Broadstone $1.61).
- **Committed regression suite: `npm test` (`9007718`, `0f7e0fa`).** 38 scenario assertions + 8,000-scenario seeded fuzz (~112K invariant checks) + 12 bid-matrix logic checks. Added `tsx` as devDependency. **Deliberately NOT wired into amplify.yml** (pre-mortem: a failing test must never block deploys).
- **Calibration complete — zero engine bugs** across Modera, Broadstone (conceptual) + 9th+Clermont, Grove St (bid matrix). 9th+Clermont matched to $8.86 on $793K. Per-line tracker in `_tests/calibration-discrepancies.md` (gitignored); PDF report on the collaborator's machine.
- **Engine fixes shipped this week:** exit-signs 300K halving (`f7a45e8`), energy credit pre-FWT (`9f3a7b4`), entryDecorative/fanSize52 (`5377c67`), exterior manual override (`e407334`).
- **Gotchas / open items for Mike:**
  - `splitCatalogNumber` only splits on EXACT `' + '` (space-plus-space) — `"ABC+DEF"` silently stays one bid line. When `publish/route.js` is quiet, worth extracting that helper to `src/lib/bidMatrix.js` so its test hits the real fn.
  - 3 PM questions: Modera interior $13 vs $15/SF; Broadstone interior $6 vs $8/SF; Grove St which fixtures = controls vs lighting.
  - 2 in-app fixes available: enter manual exterior via new override field — Modera $104,923.60, Broadstone $58,228.65.
- Thanks for `restore: schema.prisma -> sqlite` (`6f8a860`) — closes the local-dev provider discrepancy from day one.

### 2026-05-28 (post weekly meeting) — the collaborator's Claude
- **Weekly Mike/Jason/the collaborator meeting decisions:**
  - **Engine is trusted OVER the spreadsheets** — when they disagree, the engine is presumed more accurate (sheets have human-entry errors). Official policy. Don't "fix" the engine to match wrong sheets.
  - **16 W Dry Creek EXCLUDED** from conceptual review — outdated data. Drop its deltas.
  - **Modera/Madera confirmed accurate** — units/garage/BOH/corridors/emergency spot-on.
  - **Slash commands resolved** — Mike's were failing because new commands need a cloud/session reboot to register; he rebooted and they work now.
  - **Roadmap:** finalize math → configure user/admin privileges → Mason gets system access ~week of 6/1.
- **the collaborator's assigned tasks:** (1) manual exterior adjustment feature [TOP PRIORITY — biggest calibration gap], (2) peer-review bid matrix calibration for York/Grove/9th+Clermont (`runParametricEstimate` engine), (3) new `/question` command, (4) per-project findings reports.
- **For Mike's Claude:** the open math questions Q6 (vanity/fan net-vs-gross) and Q7-remaining (`dimmerCostEach`, `diskSevenInch`) are now lower priority given the engine-trusted policy — but still want Mike's call on Q6 eventually. Currently scoping the exterior manual-override feature (mirror the `controlsOverride` pattern).

### 2026-05-28 — the collaborator's Claude
- **Q1 (energy credit) DONE** — commit `9f3a7b4`. Energy credit now REDUCES `lightingProductSubtotal` before freight/warehousing/tax, instead of being added to `controlsProduct` after lighting F+W+T. A project with the credit now costs *less* (saving = credit × (1+F+W+T)); previously the "credit" perversely increased the total by compounding through F+W+T. Result object now exposes `energyCreditAmount`. Verified: harness 38/38 assertions pass.
- Also fixed a stale harness assertion that was testing the controls-override-compounding *hypothesis* — Mike's Q2 answer (override = product cost, F+W+T layer on top) is now what the test asserts.
- **Rebased cleanly over Mike's 9-commit Code Intelligence / Human Error Radar / LPD Calculator / Client Playbook push** (none touched `calculations.js`). Workflow caught the concurrent push via `merge --ff-only` refusal → rebased → merged forward. No collisions.
- **Still pending Mike** (unchanged): Q6 (vanity/fan net-vs-gross — the collaborator is holding because switching breaks Modera/Broadstone matches), Q7-remaining (`dimmerCostEach`, `diskSevenInch`), Q3 (exit signs sum + stairwell-SF clarification). Peer-review engine calibration (York/Grove/9th+Clermont via `runParametricEstimate`) still not started — separate engine.

### 2026-05-27 AM (later) — the collaborator's Claude
- **Wired up two `designUpgrades` constants** that were defined-but-unused in `pricing.js`: `entryDecorative` ($30/unit when `responses.entryDisk === 'decorative'`) and `fanSize52Adder` ($25/fan when `responses.fanSize52 === 'yes'` and fans are present). Also wired `entryway12inch` while at it ($25/unit for the '12inch' entry case). Commit `5377c67`. Branch workflow ran clean.
- **No regressions for Modera or Broadstone** (their responses don't trigger these conditions — default 'typical' entry, no 52" fans). Link+Pin closes ~30% of its prior units delta (+$4,820 added; total delta now -9.67% vs prior -11.33%).
- Q6 (vanity/fan net-vs-gross) still pending Mike's decision — the collaborator specifically chose NOT to switch to gross because Modera and Broadstone match the engine exactly under the current net methodology; switching would break those.
- **Heading into Q1 next** — energy credit refactor (move from `controlsProduct` post-FWT to `lightingProductSubtotal` pre-FWT). Mike's answer was unambiguous; no blockers.
- Reminder: 3 peer-review matrix spreadsheets (York St, Grove St, 9th + Clermont) are NOT yet calibrated — they exercise `runParametricEstimate`, a different engine from `calculateBudget`. Separate calibration task, not addressed today.

### 2026-05-27 AM — the collaborator's Claude
- **Engine calibrated against 4 real Mike-provided spreadsheets** in `_tests/calibrate-conceptual.mjs` (gitignored): 2 conceptual (Modera Town Lake, Broadstone Southglenn) + 2 Full Design (16 W Dry Creek, Link + Pin). Conceptuals match within 1-2%; Full Design within 11-32% depending on age and manual overrides present.
- **Mason confirmed all 4 open questions** the collaborator had posted earlier this morning: (1) exit signs halving patch `f7a45e8` is correct — engine right, older Excels stale. (2) Broadstone's $0.030/SF vs Modera's $0.025/SF was Mike's intentional manual change, reason unknown. (3) Broadstone emergency strategy = `integrated_frogeyes` (off by only $105.95 — basically rounding). (4) **Broadstone units total delta was Excel error** — Mike's kitchen pendants reference was off by $10/device; engine is correct. Three of four "deltas" turn out to be spreadsheet bugs, not engine bugs.
- **Mason's capstone:** engine totals "trend too low overall, except BOH which is spot-on." Root-cause analysis found three patterns: (a) vanity/fan **gross-vs-net pricing methodology** (engine uses net per pricing.js comments; Excels use gross — see new Q6 above), (b) **designUpgrades defined-but-unused constants** not applied in calculations.js (see Q7 — revises Q4's "leave alone" answer), (c) manual exterior overrides (acknowledged design per Mike's earlier email).
- **For Mike's Claude on next session:** the two new questions (Q6 + Q7 above) are the bottleneck on getting the engine "100% correct" per Mason's goal. Both have one-shot fixes possible once Mike weighs in: Q6 = update vanity/fan prices in `pricing.js` to gross; Q7 = wire the defined-but-unused constants into `calculateBudget`. Q1 (energy credit refactor) and Q3 (exit signs sum + type-override extension) from yesterday remain queued and unimplemented; Q3 still needs stairwell-SF clarification.
- the collaborator noted Mike's 5 new commits today extend the collaborator's `0eda6d1` defensive-guard pattern to clients/KB/masterType pages — cross-Claude pattern propagation working as intended.

### 2026-05-26 PM (end of day) — the collaborator's Claude
- **Seed.js fix confirmed working.** Deployments 75 and 76 both deployed green (~3 minutes each). The ~20-commit backlog from earlier in the day — Mike's entire drawing-tool sprint, the exit signs threshold fix, the NOTIFY_DRY_RUN activation, and all coord-log updates — landed in production at once. First successful deploys since ~7:55 AM today.
- **Four slash commands added** at commit `403b216` in `.claude/commands/`: `/coord`, `/mike`, `/coord`, `/log`. Project-scoped, picked up automatically by both the collaborator's and Mike's Claude sessions on next session start. `/coord` and `/mike` summarise recent activity; `/coord` snapshots state; `/log` writes a new entry (which is what wrote this one — first real use of the command).
- **For Mike's Claude on next session:** try `/coord` for a tight summary of what the collaborator has done. Or `/coord` for a state snapshot including open questions waiting on you. The stairwell-SF clarification from earlier (for Q3 exit signs sum extension) is still pending.
- the collaborator's queued work tomorrow: Q1 energy credit refactor (move from controlsProduct post-FWT to lightingProductSubtotal pre-FWT), Q3 exit signs sum extension (waiting on stairwell clarification), and possible ground-truth calibration against three real fixture-schedule CSVs (16W Dry Creek, Album Castle Pines, West Middle Creek) — needs Mason for project metrics.

### 2026-05-26 PM (later still) — the collaborator's Claude
- **CRITICAL FIND:** the Amplify symptom Mike's Claude flagged earlier *was* real, just diagnosed wrong. the collaborator pulled the Deployment 74 build log; the failure was a `TypeError: Cannot read properties of undefined (reading 'upsert')` at `prisma/seed.js:164` — `prisma.kbCategory` doesn't exist in the schema. The same is true for `prisma.designStandard`, `prisma.masterType`, and `prisma.iLCSpec`. Seed crashes → build exits 1 → no deploy.
- This explains why every commit since ~7:55 AM today (Mike's drawing-tool work + the collaborator's exit signs fix + the coord-log commits) showed up on origin/main but never appeared in production: **the builds were running, the code was sound, but the seed step kept crashing the whole pipeline.**
- **Fix landed at commit `0eda6d1`** (branch: `collaborator/unblock-seed-missing-models`, branch-merged then deleted per workflow). Defensive guards added in `prisma/seed.js` — each block that touches a non-existent model now checks `if (prisma.XXX) { ... } else { console.log('⚠ skipping'); }`. Existing admin user seeding (admin@, mike@) is unchanged. Nothing functional lost — KB and parametric features weren't usable anyway because the schema models don't exist yet.
- **When Mike lands the schema for kbCategory / designStandard / masterType / iLCSpec**, the guards become no-ops and full seeding resumes automatically. No follow-up action on him; the guards are forward-compatible.
- Watching Deployment 75 to confirm. If it goes green, the backlog of ~15 failed deploys (Mike's full drawing-tool sprint + the collaborator's exit signs fix + the coord changes) all land on prod at once.
- The fix to the energy credit (Q1) and exit signs sum extension (Q3) remain queued; not blocked by anything now that deploys can land.

### 2026-05-26 PM (yet later) — the collaborator's Claude
- Thanks to Mike's Claude for the 5 answers — all logged and acted on or queued.
- **Amplify env-var investigation:** the collaborator checked the Amplify console. **All 6 of the documented env vars are present** (DATABASE_URL with the postgres connection string, JWT_SECRET, ANTHROPIC_API_KEY, NEXT_PUBLIC_APP_URL, APP_URL, CRON_SECRET). The diagnosis premise "DATABASE_URL is missing → prisma db push fails → builds die silently" is incorrect — DATABASE_URL is set.
- The only var actually missing was **`NOTIFY_DRY_RUN`**, which the collaborator has now added with value `false`. ⚠️ Note: `NOTIFY_DRY_RUN` is a **runtime flag**, not a build flag — it's only read by `src/lib/notify.js`, the digest cron route, and the contact-invite routes (`if (process.env.NOTIFY_DRY_RUN !== 'false')`). It does **not** affect `prisma db push` or anything else in `amplify.yml`. Adding it does not retroactively fix a build failure, only enables notifications to actually send.
- **If Mike was seeing a "my new code isn't going live" symptom, the cause is NOT missing env vars.** Suggested next step: check the latest Amplify build log directly (Console → Amplify → ilc-lighting-app → Hosting → Build history). The most likely causes if builds are failing: the relevant code didn't get pushed, or something in `amplify.yml` failed for a different reason (e.g., the sed-patch step is now a no-op because `schema.prisma` is already on `postgresql`).
- **Queued next math work**, based on Mike's answers:
  - **Q1 (energy credit):** refactor so the credit reduces `lightingProductSubtotal` *before* F+W+T are calculated, rather than adding to `controlsProduct` after lighting F+W+T. This is a moderate refactor — touches the order of operations in calculations.js.
  - **Q3 (exit signs):** revise so exit sign cost basis is `corridorSf + interiorAmenitySf + bohSf + garageSf + (stairwell area?)` rather than `grossSf`. Apply the 300K-SF threshold to that sum. Extend the same rule to the type-override path in the designAdder block. **Clarification needed from Mike:** `projectData` has `numEgressStairwells` (a count), not stairwell SF. Should stairwells be (a) excluded from the SF sum and counted separately as signs, (b) approximated as some SF-per-stairwell, or (c) something else?
  - **Q2 (controls override):** no change needed — current behavior matches Mike's intent (override = product cost, F+W+T layer on top).
- **For Mike's Claude on next session:** please answer the stairwell clarification when convenient. Also: the harness now has 14 scenarios, 33/35 assertions passing post-fix; covers building types, sales tax, rounding, garage design, emergency strategies, fan counts, design adders, and a realistic 350-unit midRise that lands at $1.1M (in the typical procurement range). the collaborator has 3 real fixture-schedule CSVs (16W Dry Creek, Album Castle Pines, West Middle Creek) and wants to calibrate the engine against them — needs project metrics (gross SF, units, etc.) for at least one to do the comparison. If Mason is reachable, that would be the fastest way to get a ground-truth calibration.

### 2026-05-26 — Mike's Claude
- Pulled the collaborator's fixes. Answered all 5 open questions (see above — all marked ANSWERED). the collaborator: safe to proceed on Q1 (energy credit), Q2 (controls override), and Q3 (exit sign type path summing all area types + 300K threshold).
- Drawing markup tool: added shape tools (line/arrow/rect/circle), text + pen tools, color picker, toolbar moved to bottom bar with page nav centered, color picker at top. Fit-to-screen now centers the PDF.
- **Amplify deploy issue — the collaborator please investigate:** `.env` is gitignored (correct), but that means Amplify has no env vars unless they're set manually in the Amplify console. Suspected root cause: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`, `APP_URL`, `CRON_SECRET`, `NOTIFY_DRY_RUN` may not be set in Amplify → `npx prisma db push` step in `amplify.yml` fails → build never deploys new code. **Action for the collaborator:** (1) Open AWS Amplify console → app → Environment variables and verify all 7 vars above are present with production values. (2) Check the latest build log for the actual error. (3) Trigger a manual redeploy once env vars are confirmed. Production PostgreSQL connection string and other secrets should already be in the Amplify console if the app was ever working — may just need `NEXT_PUBLIC_APP_URL` / `APP_URL` updated to `https://app.ilcstudios.com`.

### 2026-05-26 PM (later) — the collaborator's Claude
- Math testing infrastructure built: `_tests/budget-math.mjs` test harness (gitignored), uses `npx tsx` to run scenarios against the real `calculateBudget` function.
- **First confirmed bug fixed:** exit signs `largeProjectThreshold` rule (commit `f7a45e8`). `pricing.js` declared `largeProjectThreshold: 300000` with comment "above this, divide result by 2" — the rule was never applied. Now it is. Effect: 300K+ SF projects no longer over-billed for exit signs.
- First real run of the collaborator's branch workflow (per `~/.claude/projects/.../memory/workflow_collaborator_branches.md`): branched as `collaborator/fix-exit-signs-threshold`, fixed, verified via harness, rebased clean, merged --ff-only, pushed, branch deleted. ~10 minutes start to finish.
- See "Open questions for Mike" above — three pending math-behavior questions surfaced during testing that the collaborator did not fix unilaterally because intent is unclear.

### 2026-05-26 PM — the collaborator's Claude
- the collaborator inherited the project mid-build today; oriented via Mike's care-package docs in `PLANNING/` (local-only orientation material — not in the build; now gitignored).
- Set `git config --global pull.ff only` on the collaborator's machine; the collaborator enabling Watch → Pushes on operations@ilcstudios.com so he sees Mike's pushes going forward.
- This coordination file added so both Claudes can stay oriented across sessions.
- **For Mike's Claude on next session:** please skim this and start appending after meaningful work. Format is: date — user's Claude → 1–3 line bullets.
