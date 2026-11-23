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

---

# Women & Wealth Scan

`scripts/women-scan.mjs` runs as a second step of the same daily workflow and feeds the **Women & Wealth** tab in `leads.html`. It looks for Australian women in public business news who show one of these signals:

| Signal | Examples |
|---|---|
| Founder: sale / raise / listing | She sold or listed her company, or led a large funding round |
| Rich List | Rich List or Young Rich coverage |
| Family business / family office | Takes over as chair or CEO of a family company; next-generation leader; family office news |
| Philanthropy | Major gifts, pledges, setting up a foundation or private ancillary fund |
| Women investing initiative | Scale Investors, Australians Investing in Women, Chief Executive Women, Springboard Enterprises, women's angel networks, gender-lens investing |
| Referral partner (law / accounting) | Lawyers or accountants publicly running women-focused work: women-and-money programs, events and networks for female business owners, women-focused practices. These can be any gender. |

## Built-in limits

- **Gender comes only from the article's own words** (she/her, businesswoman, daughter and so on). A name is never used to guess.
- **Sensitive stories are dropped**: obituaries, deaths, estates and wills, inheritance disputes, divorces, family court, lawsuits and other court cases. This scanner deliberately does not identify recently bereaved women. Inherited wealth shows up through the public business signals above instead, such as a woman taking over a family company or a family office.
- **AI research** (with the `ANTHROPIC_API_KEY` secret) records only business, investing and philanthropic information: name, role, organisation, published wealth figures, stated investing interests and business location. It does not look up contact details, home addresses, children or anything else personal. The settings are `WOMEN_ENRICH_MAX` and `WOMEN_ENRICH_MIN_SCORE` in the workflow.

The compliance notes above apply here too.

## Finding referral partners on LinkedIn

The **Search Builder** tab has two presets for finding these people in Sales Navigator:
- **Referral partners: lawyers serving women**
- **Referral partners: accountants serving women**

Each builds a search string that combines three groups:
- senior titles (Partner, Principal, Special Counsel, Private Client Director and so on)
- women-focus keywords (women in business, women's wealth, female founders, women clients)
- practice-area keywords (family law, estate planning, private client, tax, family office)

Paste the string into Sales Navigator and set the listed filters by hand. The tool never logs in to LinkedIn and never scrapes it.
