// The tax only change order. When a job's sales tax rate moves, every CO keeps the tax it printed
// and the difference lands here, on goods not delivered by the date the rate changed.
// Server only: it reads the database. The math lives in changeOrderProducts.js.

import { prisma } from '@/lib/db';
import { defaultCoTaxPct, nextCoNumber } from '@/lib/changeOrderRates';
import { coProducts } from '@/lib/changeOrderProductStart';
import { taxChangeLines, undeliveredBase } from '@/lib/changeOrderProducts';

const shipLines = (projectId) => prisma.shipmentLineItem.findMany({
  where: { isRemoved: false, shipment: { project_id: projectId } },
  select: {
    fixtureType: true, qty: true,
    shipment: { select: { deliveredDate: true } },
    deliveryEvents: { select: { deliveryDate: true, qtyReceived: true } },
  },
});

export async function taxChangePreview(projectId, { newPct, date, base = null }) {
  if (!Number.isFinite(newPct) || newPct < 0 || newPct > 1) {
    return { error: 'That tax rate is not a percent from 0 to 100, so nothing was saved. Fix the rate and try again. (CO_TAX_RATE)' };
  }
  const rateDate = new Date(date);
  if (!date || Number.isNaN(rateDate.getTime())) {
    return { error: 'That rate date is not a date, so nothing was saved. Pick the day the new rate took effect. (CO_TAX_DATE)' };
  }
  const oldPct = await defaultCoTaxPct(projectId);
  if (oldPct == null) {
    return { error: 'This job has no sales tax rate yet, so there is nothing to change from. Nothing was saved. Set the rate on the Budget first. (CO_TAX_NO_RATE)' };
  }
  if (oldPct === newPct) {
    return { error: 'That is already the rate on this job, so nothing was saved. (CO_TAX_SAME_RATE)' };
  }

  const [products, lines] = await Promise.all([coProducts(projectId), shipLines(projectId)]);
  const found = undeliveredBase(products, lines, rateDate);
  const typed = base == null || base === '' ? null : Number(base);
  if (typed != null && (!Number.isFinite(typed) || typed < 0)) {
    return { error: 'That dollar amount is not a number, so nothing was saved. Fix it or leave it blank to use what the Ship Schedule shows. (CO_TAX_BASE)' };
  }
  const useBase = typed ?? found.undelivered;
  return { oldPct, newPct, date: rateDate, ...found, base: useBase, lines: taxChangeLines({ base: useBase, oldPct, newPct, date: rateDate }) };
}

export async function createTaxChangeCO(projectId, { newPct, date, base = null, user }) {
  const preview = await taxChangePreview(projectId, { newPct, date, base });
  if (preview.error) return preview;

  const co = await prisma.changeOrder.create({
    data: {
      projectId,
      coNumber: await nextCoNumber(projectId),
      title: 'Sales Tax Rate Change',
      date: new Date(),
      notes: `${preview.lines[1].description}, replacing ${preview.lines[0].description} on goods not delivered by that date.`,
      salesTaxPct: 0, // the dollars are the tax, so nothing is taxed again
      taxChangeOldPct: preview.oldPct,
      taxChangeNewPct: preview.newPct,
      taxChangeDate: preview.date,
      taxChangeBase: preview.base,
      createdById: user.id,
      optionGroups: {
        create: [{
          label: 'Default', sortOrder: 0, isSelected: true, freightOverride: 0, warehousingOverride: 0,
          lineItems: {
            create: preview.lines.map((line, i) => ({
              sortOrder: i, fixtureType: 'Sales Tax', qty: 1, description: line.description, cnUnitPrice: line.dollars,
              isTaxLine: true, isOptionRow: false, isGroupSelected: false,
            })),
          },
        }],
      },
    },
  });
  return { co };
}
