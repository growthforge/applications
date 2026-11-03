# Draft requirements: Salesforce and Xero billing integration

**Client:** Marlowe Row Maintenance (illustrative client)
**Source:** `call.json`, lines L01 to L53
**Status:** First draft for consultant review. Not checked with the client.

## How to read this

- **Direction of data.** Salesforce to Xero: creating invoice drafts. Xero to Salesforce: payment position, credit notes, voids and balances. Board reporting: regional totals from Xero.
- **Priorities** are my first pass from what the transcript says. Nobody on the client side has ranked them.
- **Owen** is named as the person who types invoices into Xero (L02) and as the VAT expert (L17). The finance manager describes doing that work (L13, L22), so I have treated them as one person. The transcript does not state this directly.
- **Square brackets** such as [monthly amount] are placeholders. The transcript gives no figures for them, so none have been invented.
- **Unclear** means the transcript does not settle the point. **Assumption** means I have built the requirement on a stated guess that the consultant should confirm.

## Summary

21 Must, 6 Should, 1 Could.

| ID | Title | Priority | Source lines |
|---|---|---|---|
| REQ-01 | Structured billing fields on the opportunity | Must | L05, L06, L27, L29 |
| REQ-02 | Planned maintenance billed monthly in advance | Must | L02, L03, L05 |
| REQ-03 | Repair invoice on job completion | Must | L07, L09, L10, L11 |
| REQ-04 | Repair invoice uses confirmed final amount | Must | L10, L11 |
| REQ-05 | Deposit invoice for large repairs | Should | L08 |
| REQ-06 | Annual April index uplift | Must | L06 |
| REQ-07 | Invoice lines and account codes | Must | L12, L13 |
| REQ-08 | VAT treatment per line | Must | L15, L16, L17 |
| REQ-09 | Region tracking category on every invoice | Must | L18, L19, L20 |
| REQ-10 | Job type tracking category | Could | L19 |
| REQ-11 | One Xero contact per customer, no guessing | Must | L40, L41 |
| REQ-12 | Invoice addressed to the managing agent | Must | L27 |
| REQ-13 | PO number on housing association invoices | Must | L27 |
| REQ-14 | Payment terms per customer | Must | L29 |
| REQ-15 | Finance approval before anything is sent | Must | L21, L22 |
| REQ-16 | Delegate approver during absence | Must | L22 |
| REQ-17 | Same-day sync | Should | L23, L24, L25 |
| REQ-18 | Changes after invoicing flagged, not duplicated | Must | L30, L31, L32 |
| REQ-19 | Voided and redone invoice never counts twice | Must | L32, L38, L39 |
| REQ-20 | Payment position visible in Salesforce | Should | L33, L34, L35, L52 |
| REQ-21 | Credit notes visible against the job | Should | L36, L37 |
| REQ-22 | Automated overdue reminders | Should | L27, L48, L49, L50 |
| REQ-23 | One exception list for failed or held records | Must | L43, L44 |
| REQ-24 | Morning failure email to the finance manager only | Must | L44, L52 |
| REQ-25 | Nothing goes missing (daily reconciliation) | Must | L43, L45 |
| REQ-26 | Visibility in Salesforce by role | Must | L51, L52 |
| REQ-27 | Cutover without double entry | Must | L46, L47 |
| REQ-28 | Month-end volume of about 600 invoices | Should | L02, L03 |

## A. Triggers and invoice creation

### REQ-01: Structured billing fields on the opportunity
- **Actor:** Sales rep (enters), integration (reads)
- **Trigger:** Opportunity saved as Closed Won
- **Rule:** Each won deal carries structured fields for billing type, start date, term (12 or 24 months), monthly amount, PO required, billing contact and payment terms. The integration reads these fields and never free-text notes.
- **Acceptance criteria:**
  - Given a Closed Won planned maintenance opportunity with no start date, when the sync runs, then no invoices are created and the opportunity appears on the exception list as "start date missing".
  - Given a Closed Won opportunity with all fields completed, when the sync runs, then the schedule and invoice drafts use those field values.
- **Priority:** Must
- **Source lines:** L05, L06, L27, L29
- **Unclear / assumption:** L05 says the start date goes in the opportunity notes "Sometimes." The transcript does not say which of these fields already exist in Salesforce. Assumption: sales will complete them.

### REQ-02: Planned maintenance billed monthly in advance
- **Actor:** Integration (creates drafts), finance manager (approves under REQ-15)
- **Trigger:** Closed Won planned maintenance contract with a valid start date and term, then each billing period
- **Rule:** The integration creates one invoice draft per billing month of the contract term, at the contract's monthly amount. This replaces the month-end pile of planned maintenance invoices that is currently keyed by hand.
- **Acceptance criteria:**
  - Given a Closed Won 12-month planned maintenance contract starting [start month] at [monthly amount], when the sync runs, then 12 monthly drafts are scheduled, one per billing month, each for [monthly amount].
  - Given a draft already exists for a billing month, when the sync runs again, then no second draft is created for that month.
- **Priority:** Must
- **Source lines:** L02, L03, L05
- **Unclear / assumption:** The transcript does not say how far ahead of each billing month a draft should appear, or whether drafts are created for the whole term up front. Assumption: one billing period ahead.

### REQ-03: Repair invoice on job completion, not at Closed Won
- **Actor:** Engineer or finance manager (records completion), integration (creates draft)
- **Trigger:** Repair job marked complete
- **Rule:** A repair invoice draft is created when the job is done, not when the deal is won. Closed Won on its own creates nothing for a one-off repair.
- **Acceptance criteria:**
  - Given a Closed Won repair opportunity whose job is not yet complete, when the sync runs, then no invoice draft is created.
  - Given the job is marked complete, when the next sync runs, then one repair invoice draft is created for the job.
- **Priority:** Must
- **Source lines:** L07, L09, L10, L11
- **Unclear / assumption:** The transcript says "Owen knows" (L10) and that the finance manager checks with engineers (L11). It does not say how completion is recorded (a Salesforce field, the job sheet, or a conversation). Assumption: completion can be set in Salesforce.

### REQ-04: Repair invoice uses the confirmed final amount
- **Actor:** Finance manager
- **Trigger:** Engineers confirm the final cost of a completed repair
- **Rule:** The repair invoice amount is the confirmed final amount, because parts often change the price. The quote stays on the opportunity for reference and is not used as the invoice amount.
- **Acceptance criteria:**
  - Given a repair quoted at [quote amount] and a confirmed final amount of [final amount], when the finance manager enters the final amount, then the draft shows [final amount] and the quote is shown for reference only.
  - Given a job is complete but no final amount has been entered, when the sync runs, then no draft is created and the job appears on the exception list as "final amount missing".
- **Priority:** Must
- **Source lines:** L10, L11
- **Unclear / assumption:** The transcript does not say whether the final amount is entered in Salesforce or Xero. Assumption: Salesforce.

### REQ-05: Deposit invoice for large repairs
- **Actor:** Sales rep (sets deposit), integration (creates draft), finance manager (approves)
- **Trigger:** Large repair marked Closed Won with a deposit flagged
- **Rule:** The integration creates a separate deposit invoice draft for the deposit amount entered on the opportunity. The amount is set per job, because the transcript says "half, usually. Not always half."
- **Acceptance criteria:**
  - Given a large repair with a deposit of [deposit amount] entered, when the sync runs, then one deposit draft is created for [deposit amount].
  - Given a flagged repair with no deposit amount, when the sync runs, then no deposit draft is created and the job appears on the exception list as "deposit amount missing".
- **Priority:** Should
- **Source lines:** L08
- **Unclear / assumption:** The transcript does not define a "large" repair, does not say who sets the deposit, and does not say whether the final invoice deducts a deposit already paid. Assumption: the deposit is a separate invoice with a manually entered amount.

### REQ-06: Annual index uplift for planned maintenance
- **Actor:** Finance manager (confirms), integration (applies)
- **Trigger:** Start of each April
- **Rule:** Each active planned maintenance contract's monthly amount rises by that year's index figure from the April billing month, so billed amounts stay correct. Uplifted drafts go through the same approval as any other draft.
- **Acceptance criteria:**
  - Given an active contract at [monthly amount] and an index rise of [index %], when the April drafts are created, then each draft shows [uplifted monthly amount].
  - Given uplifted drafts are awaiting approval, when the finance manager opens the approval queue, then each shows the previous amount alongside the new one.
- **Priority:** Must
- **Source lines:** L06
- **Unclear / assumption:** The transcript does not name the index (for example CPI or RPI), the method, or whether the uplift applies to every contract on 1 April or on each contract's anniversary. It says "every April", so I have assumed all active contracts. It is also unclear whether Salesforce or Xero holds the uplifted amount.

## B. Invoice content and tax

### REQ-07: Invoice lines carry description, quantity, price and account code
- **Actor:** Integration
- **Trigger:** Draft invoice created (REQ-02, REQ-03, REQ-05)
- **Rule:** Each line carries a description, quantity and unit price taken from the opportunity, plus the revenue account: 200 for planned maintenance and 210 for repairs. The finance manager no longer picks the code by hand.
- **Acceptance criteria:**
  - Given a planned maintenance draft, when it is created, then its lines use account 200.
  - Given a repair draft, when it is created, then its lines use account 210.
  - Given an opportunity whose billing type has no account mapping, when the sync runs, then no draft is created and the record appears on the exception list.
- **Priority:** Must
- **Source lines:** L12, L13
- **Unclear / assumption:** The transcript says "two hundred" and "two ten", which I have read as account codes 200 and 210. Confirm against the Xero chart of accounts. The transcript also does not say whether a repair needs more than one line, for example parts and labour separately.

### REQ-08: VAT treatment per invoice line
- **Actor:** Accountant (sets rules), finance manager (resolves exceptions), integration (applies)
- **Trigger:** Draft invoice created
- **Rule:** Standard work takes 20% VAT. Zero-rated new-build work, exempt housing-association work and reverse-charge subcontractor work need rules from the accountant before the integration applies them. Until then those lines are held for finance rather than given a guessed rate.
- **Acceptance criteria:**
  - Given a standard-rated repair or planned maintenance line, when the draft is created, then the line carries 20% VAT.
  - Given a line on a customer or job with a non-standard VAT treatment and no confirmed rule, when the sync runs, then no draft is created and the line appears on the exception list as "VAT treatment to confirm".
- **Priority:** Must
- **Source lines:** L15, L16, L17
- **Unclear / assumption:** The finance manager says "I think" about the exempt housing associations and "I would need to ask our accountant" about reverse charge (L16), so those treatments are unconfirmed. The transcript does not say which customers or job types they apply to.

### REQ-09: Region tracking category on every invoice
- **Actor:** Integration (sets), MD (reads board numbers)
- **Trigger:** Draft invoice created
- **Rule:** Each invoice carries its region (North or South) as the Xero tracking category, so the monthly regional totals for the board pack can come straight from Xero.
- **Acceptance criteria:**
  - Given an invoice for a job in the North region, when it is created, then the Xero region category is North.
  - Given a month has ended, when regional totals are run, then the North and South totals add up to the total of all invoices created that month, with no unassigned invoices.
- **Priority:** Must
- **Source lines:** L18, L19, L20
- **Unclear / assumption:** The transcript does not say where the region sits in Salesforce or how a job is assigned to North or South. Assumption: region is a field on the account or opportunity.

### REQ-10: Job type tracking category
- **Actor:** Integration
- **Trigger:** Draft invoice created
- **Rule:** The second Xero tracking category, which the finance manager says was set up for job type and is not used, is filled from the billing type (planned maintenance or repair).
- **Acceptance criteria:**
  - Given a planned maintenance draft, when it is created, then the job type category is set to planned maintenance.
  - Given a repair draft, when it is created, then the job type category is set to repair.
- **Priority:** Could
- **Source lines:** L19
- **Unclear / assumption:** Not requested. The MD asked only for regional numbers (L20), and the finance manager says "I think" the category exists. Build only if the finance manager wants it.

## C. Customers and billing contacts

### REQ-11: Each customer matched to one Xero contact, never guessed
- **Actor:** Integration (matches), finance manager (resolves exceptions)
- **Trigger:** A draft is about to be created for a Salesforce account
- **Rule:** Each Salesforce account links to exactly one Xero contact. If the match is missing or uncertain, the integration creates nothing and asks the finance manager to choose, since she would rather it "stopped and asked" than guessed (L41).
- **Acceptance criteria:**
  - Given a Salesforce account with exactly one matching Xero contact, when the sync runs, then the draft is created against that contact.
  - Given two Xero contacts with near-identical names for one account, when the sync runs, then no draft is created and the account appears on the exception list for a manual link.
- **Priority:** Must
- **Source lines:** L40, L41
- **Unclear / assumption:** There are about 400 Xero contacts with around 30 duplicates (L41). The transcript does not say whether the duplicates are cleaned up before go-live, or by whom. Assumption: cleanup is a separate pre-go-live task.

### REQ-12: Invoice addressed to the managing agent, not the landlord
- **Actor:** Integration
- **Trigger:** Draft invoice created for a customer with a separate billing contact
- **Rule:** The invoice is addressed to the bill-to contact, which is the managing agent, while the Salesforce customer remains the landlord. Invoices must not go to the landlord where a managing agent is the bill-to contact.
- **Acceptance criteria:**
  - Given a housing association with managing agent [agent name] as billing contact, when the draft is created, then the invoice is addressed to [agent name], and the Salesforce account still shows the landlord.
  - Given a customer with no separate billing contact, when the draft is created, then the invoice is addressed to the customer account.
- **Priority:** Must
- **Source lines:** L27
- **Unclear / assumption:** The transcript ties this to housing associations and does not say whether the rule applies to every customer that has a managing agent. Assumption: a bill-to contact field is needed on the Salesforce account or opportunity.

### REQ-13: PO number on housing association invoices
- **Actor:** Sales rep (enters PO), integration (checks and prints)
- **Trigger:** Draft invoice created for a customer that requires a PO
- **Rule:** A housing association invoice needs a PO number, and the integration does not create the draft without one, because the customer sends invoices back when the PO is missing.
- **Acceptance criteria:**
  - Given a housing association opportunity with no PO number, when the sync runs, then no draft is created and the record appears on the exception list as "PO missing".
  - Given a PO number is entered, when the draft is created, then the PO number appears on the invoice.
- **Priority:** Must
- **Source lines:** L27
- **Unclear / assumption:** The transcript does not say where the PO comes from (the sales rep, the customer's order, or a portal). Assumption: the sales rep enters it on the opportunity.

### REQ-14: Payment terms per customer
- **Actor:** Finance manager (sets terms), integration (applies)
- **Trigger:** Draft invoice created
- **Rule:** Each invoice takes its due date from the customer's payment terms: 30 days by default, 45 days for housing associations, and 60 days for one named housing association.
- **Acceptance criteria:**
  - Given a standard customer, when the draft is created, then the due date is 30 days after the invoice date.
  - Given a housing association on 45-day terms, when the draft is created, then the due date is 45 days after the invoice date.
  - Given the housing association on 60-day terms, when the draft is created, then the due date is 60 days after the invoice date.
- **Priority:** Must
- **Source lines:** L29
- **Unclear / assumption:** The transcript says "forty five for the housing associations" in general and "sixty for one of them", so it does not list which customers have which terms or where terms are held. Assumption: 30 days runs from the invoice date.

## D. Approval

### REQ-15: Finance approves every invoice before the customer receives it
- **Actor:** Finance manager (approves), integration (holds drafts)
- **Trigger:** Draft invoice created
- **Rule:** Every invoice is created as an unsent draft and is released to the customer only after the finance manager approves it. Nothing reaches a customer unseen.
- **Acceptance criteria:**
  - Given a new draft, when the sync runs, then the invoice is in the approval queue and has not been sent to the customer.
  - Given a draft is not approved, when days pass, then it remains unsent, because nothing is released automatically.
  - Given the finance manager approves a draft, when approval is recorded, then the approver's name and time are logged and the invoice is released.
- **Priority:** Must
- **Source lines:** L21, L22
- **Unclear / assumption:** The transcript does not say whether approval happens inside Xero or in a queue elsewhere. It is also unclear whether "every one" (L22) means approving each invoice individually at about 600 a month (L02). Assumption: one-by-one approval, with batch approval raised as a question.

### REQ-16: Named delegate approves during the finance manager's absence
- **Actor:** Finance manager (names delegate), delegate (approves)
- **Trigger:** Finance manager is away, for example the last week of each month (L22)
- **Rule:** The finance manager can name a delegate for a set period. The delegate can approve drafts during that period, and approvals are logged under the delegate's name.
- **Acceptance criteria:**
  - Given a delegate is named for the last week of the month, when drafts are waiting for approval, then the delegate can approve them.
  - Given the period ends, when a draft is waiting for approval, then only the finance manager can approve it.
- **Priority:** Must
- **Source lines:** L22
- **Unclear / assumption:** The transcript does not name the delegate or say whether they have Xero and Salesforce access. Assumption: the delegate needs access to the approval queue.

### REQ-17: Same-day sync
- **Actor:** Integration
- **Trigger:** Closed Won or job completion on a working day
- **Rule:** A change in Salesforce that creates or alters an invoice appears as a draft or on the exception list by the end of that working day. The MD said "not days. Before the end of the day, ideally" (L25).
- **Acceptance criteria:**
  - Given a deal is marked Closed Won at 09:00 on a working day, when the sync runs, then the resulting draft or exception is visible by the end of that working day.
  - Given a record fails during the day, when the failure occurs, then it is on the exception list the same day (see REQ-23).
- **Priority:** Should
- **Source lines:** L23, L24, L25
- **Unclear / assumption:** "Quick" is defined only as "before the end of the day", and the MD said "ideally", so this is a soft target. The sync frequency and cut-off time are not set.

## E. Changes, voids and duplicates

### REQ-18: Change after invoicing is flagged, never duplicated
- **Actor:** Sales rep (changes the amount), finance manager (corrects in Xero)
- **Trigger:** The amount on a Salesforce opportunity changes after an invoice exists for it
- **Rule:** The integration never creates a second invoice for the same job. If the invoice is already approved or sent, the integration leaves it unchanged and flags the difference to the finance manager, who corrects it in Xero.
- **Acceptance criteria:**
  - Given invoice [invoice number] exists for [original amount] and the Salesforce amount changes to [new amount], when the sync runs, then no new invoice is created, the Xero invoice is unchanged, and an exception "amount changed after invoicing" is raised for the finance manager.
  - Given the finance manager corrects the invoice in Xero, when the next sync runs, then the exception clears and still no new invoice is created.
- **Priority:** Must
- **Source lines:** L30, L31, L32
- **Unclear / assumption:** The finance manager wants to "know about it" and "sort it out in Xero" (L31), so I have not made the integration push changes to sent invoices. The transcript does not say what happens to planned maintenance months not yet drafted when a price changes. Assumption: a change to an unapproved draft may update that draft; a change to an approved or sent invoice is flagged only.

### REQ-19: Voided and redone invoice never counts twice
- **Actor:** Finance manager (voids and redoes in Xero), integration (reflects in Salesforce)
- **Trigger:** Invoice voided in Xero
- **Rule:** A voided invoice shows as void against its job in Salesforce, and the replacement invoice is the only live invoice for that job, so the job is never counted twice in reporting.
- **Acceptance criteria:**
  - Given invoice [A] is voided and replacement invoice [B] is raised for the same job, when the sync runs, then Salesforce shows [A] as void, [B] as live, and the job's billed total counts [B] only.
  - Given an invoice is voided with no replacement, when the sync runs, then the job shows as unbilled and appears on the exception list.
- **Priority:** Must
- **Source lines:** L32, L38, L39
- **Unclear / assumption:** The transcript does not say how a replacement is linked to its original. Assumption: both carry the same job or opportunity reference.

## F. Payments, credit notes and reminders

### REQ-20: Payment position visible in Salesforce
- **Actor:** Sales rep (reads), integration (reads from Xero)
- **Trigger:** Payment matched to an invoice in Xero, or an invoice passing its due date
- **Rule:** Salesforce shows each invoice as awaiting payment, part-paid (with the balance still due) or paid, and flags the customer as overdue where applicable. Sales can then see this before sending a new quote.
- **Acceptance criteria:**
  - Given an invoice of [invoice amount] with [part amount] paid and matched in Xero, when the sync runs, then Salesforce shows "part-paid" with [balance] due, not "awaiting payment".
  - Given a customer has an invoice past its due date, when a sales rep opens the account before quoting, then an overdue flag is visible.
- **Priority:** Should
- **Source lines:** L33, L34, L35, L52
- **Unclear / assumption:** Payments show only once matched to the bank feed, which can take days (L34), so sales will see a lag. The transcript does not say how often status is refreshed. Assumption: status refreshes at each sync.

### REQ-21: Credit notes visible against the job
- **Actor:** Finance manager (raises in Xero), sales rep (reads in Salesforce)
- **Trigger:** Credit note raised in Xero against an invoice
- **Rule:** Credit notes flow back to the job they relate to in Salesforce as read-only records, so sales can see disputes against the job.
- **Acceptance criteria:**
  - Given a credit note is raised in Xero against invoice [number] for job [job], when the sync runs, then job [job] in Salesforce shows the credit note number, date and amount.
  - Given a credit note appears in Salesforce, when a sales user opens it, then it cannot be edited there.
- **Priority:** Should
- **Source lines:** L36, L37
- **Unclear / assumption:** The transcript says credit notes are raised in Xero when there is a dispute. Assumption: Xero is the only place credit notes are created.

### REQ-22: Automated overdue reminders
- **Actor:** Integration or Xero (sends), finance manager (sets rules)
- **Trigger:** Invoice still unpaid [threshold] days after its due date
- **Rule:** Overdue reminders go out automatically to the bill-to contact, replacing the Monday hand-written chase, and each reminder is logged against its invoice.
- **Acceptance criteria:**
  - Given an invoice is still unpaid [threshold] days after its due date, when the reminder run happens, then one reminder goes to the bill-to contact (the managing agent for a housing association), not the landlord.
  - Given an invoice is paid, when the reminder run happens, then no reminder is sent.
- **Priority:** Should
- **Source lines:** L27, L48, L49, L50
- **Unclear / assumption:** The finance manager "did not know Xero could send reminders by itself" (L49). The transcript does not say whether Xero's own reminders are enough or whether the integration must send them. Reminder timing, wording, and whether the finance manager approves each one are not stated.

## G. Monitoring and visibility

### REQ-23: One exception list for failed or held records
- **Actor:** Finance manager (works the list), integration (adds items)
- **Trigger:** Any record fails, is held or is flagged (REQ-03, REQ-04, REQ-08, REQ-11, REQ-13, REQ-18, REQ-19)
- **Rule:** Every failed or held item sits on one exception list showing the record, the reason and the action needed. It updates as things happen, not only at month end, and an item clears once it is resolved.
- **Acceptance criteria:**
  - Given a sync fails for opportunity [name], when the finance manager opens the exception list, then the item shows the record, the reason and the date first raised.
  - Given the finance manager resolves an item, when the next sync runs, then the item is removed and the resolution is logged.
- **Priority:** Must
- **Source lines:** L43, L44
- **Unclear / assumption:** The finance manager asks for "a list I can look at" and the transcript does not say where it lives (Salesforce, Xero, or a separate page). Assumption: a page the finance manager can open, with access as in REQ-26.

### REQ-24: Morning failure email to the finance manager only
- **Actor:** Integration (sends)
- **Trigger:** Each working morning, if anything has failed or been held since the last email
- **Rule:** The integration emails the finance manager a summary of anything that failed or was held since the last email. The MD is not a recipient, and no email is sent when nothing has failed.
- **Acceptance criteria:**
  - Given two items failed since the last email, when the morning email runs, then one email goes to the finance manager listing both, and none goes to the MD.
  - Given nothing has failed since the last email, when the morning email runs, then no email is sent.
- **Priority:** Must
- **Source lines:** L44, L52
- **Unclear / assumption:** The transcript says "in the morning" with no time. It does not say which address the email goes to. Assumption: the finance manager's own address.

### REQ-25: Nothing goes missing (daily reconciliation)
- **Actor:** Integration (reconciles), finance manager (reviews)
- **Trigger:** End of each working day
- **Rule:** Every Closed Won planned maintenance contract and every completed repair job must end up as a draft invoice, a scheduled invoice or an exception. A daily count reconciles these so nothing drops out silently.
- **Acceptance criteria:**
  - Given [N] deals were marked Closed Won and [M] jobs completed in a day, when reconciliation runs, then each appears exactly once as a draft, a scheduled invoice or an exception, and the counts agree.
  - Given a deal appears in none of those places, when reconciliation runs, then it is listed as a missing record for the finance manager.
- **Priority:** Must
- **Source lines:** L43, L45
- **Unclear / assumption:** "I do not care how it works as long as nothing goes missing" (L45) is the MD's test. The daily cadence is my proposal, not from the transcript.

### REQ-26: Visibility in Salesforce by role
- **Actor:** Sales users, finance users
- **Trigger:** A user opens an opportunity or account
- **Rule:** Finance sees sync status, exceptions and finance fields. Sales sees payment position (REQ-20) and credit notes, but not sync errors or exception details.
- **Acceptance criteria:**
  - Given a sales user opens an account, when the record loads, then payment status and credit notes are shown, and no sync error or exception field is shown.
  - Given a finance user opens the same record, when it loads, then sync errors and exceptions are shown.
- **Priority:** Must
- **Source lines:** L37, L51, L52
- **Unclear / assumption:** The finance manager says "Finance, and me" (L52) and does not say whether the MD should see finance data in Salesforce. Assumption: the MD gets reports (L20), not the exception screen.

## H. Cutover, volume and access

### REQ-27: Cutover without double entry
- **Actor:** Finance manager (signs off), integration (loads)
- **Trigger:** Go-live at the chosen cutover month
- **Rule:** The team picks a cutover month. From then on invoices come from the integration and manual typing stops. Invoices already in Xero are never re-created, and running contracts start their schedule at the next billing month after cutover rather than their original start date.
- **Acceptance criteria:**
  - Given a cutover month of [month], when the first sync runs, then no draft is created for any billing period already invoiced in Xero.
  - Given a contract that started before cutover, when its schedule loads, then its first draft is for the next billing month after cutover, and the remaining months follow its term.
  - Given the finance manager signs off the list of pre-cutover billing, when sign-off is recorded, then go-live proceeds.
- **Priority:** Must
- **Source lines:** L46, L47
- **Unclear / assumption:** The transcript does not say how already-invoiced periods are matched to Salesforce records. Proposed, not from the transcript: a one-month parallel run checked by the finance manager, given that she is "nervous about doing it twice" (L47).

### REQ-28: Month-end volume of about 600 invoices
- **Actor:** Integration, finance manager
- **Trigger:** Month-end billing run
- **Rule:** The integration handles about 600 invoices a month, including the month-end planned maintenance peak, with no manual re-keying. Only approval remains manual.
- **Acceptance criteria:**
  - Given a month-end run producing about 600 drafts, when the run completes, then every draft is in the approval queue and any exceptions are on the exception list, with no manual re-keying.
  - Given the books close on the third working day (L03), when month-end drafts are created, then they can be approved before that close.
- **Priority:** Should
- **Source lines:** L02, L03
- **Unclear / assumption:** The transcript does not say how many of the 600 are planned maintenance, or whether approval must finish before the third-working-day close. The approval effort at this volume is raised under REQ-15.

## Discussed but not carried forward

- **One euro-paying customer (L42).** The MD does not want to spend money on it. Left out. The consultant should confirm how that customer will be billed.
- **Engineers' job sheets (L50).** The MD calls this "a separate headache". Only touched through REQ-03, because job completion is the trigger.
- **Vans and fuel cards (L14), office move (L02).** Tangents, not integration scope.
- **Contract PDF on the shared drive (L05).** Nobody asked for it to be linked to the opportunity. Ask whether it should be.

## Open questions for the client

1. Which index drives the April uplift, and in which system is it applied? (REQ-06, L06)
2. How is a repair job marked complete today, and is that recorded in Salesforce? (REQ-03, L10, L11, L50)
3. Does the final repair invoice deduct a deposit already paid? (REQ-05, L08)
4. Which customers and jobs are zero-rated, exempt or reverse charge, and what does the accountant confirm? (REQ-08, L16, L17)
5. Does the managing-agent bill-to rule apply only to housing associations? (REQ-12, L27)
6. Must every invoice be approved one by one at about 600 a month, or would batch approval work? (REQ-15, L02, L22)
7. Who is the delegate approver, and do they need Xero and Salesforce access? (REQ-16, L22)
8. Should the MD see finance data in Salesforce, or only reports? (REQ-26, L20, L52)
9. Who cleans up the roughly 30 duplicate Xero contacts, and is it done before go-live? (REQ-11, L41)
10. Are Xero's own reminders enough for the Monday chase? (REQ-22, L49)
11. Where are PO numbers, payment terms and regions held today? (REQ-01, REQ-09, REQ-13, REQ-14, L19, L27, L29)
12. Are planned maintenance drafts created one billing period ahead, or all at once for the whole term? (REQ-02, L03, L05)
