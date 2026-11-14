"""Pull: everything FINN knows about one company, for any NSE ticker.

Deterministic sections always render. Model-written sections (business
snapshot, promise ledger) render when a provider is configured or a cached
answer exists, and say so plainly when they cannot.
"""
from __future__ import annotations

import logging
from datetime import date

from ..llm import client as llm
from ..network.engine import Network
from ..sources import screener
from . import fundamentals, guidance

log = logging.getLogger(__name__)


def build(symbol: str, net: Network, with_llm: bool = True) -> dict:
    co = screener.get_company(symbol).to_dict()
    org = net.resolver.ensure_company(co["symbol"], co["name"], co["sector_path"])
    out = {
        "symbol": co["symbol"], "name": co["name"], "sector_path": co["sector_path"],
        "about": co["about"], "bse_code": co["bse_code"],
        "links": {"screener": f"https://www.screener.in/company/{co['symbol']}/",
                  "nse": f"https://www.nseindia.com/get-quotes/equity?symbol={co['symbol']}"},
        "fundamentals": fundamentals.analyse(co),
        "documents": {"transcripts": [{"call": guidance.call_quarter(c["period"]), "held": c["period"],
                                       "url": c["transcript"], "kind": c.get("kind", "call")}
                                      for c in guidance.calls_for(co, 6)],
                      "annual_reports": co["annual_reports"][:5]},
        "generated": date.today().isoformat(),
    }

    def model_section(name, fn):
        try:
            return {"status": "ok", **(fn(co) or {})} if with_llm else {"status": "skipped"}
        except llm.LLMUnavailable:
            return {"status": "needs_model",
                    "message": "Reading transcripts needs a language model. Set LLM_API_KEY (free tier) to enable."}
        except llm.LLMBusy as e:
            log.warning("%s for %s: %s", name, symbol, e)
            return {"status": "busy", "message": str(e)}
        except Exception as e:
            log.exception("%s failed for %s", name, symbol)
            return {"status": "error", "message": str(e)[:200]}

    out["business"] = model_section("business", guidance.business)
    out["guidance"] = model_section("guidance", guidance.ledger)

    # Network: who to call, and the people FINN has seen at this company
    out["network"] = {
        "call": net.who_to_call(co["symbol"], "results", k=5),
        "alumni": [],
    }
    for c in net.contacts:
        for p in c.positions:
            if p.org == org.id:
                out["network"]["alumni"].append({
                    "contact": net.card(c), "title": p.title, "from": p.start,
                    "to": None if p.current else p.end, "current": p.current,
                    "tie": net.investor_tie(c)})
    out["network"]["people"] = []
    for person in net.people.values():
        if person.kind == "public" and any(p.org == org.id and p.current for p in person.positions):
            out["network"]["people"].append({"person": net.card(person), "paths": net.paths_to(person, k=3)})
    return out
