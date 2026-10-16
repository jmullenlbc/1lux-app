// Emergency lighting cost for one strategy — the ONE copy of this math.
// The engine (calculations.js), the Conceptual Emergency screen and the
// Design Emergency screen all call this, so the number on a screen cannot
// drift from the number in the budget. Client-safe: only reads master pricing.
//
// Garage (Mike 10-2: every choice needs its own cost). Only the two
// "Integrated batteries in garage" strategies put a battery in every other
// garage fixture: 1 fixture per 625 SF, half of them get a $120 battery.
// Mike 10-16 (Option 2): every other strategy except 'generator' lights the
// garage with frogeyes along the DRIVE AISLES: garage SF / aisle width (6 ft,
// Mike 10-16) = feet of aisle, one frogeye every 25 ft, $25 each
// (emergency.garageAisle). A 156,000 SF garage = 26,000 ft = 1,040 = $26,000. Keyed off the
// strategy NAME, NOT the batteryGarage flag, because projects keep frozen
// pricing snapshots. A snapshot with no garageAisle block keeps the old rule
// (garage at the corridor $/SF) so old budgets do not move.

const num = (v, d = 0) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : d;
};

export function emergencyStrategyCost(P, strategyKey, { corridorSf = 0, intAmenitySf = 0, garageSf = 0 } = {}) {
  const E = P?.emergency || {};
  const strategies = E.strategies || {};
  const strat = strategies[strategyKey] || strategies.frogeyes || {};

  // Frogeyes everywhere uses one flat $/SF (editable: emergency.frogeyesPerSf).
  const flat = strategyKey === 'frogeyes' ? num(E.frogeyesPerSf, 0.17) : null;
  const cRate = flat ?? num(strat.corridorPerSf);
  const aRate = flat ?? num(strat.amenityPerSf);

  const gSf = Math.max(0, num(garageSf));
  const garageBattery = strategyKey.startsWith('integrated_') && gSf > 0;

  const b = E.batteryGarage || {};
  const sfPerFixture   = num(b.sfPerFixture, 625) || 625;
  const fixtureEvery   = num(b.fixtureEvery, 2) || 2;
  const costPerFixture = num(b.costPerFixture, 120);
  const batteryCount = garageBattery ? Math.floor((gSf / sfPerFixture) / fixtureEvery) : 0;
  const batteryCost  = batteryCount * costPerFixture;

  // Garage frogeyes by drive-aisle length (Option 2). Only when the price
  // sheet carries the garageAisle block; older snapshots fall back below.
  const A = E.garageAisle;
  const aisleWidthFt = num(A?.aisleWidthFt, 6) || 6;
  const spacingFt    = num(A?.spacingFt, 25) || 25;
  const costEach     = num(A?.costEach, 25);
  const garageAisle  = !!A && !garageBattery && strategyKey !== 'generator' && gSf > 0;
  const garageFt     = garageAisle ? gSf / aisleWidthFt : 0;
  const garageFrogeyeCount = garageAisle ? Math.ceil(garageFt / spacingFt) : 0;

  // Old rule (no garageAisle block on a frozen snapshot): garage at the
  // corridor $/SF unless the strategy carries its own garage $/SF.
  const garageRate = strategyKey === 'generator' ? 0 : (num(strat.garagePerSf) > 0 && flat == null ? num(strat.garagePerSf) : cRate);

  const corridor = Math.max(0, num(corridorSf)) * cRate;
  const amenity  = Math.max(0, num(intAmenitySf)) * aRate;
  const garage   = garageBattery ? 0 : (garageAisle ? garageFrogeyeCount * costEach : gSf * garageRate);

  return {
    corridor, amenity, garage,
    garageBattery, batteryCount, batteryCost,
    sfPerFixture, fixtureEvery, costPerFixture,
    garageAisle, garageFt, garageFrogeyeCount, garageFrogeyeEach: costEach, aisleWidthFt, spacingFt,
    total: corridor + amenity + garage + batteryCost,
  };
}
