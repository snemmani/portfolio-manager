# Market review reliability — 5 November 2026

## Failure mechanism

The old monitor requested a complete execution plan over HTTP for each portfolio/stock pair (up to 230 per review). Each request rebuilt the portfolio/discovery context and refreshed candidate quotes. Alerts performed similar repeated work. Web restarts interrupted those requests, error handling hid the failed operation, and ignored heartbeat errors allowed work to continue after losing its lease.

The preceding 12-hour log inspection found 60 monitor failure messages, 18 completed technical/event reviews, 20 screening-only batches, 14 watchdog web restarts, 444 broken pipes and 15 connection resets. These are observations of the old deployment, not a guarantee about every contributing cause.

## Revised execution

1. Claim a stable review ID and collect the portfolio once. Persist the compact snapshot and ledger revision.
2. Refresh discovery and event evidence against that captured scope. Identical uploads are retryable; different evidence cannot silently replace an already captured result.
3. Build and persist one execution context, preserving financial, cash, FX, exposure, event, approval, loss/profit, cooldown and holding restrictions.
4. Collect three chart inputs and calculate indicators once per unique stock in the Node market process. Reuse that result for each portfolio-specific plan. Limit concurrency to four stocks.
5. Recheck the ledger revision and policy/approval fingerprint. If they changed, discard the outdated frame and request a new review.
6. Commit plans and a single notification-review outbox row atomically. Persist completion so retrying a lost response does not repeat it.

The final ledger check is a read for change detection, not a second portfolio valuation. A review normally has one snapshot read plus this final ledger read. Stock failures retain an unavailable plan for that stock's portfolios while healthy stocks can complete; no gate is relaxed to make a review appear successful.

Snapshots expire after 15 minutes. Database stage locks prevent overlapping snapshot/context construction. Checkpoints survive market-process restarts on the existing screening volume and use a private directory/file. Control requests have bounded retries; client logs identify operations, attempts, status/code, elapsed time and review ID. Heartbeats renew ownership every 20 seconds; lost ownership or prolonged renewal failure stops work. Credentials, leases and full portfolio records are not logged.

## Predeployment verification

- TypeScript compilation and the complete existing financial/trade/alert/source regression suite.
- 1,000 generated cases against the actual shared execution engine: cash/FX/exposure constraints, event blocks, cooldowns, stale data, market closure and immutable shared context.
- 46,000 generated plans across 200 fault-injected collector reviews, checking per-stock reuse and bounded concurrency.
- Protocol tests for stable claims, pending stage locks, identical evidence retries, exact plan coverage, changed ledger/approvals, snapshot expiry, restart/resume and atomic completion.
- Five complete isolated workerd reviews using persistent D1, five synthetic portfolios and 230 plans each: 1,150 plans, 230 unique-stock collections, ten ledger reads, one web restart, injected network failures, a discarded completion response, one stock outage and delayed stock responses. Exactly five outbox rows were created.
- The isolated runtime test used only mocked providers. Its first successful run completed in 31.8 seconds, with a maximum health-probe response of 78 ms and no observed heap growth. These are test measurements, not production performance targets.

Reproduce with `python3 scripts/test-logic.py`. Runtime isolation tests bind temporary loopback ports and remove their temporary databases after completion. Tests never send Discord notifications, call AI, mutate real settings or write NocoDB transactions.

## Remaining operating limits

Public providers can still be unavailable or rate limited. The monitor records those failures, retries within its budgets and keeps affected trades blocked. Very slow or expired reviews require a fresh snapshot. The weekday scheduler does not independently exclude exchange holidays; price/session validation still controls trade readiness. This change does not alter AI schedules, consume API credits, place orders or broaden financial eligibility.

## Production verification

The image was built after the full regression suite and isolated stress tests passed. A private database backup was created on the existing data volume before migration 0009; the migration applied successfully. Web, market and alerts were recreated with the new image. The existing Codex research service and login were left running.

An on-demand review on 5 November completed at **07:29:38 IST**, in **41.5 seconds**. Logs showed one snapshot capture (2.1 seconds), one execution-context load (1.9 seconds), four distinct stocks, eight portfolio plans, zero unavailable plans and successful heartbeat renewal. All four requested event checks returned coverage; three contained flagged events, which remained subject to review. The saved review phase was complete, the monitor error was null and there was exactly one notification-review outbox row for that review.

The live portfolio endpoint returned 246 records, 49 holdings and five portfolios in 479 ms; health and monitor status were also responsive during verification. The web container had zero restarts after deployment and used approximately 661 MiB after the review, compared with approximately 3.86 GiB before recreation. These short-run observations are not a long-run memory guarantee. The public route returned the expected Cloudflare Access authentication redirect; requests through the configured public Host header returned HTTP 200 locally. The listener remained bound to 127.0.0.1:8787.

Financial screening had just started a fresh resumable pass: 32 of 771 preliminary matches had been evaluated, with 739 pending. The small live execution worklist therefore does not establish that every discovered company was reviewed; the larger synthetic stress cases cover the 230-plan path. Screening continuation retains its existing batch and eligibility checks.
