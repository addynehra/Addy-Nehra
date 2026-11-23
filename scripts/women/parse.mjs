// Signals that an Australian woman may hold significant wealth or want to be
// involved in women's investing: a business sale or raise she led, taking over
// a family business, philanthropy, Rich List coverage, or women-investing
// networks. Built on the liquidity parser; pure functions, no network.
import { classify, extractAmount, auConfidence, cleanTitle, isNoise, normaliseName, extractParties } from '../liquidity/parse.mjs';

export const CATEGORIES = {
  founder_liquidity: { label: 'Founder: sale / raise / listing', weight: 36 },
  rich_list:         { label: 'Rich List',                       weight: 36 },
  family_business:   { label: 'Family business / family office', weight: 32 },
  philanthropy:      { label: 'Philanthropy',                    weight: 30 },
  women_investing:   { label: 'Women investing initiative',      weight: 28 },
};

const RICH_LIST = /\b(rich list|young rich|richest (?:women|woman|australians?)|wealthiest (?:women|woman)|billionaire|self-made)\b/i;
const FAMILY = /\b(takes? (?:over )?the (?:helm|reins)|succeeds? her (?:father|mother|parents)|next generation|(?:second|third|fourth)-generation|family[- ](?:business|company|firm|office|empire|dynasty|owned|wealth)|matriarch|heiress|appointed (?:chair|chairwoman|chief executive|ceo|managing director)|new (?:chair|chairwoman|chief executive))\b/i;
const PHILANTHROPY = /\b(philanthrop\w*|donat(?:es|ed|ion)|gift of|pledges?|launch(?:es|ed)? (?:a |her )?(?:foundation|fund|trust)|private ancillary fund|endow\w*|giving circle)\b/i;
const WOMEN_INVESTING = /\b(scale investors|angel investors?|angel network|invest(?:s|ing)? in women|women investors?|female investors?|women-led funds?|gender[- ]lens|backs? (?:female|women) founders|australians investing in women|women donors|chief executive women|springboard enterprises|league of extraordinary women|women in (?:finance|investing|wealth|venture)|female founders? fund|women'?s (?:investment|investing|wealth) (?:club|network|summit|series|program))\b/i;

// Explicit textual reference to a woman. Gender is never guessed from a name.
const FEMALE = /\b(she|her|hers|herself|woman|women|female|businesswom[ae]n|chairwoman|matriarch|heiress|daughters?|mother|sisters?|granddaughter|niece|mum|mrs|ms|dame|lady)\b/gi;

// Sensitive or exploitative contexts: bereavement, estates, family law, disputes.
// Bereavement, illness, estates and family law: excluded so the scan never surfaces
// recently bereaved women or private family matters.
const SENSITIVE = /\b(obituar\w*|dies|died|death of|funeral|passed away|mourn\w*|the late|widow\w*|probate|estate (?:battle|dispute|fight|war)|will (?:dispute|battle)|contest\w* (?:the |her )?(?:will|estate)|inheritance (?:battle|fight|dispute|row|war)|divorce\w*|custody|family court|domestic violence|terminal(?:ly)? ill|hours (?:left )?to live|dying|end of life|assisted dying|cancer|diagnos\w*|illness)\b/i;

// Overseas markers in a headline. Dropped unless the headline also names Australia.
const FOREIGN = /\b(U\.?S\.?|USA|America(?:n|ns)?|Canad(?:a|ian)|UK|U\.K\.|Brit(?:ain|ish)|England|English|London|Liverpool|Manchester|Scotland|Ireland|Irish|Europe(?:an)?|German(?:y)?|France|French|Ital(?:y|ian)|Spain|Spanish|Dutch|Swed(?:en|ish)|India(?:n)?|Nepal|China|Chinese|Japan(?:ese)?|Singapore(?:an)?|Hong Kong|Dubai|Africa(?:n)?|Kiwi|New Zealand|NZ|Auckland|Wellington|Chicago|Baltimore|Dayton|Ohio|Texas|California|Silicon Valley|New York|Ontario|Toronto|Vancouver|Nvidia|Hollywood)\b|NZ\$|€|£/;
const AU_IN_HEADLINE = /\b(Australia(?:n|ns)?|Aussie|Sydney|Melbourne|Brisbane|Perth|Adelaide|Hobart|Canberra|Darwin|Gold Coast|ASX|NSW|Victoria(?:n)?|Queensland|Tasmania(?:n)?)\b/;

const MALE = /\b(he|his|him|himself|businessman|son|father and son|brothers)\b/i;

export function femaleSignal(text) {
  return new Set((text.match(FEMALE) || []).map(s => s.toLowerCase())).size;
}

export function isSensitive(text) {
  return SENSITIVE.test(text);
}

export function categorise(text) {
  const cats = [];
  if (RICH_LIST.test(text)) cats.push('rich_list');
  if (classify(text)) cats.push('founder_liquidity');
  if (FAMILY.test(text)) cats.push('family_business');
  if (PHILANTHROPY.test(text)) cats.push('philanthropy');
  if (WOMEN_INVESTING.test(text)) cats.push('women_investing');
  return cats;
}

const ROLES = ['co-founder', 'cofounder', 'founder', 'chief executive', 'ceo', 'chairwoman', 'chair', 'managing director', 'director', 'investor', 'philanthropist', 'entrepreneur', 'businesswoman', 'heiress', 'matriarch'];
// Role words may be capitalised at the start of a headline; names must be.
const ROLE_BEFORE_NAME = new RegExp('\\b(?:' + ROLES.map(r => `[${r[0]}${r[0].toUpperCase()}]${r.slice(1)}`).join('|') + ")\\s+([A-Z][a-z'’-]+(?:\\s(?:[A-Z][a-z'’-]+|de|van|von)){1,2})\\b");
const NAME_AT_START = /^([A-Z][a-z'’-]+\s[A-Z][a-z'’-]+(?:\s[A-Z][a-z'’-]+)?)(?:['’]s)?\s+(?=[a-z$])/;
const NOT_NAMES = /^(?:The|This|How|Why|What|When|Where|Who|Meet|Inside|Australian|Australia|Sydney|Melbourne|Brisbane|Perth|Adelaide|Hobart|Canberra|Gold|New|West|South|North|East|Rich|Young|Chief|Women|Female|Family|Private|Scale|Forbes|League|Springboard|Victorian|Queensland|Business|Startup|Federal|State|National|Top|Exclusive)\b/;

// Best-effort person name from a headline; enrichment confirms or replaces it.
export function extractPerson(headline) {
  let m = headline.match(ROLE_BEFORE_NAME);
  if (m && !NOT_NAMES.test(m[1])) return m[1];
  m = headline.match(NAME_AT_START);
  if (m && !NOT_NAMES.test(m[1])) return m[1];
  return null;
}

// Evaluates one article. `meta` describes the search that found it:
//   female:   the search required explicit female wording (e.g. "female founder")
//             that Google matched in the article, so it counts as a signal
//   au:       the search required Australian terms
//   category: fallback signal type when the headline alone doesn't say
// Returns { signal } or { reason } (why it was dropped).
export function evaluateArticle(article, meta = {}) {
  const headline = cleanTitle(article.title || '', article.source || '');
  if (!headline) return { reason: 'empty' };
  const text = `${headline} ${article.description || ''}`;
  if (isSensitive(text)) return { reason: 'sensitive' };
  if (isNoise(headline)) return { reason: 'noise' };

  let cats = categorise(headline);
  if (!cats.length) cats = categorise(text);
  let inferred = false;
  // Only initiative stories may borrow the search's category; for the rest, the
  // headline/snippet must say what happened (sale, raise, gift, list...).
  if (!cats.length && meta.category === 'women_investing' && femaleSignal(text) > 0) { cats = [meta.category]; inferred = true; }
  if (!cats.length) return { reason: 'no_signal_type' };
  const category = cats.slice().sort((a, b) => CATEGORIES[b].weight - CATEGORIES[a].weight)[0];

  let female = femaleSignal(text);
  if (female === 0 && MALE.test(text)) return { reason: 'about_a_man' };
  const femaleFromSearch = female === 0 && meta.female;
  if (female === 0 && !meta.female && !cats.includes('women_investing')) return { reason: 'no_female_signal' };

  if (FOREIGN.test(headline) && !AU_IN_HEADLINE.test(headline)) return { reason: 'foreign' };
  let au = auConfidence(text, article.source, article.link);
  // Only searches restricted to Australian outlets (site: searches, direct feeds) vouch for Australia;
  // Google's Australian edition still returns plenty of overseas stories.
  if (au === 0 && meta.au === 'outlet') au = 1;
  if (au === 0) return { reason: 'not_australian' };

  const amount = extractAmount(text);
  return { signal: {
    category,
    tags: cats,
    categoryInferred: inferred,
    person: extractPerson(headline),
    organisation: extractParties(headline).target,
    amountAudM: amount ? amount.audM : null,
    amountText: amount ? amount.text : null,
    femaleSignal: female,
    femaleFromSearch,
    auConfidence: au,
    headline,
    text,
  } };
}

export function articleToSignal(article, meta = {}) {
  return evaluateArticle(article, meta).signal || null;
}

export function signalKey(s) {
  if (s.person) return 'p:' + normaliseName(s.person);
  if (s.organisation) return 'o:' + normaliseName(s.organisation);
  return 'h:' + normaliseName(s.headline).split(' ').slice(0, 10).join(' ');
}

export function scoreSignal(s, now = new Date()) {
  const c = CATEGORIES[s.category];
  let score = c.weight;
  const reasons = [`${c.label} (+${c.weight})`];
  const extraCats = (s.tags || []).filter(t => t !== s.category).length;
  if (extraCats) { const p = Math.min(extraCats * 5, 10); score += p; reasons.push(`also ${s.tags.filter(t => t !== s.category).map(t => CATEGORIES[t].label.toLowerCase()).join(', ')} (+${p})`); }

  if (s.amountAudM != null) {
    const p = s.amountAudM >= 500 ? 20 : s.amountAudM >= 100 ? 16 : s.amountAudM >= 20 ? 12 : s.amountAudM >= 5 ? 8 : s.amountAudM >= 1 ? 4 : 0;
    if (p) { score += p; reasons.push(`~A$${s.amountAudM}m mentioned (+${p})`); }
  }
  const f = s.femaleSignal >= 3 ? 10 : s.femaleSignal === 2 ? 7 : s.femaleSignal === 1 ? 4 : 0;
  if (f) { score += f; reasons.push(`clearly about a woman (+${f})`); }
  else if (s.femaleFromSearch) { score += 2; reasons.push('women-specific search matched the article (+2, verify)'); }
  if (s.categoryInferred) { score -= 15; reasons.push('signal type inferred from the search, not the headline (−15)'); }
  if (s.person) { score += 6; reasons.push('named person in headline (+6)'); }

  const au = s.auConfidence >= 3 ? 10 : s.auConfidence === 2 ? 7 : s.auConfidence === 1 ? 3 : 0;
  if (au) { score += au; reasons.push(`Australian signal ${s.auConfidence}/3 (+${au})`); }

  const latest = s.latestPubDate ? new Date(s.latestPubDate) : null;
  if (latest && !isNaN(latest)) {
    const days = (now - latest) / 86400000;
    const r = days <= 7 ? 8 : days <= 30 ? 4 : 0;
    if (r) { score += r; reasons.push(`recent (${Math.max(0, Math.round(days))}d ago, +${r})`); }
  }
  const extra = Math.min(((s.articles || []).length - 1) * 2, 6);
  if (extra > 0) { score += extra; reasons.push(`${s.articles.length} articles (+${extra})`); }

  const e = s.enrichment;
  if (e) {
    if (e.is_woman_identified === false) { score -= 40; reasons.push('AI review: not identified as a woman in sources (−40)'); }
    if (e.is_australian === false) { score -= 20; reasons.push('AI review: not Australian (−20)'); }
    if (e.name) { score += 5; reasons.push('named and verified (+5)'); }
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}
