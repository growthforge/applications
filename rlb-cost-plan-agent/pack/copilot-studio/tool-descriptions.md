# Tool descriptions (what the Copilot Studio orchestrator reads)

Copilot Studio's generative orchestration chooses a tool mostly from its description, then its name and its parameter names and descriptions. These are the descriptions the server publishes in `tools/list`. They are written to do three things: say when to use the tool, say what it returns, and say what it does not do, so the orchestrator does not reach for a tool to approve, forecast or judge.

A test (`mcp-server/test/core.test.js`, "docs") fails if this file and the server drift apart.

## Server (the MCP connection in Copilot Studio)

- **Server name:** Cost-plan check
- **Server description (shown to the orchestrator for the whole connection):** Read-only checks for UK elemental cost plans: a first pass over a stored or pasted plan, rebasing a rate to the estimate base date with a published index, and synthetic benchmark ranges. Results are items for the cost manager to review; nothing here approves, edits or sends a figure.

## check_cost_plan

Title: Check a cost plan (first pass)

> Runs a first-pass check of an elemental cost plan (NRM 1 group elements) and returns items for the cost manager to review: line arithmetic, missing or vague basis, rate base dates against the estimate base date, percentage additions whose base needs confirming against the Table 2.1 order or that have been rebased, inflation counted twice, then a soft comparison with synthetic benchmark ranges at the same date. Use plan_id for a stored plan (the route for Copilot Studio); pass lines, a list of line objects, only from clients that need a small ad hoc plan. It echoes the line count, total and a hash of what it checked. Read-only: it does not approve, edit or send anything, and it does not decide whether a cost is right.

Parameters the orchestrator should fill: `plan_id` (for example `PLAN-OFF-01`). **For Copilot Studio, plan_id is the route**: it is a single string, and the server reads the plan and echoes what it checked. The inline route (`lines`, a list of line objects, with `gifa_m2`, `estimate_base_date`, `building_type`, `stated_total`) is for other MCP clients that need a few pasted lines; it has not been tried in Copilot Studio.

## rebase_rate

Title: Rebase a rate to the estimate base date

> Rebases one rate between two months with a published index (ONS construction output price indices by default) using Ra2 = Ra1 x (index2 / index1), then applies the location factors you state, from where the cost data comes from to where the project is (1.00 to 1.00 means not adjusted; ask the user rather than assume). Use it to bring a benchmark or older rate to the estimate base date. It refuses percentage additions (preliminaries, overheads and profit, fees, risk, inflation) and months outside the published series. It does not forecast inflation and it does not give tender prices.

Required: `rate`, `from_month`, `to_month`, `from_location_factor`, `to_location_factor`. Optional: `series` (default `all_new_work`), `unit` (default `per_m2_gifa`), `nrm1_group`. Both location factors are required and no tool output ever suggests one, so the orchestrator has to ask the user for them; the agent instructions tell it to accept "no adjustment" as 1.00 to 1.00 and to say "not adjusted" in the reply.

## get_benchmark

Title: Synthetic benchmark range (soft)

> Returns a synthetic low, median and high range per m² GIFA for one building type and NRM 1 group element (0 to 8), rebased to a month if asked and multiplied by the location factor you state. The data is synthetic, made by a seeded generator to test the agent: it is not RLB, BCIS or market data, and the range is context for a reviewer, not a target or an approval.

Required: `building_type` (office, school, residential, warehouse), `nrm1_group`, `location_factor` (the project's factor relative to the national synthetic set; 1.00 for not adjusted). Optional: `to_month`.

## Resource

`nrm1://group-elements` lists the fifteen NRM 1 group element codes and names. Copilot Studio uses resources only when a tool returns them, so every tool result also carries the group names it refers to.

## What the schemas avoid, and what they do not

Copilot Studio's MCP troubleshooting page lists four schema problems: inputs with `$ref` are filtered out, a `type` given as an array is truncated, an integer `exclusiveMinimum` throws a format error, and enums are read as strings. The schemas here have no `$ref` or `$defs`, one type per property, `minimum` and `maximum` only, and string enums; `test/schema.test.js` checks both the written schemas and the ones the running server emits.

They are not all flat. `check_cost_plan` has one nested input, the optional `lines` list of objects, and the outputs contain nested objects and lists. That is why plan_id is the documented route for Copilot Studio, and why every result also carries its figure, basis and status as text.
