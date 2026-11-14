"""The only door to a language model.

Every call names a *task* and a *tier* ("cheap" or "strong"), returns JSON
validated against a schema, and is cached by a hash of everything that could
change the answer. A filing or transcript is therefore processed once, ever;
re-running the pipeline costs nothing.

Providers
- openai_compat: free tiers (Groq/OpenRouter/Gemini) via LLM_API_KEY, LLM_BASE_URL,
                LLM_MODEL_CHEAP, LLM_MODEL_STRONG.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading

from ..config import CACHED_MODELS, MODELS, llm_provider
from ..db import conn, tx

log = logging.getLogger(__name__)

# USD per million tokens (input, output). Free-tier models are not listed: cost 0.

_EFFORT = {"cheap": "low", "strong": "medium"}
_TRANSIENT = {429, 500, 502, 503, 504}
_lock = threading.Lock()


class LLMUnavailable(RuntimeError):
    """No provider configured. Callers degrade to their rule-based path."""


class LLMBusy(RuntimeError):
    """The provider kept answering 5xx/429 (overloaded or rate-limited). Nothing
    is cached, so the next request simply tries again."""


def available() -> bool:
    return llm_provider() is not None


def _key(task: str, model: str, system: str, user: str, schema: dict) -> str:
    blob = json.dumps([task, model, system, user, schema], sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()


def cached_only(task: str, tier: str, system: str, user: str, schema: dict) -> dict | None:
    """Look up a cached answer under any provider without calling a model."""
    for prov in (*MODELS.values(), CACHED_MODELS):
        row = conn().execute("SELECT output FROM llm_calls WHERE key=?",
                             (_key(task, prov[tier], system, user, schema),)).fetchone()
        if row:
            return json.loads(row["output"])
    return None


def complete_json(task: str, tier: str, system: str, user: str, schema: dict,
                  max_tokens: int = 4000) -> dict:
    hit = cached_only(task, tier, system, user, schema)
    if hit is not None:
        return hit
    provider = llm_provider()
    if provider is None:
        raise LLMUnavailable(task)
    model = MODELS[provider][tier]
    # If the tier's model is overloaded, the other tier's model usually is not.
    other = MODELS[provider]["strong" if tier == "cheap" else "cheap"]
    used, busy = model, None
    for m in dict.fromkeys((model, other)):
        try:
            out, tin, tout = _openai_compat(m, system, user, schema, max_tokens)
            used = m
            break
        except LLMBusy as e:
            busy = e
            log.warning("llm %s: %s busy, trying fallback", task, m)
    else:
        raise busy
    cost = 0.0  # free-tier models
    with _lock, tx() as c:
        # Keyed by the tier's primary model even when a fallback answered, so the
        # next lookup finds it and the call is never repeated.
        c.execute("INSERT OR REPLACE INTO llm_calls (key, task, model, output, input_tokens, "
                  "output_tokens, cost_usd) VALUES (?,?,?,?,?,?,?)",
                  (_key(task, model, system, user, schema), task, used, json.dumps(out),
                   tin, tout, cost))
    log.info("llm %s via %s: %d in / %d out tokens", task, used, tin, tout)
    return out


def _openai_compat(model: str, system: str, user: str, schema: dict,
                   max_tokens: int) -> tuple[dict, int, int]:
    """Free-tier path: any OpenAI-compatible /chat/completions endpoint. JSON mode
    plus the schema in the prompt works across providers. Retries transient
    5xx/429 with backoff (free); retries bad JSON once (costs tokens)."""
    import os
    import time

    import requests

    from ..config import LLM_BASE_URL

    sys_prompt = (system + "\n\nReturn ONLY a JSON object that conforms to this JSON schema:\n"
                  + json.dumps(schema))
    body = {"model": model, "max_tokens": max_tokens, "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": sys_prompt},
                         {"role": "user", "content": user}]}
    headers = {"Authorization": f"Bearer {os.environ['LLM_API_KEY']}"}
    url = f"{LLM_BASE_URL.rstrip('/')}/chat/completions"
    tin = tout = 0
    bad_json = 0
    for attempt in range(5):
        try:
            r = requests.post(url, json=body, headers=headers, timeout=180)
        except (requests.ConnectionError, requests.Timeout):
            r = None
        if r is None or r.status_code in _TRANSIENT:
            # Overloaded / rate-limited / network blip. These failures use no
            # tokens, so waiting and retrying is free. Honour Retry-After if sent.
            if r is not None and r.status_code == 429 and "quota" in r.text.lower() and "day" in r.text.lower():
                raise LLMBusy("The free model quota for today is used up. Try again tomorrow.")
            wait = min(float((r.headers.get("retry-after") if r is not None else None) or 2 ** (attempt + 1)), 30)
            log.info("llm %s: %s, retrying in %.0fs", model, r.status_code if r is not None else "network error", wait)
            time.sleep(wait)
            continue
        r.raise_for_status()
        data = r.json()
        u = data.get("usage") or {}
        tin += u.get("prompt_tokens", 0)
        tout += u.get("completion_tokens", 0)
        try:
            return json.loads(data["choices"][0]["message"]["content"]), tin, tout
        except (json.JSONDecodeError, KeyError, TypeError):
            bad_json += 1          # this one did use tokens: allow a single retry only
            if bad_json >= 2:
                raise RuntimeError(f"model returned invalid JSON twice ({model})")
    raise LLMBusy("The AI model is busy right now (Gemini overloaded). Please try again in a minute.")


def export_cache(path) -> int:
    """Write every cached answer to a JSONL file that can live in git, so a fresh
    clone rebuilds the snapshot with zero model calls."""
    rows = conn().execute("SELECT key, task, model, output, input_tokens, output_tokens, cost_usd "
                          "FROM llm_calls ORDER BY key").fetchall()
    with open(path, "w") as f:
        for r in rows:
            f.write(json.dumps(dict(r)) + "\n")
    return len(rows)


def import_cache(path) -> int:
    n = 0
    with tx() as c:
        for line in open(path):
            r = json.loads(line)
            c.execute("INSERT OR IGNORE INTO llm_calls (key, task, model, output, input_tokens, output_tokens, "
                      "cost_usd) VALUES (?,?,?,?,?,?,?)",
                      (r["key"], r["task"], r["model"], r["output"], r["input_tokens"], r["output_tokens"], r["cost_usd"]))
            n += 1
    return n


def ledger() -> dict:
    """What the model layer has cost so far, by task. Shown in the app."""
    rows = conn().execute(
        "SELECT task, model, COUNT(*) n, SUM(input_tokens) tin, SUM(output_tokens) tout, "
        "SUM(cost_usd) cost FROM llm_calls GROUP BY task, model ORDER BY cost DESC").fetchall()
    tasks = [dict(r) for r in rows]
    return {"tasks": tasks, "total_usd": round(sum(t["cost"] or 0 for t in tasks), 4),
            "calls": sum(t["n"] for t in tasks)}
