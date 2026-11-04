# FOCUS mapping for the AI spend ledger

Every column the ledger reads or writes, the FOCUS version it comes from, and how the ledger uses it. The organisation and its data are illustrative.

## Versions, plainly

| Version | Status (read 3 Nov 2026) | What the ledger does with it |
|---|---|---|
| FOCUS 1.2 | Azure Cost Management's FOCUS export is documented up to the 1.2-preview dataset (some 1.2 fields not yet populated). | The illustrative export `data/focus_export.csv` is shaped like an Azure FOCUS export: FOCUS 1.2 column names, daily rows, one constant illustrative rate per SKU. It is synthetic, not an export. |
| FOCUS 1.4 | Current specification, ratified 4 June 2026. No token columns. Removes ProviderName and PublisherName. | The ledger normalises every row to FOCUS 1.4 column names (`ledger/normalise.js`). |
| FOCUS 1.5 | Planned for ratification on 3 Dec 2026, so not current. The working draft adds token direction, token cache action and model identity (ModelDeveloper, ModelFamily, ModelId, ModelVersion). | Token fields ride as `x_` extension columns shaped like the draft names, so moving to 1.5 is a rename. |

Sources: FOCUS 1.4 announcement and the 1.5 release scope page (focus.finops.org), Microsoft Learn's FOCUS cost and usage dataset schema.

## Columns from the cost export (FOCUS 1.2 in, FOCUS 1.4 out)

| Column (1.4 name) | In the 1.2 export as | Meaning | How the ledger uses it |
|---|---|---|---|
| BillingAccountId | same | Billing account assigned by the invoice issuer | Carried through |
| BillingCurrency | same | Currency of BilledCost and EffectiveCost | One currency (USD) per view |
| BillingPeriodStart, BillingPeriodEnd | same | Inclusive start, exclusive end of the billing period | Month of the invoice |
| ChargePeriodStart, ChargePeriodEnd | same | Inclusive start, exclusive end of the charge | Daily grain; `x_Date` is the start date |
| ChargeCategory | same | Usage, Purchase, Tax, Credit or Adjustment | All illustrative rows are Usage (no commitments yet) |
| PricingCategory | same | Pricing model (Standard, Committed and so on) | Standard throughout: the commitment call is still to be made |
| HostProviderName | ProviderName | Entity that hosts the service (added in 1.3; ProviderName removed in 1.4) | Takes the 1.2 ProviderName value (Microsoft on every row). Check this for Marketplace rows once Azure's export moves past 1.2-preview |
| ServiceProviderName | PublisherName | Entity that provides the service (added in 1.3; PublisherName removed in 1.4) | Takes the 1.2 PublisherName value: Anthropic for the Claude line, Microsoft for the rest |
| InvoiceIssuerName | same | Entity that issues the invoice | Microsoft for every row: Anthropic usage through Foundry is invoiced by Microsoft |
| SubAccountId | same | Grouping of resources (an Azure subscription here) | Subscription tags for tag inheritance |
| RegionId | same | Region | uksouth |
| ServiceCategory | same | Highest-level classification; "AI and Machine Learning" is an allowed value | Defines AI spend |
| ServiceName | same | The purchasable offering | Labels |
| ResourceId, ResourceName | same | Provider resource identifier and display name | Deployment name for Azure OpenAI lines (the end of ResourceId); the Claude line is matched on ResourceId |
| SkuId, SkuMeter | same | SKU and usage meter | Meter names are parsed into the token extension columns |
| ConsumedQuantity, ConsumedUnit | same | Volume used and its unit (Tokens, CCU, Hours) | Billed tokens for the coverage check |
| PricingQuantity, PricingUnit | same | Quantity in the pricing unit (1M Tokens, 1 CCU, Hours) | Carried through |
| ListUnitPrice, ListCost | same | Published price and quantity times it | Price-sheet check, discount in the reconciliation |
| ContractedCost | same | Negotiated price, before commitment discounts | Equal to BilledCost here |
| BilledCost | same | Cost as invoiced | The source of truth for allocation and reconciliation |
| EffectiveCost | same | Cost with prepaid commitments amortised | Allocated and reported (equals BilledCost until a commitment is bought) |
| CommitmentDiscountId | same | Commitment discount applied, if any | Empty: none bought yet |
| Tags | same | Finalised user and provider tags (JSON) | Owner and cost-pool tags; resource tag wins over inherited ones |
| x_ResourceGroupName | same (Azure extension) | Resource group | Resource group tags for tag inheritance |

## Columns the ledger adds

| Column | Shaped like | Meaning |
|---|---|---|
| x_TokenDirection | FOCUS 1.5 draft TokenDirection | Input or Output (reasoning tokens would carry Output) |
| x_TokenCacheAction | FOCUS 1.5 draft TokenCacheAction | Uncached, Read or Write |
| x_ModelId | FOCUS 1.5 draft ModelId | Model behind the meter, for example gpt-5.4-mini |
| x_ModelDeveloper | FOCUS 1.5 draft ModelDeveloper | OpenAI or Anthropic |
| x_Deployment | ledger extension | Azure OpenAI deployment name |
| x_Team, x_UseCase, x_Environment | ledger extension | Labels from the gateway's metric dimensions |
| AllocatedMethodId | FOCUS 1.3+ column | gateway-token-share, gateway-cost-share, retrieval-call-share, resource-tag, inherited-tag or unallocated |
| AllocatedResourceId | FOCUS 1.3+ column | The billed resource whose cost was split |
| AllocatedTags | FOCUS 1.3+ column | The owner (and use case) the split cost now belongs to |
| x_Owner | ledger extension | Owner after allocation, or "unallocated" |

## Gateway metrics, mapped

The API Management policy emits prompt, completion and total tokens (cached tokens in preview) with four dimensions: team, use-case, environment and deployment. The daily aggregate in `data/token_metrics.csv` becomes FOCUS-aligned estimate rows: one row per token class, `ConsumedUnit` Tokens, `ServiceCategory` AI and Machine Learning, the `x_` columns above, and `ListCost` = tokens times the published list price. These rows never join the bill. They decide each team's share of a billed line and feed the reconciliation.

## What is not modelled

Following the FOCUS 1.5 release scope, these stay outside the ledger: reasoning tokens billed but not returned, input modality (image and audio pricing), context-window-based pricing, priority and batch tiers as separate SKUs, provisioned throughput detail and agentic subcategories. Claude in Foundry arrives as one aggregated CCU line, so its token classes come from the gateway, not the bill.
