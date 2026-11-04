// policy-close-bypass.bicep: close the gateway bypass the reconciliation found. NOT DEPLOYED.
//
// The ledger found a sandbox deployment billed with no gateway calls: scripts called the endpoint
// directly with a key. Two built-in Azure Policy definitions stop that for every Azure AI services
// resource under the management group (names and IDs as listed on Microsoft Learn, "Built-in policy
// definitions for Foundry Tools", https://learn.microsoft.com/en-us/azure/ai-services/policy-reference,
// read 4 Nov 2026):
//   71ef260a-8f18-47b7-abcb-62d0673d94dc  Azure AI Services resources should have key access disabled
//                                         (disable local authentication)  [Audit, Deny, Disabled]
//   037eea7a-bd0a-46c5-9a66-03aea78705d3  Azure AI Services resources should restrict network access
//                                         [Audit, Deny, Disabled]
// With both in force, the only way in is Microsoft Entra ID from an allowed network: the API
// Management gateway (its managed identity, its subnet or private endpoint). Related built-ins, not
// assigned here: 55eff01b-f2bd-4c32-9203-db285f709d30 "Configure Azure AI Services resources to disable
// local key access" (DeployIfNotExists, to fix existing resources) and d6759c02-b87f-42b7-892e-71b3f471d782
// "Azure AI Services resources should use Azure Private Link" (Audit).
// Trade-off the Learn page states: tools that need key access (Azure OpenAI Studio) stop working, so
// start with Audit in development, then Deny.
// The parameter name 'effect' is the usual one on these definitions; confirm it in the definition
// before deploying. The Bicep CLI was not available where this was written, so it is not compiled.

targetScope = 'managementGroup'

@allowed([
  'Audit'
  'Deny'
  'Disabled'
])
@description('Audit first, then Deny once every caller goes through the gateway.')
param effect string = 'Audit'

var assignments = [
  {
    name: 'ai-no-key-access'
    definitionId: '71ef260a-8f18-47b7-abcb-62d0673d94dc'
    displayName: 'AI resources: key access disabled'
    message: 'Call AI models through the API Management gateway with Microsoft Entra ID, not with a resource key.'
  }
  {
    name: 'ai-restrict-network'
    definitionId: '037eea7a-bd0a-46c5-9a66-03aea78705d3'
    displayName: 'AI resources: network restricted'
    message: 'AI resources accept traffic from the API Management gateway network only.'
  }
]

resource assignment 'Microsoft.Authorization/policyAssignments@2024-04-01' = [for a in assignments: {
  name: a.name
  properties: {
    displayName: a.displayName
    policyDefinitionId: tenantResourceId('Microsoft.Authorization/policyDefinitions', a.definitionId)
    parameters: {
      effect: {
        value: effect
      }
    }
    nonComplianceMessages: [
      {
        message: a.message
      }
    ]
  }
}]
