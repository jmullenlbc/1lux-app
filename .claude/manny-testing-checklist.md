# Manual Testing Checklist — PRs 1–5

Hey Manny — these five features are now live. Sean needs a quick confirmation they work in the browser before closing them out.

**Where to test:** https://app.ilcstudios.com — use the project called **"THE APPROACH (SEAN'S)"**.

---

## 1. Dirty tracking

Open any wizard section (e.g. Units). Change nothing. Hit Save. Go to the Activity tab.

**Pass:** you see at most a "no changes detected" entry — not a full re-save of every field.

---

## 2. Old → new in activity log

In any wizard section, change exactly **one** answer and save. Go to the Activity tab.

**Pass:** the new entry reads `Updated **Field Name**: old value → new value`.

Bonus: change two fields in one save — it should fall back to the summarized format instead.

---

## 3. Section manual adders (questionnaire sections)

Open the Units wizard step. Scroll to the bottom — there's a "Manual Adder" field with a `$` prefix. Enter `5000` and save. Open the Summary page.

**Pass:** the Units line item is $5,000 higher than before and shows a "Manual adder" detail line.

Clear it back to zero when done. Do a quick spot-check on Corridors and Emergency too.

---

## 4. Section manual adders (Project Data)

Open the Project Data wizard step. Scroll to the "Section Adders" group at the bottom. Enter `3000` in the BOH manual adder and save. Check the Summary page.

**Pass:** the BOH / Core + Shell line is $3,000 higher. Clear when done.

---

## 5. Activity feed filters

Go to the Activity tab. You should see filter controls at the top.

**Pass:**
- Module dropdown → pick "Budgets (Questionnaire)" → list narrows to budget entries only
- User dropdown → pick your name → list narrows to your entries
- Date range → enter a From/To → list narrows by date
- "Clear filters" button → full list restored

---

## 6. Budget change history

Go to the Summary page and scroll to the bottom.

**Pass:** a "Budget Change History" section is visible, listing recent budget saves with date, user, and description.

---

Let Sean know when you've run through these. Flag anything that doesn't behave as described.
