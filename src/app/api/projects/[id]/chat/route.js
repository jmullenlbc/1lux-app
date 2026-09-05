import { NextResponse } from 'next/server';
import { requireAuth, canSeeAllData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { calculateBudget } from '@/lib/calculations';
import { responsesToSections } from '@/lib/utils';
import { loadPricing } from '@/lib/pricingLoader';
// Third route found with this same missing import — `getAnthropicKey` was used
// below without being imported, so this one threw a ReferenceError too.
import { getAnthropicKey } from '@/lib/anthropicKey';
import { recordRun } from '@/lib/agent/ledger';
import { modelFor } from '@/lib/aiModels';

const TAB_LABELS = {
  drawings:       'Drawings',
  correspondence: 'Correspondence',
  submittals:     'Submittals',
  ca:             'Construction Administration',
  contracts:      'Contracts',
  meetings:       'Meetings',
  designInfo:     'Design Info',
  takeoffs:       'Takeoffs',
  budgets:        'Budgets',
  'site-plan':    'Site Plan',
};

function fmt(val) {
  if (val == null || val === '') return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(val));
}

function fmtDate(str) {
  if (!str) return null;
  try { return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return str; }
}

// Strip HTML tags for plain-text representation of rich notes
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseTags(raw) {
  if (!raw) return [];
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return []; }
}

async function canAccess(projectId, user) {
  const project = await prisma.project.findUnique({
    where:   { id: projectId },
    include: { responses: true },   // wizard Q&A answers
  });
  if (!project) return null;
  if (canSeeAllData(user) || project.createdById === user.id) return project;
  return null;
}

export async function POST(request, { params }) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const project = await canAccess(params.id, user);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { question, history = [], conversationId: existingConvId = null } = await request.json();
  if (!question?.trim()) return NextResponse.json({ error: 'No question provided' }, { status: 400 });

  const apiKey = getAnthropicKey()?.trim();
  if (!apiKey) {
    return new Response('Error: ANTHROPIC_API_KEY is not set', { headers: { 'Content-Type': 'text/plain' } });
  }

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [allFiles, clientRow, meetingNotes, pricing] = await Promise.all([
    prisma.projectFile.findMany({
      where:   { projectId: params.id },
      select:  { id: true, tab: true, originalName: true, textContent: true, tags: true, parsedAmount: true, createdAt: true, size: true, takeoffData: true, analysisData: true },
      orderBy: { createdAt: 'desc' },
    }),
    project.clientId
      ? prisma.client.findUnique({ where: { id: project.clientId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.note.findMany({
      where:   { noteType: 'PROJECT_MEETING', projectId: params.id },
      orderBy: [{ meetingDate: 'desc' }, { createdAt: 'desc' }],
    }).then(rows => rows.map(n => ({
      id: n.id, title: n.title, content: n.body, meetingDate: n.meetingDate,
      meetingLink: n.meetingLink, attendees: n.attendees, createdAt: n.createdAt, updatedAt: n.updatedAt,
    }))).catch(() => []),
    loadPricing().catch(() => null),
  ]);

  // ── Compute wizard budget ─────────────────────────────────────────────────
  const wizardSections  = responsesToSections(project.responses || []);
  const wizardProjectData = { ...(project.projectData || {}), buildingTypeKey: project.buildingType };
  const budget = calculateBudget(wizardProjectData, wizardSections, pricing || null);

  const clientName = clientRow?.name ?? null;

  // ── Computed financial data ───────────────────────────────────────────────
  const contractValue = project.contractValue ?? null;

  const coFiles = allFiles.filter(f => {
    if (f.tab !== 'ca' || f.parsedAmount == null) return false;
    return parseTags(f.tags).includes('Change Order');
  }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const coTotal = coFiles.length > 0 ? coFiles.reduce((s, f) => s + (f.parsedAmount || 0), 0) : null;

  const budgetFiles = allFiles
    .filter(f => f.tab === 'budgets' && f.parsedAmount != null)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const currentBudget       = budgetFiles[0]?.parsedAmount ?? null;
  const currentBudgetSource = budgetFiles[0]?.originalName ?? null;

  const clientInitialBudget = (() => {
    try { const d = typeof project.projectData === 'string' ? JSON.parse(project.projectData) : project.projectData; return d?.clientInitialBudget ?? null; }
    catch { return null; }
  })();

  // ── Section 1: Project Summary ────────────────────────────────────────────
  const summaryLines = [];
  summaryLines.push(`Project: ${project.name}`);
  if (clientName)           summaryLines.push(`Client: ${clientName}`);
  if (project.location)     summaryLines.push(`Location: ${project.location}`);
  if (project.projectType)  summaryLines.push(`Type: ${project.projectType}`);
  if (project.projectStage) summaryLines.push(`Stage: ${project.projectStage}`);
  if (clientInitialBudget)  summaryLines.push(`Initial Budget (client target): ${fmt(clientInitialBudget)}`);
  if (currentBudget)        summaryLines.push(`Current Budget${currentBudgetSource ? ` (from "${currentBudgetSource}")` : ''}: ${fmt(currentBudget)}`);
  if (contractValue)        summaryLines.push(`Supply Contract Total: ${fmt(contractValue)}${project.contractSignedDate ? ` (signed ${fmtDate(project.contractSignedDate)})` : ''}`);
  if (coTotal != null) {
    summaryLines.push(`Change Order Total: ${fmt(coTotal)} (${coFiles.length} change order${coFiles.length !== 1 ? 's' : ''})`);
    coFiles.forEach(f => {
      const extraTags = parseTags(f.tags).filter(t => t !== 'Change Order').join(', ');
      summaryLines.push(`  • ${f.originalName}${extraTags ? ` [${extraTags}]` : ''}: ${fmt(f.parsedAmount)} — ${fmtDate(f.createdAt)}`);
    });
  }

  // Other CA files with parsed amounts (ship schedules, RFIs, etc.)
  const otherCaAmounts = allFiles.filter(f =>
    f.tab === 'ca' && f.parsedAmount != null && !parseTags(f.tags).includes('Change Order')
  );
  if (otherCaAmounts.length > 0) {
    summaryLines.push('Other CA documents with amounts:');
    otherCaAmounts.forEach(f => {
      summaryLines.push(`  • ${f.originalName} [${parseTags(f.tags).join(', ')}]: ${fmt(f.parsedAmount)}`);
    });
  }

  // ── Section 2: Wizard Inputs (building data + Q&A answers) ──────────────
  const pd = wizardProjectData;
  const buildingLines = [];
  if (pd.grossSf)              buildingLines.push(`Gross SF: ${Number(pd.grossSf).toLocaleString()}`);
  if (pd.unitsSf)              buildingLines.push(`Units SF: ${Number(pd.unitsSf).toLocaleString()}`);
  if (pd.numUnits)             buildingLines.push(`# Units: ${pd.numUnits}`);
  if (pd.numBalconies)         buildingLines.push(`# Balconies: ${pd.numBalconies}`);
  if (pd.numVanities || pd.numBathrooms) buildingLines.push(`# Vanities/Bathrooms: ${pd.numVanities || pd.numBathrooms}`);
  if (pd.corridorSf)           buildingLines.push(`Corridor SF: ${Number(pd.corridorSf).toLocaleString()}`);
  if (pd.interiorAmenitySf)    buildingLines.push(`Interior Amenity SF: ${Number(pd.interiorAmenitySf).toLocaleString()}`);
  if (pd.exteriorAmenitySf)    buildingLines.push(`Exterior Amenity SF: ${Number(pd.exteriorAmenitySf).toLocaleString()}`);
  if (pd.garageSf)             buildingLines.push(`Garage SF: ${Number(pd.garageSf).toLocaleString()}`);
  if (pd.bohSf)                buildingLines.push(`BOH/Core+Shell SF: ${Number(pd.bohSf).toLocaleString()}`);
  if (pd.numEgressStairwells)  buildingLines.push(`# Egress Stairwell Landings: ${pd.numEgressStairwells}`);
  if (pd.numSurfaceParking)    buildingLines.push(`Surface Parking Stalls: ${pd.numSurfaceParking}`);
  if (pd.numCarports)          buildingLines.push(`Carports: ${pd.numCarports}`);
  if (pd.numGarages)           buildingLines.push(`Detached Garages: ${pd.numGarages}`);
  if (pd.numExteriorDoors)     buildingLines.push(`Exterior Doors: ${pd.numExteriorDoors}`);
  if (pd.lotSf)                buildingLines.push(`Lot SF: ${Number(pd.lotSf).toLocaleString()}`);
  if (pd.buildingFootprintSf)  buildingLines.push(`Building Footprint SF: ${Number(pd.buildingFootprintSf).toLocaleString()}`);
  if (pd.freightPct != null)   buildingLines.push(`Freight rate: ${(pd.freightPct * 100).toFixed(1)}%`);
  if (pd.warehousingPct != null) buildingLines.push(`Warehousing rate: ${(pd.warehousingPct * 100).toFixed(1)}%`);
  if (pd.clientInitialBudget)  buildingLines.push(`Client initial budget: ${fmt(pd.clientInitialBudget)}`);

  // Wizard Q&A choices by section
  const answerLines = [];
  const sectionLabels = { units: 'Units', corridors: 'Corridors', amenities: 'Amenities', exterior: 'Exterior', emergency: 'Emergency', controls: 'Controls' };
  for (const [sec, answers] of Object.entries(wizardSections)) {
    const label = sectionLabels[sec] || sec;
    for (const [key, val] of Object.entries(answers)) {
      if (val != null && val !== '') answerLines.push(`  ${label} › ${key}: ${val}`);
    }
  }

  // ── Section 3: Budget Breakdown (computed from wizard) ────────────────────
  const s = budget.sections;
  const budgetLines = [];
  budgetLines.push('── Residential Units ─────────────────────────────────────');
  budgetLines.push(`  Base design:        ${fmt(s.units?.base?.product)}`);
  budgetLines.push(`  Undercabinet:       ${fmt(s.units?.undercabinet?.product)}`);
  budgetLines.push(`  Kitchen pendants:   ${fmt(s.units?.pendants?.product)}`);
  budgetLines.push(`  Ceiling fans:       ${fmt(s.units?.fans?.product)}`);
  budgetLines.push(`  Vanity lighting:    ${fmt(s.units?.vanity?.product)}`);
  budgetLines.push(`  Balcony fixtures:   ${fmt(s.units?.balcony?.product)}`);
  budgetLines.push(`  UNITS TOTAL:        ${fmt(s.units?.total?.product)}`);
  budgetLines.push('── Corridors & Stairwells ────────────────────────────────');
  budgetLines.push(`  Corridor disks:     ${fmt(s.corridors?.disks?.product)}`);
  budgetLines.push(`  Unit-entry sconces: ${fmt(s.corridors?.sconces?.product)}`);
  budgetLines.push(`  Stairwell fixtures: ${fmt(s.corridors?.stairwells?.product)}`);
  budgetLines.push(`  CORRIDORS TOTAL:    ${fmt(s.corridors?.total?.product)}`);
  budgetLines.push('── Other Sections ────────────────────────────────────────');
  budgetLines.push(`  BOH / Core+Shell:   ${fmt(s.boh?.product)}`);
  budgetLines.push(`  Interior Amenities: ${fmt(s.interior?.product)}`);
  budgetLines.push(`  Enclosed Garage:    ${fmt(s.garage?.product)}`);
  budgetLines.push(`  Exterior & Site:    ${fmt(s.exterior?.total?.product)}`);
  budgetLines.push(`    Ext. amenities:   ${fmt(s.exterior?.amenities?.product)}`);
  budgetLines.push(`    Surface parking:  ${fmt(s.exterior?.parking?.product)}`);
  budgetLines.push(`    Carports:         ${fmt(s.exterior?.carports?.product)}`);
  budgetLines.push(`    Garages:          ${fmt(s.exterior?.garages?.product)}`);
  budgetLines.push(`    Bldg wallpacks:   ${fmt(s.exterior?.wallpacks?.product)}`);
  budgetLines.push(`    Pathway lighting: ${fmt(s.exterior?.pathway?.product)}${s.exterior?.pathway?.suppressedByManual ? ' (manual entry carries it)' : ''}`);
  budgetLines.push(`    Landscape/adder:  ${fmt(s.exterior?.landscape?.product)}`);
  budgetLines.push(`    5% misc buffer:   ${fmt(s.exterior?.misc?.product)}`);
  budgetLines.push(`  Emergency Lighting: ${fmt(s.emergency?.product)}`);
  budgetLines.push(`  Exit Signs:         ${fmt(s.exitSigns?.product)}`);
  if (s.designAdder?.product) budgetLines.push(`  Design adders:      ${fmt(s.designAdder?.product)}`);
  budgetLines.push('── Totals ────────────────────────────────────────────────');
  budgetLines.push(`  Freight (${Math.round((budget.freightRate||0)*100)}%):       ${fmt(budget.freight)}`);
  budgetLines.push(`  Warehousing (${Math.round((budget.warehousingRate||0)*100)}%): ${fmt(budget.warehousing)}`);
  budgetLines.push(`  Lighting Only Subtotal: ${fmt(budget.subtotalLightingOnly)}`);
  budgetLines.push(`  Controls (w/ F&W):      ${fmt(budget.controlsTotal)}`);
  budgetLines.push(`  TOTAL W/ CONTROLS:      ${fmt(budget.totalWithControls)}`);
  if (budget.perSf)   budgetLines.push(`  Per SF:   $${budget.perSf}`);
  if (budget.perUnit) budgetLines.push(`  Per Unit: ${fmt(budget.perUnit)}`);

  // ── Section 4: File Inventory (ALL files, readable or not) ───────────────
  const filesByTab = {};
  allFiles.forEach(f => {
    if (!filesByTab[f.tab]) filesByTab[f.tab] = [];
    filesByTab[f.tab].push(f);
  });

  let inventoryText = '';
  for (const [tab, tabFiles] of Object.entries(filesByTab)) {
    inventoryText += `\n${TAB_LABELS[tab] || tab} (${tabFiles.length} file${tabFiles.length !== 1 ? 's' : ''}):\n`;
    tabFiles.forEach(f => {
      const tags    = parseTags(f.tags);
      const amount  = f.parsedAmount ? ` · ${fmt(f.parsedAmount)}` : '';
      const canRead = f.textContent ? ' [readable]' : ' [image/scan — not readable]';
      inventoryText += `  • ${f.originalName}${tags.length ? ` [${tags.join(', ')}]` : ''}${amount}${canRead} — ${fmtDate(f.createdAt)}\n`;
    });
  }

  // ── Section 3: Meeting Notes ──────────────────────────────────────────────
  let notesText = '';
  if (meetingNotes.length > 0) {
    meetingNotes.forEach(note => {
      const title     = note.title || '(Untitled)';
      const date      = note.meetingDate ? fmtDate(note.meetingDate) : fmtDate(note.createdAt?.toString());
      const attendees = (() => { try { const a = JSON.parse(note.attendees || '[]'); return a.join(', '); } catch { return note.attendees || ''; } })();
      const body      = stripHtml(note.content || '');

      notesText += `\n[${title}${date ? ` · ${date}` : ''}${attendees ? ` · Attendees: ${attendees}` : ''}]\n`;
      if (note.meetingLink) notesText += `Link: ${note.meetingLink}\n`;
      if (body) notesText += `${body}\n`;
    });
  } else {
    notesText = '\n(No meeting notes recorded yet.)';
  }

  // ── Section 4: Document text content (capped for Tier 1 rate limit) ───────
  // Budget for doc text: total context target ~25k tokens = ~75k chars
  // Subtract space already used by sections above (~5k chars)
  const SUMMARY_CHARS  = summaryLines.join('\n').length;
  const INVENTORY_CHARS = inventoryText.length;
  const NOTES_CHARS    = notesText.length;
  const OVERHEAD       = 1_500; // system prompt header text
  const MAX_TOTAL_CHARS = 75_000;
  const MAX_DOC_CHARS  = Math.max(10_000, MAX_TOTAL_CHARS - SUMMARY_CHARS - INVENTORY_CHARS - NOTES_CHARS - OVERHEAD);

  const filesWithText = allFiles.filter(f => f.textContent);
  const groupedText = {};
  filesWithText.forEach(f => {
    if (!groupedText[f.tab]) groupedText[f.tab] = [];
    groupedText[f.tab].push(f);
  });

  let docText = '';
  let charsUsed = 0;
  let truncated = false;

  // Contracts first so clauses (Force Majeure, tariffs, payment terms) are never truncated
  const TAB_PRIORITY = ['contracts', 'ca', 'correspondence', 'drawings', 'submittals', 'meetings', 'designInfo', 'takeoffs', 'budgets'];
  const sortedTabs = Object.keys(groupedText).sort((a, b) => {
    const ai = TAB_PRIORITY.indexOf(a);
    const bi = TAB_PRIORITY.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const tab of sortedTabs) {
    const tabFiles = groupedText[tab];
    if (truncated) break;
    const tabHeader = `\n\n=== ${TAB_LABELS[tab] || tab} ===\n`;
    docText += tabHeader;
    charsUsed += tabHeader.length;

    for (const f of tabFiles) {
      if (truncated) break;
      const tags       = parseTags(f.tags);
      const amount     = f.parsedAmount ? ` | ${fmt(f.parsedAmount)}` : '';
      const fileHeader = `\n[${f.originalName}${tags.length ? ` | ${tags.join(', ')}` : ''}${amount}]\n`;
      const available  = MAX_DOC_CHARS - charsUsed;
      if (available <= 0) { truncated = true; break; }

      const content = f.textContent || '';
      if (content.length > available - fileHeader.length) {
        docText  += fileHeader + content.slice(0, available - fileHeader.length) + '\n[...truncated]\n';
        charsUsed = MAX_DOC_CHARS;
        truncated = true;
      } else {
        docText  += fileHeader + content + '\n';
        charsUsed += fileHeader.length + content.length + 1;
      }
    }
  }
  if (truncated) docText += '\n[Note: Some document text was truncated to fit context limits. Upgrade API tier for full coverage.]';

  // ── Section 6: Fixture Count Comparison (takeoff data) ───────────────────
  const PHASE_ORDER = ['SD', 'DD', 'CD', 'IFC', 'ASI', 'RFI'];

  function getTakeoffPhase(f) {
    const tags = parseTags(f.tags);
    return PHASE_ORDER.find(p => tags.includes(p)) ?? null;
  }

  const takeoffFiles = allFiles
    .filter(f => f.tab === 'takeoffs' && f.takeoffData)
    .sort((a, b) => {
      const pa = PHASE_ORDER.indexOf(getTakeoffPhase(a));
      const pb = PHASE_ORDER.indexOf(getTakeoffPhase(b));
      const oa = pa === -1 ? 999 : pa;
      const ob = pb === -1 ? 999 : pb;
      if (oa !== ob) return oa - ob;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  let takeoffText = '';
  if (takeoffFiles.length === 0) {
    takeoffText = '\n(No takeoff data uploaded yet.)';
  } else {
    const parseData = raw => { try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch { return {}; } };

    // Collect all fixture type codes across all files
    const allTypeCodes = [...new Set(takeoffFiles.flatMap(f => Object.keys(parseData(f.takeoffData))))].sort((a, b) => {
      const aS = a.startsWith('$'), bS = b.startsWith('$');
      if (aS !== bS) return aS ? 1 : -1;
      return a.localeCompare(b);
    });

    // Column headers
    const colHeaders = takeoffFiles.map(f => {
      const phase = getTakeoffPhase(f);
      const date  = new Date(f.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      return phase ? `${phase} (${date})` : date;
    });

    // Build plain-text table
    const typeColW = Math.max(6, ...allTypeCodes.map(t => t.length)) + 2;
    const colW     = Math.max(8, ...colHeaders.map(h => h.length)) + 2;

    const pad = (s, w) => String(s).padEnd(w);
    const padL = (s, w) => String(s).padStart(w);

    // Header row
    takeoffText += '\n' + pad('Type', typeColW) + colHeaders.map(h => pad(h, colW)).join('') + (takeoffFiles.length > 1 ? 'Δ (first→last)' : '') + '\n';
    takeoffText += '─'.repeat(typeColW + colW * takeoffFiles.length + 14) + '\n';

    // Data rows
    for (const type of allTypeCodes) {
      const qtys = takeoffFiles.map(f => parseData(f.takeoffData)[type] ?? 0);
      const delta = qtys.length > 1 ? qtys[qtys.length - 1] - qtys[0] : null;
      const deltaStr = delta === null ? '' : delta === 0 ? '—' : delta > 0 ? `+${delta}` : `${delta}`;
      takeoffText += pad(type, typeColW) + qtys.map(q => pad(q, colW)).join('') + (takeoffFiles.length > 1 ? deltaStr : '') + '\n';
    }

    // Summary: types with biggest changes
    if (takeoffFiles.length > 1) {
      const firstData = parseData(takeoffFiles[0].takeoffData);
      const lastData  = parseData(takeoffFiles[takeoffFiles.length - 1].takeoffData);
      const changes = allTypeCodes
        .map(type => ({ type, delta: (lastData[type] ?? 0) - (firstData[type] ?? 0) }))
        .filter(c => c.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      if (changes.length > 0) {
        takeoffText += '\nTop changes (' + colHeaders[0] + ' → ' + colHeaders[colHeaders.length - 1] + '):\n';
        changes.slice(0, 15).forEach(c => {
          takeoffText += `  ${c.type}: ${c.delta > 0 ? '+' : ''}${c.delta}\n`;
        });
      }

      // Totals row
      const firstTotal = Object.values(firstData).reduce((s, v) => s + (Number(v) || 0), 0);
      const lastTotal  = Object.values(lastData).reduce((s, v) => s + (Number(v) || 0), 0);
      takeoffText += `\nTotal fixtures: ${firstTotal} (${colHeaders[0]}) → ${lastTotal} (${colHeaders[colHeaders.length - 1]}) [Δ ${lastTotal >= firstTotal ? '+' : ''}${lastTotal - firstTotal}]\n`;
    } else {
      const totalFixtures = Object.values(parseData(takeoffFiles[0].takeoffData)).reduce((s, v) => s + (Number(v) || 0), 0);
      takeoffText += `\nTotal fixtures: ${totalFixtures}\n`;
    }
  }

  // ── Contract Analysis Summary (from Claude AI contract reviews) ──────────
  let contractAnalysisText = '\n(No contract reviews completed yet.)';
  const reviewedContracts = allFiles.filter(f => f.tab === 'contracts' && f.analysisData);
  if (reviewedContracts.length > 0) {
    contractAnalysisText = '';
    for (const f of reviewedContracts) {
      let analysis;
      try { analysis = typeof f.analysisData === 'string' ? JSON.parse(f.analysisData) : f.analysisData; } catch { continue; }
      if (!analysis) continue;
      const cs = analysis.contract_summary || {};
      const risk = analysis.overall_risk_score || 'Unknown';
      const flags = analysis.flags || [];
      const reds = flags.filter(fl => fl.severity === 'RED');
      const yellows = flags.filter(fl => fl.severity === 'YELLOW');
      const greens = flags.filter(fl => fl.severity === 'GREEN');
      contractAnalysisText += `\n[${f.originalName}]\n`;
      contractAnalysisText += `  Counterparty: ${cs.counterparty_name || '—'} | Tier: ${cs.contract_tier || '—'} | Value: ${cs.contract_value || '—'}\n`;
      contractAnalysisText += `  Governing Law: ${cs.governing_law || '—'} | Date: ${cs.date || '—'}\n`;
      contractAnalysisText += `  Risk Score: ${risk} | Flags: ${reds.length} RED · ${yellows.length} YELLOW · ${greens.length} GREEN\n`;
      if (analysis.overall_risk_rationale) contractAnalysisText += `  Summary: ${analysis.overall_risk_rationale}\n`;
      if (reds.length > 0) {
        contractAnalysisText += `  RED FLAGS:\n`;
        reds.forEach(fl => contractAnalysisText += `    • [${fl.category}] ${fl.title} — ${fl.risk || fl.what_it_says}\n`);
      }
      const missing = (analysis.missing_clauses || []).filter(c => c.importance === 'Critical');
      if (missing.length > 0) {
        contractAnalysisText += `  MISSING (Critical): ${missing.map(c => c.clause).join(', ')}\n`;
      }
      const ss = analysis.southstar_compatibility || {};
      if (ss.compatible === false || ss.compatible === 'false') {
        contractAnalysisText += `  SOUTHSTAR: Incompatible — ${(ss.issues || []).join('; ')}\n`;
      }
    }
  }

  // ── Assemble system prompt ────────────────────────────────────────────────
  const systemPrompt = `You are an AI assistant for ILC Studios, a lighting design firm. Answer questions directly — lead with the number or fact, then add context. Use PROJECT SUMMARY and BUDGET BREAKDOWN figures as authoritative sources. Reference meeting notes and file names when relevant.

Format every response clearly:
- Use **bold** for key numbers, dollar amounts, names, and important terms
- Use bullet points (- item) for any list of 3 or more items
- Use ## headings to separate distinct topics in longer answers
- Keep sentences short and direct — one idea per sentence
- Lead with the direct answer first, then supporting detail
- Never write walls of unbroken text — break into bullets or short paragraphs

── PROJECT SUMMARY (live database) ─────────────────────────────────────────
${summaryLines.join('\n')}

── BUILDING DATA (wizard inputs) ────────────────────────────────────────────
${buildingLines.length ? buildingLines.join('\n') : '(No building data entered yet.)'}

── WIZARD Q&A ANSWERS ───────────────────────────────────────────────────────
${answerLines.length ? answerLines.join('\n') : '(No wizard answers recorded yet.)'}

── BUDGET BREAKDOWN (calculated from wizard) ────────────────────────────────
${budgetLines.join('\n')}

── FIXTURE COUNT COMPARISON (takeoff data) ──────────────────────────────────${takeoffText}

── CONTRACT AI REVIEW RESULTS ───────────────────────────────────────────────${contractAnalysisText}

── MEETING NOTES ────────────────────────────────────────────────────────────${notesText}

── FILE INVENTORY (all uploaded files) ─────────────────────────────────────${inventoryText}

── DOCUMENT TEXT CONTENTS ───────────────────────────────────────────────────${docText || '\n(No readable document text available.)'}`;

  // ── Create or load conversation record ───────────────────────────────────
  let conversation;
  try {
    if (existingConvId) {
      conversation = await prisma.chatConversation.findFirst({
        where: { id: existingConvId, projectId: params.id },
      });
    }
    if (!conversation) {
      conversation = await prisma.chatConversation.create({
        data: {
          projectId: params.id,
          title:     question.slice(0, 80),
        },
      });
    }
    // Save user message now (before streaming)
    await prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: 'user', content: question },
    });
  } catch {}

  const convId = conversation?.id ?? null;

  const apiMessages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: question },
  ];

  // Recorded: see src/lib/agent/ledger.js. Raw SSE, so the usage totals are
  // read out of the event stream — `message_start` carries input_tokens,
  // `message_delta` carries the running output_tokens and the stop reason.
  const MODEL   = modelFor('chat.project');
  const started = Date.now();
  const ledger  = { inputTokens: null, outputTokens: null, stopReason: null };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let fullText = '';
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model:      MODEL,
            max_tokens: 1024,
            stream:     true,
            system:     systemPrompt,
            messages:   apiMessages,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error('Anthropic API error:', res.status, errText);
          await recordRun({
            task: 'project.chat', model: MODEL, status: 'error',
            durationMs: Date.now() - started,
            projectId: params.id, userId: user?.id || null,
            error: `HTTP ${res.status}: ${errText.slice(0, 300)}`,
          });
          controller.enqueue(enc.encode(`Error: ${res.status} ${errText}`));
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                  controller.enqueue(enc.encode(parsed.delta.text));
                  fullText += parsed.delta.text;
                } else if (parsed.type === 'message_start') {
                  ledger.inputTokens = parsed.message?.usage?.input_tokens ?? null;
                } else if (parsed.type === 'message_delta') {
                  ledger.outputTokens = parsed.usage?.output_tokens ?? ledger.outputTokens;
                  ledger.stopReason   = parsed.delta?.stop_reason ?? ledger.stopReason;
                }
              } catch {}
            }
          }
        }

        // Save assistant message after streaming completes
        if (convId && fullText) {
          try {
            await prisma.chatMessage.create({
              data: { conversationId: convId, role: 'assistant', content: fullText },
            });
          } catch {}
        }
        await recordRun({
          task: 'project.chat', model: MODEL, status: 'ok',
          durationMs: Date.now() - started,
          projectId: params.id, userId: user?.id || null,
          inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens,
          stopReason: ledger.stopReason,
        });
      } catch (e) {
        console.error('Chat route error:', e);
        await recordRun({
          task: 'project.chat', model: MODEL, status: 'error',
          durationMs: Date.now() - started,
          projectId: params.id, userId: user?.id || null,
          inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens,
          error: e?.message || String(e),
        });
        controller.enqueue(enc.encode(`Error: ${e.message}`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/plain; charset=utf-8',
      'X-Conversation-Id': convId ?? '',
    },
  });
}
