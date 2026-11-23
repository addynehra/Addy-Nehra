// Women & Wealth Scan: finds Australian women in public business news who have
// sold or grown a business, lead a family business or family office, give at
// scale, appear on Rich Lists, or are active in women's investing networks.
// Writes data/women-signals.json for the "Women & Wealth" tab in leads.html.
//
// Obituaries, estates, inheritance disputes, divorces and court cases are
// filtered out deliberately (see SENSITIVE in scripts/women/parse.mjs).
//
// Usage and env vars are the same as scripts/liquidity-scan.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectArticles } from './liquidity/sources.mjs';
import { evaluateArticle, signalKey, scoreSignal, CATEGORIES } from './women/parse.mjs';
import { QUERIES, FEEDS, SEARCH_META, PROFILE_TOOL, SYSTEM, signalPrompt } from './women/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT_PATH = path.resolve(arg('--out', path.join(ROOT, 'data', 'women-signals.json')));
const FIXTURES = arg('--fixtures') ? path.resolve(arg('--fixtures')) : null;
const NO_ENRICH = process.argv.includes('--no-enrich');

const LOOKBACK_DAYS = parseInt(process.env.WOMEN_LOOKBACK_DAYS || '180', 10);
const RETENTION_DAYS = Math.max(365, LOOKBACK_DAYS);
const MIN_SCORE_TO_KEEP = 30;
const ENRICH_MAX = parseInt(process.env.WOMEN_ENRICH_MAX || process.env.ENRICH_MAX || '8', 10);
const ENRICH_MIN_SCORE = parseInt(process.env.WOMEN_ENRICH_MIN_SCORE || '50', 10);

const dateOf = s => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d : null; };

async function run(now = new Date()) {
  let existing = { signals: [] };
  try { existing = JSON.parse(await fs.readFile(OUT_PATH, 'utf8')); } catch { /* first run */ }

  const retentionCutoff = new Date(now - RETENTION_DAYS * 86400000);
  const lookbackCutoff = new Date(now - LOOKBACK_DAYS * 86400000);
  const byId = new Map();
  for (const s of existing.signals || []) {
    if ((dateOf(s.latestPubDate) || dateOf(s.firstSeen)) < retentionCutoff) continue;
    byId.set(s.id, s);
  }
  const seen = new Set([...byId.values()].flatMap(s => s.articles.map(a => a.link)));

  const { articles, log } = await collectArticles({ lookbackDays: LOOKBACK_DAYS, fixturesDir: FIXTURES, queries: QUERIES, feeds: FEEDS });
  console.log(`Fetched ${articles.length} articles from ${log.filter(l => l.ok).length}/${log.length} sources.`);

  let added = 0, merged = 0;
  const dropped = {};            // reason -> count
  const droppedSamples = {};     // reason -> a few headlines, for tuning
  const drop = (reason, a) => {
    dropped[reason] = (dropped[reason] || 0) + 1;
    (droppedSamples[reason] ||= []).length < 8 && droppedSamples[reason].push(a.title);
  };
  for (const a of articles) {
    if (seen.has(a.link)) continue;
    const pub = dateOf(a.pubDate);
    if (pub && pub < lookbackCutoff) { drop('older_than_lookback', a); continue; }
    const { signal: c, reason } = evaluateArticle(a, SEARCH_META[a.via] || {});
    if (!c) { drop(reason, a); continue; }
    seen.add(a.link);
    const id = signalKey(c);
    const article = { title: c.headline, link: a.link, source: a.source, pubDate: a.pubDate, via: a.via };
    const s = byId.get(id);
    if (s) {
      s.articles = [article, ...s.articles].sort((x, y) => (dateOf(y.pubDate) || 0) - (dateOf(x.pubDate) || 0)).slice(0, 8);
      s.tags = [...new Set([...s.tags, ...c.tags])];
      if (CATEGORIES[c.category].weight > CATEGORIES[s.category].weight) s.category = c.category;
      if (c.amountAudM != null && (s.amountAudM == null || c.amountAudM > s.amountAudM)) { s.amountAudM = c.amountAudM; s.amountText = c.amountText; }
      s.person ||= c.person;
      s.organisation ||= c.organisation;
      s.femaleSignal = Math.max(s.femaleSignal, c.femaleSignal);
      s.femaleFromSearch = s.femaleSignal === 0 && (s.femaleFromSearch || c.femaleFromSearch);
      s.categoryInferred = s.categoryInferred && c.categoryInferred;
      s.auConfidence = Math.max(s.auConfidence, c.auConfidence);
      merged++;
    } else {
      const { text, ...rest } = c;
      byId.set(id, { id, ...rest, firstSeen: now.toISOString(), articles: [article] });
      added++;
    }
  }

  const signals = [...byId.values()];
  const rescore = () => signals.forEach(s => {
    s.latestPubDate = s.articles.map(a => dateOf(a.pubDate)).filter(Boolean).sort((x, y) => y - x)[0]?.toISOString() || s.firstSeen;
    Object.assign(s, scoreSignal(s, now));
  });
  rescore();

  let enriched = 0;
  let enrichNote = NO_ENRICH ? 'off (--no-enrich)' : 'off (no ANTHROPIC_API_KEY secret set)';
  if (!NO_ENRICH && ENRICH_MAX > 0) {
    const { enrichmentAvailable, enrichTop, researchWithTool, MODEL } = await import('./liquidity/enrich.mjs');
    if (enrichmentAvailable()) {
      enriched = await enrichTop(signals, {
        max: ENRICH_MAX, minScore: ENRICH_MIN_SCORE,
        label: s => s.person || s.organisation || s.articles[0].title,
        research: (client, s) => researchWithTool(client, { system: SYSTEM, prompt: signalPrompt(s), tool: PROFILE_TOOL, maxSearches: 5 }),
      });
      enrichNote = `on (${MODEL}, up to ${ENRICH_MAX}/run, score ≥ ${ENRICH_MIN_SCORE})`;
      rescore();
    }
  }

  const kept = signals
    .filter(s => s.score >= MIN_SCORE_TO_KEEP || (s.enrichment && s.enrichment.is_woman_identified))
    .sort((a, b) => b.score - a.score || dateOf(b.latestPubDate) - dateOf(a.latestPubDate));

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify({
    generatedAt: now.toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    enrichment: enrichNote,
    sources: log,
    categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])),
    diagnostics: { articlesFetched: articles.length, added, merged, belowMinScore: signals.length - kept.length, dropped, droppedSamples },
    signals: kept,
  }, null, 2) + '\n');
  console.log(`Done: ${added} new, ${merged} merged, ${enriched} researched, ${kept.length} kept → ${path.relative(ROOT, OUT_PATH)}`);
}

run().catch(err => { console.error(err); process.exit(1); });
