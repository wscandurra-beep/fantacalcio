# Workbook implementation analysis

## A. Workbook map

Only dependency-bearing sheets were inspected. `Selezione Giocatori-->` is a transposed presentation over `DC`, `E`, `C`, `WA`, `PC` and `Goalkeeper`. Those ranking sheets expose the final context columns. `Mantra&Quotazione` is the 2025 player/FVM snapshot; the committed 2026/27 quotation workbook replaces it. `Stats` is the appended season history. `SOURCE` is an FBref table plus manual normalized-name column. `Infortuni (GPT)`, `Coppe`, and `Pro_Contro` are enrichment inputs. `Moduli`, `Scelta Modulo-->`, `Disponibili per ruolo`, and `Asta` implement formation, supply and budget planning. `W_Index_Calculation`, ordering helpers and repair-auction sheets are outside MVP scope.

The current quotation workbook has `Tutti` plus positional projections with columns `Id, R, RM, Nome, Squadra, Qt.A, Qt.I, …, FVM, FVM M`. The current statistics workbook has the same projections and `Id, R, Rm, Nome, Squadra, Pv, Mv, Fm, …`.

## B/E. Final-field dependency and calculations

| Output | Source and columns | Transformation | Key |
|---|---|---|---|
| Nome, Team, Mantra R | current quotations: `Nome`, `Squadra`, `RM` | direct | `Id` |
| Coppe | `Coppe.Competizione/Squadra` | team lookup; blank if absent | normalized team |
| Asta € | current quotations `FVM M` (fallback `FVM`) | credits; old sheet calls rounded `FVM M` “Crediti” | `Id` |
| Quot. | current quotations `Qt.A M` | direct current Mantra quotation | `Id` |
| Hype Factor | ranking sheets | `Asta € / Quot.` | derived |
| Age | `SOURCE` FBref age/birth data; old master cached birth year | workbook result is current year minus birth year | explicit mapping/name+team; no safe current ID bridge exists |
| AvgPG | historical `Stats.Pg` | ranking output shows arithmetic mean of seasonal appearances, including represented zero/missing seasons according to pivots | `Id` |
| AvgMf | historical `Stats.Mf` | ranking output shows arithmetic mean of seasonal fantasy averages (not weighted by appearances) | `Id` |
| ACT PG | current statistics `Pv` (`Stats.Pg` in reference) | direct current-season appearances | `Id` |
| ACT MF | current statistics `Fm` (`Stats.Mf` in reference) | direct current-season fantasy average | `Id` |
| Status | `Infortuni (GPT)` | absent → `OK`; present → injury marker plus `Periodo_rientro` | `Id`, otherwise reviewed name/team |
| Pro, Contro | `Pro_Contro.PRO/CONTRO` | direct cached text; mojibake remains a source-quality concern | `Id` |

`Asta €` is therefore not W_Index. In the reference it is Fantacalcio's Mantra FVM/credits. `% BDG = Asta € / 1000` is presentation tied to the reference budget, whereas the app derives percentages from the configured budget. `ACT MV` exists in Excel but is not a requested MVP field.

## C. Asta analysis

`Moduli` contains min/max role coverage and formation rows. The selected reference strategy resolves to 34 slots: 3 Por, 8 Dc, 6 E, 5 C, 9 W/A, 3 Pc. `Asta` rows contain slot ordinal, category, baseline percentage (`BDG%` looked up from selection), baseline credits (`BDG = BDG% × 1000`), forecast credits (`FCT = ACT when entered, otherwise BDG`), forecast percentage, actual price (`ACT`) and selected player. Category variance is the sum of forecast less baseline. Total budget/remaining calculations aggregate those rows. The application separates baseline, forecast and actual values and makes the total budget configurable.

The workbook exposes 11 formation definitions, including 343, 3412 and 3421, but its cached formulas do not safely establish complete editable bench-slot defaults for every formation. The MVP therefore treats formation and slots as configuration rather than claiming inferred defaults are canonical.

## D. Role mapping

The ranking population formulas establish: POR=`Por`; DC includes `Dc` and defensive `B`-style central coverage; E includes `E`; C includes `C`/`M`; WA uses `W` or `A` and the ranking sheet contains `A`, `W;A`, and other T/A combinations; PC includes `Pc`. Assignment is centralized with increasing priority `POR < DC < E < C < WA < PC`, so `Ds;Dc → DC`, `Dd;Dc → DC`, `Dc;E → E`. Non-dedicated `Ds`/`Dd` do not displace a dedicated category.

## F. Normalized model

Season/source manifest → player (`fantacalcio_id`) → raw season statistics → derived selection metrics; separate seasonal competition, injury, qualitative-note and explicit-name-mapping records; auction → formation → slots (baseline/forecast/actual) → frozen player ranking/tier snapshots → market events/status. Ambiguous matches become data-quality records rather than player updates.

## G/H. Repository and UI architecture

`scripts/import_workbooks.py` owns OOXML ingestion; `data/players.json` is its reproducible browser artifact; `src/domain.js` owns normalization, role assignment, ranking, tiers, budget and availability; `src/app.js` owns local persisted auction state and rendering. The desktop UI has Cockpit, Market, Strategy and Data Quality views. `localStorage` is deliberately the MVP persistence boundary, avoiding backend infrastructure while surviving refreshes.

## I. Ambiguities and safe omissions

* Current 2026/27 files appear future/synthetic relative to the reference and contain no birth dates. The old FBref `SOURCE` cannot be safely joined to all current players, so current age is left null pending an explicit map/current FBref import.
* Exact pivot cache settings behind historical `AvgPG`/`AvgMf` (especially blank/zero behavior and season eligibility) are not fully recoverable from visible formulas. The app does not fabricate them.
* Current injury, Cup and Pro/Contro sheets are reference-season snapshots. ID matches are imported, but staleness is surfaced by missing values; no live scraping is implied.
* One current player has no dedicated category. It remains preserved for manual review.
* The reference has broken external links and `#REF!` team counters; these are not reproduced.
