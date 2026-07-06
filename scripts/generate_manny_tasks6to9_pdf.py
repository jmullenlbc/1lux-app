"""Generate Manny's Tasks 6–9 spec PDF (v2 — rewritten for Deal→Project unification).

Run once, send resulting PDF to Manny.
Requires: pip install reportlab
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

OUT_PATH = Path.home() / "Desktop" / "manny_tasks_6to9.pdf"

# ── Colour palette ──────────────────────────────────────────────────────────
INK     = HexColor('#0f172a')
STEEL   = HexColor('#334155')
MUTED   = HexColor('#64748b')
BORDER  = HexColor('#e2e8f0')
LIGHT   = HexColor('#f8fafc')
CODE_BG = HexColor('#f1f5f9')
AMBER   = HexColor('#92400e')
AMBER_BG = HexColor('#fffbeb')
AMBER_BR = HexColor('#fcd34d')
GREEN   = HexColor('#14532d')
GREEN_BG = HexColor('#f0fdf4')
GREEN_BR = HexColor('#bbf7d0')

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'T', parent=styles['Title'], fontSize=22,
    textColor=INK, spaceAfter=4, alignment=TA_LEFT,
)
subtitle_style = ParagraphStyle(
    'Sub', parent=styles['Normal'], fontSize=11,
    textColor=MUTED, spaceAfter=16, alignment=TA_LEFT, leading=15,
)
h1_style = ParagraphStyle(
    'H1', parent=styles['Heading1'], fontSize=14,
    textColor=INK, spaceBefore=16, spaceAfter=6,
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
    topMargin=0.6 * inch, bottomMargin=0.6 * inch,
    leftMargin=0.85 * inch, rightMargin=0.85 * inch,
    title="Manny — Tasks 6-9 (CRM improvements)",
    author="Sean / ILC Studios",
)

story = []

# ══════════════════════════════════════════════════════════════════════════════
# COVER
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Manny — Tasks 6–9", title_style))
story.append(Paragraph(
    "CRM improvements · July 2026 · All four tasks are in "
    "<font face='Courier'>src/app/(app)/crm/CRMClient.jsx</font> "
    "(plus two new files for Task 8). No schema changes, no engine changes.",
    subtitle_style,
))

story.append(Paragraph(
    "<b>Important context:</b> Since your last sprint, Mike pushed a large deploy that unified "
    "the Deal model into Project. <font face='Courier'>DealCard</font>, "
    "<font face='Courier'>DealDrawer</font>, and the activities API are gone. "
    "The pipeline entity is now <font face='Courier'>Project</font>. "
    "Status values live on <font face='Courier'>procurementStatus</font> and "
    "<font face='Courier'>designStatus</font> fields directly on the project. "
    "Valid statuses: <font face='Courier'>OPEN WON LOST COMPLETED ABANDONED</font>.",
    warn_style,
))

story.append(styled_table([
    ['Task', 'Branch', 'File(s)', 'Effort'],
    ['6 — Needs Attention filter',
     'manny/crm-needs-attention',
     'CRMClient.jsx',
     '~2 hr'],
    ['7 — Enhance stats bar',
     'manny/crm-stats-enhance',
     'CRMClient.jsx',
     '~1 hr'],
    ['8 — Morning Brief page',
     'manny/crm-morning-brief',
     'crm/brief/page.jsx + BriefClient.jsx',
     '~3-4 hr'],
    ['9 — Project quick-note',
     'manny/crm-project-quicknote',
     'CRMClient.jsx',
     '~2 hr'],
], col_widths=[2.1*inch, 2.0*inch, 2.1*inch, 0.8*inch]))

story.append(Paragraph(
    "<b>Work in order:</b> 6 then 7, then 8, then 9. Tasks 6 and 7 are both small and can be "
    "done in the same session. Task 7 uses a <font face='Courier'>daysSince()</font> helper "
    "that Task 6 adds — do 6 first, or add the helper yourself if you tackle 7 first.",
    body_style,
))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TASK 6
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Task 6 — \"Needs Attention\" filter", h1_style))
story.append(Paragraph(
    "Branch: <font face='Courier'>manny/crm-needs-attention</font> | "
    "File: <font face='Courier'>src/app/(app)/crm/CRMClient.jsx</font> | ~2 hours",
    subtitle_style,
))
story.append(Paragraph(
    "Mike needs a one-click view of every open project that hasn't been touched in 30+ days "
    "so nothing slips through. Right now you have to scan the kanban card by card.",
    body_style,
))

story.append(Paragraph("Architecture notes — read CRMClient.jsx first", h2_style))
story.append(Paragraph(
    "* Pipeline entity is <font face='Courier'>Project</font> — state array is "
    "<font face='Courier'>projects</font>.<br/>"
    "* Current pipeline's status field: "
    "<font face='Courier'>project[statusFieldFor(pipeline)]</font> returns "
    "<font face='Courier'>procurementStatus</font> or <font face='Courier'>designStatus</font>. "
    "Both helpers are already imported from <font face='Courier'>@/lib/pipeline</font>.<br/>"
    "* There is <b>no</b> <font face='Courier'>daysSince()</font> function in the file — you must add one.<br/>"
    "* Staleness is based on <font face='Courier'>project.updatedAt</font> (no activities array).<br/>"
    "* The <font face='Courier'>filtered</font> useMemo is at line 294. "
    "The header/filter controls render at lines 344-392.",
    body_style,
))

story.append(Paragraph("Step 1 — add daysSince() helper (~line 37, near other formatters)", h2_style))
story.append(Preformatted(
    "function daysSince(dateStr) {\n"
    "  if (!dateStr) return 999;\n"
    "  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);\n"
    "}",
    code_style,
))

story.append(Paragraph("Step 2 — add state inside CRMClient", h2_style))
story.append(Preformatted("const [needsAttention, setNeedsAttention] = useState(false);", code_style))

story.append(Paragraph("Step 3 — add a derived list via useMemo", h2_style))
story.append(Preformatted(
    "const needsAttentionFiltered = useMemo(() => {\n"
    "  const sf = statusFieldFor(pipeline);\n"
    "  return projects\n"
    "    .filter(p => inBoard(p) && p[sf] === 'OPEN' && daysSince(p.updatedAt) >= 30)\n"
    "    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));\n"
    "}, [projects, pipeline]);",
    code_style,
))

story.append(Paragraph("Step 4 — add button in the filter row (after status pills, ~line 380)", h2_style))
story.append(Preformatted(
    "<button\n"
    "  onClick={() => setNeedsAttention(n => !n)}\n"
    "  className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-colors ${\n"
    "    needsAttention\n"
    "      ? 'bg-amber-500 text-white'\n"
    "      : needsAttentionFiltered.length > 0\n"
    "        ? 'border border-amber-400 text-amber-600 hover:bg-amber-50'\n"
    "        : 'text-slate-400 hover:bg-slate-200'\n"
    "  }`}\n"
    ">\n"
    "  {needsAttention\n"
    "    ? `Needs Attention (${needsAttentionFiltered.length})`\n"
    "    : needsAttentionFiltered.length > 0\n"
    "      ? `Warning Needs Attention (${needsAttentionFiltered.length})`\n"
    "      : 'Needs Attention'}\n"
    "</button>",
    code_style,
))

story.append(Paragraph("Step 5 — override the active list and view mode when filter is on", h2_style))
story.append(Preformatted(
    "const activeList     = needsAttention ? needsAttentionFiltered : filtered;\n"
    "const activeViewMode = needsAttention ? 'list' : viewMode;\n"
    "\n"
    "// Use activeList and activeViewMode in JSX instead of filtered and viewMode.",
    code_style,
))

story.append(Paragraph("Acceptance criteria", h2_style))
story.append(Paragraph(
    "* Button shows amber outline when stale projects exist, grey when zero.<br/>"
    "* Clicking it shows list view with only open + stale projects, most stale first.<br/>"
    "* Clicking again restores normal view.<br/>"
    "* Switching PROCUREMENT / DESIGN tab re-runs the filter for the new pipeline.<br/>"
    "* Existing filters still work when Needs Attention is off.<br/>"
    "* Pre-push hooks pass.",
    body_style,
))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TASK 7
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Task 7 — Enhance the existing stats bar", h1_style))
story.append(Paragraph(
    "Branch: <font face='Courier'>manny/crm-stats-enhance</font> | "
    "File: <font face='Courier'>src/app/(app)/crm/CRMClient.jsx</font> | ~1 hour",
    subtitle_style,
))
story.append(Paragraph(
    "<b>Don't build a new stats bar.</b> One already exists: the "
    "<font face='Courier'>PipelineSummary</font> component at line 150. "
    "It shows 5 chips. Make two targeted improvements.",
    warn_style,
))

story.append(Paragraph("Change 1 — Replace 'Won (all time)' with 'Won (30 days)'", h2_style))
story.append(Preformatted(
    "// Before:\n"
    "const won = projects.filter(p => p[sf] === 'WON');\n"
    "\n"
    "// After:\n"
    "const won = projects.filter(p => p[sf] === 'WON' && daysSince(p.updatedAt) <= 30);\n"
    "\n"
    "// Also update the label string from 'Won (all time)' to 'Won (30 days)'.",
    code_style,
))

story.append(Paragraph("Change 2 — Add a 'Needs Attention' count chip", h2_style))
story.append(Preformatted(
    "const stale = open.filter(p => daysSince(p.updatedAt) >= 30);\n"
    "\n"
    "// Add to the stats array:\n"
    "{\n"
    "  label: 'Needs Attention',\n"
    "  value: stale.length,\n"
    "  color: stale.length > 0 ? 'text-amber-600' : 'text-slate-400'\n"
    "}",
    code_style,
))

story.append(Paragraph(
    "<b>Note on daysSince:</b> This helper is added by Task 6. "
    "If you're doing Task 7 first, define it yourself (same definition as Task 6's Step 1). "
    "Only one definition should exist in the file.",
    body_style,
))

story.append(Paragraph("Acceptance criteria", h2_style))
story.append(Paragraph(
    "* Stats bar shows 6 chips. 'Won (30 days)' replaces 'Won (all time)'.<br/>"
    "* 'Needs Attention' chip is amber text when count > 0, grey when 0.<br/>"
    "* Counts update instantly when switching PROCUREMENT / DESIGN tab.<br/>"
    "* Pre-push hooks pass.",
    body_style,
))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TASK 8
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Task 8 — Morning Brief page", h1_style))
story.append(Paragraph(
    "Branch: <font face='Courier'>manny/crm-morning-brief</font> | ~3-4 hours | Do after Tasks 6 and 7.",
    subtitle_style,
))
story.append(Paragraph(
    "Create a page at <font face='Courier'>/crm/brief</font> that gives Mike a single daily view: "
    "stale projects needing outreach, pipeline counts by stage, and recent wins.",
    body_style,
))

story.append(Paragraph("Files to create", h2_style))
story.append(styled_table([
    ['File', 'Type', 'Notes'],
    ['src/app/(app)/crm/brief/page.jsx',
     'Server component',
     "MUST have: export const dynamic = 'force-dynamic'"],
    ['src/app/(app)/crm/brief/BriefClient.jsx',
     'Client component',
     "'use client' at top; display-only, no data fetching"],
], col_widths=[2.8*inch, 1.3*inch, 2.8*inch]))

story.append(Paragraph(
    "<b>Model this on <font face='Courier'>src/app/(app)/crm/page.jsx</font></b> — "
    "same auth pattern, same Prisma import. "
    "You can import <font face='Courier'>PIPELINE_STAGES</font> from "
    "<font face='Courier'>@/lib/pipeline</font> — it's SSR-safe.",
    body_style,
))

story.append(Paragraph("Section 1 — Needs Attention (stale open projects, top 10)", h2_style))
story.append(Preformatted(
    "const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);\n"
    "\n"
    "const stale = await prisma.project.findMany({\n"
    "  where: {\n"
    "    OR: [{ procurementStatus: 'OPEN' }, { designStatus: 'OPEN' }],\n"
    "    updatedAt: { lt: thirtyDaysAgo },\n"
    "  },\n"
    "  orderBy: { updatedAt: 'asc' },\n"
    "  take: 10,\n"
    "  select: {\n"
    "    id: true, name: true, updatedAt: true,\n"
    "    procurementStage: true, designStage: true,\n"
    "    procurementStatus: true, designStatus: true,\n"
    "    client: { select: { name: true } },\n"
    "  },\n"
    "});",
    code_style,
))
story.append(Paragraph(
    "Display as a table: Project | Client | Stage | Days since update. "
    "If empty: show a green 'All caught up — no stale open projects.'",
    body_style,
))

story.append(Paragraph("Section 2 — Pipeline snapshot (open project counts by stage)", h2_style))
story.append(Preformatted(
    "const [procSnapshot, designSnapshot] = await Promise.all([\n"
    "  prisma.project.groupBy({\n"
    "    by: ['procurementStage'],\n"
    "    where: { procurementStatus: 'OPEN' },\n"
    "    _count: { id: true },\n"
    "  }),\n"
    "  prisma.project.groupBy({\n"
    "    by: ['designStage'],\n"
    "    where: { designStatus: 'OPEN' },\n"
    "    _count: { id: true },\n"
    "  }),\n"
    "]);",
    code_style,
))
story.append(Paragraph(
    "Display as two side-by-side tables (Procurement | Design), each showing Stage | Count. "
    "Use <font face='Courier'>PIPELINE_STAGES.PROCUREMENT</font> and "
    "<font face='Courier'>PIPELINE_STAGES.DESIGN</font> to control stage order and labels.",
    body_style,
))

story.append(Paragraph("Section 3 — Won last 30 days", h2_style))
story.append(Preformatted(
    "const recentWins = await prisma.project.findMany({\n"
    "  where: {\n"
    "    OR: [{ procurementStatus: 'WON' }, { designStatus: 'WON' }],\n"
    "    updatedAt: { gte: thirtyDaysAgo },\n"
    "  },\n"
    "  orderBy: { updatedAt: 'desc' },\n"
    "  select: {\n"
    "    id: true, name: true, updatedAt: true,\n"
    "    procurementStatus: true, designStatus: true,\n"
    "    client: { select: { name: true } },\n"
    "  },\n"
    "});",
    code_style,
))
story.append(Paragraph(
    "Display: project name, client, which pipeline(s) are Won, date updated.",
    body_style,
))

story.append(Paragraph(
    "Fetch all three with Promise.all. Pass stale, procSnapshot, designSnapshot, recentWins "
    "as props to BriefClient.",
    body_style,
))

story.append(Paragraph(
    "Also add a 'Brief ->' link in CRMClient.jsx's header near the 'New Project' button "
    "(lines 359-368) pointing to <font face='Courier'>/crm/brief</font>.",
    body_style,
))

story.append(Paragraph("Acceptance criteria", h2_style))
story.append(Paragraph(
    "* <font face='Courier'>/crm/brief</font> loads without errors when logged in.<br/>"
    "* Auth gates the page (same pattern as crm/page.jsx).<br/>"
    "* All three sections render. Empty states are handled gracefully.<br/>"
    "* <font face='Courier'>export const dynamic = 'force-dynamic'</font> is on the page.<br/>"
    "* 'Brief ->' link appears in the CRM header.<br/>"
    "* Pre-push hooks pass.",
    body_style,
))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# TASK 9
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph("Task 9 — Project quick-note from the kanban card", h1_style))
story.append(Paragraph(
    "Branch: <font face='Courier'>manny/crm-project-quicknote</font> | "
    "File: <font face='Courier'>src/app/(app)/crm/CRMClient.jsx</font> | ~2 hours | Do after Tasks 6-8.",
    subtitle_style,
))
story.append(Paragraph(
    "Add a '+ Note' link at the bottom of each ProjectCard so Mike can log a quick note "
    "from the kanban without navigating away from the board.",
    body_style,
))
story.append(Paragraph(
    "<b>The old activities API is gone.</b> Use the new Notes API: "
    "<font face='Courier'>POST /api/crm/notes</font>. "
    "Read that route at <font face='Courier'>src/app/api/crm/notes/route.js</font> before writing anything.",
    warn_style,
))

story.append(Paragraph("Notes API — POST /api/crm/notes", h2_style))
story.append(Paragraph("Minimal body to create a project-linked note:", body_style))
story.append(Preformatted(
    '{\n'
    '  "noteBody": "the note text",\n'
    '  "projectIds": ["project-id-here"],\n'
    '  "title": "",\n'
    '  "meetingDate": null,\n'
    '  "attendees": "[]",\n'
    '  "calendarRef": null,\n'
    '  "clientIds": [],\n'
    '  "activityType": null,\n'
    '  "contactIds": []\n'
    '}',
    code_style,
))
story.append(Paragraph(
    "Response: 201 Created on success. 4xx with { error: '...' } on failure.",
    body_style,
))

story.append(Paragraph("NoteInput component (add above ProjectCard)", h2_style))
story.append(Preformatted(
    "function NoteInput({ projectId, onClose }) {\n"
    "  const [text,   setText]   = useState('');\n"
    "  const [saving, setSaving] = useState(false);\n"
    "  const [saved,  setSaved]  = useState(false);\n"
    "  const [err,    setErr]    = useState(null);\n"
    "\n"
    "  async function handleSave() {\n"
    "    if (!text.trim()) return;\n"
    "    setSaving(true); setErr(null);\n"
    "    try {\n"
    "      const res = await fetch('/api/crm/notes', {\n"
    "        method: 'POST',\n"
    "        headers: { 'Content-Type': 'application/json' },\n"
    "        body: JSON.stringify({\n"
    "          noteBody: text.trim(), projectIds: [projectId],\n"
    "          title: '', meetingDate: null, attendees: '[]',\n"
    "          calendarRef: null, clientIds: [],\n"
    "          activityType: null, contactIds: [],\n"
    "        }),\n"
    "      });\n"
    "      if (!res.ok) throw new Error((await res.json()).error || 'Failed');\n"
    "      setSaved(true);\n"
    "      setTimeout(onClose, 1500);\n"
    "    } catch (e) {\n"
    "      setErr(e.message);\n"
    "    } finally {\n"
    "      setSaving(false);\n"
    "    }\n"
    "  }\n"
    "\n"
    "  if (saved) return <p className='text-xs text-green-600 mt-2'>Saved check</p>;\n"
    "\n"
    "  return (\n"
    "    <div className='mt-2 flex flex-col gap-1'>\n"
    "      <input autoFocus value={text}\n"
    "        onChange={e => setText(e.target.value)}\n"
    "        placeholder='Quick note...'\n"
    "        className='text-xs border border-slate-200 rounded px-2 py-1 w-full\n"
    "                   focus:outline-none focus:ring-1 focus:ring-orange-400' />\n"
    "      {err && <p className='text-xs text-red-500'>{err}</p>}\n"
    "      <div className='flex gap-1'>\n"
    "        <button onClick={handleSave}\n"
    "          disabled={saving || !text.trim()}\n"
    "          className='text-xs px-2 py-1 bg-slate-800 text-white rounded\n"
    "                     disabled:opacity-40'>\n"
    "          {saving ? 'Saving...' : 'Save'}\n"
    "        </button>\n"
    "        <button onClick={onClose}\n"
    "          className='text-xs text-slate-400 hover:text-slate-600'>x</button>\n"
    "      </div>\n"
    "    </div>\n"
    "  );\n"
    "}",
    code_style,
))

story.append(Paragraph("Add to ProjectCard's JSX (at the very bottom of the return)", h2_style))
story.append(Preformatted(
    "const [noteOpen, setNoteOpen] = useState(false);\n"
    "\n"
    "// In JSX:\n"
    "{!noteOpen ? (\n"
    "  <button onClick={() => setNoteOpen(true)}\n"
    "    className='text-xs text-slate-400 hover:text-slate-600 mt-2 w-full text-left'>\n"
    "    + Note\n"
    "  </button>\n"
    ") : (\n"
    "  <NoteInput\n"
    "    projectId={project.id}\n"
    "    onClose={() => setNoteOpen(false)}\n"
    "  />\n"
    ")}",
    code_style,
))

story.append(Paragraph("Acceptance criteria", h2_style))
story.append(Paragraph(
    "* Clicking '+ Note' opens an inline input on the card.<br/>"
    "* Save is disabled when input is empty or while saving.<br/>"
    "* Submitting POSTs to /api/crm/notes with projectIds: [project.id].<br/>"
    "* Success shows 'Saved' then closes after 1.5 seconds.<br/>"
    "* Error message stays visible; input stays open so the user can retry.<br/>"
    "* Pre-push hooks pass.",
    body_style,
))

story.append(Spacer(1, 0.3 * inch))
story.append(Paragraph(
    "<b>Operating reminder.</b> Tell Claude what you want, not how. Claude handles git, "
    "tests, and pushes. You review and approve. Never push to main directly — always via "
    "a manny/* branch and PR. If something is unclear after 30 minutes, ask Sean.",
    warn_style,
))

doc.build(story)
print(f"PDF written to: {OUT_PATH}")
