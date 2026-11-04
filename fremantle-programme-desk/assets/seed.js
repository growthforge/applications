/*
  seed.js: ILLUSTRATIVE DATA. Every name, label, number and date below is invented
  for this pack. Labels are fictional production-company names. Nothing here comes from
  any employer. Programme date is fixed so that the data stays internally consistent.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SEED = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FUNCTIONS = ['Finance', 'People', 'Legal and Business Affairs', 'Commercial and Distribution', 'Production Finance', 'Marketing and Communications', 'Technology', 'Procurement', 'Rights and Clearances'];
  const LABELS = ['Alder', 'Brindle', 'Cobalt', 'Dunmore', 'Ember'];
  const CONF = 'Confidential or rights-sensitive';

  const people = [
    { id: 'p-lead', name: 'Productivity AI Lead', role: 'Productivity AI Lead', unit: 'Technology', senior: true },
    { id: 'p-coord', name: 'AI Productivity Coordinator', role: 'AI Productivity Coordinator', unit: 'Technology' },
    { id: 'p-daniel', name: 'Daniel R.', role: 'Production accountant', unit: 'Production Finance' },
    { id: 'p-priya', name: 'Priya R.', role: 'Finance analyst', unit: 'Finance' },
    { id: 'p-rafael', name: 'Rafael D.', role: 'Finance business partner', unit: 'Finance' },
    { id: 'p-helena', name: 'Helena N.', role: 'Finance operations lead', unit: 'Finance' },
    { id: 'p-sofia', name: 'Sofia M.', role: 'People operations manager', unit: 'People' },
    { id: 'p-callum', name: 'Callum F.', role: 'People coordinator', unit: 'People' },
    { id: 'p-tariq', name: 'Tariq H.', role: 'Communications manager', unit: 'Marketing and Communications' },
    { id: 'p-ingrid', name: 'Ingrid L.', role: 'Director, Legal and Business Affairs', unit: 'Legal and Business Affairs', senior: true },
    { id: 'p-jonas', name: 'Jonas K.', role: 'Senior business affairs executive', unit: 'Legal and Business Affairs' },
    { id: 'p-marcus', name: 'Marcus B.', role: 'Distribution operations manager', unit: 'Commercial and Distribution' },
    { id: 'p-yuki', name: 'Yuki T.', role: 'Clearances manager', unit: 'Rights and Clearances' },
    { id: 'p-nikhil', name: 'Nikhil S.', role: 'Procurement manager', unit: 'Procurement' },
    { id: 'p-amara', name: 'Amara O.', role: 'Systems analyst', unit: 'Technology' },
    { id: 'p-chloe', name: 'Chloe B.', role: 'Production manager', unit: 'Alder' },
    { id: 'p-jamal', name: 'Jamal W.', role: 'Production coordinator', unit: 'Alder' },
    { id: 'p-ola', name: 'Oluwaseun A.', role: 'Business manager', unit: 'Brindle' },
    { id: 'p-fiona', name: 'Fiona M.', role: 'Head of production services', unit: 'Cobalt' },
    { id: 'p-g-finance', name: 'Finance (team)', role: 'Group, no named person', unit: 'Finance', group: true }
  ];

  const hist = (date, from, to, note) => ({ date, from, to, note: note || '' });

  const register = [
    {
      id: 'R-001', title: 'Production budget variance commentary', type: 'Useful GPT', function: 'Production Finance', label: '', owner: 'p-daniel', stage: 'Live', rag: 'Green',
      dataClass: 'Internal', signOff: '2026-08-14', budget: 'Function', task: 'draft-summarise',
      currentWorkflow: 'The production accountant writes variance commentary by hand from the weekly cost report, about 40 minutes per production.',
      redesignedWorkflow: 'The accountant pastes the cost report extract. The GPT drafts commentary against a house template. The accountant checks every figure and edits before it is used.',
      baselineMin: 40, withAiMin: 15, runsPerMonth: 120, unusedShare: 0.15, failedMin: 15, basis: 'Sampled',
      dataSource: 'Usage export from the GPT platform, monthly', exportedBy: 'Daniel R.',
      lastUpdate: '2026-10-27', nextMilestone: 'Add a second template for co-productions', nextMilestoneDate: '2026-11-20',
      howToUse: 'Drafts the weekly variance commentary from a pasted cost report extract.', notFor: 'Final figures or anything that has not been checked line by line.', championId: 'C-05',
      limitation: 'It only has the standard budget template, so commentary on a co-production needs a closer check.', workaround: 'Check the structure against the co-production budget by hand, or ask Daniel R.',
      history: [hist('2026-08-14', 'Pilot', 'Live', 'Sign-off recorded')]
    },
    {
      id: 'R-002', title: 'Weekly cash position summary', type: 'Claude Project', function: 'Finance', label: '', owner: 'p-priya', stage: 'Live', rag: 'Green',
      dataClass: 'Internal', signOff: '2026-09-03', budget: 'Function', task: 'analyse-data',
      currentWorkflow: 'A finance analyst compiles a cash summary email from three exports, about 55 minutes each week.',
      redesignedWorkflow: 'The project holds the template and the three export layouts. The analyst uploads the exports and reviews the draft summary before it goes out.',
      baselineMin: 55, withAiMin: 20, runsPerMonth: 16, unusedShare: 0.1, failedMin: 20, basis: 'Measured',
      dataSource: 'Analyst time log for four weeks, then monthly count of runs', exportedBy: 'Priya R.',
      lastUpdate: '2026-11-02', nextMilestone: 'Quarterly review of the template', nextMilestoneDate: '2026-12-04',
      howToUse: 'Turns the three weekly bank and ledger exports into a draft cash summary.', notFor: 'Forecasts, or any figure not in the exports.', championId: 'C-01',
      limitation: '', workaround: '',
      history: [hist('2026-09-03', 'Pilot', 'Live', 'Four-week time log complete')]
    },
    {
      id: 'R-003', title: 'People policy answers', type: 'Copilot agent', function: 'People', label: '', owner: 'p-sofia', stage: 'Live', rag: 'Amber', audience: 'Everyone',
      dataClass: 'Internal', signOff: '2026-09-24', budget: 'Programme', task: 'answer-policy',
      currentWorkflow: 'The People team answers the same policy questions by email, about 12 minutes each.',
      redesignedWorkflow: 'The agent answers from the current policy set and links the source paragraph. The People team reviews flagged answers once a week.',
      baselineMin: 12, withAiMin: 4, runsPerMonth: 260, unusedShare: 0.25, failedMin: 4, basis: 'Self-reported',
      dataSource: 'Agent usage report plus a short monthly survey', exportedBy: 'Sofia M.',
      lastUpdate: '2026-10-30', nextMilestone: 'Fix two policy documents the agent cites inconsistently', nextMilestoneDate: '2026-11-11',
      howToUse: 'Answers common policy questions and shows the paragraph it used.', notFor: 'Individual cases, grievances or anything that needs a decision.', championId: 'C-03',
      limitation: 'The agent cites two policy documents inconsistently, so some answers show a paragraph that may not be the current one.', workaround: 'Check the paragraph it shows against the policy page before you act on an answer, or ask Sofia M.',
      history: [hist('2026-09-24', 'Pilot', 'Live', 'Weekly review of flagged answers agreed')]
    },
    {
      id: 'R-004', title: 'New starter pack builder', type: 'Automation', function: 'People', label: '', owner: 'p-callum', stage: 'Live', rag: 'Green',
      dataClass: 'Internal', signOff: '2026-07-16', budget: 'Function', task: 'repetitive-admin',
      currentWorkflow: 'The People coordinator assembles the starter email, forms and access requests by hand, about 45 minutes per starter.',
      redesignedWorkflow: 'A flow triggered by the offer-accepted status builds the pack and creates the access tasks. The coordinator checks it before it is sent.',
      baselineMin: 45, withAiMin: 12, runsPerMonth: 22, unusedShare: 0.05, failedMin: 12, basis: 'Measured',
      dataSource: 'Flow run history, monthly', exportedBy: 'Callum F.',
      lastUpdate: '2026-10-14', nextMilestone: 'Add a contractor variant', nextMilestoneDate: '2026-11-27',
      howToUse: 'Builds a new starter pack and the access tasks when an offer is accepted.', notFor: 'Visa, payroll or any case with special handling.', championId: 'C-03',
      limitation: 'It does not cover contractors yet.', workaround: 'Build the pack for a contractor by hand, or ask Callum F.',
      history: [hist('2026-07-16', 'Pilot', 'Live', '')]
    },
    {
      id: 'R-005', title: 'Press release first drafts and tone check', type: 'Useful GPT', function: 'Marketing and Communications', label: '', owner: 'p-tariq', stage: 'Live', rag: 'Green',
      dataClass: 'Internal', signOff: '2026-08-28', budget: 'Function', task: 'draft-summarise',
      currentWorkflow: 'The communications team writes first drafts of routine releases from a brief, about 60 minutes each.',
      redesignedWorkflow: 'The GPT drafts from the approved brief and checks tone against the house style. A communications manager edits and approves every release.',
      baselineMin: 60, withAiMin: 25, runsPerMonth: 30, unusedShare: 0.2, failedMin: 30, basis: 'Self-reported',
      dataSource: 'Usage export from the GPT platform plus a monthly check-in', exportedBy: 'Tariq H.',
      lastUpdate: '2026-10-21', nextMilestone: 'Add a sensitivity checklist for unannounced projects', nextMilestoneDate: '2026-11-18',
      howToUse: 'Drafts routine releases from an approved brief and checks the tone.', notFor: 'Unannounced projects until the sensitivity checklist is in place.', championId: 'C-06',
      limitation: 'The sensitivity checklist for unannounced projects is not agreed yet.', workaround: 'Write anything unannounced by hand, or ask Tariq H. first.',
      history: [hist('2026-08-28', 'Pilot', 'Live', '')]
    },
    {
      id: 'R-006', title: 'Expense query triage', type: 'Automation', function: 'Finance', label: '', owner: 'p-helena', stage: 'Live', rag: 'Green',
      dataClass: 'Internal', signOff: '2026-10-20', budget: 'Programme', task: 'repetitive-admin',
      currentWorkflow: 'Finance operations read each expense query and route it by hand, about 10 minutes each.',
      redesignedWorkflow: 'The flow reads the query, tags it and routes it to the right queue. Finance operations review the tags in a weekly sample.',
      baselineMin: 10, withAiMin: 3, runsPerMonth: 120, unusedShare: 0.1, failedMin: 3, basis: 'Measured',
      dataSource: 'Flow run history and a weekly sample of 25 queries', exportedBy: 'Helena N.',
      lastUpdate: '2026-11-04', nextMilestone: 'Route supplier queries to Procurement', nextMilestoneDate: '2026-11-25',
      howToUse: 'Tags and routes expense queries to the right queue.', notFor: 'Disputes or anything that needs a policy decision.', championId: 'C-01',
      limitation: 'Supplier queries are not routed to Procurement yet, so they land in the general queue.', workaround: 'Forward a supplier query to Procurement by hand until the routing is added.',
      history: [hist('2026-10-28', 'Pilot', 'Live', 'Weekly sample passed')]
    },
    {
      id: 'R-007', title: 'Contract clause summariser', type: 'Claude Project', function: 'Legal and Business Affairs', label: '', owner: 'p-ingrid', stage: 'Pilot', rag: 'Amber',
      dataClass: CONF, signOff: null, budget: 'Function', task: 'draft-summarise',
      currentWorkflow: 'Business affairs read each incoming agreement and note the key clauses by hand, about 90 minutes each.',
      redesignedWorkflow: 'The project lists the key clauses and flags the unusual ones. A business affairs lawyer checks every flagged clause against the document.',
      baselineMin: 90, withAiMin: 35, runsPerMonth: 14, unusedShare: 0.2, basis: 'Sampled',
      dataSource: 'Pilot log kept by the pilot group', exportedBy: 'Jonas K.', signOffBy: 'p-ingrid', ifLate: 'The pilot stays with its group of three and cannot widen.',
      lastUpdate: '2026-10-22', nextMilestone: 'Legal sign-off on data handling', nextMilestoneDate: '2026-11-13',
      howToUse: '', notFor: '', championId: 'C-04',
      history: [hist('2026-10-08', 'Build', 'Pilot', 'Small pilot group of three')]
    },
    {
      id: 'R-008', title: 'Meeting notes to action list', type: 'Automation', function: 'Technology', label: '', owner: 'p-lead', stage: 'Build', rag: 'Green',
      dataClass: 'Internal', signOff: null, budget: 'Programme', task: 'repetitive-admin',
      currentWorkflow: 'The coordinator retypes actions from notes after each forum, about 35 minutes.',
      redesignedWorkflow: 'Draft actions are proposed from the notes. The coordinator confirms every action before it enters the log.',
      baselineMin: 35, withAiMin: 0, runsPerMonth: 6, unusedShare: 0, basis: 'None yet',
      dataSource: 'Not yet measured', exportedBy: '',
      lastUpdate: '2026-11-05', nextMilestone: 'First test on the 12 Nov notes', nextMilestoneDate: '2026-11-13',
      howToUse: '', notFor: '', championId: '',
      history: [hist('2026-11-05', 'Design', 'Build', 'Workflows written down')]
    },
    {
      id: 'R-009', title: 'Delivery schedule alerts', type: 'Automation', function: 'Commercial and Distribution', label: '', owner: 'p-marcus', stage: 'Build', rag: 'Red',
      dataClass: 'Internal', signOff: null, budget: 'None yet', task: 'repetitive-admin',
      currentWorkflow: 'Distribution operations check delivery schedules by hand each morning and chase late items, about 30 minutes a day.',
      redesignedWorkflow: 'A flow reads the schedule and alerts the owner when an item is two days from its delivery date. Operations decide what to do.',
      baselineMin: 30, withAiMin: 0, runsPerMonth: 20, unusedShare: 0, basis: 'None yet',
      dataSource: 'Not yet measured', exportedBy: '',
      lastUpdate: '2026-10-19', nextMilestone: 'Confirm the data source with the delivery team', nextMilestoneDate: '2026-11-06',
      howToUse: '', notFor: '', championId: 'C-07',
      history: [hist('2026-10-01', 'Design', 'Build', '')]
    },
    {
      id: 'R-010', title: 'Rights checklist generator', type: 'Useful GPT', function: 'Rights and Clearances', label: '', owner: 'p-yuki', stage: 'Design', rag: 'Amber',
      dataClass: CONF, signOff: null, budget: 'None yet', task: 'draft-summarise',
      currentWorkflow: 'The clearances team builds a checklist for each project by copying the last one, about 50 minutes.',
      redesignedWorkflow: '',
      baselineMin: 50, withAiMin: 0, runsPerMonth: 10, unusedShare: 0, basis: 'None yet',
      dataSource: 'Not yet measured', exportedBy: '',
      lastUpdate: '2026-11-03', nextMilestone: 'Workshop with the clearances team', nextMilestoneDate: '2026-11-19',
      howToUse: '', notFor: '', championId: '',
      history: [hist('2026-11-03', 'Triage', 'Design', 'Workshop booked')]
    },
    {
      id: 'R-011', title: 'Invoice coding suggestions', type: 'Copilot agent', function: 'Finance', label: '', owner: 'p-rafael', stage: 'Triage', rag: 'Green',
      dataClass: 'Internal', signOff: null, budget: 'None yet', task: 'repetitive-admin',
      requestedBy: 'Rafael D.', currentWorkflow: 'An analyst reads each supplier invoice and picks the cost code from the chart of accounts, about 4 minutes each.',
      redesignedWorkflow: '', volumePerMonth: 600, minutesPerRun: 4, complexity: 'Medium', success: 'Suggested codes accepted without change for most invoices, with a person approving each batch.',
      baselineMin: 0, withAiMin: 0, runsPerMonth: 0, unusedShare: 0, basis: 'None yet', dataSource: '', exportedBy: '',
      lastUpdate: '2026-11-05', nextMilestone: 'Decision at triage', nextMilestoneDate: '2026-11-12',
      howToUse: '', notFor: '', championId: '',
      history: [hist('2026-11-02', '(new)', 'Idea', 'Raised at a check-in'), hist('2026-11-05', 'Idea', 'Triage', 'Request complete')]
    },
    {
      id: 'R-012', title: 'Distribution sales sheet tailoring', type: 'Useful GPT', function: 'Commercial and Distribution', label: '', owner: 'p-marcus', stage: 'Idea', rag: 'Green',
      dataClass: 'Internal', signOff: null, budget: 'None yet', task: 'draft-summarise',
      requestedBy: 'Marcus B.', currentWorkflow: 'A sales executive copies the standard sheet for a title and rewrites it for each buyer, about 45 minutes.',
      redesignedWorkflow: '', volumePerMonth: 40, minutesPerRun: 45, complexity: 'Low', success: 'A first draft per buyer in minutes that the executive then edits.',
      baselineMin: 0, withAiMin: 0, runsPerMonth: 0, unusedShare: 0, basis: 'None yet', dataSource: '', exportedBy: '',
      lastUpdate: '2026-11-04', nextMilestone: 'Decision at triage', nextMilestoneDate: '2026-11-12',
      howToUse: '', notFor: '', championId: '',
      history: [hist('2026-11-04', '(new)', 'Idea', 'Raised at a check-in')]
    },
    {
      id: 'R-013', title: 'Supplier onboarding questionnaire', type: 'Automation', function: 'Procurement', label: '', owner: 'p-nikhil', stage: 'Idea', rag: 'Green',
      dataClass: 'Internal', signOff: null, budget: 'None yet', task: 'repetitive-admin',
      requestedBy: 'Nikhil S.', currentWorkflow: 'New suppliers email back a questionnaire that is retyped into the supplier list.',
      redesignedWorkflow: '', volumePerMonth: null, minutesPerRun: 25, complexity: '', success: '',
      baselineMin: 0, withAiMin: 0, runsPerMonth: 0, unusedShare: 0, basis: 'None yet', dataSource: '', exportedBy: '',
      lastUpdate: '2026-11-03', nextMilestone: 'Complete the request', nextMilestoneDate: '2026-11-12',
      howToUse: '', notFor: '', championId: '',
      history: [hist('2026-11-03', '(new)', 'Idea', 'Raised in a corridor conversation')]
    },
    {
      id: 'R-014', title: 'Budget template consistency checker', type: 'Automation', function: 'Production Finance', label: '', owner: 'p-daniel', stage: 'Idea', rag: 'Green',
      dataClass: 'Internal', signOff: null, budget: 'None yet', task: 'analyse-data',
      requestedBy: 'Daniel R.', currentWorkflow: 'The production accountant checks each production budget against the group template by eye, about 90 minutes.',
      redesignedWorkflow: '', volumePerMonth: 30, minutesPerRun: 90, complexity: 'High', success: 'Mismatches with the group template listed before the budget is approved.',
      baselineMin: 0, withAiMin: 0, runsPerMonth: 0, unusedShare: 0, basis: 'None yet', dataSource: '', exportedBy: '',
      lastUpdate: '2026-10-30', nextMilestone: 'Decision at triage', nextMilestoneDate: '2026-11-12',
      howToUse: '', notFor: '', championId: '',
      history: [hist('2026-10-30', '(new)', 'Idea', '')]
    },
    {
      id: 'R-015', title: 'Interview scheduling assistant', type: 'Automation', function: 'People', label: '', owner: 'p-sofia', stage: 'Paused', rag: 'Amber',
      dataClass: 'Internal', signOff: null, budget: 'None yet', task: 'repetitive-admin',
      currentWorkflow: 'The People coordinator arranges interview slots by email, about 20 minutes each.',
      redesignedWorkflow: 'A flow offers three slots from the panel calendars. The coordinator confirms.',
      baselineMin: 20, withAiMin: 0, runsPerMonth: 0, unusedShare: 0, basis: 'None yet', dataSource: '', exportedBy: '',
      lastUpdate: '2026-10-12', nextMilestone: 'Restart when calendar access is agreed', nextMilestoneDate: '',
      howToUse: '', notFor: '', championId: '',
      history: [hist('2026-10-12', 'Design', 'Paused', 'Waiting on calendar permissions')]
    },
    {
      id: 'R-016', title: 'Meeting room booking summariser', type: 'Useful GPT', function: 'Technology', label: '', owner: 'p-amara', stage: 'Retired', rag: 'Green',
      dataClass: 'Internal', signOff: null, budget: 'None yet', task: 'draft-summarise',
      currentWorkflow: '', redesignedWorkflow: '', baselineMin: 0, withAiMin: 0, runsPerMonth: 0, unusedShare: 0, basis: 'None yet', dataSource: '', exportedBy: '',
      lastUpdate: '2026-09-30', nextMilestone: '', nextMilestoneDate: '',
      howToUse: '', notFor: '', championId: '',
      history: [hist('2026-09-30', 'Live', 'Retired', 'Used by two people in six weeks')]
    }
  ];

  const A = (id, text, owner, forum, source, due, status, extra) => Object.assign({ id, text, owner, forum, source, due, status, chases: [] }, extra || {});
  const actions = [
    A('A-001', 'Agree the stage names for the register', 'p-lead', 'WG', 'M-WG-1001', '2026-10-08', 'Done', { doneDate: '2026-10-07' }),
    A('A-002', 'Set up the shared register list', 'p-coord', 'WG', 'M-WG-1001', '2026-10-08', 'Done', { doneDate: '2026-10-08' }),
    A('A-003', 'Confirm the delivery schedule data source with the delivery team', 'p-marcus', 'WG', 'M-WG-1015', '2026-10-29', 'Open', { blocks: 'R-009', waitingOn: 'the delivery team', chases: [{ date: '2026-10-30', step: 'nudge1' }, { date: '2026-11-04', step: 'nudge2' }] }),
    A('A-004', 'Collect usage exports for the first four live tools', 'p-priya', 'WG', 'M-WG-1015', '2026-10-22', 'Done', { doneDate: '2026-10-21' }),
    A('A-005', 'Confirm the sign-off route for confidential material', 'p-ingrid', 'WG', 'M-WG-1015', '2026-10-22', 'Done', { doneDate: '2026-10-28' }),
    A('A-006', 'Circulate the stage definitions to function leads', 'p-coord', 'FPG', 'M-FPG-0915', '2026-09-22', 'Done', { doneDate: '2026-09-21' }),
    A('A-007', 'Send the redesigned contract summary workflow to the legal reviewer', 'p-ingrid', 'WG', 'M-WG-1029', '2026-11-04', 'Open', { blocks: 'R-007' }),
    A('A-008', 'List the contractor variant needs for the new starter flow', 'p-callum', 'FPG', 'M-FPG-1020', '2026-11-04', 'Open', { chases: [{ date: '2026-11-05', step: 'nudge1' }] }),
    A('A-009', 'Draft the weekly cash summary template for review', 'p-priya', 'WG', 'M-WG-1029', '2026-11-03', 'Done', { doneDate: '2026-11-02' }),
    A('A-010', 'Share the Working Group terms of reference with function leads', 'p-coord', 'FPG', 'M-FPG-1020', '2026-10-23', 'Done', { doneDate: '2026-10-22' }),
    A('A-011', 'Name a champion for Procurement', 'p-nikhil', 'WG', 'M-WG-1029', '2026-11-06', 'Open'),
    A('A-012', 'Collect three time-consuming tasks from the Alder teams', 'p-jamal', 'WG', 'M-WG-1015', '2026-10-30', 'Open', { chases: [{ date: '2026-11-02', step: 'nudge1' }] }),
    A('A-013', 'Book the L&D session for finance teams', 'p-coord', 'WG', 'M-WG-1029', '2026-11-04', 'Done', { doneDate: '2026-11-03' }),
    A('A-014', 'Agree the data feed for delivery alerts', 'p-amara', 'WG', 'M-WG-1029', '2026-11-13', 'Blocked', { blockedOn: 'the delivery team, via A-003' }),
    A('A-015', 'Confirm the month-end cut-off for the time-saved report', 'p-g-finance', 'FPG', 'M-FPG-1020', '2026-11-20', 'Open'),
    A('A-016', 'Agree the sensitivity checklist wording for unannounced projects', 'p-tariq', 'WG', 'M-WG-1029', '', 'Open'),
    A('A-017', 'Trial a separate chat channel for each label', 'p-coord', 'WG', 'M-WG-1015', '2026-10-22', 'Dropped', { note: 'Replaced by one channel (decision, 15 Oct).' }),
    A('A-018', 'Fix the two policy documents the agent cites inconsistently', 'p-sofia', 'WG', 'M-WG-1029', '2026-11-11', 'Open'),
    A('A-019', 'Add the co-production template to the variance commentary GPT', 'p-daniel', 'FPG', 'M-FPG-1020', '2026-11-10', 'Open'),
    A('A-020', 'Share expense triage numbers for the monthly report', 'p-helena', 'FPG', 'M-FPG-1020', '2026-11-11', 'Open'),
    A('A-021', 'Send the weekly sample results for the cash summary', 'p-priya', 'WG', 'M-WG-1015', '2026-11-17', 'Open', { originalDue: '2026-10-30', redates: [{ from: '2026-10-30', to: '2026-11-06', date: '2026-10-29' }, { from: '2026-11-06', to: '2026-11-17', date: '2026-11-05' }] }),
    A('A-022', 'Draft the access rules for confidential material in the pilot', 'p-amara', 'FPG', 'M-FPG-1020', '2026-11-18', 'Open'),
    A('A-023', 'Send the fortnightly post to the channel', 'p-coord', 'WG', 'M-WG-1029', '2026-11-13', 'Open'),
    A('A-024', 'Review the data handling notes for the contract summariser', 'p-ingrid', 'FPG', 'M-FPG-1020', '2026-11-25', 'Open', { blocks: 'R-007' }),
    A('A-025', 'Run the clearances workshop', 'p-yuki', 'WG', 'M-WG-1029', '2026-11-19', 'Open'),
    A('A-026', 'Nominate a second champion for the Brindle label', 'p-chloe', 'FPG', 'M-FPG-1020', '2026-11-24', 'Open'),
    A('A-027', 'Send the starter pack feedback results', 'p-callum', 'WG', 'M-WG-1015', '2026-11-05', 'Open')
  ];

  const champion = (id, personId, unit, sign, hours, joined, last, c, focus) => ({ id, person: personId, unit, managerSignOff: sign, hoursPerMonth: hours, joined, lastTouch: last, checklist: { signOff: !!sign, intro: c[0], training: c[1], showcase: c[2] }, focus });
  const champions = [
    champion('C-01', 'p-priya', 'Finance', '2026-08-03', 4, '2026-08-03', '2026-11-02', [true, true, true], 'Cash and expense workflows'),
    champion('C-02', 'p-rafael', 'Finance', '2026-08-03', 4, '2026-08-10', '2026-10-27', [true, true, false], 'Business partnering'),
    champion('C-03', 'p-sofia', 'People', '2026-08-05', 6, '2026-08-05', '2026-10-30', [true, true, true], 'Policy answers and starters'),
    champion('C-04', 'p-jonas', 'Legal and Business Affairs', '2026-08-12', 4, '2026-08-12', '2026-10-22', [true, true, false], 'Contract review'),
    champion('C-05', 'p-daniel', 'Production Finance', '2026-08-03', 4, '2026-08-03', '2026-10-27', [true, true, true], 'Budget commentary'),
    champion('C-06', 'p-tariq', 'Marketing and Communications', '2026-08-19', 4, '2026-08-19', '2026-10-21', [true, true, true], 'Drafting and tone'),
    champion('C-07', 'p-marcus', 'Commercial and Distribution', '2026-08-24', 4, '2026-08-24', '2026-10-19', [true, true, false], 'Delivery operations'),
    champion('C-08', 'p-amara', 'Technology', '2026-08-03', 6, '2026-08-03', '2026-11-05', [true, true, true], 'Flows and access'),
    champion('C-09', 'p-chloe', 'Alder', '2026-09-02', 4, '2026-09-02', '2026-11-02', [true, true, false], 'Production coordination'),
    champion('C-10', 'p-jamal', 'Alder', '2026-09-02', 4, '2026-09-02', '2026-10-26', [true, true, false], 'Production coordination'),
    champion('C-11', 'p-ola', 'Brindle', '2026-09-09', 4, '2026-09-09', '2026-09-30', [true, true, false], 'Business management'),
    champion('C-12', 'p-fiona', 'Cobalt', null, 2, '2026-10-26', '2026-11-04', [true, false, false], 'Production services')
  ];

  const mtg = (id, forum, date, status, extra) => Object.assign({ id, forum, date, status, attendees: [], apologies: [], items: [], decisions: [], notes: {}, actionsRaised: [], approval: status === 'Held' ? 'Issued' : 'Draft', prep: {} }, extra || {});
  const meetings = [
    mtg('M-WG-1001', 'WG', '2026-10-01', 'Held', { apologies: ['Legal and Business Affairs', 'Marketing and Communications'], actionsRaised: ['A-001', 'A-002'] }),
    mtg('M-WG-1015', 'WG', '2026-10-15', 'Held', { apologies: ['Legal and Business Affairs'], actionsRaised: ['A-003', 'A-004', 'A-005', 'A-012', 'A-017', 'A-021', 'A-027'] }),
    mtg('M-WG-1029', 'WG', '2026-10-29', 'Held', {
      attendees: ['Finance', 'People', 'Production Finance', 'Marketing and Communications', 'Commercial and Distribution', 'Technology', 'Rights and Clearances', 'Alder', 'Cobalt'],
      apologies: ['Legal and Business Affairs'],
      notes: {
        actions: 'Four actions closed. The delivery data source (A-003) is still open and now blocks the delivery alerts build.',
        movement: 'People policy answers stays Live at Amber until the two inconsistent documents are fixed. Meeting notes to action list moves to Design.',
        triage: 'Two ideas deferred to the next session until the requests are complete.',
        risks: 'Delivery alerts is Red: the data source is not confirmed. The contract summariser pilot needs the data handling sign-off before it widens.',
        network: 'No champion yet for Procurement or Rights and Clearances. L&D session for finance teams booked for 24 Nov.',
        showcase: 'Weekly cash summary: how the Project is set up and what the analyst checks.',
        aob: 'Legal sent apologies for the second session running. Business affairs to name a deputy.'
      },
      decisions: ['The programme uses one channel for updates, not one per label (confirmed).', 'Confidential material is not used in any tool without a recorded sign-off on its register line.', 'Delivery alerts stays in Build until the data source is confirmed.'],
      actionsRaised: ['A-007', 'A-009', 'A-011', 'A-013', 'A-014', 'A-016', 'A-018', 'A-023', 'A-025']
    }),
    mtg('M-WG-1112', 'WG', '2026-11-12', 'Planned', { prep: { call: true } }),
    mtg('M-WG-1126', 'WG', '2026-11-26', 'Planned'),
    mtg('M-FPG-0915', 'FPG', '2026-09-15', 'Held', { actionsRaised: ['A-006'] }),
    mtg('M-FPG-1020', 'FPG', '2026-10-20', 'Held', {
      attendees: ['Finance', 'People', 'Legal and Business Affairs', 'Commercial and Distribution', 'Production Finance', 'Marketing and Communications', 'Technology', 'Alder', 'Brindle'],
      apologies: [],
      notes: { health: 'Five live tools and three in flight. Impact figures are estimates and are shown gross and net.', decisions: 'Agreed a monthly impact one-pager for the Head of Department.' },
      decisions: ['Hours saved are reported gross and net of unused output, with the basis of each estimate.'],
      actionsRaised: ['A-008', 'A-010', 'A-015', 'A-019', 'A-020', 'A-022', 'A-024', 'A-026']
    }),
    mtg('M-FPG-1117', 'FPG', '2026-11-17', 'Planned'),
    mtg('M-FPG-1215', 'FPG', '2026-12-15', 'Planned')
  ];

  const weeks = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
  const ad = (tool, series) => ({ tool, weeks: weeks.map((w, i) => ({ weekStart: w, activeUsers: series[i] })) });
  const n = null;
  const adoption = [
    ad('R-001', [6, 7, 8, 9, 11, 12, 13, 14, 15, 17, 18, 18]),
    ad('R-002', [n, n, n, 4, 4, 5, 6, 6, 7, 8, 8, 9]),
    ad('R-003', [n, n, n, n, n, n, 21, 34, 41, 52, 58, 64]),
    ad('R-004', [3, 3, 4, 4, 4, 5, 5, 4, 5, 5, 5, 5]),
    ad('R-005', [5, 6, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11]),
    ad('R-006', [n, n, n, n, n, n, n, n, n, n, 31, 44])
  ];

  const training = [
    { id: 'T-01', title: 'AI at work: the first hour', date: '2026-11-17', seatsFree: 14, ownerTeam: 'L&D' },
    { id: 'T-02', title: 'Prompting for finance teams', date: '2026-11-24', seatsFree: 6, ownerTeam: 'L&D' },
    { id: 'T-03', title: 'Using Useful GPTs safely', date: '2026-12-01', seatsFree: 20, ownerTeam: 'L&D' }
  ];
  const events = [
    { id: 'E-01', title: 'Showcase: what is live', date: '2026-12-03', status: 'Planning', logistics: [{ t: 'Room and screen booked', done: true }, { t: 'Three presenters confirmed', done: false }, { t: 'Invite sent to all units', done: false }, { t: 'Recording consent agreed', done: false }] },
    { id: 'E-02', title: 'Time-saver competition', date: '2027-01-21', status: 'Idea', logistics: [{ t: 'Rules drafted for the Lead', done: false }, { t: 'Judging panel named', done: false }] }
  ];

  const checkins = [
    { unit: 'Finance', lastMet: '2026-10-22', nextDue: '2026-11-19', raised: ['R-011'], notes: 'Invoice coding takes most of the analysts\' week.' },
    { unit: 'People', lastMet: '2026-10-20', nextDue: '2026-11-17', raised: ['R-015'], notes: 'Scheduling is paused until calendar access is agreed.' },
    { unit: 'Legal and Business Affairs', lastMet: '2026-10-14', nextDue: '2026-11-11', raised: ['R-007'], notes: 'Wants the data handling answered before widening the pilot.' },
    { unit: 'Commercial and Distribution', lastMet: '2026-11-03', nextDue: '2026-12-01', raised: ['R-012'], notes: 'Sales sheets rewritten per buyer.' },
    { unit: 'Production Finance', lastMet: '2026-10-27', nextDue: '2026-11-24', raised: ['R-014'], notes: 'Template checking is by eye.' },
    { unit: 'Marketing and Communications', lastMet: '2026-10-21', nextDue: '2026-11-18', raised: [], notes: 'Happy with drafts; wants the sensitivity checklist.' },
    { unit: 'Technology', lastMet: '2026-11-05', nextDue: '2026-12-03', raised: ['R-008'], notes: '' },
    { unit: 'Procurement', lastMet: '2026-10-12', nextDue: '2026-11-09', raised: ['R-013'], notes: 'Supplier questionnaires are retyped.' },
    { unit: 'Rights and Clearances', lastMet: '2026-10-08', nextDue: '2026-11-05', raised: ['R-010'], notes: 'Workshop booked for 19 Nov.' },
    { unit: 'Alder', lastMet: '2026-10-29', nextDue: '2026-11-26', raised: [], notes: 'Collecting three tasks (A-012).' },
    { unit: 'Brindle', lastMet: '2026-10-15', nextDue: '2026-11-12', raised: [], notes: '' },
    { unit: 'Cobalt', lastMet: '2026-11-04', nextDue: '2026-12-02', raised: [], notes: 'Champion onboarding in progress.' },
    { unit: 'Dunmore', lastMet: null, nextDue: '2026-11-13', raised: [], notes: 'First check-in booked. No champion yet.' },
    { unit: 'Ember', lastMet: null, nextDue: '2026-11-20', raised: [], notes: 'First check-in to be booked. No champion yet.' }
  ];

  return {
    meta: { programmeDate: '2026-11-09', demoDate: '2026-11-09', coordinatorId: 'p-coord', leadId: 'p-lead', version: 3 },
    functions: FUNCTIONS, labels: LABELS,
    units: FUNCTIONS.map((name) => ({ name, kind: 'Function' })).concat(LABELS.map((name) => ({ name, kind: 'Label' }))),
    people, register, actions, champions, meetings, adoption, training, events, checkins,
    // Bank holidays plus an illustrative Christmas closure (24, 29, 30, 31 Dec).
    holidays: ['2026-12-24', '2026-12-25', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01']
  };
});
