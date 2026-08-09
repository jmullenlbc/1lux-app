"""Generate the streamlined QC report PDF for Mike.

One-off script. Mike does not read, so the report is minimal: bullets,
tables, verdict-first, no prose. Two pages max.

Output saved directly to Mike's Google Drive QC folder.
"""

from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)
from reportlab.lib.enums import TA_LEFT

# Save directly to Mike's QC folder. Per his naming convention:
# YY.MM.DD descriptive_name.pdf
OUT_PATH = Path("H:/Shared drives/SOFTWARE/_MIKE's APP/QC_QA/26.06.22 conceptual_budget_engine_qc.pdf")

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'TitleStyle', parent=styles['Title'], fontSize=22,
    textColor=HexColor('#0f172a'), spaceAfter=2, alignment=TA_LEFT,
)
verdict_style = ParagraphStyle(
    'Verdict', parent=styles['Normal'], fontSize=14, fontName='Helvetica-Bold',
    textColor=HexColor('#15803d'),
    backColor=HexColor('#dcfce7'),
    borderColor=HexColor('#86efac'), borderWidth=0.5, borderPadding=10,
    leading=18, spaceBefore=10, spaceAfter=16, leftIndent=2, rightIndent=2,
)
h1_style = ParagraphStyle(
    'H1', parent=styles['Heading1'], fontSize=13,
    textColor=HexColor('#0f172a'), spaceBefore=14, spaceAfter=6,
)
body_style = ParagraphStyle(
    'Body', parent=styles['BodyText'], fontSize=10.5,
    textColor=HexColor('#1e293b'), leading=14, spaceAfter=6,
)
date_style = ParagraphStyle(
    'Date', parent=styles['Normal'], fontSize=10,
    textColor=HexColor('#64748b'), spaceAfter=14, alignment=TA_LEFT,
)

def styled_table(data, col_widths, totals_row=None, highlight_color='#dcfce7'):
    t = Table(data, colWidths=col_widths)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1e293b')),
        ('TEXTCOLOR',  (0, 0), (-1, 0), HexColor('#ffffff')),
        ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0, 0), (-1, -1), 10),
        ('VALIGN',     (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.4, HexColor('#e2e8f0')),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0, i), (-1, i), HexColor('#f8fafc')))
    if totals_row is not None:
        style.append(('BACKGROUND', (0, totals_row), (-1, totals_row), HexColor(highlight_color)))
        style.append(('FONTNAME', (0, totals_row), (-1, totals_row), 'Helvetica-Bold'))
    t.setStyle(TableStyle(style))
    return t

doc = SimpleDocTemplate(
    str(OUT_PATH), pagesize=letter,
    topMargin=0.55 * inch, bottomMargin=0.55 * inch,
    leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    title="Conceptual Budget Engine QC",
    author="ILC Studios",
)

story = []

# ── Header ────────────────────────────────────────────────────────────
story.append(Paragraph("Conceptual Budget Engine QC", title_style))
story.append(Paragraph("Tester: ILC &nbsp;·&nbsp; Date: 2026-06-22 &nbsp;·&nbsp; Vehicle: The Approach (recreated as THE APPROACH (QC))", date_style))

# ── Verdict ──────────────────────────────────────────────────────────
story.append(Paragraph(
    "VERDICT: ENGINE CONFIRMED. Mason can start this week.",
    verdict_style,
))

# ── Headline numbers ─────────────────────────────────────────────────
story.append(Paragraph("Headline numbers", h1_style))
story.append(styled_table([
    ['',                                  'Total',         'Delta vs sheet'],
    ['Source spreadsheet (The Approach)', '$512,883',      '—'],
    ['Your run last month',               '$500,118',      '-2.5%'],
    ["THE APPROACH (QC) — re-run today", '$501,034',      '-2.3%'],
], col_widths=[3.4 * inch, 1.6 * inch, 2.0 * inch], totals_row=3))
story.append(Spacer(1, 4))
story.append(Paragraph(
    "Engine validated to within 2.3% of the source spreadsheet. Mason can go.",
    body_style,
))

# ── Bugs caught + fixed today ────────────────────────────────────────
story.append(Paragraph("Bugs caught and fixed today", h1_style))
story.append(styled_table([
    ['Bug',                                                            'Fix shipped'],
    ['SUPER_ADMIN users couldn\'t see projects (hardcoded ILC_ADMIN check)', 'f384f5d'],
    ['Wizard silently wiped saved fields on Save & Continue',          '896ded1'],
    ['"Gross Interior SF" label was misleading (meant Total Gross)',   'e39afcf'],
    ['exterior.landscapeBudget engine reference orphaned',             'e39afcf'],
    ['No way to surface which Project Data fields silently zero a section', 'ed65f70'],
    ['Couldn\'t cleanly export a project\'s full state for QC',         'f6dfacd'],
    ['Couldn\'t delete bug reports from the QC board',                  'c80ff25'],
], col_widths=[5.0 * inch, 2.0 * inch]))

# ── Items for Mike's call ────────────────────────────────────────────
story.append(Paragraph("Three items for your call (when convenient)", h1_style))
story.append(styled_table([
    ['#', 'Item',                          'Magnitude',  'Decision needed'],
    ['1', 'Exit signs pricing rate',       '~$926',      'Master pricing uses $0.025/SF; sheet uses ~$0.03/SF. Which is right?'],
    ['2', 'designUpgrades wiring',         '~$5,800',    'entryway12inch, boilerRoomDisk, etc. exist in pricing but aren\'t added to conceptual totals. Wire them in?'],
    ['3', 'Long-term wizard refactor',     '—',          'The server-side guard prevents the worst, but the wizard\'s forms should track dirty fields and only PATCH changed ones. Queued for Manny as his first real task.'],
], col_widths=[0.3 * inch, 2.0 * inch, 0.9 * inch, 3.8 * inch]))

# ── Page 2 ───────────────────────────────────────────────────────────
story.append(PageBreak())

# ── Section-by-section ───────────────────────────────────────────────
story.append(Paragraph("Section-by-section (re-run vs sheet)", h1_style))
story.append(styled_table([
    ['Section',                'Sheet',      'App',        'Δ'],
    ['Residential Units',      '$171,414',   '$165,609',   '-3.4%'],
    ['Corridors & Stairwells', '$28,196',    '$28,196',    'EXACT'],
    ['BOH / Core + Shell',     '$9,061',     '$9,061',     'EXACT'],
    ['Interior Amenities',     '$69,860',    '$69,860',    'EXACT'],
    ['Enclosed Garage',        '$0',         '$0',         '—'],
    ['Exterior & Site',        '$145,713',   '$141,573',   '-2.8%'],
    ['Emergency Lighting',     '$0',         '$0',         '—'],
    ['Exit Signs',             '$5,555',     '$4,629',     '-16.7%'],
    ['Controls (IECC 2021)',   '$40,736',    '$40,736',    'EXACT'],
    ['TOTAL w/ Controls',      '$512,883',   '$501,034',   '-2.3%'],
], col_widths=[2.8 * inch, 1.3 * inch, 1.3 * inch, 1.0 * inch], totals_row=10))

# ── What changed in the platform today ───────────────────────────────
story.append(Paragraph("What's new in the app today", h1_style))
story.append(styled_table([
    ['Feature',                                                                           'Where to find it'],
    ['"Copy as JSON" button on every project (admin only)',                              'Top of breadcrumb on any project page'],
    ['"Missing inputs" warning when Project Data fields are blank',                       'Project Overview tab + Summary page'],
    ['Server-side guard against silent wizard data-wipe',                                 'Server-side, no UI'],
    ['SUPER_ADMIN role correctly grants visibility to projects/clients',                  'Affects any future super admins'],
    ['Native Delete button for bug reports',                                              'Drawer on /admin/tasks bug card'],
], col_widths=[4.8 * inch, 2.2 * inch]))

# ── Footer ────────────────────────────────────────────────────────────
story.append(Spacer(1, 16))
story.append(Paragraph(
    "<font color='#94a3b8'>Full commit log + raw QC data available on request. Detail walkthrough on Hive if needed.</font>",
    body_style,
))

doc.build(story)
print(f"PDF written to: {OUT_PATH}")
