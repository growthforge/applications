# Smoke test of the triage prompt (3 November 2026)

**What this is:** a smoke test, not a measure of accuracy. The emails are illustrative and were written for this test, so the numbers show whether the prompt behaves safely and returns usable answers, not how it would perform on real complaints. In the pilot, the same cases are re-run in AI Builder's prompt test (testing a prompt there is free) and then on a sample of real, anonymised emails agreed with the Complaints Team.

**How it was run**
- `cases.jsonl`: 24 illustrative emails (E01 to E24), written separately from the prompt, so the test was blind, with the expected answer for each: 11 formal complaints, 9 aftercare items, 4 general enquiries, 5 possible emergencies across those types, and deliberately hard cases (a polite complaint about a third missed repair, an angry first defect report, a passing mention of the Ombudsman, a door that will not lock described casually).
- `demo-cases.jsonl`: the four emails used in the mock-up (D1 to D4), scored separately.
- The model: Claude Haiku, standing in for the Copilot or AI Builder step, run in four batches of seven emails. The runs saw only the prompt and the emails, never the expected answers.
- `score.mjs` (no dependencies) checks every answer against the output contract and the expected labels: `node score.mjs cases.jsonl runs/<outputs>.jsonl`.

## Run 1: prompt version 1
| Measure | Result |
|---|---|
| Answers valid against the schema | 0 of 28 |
| Possible emergencies flagged | 5 of 5 |
| Formal complaints caught | 13 of 13 |
| Drafts containing a date the AI wrote itself | 0 of 28 |
| Type correct overall | 27 of 28 |

**What it found:** version 1 told the model to match "the schema below" but never listed three of the fields (customer name, development, plot), so no answer matched the contract. The safety behaviour was already right. Version 2 lists all twelve keys and shows the shape. One demo email of my own (D1) was also reworded, because a mention of water marks could fairly be read as a possible leak; the blind set was not changed. Full output: `runs/run1-haiku-outputs.jsonl`, `runs/run1-RESULTS.md`.

## Run 2: prompt version 2, blind set (E01 to E24)
| Measure | Result |
|---|---|
| Answers valid against the schema | 24 of 24 |
| Possible emergencies flagged | 5 of 5 |
| Formal complaints caught (the dangerous miss) | 11 of 11 |
| Drafts containing a date the AI wrote itself | 0 of 24 |
| Type correct overall | 23 of 24 |
| Non-complaints sent to the register to be safe | 1 |
| False emergency flags | 0 |
| Reservation and completion dates exactly right | 24 of 24 |
| Plot number exactly right | 24 of 24 |

The one difference: E02, an angry first report of a defect, was read as a formal complaint with low confidence. That is the rule working as designed ("when in doubt, it is a complaint"): a person sees the low confidence and moves it to the customer portal route in a few seconds. Full output: `runs/run2-haiku-outputs.jsonl`, `runs/run2-RESULTS-blind.md`.

## Run 2: the four demo emails (D1 to D4)
All four correct on type, dates and plot; no dates in the drafts; both complaint drafts use the `[PATHWAY_DUE]` placeholder. The mock-up shows these answers unchanged (`assets/pilot-data.js` is generated from `runs/run2-haiku-outputs.jsonl`). `runs/run2-RESULTS-demo.md`.

## What this does and does not show
- It shows the prompt keeps to its boundaries on these emails: every emergency flagged, no complaint missed, no date invented, every answer machine-readable.
- It does not show accuracy on real complaints, on Microsoft's models, or at volume. Those are week 2 and the shadow run in the trial plan.
