/**
 * Reading the signature block at the bottom of an email.
 *
 * Pure heuristics, no database, no app imports. It finds the last sign-off
 * ("Thanks", "Best", "Regards", ...) or a two-hyphen separator, takes the lines after
 * it (at most 12), and reads a name, a title, a company, phone numbers, a
 * LinkedIn profile and a website out of them. Anything it cannot find is null.
 */

const SIGN_OFFS = [
  'thanks', 'thank you', 'many thanks', 'thanks again', 'best', 'all the best', 'best regards',
  'kind regards', 'warm regards', 'regards', 'cheers', 'sincerely', 'yours truly', 'talk soon',
  'take care', 'respectfully', 'cordially', 'v/r', 'thx',
];

const TITLE_WORDS = [
  'director', 'manager', 'vp', 'vice president', 'president', 'principal', 'engineer', 'architect',
  'designer', 'owner', 'partner', 'associate', 'sales', 'account', 'project', 'estimator',
  'superintendent', 'purchasing', 'founder', 'ceo', 'coo', 'cfo', 'cto', 'executive', 'coordinator',
  'specialist', 'lead', 'head of', 'consultant', 'representative', 'developer', 'analyst', 'officer',
];

const COMPANY_ENDINGS = [
  'inc', 'inc.', 'llc', 'l.l.c.', 'llp', 'corp', 'corp.', 'corporation', 'group', 'co', 'co.', 'ltd', 'ltd.',
  'company', 'architects', 'engineers', 'engineering', 'builders', 'construction', 'development',
  'developers', 'lighting', 'partners', 'properties', 'studio', 'studios', 'associates', 'design', 'homes',
  'contractors', 'electric', 'holdings', 'capital', 'investments', 'realty',
];

/** A simple tag strip for HTML bodies. Block tags become line breaks. */
export function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/td)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n');
}

const PHONE_RE = /(?:\+?1[\s.-]*)?\(?\b(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})\b/;

function isSignOff(line) {
  const l = line.toLowerCase().replace(/[,.!]+$/, '').trim();
  return SIGN_OFFS.includes(l);
}

function looksLikeTitle(line) {
  const l = ` ${line.toLowerCase()} `;
  return TITLE_WORDS.some(w => l.includes(` ${w} `) || l.includes(` ${w},`) || l.includes(` ${w}/`) || l.includes(`/${w} `));
}

function looksLikeCompany(line) {
  const words = line.toLowerCase().replace(/[,]/g, '').trim().split(/\s+/);
  const last = words[words.length - 1];
  return words.length >= 2 && COMPANY_ENDINGS.includes(last);
}

function looksLikeName(line) {
  const words = line.replace(/,.*$/, '').trim().split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (/\d|@|http|www\./i.test(line)) return false;
  return words.every(w => /^[A-Z][A-Za-z'.-]*$/.test(w) || /^(van|de|der|von|da|di|la|le)$/i.test(w));
}

/** The lines after the last sign-off or two-hyphen separator, at most 12. */
export function signatureLines(text, { senderName = null } = {}) {
  const lines = String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    // A two-hyphen separator (or a long dash, or a rule of underscores).
    if (/^-{2,}$/.test(l) || /^[20132014]+$/.test(l) || /^_{2,}$/.test(l)) { start = i + 1; break; }
    if (isSignOff(l)) { start = i + 1; break; }
    if (senderName && l.toLowerCase() === String(senderName).toLowerCase()) { start = i; break; }
  }
  if (start < 0) return [];
  return lines.slice(start, start + 12);
}

/**
 * @param bodyText plain text (or HTML when bodyHtml is not given and it looks like HTML)
 * @param opts.bodyHtml  the HTML body; used when bodyText is empty
 * @param opts.senderName the From name, which helps find where the block starts
 */
export function parseSignature(bodyText, { bodyHtml = null, senderName = null } = {}) {
  const empty = { name: null, title: null, company: null, phone: null, mobile: null, linkedInUrl: null, website: null };
  let text = String(bodyText ?? '');
  if (!text.trim() && bodyHtml) text = stripHtml(bodyHtml);
  else if (/<\s*(html|body|div|p|br)\b/i.test(text)) text = stripHtml(text);

  const lines = signatureLines(text, { senderName });
  if (!lines.length) return empty;

  const out = { ...empty };
  const rest = [];

  for (const raw of lines) {
    const line = raw.replace(/^[|•*·-]\s*/, '').trim();
    const lower = line.toLowerCase();

    const linkedIn = line.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i);
    if (linkedIn && !out.linkedInUrl) {
      out.linkedInUrl = /^https?:\/\//i.test(linkedIn[0]) ? linkedIn[0] : `https://${linkedIn[0].replace(/^www\./i, 'www.')}`;
      if (!/^https?:\/\/www\./i.test(out.linkedInUrl)) out.linkedInUrl = out.linkedInUrl.replace(/^https?:\/\//i, 'https://www.');
      continue;
    }

    if (PHONE_RE.test(line)) {
      // "O: 206-555-0100 | M: 206.555.0199": each number keeps its own label.
      const segments = line.split(/\s*[|\/•·]\s*|\s{2,}/).filter(s => PHONE_RE.test(s));
      for (const seg of segments) {
        const m = seg.match(PHONE_RE);
        const formatted = `(${m[1]}) ${m[2]}-${m[3]}`;
        const label = seg.slice(0, m.index);
        const isMobile = /\b(mobile|cell|mob|m)\s*[:.]?\s*$/i.test(label) || /\b(mobile|cell)\b/i.test(seg);
        if (isMobile) { if (!out.mobile) out.mobile = formatted; }
        else if (!out.phone) out.phone = formatted;
        else if (!out.mobile) out.mobile = formatted;
      }
      continue;
    }

    if (/@/.test(line) && !/linkedin/i.test(line)) continue; // their email, already known

    const site = line.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?:\/\S*)?/i);
    if (site && !/linkedin\.com/i.test(line) && (/^(https?:\/\/|www\.)/i.test(line) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(line))) {
      if (!out.website) out.website = site[0].replace(/^https?:\/\//i, '').replace(/\/$/, '');
      continue;
    }

    // "Project Manager, Trailhead Builders" on one line.
    const comma = line.indexOf(',');
    if (comma > 0 && !out.title) {
      const left = line.slice(0, comma).trim(), right = line.slice(comma + 1).trim();
      if (looksLikeTitle(left) && !looksLikeCompany(left)) {
        out.title = left;
        if (right && !out.company && !looksLikeTitle(right)) out.company = right;
        rest.push({ line: left, kind: 'title' });
        continue;
      }
    }
    if (!out.title && looksLikeTitle(line) && !looksLikeCompany(line)) { out.title = line; rest.push({ line, kind: 'title' }); continue; }
    if (!out.company && looksLikeCompany(line)) { out.company = line; continue; }
    if (!out.name && looksLikeName(line) && lower !== String(senderName ?? '').toLowerCase()) { out.name = line.replace(/,.*$/, '').trim(); continue; }
    if (!out.name && senderName && lower === String(senderName).toLowerCase()) { out.name = senderName; continue; }
    rest.push({ line, kind: 'other' });
  }

  // Company = the line right after the title, when no line said so itself.
  if (out.title && !out.company) {
    const i = rest.findIndex(r => r.kind === 'title');
    const next = rest[i + 1];
    if (next && next.kind === 'other' && !/\d/.test(next.line) && next.line.split(/\s+/).length <= 6) out.company = next.line;
  }
  if (!out.name && senderName) out.name = senderName;
  return out;
}
