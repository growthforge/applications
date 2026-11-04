// Cost-plan check MCP server on Azure Container Apps. NOT DEPLOYED.
// Deploy with deploy.sh (az CLI). Creates a Log Analytics workspace, a Container Apps
// environment and the app, with HTTPS ingress, at least one replica (no cold start for
// interactive Copilot Studio calls), health probes and the bearer token held as a secret.

@description('Azure region, for example uksouth.')
param location string = resourceGroup().location

@description('Name prefix for the resources.')
param name string = 'cost-plan-check'

@description('Full image reference, for example myregistry.azurecr.io/cost-plan-check:1.0.0')
param image string

@description('Registry login server, for example myregistry.azurecr.io')
param registryServer string

@description('User-assigned managed identity resource ID with AcrPull on the registry.')
param registryIdentityId string

@secure()
@description('Token the server expects (32+ characters). For a test environment only; production uses Entra ID (see AGENT.md).')
param bearerToken string

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${registryIdentityId}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        { server: registryServer, identity: registryIdentityId }
      ]
      secrets: [
        { name: 'mcp-bearer-token', value: bearerToken }
      ]
    }
    template: {
      containers: [
        {
          name: 'server'
          image: image
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'MCP_BEARER_TOKEN', secretRef: 'mcp-bearer-token' }
            // The app's own host name, so the server's Host check accepts it.
            { name: 'ALLOWED_HOSTS', value: '${name}.${env.properties.defaultDomain}' }
            { name: 'RATE_LIMIT_PER_MINUTE', value: '120' }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          { name: 'http', http: { metadata: { concurrentRequests: '50' } } }
        ]
      }
    }
  }
}

@description('The URL to paste into the Copilot Studio MCP wizard.')
output mcpUrl string = 'https://${app.properties.configuration.ingress.fqdn}/mcp'
