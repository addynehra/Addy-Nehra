// Public, key-free news sources for Australian liquidity events.
// Google News search RSS (Australian edition) plus the RSS feeds of
// Australian business/startup outlets. Nothing here logs in or scrapes
// paywalled content — it only reads public RSS headlines and snippets.
import fs from 'node:fs/promises';
import path from 'node:path';
import { stripHtml } from './parse.mjs';

const AU_PLACES = '(Australia OR Australian OR Sydney OR Melbourne OR Brisbane OR Perth OR Adelaide)';

// Each query is run against Google News AU with a when:<N>d window.
export const GOOGLE_NEWS_QUERIES = [
  { id: 'founder-exit',   q: `(acquired OR "sold to" OR acquires OR "snapped up" OR "trade sale") (founder OR founders OR "family-owned" OR "privately owned" OR "family business") ${AU_PLACES}` },
  { id: 'trade-sale',     q: `("trade sale" OR "sells business" OR "sold the business" OR "agreed to sell") ${AU_PLACES}` },
  { id: 'private-equity', q: `"private equity" (acquires OR "majority stake" OR "minority stake" OR buyout OR "takes stake") ${AU_PLACES}` },
  { id: 'pe-firms',       q: `(Quadrant OR "Pacific Equity Partners" OR "BGH Capital" OR Adamantem OR "Five V" OR "Allegro Funds" OR "Crescent Capital" OR "Mercury Capital" OR "Potentia" OR "Genesis Capital" OR "Advent Partners" OR "Next Capital" OR "Liverpool Partners") (acquires OR stake OR investment OR buys)` },
  { id: 'funding-late',   q: `("Series B" OR "Series C" OR "Series D" OR "Series E" OR "growth round" OR secondary) (raises OR raised OR funding) ${AU_PLACES}` },
  { id: 'funding-any',    q: `(raises OR "funding round" OR "capital raise") (startup OR scaleup OR fintech OR "tech company") Australian` },
  { id: 'ipo',            q: `(IPO OR "ASX debut" OR "lists on the ASX" OR "float" OR prospectus) (founder OR company) ASX` },
  { id: 'takeover',       q: `("scheme of arrangement" OR "takeover offer" OR "takeover bid" OR "binding offer" OR "take-private") ASX` },
  { id: 'selldown',       q: `(founder OR co-founder OR chairman) ("sells down" OR "sell-down" OR "block trade" OR "offloads shares" OR "cashes out") ASX` },
  { id: 'site-startupdaily', q: `site:startupdaily.net (raises OR acquired OR acquisition OR exit)` },
  { id: 'site-smartcompany', q: `site:smartcompany.com.au (acquired OR sold OR acquisition OR "sells")` },
  { id: 'site-businessnews', q: `site:businessnews.com.au (acquired OR sold OR sale OR acquisition)` },
  { id: 'site-capitalbrief', q: `site:capitalbrief.com (acquires OR acquired OR raises OR sale)` },
];

// Direct outlet feeds (standard WordPress RSS). Items are filtered by the
// same classifier as everything else, so general news is dropped.
export const DIRECT_FEEDS = [
  { id: 'startupdaily', url: 'https://www.startupdaily.net/feed/', source: 'Startup Daily' },
  { id: 'smartcompany', url: 'https://www.smartcompany.com.au/feed/', source: 'SmartCompany' },
];

export function googleNewsUrl(query, lookbackDays) {
  const q = `${query} when:${lookbackDays}d`;
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-AU&gl=AU&ceid=AU:en';
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1];
  return v.trim();
}

export function decodeEntities(s) {
  return (s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&#8217;|&#x2019;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#038;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
}

export function parseRss(xml, fallbackSource = '') {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const out = [];
  for (const b of blocks) {
    const title = decodeEntities(extractTag(b, 'title'));
    const link = decodeEntities(extractTag(b, 'link'));
    if (!title || !link) continue;
    out.push({
      title,
      link,
      source: decodeEntities(extractTag(b, 'source')) || fallbackSource,
      pubDate: extractTag(b, 'pubDate'),
      description: stripHtml(decodeEntities(extractTag(b, 'description'))).slice(0, 600),
    });
  }
  return out;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LiquidityEventScan/1.0; RSS reader)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Returns { articles: [...], log: [{ id, ok, count, error }] }.
// If fixturesDir is set, reads <id>.xml from there instead of the network (for tests/dev).
export async function collectArticles({ lookbackDays, delayMs = 1500, fixturesDir = null }) {
  const jobs = [
    ...GOOGLE_NEWS_QUERIES.map(q => ({ id: q.id, url: googleNewsUrl(q.q, lookbackDays), source: '' })),
    ...DIRECT_FEEDS,
  ];
  const articles = [];
  const log = [];
  for (const job of jobs) {
    try {
      let xml;
      if (fixturesDir) {
        xml = await fs.readFile(path.join(fixturesDir, job.id + '.xml'), 'utf8').catch(() => null);
        if (xml == null) continue;
        xml = xml.replaceAll('__NOW__', new Date().toUTCString()); // fixtures use relative dates
      } else {
        xml = await fetchText(job.url);
        await sleep(delayMs);
      }
      const items = parseRss(xml, job.source).map(a => ({ ...a, via: job.id }));
      articles.push(...items);
      log.push({ id: job.id, ok: true, count: items.length });
    } catch (err) {
      log.push({ id: job.id, ok: false, count: 0, error: err.message });
      console.error(`Source ${job.id} failed: ${err.message}`);
    }
  }
  return { articles, log };
}
