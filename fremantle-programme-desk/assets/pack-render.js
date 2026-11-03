/*
  pack-render.js: renders the printable sheets as HTML strings from the programme state.
  The same code runs in the page (print buttons) and in Node (tools/gen-pack.mjs, which writes
  the static pack.html that the PDF is printed from), so the two can never drift.
  Needs Rules (rules.js). All text is escaped.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.PackRender = factory(root.Rules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const h = R.human;
  const name = (S, id) => R.personName(S, id);
  const FORUM = { WG: 'Head Office Productivity Working Group', FPG: 'Head Office Functional Productivity Group' };
  const CADENCE = { WG: 'fortnightly', FPG: 'monthly' };
  const clock = (offset) => Math.floor(offset / 60) + ':' + String(offset % 60).padStart(2, '0');

  function sheetHead(kicker, title, meta) {
    return '<header class="sheet__head"><p class="sheet__kicker">' + esc(kicker) + '</p><h2 class="sheet__title">' + esc(title) + '</h2>' +
      '<p class="sheet__meta">' + meta.map(esc).join(' &middot; ') + '</p></header>';
  }
  const foot = (text) => '<p class="sheet__foot">' + esc(text) + ' <span class="badge badge--accent">Illustrative data</span></p>';

  function agenda(S, ag, meeting) {
    const prep = R.forumPrep(S, meeting, S.meta.programmeDate);
    const by = Object.fromEntries(prep.map((p) => [p.key, p]));
    const rows = ag.items.map((i) =>
      '<tr><td class="num">' + clock(i.startOffset) + '</td><th scope="row">' + esc(i.title) + '<span class="sheet__sub">' + i.minutes + ' min</span></th>' +
      '<td>' + esc(i.purpose) + '</td><td>' + esc(i.presenter) + '</td><td><ul>' + i.lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul></td></tr>').join('');
    return '<section class="sheet" data-sheet="agenda">' +
      sheetHead('Running order', FORUM[ag.forum], [h(ag.date) + ' ' + String(ag.date).slice(0, 4), ag.total + ' minutes', 'Draft for the Lead to approve']) +
      '<div class="table-wrap" role="region" aria-label="Running order" tabindex="0"><table class="table sheet__table sheet__table--agenda"><colgroup><col class="c-time"><col class="c-item"><col class="c-for"><col class="c-pres"><col></colgroup><thead><tr><th scope="col">Time</th><th scope="col">Item</th><th scope="col">For</th><th scope="col">Presenter</th><th scope="col">What is on it</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<ul class="sheet__dates"><li>Call for items closed ' + h(by.call.due) + '</li><li>Agenda approved and pre-reads out ' + h(by.approved.due) + '</li><li>Apologies to the coordinator by the day before</li><li>Minutes to the Lead ' + h(by.minutes.due) + '</li></ul>' +
      foot('Built by the coordinator from the register and the action log. The Lead owns the agenda.') + '</section>';
  }

  function minutes(S, m) {
    const raised = m.actionsRaised.map((id) => S.actions.find((a) => a.id === id)).filter(Boolean);
    const itemTitles = { actions: 'Actions', movement: 'Register movement', triage: 'Ideas awaiting triage', risks: 'Blockers and slipping timelines', network: 'Champions, training and events', showcase: 'Showcase', aob: 'Any other business', health: 'Programme health', decisions: 'Decisions needed' };
    const notes = Object.keys(m.notes || {}).map((k) => '<li><strong>' + esc(itemTitles[k] || k) + '.</strong> ' + esc(m.notes[k]) + '</li>').join('');
    const state = (a) => { const s = R.actionState(a, S.meta.programmeDate, S.holidays); return { done: 'Done', dropped: 'Dropped', blocked: 'Blocked', overdue: 'Overdue', 'due-soon': 'Due soon', open: 'Open', 'no-date': 'No date' }[s]; };
    const rows = raised.map((a) => '<tr><td>' + esc(a.id) + '</td><td>' + esc(a.text) + '</td><td>' + esc(name(S, a.owner)) + '</td><td>' + esc(a.due ? h(a.due, false) : 'No date') + '</td><td>' + state(a) + '</td></tr>').join('');
    return '<section class="sheet" data-sheet="minutes">' +
      sheetHead('Minutes', FORUM[m.forum], [h(m.date) + ' ' + String(m.date).slice(0, 4), 'Approved by the Lead, then issued']) +
      '<div class="sheet__cols"><div><h3>Decisions</h3><ol>' + (m.decisions || []).map((d) => '<li>' + esc(d) + '</li>').join('') + '</ol></div>' +
      '<div><h3>Present</h3><p>' + esc((m.attendees || []).join(', ')) + '</p><h3>Apologies</h3><p>' + esc((m.apologies || []).join(', ') || 'None') + '</p></div></div>' +
      '<h3>Notes</h3><ul class="sheet__notes">' + notes + '</ul>' +
      '<h3>Actions raised, and where they stand on ' + esc(h(S.meta.programmeDate)) + '</h3>' +
      '<div class="table-wrap" role="region" aria-label="Actions raised" tabindex="0"><table class="table sheet__table sheet__table--actions"><colgroup><col class="c-ref"><col><col class="c-own"><col class="c-due"><col class="c-state"></colgroup><thead><tr><th scope="col">Ref</th><th scope="col">Action</th><th scope="col">Owner</th><th scope="col">Due</th><th scope="col">State</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      foot('Outcome first, one owner and one date on every action.') + '</section>';
  }

  function onePager(S) {
    const m = R.monthlySummary(S, S.meta.programmeDate);
    const nf = R.nextForum(S, S.meta.programmeDate);
    const fpg = S.meetings.filter((x) => x.forum === 'FPG' && x.status === 'Planned').sort((a, b) => a.date < b.date ? -1 : 1)[0];
    const li = (arr, empty) => '<ul>' + (arr.length ? arr.map((x) => '<li>' + esc(x) + '</li>').join('') : '<li>' + esc(empty) + '</li>') + '</ul>';
    const tiles = [[m.live, 'tools live'], [m.inFlight, 'in design, build or pilot'], [Math.round(m.gross) + ' / ' + Math.round(m.net), 'hours a month, gross / net'], [m.like.now, 'weekly tool-users on tools live four weeks ago, from ' + m.like.before], [m.like.freshUsers, 'tool-users on a tool launched since']]
      .map((t) => '<div class="tile"><span class="tile__v">' + esc(t[0]) + '</span><span class="tile__l">' + esc(t[1]) + '</span></div>').join('');
    return '<section class="sheet" data-sheet="onepager">' +
      sheetHead('Monthly one-pager for the Head of Department', 'AI productivity programme: the month in one page', ['Position on ' + h(S.meta.programmeDate) + ' ' + S.meta.programmeDate.slice(0, 4), 'Prepared by the coordinator for the Lead']) +
      '<div class="tiles">' + tiles + '</div>' +
      '<div class="sheet__cols"><div><h3>What we need from you</h3>' + li(m.asks, 'Nothing this month.') + '<h3>Biggest risks</h3>' + li(m.risks, 'None flagged.') + '</div>' +
      '<div><h3>Network</h3><p>' + m.champions + ' champions across ' + (m.units - m.gaps.length) + ' of ' + m.units + ' units. No champion yet: ' + esc(m.gaps.join(', ') || 'none') + '.</p>' +
      '<h3>Backlog</h3><p>' + m.backlogReady + ' requests ready for the Lead to order, ' + m.backlogNeeds + ' waiting for more detail.</p>' +
      '<h3>Next</h3><ul><li>' + (nf ? esc(FORUM[nf.forum]) + ', ' + esc(h(nf.date)) : 'No forum planned') + '</li><li>' + (fpg ? esc(FORUM.FPG) + ', ' + esc(h(fpg.date)) : '') + '</li></ul></div></div>' +
      '<p class="sheet__method"><strong>How to read the hours.</strong> They are estimates. Time with the tool includes reviewing and correcting the output. Net removes the share of output that was not used. Each tool names where its usage data comes from and who exports it. Hours saved are not money.</p>' +
      foot('Computed from the same register and action log as the desk.') + '</section>';
  }

  function post(S) {
    const p = R.buildPost(S, S.meta.programmeDate);
    const live = S.register.filter((r) => r.stage === 'Live');
    const liveList = live.map((r) => '<li><strong>' + esc(r.title) + '</strong> (' + esc(r.type) + ', ' + esc(r.function) + '). ' + esc(r.howToUse) + ' Not for: ' + esc(r.notFor) + ' Ask: ' + esc(name(S, (S.champions.find((c) => c.id === r.championId) || {}).person || r.owner).replace(/\.$/, '')) + '.</li>').join('');
    return '<section class="sheet" data-sheet="post">' +
      sheetHead('Written updates', 'The fortnightly post and the pinned "what is live" post', ['For the one channel', 'Plain words, under one hundred and twenty']) +
      '<h3>Fortnightly post</h3><blockquote class="sheet__post">' + esc(p.body).replace(/\n\n/g, '<br><br>') + '</blockquote><p class="sheet__sub">' + p.words + ' words.</p>' +
      '<h3>Pinned: what is live</h3><ul class="sheet__live">' + liveList + '</ul>' +
      foot('Written for busy people: what changed, one win, where to start, what is next.') + '</section>';
  }

  function request(S) {
    const fields = R.REQUEST_FIELDS.map((f) => '<tr><th scope="row">' + esc(f[1]) + '</th><td class="sheet__blank"></td></tr>').join('');
    return '<section class="sheet" data-sheet="request">' +
      sheetHead('Discovery', 'The buildable request, and how the backlog is ordered', ['One page per request', 'Raised at a check-in or from the front door']) +
      '<div class="table-wrap" role="region" aria-label="Request template" tabindex="0"><table class="table sheet__table"><tbody>' + fields + '</tbody></table></div>' +
      '<h3>How the proposed order is worked out</h3><p>Addressable hours a month is how many times a month the task happens multiplied by the minutes it takes today. The proposed order divides that by effort (Low counts one, Medium two, High four). A request with a field missing is not ranked; it goes back to the person who raised it. The Lead sets the final order and can override any of it.</p>' +
      foot('A proposal for the Lead, not a decision.') + '</section>';
  }

  return { esc, agenda, minutes, onePager, post, request, FORUM };
});
