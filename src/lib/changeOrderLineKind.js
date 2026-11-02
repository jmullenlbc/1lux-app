// What a CO line is, read from what was done on it. Nobody picks a kind.
// Pure: the CO screen, the PDF and the share link all use it. Never prints a buy price.

import { priceChanged, productChanged } from './changeOrderTotals.js';

const usd = (n) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const units = (n) => `${n} unit${n === 1 ? '' : 's'}`;
const text = (v) => String(v ?? '').trim();

function specChanged(li) {
  return text(li.description).toLowerCase() !== text(li.wasDescription).toLowerCase() || !!text(li.notes);
}

export function lineKind(li) {
  if (li.isTaxLine) return 'Sales tax';
  if (li.isFee) return 'Restocking fee';
  const qty = li.qty ?? 0;
  if (!li.fromBudget) return qty < 0 ? 'Credit' : 'New product';
  if (qty < 0) return (li.wasQty ?? 0) + qty <= 0 ? 'Removed' : 'Quantity reduced';
  if (productChanged(li)) return 'Changed product';
  if (priceChanged(li)) return 'Price change';
  if (qty > 0) return 'Quantity added';
  if (specChanged(li)) return 'Spec change';
  return 'No change yet';
}

const productName = (type, mfr, part, showType) => {
  const name = [text(mfr), text(part)].filter(Boolean).join(' ');
  if (showType) return [text(type), name].filter(Boolean).join(' ');
  return name || text(type);
};

/** The Was and Now sentence for a changed line, or '' when there is nothing to compare. */
export function wasNow(li) {
  if (!li.fromBudget || li.isFee || li.isTaxLine) return '';
  const qty = li.qty ?? 0;
  const was = li.wasQty ?? 0;
  switch (lineKind(li)) {
    case 'Quantity added':
    case 'Quantity reduced':
    case 'Removed':
      return `Was ${was}, now ${was + qty}`;
    case 'Price change':
      return `Was ${usd(li.wasUnitPrice)}, now ${usd(li.cnUnitPrice)} on ${units(qty)}`;
    case 'Changed product': {
      const typeMoved = text(li.fixtureType).toLowerCase() !== text(li.wasFixtureType).toLowerCase();
      return `Was ${productName(li.wasFixtureType, li.wasManufacturer, li.wasPartNumber, typeMoved)}, now ${productName(li.fixtureType, li.manufacturer, li.partNumber, typeMoved)} on ${units(qty)}`;
    }
    case 'Spec change':
      if (text(li.description).toLowerCase() !== text(li.wasDescription).toLowerCase()) {
        return `Was ${text(li.wasDescription) || 'no description'}, now ${text(li.description) || 'no description'}`;
      }
      return text(li.notes);
    default:
      return '';
  }
}

/** The small line under a CO line's description: what kind it is, and Was and Now. */
export function lineNote(li) {
  const kind = lineKind(li);
  if (kind === 'No change yet') return '';
  return [kind, wasNow(li)].filter(Boolean).join(': ');
}

/** True when a credit refunds a different rate than the CO charges. */
export const creditAtOtherRate = (li, salesTaxPct) => li.creditTaxPct != null && (li.qty ?? 0) < 0 && li.creditTaxPct !== salesTaxPct;
