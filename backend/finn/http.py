"""One polite HTTP client for every source.

- honest User-Agent, no cookie games
- per-host spacing so we never hammer a site
- content cached on disk with a TTL, so a rebuild costs zero requests
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

from .config import CACHE, HOST_INTERVAL, USER_AGENT

_HTTP_CACHE = CACHE / "http"
_HTTP_CACHE.mkdir(parents=True, exist_ok=True)
_last_hit: dict[str, float] = {}
_lock = threading.Lock()
_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT})


class FetchError(RuntimeError):
    pass


def _paths(url: str) -> tuple[Path, Path]:
    key = hashlib.sha1(url.encode()).hexdigest()
    return _HTTP_CACHE / f"{key}.body", _HTTP_CACHE / f"{key}.meta.json"


def _wait_turn(host: str) -> None:
    gap = HOST_INTERVAL.get(host, HOST_INTERVAL["default"])
    with _lock:
        now = time.monotonic()
        wait = _last_hit.get(host, 0) + gap - now
        _last_hit[host] = max(now, _last_hit.get(host, 0) + gap)
    if wait > 0:
        time.sleep(wait)


def fetch(url: str, ttl: float = 6 * 3600, timeout: float = 45) -> bytes:
    """Return the body of `url`, from cache if younger than `ttl` seconds.
    ttl=float('inf') means 'immutable' (filings, transcripts, reports)."""
    body_p, meta_p = _paths(url)
    if body_p.exists() and meta_p.exists():
        meta = json.loads(meta_p.read_text())
        if time.time() - meta["fetched_at"] < ttl:
            return body_p.read_bytes()

    _wait_turn(urlparse(url).netloc)
    try:
        r = _session.get(url, timeout=timeout)
    except requests.RequestException as e:
        if body_p.exists():  # stale beats nothing
            return body_p.read_bytes()
        raise FetchError(f"{url}: {e}") from e
    if r.status_code != 200:
        if body_p.exists():
            return body_p.read_bytes()
        raise FetchError(f"{url}: HTTP {r.status_code}")
    body_p.write_bytes(r.content)
    meta_p.write_text(json.dumps({"url": url, "fetched_at": time.time(),
                                  "content_type": r.headers.get("content-type")}))
    return r.content


def fetch_text(url: str, ttl: float = 6 * 3600) -> str:
    return fetch(url, ttl=ttl).decode("utf-8", errors="replace")
