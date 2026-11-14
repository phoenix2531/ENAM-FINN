"""Every company listed on NSE, from the exchange's own equity master file.

Feeds the Research search box: instant name -> ticker autocomplete with no
network call per keystroke and no model involved.

    python -m finn.sources.nse_list      # refresh data/snapshot/companies.json
"""
from __future__ import annotations

import csv
import io
import json
import re

import requests

from ..config import SNAPSHOT

URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
OUT = SNAPSHOT / "companies.json"


def _clean(name: str) -> str:
    return re.sub(r"\s+(Limited|Ltd\.?)$", "", name.strip(), flags=re.I)


def fetch() -> list[list[str]]:
    r = requests.get(URL, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    rows = csv.DictReader(io.StringIO(r.text))
    out = {}
    for row in rows:
        row = {k.strip(): (v or "").strip() for k, v in row.items()}
        sym, name = row.get("SYMBOL"), row.get("NAME OF COMPANY")
        if sym and name:
            out[sym] = _clean(name)
    return sorted([s, n] for s, n in out.items())


def refresh() -> int:
    rows = fetch()
    if len(rows) < 1000:  # a partial or blocked download must not replace a good list
        raise RuntimeError(f"NSE list looks incomplete ({len(rows)} rows); keeping the old one")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, separators=(",", ":")))
    return len(rows)


if __name__ == "__main__":
    print(f"wrote {refresh()} companies to {OUT}")
