import { prisma } from '@/lib/db';

// ── Human-readable label maps ──────────────────────────────────────────────

export const SECTION_LABELS = {
  'project-data': 'Project Data',
  'units':        'Residential Units',
  'corridors':    'Corridors & Stairwells',
  'amenities':    'Interior Amenities',
  'exterior':     'Exterior & Site',
  'emergency':    'Emergency Lighting',
  'controls':     'Controls & Energy',
};

export const QUESTION_LABELS = {
  // Units
  undercabinet:        'Undercabinet Lighting',
  kitchenPendants:     'Kitchen Island Pendants',
  fans:                'Ceiling Fans',
  vanity:              'Bathroom Vanity',
  balcony:             'Balcony Fixture',
  diskType:            'Disk Type',
  diskSize:            'Disk Size',
  entryDisk:           'Entry Disk Statement',
  fireRating:          'Fire Rating',
  dimmersPerUnit:      'Dimmers Per Unit',
  boilerRoom:          'HVAC Closet Disk',
  undercabinetSwitch:  'Undercabinet Switch',
  fanLevel:            'Fan Level',
  fanSize52:           'Fan Size Upgrade',
  fanLightKit:         'Fan Light Kit',
  fanSupplemental:     'Fan Area Supplemental Lighting',
  livingRoomDisks:     'Living Room Disk Layout',
  halfHotReceptacles:  'Half-Hot Receptacles',
  closetControl:       'Closet Light Control',
  // Corridors
  unitSconce:          'Unit Entry Sconce',
  corridorFireRating:  'Corridor Fire Rating',
  fixtureType:         'Corridor Fixture Type',
  fixtureSpacing:      'Fixture Spacing',
  corridorEnds:        'Corridor End Treatment',
  corridorSpecial:     'Special Corridor Features',
  elevatorLobby:       'Elevator Lobby Design',
  stairwellPainting:   'Stairwell Finish',
  stairwellDesign:     'Stairwell Design',
  breezewayStyle:      'Breezeway Style',
  stairType:           'Stair Type',
  garageDesignLevel:   'Garage Design Level',
  garageControls:      'Garage Controls',
  exitSignType:        'Exit Sign Type',
  // Exterior
  amenityLevel:        'Exterior Amenity Level',
  amenityHours:        'Amenity Hours',
  pathwayBollards:     'Bollards / Pedestrian Poles',
  landscapeBudget:     'Landscape Budget',
  exteriorEmergency:   'Exterior Emergency Fixtures',
  exteriorPoleControl: 'Pole Lighting Control',
  siteType:            'Site Lighting Type',
  roadwayLighting:     'Roadway Lighting',
  // Controls
  energyCredit:        'Energy Credit Target',
  controlsOverride:    'Controls Override',
  decorativeDimming:   'Decorative Dimming',
  sceneSwitching:      'Scene Switching',
  zoneReduction:       'Zone Reduction',
  // Project Data Q&A
  buyHold:             'Buy & Hold vs. Build & Sell',
  switchesDimmers:     'Switches & Dimmers Scope',
  contingency:         'Contingency Line Item',
  salesTax:            'Sales Tax',
};

export const TAB_LABELS = {
  drawings:       'Drawings',
  correspondence: 'Correspondence',
  submittals:     'Submittals',
  ca:             'CA',
  contracts:      'Contracts',
  meetings:       'Meetings',
  designInfo:     'Design Info',
  takeoffs:       'Takeoffs',
  budgets:        'Budgets',
  'site-plan':    'Site Plan',
};

export const PHASE_LABELS = {
  sd:           'SD: Schematic Design',
  dd:           'DD: Design Development',
  cd:           'CD: Construction Documents',
  ifc:          'IFC: Issued for Construction',
  construction: 'Construction',
  closeout:     'Closeout',
};

// ── Core logging function ──────────────────────────────────────────────────

/**
 * Log a project activity event.
 * @param {string} projectId
 * @param {{ id: string, name?: string, email?: string }} user
 * @param {string} type  - file_upload | file_delete (before 0076) | file_archive | file_restore | questionnaire | project_data | phase_change | project_meta | note_added | deal_status | deal_stage
 * @param {string} description - Human-readable description
 * @param {object} [metadata] - Extra JSON data stored for future use
 */
export async function logActivity(projectId, user, type, description, metadata = null) {
  try {
    await prisma.projectActivity.create({
      data: {
        projectId,
        userId:      user.id,
        userName:    user.name  || null,
        userEmail:   user.email || null,
        type,
        description,
        metadata:    metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (err) {
    // Never let activity logging crash a real request
    console.warn('[activity] Failed to log:', err?.message);
  }
}

// ── Questionnaire diff helper ──────────────────────────────────────────────

/**
 * Compare old DB responses to incoming payload, return changed question objects with old/new values.
 * @param {Array<{questionKey: string, answerValue: string}>} existing
 * @param {{ [key: string]: string|null }} incoming
 * @returns {Array<{key: string, label: string, oldVal: string|null, newVal: string|null}>} array of changes with old/new values
 */
export function diffResponses(existing, incoming) {
  const changed = [];
  const existingMap = Object.fromEntries(existing.map(r => [r.questionKey, r.answerValue]));

  for (const [key, newVal] of Object.entries(incoming)) {
    // Skip null values (design-only fields nulled out in conceptual mode)
    if (newVal === null || newVal === undefined) continue;
    const oldVal = existingMap[key];
    // Treat empty string and undefined as equivalent to null/missing
    const oldNorm = (oldVal == null || oldVal === '') ? null : String(oldVal);
    const newNorm = (newVal === '') ? null : String(newVal);
    if (oldNorm !== newNorm) {
      const label = QUESTION_LABELS[key] || key;
      changed.push({
        key,
        label,
        oldVal: oldNorm,
        newVal: newNorm,
      });
    }
  }

  return changed;
}

/**
 * Build a human-readable description for a questionnaire save event.
 * @param {string} section
 * @param {Array<{key: string, label: string, oldVal: string|null, newVal: string|null}>} changedItems
 * @param {string} budgetType
 */
export function describeQuestionnaireChange(section, changedItems, budgetType) {
  const sectionLabel = SECTION_LABELS[section] || section;
  const budgetLabel  = budgetType === 'design' ? 'Design Budget' : 'Conceptual Budget';

  if (changedItems.length === 0) {
    return `Saved ${sectionLabel} section (no changes detected)`;
  }
  if (changedItems.length === 1) {
    const { label, oldVal, newVal } = changedItems[0];
    return `Updated **${label}**: ${oldVal || '(blank)'} → ${newVal || '(blank)'} in ${sectionLabel} · ${budgetLabel}`;
  }
  if (changedItems.length <= 3) {
    return `Updated ${changedItems.map(i => `**${i.label}**`).join(', ')} in ${sectionLabel} · ${budgetLabel}`;
  }
  return `Updated ${changedItems.length} answers in ${sectionLabel} · ${budgetLabel}`;
}
