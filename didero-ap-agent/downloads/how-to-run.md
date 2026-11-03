# AP invoice and PO-chasing agent: how to run it in n8n

Prepared by Hemanth Vallamkonda as part of an application to Didero. Independent and illustrative. Synthetic data only: no real company, supplier, bank detail or credential is included.

## What it does
Reads the morning's supplier emails for a fictional manufacturer, decides what to do with each one, and runs the PO-chasing job:
- **Acts alone only on low-risk items:** a clean three-way match under the supervised limit is marked ready for the payment run; an on-time acknowledgement updates the PO; a duplicate is blocked; an auto-reply is ignored.
- **Everything else waits for a person**, with specific resolutions to choose from (for example: ask for a credit note, hold until the goods receipt, callback on the number on file).
- **Never releases a payment and never changes bank details.**

Claude or the parser reads each email; written rules decide; a person approves anything risky. The rules are the same code as `agent/core.mjs` (inlined into the Code nodes).

## Requirements
- n8n 2.46.4 (tested). It needs Node.js 24 or later; on Node 22 the launcher refuses to start.
- On macOS, `npm install n8n@2.46.4` currently fails on a Linux-only optional binary (`@napi-rs/canvas-linux-arm64-musl`); `npm install n8n@2.46.4 --force` installs it. Docker or n8n Cloud avoid this.

## Import
- **Editor:** Workflows, Import from file, choose `didero-ap-agent.n8n.json`.
- **CLI:** `n8n import:workflow --input=didero-ap-agent.n8n.json`, then `n8n list:workflow` for the id.

## Run it (mock mode, queue approvals)
- **Editor:** open the workflow and select Execute workflow. The last node, "Audit log and metrics", shows every outcome and the full audit trail.
- **CLI:** `n8n execute --id=<id> --rawOutput`.
Expected: 26 items (21 emails and 5 chase tasks); 7 handled by the agent alone; 19 waiting for a person; the look-alike-domain invoice held as possible payment fraud.

## Live approvals (approvalMode "wait")
1. **Protect the webhook.** It uses header authentication: create an HTTP Header Auth credential (for example header `x-agent-key` with a long random value) and attach it to "Run the agent (webhook)". Without it n8n refuses every call (403 in the test).
2. **Set the approval endpoint as the workflow owner**, never per call: in the Config node, or as `DIDERO_NOTIFY_URL` and `DIDERO_REPORT_URL` in the n8n environment (reading them needs `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`). Both must be on a host in `allowedCallbackHosts`.
3. Start n8n with `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (random approval tokens) and publish the workflow (`n8n publish:workflow --id=<id>`).
4. POST `{"config": {"approvalMode": "wait"}}` to the webhook with the header. Callers can choose only `mode` and `approvalMode`; anything else in the body (thresholds, endpoints) is ignored.
5. For each item the workflow POSTs `{itemId, summary, options, approvalToken, resumeUrl, ...}` to the approval endpoint and waits. Answer by POSTing `{"token": "<approvalToken>", "resolution": "<one option id>", "by": "name", "note": "..."}` to `resumeUrl` (n8n signs it). A wrong token or an option that was not offered is ignored and logged.
6. The run report goes to the report endpoint.
`tests/hitl-live.mjs` in the source does all of this with a scripted approver, and also checks that a call without the header is refused and that a body trying to redirect approvals is ignored.

## Use Claude instead of the parser
1. Create an HTTP Header Auth credential with header name `x-api-key` and your Anthropic API key; attach it to the "Claude: classify and extract" node.
2. In the Config node set `mode` to `claude` (or send it in the webhook body).
The request uses structured outputs (`output_config.format` with a JSON schema) on `claude-opus-5-5` at low effort, with `anthropic-version: 2026-10-21`. A refusal, truncation, invalid JSON or a schema mismatch becomes "could not read reliably", which always goes to a person.

## Why the same rules sit in six Code nodes
n8n passes only JSON between nodes, and a portable workflow cannot load a shared module (on n8n Cloud, Code nodes can load only `crypto` and `moment`). Each Code node therefore carries the same rules library, generated from one source file (`agent/core.mjs`) by `tools/build-workflow.mjs`, so the copies cannot drift and each node can be read on its own. On self-hosted n8n the library could be packaged as a module instead.

## Change the rules
Thresholds are in `DEFAULT_CONFIG` at the top of the Code nodes (the same in each; change `agent/core.mjs` and rebuild, or edit every copy): price tolerance (2% and 50 pounds per line), supervised limit, acknowledgement lateness tolerance, trust-ramp stage (`shadow`, `supervised`, `autonomous`). The chase cadence (48 hours, then 24, three attempts, then the buyer) is in the data's `policy` block.
