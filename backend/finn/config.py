"""Paths, defaults and model routing. Everything tunable lives here."""
from __future__ import annotations

import os
from pathlib import Path

def _load_dotenv() -> None:
    """Load KEY=VALUE lines from the repo-root .env (gitignored) without overriding real env vars."""
    f = Path(__file__).resolve().parents[2] / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"\''))


_load_dotenv()


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
INPUTS = DATA / "inputs"
CACHE = DATA / "cache"
SNAPSHOT = DATA / "snapshot"
DB_PATH = Path(os.environ.get("FINN_DB", DATA / "finn.db"))

for p in (CACHE, SNAPSHOT):
    p.mkdir(parents=True, exist_ok=True)

# Identify ourselves honestly to every source we touch.
USER_AGENT = os.environ.get("FINN_USER_AGENT", "FINN-research-prototype/0.1")

# Minimum seconds between two requests to the same host.
HOST_INTERVAL = {"www.screener.in": 2.5, "default": 1.0}

# Default "unusual move" rules. The investor overrides these in the app.
DEFAULT_ALERT_RULES = {
    "volume_multiple": 2.0,      # today's volume vs trailing 20-session average
    "volume_lookback": 20,
    "price_move_pct": 4.0,       # absolute daily close-to-close move
    "categories": ["results", "M&A", "management_change", "litigation",
                   "fund_raise", "capex", "credit_rating", "pledging"],
}

# Model routing. Tier names are what the code asks for; the provider decides
# how to serve them. Cheap model for bulk extraction, strong model only where
# the task is judgement over several documents.
MODELS = {
    # Any OpenAI-compatible endpoint with a free tier (Groq, OpenRouter, Gemini...).
    "openai_compat": {"cheap": os.environ.get("LLM_MODEL_CHEAP", "gemini-3.1-flash-lite"),
                      "strong": os.environ.get("LLM_MODEL_STRONG", "gemini-3.5-flash")},
}
# Model names under which the committed snapshot cache was generated. Lookup only; never called.
CACHED_MODELS = {"cheap": "haiku", "strong": "opus"}
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai")


def llm_provider() -> str | None:
    """openai_compat (free tier) when LLM_API_KEY is set, otherwise None: the app runs on rules alone."""
    forced = os.environ.get("FINN_LLM")
    if forced in ("openai_compat", "none"):
        return None if forced == "none" else forced
    if os.environ.get("LLM_API_KEY"):
        return "openai_compat"
    return None
