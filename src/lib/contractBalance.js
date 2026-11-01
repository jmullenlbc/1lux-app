// The contract number. Project.contractValue stays the Original Contract as signed.
// Project.approvedCoTotal is the stored rollup of approved change orders, kept by
// changeOrderRollup.js, so a dashboard can read Current Contract without loading every
// change order line. Pure on purpose: pipeline.js runs in the browser.
import { sumCents } from './money.js';

export function currentContract(project) {
  const original = project?.contractValue ?? null;
  const added    = project?.approvedCoTotal ?? 0;
  if (original == null && !added) return null;
  return sumCents([original, added]);
}

// cos: [{ status, totalValue }], legacyFiles: [{ parsedAmount }] are the old PDFs that
// carry an amount and have no change order record behind them.
export function contractBalance({ originalContract, cos = [], legacyFiles = [] }) {
  const approvedCOTotal = sumCents(cos.filter(c => c.status === 'APPROVED').map(c => c.totalValue));
  const pendingCOTotal  = sumCents(cos.filter(c => c.status === 'SENT').map(c => c.totalValue));
  const legacyTotal     = sumCents(legacyFiles.map(f => f.parsedAmount));
  const approvedCoTotal = sumCents([approvedCOTotal, legacyTotal]);
  return {
    originalContract: originalContract ?? 0,
    approvedCOTotal,
    pendingCOTotal,
    legacyTotal,
    approvedCoTotal,
    currentContract: currentContract({ contractValue: originalContract, approvedCoTotal }) ?? 0,
  };
}
