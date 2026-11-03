# Complaints clock: Microsoft 365 pilot build pack

Independent work by Hemanth Vallamkonda for an application to Shanly Group. It is not affiliated with Shanly Group or Shanly Homes, uses no Shanly materials, and none of these files are Shanly's. The rules it follows are the ones Shanly Homes publishes for customers:

- https://www.shanlyhomes.com/buying-with-us/customer-care (read 3 Nov 2026)
- https://www.shanlyhomes.com/buying-with-us/new-homes-quality-code (read 3 Nov 2026)

**Status:** designed for Microsoft 365; the date logic is built and tested here (29 engine tests pass), and every JSON file is validated against Microsoft's published schemas. It has not yet been imported into a tenant, and no flow has been built or run in Power Automate. The Complaints Team's reading of the code governs over the tool.

## What it is

A small set of Microsoft 365 parts that keeps the dated commitments in the published formal complaints process in view:

- the complaint initiation date, "the first working day after a complaint is received", with weekends and public holidays excluded;
- acknowledgement within 5 calendar days, a proposed pathway within 10, a full assessment within 30, next steps if unresolved after 56, then updates at least every 28 days;
- the two-year window from reservation or legal completion, whichever is later, and which code applies by reservation date.

The dates come from rules, never from AI. People decide: a coordinator confirms every email's type in Teams, and a named approver approves every letter before it is sent. In phase 1, AI (Copilot in Outlook) only drafts letters with date placeholders; phase 2 adds an optional AI Builder reading of each email, after a data protection impact assessment and a licensing check.

It sits beside the customer portal for aftercare (Clixifix) rather than replacing it. If the team already tracks these dates, the same method can move to another process.

## The order to use it in

1. **This README**, then `HANDOVER.md` (what each part does, ownership, security, retention, failure modes, how to switch it off).
2. **The rules:** `engine/clock.js` and its tests. Run `node --test engine/clock.test.mjs` (Node 18 or later).
3. **The checks:** `CHECKS.md` lists the automated checks run on this pack and their latest results (the validator itself stays with the source files). It validates every JSON file against Microsoft's schemas and checks the files against each other and against the engine. 
4. **SharePoint, in a test site:** `sharepoint/uk-regional-settings.site-script.json` (optional), then `sharepoint/complaints-register.site-script.json`. Apply it asynchronously (`Add-SPOSiteDesignTask` or **Apply a site template**), because `Invoke-SPOSiteDesign` is limited to 30 actions and this script has 46. Then follow the after-import checks in `HANDOVER.md`.
5. **Power Automate:** build Flow 1, then 2, then 3 from `power-automate/FLOWS.md`, using `teams/confirm.card.json` and `teams/reminder.card.json`.
6. **Copilot:** save and share `copilot/drafting-prompt.md` with the Complaints Team.
7. **The trial:** `TRIAL_PLAN.md`, if the Group chooses to try it.
8. **Phase 2 only:** `ai/triage-prompt.md` and `ai/output-schema.json`, after the DPIA and licensing decision.

## Files

| Path | What it is | How it was checked |
|---|---|---|
| `README.md` | This file | Review |
| `HANDOVER.md` | Support note for the IT Manager | Review; every Microsoft claim cited with the date read |
| `TRIAL_PLAN.md` | Seven-week trial, measures to agree, five-person usability test | Review |
| `engine/clock.js` | The published rules as pure functions | 29 tests in `engine/clock.test.mjs` |
| `engine/clock.test.mjs` | The tests, worked out by hand from the published rules | `node --test` |
| `engine/bank-holidays-england-wales.json` | England and Wales bank holidays 2019 to 2028 from GOV.UK (Open Government Licence v3.0) | Used by the tests |
| `sharepoint/complaints-register.site-script.json` | Site script: "Complaints register" (32 columns, four calculated due dates, four views, four formatters) and "UK bank holidays" | Microsoft site script schema; field XML, GUIDs, CAML, view fields and offsets checked |
| `sharepoint/due-date.ack.column-format.json`, `.pathway.`, `.assessment.`, `.nextsteps.` | Column formatters for the four due-date columns (also embedded in the site script) | Microsoft column formatting schema (v2); colour contrast; identical to the embedded copies |
| `sharepoint/uk-regional-settings.site-script.json` | Optional: sets the site to UK time zone, locale and 24-hour time | Microsoft site script schema |
| `teams/confirm.card.json` | Adaptive Card 1.4: the coordinator confirms the type and facts | Adaptive Card schema, with and without sample values; version 1.4 features only |
| `teams/reminder.card.json` | Adaptive Card 1.4: due soon or overdue reminder with a link to the item | As above |
| `power-automate/FLOWS.md` | Recipes for the intake, daily clock and letter approval flows, with every expression mapped to an engine function and test | Test names and functions checked; flow rules modelled against the engine |
| `copilot/drafting-prompt.md` | Phase 1 saved prompt for drafting letters in Outlook | Review |
| `ai/triage-prompt.md`, `ai/output-schema.json`, `ai/eval/` | Phase 2 AI Builder prompt, its output contract and a smoke test on illustrative emails | Output schema checked as draft-07; smoke test reported separately |
| `CHECKS.md` | The automated checks and their latest results | All passed on 3 Nov 2026 |

## Judgement calls worth knowing

- **Four small formatters, not one.** A column formatter cannot tell which column it is on, so each due date has its own short file that reads its own Sent column. Each works out its date from InitiationDate rather than from the calculated column, so it does not depend on how SharePoint passes calculated values to formatters.
- **"Due soon" in the list is an approximation.** The list's label turns to "Due soon" two calendar days before the due date. The engine and the daily reminder use two working days before the suggested send-by date, including bank holidays. Act on the reminder; the colour is a quick cue.
- **The send-by date is a suggestion.** A due date that falls on a weekend or bank holiday moves to the working day before. The published rule is the due date itself.
- **Display names equal internal names** (for example `InitiationDate`), so formulas, formatters and flows all refer to the same name. Rename display names after import if the team prefers; the internal names stay the same.
- **Title holds the reference.** Site scripts cannot rename the Title column; rename it to "Reference" in List settings after import.
- **A few extra columns** beyond the brief: LastUpdateSent (to chain the 28-day updates from the letter that actually went), LetterToSend, LetterDraft and LetterStatus (to start the approval flow from the register), and SourceEmailId (to stop the same email being logged twice).

## What has not been verified

These need a test tenant and are listed as week 2 checks in `TRIAL_PLAN.md`:

- Import of the site script and the behaviour of the calculated columns, views and formatters in a real list.
- The exact field paths in the Teams card response and the AI Builder output, which Microsoft documents as dynamic.
- That pasted `@{...}` expressions in the card JSON are recognised as expressions by the designer.
- `addToTime()` on 29 February (the engine moves it to 28 February), and the Recurrence trigger's behaviour when the clocks change.
- How SharePoint returns date-only values to Power Automate (the recipes convert to UK time so either form works).
