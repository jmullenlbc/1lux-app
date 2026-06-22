"""Generate the master QC report template PDF for the ILC app.

One-off script. Run once, then save the resulting PDF to the shared drive
as the canonical QC template. Testers copy its structure into a new Word
or Markdown document and fill it in for each QC pass — the PDF itself is
the visual reference, not a fillable form.

Designed to flex across:
  - Calculation QC (e.g., The Approach budget retest)
  - Workflow QC  (e.g., push-to-bid, change order flow)
  - Permission QC (e.g., role-based visibility)
  - Print/Export QC (e.g., PDF layout)
  - UX/UI QC      (e.g., label clarity, friction)
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

OUT_PATH = Path.home() / "Desktop" / "ilc_qc_report_template.pdf"

styles = getSampleStyleSheet()

# ── Style palette (matches the other Manny PDFs) ───────────────────────
title_style = ParagraphStyle(
    'TitleStyle', parent=styles['Title'], fontSize=22,
    textColor=HexColor('#0f172a'), spaceAfter=4, alignment=TA_LEFT,
)
subtitle_style = ParagraphStyle(
    'Subtitle', parent=styles['Normal'], fontSize=11,
    textColor=HexColor('#64748b'), spaceAfter=14, alignment=TA_LEFT, leading=15,
)
banner_style = ParagraphStyle(
    'Banner', parent=styles['BodyText'], fontSize=10,
    textColor=HexColor('#1e293b'), backColor=HexColor('#dbeafe'),
    borderColor=HexColor('#93c5fd'), borderWidth=0.5, borderPadding=10,
    leading=14, spaceAfter=14, leftIndent=4, rightIndent=4,
)
section_h_style = ParagraphStyle(
    'SectionH', parent=styles['Heading1'], fontSize=14,
    textColor=HexColor('#0f172a'), spaceBefore=14, spaceAfter=4,
)
prompt_style = ParagraphStyle(
    'Prompt', parent=styles['BodyText'], fontSize=9.5,
    textColor=HexColor('#64748b'), leading=13, spaceAfter=4,
    fontName='Helvetica-Oblique',
)
body_style = ParagraphStyle(
    'Body', parent=styles['BodyText'], fontSize=10.5,
    textColor=HexColor('#1e293b'), leading=15, spaceAfter=6,
)
placeholder_style = ParagraphStyle(
    'Placeholder', parent=styles['Code'], fontName='Courier', fontSize=9.5,
    textColor=HexColor('#475569'), backColor=HexColor('#f8fafc'),
    borderColor=HexColor('#cbd5e1'), borderWidth=0.5, borderPadding=8,
    leading=14, spaceAfter=10, leftIndent=4, rightIndent=4,
)
note_style = ParagraphStyle(
    'Note', parent=body_style, textColor=HexColor('#92400e'),
    backColor=HexColor('#fffbeb'), borderColor=HexColor('#fcd34d'),
    borderWidth=0.5, borderPadding=8, leftIndent=4, rightIndent=4, spaceAfter=10,
)

# ── Table styling ──────────────────────────────────────────────────────
def make_severity_table():
    data = [
        ['Severity', 'Definition', 'When to use'],
        ['BLOCKER',  'Stops the workflow entirely or produces wrong $ in client-facing output.', 'App crashes, totals wrong, data lost, role bypass.'],
        ['MAJOR',    'Wrong behavior the user will notice and complain about.',                    'Off-by-double-digit %, missing field, confusing label that misleads.'],
        ['MINOR',    'Wrong behavior the user is unlikely to notice on first pass.',               'Off-by-small %, missing tooltip, slightly misaligned column.'],
        ['COSMETIC', 'Visual or wording issue with no functional impact.',                         'Typo, misaligned pixel, color slightly off.'],
    ]
    t = Table(data, colWidths=[1.0 * inch, 2.8 * inch, 3.2 * inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1e293b')),
        ('TEXTCOLOR',  (0, 0), (-1, 0), HexColor('#ffffff')),
        ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0, 0), (-1, -1), 9),
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',(0, 0), (-1, -1), 7),
        ('RIGHTPADDING',(0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
        ('GRID',       (0, 0), (-1, -1), 0.4, HexColor('#e2e8f0')),
        ('BACKGROUND', (0, 1), (-1, 1), HexColor('#fef2f2')),  # BLOCKER red tint
        ('BACKGROUND', (0, 2), (-1, 2), HexColor('#fffbeb')),  # MAJOR amber tint
        ('BACKGROUND', (0, 3), (-1, 3), HexColor('#eff6ff')),  # MINOR blue tint
        ('BACKGROUND', (0, 4), (-1, 4), HexColor('#f8fafc')),  # COSMETIC slate tint
        ('FONTNAME',   (0, 1), (0, -1), 'Helvetica-Bold'),
    ]))
    return t

# ── Build document ─────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    str(OUT_PATH), pagesize=letter,
    topMargin=0.55 * inch, bottomMargin=0.55 * inch,
    leftMargin=0.85 * inch, rightMargin=0.85 * inch,
    title="ILC App — QC Report Template",
    author="ILC Studios",
)

story = []

story.append(Paragraph("ILC App — QC Report Template", title_style))
story.append(Paragraph(
    "Use this structure for every QC pass on the ILC app, regardless of module. "
    "Most sections stay as-is across QC types; only the contents change.",
    subtitle_style,
))

story.append(Paragraph(
    "<b>How to use this template:</b> open a new document (Word, Google Doc, Markdown — your choice). "
    "Copy the section headers below into your document, fill in the contents, and send the result via Hive "
    "to Sean. Do not modify this PDF — it is the reference. "
    "<br/><br/>"
    "<b>Filename convention:</b> <font face='Courier'>YY.MM.DD descriptive_name.pdf</font> "
    "(example: <font face='Courier'>26.06.16 the_approach_conceptual_budget_retest.pdf</font>).",
    banner_style,
))

# ── 1. Header ──────────────────────────────────────────────────────────
story.append(Paragraph("1. Header", section_h_style))
story.append(Paragraph(
    "Identify what was tested, by whom, and when. Captures the basic provenance so the report is self-explanatory in six months.",
    prompt_style,
))
story.append(Preformatted(
    "Title:        <one-line description of what was tested>\n"
    "Module:       <e.g., Conceptual Budget / Fixture Schedule / CRM Pipeline>\n"
    "Tester:       <your name>\n"
    "Date:         YYYY-MM-DD\n"
    "App build:    <commit short SHA — find in /admin/changelog>\n"
    "Reference:    <source spreadsheet / spec doc / previous QC report>",
    placeholder_style,
))

# ── 2. Scope ───────────────────────────────────────────────────────────
story.append(Paragraph("2. Scope", section_h_style))
story.append(Paragraph(
    "One short paragraph: what was being tested and what was NOT. Helps the reader know whether this QC answers their question.",
    prompt_style,
))
story.append(Preformatted(
    "<2-4 sentences describing the scope. Include: which screen(s) / flow(s) /\n"
    "feature(s) were exercised; which were intentionally out of scope; what would\n"
    "make this pass vs fail.>",
    placeholder_style,
))

# ── 3. Setup ───────────────────────────────────────────────────────────
story.append(Paragraph("3. Setup / starting state", section_h_style))
story.append(Paragraph(
    "What data was loaded, what role was the tester logged in as, what dependencies were assumed. Anyone repeating this QC should land in the same starting state.",
    prompt_style,
))
story.append(Preformatted(
    "Logged in as:    <email + role, e.g., admin@ilcstudios.com (SUPER_ADMIN)>\n"
    "Browser:         <e.g., Chrome 149 on Windows 11>\n"
    "Starting URL:    <where the QC began>\n"
    "Data state:      <fresh project / seeded data / production snapshot / etc.>\n"
    "Inputs entered:  <table or bullet list of values configured>",
    placeholder_style,
))

# ── 4. Procedure ───────────────────────────────────────────────────────
story.append(Paragraph("4. Procedure", section_h_style))
story.append(Paragraph(
    "Numbered, step-by-step what you actually did. If someone needs to reproduce a finding, they need this list.",
    prompt_style,
))
story.append(Preformatted(
    "1. <action> — <observed result>\n"
    "2. <action> — <observed result>\n"
    "3. ...",
    placeholder_style,
))

story.append(PageBreak())

# ── 5. Comparison ──────────────────────────────────────────────────────
story.append(Paragraph("5. Expected vs Actual comparison", section_h_style))
story.append(Paragraph(
    "The heart of the QC. For calculation tests, this is a numeric table. For workflow tests, it is a behavior table. For permission tests, it is a role/page access matrix. For print/export tests, it is a layout checklist. Adapt the columns to match the QC type, but always include the three-column shape: <i>Expected — Actual — Delta/Match</i>.",
    prompt_style,
))
story.append(Preformatted(
    "| Item / Section / Step | Expected      | Actual        | Delta or Match |\n"
    "|-----------------------|---------------|---------------|----------------|\n"
    "| ...                   | ...           | ...           | ...            |\n"
    "| ...                   | ...           | ...           | ...            |",
    placeholder_style,
))

# ── 6. Findings ────────────────────────────────────────────────────────
story.append(Paragraph("6. Findings", section_h_style))
story.append(Paragraph(
    "Itemized list of every deviation. Each finding gets a severity label using the rubric below. Each finding is something a developer could act on without further interpretation.",
    prompt_style,
))
story.append(Spacer(1, 4))
story.append(make_severity_table())
story.append(Spacer(1, 8))
story.append(Paragraph(
    "Finding format (copy this block per finding):",
    prompt_style,
))
story.append(Preformatted(
    "Finding #1   [SEVERITY]\n"
    "  Where:        <screen / URL / component>\n"
    "  Expected:     <what should happen>\n"
    "  Actual:       <what does happen>\n"
    "  Reproduce:    <minimal steps to see it>\n"
    "  Hypothesis:   <optional — your guess at the cause>",
    placeholder_style,
))

# ── 7. UX observations ─────────────────────────────────────────────────
story.append(Paragraph("7. UX / usability observations", section_h_style))
story.append(Paragraph(
    "Things that are not strictly wrong but were confusing, awkward, or slow during the QC. Keep separate from Findings — these are subjective notes, not bugs.",
    prompt_style,
))
story.append(Preformatted(
    "- <observation: label, copy, friction, missing affordance, slow load, etc.>\n"
    "- ...",
    placeholder_style,
))

# ── 8. Open questions ──────────────────────────────────────────────────
story.append(Paragraph("8. Open questions", section_h_style))
story.append(Paragraph(
    "Things you were unsure about during the QC. Surface them here rather than guessing — Sean or Mike can answer and the next tester benefits.",
    prompt_style,
))
story.append(Preformatted(
    "- <question — including which finding or section it relates to>\n"
    "- ...",
    placeholder_style,
))

# ── 9. Recommendations ─────────────────────────────────────────────────
story.append(Paragraph("9. Recommendations / next steps", section_h_style))
story.append(Paragraph(
    "What you would do about each finding, in priority order. Optional — Sean and Mike may overrule, but your perspective as the tester is useful input.",
    prompt_style,
))
story.append(Preformatted(
    "1. <BLOCKER first, then MAJOR, etc.> — <suggested action>\n"
    "2. ...",
    placeholder_style,
))

# ── 10. Sign-off ───────────────────────────────────────────────────────
story.append(Paragraph("10. Sign-off", section_h_style))
story.append(Paragraph(
    "Confirm the report is complete and ready to send.",
    prompt_style,
))
story.append(Preformatted(
    "QC completed by:   <tester name>\n"
    "Date completed:    YYYY-MM-DD\n"
    "Total findings:    <N total — Nb BLOCKER, Nm MAJOR, Nmi MINOR, Nc COSMETIC>\n"
    "Sent via Hive to:  Sean",
    placeholder_style,
))

# ── Closing note ───────────────────────────────────────────────────────
story.append(Paragraph(
    "<b>One reminder:</b> the goal of the QC is not to prove the app is broken — "
    "it is to give the team a complete, actionable picture so the right things get "
    "prioritized. A QC report that lists zero findings is a valuable QC report. "
    "Capture what is there honestly; do not pad and do not omit.",
    note_style,
))

doc.build(story)
print(f"PDF written to: {OUT_PATH}")
