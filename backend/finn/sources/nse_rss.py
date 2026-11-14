"""NSE's public announcements RSS feed.

The feed is official and meant for machines, but it only holds the last few
hours of filings across the whole exchange. So it is a *poller*: run it every
few minutes (the feed's own ttl is 5) and new items for symbols we track are
appended to the filings table. History comes from the screener backfill.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree

from ..db import tx
from ..http import fetch

FEED = "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml"
IST = timezone(timedelta(hours=5, minutes=30))


def parse(xml: bytes) -> list[dict]:
    root = ElementTree.fromstring(xml)
    out = []
    for item in root.iter("item"):
        desc = (item.findtext("description") or "").strip()
        m = re.match(r"^([A-Z0-9&\-]+)\s*:\s*(.*)$", desc, re.S)
        if not m:
            continue
        symbol, body = m.group(1), m.group(2)
        subject = ""
        if "|SUBJECT:" in body:
            body, subject = body.rsplit("|SUBJECT:", 1)
        try:
            when = datetime.strptime(item.findtext("pubDate", "").strip(), "%d-%b-%Y %H:%M:%S")
        except ValueError:
            continue
        link = (item.findtext("link") or "").strip()
        out.append({
            "symbol": symbol,
            "company": (item.findtext("title") or "").strip(),
            "title": subject.strip() or (item.findtext("title") or "").strip(),
            "excerpt": body.strip(),
            "published": when.replace(tzinfo=IST).isoformat(),
            "url": link or None,
        })
    return out


def poll(symbols: set[str]) -> int:
    """Fetch the feed (cached 4 minutes) and store items for tracked symbols."""
    items = [i for i in parse(fetch(FEED, ttl=240)) if i["symbol"] in symbols]
    with tx() as c:
        for i in items:
            fid = hashlib.sha1((i["url"] or i["symbol"] + i["published"] + i["title"]).encode()).hexdigest()
            c.execute(
                "INSERT OR IGNORE INTO filings (id, symbol, published, title, excerpt, url, source) "
                "VALUES (?,?,?,?,?,?, 'nse_rss')",
                (fid, i["symbol"], i["published"], i["title"], i["excerpt"], i["url"]))
    return len(items)
