# Data

| Path | What it is | Real or synthetic | Made by |
|---|---|---|---|
| `series/ons-opi.json` | ONS construction output price indices, ten monthly series, Jan 2014 to Jun 2026 (2015=100, not seasonally adjusted), release of 13 Aug 2026 | **Real**, copied as published | `tools/extract_ons.py` from `bulletindataset9.xlsx` (SHA-256 recorded in the file) |
| `benchmarks.json` | Elemental ranges per m² GIFA for four building types | **Synthetic** | `tools/generate_synthetic.mjs`, seed 20261104 |
| `plans/*.json` | Three sample cost plans with planted issues | **Synthetic** | `tools/generate_synthetic.mjs` (hand-written lines, totals computed) |

## ONS indices (real)

Source: Office for National Statistics, Construction output price indices, https://www.ons.gov.uk/businessindustryandtrade/constructionindustry/datasets/interimconstructionoutputpriceindices . Contains public sector information licensed under the Open Government Licence v3.0.

What they are and are not: modelled output prices (materials, plant, labour and a profit mark-up), a proxy rather than a tender price index; no regional split; recent months provisional for up to twelve months. In this release "Public (other than housing)" and "Private commercial" carry identical values in every month; the server says so whenever either is used.

To refresh after the next ONS release (due 12 Nov 2026): download the new workbook, run `python3 -I tools/extract_ons.py <workbook> data/series/ons-opi.json`, then `npm test`. Tests that pin Jun 2026 values will need their expected figures updated only if ONS revises them.

## Synthetic benchmarks

Made up, to exercise the checks. Not RLB, BCIS or market data. For each of four building types the generator draws twelve projects: each is dated to a month between Jan 2019 and Dec 2025, priced at that month (a hand-picked central rate per element, times a project factor and element noise, times the All new work index ratio), and rounded to the pound as a benchmark analysis would record it. The ranges then rebase every project to Jun 2026 with the same index and take the 10th, 50th and 90th percentiles. `npm run data:check` regenerates everything in memory and fails if a file differs.

## Sample plans

See `plans/README.md` for the planted issues and the items each plan should raise.
