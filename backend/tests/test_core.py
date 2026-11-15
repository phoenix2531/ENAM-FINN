"""Tests for the deterministic core: everything the model layer and the UI trust."""
from datetime import date

import pytest

from finn.network.engine import Network
from finn.pull import fundamentals, guidance
from finn.push import classify, enrich


# ------------------------------------------------------------------ classification
@pytest.mark.parametrize("title,excerpt,expected", [
    ("Announcement under Regulation 30 (LODR)-Allotment of ESOP / ESPS", "Allotment of 37,750 shares", "unclassified"),
    ("Change In Managing Director And Chief Executive Officer Of The Bank", "", "management_change"),
    ("Announcement under Regulation 30 (LODR)-Press Release / Media Release",
     "Board approved Q2 FY27 results on Oct 29, 2026; IndiGo posted INR 18.8 billion net loss.", "results"),
    ("Disclosure Under Regulation 30 Of SEBI (LODR) Regulations, 2015",
     "MPCB ordered closure of Waluj plant on 3 Nov 2026 for alleged pollution law violations.", "litigation"),
    ("Announcement under Regulation 30 (LODR)-Newspaper Publication", "Newspaper ad for results", "unclassified"),
    ("Announcement under Regulation 30 (LODR)-Credit Rating", "S&P reaffirmed A- rating", "credit_rating"),
    ("Change In Corporate Office Address Of Registrar And Share Transfer Agent", "KFin Technologies", "unclassified"),
])
def test_rules_classify(title, excerpt, expected):
    cat, sub, by = classify.classify_rules(title, excerpt)
    assert cat == expected
    assert by.startswith("rule:")


def test_broad_subject_gets_sharper_subtype():
    cat, sub, _ = classify.classify_rules("Announcement under Regulation 30 (LODR)-Acquisition",
                                          "Kaynes incorporated wholly owned subsidiary KAYNES ARABIA in Saudi Arabia")
    assert (cat, sub) == ("M&A", "incorporation")


def test_disclosure_is_not_a_closure():
    s, why = classify.score("unclassified", "esop", "Allotment", "The disclosure on allotment of 17,000 shares", 1e5, set())
    assert "severe language in filing" not in why


@pytest.mark.parametrize("text,crore", [
    ("raising ₹4,264.6 crore in QIP", 4264.6),
    ("allotted ₹70 billion NCDs", 7000),
    ("penalties of Rs.1.60 lakh and Rs.1.02 lakh", 0.016),
    ("data leak affecting about 28.5 lakh customers", None),          # a count, not money
    ("H1 FY27 revenue of ₹4,233 Cr and agreed to acquire 60%", None),  # an operating figure, not a deal size
])
def test_money(text, crore):
    v = classify.money_crore(text)
    assert (v is None and crore is None) or v == pytest.approx(crore)


def test_materiality_scales_with_market_cap():
    big, _ = classify.score("fund_raise", "", "QIP", "raising ₹4,264 crore in QIP", 100_000, set())
    tiny, _ = classify.score("litigation", "", "Penalty", "DoT levied penalties of Rs.1.60 lakh", 1_290_000, set())
    assert classify.tier(big) == "act"
    assert classify.tier(tiny) != "act"


# ------------------------------------------------------------------ results card
def test_results_card_qoq_yoy():
    co = {"consolidated": True, "quarters": {
        "periods": ["2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"],
        "rows": {"revenue": [100, 110, 120, 125, 130], "ebitda": [20, 22, 24, 25, 13],
                 "pbt": [15, 16, 17, 18, 10], "pat": [10, 11, 12, 13, 7],
                 "other_income": [1, 1, 1, 1, 4], "tax_pct": [25, 25, 25, 25, 25]},
        "links": {}}}
    card = enrich.results_card(co, "2026-11-04T18:00:00+05:30")
    assert card["label"] == "Q2 FY27"
    rev = card["lines"][0]
    assert rev["qoq"] == 4.0 and rev["yoy"] == 30.0
    assert any("Other income is 40% of PBT" in n for n in card["notes"])
    assert any("down" in n and "bps" in n for n in card["notes"])


def test_pct_refuses_sign_flips():
    assert enrich._pct(-5, 10) is None
    assert enrich._pct(-5, -10) == 50.0


# ------------------------------------------------------------------ guidance helpers
@pytest.mark.parametrize("held,q", [("Nov 2026", "Q2 FY27"), ("Feb 2026", "Q3 FY26"), ("May 2026", "Q4 FY26"), ("Aug 2026", "Q1 FY27")])
def test_call_quarter(held, q):
    assert guidance.call_quarter(held) == q


def test_prefilter_keeps_forward_looking_and_drops_past():
    pages = ["Revenue for the quarter was Rs 3,091 crore. The weather was fine. "
             "We expect margins of 18-20% in FY28. Thank you all for joining."]
    text, n_in, n_out = guidance.prefilter(pages)
    assert "expect margins" in text
    assert n_out <= n_in


# ------------------------------------------------------------------ fundamentals
def test_cash_conversion_flag():
    co = {"top": {}, "sector_path": ["Industrials"], "consolidated": True,
          "annual": {"periods": [f"{y}-03-31" for y in range(2020, 2027)] + ["TTM"],
                     "rows": {"revenue": [100] * 8, "ebitda": [20] * 8, "pat": [10] * 8}},
          "cashflow": {"periods": [f"{y}-03-31" for y in range(2020, 2027)],
                       "rows": {"cfo": [2] * 7, "fcf": [-1] * 7}},
          "balance": None, "ratios": None, "quarters": None, "shareholding": None}
    a = fundamentals.analyse(co)
    assert a["cash"]["conversion_5y"] == 20
    assert any(f["area"] == "Cash quality" and f["level"] == "red" for f in a["flags"])


def test_cagr():
    assert fundamentals.cagr(100, 200, 5) == pytest.approx(14.9, abs=0.05)
    assert fundamentals.cagr(-1, 200, 5) is None


# ------------------------------------------------------------------ network
@pytest.fixture(scope="module")
def net():
    return Network(today=date(2026, 11, 10))


def test_org_resolution(net):
    r = net.resolver
    assert r.resolve("ICICI Securities Limited") == "icicisec"
    assert r.resolve("Larsen and Toubro") == "lt"
    assert r.resolve("Some Unknown Widgets Pvt Ltd") is None


def test_confirmed_overlap_from_public_profile(net):
    target = net.add_public_or_filing_person("Mr. Anup Bagchi", "HDFCBANK", "Managing Director & CEO")
    paths = net.paths_to(target)
    names = [p["contact"]["name"] for p in paths]
    assert "Vikram Rao" in names                          # ICICI Securities 2011-2016
    vikram = paths[names.index("Vikram Rao")]
    assert vikram["links"][0]["confidence"] == "confirmed"
    assert "2011–2016" in vikram["links"][0]["text"]


def test_batchmates_link(net):
    target = net.people["p:anup-bagchi"]
    sunil = net.people["c04"]
    links = net.links(sunil, target)
    assert links and links[0]["kind"] == "studied" and "batchmates" in links[0]["text"]


def test_unknown_dates_are_only_possible(net):
    km = net.add_public_or_filing_person("Ms. Kalpana Merchant", "TRENT", "Independent Director",
                                         career=[{"org": "AZB & Partners", "title": "Partner"}])
    links = net.links(net.people["c06"], km)
    assert links[0]["confidence"] == "possible"


def test_new_joiner_overlap_is_not_evidence(net):
    rg = net.add_public_or_filing_person("Dr. Ritu Garg", "APOLLOHOSP", "CEO, Multi Regions")
    assert net.links(net.people["c44"], rg) == []          # Isha is Apollo IR; Ritu joined this year


def test_who_to_call_prefers_same_site(net):
    calls = net.who_to_call("CGPOWER", "litigation", "MPCB ordered closure of Waluj plant for pollution")
    assert calls[0]["contact"]["name"] == "Sameer Joshi"


def test_current_insider_gets_caution(net):
    calls = net.who_to_call("AUBANK", "press_release", "data leak", k=5)
    neeraj = next(c for c in calls if c["contact"]["name"] == "Neeraj Bhatia")
    assert neeraj["caution"] and "SEBI" in neeraj["caution"]


# ------------------------------------------------------------------ consolidated vs standalone
@pytest.mark.parametrize("cons,stand,want_consolidated", [
    ("2015-03-31", "2026-09-30", False),  # stopped consolidating: the frozen page must lose
    ("2026-09-30", "2026-09-30", True),   # both current: consolidated is the fuller picture
    ("2026-06-30", "2026-09-30", True),   # one quarter behind is normal reporting lag
    (None, "2026-09-30", False),          # no consolidated page at all
])
def test_prefers_current_accounts(monkeypatch, cons, stand, want_consolidated):
    from finn.sources import screener

    def fake_fetch(url, ttl=0):
        last = cons if "consolidated" in url else stand
        if last is None:
            raise screener.FetchError("404")
        return last  # the "page" is just its latest quarter

    def fake_parse(last, symbol, consolidated):
        q = screener.Table(["2014-12-31", last], {"revenue": [90.0, 100.0]})
        return screener.Company(symbol, "Co", None, consolidated, [], "", {}, q, None, None, None,
                                None, None, [], [], [], None, "")

    monkeypatch.setattr(screener, "fetch_text", fake_fetch)
    monkeypatch.setattr(screener, "parse", fake_parse)
    assert screener.get_company("TEST").consolidated is want_consolidated


# ------------------------------------------------------------------ lenders
def _co(sector, rows):
    periods = ["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"]
    return {"sector_path": [sector], "consolidated": True,
            "quarters": {"periods": periods, "rows": rows, "links": {}}}


def test_lender_results_use_nii_and_asset_quality():
    co = _co("Private Sector Bank", {
        "revenue": [100, 102, 104, 106, 108, 110], "interest": [50, 51, 52, 53, 54, 55],
        "pbt": [20, 20, 21, 21, 22, 22], "pat": [15, 15, 16, 16, 16, 17],
        "other_income": [10, 10, 10, 10, 12, 12],  # fees: core business for a bank
        "gross_npa": [None, 1.30, 1.25, 1.2, 1.15, 1.10], "net_npa": [None, 0.4, 0.4, 0.4, 0.38, 0.37],
    })
    c = enrich.results_card(co, "2026-10-18T15:00:00")
    assert [l["metric"] for l in c["lines"]] == ["Revenue", "Net interest income", "PBT", "PAT"]
    assert c["lines"][1]["value"] == 55  # 110 earned - 55 paid
    assert c["notes"][0] == "Gross NPA 1.10%, down 20 bps YoY; net NPA 0.37%"
    assert not any("Other income" in n or "EBITDA" in n for n in c["notes"])


def test_industrial_results_unchanged():
    co = _co("Agro Chemicals", {"revenue": [100] * 6, "ebitda": [20] * 6, "pbt": [10] * 6, "pat": [8] * 6})
    c = enrich.results_card(co, "2026-10-18T15:00:00")
    assert [l["metric"] for l in c["lines"]] == ["Revenue", "EBITDA", "PBT", "PAT"]


def test_npa_borrowed_from_standalone_when_consolidated_is_empty():
    from finn.sources import screener
    p = ["2026-06-30", "2026-09-30"]
    cons = screener.Company("B", "B", None, True, [], "", {}, screener.Table(p, {"gross_npa": [None, None]}),
                            None, None, None, None, None, [], [], [], None, "")
    stand = screener.Company("B", "B", None, False, [], "", {}, screener.Table(p, {"gross_npa": [1.2, 1.1]}),
                             None, None, None, None, None, [], [], [], None, "")
    screener._borrow_npa(cons, stand)
    assert cons.quarters.series("gross_npa") == [1.2, 1.1]


def test_spa_fallback_never_leaves_dist(tmp_path):
    from finn.api import spa_file
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("app")
    (dist / "icon.svg").write_text("svg")
    (tmp_path / ".env").write_text("SECRET=1")
    assert spa_file("icon.svg", dist) == (dist / "icon.svg").resolve()
    assert spa_file("", dist).name == "index.html"
    for evil in ("../.env", "../../.env", str(tmp_path / ".env")):
        assert spa_file(evil, dist).name == "index.html"
