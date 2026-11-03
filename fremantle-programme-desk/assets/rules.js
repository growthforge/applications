/*
  rules.js: the programme rules as pure functions. No DOM, no network.
  One file feeds the Programme Desk page and the Node tests, and each rule is
  written in plain words on the page and in the workbook README, so the rule
  can be read, argued with and rebuilt in Power Automate or a SharePoint view.
  Dates are ISO strings (YYYY-MM-DD); all maths is in UTC days.
  Every threshold is a named constant in RULES.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULES = {
    dueSoonWorkingDays: 2,        // open action due within this many working days is "due soon"
    nudge2AfterWorkingDays: 2,    // second nudge once the last chase is this old
    flagLeadAfterWorkingDays: 5,  // flag to the Lead: this overdue after two chases ...
    flagLeadMinChases: 2,
    impactFlagWorkingDays: 2,     // ... or this overdue after one chase when the action blocks something
    impactFlagMinChases: 1,
    staleWorkingDays: 10,         // no update this long while Design, Build or Pilot
    milestoneRiskWorkingDays: 5,
    championContactDays: 30,
    championMinHours: 4,
    checkinWarnWorkingDays: 5,
    apologyStreak: 2,
    callForItemsDays: 5,          // working days before a forum
    preReadDays: 2,
    minutesOutDays: 1,            // working days after a forum
    chaseAfterDays: 3,
    forumMinutes: { WG: 45, FPG: 60 },
    complexityWeight: { Low: 1, Medium: 2, High: 4 }
  };

  const STAGES = ['Idea', 'Triage', 'Design', 'Build', 'Pilot', 'Live', 'Paused', 'Retired'];
  const DATA_RANK = { Public: 0, Internal: 1, 'Confidential or rights-sensitive': 2 };
  const CONF = 'Confidential or rights-sensitive';
  const DAY = 86400000;

  // ---- dates ---------------------------------------------------------------
  const parse = (iso) => { const p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
  const dow = (iso) => new Date(parse(iso)).getUTCDay();
  const addDays = (iso, n) => fmt(parse(iso) + n * DAY);
  const calDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const isWorking = (iso, hol) => { const d = dow(iso); return d !== 0 && d !== 6 && !(hol || []).includes(iso); };

  // Working days after `a` up to and including `b`. Negative when b is before a.
  function workingDaysBetween(a, b, hol) {
    if (a === b) return 0;
    const sign = a < b ? 1 : -1;
    const from = a < b ? a : b;
    const to = a < b ? b : a;
    let n = 0;
    for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorking(d, hol)) n++;
    return n * sign;
  }
  function addWorkingDays(iso, n, hol) {
    const step = n < 0 ? -1 : 1;
    let left = Math.abs(n);
    let d = iso;
    while (left > 0) { d = addDays(d, step); if (isWorking(d, hol)) left--; }
    return d;
  }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function human(iso, withDow) {
    if (!iso) return 'no date';
    const d = new Date(parse(iso));
    return (withDow === false ? '' : DOW[d.getUTCDay()] + ' ') + d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
  }

  const person = (state, id) => state.people.find((p) => p.id === id) || { id, name: id, group: false, senior: false };
  const personName = (state, id) => person(state, id).name;
  const firstName = (n) => String(n || '').split(' ')[0];
  const opts = (state) => ({
    selfIds: [state.meta.coordinatorId],
    seniorIds: state.people.filter((p) => p.senior).map((p) => p.id),
    groupIds: state.people.filter((p) => p.group).map((p) => p.id)
  });

  // ---- actions -------------------------------------------------------------
  // done | dropped | blocked | no-date | overdue | due-soon | open
  function actionState(a, today, hol) {
    if (a.status === 'Done') return 'done';
    if (a.status === 'Dropped') return 'dropped';
    if (a.status === 'Blocked') return 'blocked';
    if (!a.due) return 'no-date';
    if (a.due < today) return 'overdue';
    if (workingDaysBetween(today, a.due, hol) <= RULES.dueSoonWorkingDays) return 'due-soon';
    return 'open';
  }

  // Why an action cannot be chased yet. These go to the coordinator and the Lead, not to the owner.
  function actionFlags(a, state) {
    const f = [];
    const p = person(state, a.owner);
    if (a.status === 'Done' || a.status === 'Dropped') return f;
    if (!a.due) f.push({ code: 'no-date', label: 'No due date' });
    if (p.group) f.push({ code: 'group-owner', label: 'Owned by a group, no named person' });
    if (a.status === 'Blocked') f.push({ code: 'blocked', label: 'Blocked on ' + (a.blockedOn || 'unknown') });
    if ((a.redates || []).length >= 2) f.push({ code: 're-dated', label: 'Re-dated ' + a.redates.length + ' times' });
    return f;
  }

  // The next chase this action is due, or null.
  // courtesy | nudge1 | nudge2 | via-lead (senior owner) | flag-lead (by impact or age)
  function chaseStep(a, today, hol, o) {
    o = o || {};
    if (a.status !== 'Open') return null;
    if ((o.selfIds || []).includes(a.owner)) return null;
    if ((o.groupIds || []).includes(a.owner) || !a.due) return null;
    const all = a.chases || [];
    if (all.some((c) => c.step === 'flag-lead' || c.step === 'via-lead')) return null;
    const chases = all.filter((c) => c.step !== 'courtesy');   // a heads-up before the date is not a chase
    const n = chases.length;
    const senior = (o.seniorIds || []).includes(a.owner);
    const state = actionState(a, today, hol);
    const last = n ? chases[n - 1].date : null;
    const since = last ? workingDaysBetween(last, today, hol) : Infinity;
    if (state === 'due-soon') return senior ? null : (all.length === 0 ? 'courtesy' : null);
    if (state !== 'overdue') return null;
    const od = workingDaysBetween(a.due, today, hol);
    if (od < 1) return null;
    if (senior) {                                               // one polite note, then the Lead
      if (n === 0) return 'nudge-senior';
      return since >= RULES.flagLeadAfterWorkingDays ? 'via-lead' : null;
    }
    if ((n >= RULES.flagLeadMinChases && od >= RULES.flagLeadAfterWorkingDays) ||
        (a.blocks && n >= RULES.impactFlagMinChases && od >= RULES.impactFlagWorkingDays)) return 'flag-lead';
    if (n === 0) return 'nudge1';
    if (since >= RULES.nudge2AfterWorkingDays) return 'nudge2';
    return null;
  }

  const STEP_LABEL = {
    courtesy: 'Courtesy heads-up',
    nudge1: 'First nudge',
    nudge2: 'Second nudge',
    'nudge-senior': 'One polite note (senior owner)',
    'via-lead': 'Raise via the Lead (senior owner)',
    'flag-lead': 'Flag to the Lead'
  };
  const STEP_RANK = { courtesy: 1, 'nudge-senior': 2, nudge1: 2, nudge2: 3 };

  function nextForum(state, today) {
    return state.meetings.filter((m) => m.status === 'Planned' && m.date >= today).sort((a, b) => a.date < b.date ? -1 : 1)[0] || null;
  }
  const forumName = (f) => (f === 'WG' ? 'the Working Group' : 'the Functional Group');

  // One entry per person to chase, plus one entry for the Lead. Each carries a draft a human reads and sends.
  function groupChases(state, today) {
    const o = opts(state);
    const hol = state.holidays;
    const nf = nextForum(state, today);
    const by = {};
    const lead = [];
    state.actions.forEach((a) => {
      const step = chaseStep(a, today, hol, o);
      if (!step) return;
      if (step === 'flag-lead' || step === 'via-lead') lead.push({ a, step });
      else (by[a.owner] = by[a.owner] || []).push({ a, step });
    });
    const out = Object.keys(by).map((id) => {
      const items = by[id].sort((x, y) => x.a.due < y.a.due ? -1 : 1);
      const step = items.reduce((s, i) => (STEP_RANK[i.step] > STEP_RANK[s] ? i.step : s), items[0].step);
      return { kind: 'person', owner: id, name: personName(state, id), step, items, draft: draftPerson(step, items, personName(state, id), nf, state) };
    }).sort((x, y) => STEP_RANK[y.step] - STEP_RANK[x.step] || (x.name < y.name ? -1 : 1));
    if (lead.length) out.push({ kind: 'lead', owner: state.meta.leadId, name: personName(state, state.meta.leadId), step: 'flag-lead', items: lead, draft: draftLead(lead, nf, state, today) });
    return out;
  }

  // Sessions that still have steps to close: planned and dated within the last week or in the future.
  function openForums(state, today, forum) {
    const floor = addDays(today, -7);
    return state.meetings.filter((m) => m.date >= floor && (!forum || m.forum === forum) && (m.status === 'Planned' || (m.status === 'Held' && m.date <= today && !(m.prep && m.prep.chase)))).sort((a, b) => a.date < b.date ? -1 : 1);
  }
  function lineFor(a, state) {
    return '• ' + a.id + ' ' + a.text + ' (due ' + human(a.due) + ')';
  }
  // Draft text only. Short, one ask, one date. A person edits and sends it.
  function draftPerson(step, items, name, nf, state) {
    const when = nf ? forumName(nf.forum) + ' on ' + human(nf.date) : 'the next session';
    const by = (k) => items.filter((i) => i.step === k);
    const block = (list, head) => (list.length ? head + '\n' + list.map((i) => lineFor(i.a, state)).join('\n') + '\n\n' : '');
    let t = 'Hi ' + firstName(name) + ',\n\n';
    if (step === 'nudge-senior') {
      t += 'I am preparing the action log ahead of ' + when + ' and wanted to check on ' + (items.length === 1 ? 'one item that is' : items.length + ' items that are') + ' still open:\n' + items.map((i) => lineFor(i.a, state)).join('\n') + '\n\nIf it would help, I can take any part of it off your plate, or a deputy can pick it up. A new date is fine.\n\nThank you,\nAI Productivity Coordinator';
      return t;
    }
    t += block(by('nudge2'), 'Following up, as I am not sure this reached you. Is anything in the way that I or the Lead can clear, such as an introduction or a decision?');
    t += block(by('nudge1'), 'I am tidying the action log ahead of ' + when + '. Still open:');
    t += block(by('courtesy'), 'A quick heads-up on ' + (by('courtesy').length === 1 ? 'an action that is' : 'actions that are') + ' due soon:');
    t += (by('nudge2').length || by('nudge1').length) ? 'One line back on each is plenty, or a new date if it has moved. I will log it on your word.' : 'If it is on track, no reply is needed. If a date has moved, tell me the new one and I will update the log.';
    return t + '\n\nThank you,\nAI Productivity Coordinator';
  }
  function draftLead(items, nf, state, today) {
    const when = nf ? forumName(nf.forum) + ' on ' + human(nf.date) : 'the next session';
    const flags = items.filter((i) => i.step === 'flag-lead');
    const via = items.filter((i) => i.step === 'via-lead');
    let t = 'For the Lead:\n';
    if (flags.length) {
      t += '\nFlags, by impact:\n' + flags.map((i) => {
        const od = workingDaysBetween(i.a.due, today, state.holidays);
        const dates = (i.a.chases || []).map((c) => human(c.date, false)).join(' and ');
        return '• ' + i.a.id + ' ' + i.a.text + ' (' + personName(state, i.a.owner) + '), ' + od + ' working days overdue after chases on ' + dates + (i.a.blocks ? '. It blocks ' + i.a.blocks + '.' : '.');
      }).join('\n');
    }
    if (via.length) {
      t += '\n\nSenior owners, one note already sent and still open:\n' + via.map((i) => '• ' + i.a.id + ' ' + i.a.text + ' (' + personName(state, i.a.owner) + ', due ' + human(i.a.due) + '). Suggest you or their assistant raise it.').join('\n');
    }
    return t + '\n\nProposed: agree a new date or an owner at ' + when + '. I will keep each on the agenda.\n\nAI Productivity Coordinator';
  }

  // A new due date resets the chase ladder and keeps a count of how often it has slipped.
  function redate(a, newDate, today) {
    return Object.assign({}, a, {
      originalDue: a.originalDue || a.due,
      due: newDate,
      redates: (a.redates || []).concat([{ from: a.due, to: newDate, date: today }]),
      chaseHistory: (a.chaseHistory || []).concat(a.chases || []),
      chases: []
    });
  }

  // ---- register ------------------------------------------------------------
  function registerFlags(item, today, hol) {
    const f = [];
    const add = (code, label, why) => f.push({ code, label, why });
    if (!item.owner) add('no-owner', 'No named owner', 'Every line needs one named owner.');
    if (['Design', 'Build', 'Pilot'].includes(item.stage) && workingDaysBetween(item.lastUpdate, today, hol) >= RULES.staleWorkingDays) {
      add('stale', 'No update for ' + workingDaysBetween(item.lastUpdate, today, hol) + ' working days', 'Design, Build and Pilot lines should be updated at least every ' + RULES.staleWorkingDays + ' working days (bank holidays and the closure excluded).');
    }
    if (item.nextMilestoneDate && !['Retired', 'Paused'].includes(item.stage)) {
      if (item.nextMilestoneDate < today && item.stage !== 'Live') add('milestone-missed', 'Milestone date passed', 'The date for "' + item.nextMilestone + '" has gone without an update.');
      else if (item.nextMilestoneDate >= today && workingDaysBetween(today, item.nextMilestoneDate, hol) <= RULES.milestoneRiskWorkingDays && item.rag !== 'Green') add('milestone-at-risk', 'Milestone at risk', 'Due within ' + RULES.milestoneRiskWorkingDays + ' working days and status is ' + item.rag + '.');
    }
    if (['Pilot', 'Live'].includes(item.stage) && item.budget === 'None yet') add('no-budget', 'Ask the Lead: budget line', 'No budget line recorded. The coordinator asks, the Lead decides.');
    if (item.stage === 'Live' && (!item.baselineMin || item.basis === 'None yet')) add('no-baseline', 'No baseline', 'Live tools need a baseline so that time saved can be shown.');
    if (item.dataClass === CONF && ['Pilot', 'Live'].includes(item.stage) && !item.signOff) add('sign-off-missing', 'Sign-off missing', 'Confidential or rights-sensitive material needs a recorded sign-off before Pilot.');
    if (['Build', 'Pilot', 'Live'].includes(item.stage) && (!(item.currentWorkflow || '').trim() || !(item.redesignedWorkflow || '').trim())) add('workflow-gap', 'Workflow not written down', 'The current and the redesigned workflow should both be on the line from Build onwards.');
    return f;
  }

  // What a move to a later stage should have in place. The desk warns and lets the coordinator move anyway.
  function canMove(item, to) {
    const reasons = [];
    const idx = (s) => STAGES.indexOf(s);
    if (idx(to) >= idx('Build') && idx(to) <= idx('Live')) {
      if (!(item.currentWorkflow || '').trim()) reasons.push('Write down the current workflow.');
      if (!(item.redesignedWorkflow || '').trim()) reasons.push('Write down the redesigned workflow.');
      if (!item.owner) reasons.push('Name one owner.');
    }
    if ((to === 'Pilot' || to === 'Live') && item.dataClass === CONF && !item.signOff) reasons.push('Record the sign-off for confidential or rights-sensitive material.');
    if (to === 'Live') {
      if (!item.baselineMin || item.basis === 'None yet') reasons.push('Record a baseline and how it was measured.');
      if (!(item.howToUse || '').trim() || !(item.notFor || '').trim()) reasons.push('Add the plain-language "use it for" and "not for" lines for the staff page.');
    }
    return { ok: reasons.length === 0, reasons };
  }

  // Hours per month. The "with AI" time includes reviewing and correcting the output.
  // Net removes the share of outputs that were not used. Hours, not money.
  function netHours(item) {
    if (!item.baselineMin || !item.withAiMin || !item.runsPerMonth) return null;
    const gross = item.runsPerMonth * (item.baselineMin - item.withAiMin) / 60;
    const net = gross * (1 - (item.unusedShare || 0));
    return { gross: Math.round(gross * 10) / 10, net: Math.round(net * 10) / 10 };
  }
  function impactTotals(state) {
    const live = state.register.filter((r) => r.stage === 'Live');
    let gross = 0, net = 0;
    const basis = {};
    live.forEach((r) => { const h = netHours(r); if (h) { gross += h.gross; net += h.net; } basis[r.basis] = (basis[r.basis] || 0) + 1; });
    return { live: live.length, gross: Math.round(gross * 10) / 10, net: Math.round(net * 10) / 10, basis };
  }
  // Tool-users on tools that were already live four weeks ago, so a new launch is not counted as growth.
  function likeForLike(state) {
    const n = state.adoption[0].weeks.length;
    const now = n - 1, then = n - 5;
    let nowSame = 0, before = 0, fresh = [];
    state.adoption.forEach((t) => {
      const w = t.weeks; const b = w[then] && w[then].activeUsers; const c = (w[now] && w[now].activeUsers) || 0;
      if (b === null || b === undefined) { if (c) fresh.push({ tool: t.tool, users: c }); } else { nowSame += c; before += b; }
    });
    return { now: nowSame, before, fresh, freshUsers: fresh.reduce((x, f) => x + f.users, 0) };
  }
  function activeUsersByWeek(state) {
    const weeks = state.adoption.length ? state.adoption[0].weeks.map((w) => w.weekStart) : [];
    return weeks.map((ws, i) => ({ weekStart: ws, total: state.adoption.reduce((s, t) => s + ((t.weeks[i] && t.weeks[i].activeUsers) || 0), 0) }));
  }

  // ---- discovery: requests, backlog, check-ins -----------------------------
  const REQUEST_FIELDS = [
    ['title', 'What it is called'],
    ['requestedBy', 'Who asked (a named person)'],
    ['task', 'The kind of task'],
    ['currentWorkflow', 'How it is done today, in three lines'],
    ['volumePerMonth', 'How many times a month'],
    ['minutesPerRun', 'Minutes each time, today'],
    ['dataClass', 'The kind of material involved'],
    ['success', 'What good looks like']
  ];
  function missingRequestFields(item) {
    return REQUEST_FIELDS.filter(([k]) => { const v = item[k]; return v === undefined || v === null || String(v).trim() === ''; }).map(([, label]) => label);
  }
  // Live tools that do the same kind of task in another unit: where a pocket of experimentation can travel.
  function similarLive(item, state) {
    return state.register.filter((r) => r.stage === 'Live' && r.task === item.task && r.function !== item.function);
  }
  // A proposal, then the Lead's order on top. Value = addressable hours a month divided by effort.
  // Lines with a Lead priority come first, in that order; the rest follow in proposed order.
  function proposedOrder(state) {
    const pool = state.register.filter((r) => r.stage === 'Idea' || r.stage === 'Triage');
    const ready = [];
    const needs = [];
    pool.forEach((r) => {
      const miss = missingRequestFields(r);
      if (miss.length || !r.complexity) { needs.push({ item: r, missing: r.complexity ? miss : miss.concat(['Effort (Low, Medium, High), set at triage']) }); return; }
      const hours = r.volumePerMonth * r.minutesPerRun / 60;
      ready.push({ item: r, hours: Math.round(hours * 10) / 10, value: Math.round(hours / RULES.complexityWeight[r.complexity] * 10) / 10, startsFrom: similarLive(r, state) });
    });
    ready.sort((a, b) => b.value - a.value);
    ready.forEach((x, i) => { x.rank = i + 1; });
    const withP = ready.filter((x) => x.item.priority).sort((a, b) => a.item.priority - b.item.priority);
    const rest = ready.filter((x) => !x.item.priority);
    const final = withP.concat(rest);
    final.forEach((x, i) => { x.finalRank = i + 1; x.overridden = x.finalRank !== x.rank; });
    return { ready: final, needs };
  }
  function checkinFlag(c, today, hol) {
    if (c.nextDue < today) return { code: 'overdue', label: 'Check-in overdue by ' + workingDaysBetween(c.nextDue, today, hol) + ' working days' };
    if (workingDaysBetween(today, c.nextDue, hol) <= RULES.checkinWarnWorkingDays) return { code: 'due-soon', label: 'Check-in due ' + human(c.nextDue) };
    return null;
  }

  // ---- champions and attendance --------------------------------------------
  function championFlags(c, today) {
    const f = [];
    if (!c.managerSignOff) f.push({ code: 'no-sign-off', label: 'No manager sign-off' });
    if (c.lastTouch && calDays(c.lastTouch, today) >= RULES.championContactDays) f.push({ code: 'needs-contact', label: 'No contact for ' + calDays(c.lastTouch, today) + ' days' });
    if (c.hoursPerMonth < RULES.championMinHours) f.push({ code: 'under-committed', label: 'Under ' + RULES.championMinHours + ' hours a month' });
    return f;
  }
  function coverage(champions, units) {
    return units.map((u) => {
      const here = champions.filter((c) => c.unit === u.name);
      return { name: u.name, kind: u.kind, champions: here.map((c) => c.id), count: here.length, gap: here.length === 0 };
    });
  }
  // A unit that sent apologies to each of the last N held meetings of this forum.
  function apologyFlags(state, forum) {
    const held = state.meetings.filter((m) => m.forum === forum && m.status === 'Held').sort((a, b) => a.date < b.date ? 1 : -1).slice(0, RULES.apologyStreak);
    if (held.length < RULES.apologyStreak) return [];
    return (held[0].apologies || []).filter((u) => held.every((m) => (m.apologies || []).includes(u))).map((u) => ({ unit: u, count: held.length }));
  }

  // ---- forum cycle ---------------------------------------------------------
  // Mechanics around one session: call for items, pre-reads, Lead approval, minutes out, chase.
  function forumPrep(state, meeting, today) {
    const hol = state.holidays;
    const d = meeting.date;
    const prep = meeting.prep || {};
    const steps = [
      { key: 'call', label: 'Call for agenda items', due: addWorkingDays(d, -RULES.callForItemsDays, hol) },
      { key: 'draft', label: 'Draft agenda to the Lead', due: addWorkingDays(d, -RULES.preReadDays - 1, hol) },
      { key: 'approved', label: 'Lead approves agenda; pre-reads out', due: addWorkingDays(d, -RULES.preReadDays, hol) },
      { key: 'minutes', label: 'Minutes to the Lead, then issued', due: addWorkingDays(d, RULES.minutesOutDays, hol) },
      { key: 'chase', label: 'Chase the new actions', due: addWorkingDays(d, RULES.chaseAfterDays, hol) }
    ];
    steps.forEach((s) => { s.done = !!prep[s.key]; s.state = s.done ? 'done' : (s.due < today ? 'late' : (workingDaysBetween(today, s.due, hol) <= 1 ? 'due' : 'upcoming')); });
    return steps;
  }

  function allocate(items, total) {
    const w = items.reduce((s, i) => s + i.weight, 0);
    if (!w) return items;
    const raw = items.map((i) => (i.weight / w) * total);
    const mins = raw.map((r) => Math.max(2, Math.floor(r)));
    let diff = total - mins.reduce((s, m) => s + m, 0);
    const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
    let k = 0;
    while (diff !== 0 && k < 1000) {
      const idx = order[k % order.length].i;
      if (diff > 0) { mins[idx]++; diff--; }
      else if (mins[idx] > 2) { mins[idx]--; diff++; }
      k++;
    }
    items.forEach((it, i) => { it.minutes = mins[i]; });
    return items;
  }
  function lastHeld(state, forum, before) {
    return state.meetings.filter((m) => m.forum === forum && m.status === 'Held' && m.date < before).sort((a, b) => a.date < b.date ? 1 : -1)[0] || null;
  }

  // A draft running order built from what has content. The Lead owns and approves it.
  function buildAgenda(state, forum, date) {
    const today = state.meta.programmeDate;
    const hol = state.holidays;
    const prev = lastHeld(state, forum, date);
    const since = prev ? prev.date : '0000-00-00';
    const items = [];
    const push = (id, title, purpose, presenter, weight, lines, refs) => items.push({ id, title, purpose, presenter, weight, lines, refs: refs || [] });
    const open = state.actions.filter((a) => ['Open', 'Blocked'].includes(a.status) && (forum === 'FPG' ? true : a.forum === 'WG'));
    const st = (a) => actionState(a, today, hol);
    const overdue = open.filter((a) => st(a) === 'overdue').sort((x, y) => x.due < y.due ? -1 : 1);
    const soon = open.filter((a) => st(a) === 'due-soon');
    const blocked = open.filter((a) => st(a) === 'blocked');
    const isSenior = (a) => !!person(state, a.owner).senior;
    const aline = (a, tag) => a.id + ' ' + a.text + ' (' + personName(state, a.owner) + (a.due ? ', due ' + human(a.due, false) : ', no date') + (tag ? ', ' + tag : '') + ')';
    const seniorOverdue = overdue.filter(isSenior);
    const actionLines = overdue.filter((a) => !isSenior(a)).map((a) => aline(a, 'overdue')).concat(blocked.map((a) => aline(a, 'blocked on ' + (a.blockedOn || '?')))).concat(soon.map((a) => aline(a)))
      .concat(seniorOverdue.length ? [seniorOverdue.length + (seniorOverdue.length === 1 ? ' action owned by a senior colleague is' : ' actions owned by senior colleagues are') + ' being raised with the Lead beforehand.'] : []);

    if (forum === 'WG') {
      push('actions', 'Actions since ' + (prev ? human(prev.date, false) : 'the start'), 'Chase', 'Coordinator', 10, actionLines.length ? actionLines : ['No open actions are overdue, blocked or due soon.'], overdue.concat(blocked, soon).map((a) => a.id));
      const moved = state.register.filter((r) => (r.history || []).some((h) => h.date > since && h.date <= today));
      if (moved.length) push('movement', 'Register movement', 'Note', 'Coordinator', 8, moved.map((r) => { const h = r.history.filter((x) => x.date > since).slice(-1)[0]; return r.id + ' ' + r.title + ': ' + h.from + ' to ' + h.to + (h.note ? ' (' + h.note + ')' : ''); }), moved.map((r) => r.id));
      const po = proposedOrder(state);
      if (po.ready.length || po.needs.length) push('triage', 'Ideas awaiting triage', 'Decision', 'Lead', 10,
        po.ready.map((x) => 'Order ' + x.finalRank + (x.overridden ? ' (Lead priority)' : '') + ': ' + x.item.id + ' ' + x.item.title + ' (about ' + x.hours + ' hours a month addressable, effort ' + x.item.complexity + ')')
          .concat(po.needs.map((x) => x.item.id + ' ' + x.item.title + ': needs ' + x.missing.length + ' more detail' + (x.missing.length > 1 ? 's' : ''))), po.ready.concat(po.needs).map((x) => x.item.id));
      const risky = state.register.map((r) => ({ r, f: registerFlags(r, today, hol) })).filter((x) => x.f.length && !['Retired', 'Paused'].includes(x.r.stage));
      if (risky.length) push('risks', 'Blockers and slipping timelines', 'Ask', 'Item owners', 10, risky.map((x) => x.r.id + ' ' + x.r.title + ': ' + x.f.map((y) => y.label).join('; ')), risky.map((x) => x.r.id));
      const gaps = coverage(state.champions, state.units).filter((c) => c.gap);
      const nt = state.training.filter((t) => t.date >= today).sort((a, b) => a.date < b.date ? -1 : 1)[0];
      const comms = [];
      if (gaps.length) comms.push('Units with no champion: ' + gaps.map((g) => g.name).join(', '));
      const ap = apologyFlags(state, forum);
      if (ap.length) comms.push('Apologies from the same unit at the last ' + ap[0].count + ' sessions: ' + ap.map((a) => a.unit).join(', ') + '. Name a deputy?');
      if (nt) comms.push('Next upskilling session with L&D: ' + nt.title + ', ' + human(nt.date) + ', ' + nt.seatsFree + ' seats free');
      const ev = state.events.filter((e) => e.date >= today).sort((a, b) => a.date < b.date ? -1 : 1)[0];
      if (ev) comms.push('Event: ' + ev.title + ', ' + human(ev.date) + ' (' + ev.status + ')');
      if (comms.length) push('network', 'Champions, training and events', 'Note', 'Coordinator', 5, comms, []);
      const show = state.register.filter((r) => r.stage === 'Live').sort((a, b) => a.lastUpdate < b.lastUpdate ? 1 : -1)[0];
      if (show) push('showcase', 'Showcase', 'Note', personName(state, show.owner), 5, [show.id + ' ' + show.title + ': ' + show.howToUse], [show.id]);
      push('aob', 'Any other business', 'Note', 'Chair', 2, ['Raised with the Coordinator the day before.'], []);
    } else {
      const t = impactTotals(state);
      push('health', 'Programme health', 'Note', 'Lead', 10, [t.live + ' live tools. About ' + Math.round(t.gross) + ' hours a month saved gross and about ' + Math.round(t.net) + ' net of unused output. Hours, not money. Estimates.',
        'In flight: ' + state.register.filter((r) => ['Design', 'Build', 'Pilot'].includes(r.stage)).length + ' lines across Design, Build and Pilot.'], []);
      const byFn = {};
      state.register.filter((r) => r.stage !== 'Retired').forEach((r) => { (byFn[r.function] = byFn[r.function] || []).push(r); });
      const cnt = (arr, st) => arr.filter((r) => r.stage === st).length;
      push('functions', 'Function updates', 'Note', 'Function leads', 20, Object.keys(byFn).sort().map((fn) => { const a = byFn[fn]; const parts = []; if (cnt(a, 'Live')) parts.push(cnt(a, 'Live') + ' live'); const fl = a.filter((r) => ['Design', 'Build', 'Pilot'].includes(r.stage)).length; if (fl) parts.push(fl + ' in design, build or pilot'); const ideas = a.filter((r) => ['Idea', 'Triage'].includes(r.stage)).length; if (ideas) parts.push(ideas + ' ' + (ideas === 1 ? 'idea' : 'ideas')); return fn + ': ' + (parts.join(', ') || 'nothing in the register'); }), []);
      const dec = state.register.filter((r) => registerFlags(r, today, hol).some((f) => ['sign-off-missing', 'no-budget'].includes(f.code)));
      if (dec.length) push('decisions', 'Decisions needed', 'Decision', 'Lead', 15, dec.map((r) => r.id + ' ' + r.title + ': ' + registerFlags(r, today, hol).filter((f) => ['sign-off-missing', 'no-budget'].includes(f.code))[0].label), dec.map((r) => r.id));
      push('actions', 'Open actions across groups', 'Chase', 'Coordinator', 8, actionLines.length ? actionLines.slice(0, 8) : ['None overdue.'], []);
      push('aob', 'Any other business', 'Note', 'Chair', 2, ['Raised with the Coordinator in advance.'], []);
    }
    allocate(items, RULES.forumMinutes[forum]);
    let t0 = 0;
    items.forEach((i) => { i.startOffset = t0; t0 += i.minutes; });
    return { forum, date, previous: prev ? prev.date : null, total: RULES.forumMinutes[forum], items };
  }

  // Returns new action objects. Nothing is written here; the caller appends them when the Lead has approved the minutes.
  function publishMinutes(state, minutes) {
    const meeting = state.meetings.find((m) => m.id === minutes.meetingId);
    const out = [];
    let seq = state.actions.reduce((m, a) => Math.max(m, parseInt(a.id.slice(2), 10) || 0), 0);
    (minutes.newActions || []).forEach((na) => {
      if (!na.text || !na.owner) return;
      seq++;
      out.push({
        id: 'A-' + String(seq).padStart(3, '0'),
        text: na.text.trim(),
        owner: na.owner,
        forum: meeting.forum,
        source: meeting.id,
        due: na.due || addWorkingDays(meeting.date, 7, state.holidays),
        status: 'Open',
        chases: []
      });
    });
    return out;
  }

  // ---- outputs: monthly one-pager and the fortnightly post -----------------
  function monthlySummary(state, today) {
    const hol = state.holidays;
    const t = impactTotals(state);
    const wk = activeUsersByWeek(state);
    const now = wk.length ? wk[wk.length - 1].total : 0;
    const before = wk.length > 4 ? wk[wk.length - 5].total : (wk[0] ? wk[0].total : 0);
    const po = proposedOrder(state);
    const flagged = state.register.map((r) => ({ r, f: registerFlags(r, today, hol) })).filter((x) => x.f.length && !['Retired', 'Paused'].includes(x.r.stage));
    const sev = (x) => (x.f.some((y) => y.code === 'sign-off-missing') ? 0 : x.f.some((y) => y.code === 'milestone-missed') ? 1 : 2);
    flagged.sort((a, b) => sev(a) - sev(b));
    const cov = coverage(state.champions, state.units);
    const asks = state.register.filter((r) => registerFlags(r, today, hol).some((f) => f.code === 'sign-off-missing' || f.code === 'no-budget'));
    return {
      live: t.live, inFlight: state.register.filter((r) => ['Design', 'Build', 'Pilot'].includes(r.stage)).length,
      gross: t.gross, net: t.net, basis: t.basis, activeNow: now, activeBefore: before, like: likeForLike(state),
      asks: asks.map((r) => r.id + ' ' + r.title + ': ' + registerFlags(r, today, hol).filter((f) => f.code === 'sign-off-missing' || f.code === 'no-budget').map((f) => f.label).join('; ')),
      risks: flagged.slice(0, 3).map((x) => x.r.id + ' ' + x.r.title + ': ' + x.f.map((y) => y.label).join('; ')),
      backlogReady: po.ready.length, backlogNeeds: po.needs.length,
      champions: state.champions.length, units: cov.length, gaps: cov.filter((c) => c.gap).map((c) => c.name)
    };
  }

  function wordCount(s) { return (String(s).match(/\S+/g) || []).length; }
  // A short post for the channel. Plain words, under 120.
  function buildPost(state, today) {
    const since = addDays(today, -14);
    const monday = addDays(today, -((dow(today) + 6) % 7));
    const newly = state.register.filter((r) => (r.history || []).some((h) => h.date > since && h.date <= today && (h.to === 'Live' || h.to === 'Pilot')));
    const winner = state.register.filter((r) => r.stage === 'Live' && netHours(r)).sort((a, b) => netHours(b).net - netHours(a).net)[0];
    const nt = state.training.filter((t) => t.date >= today).sort((a, b) => a.date < b.date ? -1 : 1)[0];
    const lines = ['AI productivity: what is new, w/c ' + human(monday)];
    if (newly.length) lines.push('New: ' + newly.map((r) => r.title + ' (' + r.history.filter((h) => h.date > since && h.date <= today).slice(-1)[0].to + ', ' + r.function + ')').join('; ') + '.');
    if (winner) lines.push('A win: ' + winner.title + ' now saves the ' + winner.function + ' team about ' + Math.round(netHours(winner).net) + ' hours a month, after allowing for drafts that were not used. Estimate, ' + String(winner.basis).toLowerCase() + '.');
    lines.push('Not sure where to start? Ask the front door page, or message your champion.');
    if (nt) lines.push('Next session: ' + nt.title + ', ' + human(nt.date) + ', ' + nt.seatsFree + ' seats free.');
    const body = lines.join('\n\n');
    return { body, words: wordCount(body) };
  }

  // A prompt to paste into Copilot, Claude or ChatGPT. The assistant drafts; a person checks before anything goes out.
  function promptFor(kind, state, today) {
    const guard = 'Use only the facts below. Do not invent names, dates, numbers or decisions. If something is unclear, say NEEDS CHECKING. I will read and edit it before it goes anywhere.';
    if (kind === 'post') {
      const p = buildPost(state, today);
      return 'You are helping an AI productivity coordinator in a TV production group write the fortnightly update for the programme channel.\n' + guard + '\n\nWrite it in plain British English for busy colleagues, under 120 words: what is new, one win, where to start, what is next. No hype, no exclamation marks.\n\nFacts:\n' + p.body;
    }
    const open = state.actions.filter((a) => a.status === 'Open').slice(0, 12).map((a) => a.id + ' ' + a.text + ' (' + personName(state, a.owner) + ', due ' + human(a.due) + ')').join('\n');
    return 'You are helping an AI productivity coordinator write minutes for a working group.\n' + guard + '\n\nFrom my notes (pasted below this prompt) write: 1) the decisions, one line each; 2) the new actions, each with one named owner and a due date. If an action has no owner or no date, write NEEDS OWNER or NEEDS DATE instead of guessing. Keep it to one page.\n\nActions already open, so you do not repeat them:\n' + open + '\n\nMy notes:\n[paste your notes or the meeting transcript here]';
  }

  // ---- where do I start? ---------------------------------------------------
  const TASKS = {
    'draft-summarise': 'Draft or summarise a document',
    'analyse-data': 'Tidy or analyse figures',
    'repetitive-admin': 'Cut repetitive admin or routing',
    'answer-policy': 'Answer questions from a policy or guide',
    'new-idea': 'I have a bigger idea'
  };
  const MATERIAL = {
    public: 'Public or already published',
    internal: 'Internal, not sensitive',
    confidential: 'Unreleased content, scripts, rights or talent data'
  };
  const MATERIAL_RANK = { public: 0, internal: 1, confidential: 2 };
  function allowedFor(item, material) {
    if (DATA_RANK[item.dataClass] < MATERIAL_RANK[material]) return false;
    if (item.dataClass === CONF && !item.signOff) return false;
    return true;
  }
  const RULE_PLACEHOLDER = 'Placeholder: replace with the acceptable-use policy. ';
  function route(answers, state) {
    const today = state.meta.programmeDate;
    const out = { rule: null, tools: [], champion: null, training: null, idea: null };
    out.rule = RULE_PLACEHOLDER + {
      public: 'Public or published material can go into any tool on the register.',
      internal: 'Internal material goes only into tools on the register whose data class is Internal or higher. Remove personal data first.',
      confidential: 'Unreleased content, scripts, rights or talent data go only into a tool whose register line shows a recorded sign-off. If none is listed for your task, stop and ask the Lead first.'
    }[answers.material];
    if (answers.task !== 'new-idea') {
      const pool = state.register.filter((r) => r.stage === 'Live' && r.task === answers.task && allowedFor(r, answers.material) && (r.audience === 'Everyone' || r.function === answers.unit));
      pool.sort((a, b) => (b.function === answers.unit ? 1 : 0) - (a.function === answers.unit ? 1 : 0));
      out.tools = pool.slice(0, 2);
      out.elsewhere = state.register.filter((r) => r.stage === 'Live' && r.task === answers.task && allowedFor(r, answers.material) && r.audience !== 'Everyone' && r.function !== answers.unit).slice(0, 2);
    }
    out.champion = state.champions.filter((c) => c.unit === answers.unit)[0] || null;
    out.training = state.training.filter((t) => t.date >= today).sort((a, b) => a.date < b.date ? -1 : 1)[0] || null;
    if (!out.tools.length) out.idea = { function: answers.unit, task: answers.task, dataClass: { public: 'Public', internal: 'Internal', confidential: CONF }[answers.material] };
    return out;
  }

  return {
    RULES, STAGES, DATA_RANK, CONF, TASKS, MATERIAL, STEP_LABEL, REQUEST_FIELDS,
    parse, fmt, addDays, calDays, isWorking, workingDaysBetween, addWorkingDays, human, wordCount,
    person, personName, opts,
    actionState, actionFlags, chaseStep, groupChases, redate, nextForum,
    registerFlags, canMove, netHours, impactTotals, activeUsersByWeek, likeForLike, similarLive, openForums,
    missingRequestFields, proposedOrder, checkinFlag,
    championFlags, coverage, apologyFlags,
    forumPrep, allocate, buildAgenda, publishMinutes,
    monthlySummary, buildPost, promptFor, allowedFor, route
  };
});
