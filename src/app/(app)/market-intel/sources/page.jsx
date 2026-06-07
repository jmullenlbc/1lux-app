'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const PROJECT_TYPE_LABELS = {
  MARKET_RATE:     'Market Rate',
  AFFORDABLE:      'Affordable',
  STUDENT_HOUSING: 'Student Housing',
  SENIOR_LIVING:   'Senior Living',
};

const SEED_SOURCES = [
  { name: 'Multifamily Dive',           feedUrl: 'https://www.multifamilydive.com/feeds/news/',                         siteUrl: 'https://www.multifamilydive.com',           projectTypes: ['MARKET_RATE'],                                               pollingFrequency: 'DAILY'  },
  { name: 'Multi-Housing News',         feedUrl: 'https://www.multihousingnews.com/feed/',                              siteUrl: 'https://www.multihousingnews.com',           projectTypes: ['MARKET_RATE','AFFORDABLE','STUDENT_HOUSING','SENIOR_LIVING'], pollingFrequency: 'DAILY'  },
  { name: 'CRE Daily',                  feedUrl: 'https://www.credaily.com/feed/',                                      siteUrl: 'https://www.credaily.com',                  projectTypes: ['MARKET_RATE'],                                               pollingFrequency: 'DAILY'  },
  { name: 'The Multifamily Journal',    feedUrl: 'https://themultifamilyjournal.com/feed/',                             siteUrl: 'https://themultifamilyjournal.com',          projectTypes: ['MARKET_RATE'],                                               pollingFrequency: 'DAILY'  },
  { name: 'MultifamilyBiz',             feedUrl: 'https://www.multifamilybiz.com/feed/',                                siteUrl: 'https://www.multifamilybiz.com',            projectTypes: ['MARKET_RATE','AFFORDABLE'],                                   pollingFrequency: 'DAILY'  },
  { name: 'NMHC News',                  feedUrl: 'https://www.nmhc.org/feed/',                                          siteUrl: 'https://www.nmhc.org',                      projectTypes: ['MARKET_RATE','STUDENT_HOUSING'],                             pollingFrequency: 'DAILY'  },
  { name: 'GlobeSt Multifamily',        feedUrl: 'https://www.globest.com/feed/?channel=multifamily',                   siteUrl: 'https://www.globest.com',                   projectTypes: ['MARKET_RATE'],                                               pollingFrequency: 'DAILY'  },
  { name: 'GlobeSt Student Housing',    feedUrl: 'https://www.globest.com/feed/?channel=student-housing',               siteUrl: 'https://www.globest.com',                   projectTypes: ['STUDENT_HOUSING'],                                           pollingFrequency: 'DAILY'  },
  { name: 'GlobeSt Senior Housing',     feedUrl: 'https://www.globest.com/feed/?channel=senior-housing',                siteUrl: 'https://www.globest.com',                   projectTypes: ['SENIOR_LIVING'],                                             pollingFrequency: 'DAILY'  },
  { name: 'Affordable Housing Finance', feedUrl: 'https://www.housingfinance.com/feed/',                                siteUrl: 'https://www.housingfinance.com',             projectTypes: ['AFFORDABLE'],                                                pollingFrequency: 'DAILY'  },
  { name: 'Multifamily & Affordable',   feedUrl: 'https://multifamilyaffordablehousing.com/feed/',                      siteUrl: 'https://multifamilyaffordablehousing.com',  projectTypes: ['MARKET_RATE','AFFORDABLE','SENIOR_LIVING','STUDENT_HOUSING'], pollingFrequency: 'DAILY'  },
  { name: 'NCSHA',                      feedUrl: 'https://www.ncsha.org/feed/',                                         siteUrl: 'https://www.ncsha.org',                     projectTypes: ['AFFORDABLE'],                                                pollingFrequency: 'WEEKLY' },
  { name: 'HUD News',                   feedUrl: 'https://www.hud.gov/rss/hud_news_rss.xml',                            siteUrl: 'https://www.hud.gov',                       projectTypes: ['AFFORDABLE'],                                                pollingFrequency: 'WEEKLY' },
  { name: 'NLIHC',                      feedUrl: 'https://nlihc.org/feed/',                                             siteUrl: 'https://nlihc.org',                         projectTypes: ['AFFORDABLE'],                                                pollingFrequency: 'WEEKLY' },
  { name: 'Affordable Housing News',    feedUrl: 'https://www.affordablehousingnews.com/feed/',                         siteUrl: 'https://www.affordablehousingnews.com',     projectTypes: ['AFFORDABLE'],                                                pollingFrequency: 'WEEKLY' },
  { name: "McKnight's Senior Living",   feedUrl: 'https://www.mcknightsseniorliving.com/feed/',                         siteUrl: 'https://www.mcknightsseniorliving.com',     projectTypes: ['SENIOR_LIVING'],                                             pollingFrequency: 'DAILY'  },
  { name: 'Argentum',                   feedUrl: 'https://www.argentum.org/feed/',                                      siteUrl: 'https://www.argentum.org',                  projectTypes: ['SENIOR_LIVING'],                                             pollingFrequency: 'WEEKLY' },
  { name: 'NIC Blog',                   feedUrl: 'https://www.nic.org/feed/',                                           siteUrl: 'https://www.nic.org',                       projectTypes: ['SENIOR_LIVING'],                                             pollingFrequency: 'WEEKLY' },
  { name: 'LeadingAge',                 feedUrl: 'https://www.leadingage.org/feed/',                                    siteUrl: 'https://www.leadingage.org',                projectTypes: ['SENIOR_LIVING','AFFORDABLE'],                                pollingFrequency: 'WEEKLY' },
  { name: 'REBusinessOnline',           feedUrl: 'https://rebusinessonline.com/feed/',                                  siteUrl: 'https://rebusinessonline.com',              projectTypes: ['STUDENT_HOUSING','MARKET_RATE'],                             pollingFrequency: 'DAILY'  },
  { name: 'Mile High CRE',             feedUrl: 'https://milehighcre.com/feed/',                                       siteUrl: 'https://milehighcre.com',                   projectTypes: ['MARKET_RATE'],                                               pollingFrequency: 'DAILY'  },
];

export default function MarketSourcesPage() {
  const [sources,   setSources]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [seeding,   setSeeding]   = useState(false);
  const [polling,   setPolling]   = useState(false);
  const [pollLog,   setPollLog]   = useState(null);

  async function loadSources() {
    setLoading(true);
    const res = await fetch('/api/market-intel/sources');
    if (res.ok) setSources(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadSources(); }, []);

  async function toggleActive(source) {
    await fetch(`/api/market-intel/sources/${source.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: !source.isActive }),
    });
    loadSources();
  }

  async function seedSources() {
    setSeeding(true);
    for (const s of SEED_SOURCES) {
      await fetch('/api/market-intel/sources', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(s),
      });
    }
    await loadSources();
    setSeeding(false);
  }

  async function runPoll() {
    setPolling(true);
    setPollLog(null);
    const res  = await fetch('/api/market-intel/poll', { method: 'POST' });
    const data = await res.json();
    setPollLog(data.log || data);
    setPolling(false);
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/market-intel" className="text-slate-400 hover:text-slate-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Market Sources</h1>
            <p className="text-sm text-slate-500">{sources.length} sources · {sources.filter(s => s.isActive).length} active</p>
          </div>
        </div>
        <div className="flex gap-2">
          {sources.length === 0 && (
            <button
              onClick={seedSources}
              disabled={seeding}
              className="px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
            >
              {seeding ? 'Seeding…' : 'Seed 20 Sources'}
            </button>
          )}
          <button
            onClick={runPoll}
            disabled={polling || sources.filter(s => s.isActive).length === 0}
            className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2"
          >
            {polling ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Polling…
              </>
            ) : 'Run Poll Now'}
          </button>
        </div>
      </div>

      {/* Poll result */}
      {pollLog && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-center gap-4">
          <span>✓ Poll complete</span>
          <span>Fetched: {pollLog.fetched}</span>
          <span>New: {pollLog.inserted}</span>
          <span>Skipped: {pollLog.skipped}</span>
          {pollLog.errors?.length > 0 && <span className="text-red-600">Errors: {pollLog.errors.length}</span>}
          <button onClick={() => setPollLog(null)} className="ml-auto text-green-600 hover:text-green-800">✕</button>
        </div>
      )}

      {/* Sources table */}
      {loading ? (
        <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="font-medium">No sources yet</p>
          <p className="text-xs mt-1">Click "Seed 20 Sources" to add the default RSS feeds</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Types</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Freq</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Poll</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sources.map(source => {
                const types = (() => { try { return JSON.parse(source.projectTypes || '[]'); } catch { return []; } })();
                return (
                  <tr key={source.id} className={source.isActive ? '' : 'opacity-50'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{source.name}</div>
                      <a href={source.siteUrl} target="_blank" rel="noreferrer"
                        className="text-xs text-slate-400 hover:text-amber-600 truncate block max-w-xs">
                        {source.siteUrl}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {types.map(t => (
                          <span key={t} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            {PROJECT_TYPE_LABELS[t] || t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{source.pollingFrequency}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {source.lastPolledAt ? new Date(source.lastPolledAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(source)}
                        className={`text-xs px-3 py-1 rounded-lg border font-medium transition-colors ${
                          source.isActive
                            ? 'border-slate-200 text-slate-500 hover:bg-slate-50'
                            : 'border-green-200 text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {source.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
