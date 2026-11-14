// Liquidity Event Scan — finds Australian companies that were recently sold,
// took private-equity money, listed, or raised capital, using public news RSS.
// Writes data/liquidity-events.json for the "Liquidity Events" tab in leads.html.
//
// Usage:
//   node scripts/liquidity-scan.mjs                 # live run
//   node scripts/liquidity-scan.mjs --fixtures test/fixtures --out /tmp/out.json --no-enrich
//
// Env (all optional):
//   LOOKBACK_DAYS     news window per run (default 30)
//   ANTHROPIC_API_KEY enables AI enrichment (names founders/owners via web search)
//   ENRICH_MAX        max events enriched per run (default 8)
//   ENRICH_MIN_SCORE  only enrich events at/above this score (default 50)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectArticles } from './liquidity/sources.mjs';
import { articleToCandidate, eventKey, scoreEvent, EVENT_TYPES } from './liquidity/parse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT_PATH = path.resolve(arg('--out', path.join(ROOT, 'data', 'liquidity-events.json')));
const FIXTURES = arg('--fixtures') ? path.resolve(arg('--fixtures')) : null;
const NO_ENRICH = process.argv.includes('--no-enrich');

const LOOKBACK_DAYS = parseInt(process.env.LOOKBACK_DAYS || '30', 10);
const RETENTION_DAYS = 120;
const MAX_ARTICLES_PER_EVENT = 8;
const MIN_SCORE_TO_KEEP = 25;
const ENRICH_MAX = parseInt(process.env.ENRICH_MAX || '8', 10);
const ENRICH_MIN_SCORE = parseInt(process.env.ENRICH_MIN_SCORE || '50', 10);

const dateOf = s => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d : null; };

export async function run({ now = new Date() } = {}) {
  let existing = { events: [] };
  try { existing = JSON.parse(await fs.readFile(OUT_PATH, 'utf8')); } catch { /* first run */ }

  const retentionCutoff = new Date(now - RETENTION_DAYS * 86400000);
  const lookbackCutoff = new Date(now - LOOKBACK_DAYS * 86400000);

  const byId = new Map();
  for (const ev of existing.events || []) {
    const latest = dateOf(ev.latestPubDate) || dateOf(ev.firstSeen);
    if (latest && latest < retentionCutoff) continue;
    byId.set(ev.id, ev);
  }
  const seenLinks = new Set([...byId.values()].flatMap(e => e.articles.map(a => a.link)));

  const { articles, log } = await collectArticles({ lookbackDays: LOOKBACK_DAYS, fixturesDir: FIXTURES });
  console.log(`Fetched ${articles.length} articles from ${log.filter(l => l.ok).length}/${log.length} sources.`);

  let added = 0, merged = 0;
  for (const a of articles) {
    if (seenLinks.has(a.link)) continue;
    const pub = dateOf(a.pubDate);
    if (pub && pub < lookbackCutoff) continue;
    const c = articleToCandidate(a);
    if (!c) continue;
    seenLinks.add(a.link);

    const id = eventKey(c);
    const article = { title: c.headline, link: a.link, source: a.source, pubDate: a.pubDate, via: a.via };
    const ev = byId.get(id);
    if (ev) {
      ev.articles.push(article);
      ev.articles.sort((x, y) => (dateOf(y.pubDate) || 0) - (dateOf(x.pubDate) || 0));
      ev.articles = ev.articles.slice(0, MAX_ARTICLES_PER_EVENT);
      // Keep the strongest signals seen across all coverage of the event.
      if (EVENT_TYPES[c.type].weight > EVENT_TYPES[ev.type].weight) ev.type = c.type;
      ev.tags = [...new Set([...ev.tags, ...c.tags])];
      if (c.amountAudM != null && (ev.amountAudM == null || c.amountAudM > ev.amountAudM)) {
        ev.amountAudM = c.amountAudM; ev.amountText = c.amountText;
      }
      ev.counterparty ||= c.counterparty;
      ev.founderSignal ||= c.founderSignal;
      ev.secondarySignal ||= c.secondarySignal;
      ev.auConfidence = Math.max(ev.auConfidence, c.auConfidence);
      ev.text = (ev.text + ' ' + c.text).slice(0, 3000);
      merged++;
    } else {
      byId.set(id, {
        id,
        company: c.company,
        counterparty: c.counterparty,
        type: c.type,
        tags: c.tags,
        amountAudM: c.amountAudM,
        amountText: c.amountText,
        founderSignal: c.founderSignal,
        secondarySignal: c.secondarySignal,
        auConfidence: c.auConfidence,
        text: c.text.slice(0, 3000),
        firstSeen: now.toISOString(),
        articles: [article],
      });
      added++;
    }
  }

  const events = [...byId.values()];
  const rescore = () => {
    for (const ev of events) {
      ev.latestPubDate = ev.articles.map(a => dateOf(a.pubDate)).filter(Boolean).sort((x, y) => y - x)[0]?.toISOString() || ev.firstSeen;
      Object.assign(ev, scoreEvent(ev, now));
    }
  };
  rescore();

  let enriched = 0;
  const enrichOn = !NO_ENRICH && ENRICH_MAX > 0;
  let enrichNote = 'off (no ANTHROPIC_API_KEY secret set)';
  if (enrichOn) {
    const { enrichmentAvailable, enrichEvents, MODEL } = await import('./liquidity/enrich.mjs');
    if (enrichmentAvailable()) {
      enriched = await enrichEvents(events, { max: ENRICH_MAX, minScore: ENRICH_MIN_SCORE, maxSearches: 5 });
      enrichNote = `on (${MODEL}, up to ${ENRICH_MAX}/run, score ≥ ${ENRICH_MIN_SCORE})`;
      rescore();
    }
  } else if (NO_ENRICH) {
    enrichNote = 'off (--no-enrich)';
  }

  const kept = events
    .filter(e => e.score >= MIN_SCORE_TO_KEEP || e.enrichment)
    .sort((a, b) => b.score - a.score || (dateOf(b.latestPubDate) - dateOf(a.latestPubDate)));

  const output = {
    generatedAt: now.toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    enrichment: enrichNote,
    sources: log,
    eventTypes: Object.fromEntries(Object.entries(EVENT_TYPES).map(([k, v]) => [k, v.label])),
    events: kept,
  };
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Done: ${added} new event(s), ${merged} article(s) merged into existing events, ${enriched} enriched, ${kept.length} kept → ${path.relative(ROOT, OUT_PATH)}`);
  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => { console.error(err); process.exit(1); });
}
