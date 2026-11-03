# Power Automate recipes: intake, daily clock and letter approval

Status: designed for Microsoft 365 and written from Microsoft's published documentation. The JSON parts are validated against Microsoft's published schemas (see `CHECKS.md`); nothing has been imported into a tenant and no flow has been run. Every step below is to be built and checked in a test environment with IT before any real email is processed.

These three cloud flows keep the dates in the complaints register. The dates themselves come from rules, never from AI: each rule here has a matching function in `engine/clock.js` and a test in `engine/clock.test.mjs` (table at the end).

| Flow | Starts when | What it does |
|---|---|---|
| 1. Complaints intake | An email arrives in the complaints shared mailbox | Works out the initiation date, asks a coordinator in Teams to confirm the type, then logs the complaint |
| 2. Daily clock | 07:30 UK time, Monday to Friday | Finds the next unsent commitment for each open complaint, reminds the owner, escalates anything overdue, posts a daily "clock ran" message |
| 3. Letter approval | A coordinator marks a letter "Ready for approval" in the register | Fills the dates from the register, asks for approval, sends from the shared mailbox, records who approved and when |

Phase 1 uses standard connectors only. Phase 2 (optional, after a data protection impact assessment and a licensing check) adds one AI Builder step to Flow 1.

## Before you start

**Prerequisites**

- The SharePoint site with the two lists from `sharepoint/complaints-register.site-script.json` ("Complaints register" and "UK bank holidays"), and the bank-holiday list filled for at least the current and next year (see `HANDOVER.md`, yearly refresh).
- A Power Platform environment other than the default environment, with a solution to hold the three flows, their connection references and environment variables (`HANDOVER.md`, ownership). Build the flows inside that solution.
- A service account (not a person's account) for the connections, with:
  - Full Access and Send As on the complaints shared mailbox. Exchange Online describes Full Access as the permission to open the mailbox and Send As as the permission to send from it, and says both are needed for normal shared mailbox use [L20]. Microsoft's connector reference notes that new permissions can take about two hours to replicate before the flow can use them [L1].
  - Edit rights on the two lists (through the Complaints Team SharePoint group).
  - Membership of the Complaints Team in Teams.
- The Workflows app allowed in the Teams admin centre. Microsoft's Teams connector reference says the posting actions need it [L3].
- Environment variables in the solution: `SiteUrl`, `ComplaintsMailbox`, `CoordinatorEmail`, `TeamLeadEmail`, `ApproverEmail`, and the Team and channel for the daily message.

**Conventions used below**

- Action names matter: expressions refer to actions by name, with spaces replaced by underscores. Rename each action exactly as shown in bold (for example **Received UK date** is referenced as `outputs('Received_UK_date')`).
- All dates passed between steps are text in the form `yyyy-MM-dd`, the same form the engine uses. ISO dates compare correctly as text, and `less()`, `greater()` and `lessOrEquals()` all accept strings [L5].
- Microsoft's expression reference does not say whether `if()` evaluates only the branch it returns [L5]. Every expression here is written to be safe either way: where a branch would fail on an empty value, `coalesce()` gives it a harmless stand-in.
- Where a value comes from an action whose outputs Microsoft documents as dynamic (the Teams card response, the AI Builder prompt), the recipe names the dynamic content. Check the exact path in the outputs of the first test run before relying on a written expression.

## Flow 1: Complaints intake

**Goal:** every email to the complaints mailbox gets a UK-time received date and an initiation date by the published rule, then a person decides the type. Anything that might be a complaint is logged; only a person can decide that it is not.

### 1.1 Trigger

1. In the solution, select **New** > **Automation** > **Cloud flow** > **Automated**. Name it "Complaints intake".
2. Choose the trigger **When a new email arrives in a shared mailbox (V2)** (Office 365 Outlook). Microsoft's data policy list names this connector Microsoft 365 Outlook [L19].
   - **Original Mailbox Address:** the `ComplaintsMailbox` environment variable.
   - **Folder:** Inbox.
   - **Include Attachments:** No. **Only with Attachments:** No.

   The trigger returns the message as Microsoft Graph defines it, including **Received Time** (`receivedDateTime`), **From**, **Subject**, **Body**, **Body Preview**, **Message Id** and **Internet Message Id** [L1].

   Duplicate check (recommended): Microsoft lists a known issue where this trigger can fire again for older emails moved between folders [L1]. Add **Get items** on the Complaints register, renamed **Already logged**, with **Filter Query** `SourceEmailId eq '@{triggerOutputs()?['body/internetMessageId']}'` and **Top Count** 1, then a **Condition** `@greater(length(body('Already_logged')?['value']), 0)` whose yes branch is **Terminate** (Cancelled). The internet message ID is used rather than the message ID because Graph changes a message's `id` when it moves to another folder [L6].

### 1.2 Received date in UK time

3. Add **Compose**, rename it **Received UK date**:

   ```text
   convertFromUtc(triggerOutputs()?['body/receivedDateTime'], 'GMT Standard Time', 'yyyy-MM-dd')
   ```

   Why: Microsoft Graph returns `receivedDateTime` in UTC [L6]. In British Summer Time an email that arrives at 00:30 on Saturday UK time is recorded as 23:30 UTC on Friday. Without the conversion the clock would treat a Saturday complaint as a Friday one and start a working day early. `GMT Standard Time` is Windows' name for the UK time zone, "(UTC) Dublin, Edinburgh, Lisbon, London" [L21], and it follows British Summer Time.

4. Add **Compose**, rename it **Received UK time** (shown on the card):

   ```text
   convertFromUtc(triggerOutputs()?['body/receivedDateTime'], 'GMT Standard Time', 'ddd d MMM yyyy, HH:mm')
   ```

### 1.3 Bank holidays

5. Add **Get items** (SharePoint), rename it **Get bank holidays**. **Site Address:** `SiteUrl`. **List Name:** UK bank holidays. **Top Count:** 500. No filter is needed: the list holds about eight dates a year.
6. Add **Select** (Data Operation), rename it **Holiday dates**. **From:** the `value` of **Get bank holidays**. Switch **Map** to text mode and enter:

   ```text
   convertFromUtc(item()?['HolidayDate'], 'GMT Standard Time', 'yyyy-MM-dd')
   ```

   The result is a plain list of dates such as `["2026-05-25", "2026-08-31"]`. Converting to UK time before keeping the date part gives the right calendar date whether SharePoint returns a date-only value as midnight UTC or as UK midnight expressed in UTC. Check the raw value in the first test run.

### 1.4 Next working day (the initiation date)

The published rule: "The complaints initiation date is the first working day after a complaint is received", and public holidays are not working days.

7. Add **Initialize variable**: **Name** `Candidate`, **Type** String, **Value** `outputs('Received_UK_date')`. Variables can only be declared at the top level of a flow, not inside loops or conditions [L8].
8. Add **Do until**, rename it **Next working day**. Power Automate runs the actions inside the loop first and then checks the condition [L7], which is exactly the rule: start from the day after receipt and keep going until the day is a working day.
   - Inside the loop add **Compose**, rename it **Next date**: `addDays(variables('Candidate'), 1, 'yyyy-MM-dd')`
   - Then **Set variable**: `Candidate` = `outputs('Next_date')`. (Composing first keeps the Set variable value from referring to its own variable.)
   - Loop condition (advanced mode):

     ```text
     @and(
       not(equals(dayOfWeek(variables('Candidate')), 0)),
       not(equals(dayOfWeek(variables('Candidate')), 6)),
       not(contains(body('Holiday_dates'), variables('Candidate')))
     )
     ```

     `dayOfWeek()` returns 0 for Sunday and 6 for Saturday [L5]; `contains()` checks an array for a value [L5].
   - Leave **Count** at 60 and **Timeout** at PT1H, the defaults [L7]. The longest real run is five iterations (for example, received Thursday 24 December 2026: Christmas Day, the weekend and the substitute Boxing Day are skipped).
9. Add **Compose**, rename it **Initiation date**: `variables('Candidate')`
10. Add **Compose**, rename it **Clock starts** (for the card): `formatDateTime(outputs('Initiation_date'), 'dddd d MMMM yyyy', 'en-GB')`

Worked example (engine test "bank holiday Monday is skipped (Spring bank holiday 2026)"): received Friday 22 May 2026; Saturday, Sunday and Monday 25 May (bank holiday) are skipped; initiation date Tuesday 26 May 2026.

### 1.5 Suggested reading (phase 1 default)

11. Add **Initialize variable**: **Name** `Suggestion`, **Type** Object, **Value**:

    ```json
    {
      "type": "formal_complaint",
      "reason": "Phase 1 has no AI step. The suggestion is a formal complaint until a person decides otherwise.",
      "emergency": "Not assessed",
      "confidence": "Not assessed",
      "customerName": "",
      "development": "",
      "plot": "",
      "reservationDate": "",
      "completionDate": "",
      "issues": ""
    }
    ```

    Phase 2 (section 1.9) overwrites this object with the AI's reading. The card is the same in both phases.

### 1.6 Text for the card

Email text can contain quotation marks and line breaks, which would break the card's JSON. Each free-text value goes through the same escaping pattern before it reaches the card:

```text
replace(replace(replace(replace(coalesce(VALUE, ''), '\', '\\'), '"', '\"'), decodeUriComponent('%0D'), ''), decodeUriComponent('%0A'), '\n')
```

12. Add **Compose**, rename it **Card text**. Paste this object (use **Peek code** to confirm the input is stored as an object, not as text). Values marked *escaped* use the pattern above with the value shown in place of `VALUE`:

    | Key | Value |
    |---|---|
    | `from` | *escaped* `triggerOutputs()?['body/from']` |
    | `subject` | *escaped* `triggerOutputs()?['body/subject']` |
    | `receivedUk` | `outputs('Received_UK_time')` |
    | `clockStarts` | `outputs('Clock_starts')` |
    | `preview` | *escaped* `triggerOutputs()?['body/bodyPreview']` |
    | `suggestedType` | `variables('Suggestion')?['type']` |
    | `suggestedTypeLabel` | `if(equals(variables('Suggestion')?['type'], 'aftercare_item'), 'Aftercare item for the customer portal', if(equals(variables('Suggestion')?['type'], 'general_enquiry'), 'General enquiry', 'Formal complaint'))` |
    | `emergency` | `variables('Suggestion')?['emergency']` |
    | `confidence` | `variables('Suggestion')?['confidence']` |
    | `reason` | *escaped* `variables('Suggestion')?['reason']` |
    | `customerName`, `development`, `plot`, `issues` | *escaped* `variables('Suggestion')?['customerName']` and so on |
    | `reservationDate`, `completionDate` | `variables('Suggestion')?['reservationDate']` and so on |

### 1.7 Ask the coordinator

13. Add **Post adaptive card and wait for a response** (Microsoft Teams), rename it **Confirm card** [L3].
    - **Post as:** Flow bot. **Post in:** Chat with Flow bot. **Recipient:** `CoordinatorEmail` (or post in the Complaints Team channel so anyone on the team can answer).
    - **Message** (the card box in Microsoft's walkthrough [L11]): paste `teams/confirm.card.json`. Each `@{...}` string in that file is a Power Automate expression; after pasting, check that each shows as an expression, and insert it with the expression editor if it shows as plain text. Microsoft's own walkthrough pastes card JSON into this box in the same way [L11].
    - **Update message:** "Thank you. Your answer has been recorded in the Complaints register." Microsoft recommends an update message so that a card cannot be submitted twice; only the first submission is used [L10].
    - **Settings** > **Timeout:** `PT8H` (an ISO 8601 duration; asynchronous actions can wait up to 30 days [L9]). If nobody answers within eight hours, the timeout branch (step 22) logs the email as a complaint so the clock is never lost.
14. Add **Compose**, rename it **Decision**: the `decision` value from the card response (the button's `data`), for example `body('Confirm_card')?['data']?['decision']`. Microsoft documents this action's outputs as dynamic [L3]: confirm the path against the first test run.
15. Add **Compose**, rename it **Chosen type**: the `type` input from the card response, for example `body('Confirm_card')?['data']?['type']`.
16. Add **Compose**, rename it **Type label**:

    ```text
    if(equals(outputs('Chosen_type'), 'aftercare_item'), 'Aftercare item for the portal', if(equals(outputs('Chosen_type'), 'general_enquiry'), 'General enquiry', 'Formal complaint'))
    ```

    Anything unexpected falls through to "Formal complaint", the safe side.

### 1.8 Log it, or record why not

17. Add **Condition**, rename it **Log it**. Advanced mode:

    ```text
    @or(equals(outputs('Decision'), 'confirm'), equals(outputs('Chosen_type'), 'formal_complaint'))
    ```

    "Not a complaint" only stops logging when the person has also changed the type away from "Formal complaint". If the two disagree, the email is logged.

**If yes:**

18. Add these **Compose** actions:

    - **Reservation:** the `reservationDate` input from the card response, wrapped as `coalesce(..., '')`
    - **Completion:** the `completionDate` input, wrapped the same way
    - **Code version** (which code applies, by reservation date, from Shanly Homes' published New Homes Quality Code page):

      ```text
      if(empty(outputs('Reservation')), 'To confirm',
        if(less(outputs('Reservation'), '2023-08-02'), 'Consumer Code for Home Builders',
          if(less(outputs('Reservation'), '2026-03-02'), 'New Homes Quality Code, version 1',
            'New Homes Quality Code, version 2')))
      ```

    - **Window base** (the later of reservation and legal completion; empty if neither is known):

      ```text
      if(greater(outputs('Completion'), outputs('Reservation')), outputs('Completion'), outputs('Reservation'))
      ```

    - **Window end** (two years on; blank, not guessed, when there is no date):

      ```text
      if(empty(outputs('Window_base')), null,
        addToTime(if(empty(outputs('Window_base')), '2000-01-01', outputs('Window_base')), 2, 'Year', 'yyyy-MM-dd'))
      ```

      `addToTime()` accepts `Year` as a unit [L5]. The engine moves 29 February to 28 February in a non-leap year; check that `addToTime('2024-02-29', 2, 'Year', 'yyyy-MM-dd')` returns `2026-02-28` in the test environment (week 2 check).
    - **Within window:**

      ```text
      if(empty(outputs('Window_base')), 'unknown',
        if(lessOrEquals(outputs('Received_UK_date'), coalesce(outputs('Window_end'), '9999-12-31')), 'yes', 'no'))
      ```

      The flow records this; it never decides eligibility. A "no" is written to the activity log for the Complaints Team to consider.

19. Add **Create item** (SharePoint), rename it **Create register item**. **List Name:** Complaints register.

    | Column | Value |
    |---|---|
    | Title | `Pending reference` (replaced in step 20) |
    | CustomerName, Development, Plot, IssuesRaised | the matching inputs from the card response |
    | CustomerEmail | `triggerOutputs()?['body/from']` |
    | ReceivedDate | `triggerOutputs()?['body/receivedDateTime']` |
    | InitiationDate | `outputs('Initiation_date')` |
    | ReservationDate | `if(empty(outputs('Reservation')), null, outputs('Reservation'))` |
    | CompletionDate | `if(empty(outputs('Completion')), null, outputs('Completion'))` |
    | CodeVersion Value | `outputs('Code_version')` |
    | WindowEnd | `outputs('Window_end')` |
    | Stage Value | Logged |
    | SuggestedType Value | `outputs('Type_label')` |
    | Owner Claims, ConfirmedBy Claims | the responder's email from the **Confirm card** dynamic content |
    | ConfirmedOn | `utcNow()` |
    | SourceEmailId | `triggerOutputs()?['body/internetMessageId']` |
    | ActivityLog | see below |

    ActivityLog:

    ```text
    concat('Logged by the intake flow on ', convertFromUtc(utcNow(), 'GMT Standard Time', 'd MMM yyyy HH:mm'),
      '. Received ', outputs('Received_UK_time'), ' (UK time); initiation date ', outputs('Initiation_date'),
      ', the first working day after receipt. Type confirmed on the Teams card. Within the two-year window: ',
      outputs('Within_window'), '.')
    ```

20. Add **Update item**, rename it **Set reference**. **Id:** the ID from **Create register item**. **Title:**

    ```text
    concat('CMP-', formatDateTime(outputs('Initiation_date'), 'yyyy'), '-', string(body('Create_register_item')?['ID']))
    ```

    If the Complaints Team already has a reference scheme, use theirs instead.
21. Add **Post message in a chat or channel** (Microsoft Teams) to the Complaints Team channel: the reference, the initiation date, the acknowledgement due date (`addDays(outputs('Initiation_date'), 5, 'yyyy-MM-dd')`) and, if **Within window** is "no" or **Code version** is "To confirm", a line asking the team to check.

**If no** (the person chose an aftercare item or a general enquiry and pressed "Not a complaint"):

- Add **Post message in a chat or channel** to the team channel: "Email from (sender) received (UK time) was marked as (type) by (responder) at (time). It stays in the mailbox. Nothing has been sent to the customer." The decision is visible to the whole team and can be reversed by logging the item by hand.

### 1.9 Timeout and failure branch

22. On **Confirm card**, add a parallel branch whose **Configure run after** is "has timed out" and "has failed" [L14]. In it, add **Create item** with the same mapping as step 19, except: SuggestedType "Formal complaint", Owner and ConfirmedBy blank, and ActivityLog "Logged automatically: no answer on the Teams card within 8 hours (or the card could not be posted). A person must confirm the type." Then post to the team channel. The clock starts either way.

### 1.10 Phase 2 (optional): the AI reads the email first

Only after a data protection impact assessment and a licensing check (see `HANDOVER.md`). Insert between steps 11 and 12:

1. **Run a prompt** (AI Builder). Since May 2025 this is the name of the action previously called "Create text with GPT using a prompt" [L16]. Choose the prompt built from `ai/triage-prompt.md` with inputs `email` (the trigger's **Body**) and `sender` (**From**).
2. **Parse JSON**, rename it **Parse triage**. **Content:** the prompt's **Text** output. **Schema:** `ai/output-schema.json` (remove the `$schema` line if the designer will not accept it).
3. **Set variable** `Suggestion` to the same object as step 11, with each value taken from **Parse triage** (for example `"type": "@{body('Parse_triage')?['type']}"`, `"emergency": "@{if(equals(body('Parse_triage')?['possible_emergency'], true), 'Yes: follow the emergency process now, do not wait for this card', 'No')}"`, `"issues": "@{join(body('Parse_triage')?['issues'], '; ')}"`).
4. On **Parse triage**, a branch with **Configure run after** "has failed" sets `Suggestion` back to the phase 1 defaults with the reason "The AI answer could not be read. Please read the email." The person still decides.

Licensing, as published by Microsoft (read 3 Nov 2026):

- "A Power Automate flow that uses any AI Builder action is a premium flow. It requires Power Automate premium licensing." Running prompts in flows also consumes AI Builder credits or Copilot Credits; flows use AI Builder credits first, then Copilot Credits [L17].
- From 1 November 2026, new or renewed Power Platform licences no longer include seeded AI Builder credits; existing seeded credits are honoured to the end of the contract term, and customers are invited to buy Copilot Credits [L18].
- So phase 2 needs a premium licence for the flow and a Copilot Credits (or remaining AI Builder credits) allocation for the environment. Confirm both with the Group's licensing partner before building it. Phase 1 needs neither.

## Flow 2: Daily clock

**Goal:** every weekday morning, find the next unsent commitment for each open complaint, remind its owner when it is due soon, escalate it when it is overdue, keep NextUpdateDue current and post a short message so that silence is noticed.

### 2.1 Trigger

1. **New** > **Automation** > **Cloud flow** > **Scheduled**, named "Complaints daily clock". In the **Recurrence** trigger [L13]:
   - **Interval** 1, **Frequency** Week.
   - **Time zone:** the UK entry (Dublin, Edinburgh, Lisbon, London), so that 07:30 means UK time. Check the first run after the clocks change.
   - **On these days:** Monday to Friday. **At these hours:** 7. **At these minutes:** 30.

   The flow also runs on bank holidays. That is harmless: the counts stay true and the due-soon rule already counts working days.

2. Add **Initialize variable** twice: `DueSoonCount` (Integer, 0) and `OverdueCount` (Integer, 0). They go here, before the scope, because variables can only be declared at the top level of a flow, not inside scopes, conditions or loops [L8].
3. Add **Scope**, rename it **Try**. Everything in sections 2.2 and 2.3 and step 12 goes inside it.

### 2.2 Today, and a working-day calendar built once

4. **Compose** **Today**: `convertFromUtc(utcNow(), 'GMT Standard Time', 'yyyy-MM-dd')`
5. **Get bank holidays** and **Holiday dates**: as Flow 1, steps 5 and 6.
6. **Select**, rename it **Calendar**. **From:** `range(0, 31)`. **Map** (text mode): `addDays(outputs('Today'), sub(item(), 10), 'yyyy-MM-dd')`. This lists the 31 days from ten days ago to twenty days ahead.
7. **Filter array**, rename it **Working days**. **From:** `body('Calendar')`. Condition (advanced mode):

   ```text
   @and(not(equals(dayOfWeek(item()), 0)), not(equals(dayOfWeek(item()), 6)), not(contains(body('Holiday_dates'), item())))
   ```

8. **Filter array** **Working days after today**: from `body('Working_days')`, condition `@greater(item(), outputs('Today'))`.
9. **Compose** **Due soon cutoff**: `body('Working_days_after_today')[2]`, the third working day after today.

   Why this works: the engine calls a commitment "due soon" when its send-by date is no more than two working days away. The send-by date is the latest working day on or before the due date, so that test is the same as "the due date falls before the third working day after today". the pack validator (results in `CHECKS.md`) checks this equivalence against the engine for complaints received on every day from December 2025 to November 2028. Building the calendar once avoids a loop inside a loop.

### 2.3 Open complaints

10. **Get items**, rename it **Open complaints**. **List Name:** Complaints register. **Filter Query:**

    ```text
    Stage ne 'Concluded' and SuggestedType eq 'Formal complaint'
    ```

    **Top Count:** 500.
11. **Apply to each** over the `value` of **Open complaints**. In **Settings**, turn **Concurrency control** on and set **Degree of parallelism** to 1, so the counters behave predictably [L7]. Inside the loop, `items('Apply_to_each')` is the current complaint:

    a. **Condition** **Has a start date**: `@not(equals(items('Apply_to_each')?['InitiationDate'], null))`. If no, post "(reference) has no initiation date" to the channel and do nothing else for this item. Steps b to j go in the yes branch.

    b. **Compose** **Initiation**: `convertFromUtc(items('Apply_to_each')?['InitiationDate'], 'GMT Standard Time', 'yyyy-MM-dd')`

    c. **Compose** **Next key**, the first commitment not yet sent, in the published order:

       ```text
       if(equals(items('Apply_to_each')?['AckSent'], null), 'ack',
         if(equals(items('Apply_to_each')?['PathwaySent'], null), 'pathway',
           if(equals(items('Apply_to_each')?['AssessmentSent'], null), 'assessment',
             if(equals(items('Apply_to_each')?['NextStepsSent'], null), 'nextSteps', 'update'))))
       ```

    d. **Compose** **Update base**: the last update sent, otherwise the next steps letter, otherwise day 56:

       ```text
       if(equals(coalesce(items('Apply_to_each')?['LastUpdateSent'], items('Apply_to_each')?['NextStepsSent']), null),
         addDays(outputs('Initiation'), 56, 'yyyy-MM-dd'),
         convertFromUtc(coalesce(items('Apply_to_each')?['LastUpdateSent'], items('Apply_to_each')?['NextStepsSent'], utcNow()), 'GMT Standard Time', 'yyyy-MM-dd'))
       ```

    e. **Compose** **Next update due**: `addDays(outputs('Update_base'), 28, 'yyyy-MM-dd')`. This is the brief's rule, NextUpdateDue = (NextStepsSent or the day 56 date) + 28, carried forward by LastUpdateSent once updates go out.

    f. **Compose** **Next due**:

       ```text
       if(equals(outputs('Next_key'), 'ack'), addDays(outputs('Initiation'), 5, 'yyyy-MM-dd'),
         if(equals(outputs('Next_key'), 'pathway'), addDays(outputs('Initiation'), 10, 'yyyy-MM-dd'),
           if(equals(outputs('Next_key'), 'assessment'), addDays(outputs('Initiation'), 30, 'yyyy-MM-dd'),
             if(equals(outputs('Next_key'), 'nextSteps'), addDays(outputs('Initiation'), 56, 'yyyy-MM-dd'),
               outputs('Next_update_due')))))
       ```

       The flow works from InitiationDate rather than reading the calculated columns, so it does not depend on how SharePoint serialises calculated values. The offsets are the same 5, 10, 30 and 56 days as the columns and the engine; the pack validator (results in `CHECKS.md`) checks all three agree.

    g. **Filter array** **Working days to due**: from `body('Working_days')`, condition `@lessOrEquals(item(), outputs('Next_due'))`. Then **Compose** **Send by**: `last(body('Working_days_to_due'))`. This is my suggested send-by date: a due date on a weekend or bank holiday moves to the working day before. It is only used when the commitment is due soon, and then it always falls inside the calendar.

    h. **Compose** **Status**:

       ```text
       if(greater(outputs('Today'), outputs('Next_due')), 'overdue',
         if(less(outputs('Next_due'), outputs('Due_soon_cutoff')), 'due-soon', 'on-track'))
       ```

       Overdue starts the day after the due date, as in the engine.

    i. **Condition** **Next update changed**: compare the item's NextUpdateDue (converted as in step b, or blank) with `outputs('Next_update_due')`. Only if different, **Update item** NextUpdateDue = `outputs('Next_update_due')` (pass Title back unchanged; SharePoint requires it). Writing only on change keeps the version history readable.

    j. **Switch** on `outputs('Status')`:
       - **due-soon:** **Increment variable** `DueSoonCount`. **Compose** **Reminder text** (an object, escaped as in Flow 1 step 12 where marked):

         | Key | Value |
         |---|---|
         | `headline` | `concat(<commitment name>, ' due soon')` |
         | `reference` | *escaped* `items('Apply_to_each')?['Title']` |
         | `customer` | *escaped* `items('Apply_to_each')?['CustomerName']` |
         | `developmentPlot` | *escaped* development and plot joined with ", plot " |
         | `commitment` | the name for `outputs('Next_key')`: Acknowledgement; Proposed pathway to resolution; Full assessment; Next steps and timescales; Update (at least every 28 days) |
         | `dueDate` | `formatDateTime(outputs('Next_due'), 'dddd d MMMM yyyy', 'en-GB')` |
         | `sendBy` | `formatDateTime(outputs('Send_by'), 'dddd d MMMM yyyy', 'en-GB')` |
         | `status` | Due soon |
         | `owner` | *escaped* the Owner's display name |
         | `link` | the item's **Link to item** from the Get items dynamic content |

         Then **Post card in a chat or channel**: Post as Flow bot, Post in Chat with Flow bot, Recipient the Owner's email (or the team channel if Owner is blank), Adaptive Card `teams/reminder.card.json`. The reminder card has only an Open URL button, which works without waiting for a response [L10].
       - **overdue:** **Increment variable** `OverdueCount`. The same **Reminder text** with headline `concat('Overdue: ', <commitment name>)` and status "Overdue", posted to `TeamLeadEmail` and to the Owner. This repeats each weekday while it stays overdue, deliberately.
       - **Default (on-track):** nothing.

### 2.4 Heartbeat and failure alert

12. After the loop, still inside **Try**: **Post message in a chat or channel** to the team channel:

    ```text
    concat('Complaints clock ran at 07:30 on ', formatDateTime(outputs('Today'), 'dddd d MMMM yyyy', 'en-GB'), ': ',
      string(length(body('Open_complaints')?['value'])), ' open, ', string(variables('DueSoonCount')), ' due soon, ',
      string(variables('OverdueCount')), ' overdue.')
    ```

    If this message is missing at 08:00, the clock did not run. The team lead checks the flow (see `HANDOVER.md`).

13. Add a second **Scope** after **Try**, rename it **Catch**, and set its **Configure run after** to "has failed" and "has timed out" on **Try** [L14]. Inside it, post to the team channel: "The complaints clock did not finish today. Reminders may be missing. Open the run: (link)". Build the link to the run from `workflow()` as Microsoft shows [L14]:

    ```text
    concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'],
      '/flows/', workflow()?['tags']?['logicAppName'], '/runs/', workflow()?['run']?['name'])
    ```

    Check that the link opens the run in the test environment. Then add **Terminate** with status Failed so the run history shows the failure.

14. Turn on failure alerts in the flow's settings and add at least two co-owners. Microsoft sends a per-run failure email to owners and co-owners only for known, fixable problems (for example an expired connection), then waits 28 days before sending another for the same flow, and per-run alerts are not on for every flow by default; a weekly digest covers all failures [L15]. That is why the flow posts its own heartbeat and catch message rather than relying on email alerts.

## Flow 3: Letter approval

**Goal:** a person drafts the letter (phase 1: Copilot in Outlook with `copilot/drafting-prompt.md`, or a template), the flow puts in the dates from the register, a named approver approves it, and only then is it sent from the shared mailbox and recorded.

### 3.1 Trigger

1. **New** > **Automation** > **Cloud flow** > **Automated**, named "Complaints letter approval". Trigger **When an item is created or modified** (SharePoint) on the Complaints register [L2].
2. In the trigger's **Settings** > **Trigger conditions**, add:

   ```text
   @equals(triggerOutputs()?['body/LetterStatus/Value'], 'Ready for approval')
   ```

   The coordinator starts the flow by setting **LetterToSend** (which letter), pasting the draft into **LetterDraft** and setting **LetterStatus** to "Ready for approval". Edits by the other flows do not start it. The SharePoint "For a selected item" trigger is not used because Microsoft notes that the SharePoint menu lists only flows in the default environment for that trigger [L2], and these flows live in a non-default environment.

### 3.2 Claim the item and fill the dates

3. **Get item** (same ID) and a **Condition**: if LetterStatus is no longer "Ready for approval", **Terminate** (Cancelled). Otherwise **Update item** LetterStatus = "Awaiting approval". This stops a second run picking up the same letter.
4. **Compose** **Initiation**: as Flow 2 step 11b, from the item.
5. **Compose** **Final letter**: the draft with each placeholder replaced from the register, so that the dates in a letter always come from the register and never from AI:

   ```text
   replace(replace(replace(replace(coalesce(triggerOutputs()?['body/LetterDraft'], ''),
     '[ACK_DUE]', formatDateTime(addDays(outputs('Initiation'), 5, 'yyyy-MM-dd'), 'dddd d MMMM yyyy', 'en-GB')),
     '[PATHWAY_DUE]', formatDateTime(addDays(outputs('Initiation'), 10, 'yyyy-MM-dd'), 'dddd d MMMM yyyy', 'en-GB')),
     '[ASSESSMENT_DUE]', formatDateTime(addDays(outputs('Initiation'), 30, 'yyyy-MM-dd'), 'dddd d MMMM yyyy', 'en-GB')),
     '[REFERENCE]', triggerOutputs()?['body/Title'])
   ```

   `formatDateTime()` takes a locale, here `en-GB` [L5].
6. **Condition** **Still has a placeholder**: `@contains(outputs('Final_letter'), '[')`. If yes, **Update item** LetterStatus = "Returned for changes", append to ActivityLog "Not sent: the letter still contains a placeholder in square brackets", notify the owner, and stop. The drafting prompt marks anything it cannot fill as `[TO CONFIRM: ...]`, so this catches it.

### 3.3 Approval

7. **Start and wait for an approval** (Approvals) [L4]:
   - **Approval type:** Approve/Reject, first to respond.
   - **Title:** `concat('Approve ', triggerOutputs()?['body/LetterToSend/Value'], ' for ', triggerOutputs()?['body/Title'])`
   - **Assigned to:** `ApproverEmail` (one or more addresses separated by semicolons [L4]).
   - **Details:** the final letter, then "Due: (date). Suggested send-by: (date)." Details support Markdown [L4].
   - **Item link:** the register item. **Item link description:** "Open the complaint in the register".

   Microsoft's own pattern for AI-drafted text puts a person's approval between the draft and any action, and offers **Start and wait for an approval of text**, which lets the approver edit the text before approving [L16]. Either action works here; the text variant is worth considering if approvers prefer to edit in place.

### 3.4 On approval: send, then record

8. **Condition**: `@equals(body('Start_and_wait_for_an_approval')?['outcome'], 'Approve')`. The response values "Approve" and "Reject" are case-sensitive [L4].

**If approved:**

9. **Send an email from a shared mailbox (V2)** (Office 365 Outlook) [L1]:
   - **Original Mailbox Address:** `ComplaintsMailbox`. **To:** the item's CustomerEmail.
   - **Subject:** `concat('Your complaint ', triggerOutputs()?['body/Title'], ': ', triggerOutputs()?['body/LetterToSend/Value'])`
   - **Body:** the final letter as HTML: escape `&`, `<` and `>` first, then turn line breaks into `<br>`:

     ```text
     replace(replace(replace(replace(outputs('Final_letter'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), decodeUriComponent('%0A'), '<br>')
     ```

10. **Compose** **Sent at**: `utcNow()`. Run after the send has succeeded only, so a failed send never writes a sent date.
11. **Compose** **Approved by**: the approver's name, from the documented response field `responses.responder.displayName`, for example `first(body('Start_and_wait_for_an_approval')?['responses'])?['responder']?['displayName']`. **Approved at**: `convertFromUtc(first(body('Start_and_wait_for_an_approval')?['responses'])?['responseDate'], 'GMT Standard Time', 'd MMM yyyy HH:mm')`. Approvals timestamps are always UTC [L4].
12. **Switch** on `triggerOutputs()?['body/LetterToSend/Value']`, each case one **Update item** (Title passed back unchanged):

    | LetterToSend | Column written with `outputs('Sent_at')` | Stage | Also |
    |---|---|---|---|
    | Acknowledgement | AckSent | Acknowledged | |
    | Proposed pathway | PathwaySent | Pathway sent | |
    | Full assessment | AssessmentSent | Full assessment sent | |
    | Next steps | NextStepsSent | Next steps sent | NextUpdateDue = UK date of Sent at + 28 days |
    | Update | LastUpdateSent | unchanged | NextUpdateDue = UK date of Sent at + 28 days |
    | Concluding letter | ConcludedOn | Concluded | |

    In every case also set LetterStatus "Sent", clear LetterToSend and LetterDraft, and write ActivityLog:

    ```text
    concat(triggerOutputs()?['body/LetterToSend/Value'], ' approved by ', outputs('Approved_by'), ' at ', outputs('Approved_at'),
      ' (UK time); sent from the shared mailbox at ', convertFromUtc(outputs('Sent_at'), 'GMT Standard Time', 'd MMM yyyy HH:mm'), '.')
    ```

    ActivityLog is append-only, so each entry is kept with its date in the item's history. SharePoint keeps appended text only when versioning is on for the list [L22].

**If rejected:** **Update item** LetterStatus "Returned for changes" and append "Returned by (name) at (time): (comments)" to ActivityLog (`responses.comments` [L4]); notify the owner in Teams.

**If the send fails:** on **Send an email from a shared mailbox (V2)**, a branch with **Configure run after** "has failed" sets LetterStatus "Returned for changes", appends "Approved but not sent: the email could not be sent at (time)" to ActivityLog and posts to the team channel. Nothing is recorded as sent.

## Expression → engine function → test name

Each rule the flows and the list depend on, the function in `engine/clock.js` that implements the same rule, and the tests in `engine/clock.test.mjs` that pin it down. the pack validator (results in `CHECKS.md`) checks that every test named here exists and that every function named here is exported.

| Rule | Flow or list expression | Engine function | Tests in clock.test.mjs |
|---|---|---|---|
| UK date of receipt | `convertFromUtc(receivedDateTime, 'GMT Standard Time', 'yyyy-MM-dd')` (Flow 1, step 3) | input to `initiationDate()` (the engine expects the UK calendar day) | none: the engine starts from a UK date; covered by the week 2 test-site check with an email sent at 00:30 BST |
| Weekday numbering | `dayOfWeek()`, 0 = Sunday, 6 = Saturday | `dayOfWeek()` | "dayOfWeek uses the Power Automate numbering (0 = Sunday)" |
| Working day | not Saturday, not Sunday, not in **Holiday dates** | `isWorkingDay()` | "bank holiday Monday is skipped (Spring bank holiday 2026)"; "Easter 2026: Good Friday and Easter Monday are skipped"; "Christmas 2026: 25 Dec and the substitute Boxing Day (28 Dec) are skipped" |
| Initiation date | Do until: `addDays(Candidate, 1)` until a working day (Flow 1, steps 7 to 9) | `initiationDate()` | "published example: received Monday, initiation Tuesday"; "published example: received Saturday, initiation the next Monday"; "received Sunday: initiation Monday"; "received Friday: initiation Monday"; "New Year 2027: received 31 Dec, 1 Jan is a bank holiday, initiation Monday 4 Jan" |
| Four due dates | list: `=IF(ISBLANK([InitiationDate]),"",[InitiationDate]+5)` and +10, +30, +56; flows: `addDays(Initiation, n)` | `schedule()` (uses `addDays()` and `STAGES`) | "all four stage dates from a Monday receipt" |
| Suggested send-by date | `last(` working days on or before the due date `)` (Flow 2, step 11g) | `sendBy()` | "a promise due on a Sunday must go by the Friday before"; "a promise due on a working day can go that day"; "over Christmas: received 24 Dec, acknowledgement due Sun 3 Jan, send by Thu 31 Dec" |
| Updates every 28 days | `addDays(LastUpdateSent, else NextStepsSent, else day 56, 28)` (Flow 2, steps 11d and 11e; Flow 3, step 12) | `schedule()` | "updates every 28 days after day 56, chained from the letter that actually went", "assess can list as many 28-day updates as the register needs" |
| Due soon and overdue | overdue if `Today > Next due`; due soon if `Next due < third working day after today` (Flow 2, steps 9 and 11h) | `stageStatus()` and `workingDaysUntil()` | "status: due soon inside two working days of the send-by date"; "status: overdue the day after the due date; met when sent on or before it"; "working days until: skips the weekend and counts down to zero" |
| Next commitment | first empty Sent column in order (Flow 2, step 11c) | `assess()` | "assess: one call returns the register row, the next promise and its status" |
| Which code applies | nested `less()` on the reservation date (Flow 1, step 18) | `codeFor()` | "code version: reserved 1 Aug 2023 is the Consumer Code for Home Builders"; "code version: reserved 2 Aug 2023 is NHQC version 1"; "code version: reserved 1 Mar 2026 is NHQC version 1"; "code version: reserved 2 Mar 2026 is NHQC version 2"; "code version: no reservation date means a person must confirm it" |
| Two-year window | `addToTime(later of reservation and completion, 2, 'Year')` (Flow 1, step 18) | `windowEnd()` and `addYears()` | "two-year window runs from the later of reservation and completion"; "two-year window from 29 February ends on 28 February" |
| Inside the window | `lessOrEquals(Received UK date, Window end)`; "unknown" when no dates | `withinWindow()` | "two-year window: the last day is inside, the day after is outside"; "no dates at all: window is unknown, not assumed" |
| Dates are refused, not guessed | Input.Date returns `yyyy-MM-dd`; in phase 2 Parse JSON rejects other formats (`ai/output-schema.json` pattern) | `initiationDate()` (via its date check) | "bad input is refused rather than guessed" |
| Sent on time or late (list colour) | formatter: Sent if before `addDays([$InitiationDate], due + 1)`, else Sent late | `stageStatus()` (met, met-late) | "status: overdue the day after the due date; met when sent on or before it" |

One approximation, stated plainly: the list's own colour label shows "Due soon" from two **calendar** days before the due date, because column formatting has no bank-holiday calendar. The engine and Flow 2 use two **working** days before the send-by date. The Teams reminder from Flow 2 is the one to act on; the colour is a quick visual cue.

## Connectors used

| Connector | Used for | Class in Power Automate | Phase |
|---|---|---|---|
| Office 365 Outlook | shared mailbox trigger; send from the shared mailbox | Standard [L1] | 1 |
| SharePoint | get, create and update items; item trigger | Standard [L2] | 1 |
| Microsoft Teams | post card and wait; post card; post message | Standard [L3] | 1 |
| Approvals | start and wait for an approval | Standard [L4] | 1 |
| Built-in actions (Recurrence, Compose, Select, Filter array, Parse JSON, variables, Condition, Switch, Do until, Apply to each, Scope, Terminate) | logic | built in, no connection | 1 |
| AI Builder (Run a prompt) | phase 2 reading of the email | premium: "A Power Automate flow that uses any AI Builder action is a premium flow" [L17] | 2 only |

No HTTP connector and no custom connector is used. SharePoint, Microsoft Teams, Microsoft 365 Outlook and Approvals are on Microsoft's list of connectors that data policies cannot block; they can be classified as Business or Non-Business [L19]. Put all of them in the Business group.

## Sources (all read 3 Nov 2026)

- [L1] Office 365 Outlook connector reference: https://learn.microsoft.com/en-us/connectors/office365/
- [L2] SharePoint connector reference: https://learn.microsoft.com/en-us/connectors/sharepointonline/
- [L3] Microsoft Teams connector reference: https://learn.microsoft.com/en-us/connectors/teams/
- [L4] Approvals connector reference: https://learn.microsoft.com/en-us/connectors/approvals/
- [L5] Reference guide to workflow expression functions (used by Power Automate): https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-functions-reference
- [L6] Microsoft Graph message resource (receivedDateTime is UTC): https://learn.microsoft.com/en-us/graph/api/resources/message
- [L7] Loops: Until runs its actions, then checks the condition; defaults 60 iterations and PT1H; sequential For each: https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-control-flow-loops
- [L8] Variables: declared at the top level only: https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-create-variables-store-values
- [L9] Power Automate limits (30-day run duration, Until iterations): https://learn.microsoft.com/en-us/power-automate/limits-and-config
- [L10] Overview of adaptive cards for Teams: https://learn.microsoft.com/en-us/power-automate/overview-adaptive-cards
- [L11] Create flows that post adaptive cards to Microsoft Teams: https://learn.microsoft.com/en-us/power-automate/create-adaptive-cards
- [L12] Teams card reference (Adaptive Card versions supported, Teams limitations): https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-reference
- [L13] Run a cloud flow on a schedule: https://learn.microsoft.com/en-us/power-automate/run-scheduled-tasks
- [L14] Error handling in flows (Microsoft coding guidelines) (run after, scopes, run link): https://learn.microsoft.com/en-us/power-automate/guidance/coding-guidelines/error-handling
- [L15] Understand flow failure notifications: https://learn.microsoft.com/en-us/power-automate/understand-flow-failure-notifications
- [L16] Use your prompt in Power Automate (Run a prompt; human review): https://learn.microsoft.com/en-us/ai-builder/use-a-custom-prompt-in-flow
- [L17] AI Builder licensing overview: https://learn.microsoft.com/en-us/ai-builder/administer-licensing
- [L18] End of AI Builder credits: https://learn.microsoft.com/en-us/ai-builder/endofaibcredits
- [L19] Data policies, connector classification: https://learn.microsoft.com/en-us/power-platform/admin/dlp-connector-classification
- [L20] Shared mailboxes in Exchange Online: https://learn.microsoft.com/en-us/exchange/collaboration-exo/shared-mailboxes
- [L21] Default time zones (United Kingdom: GMT Standard Time): https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/default-time-zones
- [L22] Field element (AppendOnly applies when versioning is enabled): https://learn.microsoft.com/en-us/sharepoint/dev/schema/field-element-field
- Shanly Homes' published rules: https://www.shanlyhomes.com/buying-with-us/customer-care and https://www.shanlyhomes.com/buying-with-us/new-homes-quality-code (read 3 Nov 2026)
