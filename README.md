# Fantacalcio Mantra Auction Room

A dependency-light desktop auction cockpit derived from the committed Excel model. It supports configurable strategy, demand-based frozen tiers, quick SOLD/MY TEAM actions, live budget tracking and refresh-safe browser persistence without recreating spreadsheet helper sheets or W_Index.

## Run

```bash
npm run import:data
npm test
npm run dev
# open http://localhost:4173
```

The MVP is a static application and stores auction strategy/state in browser `localStorage`. Use a separate browser profile per auction. Removing site data resets the auction.

## Seasonal import

1. Add the new quotation and statistics `.xlsx` files without deleting historical sources.
2. Update the filenames/current season in `scripts/import_workbooks.py` (the only source manifest boundary in this MVP).
3. Refresh the seasonal `Coppe`, FBref-age and `Pro_Contro` inputs. Injury data must never be added to a workbook: it comes only from the live snapshot. Keep Fantacalcio `Id` as the primary key; add explicit mappings for exceptions.
4. Run `npm run import:data`; review the reported unresolved categories and the Data Quality view.
5. Run `npm test` before committing the generated `data/players.json`.

The importer uses only Python's standard library, reads the OOXML sources directly, and never modifies them. Raw statistics remain in their workbooks; only required selection metrics are emitted. Missing/ambiguous enrichment is left empty rather than guessed.

## Business rules

* Dedicated role assignment is centralized and selects the highest eligible priority among `POR, DC, E, C, WA, PC`.
* Ranking is `Asta € DESC`, then `Quot. DESC`.
* A category with `S` planned slots is divided into `S` deterministic, balanced supply tiers. Once a SOLD or MY TEAM event starts the auction, stored status changes do not recalculate rank or tier from availability.
* Baseline, current forecast and actual purchase price are distinct slot values.
* Maximum roster size is 34 and the default plan includes exactly three goalkeepers.

See [the workbook implementation analysis](docs/workbook-analysis.md) for the traced dependencies, verified formulas and explicit ambiguities.

## Live injury refresh

`python3 scripts/scrape_infortuni.py` downloads the single aggregate Fantacalcio injury page, validates a complete non-empty result, matches it deterministically, compares it with the previous snapshot, and atomically replaces `data/infortuni.json`, `data/infortuni_update.json`, and player statuses. The **Aggiorna infortuni** workflow provides the authenticated manual execution path. Invalid or anti-bot pages exit unsuccessfully before any dataset is written.

GitHub Pages cannot safely dispatch a write-enabled workflow. Consequently, the in-app button remains explicitly disabled unless the deployed `index.html` contains `<meta name="injury-refresh-endpoint" content="https://…">`. That URL must be a same-user authenticated server-side endpoint (for example a GitHub App or an access-controlled serverless function) which accepts `POST`, validates authorization and CSRF/origin, keeps its GitHub App private key server-side, and dispatches `scrape-infortuni.yml` through GitHub's API. It must return HTTP 2xx only after dispatch is accepted and permit the Pages origin via CORS. No PAT, secret, workflow credential, or fallback token belongs in HTML, JavaScript, localStorage, or this repository. The browser then polls the cache-busted summary until its `updatedAt` changes.
