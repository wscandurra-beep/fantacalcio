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
3. Refresh the seasonal `Coppe`, injury, FBref-age and `Pro_Contro` inputs. Keep Fantacalcio `Id` as the primary key; add explicit mappings for exceptions.
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

## Pubblicazione con GitHub Pages

Il repository include `.github/workflows/pages.yml`: a ogni push su `main` esegue i test, prepara un artefatto contenente soltanto `index.html`, `src/` e `data/`, quindi pubblica il sito con GitHub Pages. I workbook sorgente non vengono inclusi nel sito pubblico.

Per la prima pubblicazione:

1. Apri **Settings → Pages** nel repository.
2. In **Build and deployment → Source**, seleziona **GitHub Actions**. Non scegliere il template Jekyll: il workflow è già presente.
3. Esegui il merge/push su `main`, oppure apri **Actions → Deploy static application to GitHub Pages → Run workflow**.
4. Attendi il completamento del job e usa l'URL mostrato nell'environment `github-pages`.

Il sito usa percorsi relativi e funziona anche all'indirizzo di progetto `https://<utente>.github.io/<repository>/`. GitHub Pages rende pubblico il contenuto distribuito anche quando il repository è privato: il workflow esclude gli Excel, ma `data/players.json` e ogni stato inserito direttamente nei file pubblicati sono accessibili a chiunque conosca l'URL. Lo stato dell'asta resta invece nel `localStorage` del singolo browser e non viene sincronizzato tra dispositivi.
