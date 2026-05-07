/**
 * Parser for ILC Studios Conceptual Budget Excel files.
 *
 * Key design:
 * - Finds the ANSWER column dynamically from the header row rather than
 *   assuming a fixed column index, so it's immune to column variations
 *   between file versions.
 * - Uses row-label search (regex on question text) rather than fixed row
 *   indices, so it's immune to extra rows in different versions.
 * - All string comparisons use lowercase, so case variations don't matter.
 */

// ── String helpers ─────────────────────────────────────────────────────────────
function str(v)  { return String(v == null ? '' : v).trim(); }
function low(v)  { return str(v).toLowerCase(); }
function num(v)  { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; }

// ── Row finder ─────────────────────────────────────────────────────────────────
// Searches an array of rows; returns the first row where row[colIdx] matches pattern.
function findRow(data, pattern, colIdx = 0) {
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  return data.find(row => Array.isArray(row) && re.test(str(row[colIdx]))) || null;
}

// ── Answer-to-key mapping ──────────────────────────────────────────────────────

function mapBuildingType(v) {
  const s = low(v);
  if (s.includes('high rise') || s.includes('12+'))                        return 'highRise';
  if (s.includes('mid rise')  || s.includes('5-11') || s.includes('5–11')) return 'midRise';
  if (s.includes('podium'))                                                  return 'podium';
  if (s.includes('wrap'))                                                    return 'wrap';
  if (s.includes('gurban') || s.includes('urban garden'))                   return 'gurban';
  if (s.includes('stacked'))                                                 return 'stackedFlats';
  if (s.includes('town'))                                                    return 'townHouses';
  if (s.includes('garden'))                                                  return 'garden';
  if (s.includes('single'))                                                  return 'singleFamily';
  return 'midRise';
}

function mapUndercabinet(v) {
  const s = low(v);
  if (!s || s === 'none' || s === 'no') return 'none';
  if (s.includes('low voltage') || s.includes('lv'))  return 'lowVoltage';
  if (s.includes('line voltage') || s.includes('120v')) return 'lineVoltage';
  return 'none';
}

function mapKitchenPendants(v) {
  const s = low(v);
  if (!s || s === 'none' || s.includes('no pendant') || s === 'no') return 'none';
  if (s.includes('3') && s.includes('small') && s.includes('medium')) return 'threeSmallMedium';
  if (s.includes('3') && s.includes('small') && s.includes('low'))    return 'threeSmallLow';
  if (s.includes('3') && s.includes('small'))                         return 'threeSmallMedium';
  if (s.includes('linear'))                                            return 'oneLinear';
  if (s.includes('large'))                                             return 'oneLarge';
  if (s.includes('2') && s.includes('medium') && s.includes('low'))   return 'twoMediumLow';
  if (s.includes('2') && s.includes('medium'))                        return 'twoMediumMedium';
  if (s.includes('2') && s.includes('pendant'))                       return 'twoMediumMedium';
  if (s.includes('pendant'))                                           return 'twoMediumMedium';
  return 'none';
}

function mapFans(v) {
  const s = low(v);
  if (!s || s === 'none' || s === 'no') return 'none';
  const hasMaster    = s.includes('master');
  const hasSecondary = s.includes('secondary');
  const hasTertiary  = s.includes('tertiar');
  const hasLiving    = s.includes('living');
  if (hasMaster && hasSecondary && hasTertiary && hasLiving) return 'masterSecondaryTertiaryLiving';
  if (hasMaster && hasSecondary && hasTertiary)              return 'masterSecondaryTertiary';
  if (hasMaster && hasSecondary && hasLiving)                return 'masterSecondaryLiving';
  if (hasMaster && hasSecondary)                             return 'masterAndSecondary';
  if (hasMaster && hasLiving)                                return 'masterAndLiving';
  if (hasLiving)                                             return 'livingRoomOnly';
  if (hasMaster)                                             return 'masterOnly';
  return 'none';
}

function mapVanity(v) {
  const s = low(v);
  if (!s) return 'bathBarLow';
  const isIllum  = s.includes('illuminated') || (s.includes('mirror') && !s.includes('bath bar'));
  const isHigh   = s.includes('high');
  const isMedium = s.includes('medium') || s.includes('med');
  if (isIllum && isHigh)   return 'illuminatedMirrorHigh';
  if (isIllum && isMedium) return 'illuminatedMirrorMedium';
  if (isIllum)             return 'illuminatedMirrorLow';
  if (s.includes('bath bar') && isHigh)   return 'bathBarHigh';
  if (s.includes('bath bar') && isMedium) return 'bathBarMedium';
  return 'bathBarLow';
}

function mapBalcony(v) {
  const s = low(v);
  if (!s || s === 'none' || s === 'no' || s.includes('nothing')) return 'none';
  if (s.includes('5') && (s.includes('disk') || s.includes('surface'))) return 'disk5inch';
  if (s.includes('sconce') && s.includes('high'))   return 'sconceHigh';
  if (s.includes('sconce') && s.includes('medium')) return 'sconceMedium';
  if (s.includes('sconce') && s.includes('low'))    return 'sconcelow';
  if (s.includes('sconce'))                         return 'sconceMedium';
  return 'none';
}

function mapEmergency(v) {
  const s = low(v);
  if (!s) return 'integrated_inverters';
  if (s.includes('generator'))                                             return 'generator';
  if (s.includes('frogeye') && s.includes('inverter') && s.includes('battery')) return 'integrated_frogeyes';
  if (s.includes('frogeye') && s.includes('inverter'))                    return 'frogeyes_inv';
  if (s.includes('frogeye'))                                               return 'frogeyes';
  if (s.includes('central inverter'))                                      return 'inverters';
  return 'integrated_inverters';  // "battery + inverter" is most common
}

function mapInteriorAmenities(v) {
  const n = parseFloat(v) || 0;
  if (n <= 0)  return 'medium';  // blank default
  if (n <= 8)  return 'low';
  if (n <= 12) return 'medium';
  return 'high';
}

function mapCorridorSconce(v) {
  const s = low(v);
  if (!s || s === 'none' || s === 'no') return 'none';
  if (s.includes('integrated') || s.includes('unit number')) return 'integrated';
  if (s.includes('high'))   return 'high';
  if (s.includes('medium')) return 'medium';
  if (s.includes('low'))    return 'low';
  return 'none';
}

function mapExteriorAmenity(v) {
  const n = parseFloat(v) || 0;
  if (n <= 0)  return 'medium';  // blank default
  if (n <= 1)  return 'low';
  if (n <= 2)  return 'lowMedium';
  if (n <= 3)  return 'medium';
  return 'high';
}

function mapAmenityHours(v) {
  const s = low(v);
  if (s.includes('24') || s.includes('after dark') || s.includes('after sunset') ||
      s.includes('open after') || s.includes('sunrise')) return 'afterSunset';
  return 'beforeDusk';
}

function mapEnergyCredit(v) {
  return low(v).includes('yes') ? 'yes' : 'no';
}

// ── Main parser ────────────────────────────────────────────────────────────────

export function parseConceptualBudgetXlsx(XLSX, buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const warnings = [];

  function getSheet(namePattern) {
    const re = new RegExp(namePattern, 'i');
    const name = wb.SheetNames.find(n => re.test(n));
    if (!name) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
  }

  const qRows  = getSheet('^Questionnaire$');
  const pdRows = getSheet('^Project Data$');
  const cfRows = getSheet('Client facing');

  if (!qRows.length && !pdRows.length) {
    throw new Error(
      'Could not find Questionnaire or Project Data sheets. Is this an ILC conceptual budget file?'
    );
  }

  // ── Dynamically find the ANSWER column in the Questionnaire sheet ──────────
  // Look for the header row that has a cell containing exactly "ANSWER"
  let answerCol = 2;  // safe default
  const headerRow = qRows.find(row =>
    Array.isArray(row) && row.some(cell => /^ANSWER$/i.test(str(cell)))
  );
  if (headerRow) {
    const idx = headerRow.findIndex(cell => /^ANSWER$/i.test(str(cell)));
    if (idx !== -1) answerCol = idx;
  }

  // ── Project name & building type ──────────────────────────────────────────
  let projectName     = '';
  let buildingTypeRaw = '';

  const nameRow = findRow(qRows, /^PROJECT\s*NAME$/i, 0);
  if (nameRow) {
    projectName     = str(nameRow[1]);
    buildingTypeRaw = str(nameRow[3]);
  }

  // Fallback: "Client facing doc" "PROJECT: Name"
  if (!projectName && cfRows.length) {
    const cfNameRow = cfRows.find(r =>
      Array.isArray(r) && /^PROJECT\s*:/i.test(str(r[0]))
    );
    if (cfNameRow) projectName = str(cfNameRow[0]).replace(/^PROJECT\s*:\s*/i, '');
  }

  if (!projectName) warnings.push('Could not find project name — please enter it manually');

  const buildingType = mapBuildingType(buildingTypeRaw);

  // ── Questionnaire answers ─────────────────────────────────────────────────
  // Search col[1] (question text) and read from dynamically-found answerCol.

  const undercabinetRow  = findRow(qRows, /undercabinet|under.cabinet/i,         1);
  const pendantsRow      = findRow(qRows, /island pendant|kitchen.*pendant/i,     1);
  const fansRow          = findRow(qRows, /ceiling fan/i,                         1);
  const vanityRow        = findRow(qRows, /vanit|bathroom.*light|bathroom.*vanit/i, 1);
  const balconyRow       = findRow(qRows, /balcon/i,                              1);
  const emergencyRow     = findRow(qRows, /emergency.*egress|egress.*light/i,     1);
  const interiorAmRow    = findRow(qRows, /interior amenity.*sf|\$.*interior|interior.*\$/i, 1);
  const corridorRow      = findRow(qRows, /sconce.*unit|unit.*sconce|unit entry/i, 1);
  const extAmenRow       = findRow(qRows, /exterior amenity.*sf|\$.*exterior/i,  1);
  const amenHoursRow     = findRow(qRows, /amenity.*hour|operational hour|pool.*close|dusk/i, 1);
  const controlsRow      = findRow(qRows, /what type.*project|type of project/i, 1);
  const energyRow        = findRow(qRows, /energy credit|better.than.code/i,     1);

  function ans(row) { return row ? str(row[answerCol]) : ''; }

  const undercabinet    = mapUndercabinet(ans(undercabinetRow));
  const kitchenPendants = mapKitchenPendants(ans(pendantsRow));
  const fans            = mapFans(ans(fansRow));
  const vanity          = mapVanity(ans(vanityRow));
  const balcony         = mapBalcony(ans(balconyRow));
  const emergency       = mapEmergency(ans(emergencyRow));
  const interiorLevel   = mapInteriorAmenities(ans(interiorAmRow));
  const unitSconce      = mapCorridorSconce(ans(corridorRow));
  const amenityLevel    = mapExteriorAmenity(ans(extAmenRow));
  const amenityHours    = mapAmenityHours(ans(amenHoursRow));
  const energyCredit    = mapEnergyCredit(ans(energyRow));

  // ── Project Data fields ───────────────────────────────────────────────────
  // Summary rows: col[0]=label, col[2]=value (conceptual budget format)
  // Area SF rows: col[0]=label, col[1]=SF

  function pdNum(pattern, colIdx) {
    const row = findRow(pdRows, pattern, 0);
    return row ? num(row[colIdx]) : null;
  }

  const grossSf             = pdNum(/^TOTAL\s*(GROSS\s*)?SF$/i,              2);
  const numUnits            = pdNum(/^#\s*OF\s*(UNITS|ROOMS)/i,              2);
  const numBedrooms         = pdNum(/^#\s*OF\s*BEDROOMS/i,                   2);
  const numBalconies        = pdNum(/^#\s*OF\s*BALCONIES/i,                  2);
  const numBathrooms        = pdNum(/^#\s*OF\s*BATHROOMS/i,                  2);
  const numVanities         = pdNum(/^#\s*OF\s*VANITIES/i,                   2);
  const numEgressStairwells = pdNum(/^#\s*OF\s*(EGRESS\s*)?STAIRWELL/i,     2);
  const numSurfaceParking   = pdNum(/^#\s*OF\s*SURFACE\s*PARKING/i,          2);
  const numCarports         = pdNum(/^#\s*OF\s*CARPORTS/i,                   2);
  const numGarages          = pdNum(/ATTACHED.*DETACHED.*GARAGE|^#\s*OF.*GARAGE/i, 2);
  const exteriorAmenitySf   = pdNum(/^EXTERIOR\s*AMENITY\s*SF$/i,            2);
  const lotSf               = pdNum(/^LOT\s*SIZE\s*GROSS/i,                  2);
  const buildingFootprintSf = pdNum(/^BUILDING\s*FOOTPRINT/i,                2);

  // Individual area SF — these rows have SF in col[1]
  const unitsSf           = pdNum(/^UNITS$/i,            1);
  const garageSf          = pdNum(/^GARAGE$/i,           1);
  const bohSf             = pdNum(/^BOH/i,               1);
  const corridorSf        = pdNum(/^CORRIDOR/i,          1);
  const interiorAmenitySf = pdNum(/^INTERIOR\s*AMENITY/i, 1);

  // ── Assemble result ───────────────────────────────────────────────────────

  return {
    name:         projectName,
    buildingType,

    projectData: {
      grossSf, unitsSf, numUnits, numBedrooms, numBalconies,
      numBathrooms, numVanities, numEgressStairwells,
      numSurfaceParking, numCarports, numGarages,
      exteriorAmenitySf, corridorSf, interiorAmenitySf,
      garageSf, bohSf, lotSf, buildingFootprintSf,
    },

    responses: [
      { section: 'units',     questionKey: 'undercabinet',    answerValue: undercabinet    },
      { section: 'units',     questionKey: 'kitchenPendants', answerValue: kitchenPendants },
      { section: 'units',     questionKey: 'fans',            answerValue: fans            },
      { section: 'units',     questionKey: 'vanity',          answerValue: vanity          },
      { section: 'units',     questionKey: 'balcony',         answerValue: balcony         },
      { section: 'corridors', questionKey: 'unitSconce',      answerValue: unitSconce      },
      { section: 'amenities', questionKey: 'interiorLevel',   answerValue: interiorLevel   },
      { section: 'exterior',  questionKey: 'amenityLevel',    answerValue: amenityLevel    },
      { section: 'exterior',  questionKey: 'amenityHours',    answerValue: amenityHours    },
      { section: 'emergency', questionKey: 'strategy',        answerValue: emergency       },
      { section: 'controls',  questionKey: 'buildingType',    answerValue: buildingType    },
      { section: 'controls',  questionKey: 'energyCredit',    answerValue: energyCredit    },
    ],

    warnings,

    // Raw answer strings shown in the preview UI so you can verify the mapping
    rawAnswers: {
      buildingType:    buildingTypeRaw,
      undercabinet:    ans(undercabinetRow),
      kitchenPendants: ans(pendantsRow),
      fans:            ans(fansRow),
      vanity:          ans(vanityRow),
      balcony:         ans(balconyRow),
      emergency:       ans(emergencyRow),
      interiorAmenity: ans(interiorAmRow),
      corridorSconce:  ans(corridorRow),
      exteriorAmenity: ans(extAmenRow),
      amenityHours:    ans(amenHoursRow),
      energyCredit:    ans(energyRow),
    },
  };
}
