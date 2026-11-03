# Arthapalana portfolio intelligence

Private portfolio dashboard for NocoDB `PortfolioTransactions`, inspired by finance workstations and the investment framework in `snemmani/jarvis`.

## Features

- Reads every NocoDB page; never changes portfolio records or places trades.
- FIFO lots, realised/unrealised P&L, explicit CASH ledger, separate portfolios and aggregate exposure.
- Yahoo Finance market-session quotes, currency conversion, source timestamps, stock-price histories and split/bonus reconciliation warnings. Quotes may be delayed; weekday session freshness does not include an exchange holiday calendar.
- Declarative position-size, recent-purchase, cash-conversion, financial-sector and non-discretionary ORCL checks. Annual ratios use comparable statement dates and financial currencies. Missing data prevents unsupported action sizing.
- Conditional cash deployment into eligible existing holdings; Indian whole shares, US four-decimal quantities, explicit reserve, portfolio and household caps. New-stock discovery is not implemented.
- OpenAI settings with model selection, encrypted API key, connection test, configurable automatic report interval and key removal. Background Responses API reports are persisted and polled; duplicate report creation is locked in D1. No real model calls are made until configured and enabled.

The dashboard refreshes portfolio/market data every five minutes **while open**. AI analysis refreshes at the configured interval while open. It does not run unattended while the page is closed. Yahoo financial statements may be unavailable or delayed. Missing governance, moat, news, forward guidance, banking metrics and full five-year forensic evidence are explicitly marked as unknown. Forward XIRR is not invented. AI reports are review proposals, and trade quantities need fresh execution checks.

## Architecture and security

Vinext / React / TypeScript on Cloudflare Workers, with Sites owner-private access. The Worker exposes `/api/portfolio`, `/api/settings`, and `/api/analysis`. The owner-private Sites gateway is the authorization boundary; do not broaden site access without implementing per-user authorization and isolating settings/portfolio data. Mutations verify the same-origin Origin header.

Runtime secrets: `NOCODB_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `SETTINGS_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex characters). Configure through Sites environment settings, never client code or the hosting manifest. The OpenAI key entered in Settings is encrypted with AES-256-GCM before D1 storage and never returned. Preserve the encryption secret across deploys or re-enter the AI key. Enabling AI sends the displayed portfolio, notes and financial evidence to OpenAI using the Responses API with `store:false`; background requests are temporarily stored by OpenAI for polling. API calls consume the user's balance.

USD purchase costs and gains use the current USD/INR rate, matching the supplied Jarvis ledger convention, and are not historical-FX tax accounting. Corporate actions are verified, never applied automatically. Financial-sector stock types require a qualitative review; broad sector groups are conservative provisional mappings.

## Development and checks

Requires Node >=22.13. Install with the Sites installer or `npm ci`. Use `npm run dev` for localhost development. Local credentials may be passed through environment variables; the development-only Vite configuration injects those into local Worker bindings. They are absent from production build configuration.

Generate schema migrations with `npm run db:generate`. For local D1, after the first build:

```
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_graceful_blindfold.sql
```

Meaningful verification:

```
npx tsc --noEmit
./node_modules/esbuild/bin/esbuild tests/engine.test.ts --bundle --platform=node --format=esm --outfile=/tmp/arthapalana-engine-test.mjs
node /tmp/arthapalana-engine-test.mjs
./node_modules/esbuild/bin/esbuild lib/ai.ts --bundle --platform=node --format=esm --outfile=/tmp/arthapalana-ai.mjs
node tests/settings-ai.test.mjs
```

The second suite uses an in-memory SQLite database and mocked OpenAI/market responses. It tests encryption, CSRF protection, masked retrieval, polling, duplicate-call prevention and removal without making paid API calls. Production build: use the Sites skill `scripts/build-site.mjs`; preserve the starter `sites()` build integration.

## Framework attribution

Source framework: [`snemmani/jarvis`](https://github.com/snemmani/jarvis), commit `5750d4bf5e7187eb052129e8e282c53edaf35cdf`, Apache License 2.0. Original rebalance and deploy-cash files are retained in `docs/` for traceability. `lib/prompts.ts` retains the rebalance system prompt; the dashboard adds explicit evidence, freshness, locked-position and compact-output instructions. The declarative engine is an adaptation, not a complete reimplementation of all Jarvis research integrations.
