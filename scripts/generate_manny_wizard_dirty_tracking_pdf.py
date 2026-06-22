"""Generate Manny's task spec PDF: wizard dirty-field tracking.

One-off script. Run once, drop the PDF on Manny's machine.
"""

from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Preformatted, PageBreak, Table, TableStyle
)
from reportlab.lib.enums import TA_LEFT

OUT_PATH = Path.home() / "Desktop" / "manny_wizard_dirty_tracking.pdf"

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'TitleStyle', parent=styles['Title'], fontSize=22,
    textColor=HexColor('#0f172a'), spaceAfter=4, alignment=TA_LEFT,
)
subtitle_style = ParagraphStyle(
    'Subtitle', parent=styles['Normal'], fontSize=11,
    textColor=HexColor('#64748b'), spaceAfter=18, alignment=TA_LEFT, leading=15,
)
h1_style = ParagraphStyle(
    'H1', parent=styles['Heading1'], fontSize=14,
    textColor=HexColor('#0f172a'), spaceBefore=16, spaceAfter=6,
)
h2_style = ParagraphStyle(
    'H2', parent=styles['Heading2'], fontSize=11.5,
    textColor=HexColor('#334155'), spaceBefore=10, spaceAfter=4,
)
body_style = ParagraphStyle(
    'Body', parent=styles['BodyText'], fontSize=10.5,
    textColor=HexColor('#1e293b'), leading=15, spaceAfter=6,
)
code_style = ParagraphStyle(
    'Code', parent=styles['Code'], fontName='Courier', fontSize=9,
    textColor=HexColor('#0f172a'), backColor=HexColor('#f1f5f9'),
    borderColor=HexColor('#e2e8f0'), borderWidth=0.5, borderPadding=8,
    leading=12, spaceAfter=10, leftIndent=4, rightIndent=4,
)
note_style = ParagraphStyle(
    'Note', parent=body_style, textColor=HexColor('#92400e'),
    backColor=HexColor('#fffbeb'), borderColor=HexColor('#fcd34d'),
    borderWidth=0.5, borderPadding=8, leftIndent=4, rightIndent=4, spaceAfter=10,
)

doc = SimpleDocTemplate(
    str(OUT_PATH), pagesize=letter,
    topMargin=0.6 * inch, bottomMargin=0.6 * inch,
    leftMargin=0.85 * inch, rightMargin=0.85 * inch,
    title="Manny — Task: Wizard dirty-field tracking",
    author="Sean / ILC Studios",
)

story = []

# ── Header ────────────────────────────────────────────────────────────
story.append(Paragraph("Wizard dirty-field tracking", title_style))
story.append(Paragraph(
    "Make the conceptual-budget wizard's section forms only send fields the user actually changed. "
    "Closes the underlying cause of a silent data-loss bug Sean caught on 2026-06-22. "
    "Estimated effort: 1–2 hours of focused work.",
    subtitle_style,
))

# ── Background ────────────────────────────────────────────────────────
story.append(Paragraph("Background", h1_style))
story.append(Paragraph(
    "On 2026-06-22, Sean re-ran a previously-validated project through the wizard and the budget total "
    "dropped from $494K to $373K. Investigation showed that the wizard's section forms send <b>every</b> "
    "field in their state on Save & Continue — including blank ones. The save endpoint treated blanks as "
    "<font face='Courier'>null</font> and overwrote the database, silently wiping fields that had been correctly "
    "populated earlier.",
    body_style,
))
story.append(Paragraph(
    "Sean shipped a server-side guard (commit <font face='Courier'>896ded1</font>) that skips writes where the "
    "new value is blank but the existing value is meaningful. That guard prevents data loss today, but it has "
    "a side effect: users can no longer use the wizard to <i>clear</i> a value.",
    body_style,
))
story.append(Paragraph(
    "Your task fixes the actual root cause: make the forms only send fields the user touched. With that in "
    "place, the server guard becomes belt-and-suspenders rather than the primary defense, and users get the "
    "ability to clear values back.",
    body_style,
))

# ── Scope ────────────────────────────────────────────────────────────
story.append(Paragraph("Scope", h1_style))
story.append(Paragraph(
    "Seven wizard section components live in <font face='Courier'>src/components/sections/</font>:",
    body_style,
))
story.append(Preformatted(
    "ProjectDataSection.jsx     ← start here\n"
    "UnitsSection.jsx\n"
    "CorridorsSection.jsx\n"
    "AmenitiesSection.jsx\n"
    "ExteriorSection.jsx\n"
    "EmergencySection.jsx\n"
    "ControlsSection.jsx",
    code_style,
))
story.append(Paragraph(
    "Each one has the same pattern: a <font face='Courier'>form</font> state object, an "
    "<font face='Courier'>handleSave</font> function that sends <font face='Courier'>{...form}</font> "
    "to an API endpoint. Your job is to make each section track which fields the user actually modified, "
    "and send only those.",
    body_style,
))

# ── Out of scope ─────────────────────────────────────────────────────
story.append(Paragraph("Out of scope (do not touch)", h2_style))
story.append(Paragraph(
    "• <font face='Courier'>src/lib/calculations.js</font> — the engine math is validated to within 2.3% of "
    "the source spreadsheet. Don't touch it.<br/>"
    "• The save endpoints in <font face='Courier'>src/app/api/projects/[id]/</font> — Sean's server-side "
    "guard stays in place.<br/>"
    "• The Project Overview Dashboard's <font face='Courier'>EditableStat</font> components — those already "
    "send one field at a time via PATCH.",
    body_style,
))

story.append(PageBreak())

# ── The pattern ──────────────────────────────────────────────────────
story.append(Paragraph("The pattern to apply", h1_style))
story.append(Paragraph(
    "Each section component should add a <b>dirty set</b> — a Set of field keys the user has modified. "
    "On every user edit, add the key to the set. On save, build the payload from only the dirty keys. "
    "On successful save, reset the set.",
    body_style,
))

story.append(Paragraph("Before (current pattern)", h2_style))
story.append(Preformatted(
    "const [form, setForm] = useState(() => { /* init from props */ });\n"
    "\n"
    "function update(key) {\n"
    "  return e => setForm(f => ({ ...f, [key]: e.target.value }));\n"
    "}\n"
    "\n"
    "async function handleSave(andNext = false) {\n"
    "  const payload = { ...form };           // sends EVERY field, including blanks\n"
    "  await onSaveData(payload);\n"
    "}",
    code_style,
))

story.append(Paragraph("After (with dirty tracking)", h2_style))
story.append(Preformatted(
    "const [form,  setForm]  = useState(() => { /* init from props */ });\n"
    "const [dirty, setDirty] = useState(() => new Set());\n"
    "\n"
    "function update(key) {\n"
    "  return e => {\n"
    "    setForm(f => ({ ...f, [key]: e.target.value }));\n"
    "    setDirty(d => new Set(d).add(key));   // track which field changed\n"
    "  };\n"
    "}\n"
    "\n"
    "async function handleSave(andNext = false) {\n"
    "  // Only send fields the user actually touched.\n"
    "  const payload = {};\n"
    "  for (const key of dirty) payload[key] = form[key];\n"
    "  if (Object.keys(payload).length > 0) {\n"
    "    await onSaveData(payload);\n"
    "  }\n"
    "  setDirty(new Set());                    // reset after save\n"
    "}",
    code_style,
))

story.append(Paragraph(
    "<b>Two things to keep in mind:</b><br/>"
    "• If the user touches no fields and clicks Save & Continue, send no payload (skip the API call entirely). The wizard should still advance.<br/>"
    "• Some sections use <font face='Courier'>setForm</font> in multiple ways (toggles, dropdowns). Wrap every state-setter with dirty tracking, not just the text inputs.",
    body_style,
))

# ── Steps to follow ──────────────────────────────────────────────────
story.append(Paragraph("Order of work", h1_style))
story.append(Paragraph(
    "<b>1. Branch.</b> Ask your Claude to create <font face='Courier'>manny/wizard-dirty-tracking</font>.<br/>"
    "<b>2. Start with ProjectDataSection.</b> Implement the pattern there. Test locally with "
    "<font face='Courier'>npm run dev</font>. Open DevTools → Network tab. Edit one field, click Save & Continue, "
    "confirm the PATCH/PUT payload contains only that one field (plus any required wrapper keys).<br/>"
    "<b>3. Commit ProjectDataSection alone.</b> Short message like \"wizard: dirty-track ProjectDataSection.\"<br/>"
    "<b>4. Repeat for the other six sections.</b> One commit per section is fine; one big commit is also fine.<br/>"
    "<b>5. Push the branch.</b> Open a PR titled \"Wizard: dirty-field tracking on all sections.\"<br/>"
    "<b>6. Tell Sean</b> the PR is ready. He reviews and merges.",
    body_style,
))

# ── How to test ──────────────────────────────────────────────────────
story.append(Paragraph("How to test as you go", h1_style))
story.append(Paragraph(
    "After each section, run this check locally:",
    body_style,
))
story.append(Preformatted(
    "1. npm run dev\n"
    "2. Open http://localhost:3000\n"
    "3. Log in (admin@ilcstudios.com / ILCadmin2024!)\n"
    "4. Open any conceptual budget project\n"
    "5. Go to the wizard section you just modified\n"
    "6. Open DevTools (F12) → Network tab\n"
    "7. Edit ONE field, click Save & Continue\n"
    "8. Find the PUT or PATCH request in Network → Payload tab\n"
    "9. Confirm: payload contains only the field you edited, no others",
    code_style,
))
story.append(Paragraph(
    "If the payload still contains untouched fields, the dirty set isn't being populated correctly. "
    "Check that every user-edit code path calls <font face='Courier'>setDirty(d => new Set(d).add(key))</font>.",
    body_style,
))

# ── Pre-push hooks ───────────────────────────────────────────────────
story.append(Paragraph("Pre-push hooks", h1_style))
story.append(Paragraph(
    "When you push the branch, the hooks run (~25 seconds). If any fail, <b>fix the underlying issue</b>. "
    "Never bypass with <font face='Courier'>--no-verify</font>. The likely failures for this task:",
    body_style,
))
story.append(Paragraph(
    "• <b>Tests</b> — the budget math suite runs. Should pass unchanged because the engine is untouched.<br/>"
    "• <b>force-dynamic check</b> — only matters if you add new pages, which you won't on this task.<br/>"
    "• <b>Secrets check</b> — make sure you didn't accidentally paste a real API key anywhere.",
    body_style,
))

# ── Reminder ─────────────────────────────────────────────────────────
story.append(Paragraph(
    "<b>Operating reminder.</b> Tell Claude what you want, not how. Claude handles git, tests, and pushes. "
    "You review the changes Claude proposes and approve. Never push to <font face='Courier'>main</font> directly — "
    "always via a <font face='Courier'>manny/*</font> branch + PR.",
    note_style,
))

# ── Where to ask for help ────────────────────────────────────────────
story.append(Paragraph("Stuck?", h1_style))
story.append(Paragraph(
    "If your Claude can't figure out where to thread the dirty tracking through a particular section "
    "(some have unusual edit patterns), ping Sean. Better to ask after 30 minutes than to stay stuck. "
    "Sean can give you the right shape for that one section and you continue from there.",
    body_style,
))

doc.build(story)
print(f"PDF written to: {OUT_PATH}")
