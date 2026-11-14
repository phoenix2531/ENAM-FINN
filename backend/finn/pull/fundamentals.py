"""The arithmetic half of a dossier. No model touches these numbers.

Input is the parsed screener payload (standardised from the company's own
filings). Output is what a PM scans first: where the business stands, which
way it is moving, how it is funded, and whether profit becomes cash. Every
flag carries the numbers that raised it.
"""
from __future__ import annotations

import math
from datetime import date


def _series(t: dict | None, key: str, annual_only: bool = True) -> list[tuple[str, float]]:
    if not t:
        return []
    out = []
    for p, v in zip(t["periods"], t["rows"].get(key, [])):
        if v is None:
            continue
        if annual_only and not p[:4].isdigit():
            continue           # drops "TTM" from annual tables
        out.append((p, v))
    return out


def _ttm(t: dict | None, key: str) -> float | None:
    if not t:
        return None
    for p, v in zip(t["periods"], t["rows"].get(key, [])):
        if p == "TTM":
            return v
    return None


def cagr(first: float, last: float, years: float) -> float | None:
    if first is None or last is None or first <= 0 or last <= 0 or years <= 0:
        return None
    return round(100 * ((last / first) ** (1 / years) - 1), 1)


def _cagr_n(s: list[tuple[str, float]], n: int) -> float | None:
    if len(s) < n + 1:
        return None
    return cagr(s[-n - 1][1], s[-1][1], n)


def fy(p: str) -> str:
    """'2026-03-31' -> 'FY26'."""
    if not p[:4].isdigit():
        return p
    y = int(p[:4])
    return f"FY{str(y if int(p[5:7]) <= 3 else y + 1)[2:]}"


def is_financial(co: dict) -> bool:
    text = " ".join(co.get("sector_path", [])).lower()
    return any(w in text for w in ("bank", "finance", "nbfc", "insurance", "microfinance"))


def analyse(co: dict) -> dict:
    top = co.get("top", {})
    annual, quarters = co.get("annual"), co.get("quarters")
    bal, cf, ratios = co.get("balance"), co.get("cashflow"), co.get("ratios")
    fin = is_financial(co)

    rev = _series(annual, "revenue")
    ebitda = _series(annual, "ebitda")
    pat = _series(annual, "pat")
    flags: list[dict] = []

    # ---------------------------------------------------------- snapshot
    price, mcap = top.get("Current Price"), top.get("Market Cap")
    hi, lo = top.get("high_52w"), top.get("low_52w")
    bv = top.get("Book Value")
    snapshot = {
        "price": price, "market_cap_cr": mcap, "pe": top.get("Stock P/E"),
        "pb": round(price / bv, 1) if price and bv else None,
        "roce": top.get("ROCE"), "roe": top.get("ROE"), "dividend_yield": top.get("Dividend Yield"),
        "range_52w": [lo, hi],
        "range_position": round((price - lo) / (hi - lo), 2) if price and hi and lo and hi > lo else None,
    }

    # ---------------------------------------------------------- financial snapshot (TTM)
    ttm_rev, ttm_ebitda, ttm_pat = _ttm(annual, "revenue"), _ttm(annual, "ebitda"), _ttm(annual, "pat")
    financial = {
        "ttm_revenue": ttm_rev, "ttm_ebitda": ttm_ebitda, "ttm_pat": ttm_pat,
        "ebitda_margin": round(100 * ttm_ebitda / ttm_rev, 1) if ttm_rev and ttm_ebitda is not None and not fin else None,
        "pat_margin": round(100 * ttm_pat / ttm_rev, 1) if ttm_rev and ttm_pat is not None else None,
        "ebitda_label": "Pre-provision operating profit" if fin else "EBITDA",
    }

    # ---------------------------------------------------------- trajectory
    def margin_series():
        m = {p: v for p, v in ebitda}
        return [(p, round(100 * m[p] / r, 1)) for p, r in rev if p in m and r]

    margins = margin_series()
    traj = {
        "years": [fy(p) for p, _ in rev[-10:]],
        "revenue": [v for _, v in rev[-10:]],
        "ebitda": [v for _, v in ebitda[-10:]],
        "pat": [v for _, v in pat[-10:]],
        "margin": [v for _, v in margins[-10:]],
        "cagr": {
            "revenue": {"3y": _cagr_n(rev, 3), "5y": _cagr_n(rev, 5), "10y": _cagr_n(rev, 10)},
            "pat": {"3y": _cagr_n(pat, 3), "5y": _cagr_n(pat, 5), "10y": _cagr_n(pat, 10)},
        },
        "quarters": [],
    }
    if quarters:
        qp = quarters["periods"]
        qr = quarters["rows"]
        for i in range(max(0, len(qp) - 8), len(qp)):
            def g(k, j):
                s = qr.get(k, [])
                return s[j] if 0 <= j < len(s) else None
            r, ry = g("revenue", i), g("revenue", i - 4)
            pt, pty = g("pat", i), g("pat", i - 4)
            e = g("ebitda", i)
            nii = r - g("interest", i) if fin and r is not None and g("interest", i) is not None else None
            nii_y = ry - g("interest", i - 4) if fin and ry is not None and g("interest", i - 4) is not None else None
            traj["quarters"].append({
                "nii": round(nii, 1) if nii is not None else None,
                "nii_yoy": round(100 * (nii / nii_y - 1), 1) if nii and nii_y and nii_y > 0 else None,
                "gnpa": g("gross_npa", i), "nnpa": g("net_npa", i),
                "period": qp[i], "revenue": r, "pat": pt,
                "margin": round(100 * e / r, 1) if r and e is not None else None,
                "rev_yoy": round(100 * (r / ry - 1), 1) if r and ry else None,
                "pat_yoy": round(100 * (pt / pty - 1), 1) if pt and pty and pt > 0 and pty > 0 else None,
            })
    # Asset quality is the first thing to check in a lender: are loans going bad?
    aq = {q["period"]: q["gnpa"] for q in traj["quarters"] if q.get("gnpa") is not None}
    p1 = max(aq) if aq else None
    p0 = f"{int(p1[:4]) - 1}{p1[4:]}" if p1 else None  # same quarter, a year earlier
    if fin and p0 in aq:
        g0, g1 = aq[p0], aq[p1]
        bps = round((g1 - g0) * 100)
        if bps >= 25:
            flags.append({"level": "red" if bps >= 75 else "watch", "area": "Asset quality",
                          "text": f"Gross NPA rose from {g0:.2f}% to {g1:.2f}% in a year: more loans are going bad"})
        elif bps <= -25:
            flags.append({"level": "note", "area": "Asset quality",
                          "text": f"Gross NPA fell from {g0:.2f}% to {g1:.2f}% in a year: asset quality is improving"})
    if len(margins) >= 6:
        recent = sum(v for _, v in margins[-3:]) / 3
        earlier = sum(v for _, v in margins[-6:-3]) / 3
        d = recent - earlier
        traj["margin_trend"] = "expanding" if d > 1.5 else "compressing" if d < -1.5 else "stable"
        traj["margin_change_pts"] = round(d, 1)
    rc, pc = traj["cagr"]["revenue"]["5y"], traj["cagr"]["pat"]["5y"]
    if rc is not None and pc is not None and rc - pc > 8:
        profit = f"profit only {pc}%" if pc >= 0 else f"profit shrank {abs(pc)}% a year"
        flags.append({"level": "watch" if pc >= 0 else "red", "area": "Trajectory",
                      "text": f"Revenue compounded {rc}% a year over 5 years but {profit}: growth is getting less profitable"})
    if rc is not None and pc is not None and pc - rc > 10 and not fin:
        flags.append({"level": "note", "area": "Trajectory",
                      "text": f"Profit compounded {pc}% vs revenue {rc}% over 5 years: margin expansion has done the work. Check it can last"})

    # ---------------------------------------------------------- balance sheet
    eq = [(p, (c or 0) + (r or 0)) for (p, c), (_, r) in zip(_series(bal, "equity_capital"), _series(bal, "reserves"))]
    debt = _series(bal, "borrowings")
    de = []
    dmap = dict(debt)
    for p, e in eq:
        if e and p in dmap:
            de.append((fy(p), round(dmap[p] / e, 2)))
    cwip = _series(bal, "cwip")
    fa = dict(_series(bal, "fixed_assets"))
    balance = {
        "financial_company": fin,
        "debt_to_equity": de[-8:],
        "borrowings_cr": debt[-1][1] if debt else None,
        "equity_cr": eq[-1][1] if eq else None,
        "cwip_to_fixed_assets": round(cwip[-1][1] / fa[cwip[-1][0]], 2) if cwip and fa.get(cwip[-1][0]) else None,
        "working_capital": {},
    }
    if not fin and ratios:
        for k, label in (("debtor_days", "Debtor days"), ("inventory_days", "Inventory days"),
                         ("payable_days", "Payable days"), ("ccc", "Cash conversion cycle")):
            s = _series(ratios, k)
            if s:
                balance["working_capital"][label] = [(fy(p), v) for p, v in s[-6:]]
        dd = _series(ratios, "debtor_days")
        if len(dd) >= 4 and dd[-4][1] and dd[-4][1] > 0 and dd[-1][1] - dd[-4][1] >= 15 and dd[-1][1] / max(dd[-4][1], 1) > 1.3:
            flags.append({"level": "watch", "area": "Working capital",
                          "text": f"Debtor days rose from {dd[-4][1]:.0f} to {dd[-1][1]:.0f} in three years: customers are taking longer to pay"})
        ccc = _series(ratios, "ccc")
        if len(ccc) >= 4 and ccc[-4][1] >= 0 and ccc[-1][1] - ccc[-4][1] >= 30:
            flags.append({"level": "watch", "area": "Working capital",
                          "text": f"Cash conversion cycle stretched from {ccc[-4][1]:.0f} to {ccc[-1][1]:.0f} days in three years"})
    if not fin and len(de) >= 4 and de[-1][1] - de[-4][1] >= 0.3 and de[-1][1] >= 0.5:
        flags.append({"level": "watch", "area": "Balance sheet",
                      "text": f"Debt/equity up from {de[-4][1]} to {de[-1][1]} in three years"})
    if balance["cwip_to_fixed_assets"] and balance["cwip_to_fixed_assets"] >= 0.3 and not fin:
        flags.append({"level": "note", "area": "Balance sheet",
                      "text": f"Capital work-in-progress is {100 * balance['cwip_to_fixed_assets']:.0f}% of fixed assets: a big build-out is still to be commissioned"})
    ec = _series(bal, "equity_capital")
    if len(ec) >= 4 and ec[-4][1] and ec[-1][1] / ec[-4][1] > 1.1:
        flags.append({"level": "note", "area": "Balance sheet",
                      "text": f"Share capital up {100 * (ec[-1][1] / ec[-4][1] - 1):.0f}% in three years: new shares from an issue, a merger or a bonus. Only the first two dilute"})

    # ---------------------------------------------------------- cash quality
    cfo = _series(cf, "cfo")
    fcf = _series(cf, "fcf")
    pmap = dict(pat)
    conv = [(fy(p), round(100 * v / pmap[p])) for p, v in cfo if pmap.get(p) and pmap[p] > 0]
    cash = {"cfo": [(fy(p), v) for p, v in cfo[-8:]], "pat": [(fy(p), pmap.get(p)) for p, _ in cfo[-8:]],
            "fcf": [(fy(p), v) for p, v in fcf[-8:]], "conversion": conv[-8:]}
    if not fin and len(cfo) >= 5:
        c5 = sum(v for _, v in cfo[-5:])
        p5 = sum(pmap.get(p, 0) for p, _ in cfo[-5:])
        profitable = all(pmap.get(p, 0) > 0 for p, _ in cfo[-5:])
        if p5 > 0 and profitable:
            cash["conversion_5y"] = round(100 * c5 / p5)
            if c5 <= 0:
                flags.append({"level": "red", "area": "Cash quality",
                              "text": f"₹{p5:,.0f} cr of profit over five years, yet operating cash flow was "
                                      f"{'−' if c5 < 0 else ''}₹{abs(c5):,.0f} cr in total"})
            elif c5 / p5 < 0.7:
                flags.append({"level": "red", "area": "Cash quality",
                              "text": f"Only {100 * c5 / p5:.0f}% of the last five years' profit arrived as operating cash"})
        if fcf:
            neg = sum(1 for _, v in fcf[-5:] if v < 0)
            if neg >= 3:
                flags.append({"level": "watch", "area": "Cash quality",
                              "text": f"Free cash flow negative in {neg} of the last 5 years"})
    if fin:
        cash["note"] = "For lenders, operating cash flow mostly reflects loan-book growth, so conversion ratios are not meaningful."

    # ---------------------------------------------------------- shareholding
    sh = co.get("shareholding")
    holding = None
    if sh and sh["rows"].get("promoters"):
        pr = [(p, v) for p, v in zip(sh["periods"], sh["rows"]["promoters"]) if v is not None]
        fii = [(p, v) for p, v in zip(sh["periods"], sh["rows"].get("fiis", [])) if v is not None]
        holding = {"promoters": pr[-8:], "fiis": fii[-8:]}
        if len(pr) >= 5 and pr[-5][1] - pr[-1][1] >= 3:
            flags.append({"level": "watch", "area": "Ownership",
                          "text": f"Promoter holding fell from {pr[-5][1]:.1f}% to {pr[-1][1]:.1f}% over four quarters"})

    return {"snapshot": snapshot, "financial": financial, "trajectory": traj, "balance": balance,
            "cash": cash, "holding": holding, "flags": flags,
            "as_of": co.get("fetched_at"), "basis": "consolidated" if co.get("consolidated") else "standalone"}
