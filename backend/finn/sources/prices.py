"""End-of-day price & volume from Yahoo Finance (yfinance).

NSE tickers get the .NS suffix. One batched download per refresh; rows are
upserted so re-running is idempotent.
"""
from __future__ import annotations

import logging

from ..db import tx

log = logging.getLogger(__name__)


def refresh(symbols: list[str], period: str = "6mo") -> int:
    import yfinance as yf

    tickers = [f"{s}.NS" for s in symbols]
    df = yf.download(tickers, period=period, interval="1d", auto_adjust=False,
                     progress=False, group_by="ticker", threads=True)
    n = 0
    with tx() as c:
        for s, t in zip(symbols, tickers):
            try:
                sub = df[t].dropna(subset=["Close"])
            except KeyError:
                log.warning("no price data for %s", t)
                continue
            for date, row in sub.iterrows():
                c.execute(
                    "INSERT OR REPLACE INTO prices VALUES (?,?,?,?,?,?,?)",
                    (s, date.strftime("%Y-%m-%d"), float(row["Open"]), float(row["High"]),
                     float(row["Low"]), float(row["Close"]), float(row["Volume"])))
                n += 1
    return n


def history(symbol: str, limit: int = 130) -> list[dict]:
    from ..db import conn
    rows = conn().execute(
        "SELECT date, open, high, low, close, volume FROM prices WHERE symbol=? "
        "ORDER BY date DESC LIMIT ?", (symbol, limit)).fetchall()
    return [dict(r) for r in reversed(rows)]
