import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireIntakeReviewer } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { summariseVisits, visitOutcome, stepLabel, OUTCOME_LABELS } from '@/lib/intake/visits';

/**
 * Who has been on the public /conceptual_budget page (migration 0090).
 * Mike, 2026-09-16: "a button to a page on the Sales Dashboard menu page."
 * Mike, 2026-10-06: a tab on the Sales dashboard, not a button or a sidebar row.
 *
 * A visit is anonymous until that person saves a draft or sends a request.
 * Only then does a name appear here, and it is the name THEY typed. No IP
 * address or browser details are kept anywhere (see src/lib/intake/visits.js).
 */

export const VISIT_RANGES = [7, 30, 90];
const RECENT_ROWS = 100;
const BASE = '/dashboards/sales?tab=visitors';

const OUTCOME_STYLE = {
  submitted: 'bg-green-50 text-green-700 border-green-200',
  lead:      'bg-orange-50 text-orange-700 border-orange-200',
  browsed:   'bg-slate-50 text-slate-600 border-slate-200',
  looked:    'bg-white text-slate-400 border-slate-200',
};

const fmtWhen = d => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function minutesOnPage(v) {
  const mins = Math.round((new Date(v.lastSeenAt) - new Date(v.visitedAt)) / 60000);
  return mins < 1 ? 'under a minute' : `${mins} min`;
}

function Tile({ label, value, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-800 mt-0.5">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default async function VisitorsPanel({ days: rawDays }) {
  const { error } = await requireIntakeReviewer(cookies());
  if (error) {
    return (
      <div className="p-10 text-center text-sm text-slate-500">
        Budget page visitors are for admins and the Sales team.
      </div>
    );
  }

  const days = VISIT_RANGES.includes(Number(rawDays)) ? Number(rawDays) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Not on the automatic archive filter: archived rows are left out by hand.
  const rows = await prisma.conceptualVisit.findMany({
    where: { visitedAt: { gte: since }, archivedAt: null },
    orderBy: { visitedAt: 'desc' },
    select: {
      id: true, visitorKey: true, referrerHost: true, utmSource: true, utmMedium: true, utmCampaign: true,
      deviceKind: true, stepReached: true, stepIndex: true, visitedAt: true, lastSeenAt: true,
      draftId: true, submissionId: true,
      draft: { select: { firstName: true, lastName: true, company: true, projectName: true } },
      submission: { select: { id: true, submitterName: true, proposedName: true, client: { select: { name: true } } } },
    },
  });

  const s = summariseVisits(rows);
  const seenBefore = new Map();
  for (const v of rows) seenBefore.set(v.visitorKey, (seenBefore.get(v.visitorKey) || 0) + 1);
  const recent = rows.slice(0, RECENT_ROWS);
  const widest = Math.max(1, ...s.funnel.map(f => f.count));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Budget page visitors</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Everyone who opened the public conceptual budget page, how far they got, and where they came from.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {VISIT_RANGES.map(r => (
            <Link key={r} href={`${BASE}&days=${r}`}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${r === days ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Last {r} days
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Visits" value={s.visits} sub={`${s.visitors} different visitors`} />
        <Tile label="Came back" value={s.returning} sub="visitors seen more than once" />
        <Tile label="Left their details" value={s.leads} sub={`${s.leadPct}% of visits`} />
        <Tile label="Sent a request" value={s.submitted} sub={`${s.submittedPct}% of visits`} />
      </div>

      {s.visits === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          No visits in the last {days} days yet. Visits are counted from the day this page went live.
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-700">How far people get</h2>
              <p className="text-xs text-slate-500 mb-3">Visits that reached each step or further.</p>
              <div className="space-y-1.5">
                {s.funnel.map(f => (
                  <div key={f.stepId} className="flex items-center gap-2 text-xs">
                    <div className="w-28 shrink-0 text-slate-600">{f.label}</div>
                    <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden">
                      <div className="bg-orange-400 h-4 rounded" style={{ width: `${Math.round((f.count / widest) * 100)}%` }} />
                    </div>
                    <div className="w-16 shrink-0 text-right text-slate-500">{f.count} · {f.pct}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-700">Where they came from</h2>
              <p className="text-xs text-slate-500 mb-3">
                The site that sent them, or the campaign tag on the link. {s.byDevice.desktop} computer · {s.byDevice.mobile} phone · {s.byDevice.tablet} tablet.
              </p>
              <table className="w-full text-xs">
                <tbody>
                  {s.sources.slice(0, 12).map(src => (
                    <tr key={src.source} className="border-t border-slate-100">
                      <td className="py-1.5 text-slate-700">{src.source}</td>
                      <td className="py-1.5 text-right text-slate-500">{src.count}</td>
                      <td className="py-1.5 text-right text-slate-500 w-12">{src.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Recent visits</h2>
              <p className="text-xs text-slate-500">
                A name shows only once that person saved their details or sent a request.
                {rows.length > RECENT_ROWS ? ` Showing the latest ${RECENT_ROWS} of ${rows.length}.` : ''}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr>
                    <th className="px-4 py-2 font-semibold">When</th>
                    <th className="px-4 py-2 font-semibold">Who</th>
                    <th className="px-4 py-2 font-semibold">Came from</th>
                    <th className="px-4 py-2 font-semibold">Device</th>
                    <th className="px-4 py-2 font-semibold">Got as far as</th>
                    <th className="px-4 py-2 font-semibold">Time on page</th>
                    <th className="px-4 py-2 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(v => {
                    const outcome = visitOutcome(v);
                    const name = v.submission?.submitterName
                      || [v.draft?.firstName, v.draft?.lastName].filter(Boolean).join(' ') || null;
                    const company = v.submission?.client?.name || v.draft?.company || null;
                    const project = v.submission?.proposedName || v.draft?.projectName || null;
                    return (
                      <tr key={v.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{fmtWhen(v.visitedAt)}</td>
                        <td className="px-4 py-2">
                          {name ? (
                            <>
                              <div className="font-semibold text-slate-800">{name}</div>
                              <div className="text-slate-500">{[company, project].filter(Boolean).join(' · ')}</div>
                            </>
                          ) : (
                            <span className="text-slate-500">Anonymous{seenBefore.get(v.visitorKey) > 1 ? ' · returning' : ''}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {v.utmSource || v.referrerHost || 'Direct / typed in'}
                          {v.utmCampaign && <div className="text-slate-500">{v.utmCampaign}</div>}
                        </td>
                        <td className="px-4 py-2 text-slate-600 capitalize">{v.deviceKind === 'desktop' ? 'Computer' : v.deviceKind === 'mobile' ? 'Phone' : 'Tablet'}</td>
                        <td className="px-4 py-2 text-slate-600">{stepLabel(v.stepReached)}</td>
                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{minutesOnPage(v)}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${OUTCOME_STYLE[outcome]}`}>
                            {OUTCOME_LABELS[outcome]}
                          </span>
                          {v.submission?.id && (
                            <Link href={`/admin/intake?id=${v.submission.id}`} className="block mt-1 text-orange-600 hover:underline">Open request</Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
