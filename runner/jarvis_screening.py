# Adapted from snemmani/jarvis, Apache-2.0; see docs/JARVIS-LICENSE.

from typing import Any, Dict, List, Optional, Tuple

import re

import yfinance as yf

MARKET_INDIA="IN"
MARKET_US="US"

_MARKETS={"IN":{"exchanges":("NSI",)},"US":{"exchanges":("NMS","NGM","NCM","NYQ","ASE")}}

_FORWARD_RISK_CONS_PHRASES = (
    "profit declined",
    "profits declined",
    "earnings declined",
    "margin declined",
    "margins declined",
    "regulatory",
    "warning letter",
    "usfda",
    "price erosion",
    "customer concentration",
    "product concentration",
    "working capital",
    "debtor days",
    "inventory days",
)

def _parse_analyst_rating(raw_rating: Any) -> Optional[float]:
    if raw_rating in (None, ""):
        return None
    try:
        return float(raw_rating)
    except (TypeError, ValueError):
        pass
    match = re.search(r"(\d+(?:\.\d+)?)", str(raw_rating))
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None

def _classify_sector(sector: str, industry: str) -> str:
    """Map yfinance sector to GrahamPrompt valuation framework bucket."""
    s = (sector or "").lower()
    i = (industry or "").lower()
    if "bank" in s or "bank" in i:
        return "Banks"
    if any(x in s for x in ["financial", "insurance", "capital market"]):
        return "Financials / NBFC"
    if any(x in s for x in ["technology", "software", "semiconductor"]):
        return "Technology"
    if any(x in s for x in ["health", "pharma", "biotech"]):
        return "Pharma / Healthcare"
    if any(x in s for x in ["energy", "oil", "gas", "utilities"]):
        return "Energy / Utilities"
    if any(x in s for x in ["material", "metal", "mining", "chemical"]):
        return "Metals / Chemicals"
    if any(x in s for x in ["industrial", "manufactur", "engineer"]):
        return "Manufacturing / Industrials"
    if any(x in s for x in ["consumer", "retail", "food", "beverage"]):
        return "Consumer"
    if any(x in s for x in ["real estate", "reit"]):
        return "Real Estate"
    return sector or "Unknown"

def _assess_forward_risk(
    ticker: str,
    quote: Dict[str, Any],
    td: Dict[str, Any],
    event_risks: Optional[List[str]] = None,
) -> Dict[str, Any]:
    hard_reject_reasons: List[str] = []
    watchlist_reasons: List[str] = []

    eps_ttm = td.get("eps_ttm")
    eps_forward = td.get("eps_forward")
    pe_ttm = td.get("pe_ttm")
    pe_forward = td.get("pe_forward")
    revenue_growth = td.get("revenue_growth_yoy")
    earnings_growth = td.get("earnings_growth_yoy")
    analyst_rating = _parse_analyst_rating(quote.get("averageAnalystRating"))
    ccr = td.get("cash_conversion_ratio")
    screener_cons = td.get("screener_data", {}).get("cons") or []
    cons_text = " ".join(str(item).lower() for item in screener_cons)

    if earnings_growth is not None and earnings_growth < 0:
        hard_reject_reasons.append(f"earnings growth is negative at {earnings_growth:.1f}%")
    if revenue_growth is not None and revenue_growth < 0:
        watchlist_reasons.append(f"revenue growth is negative at {revenue_growth:.1f}%")

    if eps_ttm is not None and eps_forward is not None and eps_ttm > 0:
        if eps_forward < eps_ttm * 0.9:
            hard_reject_reasons.append(
                f"forward EPS ₹{eps_forward:.2f} is materially below trailing EPS ₹{eps_ttm:.2f}"
            )
        elif eps_forward < eps_ttm:
            watchlist_reasons.append(
                f"forward EPS ₹{eps_forward:.2f} is below trailing EPS ₹{eps_ttm:.2f}"
            )

    if (
        pe_ttm and pe_forward and pe_ttm > 0 and pe_forward > pe_ttm * 1.2
        and ((earnings_growth is not None and earnings_growth < 10) or
             (revenue_growth is not None and revenue_growth < 10))
    ):
        watchlist_reasons.append(
            f"forward P/E {pe_forward:.1f} is stretched vs trailing P/E {pe_ttm:.1f} without enough growth support"
        )

    if analyst_rating is not None and analyst_rating >= 3.5:
        hard_reject_reasons.append(f"analyst rating is weak at {analyst_rating:.1f}")
    elif analyst_rating is not None and analyst_rating >= 3.0:
        watchlist_reasons.append(f"analyst rating is cautious at {analyst_rating:.1f}")

    matched_cons = [phrase for phrase in _FORWARD_RISK_CONS_PHRASES if phrase in cons_text]
    if matched_cons:
        hard_reject_reasons.append(
            "Screener.in cons flag forward risk: " + ", ".join(sorted(set(matched_cons))[:3])
        )

    if ccr is not None and ccr < 0.8:
        watchlist_reasons.append(f"cash conversion ratio is weak at {ccr:.2f}")

    forensic_flags = td.get("forensic_flags") or []
    if len(forensic_flags) >= 2:
        watchlist_reasons.append(f"{len(forensic_flags)} forensic flags need review")

    for risk in event_risks or []:
        watchlist_reasons.append(risk)

    if hard_reject_reasons:
        status = "rejected"
    elif watchlist_reasons:
        status = "watchlist"
    else:
        status = "eligible"

    return {
        "ticker": ticker,
        "status": status,
        "hard_reject_reasons": hard_reject_reasons,
        "watchlist_reasons": watchlist_reasons,
        "all_reasons": hard_reject_reasons + watchlist_reasons,
    }

def _build_sector_aware_queries(
    cat_id: str,
    cap_floor: int,
    market: str = MARKET_INDIA,
) -> List[Tuple[str, str, Any, str]]:
    """
    Returns sector-bucketed sub-queries for a given Graham category with
    sector-appropriate P/E thresholds. Banks use P/B; FMCG gets a relaxed
    P/E cap; cyclicals face a tighter P/E cap.

    Returns: [(sector_label, criteria_desc, query, sort_field)]
    """
    from yfinance import EquityQuery

    exchanges = _MARKETS[market]["exchanges"]
    listing = (
        EquityQuery("eq", ["exchange", exchanges[0]])
        if len(exchanges) == 1 else
        EquityQuery("is-in", ["exchange", *exchanges])
    )
    cap   = EquityQuery("gt", ["intradaymarketcap", cap_floor])
    fcf_p = EquityQuery("gt", ["leveredfreecashflow.lasttwelvemonths", 0])

    if cat_id == "A":
        return [
            (
                "Financials (Banks / NBFCs)",
                "P/B<3 · ROE>12% · Rev Growth>5% — P/E omitted; use P/B for financials",
                EquityQuery("and", [listing, cap,
                    EquityQuery("lt", ["pricebookratio.quarterly",                  3.0]),
                    EquityQuery("gt", ["pricebookratio.quarterly",                  0.0]),
                    EquityQuery("gt", ["returnonequity.lasttwelvemonths",           0.12]),
                    EquityQuery("gt", ["totalrevenues1yrgrowth.lasttwelvemonths",   0.05]),
                ]),
                "returnonequity.lasttwelvemonths",
            ),
            (
                "Consumer / FMCG",
                "P/E<80 · ROE>20% · Net Margin>12% · Rev Growth>8% · FCF+ve — premium justified",
                EquityQuery("and", [listing, cap, fcf_p,
                    EquityQuery("lt", ["peratio.lasttwelvemonths",                  80]),
                    EquityQuery("gt", ["peratio.lasttwelvemonths",                  0]),
                    EquityQuery("gt", ["returnonequity.lasttwelvemonths",           0.20]),
                    EquityQuery("gt", ["netincomemargin.lasttwelvemonths",          0.12]),
                    EquityQuery("gt", ["totalrevenues1yrgrowth.lasttwelvemonths",   0.08]),
                ]),
                "returnonequity.lasttwelvemonths",
            ),
            (
                "Technology / IT Services",
                "P/E<55 · ROE>15% · ROCE>12% · FCF+ve · Rev Growth>8% · LT D/E<1",
                EquityQuery("and", [listing, cap, fcf_p,
                    EquityQuery("lt", ["peratio.lasttwelvemonths",                  55]),
                    EquityQuery("gt", ["peratio.lasttwelvemonths",                  0]),
                    EquityQuery("gt", ["returnonequity.lasttwelvemonths",           0.15]),
                    EquityQuery("gt", ["returnontotalcapital.lasttwelvemonths",     0.12]),
                    EquityQuery("gt", ["totalrevenues1yrgrowth.lasttwelvemonths",   0.08]),
                    EquityQuery("lt", ["ltdebtequity.lasttwelvemonths",             1.0]),
                ]),
                "returnonequity.lasttwelvemonths",
            ),
            (
                "Pharma / Manufacturing / General",
                "P/E<45 · ROE>15% · ROCE>12% · Net Margin>10% · Rev Growth>8% · D/E<1 · ICR>3 · FCF+ve",
                EquityQuery("and", [listing, cap, fcf_p,
                    EquityQuery("lt", ["peratio.lasttwelvemonths",                  45]),
                    EquityQuery("gt", ["peratio.lasttwelvemonths",                  0]),
                    EquityQuery("gt", ["returnonequity.lasttwelvemonths",           0.15]),
                    EquityQuery("gt", ["returnontotalcapital.lasttwelvemonths",     0.12]),
                    EquityQuery("gt", ["netincomemargin.lasttwelvemonths",          0.10]),
                    EquityQuery("gt", ["totalrevenues1yrgrowth.lasttwelvemonths",   0.08]),
                    EquityQuery("lt", ["ltdebtequity.lasttwelvemonths",             1.0]),
                    EquityQuery("gt", ["ebitinterestexpense.lasttwelvemonths",      3.0]),
                ]),
                "returnonequity.lasttwelvemonths",
            ),
        ]

    if cat_id == "B":
        return [
            (
                "Financial GARP",
                "P/B<2.5 · ROE>18% · Rev Growth>15% · NI Growth>15% — P/E omitted for financials",
                EquityQuery("and", [listing, cap,
                    EquityQuery("lt", ["pricebookratio.quarterly",                  2.5]),
                    EquityQuery("gt", ["pricebookratio.quarterly",                  0.0]),
                    EquityQuery("gt", ["returnonequity.lasttwelvemonths",           0.18]),
                    EquityQuery("gt", ["totalrevenues1yrgrowth.lasttwelvemonths",   0.15]),
                    EquityQuery("gt", ["netincome1yrgrowth.lasttwelvemonths",       0.15]),
                ]),
                "netincome1yrgrowth.lasttwelvemonths",
            ),
            (
                "High-Growth Tech / Consumer GARP",
                "P/E<65 · ROE>15% · Rev Growth>20% · NI Growth>20% · PEG<1.5",
                EquityQuery("and", [listing, cap,
                    EquityQuery("lt", ["peratio.lasttwelvemonths",                  65]),
                    EquityQuery("gt", ["peratio.lasttwelvemonths",                  0]),
                    EquityQuery("gt", ["returnonequity.lasttwelvemonths",           0.15]),
                    EquityQuery("gt", ["totalrevenues1yrgrowth.lasttwelvemonths",   0.20]),
                    EquityQuery("gt", ["netincome1yrgrowth.lasttwelvemonths",       0.20]),
                    EquityQuery("lt", ["pegratio_5y",                               1.5]),
                    EquityQuery("gt", ["pegratio_5y",                               0.0]),
                ]),
                "totalrevenues1yrgrowth.lasttwelvemonths",
            ),
            (
                "General GARP",
                "P/E<50 · ROE>15% · Rev Growth>15% · NI Growth>15% · PEG<1.5",
                EquityQuery("and", [listing, cap,
                    EquityQuery("lt", ["peratio.lasttwelvemonths",                  50]),
                    EquityQuery("gt", ["peratio.lasttwelvemonths",                  0]),
                    EquityQuery("gt", ["returnonequity.lasttwelvemonths",           0.15]),
                    EquityQuery("gt", ["totalrevenues1yrgrowth.lasttwelvemonths",   0.15]),
                    EquityQuery("gt", ["netincome1yrgrowth.lasttwelvemonths",       0.15]),
                    EquityQuery("lt", ["pegratio_5y",                               1.5]),
                    EquityQuery("gt", ["pegratio_5y",                               0.0]),
                ]),
                "totalrevenues1yrgrowth.lasttwelvemonths",
            ),
        ]

    # cat_id == "C"
    return [
        (
            "Cyclicals / Metals Value",
            "P/E<10 · P/B<1.5 · FCF+ve · ICR>3 · Net Margin>5% — tight screen for peak-cycle risk",
            EquityQuery("and", [listing, cap, fcf_p,
                EquityQuery("lt", ["peratio.lasttwelvemonths",                  10]),
                EquityQuery("gt", ["peratio.lasttwelvemonths",                  0]),
                EquityQuery("lt", ["pricebookratio.quarterly",                  1.5]),
                EquityQuery("gt", ["pricebookratio.quarterly",                  0.0]),
                EquityQuery("gt", ["ebitinterestexpense.lasttwelvemonths",      3.0]),
                EquityQuery("gt", ["netincomemargin.lasttwelvemonths",          0.05]),
            ]),
            "returnonequity.lasttwelvemonths",
        ),
        (
            "General Value / Re-Rating",
            "P/E<15 · P/B<2 · FCF+ve · ICR>3 · D/E<1.5 · Net Margin>5%",
            EquityQuery("and", [listing, cap, fcf_p,
                EquityQuery("lt", ["peratio.lasttwelvemonths",                  15]),
                EquityQuery("gt", ["peratio.lasttwelvemonths",                  0]),
                EquityQuery("lt", ["pricebookratio.quarterly",                  2.0]),
                EquityQuery("gt", ["pricebookratio.quarterly",                  0.0]),
                EquityQuery("gt", ["ebitinterestexpense.lasttwelvemonths",      3.0]),
                EquityQuery("lt", ["totaldebtequity.lasttwelvemonths",          1.5]),
                EquityQuery("gt", ["netincomemargin.lasttwelvemonths",          0.05]),
            ]),
            "returnonequity.lasttwelvemonths",
        ),
    ]

def _is_us_common_stock(quote: Dict[str, Any]) -> bool:
    """Drop the US listings the quality screens let through but the framework can't assess.

    Preferreds, warrants and units carry the issuer's fundamentals, so ALL-PH (an
    Allstate preferred) looks like a compounder; only single-letter share classes
    such as BRK-B are common stock. ADRs reporting in another currency are dropped
    because financials are converted using the trading currency.
    """
    symbol = str(quote.get("symbol") or "")
    if "-" in symbol and not re.fullmatch(r"[A-Z]+-[A-OQ-Z]", symbol):
        return False
    return quote.get("financialCurrency") in (None, "USD")
