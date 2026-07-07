"""Generate Manny's session orientation PDF — Tasks 10–13 (presented as 1–4).

This PDF is primarily read by Claude Code at the start of Manny's session.
Run: python scripts/generate_manny_tasks6to9_pdf.py
Requires: pip install reportlab
"""

from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Preformatted, PageBreak, Table, TableStyle,
    HRFlowable,
)
from reportlab.lib.enums import TA_LEFT

OUT_PATH = Path.home() / "Desktop" / "manny_ilc_guide.pdf"

# ── Colour palette ──────────────────────────────────────────────────────────
INK      = HexColor('#0f172a')
STEEL    = HexColor('#334155')
MUTED    = HexColor('#64748b')
BORDER   = HexColor('#e2e8f0')
LIGHT    = HexColor('#f8fafc')
CODE_BG  = HexColor('#f1f5f9')
AMBER    = HexColor('#92400e')
AMBER_BG = HexColor('#fffbeb')
AMBER_BR = HexColor('#fcd34d')
GREEN    = HexColor('#14532d')
GREEN_BG = HexColor('#f0fdf4')
GREEN_BR = HexColor('#bbf7d0')
ORANGE   = HexColor('#ea580c')
BLUE     = HexColor('#1e3a5f')
BLUE_BG  = HexColor('#eff6ff')
BLUE_BR  = HexColor('#bfdbfe')

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'T', parent=styles['Title'], fontSize=24,
    textColor=INK, spaceAfter=4, alignment=TA_LEFT,
)
subtitle_style = ParagraphStyle(
    'Sub', parent=styles['Normal'], fontSize=11,
    textColor=MUTED, spaceAfter=16, alignment=TA_LEFT, leading=15,
)
section_label_style = ParagraphStyle(
    'SLabel', parent=styles['Normal'], fontSize=9,
    textColor=ORANGE, spaceAfter=2, alignment=TA_LEFT,
    fontName='Helvetica-Bold', spaceBefore=18,
)
h1_style = ParagraphStyle(
    'H1', parent=styles['Heading1'], fontSize=16,
    textColor=INK, spaceBefore=4, spaceAfter=6,
)
h2_style = ParagraphStyle(
    'H2', parent=styles['Heading2'], fontSize=11.5,
    textColor=STEEL, spaceBefore=10, spaceAfter=4,
)
body_style = ParagraphStyle(
    'B', parent=styles['BodyText'], fontSize=10.5,
    textColor=INK, leading=15, spaceAfter=6,
)
code_style = ParagraphStyle(
    'C', parent=styles['Code'], fontName='Courier', fontSize=8.5,
    textColor=INK, backColor=CODE_BG,
    borderColor=BORDER, borderWidth=0.5, borderPadding=7,
    leading=12, spaceAfter=10, leftIndent=4, rightIndent=4,
)
warn_style = ParagraphStyle(
    'W', parent=body_style, textColor=AMBER,
    backColor=AMBER_BG, borderColor=AMBER_BR,
    borderWidth=0.5, borderPadding=8, leftIndent=4, rightIndent=4, spaceAfter=10,
)
ok_style = ParagraphStyle(
    'OK', parent=body_style, textColor=GREEN,
    backColor=GREEN_BG, borderColor=GREEN_BR,
    borderWidth=0.5, borderPadding=8, leftIndent=4, rightIndent=4, spaceAfter=10,
)
claude_style = ParagraphStyle(
    'CL', parent=body_style, textColor=BLUE,
    backColor=BLUE_BG, borderColor=BLUE_BR,
    borderWidth=0.5, borderPadding=10, leftIndent=4, rightIndent=4, spaceAfter=12,
    fontSize=11, leading=16,
)

def styled_table(data, col_widths):
    t = Table(data, colWidths=col_widths)
    s = [
        ('BACKGROUND', (0, 0), (-1, 0), INK),
        ('TEXTCOLOR',  (0, 0), (-1, 0), HexColor('#ffffff')),
        ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0, 0), (-1, -1), 9),
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',(0, 0), (-1, -1), 7),
        ('RIGHTPADDING',(0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID',       (0, 0), (-1, -1), 0.4, BORDER),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            s.append(('BACKGROUND', (0, i), (-1, i), LIGHT))
    t.setStyle(TableStyle(s))
    return t

doc = SimpleDocTemplate(
    str(OUT_PATH), pagesize=letter,
    topMargin=0.65 * inch, bottomMargin=0.65 * inch,
    leftMargin=0.85 * inch, rightMargin=0.85 * inch,
    title="Manny — ILC Guide",
    author="Sean / ILC Studios",
)

story = []

# ══════════════════════════════════════════════════════════════════════════════
# PAGE 1 — ORIENTATION
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("ILC Lighting App", title_style))
story.append(Paragraph(
    "Session orientation for Manuel San Ramon · July 2026",
    subtitle_style,
))

story.append(HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=14))

# Instruction block for Claude
story.append(Paragraph(
    "<b>TO CLAUDE CODE:</b> You have been given this PDF to orient yourself for Manny's session. "
    "Read everything on pages 1–2, then the task specs that follow. "
    "Greet Manny by name, confirm you understand the project and current tasks by mentioning "
    "one or two specifics, tell him Task 1 (clickable links in the Brief page) is the warmup "
    "and what the very first step is. Warm tone, short sentences — he wants to be in motion. "
    "End with: \"Ready to branch and start, or do you want to talk through anything first?\"",
    claude_style,
))

# The project
story.append(Paragraph("THE PROJECT", section_label_style))
story.append(Paragraph(
    "Internal tool for ILC Studios (lighting consultancy). Produces conceptual and design budgets, "
    "manages projects, and runs a CRM pipeline. Live at "
    "<font face='Courier'>https://app.ilcstudios.com</font>, auto-deploys from "
    "<font face='Courier'>main</font> via AWS Amplify.",
    body_style,
))
story.append(Paragraph(
    "Stack: Next.js 14 App Router, Tailwind CSS, Prisma 5.22 (SQLite locally / PostgreSQL in prod), "
    "JWT auth, Amplify SSR.",
    body_style,
))

# The team
story.append(Paragraph("THE TEAM", section_label_style))
story.append(styled_table([
    ['Name',          'Role'],
    ['Mike Kershner', 'Founder and lead dev. Pushes directly to main.'],
    ['Sean McCauley',  "Manny's reviewer. Merges all Manny's PRs."],
    ['Manny (you)',    'Part-time dev ~10 hr/week. Always works on manny/* branches.'],
], col_widths=[1.5*inch, 5.3*inch]))

# Mandatory workflow
story.append(Paragraph("MANNY'S MANDATORY WORKFLOW — EVERY SESSION", section_label_style))
story.append(styled_table([
    ['Step', 'Command / Action'],
    ['1', 'git pull  (always first — never skip)'],
    ['2', 'git checkout -b manny/<short-description>'],
    ['3', 'Edit code, test with npm run dev:3000, iterate'],
    ['4', 'git commit, then git push  (pre-push hooks run ~25 sec — never use --no-verify)'],
    ['5', 'gh pr create, then ping Sean to review. Never push to main directly.'],
], col_widths=[0.4*inch, 6.4*inch]))

# Pre-push hooks
story.append(Paragraph("PRE-PUSH HOOKS (NEVER BYPASS)", section_label_style))
story.append(Paragraph(
    "Six checks run automatically on every push: dynamic-pages, postgres-migrations, "
    "schema-sync, <font face='Courier'>npm test</font> (38 scenarios + 112K fuzz), "
    "check-secrets, push-size. If one fails, fix the underlying issue — "
    "<b>never use <font face='Courier'>--no-verify</font></b>.",
    warn_style,
))

# Critical rules
story.append(Paragraph("CRITICAL RULES", section_label_style))
story.append(styled_table([
    ['Rule', 'Detail'],
    ['force-dynamic on every page',
     "Every file under src/app/(app)/ must export: export const dynamic = 'force-dynamic'  "
     "Without it the page crashes in production."],
    ['schema.prisma stays sqlite',
     'provider = "sqlite" must never be changed — Amplify patches it to postgresql at build time.'],
    ['Leave the budget engine alone',
     'src/lib/calculations.js is validated. Do not touch unless a task explicitly says to.'],
    ['Auth on every API route',
     'Every route handler starts with: const { user, error } = await requireAuth(request)'],
], col_widths=[1.7*inch, 5.1*inch]))

# Local dev
story.append(Paragraph("LOCAL DEV LOGIN", section_label_style))
story.append(Preformatted(
    "npm run dev:3000\n"
    "\n"
    "Email:    admin@ilcstudios.com\n"
    "Password: ILCadmin2024!",
    code_style,
))

# Current state
story.append(Paragraph("CURRENT STATE (as of 2026-07-07)", section_label_style))
story.append(Paragraph(
    "Tasks 1–9 from the last two sprints all merged to main. "
    "Now on Tasks 1–4 in this document — all CRM polish, pure frontend. "
    "No schema changes, no engine changes.",
    ok_style,
))

# Key files
story.append(Paragraph("KEY FILES FOR THIS SPRINT", section_label_style))
story.append(styled_table([
    ['File', 'Purpose'],
    ['src/app/(app)/crm/brief/BriefClient.jsx', 'Task 1 — add clickable project name links'],
    ['src/app/(app)/crm/page.jsx',              'Task 2 — add _count to the Prisma select'],
    ['src/app/(app)/crm/CRMClient.jsx',         'Tasks 2, 3, 4 — notes badge, prob edit, CSV export'],
    ['src/app/api/projects/[id]/route.js',      'Task 3 — PATCH endpoint (already accepts pipelineProbability)'],
], col_widths=[3.2*inch, 3.6*inch]))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TASK OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Tasks 1–4 overview", h1_style))
story.append(Paragraph(
    "All four tasks are CRM polish. No schema changes, no engine changes. "
    "Work in order: 1 → 2 → 3 → 4. Tasks 1 and 2 are quick warmups (~30 min and ~1.5 hrs).",
    body_style,
))

story.append(styled_table([
    ['Task', 'Branch', 'File(s)', 'Effort'],
    ['1 — Brief page clickable links',
     'manny/brief-clickable-links',
     'BriefClient.jsx',
     '~30 min'],
    ['2 — Notes count badge',
     'manny/crm-notes-count',
     'crm/page.jsx + CRMClient.jsx',
     '~1.5 hr'],
    ['3 — Probability quick-edit',
     'manny/crm-prob-edit',
     'CRMClient.jsx',
     '~2-3 hr'],
    ['4 — CSV export',
     'manny/crm-csv-export',
     'CRMClient.jsx',
     '~2 hr'],
], col_widths=[2.0*inch, 2.1*inch, 1.9*inch, 0.8*inch]))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TASK 1
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Task 1 — Brief page: clickable project names", h1_style))
story.append(Paragraph(
    "Branch: <font face='Courier'>manny/brief-clickable-links</font> | "
    "File: <font face='Courier'>src/app/(app)/crm/brief/BriefClient.jsx</font> | ~30 min",
    subtitle_style,
))
story.append(Paragraph(
    "The Morning Brief page shows stale projects and recent wins as tables, "
    "but project names are plain text. Mike can't click through. "
    "One-line change per table makes the page actionable.",
    body_style,
))

story.append(Paragraph("What to change", h2_style))
story.append(Paragraph(
    "1. In the <b>stale projects table</b> (the <font face='Courier'>stale.map</font> block), "
    "find the <font face='Courier'>&lt;td&gt;</font> that renders "
    "<font face='Courier'>{p.name}</font> and wrap it:",
    body_style,
))
story.append(Preformatted(
    '<a\n'
    '  href={`/project/${p.id}`}\n'
    '  className="font-semibold text-slate-900 hover:text-blue-600 underline"\n'
    '>\n'
    '  {p.name}\n'
    '</a>',
    code_style,
))
story.append(Paragraph(
    "2. Apply the same link pattern to <b>project names in the recent wins section</b>.",
    body_style,
))
story.append(Paragraph(
    "The <font face='Courier'>id</font> field is already in the Prisma select in "
    "<font face='Courier'>brief/page.jsx</font> — no server changes needed.",
    body_style,
))

story.append(Paragraph("Acceptance criteria", h2_style))
story.append(Paragraph(
    "* Clicking a project name in the stale table navigates to /project/[id].<br/>"
    "* Same for the recent wins section.<br/>"
    "* No other changes to the page. Pre-push hooks pass.",
    body_style,
))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TASK 2
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Task 2 — Notes count badge on ProjectCard", h1_style))
story.append(Paragraph(
    "Branch: <font face='Courier'>manny/crm-notes-count</font> | "
    "Files: <font face='Courier'>crm/page.jsx</font> + "
    "<font face='Courier'>CRMClient.jsx</font> | ~1.5 hours",
    subtitle_style,
))
story.append(Paragraph(
    "The last sprint added a '+ Note' button on each kanban card (Task 4). "
    "There's no way to tell at a glance if a project already has notes. "
    "A small count badge closes the loop.",
    body_style,
))

story.append(Paragraph("Step 1 — add _count to crm/page.jsx", h2_style))
story.append(Paragraph(
    "Inside the <font face='Courier'>prisma.project.findMany({{ select: {{ ... }} }})</font> block, "
    "add one line:",
    body_style,
))
story.append(Preformatted(
    "_count: { select: { noteLinks: true } },",
    code_style,
))
story.append(Paragraph(
    "<font face='Courier'>noteLinks</font> is the relation name on Project "
    "(declared as <font face='Courier'>noteLinks NoteProject[] @relation(\"ProjectNoteLinks\")</font> "
    "in schema.prisma). Each count is the number of notes linked to the project.",
    body_style,
))

story.append(Paragraph("Step 2 — show the count in ProjectCard (CRMClient.jsx)", h2_style))
story.append(Paragraph(
    "Find the <font face='Courier'>ProjectCard</font> function (search for "
    "<font face='Courier'>// ── Project Card</font>). "
    "After the <font face='Courier'>{{!noteOpen ? ... &lt;NoteInput&gt;}}</font> block "
    "at the bottom of the return, add:",
    body_style,
))
story.append(Preformatted(
    "{(project._count?.noteLinks ?? 0) > 0 && (\n"
    "  <p className=\"text-[10px] text-slate-400 mt-0.5 select-none\">\n"
    "    {project._count.noteLinks} note{project._count.noteLinks !== 1 ? 's' : ''}\n"
    "  </p>\n"
    ")}",
    code_style,
))

story.append(Paragraph("Acceptance criteria", h2_style))
story.append(Paragraph(
    "* Cards with existing notes show \"N notes\" below the '+ Note' button.<br/>"
    "* Cards with zero notes show nothing extra.<br/>"
    "* No API changes, no schema changes. Pre-push hooks pass.",
    body_style,
))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TASK 3
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Task 3 — Probability quick-edit on ProjectCard", h1_style))
story.append(Paragraph(
    "Branch: <font face='Courier'>manny/crm-prob-edit</font> | "
    "File: <font face='Courier'>src/app/(app)/crm/CRMClient.jsx</font> | ~2–3 hours",
    subtitle_style,
))
story.append(Paragraph(
    "The probability bar and percentage on each card are display-only. "
    "Editing requires navigating into the project. "
    "Click-to-edit on the card saves three clicks.",
    body_style,
))

story.append(Paragraph("Architecture — read before writing", h2_style))
story.append(Paragraph(
    "* <font face='Courier'>projects</font> state and <font face='Courier'>setProjects</font> "
    "live in <font face='Courier'>CRMClient</font> (~line 363).<br/>"
    "* <font face='Courier'>ProjectCard</font> receives <font face='Courier'>project</font> "
    "as a prop — it cannot update parent state without a callback.<br/>"
    "* <font face='Courier'>handleDrop</font> already shows the optimistic-update pattern: "
    "call <font face='Courier'>setProjects</font> immediately, then fire the PATCH.<br/>"
    "* API: <font face='Courier'>PATCH /api/projects/[id]</font> already accepts "
    "<font face='Courier'>pipelineProbability</font> and clamps it to 0–100 server-side.",
    body_style,
))

story.append(Paragraph("Step 1 — add handleProbabilityChange to CRMClient (near handleDrop)", h2_style))
story.append(Preformatted(
    "async function handleProbabilityChange(id, value) {\n"
    "  const clamped = Math.max(0, Math.min(100, Number(value)));\n"
    "  setProjects(prev => prev.map(p =>\n"
    "    p.id === id ? { ...p, pipelineProbability: clamped } : p\n"
    "  ));\n"
    "  try {\n"
    "    await fetch(`/api/projects/${id}`, {\n"
    "      method: 'PATCH',\n"
    "      headers: { 'Content-Type': 'application/json' },\n"
    "      body: JSON.stringify({ pipelineProbability: clamped }),\n"
    "    });\n"
    "  } catch { /* optimistic already applied; fail silently */ }\n"
    "}",
    code_style,
))

story.append(Paragraph("Step 2 — thread onProbabilityChange to ProjectCard", h2_style))
story.append(Paragraph(
    "Wherever <font face='Courier'>ProjectCard</font> is rendered "
    "(inside <font face='Courier'>KanbanColumn</font> and inside "
    "<font face='Courier'>ListView</font>), add the prop. "
    "Also thread it through <font face='Courier'>KanbanColumn</font>'s props.",
    body_style,
))
story.append(Preformatted(
    "// In CRMClient's JSX:\n"
    "<KanbanColumn ... onProbabilityChange={handleProbabilityChange} />\n"
    "<ListView     ... onProbabilityChange={handleProbabilityChange} />\n"
    "\n"
    "// In KanbanColumn:\n"
    "function KanbanColumn({ ..., onProbabilityChange }) {\n"
    "  // pass it down:\n"
    "  <ProjectCard ... onProbabilityChange={onProbabilityChange} />\n"
    "}",
    code_style,
))

story.append(Paragraph("Step 3 — add editing state and inline input inside ProjectCard", h2_style))
story.append(Preformatted(
    "const [editingProb, setEditingProb] = useState(false);\n"
    "\n"
    "// Replace the probability <span> with this:\n"
    "{editingProb ? (\n"
    "  <input\n"
    "    type=\"number\" min=\"0\" max=\"100\"\n"
    "    defaultValue={project.pipelineProbability ?? 0}\n"
    "    autoFocus\n"
    "    className=\"w-10 text-[10px] border border-slate-200 rounded px-1\n"
    "               focus:outline-none focus:ring-1 focus:ring-orange-400\"\n"
    "    onBlur={e => {\n"
    "      setEditingProb(false);\n"
    "      onProbabilityChange(project.id, e.target.value);\n"
    "    }}\n"
    "    onKeyDown={e => {\n"
    "      if (e.key === 'Enter')  e.target.blur();\n"
    "      if (e.key === 'Escape') setEditingProb(false);\n"
    "    }}\n"
    "    onClick={e => e.stopPropagation()}\n"
    "  />\n"
    ") : (\n"
    "  <span\n"
    "    className=\"text-[10px] text-slate-400 cursor-pointer\n"
    "               hover:text-slate-600 hover:underline\"\n"
    "    title=\"Click to edit\"\n"
    "    onClick={e => { e.stopPropagation(); setEditingProb(true); }}\n"
    "  >\n"
    "    {project.pipelineProbability ?? 0}%\n"
    "  </span>\n"
    ")}",
    code_style,
))
story.append(Paragraph(
    "<b>Critical:</b> <font face='Courier'>e.stopPropagation()</font> on both the span click "
    "and the input click — without it, clicking to edit opens the project detail panel.",
    warn_style,
))

story.append(Paragraph("Acceptance criteria", h2_style))
story.append(Paragraph(
    "* Clicking the % on a card opens a number input (0–100).<br/>"
    "* Blur or Enter saves via PATCH and updates the bar immediately (optimistic).<br/>"
    "* Escape cancels without saving.<br/>"
    "* Clicking the input does NOT open the project panel.<br/>"
    "* Pre-push hooks pass.",
    body_style,
))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TASK 4
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Task 4 — CRM CSV export", h1_style))
story.append(Paragraph(
    "Branch: <font face='Courier'>manny/crm-csv-export</font> | "
    "File: <font face='Courier'>src/app/(app)/crm/CRMClient.jsx</font> | ~2 hours",
    subtitle_style,
))
story.append(Paragraph(
    "Mike occasionally needs the pipeline as a spreadsheet. "
    "All data is already in client state — no API needed. "
    "A download button in the CRM toolbar serializes the current filtered view.",
    body_style,
))

story.append(Paragraph("Step 1 — add handleExportCSV to CRMClient (near handleDrop)", h2_style))
story.append(Preformatted(
    "function handleExportCSV() {\n"
    "  const sf     = statusFieldFor(pipeline);\n"
    "  const stagef = stageFieldFor(pipeline);\n"
    "  const headers = [\n"
    "    'Project', 'Client', 'Stage', 'Status',\n"
    "    'Revenue', 'Probability', 'Expected Order',\n"
    "  ];\n"
    "  const rows = filtered.map(p => [\n"
    "    p.name,\n"
    "    p.client?.name || '',\n"
    "    p[stagef] || '',\n"
    "    p[sf] || '',\n"
    "    revenueFor(p, pipeline)\n"
    "      ? `$${revenueFor(p, pipeline).toLocaleString()}` : '',\n"
    "    `${p.pipelineProbability ?? 0}%`,\n"
    "    p.expectedOrderDate\n"
    "      ? new Date(p.expectedOrderDate).toLocaleDateString() : '',\n"
    "  ]);\n"
    "  const csv = [headers, ...rows]\n"
    "    .map(r => r.map(v =>\n"
    "      `\"${String(v).replace(/\"/g, '\"\"')}\"`\n"
    "    ).join(','))\n"
    "    .join('\\n');\n"
    "  const blob = new Blob([csv], { type: 'text/csv' });\n"
    "  const url  = URL.createObjectURL(blob);\n"
    "  const a    = document.createElement('a');\n"
    "  a.href     = url;\n"
    "  a.download = `crm-${pipeline.toLowerCase()}-`\n"
    "             + new Date().toISOString().slice(0, 10) + '.csv';\n"
    "  a.click();\n"
    "  URL.revokeObjectURL(url);\n"
    "}",
    code_style,
))

story.append(Paragraph("Step 2 — add the Export CSV button in the toolbar", h2_style))
story.append(Paragraph(
    "Find the CRM toolbar JSX (search for <font face='Courier'>// ── Main CRMClient</font> "
    "and look for the area with the pipeline tab switcher and 'New Project' button). "
    "Add a low-key secondary button:",
    body_style,
))
story.append(Preformatted(
    "<button\n"
    "  onClick={handleExportCSV}\n"
    "  className=\"text-xs border border-slate-200 text-slate-600\n"
    "             hover:bg-slate-50 px-2.5 py-1.5 rounded-lg\"\n"
    ">\n"
    "  Export CSV\n"
    "</button>",
    code_style,
))

story.append(Paragraph("Acceptance criteria", h2_style))
story.append(Paragraph(
    "* Clicking 'Export CSV' downloads a .csv file of the current filtered pipeline view.<br/>"
    "* Filename includes pipeline name and today's date "
    "(e.g. <font face='Courier'>crm-procurement-2026-07-07.csv</font>).<br/>"
    "* Columns: Project, Client, Stage, Status, Revenue, Probability, Expected Order.<br/>"
    "* File opens cleanly in Excel or Google Sheets.<br/>"
    "* No API routes added. Pre-push hooks pass.",
    body_style,
))

story.append(Spacer(1, 0.3 * inch))
story.append(HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=12))
story.append(Paragraph(
    "<b>Operating reminder (for Claude):</b> Tell Manny what to do — not how to do it technically. "
    "He approves proposed changes; Claude handles git, tests, and pushes. "
    "Manny never pushes to main — always via a manny/* branch and PR to Sean. "
    "If pre-push hooks fail, diagnose and fix. Never --no-verify.",
    warn_style,
))

doc.build(story)
print(f"PDF written to: {OUT_PATH}")
