"""SQLite store. One file, WAL mode, no ORM: the schema is small enough to read."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    symbol      TEXT PRIMARY KEY,
    name        TEXT,
    data        TEXT NOT NULL,          -- parsed screener payload (json)
    fetched_at  TEXT
);
CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume REAL,
    PRIMARY KEY (symbol, date)
);
CREATE TABLE IF NOT EXISTS filings (
    id          TEXT PRIMARY KEY,        -- sha1 of the filing url (or rss guid)
    symbol      TEXT NOT NULL,
    published   TEXT NOT NULL,           -- ISO8601 with offset
    title       TEXT,
    excerpt     TEXT,
    url         TEXT,
    source      TEXT,                    -- screener | nse_rss
    category    TEXT,
    classified_by TEXT,                  -- rule:<name> | llm | default
    enrichment  TEXT                     -- json, filled by push.enrich
);
CREATE INDEX IF NOT EXISTS filings_by_time ON filings(published);
CREATE TABLE IF NOT EXISTS documents (
    url        TEXT PRIMARY KEY,
    pages      TEXT NOT NULL,            -- json list of page texts
    n_pages    INTEGER,
    fetched_at TEXT
);
CREATE TABLE IF NOT EXISTS llm_calls (
    key        TEXT PRIMARY KEY,         -- sha256 of task+model+prompt+schema
    task       TEXT,
    model      TEXT,
    output     TEXT,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    cost_usd   REAL,
    created_at TEXT DEFAULT (datetime('now'))
);
"""

_local = threading.local()


def conn() -> sqlite3.Connection:
    c = getattr(_local, "conn", None)
    if c is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(DB_PATH, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(SCHEMA)
        _local.conn = c
    return c


@contextmanager
def tx():
    c = conn()
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise


def jload(s: str | None, default=None):
    return json.loads(s) if s else default
