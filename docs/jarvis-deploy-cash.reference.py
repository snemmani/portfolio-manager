"""Advise on pushing one portfolio's rupee cash into the Indian or US market.

Follows the prepare/execute split of the rebalance flow so the user can review the
prompt before it is sent. The model chooses the stocks and the rupee allocation for
each; share quantities are calculated here, because whole-share rounding and the
USD conversion are arithmetic the report must get right.
"""
import json
import logging
import math
import re
import tempfile
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from bujo.base import openai_model
from bujo.portoflio.ledger import currency_for_ticker
from bujo.portoflio.rebalance import (
    _GRAHAM_SYSTEM_PROMPT,
    _MARKETS,
    _MAX_OUTPUT_TOKENS,
    _MAX_SINGLE_STOCK_PCT,
    _NON_DISCRETIONARY_HOLDINGS,
    _PRICE_INPUT_PER_1M,
    _PRICE_OUTPUT_PER_1M,
    _REBALANCE_MODEL,
    MARKET_INDIA,
    MARKET_US,
    _build_candidate_forward_outlook_section,
    _build_forward_outlook_section,
    _build_market_data_section,
    _build_non_discretionary_section,
    _build_position_notes_section,
    _build_position_sizing_violations,
    _build_positions_table,
    _build_recent_transaction_review,
    _build_sector_allocation,
    _compute_cash_by_portfolio,
    _compute_positions_by_portfolio,
    _evaluate_screened_candidates,
    _extract_report,
    _fetch_live_usd_inr,
    _fetch_ticker_data,
    _screen_market_candidates,
)

logger = logging.getLogger(__name__)

_US_QUANTITY_DECIMALS = 4
_ALLOCATION_BLOCK = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL)

# The rebalance framework minus its Parts A–K report structure, so the selection
# criteria cannot drift from what /rebalancerecommendations applies.
_FRAMEWORK = _GRAHAM_SYSTEM_PROMPT.split("REQUIRED OUTPUT STRUCTURE")[0].rstrip("═\n ")

_DEPLOY_CASH_SYSTEM_PROMPT = f"""{_FRAMEWORK}

════════════════════════════════════
THIS TASK: DEPLOY CASH INTO ONE MARKET
════════════════════════════════════
Decide how to invest the stated rupee amount from one portfolio into one market.
This is a buy-only decision: do not recommend selling or trimming anything.
  • Choose only from the "Investable Tickers" list. Everything else is context.
  • Measure the position sizing rules against the whole portfolio, including its
    holdings in the other market and any non-discretionary holdings.
  • Consider stocks held in other portfolios as aggregate exposure.
  • Prefer fewer meaningful positions over spreading a small amount thinly.
  • State a reserve explicitly if you do not allocate the full amount.

SHARE QUANTITIES ARE CALCULATED BY THE SYSTEM. Allocate rupee amounts and never
state a share count, even where the supplied data asks for one.

════════════════════════════════════
REQUIRED OUTPUT STRUCTURE
════════════════════════════════════
Section 1 — Deployment Summary
  What this cash should do for the portfolio and which weakness it addresses.

Section 2 — Selected Stocks
  | Ticker | Action (ENTER / ACCUMULATE) | Category | Sector | CMP | Allocated ₹ | Entry Zone | XIRR Potential | Conviction |
  Show CMP and Entry Zone in the stock's market currency and Allocated in rupees.
  Follow with each stock's thesis, valuation, forensic result, one concrete forward
  driver and one concrete forward risk from the supplied data.

Section 3 — Considered But Not Selected
  The strongest alternatives and the single reason each was passed over.

Section 4 — Execution Plan
  Buying order, and what to do if a stock gaps up more than 5% before you can buy.

Section 5 — Allocation Data
  End the response with exactly one fenced block in this form:
  ```json
  {{"allocations": [{{"ticker": "SYMBOL", "amount_inr": 50000}}]}}
  ```

Format the response as clean Markdown. Where data is uncertain, say so — do not
fabricate. Do not recommend a stock only because it is cheap, and do not recommend
a high-quality company at any price.
"""


def floor_quantity(amount_native: float, price_native: float, market: str) -> float:
    """Most shares the amount buys: whole shares in India, fractional in the US."""
    if price_native <= 0 or amount_native <= 0:
        return 0.0
    factor = 10 ** _US_QUANTITY_DECIMALS if market == MARKET_US else 1
    # round() first so 300.00000000000006-style float noise cannot change the result.
    return math.floor(round(amount_native / price_native * factor, 6)) / factor


def _is_tradable(td: Dict[str, Any], market: str) -> bool:
    """True when the ticker's price can be sized and its financials can be trusted.

    Financials are converted using the trading currency, so a US-listed ADR that
    reports in another currency would show badly misstated fundamentals.
    """
    currency = _MARKETS[market]["currency"]
    return (
        not td.get("error")
        and (td.get("cmp_native") or 0) > 0
        and td.get("currency") == currency
        and td.get("financial_currency", currency) == currency
    )


def _other_portfolio_exposure(
    positions_by_portfolio: Dict[str, Dict[str, Dict]],
    portfolio: str,
) -> str:
    lines = ["## Holdings In Other Portfolios\n"]
    rows = [
        f"- {other} / {ticker}: {pos['net_shares']:g} shares"
        for other, tickers in sorted(positions_by_portfolio.items())
        if other != portfolio
        for ticker, pos in sorted(tickers.items())
    ]
    lines.extend(rows or ["_None._"])
    lines.append("")
    return "\n".join(lines)


def prepare_cash_deployment(
    transactions_model,
    portfolio: str,
    market: str,
    amount: Optional[float] = None,
) -> Dict[str, Any]:
    """Build the deployment prompt and write it to disk, without calling the LLM.

    amount is in rupees and defaults to the portfolio's full cash balance.
    """
    spec = _MARKETS[market]
    transactions = transactions_model.list()
    if not transactions:
        return {"error": "📭 No portfolio transactions found — nothing to deploy."}

    cash = _compute_cash_by_portfolio(transactions).get(portfolio, 0.0)
    if cash <= 0:
        return {"error": f"📭 {portfolio} has no cash to deploy (balance ₹{cash:,.0f})."}
    deploy_amount = cash if amount is None else float(amount)
    if deploy_amount <= 0:
        return {"error": "Please provide a positive amount to deploy."}
    if deploy_amount > cash:
        return {"error": f"₹{deploy_amount:,.0f} is more than {portfolio}'s cash balance of ₹{cash:,.0f}."}

    positions_by_portfolio = _compute_positions_by_portfolio(transactions)
    holdings = positions_by_portfolio.get(portfolio, {})

    usd_inr: Optional[float] = None
    if market == MARKET_US or any(currency_for_ticker(tk) == "USD" for tk in holdings):
        usd_inr = _fetch_live_usd_inr()
        if not usd_inr:
            return {"error": "❌ Couldn't get a live USD/INR rate, so this can't be sized safely. Try again shortly."}
    fx_rate = usd_inr if market == MARKET_US else 1.0

    logger.info("Preparing cash deployment — %s, %s, ₹%.0f", portfolio, market, deploy_amount)
    holding_data = {ticker: _fetch_ticker_data(ticker) for ticker in sorted(holdings)}

    candidates_section, screened_quotes = _screen_market_candidates(set(holdings), market, fx_rate)
    eligible_quotes, candidate_data, gate_section, candidate_rows = _evaluate_screened_candidates(screened_quotes)

    investable: Dict[str, Dict[str, Any]] = {
        ticker: {"td": td, "action": "ACCUMULATE"}
        for ticker, td in holding_data.items()
        if ticker.upper() not in _NON_DISCRETIONARY_HOLDINGS
        and currency_for_ticker(ticker) == spec["currency"]
        and _is_tradable(td, market)
    }
    investable.update({
        ticker: {"td": candidate_data[ticker], "action": "ENTER"}
        for ticker in eligible_quotes
        if _is_tradable(candidate_data[ticker], market)
    })
    if not investable:
        return {"error": f"📭 No {spec['label']} stocks passed the screen and forward-risk gate. Try again later."}

    equity_value = sum(
        pos["net_shares"] * (holding_data[ticker].get("cmp") or 0)
        for ticker, pos in holdings.items()
    )
    portfolio_value = equity_value + cash
    today = date.today()
    scoped = {portfolio: holdings}
    cash_map = {portfolio: cash}

    prices = {ticker: entry["td"]["cmp_native"] for ticker, entry in investable.items()}
    investable_list = "\n".join(
        f"- {ticker} ({entry['action']}): {spec['symbol']}{entry['td']['cmp_native']:,.2f}"
        for ticker, entry in sorted(investable.items())
    )
    fx_line = f"**Exchange rate:** $1 = ₹{usd_inr:,.2f}\n" if usd_inr else ""
    quantity_rule = (
        "Fractional shares are allowed."
        if market == MARKET_US else
        "Whole shares only, so a stock priced above its allocation cannot be bought."
    )
    user_message = (
        f"## Cash Deployment Request — {today.strftime('%d %b %Y')}\n\n"
        f"**Portfolio:** {portfolio}\n"
        f"**Target market:** {spec['label']} ({spec['universe']})\n"
        f"**Amount to deploy:** ₹{deploy_amount:,.0f} of ₹{cash:,.0f} cash\n"
        f"**Portfolio value (equity + cash):** ₹{portfolio_value:,.0f}\n"
        f"{fx_line}"
        f"**Share rule:** {quantity_rule}\n\n"
        f"## Investable Tickers\n{investable_list}\n\n"
        f"{_build_non_discretionary_section(scoped, holding_data)}\n"
        f"{_build_sector_allocation(scoped, holding_data, equity_value, cash_map)}\n"
        f"{_build_positions_table(scoped, holding_data, today, cash_map)}\n"
        f"{_build_position_sizing_violations(scoped, holding_data, cash_map)}\n"
        f"{_other_portfolio_exposure(positions_by_portfolio, portfolio)}\n"
        f"{_build_recent_transaction_review(scoped, today)}\n"
        f"{_build_position_notes_section(scoped)}\n"
        f"{_build_forward_outlook_section(scoped, holding_data)}\n"
        f"{_build_market_data_section(holding_data)}\n"
        f"{candidates_section}\n"
        f"{gate_section}\n"
        f"{_build_candidate_forward_outlook_section(candidate_rows)}\n"
        f"{_build_market_data_section(candidate_data)}\n"
        "---\n"
        "Allocate the amount across the Investable Tickers following the required output "
        "structure. Ignore any instruction above about exact share counts: allocate rupees only."
    )

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    input_md = (
        f"# Cash Deployment — Input Prompt\n"
        f"**Generated:** {datetime.now().strftime('%d %b %Y, %I:%M %p')}  \n"
        f"**Model:** {_REBALANCE_MODEL}  \n"
        f"**Portfolio:** {portfolio} | **Market:** {spec['label']} | **Amount:** ₹{deploy_amount:,.0f}  \n\n"
        "---\n\n"
        "## System Prompt\n\n"
        f"{_DEPLOY_CASH_SYSTEM_PROMPT.strip()}\n\n"
        "---\n\n"
        "## User Message\n\n"
        f"{user_message}"
    )
    input_tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".md",
        prefix=f"deploy_cash_input_{timestamp}_",
        delete=False, encoding="utf-8",
    )
    input_tmp.write(input_md)
    input_tmp.flush()
    input_tmp.close()
    logger.info("Cash deployment input written to: %s", input_tmp.name)

    return {
        "input_path": input_tmp.name,
        "input_md": input_md,
        "user_message": user_message,
        "timestamp": timestamp,
        "portfolio": portfolio,
        "market": market,
        "amount": deploy_amount,
        "cash": cash,
        "fx_rate": fx_rate,
        "prices": prices,
        "actions": {ticker: entry["action"] for ticker, entry in investable.items()},
        "held_inr": {
            ticker: pos["net_shares"] * (holding_data[ticker].get("cmp") or 0)
            for ticker, pos in holdings.items()
        },
        "portfolio_value": portfolio_value,
    }


def _parse_allocations(report: str) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
    """Split the model's report from its allocation block. None means unusable."""
    matches = list(_ALLOCATION_BLOCK.finditer(report))
    if not matches:
        return report, None
    block = matches[-1]
    body = (report[:block.start()] + report[block.end():]).strip()
    try:
        allocations = json.loads(block.group(1)).get("allocations")
    except (json.JSONDecodeError, AttributeError):
        return body, None
    return body, allocations if isinstance(allocations, list) else None


def build_order_sheet(allocations: List[Dict[str, Any]], prepared: Dict[str, Any]) -> Dict[str, Any]:
    """Turn rupee allocations into quantities. Only prepared tickers are accepted."""
    warnings: List[str] = []
    wanted: Dict[str, float] = {}
    for item in allocations:
        if not isinstance(item, dict):
            warnings.append(f"Ignored malformed allocation: {item!r}")
            continue
        ticker = str(item.get("ticker") or "").strip().upper()
        try:
            amount = float(item.get("amount_inr"))
        except (TypeError, ValueError):
            amount = 0.0
        if ticker not in prepared["prices"]:
            warnings.append(f"Ignored {ticker or 'a blank ticker'}: not on the investable list.")
        elif amount <= 0 or not math.isfinite(amount):
            warnings.append(f"Ignored {ticker}: allocation was not a positive amount.")
        else:
            wanted[ticker] = wanted.get(ticker, 0.0) + amount

    total_wanted = sum(wanted.values())
    if total_wanted > prepared["amount"]:
        scale = prepared["amount"] / total_wanted
        wanted = {ticker: amount * scale for ticker, amount in wanted.items()}
        warnings.append(
            f"The model allocated ₹{total_wanted:,.0f}, more than the ₹{prepared['amount']:,.0f} "
            "available, so every allocation was scaled down proportionally."
        )

    market = prepared["market"]
    fx_rate = prepared["fx_rate"]
    rows: List[Dict[str, Any]] = []
    for ticker, allocated in sorted(wanted.items(), key=lambda kv: kv[1], reverse=True):
        price = prepared["prices"][ticker]
        quantity = floor_quantity(allocated / fx_rate, price, market)
        cost_inr = quantity * price * fx_rate
        weight = (prepared["held_inr"].get(ticker, 0.0) + cost_inr) / prepared["portfolio_value"] * 100
        rows.append({
            "ticker": ticker,
            "action": prepared["actions"][ticker],
            "price": price,
            "allocated_inr": allocated,
            "quantity": quantity,
            "cost_inr": cost_inr,
            "post_buy_pct": weight,
        })
        if quantity == 0:
            warnings.append(
                f"{ticker} is unaffordable: ₹{allocated:,.0f} doesn't buy one share at "
                f"{_MARKETS[market]['symbol']}{price:,.2f}."
            )
        if weight > _MAX_SINGLE_STOCK_PCT:
            warnings.append(f"{ticker} would be {weight:.1f}% of the portfolio, above the {_MAX_SINGLE_STOCK_PCT:g}% cap.")

    spent = sum(row["cost_inr"] for row in rows)
    return {"rows": rows, "warnings": warnings, "spent_inr": spent, "leftover_inr": prepared["amount"] - spent}


def _render_order_sheet(sheet: Optional[Dict[str, Any]], prepared: Dict[str, Any]) -> str:
    market = prepared["market"]
    spec = _MARKETS[market]
    lines = ["## Order Sheet\n"]
    if sheet is None:
        lines.append(
            "⚠️ **The model didn't return usable allocation data, so no quantities could be "
            "calculated. Don't place orders from this report.**\n"
        )
        return "\n".join(lines)

    if market == MARKET_US:
        lines.append(f"_Rupee amounts converted at $1 = ₹{prepared['fx_rate']:,.2f}. Remittance fees and TCS aren't deducted._\n")
    lines.extend([
        f"| Ticker | Action | CMP ({spec['symbol']}) | Allocated ₹ | Shares To Buy | Cost ₹ | Portfolio % After |",
        "|--------|--------|---------|-------------|---------------|--------|-------------------|",
    ])
    decimals = _US_QUANTITY_DECIMALS if market == MARKET_US else 0
    for row in sheet["rows"]:
        lines.append(
            f"| {row['ticker']} | {row['action']} | {row['price']:,.2f} | ₹{row['allocated_inr']:,.0f} | "
            f"{row['quantity']:,.{decimals}f} | ₹{row['cost_inr']:,.0f} | {row['post_buy_pct']:.1f}% |"
        )
    lines.append(
        f"\n**Deployed:** ₹{sheet['spent_inr']:,.0f} of ₹{prepared['amount']:,.0f} | "
        f"**Left in cash:** ₹{sheet['leftover_inr']:,.0f}\n"
    )
    lines.extend(f"- ⚠️ {warning}" for warning in sheet["warnings"])
    lines.append("")
    return "\n".join(lines)


def execute_cash_deployment(prepared: Dict[str, Any]) -> Tuple[Optional[str], str]:
    """Run the LLM for an already prepared cash deployment."""
    try:
        response = openai_model.chat.completions.create(
            model=_REBALANCE_MODEL,
            messages=[
                {"role": "system", "content": _DEPLOY_CASH_SYSTEM_PROMPT},
                {"role": "user", "content": prepared["user_message"]},
            ],
            max_completion_tokens=_MAX_OUTPUT_TOKENS,
        )
        report = _extract_report(response, "Cash deployment analysis")
        usage = response.usage
        in_tok = usage.prompt_tokens if usage else 0
        out_tok = usage.completion_tokens if usage else 0
        cost_usd = (in_tok / 1_000_000 * _PRICE_INPUT_PER_1M) + (out_tok / 1_000_000 * _PRICE_OUTPUT_PER_1M)
        cost_inr = cost_usd * 84.0
        logger.info("Cash deployment done. Tokens — in: %d, out: %d | Cost: $%.4f", in_tok, out_tok, cost_usd)

        body, allocations = _parse_allocations(report)
        sheet = build_order_sheet(allocations, prepared) if allocations is not None else None
        spec = _MARKETS[prepared["market"]]
        report_md = (
            f"# Cash Deployment — {prepared['portfolio']} → {spec['label']}\n"
            f"**Generated:** {datetime.now().strftime('%d %b %Y, %I:%M %p')}  \n"
            f"**Model:** {_REBALANCE_MODEL}  \n"
            f"**Amount:** ₹{prepared['amount']:,.0f} of ₹{prepared['cash']:,.0f} cash  \n"
            "_Advice only: nothing has been recorded in the portfolio. Prices are from when the prompt was generated._\n\n"
            "---\n\n"
            f"{_render_order_sheet(sheet, prepared)}\n"
            "---\n\n"
        ) + body
        report_tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".md",
            prefix=f"deploy_cash_report_{prepared['timestamp']}_",
            delete=False, encoding="utf-8",
        )
        report_tmp.write(report_md)
        report_tmp.flush()
        report_tmp.close()
        logger.info("Cash deployment report written to: %s", report_tmp.name)

        usage_msg = (
            f"📊 Cash deployment analysis complete\n"
            f"Model: {_REBALANCE_MODEL}\n"
            f"Input tokens:  {in_tok:,}\n"
            f"Output tokens: {out_tok:,}\n"
            f"Est. cost:     ${cost_usd:.4f} USD  (~₹{cost_inr:.2f})"
        )
        return report_tmp.name, usage_msg

    except Exception as e:
        logger.error("Cash deployment analysis failed: %s", e, exc_info=True)
        return None, f"❌ Cash deployment analysis failed: {e}"

