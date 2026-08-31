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

## Aggiornamento manuale infortuni

L'aggiornamento non ha trigger temporali: il solo flusso ordinario è **Aggiorna
infortuni → Worker → `workflow_dispatch` → scraper → commit → deploy Pages**. Il
Worker mantiene il token GitHub fuori dal browser e accetta richieste soltanto
dall'origine configurata.

1. Pubblicare `worker/` con Cloudflare Workers (`npx wrangler deploy`) e impostare
   `ALLOWED_ORIGIN` (l'URL esatto di Pages) e `GITHUB_REPOSITORY` (`owner/repo`).
2. Creare un fine-grained GitHub token limitato a questo repository, con
   **Actions: write**, quindi salvarlo solo come secret Worker con
   `npx wrangler secret put GITHUB_TOKEN`.
3. Impostare la variabile GitHub Actions `INJURY_TRIGGER_ENDPOINT` all'URL del
   Worker, senza slash finale, e rieseguire il deploy Pages.

Il frontend interroga lo stato del run, attende la pubblicazione del nuovo
`updatedAt`, ricarica in memoria giocatori e riepilogo e applica un timeout di 15
minuti. `unmatched` e `ambiguous` sono visibili solo nei dettagli. Il workflow
infortuni contiene esclusivamente `workflow_dispatch`: non aggiungere `schedule`
o cron.

## Seasonal import

1. Add the new quotation and statistics `.xlsx` files without deleting historical sources.
2. Update the filenames/current season in `scripts/import_workbooks.py` (the only source manifest boundary in this MVP).
3. Refresh the seasonal `Coppe`, injury, FBref-age and `Pro_Contro` inputs. Keep Fantacalcio `Id` as the primary key; add explicit mappings for exceptions.
4. Run `npm run import:data`; review the reported unresolved categories and the Data Quality view.
5. Run `npm test` before committing the generated `data/players.json`.

The importer uses only Python's standard library, reads the OOXML sources directly, and never modifies them. Raw statistics remain in their workbooks; only required selection metrics are emitted. Missing/ambiguous enrichment is left empty rather than guessed.

## Business rules

* Dedicated role assignment is centralized and selects the highest eligible priority among `POR, DC, E, C, WA, PC`.
* Ranking is `Asta € DESC`, then `Quot. DESC`.
* A category with `S` planned slots is divided into `S` deterministic, balanced supply tiers. Once a SOLD or MY TEAM event starts the auction, stored status changes do not recalculate rank or tier from availability.
* Baseline and actual purchase price are the slot sources of truth. Forecast is always derived from Actual when present, otherwise from Baseline.
* Maximum roster size is 34 and the default plan includes exactly three goalkeepers.

See [the workbook implementation analysis](docs/workbook-analysis.md) for the traced dependencies, verified formulas and explicit ambiguities.
