# Automatic cash research and shared company reports

The app now uses the installed Antigravity CLI through `runner/antigravity.mjs`. The Docker AI runner contains no Codex CLI or SDK. Its private account mount contains only the consumer account token; per-run profiles exclude inherited API credentials, personal hooks and unrelated local configuration. Paid G1 credit fallback is disabled. Read-only web and scoped report-reader tools are allowed, while commands, file access and delegation are refused. Profiles are removed after completion. The old app-specific Codex host service remains disabled.

Migration 0012 adds persistent portfolio/market research campaigns. Four weekday IST slots each claim up to two companies, prioritizing untouched candidates over incomplete or failed retries. At least 24 hours separate retries, with three attempts per evidence version. New report evidence reopens work without erasing its previous attempt history. Current supported or rejected cases are reused. Exhausted campaigns return automatic slots to other company research; manual cash requests retain their selected scope. No research result overrides purchase, accounting, valuation, event, cash or exposure checks.

Annual reports is now a main-navigation page shared by holdings, recommendations and cash plans. Company links prefill the symbol. The page loads independently of portfolio data. Uploaded PDFs, validated cached summaries and source citations are preserved in the existing document service.

Verification on 5 November 2026:

- Full logic suite passed, including allocation stress cases, 46,000 monitor fault plans, 1,150 restart/load plans, alert deduplication and report validation.
- Real SQLite scheduler tests advanced eight distinct pending companies through four simulated slots, continued after a failed batch, stayed idle outside market hours and resumed other portfolio research when the cash queue emptied.
- AGY process tests passed for account-only authentication, secret exclusion, read-only tools, schema transport, stdin/stream handling and profile cleanup.
- A live Gemini request exposed numeric-enum incompatibility. The transport now describes those numeric choices while retaining numeric types. Both full production schemas subsequently passed against AGY. The document service still validates the exact multipliers and quoted evidence.
- A real AGY batch reviewed PERSISTENT.NS and SARDAEN.NS, made 16 public searches and published both dossiers with provider `antigravity`. Required annual/accounting sources were not verified, so both remained incomplete and neither became an approved purchase. Two earlier pre-research format failures remain visible for bounded retry rather than being represented as company evidence findings.
- The refreshed ShankarIndia screen contained 20 candidates: two previously completed cases, 14 queued, two incomplete dossiers and two failed attempts awaiting retry. NIITMTS.NS and FSL.NS were next. The next automatic slot was 6 November, 09:15 IST.
- Read-only browser checks passed for shared report navigation, the saved COFORGE PDF, symbol-prefilled links, independent loading, AGY settings and responsive light/dark layouts. All nine application pages and health returned HTTP 200.

A consistent private SQLite backup was taken before applying migration 0012. No NocoDB transactions, trading orders or synthetic Discord messages were created.
