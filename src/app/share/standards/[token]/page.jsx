import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { STANDARDS_SECTIONS, CCT_INTERIOR_AREAS, resolveAnswer } from '@/lib/standards-questions';
import { PLAYBOOK_CONTENT } from '@/lib/playbookContent';
import PlaybookContent from '@/components/PlaybookContent';
import StandardsShareTracker from './StandardsShareTracker';
import PrintButton from './PrintButton';

// Client-facing "how we work together" sections, in display order.
const WORK_SECTIONS = [
  { id: 'scope',      label: 'Introductions',       icon: '🤝' },
  { id: 'approvals',  label: 'Approvals',           icon: '✅' },
  { id: 'process',    label: 'Process',             icon: '🔄' },
  { id: 'timeframes', label: 'Expected Timeframes', icon: '⏱️' },
];

export const dynamic = 'force-dynamic'; // always reflect the client's current standards

export default async function StandardsSharePage({ params }) {
  const share = await prisma.clientStandardsShare.findUnique({
    where:   { token: params.token },
    include: { client: true },
  });
  if (!share) notFound();

  const client  = share.client;
  const answers = await prisma.clientStandardsAnswer.findMany({ where: { clientId: client.id } });

  // Global (default) resolution — projectType '' / region ''
  const rec   = (key) => resolveAnswer(answers, key, '', '');
  const val   = (key) => rec(key)?.answer_value || null;
  const note  = (key) => rec(key)?.answer_note  || null;

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Color Temperature ──
  const interiorCCT = val('cct_all_interior');
  const exteriorCCT = val('cct_exterior');
  const cctOverrides = CCT_INTERIOR_AREAS
    .map(a => ({ label: a.label, value: val(a.key) }))
    .filter(x => x.value && x.value !== interiorCCT);
  const hasCCT = interiorCCT || exteriorCCT || cctOverrides.length > 0;

  // ── Q&A sections (only those with answered questions) ──
  const sectionCards = STANDARDS_SECTIONS
    .filter(s => !s.isCCT && !s.isProcess && s.questions?.length)
    .map(s => ({
      key:   s.key,
      label: s.label,
      icon:  s.icon,
      rows:  s.questions
        .map(q => ({ label: q.label, value: val(q.key), note: note(q.key) }))
        .filter(r => r.value),
    }))
    .filter(card => card.rows.length > 0);

  const answeredAnything = hasCCT || sectionCards.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Branded top bar */}
      <div className="bg-navy-950 px-6 py-3 flex items-center justify-between print:hidden" style={{ backgroundColor: '#0f172a' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor">
              <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
            </svg>
          </div>
          <span className="text-white font-semibold text-sm">ILC Studios</span>
        </div>
        <PrintButton />
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <StandardsShareTracker token={params.token} />

        {/* Hero */}
        <div className="rounded-2xl p-6 mb-6 text-white" style={{ backgroundColor: '#0f172a' }}>
          <div className="text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>
            ILC Studios — Lighting Standards
          </div>
          <div className="text-3xl font-bold mb-1">{client.name}</div>
          <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>
            Standard lighting selections &amp; preferences · updated {today}
          </p>
        </div>

        {!answeredAnything && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">💡</div>
            <p className="text-sm font-medium text-slate-500">Standards are being prepared.</p>
            <p className="text-xs mt-1">Check back soon — this page updates live as selections are made.</p>
          </div>
        )}

        {/* Color Temperature */}
        {hasCCT && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <span>🌡️</span> Color Temperature
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
              {interiorCCT && (
                <div className="flex justify-between text-sm py-1 border-b border-slate-50">
                  <span className="text-slate-500">All Interior</span>
                  <span className="font-semibold text-slate-900">{interiorCCT}</span>
                </div>
              )}
              {exteriorCCT && (
                <div className="flex justify-between text-sm py-1 border-b border-slate-50">
                  <span className="text-slate-500">Exterior</span>
                  <span className="font-semibold text-slate-900">{exteriorCCT}</span>
                </div>
              )}
              {cctOverrides.map(o => (
                <div key={o.label} className="flex justify-between text-sm py-1 border-b border-slate-50">
                  <span className="text-slate-500">{o.label}</span>
                  <span className="font-semibold text-slate-900">{o.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Q&A sections */}
        {sectionCards.map(card => (
          <div key={card.key} className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <span>{card.icon}</span> {card.label}
            </h3>
            <div className="space-y-1.5">
              {card.rows.map(row => (
                <div key={row.label} className="flex flex-col sm:flex-row sm:justify-between gap-0.5 text-sm py-1.5 border-b border-slate-50">
                  <span className="text-slate-500 sm:w-56 shrink-0">{row.label}</span>
                  <span className="font-medium text-slate-900 sm:text-right">
                    {row.value}
                    {row.note && <span className="block text-xs text-slate-400 font-normal">{row.note}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* How We Work Together */}
        <div className="mt-8 mb-2">
          <h2 className="text-lg font-bold text-slate-900 mb-1">How We Work Together</h2>
          <p className="text-xs text-slate-400 mb-4">Our standard process for working with {client.name}.</p>
        </div>
        {WORK_SECTIONS.filter(s => PLAYBOOK_CONTENT[s.id]?.items?.length).map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <span>{s.icon}</span> {s.label}
            </h3>
            <PlaybookContent content={PLAYBOOK_CONTENT[s.id]} clientName={client.name} />
          </div>
        ))}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400 mb-3">
            Prepared by ILC Studios. These are standard preferences and may be tailored per project.
          </p>
          <p className="text-sm text-slate-500">
            Questions? Contact{' '}
            <a href="mailto:design@ilcstudios.com" className="text-amber-600 hover:underline">design@ilcstudios.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
