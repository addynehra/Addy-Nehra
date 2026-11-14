# Liquidity Event Scan (Australia)

Finds Australian companies whose owners have probably just received cash: trade sales, private-equity deals, ASX listings, takeovers, founder sell-downs and large funding rounds. The results appear in the **Liquidity Events** tab of `leads.html`.

## How it works

1. **Collect.** Each day, `.github/workflows/liquidity-scan.yml` runs `scripts/liquidity-scan.mjs`. The script reads public RSS only: Google News searches on the Australian edition (founder exits, trade sales, PE deals and named AU PE firms, late-stage rounds, IPOs, schemes, sell-downs, plus site searches of Startup Daily, SmartCompany, Business News and Capital Brief) and the Startup Daily and SmartCompany feeds. It needs no logins or API keys.
2. **Filter and parse** (`scripts/liquidity/parse.mjs`). For each headline the script:
   - classifies the event type
   - drops noise such as sport and property news
   - drops stories with no Australian signal
   - pulls out the target company, the buyer or investor, and the deal size, converted to approximate AUD
   - groups articles about the same company into one event
3. **Score** each event out of 100. The score adds points for:
   - event type: a sale is worth more than a funding round
   - deal size
   - a founder or family-owned mention
   - secondary shares in a funding round
   - strength of the Australian signal
   - recency
   - the number of articles covering it

   Click **Why this score?** on any event to see the breakdown.
4. **Enrich (optional).** If the repo secret `ANTHROPIC_API_KEY` is set, the top new events (up to 8 a day, score 50 or more) go to Claude with web search. Claude checks the deal and records the founders and owners named in public reporting: their role, any reported stake, and the city or state of their business. It is told not to collect personal contact details or other private information. Each event is researched only once.

Events are kept for 120 days. Events scoring below 25 are dropped.

## Setup

- No setup is needed for the headline scan. Run it from **Actions → Liquidity Scan → Run workflow**, or wait for the daily run at about 5:30am Sydney time.
- To turn on enrichment, add `ANTHROPIC_API_KEY` under **Settings → Secrets and variables → Actions**. To control cost, change `ENRICH_MAX` and `ENRICH_MIN_SCORE` in the workflow.

## Local runs

```bash
npm install
npm test
node scripts/liquidity-scan.mjs                       # live
node scripts/liquidity-scan.mjs --fixtures test/fixtures --out /tmp/out.json --no-enrich
```

## Compliance notes

The scan only uses information that has been published about people in their business roles. Before you contact anyone, check that your outreach meets the Privacy Act 1988 (APP 3 and APP 5: collection and notification), the Spam Act 2003 and the Do Not Call Register Act, and your firm's own prospecting and compliance policies. Headline parsing makes mistakes, so always read the source article before acting on an event.
