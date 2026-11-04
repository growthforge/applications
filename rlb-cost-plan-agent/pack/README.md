# Cost-plan check: an MCP server for Copilot Studio

Read-only tools that take a first pass over a UK elemental cost plan and return items for a cost manager to review. Every figure comes back with a **basis** (where it came from), a **status** (indicative, synthetic, first pass) and a **history** (how it was arrived at). Nothing in the server can approve, edit or send a number.

**Status:** built and tested against the MCP specification and SDK clients (protocol 2026-07-28, and 2025-11-25 era clients); the Copilot Studio connection steps are in `copilot-studio/AGENT.md`. Not deployed. The data is synthetic apart from the ONS price indices.

Prepared by Hemanth Vallamkonda as part of an application to Rider Levett Bucknall. Independent and illustrative; uses public information only.

## What is in the pack

```
pack/
  README.md                 this file
  mcp-server/
    core/                   all the logic, pure JavaScript: no Node, browser or network APIs.
                            The same files run in the server, the tests and the web walkthrough.
    server/                 MCP wiring (SDK v2), Streamable HTTP entry (http.js), stdio entry (stdio.js),
                            demo token check (auth.js), data loading (load.js)
    data/                   ONS indices (real), synthetic benchmarks and sample plans (see data/README.md)
    tools/                  extract_ons.py (ONS workbook to JSON), generate_synthetic.mjs (seeded generator)
    test/                   unit, evaluation, schema and integration tests; curl.sh; inspector.sh
    package.json, package-lock.json, tsconfig.json
  copilot-studio/
    AGENT.md                agent instructions, knowledge, MCP connection, auth, Dataverse, data policies,
                            RICS responsible-AI points, evaluation
    tool-descriptions.md    what the orchestrator reads for each tool
    evaluation.csv / .md    nine conversations: expected tool, arguments, result, refusal or hand-off
    mcp-connector.swagger.yaml   for the custom-connector route
  deploy/                   Dockerfile, Azure Container Apps Bicep, az script. Not deployed.
```

## Tools

| Tool | Input (main fields) | Returns |
|---|---|---|
| `check_cost_plan` | `plan_id` (stored plan) or `lines` + `gifa_m2` + `estimate_base_date` | What was checked (line count, total, a 12-character SHA-256 of the plan), items for review in order (checks, reviews, soft notes), the Table 2.1 build-up, each line with its basis and status |
| `rebase_rate` | `rate`, `from_month`, `to_month`, `from_location_factor` and `to_location_factor` (both required; ratio applied), `series`, `unit`, `nrm1_group` | Rebased figure (display to the pound, value to the penny, unrounded for audit), both index values, ratio, location note, caveats, source and licence |
| `get_benchmark` | `building_type`, `nrm1_group`, `location_factor` (required; the project relative to the national synthetic set), `to_month` | Synthetic low, median and high per m² GIFA, how they were made, rebasing applied |

Resource: `nrm1://group-elements` (NRM 1 group element codes and names only; NRM 1 is copyright RICS).

The checks, in the order a cost manager would want them: arithmetic (rate x GIFA and percentages on their own base, each within £1 of rounding; the plan total within £1 per line of the sum of the lines); missing or vague basis and status; each rate's base date against the estimate base date (the index-only figure is shown, and the suggested rebase leaves the location factors for the agent to ask for); percentage additions whose base needs confirming against the Table 2.1 order (often deliberate, so phrased to confirm), or that have been rebased; inflation counted twice (a rate carried past the estimate base date plus a group 14 allowance, or an allowance that starts before the estimate base date); and last, a soft comparison with the synthetic ranges, made after bringing each rate to the estimate base date with the same index, so the comparison is like for like in time.

Refusals are tool errors (`isError: true`) with a reason and a next step: percentages and percentage-derived groups are never rebased (NRM 1 section 2.10); months outside the published series are refused, because rebasing does not forecast; groups 9 to 14 have no benchmark rate.

## Run it

Node 20 or later (tests were run on Node 22). From `mcp-server/`:

```sh
npm ci
npm test                                   # unit, evaluation, schema and integration tests
MCP_BEARER_TOKEN="$(openssl rand -hex 32)" npm start    # Streamable HTTP on http://127.0.0.1:3000/mcp
npm run start:stdio                        # stdio, for local agents
bash test/curl.sh                          # raw JSON-RPC with curl, both protocol eras
bash test/inspector.sh                     # MCP Inspector CLI 2.13.0 (needs Node 22.19+)
npm run typecheck                          # JSDoc types checked with TypeScript 6.0.3
```

Environment variables for the HTTP server are listed at the top of `server/http.js`: `PORT`, `HOST`, `MCP_BEARER_TOKEN`, `MCP_ALLOW_NO_AUTH` (loopback only), `API_KEY_HEADER`, `ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, `MAX_BODY_BYTES`, `RATE_LIMIT_PER_MINUTE`, `DATA_DIR`.

## Versions (pinned in package-lock.json)

| Package | Version | Role |
|---|---|---|
| `@modelcontextprotocol/server` | 2.4.0 | MCP TypeScript SDK v2, server (implements MCP 2026-07-28; serves 2025-era clients statelessly from the same factory) |
| `@modelcontextprotocol/node` | 2.1.2 | Node request conversion |
| `@modelcontextprotocol/client` | 2.4.0 | test client, modern and legacy modes, HTTP and stdio |
| `@modelcontextprotocol/sdk` | 1.32.2 | test client from the v1 line (2025-11-25 protocol) |
| `typescript` | 6.0.3 | type check of the JSDoc-typed JavaScript |

Tool schemas are plain JSON Schema passed through the SDK's `fromJsonSchema`, so `tools/list` emits exactly what `core/schemas.js` says. Tests check the emitted schemas against the constructs Copilot Studio's MCP troubleshooting page lists (`$ref` inputs filtered, type arrays truncated, integer `exclusiveMinimum` errors, enums read as strings): none is used. The schemas are not all flat: `check_cost_plan`'s optional `lines` is a list of objects, for other clients. For Copilot Studio, plans go by `plan_id`.

## Security boundary

- **Read-only.** No tool writes, approves or sends. All tools are annotated `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.
- **No network calls from tools.** Data is read from disk once at start-up; a test runs every tool with `fetch` disabled and scans `core/` for network and Node imports.
- **Inputs validated twice:** by the SDK against the JSON Schemas, then by the core, which also enforces rules a schema cannot express (one of plan_id or lines, unique line references, percentages not applied to their own group). Size limits: 256 KiB request body, 200 plan lines, 4,000 argument elements, string lengths in the schemas.
- **HTTP checks before the body is read:** Host allowlist (DNS rebinding), Origin allowlist (browser pages), the token, then a rate limit per authenticated principal (a hash of the token), so unauthenticated requests use no allowance and callers behind one address do not share a limit. Client addresses and `X-Forwarded-For` are not used; if an address-based limit is ever added behind Container Apps ingress, `X-Forwarded-For` should be read only when a trusted-proxy setting says the last hop is the platform's proxy.
- **Logs** record method, path, MCP method and tool name, status and duration. Never arguments or results.

## Authentication

Demo and test environments: one or more tokens from `MCP_BEARER_TOKEN` (comma separated, one per test client, each 32 or more characters), compared in constant time, accepted as `Authorization: Bearer` or in the `x-api-key` header (Copilot Studio's "API key, header" option). The server will not start without it unless told to run unauthenticated on a loopback address.

Production, stated plainly: Microsoft Entra ID.

1. Register the server in Entra ID with an application ID URI and a delegated scope (for example `costplan.read`).
2. In Copilot Studio's MCP wizard choose OAuth 2.0, Manual, with the tenant's authorisation and token URLs; register Copilot Studio's callback URL. No dynamic client registration.
3. On the server, validate each token's issuer, **audience (this server's application ID URI)**, scope and expiry; publish OAuth protected resource metadata (RFC 9728), which the SDK can build; never pass the token on.
4. When the plan store becomes a read from SharePoint or the cost system, use the **on-behalf-of** flow so the agent reads only what the signed-in user can read.

## Hosting

See `deploy/README.md`: Azure Container Apps with HTTPS ingress, at least one replica, health probes and the token as a secret; optionally API Management in front for rate limits, JWT validation and tracing. Not deployed.

## Licences and sources

- ONS construction output price indices: Office for National Statistics, Open Government Licence v3.0. Release 13 Aug 2026.
- NRM 1 (RICS, 3rd edition, Oct 2021): group element names and the published rebasing method are referred to; no RICS text is reproduced.
- Code in this pack: MIT. Fonts on the walkthrough page: Montserrat and JetBrains Mono, SIL Open Font License.
