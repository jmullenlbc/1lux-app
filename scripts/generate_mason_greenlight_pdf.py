"""Generate the Mason green-light PDF — very short, single-purpose.

Answers exactly one question: why is the conceptual budget tool ready
for Mason to use right now?
"""

from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)
from reportlab.lib.enums import TA_LEFT

OUT_PATH = Path.home() / "Desktop" / "mason_greenlight.pdf"

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'TitleStyle', parent=styles['Title'], fontSize=22,
    textColor=HexColor('#0f172a'), spaceAfter=2, alignment=TA_LEFT,
)
date_style = ParagraphStyle(
    'Date', parent=styles['Normal'], fontSize=10,
    textColor=HexColor('#64748b'), spaceAfter=14, alignment=TA_LEFT,
)
verdict_style = ParagraphStyle(
    'Verdict', parent=styles['Normal'], fontSize=15, fontName='Helvetica-Bold',
    textColor=HexColor('#15803d'),
    backColor=HexColor('#dcfce7'),
    borderColor=HexColor('#86efac'), borderWidth=0.5, borderPadding=12,
    leading=20, spaceBefore=4, spaceAfter=18, leftIndent=2, rightIndent=2,
)
h1_style = ParagraphStyle(
    'H1', parent=styles['Heading1'], fontSize=13,
    textColor=HexColor('#0f172a'), spaceBefore=12, spaceAfter=6,
)
body_style = ParagraphStyle(
    'Body', parent=styles['BodyText'], fontSize=11,
    textColor=HexColor('#1e293b'), leading=15, spaceAfter=6,
)

def styled_table(data, col_widths, totals_row=None):
    t = Table(data, colWidths=col_widths)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1e293b')),
        ('TEXTCOLOR',  (0, 0), (-1, 0), HexColor('#ffffff')),
        ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0, 0), (-1, -1), 10.5),
        ('VALIGN',     (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.4, HexColor('#e2e8f0')),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0, i), (-1, i), HexColor('#f8fafc')))
    if totals_row is not None:
        style.append(('BACKGROUND', (0, totals_row), (-1, totals_row), HexColor('#dcfce7')))
        style.append(('FONTNAME', (0, totals_row), (-1, totals_row), 'Helvetica-Bold'))
    t.setStyle(TableStyle(style))
    return t

doc = SimpleDocTemplate(
    str(OUT_PATH), pagesize=letter,
    topMargin=0.6 * inch, bottomMargin=0.6 * inch,
    leftMargin=0.8 * inch, rightMargin=0.8 * inch,
    title="Conceptual Budget Tool — Ready for Mason",
    author="ILC Studios",
)

story = []

# ── Header ────────────────────────────────────────────────────────────
story.append(Paragraph("Conceptual Budget Tool — Ready for Mason", title_style))
story.append(Paragraph("Tester: ILC &nbsp;·&nbsp; Date: 2026-06-22", date_style))

# ── Verdict ──────────────────────────────────────────────────────────
story.append(Paragraph(
    "Mason can start using the conceptual budget tool today. The engine is calibrated; the math is trustworthy.",
    verdict_style,
))

# ── The proof ────────────────────────────────────────────────────────
story.append(Paragraph("The proof", h1_style))
story.append(Paragraph(
    "We re-ran a known project (\"The Approach\") from scratch in the live tool today and compared the result "
    "to the source spreadsheet:",
    body_style,
))
story.append(styled_table([
    ['',                                          'Total',         'Delta vs sheet'],
    ['Source spreadsheet',                        '$512,883',      '—'],
    ["Tool re-run (THE APPROACH (QC), today)",          '$501,034',      '-2.3%'],
], col_widths=[3.6 * inch, 1.5 * inch, 2.0 * inch], totals_row=2))
story.append(Spacer(1, 8))
story.append(Paragraph(
    "2.3% off on a half-million-dollar conceptual estimate is well inside acceptable tolerance for this stage. "
    "Mike's earlier re-run of the same project landed within 2.5% on his end — consistent result.",
    body_style,
))

# ── Why we trust it ──────────────────────────────────────────────────
story.append(Paragraph("Why we trust it", h1_style))
story.append(Paragraph(
    "<b>Four sections matched the spreadsheet exactly</b> (BOH / Core+Shell, Interior Amenities, "
    "Corridors &amp; Stairwells, Controls / IECC 2021). The remaining sections came within a few "
    "percent each — small, explainable, and not biased high or low in any pattern that would mislead a client.",
    body_style,
))
story.append(Paragraph(
    "<b>The pricing wired into the tool is the master pricing sheet you maintain.</b> When you "
    "update prices, the tool follows. There is no longer a place where hardcoded numbers diverge from "
    "the source of truth.",
    body_style,
))

# ── Guardrails ───────────────────────────────────────────────────────
story.append(Paragraph("Two guardrails are in place", h1_style))
story.append(Paragraph(
    "<b>1. Missing-inputs warning.</b> If Mason starts a project and leaves any critical Project Data "
    "field blank (e.g., Exterior Amenity SF, Lot Size SF, # Vanities), an amber banner appears on the "
    "Summary page telling him exactly which fields are missing and which sections they affect. This is "
    "the only way the tool can produce a meaningfully wrong number, and it now warns visibly before that happens.",
    body_style,
))
story.append(Paragraph(
    "<b>2. Save protection.</b> Whatever Mason enters today stays entered. If he reopens a project later "
    "to tweak one field, the rest of his data is preserved — the tool no longer overwrites saved values "
    "with blanks from a partially-loaded form.",
    body_style,
))

# ── How Mason should use it ──────────────────────────────────────────
story.append(Paragraph("How Mason should use it", h1_style))
story.append(Paragraph(
    "Create a new project, fill in every Project Data field that applies (the warning banner will tell him "
    "if he missed any critical ones), step through the wizard, and click View Summary. If the missing-inputs "
    "warning is gone and the numbers look reasonable, the budget is ready to send.",
    body_style,
))

doc.build(story)
print(f"PDF written to: {OUT_PATH}")
