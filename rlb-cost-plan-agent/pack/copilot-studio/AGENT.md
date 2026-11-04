# Cost-plan check agent: Copilot Studio guide

**Status:** the MCP server is built and tested against the MCP specification and SDK clients; the Copilot Studio connection steps are in this guide. Nothing here has been deployed. The data is synthetic apart from the ONS index values.

Prepared by Hemanth Vallamkonda as part of an application to Rider Levett Bucknall. Independent and illustrative; uses public information only.

## 1. What the agent is for

A cost manager or quantity surveyor asks for a first pass over a draft cost plan before it goes further: does the arithmetic hold, does every line say where it came from and when, are the rates at the estimate base date, are the percentage additions built up in the right order and not rebased, is inflation counted once, and how do the rates sit against a benchmark range. The agent answers with items for review. It never approves, edits or sends a figure; the cost manager does that outside the agent, in the cost system or the SharePoint approval flow.

Three tools sit behind it, all read-only, all returning a basis, a status and a history with every figure:

| Tool | Use | Never |
|---|---|---|
| `check_cost_plan` | First pass over a stored plan (`plan_id`) or a few pasted lines | approves, edits, sends, or calls a line wrong |
| `rebase_rate` | One rate to the estimate base date with a published index and stated location factors (cost data and project) | rebases a percentage, forecasts past the published data |
| `get_benchmark` | A synthetic, soft range for one element and building type | gives a target, a market rate or a verdict |

## 2. Create the agent

1. In Copilot Studio, use a **development environment** for the build (see section 8), not the default environment.
2. Create an agent. Name: **Cost-plan check**. Description: *First-pass checks of elemental cost plans for a cost manager to review. Read-only.*
3. Settings, Generative AI: **generative orchestration on**. Copilot Studio requires it for MCP tools.
4. Settings, Knowledge: turn **off** "Allow ungrounded responses", so answers cite a tool result or a knowledge source.

### Instructions (paste into the agent's Instructions box)

```
You help cost managers take a first pass over UK elemental cost plans (NRM 1 group elements).

Figures come only from the cost-plan check tools, never from documents or from memory.
Use check_cost_plan with the plan reference whenever the user names a stored plan.
Use rebase_rate to bring a rate to the estimate base date. It needs two location factors:
where the cost data comes from and where the project is. If the user has not given them,
ask; no tool result will suggest one. If they say there is no adjustment, use 1.00 for both
and say "not adjusted" in your answer. Never invent a location factor for a place.
Use get_benchmark only as context; it also needs the project's location factor (ask, or 1.00). Say the range is synthetic and soft; never call a rate
reasonable, unreasonable, right or wrong on the strength of it.

Every answer that contains a figure states its basis and its status in words, as the tool
gives them (for example "indicative", "synthetic", "first pass").
Present check results as items for review, most significant first. Do not say a plan
has errors; say what the tool found and what the cost manager may want to look at.

When a tool refuses (for example, a percentage cannot be rebased, or a month is after the
latest published index), explain the reason in one or two sentences and give its next step.

You cannot approve, change or send a cost plan, and nothing you say is an approval.
If asked to approve, sign off or send, say so and hand over to the cost manager.
Say at the end of a check that the result is a first pass for the cost manager's review.
```

### Knowledge source

Add the project's **SharePoint** folder of method notes and cost plan narratives (Word and PDF) as knowledge, for questions such as "what does the cost plan exclude". Keep numbers out of knowledge: Microsoft's knowledge guidance warns that agents cannot run code over spreadsheets added as knowledge, so analytical answers from workbooks are unreliable. Cost figures come from the tools. SharePoint knowledge uses the signed-in user's Entra ID permissions, so people only see what they can already open.

## 3. Connect the MCP server

Copilot Studio supports MCP servers over **Streamable HTTP** only, and only with generative orchestration on.

1. Deploy the server to an HTTPS endpoint (section 6). The URL ends in `/mcp`, for example `https://<app>.<region>.azurecontainerapps.io/mcp`.
2. In the agent: **Tools**, **Add a tool**, **New tool**, **Model Context Protocol** (the MCP onboarding wizard).
3. Server name: `Cost-plan check`. Server description: copy it from `tool-descriptions.md`; the orchestrator reads it to decide when to use the server.
4. Server URL: the `/mcp` URL.
5. Authentication, for a test environment: **API key**, type **Header**, header name `x-api-key`. When the connection is created, paste the token that the server was started with (`MCP_BEARER_TOKEN`). The server accepts the token in `x-api-key` or as `Authorization: Bearer`.
6. Create the connection, then open the server's settings page. The three tools and the `nrm1://group-elements` resource should be listed. Leave "Allow all" on, or switch it off and enable the three tools one by one (new tools from the server then stay off until enabled, which is the safer default for production).
7. Open the test panel, ask the first question in `evaluation.md`, and read the **activity map**: it shows the tool chosen, the arguments and the result.

Alternative route: a **custom connector** built from `mcp-connector.swagger.yaml` (Swagger 2.0, `x-ms-agentic-protocol: mcp-streamable-1.0`). Use it if the organisation manages MCP servers as connectors in solutions.

Notes from Microsoft's MCP troubleshooting page: inputs that use `$ref` are filtered out, a `type` given as an array is truncated, an integer `exclusiveMinimum` throws, and enums are read as strings. The schemas avoid all four (no `$ref`, one type per property, `minimum` and `maximum` only, string enums), tested on the schemas the server emits (`mcp-server/test/schema.test.js`). They are not all flat: `check_cost_plan` has an optional `lines` list of objects for other clients. **In Copilot Studio, pass plans by `plan_id`**, a single string; the server reads the plan and echoes its line count, total and hash. Copilot Studio reads resources only through tool output, so every result also carries the NRM 1 group names.

## 4. Authentication for production

The API key is for a test environment. For production:

- Register the server as an application in **Microsoft Entra ID** with an application ID URI (for example `api://cost-plan-check`) and a delegated scope such as `costplan.read`.
- In the MCP wizard choose **OAuth 2.0, Manual**: client ID and secret of a client registration, authorisation and token URLs of the tenant, the scope above. Register the callback URL that Copilot Studio shows on the client registration. Dynamic client registration is deprecated in the current MCP specification and is not needed here.
- On the server, replace the static token check (`server/auth.js`) with JWT validation: issuer is the tenant, **audience is the server's own application ID URI**, the scope is present, the token has not expired. Never pass the incoming token on to another service.
- When the plan store is replaced by a read from SharePoint or the cost system, call it **on behalf of the signed-in user** (Entra on-behalf-of flow), so the agent can never read a plan the user could not open.
- End users sign in with **Authenticate with Microsoft** (Teams, SharePoint, Microsoft 365 Copilot channels), so every conversation has a named user.

## 5. CRM and project records

If the CRM is Dynamics 365 (public sources, including RLB's own job adverts and a Microsoft customer story, say RLB uses it), Dataverse is the supported route: the Dynamics 365 connector in Copilot Studio is marked deprecated. For project and client records, add the **Dataverse MCP server** (Tools, Model Context Protocol, Dataverse MCP Server); it respects Dataverse security roles. A sensible split: Dataverse for who the client is and what stage the project is at, SharePoint for the documents, this server for the cost checks. The Dataverse connection is not part of this pack.

## 6. Hosting

`../deploy/` has a `Dockerfile` and an Azure Container Apps template (`containerapp.bicep` and `deploy.sh`). **Not deployed.** Container Apps gives HTTPS ingress, managed identity and scale-out; keep at least one replica for interactive use so the first call of the day does not wait for a cold start. Set `ALLOWED_HOSTS` to the app's host name. Azure API Management can sit in front for rate limits, JWT validation and request tracing; note that API Management exposes MCP tools but not resources.

## 7. Evaluation

`evaluation.csv` and `evaluation.md` hold nine conversations with the expected tool, arguments and outcome (result, refusal or hand-off). The server side of each one is tested on every run (`mcp-server/test/evaluation.test.js`). In Copilot Studio, create a test set from the CSV and grade with:

- **Tool use** for "did it call the expected tool";
- **Keyword match** for figures that must appear (for example `2,480`);
- **Custom** for refusals and hand-offs, because the General quality grader can mark a correct refusal down.

Answers from the model vary between runs, so judge the pass rate over repeated runs rather than one run.

## 8. Environment and data policies

- Build in a development environment, test in a test environment, promote with a solution. Each environment has its own connection and token.
- Data policies treat the MCP server like a connector: blocking Power Platform connectors as tools also blocks MCP tools. Put the MCP connection, SharePoint and Dataverse in the **Business** group, block non-business connectors and plain HTTP requests in the same policy, and require authentication.
- Trial and developer environments have low generative quotas, so run evaluations in batches.

## 9. Responsible use: how this supports review under the RICS standard

The RICS professional standard on responsible use of AI in surveying practice has been mandatory since 9 March 2026. This design supports a firm's review against it; it is not a certification, and the professional judgement stays with the surveyor.

- **Professional judgement and oversight.** The tools take a first pass. Every result says "for review"; nothing can be approved through the agent.
- **Transparency.** Every figure carries its basis (source, dates, index values, location factors), its status and its history. The agent says when a range is synthetic and when a location is not adjusted, which helps when clients are told how AI was used on their work.
- **Governance and risk.** Read-only tools, a named owner for the server, an evaluation set run on every change, versioned rules (`cost-plan-check rules 1.1`), logs without client data. Risks to record in the firm's register: a model paraphrasing a figure without its status; a stale index release; a synthetic range mistaken for market data; a location factor guessed by a user.
- **Responsible development.** Tests for the arithmetic, the refusals and the schemas; data sources and licences stated; synthetic data labelled with its generator and seed.

## 10. Not built here

- The approval step itself (it belongs in the cost system or a SharePoint approval flow, outside the agent).
- The SharePoint or cost-system reader for real plans, with on-behalf-of identity.
- The Dataverse connection, and a firm's own tender price index (the server takes one as another JSON series; see `mcp-server/data/series/README.md`).

**Next step, given a Copilot Studio trial environment:** connect the server with section 3, record the activity map for the nine conversations in `evaluation.md`, and run the evaluation as a test set.
