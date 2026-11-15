"""HTTP API. Same JSON shapes as the static snapshot, plus live dossiers for any
NSE ticker the snapshot does not cover.

    uvicorn finn.api:app --port 8000
"""
from __future__ import annotations

import json
import os
import re
import threading
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import ROOT, SNAPSHOT, llm_provider
from .network.engine import Network
from .pull import dossier
from .sources import screener
from .sources.screener import UnknownTicker

app = FastAPI(title="FINN", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("FINN_CORS", "*").split(","),
                   allow_methods=["GET"], allow_headers=["*"])

_net: Network | None = None
_net_lock = threading.Lock()
_building: dict[str, threading.Lock] = {}


def net() -> Network:
    global _net
    with _net_lock:
        if _net is None:
            _net = Network(today=date.today())
        return _net


@app.get("/api/health")
def health():
    b = SNAPSHOT / "bundle.json"
    return {"ok": True, "llm": llm_provider(),
            "snapshot": json.loads(b.read_text())["meta"]["generated_at"] if b.exists() else None}


@app.get("/api/bundle")
def bundle():
    b = SNAPSHOT / "bundle.json"
    if not b.exists():
        raise HTTPException(503, "No snapshot yet. Run: python -m finn.pipeline all")
    return FileResponse(b, media_type="application/json")


@app.get("/api/search")
def search(q: str = ""):
    """Name -> ticker suggestions for the Research search box."""
    return screener.search(q)


@app.get("/api/dossier/{symbol}")
def get_dossier(symbol: str, fresh: bool = False):
    symbol = symbol.upper().strip()
    if not re.fullmatch(r"[A-Z0-9&\-]{1,20}", symbol):
        raise HTTPException(400, "Not a valid NSE symbol")
    path = SNAPSHOT / "dossier" / f"{symbol}.json"
    # A forced rebuild spends model quota and could replace a reviewed dossier,
    # so the public server ignores it unless the operator opts in.
    fresh = fresh and os.environ.get("FINN_ALLOW_REFRESH") == "1"
    if path.exists() and not fresh:
        return FileResponse(path, media_type="application/json")
    lock = _building.setdefault(symbol, threading.Lock())
    with lock:                         # two taps on the same ticker build it once
        if path.exists() and not fresh:
            return FileResponse(path, media_type="application/json")
        try:
            d = dossier.build(symbol, net(), with_llm=True)  # cached answers or a clear "needs a model" note
        except UnknownTicker:
            raise HTTPException(404, f"No listed company found for {symbol}")
        # Only persist complete dossiers, so a missing key or a transient model
        # error is never frozen in; the next request retries.
        if all(d.get(k, {}).get("status") == "ok" for k in ("business", "guidance")):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(d, default=str))
        return JSONResponse(d)


# The built frontend, served from the same origin when present.
DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")
    # Serve the live snapshot folder, not the copy frozen into the build, so a
    # dossier built on this server is a plain file on the next request.
    data_dir = SNAPSHOT if SNAPSHOT.exists() else DIST / "data"
    if data_dir.exists():
        app.mount("/data", StaticFiles(directory=data_dir), name="data")

    @app.get("/{path:path}")
    def spa(path: str):
        return FileResponse(spa_file(path))


def spa_file(path: str, dist: Path = DIST) -> Path:
    """The built file for `path`, or index.html. The path arrives URL-decoded,
    so `%2e%2e/` is a real `../`: anything resolving outside dist falls back."""
    root = dist.resolve()
    f = (root / path).resolve()
    if path and f.is_file() and f.is_relative_to(root):
        return f
    return root / "index.html"
