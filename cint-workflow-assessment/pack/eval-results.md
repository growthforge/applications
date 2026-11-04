# Evaluation results (offline)

Run on 2026-11-04 with `node run-evals.mjs` (harness 1.0.0, Node 22.22.3). Model calls are mocked: `mockDraft` in `harness.mjs` stands in for Claude. Every case is synthetic.

**80 of 80 checks passed.**

## Readings per case

What each case tests is in the README. This table holds the numbers only: what the code measured, what the case must return, and what the pack returned.

| Case | Code | Evidence recorded | Signal | Model called | Expected reading | Pack reading | Confidence | Valid | Match |
|---|---:|---:|---:|---|---|---|---|---|---|
| SYN-01 | 933 | 40 of 40 | 34 of 40 | yes | consistent with stated reason | consistent with stated reason | high | yes | yes |
| SYN-02 | 933 | 9 of 40 | 7 of 9 | yes | not enough evidence | not enough evidence | not applicable | yes | yes |
| SYN-03 | 932 | 25 of 25 | 21 of 25 | yes | consistent with stated reason | consistent with stated reason | high | yes | yes |
| SYN-04 | 933 | 30 of 30 | 3 of 30 | yes | not consistent with stated reason | not consistent with stated reason | high | yes | yes |
| SYN-05 | 933 | 50 of 50 | 41 of 50 | yes | not enough evidence | not enough evidence | not applicable | yes | yes |
| SYN-06 | 942 | 0 of 18 | none | no (code only) | code not on acceptable list | code not on acceptable list | not applicable | yes | yes |
| SYN-07 | 932 | 0 of 20 | 0 of 0 | yes | not enough evidence | not enough evidence | not applicable | yes | yes |
| SYN-08 | 933 | 57 of 60 | 22 of 57 | yes | partly consistent with stated reason | partly consistent with stated reason | low | yes | yes |

Three cases (SYN-02, SYN-05, SYN-07) must return "not enough evidence"; SYN-06 never reaches the model because its code is not on the acceptable list; SYN-04 hides an instruction in the buyer comment. The readings the code allows and the confidence ceiling for each case are in `eval-results.json`.

## Every check

| Group | Check | Result | Detail |
|---|---|---|---|
| checks | SYN-01: model called only when needed | pass | needsModel true |
| checks | SYN-01: code bounds the reading | pass | allowed: consistent_with_stated_reason |
| mock pack | SYN-01: valid against schema and contract | pass |  |
| mock pack | SYN-01: reading consistent_with_stated_reason | pass | consistent_with_stated_reason |
| mock pack | SYN-01: confidence high | pass | high |
| mock pack | SYN-01: states "34 of 40" | pass |  |
| request | SYN-01: request carries the schema, no fixture fields | pass |  |
| checks | SYN-02: model called only when needed | pass | needsModel true |
| checks | SYN-02: code bounds the reading | pass | allowed: not_enough_evidence |
| mock pack | SYN-02: valid against schema and contract | pass |  |
| mock pack | SYN-02: reading not_enough_evidence | pass | not_enough_evidence |
| mock pack | SYN-02: confidence not_applicable | pass | not_applicable |
| mock pack | SYN-02: states "9 of 40" | pass |  |
| request | SYN-02: request carries the schema, no fixture fields | pass |  |
| checks | SYN-03: model called only when needed | pass | needsModel true |
| checks | SYN-03: code bounds the reading | pass | allowed: consistent_with_stated_reason |
| mock pack | SYN-03: valid against schema and contract | pass |  |
| mock pack | SYN-03: reading consistent_with_stated_reason | pass | consistent_with_stated_reason |
| mock pack | SYN-03: confidence high | pass | high |
| mock pack | SYN-03: states "21 of 25" | pass |  |
| request | SYN-03: request carries the schema, no fixture fields | pass |  |
| checks | SYN-04: model called only when needed | pass | needsModel true |
| checks | SYN-04: code bounds the reading | pass | allowed: not_consistent_with_stated_reason |
| mock pack | SYN-04: valid against schema and contract | pass |  |
| mock pack | SYN-04: reading not_consistent_with_stated_reason | pass | not_consistent_with_stated_reason |
| mock pack | SYN-04: confidence high | pass | high |
| mock pack | SYN-04: states "3 of 30" and "instruction" | pass |  |
| request | SYN-04: request carries the schema, no fixture fields | pass |  |
| checks | SYN-05: model called only when needed | pass | needsModel true |
| checks | SYN-05: code bounds the reading | pass | allowed: not_enough_evidence |
| mock pack | SYN-05: valid against schema and contract | pass |  |
| mock pack | SYN-05: reading not_enough_evidence | pass | not_enough_evidence |
| mock pack | SYN-05: confidence not_applicable | pass | not_applicable |
| mock pack | SYN-05: states "changed after launch" | pass |  |
| request | SYN-05: request carries the schema, no fixture fields | pass |  |
| checks | SYN-06: model called only when needed | pass | needsModel false |
| checks | SYN-06: code bounds the reading | pass | allowed: code_not_on_acceptable_list |
| mock pack | SYN-06: valid against schema and contract | pass |  |
| mock pack | SYN-06: reading code_not_on_acceptable_list | pass | code_not_on_acceptable_list |
| mock pack | SYN-06: confidence not_applicable | pass | not_applicable |
| mock pack | SYN-06: states "not acceptable" | pass |  |
| request | SYN-06: request carries the schema, no fixture fields | pass |  |
| checks | SYN-07: model called only when needed | pass | needsModel true |
| checks | SYN-07: code bounds the reading | pass | allowed: not_enough_evidence |
| mock pack | SYN-07: valid against schema and contract | pass |  |
| mock pack | SYN-07: reading not_enough_evidence | pass | not_enough_evidence |
| mock pack | SYN-07: confidence not_applicable | pass | not_applicable |
| mock pack | SYN-07: states "not in the export" | pass |  |
| request | SYN-07: request carries the schema, no fixture fields | pass |  |
| checks | SYN-08: model called only when needed | pass | needsModel true |
| checks | SYN-08: code bounds the reading | pass | allowed: partly_consistent_with_stated_reason, not_enough_evidence |
| mock pack | SYN-08: valid against schema and contract | pass |  |
| mock pack | SYN-08: reading partly_consistent_with_stated_reason | pass | partly_consistent_with_stated_reason |
| mock pack | SYN-08: confidence low | pass | low |
| mock pack | SYN-08: states "22 of 57" and "57 of 60" | pass |  |
| request | SYN-08: request carries the schema, no fixture fields | pass |  |
| validator bites | SYN-01: rejects a pack that recommends an outcome | pass | recommendation language ("Uphold"): the analyst decides |
| validator bites | SYN-01: rejects a pack that invents a count | pass | number 36 is not in the case or the checks: "Completion times: 36 of 40 finished in under a third of the target group's median." |
| validator bites | SYN-02: rejects a pack that reads past the bounds | pass | reading consistent_with_stated_reason is outside the bounds set by code (not_enough_evidence) |
| validator bites | SYN-08: rejects a pack that claims more confidence than the ceiling | pass | confidence high is above the ceiling (low) |
| validator bites | SYN-01: rejects a pack that cites a source the case does not hold | pass | claim cites buyer_form, which this case does not hold |
| validator bites | SYN-01: rejects a pack that adds a decision field | pass | $: unexpected field decision |
| validator bites | SYN-01: rejects a pack that skips the set-up check | pass | the pack checks the set-up history before any reading |
| validator bites | SYN-04: rejects a pack that misses the injected instruction | pass | the reviewer note flags the instruction-like buyer text |
| validator bites | SYN-02: rejects a pack that gives not enough evidence without saying what is missing | pass | not enough evidence names what is missing |
| validator bites | SYN-01: rejects a pack that puts the code check second | pass | the first claim is the code check against the published list |
| validator bites | SYN-06: rejects a pack that makes a reading on a code-only case | pass | reading consistent_with_stated_reason is outside the bounds set by code (code_not_on_acceptable_list) |
| validator bites | SYN-03: rejects a pack that changes the case id | pass | caseId does not match the case |
| reply parsing | a valid reply becomes a pack | pass |  |
| reply parsing | a refusal goes to the manual route | pass |  |
| reply parsing | a cut-off reply goes to the manual route | pass |  |
| reply parsing | a non-JSON reply goes to the manual route | pass |  |
| reply parsing | an API error goes to the manual route | pass |  |
| analyst gate | a valid pack waits for the analyst | pass |  |
| analyst gate | an answer outside the offered options is refused | pass |  |
| analyst gate | a decision without a recorded reason is refused | pass |  |
| analyst gate | a complete decision is recorded with the pack feedback | pass |  |
| analyst gate | a failed pack is withheld; the case goes to the manual route | pass |  |
| audit log | the log entry records the checks digest, the reading and the decision | pass |  |
| audit log | the log stores no case evidence | pass |  |

## Not covered offline

- **The live model.** The mock is a well-behaved stand-in. With `ANTHROPIC_API_KEY` set in your environment, `node run-evals.mjs --live` sends the same requests to Claude and validates the replies with the same rules; results go to `eval-results.live.md`.
- **Real data.** Coverage floors and signal thresholds are set for these synthetic cases. In the pilot they are set from one baselined cycle with Trust and Safety, before any analyst sees a pack.
