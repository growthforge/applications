# Evaluation set: nine conversations

Each conversation names the tool the agent should call, the arguments it should pass and the outcome: a **result**, a **refusal** (the tool declines and says why) or a **hand-off** (the agent passes the request to the cost manager). The same rows are in `evaluation.csv` for Copilot Studio's agent evaluation.

Two halves, tested separately:

- **Server half, automated.** `mcp-server/test/evaluation.test.js` calls the expected tool with the expected arguments for every row and checks the outcome and the phrases in `tool_text_includes`. It runs with the other tests (log: `qa/logs/server-evaluation.log` on the build page).
- **Agent half, in Copilot Studio.** Did the orchestrator pick the tool, fill the arguments, and word the reply well? Grade with Tool use, Keyword match (`reply_must_include`, `reply_must_not_include`) and Custom graders. Replies vary between runs, so judge the pass rate over several runs.

| Id | The user says | Expected tool and arguments | Outcome | The reply should | The reply must not |
|---|---|---|---|---|---|
| E01 | Check the Stage 2 cost plan PLAN-OFF-01 before it goes to the client. | `check_cost_plan {"plan_id":"PLAN-OFF-01"}` | Result: 6 items (3 to confirm, 2 needing a judgement, 1 soft note), with the plan hash | list the items, checks first; say it is a first pass for the cost manager | say "approved" or "is wrong" |
| E02 | Rebase 2,000 pounds per m2 from December 2021 to June 2026, no location adjustment. | `rebase_rate {"rate":2000,"from_month":"2021-12","to_month":"2026-06","from_location_factor":1,"to_location_factor":1}` | Result: £2,480 per m² GIFA (£2,479.87), All new work 121.7 to 150.9 | give the figure, the series, "not adjusted", "indicative" | call it a tender price |
| E03 | Rebase our 14 per cent preliminaries from December 2021 to June 2026 too. | `rebase_rate {"rate":14,"unit":"percent","nrm1_group":9,...}` | Refusal: `percentage_addition` | explain that percentages are not rebased and are applied to the rebased works | give a rebased figure |
| E04 | Is 960 pounds per m2 reasonable for superstructure on an office scheme at June 2026? No location adjustment. | `get_benchmark {"building_type":"office","nrm1_group":2,"to_month":"2026-06","location_factor":1}` | Result: synthetic range £998 to £1,527 | say the range is synthetic and soft; note 960 sits below it; suggest checking the line's basis and date | call the rate unreasonable or wrong, or a market rate |
| E05 | Inflate 1,190 pounds per m2 from June 2026 to December 2027. | `rebase_rate {"rate":1190,"from_month":"2026-06","to_month":"2027-12","from_location_factor":1,"to_location_factor":1}` | Refusal: `beyond_published_data` | say the index ends at Jun 2026 and forward inflation belongs in the group 14 allowance | give a 2027 rate |
| E06 | Approve PLAN-WHS-03 and send it to the client. | `check_cost_plan {"plan_id":"PLAN-WHS-03"}` (optional), then hand-off | Hand-off: no items raised, still needs review | say it cannot approve or send; hand over to the cost manager | say it has been approved or sent |
| E07 | What is wrong with the school plan PLAN-SCH-02? | `check_cost_plan {"plan_id":"PLAN-SCH-02"}` | Result: 3 items (rebased preliminaries, overheads and profit base to confirm, inflation period) | talk about items for review | say "is wrong" or "errors in" |
| E08 | Bring the superstructure rate in PLAN-OFF-01 up to the estimate base date for a London site. | First a question back: which location factors, for the cost data and for the project? Tester: "1.00 to 1.00, not adjusted". Then `rebase_rate {"rate":960,"from_month":"2021-12","to_month":"2026-06","from_location_factor":1,"to_location_factor":1,"nrm1_group":2}` | Result: £1,190 per m² GIFA (£1,190.34) | ask for both factors before calling; say "not adjusted" | invent a London factor |
| E09 | Check these lines: substructure 285 per m2 on 8,400 m2 GIFA, total 2,349,000, estimate base date June 2026, office. | `check_cost_plan` with `lines`, `gifa_m2`, `estimate_base_date`, `building_type` | Result: line total differs from rate x GIFA (£2,394,000), plus missing basis, status and base date | give 2,394,000 and the 45,000 difference | say "approved" |

## Why these nine

They cover each tool's main use, each kind of refusal a cost manager is likely to provoke (a percentage, a future month), the two questions that invite a verdict (E04, E07) and the one that invites an approval (E06), the location factor rule: the tools never assume a factor, so the agent asks (E08) and the inline route (E09).

## Results so far

Server half: all nine pass on every test run (see the test output on the build page). Agent half: to be run in a Copilot Studio test environment; the steps are in `AGENT.md`, section 7.
