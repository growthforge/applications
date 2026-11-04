// budget.bicep: Azure Cost Management budgets for the illustrative organisation. NOT DEPLOYED.
//
// Resource shape checked by hand against the Microsoft.Consumption/budgets template reference on
// Microsoft Learn (API version 2024-08-01; properties amount, category, timeGrain, timePeriod, filter
// with and/dimensions/tags, notifications with enabled, operator, threshold, thresholdType,
// contactEmails, contactGroups, locale; deployable at tenant, management group, subscription and
// resource group scope). The Bicep CLI was not available where this was written, so neither file has
// been compiled; run `az bicep build --file budget.bicep` before use.
//
// Scope. A subscription-scope budget only sees its own subscription, and the organisation's
// owner-tagged resources sit in several (AI, platform, non-production, shared). So the tag budgets
// are deployed at the management group that holds all of them. If your agreement keeps them at a
// billing scope instead (EA department or enrollment, MCA billing profile or invoice section),
// create the same budgets there through the Budgets REST API: Bicep has no handle on billing scopes.
// Action groups only work at subscription or resource group scope, so these notify by email.
//
// What Azure can and cannot see. Budgets filter on tags and billing dimensions, not on the
// gateway's token shares, so:
//   1. one budget per owner tag, for everything that tag carries (an Azure-side backstop);
//   2. one budget on the AI pool tags (the shared AI platform: shared deployment, embeddings, AI Search;
//      and the AI gateway: API Management and its Application Insights), because those resources carry
//      no owner tag and are split between teams only in the ledger;
//   3. one budget on the AI services, by service name (Azure OpenAI, Claude in Foundry, AI Search).
//      The ledger's AI spend is the AI services plus the AI pools. Azure budget filters combine
//      conditions with 'and' only, so that union cannot be one Azure budget: budgets 2 and 3 cover it
//      together (AI Search sits in both), and the all-AI budget in the memo is the ledger's own;
//   4. the Claude line at meter scope in the AI subscription (budget-ccu-subscription.bicep):
//      Claude in Microsoft Foundry arrives as one aggregated Claude Consumption Unit line with no
//      resource tags, so no owner-tag budget sees it.
// Amounts come from the ledger: 115% of the mean of the two months before the budget month, so the
// November budgets use September and October. budget.parameters.json is generated from the same data
// the pages use, and the generator refuses a November budget below October's actual for the AI
// services and for the ledger's AI spend.
//
// Two forecasts. The memo's forecast alert comes from the ledger's driver-based forecast (runs times
// cost per run). The 'Forecasted' notifications below use Azure's own forecast and can fire on a
// different day; keep both. Budgets only alert, about once a day; they never stop spend. The
// gateway's token limits (apim-ai-gateway.policy.xml) are the near-real-time control.

targetScope = 'managementGroup'

@description('First day of the first budget month (must be the first of a month), for example 2026-11-01.')
param startDate string

@description('Who gets the alert emails. At least one address is required at this scope.')
param contactEmails array

@description('Owner-tag budgets: [{ owner: string, amount: int }], monthly, in the billing currency.')
param ownerBudgets array

@description('Monthly amount for the AI pools (resources tagged cost-pool = shared-ai-platform or ai-gateway).')
param sharedPlatformAmount int

@description('Monthly amount for the AI services, by service name (the ledger adds the AI gateway pool to make AI spend).')
param aiServicesAmount int

@description('AI service names, exactly as Cost analysis shows them for your agreement.')
param aiServiceNames array

@description('Subscription that holds the Foundry project whose Claude usage is billed as CCU.')
param aiSubscriptionId string

@description('Monthly amount for the Claude Consumption Unit line.')
param claudeCcuAmount int

@description('Resource group that holds the Foundry project.')
param claudeResourceGroup string = 'rg-ai-prod'

@description('Optional Azure Monitor action group resource ID for the CCU budget (subscription scope only).')
param actionGroupId string = ''

// The same three alerts on every budget: 80% and 100% of actual cost, and 100% of Azure's forecast.
var notifications = {
  actual80: {
    enabled: true
    operator: 'GreaterThanOrEqualTo'
    threshold: 80
    thresholdType: 'Actual'
    contactEmails: contactEmails
    locale: 'en-gb'
  }
  actual100: {
    enabled: true
    operator: 'GreaterThanOrEqualTo'
    threshold: 100
    thresholdType: 'Actual'
    contactEmails: contactEmails
    locale: 'en-gb'
  }
  forecast100: {
    enabled: true
    operator: 'GreaterThanOrEqualTo'
    threshold: 100
    thresholdType: 'Forecasted'
    contactEmails: contactEmails
    locale: 'en-gb'
  }
}

// 1. One budget per owner tag, across every subscription under the management group.
resource ownerBudget 'Microsoft.Consumption/budgets@2024-08-01' = [for b in ownerBudgets: {
  name: 'budget-owner-${b.owner}'
  properties: {
    category: 'Cost'
    amount: b.amount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: '${startDate}T00:00:00Z'
    }
    filter: {
      tags: {
        name: 'owner'
        operator: 'In'
        values: [
          b.owner
        ]
      }
    }
    notifications: notifications
  }
}]

// 2. The shared AI platform pool, split between teams in the ledger by gateway and retrieval shares.
resource sharedPlatformBudget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: 'budget-shared-ai-platform'
  properties: {
    category: 'Cost'
    amount: sharedPlatformAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: '${startDate}T00:00:00Z'
    }
    filter: {
      tags: {
        name: 'cost-pool'
        operator: 'In'
        values: [
          'shared-ai-platform'
          'ai-gateway'
        ]
      }
    }
    notifications: notifications
  }
}

// 3. The AI services, by service name (the dimension name used in Cost analysis; confirm before deploying).
resource aiServicesBudget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: 'budget-ai-services'
  properties: {
    category: 'Cost'
    amount: aiServicesAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: '${startDate}T00:00:00Z'
    }
    filter: {
      dimensions: {
        name: 'ServiceName'
        operator: 'In'
        values: aiServiceNames
      }
    }
    notifications: notifications
  }
}

// 4. The Claude CCU line, deployed into the AI subscription so it can also call an action group.
module claudeCcu 'budget-ccu-subscription.bicep' = {
  name: 'budget-claude-ccu'
  scope: subscription(aiSubscriptionId)
  params: {
    startDate: startDate
    amount: claudeCcuAmount
    contactEmails: contactEmails
    actionGroupId: actionGroupId
    claudeResourceGroup: claudeResourceGroup
  }
}

output budgetNames array = concat(map(ownerBudgets, b => 'budget-owner-${b.owner}'), [
  sharedPlatformBudget.name
  aiServicesBudget.name
  'budget-claude-ccu'
])
