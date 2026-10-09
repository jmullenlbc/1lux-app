import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'ILC-Studios-MarketIntel/1.0' },
  customFields: {
    item: [['media:content', 'mediaContent'], ['content:encoded', 'contentEncoded']],
  },
});

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The visible text of an article page, for re-reading an article whose body
 * was never kept (Mike 10-9: tags from the headline alone are thin). Short
 * timeout and a size cap; '' on any failure so the caller falls back to the
 * summary. Browser-like User-Agent: many news sites refuse a bot one.
 */
export async function fetchArticleText(url, { timeoutMs = 6000, maxChars = 12000 } = {}) {
  if (!/^https?:\/\//i.test(String(url || ''))) return '';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'text/html' } });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return '';
    const html = (await res.text()).slice(0, 600000);
    const body = html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"');
    return stripHtml(body).slice(0, maxChars);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFeed(source) {
  try {
    const feed = await parser.parseURL(source.feedUrl);
    return feed.items.map(item => ({
      sourceId:   source.id,
      title:      item.title?.trim() || '',
      url:        item.link || item.guid || '',
      publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      rawContent: stripHtml(item.contentEncoded || item.content || item.summary || item.title || '').slice(0, 1500),
    }));
  } catch (err) {
    console.error(`[rss-fetcher] Failed to fetch ${source.name}: ${err.message}`);
    return [];
  }
}

export async function fetchAllFeeds(sources) {
  const results = await Promise.allSettled(
    // Permit feeds (sourceType ARCGIS_PERMITS, 0123) are not RSS; permits.js reads them.
    sources.filter(s => s.isActive && (s.sourceType || 'RSS') === 'RSS').map(s => fetchFeed(s))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);
}
