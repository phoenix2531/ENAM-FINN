"""The Network layer: who in my world can help me understand this?

Inputs are the investor's own network (contacts.json: careers, schools, how
you know them, when you last spoke) plus the people who appear in filings
(careers as the company disclosed them, or a verified public profile).

Everything here is deterministic and explainable. Each suggestion carries the
evidence that produced it ("both at ICICI Securities 2011-2016") and a
confidence: confirmed (dates overlap), likely (two shared employers, dates not
disclosed) or possible (one shared employer, dates not disclosed). We never
claim two people know each other; we show where their paths crossed.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from rapidfuzz import fuzz, process

from ..config import INPUTS

NET = INPUTS / "network"
TITLES = re.compile(r"^(mr|ms|mrs|dr|capt|prof|shri|smt)\.?\s+", re.I)
SENIOR = re.compile(r"\b(ceo|md|managing director|chief|chairman|president|cfo|coo|cto|head|director|partner|founder)\b", re.I)
TOP = re.compile(r"\b(ceo|md|managing director|chairman|chief executive|president)\b", re.I)


def norm_name(n: str) -> str:
    n = TITLES.sub("", n.strip())
    return re.sub(r"[^a-z ]", "", n.lower()).strip()


def _year(s) -> int | None:
    if s in (None, ""):
        return None
    m = re.search(r"(19|20)\d{2}", str(s))
    return int(m.group(0)) if m else None


# ------------------------------------------------------------------ orgs

SECTOR_HINTS = [
    ("private sector bank", "private_banking"), ("public sector bank", "private_banking"),
    ("small finance", "small_finance_bank"), ("microfinance", "microfinance"),
    ("gold", "gold_loans"), ("non banking financial", "nbfc_consumer"), ("insurance", "insurance"),
    ("specialty chemical", "specialty_chemicals"), ("commodity chemical", "specialty_chemicals"),
    ("agrochemical", "agrochemicals"), ("pesticide", "agrochemicals"), ("pharma", "pharma"),
    ("hospital", "hospitals"), ("consumer electronics", "ems"), ("electronic", "ems"),
    ("semiconductor", "semiconductors"), ("heavy electrical", "electrical_equipment"),
    ("electrical equipment", "electrical_equipment"), ("cables", "cables_wires"),
    ("retail", "fashion_retail"), ("jewellery", "jewellery"), ("e-commerce", "quick_commerce"),
    ("airline", "aviation"), ("telecom", "telecom"), ("software", "it_services"),
    ("construction", "infrastructure"), ("paints", "paints"), ("automobile", "auto"),
    ("auto component", "auto"),
]


@dataclass
class Org:
    id: str
    name: str
    industries: list[str]
    symbol: str | None = None
    group: str | None = None
    is_group: bool = False


class OrgResolver:
    _SUFFIX = re.compile(r"\b(limited|ltd|pvt|private|the|company|co|india|inc|llp|corporation)\b")

    def __init__(self, orgs: list[dict]):
        self.orgs = {o["id"]: Org(o["id"], o["name"], o.get("industries", []), o.get("symbol"),
                                  o.get("group"), o.get("is_group", False)) for o in orgs}
        self.by_symbol = {o.symbol: o for o in self.orgs.values() if o.symbol}
        self.alias: dict[str, str] = {}
        for o in orgs:
            for a in [o["name"], *o.get("aliases", [])]:
                self.alias[self._n(a)] = o["id"]
        self._keys = list(self.alias)

    def _n(self, s: str) -> str:
        s = re.sub(r"[^a-z0-9& ]", " ", s.lower().replace("&", " & "))
        return " ".join(self._SUFFIX.sub(" ", s).split())

    def resolve(self, raw: str) -> str | None:
        if not raw:
            return None
        k = self._n(raw)
        if k in self.alias:
            return self.alias[k]
        hit = process.extractOne(k, self._keys, scorer=fuzz.token_sort_ratio, score_cutoff=88)
        return self.alias[hit[0]] if hit else None

    def ensure_company(self, symbol: str, name: str, sector_path: list[str]) -> Org:
        """Any NSE company the investor researches becomes an org we can reason about."""
        if symbol in self.by_symbol:
            return self.by_symbol[symbol]
        text = " ".join(sector_path).lower()
        inds = sorted({tag for hint, tag in SECTOR_HINTS if hint in text})
        org = Org(symbol.lower(), name, inds, symbol)
        self.orgs[org.id] = org
        self.by_symbol[symbol] = org
        self.alias[self._n(name)] = org.id
        self._keys.append(self._n(name))
        return org


# ------------------------------------------------------------------ people

@dataclass
class Position:
    org: str | None
    org_raw: str
    title: str
    function: str
    start: int | None
    end: int | None          # None = present
    current: bool = False


@dataclass
class Person:
    id: str
    name: str
    kind: str                # contact | public
    positions: list[Position]
    education: list[dict]
    relationship: dict | None = None
    city: str = ""
    sources: list[str] = field(default_factory=list)

    @property
    def headline(self) -> str:
        cur = next((p for p in self.positions if p.current), self.positions[0] if self.positions else None)
        return f"{cur.title}, {cur.org_raw}" if cur else ""


FUNCTION_GUESS = [
    (r"cfo|financ|account|treasur", "finance"), (r"strateg|m&a|corporate development", "strategy"),
    (r"legal|counsel|law|partner", "legal"), (r"plant|manufactur|works", "plant"),
    (r"operat|coo", "operations"), (r"sales|business|marketing|commercial", "sales"),
    (r"risk|credit", "risk"), (r"technolog|cto|digital|it\b", "technology"),
    (r"ceo|managing director|chairman|director|president", "management"),
]


def guess_function(title: str) -> str:
    for rx, f in FUNCTION_GUESS:
        if re.search(rx, title, re.I):
            return f
    return "management"


# ------------------------------------------------------------------ scoring tables

TITLE_INDUSTRY = [
    (r"semicon|osat|wafer|\bfab\b", "semiconductors"), (r"insolvency|restructuring", "corporate_law"),
    (r"information security|\bciso\b|cyber", "fintech"), (r"fluoro", "fluorochemicals"),
]

TIE_BASE = {"friend": 0.85, "ex_colleague": 0.8, "classmate": 0.72, "industry": 0.55,
            "met_company": 0.45, "acquaintance": 0.3}

FUNCTION_FIT = {
    "results": {"finance": 1, "sales": .9, "strategy": .9, "investor_relations": .9, "research": .8, "operations": .8},
    "M&A": {"strategy": 1, "investing": 1, "finance": .9, "investment_banking": .9, "legal": .8},
    "litigation": {"legal": 1, "regulatory": 1, "plant": .9, "operations": .8, "technology": .8, "finance": .6},
    "capex": {"plant": 1, "operations": 1, "procurement": .8, "finance": .7},
    "fund_raise": {"investment_banking": 1, "finance": 1, "investing": .8},
    "management_change": {"management": 1, "strategy": .9, "finance": .9, "investor_relations": .9},
    "press_release": {"sales": .9, "strategy": .9, "operations": .9},
}

KNOWS = {
    ("plant", "litigation"): "the site's compliance history and what a shutdown would really cost",
    ("regulatory", "litigation"): "how the regulator works and how long remediation usually takes",
    ("legal", "litigation"): "how the legal process is likely to run, and on what timeline",
    ("technology", "litigation"): "the systems involved and how a breach like this is usually contained",
    ("finance", "results"): "the levers behind the numbers and how management sets guidance",
    ("sales", "results"): "the demand and channel reality behind the quarter",
    ("strategy", "M&A"): "the strategic logic of the deal and where integration breaks",
    ("investing", "M&A"): "how the asset was valued and who else looked at it",
    ("investment_banking", "fund_raise"): "who bought the issue and how deep the book really was",
    ("finance", "fund_raise"): "what the money is really for",
    ("plant", "capex"): "execution risk and realistic ramp-up timelines",
    ("operations", "capex"): "execution risk and realistic ramp-up timelines",
}
FUNCTION_KNOWS = {
    "finance": "capital allocation and how the numbers are put together",
    "strategy": "how leadership thinks about the business and its options",
    "sales": "customers, pricing and the channel",
    "operations": "how the business actually runs day to day",
    "plant": "the plants: capacity, safety, compliance",
    "risk": "credit quality and where the book is stressed",
    "technology": "the technology stack and its weak spots",
    "legal": "the legal and governance angle",
    "regulatory": "the regulatory angle",
    "research": "how the Street is positioned and what it is missing",
    "investor_relations": "what management is telling investors, and what it isn't",
    "investing": "valuation and the deal landscape",
    "investment_banking": "capital-markets appetite and recent deal flow",
    "procurement": "suppliers, costs and the value chain",
    "research_dev": "the technology and product pipeline",
    "medical": "clinical operations and doctor economics",
    "product": "the product and its competitive position",
    "management": "the leadership bench and how decisions get made",
}


_STOP = {"board", "company", "limited", "order", "ordered", "november", "october", "approved",
         "results", "quarter", "shares", "under", "regulation", "india", "their", "which", "about",
         "after", "would", "manager", "director", "senior", "business", "group", "plant",
         "plants", "facility", "units", "office", "officer", "chief", "partner", "lakh", "crore"}


class Network:
    def __init__(self, today: date | None = None, net_dir: Path = NET):
        self.today = today or date.today()
        orgs = json.loads((net_dir / "orgs.json").read_text())
        self.resolver = OrgResolver(orgs["orgs"])
        self.themes: dict[str, list[str]] = orgs["themes"]
        self.supply = [tuple(x) for x in orgs["supply_chain"]]
        self.investor = json.loads((net_dir / "investor.json").read_text())
        self.people: dict[str, Person] = {}
        for c in json.loads((net_dir / "contacts.json").read_text())["contacts"]:
            self.people[c["id"]] = Person(
                c["id"], c["name"], "contact",
                [self._pos(p) for p in c["positions"]], c.get("education", []),
                c.get("relationship"), c.get("city", ""))
        self._public = {norm_name(p["name"]): p for p in
                        json.loads((net_dir / "public_profiles.json").read_text())["profiles"]}

    # ---------------------------------------------------------- construction
    def _pos(self, p: dict, function: str | None = None) -> Position:
        org_raw = p.get("org", "")
        end = _year(p.get("to"))
        return Position(self.resolver.resolve(org_raw), org_raw, p.get("title", ""),
                        p.get("function") or function or guess_function(p.get("title", "")),
                        _year(p.get("from")), end, current=p.get("to") in (None, ""))

    def add_public_or_filing_person(self, name: str, symbol: str | None = None, role: str = "",
                                    incoming: bool = True, career: list[dict] | None = None,
                                    education: list[str] | None = None, source: str | None = None,
                                    effective_year: int | None = None) -> Person:
        """Register someone who appears in a filing. A verified public profile, when we
        hold one, supplies the career; otherwise we use what the filing disclosed."""
        pid = "p:" + norm_name(name).replace(" ", "-")
        if pid in self.people:
            person = self.people[pid]
            if source and source not in person.sources:
                person.sources.append(source)
            return person
        positions: list[Position] = []
        edu: list[dict] = []
        sources = [source] if source else []
        pub = self._public.get(norm_name(name))
        if pub:
            positions = [self._pos(p) for p in pub["career"]]
            edu = pub.get("education", [])
            sources += pub.get("sources", [])
        else:
            if symbol and role:
                org = self.resolver.by_symbol.get(symbol)
                yr = effective_year or self.today.year
                positions.append(Position(org.id if org else None, org.name if org else symbol, role,
                                          guess_function(role), yr if incoming else None,
                                          None if incoming else yr, current=incoming))
            for c in career or []:
                if symbol and self.resolver.resolve(c.get("org", "")) == (
                        self.resolver.by_symbol.get(symbol).id if self.resolver.by_symbol.get(symbol) else None) \
                        and positions:
                    continue  # the filing restating the role we already recorded
                positions.append(self._pos(c))
            edu = [{"school": e, "degree": "", "year": None} for e in (education or [])]
        person = Person(pid, TITLES.sub("", name.strip()), "public", positions, edu, None, "", sources)
        self.people[pid] = person
        return person

    @property
    def contacts(self) -> list[Person]:
        return [p for p in self.people.values() if p.kind == "contact"]

    # ---------------------------------------------------------- tie strength
    def months_since(self, c: Person) -> float | None:
        d = (c.relationship or {}).get("last_contact")
        if not d:
            return None
        return (self.today - date.fromisoformat(d)).days / 30.4

    def investor_tie(self, c: Person) -> dict:
        r = c.relationship or {}
        base = TIE_BASE.get(r.get("type"), 0.3)
        m = self.months_since(c)
        recency = 0.5 ** ((m or 36) / 12)               # halves every year of silence
        freq = min(0.1, 0.01 * r.get("touches_12m", 0))
        score = round(min(1.0, base * (0.6 + 0.4 * recency) + freq), 2)
        label = "strong" if score >= 0.6 else "medium" if score >= 0.4 else "weak"
        how = r.get("context", "")
        when = "" if m is None else (f"spoke {int(m)} months ago" if m >= 1.5 else "spoke recently")
        return {"score": score, "label": label, "how": how, "last": when}

    # ---------------------------------------------------------- person-to-person links
    def _overlap(self, a: Position, b: Position) -> tuple[str, float | None]:
        if None in (a.start, b.start):
            return "possible", None
        a_end = a.end or self.today.year
        b_end = b.end or self.today.year
        yrs = min(a_end, b_end) - max(a.start, b.start)
        if yrs < 0:
            return "none", None
        return "confirmed", max(0.5, float(yrs))

    def links(self, c: Person, t: Person) -> list[dict]:
        out = []
        shared_orgs = set()
        for a in c.positions:
            for b in t.positions:
                if not a.org or not b.org:
                    continue
                # Same company only: "both somewhere in the Tata group" is not evidence.
                same = a.org == b.org
                same_group = False
                if not same:
                    continue
                if b.current and b.start is not None and b.start >= self.today.year:
                    continue  # they only just joined; sharing an employer since then proves nothing
                conf, yrs = self._overlap(a, b)
                if conf == "none":
                    continue
                org_name = self.resolver.orgs[a.org].name
                if same:
                    shared_orgs.add(a.org)
                    if conf == "confirmed":
                        s = 0.35 + 0.08 * min(yrs, 5)
                        lo, hi = max(a.start, b.start), min(a.end or self.today.year, b.end or self.today.year)
                        text = f"Both at {org_name}, {lo}–{hi if hi < self.today.year else 'now'}"
                        if TOP.search(b.title) and a.function in ("investor_relations", "strategy", "finance", "management") and SENIOR.search(a.title):
                            s += 0.15
                            text += f"; as {a.title.split(',')[0]} they would have worked with the {b.title.split(',')[0]}'s office"
                        elif TOP.search(b.title):
                            text += f", while {t.name.split()[0]} was {b.title.split('(')[0].strip()}"
                    else:
                        s = 0.3
                        text = f"Both worked at {org_name} (dates not disclosed, overlap unconfirmed)"
                else:
                    if conf != "confirmed":
                        continue
                    s = 0.15
                    text = f"Same group: {self.resolver.orgs[a.org].name} and {self.resolver.orgs[b.org].name}, overlapping years"
                out.append({"kind": "worked", "confidence": conf if same else "group", "strength": round(min(s, 0.9), 2),
                            "text": text, "org": a.org})
        # two shared employers with unknown dates is much stronger evidence than one
        if len(shared_orgs) >= 2:
            for l in out:
                if l["confidence"] == "possible":
                    l["confidence"] = "likely"
                    l["strength"] = 0.45
                    l["text"] = l["text"].replace("overlap unconfirmed", "but they share two employers")
        for e1 in c.education:
            for e2 in t.education:
                if not e1.get("school") or not e2.get("school"):
                    continue
                if fuzz.token_set_ratio(e1["school"].lower(), e2["school"].lower()) < 90:
                    continue
                y1, y2 = e1.get("year"), e2.get("year")
                if y1 and y2 and abs(y1 - y2) <= 1:
                    s = 0.45
                    dept = self._dept(e1.get("degree", "")) and self._dept(e1.get("degree", "")) == self._dept(e2.get("degree", ""))
                    if dept:
                        s += 0.15
                    text = f"{e1['school']} {'batchmates' if y1 == y2 else 'one year apart'}" + \
                           (f", same department ({self._dept(e1['degree'])})" if dept else "")
                    out.append({"kind": "studied", "confidence": "confirmed", "strength": round(s, 2), "text": text})
        # keep the best evidence per org / school
        best: dict[str, dict] = {}
        for l in out:
            k = l.get("org") or l["text"]
            if k not in best or l["strength"] > best[k]["strength"]:
                best[k] = l
        return sorted(best.values(), key=lambda l: -l["strength"])

    def _group(self, org_id: str) -> str | None:
        o = self.resolver.orgs.get(org_id)
        if not o:
            return None
        return o.group or (o.id if o.is_group else None)

    @staticmethod
    def _dept(degree: str) -> str | None:
        m = re.search(r"(chemical|electrical|mechanical|computer|civil|electronics)", degree, re.I)
        return m.group(1).title() + " Engineering" if m else None

    def paths_to(self, target: Person, k: int = 4) -> list[dict]:
        out = []
        for c in self.contacts:
            ls = self.links(c, target)
            if not ls:
                continue
            tie = self.investor_tie(c)
            score = round(tie["score"] * ls[0]["strength"], 3)
            out.append({"contact": self.card(c), "tie": tie, "links": ls[:2], "score": score,
                        "label": "strong" if score >= 0.4 else "medium" if score >= 0.22 else "weak"})
        out.sort(key=lambda x: -x["score"])
        return out[:k]

    # ---------------------------------------------------------- who should I call
    def _industries(self, org_id: str | None) -> set[str]:
        o = self.resolver.orgs.get(org_id) if org_id else None
        return set(o.industries) if o else set()

    def _pos_industries(self, p: Position) -> set[str]:
        """What a role actually touched: the employer's industries, plus any the
        title names. A plant head at CG Power is not a semiconductor expert; the
        lead of its semiconductor initiative is."""
        inds = self._industries(p.org)
        for rx, tag in TITLE_INDUSTRY:
            if re.search(rx, p.title, re.I):
                inds.add(tag)
        return inds

    def who_to_call(self, symbol: str, category: str | None = None, event_text: str = "",
                    k: int = 4, cautions: dict | None = None) -> list[dict]:
        target = self.resolver.by_symbol.get(symbol)
        if not target:
            return []
        t_inds = set(target.industries)
        fit = FUNCTION_FIT.get(category or "", {})
        topical = set()
        if re.search(r"pollution|mpcb|effluent|environment", event_text, re.I):
            topical.add("environment_regulation")
        if re.search(r"nclt|nclat|insolvency|cirp|tribunal|court|delist", event_text, re.I):
            topical.add("corporate_law")
        if re.search(r"data leak|breach|cyber", event_text, re.I):
            topical.add("fintech")
        if re.search(r"semiconductor|sic\b|chip|osat", event_text, re.I):
            topical.add("semiconductors")
        if category == "fund_raise":
            topical.add("investment_banking")
        if category == "M&A":
            topical |= {"investment_banking", "private_equity"}
        # Distinctive words in the event ("Waluj", "insolvency") that also appear in
        # someone's job title are the strongest signal of first-hand knowledge.
        ev_words = {w.lower() for w in re.findall(r"[A-Za-z]{5,}", event_text)} - _STOP

        results = []
        for c in self.contacts:
            best = None
            for p in c.positions:
                inds = self._pos_industries(p)
                rel = 0.0
                why = None
                caution = None
                if p.org == target.id:
                    span = f"{p.start}–{'now' if p.current else p.end}"
                    if p.current:
                        rel, why = 0.8, f"{p.title} at {target.name} ({span})"
                        caution = f"Works at {target.name} now: keep to public information (SEBI insider-trading rules)."
                        if cautions and cautions.get(symbol):
                            caution = cautions[symbol]
                            rel = 0.4
                    else:
                        gone = self.today.year - (p.end or self.today.year)
                        fresh = 1.0 if gone <= 3 else 0.85 if gone <= 6 else 0.65 if gone <= 10 else 0.45
                        rel, why = 1.0 * fresh, f"{p.title} at {target.name}, {span}"
                elif inds & t_inds:
                    rel, why = 0.55, f"{p.title} at {p.org_raw}, a competitor"
                elif any((a in inds and b in t_inds) or (b in inds and a in t_inds) for a, b in self.supply):
                    rel, why = 0.45, f"{p.title} at {p.org_raw}, in {target.name}'s value chain"
                elif inds & topical:
                    rel, why = 0.6, f"{p.title} at {p.org_raw}"
                if not rel:
                    continue
                if not p.current and p.end and p.org != target.id:
                    rel *= 0.85 if self.today.year - p.end <= 5 else 0.6
                f = fit.get(p.function, 0.75 if fit else 0.85)
                if inds & topical and p.function in ("legal", "regulatory", "technology", "operations", "investment_banking"):
                    f = max(f, 1.0)
                rel *= f
                shared = ev_words & {w.lower() for w in re.findall(r"[A-Za-z]{5,}", p.title)}
                if shared:
                    rel *= 1.3
                    why += f" (same {'site' if p.function == 'plant' else 'area'}: {', '.join(sorted(shared)).title()})"
                if best is None or rel > best["rel"]:
                    best = {"rel": rel, "why": why, "function": p.function, "caution": caution}
            if not best:
                continue
            tie = self.investor_tie(c)
            score = round(0.65 * best["rel"] + 0.35 * tie["score"], 3)
            knows = KNOWS.get((best["function"], category or ""), FUNCTION_KNOWS.get(best["function"], ""))
            results.append({"contact": self.card(c), "tie": tie, "credential": best["why"],
                            "knows": knows, "caution": best["caution"], "score": score})
        results.sort(key=lambda r: -r["score"])
        return results[:k]

    # ---------------------------------------------------------- expertise map
    def _theme_of(self, industry: str) -> str | None:
        for theme, inds in self.themes.items():
            if industry in inds:
                return theme
        return None

    def expertise(self, c: Person) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for p in c.positions:
            if not p.org or p.start is None:
                continue
            end = p.end or self.today.year
            yrs = max(0.5, end - p.start)
            recency = 1.0 if p.current else 0.5 ** ((self.today.year - end) / 8)
            w = yrs * recency * (1.25 if SENIOR.search(p.title) else 1.0)
            for ind in self._pos_industries(p):
                th = self._theme_of(ind)
                if not th:
                    continue
                e = out.setdefault(th, {"score": 0.0, "years": 0.0, "orgs": []})
                e["score"] += w
                e["years"] += yrs
                if p.org_raw not in e["orgs"]:
                    e["orgs"].append(p.org_raw)
        return out

    def expertise_map(self, portfolio_symbols: list[str]) -> dict:
        themes: dict[str, list] = {}
        for c in self.contacts:
            for th, e in self.expertise(c).items():
                themes.setdefault(th, []).append({
                    "contact": self.card(c), "score": round(e["score"], 1),
                    "why": f"{e['years']:.0f} yrs · {', '.join(e['orgs'][:3])}",
                    "tie": self.investor_tie(c)["label"]})
        for th in themes:
            themes[th].sort(key=lambda x: -x["score"])
        # which themes does the portfolio need, and how covered is each?
        need: dict[str, list[str]] = {}
        for s in portfolio_symbols:
            o = self.resolver.by_symbol.get(s)
            for ind in (o.industries if o else []):
                th = self._theme_of(ind)
                if th:
                    need.setdefault(th, []).append(s)
        rows = []
        for th, syms in need.items():
            people = themes.get(th, [])
            depth = sum(p["score"] for p in people)
            strong = [p for p in people if p["tie"] != "weak"]
            rows.append({"theme": th, "portfolio": sorted(set(syms)), "people": people[:4],
                         "depth": round(depth, 1),
                         "weight": 0.0,
                         "coverage": "deep" if depth >= 15 and strong else "thin" if depth >= 3 else "blind spot"})
        for th, people in themes.items():
            if th not in need:
                rows.append({"theme": th, "portfolio": [], "people": people[:4],
                             "depth": round(sum(p["score"] for p in people), 1), "coverage": "outside portfolio"})
        order = {"blind spot": 0, "thin": 1, "deep": 2, "outside portfolio": 3}
        rows.sort(key=lambda r: (order[r["coverage"]], -len(r["portfolio"]), -r["depth"]))
        return {"themes": rows}

    # ---------------------------------------------------------- keep warm
    def reconnect(self, events: list[dict], min_months: float = 4) -> list[dict]:
        """events: [{symbol, headline, category, published}] from the Brief."""
        out = []
        for c in self.contacts:
            m = self.months_since(c)
            if m is None or m < min_months:
                continue
            for ev in events:
                org = self.resolver.by_symbol.get(ev["symbol"])
                if not org:
                    continue
                for p in c.positions:
                    if p.org != org.id:
                        continue
                    span = f"{p.start}–{'now' if p.current else p.end}"
                    out.append({
                        "contact": self.card(c), "months_silent": int(m),
                        "event": ev, "tie": self.investor_tie(c),
                        "hook": f"{org.name} ({'their employer' if p.current else 'where they worked'} {span}): {ev['headline']}",
                    })
                    break
        seen, uniq = set(), []
        for r in sorted(out, key=lambda r: (-r["tie"]["score"], -r["months_silent"])):
            if r["contact"]["id"] in seen:
                continue
            seen.add(r["contact"]["id"])
            uniq.append(r)
        return uniq

    # ---------------------------------------------------------- presentation
    def card(self, p: Person) -> dict:
        return {"id": p.id, "name": p.name, "headline": p.headline, "city": p.city, "kind": p.kind}

    def profile(self, pid: str) -> dict | None:
        p = self.people.get(pid)
        if not p:
            return None
        d = {**self.card(p), "positions": [
            {"org": x.org_raw, "org_id": x.org, "symbol": (self.resolver.orgs[x.org].symbol if x.org in self.resolver.orgs else None),
             "title": x.title, "from": x.start, "to": x.end, "current": x.current, "function": x.function}
            for x in p.positions], "education": p.education, "sources": p.sources}
        if p.kind == "contact":
            d["tie"] = self.investor_tie(p)
            d["expertise"] = sorted(([th, round(e["score"], 1)] for th, e in self.expertise(p).items()),
                                    key=lambda x: -x[1])
            # which public people (from filings) has this contact crossed paths with?
            d["crossed"] = []
            for q in self.people.values():
                if q.kind != "public":
                    continue
                ls = self.links(p, q)
                if ls:
                    d["crossed"].append({"person": self.card(q), "links": ls[:1]})
        else:
            d["paths"] = self.paths_to(p, k=5)
        return d

    def find_person(self, text: str) -> Person | None:
        names = {norm_name(p.name): p for p in self.people.values()}
        hit = process.extractOne(norm_name(text), list(names), scorer=fuzz.partial_ratio, score_cutoff=86)
        if hit:
            return names[hit[0]]
        return None
