import { houstonWindows, houstonReportForm, HOUSTON_EXPORT_FORM, houstonRows } from './permitRules.js';

/**
 * Houston "Sold (approved) Permits" report (Mike 10-8). No open-data layer
 * exists, so this drives the city's legacy WebFOCUS form the way a browser
 * does: POST the report for a date window (the server keeps the result in the
 * session), then POST the export and read the CSV back.
 *
 * Both calls need a browser User-Agent and the export needs a Referer, or the
 * server answers "no valid cgi request to process". Cookies from the first
 * answer (citrix_ns_id, JSESSIONID) go back on the second.
 *
 * The report has no issue date, so every row is stamped with the end of the
 * window it was found in. Windows are 90 days on the first pull and the usual
 * 14 days plus the gap on later polls, so a date is at most that far off.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function cookieHeader(headers) {
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  return list.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

/** Rows for every window between since and now, the way the arcgis/socrata feeds return rows. */
export async function fetchHoustonRows(profile, since, now = new Date(), { timeoutMs = 15000 } = {}) {
  const rows = [];
  for (const w of houstonWindows(since, now, profile.windowDays || 90)) {
    const report = await fetch(profile.layerUrl, {
      method:  'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    houstonReportForm(w.start, w.end),
      signal:  AbortSignal.timeout(timeoutMs),
    });
    const page = await report.text();
    if (!report.ok) throw new Error(`Houston report ${report.status}`);
    if (/FOC\d{3}\)/.test(page)) throw new Error(`Houston report error: ${(page.match(/\(FOC\d{3}\)[^<]{0,80}/) || [''])[0].trim()}`);
    const cookie = cookieHeader(report.headers);
    const exp = await fetch(profile.layerUrl, {
      method:  'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: profile.layerUrl, ...(cookie ? { Cookie: cookie } : {}) },
      body:    HOUSTON_EXPORT_FORM,
      signal:  AbortSignal.timeout(timeoutMs),
    });
    const csv = await exp.text();
    if (!exp.ok) throw new Error(`Houston export ${exp.status}`);
    if (/no valid cgi request|<html/i.test(csv.slice(0, 400))) throw new Error('Houston export answered a page, not CSV');
    rows.push(...houstonRows(csv, { issuedAt: w.end }));
  }
  return rows;
}
