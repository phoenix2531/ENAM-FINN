# What FINN is given

These are the only hand-written inputs. Everything else is fetched or derived.

| File | What it is | In production |
|---|---|---|
| `portfolio.json` | 20 holdings with weights, plus 4 companies under research | the investor's OMS / custodian feed |
| `network/investor.json` | the investor's own schools, employers and company meetings | onboarding form + calendar (read-only OAuth) |
| `network/contacts.json` | 44 **fictional** contacts: careers, schools, how the investor knows them, last contact | the investor's LinkedIn connections export, address book, CRM |
| `network/orgs.json` | canonical organisations, aliases, industries, value-chain links, theme names | a maintained reference table, seeded from exchange sector classifications |
| `network/public_profiles.json` | three verified public-role profiles, each with source links, for executives whose filings point elsewhere | a licensed people-data provider |

People named in filings are **not** listed here. The pipeline reads them from each filing's annexure
(`push/enrich.py → extract_people`) and keeps the source link and page.
