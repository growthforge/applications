# Deployment kit: AP invoice and PO-chasing agent

Prepared by Hemanth Vallamkonda as part of an application to Didero. Independent and illustrative. Thresholds are examples for the customer’s controller to set.

## 1. The plan (18 days from ERP connect to the first end-to-end automation)

### Before day 1: access and evidence (the two weeks before day 1)
Access, security and data work done before the 18 days start.

Who: Customer sponsor, IT and security, ERP admin, AP lead; Didero deployment and FDE.

- Security review and data processing agreement signed
- Read-only ERP user and a sandbox company
- Access to the AP inbox and the buyers' inboxes, where acknowledgements actually land
- Day-1 data pulled (list below)
- Baseline measured: exception rate, cycle time, past-due lines, chases per week

**Gate:** Read access works in the sandbox; the data pull is complete; baseline signed off by the AP lead.

### Map the work, agree the rules (days 1 to 3)
One workflow mapped to the step, with every human decision point named.

Who: AP lead, two clerks, two buyers, financial controller.

- Current-state map from shadowing the clerks and buyers
- Exception taxonomy agreed (the reason codes in the kit)
- Tolerances, carriage allowances and the supervised limit signed by the controller
- Chase cadence and escalation agreed with purchasing
- Who resolves what, with response times

**Gate:** The controller signs the rules sheet. Anything not on it stays with a person.

### Shadow: the agent recommends, people decide (days 4 to 8)
Evidence that the agent agrees with the clerks before it acts. Didero’s own advice: a sandbox first, experts vet the output.

Who: Clerks and buyers review every recommendation; deployment strategist runs the daily review.

- Agent runs on live mail in recommend-only mode; nothing is written
- Daily disagreement review: each one either changes a rule or joins the test set
- Test set built from the customer’s own history, including its last fraud attempt if there was one

**Gate:** Agreement with the clerks of at least 95% on at least 200 items; no missed duplicate; every bank-detail change held.

### Tune on their history (days 9 to 12)
Rules and prompts tuned against the test set, with no safety regressions.

Who: Deployment strategist with Didero product and engineering for anything that needs a code change.

- Tolerance and cadence sweeps run on the test set
- Extraction checked field by field on the customer’s real document layouts
- Approval routing and notifications live in the channel the team already uses
- Kill switch tested: one setting returns every action to recommend-only
- ERP write access granted only for the fields the agent may change (confirmed date and price on acknowledgements), and tested in the sandbox company: one write confirmed by reading it back, one failed write left with a person

**Gate:** Field accuracy at least 98% on required fields; zero unsafe auto-actions on the test set; scoped write access tested in the sandbox; the AP lead signs the tuning log.

### Supervised go-live, lowest risk first (days 13 to 17)
Autonomy switched on in order of risk: acknowledgements and chasing first, invoice matching second.

Who: Named queue owner in AP and in purchasing; controller on call.

- Day 13: on-time acknowledgements and chase drafts handled by the agent, sends approved
- Day 15: matched invoices under the supervised limit marked ready for the payment run
- Every override logged with its reason, for the tuning log
- Daily stand-up on the queue: age, volume, overrides

**Gate:** Queue answered within the agreed response time; overrides under 5% of agent actions; no go-live in month-end close week.

### Day 18: first end-to-end automation
An invoice or a PO moves from inbox to ERP with no one touching it, inside the agreed limits, with a full audit trail.

Who: Sponsor, controller, AP lead.

- First automated end-to-end run recorded and walked through with the controller
- Handover: runbook, queue ownership, rules sheet, test set

**Gate:** The controller agrees the trail is complete enough for audit.

### Days 19 to 90: adoption and value
Value reported against the customer’s own baseline, then one more workflow at a time.

Who: Sponsor, AP lead, purchasing lead; Didero account team.

- Day 30, 60 and 90 value reports: touchless rate, exception rate by reason, cycle time, past-due lines, chase response time, hours returned
- Supervised limit raised as accuracy holds
- Next workflow chosen from the exception data (for example credit-note requests or carrier invoices)
- Product feedback filed from the disagreement log

**Gate:** The sponsor accepts the day 90 report and agrees the next workflow.

## 2. Data needed on day 1
- Three to six months of purchase orders, goods receipts and invoices, with the clerks’ hold and exception reasons
- Supplier master, including the bank-detail change log and phone numbers on file
- Current tolerances, carriage terms and the approval matrix
- A sample of acknowledgement and delivery emails from the top 20 suppliers
- The chase history: who chases what, when, and how often
- Baseline KPIs for the same period

## 3. Roles
- **Sponsor:** Owns the outcome and the day 90 decision.
- **Financial controller:** Owns tolerances, the supervised limit and go-live sign-off.
- **AP lead:** Owns the AP queue, the rules sheet and the baseline.
- **Buyers:** Own acknowledgement changes, chases and escalations.
- **ERP admin and IT security:** Own access, the sandbox and the security review.
- **Didero deployment strategist:** Runs the plan, configures and tunes the agents, writes the playbook.
- **Didero forward deployed engineer:** Owns integration work and anything that needs code.

## 4. Discovery questions (days 1 to 3)
- Walk me through the last ten invoices that were held. Why each one, who released it, how long did it take?
- Where do acknowledgements arrive: the AP inbox, each buyer’s inbox, a portal, EDI?
- What counts as an acceptable price and quantity difference, by category? Who signs that off?
- Which suppliers send their own part numbers? Where is the cross-reference kept?
- How are carriage and surcharges agreed? On the PO, in a contract, or not at all?
- How are bank-detail changes handled today, and when was the last attempted fraud?
- Which POs do buyers chase, how often, and when do they pick up the phone?
- What is the approval matrix, and which steps happen in the ERP versus email?
- Which tax regime applies to each entity and supplier (UK VAT, including postponed VAT accounting on imports; EU VAT; US sales and use tax)? The tax check is set per entity.
- When is month-end close, and what must not change during it?
- What would make the AP lead switch the agent off?

## 5. Exception taxonomy and resolutions
| Code | Meaning | Usual next step | Resolutions offered |
|---|---|---|---|
| THREE_WAY_MATCH | Invoice, purchase order and goods receipt agree on supplier, items, quantities and prices. | Marked ready for the payment run by the agent. Payments are released by finance, never by the agent. | none: the agent acts |
| PRICE_WITHIN_TOLERANCE | A unit price differs from the PO by less than the agreed tolerance. | Treated as a match; the difference is logged for the monthly review. | none: the agent acts |
| PRICE_VARIANCE | A unit price differs from the PO by more than the agreed tolerance. | AP checks with the buyer: accept, or ask the supplier for a credit note. | Ask the supplier for a credit note; Buyer accepts the new price |
| QTY_NOT_RECEIVED | The invoice charges for more than has been booked in as received. | Held until the goods receipt is booked, or the supplier invoices the part delivered. | Hold until the goods receipt is booked; Pay for the quantity received only |
| QTY_ALREADY_INVOICED | Earlier invoices on this PO line already cover the quantity received or ordered. | Held: AP checks for a re-invoice before anything is paid. | Reject: already invoiced; Valid separate charge |
| QTY_OVER_ORDER | The invoice charges for more than the PO ordered. | AP asks the buyer whether a PO change was agreed. | Hold for the buyer |
| LINE_NOT_ON_PO | An invoice line does not appear on the purchase order. | AP asks the buyer; often a substitute part or a missing PO line. | Hold for the buyer |
| NO_PO_REFERENCE | The invoice gives no purchase order number. | The agent suggests a PO when exactly one matches the supplier and amount; a person confirms. | Match to the suggested PO; Ask the supplier to quote the PO |
| PO_NOT_FOUND | The PO number on the document does not exist. | AP checks with the supplier and the buyer. | Ask the supplier to check the PO |
| PO_SUPPLIER_MISMATCH | The PO quoted was raised with a different supplier. | AP checks before anything is matched. | Ask the supplier to check the PO |
| ARITHMETIC_MISMATCH | Lines, net, VAT and total do not reconcile. | AP asks the supplier for a corrected invoice. | Ask for a corrected invoice; Accept with controller sign-off |
| TAX_MISMATCH | VAT is not the standard rate on the net amount. | AP checks the VAT treatment before posting. | Ask for a corrected invoice; Accept with controller sign-off |
| DUPLICATE_INVOICE | This supplier invoice number has already been processed. | Blocked automatically; nothing is paid twice. | none: the agent acts |
| UNKNOWN_SUPPLIER | No supplier record matches the sender or the name. | Not paid. Onboarding and a PO are needed first. | Return to sender; Start supplier onboarding |
| SENDER_DOMAIN_MISMATCH | The supplier name is known but the email came from a different domain. | Held as a fraud signal; verified by phone on the number already on file. | Callback on the number on file: not genuine; Callback on the number on file: genuine |
| BANK_DETAILS_CHANGED | The bank details on the document differ from the supplier record. | Never paid or updated from an email. Verified by phone on the number already on file. | Callback on the number on file: not genuine; Callback on the number on file: genuine |
| EXTRACTION_LOW_CONFIDENCE | Required fields were missing, informal or ambiguous, or the model reply was unusable. | A person reads it; the case is added to the test set. | Ask for an itemised invoice; Enter the details by hand |
| ABOVE_AUTO_POST_LIMIT | Matched, but larger than the amount the agent may handle alone at the supervised stage of the trust ramp. | A person approves; the limit rises as accuracy is proven. | Approve for the payment run; Hold |
| ACK_LATE_WITHIN_TOLERANCE | The confirmed date is later than requested but within the agreed tolerance. | The agent records the date and tells planning. | none: the agent acts |
| ACK_PRICE_CHANGE | The supplier acknowledged the PO at a different price. | The buyer holds the supplier to the PO price or approves the change. | Hold the supplier to the PO price; Buyer accepts the new price |
| ACK_QTY_CHANGE | The supplier acknowledged a different quantity or a split delivery. | The buyer decides; planning is told. | Hold the supplier to the PO quantity; Buyer accepts the change |
| CARRIAGE_WITHIN_ALLOWANCE | A delivery charge within the amount agreed on the PO. | Accepted as part of the match. | none: the agent acts |
| CARRIAGE_NOT_AGREED | A delivery charge the PO does not allow, or above the allowance. | AP asks for an invoice without it, or the buyer accepts it. | Ask for an invoice without the charge; Buyer accepts the charge |
| SUPPLIER_SKU_MAPPED | The supplier used its own part number; the PO line holds the cross-reference. | Matched on the cross-reference. | none: the agent acts |
| PRICE_BELOW_PO | The supplier charged less than the PO price. | Accepted; logged for the buyer. | none: the agent acts |
| IMPORT_NO_UK_VAT | Goods bought from outside the UK carry no UK VAT on the supplier's invoice; import VAT is accounted for on the customs entry, usually through postponed VAT accounting. | Accepted for suppliers set up as importers of goods; the import VAT is checked on the monthly postponed import VAT statement. | none: the agent acts |
| REVERSE_CHARGE | An overseas supplier of services invoices without VAT; the buyer accounts for it under the reverse charge. | Accepted for service suppliers set up as reverse charge. | none: the agent acts |
| CURRENCY_MISMATCH | The invoice currency is not the PO currency. | Supplier asked to reissue in the PO currency. | Ask for an invoice in the PO currency |
| POSSIBLE_DUPLICATE | Same supplier, PO and amount as an invoice already processed, under a different number. | AP checks before anything is paid. | Reject as a duplicate; Valid separate charge |
| SENDER_DOMAIN_LOOKALIKE | Sent from a domain one or two characters away from a real supplier. | Held as possible payment fraud; verified by phone on the number on file. | Callback on the number on file: not genuine; Callback on the number on file: genuine |
| ESCALATE_TO_BUYER | The chase cadence is used up with no acknowledgement. | The buyer calls the supplier. | Buyer calls the supplier |
| PRE_DUE_CHECK | Due within two working days and no dispatch confirmation yet. | The agent drafts a dispatch check; the buyer approves before it is sent. | Send the check; Skip today |
| SHADOW_MODE | The trust ramp is at its first stage: the agent recommends and writes nothing. | A person agrees or disagrees; that record is the evidence for go-live. | Agree with the agent; Disagree |
| CREDIT_NOTE | A supplier credit against an earlier invoice. | AP matches it to the invoice and applies it. | Apply to the original invoice; Query with the supplier |
| CONFIRMED_ON_OR_BEFORE_REQUESTED | The supplier confirmed delivery on or before the requested date. | The agent records the confirmed date on the PO. | none: the agent acts |
| DELIVERY_LATER_THAN_REQUESTED | The supplier confirmed a date after the one requested. | The buyer accepts the date or pushes back; planning is told. | Accept the new date; Push back on the date |
| DELIVERY_DELAY | The supplier moved an already confirmed date later. | The buyer accepts or escalates; planning is told. | Accept the new date; Push back on the date |
| PAYMENT_QUERY | A supplier asks when an invoice will be paid. | The agent drafts a reply from the ledger; a person sends it. | Send the drafted reply |
| AUTO_REPLY | An out-of-office or automatic message. | Ignored and logged. | none: the agent acts |
| CHASE_ACK | The supplier has not confirmed the PO within the agreed working days. | The agent drafts a chase; the buyer approves before it is sent. | Send the chase; Skip today |
| CHASE_DELIVERY | The confirmed date has passed and the order is not fully received. | The agent drafts an expedite request; the buyer approves before it is sent. | Send the chase; Skip today |
| SENDER_NOT_PO_SUPPLIER | An order update came from someone other than the PO supplier. | A person checks before the PO changes. | Hold for the buyer |
| INVOICE_NOT_FOUND | The invoice in the query is not in the ledger. | AP checks with the supplier. | Route to AP |
| UNCLASSIFIED | The email is not a document the agent handles. | Routed to a person. | Route to AP |

## 6. Go-live checklist
- Controller has signed the rules sheet (tolerances, carriage, supervised limit, cadence)
- Shadow agreement with the clerks at or above the agreed level, on the agreed number of items
- No missed duplicate and every bank-detail change held during shadow and tuning
- Queue owners named, with response times; approvals arrive where the team already works
- Kill switch tested by the AP lead
- Not in month-end close week
- Audit trail walked through with the controller

## 7. Metrics (report at days 30, 60 and 90)
- **Touchless rate:** invoices marked ready for the payment run with no human touch, over all invoices received.
- **Exception rate by reason:** exceptions over invoices received, split by reason code. Ardent Partners (Feb 2025) reports a 14% average and 9.0% best-in-class; use as context only.
- **Invoice cycle time:** receipt to ready for the payment run, median and 90th percentile, against the baseline.
- **Acknowledgement rate within 48 hours, and past-due PO lines:** against the baseline.
- **Chase response time:** from chase sent to supplier reply.
- **Overrides:** share of agent actions a person changed, with the reason.
- **Hours returned:** from the clerks’ and buyers’ own time logs, before and after, confirmed by the AP lead.

## 8. Weekly customer update (template)
- What the agent did this week (counts by action) and what it sent to people (counts by reason)
- Overrides and what changed in the rules because of them
- Metrics against the baseline
- Decisions needed from the customer this week
- Next week’s step in the plan
