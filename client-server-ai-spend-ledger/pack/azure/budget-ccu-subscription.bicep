// budget-ccu-subscription.bicep: the Claude Consumption Unit line at meter scope. NOT DEPLOYED.
// Deployed by budget.bicep as a module into the AI subscription. Subscription scope is where an
// action group can be called, and it is enough here because the CCU line sits in one subscription.
// Filter: Marketplace charges in the resource group that holds the Foundry project. The dimension
// names (PublisherType, ResourceGroupName) are the filter names used in Cost analysis; confirm them,
// and that the CCU line is the only Marketplace charge in that resource group, before deploying.
// The ledger then applies the gateway share to report Financial Crime's part of this line.

targetScope = 'subscription'

param startDate string
param amount int
param contactEmails array
param actionGroupId string = ''
param claudeResourceGroup string

var groups = empty(actionGroupId) ? [] : [
  actionGroupId
]

resource claudeCcuBudget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: 'budget-claude-ccu'
  properties: {
    category: 'Cost'
    amount: amount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: '${startDate}T00:00:00Z'
    }
    filter: {
      and: [
        {
          dimensions: {
            name: 'PublisherType'
            operator: 'In'
            values: [
              'Marketplace'
            ]
          }
        }
        {
          dimensions: {
            name: 'ResourceGroupName'
            operator: 'In'
            values: [
              claudeResourceGroup
            ]
          }
        }
      ]
    }
    notifications: {
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: contactEmails
        contactGroups: groups
        locale: 'en-gb'
      }
      actual100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: contactEmails
        contactGroups: groups
        locale: 'en-gb'
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: contactEmails
        contactGroups: groups
        locale: 'en-gb'
      }
    }
  }
}
