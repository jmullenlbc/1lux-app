import { accelaState, accelaSearchForm, accelaNextForm, accelaNextTarget, accelaRows, accelaWorthDetail, accelaDetail } from './permitRules.js';

/**
 * Accela Citizen Access portals (Salt Lake City first, Mike 10-8). No open
 * data, so this drives the public search page the way a browser does:
 *
 *   1. GET the search page for cookies and the ASP.NET view state.
 *   2. POST the search for one date window and permit type; ten rows a page.
 *   3. POST the "Next" postback until the last page.
 *   4. GET each promising permit's own page for its Job Value, use type,
 *      square footage and record status. A suite remodel never reaches $10M,
 *      so only rows that read like a building (accelaWorthDetail) are opened,
 *      and permits already saved are not opened again.
 *
 * Windows are walked oldest first and handed back one at a time, so the
 * caller can save each window and remember where it got to (pullCursorAt)
 * before Amplify's 30 s wall. A window cut by the deadline comes back with
 * `complete: false` and is walked again on the next slice.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function cookieHeader(headers) {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  return list.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

/** [{ start, end }] windows of `days`, oldest first, the last one ending at `until`. */
export function accelaWindows(since, until, days = 14) {
  const out = [];
  let start = new Date(since).getTime();
  const end = new Date(until).getTime();
  const step = Math.max(1, days) * 86400e3;
  while (start < end) {
    const stop = Math.min(start + step, end);
    out.push({ start: new Date(start), end: new Date(stop) });
    start = stop;
  }
  return out;
}

/**
 * Walks the windows. Yields `{ start, end, rows, complete }` per window; rows
 * carry the list fields plus jobValue, useType, sqft and status from the
 * permit's page. `known` is the set of permit numbers already saved.
 */
export async function* walkAccela(profile, since, until = new Date(), { known = new Set(), deadline = Infinity, timeoutMs = 8000, maxDetails = 60 } = {}) {
  const base = profile.layerUrl;
  const headers = (cookie, post) => ({
    'User-Agent': UA,
    Referer: base,
    ...(cookie ? { Cookie: cookie } : {}),
    ...(post ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
  });
  const timeLeft = () => Date.now() < deadline;

  for (const w of accelaWindows(since, until, profile.windowDays || 14)) {
    const out = { start: w.start, end: w.end, rows: [], complete: false };
    if (!timeLeft()) { yield out; return; }

    // 1. the page, for cookies and view state
    const home = await fetch(base, { headers: headers('', false), signal: AbortSignal.timeout(timeoutMs) });
    const homeHtml = await home.text();
    if (!home.ok) throw new Error(`Accela page ${home.status}`);
    const cookie = cookieHeader(home.headers);
    let state = accelaState(homeHtml);
    if (!state.__VIEWSTATE) throw new Error('Accela page carried no view state');

    // 2. the search, then 3. every next page
    let body = accelaSearchForm(profile, w.start, w.end, state);
    const listed = [];
    let cut = false;
    for (let page = 0; page < 60; page += 1) {
      if (!timeLeft()) { cut = true; break; }
      const res = await fetch(base, { method: 'POST', headers: headers(cookie, true), body, signal: AbortSignal.timeout(timeoutMs) });
      const html = await res.text();
      if (!res.ok) throw new Error(`Accela search ${res.status}`);
      listed.push(...accelaRows(html));
      const next = accelaNextTarget(html);
      if (!next) break;
      state = accelaState(html);
      body = accelaNextForm(profile, w.start, w.end, state, next);
    }

    // 4. the permit pages worth opening. A profile with noDetail (Salt Lake
    // planning: the page adds nothing) keeps every listed row as is; one
    // with openAll (Denver concept plans: the unit count is only on the
    // page) opens every record not saved yet.
    let opened = 0;
    for (const row of listed) {
      if (known.has(row.permitNumber)) continue;
      if (profile.noDetail) { out.rows.push({ ...row, url: row.url ? new URL(row.url, base).href : null }); continue; }
      if (!profile.openAll && !accelaWorthDetail(row)) continue;
      if (opened >= maxDetails) { cut = true; break; }
      if (!timeLeft()) { cut = true; break; }
      opened += 1;
      try {
        const res = await fetch(new URL(row.url, base).href, { headers: headers(cookie, false), signal: AbortSignal.timeout(timeoutMs) });
        const html = await res.text();
        if (!res.ok) continue;
        const d = accelaDetail(html);
        out.rows.push({ ...row, ...d, status: d.status || row.status, url: new URL(row.url, base).href });
      } catch (err) {
        // one permit page down is not a reason to drop the window
        out.rows.push({ ...row, jobValue: null, url: new URL(row.url, base).href });
      }
    }
    out.complete = !cut;
    yield out;
    if (cut) return;
  }
}
