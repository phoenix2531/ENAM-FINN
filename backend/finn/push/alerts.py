"""End-of-day signals. The server computes per-day stats once; the investor's
thresholds are applied on top (in the app, live, so they can see how noisy a
setting would have been before committing to it)."""
from __future__ import annotations

from statistics import mean

from ..sources import prices


def daily_stats(symbol: str, lookback: int = 20, keep: int = 90) -> list[dict]:
    rows = prices.history(symbol, limit=keep + lookback + 1)
    out = []
    for i in range(1, len(rows)):
        prev, cur = rows[i - 1], rows[i]
        window = [r["volume"] for r in rows[max(0, i - lookback):i] if r["volume"]]
        avg = mean(window) if len(window) >= 5 else None
        out.append({
            "date": cur["date"],
            "close": round(cur["close"], 2),
            "ret": round(100 * (cur["close"] / prev["close"] - 1), 2) if prev["close"] else None,
            "vol": int(cur["volume"]),
            "volx": round(cur["volume"] / avg, 2) if avg else None,
        })
    return out[-keep:]


def triggered(stats: list[dict], rules: dict) -> list[dict]:
    hits = []
    for s in stats:
        why = []
        if s["volx"] is not None and s["volx"] >= rules["volume_multiple"]:
            why.append(f"volume {s['volx']:.1f}× its {rules['volume_lookback']}-day average")
        if s["ret"] is not None and abs(s["ret"]) >= rules["price_move_pct"]:
            why.append(f"price {'+' if s['ret'] > 0 else ''}{s['ret']:.1f}% on the day")
        if why:
            hits.append({**s, "why": why})
    return hits
