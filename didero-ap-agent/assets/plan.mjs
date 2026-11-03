// The deployment plan for one customer, in Didero's terms: 18 days from ERP connect to the first
// end-to-end automation. Illustrative; gates are the numbers I would agree with the customer's controller.
export const PHASES = [
  {
    id: 'pre', from: -14, to: 0, title: 'Before day 1: access and evidence',
    goal: 'Access, security and data work done before the 18 days start.',
    who: 'Customer sponsor, IT and security, ERP admin, AP lead; Didero deployment and FDE.',
    outputs: ['Security review and data processing agreement signed', 'Read-only ERP user and a sandbox company', 'Access to the AP inbox and the buyers\' inboxes, where acknowledgements actually land', 'Day-1 data pulled (list below)', 'Baseline measured: exception rate, cycle time, past-due lines, chases per week'],
    gate: 'Read access works in the sandbox; the data pull is complete; baseline signed off by the AP lead.',
  },
  {
    id: 'map', from: 1, to: 3, title: 'Map the work, agree the rules',
    goal: 'One workflow mapped to the step, with every human decision point named.',
    who: 'AP lead, two clerks, two buyers, financial controller.',
    outputs: ['Current-state map from shadowing the clerks and buyers', 'Exception taxonomy agreed (the reason codes in the kit)', 'Tolerances, carriage allowances and the supervised limit signed by the controller', 'Chase cadence and escalation agreed with purchasing', 'Who resolves what, with response times'],
    gate: 'The controller signs the rules sheet. Anything not on it stays with a person.',
  },
  {
    id: 'shadow', from: 4, to: 8, title: 'Shadow: the agent recommends, people decide',
    goal: 'Evidence that the agent agrees with the clerks before it acts. Didero’s own advice: a sandbox first, experts vet the output.',
    who: 'Clerks and buyers review every recommendation; deployment strategist runs the daily review.',
    outputs: ['Agent runs on live mail in recommend-only mode; nothing is written', 'Daily disagreement review: each one either changes a rule or joins the test set', 'Test set built from the customer’s own history, including its last fraud attempt if there was one'],
    gate: 'Agreement with the clerks of at least 95% on at least 200 items; no missed duplicate; every bank-detail change held.',
  },
  {
    id: 'tune', from: 9, to: 12, title: 'Tune on their history',
    goal: 'Rules and prompts tuned against the test set, with no safety regressions.',
    who: 'Deployment strategist with Didero product and engineering for anything that needs a code change.',
    outputs: ['Tolerance and cadence sweeps run on the test set', 'Extraction checked field by field on the customer’s real document layouts', 'Approval routing and notifications live in the channel the team already uses', 'Kill switch tested: one setting returns every action to recommend-only'],
    gate: 'Field accuracy at least 98% on required fields; zero unsafe auto-actions on the test set; the AP lead signs the tuning log.',
  },
  {
    id: 'live', from: 13, to: 17, title: 'Supervised go-live, lowest risk first',
    goal: 'Autonomy switched on in order of risk: acknowledgements and chasing first, invoice matching second.',
    who: 'Named queue owner in AP and in purchasing; controller on call.',
    outputs: ['Day 13: on-time acknowledgements and chase drafts handled by the agent, sends approved', 'Day 15: matched invoices under the supervised limit marked ready for the payment run', 'Every override logged with its reason, for the tuning log', 'Daily stand-up on the queue: age, volume, overrides'],
    gate: 'Queue answered within the agreed response time; overrides under 5% of agent actions; no go-live in month-end close week.',
  },
  {
    id: 'first', from: 18, to: 18, title: 'Day 18: first end-to-end automation',
    goal: 'An invoice or a PO moves from inbox to ERP with no one touching it, inside the agreed limits, with a full audit trail.',
    who: 'Sponsor, controller, AP lead.',
    outputs: ['First automated end-to-end run recorded and walked through with the controller', 'Handover: runbook, queue ownership, rules sheet, test set'],
    gate: 'The controller agrees the trail is complete enough for audit.',
  },
  {
    id: 'value', from: 19, to: 90, title: 'Days 19 to 90: adoption and value',
    goal: 'Value reported against the customer’s own baseline, then one more workflow at a time.',
    who: 'Sponsor, AP lead, purchasing lead; Didero account team.',
    outputs: ['Day 30, 60 and 90 value reports: touchless rate, exception rate by reason, cycle time, past-due lines, chase response time, hours returned', 'Supervised limit raised as accuracy holds', 'Next workflow chosen from the exception data (for example credit-note requests or carrier invoices)', 'Product feedback filed from the disagreement log'],
    gate: 'The sponsor accepts the day 90 report and agrees the next workflow.',
  },
];

export const DAY1_DATA = [
  'Three to six months of purchase orders, goods receipts and invoices, with the clerks’ hold and exception reasons',
  'Supplier master, including the bank-detail change log and phone numbers on file',
  'Current tolerances, carriage terms and the approval matrix',
  'A sample of acknowledgement and delivery emails from the top 20 suppliers',
  'The chase history: who chases what, when, and how often',
  'Baseline KPIs for the same period',
];

export const ROLES = [
  ['Sponsor', 'Owns the outcome and the day 90 decision.'],
  ['Financial controller', 'Owns tolerances, the supervised limit and go-live sign-off.'],
  ['AP lead', 'Owns the AP queue, the rules sheet and the baseline.'],
  ['Buyers', 'Own acknowledgement changes, chases and escalations.'],
  ['ERP admin and IT security', 'Own access, the sandbox and the security review.'],
  ['Didero deployment strategist', 'Runs the plan, configures and tunes the agents, writes the playbook.'],
  ['Didero forward deployed engineer', 'Owns integration work and anything that needs code.'],
];

export const CHANGE = [
  'A named owner for each queue, with a response time the team agreed',
  'Short training for clerks and buyers on their own exceptions, run in the first shadow days',
  'A note to suppliers: nothing changes for them',
  'No go-live in month-end close week',
  'A kill switch the AP lead can use without asking anyone',
];
