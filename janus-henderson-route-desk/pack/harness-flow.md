# Route Desk harness: the Power Automate flows

Part of the Route Desk build pack prepared by Hemanth Vallamkonda for the AI Enablement Partner application to Janus Henderson. Drafted from public Microsoft documentation; not tested in a Janus Henderson tenant. Names in angle brackets are placeholders.

The harness keeps the model away from decisions. The agent (see `agent-instructions.md`) only collects and clarifies. This flow applies the rules, writes the record, puts a person in front of every route, and routes approvals by tier.

## Where things live
| Item | Location |
|---|---|
| Rules file | `route-rules.json` in the "Route Desk" document library on the Innovation team's SharePoint site. Versioned; the version is written to every register row. |
| Register | The register behind the AI Academy's Use Case Library, if the flow can write to it; otherwise a SharePoint list "AI use case register" (columns in `register-schema.csv`). Either way it doubles as the AI inventory: owner, tier, zone, platform, rules version, review date. |
| Audit log | SharePoint list "Route Desk log": UseCaseId, step, actor, timestamp, outcome, detail. Append only. |
| Unit map | SharePoint list "Units": unit name, AI Business Partner, ATC, Fighter Pilots. |
| Solution | All flows, the agent, connection references and environment variables in one solution in a Zone 2 managed environment; published with IT-admin approval and promoted with pipelines. Data policies allow only the connectors listed in `agent-instructions.md`. |
| Ownership | Business owner named on the solution; a Fighter Pilot as co-owner; connections under a service account, never the Partner's own, so nothing breaks when the Partner rotates. |

## Flow A: "Route Desk: submit idea" (agent flow, called by the agent)

**Trigger:** called from the Copilot Studio agent with `title`, `problemShape`, `answers` (JSON), `matchedPatterns`. The signed-in user is the submitter.

**Steps**
1. **Get the rules.** Get file content of `route-rules.json`; Parse JSON. If the file is missing or does not parse, stop: write "Needs attention" to the log and tell the agent to offer the backup form. Never route on built-in defaults.
2. **Normalise answers.** For each question in the rules file, keep the answer if it is one of the listed options; otherwise use the rules file default. An unknown data answer becomes "unsure", which is tier 3.
3. **Evaluate the rules.** A child flow, "Apply route rules", walks the rules in the file's order and stops at the first match, exactly as the page does:
   - **Option A, no code (default for a Zone 2 build):** each ordered list in the rules file (problem type, tier, route, verdict) becomes a short chain of Condition actions in the child flow, with the thresholds and texts read from the parsed JSON rather than typed into the flow. Changing a threshold means editing the file, not the flow.
   - **Option B, if Technology prefers code:** `engine.mjs` (in this pack, dependency-free JavaScript) hosted by Technology as an Azure Function and called with an HTTP action; the flow contract does not change.
   - Either way the result is deterministic: the same rules version and answers always give the same route, tier and verdict, and the rules version is stored with the row.
4. **Create the register row.** Create item with the idea, answers, hours at stake, suggested route, tier, controls, verdict, rules fired, rules version, status "Triaged", and the submitter, ATC and Partner from the unit map. Generate `UC-` plus a running number.
5. **Return the first view to the agent:** UseCaseId, lane name, tier, verdict and next step. The colleague sees it at once.
6. **Ask the Partner.** Post an Adaptive Card and wait for a response (Teams) to the unit's AI Business Partner, using `route-card.json` with this item's values. Two actions: Confirm route, or Change route (choice of lane plus a required reason).
   - Confirm: set Confirmed route to the suggested route.
   - Change: set Confirmed route and Override reason. Overrides are reported monthly so the rules can be improved.
   - No response in five working days: remind the Partner and copy the ATC.
7. **Route the controls by tier.** For tier 2 and tier 3, start and wait for an approval (Approvals connector, everyone must approve):
   - Tier 2: Technology and the data owner.
   - Tier 3: Technology, AI Governance, Information Security, and Compliance or Risk; plus the Data Protection Officer if personal data; plus Compliance for information barriers if market-sensitive or inside information. The accountable Senior Manager is recorded on the row.
   - Record each approver, decision, date and comment on the row and in the log. A rejection sets status "Parked" with the reason.
8. **Tell the submitter** in Teams: confirmed route, owner, next step, and a link to the row.
9. **Log every step** to the audit list, including the Partner's choice and every approval.

**Failure handling**
- Steps 3 to 9 sit inside a Scope. A parallel branch configured to run after the Scope "has failed" or "has timed out" sets the row to "Needs attention", logs the error and messages the Partner with the UseCaseId.
- If the agent is unavailable, a Microsoft Form with the same ten questions triggers this same flow, so intake never depends on the model.
- Duplicate guard: before step 4, search the register for an open item with the same submitter and title in the last 30 days; if found, return that UseCaseId instead of creating a second row.

## Flow B: "Route Desk: monthly benefit check" (scheduled, first working day of the month)
1. Get register items with status "Live" for 30 days or more.
2. Send each business owner an Adaptive Card: the benefit measure, baseline, agreed floor and last confirmed value; ask for this month's verified value and a note.
3. Write the value to the row. If it is below the floor for two months running, set "Review: retire or rework" and notify the Partner and ATC (the kill criterion).
4. Feed the register to the unit's monthly report and the monthly ATC catch-up: pipeline by status, verified benefit by measure (confirmed by departments), routine adoption tracked separately as a prerequisite, overrides, tier mix, patterns reused.

## Why this shape
- It is the split Microsoft itself recommends: "Predictable approval, record-creation, and notification steps can remain in a deterministic workflow", while the agent handles the conversation ("Compare Copilot Studio agent harnesses", Microsoft Learn, 30 Sep 2026).
- Rules route and people decide, so every route can be explained to Technology, control partners and auditors from the row alone.
- The register is the AI inventory from day one: no separate list to keep in step.
- Ownership survives rotation: the Partner leaves a working solution, a Fighter Pilot who co-owns it and connections that do not belong to the Partner.
