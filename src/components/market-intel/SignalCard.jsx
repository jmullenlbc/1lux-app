'use client';
import { useState } from 'react';
import Link from 'next/link';

/**
 * One Market Intel signal: a news article or, since 0123, a city permit.
 * Shared by /market-intel and /market-intel/permits so both tabs tag, filter,
 * assign and review the same way (Mike 10-7).
 */
export const PROJECT_TYPE_LABELS = {
  MARKET_RATE:    'Market Rate',
  AFFORDABLE:     'Affordable',
  STUDENT_HOUSING:'Student Housing',
  SENIOR_LIVING:  'Senior Living',
};

export const SIGNAL_TYPE_META = {
  NEW_DEVELOPMENT: { label: 'New development', color: 'bg-green-100 text-green-700'  },
  RENOVATION:      { label: 'Renovation',      color: 'bg-teal-100 text-teal-700'   },
  // Pre-0125 name for a new development; rows read before then still carry it.
  GROUNDBREAKING:  { label: 'Groundbreaking', color: 'bg-green-100 text-green-700'  },
  FINANCING:       { label: 'Financing',       color: 'bg-blue-100 text-blue-700'   },
  ACQUISITION:     { label: 'Acquisition',     color: 'bg-purple-100 text-purple-700'},
  DEVELOPER_AWARD: { label: 'Award',           color: 'bg-amber-100 text-amber-700' },
  NEWS:            { label: 'News',            color: 'bg-slate-100 text-slate-600' },
  PERMIT:          { label: 'Permit',          color: 'bg-orange-100 text-orange-700' },
};

const SUPERSEDE_LABELS = { PERMIT: 'permit', CONCEPT: 'concept plan', ARTICLE: 'article' };

const ROLE_LABELS = { DEVELOPER: 'developer', OWNER: 'owner', INVESTOR: 'investor', GC: 'GC', ARCHITECT: 'architect', LENDER: 'lender' };
const TAG_STYLES  = {
  COMPANY: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  PROJECT: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  METRO:   'bg-teal-50 text-teal-700 hover:bg-teal-100',
  STATE:   'bg-teal-50 text-teal-700 hover:bg-teal-100',
};

function money(n) {
  if (!n) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function SignalCard({ signal, onUpdate, onTagClick, onAddToCrm, onFindOwner, salesUsers = [] }) {
  // Owner looked up on the web (0126): a permit names the builder, not the owner.
  const [finding, setFinding] = useState(false);
  async function findOwner() {
    if (!onFindOwner || finding) return;
    setFinding(true);
    try { await onFindOwner(signal.id); } finally { setFinding(false); }
  }
  const meta         = SIGNAL_TYPE_META[signal.signalType] || SIGNAL_TYPE_META.NEWS;
  const isPermit     = signal.kind === 'PERMIT';
  const developers   = (() => { try { return JSON.parse(signal.developerNames || '[]'); } catch { return []; } })();
  const isDismissed  = signal.reviewStatus === 'DISMISSED';
  const tagLinks     = signal.tags || [];
  // Hide the STATE chip when a METRO chip already names it ("Denver, CO").
  const metroStates  = new Set(tagLinks.filter(l => l.tag.kind === 'METRO').map(l => l.tag.name.split(',').pop()?.trim()));
  const chips        = tagLinks.filter(l => !(l.tag.kind === 'STATE' && metroStates.has(l.tag.name)));
  // Companies the feed named that are not in the CRM yet: each gets an Add button.
  const addable      = tagLinks.filter(l => l.tag.kind === 'COMPANY' && !l.tag.clientId);
  const [adding, setAdding] = useState('');
  const linkedChip   = ['AUTO_LINKED', 'CONFIRMED'].includes(signal.matchStatus) && signal.linkedClient;
  // One building, one count (0124): a permit beats a concept plan beats an article.
  const superseded   = !!(signal.supersededById && signal.supersededBy);

  async function addToCrm(tagId) {
    if (!onAddToCrm || adding) return;
    setAdding(tagId);
    try { await onAddToCrm(signal.id, tagId); } finally { setAdding(''); }
  }

  const when = signal.publishedAt ? new Date(signal.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'no date';

  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 transition-opacity ${isDismissed ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Title + type chips */}
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
              {meta.label}
            </span>
            {isPermit && signal.permitClass && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{signal.permitClass}</span>
            )}
            {signal.projectType && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {PROJECT_TYPE_LABELS[signal.projectType] || signal.projectType}
              </span>
            )}
            {signal.reviewStatus === 'REVIEWED' && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600">✓ Reviewed</span>
            )}
            {signal.projectRelated === false && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500" title="The reader said this article is not about a specific project, so it is hidden from the list">
                Not about a project
              </span>
            )}
            {superseded && (
              <a
                href={`${signal.supersededBy.kind === 'PERMIT' ? '/market-intel/permits' : '/market-intel'}?signal=${signal.supersededBy.id}`}
                title={signal.supersededBy.title}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100"
              >
                Superseded by {SUPERSEDE_LABELS[signal.supersededBy.kind] || 'a newer signal'}
              </a>
            )}
          </div>

          {signal.url ? (
            <a href={signal.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-800 hover:text-amber-600 transition-colors line-clamp-2">
              {signal.title}
            </a>
          ) : (
            <span className="text-sm font-semibold text-slate-800 line-clamp-2">{signal.title}</span>
          )}

          {/* Permit facts as a row of labelled values, not prose (0123). */}
          {isPermit ? (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-1.5 text-xs">
              {/* Units first: it matters more than the declared value (Mike 10-8). */}
              {signal.unitCount ? <div><dt className="text-slate-400">Units</dt><dd className="text-slate-700 font-medium">{signal.unitCount.toLocaleString()}</dd></div> : null}
              {signal.valuation ? <div><dt className="text-slate-400">Declared value</dt><dd className="text-slate-700">{money(signal.valuation)}</dd></div> : null}
              {signal.contractorName && <div><dt className="text-slate-400">Contractor</dt><dd className="text-slate-700">{signal.contractorName}</dd></div>}
              {signal.neighborhood && <div><dt className="text-slate-400">Neighborhood</dt><dd className="text-slate-700">{signal.neighborhood}</dd></div>}
              {signal.permitNumber && <div><dt className="text-slate-400">Permit</dt><dd className="text-slate-700 font-mono">{signal.permitNumber}</dd></div>}
            </dl>
          ) : signal.summary && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{signal.summary}</p>
          )}

          {/* Who is behind the permit, from the web (0126, Mike 10-8: "there is
              almost always something about that address"). The companies found
              are the chips below; this line is the page they came from. */}
          {isPermit && onFindOwner && (
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
              {signal.ownerLookupAt && signal.ownerSourceUrl ? (
                <>
                  <span className="text-slate-500">
                    Found on the web:{' '}
                    <a href={signal.ownerSourceUrl} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline">
                      {signal.ownerSourceTitle || signal.ownerSourceUrl.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
                    </a>
                  </span>
                  {signal.ownerLookupNote && <span className="text-slate-400 line-clamp-1">{signal.ownerLookupNote}</span>}
                </>
              ) : signal.ownerLookupAt ? (
                <span className="text-slate-400 italic">Nothing on the web about this address yet</span>
              ) : null}
              <button
                onClick={findOwner}
                disabled={finding}
                className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                title="Search the web for who is building at this address"
              >
                {finding ? 'Searching…' : signal.ownerLookupAt ? 'Search again' : 'Find the owner'}
              </button>
            </div>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="text-xs text-slate-400">
              {signal.source?.name} · {isPermit ? `issued ${when}` : when}
            </span>

            {/* Client match */}
            {linkedChip && (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5 group">
                <Link href={`/clients/${signal.linkedClient.id}`} className="hover:underline">
                  ✓ {signal.linkedClient.name}
                </Link>
                <button
                  onClick={() => onUpdate(signal.id, { linkedClientId: null, matchStatus: 'REJECTED' })}
                  className="opacity-0 group-hover:opacity-100 text-green-400 hover:text-red-600 transition-all ml-0.5"
                  title="Wrong match, reject"
                >✗</button>
              </span>
            )}
            {signal.matchStatus === 'SUGGESTED' && signal.linkedClient && (
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                Possible: {signal.linkedClient.name}?
                <button
                  onClick={() => onUpdate(signal.id, { linkedClientId: signal.linkedClientId })}
                  className="ml-1 hover:text-green-700" title="Confirm match"
                >✓</button>
                <button
                  onClick={() => onUpdate(signal.id, { linkedClientId: null, matchStatus: 'REJECTED' })}
                  className="hover:text-red-600" title="Reject match"
                >✗</button>
              </span>
            )}
            {signal.matchStatus === 'REJECTED' && (
              <span className="text-xs text-slate-300 italic">No match</span>
            )}
            {/* Project match is a separate claim from the client match, so each
                is confirmed or rejected on its own. */}
            {['AUTO_LINKED', 'CONFIRMED'].includes(signal.projectMatchStatus) && signal.linkedProject && (
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5 group">
                <Link href={`/projects/${signal.linkedProject.id}`} className="hover:underline">
                  ✓ {signal.linkedProject.name}
                </Link>
                <button
                  onClick={() => onUpdate(signal.id, { linkedProjectId: null })}
                  className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-red-600 transition-all ml-0.5"
                  title="Not this job, reject"
                >✗</button>
              </span>
            )}
            {signal.projectMatchStatus === 'SUGGESTED' && signal.linkedProject && (
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                Our job: {signal.linkedProject.name}?
                <button
                  onClick={() => onUpdate(signal.id, { linkedProjectId: signal.linkedProjectId })}
                  className="ml-1 hover:text-green-700" title="Yes, this is that job"
                >✓</button>
                <button
                  onClick={() => onUpdate(signal.id, { linkedProjectId: null })}
                  className="hover:text-red-600" title="No, different job"
                >✗</button>
              </span>
            )}
            {developers.length > 0 && !signal.linkedClient && signal.matchStatus !== 'REJECTED' && chips.length === 0 && (
              <span className="text-xs text-slate-400 italic">{developers.join(', ')}</span>
            )}
          </div>

          {/* Tag chips (0122): company, project, place, units. Click one to filter. */}
          {(chips.length > 0 || (signal.unitCount && !isPermit)) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {chips.map(l => (
                <button
                  key={l.tag.id}
                  onClick={() => onTagClick?.(l.tag)}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${TAG_STYLES[l.tag.kind] || TAG_STYLES.COMPANY}`}
                  title={`Show everything ${l.tag.kind === 'COMPANY' ? 'naming' : 'tagged'} ${l.tag.name}`}
                >
                  {l.tag.name}
                  {l.tag.kind === 'COMPANY' && l.role && ROLE_LABELS[l.role] ? <span className="opacity-60"> · {ROLE_LABELS[l.role]}</span> : null}
                  {l.tag.kind === 'COMPANY' && l.tag.clientId ? <span className="text-green-600"> ✓</span> : null}
                </button>
              ))}
              {/* Articles keep the units chip; a permit shows Units as a field above. */}
              {signal.unitCount && !isPermit ? (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                  {signal.unitCount.toLocaleString()} units
                </span>
              ) : null}
            </div>
          )}

          {/* Assign to a salesperson (bell notification), and Add to CRM for
              any named company that is not a client yet (Mike 10-7). */}
          {(salesUsers.length > 0 || (onAddToCrm && addable.length > 0)) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {salesUsers.length > 0 && (
                <select
                  value={signal.assignedToId || ''}
                  onChange={e => onUpdate(signal.id, { assignedToId: e.target.value || null })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">Assign to…</option>
                  {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
              {signal.assignedTo && signal.assignedAt && (
                <span className="text-[11px] text-slate-400">
                  since {new Date(signal.assignedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              {onAddToCrm && addable.map(l => (
                <button
                  key={l.tag.id}
                  onClick={() => addToCrm(l.tag.id)}
                  disabled={!!adding}
                  className="text-xs px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold disabled:opacity-50 whitespace-nowrap"
                  title={`Create a CRM client named ${l.tag.name} and link this ${isPermit ? 'permit' : 'article'} to it`}
                >
                  {adding === l.tag.id ? 'Adding…' : `+ Add ${l.tag.name} to CRM`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isDismissed && signal.reviewStatus !== 'REVIEWED' && (
          <div className="flex gap-1.5 shrink-0">
            {signal.projectRelated === false && (
              <button
                onClick={() => onUpdate(signal.id, { projectRelated: true })}
                title="Show this article in the list again and read its tags"
                className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 whitespace-nowrap"
              >
                Keep it
              </button>
            )}
            {superseded && (
              <button
                onClick={() => onUpdate(signal.id, { supersededById: null })}
                title="Count this one in the forecast again"
                className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 whitespace-nowrap"
              >
                Not the same building
              </button>
            )}
            <button
              onClick={() => onUpdate(signal.id, { reviewStatus: 'REVIEWED' })}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 whitespace-nowrap"
            >
              Mark reviewed
            </button>
            <button
              onClick={() => onUpdate(signal.id, { reviewStatus: 'DISMISSED' })}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
            >
              Dismiss
            </button>
          </div>
        )}
        {isDismissed && (
          <button
            onClick={() => onUpdate(signal.id, { reviewStatus: 'UNREVIEWED' })}
            className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 shrink-0"
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
