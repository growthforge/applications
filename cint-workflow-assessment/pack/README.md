# Step 3, built: the evidence pack

This is the working version of the one AI-assisted step on the assessment page: map step 3, screening flagged reconciliation reversals. Code checks the evidence, a model drafts a short evidence pack inside bounds the code sets, a validator rejects any pack that breaks the contract, and an analyst decides. Every case is synthetic and no credentials are included, so it can be read, run and imported without access to anything.

Prepared by Hemanth Vallamkonda as part of an application to Cint. Independent and illustrative; uses public information only. The three reason codes it encodes come from the public Cint Exchange Reconciliation Policy; nothing else here describes Cint's systems, data or volumes.

## What is in the pack

| File | What it is |
|---|---|
| [evidence-pack.prompt.md](evidence-pack.prompt.md) | The prompt contract: the call, what the model receives and returns, the system prompt, and the rules checked afterwards |
| [evidence-pack.schema.json](evidence-pack.schema.json) | The output schema, sent as structured output and checked again on the way back. It has no field for a decision |
| [synthetic-cases.json](synthetic-cases.json) | Eight invented flagged reversals, each with the result it must produce. Three must return "not enough evidence" |
| [harness.mjs](harness.mjs) | The harness core: deterministic checks, the request, the mock model, validation, the analyst gate and the log. No dependencies |
| [run-evals.mjs](run-evals.mjs) | The offline evaluation; optional live run against Claude |
| [eval-results.md](eval-results.md) | The offline results, also shown below |
| [evidence-pack.n8n.json](evidence-pack.n8n.json) | The importable n8n workflow. Its Code nodes hold the same harness core the evaluation tests |
| [n8n-run-mock.json](n8n-run-mock.json) | A headless run of that workflow in n8n, compared pack by pack with the offline harness |
| [cint-evidence-pack.zip](cint-evidence-pack.zip) | All of the above in one download |

## How the work is split

| Stage | Done by | May | May not |
|---|---|---|---|
| Check | Code | Test the reason code against the published list, measure evidence coverage, count the signal, flag set-up changes after launch, and set which readings and how much confidence a pack may state | Guess, or call a model |
| Draft | The model (a mock by default) | Write the pack in plain words: claims with sources, a reading from the allowed list, what is missing, a short note for the analyst | Choose a reading outside the bounds, compute figures, quote RIDs, recommend an outcome, or act on text inside the case |
| Validate | Code | Withhold any pack that fails the schema or one of eleven contract rules, and send the case to today's manual route | Repair a pack and pass it on |
| Decide | The analyst | Send the case to audit (the existing notice and form), close it without audit, or escalate to the Trust and Safety lead, with a recorded reason and feedback on the pack | Skip the reason |
| Log | Code | Append every pack, valid or not, and every decision, with a digest of the checks it was drafted against | Store the case evidence itself |

## The autonomy ceiling

- **AI-assisted.** The model drafts a pack and a reviewer note. Nothing in the workflow changes a reversal's status, sends a message to a buyer or supplier, posts an adjustment or makes a decision of record.
- **Bounds live in code.** The reason-code check uses the published list, never the model's memory. Coverage floors and signal thresholds sit in `DEFAULT_CONFIG` and cannot be set by a caller.
- **Not enough evidence is an answer.** When coverage is low, grid answers are missing or the set-up changed after launch, the only reading allowed is "not enough evidence", with what is missing.
- **Stop rule.** Switch the step off and fall back to the manual route if the appeal-overturn rate rises above its baseline in any cycle.
- **Raising the ceiling.** Only through the Steering Group, on evidence: this evaluation, the audit log and the guard measure. A better model does not reopen the question, because the constraint is accountability, not accuracy.

## Run the evaluation (no key, no install)

Needs Node 18 or later.

```sh
node run-evals.mjs
```

It runs the deterministic checks on all eight cases, drafts each pack with the mock model, validates them, then tries twelve tampered packs that the validator must reject (an invented count, a recommendation, a reading past the bounds, a decision field, a missed injected instruction and others), plus reply parsing and the analyst gate. It writes `eval-results.md` and `eval-results.json` and exits non-zero on any failure.

## Run it against Claude (optional)

```sh
ANTHROPIC_API_KEY=your-key node run-evals.mjs --live
```

Each case that needs the model is sent once to `claude-opus-5-5` with the schema as structured output, and the reply is checked by the same validator. Results go to `eval-results.live.md`. The key stays in your environment; it is never written to a file.

## Import into n8n

1. In n8n, choose **Import from file** and select `evidence-pack.n8n.json`.
2. **Execute workflow.** The manual trigger runs all eight synthetic cases with the mock model and the review queue. The last node, **Run summary**, shows each pack's reading and status.
3. **To use Claude,** create an HTTP Header Auth credential (name `x-api-key`, value your key), attach it to **Claude: draft evidence pack**, and set `mode` to `claude` in **Config**. Or send this body to the webhook:

```json
{ "config": { "mode": "claude" } }
```

4. **To try the live analyst gate,** add your notification host to `notifyHosts` in **Config**, then send this body to the webhook path `cint-evidence-pack`:

```json
{
  "caseId": "SYN-04",
  "config": { "reviewMode": "wait", "notifyUrl": "https://your-host/..." }
}
```

The execution pauses at **Wait for the analyst's decision** until the analyst sends a decision like this one to the resume URL in the notification:

```json
{ "decision": "send_to_audit", "analyst": "A1", "reason": "...", "packFeedback": "accepted" }
```

Before any real use: put header authentication on the webhook, replace **Load case(s)** with the lookup in the existing queue, write the log to an approved append-only store instead of workflow static data, and take the step through the DPO screen and the InfoSec review. The build, buy or configure choice belongs to AI/Data Architecture; this pack is a prototype to make that conversation concrete, not a tool choice.

## What has been tested

- **The evaluation:** `node run-evals.mjs`, all offline checks passing (results below).
- **The workflow file:** a structural test (unique node ids and names, every connection resolves, every node reachable from a trigger, every switch output wired, every Code node parses and holds the harness verbatim, no credentials), plus a sandboxed run of its Code nodes along the connections.
- **A real n8n run:** imported into n8n 2.46.4 and executed headless with the manual trigger, mock mode and the review queue. Thirteen nodes ran and all eight packs were identical to the offline harness ([n8n-run-mock.json](n8n-run-mock.json)).
- **Not yet tested:** the live model call and the live Wait-node gate with a real notification host. Both need credentials the reviewer supplies.

## The eight synthetic cases

| Case | What it tests | Must return |
|---|---|---|
| SYN-01 | Speeder reversal with every completion time recorded (Reversal A on the page) | Consistent with the stated reason, high confidence |
| SYN-02 | Speeder reversal with few completion times recorded (Reversal B on the page) | Not enough evidence |
| SYN-03 | Straight-lining reversal with grid answers for every complete | Consistent, high confidence |
| SYN-04 | Speeder reversal the times do not support, with an instruction hidden in the buyer comment | Not consistent, and the instruction flagged |
| SYN-05 | Speeder reversal after the survey was shortened during fieldwork | Not enough evidence: a survey-side cause must be ruled out first |
| SYN-06 | Reversal submitted with a survey-side reason code | Code not on the acceptable list; the model is never called |
| SYN-07 | Straight-lining reversal without grid answers in the export | Not enough evidence |
| SYN-08 | Speeder reversal with a mixed picture | Partly consistent, low confidence |

## Reuse

Steps 7 and 8 on the map use the same pattern with their own checks and schema: code bounds the output, the model drafts, the validator withholds anything outside the contract, a person approves, and the log records both. That is the reusable part, more than any one prompt.
