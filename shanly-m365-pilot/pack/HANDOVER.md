# Handover note for the IT Manager

Status: a design for Microsoft 365, with the date logic built and tested (`engine/`, 29 tests) and every JSON file validated against Microsoft's published schemas (`CHECKS.md`). Nothing has been imported into a tenant and no flow has been run. This note is written so that IT, or an external partner, can review the design, run it in a test site, support it and switch it off.

The Complaints Team's reading of the code governs over this tool. Where the tool and the team's judgement differ, the team is right and the tool is changed.

## What each part does

| Part | File | What it does | Who touches it |
|---|---|---|---|
| Complaints register | `sharepoint/complaints-register.site-script.json` | A SharePoint list with one row per complaint: dates received and started, code version, two-year window, the four published due dates (calculated columns), when each letter was sent, owner, an append-only activity log | The Complaints Team, daily |
| Due-date labels | `sharepoint/due-date.*.column-format.json` | Shows each due date with a text label and colour: On track, Due soon, Overdue, Sent, Sent late, Not needed | Nobody: display only |
| Bank holidays | same site script, "UK bank holidays" list | England and Wales bank holidays, used to find working days | One named person, once a year |
| Optional regional settings | `sharepoint/uk-regional-settings.site-script.json` | Sets the site to UK time, English (United Kingdom) and 24-hour time | IT, once, only if the site is not already set |
| Intake flow | `power-automate/FLOWS.md`, Flow 1 | New email in the shared mailbox: works out the initiation date, asks a coordinator in Teams to confirm the type, logs it | Runs by itself; the coordinator answers the card |
| Daily clock | Flow 2 | 07:30 each weekday: reminders, escalation, next update date, a "clock ran" message | Runs by itself |
| Letter approval | Flow 3 | A letter marked "Ready for approval" gets its dates from the register, a named approval, then is sent from the shared mailbox and recorded | The coordinator starts it; the approver approves |
| Teams cards | `teams/confirm.card.json`, `teams/reminder.card.json` | The confirmation question and the reminder | Nobody: used by the flows |
| Drafting prompt | `copilot/drafting-prompt.md` | Phase 1: Copilot in Outlook drafts a letter with date placeholders; a person checks it | The Complaints Team |
| AI triage (phase 2, optional) | `ai/triage-prompt.md`, `ai/output-schema.json` | An AI Builder prompt that pre-fills the confirmation card | Only after a DPIA and a licensing decision |
| Date rules | `engine/clock.js`, `engine/clock.test.mjs` | The published rules as tested code: the reference the flows were checked against | IT or a partner, when a rule changes |

Phase 1 uses only the Office 365 Outlook, SharePoint, Microsoft Teams and Approvals connectors, all classed as Standard in Power Automate (connector references, read 3 Nov 2026: https://learn.microsoft.com/en-us/connectors/office365/, https://learn.microsoft.com/en-us/connectors/sharepointonline/, https://learn.microsoft.com/en-us/connectors/teams/, https://learn.microsoft.com/en-us/connectors/approvals/).

## Ownership

- **Service account.** All connections use a service account, not a person's account, so the flows keep working when people change roles. Exchange Online needs Full Access and Send As on the complaints shared mailbox for that account; Microsoft's Exchange documentation describes both and says both are needed for normal shared mailbox use (read 3 Nov 2026: https://learn.microsoft.com/en-us/exchange/collaboration-exo/shared-mailboxes). The Office 365 Outlook connector reference notes that new permissions can take about two hours to replicate.
- **At least two co-owners** on each flow (for example the IT Manager and the Complaints Team lead). Microsoft sends per-run failure alerts to owners and co-owners, never to environment or tenant admins (read 3 Nov 2026: https://learn.microsoft.com/en-us/power-automate/understand-flow-failure-notifications).
- **A solution in a non-default environment.** The three flows, their connection references and environment variables (site URL, mailbox, coordinator, team lead, approver, Teams channel) live in one solution, in an environment created for this purpose, so they can be moved from test to production as a unit and kept apart from personal flows.
- **Managed environment, if licensed.** Microsoft describes Managed Environments as a suite of premium governance capabilities (data policies, sharing limits, usage insights, solution checker and more), included as an entitlement with standalone Power Apps, Power Automate, Copilot Studio, Power Pages and Dynamics 365 licences (read 3 Nov 2026: https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-overview). If the Group already has those licences, use one; phase 1 does not otherwise need them. Confirm with the licensing partner.
- **Idle flows.** Microsoft notes that a cloud flow not triggered for 90 days might be turned off, with owners and co-owners notified 30 days before (read 3 Nov 2026: https://learn.microsoft.com/en-us/power-automate/limits-and-config). The daily clock runs every weekday; the intake and approval flows run whenever there is work, so this matters only if the mailbox goes quiet for three months.

## Data policies (DLP)

- Create a data policy for the environment with Office 365 Outlook (listed as Microsoft 365 Outlook), SharePoint, Microsoft Teams and Approvals in the **Business** group. Connectors in different groups cannot be used together in one flow; these four are on Microsoft's list of connectors that data policies cannot block, and can be classified as Business or Non-Business (read 3 Nov 2026: https://learn.microsoft.com/en-us/power-platform/admin/dlp-connector-classification).
- No HTTP connector, custom connector or third-party connector is needed. Leave them out of the Business group or block them.
- Microsoft notes that policy changes usually take effect within an hour and can take up to 24 hours (read 3 Nov 2026: https://learn.microsoft.com/en-us/power-platform/admin/wp-data-loss-prevention).

## Permissions

- **Register:** on a Complaints Team site, or with permissions on the list restricted to a "Complaints Team" SharePoint group. The service account has Edit. Nobody outside the team needs access; IT holds Owner for support.
- **Bank holidays list:** read for the team; edit for the person who does the yearly refresh and for the service account.
- **Shared mailbox:** Full Access and Send As for the service account; the team keeps the access it has today.
- **Teams:** the confirmation card goes to the coordinator's chat with the Flow bot (or to the team channel if the team prefers); reminders go to the complaint's owner; escalations go to the team lead. The Workflows app must be allowed in the Teams admin centre (Microsoft Teams connector reference, read 3 Nov 2026).

## Personal data and retention

- Complaints can contain health, disability or vulnerability details, as well as names, addresses and contact details. The register keeps only what the process needs: identity and contact, development and plot, dates, a short note of the issues, and the activity log. The emails themselves stay in the shared mailbox.
- The Teams cards carry the start of the email and the customer's name. Keep them to the coordinator, owner and team lead rather than wide channels, and apply the Group's Teams retention settings to them.
- Flow run history keeps the inputs and outputs of each run for 30 days (read 3 Nov 2026: https://learn.microsoft.com/en-us/power-automate/limits-and-config). Turn on **Secure inputs** and **Secure outputs** on the actions that handle email text, so it is not visible in run history or audit logs (read 3 Nov 2026: https://learn.microsoft.com/en-us/power-automate/guidance/coding-guidelines/use-secure-inputs-outputs-triggers).
- **Retention.** Microsoft documents applying retention labels to SharePoint list items, and default labels for libraries, folders and document sets (read 3 Nov 2026: https://learn.microsoft.com/en-us/purview/create-apply-retention-labels). Choose with the DPO whether register items get a retention label or are covered by a retention policy on the site. The period should match the records the code requires the Group to keep: agree the period with the Complaints Team and the DPO rather than taking a number from this note.
- **Versioning.** The activity log column is append-only. SharePoint applies append-only only when versioning is enabled on the list (Field element reference, read 3 Nov 2026: https://learn.microsoft.com/en-us/sharepoint/dev/schema/field-element-field). The site script cannot switch versioning on; check List settings > Versioning settings after import.

## Before any AI step

- **Phase 1 (Copilot in Outlook drafting):** the team uses Copilot on customer emails. IT and the DPO confirm this is within the Group's Copilot policy and its data protection records before the trial starts.
- **Phase 2 (AI Builder prompt in the intake flow):** a data protection impact assessment comes first, then a licensing decision. Microsoft states that "a Power Automate flow that uses any AI Builder action is a premium flow" needing Power Automate premium licensing, and that prompts consume AI Builder credits or Copilot Credits (read 3 Nov 2026: https://learn.microsoft.com/en-us/ai-builder/administer-licensing). From 1 November 2026 new or renewed licences no longer include seeded AI Builder credits (read 3 Nov 2026: https://learn.microsoft.com/en-us/ai-builder/endofaibcredits).
- Neither phase lets AI set a date, send a message or decide that an email is not a complaint.

## When something goes wrong

| What happens | How you notice | What to do |
|---|---|---|
| A flow fails | The daily clock's "Catch" message in the team channel, or no "clock ran" message by 08:00; per-run failure email for known problems such as an expired connection (Microsoft sends these only for known, fixable causes, then not again for the same flow for 28 days, and they are not on for every flow by default) | Open the run from the link, fix the cause and run the flow again. Check the register for anything due today by hand. |
| The service account's connection expires (for example after a password or MFA change) | Per-run failure email; flows fail at the first connector step | Re-authenticate the connection reference in the solution. |
| Nobody answers the confirmation card | The intake flow logs the email as a complaint after 8 hours and says so in the channel | A person confirms or corrects the type in the register. |
| The bank-holiday list is not refreshed for the new year | The "Upcoming" view is empty or ends early | Refresh it (next section). A missing holiday makes the flows treat that day as a working day, so dates come out a day early, never late. |
| The code or the published timescales change | Notice from the New Homes Quality Board or a change to the published process | Change `engine/clock.js` and its tests first, then the CodeVersion choices, the calculated columns, the formatters and the flow expressions; run `node --test engine/clock.test.mjs` and the pack validator (see `CHECKS.md`), which checks that they agree with the engine. |
| A mailbox rule moves mail out of the Inbox before the flow sees it | Complaints in the mailbox with no register row | Agree that no rule moves complaints mail, or point the trigger at the folder the rule uses. During the trial, compare mailbox and register counts weekly. |
| The same email is logged twice | Two rows with the same SourceEmailId | The intake flow's duplicate check prevents this; if it happens, delete the newer row and check the check. |
| A letter is approved but the email fails to send | LetterStatus "Returned for changes" and a channel message | Nothing was recorded as sent. Fix the cause and set LetterStatus to "Ready for approval" again. |

## Yearly bank-holiday refresh

- **When:** each autumn, for the year after next; one named owner with a calendar reminder.
- **Source:** https://www.gov.uk/bank-holidays.json (the "england-and-wales" section). GOV.UK content is available under the Open Government Licence v3.0 (gov.uk/bank-holidays, read 3 Nov 2026).
- **How:** copy the new dates into the "UK bank holidays" list by hand or in grid view (Title: the holiday name; HolidayDate: the date). No connector, flow or premium licence is involved. Refresh `engine/bank-holidays-england-wales.json` at the same time and run the engine tests.
- **Coverage now:** the list ships empty; load the dates from the engine file, which runs to the end of 2028. It covers England and Wales only. If any team or development works to another UK nation's holidays, the Complaints Team decides which list applies.

## Applying the SharePoint script

1. In a test site first. Optional: run `uk-regional-settings.site-script.json` before the register script if the site is not already on UK settings (time zone ID 2, the GMT zone in Microsoft's example; locale 2057, English (United Kingdom); sort order 25, General; 24-hour time).
2. Register the script with `Add-SPOSiteScript` and a site template with `Add-SPOSiteDesign`, then apply it with `Add-SPOSiteDesignTask` or **Settings** > **Apply a site template**. Do not use `Invoke-SPOSiteDesign`: Microsoft limits it to 30 actions, and this script has 46; asynchronous application allows 300 actions or 100,000 characters (read 3 Nov 2026: https://learn.microsoft.com/en-us/sharepoint/dev/declarative-customization/site-design-overview).
3. After it runs: rename the Title column to "Reference" (List settings), check versioning is on, check the four views and the due-date labels, and load the bank holidays.
4. Rerunning the script is safe: field IDs are fixed, and Microsoft describes reruns as updating the existing list rather than duplicating it (read 3 Nov 2026: https://learn.microsoft.com/en-us/sharepoint/dev/declarative-customization/site-design-json-schema).
5. Any new view that shows a due-date column must also include InitiationDate, Stage and the matching Sent column: SharePoint passes only the view's fields to a column formatter (read 3 Nov 2026: https://learn.microsoft.com/en-us/sharepoint/dev/declarative-customization/formatting-syntax-reference). the pack validator (see `CHECKS.md`) checks this for the views in the script.

## How to switch it off

1. Turn off the three flows. Microsoft notes that no new runs start once a flow is off, and runs already in progress continue until they finish (read 3 Nov 2026: https://learn.microsoft.com/en-us/power-automate/limits-and-config). Cancel any waiting approvals or cards in run history if needed.
2. The register stays as it is, as a record of what was logged and sent. Nothing else depends on it.
3. The Complaints Team works by hand exactly as before: the mailbox, letters and process are unchanged by switching off.
4. Later, if the pilot is not kept: export the register, apply the agreed retention, then remove the lists and the solution.

## Contacts (to complete in week 2)

- Business owner: Complaints Team lead, [name]
- Technical owner: IT Manager, [name]; external partner, [name]
- Flow co-owners: [names]
- Bank-holiday refresh owner: [name]
