// Checks Google News RSS for exit-related coverage of companies in
// data/watchlist.json and writes new matches into data/news-results.json.
// No API key required — this only reads Google News' public search RSS feed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WATCHLIST_PATH = path.join(ROOT, 'data', 'watchlist.json');
const RESULTS_PATH = path.join(ROOT, 'data', 'news-results.json');

const KEYWORDS = [
  'acquisition', 'acquired', 'merger', '"sold to"', '"trade sale"',
  'succession', 'retiring', '"sale process"', '"exit plan"', '"family business"'
];

const LOOKBACK_DAYS = 45;          // how far back Google News should search
const MAX_ITEMS_PER_COMPANY = 15;  // cap stored history per company
const RESULT_RETENTION_DAYS = 180; // prune stored items older than this
const REQUEST_DELAY_MS = 1500;     // be polite between requests

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return '';
  let val = match[1].trim();
  const cdata = val.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) val = cdata[1];
  return val.trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchCompanyNews(company) {
  const query = `"${company}" (${KEYWORDS.join(' OR ')}) when:${LOOKBACK_DAYS}d`;
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-AU&gl=AU&ceid=AU:en';

  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SalesNavLeadToolkit-NewsWatch/1.0)' }
    });
  } catch (err) {
    console.error(`Fetch error for "${company}":`, err.message);
    return [];
  }
  if (!res.ok) {
    console.error(`Fetch failed for "${company}": HTTP ${res.status}`);
    return [];
  }

  const xml = await res.text();
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const items = [];
  for (const block of itemBlocks) {
    const title = decodeEntities(extractTag(block, 'title'));
    const link = decodeEntities(extractTag(block, 'link'));
    const pubDate = extractTag(block, 'pubDate');
    const source = decodeEntities(extractTag(block, 'source'));
    if (!title || !link) continue;
    items.push({ company, title, link, source, pubDate });
  }
  return items;
}

async function main() {
  const watchlistRaw = await fs.readFile(WATCHLIST_PATH, 'utf8').catch(() => '[]');
  let watchlist = [];
  try {
    watchlist = JSON.parse(watchlistRaw).filter(name => typeof name === 'string' && name.trim());
  } catch (err) {
    console.error('Could not parse data/watchlist.json, treating as empty:', err.message);
  }

  let existing = { generatedAt: null, items: [] };
  try {
    existing = JSON.parse(await fs.readFile(RESULTS_PATH, 'utf8'));
  } catch (err) {
    // No prior results file yet — start fresh.
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - RESULT_RETENTION_DAYS * 86400000);
  let allItems = (existing.items || []).filter(item => {
    const d = item.pubDate ? new Date(item.pubDate) : null;
    return !d || isNaN(d) || d > cutoff;
  });

  const seenLinks = new Set(allItems.map(item => item.link));

  if (watchlist.length === 0) {
    console.log('Watchlist is empty (data/watchlist.json) — nothing to check.');
  }

  for (const company of watchlist) {
    console.log(`Checking news for: ${company}`);
    const found = await fetchCompanyNews(company);
    for (const item of found) {
      if (seenLinks.has(item.link)) continue;
      seenLinks.add(item.link);
      allItems.push({ ...item, foundAt: now.toISOString() });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // Cap history per company, keep most recent first.
  const byCompany = {};
  for (const item of allItems) {
    (byCompany[item.company] ||= []).push(item);
  }
  let capped = [];
  for (const company of Object.keys(byCompany)) {
    const sorted = byCompany[company].sort(
      (a, b) => new Date(b.pubDate || b.foundAt) - new Date(a.pubDate || a.foundAt)
    );
    capped = capped.concat(sorted.slice(0, MAX_ITEMS_PER_COMPANY));
  }
  capped.sort((a, b) => new Date(b.pubDate || b.foundAt) - new Date(a.pubDate || a.foundAt));

  const output = {
    generatedAt: now.toISOString(),
    watchlistSize: watchlist.length,
    items: capped
  };

  await fs.mkdir(path.dirname(RESULTS_PATH), { recursive: true });
  await fs.writeFile(RESULTS_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Done. Watched ${watchlist.length} compan${watchlist.length === 1 ? 'y' : 'ies'}, ${capped.length} item(s) retained.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
