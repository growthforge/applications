# AI spend ledger: the pack

A working AI spend ledger on illustrative data for a made-up FinTech running on Azure. It meters AI usage at the gateway, takes the Azure cost export as the source of truth, reconciles the list-price estimate to the bill, allocates every billed dollar to an owner (or leaves it visibly unallocated), and turns the month into budgets, alerts, unit economics, a scale, fix or stop decision per AI use case and a savings pipeline. Prepared by Hemanth Vallamkonda as part of an application to a global FinTech via Client Server. Independent and illustrative; uses public information only.

Nothing in this pack has been deployed to Azure. The organisation, its usage, its outcomes and its bill are synthetic. Token prices are published list prices with their source and read date on every row.

## Run it

Needs Node 20 or later. No dependencies.

```sh
node --test                          # the engine's tests, hand-computed fixtures plus checks on the data
node tools/generate-data.mjs         # rebuild data/ from the fixed seed (byte-identical output)
```

To use the engine in your own script:

```js
import { loadData } from './ledger/node-load.js';
import { buildLedger } from './ledger/index.js';
const L = buildLedger(loadData());
console.log(L.ue['2026-10']['kyc-review'].costPerSuccess);
```

## What is here

| Path | What it is |
|---|---|
| `data/focus_export.csv` | Shaped like an Azure Cost Management FOCUS export (synthetic): daily rows, FOCUS 1.2 column names, one constant illustrative rate per SKU, Azure OpenAI meters per token class, one aggregated Claude Consumption Unit line, the cloud estate |
| `data/token_metrics.csv` | Daily aggregates of the gateway's token metric by subscription, team, use case, environment and deployment |
| `data/outcomes.csv` | Daily runs, successes, failures, retries, discards and review minutes per use case |
| `data/prices.json` | List prices per model and token class (USD per 1M tokens), each with source id, effective date and read date; batch, cache and CCU rules |
| `data/value.json` | Illustrative value per successful outcome, with the assumption written out, and each owner's quality bar |
| `data/levers.json` | The savings levers: scope, order, eligible share, effect, evidence kind, quality gate, owner, status |
| `data/org.json` | Owners, use cases, gateway wiring, allocation rules, budget and decision thresholds |
| `data/vm_utilisation.csv` | Illustrative monthly CPU and memory figures for the rightsizing lever |
| `ledger/` | The engine: pure ES modules that run in Node and the browser |
| `ledger/tests/` | `node --test` suites |
| `azure/apim-ai-gateway.policy.xml` | API Management policy: `llm-token-limit` (soft in production, hard outside) and `llm-emit-token-metric` with team, use-case, environment and deployment dimensions |
| `azure/kql/` | Log Analytics queries: tokens by team, cost per outcome, the production soft quota alert |
| `azure/budget.bicep`, `azure/budget-ccu-subscription.bicep`, `azure/budget.parameters.json` | Management-group budgets per owner tag, for the shared pool and for all AI, plus the Claude CCU line at meter scope in the AI subscription; 80% and 100% actual and 100% forecast alerts; amounts generated from the ledger |
| `azure/focus-mapping.md` | Every column, its FOCUS version and definition, and the `x_` columns shaped like the FOCUS 1.5 draft |
| `tools/generate-data.mjs` | The seeded generator |

## The rules the engine follows

1. The invoice is the source of truth. Only BilledCost and EffectiveCost from the export are allocated. Gateway counts decide each team's share of a billed line and check the bill; they never add cost.
2. Cost per successful outcome counts every run: failed, retried and discarded runs were billed too.
3. Budgets are 115% of the mean of the two prior months, with alerts at 80% and 100% of actual and 100% of forecast; the forecast is driver-based (runs times cost per run), with a trailing mean as a cross-check.
4. Levers run in sequence on the cost left by the ones before; a saving never exceeds its eligible cost; each has an evidence grade (measured, assumption-based, Foundation prior) and a next-bill check on unit cost.
5. Scale, fix or stop compares avoidable cost per successful outcome (what stops if the use case stops; a fixed shared tier does not) with an illustrative value per outcome and the owner's quality bar; thresholds live in `data/org.json`.
6. A lever is validated or realised only on measured evidence; assumption-based and prior levers stay identified.

## Sources

Prices: Anthropic's pricing page (platform.claude.com/docs/en/about-claude/pricing) and the Azure Retail Prices API (prices.azure.com, Foundry Models, UK South), read 3 November 2026. Method: FinOps Foundation working-group papers on token economics and token pricing, the FinOps Framework maturity model, the FOCUS specification and release-scope pages, and Microsoft Learn pages for Cost Management budgets, the FOCUS export schema and the API Management `llm-token-limit` and `llm-emit-token-metric` policies.

Licence: MIT for the code. The data is synthetic.
