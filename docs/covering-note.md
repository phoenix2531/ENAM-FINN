**Subject:** IIT Delhi – Founding AI Engineer - 2027

Hello ENAM team,

Here is my submission for the FINN build challenge.

- **Prototype (open on a phone):** https://finn-aohg.onrender.com
- **Repository:** https://github.com/phoenix2531/ENAM-FINN
- **AI build history:** attached as PDF, with a short summary

**What I built.** FINN runs on real NSE data: prices, this month's exchange filings, earnings-call transcripts and standardised financials, for a 20-stock portfolio plus any other ticker. A fictional investor's network of 44 people sits on top of it. It has three surfaces:

- **Brief (push)** turns 120 filings into a short ranked list, about 8 stories a week, laid out like an inbox: a headline, why it ranks, and who to call. Each story opens on its own page, led by an interactive price chart with the filing day marked. Results give Revenue/EBITDA/PBT/PAT QoQ and YoY. Management changes show the incoming person's career (from the company's own filing) and your path to them. Material events name the person best placed to explain them. Price and volume alerts use thresholds you set, with a live check of how noisy they would have been.
- **Research (pull)** builds a dossier for any NSE ticker. The numbers are computed, never generated. The centrepiece is *promised vs delivered*: every checkable commitment from the last four calls, judged against reported numbers, with the quote and page. For example, Kaynes rates **low**: it promised ≥ ₹4,000 cr FY26 revenue and delivered ₹3,626 cr, and promised positive operating cash and posted −₹600 cr.
- **Network** is woven into both. Paths come with evidence and a confidence level (dates overlap, two shared employers, or one). It also gives an expertise map with blind spots weighted by position size, reasons to reconnect, and insider-trading cautions (current employees, closed trading windows). **Friends to call** flags contacts whose current or former employer just moved past your alert rules or filed something material. The portfolio page ranks friends by how often you actually talk, flags who is *due a call*, and shows your own career journey with the people you overlapped with at each firm.

On a laptop, the calendar, important alerts and friends to call stay in a sidebar; on a phone they sit behind the menu button.

**Key decisions and tradeoffs.**
- *A finite brief, not a feed.* It tells you when you're caught up and what it filtered.
- *Every story ends with a person.* The network appears where it's useful, not in a separate tab you have to remember to check.
- *Conclusion first, and computed.* Every card and chart opens with one sentence of arithmetic ("Profit down 70% YoY", "₹977 cr of profit, yet operating cash −₹615 cr"), with the numbers underneath. Promise ledgers list misses first.
- *Calm by design.* One typeface, one accent, three tabs. Colour only where it means something. The judgement is in what's left off the screen.
- *Rules before models.* Classification and materiality are explainable and free. Models do reading, never arithmetic.
- *Evidence, not claims.* FINN shows where two careers crossed; it never asserts that people know each other. "Both in the Tata group" doesn't count as evidence.
- *Depth over breadth.* I went deep on management credibility and left annual-report red flags for next.

**Architecture.**
- **Pipelines:** yfinance for EOD prices; NSE's official RSS for live filings, with a screener.in backfill; screener for standardised financials and document links; PDFs cached forever with per-page text so citations land on a page. A filing's appointees are extracted, resolved to canonical orgs, and matched by tenure overlap against the network.
- **LLMs:** two tiers. A cheap model for bulk extraction (appointees, commitments, business snapshot) and a strong one for a single judgement call per company. The snapshot used Claude Haiku and Opus: $9.93 for 24 companies, 96% of it on the Opus step. Live, the same tiers run on the Gemini free tier. Transcripts are prefiltered (cutting 50–70% of tokens) and every answer is cached by content hash and committed, so rebuilds are free. There are no autonomous agents on purpose: these are well-specified steps, and errors should be traceable. An open-ended research agent is the first thing I'd add.
- **Security & privacy:** each investor's network is a private, per-tenant workspace with its own encryption key and is never used for anyone else. People from filings carry only public-role facts with a source. Hard deletion, zero-retention model use, data kept in India, and consent through the investor's own LinkedIn export and calendar. Before shipping I tested the live server, found and fixed a path-traversal bug that could have served the `.env` file (with a regression test), and checked the full git history for keys.
- **Cloud:** one Render container: FastAPI serves the API and the built app, which runs from a committed snapshot so it works even when live data can't be fetched. The model key lives only in Render's environment settings. In production: scheduled pollers, Postgres with row-level security, and object storage.

**Real vs synthetic.** All market data, filings, transcripts and named executives are real. The investor and their contacts are fictional, with careers placed at real companies so the overlaps can be demonstrated. Three public profiles that the filings defer elsewhere were verified against cited sources. Profile edits need a proof document, but the prototype only fingerprints it and marks the change pending; nothing is verified.

**Left out:** annual-report deep reads, accounts and real push delivery, free-form chat (by design), and news or broker notes (by design).

**Next:** a cited research agent for open questions; annual-report and segment extraction to settle more "can't verify" promises; materiality that learns from what each investor acts on; and voice-logged calls that feed back into the dossier.

Thank you for the thoughtful brief. I enjoyed building this.

Siya Jain
