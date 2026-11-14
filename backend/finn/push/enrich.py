"""Turn a classified filing into the card an investor actually needs.

results           -> headline numbers this quarter vs last quarter and vs a
                     year ago, plus the few computed observations that change
                     how you read them (other income carrying profit, margin
                     moves, tax anomalies). All arithmetic, no model.
management_change -> who is coming / going, their career as the company
                     itself disclosed it (cheap-model extraction from the
                     filing's Annexure), then the Network layer finds paths.
everything else   -> the filing's own one-line digest; the Network layer adds
                     the best person to call when the event is material.
"""
from __future__ import annotations

import re
from datetime import date, datetime

from ..llm import client as llm
from ..sources import documents

METRICS = [("revenue", "Revenue"), ("ebitda", "EBITDA"), ("pbt", "PBT"), ("pat", "PAT")]
# Lenders have no EBITDA: their raw material is money. Net interest income (interest
# earned minus interest paid) is what a bank's quarter is judged on, with asset quality.
LENDER_METRICS = [("revenue", "Revenue"), ("nii", "Net interest income"), ("pbt", "PBT"), ("pat", "PAT")]


def _pct(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    if b < 0 and a < 0:            # both losses: report change in loss
        return round(100 * (a - b) / abs(b), 1)
    if b < 0 or a < 0:
        return None                # sign flip; a percentage would mislead
    return round(100 * (a / b - 1), 1)


def quarter_for(published: str, periods: list[str]) -> int | None:
    """Index of the latest quarter that ended before the filing date."""
    when = datetime.fromisoformat(published).date()
    best = None
    for i, p in enumerate(periods):
        try:
            end = date.fromisoformat(p)
        except ValueError:
            continue
        if end < when and (when - end).days <= 75:
            best = i
    return best


def fy_label(iso: str) -> str:
    d = date.fromisoformat(iso)
    q = {6: 1, 9: 2, 12: 3, 3: 4}[d.month]
    fy = d.year + 1 if d.month > 3 else d.year
    return f"Q{q} FY{str(fy)[2:]}"


def _asset_quality_notes(at, i: int) -> list[str]:
    """Gross and net NPA, and how gross moved over the year, in basis points."""
    g, n, g_y = at("gross_npa", i), at("net_npa", i), at("gross_npa", i - 4)
    if g is None:
        return []
    s = f"Gross NPA {g:.2f}%"
    if g_y is not None:
        bps = round((g - g_y) * 100)
        s += f", {'up' if bps > 0 else 'down'} {abs(bps)} bps YoY" if abs(bps) >= 5 else ", flat YoY"
    if n is not None:
        s += f"; net NPA {n:.2f}%"
    return [s]


def results_card(co: dict, published: str) -> dict | None:
    q = co.get("quarters")
    if not q:
        return None
    i = quarter_for(published, q["periods"])
    if i is None:
        return None
    rows, periods = q["rows"], q["periods"]
    from ..pull.fundamentals import is_financial
    lender = is_financial(co)

    def at(key, j):
        if key == "nii":
            r, x = at("revenue", j), at("interest", j)
            return round(r - x, 2) if r is not None and x is not None else None
        s = rows.get(key)
        return s[j] if s and 0 <= j < len(s) else None

    lines = []
    for key, label in (LENDER_METRICS if lender else METRICS):
        cur, prev, yago = at(key, i), at(key, i - 1), at(key, i - 4)
        lines.append({"metric": label, "value": cur, "qoq": _pct(cur, prev), "yoy": _pct(cur, yago),
                      "prev": prev, "year_ago": yago})

    notes = []
    if lender:
        notes += _asset_quality_notes(at, i)
    rev, ebitda, pbt, oi = at("revenue", i), at("ebitda", i), at("pbt", i), at("other_income", i)
    rev_y, ebitda_y = at("revenue", i - 4), at("ebitda", i - 4)
    if not lender and rev and ebitda is not None and rev_y and ebitda_y is not None:
        m_now, m_then = 100 * ebitda / rev, 100 * ebitda_y / rev_y
        bps = round((m_now - m_then) * 100)
        if abs(bps) >= 100:
            notes.append(f"EBITDA margin {m_now:.1f}%, {'up' if bps > 0 else 'down'} "
                         f"{abs(bps)} bps YoY")
    # Fee income is core business for a lender, so this warning applies only to others.
    if not lender and pbt and oi and pbt > 0 and oi / pbt >= 0.25:
        notes.append(f"Other income is {100 * oi / pbt:.0f}% of PBT; core profit is thinner than it looks")
    tax = at("tax_pct", i)
    if tax is not None and pbt and pbt > 0 and (tax < 15 or tax > 35):
        notes.append(f"Tax rate {tax:.0f}% is unusual; check for one-offs")
    pat_yoy = lines[3]["yoy"]
    rev_yoy = lines[0]["yoy"]
    if pat_yoy is not None and rev_yoy is not None and pat_yoy - rev_yoy > 25:
        notes.append(f"Profit grew {pat_yoy:.0f}% on {rev_yoy:.0f}% revenue growth: operating leverage or one-offs")

    return {
        "period": periods[i],
        "label": fy_label(periods[i]),
        "basis": "consolidated" if co.get("consolidated") else "standalone",
        "lines": lines,
        "notes": notes,
        "lender": lender,
        "filing_pdf": q.get("links", {}).get(periods[i]),
        "source": "Quarterly results as standardised by screener.in from the exchange filing",
    }


# ----------------------------------------------------------------- people

_PEOPLE_SCHEMA = {
    "type": "object",
    "properties": {
        "people": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "role": {"type": "string"},
                    "change": {"type": "string",
                               "enum": ["appointed", "resigned", "retired", "ceased",
                                        "redesignated", "other"]},
                    "effective": {"type": "string"},
                    "incoming": {"type": "boolean"},
                    "bio": {"type": "string"},
                    "career": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "org": {"type": "string"},
                                "title": {"type": "string"},
                                "from_year": {"type": "string"},
                                "to_year": {"type": "string"},
                            },
                            "required": ["org", "title", "from_year", "to_year"],
                            "additionalProperties": False,
                        },
                    },
                    "education": {"type": "array", "items": {"type": "string"}},
                    "page": {"type": "integer"},
                },
                "required": ["name", "role", "change", "effective", "incoming", "bio",
                             "career", "education", "page"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["people"],
    "additionalProperties": False,
}

_PEOPLE_SYSTEM = """You read Indian listed-company disclosures about changes in directors and senior management.
Extract every person whose position changes. Use only what the document says. Never add facts from memory.
- role: the position gained or lost, as written.
- incoming: true if they are taking up a role (appointment, redesignation into a bigger role).
- bio: at most 35 words, plain, drawn from the document's own profile text. Empty string if there is none.
- career: past and current organisations named in the profile, most recent first; years as 4-digit strings, or "" if not stated.
- education: degrees / institutions as written.
- page: the [pN] page number where the person's profile or change is described.
Skip people mentioned only as signatories or in contact-detail tables."""


def extract_people(url: str) -> list[dict]:
    pages = documents.pages(url, max_pages=12)
    if not pages:
        return []
    body = "\n\n".join(f"[p{i + 1}] {p}" for i, p in enumerate(pages))[:60000]
    out = llm.complete_json("extract_people", "cheap", _PEOPLE_SYSTEM, body, _PEOPLE_SCHEMA,
                            max_tokens=3000)
    return out["people"]


# ----------------------------------------------------------------- summaries

_SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}},
    "required": ["summary"],
    "additionalProperties": False,
}
_SUMMARY_SYSTEM = ("Summarise this stock-exchange filing in one sentence of at most 25 words for a "
                   "portfolio manager: what happened, with the key number if any. No adjectives, "
                   "no opinion, only facts in the document.")


def one_liner(url: str) -> str | None:
    """Only used when a material filing arrives without a digest (RSS items)."""
    text = documents.text(url, max_pages=3)[:12000]
    if not text:
        return None
    return llm.complete_json("summarise_filing", "cheap", _SUMMARY_SYSTEM, text, _SUMMARY_SCHEMA,
                             max_tokens=200)["summary"]


def clean_title(title: str) -> str:
    t = re.sub(r"^(announcement|disclosure|intimation) under regulation 30 (of sebi )?\(lodr\)\s*[-–]?\s*",
               "", title, flags=re.I)
    return t.strip(" -") or title
