"""FINN pipeline.

    python -m finn.pipeline refresh     # fetch companies, prices, filings; classify
    python -m finn.pipeline poll        # NSE RSS only (run every ~5 min in market hours)
    python -m finn.pipeline snapshot    # build Brief, Network, dossiers -> data/snapshot
    python -m finn.pipeline all         # refresh + snapshot

The snapshot is plain JSON the app can load with no backend at all, which is
what makes the deployed demo impossible to break. The API serves the same
shapes live and builds dossiers for tickers outside the snapshot on demand.
"""
from __future__ import annotations

import argparse
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

from .config import DEFAULT_ALERT_RULES, INPUTS, SNAPSHOT, llm_provider
from .db import conn, jload, tx
from .llm import client as llm
from .network.engine import Network
from .pull import dossier
from .push import brief
from .sources import nse_rss, prices, screener

log = logging.getLogger("finn")


LLM_CACHE = INPUTS.parent / "llm_cache.jsonl"


def _warm_cache() -> None:
    """A fresh clone has an empty database; seed it from the committed cache."""
    if LLM_CACHE.exists() and conn().execute("SELECT COUNT(*) FROM llm_calls").fetchone()[0] == 0:
        log.info("imported %d cached model answers", llm.import_cache(LLM_CACHE))


def load_portfolio() -> dict:
    return json.loads((INPUTS / "portfolio.json").read_text())


def all_symbols(p: dict) -> list[str]:
    return [x["symbol"] for x in p["portfolio"]] + p["research"]


def refresh(today: date) -> None:
    p = load_portfolio()
    syms = all_symbols(p)
    for s in syms:
        try:
            co = screener.get_company(s).to_dict()
        except Exception as e:
            log.warning("screener failed for %s: %s", s, e)
            continue
        with tx() as c:
            c.execute("INSERT OR REPLACE INTO companies VALUES (?,?,?,?)",
                      (s, co["name"], json.dumps(co), co["fetched_at"]))
        brief.ingest_screener(s, co)
    try:
        n = prices.refresh(syms)
        log.info("prices: %d rows", n)
    except Exception as e:
        log.warning("price refresh failed: %s", e)
    poll()
    log.info("classified %d new filings", brief.classify_pending())


def poll() -> None:
    p = load_portfolio()
    try:
        n = nse_rss.poll(set(all_symbols(p)))
        log.info("nse rss: %d items for tracked symbols", n)
    except Exception as e:
        log.warning("nse rss poll failed: %s", e)
    brief.classify_pending()


def _companies() -> dict[str, dict]:
    return {r["symbol"]: json.loads(r["data"]) for r in conn().execute("SELECT symbol, data FROM companies")}


def _notices(net: Network, b: dict, expertise: dict) -> list[dict]:
    """The few things the network layer noticed that the investor would not."""
    out = []
    for s in b["stories"]:
        for p in s.get("people", []):
            if p["incoming"] and p["paths"]:
                best = p["paths"][0]
                out.append({"kind": "path", "symbol": s["symbol"], "story": s["id"], "person": p["id"],
                            "text": f"{best['contact']['name']} crossed paths with {p['name']} "
                                    f"({p['role'].split(';')[0].split('(')[0].strip()}, {s['company']})",
                            "detail": best["links"][0]["text"], "strength": best["label"]})
    for r in b["reconnect"][:4]:
        out.append({"kind": "reconnect", "symbol": r["event"]["symbol"], "contact": r["contact"]["id"],
                    "text": f"Reason to call {r['contact']['name']}: {r['months_silent']} months since you spoke",
                    "detail": r["hook"], "strength": r["tie"]["label"]})
    weights = {x["symbol"]: x["weight"] for x in load_portfolio()["portfolio"]}
    gaps = [t for t in expertise["themes"] if t["coverage"] in ("blind spot", "thin") and t["portfolio"]]
    gaps.sort(key=lambda t: (t["coverage"] != "blind spot", -sum(weights.get(s, 0) for s in t["portfolio"])))
    for t in gaps[:3]:
        if t["coverage"] == "blind spot":
            out.append({"kind": "gap", "symbol": t["portfolio"][0] if t["portfolio"] else None,
                        "text": f"Blind spot: nobody in your network knows {t['theme'].lower()}",
                        "detail": f"You own {', '.join(t['portfolio'])}.", "strength": "weak"})
        else:
            names = ", ".join(x["contact"]["name"] for x in t["people"][:2])
            out.append({"kind": "gap", "symbol": t["portfolio"][0],
                        "text": f"Thin coverage on {t['theme'].lower()}: only {names}",
                        "detail": f"You own {', '.join(t['portfolio'])} ({sum(weights.get(s, 0) for s in t['portfolio']):.1f}% of the book). Worth one more expert.",
                        "strength": "medium"})
    for sym, msg in b["cautions"].items():
        out.append({"kind": "caution", "symbol": sym, "text": f"{sym}: insiders are off-limits for now",
                    "detail": msg, "strength": "strong"})
    return out


def snapshot(today: date, workers: int = 3, symbols: list[str] | None = None) -> None:
    p = load_portfolio()
    companies = _companies()
    net = Network(today=today)
    for s, co in companies.items():
        net.resolver.ensure_company(s, co["name"], co["sector_path"])

    b = brief.build(p["portfolio"], companies, net, today,
                    watched=set(DEFAULT_ALERT_RULES["categories"]))

    # dossiers: deterministic always, model sections when a provider is configured
    (SNAPSHOT / "dossier").mkdir(parents=True, exist_ok=True)
    targets = symbols or all_symbols(p)

    def one(sym):
        try:
            d = dossier.build(sym, net, with_llm=True)
            (SNAPSHOT / "dossier" / f"{sym}.json").write_text(json.dumps(d, default=str))
            return sym, d["guidance"].get("status")
        except Exception as e:
            log.exception("dossier failed: %s", sym)
            return sym, f"error: {e}"

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for sym, status in ex.map(one, targets):
            log.info("dossier %s: guidance=%s", sym, status)

    expertise = net.expertise_map([x["symbol"] for x in p["portfolio"]])
    portfolio_out = []
    for x in p["portfolio"]:
        co = companies.get(x["symbol"], {})
        st = b["stats"].get(x["symbol"], [])
        portfolio_out.append({
            "symbol": x["symbol"], "name": co.get("name", x["symbol"]), "weight": x["weight"],
            "sector": (co.get("sector_path") or [""])[-1], "mcap": co.get("top", {}).get("Market Cap"),
            "price": st[-1]["close"] if st else co.get("top", {}).get("Current Price"),
            "ret_1d": st[-1]["ret"] if st else None, "stats": st,
        })

    bundle = {
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "today": today.isoformat(),
            "investor": {k: net.investor[k] for k in ("name", "role", "fund")},
            "llm": {"provider": llm_provider(), **llm.ledger()},
            "counts": {"filings": len(b["routine"]) + sum(len(s["filings"]) for s in b["stories"]),
                       "stories": len(b["stories"])},
        },
        "portfolio": portfolio_out,
        "research": [{"symbol": s, "name": companies.get(s, {}).get("name", s)} for s in p["research"]],
        "brief": {k: b[k] for k in ("stories", "routine", "upcoming", "cautions")},
        "alert_rules": DEFAULT_ALERT_RULES,
        "network": {
            "people": {pid: net.profile(pid) for pid in net.people},
            "expertise": expertise,
            "reconnect": b["reconnect"],
            "notices": _notices(net, b, expertise),
            "themes": list(net.themes),
        },
    }
    (SNAPSHOT / "bundle.json").write_text(json.dumps(bundle, default=str))
    n = llm.export_cache(LLM_CACHE)
    log.info("exported %d cached model answers to %s", n, LLM_CACHE.name)
    log.info("snapshot written: %d stories, %d routine, %d people", len(b["stories"]),
             len(b["routine"]), len(net.people))


def main() -> None:
    ap = argparse.ArgumentParser(prog="finn")
    ap.add_argument("cmd", choices=["refresh", "poll", "snapshot", "all"])
    ap.add_argument("--today", help="override today's date (YYYY-MM-DD)")
    ap.add_argument("--only", nargs="*", help="limit dossiers to these symbols")
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    today = date.fromisoformat(a.today) if a.today else date.today()
    _warm_cache()
    if a.cmd in ("refresh", "all"):
        refresh(today)
    if a.cmd == "poll":
        poll()
    if a.cmd in ("snapshot", "all"):
        snapshot(today, workers=a.workers, symbols=a.only)


if __name__ == "__main__":
    main()
