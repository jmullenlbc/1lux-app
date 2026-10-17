import Link from 'next/link';
import { buildingTypeLabel } from '@/lib/utils';
import { MIN_JOBS_TO_SUGGEST } from '@/lib/budgetAmounts';
import WidgetFrame, { WidgetEmpty } from '@/components/ui/WidgetFrame';
import { TH, TD, HELPER, STAT_VALUE } from '@/components/ui/tokens';

/**
 * How good are our guesses (Mike, 2026-10-03: "in 6 months maybe we have more
 * data to know how good our assumptions are and the system learns how to get
 * better"). Conceptual number vs the later Budget or Signed PO, by building
 * type. Read only: it points at what to look at; nothing changes by itself.
 */
const pct = v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const money = v => `$${Math.round(v).toLocaleString('en-US')}`;

export default function GuessAccuracyCard({ accuracy }) {
  const { jobs = [], types = [] } = accuracy || {};
  return (
    <WidgetFrame
      title="How Good Are Our Guesses"
      sub="Conceptual number vs the real one (Budget, or Signed PO when we have it). Plus means the real number came in higher than our guess."
      actions={(
        <span className={`${STAT_VALUE} shrink-0`}>{jobs.length}<span className={`${HELPER} font-normal`}> jobs</span></span>
      )}
    >
      {jobs.length === 0 ? (
        <WidgetEmpty>
          No job has both a conceptual number and a real one yet. This fills in as budgets and signed POs come in.
        </WidgetEmpty>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>Building type</th>
                <th className={`${TH} text-right`}>Jobs</th>
                <th className={`${TH} text-right`}>Typical gap</th>
                <th className={`${TH} text-right`}>Average miss</th>
                <th className={`${TH} pl-4`}>What it says</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {types.map(t => (
                <tr key={t.buildingType}>
                  <td className={`${TD} text-slate-800`}>{buildingTypeLabel(t.buildingType) || t.buildingType}</td>
                  <td className={`${TD} text-right tabular-nums`}>{t.jobs}</td>
                  <td className={`${TD} text-right tabular-nums font-semibold ${t.medianDiffPct > 0 ? 'text-red-600' : 'text-green-600'}`}>{pct(t.medianDiffPct)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{Math.round(t.avgMissPct * 100)}%</td>
                  <td className={`${TD} pl-4 text-xs text-slate-500`}>
                    {t.suggestion || (t.enough ? 'Close enough. No change needed.' : `Needs ${MIN_JOBS_TO_SUGGEST - t.jobs} more job${MIN_JOBS_TO_SUGGEST - t.jobs === 1 ? '' : 's'} before it says anything.`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details className="mt-4">
            <summary className="text-xs font-semibold text-orange-600 cursor-pointer">Biggest misses</summary>
            <ul className="mt-2 space-y-1">
              {jobs.slice(0, 10).map(j => (
                <li key={j.id} className="text-xs text-slate-600 flex justify-between gap-4">
                  <Link href={`/project/${j.id}`} className="text-orange-600 hover:underline truncate">{j.name}</Link>
                  <span className="shrink-0 tabular-nums">
                    {money(j.conceptual)} to {money(j.final)} ({j.finalTier === 'po' ? 'Signed PO' : 'Budget'}){' '}
                    <span className={j.diffPct > 0 ? 'text-red-600' : 'text-green-600'}>{pct(j.diffPct)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </WidgetFrame>
  );
}
