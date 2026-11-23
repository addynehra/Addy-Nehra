// Searches and research instructions for the women & wealth scan.
const AU = '(Australia OR Australian OR Sydney OR Melbourne OR Brisbane OR Perth OR Adelaide)';

export const QUERIES = [
  { id: 'w-founder-exit',  q: `("female founder" OR "women founders" OR businesswoman OR "she founded" OR "her company" OR "co-founded") (sold OR acquired OR sells OR "trade sale" OR buyout) ${AU}` },
  { id: 'w-founder-raise', q: `("female founder" OR "female-founded" OR "women-led" OR "solo female founder") (raises OR funding OR "Series A" OR "Series B" OR "Series C") ${AU}` },
  { id: 'w-founder-ipo',   q: `(businesswoman OR "female founder" OR "her company") (IPO OR "ASX debut" OR float OR "lists on the ASX")` },
  { id: 'w-family',        q: `(daughter OR "takes the helm" OR "next generation" OR matriarch OR "family business" OR "family company") (chair OR chairwoman OR "chief executive" OR "managing director") (appointed OR succeeds OR "takes over") ${AU}` },
  { id: 'w-family-office', q: `"family office" (she OR her OR woman OR daughter OR sisters) ${AU}` },
  { id: 'w-philanthropy',  q: `(philanthropist OR "her foundation" OR donation OR gift OR pledge OR "giving") (businesswoman OR she OR "her family") million ${AU}` },
  { id: 'w-invest-women',  q: `("Australians Investing in Women" OR "Australian Women Donors Network" OR "gender lens" OR "gender-lens" OR "invest in women" OR "investing in women")` },
  { id: 'w-angels',        q: `("Scale Investors" OR "female angel" OR "women angel investors" OR "women investors" OR "female investors") ${AU}` },
  { id: 'w-networks',      q: `("Chief Executive Women" OR "Springboard Enterprises" OR "League of Extraordinary Women") (investor OR board OR member OR joins OR appointed OR founder)` },
  { id: 'w-rich-list',     q: `("Rich List" OR "Young Rich" OR "richest women" OR "self-made") (she OR her OR women OR businesswoman) ${AU}` },
  { id: 'w-site-womensagenda', q: `site:womensagenda.com.au (invest OR raises OR sold OR acquired OR founder OR philanthropy OR "family business")` },
  { id: 'w-site-smartcompany', q: `site:smartcompany.com.au ("female founder" OR businesswoman) (sold OR raises OR acquired)` },
];

export const FEEDS = [
  { id: 'w-womensagenda', url: 'https://womensagenda.com.au/feed/', source: "Women's Agenda" },
];

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
