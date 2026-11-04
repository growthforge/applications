#!/usr/bin/env bash
# Build the image in Azure Container Registry and deploy containerapp.bicep. NOT RUN.
# Needs: az CLI signed in, a resource group, a registry, and a user-assigned identity with AcrPull.
# Usage (from the pack folder):
#   RG=rg-cost-plan-check ACR=myregistry IDENTITY_ID=/subscriptions/.../userAssignedIdentities/id-cpc \
#   MCP_BEARER_TOKEN="$(openssl rand -hex 32)" bash deploy/deploy.sh
set -euo pipefail
: "${RG:?resource group}" "${ACR:?registry name}" "${IDENTITY_ID:?identity resource id}" "${MCP_BEARER_TOKEN:?token, 32+ characters}"
TAG="${TAG:-1.0.0}"
LOCATION="${LOCATION:-uksouth}"

# Build in the registry (no local Docker needed), from mcp-server/ with deploy/Dockerfile.
az acr build --registry "$ACR" --image "cost-plan-check:$TAG" --file deploy/Dockerfile mcp-server

az deployment group create \
  --resource-group "$RG" \
  --template-file deploy/containerapp.bicep \
  --parameters location="$LOCATION" \
               image="$ACR.azurecr.io/cost-plan-check:$TAG" \
               registryServer="$ACR.azurecr.io" \
               registryIdentityId="$IDENTITY_ID" \
               bearerToken="$MCP_BEARER_TOKEN" \
  --query properties.outputs.mcpUrl.value --output tsv
# Paste the printed URL into Copilot Studio (AGENT.md, section 3) with the token as the API key.
