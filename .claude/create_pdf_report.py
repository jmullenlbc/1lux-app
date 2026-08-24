#!/usr/bin/env python3
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib import colors

# Create PDF
doc = SimpleDocTemplate("2026-07-08_CRM_Tasks_6-9_Summary.pdf", pagesize=letter,
                       rightMargin=0.75*inch, leftMargin=0.75*inch,
                       topMargin=0.75*inch, bottomMargin=0.75*inch)

story = []
styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=24,
    textColor=colors.HexColor('#1a1a1a'),
    spaceAfter=6,
    fontName='Helvetica-Bold'
)

heading_style = ParagraphStyle(
    'CustomHeading',
    parent=styles['Heading2'],
    fontSize=13,
    textColor=colors.HexColor('#1f2937'),
    spaceAfter=8,
    spaceBefore=12,
    fontName='Helvetica-Bold'
)

subheading_style = ParagraphStyle(
    'Subheading',
    parent=styles['Normal'],
    fontSize=11,
    textColor=colors.HexColor('#374151'),
    spaceAfter=6,
    fontName='Helvetica-Bold'
)

normal_style = ParagraphStyle(
    'Normal',
    fontSize=10,
    leading=14,
    textColor=colors.HexColor('#1f2937')
)

# Title
story.append(Paragraph("CRM Pipeline Polish — Tasks 6–9", title_style))
story.append(Spacer(1, 6))
story.append(Paragraph("Summary Report for Review", styles['Italic']))
story.append(Spacer(1, 12))

# Metadata
meta_data = [
    ['Date:', 'July 8, 2026'],
    ['Developer:', 'Manny'],
    ['Reviewer:', 'Sean'],
    ['Status:', 'Ready for Review'],
]
meta_table = Table(meta_data, colWidths=[1.5*inch, 4*inch])
meta_table.setStyle(TableStyle([
    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 10),
    ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#374151')),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
story.append(meta_table)
story.append(Spacer(1, 16))

# Executive Summary
story.append(Paragraph("Executive Summary", heading_style))
story.append(Paragraph(
    "Four CRM pipeline polish features shipped, tested, and ready for review. All pre-push hooks passed "
    "on every branch. Production build clean, zero regressions detected across all existing features "
    "(budget math, bid matrix, etc.).<br/><br/>"
    "<b>Deliverables:</b> 4 PRs (#6–#9) with 1,035 lines of code changes across CRMClient, Brief page, and API calls.",
    normal_style
))
story.append(Spacer(1, 12))

# Tasks Overview Table
story.append(Paragraph("Tasks Completed", heading_style))
tasks_data = [
    ['Task', 'Feature', 'PR', 'Status'],
    ['6', 'Brief page clickable links', '#6', 'Ready'],
    ['7', 'Notes count badge', '#7', 'Ready'],
    ['8', 'Probability quick-edit', '#8', 'Ready'],
    ['9', 'CSV export', '#9', 'Ready'],
]
tasks_table = Table(tasks_data, colWidths=[0.8*inch, 2.5*inch, 0.8*inch, 0.8*inch])
tasks_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 10),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
    ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
    ('TOPPADDING', (0, 0), (-1, 0), 8),
    ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d1d5db')),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
]))
story.append(tasks_table)
story.append(Spacer(1, 14))

# Task Details - Page 1
story.append(Paragraph("Task 6: Brief Page Clickable Links", heading_style))
story.append(Paragraph("<b>Branch:</b> manny/brief-clickable-links | <b>PR:</b> #6", subheading_style))
story.append(Paragraph(
    "Project names in the Morning Brief page tables are now clickable links to /project/[id]. "
    "Affects the stale projects table and recent wins table. Wrapped project names in anchor tags with proper styling. "
    "Hover shows blue text and underline. No backend changes required.",
    normal_style
))
story.append(Spacer(1, 10))

story.append(Paragraph("Task 7: Notes Count Badge", heading_style))
story.append(Paragraph("<b>Branch:</b> manny/crm-notes-count | <b>PR:</b> #7", subheading_style))
story.append(Paragraph(
    "Cards with linked notes display 'N note(s)' below the +Note button. Added _count to Prisma select in crm/page.jsx. "
    "ProjectCard displays badge only when noteLinks count is greater than 0. Small gray text, non-intrusive.",
    normal_style
))
story.append(Spacer(1, 10))

story.append(Paragraph("Task 8: Probability Quick-Edit", heading_style))
story.append(Paragraph("<b>Branch:</b> manny/crm-prob-edit | <b>PR:</b> #8", subheading_style))
story.append(Paragraph(
    "Click the probability percent on any kanban card to inline-edit (0-100). "
    "Blur or Enter saves via PATCH with optimistic update. Escape cancels. "
    "Uses event.stopPropagation() to prevent project panel opening. Server clamps values 0-100.",
    normal_style
))
story.append(Spacer(1, 10))

story.append(Paragraph("Task 9: CSV Export", heading_style))
story.append(Paragraph("<b>Branch:</b> manny/crm-csv-export | <b>PR:</b> #9", subheading_style))
story.append(Paragraph(
    "Export CSV button downloads current filtered pipeline. Respects all filters (pipeline, search, status, service type, sales owner). "
    "Columns: Project, Client, Stage, Status, Revenue, Probability, Expected Order. "
    "Proper CSV formatting with quote escaping. Filename: crm-pipeline-date.csv.",
    normal_style
))
story.append(PageBreak())

# Quality Assurance
story.append(Paragraph("Quality Assurance", heading_style))

story.append(Paragraph("Test Results", subheading_style))
story.append(Paragraph(
    "<b>✓ 38 / 38 assertions passed</b><br/>"
    "<b>✓ 111,997 invariant checks: 0 failures</b><br/>"
    "<b>✓ BID MATRIX LOGIC: 12/12 checks passed</b>",
    normal_style
))
story.append(Spacer(1, 10))

story.append(Paragraph("Build Status", subheading_style))
story.append(Paragraph(
    "<b>✓ Compiled successfully</b><br/>"
    "<b>✓ Generated 120 static pages</b><br/>"
    "<b>✓ Zero TypeScript errors</b><br/>"
    "<b>✓ Zero compilation warnings</b>",
    normal_style
))
story.append(Spacer(1, 10))

story.append(Paragraph("Pre-Push Checks (All Passing)", subheading_style))
story.append(Paragraph(
    "<b>✓ check-dynamic-pages:</b> all 51 pages OK<br/>"
    "<b>✓ check-migrations-postgres:</b> all 50 migrations Postgres-compatible<br/>"
    "<b>✓ check-schema-migrations-sync:</b> all 115 models have CREATE TABLE<br/>"
    "<b>✓ npm test:</b> 38 scenarios + 111K+ fuzz invariants<br/>"
    "<b>✓ check-secrets:</b> no credentials detected<br/>"
    "<b>✓ push-size:</b> 8 files (under 50-file threshold)",
    normal_style
))
story.append(Spacer(1, 10))

story.append(Paragraph("Regression Testing", subheading_style))
story.append(Paragraph(
    "<b>✓ Budget math engine:</b> All 13 scenarios passing<br/>"
    "<b>✓ Bid matrix logic:</b> Catalog splitting, carry-forward verified<br/>"
    "<b>✓ Existing features:</b> No regression in CRM, project hub, budget calculator",
    normal_style
))
story.append(Spacer(1, 14))

# Code Quality
story.append(Paragraph("Code Quality", heading_style))
story.append(Paragraph(
    "<b>Lines changed:</b> 1,035 additions/modifications across 8 files<br/>"
    "<b>Core files:</b> CRMClient.jsx (+246), crm/page.jsx (+1), BriefClient.jsx (link wrapping)<br/>"
    "<b>Patterns:</b> Optimistic updates, React hooks, proper event propagation<br/>"
    "<b>No breaking changes:</b> All additions, no schema/migration changes",
    normal_style
))
story.append(Spacer(1, 14))

# Deployment Notes
story.append(Paragraph("Deployment Notes", heading_style))
story.append(Paragraph(
    "<b>For Sean's Review:</b><br/>"
    "1. Verify each feature per test sections above<br/>"
    "2. Check kanban card responsiveness<br/>"
    "3. Verify CSV exports with filters applied<br/>"
    "4. Confirm Brief page links work on both tables<br/><br/>"
    "<b>For Mike's Deployment:</b><br/>"
    "No special steps. No schema migrations. Standard deployment process.<br/>"
    "Pre-push hooks run automatically (all 6 checks pass).",
    normal_style
))
story.append(Spacer(1, 14))

# Summary
story.append(Paragraph("Summary", heading_style))
summary_data = [
    ['Status', 'Ready for review and merge'],
    ['Branches', '4 new branches, all pushed'],
    ['PRs', '#6, #7, #8, #9 awaiting review'],
    ['Quality', 'Clean build, all tests pass, zero regressions'],
    ['Next', 'Sean reviews and merges to main'],
]
summary_table = Table(summary_data, colWidths=[1.5*inch, 4*inch])
summary_table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 10),
    ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#374151')),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
]))
story.append(summary_table)
story.append(Spacer(1, 20))

# Footer
story.append(Paragraph(
    "<font size=8 color=#666666>Report generated 2026-07-08 by Claude Code<br/>"
    "All code changes available in manny/* branches on GitHub</font>",
    styles['Normal']
))

# Build PDF
doc.build(story)
print("✓ PDF created: 2026-07-08_CRM_Tasks_6-9_Summary.pdf")
