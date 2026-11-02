// Each product's running record across a job's change orders. Pure: the budget start and the COs
// are handed in, so the screen, the budget dropdown and the tax only CO all read the same numbers.
// Every CO shows on the timeline with its status; only an approved one moves the running numbers.

import { chosenLineItems, coLineTotal, priceChanged, productChanged } from './changeOrderTotals.js';
import { lineKind, wasNow } from './changeOrderLineKind.js';
import { cents, lineTotal, sumCents } from './money.js';

export const productKey = (type) => String(type ?? '').trim().toUpperCase();

const pct = (n) => `${Number((n * 100).toFixed(3))}%`;
const dayOf = (d) => {
  const when = new Date(d); // day only dates are UTC
  return `${when.getUTCMonth() + 1}/${when.getUTCDate()}/${String(when.getUTCFullYear()).slice(2)}`;
};

/** The job's product dollars, what had delivered by a date, and what had not. */
export function undeliveredBase(products, shipLines, date) {
  const cutoff = new Date(date).getTime();
  const onTime = (d) => !!d && new Date(d).getTime() <= cutoff;
  const priceOf = new Map(products.map((p) => [p.key, p.now.unitPrice ?? 0]));
  const total = sumCents(products.map((p) => p.dollars));
  const delivered = sumCents(shipLines.map((line) => {
    const received = (line.deliveryEvents || []).filter((e) => onTime(e.deliveryDate)).reduce((n, e) => n + (e.qtyReceived ?? 0), 0);
    const whole = onTime(line.shipment?.deliveredDate) ? line.qty : 0;
    return lineTotal(Math.min(Math.max(received, whole), line.qty), priceOf.get(productKey(line.fixtureType)) ?? 0);
  }));
  return { total, delivered, undelivered: Math.max(0, cents(total - delivered)) };
}

/** The two lines of a tax only CO: take off the old tax, put on the new. */
export function taxChangeLines({ base, oldPct, newPct, date }) {
  return [
    { description: `${pct(oldPct)} tax rate at contract`, dollars: -cents(base * oldPct) },
    { description: `${pct(newPct)} tax rate as of ${dayOf(date)}`, dollars: cents(base * newPct) },
  ];
}

const snapshot = (row) => ({
  qty: row.qty ?? 0,
  unitPrice: row.unitPrice ?? null,
  unitCost: row.unitCost ?? null,
  manufacturer: row.manufacturer ?? null,
  partNumber: row.partNumber ?? null,
  description: row.description ?? null,
});

export function runningProducts(start, cos, { startTaxPct = null } = {}) {
  const products = new Map();
  const alias = new Map(); // a type changed on a CO keeps its record under the old key
  const keyOf = (type) => {
    const key = productKey(type);
    return alias.get(key) ?? key;
  };

  for (const row of start) {
    const key = productKey(row.type);
    if (!key || products.has(key)) continue;
    products.set(key, {
      key, type: String(row.type).trim(), start: snapshot(row), now: snapshot(row),
      taxPct: startTaxPct, dollars: lineTotal(row.qty ?? 0, row.unitPrice ?? 0), fees: 0, events: [],
    });
  }

  const ordered = [...cos].sort((a, b) => String(a.coNumber).localeCompare(String(b.coNumber)));
  for (const co of ordered) {
    const approved = co.status === 'APPROVED';
    if (approved && co.taxChangeNewPct != null) for (const p of products.values()) p.taxPct = co.taxChangeNewPct;

    for (const li of chosenLineItems(co)) {
      if (li.isTaxLine) continue;
      const key = keyOf(li.wasFixtureType || li.fixtureType);
      if (!key) continue;
      let p = products.get(key);
      if (!p) {
        p = {
          key, type: String(li.fixtureType).trim(), start: null,
          now: snapshot({ qty: 0, unitPrice: li.cnUnitPrice, unitCost: li.originalDN, manufacturer: li.manufacturer, partNumber: li.partNumber, description: li.description }),
          taxPct: co.salesTaxPct ?? startTaxPct, dollars: 0, fees: 0, events: [],
        };
        products.set(key, p);
      }

      const dollars = coLineTotal(li);
      const moved = priceChanged(li) || productChanged(li);
      p.events.push({
        coId: co.id, coNumber: co.coNumber, title: co.title, date: co.date, status: co.status,
        kind: lineKind(li), qtyChange: li.isFee || (moved && li.qty > 0) ? 0 : (li.qty ?? 0), dollars, text: wasNow(li),
      });
      if (!approved) continue;

      if (li.isFee) {
        p.fees = cents(p.fees + dollars);
        continue;
      }
      p.dollars = sumCents([p.dollars, dollars]);
      if (!(moved && li.qty > 0)) p.now.qty += li.qty ?? 0;
      if (li.qty >= 0) {
        // A credit leaves the price and product as they were
        p.now.unitPrice = li.cnUnitPrice ?? p.now.unitPrice;
        p.now.unitCost = li.originalDN ?? p.now.unitCost;
        p.now.manufacturer = li.manufacturer ?? p.now.manufacturer;
        p.now.partNumber = li.partNumber ?? p.now.partNumber;
        p.now.description = li.description ?? p.now.description;
      }
      if (productKey(li.fixtureType) !== key && li.qty > 0) {
        alias.set(productKey(li.fixtureType), key);
        p.type = String(li.fixtureType).trim();
      }
    }
  }
  return [...products.values()];
}
