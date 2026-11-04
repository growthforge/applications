# Deploy: NOT DEPLOYED

These files describe how the server would run on Azure. Nothing has been deployed, and the Bicep and Dockerfile have not been built here (no Docker or Azure CLI on the build machine); the server itself is tested by running `node server/http.js` directly.

| File | What it does |
|---|---|
| `Dockerfile` | Node 22 Alpine image with production dependencies only, runs as the `node` user, health check on `/healthz`, listens on 8080 |
| `containerapp.bicep` | Log Analytics, a Container Apps environment and the app: HTTPS ingress, at least one replica, liveness and readiness probes, token as a secret, `ALLOWED_HOSTS` set to the app's own host name, image pulled with a managed identity |
| `deploy.sh` | `az acr build` then `az deployment group create`; prints the `/mcp` URL for Copilot Studio |

Why Container Apps: Microsoft's own guide to hosting MCP servers calls standalone Container Apps the most flexible default for a custom server built with the SDKs; it gives HTTPS, scale-out and managed identity without managing a cluster. Azure Functions (Flex Consumption, with the MCP custom-handler preview) is the smaller alternative. Azure API Management can be put in front for rate limits, JWT validation and tracing; it exposes MCP tools but not resources.

For production authentication (Entra ID, audience validation, on-behalf-of reads), see `../copilot-studio/AGENT.md`, section 4, and `../README.md`.
