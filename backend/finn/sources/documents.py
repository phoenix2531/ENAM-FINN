"""Primary documents (filings, transcripts, decks, annual reports) -> page text.

PDFs are immutable once filed, so both the bytes and the extracted text are
cached forever. Extraction is per page so citations can point at a page.
"""
from __future__ import annotations

import io
import json
import logging
import re
from datetime import datetime

from ..db import conn, tx
from ..http import fetch

log = logging.getLogger(__name__)


def pages(url: str, max_pages: int | None = None) -> list[str]:
    row = conn().execute("SELECT pages FROM documents WHERE url=?", (url,)).fetchone()
    if row:
        out = json.loads(row["pages"])
        return out[:max_pages] if max_pages else out

    from pypdf import PdfReader

    data = fetch(url, ttl=float("inf"), timeout=120)
    if not data.startswith(b"%PDF"):
        log.warning("not a pdf: %s", url)
        return []
    reader = PdfReader(io.BytesIO(data))
    out = []
    for p in reader.pages:
        try:
            out.append(_clean(p.extract_text() or ""))
        except Exception:  # a single broken page should not sink the document
            out.append("")
    with tx() as c:
        c.execute("INSERT OR REPLACE INTO documents VALUES (?,?,?,?)",
                  (url, json.dumps(out), len(out), datetime.now().isoformat()))
    return out[:max_pages] if max_pages else out


def _clean(t: str) -> str:
    t = t.replace("\x00", "")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def text(url: str, max_pages: int | None = None) -> str:
    return "\n\n".join(f"[p{i + 1}] {p}" for i, p in enumerate(pages(url, max_pages)))
