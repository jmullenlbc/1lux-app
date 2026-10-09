import { prisma } from '@/lib/db';
import { MACRO_SERIES, fredCsvUrl, parseFredCsv, latestAndYearAgo } from './macroSeries';

/**
 * Pull and read the national numbers (migration 0128). Each series is one
 * FRED CSV request for the last 14 months; rows go into MacroStat keyed on
 * series + date. The newest few rows are rewritten each pull because the
 * Census revises last month's starts and permits.
 */
const MONTHS_BACK  = 14;
const STALE_MS     = 20 * 3600e3;

export async function pullMacroStats({ deadline = Infinity, timeoutMs = 10000 } = {}) {
  const log = { pulled: [], errors: [], partial: false };
  const since = new Date(Date.now() - MONTHS_BACK * 30.5 * 86400e3);
  for (const s of MACRO_SERIES) {
    if (Date.now() > deadline) { log.partial = true; break; }
    try {
      // FRED's edge stalls requests whose User-Agent is not browser-like (10-9: every
      // series timed out from the live app; the same URL answered in 0.6 s as Mozilla).
      const res  = await fetch(fredCsvUrl(s.id, since), { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ILCStudiosBot/1.0; +market-intel)', 'Accept': 'text/csv,*/*' }, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      if (!res.ok) throw new Error(`FRED ${res.status}`);
      const rows = parseFredCsv(text);
      if (!rows.length) throw new Error('no rows');
      const now = new Date();
      await prisma.macroStat.createMany({ data: rows.map(r => ({ series: s.id, date: r.date, value: r.value, fetchedAt: now })), skipDuplicates: true });
      for (const r of rows.slice(-3)) {
        await prisma.macroStat.updateMany({ where: { series: s.id, date: r.date }, data: { value: r.value, fetchedAt: now } });
      }
      log.pulled.push({ series: s.id, rows: rows.length, latest: rows[rows.length - 1] });
    } catch (err) {
      log.errors.push({ series: s.id, error: err.message });
    }
  }
  return log;
}

/** True when nothing has been pulled in the last 20 hours. */
export async function macroStale() {
  const last = await prisma.macroStat.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { fetchedAt: true } });
  return !last || Date.now() - new Date(last.fetchedAt).getTime() > STALE_MS;
}

/**
 * What the strip shows: every series' latest value and the value a year ago,
 * plus our own two numbers from the permit feeds.
 */
export async function macroSnapshot() {
  const since = new Date(Date.now() - 400 * 86400e3);
  const rows  = await prisma.macroStat.findMany({ where: { date: { gte: since } }, orderBy: { date: 'asc' }, select: { series: true, date: true, value: true, fetchedAt: true } });
  const bySeries = new Map();
  let fetchedAt = null;
  for (const r of rows) {
    if (!bySeries.has(r.series)) bySeries.set(r.series, []);
    bySeries.get(r.series).push(r);
    if (!fetchedAt || r.fetchedAt > fetchedAt) fetchedAt = r.fetchedAt;
  }
  const stats = MACRO_SERIES.map(s => {
    const { latest, yearAgo } = latestAndYearAgo(bySeries.get(s.id) || []);
    return { id: s.id, label: s.label, unit: s.unit, cadence: s.cadence, blurb: s.blurb, latest: latest ? { date: latest.date, value: latest.value } : null, yearAgo: yearAgo ? { date: yearAgo.date, value: yearAgo.value } : null };
  });

  const d30  = new Date(Date.now() - 30 * 86400e3);
  const d365 = new Date(Date.now() - 365 * 86400e3);
  const base = { kind: 'PERMIT', reviewStatus: { not: 'DISMISSED' }, supersededById: null };
  const [permits30, units12] = await Promise.all([
    prisma.marketSignal.count({ where: { ...base, publishedAt: { gte: d30 } } }),
    prisma.marketSignal.aggregate({ where: { ...base, publishedAt: { gte: d365 }, unitCount: { not: null } }, _sum: { unitCount: true } }),
  ]);
  const ours = [
    { id: 'OUR_PERMITS_30', label: '$10M+ permits found', unit: 'count', cadence: 'daily', blurb: 'Permits of $10M or more our city feeds found in the last 30 days.', latest: { date: new Date(), value: permits30 }, yearAgo: null, note: 'last 30 days' },
    { id: 'OUR_UNITS_12',   label: 'Units in permits',    unit: 'count', cadence: 'daily', blurb: 'Housing units on the permits our feeds found in the last 12 months.', latest: { date: new Date(), value: units12._sum.unitCount || 0 }, yearAgo: null, note: 'last 12 months' },
  ];
  return { stats, ours, fetchedAt };
}
