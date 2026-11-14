// Optional AI enrichment: for the highest-scoring new events, ask Claude (with
// web search) to confirm the deal and name the owners/founders who received
// liquidity, as reported in public sources. Runs only when ANTHROPIC_API_KEY
// is set; otherwise the scan works on headline heuristics alone.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-5-5';

const RECORD_TOOL = {
  name: 'record_liquidity_event',
  description: 'Record the verified details of the liquidity event. Call this exactly once, after researching.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['is_liquidity_event', 'is_australian', 'company', 'company_description', 'counterparty',
      'deal_type', 'deal_value_aud_m', 'deal_date', 'people', 'liquidity_assessment', 'confidence'],
    properties: {
      is_liquidity_event: { type: 'boolean', description: 'True if owners/founders/shareholders of the company plausibly received cash or tradeable value (sale, PE stake, IPO, sell-down, secondary). False for e.g. a company acquiring someone else, a property purchase, debt raise, or rumour.' },
      is_australian: { type: 'boolean', description: 'True if the company that had the event is Australian-founded or Australian-headquartered, or the selling owners are Australia-based.' },
      company: { type: 'string', description: 'The company whose owners had the liquidity event (the seller/target/issuer).' },
      company_description: { type: 'string', description: 'One line: what the company does and where it is based.' },
      counterparty: { type: 'string', description: 'Buyer, investor or lead investor. Empty string if none/unknown.' },
      deal_type: { type: 'string', enum: ['trade_sale', 'private_equity', 'ipo', 'takeover', 'founder_selldown', 'funding_round', 'merger', 'other'] },
      deal_value_aud_m: { type: ['number', 'null'], description: 'Reported deal value in AUD millions, or null if not disclosed.' },
      deal_date: { type: 'string', description: 'Announcement or completion date, YYYY-MM-DD or YYYY-MM if only the month is known; empty if unknown.' },
      people: {
        type: 'array',
        description: 'Founders, owners, family shareholders or major vendor shareholders named in public reporting. Business roles only.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'role', 'stake_note', 'location', 'source_url'],
          properties: {
            name: { type: 'string' },
            role: { type: 'string', description: 'e.g. "Co-founder & CEO", "Founder, former owner", "Chair and major shareholder".' },
            stake_note: { type: 'string', description: 'What public sources say about their stake or proceeds, e.g. "held ~40% pre-sale". Empty if unknown.' },
            location: { type: 'string', description: 'City/state as publicly reported for business purposes. Empty if unknown.' },
            source_url: { type: 'string', description: 'URL of the public article naming this person.' },
          },
        },
      },
      liquidity_assessment: { type: 'string', description: 'One or two sentences on who likely received liquidity and roughly how much, with the basis for that view.' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
  },
};

const SYSTEM = `You research Australian business transactions from public news sources for a private wealth adviser's prospecting list.

For the event you are given, search the web to confirm what happened and identify the founders, owners or major vendor shareholders who received liquidity. Prefer reputable Australian business media, ASX announcements, company press releases and ACCC or Takeovers Panel material.

Rules:
- Record only information published in public sources, and only about people in their business capacity: name, business role, publicly reported stake or proceeds, and business location (city/state).
- Do not record personal contact details, home addresses, family members who are not shareholders, health or other sensitive information.
- If the article is about a company acquiring another business, the liquidity belongs to the sellers of the acquired business, so research the target.
- If you cannot confirm a detail, leave it empty or null rather than guessing, and lower your confidence.
- Finish by calling record_liquidity_event exactly once.`;

function eventPrompt(ev) {
  const arts = ev.articles.slice(0, 5).map(a => `- ${a.title} (${a.source || 'unknown source'}, ${a.pubDate || 'undated'})\n  ${a.link}`).join('\n');
  return `Event detected from headlines (heuristic, may be wrong):
Type guess: ${ev.type}
Company guess: ${ev.company || 'unknown'}
Counterparty guess: ${ev.counterparty || 'unknown'}
Amount guess: ${ev.amountText || 'not stated'}

Headlines:
${arts}

Research this event and call record_liquidity_event.`;
}

export function enrichmentAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

// Returns the tool input object, or null if Claude didn't produce one.
export async function enrichEvent(client, ev, { maxSearches = 5 } = {}) {
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches,
      user_location: { type: 'approximate', country: 'AU', timezone: 'Australia/Sydney' } },
    RECORD_TOOL,
  ];
  const messages = [{ role: 'user', content: eventPrompt(ev) }];

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      tools,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      console.error(`  enrichment declined for "${ev.company || ev.articles[0].title}"`);
      return null;
    }
    const call = response.content.find(b => b.type === 'tool_use' && b.name === RECORD_TOOL.name);
    if (call) return call.input;

    if (response.stop_reason === 'pause_turn') {
      // Server-side search loop paused; resend so it resumes where it left off.
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    // Finished without calling the tool: nudge once.
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: 'Please call record_liquidity_event now with what you found (use empty values where unknown).' });
  }
  return null;
}

export async function enrichEvents(events, { max, minScore, maxSearches }) {
  const client = new Anthropic();
  const todo = events
    .filter(e => !e.enrichment && !e.enrichmentFailed && e.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  let done = 0;
  for (const ev of todo) {
    console.log(`  enriching: ${ev.company || ev.articles[0].title}`);
    try {
      const result = await enrichEvent(client, ev, { maxSearches });
      if (result) {
        ev.enrichment = { ...result, model: MODEL, at: new Date().toISOString() };
        done++;
      } else {
        ev.enrichmentFailed = new Date().toISOString();
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        console.error('  Anthropic API key rejected — skipping enrichment.');
        break;
      } else if (err instanceof Anthropic.RateLimitError) {
        console.error('  Rate limited — stopping enrichment for this run.');
        break;
      } else if (err instanceof Anthropic.APIError) {
        console.error(`  API error ${err.status}: ${err.message}`);
      } else {
        console.error('  enrichment error:', err.message);
      }
    }
  }
  return done;
}
