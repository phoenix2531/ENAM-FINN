"""Promised vs delivered: analysing management, not summarising it.

map    (cheap model, once per transcript, cached forever)
       transcript -> forward-looking commitments, each with a verbatim quote
       and the page it sits on. A keyword prefilter drops boilerplate first,
       roughly halving the tokens sent.
reduce (strong model, once per company per new transcript)
       commitments from the last four calls + the actual quarterly numbers
       -> a ledger of promises with verdicts, current guidance, where the story
       and the numbers diverge, and a bull / bear case. Every item cites a call
       and a page; the prompt forbids outside knowledge.
"""
from __future__ import annotations

import json
import re
from datetime import date

from ..llm import client as llm
from ..http import FetchError
from ..sources import documents
from .fundamentals import fy

# A paragraph is kept only if it looks *forward*: past-quarter commentary full of
# numbers is already in the results table and need not be paid for twice.
FORWARD = re.compile(
    r"guid|expect|target|outlook|\baim|aspir|\bplan(ned|ning|s)?\b|going forward|"
    r"next (year|quarter|few|couple|two|three)|coming (year|quarter)|by (the end of )?(fy|20\d\d|q[1-4]|march|june|september|december)|"
    r"commission|ramp|will (be|see|start|achieve|reach|grow|continue)|should (be|see)|on track|timeline|"
    r"delay|deferr|postpon|revis|reiterat|maintain (our|the)|visibility|pipeline|order book|"
    r"h[12] ?(of )?fy|second half|first half|fy ?'?2\d|peak (debt|capex)|capex of|investment of",
    re.I)
BOILER = re.compile(r"safe harbo|forward-looking statements|ladies and gentlemen|operator|"
                    r"press star|disclaimer|thank you|please go ahead|next question", re.I)


def call_quarter(call_period: str) -> str:
    """'Nov 2026' (month of the call) -> 'Q2 FY27' (the quarter it discussed)."""
    m = re.match(r"([A-Za-z]{3})\w* (\d{4})", call_period or "")
    if not m:
        return call_period
    month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].index(m.group(1).lower()) + 1
    year = int(m.group(2))
    if month <= 3:
        q, fy_ = 3, year
    elif month <= 6:
        q, fy_ = 4, year
    elif month <= 9:
        q, fy_ = 1, year + 1
    else:
        q, fy_ = 2, year + 1
    return f"Q{q} FY{str(fy_)[2:]}"


def prefilter(pages: list[str]) -> tuple[str, int, int]:
    """Keep forward-looking sentences plus one sentence either side for context;
    drop boilerplate. Returns (text with [pN] markers, chars in, chars out)."""
    kept, total = [], 0
    for i, page in enumerate(pages):
        total += len(page)
        flat = re.sub(r"\s+", " ", page)
        sents = [x.strip() for x in re.split(r"(?<=[.?!])\s+(?=[A-Z\"'(])", flat) if x.strip()]
        keep = set()
        for j, x in enumerate(sents):
            if FORWARD.search(x) and not BOILER.search(x[:80]):
                keep.update((j - 1, j, j + 1))
        chosen = [sents[j] for j in sorted(keep) if 0 <= j < len(sents)]
        if chosen:
            kept.append(f"[p{i + 1}] " + " ".join(chosen))
    text = "\n\n".join(kept)
    return text, total, len(text)


_MAP_SCHEMA = {
    "type": "object",
    "properties": {
        "commitments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string", "enum": ["revenue", "margin", "profit", "volume", "capacity",
                                                         "capex", "commissioning", "debt", "market_share",
                                                         "costs", "other"]},
                    "metric": {"type": "string"},
                    "target": {"type": "string"},
                    "horizon": {"type": "string"},
                    "quote": {"type": "string"},
                    "speaker": {"type": "string"},
                    "page": {"type": "integer"},
                },
                "required": ["topic", "metric", "target", "horizon", "quote", "speaker", "page"],
                "additionalProperties": False,
            },
        },
        "explanations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"about": {"type": "string"}, "quote": {"type": "string"}, "page": {"type": "integer"}},
                "required": ["about", "quote", "page"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["commitments", "explanations"],
    "additionalProperties": False,
}
_MAP_SYSTEM = """You read excerpts of an Indian listed company's earnings-call transcript. Page markers look like [p7].
Extract management's forward-looking commitments that could later be checked: growth rates, margin ranges, revenue or volume targets, capacity additions, capex amounts, commissioning dates, debt targets, market share, cost savings. Include reaffirmations of earlier guidance.
- quote: copy management's words verbatim, at most 40 words.
- target: the number or outcome promised ("15-18% revenue growth", "commission by Q4 FY27"). horizon: the period it applies to.
- page: the [pN] marker the quote sits under.
- Skip vague optimism with nothing checkable ("we remain confident"), analyst questions, and statements about the past.
Also capture management's explanations for misses or delays (explanations), with verbatim quotes.
Use only the text provided."""

_CASE = {
    "type": "object",
    "properties": {"point": {"type": "string"}, "evidence": {"type": "string"}, "source": {"type": "string"}},
    "required": ["point", "evidence", "source"],
    "additionalProperties": False,
}
_REDUCE_SCHEMA = {
    "type": "object",
    "properties": {
        "ledger": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "promise": {"type": "string"},
                    "made_in": {"type": "string"},
                    "quote": {"type": "string"},
                    "page": {"type": "integer"},
                    "topic": {"type": "string"},
                    "status": {"type": "string", "enum": ["delivered", "on_track", "missed", "walked_back",
                                                          "pending", "unverifiable"]},
                    "actual": {"type": "string"},
                },
                "required": ["promise", "made_in", "quote", "page", "topic", "status", "actual"],
                "additionalProperties": False,
            },
        },
        "current_guidance": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"metric": {"type": "string"}, "target": {"type": "string"},
                               "horizon": {"type": "string"}, "quote": {"type": "string"},
                               "made_in": {"type": "string"}, "page": {"type": "integer"},
                               "change": {"type": "string", "enum": ["new", "reiterated", "raised", "cut", "unclear"]}},
                "required": ["metric", "target", "horizon", "quote", "made_in", "page", "change"],
                "additionalProperties": False,
            },
        },
        "credibility": {
            "type": "object",
            "properties": {"label": {"type": "string", "enum": ["high", "mixed", "low", "too early"]},
                           "summary": {"type": "string"}},
            "required": ["label", "summary"],
            "additionalProperties": False,
        },
        "narrative_vs_numbers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"story": {"type": "string"}, "numbers": {"type": "string"},
                               "verdict": {"type": "string", "enum": ["agree", "partly", "diverge"]},
                               "made_in": {"type": "string"}, "page": {"type": "integer"}},
                "required": ["story", "numbers", "verdict", "made_in", "page"],
                "additionalProperties": False,
            },
        },
        "bull": {"type": "array", "items": _CASE},
        "bear": {"type": "array", "items": _CASE},
    },
    "required": ["ledger", "current_guidance", "credibility", "narrative_vs_numbers", "bull", "bear"],
    "additionalProperties": False,
}
_REDUCE_SYSTEM = """You are a buy-side analyst checking whether an Indian company's management delivers what it promises.
You get (1) commitments management made on its last few earnings calls, each with a verbatim quote, call and page, and (2) the company's actual reported numbers by quarter and year (Rs crore, from its filings).

Rules
- Use ONLY these materials. Do not use anything you know about the company from elsewhere. If the materials cannot settle a question, say so.
- ledger: at most 12 rows, the promises that matter most for valuation (headline growth, margins, profit, capex and commissioning before minor operating detail). One row per distinct promise; merge reaffirmations and keep the earliest quote. status:
  delivered / missed — the numbers or a later call settle it; on_track — partway and tracking; walked_back — a later call lowered, delayed or dropped it; pending — its deadline has not arrived; unverifiable — needs data we do not have (segment volumes etc.) and no later call reports it.
  actual: what the numbers or later calls show, with periods and figures, at most 30 words. Be exact with arithmetic.
- current_guidance: what management guides to now (latest call), and whether that is new, reiterated, raised or cut versus earlier calls.
- credibility: label and a 2-sentence summary of the delivery record. Judge the record, not the business.
- narrative_vs_numbers: 2-4 places where management's story and the reported numbers agree or diverge. Favour divergences.
- bull and bear: 3 points each, each tied to evidence in these materials; source names the call (e.g. "Q2 FY27 call p4") or "reported numbers".
Plain words, no hype, no adjectives you cannot support. Rupee amounts in crore."""


def _actuals(co: dict) -> str:
    q = co.get("quarters") or {}
    rows = q.get("rows", {})
    lines = ["Quarter | Revenue | EBITDA | EBITDA margin % | PBT | PAT"]
    periods = q.get("periods", [])
    for i in range(max(0, len(periods) - 9), len(periods)):
        def g(k):
            s = rows.get(k, [])
            v = s[i] if i < len(s) else None
            return "-" if v is None else f"{v:,.0f}"
        rv, eb = rows.get("revenue", [None] * 99)[i], rows.get("ebitda", [None] * 99)[i]
        m = f"{100 * eb / rv:.1f}" if rv and eb is not None else "-"
        d = date.fromisoformat(periods[i])
        qn = {6: 1, 9: 2, 12: 3, 3: 4}[d.month]
        fyy = d.year + 1 if d.month > 3 else d.year
        lines.append(f"Q{qn} FY{str(fyy)[2:]} | {g('revenue')} | {g('ebitda')} | {m} | {g('pbt')} | {g('pat')}")
    a = co.get("annual") or {}
    ar = a.get("rows", {})
    lines.append("\nYear | Revenue | EBITDA | PAT")
    for i, p in enumerate(a.get("periods", [])[-4:], start=len(a.get("periods", [])) - 4):
        def ga(k):
            s = ar.get(k, [])
            v = s[i] if 0 <= i < len(s) else None
            return "-" if v is None else f"{v:,.0f}"
        lines.append(f"{fy(p)} | {ga('revenue')} | {ga('ebitda')} | {ga('pat')}")
    b, c = co.get("balance") or {}, co.get("cashflow") or {}
    if b.get("periods") and c.get("periods"):
        lines.append("\nYear | Borrowings | Capital WIP | Cash from operations | Cash from investing (≈ -capex)")
        bp, cp = b["periods"], c["periods"]
        for p in bp[-4:]:
            i, j = bp.index(p), (cp.index(p) if p in cp else None)
            def gb(k):
                v = (b["rows"].get(k) or [None] * 99)[i]
                return "-" if v is None else f"{v:,.0f}"
            def gc(k):
                v = (c["rows"].get(k) or [None] * 99)[j] if j is not None else None
                return "-" if v is None else f"{v:,.0f}"
            lines.append(f"{fy(p)} | {gb('borrowings')} | {gb('cwip')} | {gc('cfo')} | {gc('cfi')}")
    r = co.get("ratios") or {}
    if r.get("periods") and r["rows"].get("debtor_days"):
        lines.append("\nYear | Debtor days | Inventory days | Cash conversion cycle (days)")
        for i, p in enumerate(r["periods"][-4:], start=len(r["periods"]) - 4):
            def gr(k):
                s_ = r["rows"].get(k) or []
                v = s_[i] if 0 <= i < len(s_) else None
                return "-" if v is None else f"{v:,.0f}"
            lines.append(f"{fy(p)} | {gr('debtor_days')} | {gr('inventory_days')} | {gr('ccc')}")
    return "\n".join(lines)


def calls_for(co: dict, n: int = 4) -> list[dict]:
    """Latest earnings-call transcripts. Companies that publish no transcripts
    (some only post decks) fall back to management's own investor presentations:
    still primary, just thinner."""
    calls = [c for c in co.get("concalls", []) if c.get("transcript")][:n]
    if len(calls) < 2:
        decks = [{**c, "transcript": c["ppt"], "kind": "deck"} for c in co.get("concalls", [])
                 if c.get("ppt") and not c.get("transcript")]
        calls = (calls + decks)[:n]
    return calls


def map_call(call: dict) -> dict:
    pages = documents.pages(call["transcript"])
    text, n_in, n_out = prefilter(pages)
    if not text:
        return {"commitments": [], "explanations": [], "chars_in": n_in, "chars_out": 0}
    out = llm.complete_json("extract_guidance", "cheap", _MAP_SYSTEM, text[:90000], _MAP_SCHEMA,
                            max_tokens=6000)
    return {**out, "chars_in": n_in, "chars_out": n_out}


def ledger(co: dict, n_calls: int = 4) -> dict:
    calls = calls_for(co, n_calls)
    if not calls:
        return {"status": "no_transcripts"}
    mapped, skipped = [], []
    for c in reversed(calls):                       # oldest first reads naturally
        try:
            m = map_call(c)
        except FetchError:                          # a dead link on the company's site
            skipped.append(c["period"])
            continue
        mapped.append({"call": call_quarter(c["period"]), "held": c["period"], "kind": c.get("kind", "call"),
                       "url": c["transcript"], **m})
    if not mapped:
        return {"status": "no_transcripts"}
    lines = []
    for m in mapped:
        lines.append(f"## {m['call']} {'investor presentation' if m['kind'] == 'deck' else 'earnings call'} (held {m['held']})")
        for x in m["commitments"]:
            lines.append(f"- [{x['topic']}] {x['metric']}: {x['target']} ({x['horizon']}) — "
                         f"\"{x['quote']}\" — {x['speaker']}, p{x['page']}")
        for x in m["explanations"]:
            lines.append(f"- [explanation] {x['about']}: \"{x['quote']}\" p{x['page']}")
    user = (f"Company: {co['name']} ({co['symbol']}). Today: {date.today().isoformat()}.\n\n"
            f"# Commitments by call\n" + "\n".join(lines) +
            f"\n\n# Reported numbers (Rs crore, {'consolidated' if co.get('consolidated') else 'standalone'})\n" +
            _actuals(co))
    out = llm.complete_json("promise_ledger", "strong", _REDUCE_SYSTEM, user, _REDUCE_SCHEMA,
                            max_tokens=12000)
    sources = {m["call"]: m["url"] for m in mapped}
    return {
        "status": "ok", **out,
        "calls": [{"call": m["call"], "held": m["held"], "url": m["url"], "kind": m["kind"],
                   "commitments": len(m["commitments"])} for m in mapped],
        "skipped": skipped,
        "sources": sources,
        "tokens_saved_pct": round(100 * (1 - sum(m["chars_out"] for m in mapped) /
                                         max(1, sum(m["chars_in"] for m in mapped)))),
    }


_BIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "what": {"type": "string"},
        "segments": {"type": "array", "items": {
            "type": "object",
            "properties": {"name": {"type": "string"}, "share": {"type": "string"}, "comment": {"type": "string"}},
            "required": ["name", "share", "comment"], "additionalProperties": False}},
        "kpis": {"type": "array", "items": {
            "type": "object",
            "properties": {"name": {"type": "string"}, "value": {"type": "string"}, "page": {"type": "integer"}},
            "required": ["name", "value", "page"], "additionalProperties": False}},
    },
    "required": ["what", "segments", "kpis"],
    "additionalProperties": False,
}
_BIZ_SYSTEM = """From this earnings-call transcript of an Indian listed company, describe the business using only the text.
- what: what the company does and how it makes money, at most 40 words, plain.
- segments: business segments / revenue streams named in the call, with share of revenue if stated ("" if not), and a comment of at most 15 words on how it did this quarter.
- kpis: up to 5 operating metrics management reported this quarter (utilisation, order book, AUM, ARPU, store count...), with value and [pN] page.
No outside knowledge."""


def business(co: dict) -> dict | None:
    pages, calls = [], []
    for c in calls_for(co, 3):
        try:
            pages = documents.pages(c["transcript"])
        except FetchError:
            continue
        if pages:
            calls = [c]
            break
    if not pages:
        return None
    text = "\n\n".join(f"[p{i + 1}] {p}" for i, p in enumerate(pages[:10]))
    out = llm.complete_json("business_snapshot", "cheap", _BIZ_SYSTEM, text[:45000], _BIZ_SCHEMA,
                            max_tokens=2500)
    return {**out, "source": {"call": call_quarter(calls[0]["period"]), "url": calls[0]["transcript"]}}
