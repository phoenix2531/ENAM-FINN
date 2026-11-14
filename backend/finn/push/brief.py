"""Filings -> stories -> the Brief.

A board meeting often produces three filings (results, a CEO exit, a
divestment). The investor wants one story, so material filings for the same
company within ~36 hours are clustered, and the story is enriched according
to the most important thing in it. Routine paperwork is kept, but folded.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import date, datetime, timedelta

from ..db import conn, jload, tx
from ..llm import client as llm
from ..network.engine import Network
from . import classify, enrich
from .alerts import daily_stats

log = logging.getLogger(__name__)
CLUSTER_HOURS = 36


def ingest_screener(symbol: str, company: dict) -> int:
    """Backfill: the five latest filings screener lists for this company."""
    n = 0
    with tx() as c:
        for a in company.get("announcements", []):
            if not a.get("published") or not a.get("url"):
                continue
            fid = hashlib.sha1(a["url"].encode()).hexdigest()
            c.execute("INSERT OR IGNORE INTO filings (id, symbol, published, title, excerpt, url, source) "
                      "VALUES (?,?,?,?,?,?, 'screener')",
                      (fid, symbol, a["published"], a["title"], a["excerpt"], a["url"]))
            n += 1
    return n


def classify_pending() -> int:
    rows = conn().execute("SELECT id, title, excerpt FROM filings WHERE category IS NULL").fetchall()
    with tx() as c:
        for r in rows:
            cat, sub, by = classify.classify(r["title"] or "", r["excerpt"] or "")
            c.execute("UPDATE filings SET category=?, classified_by=? WHERE id=?",
                      (f"{cat}/{sub}" if sub else cat, by, r["id"]))
    return len(rows)


def _filings(symbols: list[str], since: datetime) -> list[dict]:
    q = ",".join("?" * len(symbols))
    rows = conn().execute(
        f"SELECT * FROM filings WHERE symbol IN ({q}) AND published >= ? ORDER BY published DESC",
        (*symbols, since.isoformat())).fetchall()
    return [dict(r) for r in rows]


def _trading_window_cautions(filings: list[dict], today: date) -> dict:
    """If a company has said its trading window is closed until results, and the
    results are still to come, calling its insiders is off-limits."""
    out = {}
    by_sym: dict[str, list] = {}
    for f in filings:
        by_sym.setdefault(f["symbol"], []).append(f)
    for sym, fs in by_sym.items():
        closed = any(re.search(r"trading window", f["title"] + f["excerpt"], re.I) for f in fs)
        results_done = any(f["category"] == "results/filing" for f in fs)
        upcoming = [f for f in fs if f["category"] == "results/intimation"]
        if closed and upcoming and not results_done:
            m = re.search(r"(\w+ \d{1,2}, \d{4}|\d{1,2} \w+ \d{4})", upcoming[0]["excerpt"])
            when = f" ({m.group(1)})" if m else ""
            out[sym] = (f"Trading window is closed until 48 hours after results{when}. "
                        "Don't discuss the company with current insiders until then.")
    return out


def _upcoming(filings: list[dict], today: date) -> list[dict]:
    out = []
    for f in filings:
        if f["category"] not in ("results/intimation",) and "board meet" not in (f["excerpt"] or "").lower():
            continue
        m = re.search(r"(january|february|march|april|may|june|july|august|september|october|november|december) (\d{1,2}),? (\d{4})|"
                      r"(\d{1,2}) (january|february|march|april|may|june|july|august|september|october|november|december),? (\d{4})",
                      f["excerpt"] or "", re.I)
        if not m:
            continue
        try:
            if m.group(1):
                d = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y").date()
            else:
                d = datetime.strptime(f"{m.group(5)} {m.group(4)} {m.group(6)}", "%B %d %Y").date()
        except ValueError:
            continue
        if d >= today:
            out.append({"symbol": f["symbol"], "date": d.isoformat(), "what": f["excerpt"], "url": f["url"]})
    seen, uniq = set(), []
    for u in sorted(out, key=lambda u: u["date"]):
        if (u["symbol"], u["date"]) not in seen:
            seen.add((u["symbol"], u["date"]))
            uniq.append(u)
    return uniq


def _market_reaction(stats: list[dict], published: str) -> dict | None:
    """The first session at or after the filing: how did the stock take it?"""
    when = datetime.fromisoformat(published)
    day = when.date()
    if when.hour >= 15 and when.minute >= 30 or when.hour >= 16:
        day += timedelta(days=1)            # filed after the close: next session reacts
    for s in stats:
        if s["date"] >= day.isoformat():
            return {"date": s["date"], "ret": s["ret"], "volx": s["volx"]}
    return None


def build(portfolio: list[dict], companies: dict[str, dict], net: Network, today: date,
          days: int = 30, watched: set[str] | None = None) -> dict:
    symbols = [p["symbol"] for p in portfolio]
    weights = {p["symbol"]: p.get("weight", 0) for p in portfolio}
    watched = watched or set()
    since = datetime.combine(today - timedelta(days=days), datetime.min.time()).astimezone()
    filings = _filings(symbols, since)
    # trading-window notices are filed weeks before results, so look further back
    cautions = _trading_window_cautions(
        _filings(symbols, since - timedelta(days=45)), today)
    stats = {s: daily_stats(s) for s in symbols}
    meetings = {}
    for m in net.investor.get("company_meetings", []):
        meetings.setdefault(m["symbol"], []).append(m)

    # 1. score every filing
    items = []
    for f in filings:
        cat, _, sub = (f["category"] or "unclassified").partition("/")
        mcap = companies.get(f["symbol"], {}).get("top", {}).get("Market Cap")
        score, why = classify.score(cat, sub, f["title"] or "", f["excerpt"] or "", mcap, watched)
        items.append({**f, "cat": cat, "sub": sub, "score": score, "why": why,
                      "tier": classify.tier(score), "title_clean": enrich.clean_title(f["title"] or "")})

    # 2. cluster material items per company
    stories, routine = [], []
    by_sym: dict[str, list] = {}
    for it in items:
        if it["tier"] == "routine":
            routine.append(it)
        else:
            by_sym.setdefault(it["symbol"], []).append(it)
    for sym, its in by_sym.items():
        its.sort(key=lambda x: x["published"])
        cluster: list[dict] = []
        for it in its:
            if cluster and (datetime.fromisoformat(it["published"]) -
                            datetime.fromisoformat(cluster[-1]["published"])).total_seconds() > CLUSTER_HOURS * 3600:
                stories.append(cluster)
                cluster = []
            cluster.append(it)
        if cluster:
            stories.append(cluster)

    out_stories = []
    for cl in stories:
        cl.sort(key=lambda x: -x["score"])
        lead = cl[0]
        sym = lead["symbol"]
        co = companies.get(sym, {})
        # a story's weight: its most material filing, nudged by how much of the book it is
        rank = lead["score"] + 4 * (len(cl) - 1) + 1.2 * weights.get(sym, 0)
        story = {
            "id": lead["id"][:12], "symbol": sym, "company": co.get("name", sym),
            "weight": weights.get(sym), "published": max(x["published"] for x in cl),
            "category": lead["cat"], "subtype": lead["sub"], "tier": lead["tier"],
            "score": lead["score"], "rank": round(rank, 1), "why": lead["why"],
            "headline": lead["excerpt"] or lead["title_clean"],
            "filings": [{"title": x["title_clean"], "excerpt": x["excerpt"], "url": x["url"],
                         "category": x["cat"], "published": x["published"]} for x in cl],
            "reaction": _market_reaction(stats.get(sym, []), lead["published"]),
            "met": meetings.get(sym, [None])[0],
            "caution": cautions.get(sym),
        }
        cats = {x["cat"] for x in cl}
        subs = {(x["cat"], x["sub"]) for x in cl}

        # results: headline numbers, QoQ and YoY
        if ("results", "filing") in subs or ("results", "deck") in subs:
            card = enrich.results_card(co, lead["published"])
            if card:
                story["results"] = card

        # management change: who, from where, and who in my network crossed paths
        if "management_change" in cats:
            story["people"] = []
            for x in cl:
                if x["cat"] != "management_change":
                    continue
                try:
                    people = enrich.extract_people(x["url"])
                except llm.LLMUnavailable:
                    people = []
                except Exception as e:  # a bad PDF should not drop the story
                    log.warning("people extraction failed for %s: %s", x["url"], e)
                    people = []
                for p in people:
                    yr = None
                    m = re.search(r"(20\d\d)", p.get("effective", ""))
                    if m:
                        yr = int(m.group(1))
                    person = net.add_public_or_filing_person(
                        p["name"], sym, p["role"], p["incoming"], p["career"], p["education"],
                        source=f"{x['url']}#page={p['page']}", effective_year=yr)
                    if any(q["id"] == person.id for q in story["people"]):
                        continue
                    prof = net.profile(person.id)
                    story["people"].append({
                        "id": person.id, "name": person.name, "role": p["role"], "change": p["change"],
                        "incoming": p["incoming"], "effective": p["effective"], "bio": p["bio"],
                        "career": prof["positions"], "education": prof["education"],
                        "sources": prof["sources"], "paths": prof.get("paths", [])[:3],
                    })
                story["people"].sort(key=lambda p: (not p["incoming"], -len(p["career"]), -len(p["paths"])))

        # material event: who is best placed to explain it
        if lead["cat"] in ("M&A", "litigation", "capex", "fund_raise", "press_release", "management_change",
                           "results", "pledging", "credit_rating"):
            text = " ".join((x["excerpt"] or "") + " " + x["title"] for x in cl)
            story["call"] = net.who_to_call(sym, lead["cat"], text, k=3, cautions=cautions)

        if lead["cat"] == "earnings_call" and lead["sub"] == "transcript":
            story["transcript"] = True
        out_stories.append(story)

    out_stories.sort(key=lambda s: -s["rank"])

    routine_out = [{"symbol": r["symbol"], "company": companies.get(r["symbol"], {}).get("name", r["symbol"]),
                    "title": r["title_clean"], "excerpt": r["excerpt"], "url": r["url"],
                    "category": r["cat"], "subtype": r["sub"], "published": r["published"]}
                   for r in sorted(routine, key=lambda r: r["published"], reverse=True)]

    events = [{"symbol": s["symbol"], "headline": s["headline"], "category": s["category"],
               "published": s["published"]} for s in out_stories if s["tier"] == "act"]
    return {
        "stories": out_stories,
        "routine": routine_out,
        "upcoming": _upcoming(filings, today),
        "cautions": cautions,
        "reconnect": net.reconnect(events),
        "stats": stats,
    }
