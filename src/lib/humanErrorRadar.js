/**
 * Human Error Radar — cross-document consistency checks.
 * Three engines: Quantity Radar, Specification Radar, Bid Radar.
 * No code knowledge required — purely data reconciliation.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseWatts(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

function normalizeCct(v) {
  if (!v) return null;
  const m = String(v).match(/\d{3,4}/);
  return m ? m[0] : null;
}

// Match a fixture type code to a takeoff key (same logic as other engines)
function matchTakeoffKey(typeCode, takeoffKeys) {
  if (!typeCode || !takeoffKeys?.length) return null;
  const code = typeCode.trim().toUpperCase();
  const exact = takeoffKeys.find(k => k.trim().toUpperCase() === code);
  if (exact) return exact;
  return takeoffKeys.find(k => {
    const ku = k.trim().toUpperCase();
    return ku.startsWith(code + ' ') || ku.startsWith(code + '-') || ku.startsWith(code + ',');
  }) ?? null;
}

// Extract a likely base type code from a takeoff key like "A - 6in Downlight" → "A"
function extractBaseCode(key) {
  const m = key.trim().match(/^([A-Za-z0-9]+)/);
  return m ? m[1].toUpperCase() : key.trim().toUpperCase();
}

// ── Quantity Radar ────────────────────────────────────────────────────────────
// Compares fixture types in the schedule vs. types counted in the takeoff.

export function runQuantityRadar(scheduleItems, takeoffData) {
  const mainItems = scheduleItems.filter(i => !i.isAlternate);
  const takeoffKeys = takeoffData ? Object.keys(takeoffData) : [];

  // Map each schedule type to its matched takeoff key
  const scheduleTypes = mainItems.map(item => {
    const matched = matchTakeoffKey(item.type, takeoffKeys);
    return {
      type:        item.type || '(no type)',
      description: item.description || null,
      location:    item.location || null,
      takeoffKey:  matched,
      qty:         matched != null ? takeoffData[matched] : null,
    };
  });

  // Schedule types with no takeoff match
  const missingFromTakeoff = scheduleTypes.filter(s => s.takeoffKey == null);

  // Takeoff keys with no schedule match (orphan counts)
  const scheduleCodes = new Set(mainItems.map(i => i.type?.trim().toUpperCase()).filter(Boolean));
  const orphanTakeoffKeys = takeoffKeys.filter(k => {
    const base = extractBaseCode(k);
    return !scheduleCodes.has(base) && !mainItems.some(i => {
      const code = i.type?.trim().toUpperCase();
      return code && (k.trim().toUpperCase() === code ||
        k.trim().toUpperCase().startsWith(code + ' ') ||
        k.trim().toUpperCase().startsWith(code + '-'));
    });
  });

  const hasIssues = missingFromTakeoff.length > 0 || orphanTakeoffKeys.length > 0;

  return {
    id:      'quantity-radar',
    title:   'Quantity Radar',
    subtitle: 'Schedule ↔ Takeoff reconciliation',
    status:  !takeoffData ? 'SKIP' : !mainItems.length ? 'SKIP' : hasIssues ? 'FLAG' : 'PASS',
    summary: !takeoffData
      ? 'No takeoff uploaded — upload a Countfire export to compare quantities'
      : !mainItems.length
        ? 'No fixture schedule — add fixture types to compare against takeoff'
        : hasIssues
          ? `${missingFromTakeoff.length} schedule type${missingFromTakeoff.length !== 1 ? 's' : ''} missing from takeoff · ${orphanTakeoffKeys.length} takeoff type${orphanTakeoffKeys.length !== 1 ? 's' : ''} missing from schedule`
          : `All ${mainItems.length} fixture types matched between schedule and takeoff`,
    matched: scheduleTypes.filter(s => s.takeoffKey != null),
    missingFromTakeoff,
    orphanTakeoffKeys: orphanTakeoffKeys.map(k => ({
      key: k,
      qty: takeoffData[k],
      suggestedMatch: (() => {
        const base = extractBaseCode(k);
        const close = mainItems.find(i => i.type?.trim().toUpperCase().startsWith(base));
        return close ? `Similar to Type ${close.type} in schedule?` : null;
      })(),
    })),
  };
}

// ── Specification Radar ───────────────────────────────────────────────────────
// Checks the schedule for internal contradictions.

export function runSpecificationRadar(scheduleItems) {
  const mainItems = scheduleItems.filter(i => !i.isAlternate);
  const issues = [];

  // 1. Duplicate type codes
  const typeCounts = {};
  for (const item of mainItems) {
    const t = item.type?.trim();
    if (!t) continue;
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > 1) {
      issues.push({
        severity: 'FLAG',
        type,
        title:   'Duplicate type code',
        message: `Type "${type}" appears ${count} times as a main fixture — should each have a unique type code`,
      });
    }
  }

  // 2. Same catalog number with different wattages
  const catMap = {};  // catalogNumber → [{type, wattage}]
  for (const item of mainItems) {
    const cat = item.catalogNumber?.trim();
    if (!cat) continue;
    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push({ type: item.type, wattage: parseWatts(item.wattage) });
  }
  for (const [cat, rows] of Object.entries(catMap)) {
    if (rows.length < 2) continue;
    const watts = rows.map(r => r.wattage).filter(w => w != null);
    const unique = new Set(watts);
    if (unique.size > 1) {
      issues.push({
        severity: 'FLAG',
        type: rows.map(r => r.type).join(', '),
        title: 'Catalog number wattage conflict',
        message: `Catalog "${cat}" appears on types ${rows.map(r => `${r.type}(${r.wattage ?? '?'}W)`).join(', ')} with different wattages — same catalog number cannot have different wattages`,
      });
    }
  }

  // 3. CCT inconsistency per location group
  const locationCcts = {};  // location → Set of CCT values
  for (const item of mainItems) {
    const loc = item.location?.trim();
    const cct = normalizeCct(item.cct);
    if (!loc || !cct) continue;
    if (!locationCcts[loc]) locationCcts[loc] = new Set();
    locationCcts[loc].add(cct);
  }
  for (const [loc, ccts] of Object.entries(locationCcts)) {
    if (ccts.size > 1) {
      issues.push({
        severity: 'WARN',
        type: `(${loc})`,
        title: 'CCT mix in same location',
        message: `Location "${loc}" has fixtures with ${[...ccts].join('K, ')}K — mixed CCT in one space is usually unintentional`,
      });
    }
  }

  // 4. Wattage looks suspiciously high (> 200W for a typical luminaire)
  for (const item of mainItems) {
    const w = parseWatts(item.wattage);
    if (w != null && w > 200) {
      issues.push({
        severity: 'WARN',
        type: item.type || '(no type)',
        title: 'Unusually high wattage',
        message: `${w}W on Type ${item.type || '?'} — verify this is per fixture, not total load (possible data entry error)`,
      });
    }
  }

  // 5. Missing description on main fixtures
  const noDesc = mainItems.filter(i => !i.description?.trim());
  if (noDesc.length > 0) {
    issues.push({
      severity: 'WARN',
      type: noDesc.map(i => i.type || '?').join(', '),
      title: 'Missing fixture description',
      message: `${noDesc.length} fixture type${noDesc.length !== 1 ? 's' : ''} have no description — schedule is incomplete`,
    });
  }

  const flags = issues.filter(i => i.severity === 'FLAG').length;
  const warns = issues.filter(i => i.severity === 'WARN').length;

  return {
    id:      'spec-radar',
    title:   'Specification Radar',
    subtitle: 'Schedule internal consistency',
    status:  !mainItems.length ? 'SKIP' : flags > 0 ? 'FLAG' : warns > 0 ? 'WARN' : 'PASS',
    summary: !mainItems.length
      ? 'No fixture schedule data to check'
      : flags > 0
        ? `${flags} conflict${flags !== 1 ? 's' : ''} found in fixture schedule — review before issuing`
        : warns > 0
          ? `${warns} warning${warns !== 1 ? 's' : ''} — schedule may be incomplete`
          : `No internal contradictions found across ${mainItems.length} fixture types`,
    issues,
  };
}

// ── Bid Radar ─────────────────────────────────────────────────────────────────
// Compares the latest bid matrix against the live fixture schedule.

export function runBidRadar(scheduleItems, bidMatrix, takeoffData) {
  if (!bidMatrix) {
    return {
      id: 'bid-radar', title: 'Bid Radar', subtitle: 'Bid matrix vs. schedule',
      status: 'SKIP',
      summary: 'No bid matrix yet — push the fixture schedule to Bid to enable this check',
      issues: [], missingFromBid: [], orphanBidItems: [], qtyMismatches: [],
    };
  }

  const mainItems = scheduleItems.filter(i => !i.isAlternate);
  const bidItems  = (bidMatrix.items ?? []).filter(i => !i.isArchived);
  const takeoffKeys = takeoffData ? Object.keys(takeoffData) : [];

  // Map schedule items by their id for fast lookup
  const schedById = new Map(mainItems.map(i => [i.id, i]));

  // 1. Schedule items missing from bid (sourceItemId not in any bid item)
  const bidSourceIds = new Set(bidItems.map(i => i.sourceItemId).filter(Boolean));
  const missingFromBid = mainItems.filter(i => !bidSourceIds.has(i.id));

  // 2. Bid items whose source schedule item no longer exists (orphan)
  const schedIds = new Set(mainItems.map(i => i.id));
  const orphanBidItems = bidItems.filter(i => i.sourceItemId && !schedIds.has(i.sourceItemId));

  // 3. Qty mismatches: bid matrix qty vs. takeoff qty
  const qtyMismatches = [];
  if (takeoffData) {
    for (const bidItem of bidItems) {
      if (bidItem.qty == null) continue;
      const typeCode = bidItem.type;
      const key = matchTakeoffKey(typeCode, takeoffKeys);
      if (!key) continue;
      const takeoffQty = takeoffData[key];
      if (takeoffQty == null) continue;
      const diff = bidItem.qty - takeoffQty;
      if (Math.abs(diff) > 0) {
        qtyMismatches.push({
          type:       typeCode,
          description: bidItem.description || null,
          bidQty:     bidItem.qty,
          takeoffQty,
          diff,
        });
      }
    }
  }

  // 4. Bid items needing review / missing pricing
  const needsReview  = bidItems.filter(i => i.rfqStatus === 'needsReview' || i.rfqStatus === 'pending');
  const noPricing    = bidItems.filter(i => (i.cnPerUnit == null || i.cnPerUnit === 0) && i.rfqStatus !== 'needsReview');

  const issues = [];

  if (missingFromBid.length > 0) {
    issues.push({
      severity: 'FLAG',
      title:    'Schedule types missing from bid matrix',
      items:    missingFromBid.map(i => ({ type: i.type, detail: i.description })),
      message:  `${missingFromBid.length} fixture type${missingFromBid.length !== 1 ? 's' : ''} in the schedule were not pushed to the bid matrix`,
    });
  }

  if (orphanBidItems.length > 0) {
    issues.push({
      severity: 'WARN',
      title:    'Bid items referencing deleted schedule rows',
      items:    orphanBidItems.map(i => ({ type: i.type, detail: i.description })),
      message:  `${orphanBidItems.length} bid item${orphanBidItems.length !== 1 ? 's' : ''} reference schedule rows that no longer exist — bid matrix may be stale`,
    });
  }

  if (qtyMismatches.length > 0) {
    issues.push({
      severity: 'FLAG',
      title:    'Quantity mismatch: bid vs. takeoff',
      items:    qtyMismatches.map(i => ({ type: i.type, detail: `Bid: ${i.bidQty} vs Takeoff: ${i.takeoffQty} (${i.diff > 0 ? '+' : ''}${i.diff})` })),
      message:  `${qtyMismatches.length} fixture type${qtyMismatches.length !== 1 ? 's' : ''} have different quantities in bid matrix vs. takeoff`,
    });
  }

  if (noPricing.length > 0) {
    issues.push({
      severity: 'WARN',
      title:    'Bid items missing pricing',
      items:    noPricing.map(i => ({ type: i.type, detail: i.description })),
      message:  `${noPricing.length} bid item${noPricing.length !== 1 ? 's' : ''} have no client net pricing — budget totals will be incomplete`,
    });
  }

  if (needsReview.length > 0) {
    issues.push({
      severity: 'WARN',
      title:    'Bid items flagged for review',
      items:    needsReview.map(i => ({ type: i.type, detail: i.rfqStatus })),
      message:  `${needsReview.length} bid item${needsReview.length !== 1 ? 's' : ''} have RFQ status "needs review" or "pending"`,
    });
  }

  const flags = issues.filter(i => i.severity === 'FLAG').length;
  const warns = issues.filter(i => i.severity === 'WARN').length;

  return {
    id:      'bid-radar',
    title:   'Bid Radar',
    subtitle: 'Bid matrix vs. schedule + takeoff',
    status:  flags > 0 ? 'FLAG' : warns > 0 ? 'WARN' : 'PASS',
    summary: flags > 0
      ? `${flags} discrepanc${flags !== 1 ? 'ies' : 'y'} between bid matrix and schedule/takeoff`
      : warns > 0
        ? `${warns} item${warns !== 1 ? 's' : ''} need attention before submitting bid`
        : `Bid matrix aligned with schedule${takeoffData ? ' and takeoff' : ''}`,
    matrixVersion: bidMatrix.version,
    matrixDate:    bidMatrix.createdAt,
    issues,
    missingFromBid,
    orphanBidItems,
    qtyMismatches,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function runHumanErrorRadar(scheduleItems, takeoffData, bidMatrix) {
  const quantity = runQuantityRadar(scheduleItems, takeoffData);
  const spec     = runSpecificationRadar(scheduleItems);
  const bid      = runBidRadar(scheduleItems, bidMatrix, takeoffData);

  const allStatuses = [quantity.status, spec.status, bid.status];
  const hasFlag = allStatuses.includes('FLAG');
  const hasWarn = allStatuses.includes('WARN');

  return {
    radars: [quantity, spec, bid],
    overallStatus: hasFlag ? 'FLAG' : hasWarn ? 'WARN' : 'PASS',
  };
}
