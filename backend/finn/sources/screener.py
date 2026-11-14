"""screener.in company page -> structured fundamentals.

One request per company gives us: standardised quarterly / annual P&L,
balance sheet, cash flow, efficiency ratios, shareholding, the five most
recent exchange filings, links to every annual report and concall
transcript, and the sector / industry path. That is enough to run the whole
deterministic half of Pull for any NSE ticker.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

from bs4 import BeautifulSoup

from ..http import FetchError, fetch_text

BASE = "https://www.screener.in"

# screener labels differ between industrial companies and banks/NBFCs.
# We map both onto one vocabulary so downstream code never branches on it.
ROW_ALIASES = {
    "revenue": ["Sales", "Revenue"],
    "expenses": ["Expenses"],
    "ebitda": ["Operating Profit", "Financing Profit"],
    "opm": ["OPM %", "Financing Margin %"],
    "other_income": ["Other Income"],
    "interest": ["Interest"],
    "depreciation": ["Depreciation"],
    "pbt": ["Profit before tax"],
    "tax_pct": ["Tax %"],
    "pat": ["Net Profit"],
    "eps": ["EPS in Rs"],
    # banks only: asset quality, reported quarterly
    "gross_npa": ["Gross NPA %"],
    "net_npa": ["Net NPA %"],
    "dividend_payout": ["Dividend Payout %"],
    # balance sheet
    "equity_capital": ["Equity Capital"],
    "reserves": ["Reserves"],
    "borrowings": ["Borrowings", "Borrowing"],
    "deposits": ["Deposits"],
    "other_liabilities": ["Other Liabilities"],
    "total_liabilities": ["Total Liabilities"],
    "fixed_assets": ["Fixed Assets"],
    "cwip": ["CWIP"],
    "investments": ["Investments"],
    "other_assets": ["Other Assets"],
    "total_assets": ["Total Assets"],
    # cash flow
    "cfo": ["Cash from Operating Activity"],
    "cfi": ["Cash from Investing Activity"],
    "cff": ["Cash from Financing Activity"],
    "net_cash_flow": ["Net Cash Flow"],
    "fcf": ["Free Cash Flow"],
    "cfo_ebitda": ["CFO/EBITDA"],
    # ratios
    "debtor_days": ["Debtor Days"],
    "inventory_days": ["Inventory Days"],
    "payable_days": ["Days Payable"],
    "ccc": ["Cash Conversion Cycle"],
    "wc_days": ["Working Capital Days"],
    "roce": ["ROCE %"],
    "roe": ["ROE %"],
    # shareholding
    "promoters": ["Promoters"],
    "fiis": ["FIIs"],
    "diis": ["DIIs"],
    "government": ["Government"],
    "public": ["Public"],
}


def _key_for(label: str) -> str | None:
    label = label.replace("\xa0", " ").replace("+", "").strip()
    for key, names in ROW_ALIASES.items():
        for n in names:
            if label == n or label.startswith(n + " "):
                return key
    return None


def _num(s: str) -> float | None:
    s = s.replace(",", "").replace("%", "").replace("₹", "").strip()
    if s in ("", "-", "--"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


@dataclass
class Table:
    periods: list[str]                     # ISO dates or "TTM"
    rows: dict[str, list[float | None]]
    links: dict[str, str] = field(default_factory=dict)  # period -> results PDF

    def series(self, key: str) -> list[float | None]:
        return self.rows.get(key, [None] * len(self.periods))

    def to_dict(self) -> dict:
        return {"periods": self.periods, "rows": self.rows, "links": self.links}


def _parse_table(section) -> Table | None:
    if section is None:
        return None
    table = section.select_one("table.data-table")
    if table is None:
        return None
    periods = []
    for th in table.select("thead th")[1:]:
        periods.append(th.get("data-date-key") or th.get_text(strip=True))
    rows: dict[str, list] = {}
    links: dict[str, str] = {}
    for tr in table.select("tbody tr"):
        tds = tr.find_all("td")
        if not tds:
            continue
        label = " ".join(tds[0].get_text(" ", strip=True).split())
        if label.startswith("Raw PDF"):
            for p, td in zip(periods, tds[1:]):
                a = td.find("a")
                if a and a.get("href"):
                    href = a["href"]
                    links[p] = href if href.startswith("http") else BASE + href
            continue
        key = _key_for(label)
        if key and key not in rows:
            rows[key] = [_num(td.get_text(strip=True)) for td in tds[1:]]
    return Table(periods, rows, links)


@dataclass
class Company:
    symbol: str
    name: str
    screener_id: str | None
    consolidated: bool
    sector_path: list[str]
    about: str
    top: dict[str, float | None]
    quarters: Table | None
    annual: Table | None
    balance: Table | None
    cashflow: Table | None
    ratios: Table | None
    shareholding: Table | None
    announcements: list[dict]
    annual_reports: list[dict]
    concalls: list[dict]
    bse_code: str | None
    fetched_at: str

    def to_dict(self) -> dict:
        d = {k: getattr(self, k) for k in (
            "symbol", "name", "screener_id", "consolidated", "sector_path", "about",
            "top", "announcements", "annual_reports", "concalls", "bse_code", "fetched_at")}
        for k in ("quarters", "annual", "balance", "cashflow", "ratios", "shareholding"):
            t = getattr(self, k)
            d[k] = t.to_dict() if t else None
        return d


def _top_ratios(soup) -> dict:
    out = {}
    for li in soup.select("#top-ratios li"):
        name = li.select_one(".name")
        nums = [_num(n.get_text()) for n in li.select(".number")]
        if not name or not nums:
            continue
        label = " ".join(name.get_text().split())
        if label == "High / Low" and len(nums) == 2:
            out["high_52w"], out["low_52w"] = nums
        else:
            out[label] = nums[0]
    return out


def _announcements(soup) -> list[dict]:
    out = []
    for li in soup.select("#company-announcements-tab li"):
        a = li.find("a")
        if not a:
            continue
        sub = a.find("div")
        t = a.find("time")
        title = a.find(string=True, recursive=False) or ""
        summary = ""
        if sub:
            # screener prefixes the date; what follows is its one-line digest
            summary = sub.get_text(" ", strip=True)
            summary = re.sub(r"^\d{1,2} \w{3}( \d{4})?( - )?", "", summary)
        out.append({
            "title": " ".join(title.split()),
            "published": t.get("datetime") if t else None,
            "excerpt": summary,
            "url": a.get("href"),
        })
    return out


def _documents(soup) -> tuple[list[dict], list[dict]]:
    ars, calls = [], []
    for a in soup.select(".annual-reports a"):
        m = re.search(r"(\d{4})", a.get_text())
        if m and a.get("href"):
            ars.append({"year": int(m.group(1)), "url": a["href"]})
    for li in soup.select(".concalls li"):
        label = li.find("div")
        item = {"period": label.get_text(strip=True) if label else ""}
        for a in li.select("a.button-chip"):
            kind = a.get_text(strip=True).lower()
            if kind in ("transcript", "ppt", "rec", "notes"):
                item[kind] = a.get("href")
        calls.append(item)
    return ars, calls


def parse(html: str, symbol: str, consolidated: bool) -> Company:
    soup = BeautifulSoup(html, "lxml")
    name_el = soup.select_one("h1")
    sector = [a.get_text(strip=True) for a in soup.select('a[href^="/market/"]')]
    about = soup.select_one(".company-profile .about") or soup.select_one(".about")
    sid = None
    m = re.search(r"/announcements/recent/(\d+)/", html)
    if m:
        sid = m.group(1)
    bse = None
    m = re.search(r"bseindia\.com/stock-share-price/[^/]+/[^/]+/(\d{6})/", html)
    if m:
        bse = m.group(1)
    ars, calls = _documents(soup)
    return Company(
        symbol=symbol.upper(),
        name=name_el.get_text(strip=True) if name_el else symbol,
        screener_id=sid,
        consolidated=consolidated,
        sector_path=sector[:4],
        about=about.get_text(" ", strip=True) if about else "",
        top=_top_ratios(soup),
        quarters=_parse_table(soup.select_one("#quarters")),
        annual=_parse_table(soup.select_one("#profit-loss")),
        balance=_parse_table(soup.select_one("#balance-sheet")),
        cashflow=_parse_table(soup.select_one("#cash-flow")),
        ratios=_parse_table(soup.select_one("#ratios")),
        shareholding=_parse_table(soup.select_one("#quarterly-shp") or soup.select_one("#shareholding")),
        announcements=_announcements(soup),
        annual_reports=ars,
        concalls=calls,
        bse_code=bse,
        fetched_at=datetime.now().isoformat(timespec="seconds"),
    )


class UnknownTicker(LookupError):
    pass


def search(query: str, limit: int = 8) -> list[dict]:
    """Company name or partial ticker -> listed companies, via Screener's own
    search. "icici" -> ICICIBANK, ICICIGI, ...; "ola" -> OLAELEC. Unlisted names
    (e.g. a private company) return nothing. No model involved."""
    import json
    from urllib.parse import quote

    q = query.strip()
    if not q or len(q) > 60:
        return []
    try:
        rows = json.loads(fetch_text(f"{BASE}/api/company/search/?q={quote(q)}&v=3", ttl=24 * 3600))
    except (FetchError, ValueError):
        return []
    out = []
    for r in rows:
        m = re.match(r"^/company/([^/]+)/", r.get("url") or "")
        if not r.get("id") or not m:
            continue  # "Search everywhere" row and anything that is not a company page
        sym = m.group(1).upper()
        out.append({"symbol": sym, "name": r["name"], "exchange": "BSE" if sym.isdigit() else "NSE"})
    return out[:limit]


def _latest_quarter(co: Company) -> str | None:
    """ISO date of the most recent quarter with reported revenue, if any."""
    if not co.quarters:
        return None
    dated = [p for p, v in zip(co.quarters.periods, co.quarters.series("revenue"))
             if v is not None and re.match(r"\d{4}-\d{2}-\d{2}", p)]
    return max(dated) if dated else None


def get_company(symbol: str, ttl: float = 12 * 3600) -> Company:
    """Consolidated figures when the company currently reports them, else standalone.

    A company that stopped consolidating (Tata Elxsi, ~2015) still has a
    consolidated page on screener, frozen in that year. Prefer it only when it
    is roughly as current as the standalone one. A quarter's lag is normal timing
    (consolidated results can follow standalone by weeks); half a year is not."""
    symbol = symbol.upper().strip()
    if not re.fullmatch(r"[A-Z0-9&\-]{1,20}", symbol):
        raise UnknownTicker(symbol)
    found: dict[bool, tuple[Company, str]] = {}
    for consolidated in (True, False):
        url = f"{BASE}/company/{symbol}/" + ("consolidated/" if consolidated else "")
        try:
            html = fetch_text(url, ttl=ttl)
        except FetchError as e:
            if "404" in str(e):
                continue
            raise
        co = parse(html, symbol, consolidated)
        latest = _latest_quarter(co)
        if latest:
            found[consolidated] = (co, latest)
    if not found:
        raise UnknownTicker(symbol)
    if True in found and (False not in found or not _far_behind(found[True][1], found[False][1])):
        co = found[True][0]
        if False in found:
            _borrow_npa(co, found[False][0])
        return co
    return found[False][0]


def _far_behind(a: str, b: str, days: int = 180) -> bool:
    """True when ISO date a is more than `days` before b."""
    from datetime import date
    return (date.fromisoformat(b) - date.fromisoformat(a)).days > days


def _borrow_npa(cons: Company, stand: Company) -> None:
    """Banks disclose NPA on a standalone basis, so the consolidated page has the
    row but no values. Take them from the standalone page, matched by quarter."""
    q, sq = cons.quarters, stand.quarters
    if not q or not sq:
        return
    for key in ("gross_npa", "net_npa"):
        if any(v is not None for v in q.series(key)):
            continue
        by_period = dict(zip(sq.periods, sq.series(key)))
        vals = [by_period.get(p) for p in q.periods]
        if any(v is not None for v in vals):
            q.rows[key] = vals
