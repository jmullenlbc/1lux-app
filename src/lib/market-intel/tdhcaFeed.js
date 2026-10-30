import * as XLSX from 'xlsx';
import { tdhcaLatestLinks, tdhcaSheetRows } from './permitRules.js';

/**
 * Texas housing tax credit lists (TDHCA, Mike 10-29). No open-data layer:
 * each program page links dated spreadsheets, and the newest by name is read
 * whole on every poll so status changes (award, withdrawn) update the rows.
 * Four profiles (one per market) read the same files, so downloads are kept
 * for ten minutes and one run fetches each file once.
 */
const BASE = 'https://www.tdhca.texas.gov';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const TTL_MS = 10 * 60 * 1000;
const cache = new Map();

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function get(url, timeoutMs) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`TDHCA answered ${res.status} for ${url}`);
  return res;
}

/** Every row of the newest lists on the profile's pages, as tdhcaSheetRows gives them. */
export async function fetchTdhcaRows(profile, { timeoutMs = 20000 } = {}) {
  const rows = [];
  for (const page of profile.pages || []) {
    const links = await cached(`page ${page.url}`, async () => tdhcaLatestLinks(await (await get(page.url, timeoutMs)).text(), page.program));
    if (!links.length) throw new Error(`no ${page.program}% spreadsheet link found on ${page.url}`);
    for (const href of links) {
      const url = new URL(href, BASE).href;
      const sheet = await cached(url, async () => {
        const wb = XLSX.read(Buffer.from(await (await get(url, timeoutMs)).arrayBuffer()));
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
        return tdhcaSheetRows(aoa, page.program);
      });
      rows.push(...sheet);
    }
  }
  return rows;
}
