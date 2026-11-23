// Searches and research instructions for the women & wealth scan.
const AU = '(Australia OR Australian OR Sydney OR Melbourne OR Brisbane OR Perth OR Adelaide)';

// Each search lists what Google must have matched in the article:
//   female: explicit female wording is required (an AND group), so a match counts as a signal
//   au:     'outlet' when results come only from Australian outlets (counts as Australian);
//           true when Australian terms are in the query (informational only)
//   category: the signal type to assume when the headline doesn't make it clear
const W = '("female founder" OR "female-founded" OR "women founders" OR businesswoman OR "she founded" OR "she co-founded" OR "her company" OR "her business" OR "her brand")';
export const QUERIES = [
  // Founder liquidity
  { id: 'w-founder-exit',  female: true, au: true, category: 'founder_liquidity', q: `${W} (sold OR acquired OR sells OR "trade sale" OR buyout OR "acquisition") ${AU}` },
  { id: 'w-founder-raise', female: true, au: true, category: 'founder_liquidity', q: `${W} (raises OR raised OR "funding round" OR "Series A" OR "Series B" OR "Series C" OR investment) ${AU}` },
  { id: 'w-founder-ipo',   female: true, au: false, category: 'founder_liquidity', q: `${W} (IPO OR "ASX debut" OR float OR "lists on the ASX" OR "ASX-listed")` },
  { id: 'w-founder-pe',    female: true, au: true, category: 'founder_liquidity', q: `${W} ("private equity" OR "majority stake" OR "minority stake")` },
  { id: 'w-site-startupdaily', female: true, au: 'outlet', category: 'founder_liquidity', q: `site:startupdaily.net ("female founder" OR "women founders" OR "female-founded" OR "she founded" OR "her startup")` },
  { id: 'w-site-smartcompany', female: true, au: 'outlet', category: 'founder_liquidity', q: `site:smartcompany.com.au ("female founder" OR businesswoman OR "she founded" OR "her business")` },
  { id: 'w-site-capitalbrief', female: true, au: 'outlet', category: 'founder_liquidity', q: `site:capitalbrief.com ("female founder" OR "she founded" OR "her company" OR businesswoman)` },
  // Wealth lists and awards
  { id: 'w-rich-list',     female: true, au: true, category: 'rich_list', q: `("Rich List" OR "Young Rich" OR "richest women" OR "richest woman" OR "self-made" OR billionaire) (businesswoman OR "her fortune" OR "her wealth" OR "her family" OR "richest women" OR "richest woman" OR heiress OR "female billionaire") ${AU}` },
  { id: 'w-site-forbes',   female: true, au: true, category: 'rich_list', q: `site:forbes.com.au (businesswoman OR "her fortune" OR "female founder" OR "richest women" OR "she founded")` },
  { id: 'w-awards',        female: true, au: true, category: 'founder_liquidity', q: `("Women of Influence" OR "businesswoman of the year" OR "Telstra Best of Business" OR "female entrepreneur of the year" OR "Westpac Businesses of Tomorrow") (founder OR entrepreneur OR CEO)` },
  // Family business, family office, succession
  { id: 'w-family',        female: true, au: true, category: 'family_business', q: `(daughter OR "takes the helm" OR "next generation" OR matriarch OR "her father" OR "her family") ("family business" OR "family company" OR "family-owned") ${AU}` },
  { id: 'w-family-chair',  female: true, au: true, category: 'family_business', q: `("first female chair" OR "first woman to chair" OR "first female CEO" OR chairwoman OR "she succeeds") ("family business" OR "family company" OR "family-owned" OR founder) ${AU}` },
  { id: 'w-family-office', female: false, au: true, category: 'family_business', q: `("family office") (she OR her OR woman OR women OR daughter OR sisters) ${AU}` },
  // Philanthropy
  { id: 'w-philanthropy',  female: true, au: true, category: 'philanthropy', q: `(philanthropist OR "her foundation" OR donation OR gift OR pledge OR donates) (businesswoman OR "her family" OR "she donated" OR "her fortune" OR "female philanthropist") ${AU}` },
  { id: 'w-philanthropy-orgs', female: false, au: true, category: 'philanthropy', q: `("Philanthropy Australia" OR "Australian Communities Foundation" OR "private ancillary fund" OR "giving circle") (women OR woman OR she OR her)` },
  // Women's investing networks and initiatives
  { id: 'w-invest-women',  female: true, au: false, category: 'women_investing', q: `("Australians Investing in Women" OR "Australian Women Donors Network" OR "gender lens" OR "gender-lens" OR "invest in women" OR "investing in women")` },
  { id: 'w-angels',        female: false, au: true, category: 'women_investing', q: `("Scale Investors" OR "female angel" OR "women angel investors" OR "women investors" OR "female investors" OR "angel investor" ) (she OR her OR women OR woman) ${AU}` },
  { id: 'w-angel-groups',  female: false, au: true, category: 'women_investing', q: `("Sydney Angels" OR "Melbourne Angels" OR "Brisbane Angels" OR "Perth Angels" OR "Scale Investors" OR "Artesian" OR "Giant Leap" OR "Rampersand") (women OR female OR she OR her)` },
  { id: 'w-networks',      female: true, au: true, category: 'women_investing', q: `("Chief Executive Women" OR "Springboard Enterprises" OR "League of Extraordinary Women" OR "Women in Super" OR "Women in Banking and Finance")` },
  { id: 'w-women-wealth',  female: true, au: true, category: 'women_investing', q: `("women and wealth" OR "women investors" OR "female investors" OR "women in investing" OR "financial independence for women" OR "wealthy women") ${AU}` },
  { id: 'w-site-womensagenda', female: true, au: 'outlet', category: 'women_investing', q: `site:womensagenda.com.au (invest OR investor OR raises OR sold OR acquired OR founder OR philanthropy OR "family business" OR wealth)` },
];

export const FEEDS = [
  { id: 'w-womensagenda', url: 'https://womensagenda.com.au/feed/', source: "Women's Agenda" },
  { id: 'w-startupdaily', url: 'https://www.startupdaily.net/feed/', source: 'Startup Daily' },
  { id: 'w-smartcompany', url: 'https://www.smartcompany.com.au/feed/', source: 'SmartCompany' },
];

// Search metadata keyed by id, for evaluateArticle(). Direct feeds are
// Australian outlets, but give no guarantee about the subject being a woman.
export const SEARCH_META = Object.fromEntries([
  ...QUERIES.map(q => [q.id, { female: q.female, au: q.au, category: q.category }]),
  ['w-womensagenda', { female: false, au: 'outlet', category: null }],
  ['w-startupdaily', { female: false, au: 'outlet', category: null }],
  ['w-smartcompany', { female: false, au: 'outlet', category: null }],
]);

export const PROFILE_TOOL = {
  name: 'record_profile',
  description: 'Record what public sources say about the woman at the centre of this story. Call this exactly once, after researching.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['is_woman_identified', 'is_australian', 'name', 'role', 'organisation', 'organisation_description',
      'signal_type', 'wealth_indicator', 'published_wealth_aud_m', 'investing_interests', 'location', 'source_url', 'summary', 'confidence'],
    properties: {
      is_woman_identified: { type: 'boolean', description: 'True only if public sources explicitly describe this person as a woman (e.g. she/her, businesswoman). Never infer from a name.' },
      is_australian: { type: 'boolean', description: 'True if she is Australia-based or her business is Australian.' },
      name: { type: 'string', description: 'Her full name as published. Empty if the story is about a group or initiative with no single named woman.' },
      role: { type: 'string', description: 'Business or community role, e.g. "Co-founder, former CEO", "Chair of the family company", "Angel investor, Scale Investors member".' },
      organisation: { type: 'string' },
      organisation_description: { type: 'string', description: 'One line on the organisation and where it is based.' },
      signal_type: { type: 'string', enum: ['business_sale', 'capital_raise', 'ipo', 'family_business_leadership', 'family_office', 'philanthropy', 'women_investing_initiative', 'rich_list', 'other'] },
      wealth_indicator: { type: 'string', description: 'The publicly reported basis for thinking she has significant wealth (e.g. "sold her 60% stake for a reported $40m", "Rich List 2026, $350m"). Empty if none is published.' },
      published_wealth_aud_m: { type: ['number', 'null'], description: 'Only a figure that a publication has printed (Rich List estimate, sale proceeds), in AUD millions; otherwise null.' },
      investing_interests: { type: 'string', description: 'Publicly stated investing or giving interests (e.g. backs female founders, climate, education). Empty if none.' },
      location: { type: 'string', description: 'City/state as publicly reported for business purposes. Empty if unknown.' },
      source_url: { type: 'string' },
      summary: { type: 'string', description: 'One or two sentences on why she is relevant to a private wealth adviser.' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
  },
};

export const SYSTEM = `You research public Australian business news for a private wealth adviser who runs women-focused investing initiatives and is looking for women to invite.

Research the story you are given and identify the woman at its centre, using reputable business media, company announcements, Rich List coverage, and the websites of women's investing networks.

Rules:
- Only record people whom public sources explicitly describe as women. Never infer gender from a name.
- Record only information published about her in a business, investing or philanthropic capacity: name, role, organisation, published wealth figures, stated investing interests and business location.
- Do not research or record deaths, estates, wills, inheritances, divorces, family disputes, health, home addresses, contact details or children.
- If the story is mainly about a death, a family dispute or a court case, record is_woman_identified as false and leave the other fields empty.
- If you cannot confirm a detail, leave it empty or null rather than guessing, and lower your confidence.
- Finish by calling record_profile exactly once.`;

export function signalPrompt(s) {
  const arts = s.articles.slice(0, 5).map(a => `- ${a.title} (${a.source || 'unknown source'}, ${a.pubDate || 'undated'})\n  ${a.link}`).join('\n');
  return `Story detected from headlines (heuristic, may be wrong):
Category guess: ${s.category}
Person guess: ${s.person || 'unknown'}
Organisation guess: ${s.organisation || 'unknown'}

Headlines:
${arts}

Research this and call record_profile.`;
}
