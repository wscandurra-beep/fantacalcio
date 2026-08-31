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

### HTTP 403 durante lo sviluppo

Un errore come `CONNECT tunnel failed, response 403` proviene dal proxy della
rete di sviluppo **prima** che la richiesta raggiunga Fantacalcio: non è una
risposta HTTP della pagina e non si risolve cambiando User-Agent, usando `curl`
come fallback o aggiungendo un browser headless. In quella rete la destinazione
deve essere autorizzata dall'amministratore del proxy; in alternativa eseguire
il download dal workflow GitHub Actions, che è anche l'ambiente usato dal
pulsante **Aggiorna infortuni**.

Per distinguere un blocco di rete da un errore del parser:

```bash
# Verifica il percorso di rete. Un 403 riferito a CONNECT identifica il proxy.
curl -I https://www.fantacalcio.it/infortunati-serie-a

# Esegue soltanto parsing, validazione e matching su HTML già scaricato.
# Il file deve comunque provenire dalla fonte Fantacalcio indicata sopra.
python3 scripts/scrape_infortuni.py --input /percorso/infortunati-serie-a.html
```

Non disabilitare la validazione e non introdurre mirror/API alternative per
aggirare il blocco: in caso di download fallito lo scraper termina prima delle
scritture e conserva l'ultimo snapshot valido.

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
