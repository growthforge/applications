# Sample plans (synthetic) and their planted issues

In production this folder is replaced by a read from SharePoint or the cost system, made with the signed-in user's identity. Here it is the plan store for tests and the demo.

## PLAN-OFF-01: synthetic office, Stage 2, 8,400 m² GIFA, estimate base date Jun 2026

| Line | Planted issue | Item raised |
|---|---|---|
| L01 Substructure | Line total typed as 2,349,000; 285 x 8,400 = 2,394,000 | check, arithmetic |
| L03 Internal finishes | Rate already carries forecast inflation to Jun 2027, and L14 adds inflation from Jun 2026 | check, inflation_double_count |
| L09 Preliminaries | 14 per cent applied to groups 1 to 8; the Table 2.1 build-up applies it to groups 0 to 8 | check, percentage_base |
| L02 Superstructure | Benchmark rate dated Dec 2021, not rebased to Jun 2026 | review, base_date (suggests 1,190.34 per m²) |
| L05 Services | Basis "TBC" | review, basis |
| L02 Superstructure | 960 per m² sits below the synthetic office range | note, benchmark_range |
| L04 Fittings, furnishings and equipment | 140 per m² sits above the synthetic office range | note, benchmark_range |

## PLAN-SCH-02: synthetic secondary school, Stage 3, 12,000 m² GIFA, estimate base date Mar 2026

| Line | Planted issue | Item raised |
|---|---|---|
| L09 Preliminaries | A 2024 tender's preliminaries sum indexed to Mar 2026 | check, percentage_rebased |
| L10 Overheads and profit | 5.5 per cent applied to groups 0 to 8, leaving out preliminaries | check, percentage_base |
| L14 Inflation | Allowance runs from Mar 2024 (the old tender date), not from the estimate base date | review, inflation_period |

## PLAN-WHS-03: synthetic distribution warehouse, Stage 2, 24,000 m² GIFA, estimate base date Jun 2026

A clean plan: no items should be raised. The tool still says the plan needs the cost manager's review.
