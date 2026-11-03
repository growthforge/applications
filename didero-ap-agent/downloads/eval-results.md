# Evaluation results

Synthetic set: 26 items (21 supplier emails and the PO-chasing job), run date 2026-11-03. Labels in eval/expected.json were written by hand from the scenario design. The set is weighted towards exceptions on purpose. It is a regression suite for the policy, labelled by its author, not an independent benchmark.

| Run | Type correct | Action correct | Reasons correct | Fields correct | Auto-actions that should have gone to a person | Items sent to a person needlessly | Payment-fraud holds |
|---|---|---|---|---|---|---|---|
| Tuned policy, mock extraction (price tolerance 2%) | 26/26 | 26/26 | 26/26 | 92/92 | 0 | 0 | E07 |

Claude extraction: not run (no API key in this environment).

## Tuning: price tolerance sweep

| Percentage | Per-line cap (pounds) | Action correct | Auto-actions that should have gone to a person | Items sent to a person needlessly |
|---|---|---|---|---|
| 0% | 50 | 25/26 | 0 | 1 |
| 2% | 50 | 26/26 | 0 | 0 |
| 10% | 50 | 26/26 | 0 | 0 |
| 10% | none | 24/26 | 2 (E03, E20) | 0 |

## Per item (tuned policy, mock extraction)

| Item | Expected | Got | Reasons | OK |
|---|---|---|---|---|
| E01 | ready_for_payment | ready_for_payment | THREE_WAY_MATCH | yes |
| E02 | ready_for_payment | ready_for_payment | PRICE_WITHIN_TOLERANCE, THREE_WAY_MATCH | yes |
| E03 | exception | exception | PRICE_VARIANCE | yes |
| E04 | exception | exception | QTY_NOT_RECEIVED | yes |
| E05 | exception | exception | NO_PO_REFERENCE | yes |
| E06 | block_duplicate | block_duplicate | DUPLICATE_INVOICE | yes |
| E07 | hold_fraud | hold_fraud | SENDER_DOMAIN_LOOKALIKE, BANK_DETAILS_CHANGED | yes |
| E08 | exception | exception | ARITHMETIC_MISMATCH | yes |
| E09 | exception | exception | UNKNOWN_SUPPLIER | yes |
| E10 | needs_approval | needs_approval | CREDIT_NOTE | yes |
| E11 | exception | exception | EXTRACTION_LOW_CONFIDENCE | yes |
| E12 | exception | exception | TAX_MISMATCH | yes |
| E13 | update_po_auto | update_po_auto | CONFIRMED_ON_OR_BEFORE_REQUESTED | yes |
| E14 | needs_approval | needs_approval | DELIVERY_LATER_THAN_REQUESTED | yes |
| E15 | needs_approval | needs_approval | DELIVERY_DELAY | yes |
| E16 | ignore | ignore | AUTO_REPLY | yes |
| E17 | needs_approval | needs_approval | PAYMENT_QUERY | yes |
| E18 | ready_for_payment | ready_for_payment | IMPORT_NO_UK_VAT, THREE_WAY_MATCH | yes |
| E19 | ready_for_payment | ready_for_payment | CARRIAGE_WITHIN_ALLOWANCE, SUPPLIER_SKU_MAPPED, THREE_WAY_MATCH | yes |
| E20 | exception | exception | PRICE_VARIANCE | yes |
| E21 | needs_approval | needs_approval | ACK_PRICE_CHANGE | yes |
| CHASE-PO-24004 | needs_approval | needs_approval | CHASE_DELIVERY | yes |
| CHASE-PO-24007 | needs_approval | needs_approval | CHASE_ACK | yes |
| CHASE-PO-24009 | needs_approval | needs_approval | ESCALATE_TO_BUYER | yes |
| CHASE-PO-24010 | needs_approval | needs_approval | CHASE_DELIVERY | yes |
| CHASE-PO-24021 | needs_approval | needs_approval | PRE_DUE_CHECK | yes |
