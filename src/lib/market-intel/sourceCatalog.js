/**
 * sourceCatalog.js — every news feed we know how to read, grouped by market.
 *
 * ── Why this file exists ──
 * The first twenty-one sources were national trade press: Multifamily Dive,
 * GlobeSt, HUD. Good papers, wrong papers. National CRE press writes about
 * REITs and portfolio transactions — it names companies, not buildings. A dry
 * run over the 191 articles already collected found ZERO that named one of our
 * jobs, because none of those outlets ever prints the words "Fulshear Lakes".
 *
 * The outlets that DO print a project's name are local: the city-desk paper,
 * the development blog, the council reporter, the builders exchange. So the
 * catalog is organised by MARKET, and adding a city later means adding a key to
 * MARKETS and its feeds to SOURCES — nothing else changes.
 *
 * ── Rules for adding a source ──
 * 1. It must have a working RSS/Atom feed. Every URL below was fetched and
 *    confirmed to return XML with items before it was added; sites that block
 *    robots (Denver Post, Colorado Real Estate Journal, bizjournals, The Real
 *    Deal) are left out however good the coverage is, because a feed that 403s
 *    is a source that quietly contributes nothing.
 * 2. It must name buildings. A business paper that only covers earnings adds
 *    noise and no matches.
 * 3. Frequency is about how much it publishes, not how much it matters. A daily
 *    feed polled weekly loses items; a weekly feed polled daily wastes calls.
 *
 * Import-free on purpose, so the seeder, the API and the page can all read the
 * same list without one of them dragging Prisma into the browser.
 */

/** Where a source reports from. Add a city here and below; nothing else. */
export const MARKETS = [
  { key: 'NATIONAL', label: 'National trade press', blurb: 'Industry-wide. Names companies more often than buildings.' },
  { key: 'DENVER',   label: 'Denver & Colorado',    blurb: 'Home market. Names buildings.' },
  { key: 'HOUSTON',  label: 'Houston',              blurb: 'Rice Village, Fulshear, Katy.' },
  { key: 'AUSTIN',   label: 'Austin',               blurb: 'Town Lake and the corridor.' },
  { key: 'DALLAS',   label: 'Dallas-Fort Worth',    blurb: 'DFW metroplex.' },
  { key: 'TEXAS',    label: 'Texas statewide',      blurb: 'Covers all Texas metros at once.' },
  // Mike 10-7: the metros we sell into next. Each feed below was fetched live
  // that day and returned items. Business Journals, Orlando Sentinel, Tampa
  // Bay Times, Florida Trend and The Real Deal block feed readers.
  { key: 'PHOENIX',      label: 'Phoenix',          blurb: 'Valley-wide. Rose Law Group and AZBEX name the developer and the parcel.' },
  { key: 'MIAMI',        label: 'Miami & South Florida', blurb: 'Miami-Dade, Broward, Palm Beach.' },
  { key: 'ORLANDO',      label: 'Orlando',          blurb: 'Central Florida.' },
  { key: 'TAMPA',        label: 'Tampa Bay',        blurb: 'Tampa, St. Pete, Clearwater.' },
  { key: 'JACKSONVILLE', label: 'Jacksonville',     blurb: 'Northeast Florida.' },
];

export const DEFAULT_MARKET = 'NATIONAL';

const ALL_TYPES = ['MARKET_RATE', 'AFFORDABLE', 'STUDENT_HOUSING', 'SENIOR_LIVING'];

/**
 * Feeds that used to be in the catalog and no longer publish.
 *
 * Every one of these was fetched live on 2026-08-24 with the app's own fetcher
 * and returned the failure noted below — not slow, not empty for a day, but
 * gone. A dead feed is not harmless: the poller waits ten seconds on each one
 * before giving up, so twelve of them added two minutes to every run and
 * contributed nothing.
 *
 * They are listed rather than deleted so that (a) nobody re-adds them next
 * year, and (b) the Sources page can point at the rows already sitting in the
 * database and offer to turn them off. Removing a row is not this file's job —
 * somebody may have notes on it.
 *
 * All twelve are national trade press, which is the category that never named
 * one of our jobs in 191 collected articles. Losing them costs coverage of
 * client news, not project news.
 */
export const RETIRED = [
  { name: 'Affordable Housing Finance', reason: 'feed returns 404' },
  { name: 'CRE Daily',                  reason: 'feed parses but has published nothing' },
  { name: 'GlobeSt Multifamily',        reason: 'feed returns 404' },
  { name: 'GlobeSt Senior Housing',     reason: 'blocked — 403' },
  { name: 'GlobeSt Student Housing',    reason: 'blocked — 403' },
  { name: 'HUD News',                   reason: 'feed returns 404' },
  { name: "McKnight's Senior Living",   reason: 'redirect loop' },
  { name: 'MultifamilyBiz',             reason: 'feed returns 404' },
  { name: 'NCSHA',                      reason: 'server error — 500' },
  { name: 'NIC Blog',                   reason: 'feed is not valid XML' },
  { name: 'NLIHC',                      reason: 'feed returns 404' },
  { name: 'NMHC News',                  reason: 'blocked — 406' },
];

/** Is this source one we have given up on? Matched the way the seeder matches. */
export function isRetired(name) {
  const key = String(name || '').trim().toLowerCase();
  return RETIRED.some(r => r.name.trim().toLowerCase() === key);
}

/**
 * Of the sources this database holds, which are retired and still switched on.
 * Takes the rows themselves because the answer depends on isActive, not just
 * on the name.
 */
export function retiredStillActive(rows = []) {
  return (rows || []).filter(r => r.isActive && isRetired(r.name));
}

/**
 * The full catalog. `name` is the identity — it is unique in the database and
 * is what the seeder matches on, so renaming an entry here creates a second
 * source rather than editing the first one.
 */
export const SOURCES = [
  // ── National trade press ─────────────────────────────────────────────────
  // What is left of the original twenty-one after a live check on 2026-08-24
  // found twelve of them dead (see RETIRED above). These eight are kept because
  // they still publish and are still the right place to learn that a developer
  // we sell to raised a fund — that is client news even when it is never job news.
  { name: 'Multifamily Dive',           market: 'NATIONAL', feedUrl: 'https://www.multifamilydive.com/feeds/news/',           siteUrl: 'https://www.multifamilydive.com',          projectTypes: ['MARKET_RATE'],                   pollingFrequency: 'DAILY'  },
  { name: 'Multi-Housing News',         market: 'NATIONAL', feedUrl: 'https://www.multihousingnews.com/feed/',                siteUrl: 'https://www.multihousingnews.com',         projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY'  },
  { name: 'The Multifamily Journal',    market: 'NATIONAL', feedUrl: 'https://themultifamilyjournal.com/feed/',               siteUrl: 'https://themultifamilyjournal.com',        projectTypes: ['MARKET_RATE'],                   pollingFrequency: 'DAILY'  },
  { name: 'Multifamily & Affordable',   market: 'NATIONAL', feedUrl: 'https://multifamilyaffordablehousing.com/feed/',        siteUrl: 'https://multifamilyaffordablehousing.com', projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY'  },
  { name: 'Affordable Housing News',    market: 'NATIONAL', feedUrl: 'https://www.affordablehousingnews.com/feed/',           siteUrl: 'https://www.affordablehousingnews.com',    projectTypes: ['AFFORDABLE'],                    pollingFrequency: 'WEEKLY' },
  { name: 'Argentum',                   market: 'NATIONAL', feedUrl: 'https://www.argentum.org/feed/',                        siteUrl: 'https://www.argentum.org',                 projectTypes: ['SENIOR_LIVING'],                 pollingFrequency: 'WEEKLY' },
  { name: 'LeadingAge',                 market: 'NATIONAL', feedUrl: 'https://www.leadingage.org/feed/',                      siteUrl: 'https://www.leadingage.org',               projectTypes: ['SENIOR_LIVING','AFFORDABLE'],    pollingFrequency: 'WEEKLY' },
  { name: 'REBusinessOnline',           market: 'NATIONAL', feedUrl: 'https://rebusinessonline.com/feed/',                    siteUrl: 'https://rebusinessonline.com',             projectTypes: ['STUDENT_HOUSING','MARKET_RATE'], pollingFrequency: 'DAILY'  },
  // Added 2026-10-07 after a live check (Mike asked what national papers we were
  // missing). Each one returned items that day. Multifamily Executive, Builder,
  // ULI and NAHB were tried and are blocked or have no feed.
  { name: 'Bisnow National',            market: 'NATIONAL', feedUrl: 'https://www.bisnow.com/rss/national',                   siteUrl: 'https://www.bisnow.com',                   projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'National CRE desk: capital raises, portfolio deals, who is building where.' },
  { name: 'Connect CRE',                market: 'NATIONAL', feedUrl: 'https://www.connectcre.com/feed/',                      siteUrl: 'https://www.connectcre.com',               projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Deal-by-deal wire. Short items that name the developer, the lender and the unit count.' },
  { name: 'Yield PRO',                  market: 'NATIONAL', feedUrl: 'https://yieldpro.com/feed/',                            siteUrl: 'https://yieldpro.com',                     projectTypes: ['MARKET_RATE','AFFORDABLE'],      pollingFrequency: 'DAILY',  notes: 'Multifamily owner and developer trade paper; project announcements with counts.' },
  { name: 'Senior Housing News',        market: 'NATIONAL', feedUrl: 'https://seniorhousingnews.com/feed/',                   siteUrl: 'https://seniorhousingnews.com',            projectTypes: ['SENIOR_LIVING'],                 pollingFrequency: 'DAILY',  notes: 'The senior living trade paper of record.' },
  { name: 'Construction Dive',          market: 'NATIONAL', feedUrl: 'https://www.constructiondive.com/feeds/news/',          siteUrl: 'https://www.constructiondive.com',         projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'GC side of the same jobs: who won the contract, when it breaks ground.' },

  // ── Denver & Colorado ────────────────────────────────────────────────────
  // Mile High CRE was already here and was, until now, the only local paper in
  // the whole list — one out of twenty-one.
  { name: 'Mile High CRE',              market: 'DENVER',   feedUrl: 'https://milehighcre.com/feed/',                         siteUrl: 'https://milehighcre.com',                  projectTypes: ['MARKET_RATE'],                   pollingFrequency: 'DAILY'  },
  { name: 'BusinessDen',                market: 'DENVER',   feedUrl: 'https://businessden.com/feed/',                         siteUrl: 'https://businessden.com',                  projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Denver business desk. Covers individual buildings, sales and permits by name.' },
  { name: 'Bisnow Denver',              market: 'DENVER',   feedUrl: 'https://www.bisnow.com/rss/denver',                     siteUrl: 'https://www.bisnow.com/denver',            projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Local CRE desk: groundbreakings, financings, who bought what.' },
  { name: 'Denverite',                  market: 'DENVER',   feedUrl: 'https://denverite.com/feed/',                           siteUrl: 'https://denverite.com',                    projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'City desk. Catches neighbourhood-level development fights before they are deals.' },
  { name: 'DenverUrbanism',             market: 'DENVER',   feedUrl: 'https://denverurbanism.com/feed',                       siteUrl: 'https://denverurbanism.com',               projectTypes: ['MARKET_RATE','AFFORDABLE'],      pollingFrequency: 'WEEKLY', notes: 'Development blog — writes about towers by name, which is exactly what the matcher needs.' },
  { name: 'The Colorado Sun',           market: 'DENVER',   feedUrl: 'https://coloradosun.com/feed/',                         siteUrl: 'https://coloradosun.com',                  projectTypes: ALL_TYPES,                         pollingFrequency: 'WEEKLY', notes: 'Statewide. Broad, so weekly — it is here for the jobs outside the metro.' },

  // ── Houston ──────────────────────────────────────────────────────────────
  { name: 'Bisnow Houston',             market: 'HOUSTON',  feedUrl: 'https://www.bisnow.com/rss/houston',                    siteUrl: 'https://www.bisnow.com/houston',           projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY'  },
  { name: 'Community Impact - Houston', market: 'HOUSTON',  feedUrl: 'https://communityimpact.com/rss/houston/',              siteUrl: 'https://communityimpact.com/houston',      projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Suburban city-desk coverage — Katy, Fulshear, Cypress. Names the subdivision and the phase.' },

  // ── Austin ───────────────────────────────────────────────────────────────
  { name: 'Urbanize Austin',            market: 'AUSTIN',   feedUrl: 'https://austin.urbanize.city/rss.xml',                  siteUrl: 'https://austin.urbanize.city',             projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Development-only. Sample headline: "342-unit housing complex to rise in Pearson Ranch".' },
  { name: 'Austin Monitor',             market: 'AUSTIN',   feedUrl: 'https://www.austinmonitor.com/feed/',                   siteUrl: 'https://www.austinmonitor.com',            projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Council and land-use reporting — catches a project at entitlement, long before it bids.' },
  { name: 'Community Impact - Austin',  market: 'AUSTIN',   feedUrl: 'https://communityimpact.com/rss/austin/',               siteUrl: 'https://communityimpact.com/austin',       projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY'  },

  // ── Dallas-Fort Worth ────────────────────────────────────────────────────
  { name: 'Bisnow Dallas-Fort Worth',   market: 'DALLAS',   feedUrl: 'https://www.bisnow.com/rss/dallas-ft-worth',            siteUrl: 'https://www.bisnow.com/dallas-ft-worth',   projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY'  },
  { name: 'Urbanize Dallas',            market: 'DALLAS',   feedUrl: 'https://dallas.urbanize.city/rss.xml',                  siteUrl: 'https://dallas.urbanize.city',             projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY'  },
  { name: 'Community Impact - DFW',     market: 'DALLAS',   feedUrl: 'https://communityimpact.com/rss/dallas-fort-worth/',    siteUrl: 'https://communityimpact.com/dfw',          projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY'  },

  // ── Phoenix (added 2026-10-07) ───────────────────────────────────────────
  { name: 'Bisnow Phoenix',             market: 'PHOENIX',  feedUrl: 'https://www.bisnow.com/rss/phoenix',                    siteUrl: 'https://www.bisnow.com/phoenix',           projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Local CRE desk.' },
  { name: 'Rose Law Group Reporter',    market: 'PHOENIX',  feedUrl: 'https://roselawgroupreporter.com/feed/',                siteUrl: 'https://roselawgroupreporter.com',         projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Arizona real estate and zoning wire. Names the developer and the council vote.' },
  { name: 'AZBEX',                      market: 'PHOENIX',  feedUrl: 'https://azbex.com/feed/',                               siteUrl: 'https://azbex.com',                        projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Arizona Builders Exchange: projects in planning and bidding, with counts.' },

  // ── Miami & South Florida (added 2026-10-07) ─────────────────────────────
  { name: 'Bisnow South Florida',       market: 'MIAMI',    feedUrl: 'https://www.bisnow.com/rss/south-florida',              siteUrl: 'https://www.bisnow.com/south-florida',     projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Local CRE desk.' },
  { name: 'Miami Today',                market: 'MIAMI',    feedUrl: 'https://www.miamitodaynews.com/feed/',                  siteUrl: 'https://www.miamitodaynews.com',           projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Miami business weekly. Covers towers by name and board approvals.' },

  // ── Orlando (added 2026-10-07) ───────────────────────────────────────────
  { name: 'Bungalower',                 market: 'ORLANDO',  feedUrl: 'https://bungalower.com/feed/',                          siteUrl: 'https://bungalower.com',                   projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Orlando development blog. Writes up every new apartment filing by address.' },

  // ── Tampa Bay (added 2026-10-07) ─────────────────────────────────────────
  { name: 'St. Pete Catalyst',          market: 'TAMPA',    feedUrl: 'https://www.stpetecatalyst.com/feed/',                  siteUrl: 'https://www.stpetecatalyst.com',           projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'St. Petersburg business desk; strong on downtown towers.' },
  { name: '83 Degrees Media',           market: 'TAMPA',    feedUrl: 'https://www.83degreesmedia.com/rss',                    siteUrl: 'https://www.83degreesmedia.com',           projectTypes: ALL_TYPES,                         pollingFrequency: 'WEEKLY', notes: 'Tampa Bay development and neighbourhood features.' },
  { name: 'Tampa Bay Newswire',         market: 'TAMPA',    feedUrl: 'https://www.tampabaynewswire.com/feed/',                siteUrl: 'https://www.tampabaynewswire.com',         projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Press releases from Tampa Bay firms, including groundbreakings.' },

  // ── Jacksonville (added 2026-10-07) ──────────────────────────────────────
  { name: 'Jacksonville Today',         market: 'JACKSONVILLE', feedUrl: 'https://jaxtoday.org/feed/',                        siteUrl: 'https://jaxtoday.org',                     projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Nonprofit city desk. Covers council approvals and apartment filings.' },

  // ── City permit feeds (migration 0123, Mike 10-7) ────────────────────────
  // Not RSS. sourceType ARCGIS_PERMITS; the market key picks the profile in
  // permitRules.js. The feedUrl is the open-data layer being queried.
  { name: 'Denver building permits',    market: 'DENVER',   feedUrl: 'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_DEV_COMMERCIALCONSTPERMIT_P/FeatureServer/317/query', siteUrl: 'https://www.denvergov.org/opendata', projectTypes: ALL_TYPES, pollingFrequency: 'DAILY', sourceType: 'ARCGIS_PERMITS', notes: 'City and County of Denver commercial construction permits. New buildings and additions with a unit count or a value over $1M.' },

  // ── Texas statewide ──────────────────────────────────────────────────────
  { name: 'Virtual Builders Exchange',  market: 'TEXAS',    feedUrl: 'https://virtualbx.com/feed/',                           siteUrl: 'https://virtualbx.com',                    projectTypes: ALL_TYPES,                         pollingFrequency: 'DAILY',  notes: 'Texas construction bid news. Reports groundbreakings and awards by project name and dollar value.' },
];

/** Human label for a market key, falling back to the key so nothing renders blank. */
export function marketLabel(key) {
  const found = MARKETS.find(m => m.key === key);
  return found ? found.label : (key || DEFAULT_MARKET);
}

/** Is this a market we actually know about? Guards user-supplied input. */
export function isKnownMarket(key) {
  return MARKETS.some(m => m.key === key);
}

/**
 * Which catalog entries are not yet in the database.
 *
 * Matched on name, so this is safe to run against a live list: it adds what is
 * missing and never touches, duplicates or overwrites what is already there.
 * That is the whole reason the old "Seed 20 Sources" button only appeared when
 * the list was empty — it could not tell the difference.
 */
export function missingSources(existingNames = []) {
  const have = new Set((existingNames || []).map(n => String(n).trim().toLowerCase()));
  return SOURCES.filter(s => !have.has(s.name.trim().toLowerCase()));
}

/** The catalog grouped for display, markets in MARKETS order, empty ones dropped. */
export function groupByMarket(list = SOURCES) {
  return MARKETS
    .map(m => ({ ...m, sources: (list || []).filter(s => (s.market || DEFAULT_MARKET) === m.key) }))
    .filter(g => g.sources.length > 0);
}
