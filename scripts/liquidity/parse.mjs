// Pure helpers for turning news headlines into scored "liquidity events".
// Nothing in this file touches the network, so it can be unit-tested offline.

// ---------- Event classification ----------
// Ordered by how directly the event puts cash in an owner's hands.
export const EVENT_TYPES = {
  exit:     { label: 'Acquisition / trade sale', weight: 40 },
  selldown: { label: 'Founder sell-down',        weight: 38 },
  pe:       { label: 'Private equity deal',      weight: 34 },
  takeover: { label: 'Takeover / scheme',        weight: 28 },
  ipo:      { label: 'IPO / listing',            weight: 28 },
  funding:  { label: 'Funding round',            weight: 14 },
};

const TYPE_PATTERNS = [
  ['exit', /\b(acquires?|acquired|acquisition of|to acquire|buys|bought|snaps? up|snapped up|sold to|sells (?:to|its|the|business|company|majority)|sale of|trade sale|merges? with|merger with|swoops on|scoops? up|takes over|deal to buy|agrees? to buy|agreed to buy)\b/i],
  ['selldown', /\b(sells? down|sell-down|selldown|block trade|offloads? (?:shares|stake|\$)|secondary (?:sale|transaction|shares)|cash(?:es|ed)? out|cash(?:es|ed)? in)\b/i],
  ['pe', /\b(private equity|buy-?out|majority stake|minority stake|significant stake|growth (?:equity|investment)|pe firm|pe-backed|recapitali[sz])/i],
  ['takeover', /\b(takeover (?:bid|offer)|scheme of arrangement|binding offer|non-binding (?:indicative )?(?:offer|proposal)|take-?private|privatis(?:e|ation))/i],
  ['ipo', /\b(ipo|initial public offering|lists? on (?:the )?asx|asx (?:debut|listing|float)|market debut|floats? on|float(?:ed|ation))\b/i],
  ['funding', /\b(raises?|raised|raising|funding round|series [a-f]\b|seed round|pre-seed|capital raise|investment round|growth round|(?:secures?|closes?|bags?|lands?|banks?|nabs?)\s+(?:a\s+)?(?:A|AU|US|NZ)?\$|\d+(?:\.\d+)?\s?(?:m|mn|million|bn|billion)\s+(?:funding |investment |growth )?round)/i],
];

// Headlines that match the verbs above but aren't business liquidity events.
const NOISE = /\b(afl|nrl|a-league|draft pick|footy|cricket|wallabies|matildas|socceroos|home loans?|house prices?|auction clearance|rental|mortgage rates?|interest rates? (?:cut|rise)|recipe|horoscope|celebrity|bachelor|real estate agent|council (?:buys|acquires)|government (?:buys|acquires))\b/i;

export function classify(text) {
  const types = TYPE_PATTERNS.filter(([, re]) => re.test(text)).map(([t]) => t);
  if (!types.length) return null;
  return { type: types[0], tags: types };
}

export function isNoise(text) {
  return NOISE.test(text);
}

// ---------- Deal size ----------
const FX_TO_AUD = { 'A$': 1, 'AU$': 1, 'AUD': 1, '$': 1, 'US$': 1.55, 'USD': 1.55, 'NZ$': 0.92, '£': 1.95, '€': 1.65 };
const AMOUNT_RE = /(A\$|AU\$|US\$|NZ\$|\$|£|€)\s?(\d{1,4}(?:[.,]\d{1,3})?)\s?(billion|bn|b|million|mil|mn|m|k)\b/gi;

// Returns the largest amount mentioned, in AUD millions (approximate FX).
export function extractAmount(text) {
  let best = null;
  for (const m of text.matchAll(AMOUNT_RE)) {
    const cur = m[1].toUpperCase();
    const num = parseFloat(m[2].replace(',', '.'));
    if (!isFinite(num)) continue;
    const unit = m[3].toLowerCase();
    const mult = unit.startsWith('b') ? 1000 : unit === 'k' ? 0.001 : 1;
    const audM = num * mult * (FX_TO_AUD[cur] ?? 1);
    if (!best || audM > best.audM) best = { audM: Math.round(audM * 10) / 10, text: m[0].trim() };
  }
  return best;
}

// ---------- Australia relevance ----------
const AU_TERMS = /\b(australian?s?|aussie|sydney|melbourne|brisbane|perth|adelaide|hobart|canberra|darwin|gold coast|sunshine coast|newcastle|geelong|wollongong|townsville|cairns|nsw|new south wales|victoria(?:n)?|queensland|tasmania(?:n)?|western australia|south australia|asx(?::\w+)?)\b/gi;
const AU_SOURCES = /(\.com\.au|\.net\.au|\.org\.au|\.au\b|financial review|afr\b|the australian|smartcompany|startup daily|business news|capital brief|sydney morning herald|the age|courier-mail|the west australian|adelaide now|indaily|mumbrella|itnews|crn australia|news\.com\.au|abc news|sbs|9news|7news|herald sun|the mercury|brisbane times|wa today|anthill|marketindex|stockhead|the market herald|livewire|ausbiz|motley fool australia|proactive investors au|insurance news|mergermarket)/i;

// 0 = no Australian signal, 1 = weak, 2 = clear, 3 = strong
export function auConfidence(text, source = '', link = '') {
  const hits = new Set((text.match(AU_TERMS) || []).map(s => s.toLowerCase()));
  const sourceAu = AU_SOURCES.test(source) || /\.au(\/|$)/i.test(link);
  let score = Math.min(hits.size, 2);
  if (sourceAu) score += 1;
  return Math.min(score, 3);
}

// ---------- Company names ----------
const SOURCE_SUFFIX = /\s+[-–|]\s+[^-–|]{2,60}$/; // Google News appends " - Publisher"

export function cleanTitle(title, source = '') {
  let t = title.trim();
  if (source && t.endsWith(' - ' + source)) return t.slice(0, -(source.length + 3)).trim();
  return t.replace(SOURCE_SUFFIX, '').trim();
}

const DESCRIPTOR = /^(?:(?:the|aussie|australian|sydney|melbourne|brisbane|perth|adelaide|hobart|canberra|gold coast|[a-z]+-based|asx-listed|listed|family[- ]owned|founder-led|homegrown|local|start-?up|unicorn|fast-growing|award-winning|iconic|beloved|veteran)\s+)*(?:(?:fintech|regtech|insurtech|healthtech|medtech|biotech|edtech|proptech|agtech|cleantech|climate tech|tech|software|saas|ai|cyber(?:security)?|start-?up|scale-?up|company|firm|group|business|brand|retailer|maker|platform|developer|manufacturer|miner|explorer|producer|operator|provider|consultancy|agency|chain|label|winery|brewer|distributor|logistics|engineering|construction|services|food|beverage|fashion|beauty|skincare|accounting|law|legal|wealth|financial)\s+)*/i;
const STOP_TAIL = /\s+(?:for|in|from|after|as|amid|with|at|on|to|and|in a|in deal|deal|worth|valued)\b.*$/i;
const CORP_SUFFIX = /\b(pty\.?\s*ltd\.?|ltd\.?|limited|inc\.?|holdings?|group|corp(?:oration)?\.?|co\.)$/i;

const CONNECTORS = new Set(['&', 'and', 'of', 'de', 'la', 'the', '+']);
const NOT_A_NAME = /^(us|uk|eu|nz|asx|global|japanese|american|chinese|european|british|canadian|french|german|singaporean|offshore|overseas|foreign)$/i;
const isCap = w => /^[A-Z0-9][\w.'’&+-]*$/.test(w) || /^[A-Z]/.test(w);

// AU business media mostly use sentence case ("Sydney physio chain Kinetica Clinics"),
// so the proper-noun run at the end of the phrase is usually the company name.
function lastProperNounRun(s) {
  const words = s.split(/\s+/);
  const hasLower = words.some(w => /^[a-z]/.test(w) && !CONNECTORS.has(w));
  if (!hasLower) return null; // Title Case headline — can't tell descriptors apart this way
  let end = words.length - 1;
  while (end >= 0 && !isCap(words[end])) end--;
  if (end < 0) return null;
  let start = end;
  while (start - 1 >= 0 && (isCap(words[start - 1]) || (CONNECTORS.has(words[start - 1]) && start - 2 >= 0 && isCap(words[start - 2])))) start--;
  const run = words.slice(start, end + 1).join(' ');
  return NOT_A_NAME.test(run) ? '' : run;
}

function tidyName(raw) {
  if (!raw) return null;
  let s = raw.replace(/^['"‘’“”]+|['"‘’“”]+$/g, '').replace(STOP_TAIL, '').trim();
  s = s.replace(/[,:;.!?]+$/, '').trim();
  const run = lastProperNounRun(s);
  if (run === '') return null;
  if (run) s = run;
  else {
    const stripped = s.replace(DESCRIPTOR, '').trim();
    if (stripped) s = stripped;
  }
  s = s.replace(/^(?:the\s+)/i, '').replace(/['’]s$/, '').trim();
  const words = s.split(/\s+/);
  if (!s || words.length > 6 || s.length < 2) return null;
  if (/^(it|they|he|she|this|who|founder|owners?|investors?|buyers?|rival|giant|deal)$/i.test(s)) return null;
  return s;
}

export function normaliseName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(CORP_SUFFIX, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Returns { target, counterparty } — the business that had the event, and the buyer/investor.
export function extractParties(headline) {
  const h = headline.replace(/\s+/g, ' ').trim();
  let m;
  // "<Target> sold to / acquired by <Buyer>"
  m = h.match(/^(.+?)\s+(?:has been |is |to be |set to be |)(?:sold to|acquired by|bought by|snapped up by|sells to|snaps? up by|scooped up by|taken over by|agrees? (?:to )?(?:a )?sale to)\s+(.+)$/i);
  if (m) return { target: tidyName(m[1]), counterparty: tidyName(m[2]) };
  // "<Buyer> acquires / buys <Target>"
  m = h.match(/^(.+?)\s+(?:acquires|buys|to acquire|to buy|snaps up|swoops on|scoops up|takes over|agrees to buy|agreed to buy|completes acquisition of|announces acquisition of|acquisition of)\s+(.+)$/i);
  if (m) return { target: tidyName(m[2]), counterparty: tidyName(m[1]) };
  // "<Investor> takes stake in <Target>"
  m = h.match(/^(.+?)\s+(?:takes|acquires|buys|picks up)\s+(?:a\s+)?(?:\d+(?:\.\d+)?%|majority|minority|significant|controlling)?\s*stake in\s+(.+)$/i);
  if (m) return { target: tidyName(m[2]), counterparty: tidyName(m[1]) };
  // "<Target> raises / secures $X"
  m = h.match(/^(.+?)\s+(?:raises|raised|secures|closes|lands|bags|nabs|banks|scores|snares)\s+(?:a\s+)?(?:A\$|US\$|AU\$|\$|£|€)/i);
  if (m) return { target: tidyName(m[1]), counterparty: null };
  // "<Target> lists on / debuts on the ASX"
  m = h.match(/^(.+?)\s+(?:lists on|debuts on|to list on|set to list|eyes|plans|prices|launches|lodges)\s+(?:the\s+)?(?:asx|ipo|float|prospectus)/i);
  if (m) return { target: tidyName(m[1]), counterparty: null };
  // "Founder of <Target> ..." / "<Target> founder sells ..."
  m = h.match(/^(.+?)\s+(?:co-)?founders?\s+(?:sells?|offloads?|cash(?:es)? (?:out|in))/i);
  if (m) return { target: tidyName(m[1]), counterparty: null };
  return { target: null, counterparty: null };
}

// ---------- Scoring ----------
const FOUNDER_RE = /\b(founders?|co-founders?|founded by|family[- ](?:owned|business|run|company)|privately[- ](?:owned|held)|bootstrapped|owner-operat|husband and wife|father and son|second-generation|third-generation)\b/i;
const SECONDARY_RE = /\bsecondar(?:y|ies)\b/i;

export function scoreEvent(ev, now = new Date()) {
  const t = EVENT_TYPES[ev.type] || { weight: 10 };
  let score = t.weight;
  const reasons = [`${t.label || ev.type} (+${t.weight})`];

  const amt = ev.amountAudM;
  if (amt != null) {
    let s = amt >= 500 ? 25 : amt >= 100 ? 20 : amt >= 30 ? 15 : amt >= 10 ? 10 : amt >= 3 ? 5 : 0;
    if (ev.type === 'funding') s = Math.round(s / 2);
    if (s) { score += s; reasons.push(`~A$${amt}m deal (+${s})`); }
  }
  if (ev.founderSignal) { score += 12; reasons.push('founder/family-owned mention (+12)'); }
  if (ev.type === 'funding' && ev.secondarySignal) { score += 10; reasons.push('secondary shares in round (+10)'); }
  if (ev.type === 'funding' && /series [c-f]\b/i.test(ev.text || '')) { score += 6; reasons.push('late-stage round (+6)'); }

  const au = ev.auConfidence || 0;
  const auPts = au >= 3 ? 10 : au === 2 ? 7 : au === 1 ? 3 : 0;
  if (auPts) { score += auPts; reasons.push(`Australian signal ${au}/3 (+${auPts})`); }

  const latest = ev.latestPubDate ? new Date(ev.latestPubDate) : null;
  if (latest && !isNaN(latest)) {
    const days = (now - latest) / 86400000;
    const r = days <= 7 ? 8 : days <= 30 ? 4 : 0;
    if (r) { score += r; reasons.push(`recent (${Math.max(0, Math.round(days))}d ago, +${r})`); }
  }
  const extra = Math.min(((ev.articles || []).length - 1) * 2, 6);
  if (extra > 0) { score += extra; reasons.push(`${ev.articles.length} articles (+${extra})`); }

  if (ev.enrichment) {
    if (ev.enrichment.is_liquidity_event === false) { score -= 30; reasons.push('AI review: not a liquidity event (−30)'); }
    if (ev.enrichment.is_australian === false) { score -= 20; reasons.push('AI review: not Australian (−20)'); }
    if ((ev.enrichment.people || []).length) { score += 5; reasons.push('named owners found (+5)'); }
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// ---------- Article -> event ----------
export function articleToCandidate(article) {
  const headline = cleanTitle(article.title || '', article.source || '');
  const text = `${headline} ${article.description || ''}`;
  if (!headline || isNoise(headline)) return null;
  const cls = classify(headline) || classify(text);
  if (!cls) return null;
  const au = auConfidence(text, article.source, article.link);
  if (au === 0) return null;
  const amount = extractAmount(text);
  const parties = extractParties(headline);
  return {
    type: cls.type,
    tags: cls.tags,
    company: parties.target,
    counterparty: parties.counterparty,
    amountAudM: amount ? amount.audM : null,
    amountText: amount ? amount.text : null,
    founderSignal: FOUNDER_RE.test(text),
    secondarySignal: SECONDARY_RE.test(text),
    auConfidence: au,
    headline,
    text,
  };
}

export function eventKey(candidate) {
  const n = normaliseName(candidate.company);
  if (n) return 'co:' + n;
  return 'hl:' + normaliseName(candidate.headline).split(' ').slice(0, 10).join(' ');
}

export function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
