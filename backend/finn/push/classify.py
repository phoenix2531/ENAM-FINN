"""Filing -> category, then category + facts -> priority with reasons.

Exchange subjects are semi-structured ("Announcement under Regulation 30
(LODR)-Change in Management"), so ordered rules settle most filings for free.
Only what the rules cannot place goes to the cheap model, and only if one is
configured. Every priority comes with the reasons that produced it, so the
investor can see why something is at the top.
"""
from __future__ import annotations

import re

from ..llm import client as llm

CATEGORIES = ["results", "M&A", "fund_raise", "management_change", "litigation",
              "insider_trading", "earnings_call", "investor_meetings", "credit_rating",
              "dividend", "bonus_split", "capex", "press_release", "postal_ballot",
              "agm_egm", "pledging", "unclassified"]

# (category, subtype, pattern). Checked in order against "title || excerpt";
# first match wins, so specific rules sit above generic ones.
RULES: list[tuple[str, str, str]] = [
    ("unclassified", "rta_address", r"registrar and share transfer agent|corporate office address of (the )?r(ta|egistrar)|kfin technologies"),
    ("unclassified", "esop", r"allotment of esop|esop|esps|stock options?|employee stock"),
    ("unclassified", "compliance", r"reg(ulation)?\.? ?74 ?\(5\)|trading window|loss of share|duplicate share|iepf|special window|compliances?-certificate|monitoring (agency|report)|call proceeds|utili[sz]ation of (issue )?proceeds"),
    ("pledging", "", r"pledg|encumbrance"),
    ("insider_trading", "", r"sast|reg(ulation)?\.? ?29|regulation 7\(2\)|insider trading|promoter .* (sold|bought|acquired) .* shares"),
    ("earnings_call", "transcript", r"earnings? (conference )?call transcript|transcript of|concall transcript"),
    ("earnings_call", "recording", r"audio|video recording|recording of"),
    ("earnings_call", "schedule", r"schedule of .*(earnings|conference) call|earnings call (on|scheduled)"),
    ("results", "newspaper", r"newspaper.*(financial results|results)|(financial results|results).*newspaper"),
    ("unclassified", "newspaper", r"newspaper publication|newspaper advertisement|newspaper clipping"),
    ("results", "intimation", r"board meeting (on|to consider)|intimation (for|of) (board meeting|approval of)|to consider .*results|meets? .* to approve .*results"),
    ("results", "deck", r"investor presentation|results presentation|earnings presentation|shareholders? letter"),
    ("credit_rating", "", r"credit rating|rating agency|reaffirm|crisil|icra|care ratings|india ratings|moody|s&p|fitch"),
    ("press_release", "rumour", r"rumou?r|clarification"),
    ("management_change", "", r"change in (management|directorate|director|key managerial|kmp)|managing director|chief executive|\bceo\b|\bcfo\b|\bcto\b|resign|retire|superannuat|cessation|appoint(ed|ment) .*(director|chairman|officer)|steps? down|\bexits?\b"),
    ("M&A", "incorporation", r"incorporat(ed|ion) (of )?(a |an )?(new )?(wholly.owned |step.down )?subsidiary|incorporated .*subsidiary"),
    ("M&A", "", r"acquisition|acquire|merger|amalgamation|demerger|scheme of arrangement|joint venture|divest|stake sale|share swap|wholly.owned subsidiary|restructuring|lead investor"),
    ("litigation", "", r"litigation|penalt|order (of|from|by) .*(tribunal|court|nclt|nclat|sebi|authority)|nclt|nclat|cirp|insolvency|closure order|show cause|demand notice|gst .*order|tax .*order|\bfined?\b|data leak|stayed|ordered closure|closure of .*(plant|unit|facility)|pollution|violation|regulatory action"),
    ("fund_raise", "", r"\bqip\b|qualified institution|preferential|warrants?|rights issue|buy.?back|commercial paper|\bncds?\b|debentures|fund rais|capital raise|allotment of .*(shares|securities)|raising"),
    ("dividend", "", r"dividend|record date"),
    ("bonus_split", "", r"bonus issue|sub-?division|stock split|split of"),
    ("capex", "", r"capex|capacity expansion|new (plant|facility)|greenfield|brownfield|commission(ing|ed)|expansion of"),
    ("postal_ballot", "", r"postal.?ballot|scrutini[sz]er"),
    ("agm_egm", "", r"\bagm\b|\begm\b|annual general meeting|extra.?ordinary general"),
    ("investor_meetings", "", r"analyst|investor meet|institutional investor|investor conference|one.on.one|non.deal roadshow|con\. call updates"),
    ("results", "filing", r"financial results?|results for the (quarter|half|year)|outcome of (the )?board meeting|half yearly report|quarterly results|q[1-4] ?fy"),
    ("press_release", "order", r"order(s)? (worth|of|from|received)|bagging|award of order|receipt of order|wins? .* order"),
    ("press_release", "", r"press release|media release|launch|partnership|announces"),
]
_COMPILED = [(c, s, re.compile(p, re.I)) for c, s, p in RULES]


# Subjects that say nothing about the event; for these the digest leads.
GENERIC_TITLE = re.compile(
    r"press release|media release|meeting updates|^updates$|general updates|"
    r"disclosure under regulation 30|sebi \(listing obligations? and disclosure|"
    r"^announcement under regulation 30 \(lodr\)$", re.I)


def classify_rules(title: str, excerpt: str) -> tuple[str, str, str] | None:
    # The subject line is the company's own label, so it usually leads; when
    # the subject is boilerplate, the one-line digest leads instead.
    order = (excerpt, f"{title} || {excerpt}") if GENERIC_TITLE.search(title) and excerpt \
        else (title, f"{title} || {excerpt}")
    full = f"{title} || {excerpt}"
    for text in order:
        for cat, sub, rx in _COMPILED:
            if rx.search(text):
                if not sub:  # a broad subject; let the digest pick a sharper subtype
                    for c2, s2, rx2 in _COMPILED:
                        if c2 == cat and s2 and rx2.search(full):
                            sub = s2
                            break
                return cat, sub, f"rule:{cat}{'/' + sub if sub else ''}"
    return None


_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": CATEGORIES},
        "material": {"type": "boolean"},
    },
    "required": ["category", "material"],
    "additionalProperties": False,
}
_SYSTEM = (
    "You label Indian stock-exchange filings for a portfolio manager. Categories:\n"
    "results, M&A, fund_raise, management_change, litigation, insider_trading, earnings_call, "
    "investor_meetings, credit_rating, dividend, bonus_split, capex, press_release, postal_ballot, "
    "agm_egm, pledging, unclassified (routine paperwork that does not move the stock).\n"
    "material = could plausibly move the stock. Judge only from the text given."
)


def classify(title: str, excerpt: str) -> tuple[str, str, str]:
    hit = classify_rules(title, excerpt)
    if hit:
        return hit
    try:
        out = llm.complete_json("classify_filing", "cheap", _SYSTEM,
                                f"Subject: {title}\nSummary: {excerpt}", _SCHEMA, max_tokens=200)
        return out["category"], "", "llm"
    except llm.LLMUnavailable:
        return "unclassified", "", "default"


# ---------------------------------------------------------------- materiality

BASE = {
    "management_change": 70, "results": 72, "M&A": 70, "litigation": 55, "fund_raise": 55,
    "capex": 55, "pledging": 65, "insider_trading": 45, "credit_rating": 35, "bonus_split": 50,
    "dividend": 30, "press_release": 30, "earnings_call": 22, "postal_ballot": 18,
    "agm_egm": 18, "investor_meetings": 10, "unclassified": 3,
}
SUBTYPE_OVERRIDE = {
    ("M&A", "incorporation"): 28,
    ("results", "newspaper"): 4, ("results", "intimation"): 12, ("results", "deck"): 30,
    ("earnings_call", "recording"): 8, ("earnings_call", "schedule"): 10,
    ("earnings_call", "transcript"): 26,
}

_MONEY = re.compile(
    r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(crore|cr\b|lakh|billion|bn\b|million|mn\b)?"
    r"|([\d,]+(?:\.\d+)?)\s*(crore)", re.I)  # bare "lakh" is usually a count, not rupees
_UNIT = {"crore": 1, "cr": 1, "lakh": 0.01, "billion": 100, "bn": 100, "million": 0.1, "mn": 0.1}


def money_crore(text: str) -> float | None:
    """Largest rupee amount mentioned, in crore."""
    best = None
    for m in _MONEY.finditer(text):
        before = text[max(0, m.start() - 30):m.start()].lower()
        if re.search(r"revenue|sales|profit|pat\b|ebitda|turnover|income|loss", before):
            continue  # an operating figure, not the size of a deal
        num, unit = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        if not unit:
            continue
        try:
            v = float(num.replace(",", "")) * _UNIT[unit.lower().rstrip(".")]
        except (ValueError, KeyError):
            continue
        best = v if best is None else max(best, v)
    return best


SENIOR = re.compile(r"\b(md|managing director|ceo|chief executive|cfo|chief financial|chairman|chairperson|whole.?time director|president)\b", re.I)
SEVERE = re.compile(r"\b(closure order|ordered closure|insolvency|cirp|fraud|data leak|search operation|raid|default(ed)?|downgrad\w*|suspen\w+|delist\w*|forensic|qualified opinion|halt\w*)\b", re.I)
SOFTENING = re.compile(r"\b(stayed|set aside|allowed .*appeal|in (our|its) favour)\b", re.I)
# L&T discloses order sizes as bands rather than amounts (crore, lower bound).
LT_BANDS = {"significant": 1000, "large": 2500, "major": 5000, "mega": 10000, "ultra-mega": 15000}


def score(cat: str, sub: str, title: str, excerpt: str, mcap_cr: float | None,
          watched: set[str]) -> tuple[int, list[str]]:
    text = f"{title} {excerpt}"
    s = SUBTYPE_OVERRIDE.get((cat, sub), BASE.get(cat, 5))
    why: list[str] = []

    if cat == "management_change":
        if SENIOR.search(text):
            s += 18
            why.append("top-level role")
        elif re.search(r"independent director|group head|company secretary|compliance officer", text, re.I):
            s -= 30
            why.append("non-executive / functional role")
    if cat == "press_release" and sub == "rumour":
        s += 15
        why.append("exchange sought clarification")
    if SEVERE.search(text):
        s += 20
        why.append("severe language in filing")
    if SOFTENING.search(text):
        s -= 5
        why.append("relief / stay granted")

    if cat in ("postal_ballot", "agm_egm") and SENIOR.search(text):
        s += 10
        why.append("vote on a top-level appointment")

    amt = money_crore(text)
    if amt is None and cat == "press_release" and sub == "order":
        m = re.search(r"\b(ultra-mega|mega|major|large|significant)\b", text, re.I)
        if m:
            amt = LT_BANDS[m.group(1).lower()]
            why.append(f"'{m.group(1).lower()}' order: ≥ ₹{amt:,} cr by the company's own band")
    if amt and mcap_cr:
        pct = 100 * amt / mcap_cr
        if cat in ("fund_raise", "M&A", "capex", "press_release", "litigation"):
            if pct >= 2:
                s += 20
                why.append(f"₹{amt:,.0f} cr ≈ {pct:.1f}% of market cap")
            elif pct >= 0.5:
                s += 8
                why.append(f"₹{amt:,.0f} cr ≈ {pct:.1f}% of market cap")
            elif pct < 0.05:
                s -= 20
                why.append(f"₹{amt:,.2f} cr is immaterial vs market cap")
        if cat == "fund_raise" and re.search(r"commercial paper|repayment|redeem", text, re.I) and pct < 1:
            s -= 25
            why.append("routine treasury")

    if cat in watched and s >= 25:
        s += 8
        why.append("category you watch")
    return max(0, min(100, s)), why


def tier(s: int) -> str:
    if s >= 60:
        return "act"      # needs you
    if s >= 25:
        return "glance"   # one line is enough
    return "routine"      # collapsed
