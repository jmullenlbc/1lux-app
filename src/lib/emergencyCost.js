// Emergency lighting cost for one strategy — the ONE copy of this math.
// The engine (calculations.js), the Conceptual Emergency screen and the
// Design Emergency screen all call this, so the number on a screen cannot
// drift from the number in the budget. Client-safe: only reads master pricing.
//
// Garage batteries (Mike, 2026-09-12: "garage fixtures should get integrated
// batteries when there are garages and no generator"): every strategy except
// 'generator' backs the garage up with a battery in every other garage
// fixture — 1 fixture per 625 SF, half of them get a $120 battery. The rule is
// keyed off the strategy name, NOT the strategy's batteryGarage flag, because
// projects keep a frozen pricing snapshot whose flags predate this rule. When
// the batteries apply, the strategy's garage $/SF is not charged on top.

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
  const gRate = flat ?? num(strat.garagePerSf);

  const gSf = Math.max(0, num(garageSf));
  const garageBattery = strategyKey !== 'generator' && gSf > 0;

  const b = E.batteryGarage || {};
  const sfPerFixture   = num(b.sfPerFixture, 625) || 625;
  const fixtureEvery   = num(b.fixtureEvery, 2) || 2;
  const costPerFixture = num(b.costPerFixture, 120);
  const batteryCount = garageBattery ? Math.floor((gSf / sfPerFixture) / fixtureEvery) : 0;
  const batteryCost  = batteryCount * costPerFixture;

  const corridor = Math.max(0, num(corridorSf)) * cRate;
  const amenity  = Math.max(0, num(intAmenitySf)) * aRate;
  const garage   = garageBattery ? 0 : gSf * gRate;

  return {
    corridor, amenity, garage,
    garageBattery, batteryCount, batteryCost,
    sfPerFixture, fixtureEvery, costPerFixture,
    total: corridor + amenity + garage + batteryCost,
  };
}
