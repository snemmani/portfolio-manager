# Trade review and application logic audit — 4 November 2026

## Delivered behaviour

Sale cards and the price drawer display the actual proposed FIFO lots, proceeds, cost, gross profit/loss, remaining shares and portfolio weight. Financial warnings remain investigation requests, not sale authorisations. Concentration trims explain why reducing single-company exposure can justify a realised loss. User-chosen exits are labelled as personal scenarios. Current financial evidence, dated advisory AI context and stored thesis notes are available beside the assessment; missing forward evidence is stated explicitly.

Settings defaults: profit review at +25% versus remaining average cost, consider 20% of shares, 14 calendar days after a recorded trade, and an 8% pullback from a recorded sale before considering re-entry. Thresholds are configurable and are not claims of optimal trading performance. A gain alone never authorises a sale. Profit-taking additionally requires technical extension (RSI >=70 or price >=SMA20 + 2 ATR), positive FIFO profit, complete records, fresh event coverage, and explicit review of the specific assessment. Reviews expire after 24 hours and changes to trades or settings invalidate them. A triggered review persists until gain falls five percentage points below its threshold, preventing threshold oscillation from turning into alternating buy/review cards.

Re-entry watches derive from actual NocoDB sales, including fully exited positions. Suggestions and alerts never count as fills. Reviewing why the stock was sold cannot bypass the waiting period, price condition, financial screen, event checks, portfolio limits or technical readiness. Partial-position re-entry is capped at the number of shares sold. A subsequent purchase closes the episode, while any outstanding waiting period still limits further purchases. Watches expire after 180 days. Splits invalidate comparison to an unadjusted historical sale price. Hard concentration limits retain priority over discretionary profit-taking timing.

## Weaknesses found and fixed

- Average-cost profit could conceal a FIFO loss on the lots actually sold. Positive FIFO profit is now required for profit-taking.
- Stale quotes, quote-currency mismatches, malformed transactions and unmatched sales could leave portfolio sizing apparently complete. Sizing now blocks on these conditions; wrong-currency values are excluded from valuation.
- A missing comparative annual period could be mislabelled as year-on-year growth. Comparatives must be approximately one year apart; future-dated statements are not fresh evidence.
- A previously screened stock could remain listed after purchase, and duplicated ideas could allocate twice. Held names are removed from persisted discovery and allocation candidates are deduplicated.
- NaN/Infinity and invalid targets could leak into sizing. Explicit finite positive values and valid targets are required.
- Other portfolios' missing valuations could leave household limits unverifiable. Buy sizing blocks while household evidence is incomplete; temporary missing coverage does not reset Discord qualification episodes.
- Duplicate transaction IDs or a pagination bound could silently distort the portfolio. Duplicate IDs and upstream errors reject the snapshot; reaching the pagination bound cannot return a partial valuation as complete.
- Repeated or ancient candles could look like enough current technical evidence. Duplicate timestamps are removed and the latest daily evidence must be recent.
- Some alert paths trusted an old `canDraft` flag. They now share quantity, price, session, quote-age and expiry validation with card tickets.
- Event uploads could omit a proposed stock while retaining its previous coverage. Omitted targets lose coverage rather than silently inheriting it.
- A review submitted after trades/settings changed could approve a different assessment. Review tokens bind to a SHA-256 trade-history fingerprint and the exact settings, and the server refreshes transaction records before accepting a review.

- A large review-only position could precede a supported concentration trim. Supported actions now precede review-only cards within the same urgency group. Re-entry watches are collapsed by default so they do not bury urgent cards.

## Validation

`python3 scripts/test-logic.py` runs the offline suite without live Discord messages or AI calls. It includes 3,000 generated FIFO reference cases, 5,000 generated allocation plans checking cash conservation/whole shares/all exposure limits, two weeks of scheduling boundaries, and mocked API tests for sales, reviews, cooldowns, re-entry after partial/full exits, later-buy closure, event failures, webhook delivery races/deduplication, lease contention, source integrity and subscription-only authentication. TypeScript checking, Docker production build, migration application, live read-only checks and browser checks complete deployment validation.

These tests verify the implemented rules and safeguards. They do not backtest expected investment returns or establish that the default thresholds beat buy-and-hold.

## Remaining limits

Yahoo quotes may be delayed; news/calendar coverage can be unavailable and is not a comprehensive news service. Unknown event coverage blocks buys and discretionary profit-taking. A cash-conversion snapshot does not establish fraud or a broken business thesis. Tax, brokerage costs, spread and historical INR FX tax accounting are not supplied: sale results are explicitly gross estimates. Corporate-action reconciliation remains manual. No broker orders are submitted. NocoDB is the source of actual trades and the explicit cash ledger; sale proceeds must be recorded there rather than inferred from a recommendation.
