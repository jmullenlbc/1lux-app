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
