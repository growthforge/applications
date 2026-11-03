/*
  app.js: the Programme Desk. Plain JavaScript, no framework, no network, no tracking.
  State lives in this browser only (localStorage). Every rule comes from rules.js.
  All data is illustrative (seed.js).
*/
(function () {
  'use strict';
  const R = window.Rules, SEED = window.SEED, PR = window.PackRender;
  const KEY = 'fmt-desk-v2';
  const root = document.getElementById('app');
  if (!root || !R || !SEED) return;

  // ---- state ---------------------------------------------------------------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let S = load();
  const ui = { view: 'week', reg: 'table', forumTab: 'sessions', forum: 'WG', mid: null, actF: { forum: '', owner: '', state: '' }, regF: { q: '', stage: '', unit: '', data: '', flag: '' }, door: { unit: 'Finance', task: 'draft-summarise', material: 'internal' }, mdraft: {}, drafts: {}, postText: null, toast: '', focus: null };
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const o = JSON.parse(raw); if (o && o.meta && o.meta.version === SEED.meta.version) return o; } } catch (e) { /* private mode: run in memory */ }
    return clone(SEED);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  const T = () => S.meta.programmeDate;
  const hd = R.human;
  const pname = (id) => R.personName(S, id);

  // ---- tiny DOM helpers ----------------------------------------------------
  function h(tag, a) {
    const el = document.createElement(tag);
    if (a) for (const k in a) {
      const v = a[k];
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = true;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => append(el, x));
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const tag = (text, kind) => h('span', { class: 'tag' + (kind ? ' tag--' + kind : ''), text });
  function select(opts, value, attrs) {
    const el = h('select', attrs);
    opts.forEach((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; const op = h('option', { value: v, text: l }); if (String(v) === String(value)) op.selected = true; el.append(op); });
    return el;
  }
  function field(label, input, hint) { if (!input.id) input.id = nid(); return h('div', null, h('label', { for: input.id, text: label }), input, hint ? h('p', { class: 'hint', text: hint }) : null); }
  let uid = 0;
  const nid = () => 'f' + (++uid);
  function inp(type, value, attrs) { const id = nid(); return h('input', Object.assign({ type, id, value: value === undefined || value === null ? '' : value }, attrs || {})); }
  function area(value, attrs) { const id = nid(); const el = h('textarea', Object.assign({ id, rows: 3 }, attrs || {})); el.value = value || ''; return el; }
  function table(label, heads, rows, cls) {
    const t = h('table', { class: 'table' + (cls ? ' ' + cls : ''), role: 'table' }, h('thead', { role: 'rowgroup' }, h('tr', { role: 'row' }, heads.map((x) => h('th', { scope: 'col', role: 'columnheader', text: x })))), h('tbody', { role: 'rowgroup' }, rows));
    t.querySelectorAll('tbody tr').forEach((tr) => { tr.setAttribute('role', 'row'); Array.prototype.forEach.call(tr.children, (c, i) => { c.setAttribute('data-label', heads[i] || ''); c.setAttribute('role', c.tagName === 'TH' ? 'rowheader' : 'cell'); }); });
    return h('div', { class: 'table-wrap', role: 'region', 'aria-label': label, tabindex: '0' }, t);
  }
  function toast(msg) { ui.toast = msg; const t = $('.toast', root); if (t) t.textContent = msg; clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast = ''; const t2 = $('.toast', root); if (t2) t2.textContent = ''; }, 4500); }
  function copy(text) {
    const fb = () => { const ta = h('textarea', { 'aria-hidden': 'true' }); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); try { document.execCommand('copy'); toast('Copied.'); } catch (e) { toast('Select the text and copy it.'); } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Copied.'), fb); else fb();
  }
  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'text/csv' })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  function csv(rows) { return rows.map((r) => r.map((c) => { const s = String(c === null || c === undefined ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n'); }
  function printHTML(html) {
    const rootEl = h('div', { id: 'print-root' }); rootEl.innerHTML = html; document.body.append(rootEl); document.body.classList.add('is-printing');
    const done = () => { rootEl.remove(); document.body.classList.remove('is-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); window.print();
  }
  function modal(title, body, buttons, onClose) {
    const dlg = h('dialog', { 'aria-labelledby': 'dlg-t' });
    dlg.append(h('div', { class: 'dlg__head' }, h('h3', { id: 'dlg-t', text: title }), h('button', { type: 'button', class: 'btn btn--ghost btn--small', onclick: () => dlg.close(), text: 'Close' })),
      h('div', { class: 'dlg__body' }, body), h('div', { class: 'dlg__foot' }, buttons));
    dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
    document.body.append(dlg); dlg.showModal();
    const f = dlg.querySelector('input,select,textarea'); if (f) f.focus();
    return dlg;
  }
  const btn = (text, fn, cls, attrs) => h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || 'btn--ghost btn--small'), onclick: fn, text }, attrs || {}));

  function commit(focusSel) { save(); ui.focus = focusSel || null; render(); }

  // ---- derived -------------------------------------------------------------
  const holidays = () => S.holidays;
  const regFlags = () => S.register.map((r) => ({ r, f: R.registerFlags(r, T(), holidays()) })).filter((x) => x.f.length && !['Retired', 'Paused'].includes(x.r.stage));
  const stateTag = (a) => {
    const s = R.actionState(a, T(), holidays());
    const m = { done: ['Done', 'ok'], dropped: ['Dropped', ''], blocked: ['Blocked', 'warn'], overdue: ['Overdue', 'bad'], 'due-soon': ['Due soon', 'warn'], open: ['Open', ''], 'no-date': ['No date', 'bad'] }[s];
    return tag(m[0], m[1]);
  };
  const ragTag = (r) => tag(r, { Green: 'ok', Amber: 'warn', Red: 'bad' }[r]);
  const nextId = (arr, p) => p + String(arr.reduce((m, x) => Math.max(m, parseInt(x.id.slice(p.length + 1), 10) || 0), 0) + 1).padStart(3, '0');
  const howto = (summary, text) => h('details', { class: 'howto' }, h('summary', { text: summary }), h('p', { text }));

  // ---- shell ---------------------------------------------------------------
  const VIEWS = [['week', 'This week'], ['register', 'Register'], ['forums', 'Forums'], ['network', 'Network'], ['door', 'Front door']];
  function render() {
    const y = window.scrollY;
    const groups = R.groupChases(S, T());
    const bar = h('div', { class: 'desk__bar' },
      h('div', { class: 'desk__date' },
        h('div', null, h('label', { for: 'pdate', text: 'Programme date (illustrative today)' }), h('input', { type: 'date', id: 'pdate', value: T(), onchange: (e) => { if (e.target.value) { S.meta.programmeDate = e.target.value; commit('#pdate'); } } })),
        btn('Back to the demo date', () => { S.meta.programmeDate = S.meta.demoDate; commit(); }),
        btn('Reset illustrative data', () => { S = clone(SEED); ui.mdraft = {}; ui.drafts = {}; ui.postText = null; commit(); toast('Illustrative data restored.'); })));
    const tabs = h('ul', { class: 'vtabs', role: 'tablist', 'aria-label': 'Desk views' }, VIEWS.map(([k, l], i) =>
      h('li', { role: 'presentation' }, h('button', {
        type: 'button', role: 'tab', id: 'tab-' + k, 'aria-controls': 'panel', 'aria-selected': ui.view === k ? 'true' : 'false', tabindex: ui.view === k ? '0' : '-1',
        onclick: () => go(k), onkeydown: (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); go(VIEWS[(i + d + VIEWS.length) % VIEWS.length][0], true); } else if (e.key === 'Home') { e.preventDefault(); go(VIEWS[0][0], true); } else if (e.key === 'End') { e.preventDefault(); go(VIEWS[VIEWS.length - 1][0], true); } }
      }, l, k === 'week' && groups.length ? h('span', { class: 'count', text: groups.length }) : null))));
    const views = { week: viewWeek, register: viewRegister, forums: viewForums, network: viewNetwork, door: viewDoor };
    const panel = h('div', { class: 'vpanel', role: 'tabpanel', id: 'panel', 'aria-labelledby': 'tab-' + ui.view, tabindex: '0' }, views[ui.view]());
    const dk = h('div', { class: 'desk' }, bar, tabs, panel, h('div', { class: 'toast', role: 'status', 'aria-live': 'polite', text: ui.toast }));
    root.replaceChildren(dk);
    window.scrollTo(0, y);
    if (ui.focus) { const f = $(ui.focus, root); if (f) f.focus(); ui.focus = null; }
  }
  function go(view, focus) { ui.view = view; render(); if (focus) $('#tab-' + view, root).focus(); }

  // ---- This week -----------------------------------------------------------
  function prepList(m, label) {
    const steps = R.forumPrep(S, m, T());
    return h('div', { class: 'panel' }, h('h4', { text: label + ', ' + hd(m.date) }), m.date < T() ? h('p', { class: 'muted', text: 'The session was held on ' + hd(m.date) + '. Minutes and chasing are still open.' }) : null,
      h('ul', { class: 'steps' }, steps.map((s) => {
        const kind = { done: 'ok', late: 'bad', due: 'warn', upcoming: '' }[s.state];
        const cb = h('input', { type: 'checkbox', id: 'prep-' + m.id + '-' + s.key, 'aria-label': s.label + ' done', onchange: (e) => { m.prep = m.prep || {}; m.prep[s.key] = e.target.checked; commit('#prep-' + m.id + '-' + s.key); } });
        if (s.done) cb.checked = true;
        return h('li', null, cb, h('span', { text: s.label }), h('span', { class: 'muted', text: hd(s.due) }), tag({ done: 'Done', late: 'Late', due: 'Due now', upcoming: 'Upcoming' }[s.state], kind));
      })));
  }
  function viewWeek() {
    const t = T();
    const groups = R.groupChases(S, t);
    const overdue = S.actions.filter((a) => R.actionState(a, t, holidays()) === 'overdue').length;
    const gaps = R.coverage(S.champions, S.units).filter((c) => c.gap);
    const nf = R.nextForum(S, t);
    const wg = R.openForums(S, t, 'WG')[0];
    const fpg = R.openForums(S, t, 'FPG')[0];
    const ticker = h('div', { class: 'ticker', role: 'group', 'aria-label': 'This week at a glance' },
      h('span', null, 'Next forum', h('b', { text: nf ? hd(nf.date) : 'none' })),
      h('span', null, 'Messages to review', h('b', { text: groups.length })),
      h('span', null, 'Overdue actions', h('b', { text: overdue })),
      h('span', null, 'Register flags', h('b', { text: regFlags().length })),
      h('span', null, 'Units with no champion', h('b', { text: gaps.length })));

    const chase = groups.length ? groups.map((g, gi) => {
      const dkey = g.kind + g.owner + g.items.map((i) => i.a.id + i.step).join();
      const ta = h('textarea', { class: 'draft', id: 'draft-' + gi, 'aria-label': 'Draft message to ' + g.name }); ta.value = ui.drafts[dkey] !== undefined ? ui.drafts[dkey] : g.draft;
      ta.addEventListener('input', () => { ui.drafts[dkey] = ta.value; });
      return h('article', { class: 'chase' },
        h('div', { class: 'chase__head' }, h('strong', { text: g.kind === 'lead' ? 'For the Lead' : g.name }), tag(g.kind === 'lead' ? 'Flags by impact, senior owners' : R.STEP_LABEL[g.step], g.kind === 'lead' ? 'bad' : g.step === 'nudge2' ? 'warn' : 'accent')),
        h('ul', null, g.items.map((i) => h('li', { text: i.a.id + ' ' + i.a.text + ', due ' + hd(i.a.due) + (g.kind === 'lead' ? ' (' + pname(i.a.owner) + ', ' + R.STEP_LABEL[i.step].toLowerCase() + ')' : '') }))),
        ta,
        h('div', { class: 'cluster' },
          btn('Copy draft', () => copy(ta.value)),
          btn('Mark as sent and log the chase', () => { g.items.forEach((i) => { const a = S.actions.find((x) => x.id === i.a.id); a.chases = a.chases || []; a.chases.push({ date: t, step: i.step }); }); delete ui.drafts[dkey]; commit(); toast('Chase logged on ' + g.items.length + (g.items.length === 1 ? ' action.' : ' actions.')); }, 'btn--small')));
    }) : [h('p', { class: 'muted', text: 'No chases are due. The queue refills when an action reaches its next step.' })];

    const stuck = S.actions.map((a) => ({ a, f: R.actionFlags(a, S)})).filter((x) => x.f.length);
    const fix = stuck.map(({ a, f }) => {
      let control = null;
      if (f.some((x) => x.code === 'no-date')) { const d = inp('date', '', { 'aria-label': 'Due date for ' + a.id }); control = h('span', { class: 'cluster' }, d, btn('Set date', () => { if (d.value) { a.due = d.value; commit(); } })); }
      else if (f.some((x) => x.code === 'group-owner')) { const sel = select([['', 'Choose a person']].concat(S.people.filter((p) => !p.group && p.unit === R.person(S, a.owner).unit).map((p) => [p.id, p.name])), '', { 'aria-label': 'Named owner for ' + a.id }); control = h('span', { class: 'cluster' }, sel, btn('Assign', () => { if (sel.value) { a.owner = sel.value; commit(); } })); }
      else if (f.some((x) => x.code === 'blocked')) control = btn('Unblock', () => { a.status = 'Open'; delete a.blockedOn; commit(); });
      return h('li', null, h('span', { text: a.id + ' ' + a.text }), h('span', { class: 'tags' }, f.map((x) => tag(x.label, x.code === 're-dated' ? '' : 'warn'))), control);
    });

    const flagged = regFlags().slice(0, 6);
    const checks = S.checkins.map((c) => ({ c, f: R.checkinFlag(c, t, holidays()) })).filter((x) => x.f);
    const post = R.buildPost(S, t);
    const pta = area(ui.postText !== null ? ui.postText : post.body, { rows: 9, id: 'post-text', 'aria-label': 'Fortnightly post' });
    const wc = h('p', { class: 'hint', 'aria-live': 'polite', text: R.wordCount(pta.value) + ' words. Aim for under one hundred and twenty.' });
    pta.addEventListener('input', () => { ui.postText = pta.value; const n = R.wordCount(pta.value); wc.textContent = n + ' words. Aim for under one hundred and twenty.'; });

    return [
      h('h3', { class: 'visually-hidden', text: 'This week' }),
      ticker,
      h('div', { class: 'cols' }, wg ? prepList(wg, 'Working Group') : null, fpg ? prepList(fpg, 'Functional Group') : null),
      h('section', null, h('div', { class: 'vpanel__head' }, h('h3', { text: 'Chase queue' }), h('p', { class: 'muted', text: 'One message per person. Drafts only: a person reads, edits and sends.' })),
        howto('How it runs', 'A heads-up goes out when an action is due within two working days; it does not count as a chase. A first nudge follows once it is overdue, and a second after two working days with no answer. A senior owner gets one polite note, and if it is still open five working days later it goes to the Lead. An action that blocks something reaches the Lead sooner than one that does not.'),
        h('div', { class: 'chase-grid', style: 'margin-top: var(--space-4)' }, chase)),
      h('div', { class: 'cols' },
        h('section', { class: 'panel' }, h('h4', { text: 'Not chaseable until fixed' }), h('p', { class: 'muted', text: 'No date, a group as owner, or blocked: these cannot be chased until someone fixes them.' }), stuck.length ? h('ul', { class: 'steps' }, fix) : h('p', { text: 'Nothing here.' })),
        h('section', { class: 'panel' }, h('h4', { text: 'Register flags' }), flagged.length ? h('ul', { class: 'steps' }, flagged.map((x) => h('li', null, h('span', { text: x.r.id + ' ' + x.r.title }), h('span', { class: 'tags' }, x.f.map((f) => tag(f.label, 'warn')))))) : h('p', { text: 'Nothing flagged.' }), btn('Open the register', () => { ui.view = 'register'; commit(); }))),
      h('div', { class: 'cols' },
        h('section', { class: 'panel' }, h('h4', { text: 'Discovery check-ins' }), checks.length ? h('ul', { class: 'steps' }, checks.map((x) => h('li', null, h('span', { text: x.c.unit }), tag(x.f.label, x.f.code === 'overdue' ? 'bad' : 'warn'), btn('Log it as held', () => logCheckin(x.c))))) : h('p', { text: 'No check-ins are due.' })),
        h('section', { class: 'panel' }, h('h4', { text: 'Fortnightly post' }), pta, wc, h('div', { class: 'cluster' }, btn('Copy post', () => copy(pta.value)), btn('Copy a prompt for Copilot or Claude', () => copy(R.promptFor('post', S, T()))), btn('Reset text', () => { pta.value = post.body; ui.postText = null; pta.dispatchEvent(new Event('input')); ui.postText = null; }))))
    ];
  }
  function logCheckin(c) {
    const note = area(c.notes || '', { rows: 3 });
    const dlg = modal('Log the check-in with ' + c.unit, [field('Held on', inp('date', T(), { id: 'ci-date' })), field('What came up (a line or two)', note)],
      [btn('Cancel', () => dlg.close()), btn('Save', () => { const d = $('#ci-date', dlg).value || T(); c.lastMet = d; c.nextDue = R.addWorkingDays(d, 20, holidays()); c.notes = note.value; dlg.close(); commit(); toast('Check-in logged. Next one due ' + hd(c.nextDue) + '.'); }, 'btn--small')]);
  }

  // ---- Register ------------------------------------------------------------
  const FIELDS = [
    ['title', 'Title', 'text'], ['type', 'Type', ['Useful GPT', 'Claude Project', 'Copilot agent', 'Automation', 'Idea only']], ['owner', 'Owner', 'person'], ['rag', 'Status', ['Green', 'Amber', 'Red']],
    ['dataClass', 'Data class', Object.keys(R.DATA_RANK)], ['signOff', 'Sign-off date', 'date'], ['budget', 'Budget line', ['Programme', 'Function', 'None yet']],
    ['currentWorkflow', 'Current workflow, in three lines', 'area'], ['redesignedWorkflow', 'Redesigned workflow, in three lines', 'area'],
    ['baselineMin', 'Minutes each time, today', 'number'], ['withAiMin', 'Minutes each time with the tool, including review', 'number'], ['runsPerMonth', 'Runs a month', 'number'], ['unusedShare', 'Share of output not used (0 to 1)', 'number'],
    ['basis', 'How the estimate was made', ['Measured', 'Sampled', 'Self-reported', 'None yet']], ['dataSource', 'Where the usage data comes from', 'text'], ['exportedBy', 'Who exports it', 'text'],
    ['nextMilestone', 'Next milestone', 'text'], ['nextMilestoneDate', 'Next milestone date', 'date'], ['howToUse', 'Staff page: use it for', 'area'], ['notFor', 'Staff page: not for', 'area']
  ];
  // Fields a request needs before it can be ranked (shown for ideas and triage).
  const IDEA_FIELDS = [['task', 'Kind of task', Object.keys(R.TASKS).filter((k) => k !== 'new-idea').map((k) => [k, R.TASKS[k]])], ['volumePerMonth', 'Times a month', 'number'], ['minutesPerRun', 'Minutes each time, today', 'number'], ['complexity', 'Effort (Low, Medium, High)', [['', 'Not set'], 'Low', 'Medium', 'High']], ['success', 'What good looks like', 'area']];
  function viewRegister() {
    const f = ui.regF;
    const t = T();
    let rows = S.register.map((r) => ({ r, fl: R.registerFlags(r, t, holidays()) }));
    if (f.q) rows = rows.filter((x) => (x.r.id + ' ' + x.r.title + ' ' + x.r.type + ' ' + x.r.function + ' ' + pname(x.r.owner)).toLowerCase().includes(f.q.toLowerCase()));
    if (f.stage) rows = rows.filter((x) => x.r.stage === f.stage);
    if (f.unit) rows = rows.filter((x) => x.r.function === f.unit);
    if (f.data) rows = rows.filter((x) => x.r.dataClass === f.data);
    if (f.flag) rows = rows.filter((x) => (f.flag === 'any' ? x.fl.length : x.fl.some((y) => y.code === f.flag)));
    const sub = h('div', { class: 'cluster', role: 'group', 'aria-label': 'Register view' },
      h('button', { type: 'button', class: 'btn btn--small ' + (ui.reg === 'table' ? '' : 'btn--ghost'), 'aria-pressed': String(ui.reg === 'table'), onclick: () => { ui.reg = 'table'; commit(); }, text: 'The register' }),
      h('button', { type: 'button', class: 'btn btn--small ' + (ui.reg === 'impact' ? '' : 'btn--ghost'), 'aria-pressed': String(ui.reg === 'impact'), onclick: () => { ui.reg = 'impact'; commit(); }, text: 'Impact' }));
    if (ui.reg === 'impact') return [h('div', { class: 'vpanel__head' }, h('h3', { text: 'Impact' }), sub), viewImpact()];

    const on = (key) => (e) => { f[key] = e.target.value; commit('[data-k="' + key + '"]'); };
    const stageSel = (x) => {
      const el = select(R.STAGES, x.r.stage, { 'aria-label': 'Stage of ' + x.r.id });
      el.addEventListener('change', () => moveStage(x.r, el.value));
      return el;
    };
    const body = rows.map((x) => h('tr', null,
      h('td', { text: x.r.id }),
      h('th', { scope: 'row' }, h('button', { type: 'button', class: 'linkbtn', onclick: () => drawer(x.r), text: x.r.title }), h('div', { class: 'muted', text: x.r.type })),
      h('td', { text: x.r.function }), h('td', { text: pname(x.r.owner) }),
      h('td', null, stageSel(x)), h('td', null, ragTag(x.r.rag)), h('td', { text: x.r.dataClass === R.CONF ? 'Confidential' : x.r.dataClass }),
      h('td', null, h('span', { class: 'tags' }, x.fl.map((y) => tag(y.label, 'warn')))), h('td', { text: hd(x.r.lastUpdate, false) })));
    return [
      h('div', { class: 'vpanel__head' }, h('h3', { text: 'Register' }), sub),
      howto('How it runs', 'One row per workflow, not per tool. A line can move to Build without its two workflows written down, but the desk says what is missing and the flag stays on the line until it is fixed. A missing budget is an ask to the Lead. Staleness counts working days and skips bank holidays and the Christmas closure.'),
      h('div', { class: 'toolbar' },
        field('Search', inp('search', f.q, { 'data-k': 'q', oninput: (e) => { f.q = e.target.value; ui.focus = '[data-k="q"]'; const pos = e.target.selectionStart; render(); const el = $('[data-k="q"]', root); if (el) el.setSelectionRange(pos, pos); } })),
        field('Stage', select([['', 'All']].concat(R.STAGES), f.stage, { 'data-k': 'stage', onchange: on('stage') })),
        field('Unit', select([['', 'All']].concat(S.units.map((u) => u.name)), f.unit, { 'data-k': 'unit', onchange: on('unit') })),
        field('Data class', select([['', 'All']].concat(Object.keys(R.DATA_RANK)), f.data, { 'data-k': 'data', onchange: on('data') })),
        field('Flag', select([['', 'All'], ['any', 'Any flag'], ['stale', 'Stale'], ['milestone-missed', 'Milestone passed'], ['milestone-at-risk', 'Milestone at risk'], ['sign-off-missing', 'Sign-off missing'], ['workflow-gap', 'Workflow not written down'], ['no-baseline', 'No baseline'], ['no-budget', 'Budget ask']], f.flag, { 'data-k': 'flag', onchange: on('flag') })),
        btn('Add a line', () => requestDialog({}), 'btn--small'),
        btn('Export CSV', () => download('register.csv', csv([['ID', 'Title', 'Type', 'Unit', 'Owner', 'Stage', 'Status', 'Data class', 'Flags', 'Last update']].concat(rows.map((x) => [x.r.id, x.r.title, x.r.type, x.r.function, pname(x.r.owner), x.r.stage, x.r.rag, x.r.dataClass, x.fl.map((y) => y.label).join('; '), x.r.lastUpdate]))))),
      ),
      h('p', { class: 'hint', 'aria-live': 'polite', text: rows.length + ' of ' + S.register.length + ' lines shown.' }),
      table('Register', ['ID', 'Line and type', 'Unit', 'Owner', 'Stage', 'Status', 'Data class', 'Flags', 'Updated'], body)
    ];
  }
  function moveStage(item, to) {
    if (to === item.stage) return;
    const chk = R.canMove(item, to);
    const note = inp('text', '', { id: 'mv-note' });
    const body = [h('p', { text: item.id + ' ' + item.title + ': ' + item.stage + ' to ' + to + '.' }),
      chk.ok ? h('p', { class: 'muted', text: 'Everything the next stage expects is in place.' }) : h('div', { class: 'callout callout--caution', role: 'note' }, h('p', { class: 'callout__title', text: 'Not yet in place' }), h('ul', null, chk.reasons.map((r) => h('li', { text: r }))), h('p', { text: 'You can move it anyway. The flags stay on the line until each is fixed, so the register does not claim more than is true.' })),
      field('A line for the history (optional)', note)];
    const dlg = modal('Move to ' + to, body, [btn('Cancel', () => dlg.close()), btn(chk.ok ? 'Move' : 'Move anyway and keep the flags', () => {
      item.history = item.history || []; item.history.push({ date: T(), from: item.stage, to, note: note.value });
      item.stage = to; item.lastUpdate = T(); dlg.close(); commit(); toast(item.id + ' moved to ' + to + '.');
    }, 'btn--small')], () => { render(); });
  }
  function drawer(item) {
    const form = h('form', { class: 'form-grid', onsubmit: (e) => e.preventDefault() });
    const inputs = {};
    const isIdea = item.stage === 'Idea' || item.stage === 'Triage';
    FIELDS.concat(isIdea ? IDEA_FIELDS : []).forEach(([k, label, kind]) => {
      let el;
      if (Array.isArray(kind)) el = select(kind, item[k], { id: nid() });
      else if (kind === 'person') el = select(S.people.filter((p) => !p.group).map((p) => [p.id, p.name]), item[k], { id: nid() });
      else if (kind === 'area') el = area(item[k], { rows: 3 });
      else el = inp(kind, item[k], kind === 'number' ? { step: 'any', min: '0' } : {});
      inputs[k] = el;
      const wrap = field(label, el); if (kind === 'area') wrap.className = 'wide'; form.append(wrap);
    });
    const hist = (item.history || []).slice().reverse();
    const net = R.netHours(item);
    const flags = R.registerFlags(item, T(), holidays());
    const body = [h('div', { class: 'tags' }, ragTag(item.rag), tag(item.stage, 'accent'), flags.map((f) => tag(f.label, 'warn'))),
      net ? h('p', { text: 'Estimated hours a month: ' + net.gross + ' gross, ' + net.net + ' net of unused output. Time with the tool includes review and correction.' }) : null,
      form, h('h4', { text: 'History' }), hist.length ? h('ul', null, hist.map((x) => h('li', { text: hd(x.date) + ': ' + x.from + ' to ' + x.to + (x.note ? ', ' + x.note : '') }))) : h('p', { text: 'No moves yet.' })];
    const dlg = modal(item.id + ' ' + item.title, body, [btn('Cancel', () => dlg.close()), btn('Save', () => {
      FIELDS.concat(isIdea ? IDEA_FIELDS : []).forEach(([k, , kind]) => {
        let v = inputs[k].value;
        if (kind === 'number') { v = v === '' ? (isIdea && (k === 'volumePerMonth' || k === 'minutesPerRun') ? null : 0) : Math.max(0, Number(v) || 0); }
        if (k === 'unusedShare') v = v > 1 && v <= 100 ? v / 100 : Math.min(1, Math.max(0, v));   // 0 to 1, or a percentage
        if (kind === 'date' && !v) v = null;
        item[k] = v;
      });
      if (isIdea) item.requestedBy = item.requestedBy || pname(item.owner);
      item.lastUpdate = T(); dlg.close(); commit(); toast(item.id + ' saved.');
    }, 'btn--small')]);
  }

  // Add a line or a buildable request
  function requestDialog(pre) {
    const els = {};
    const mk = (k, label, el, wide, hint) => { els[k] = el; const w = field(label, el, hint); if (wide) w.className = 'wide'; return w; };
    const owners = S.people.filter((p) => !p.group).map((p) => [p.id, p.name]);
    const form = h('form', { class: 'form-grid', onsubmit: (e) => e.preventDefault() },
      mk('title', 'What it is called', inp('text', pre.title || ''), true),
      mk('function', 'Unit', select([['', 'Choose a unit']].concat(S.units.map((u) => u.name)), pre.function || '')),
      mk('type', 'Kind of tool (if known)', select(['Idea only', 'Useful GPT', 'Claude Project', 'Copilot agent', 'Automation'], 'Idea only')),
      mk('owner', 'Who asked (a named person)', select([['', 'Choose a person']].concat(owners), pre.owner || '')),
      mk('task', 'Kind of task', select(Object.keys(R.TASKS).filter((x) => x !== 'new-idea').map((k) => [k, R.TASKS[k]]), pre.task && pre.task !== 'new-idea' ? pre.task : 'draft-summarise')),
      mk('dataClass', 'Kind of material', select([['', 'Choose the kind of material']].concat(Object.keys(R.DATA_RANK)), pre.dataClass || '')),
      mk('currentWorkflow', 'How it is done today, in three lines', area(pre.currentWorkflow || ''), true),
      mk('volumePerMonth', 'How many times a month', inp('number', pre.volumePerMonth || '', { min: '0' })),
      mk('minutesPerRun', 'Minutes each time, today', inp('number', pre.minutesPerRun || '', { min: '0' })),
      mk('success', 'What good looks like', area(pre.success || ''), true),
      mk('complexity', 'Effort (set at triage, optional)', select([['', 'Not set'], 'Low', 'Medium', 'High'], ''), false, 'Low, Medium or High. Used only to propose an order.'));
    const dlg = modal('Request a build', [h('p', { class: 'muted', text: 'A request with every field filled can be ranked. A request with gaps goes into the "needs detail" list and nothing is lost.' }), form],
      [btn('Cancel', () => dlg.close()), btn('Add to the register as an idea', () => {
        const need = [['title', 'a title'], ['function', 'a unit'], ['owner', 'who asked'], ['dataClass', 'the kind of material']].find(([k]) => !String(els[k].value).trim());
        if (need) { els[need[0]].focus(); toast('Please choose ' + need[1] + ' first.'); return; }
        const it = { id: nextId(S.register, 'R-'), title: els.title.value.trim(), type: els.type.value, function: els.function.value, label: '', owner: els.owner.value, stage: 'Idea', rag: 'Green', dataClass: els.dataClass.value, signOff: null, budget: 'None yet', task: els.task.value,
          requestedBy: pname(els.owner.value), currentWorkflow: els.currentWorkflow.value, redesignedWorkflow: '', volumePerMonth: els.volumePerMonth.value === '' ? null : Number(els.volumePerMonth.value), minutesPerRun: els.minutesPerRun.value === '' ? null : Number(els.minutesPerRun.value),
          complexity: els.complexity.value, success: els.success.value, baselineMin: 0, withAiMin: 0, runsPerMonth: 0, unusedShare: 0, basis: 'None yet', dataSource: '', exportedBy: '', lastUpdate: T(), nextMilestone: 'Decision at triage', nextMilestoneDate: R.addWorkingDays(T(), 5, holidays()), howToUse: '', notFor: '', championId: '', history: [{ date: T(), from: '(new)', to: 'Idea', note: 'Raised through a request' }] };
        S.register.push(it); dlg.close(); commit(); toast(it.id + ' added to the register as an idea.');
      }, 'btn--small')]);
  }

  // ---- Impact --------------------------------------------------------------
  function svg(tagName, attrs, kids) { const el = document.createElementNS('http://www.w3.org/2000/svg', tagName); for (const k in attrs) el.setAttribute(k, attrs[k]); (kids || []).forEach((c) => el.append(c)); return el; }
  const stext = (x, y, txt, cls, anchor) => { const e = svg('text', { x, y, class: cls || '', 'text-anchor': anchor || 'start' }); e.textContent = txt; return e; };
  function lineChart() {
    const W = 860, Ht = 330, L = 40, Rm = 310, Tp = 16, B = 30;
    const tools = S.adoption.map((a) => ({ a, r: S.register.find((r) => r.id === a.tool) }));
    const max = Math.ceil(Math.max.apply(null, tools.map((x) => Math.max.apply(null, x.a.weeks.map((w) => w.activeUsers || 0)))) / 10) * 10;
    const n = tools[0].a.weeks.length;
    const x = (i) => L + (i / (n - 1)) * (W - L - Rm), y = (v) => Tp + (1 - v / max) * (Ht - Tp - B);
    const kids = [];
    [0, 0.5, 1].forEach((p) => { const v = Math.round(max * p); kids.push(svg('line', { x1: L, x2: W - Rm, y1: y(v), y2: y(v), class: 'grid' }), stext(L - 6, y(v) + 4, v, '', 'end')); });
    [0, 4, 8, 11].forEach((i) => kids.push(stext(x(i), Ht - 8, hd(tools[0].a.weeks[i].weekStart, false), '', 'middle')));
    const top = tools.slice().sort((p, q) => lastVal(q) - lastVal(p))[0];
    function lastVal(t) { const w = t.a.weeks; return w[w.length - 1].activeUsers || 0; }
    const ends = [];
    tools.forEach((t) => {
      const pts = t.a.weeks.map((w, i) => (w.activeUsers === null ? null : [x(i), y(w.activeUsers)])).filter(Boolean);
      const acc = t === top;
      kids.push(svg('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: 'ln' + (acc ? ' acc' : '') }));
      const last = pts[pts.length - 1];
      ends.push({ y: last[1], t, acc });
    });
    ends.sort((p, q) => p.y - q.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    ends.forEach((e) => kids.push(stext(W - Rm + 10, e.y + 4, e.t.r.title + ' ' + lastVal(e.t), 'lbl' + (e.acc ? ' acc' : ''))));
    const chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + Ht, role: 'img', 'aria-labelledby': 'lc-t lc-d' }, [(() => { const t = svg('title', { id: 'lc-t' }); t.textContent = 'Weekly active users by live tool, twelve weeks, illustrative'; return t; })(), (() => { const d = svg('desc', { id: 'lc-d' }); d.textContent = 'Line chart. The numbers are in the table below the chart.'; return d; })()].concat(kids));
    const dataTable = table('Weekly active users, by tool', ['Tool'].concat(tools[0].a.weeks.map((w) => hd(w.weekStart, false))), tools.map((t) => h('tr', null, h('th', { scope: 'row', text: t.r.title }), t.a.weeks.map((w) => h('td', { class: 'num', text: w.activeUsers === null ? '' : w.activeUsers })))));
    return h('figure', { class: 'chart', 'data-illustrative': true }, h('figcaption', { text: 'Illustrative data. Weekly tool-users by live tool, twelve weeks to the week starting ' + hd(tools[0].a.weeks[n - 1].weekStart, false) + '. Active means the person used the tool for real work that week. A person using two tools counts twice.' }), h('div', { class: 'svgwrap', role: 'region', 'aria-label': 'Weekly tool-users chart, scrolls sideways on a phone', tabindex: '0' }, chart), h('details', { class: 'howto' }, h('summary', { text: 'Show the numbers' }), dataTable));
  }
  function barChart() {
    const live = S.register.filter((r) => r.stage === 'Live' && R.netHours(r)).map((r) => ({ r, h: R.netHours(r) })).sort((a, b) => b.h.gross - a.h.gross);
    const max = Math.ceil(Math.max.apply(null, live.map((x) => x.h.gross)) / 10) * 10;
    const rowH = 44, W = 860, L = 310, Rm = 110, Tp = 10, Ht = Tp + live.length * rowH + 12;
    const sx = (v) => (v / max) * (W - L - Rm);
    const kids = [];
    live.forEach((x, i) => {
      const y0 = Tp + i * rowH;
      kids.push(stext(L - 10, y0 + 22, x.r.title, 'lbl', 'end'));
      kids.push(svg('rect', { x: L, y: y0 + 4, width: Math.max(1, sx(x.h.gross)), height: 14, class: 'bar-g' }), stext(L + sx(x.h.gross) + 8, y0 + 16, x.h.gross + ' gross'));
      kids.push(svg('rect', { x: L, y: y0 + 22, width: Math.max(1, sx(x.h.net)), height: 14, class: 'bar-n' }), stext(L + sx(x.h.net) + 8, y0 + 34, x.h.net + ' net', 'lbl acc'));
    });
    const chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + Ht, role: 'img', 'aria-labelledby': 'bc-t' }, [(() => { const t = svg('title', { id: 'bc-t' }); t.textContent = 'Hours saved a month, gross and net, for each live tool, illustrative'; return t; })()].concat(kids));
    return h('figure', { class: 'chart', 'data-illustrative': true }, h('figcaption', { text: 'Illustrative data. Estimated hours saved a month for each live tool, gross and net of output that was not used. Hours, not money.' }), h('div', { class: 'svgwrap', role: 'region', 'aria-label': 'Hours saved chart, scrolls sideways on a phone', tabindex: '0' }, chart),
      h('div', { class: 'legend' }, h('span', null, h('i', { style: 'background: var(--border-strong)' }), 'Gross'), h('span', null, h('i', { style: 'background: var(--accent)' }), 'Net of unused output')));
  }
  function viewImpact() {
    const tot = R.impactTotals(S);
    const like = R.likeForLike(S);
    const live = S.register.filter((r) => r.stage === 'Live');
    return h('div', { class: 'stack--loose', style: 'display: grid; gap: var(--space-6)' },
      howto('How it runs', 'Each live tool carries a baseline, the time it takes now including review and correction, how many times a month it runs, and the share of output that was not used. Gross is the time saved if every output were used. Net removes the unused share. The basis says how the estimate was made, and each tool names where its usage data comes from and who exports it.'),
      h('div', { class: 'tiles' }, [[tot.live, 'tools live'], [Math.round(tot.gross), 'hours a month saved, gross'], [Math.round(tot.net), 'hours a month saved, net'], [like.now, 'weekly tool-users on tools live four weeks ago, from ' + like.before], [like.freshUsers, 'tool-users on a tool launched since']].map((t) => h('div', { class: 'tile' }, h('span', { class: 'tile__v', text: t[0] }), h('span', { class: 'tile__l', text: t[1] })))),
      lineChart(), barChart(),
      table('Live tools and the basis of each estimate', ['Tool', 'Owner', 'Gross hours', 'Net hours', 'Basis', 'Usage data comes from', 'Exported by'], live.map((r) => { const n = R.netHours(r); return h('tr', null, h('th', { scope: 'row', text: r.title }), h('td', { text: pname(r.owner) }), h('td', { class: 'num', text: n ? n.gross : '' }), h('td', { class: 'num', text: n ? n.net : '' }), h('td', null, tag(r.basis, r.basis === 'Measured' ? 'ok' : r.basis === 'Sampled' ? 'accent' : 'warn')), h('td', { text: r.dataSource }), h('td', { text: r.exportedBy })); })));
  }

  // ---- Forums --------------------------------------------------------------
  function viewForums() {
    const sub = h('div', { class: 'cluster', role: 'group', 'aria-label': 'Forum views' }, [['sessions', 'Sessions'], ['actions', 'Actions'], ['monthly', 'Monthly one-pager']].map(([k, l]) =>
      h('button', { type: 'button', class: 'btn btn--small ' + (ui.forumTab === k ? '' : 'btn--ghost'), 'aria-pressed': String(ui.forumTab === k), onclick: () => { ui.forumTab = k; commit(); }, text: l })));
    const body = { sessions: forumSessions, actions: forumActions, monthly: forumMonthly }[ui.forumTab]();
    return [h('div', { class: 'vpanel__head' }, h('h3', { text: 'Forums' }), sub), body];
  }
  function forumSessions() {
    const t = T();
    const list = S.meetings.filter((m) => m.forum === ui.forum).sort((a, b) => a.date < b.date ? 1 : -1);
    if (!ui.mid || !S.meetings.find((m) => m.id === ui.mid && m.forum === ui.forum)) { const nxt = list.slice().reverse().find((m) => m.status === 'Planned' && m.date >= t); ui.mid = (nxt || list[0]).id; }
    const m = S.meetings.find((x) => x.id === ui.mid);
    const pick = h('div', { class: 'toolbar' },
      h('div', { class: 'cluster', role: 'group', 'aria-label': 'Forum' }, [['WG', 'Working Group, fortnightly'], ['FPG', 'Functional Group, monthly']].map(([k, l]) => h('button', { type: 'button', class: 'btn btn--small ' + (ui.forum === k ? '' : 'btn--ghost'), 'aria-pressed': String(ui.forum === k), onclick: () => { ui.forum = k; ui.mid = null; commit(); }, text: l }))),
      field('Session', select(list.map((x) => [x.id, hd(x.date) + ', ' + x.status]), m.id, { id: 'mid', onchange: (e) => { ui.mid = e.target.value; commit('#mid'); } })));
    const how = howto('How the two forums fit', 'The Working Group meets fortnightly and works at the level of individual lines: it clears blockers, triages ideas and chases actions. It sends the Functional Group only what needs a decision above its level: budget, policy, sign-off and anything slipping for a second time. The Functional Group meets monthly and looks at the whole programme. The Lead owns both agendas and approves the agenda and the minutes before they go out. Call for items goes out five working days before; pre-reads two days before; minutes the working day after; actions are chased three working days after. A unit that sends apologies to two sessions in a row is flagged, and a deputy is asked for.');
    const ap = R.apologyFlags(S, ui.forum);
    const apNote = ap.length ? h('div', { class: 'callout callout--note', role: 'note' }, h('p', { class: 'callout__title', text: 'Attendance' }), h('p', { text: ap.map((a) => a.unit).join(', ') + ': apologies at the last ' + ap[0].count + ' sessions. Ask for a named deputy.' })) : null;
    return [pick, how, apNote, m.status === 'Held' ? heldView(m) : plannedView(m)];
  }
  function heldView(m) {
    const paper = h('div', { class: 'pack-wrap', style: 'padding: 0' }); paper.innerHTML = PR.minutes(S, m);
    return h('div', { class: 'stack' }, h('div', { class: 'cluster' }, tag('Held and issued', 'ok'), btn('Print the minutes', () => printHTML(PR.minutes(S, m)))), paper);
  }
  function plannedView(m) {
    const t = T();
    const ag = R.buildAgenda(S, m.forum, m.date);
    const d = (ui.mdraft[m.id] = ui.mdraft[m.id] || { attendees: [], apologies: [], notes: {}, decisions: '', rows: [{ text: '', owner: 'p-coord', due: '' }] });
    const agTable = table('Running order', ['Time', 'Item', 'For', 'Presenter', 'What is on it'], ag.items.map((i) => h('tr', null,
      h('td', { class: 'num', text: Math.floor(i.startOffset / 60) + ':' + String(i.startOffset % 60).padStart(2, '0') }), h('th', { scope: 'row' }, i.title, h('div', { class: 'muted', text: i.minutes + ' min' })), h('td', { text: i.purpose }), h('td', { text: i.presenter }), h('td', null, h('ul', null, i.lines.map((l) => h('li', { text: l })))))));
    const approved = !!m.agendaApproved;
    const future = m.date > t;
    const prepBox = prepList(m, FORUM_LABEL[m.forum]);
    const attBox = (key, label, other) => h('fieldset', { class: 'panel' }, h('legend', { class: 'label', text: label }), h('div', { class: 'checks' }, S.units.map((u, ui2) => { const id = 'att-' + key + '-' + ui2; const cb = h('input', { type: 'checkbox', id, onchange: (e) => { const a = d[key]; if (e.target.checked) { a.push(u.name); const o = d[other].indexOf(u.name); if (o >= 0) d[other].splice(o, 1); } else a.splice(a.indexOf(u.name), 1); commit('#' + id); } }); if (d[key].includes(u.name)) cb.checked = true; return h('label', { for: id }, cb, u.name); })));
    const notes = ag.items.map((i) => { const ta = area(d.notes[i.id] || '', { rows: 2, id: 'note-' + i.id, oninput: (e) => { d.notes[i.id] = e.target.value; } }); return field(i.title, ta); });
    const dec = area(d.decisions, { rows: 3, id: 'decisions', oninput: (e) => { d.decisions = e.target.value; } });
    const rows = d.rows.map((r, idx) => h('div', { class: 'form-grid' },
      field('Action ' + (idx + 1), inp('text', r.text, { oninput: (e) => { r.text = e.target.value; } })),
      field('Owner (one named person)', select(S.people.filter((p) => !p.group && p.id !== 'p-lead').map((p) => [p.id, p.name]), r.owner, { onchange: (e) => { r.owner = e.target.value; } })),
      field('Due (blank means seven working days)', inp('date', r.due, { onchange: (e) => { r.due = e.target.value; } }))));
    const issue = () => {
      const newActions = d.rows.filter((r) => r.text.trim());
      const made = R.publishMinutes(S, { meetingId: m.id, newActions });
      made.forEach((a) => S.actions.push(a));
      m.attendees = d.attendees.slice(); m.apologies = d.apologies.slice(); m.notes = Object.assign({}, d.notes); m.decisions = d.decisions.split('\n').map((x) => x.trim()).filter(Boolean);
      m.actionsRaised = made.map((a) => a.id); m.status = 'Held'; m.approval = 'Issued'; m.prep = Object.assign({}, m.prep, { minutes: true });
      delete ui.mdraft[m.id]; commit(); toast('Issued. ' + made.length + (made.length === 1 ? ' action' : ' actions') + ' added to the log.');
    };
    return h('div', { class: 'stack' },
      h('div', { class: 'cols' }, prepBox, h('div', { class: 'panel' }, h('h4', { text: 'Agenda status' }), h('p', null, tag(approved ? 'Approved by the Lead' : 'Draft for the Lead', approved ? 'ok' : 'warn')), h('p', { class: 'muted', text: 'The Lead owns the agenda. This one is built from the register and the action log, and only includes what has content.' }),
        h('div', { class: 'cluster' }, btn(approved ? 'Withdraw approval' : 'Mark as approved by the Lead', () => { m.agendaApproved = !approved; commit(); }), btn('Print the agenda', () => printHTML(PR.agenda(S, ag, m)))))),
      h('h3', { text: 'Running order, ' + ag.total + ' minutes' }), agTable,
      h('h3', { text: 'Minutes' }), h('div', { class: 'cluster' }, btn('Copy a prompt for Copilot or Claude', () => copy(R.promptFor('minutes', S, T()))), h('span', { class: 'hint', text: 'The assistant drafts from your notes; a person checks every line before it goes to the Lead.' })),
      h('p', { class: 'muted', text: 'Record the session here. Issuing the minutes adds each new action to the log with an owner and a date. Issuing is simulated: it marks the session as held.' }),
      h('div', { class: 'cols' }, attBox('attendees', 'Present', 'apologies'), attBox('apologies', 'Apologies', 'attendees')),
      h('div', { class: 'form-grid' }, notes), field('Decisions, one per line', dec), h('h4', { text: 'New actions' }), rows,
      h('div', { class: 'cluster' }, btn('Add an action row', () => { d.rows.push({ text: '', owner: 'p-coord', due: '' }); commit(); }),
        btn(m.minutesApproved ? 'Withdraw approval of the minutes' : 'Mark the minutes as approved by the Lead', () => { m.minutesApproved = !m.minutesApproved; commit(); }),
        btn('Issue the minutes and add the actions', issue, 'btn--small', (m.minutesApproved && !future) ? {} : { disabled: 'true', 'aria-disabled': 'true' })),
      future ? h('div', { class: 'cluster' }, h('p', { class: 'hint', text: 'Minutes can only be issued once the session has taken place.' }), btn('Set the programme date to ' + hd(m.date), () => { S.meta.programmeDate = m.date; commit(); })) : (m.minutesApproved ? null : h('p', { class: 'hint', text: 'The Lead approves the minutes before they are issued.' })));
  }
  const FORUM_LABEL = { WG: 'Working Group', FPG: 'Functional Group' };

  function forumActions() {
    const t = T(), f = ui.actF;
    const stateOrder = { overdue: 0, 'due-soon': 1, blocked: 2, 'no-date': 3, open: 4, done: 5, dropped: 6 };
    let rows = S.actions.map((a) => ({ a, st: R.actionState(a, t, holidays()) }));
    if (f.forum) rows = rows.filter((x) => x.a.forum === f.forum);
    if (f.owner) rows = rows.filter((x) => x.a.owner === f.owner);
    if (f.state) rows = rows.filter((x) => x.st === f.state);
    rows.sort((p, q) => stateOrder[p.st] - stateOrder[q.st] || (p.a.due || '9') .localeCompare(q.a.due || '9'));
    const on = (k) => (e) => { f[k] = e.target.value; commit('[data-k="a' + k + '"]'); };
    const body = rows.map((x) => { const a = x.a; const ch = (a.chases || []).length; return h('tr', null,
      h('td', { text: a.id }), h('th', { scope: 'row', text: a.text }), h('td', { text: pname(a.owner) }), h('td', { text: a.forum === 'WG' ? 'Working Group' : 'Functional Group' }),
      h('td', null, a.due ? hd(a.due) : 'No date', (a.redates || []).length ? h('div', { class: 'muted', text: 're-dated ' + a.redates.length + ' time' + (a.redates.length > 1 ? 's' : '') }) : null),
      h('td', null, stateTag(a), a.blockedOn ? h('div', { class: 'muted', text: 'on ' + a.blockedOn }) : null), h('td', { class: 'num', text: ch ? ch + ', last ' + hd(a.chases[ch - 1].date, false) : '0' }),
      h('td', null, a.status === 'Done' || a.status === 'Dropped' ? null : h('span', { class: 'cluster' }, btn('Done', () => { a.status = 'Done'; a.doneDate = t; commit(); toast(a.id + ' done.'); }), btn('Re-date', () => redateDialog(a)), btn(a.status === 'Blocked' ? 'Unblock' : 'Block', () => { if (a.status === 'Blocked') { a.status = 'Open'; delete a.blockedOn; commit(); } else blockDialog(a); }), btn('Drop', () => dropDialog(a))))); });
    return h('div', { class: 'stack' },
      howto('How it runs', 'Four states: open, blocked, done, dropped. Most actions are re-dated rather than done, so a new date resets the chase ladder and a count of how often it has slipped stays on the action. A blocked action names who it is waiting on and is not chased: the blocker is. An action with no date, or owned by a group, cannot be chased and is flagged until it is fixed.'),
      h('div', { class: 'toolbar' },
        field('Forum', select([['', 'Both'], ['WG', 'Working Group'], ['FPG', 'Functional Group']], f.forum, { 'data-k': 'aforum', onchange: on('forum') })),
        field('Owner', select([['', 'Anyone']].concat(S.people.map((p) => [p.id, p.name])), f.owner, { 'data-k': 'aowner', onchange: on('owner') })),
        field('State', select([['', 'Any'], ['overdue', 'Overdue'], ['due-soon', 'Due soon'], ['open', 'Open'], ['blocked', 'Blocked'], ['no-date', 'No date'], ['done', 'Done'], ['dropped', 'Dropped']], f.state, { 'data-k': 'astate', onchange: on('state') })),
        btn('Add an action', () => addActionDialog(), 'btn--small'),
        btn('Export CSV', () => download('actions.csv', csv([['ID', 'Action', 'Owner', 'Forum', 'Due', 'State', 'Chases']].concat(rows.map((x) => [x.a.id, x.a.text, pname(x.a.owner), x.a.forum, x.a.due, x.st, (x.a.chases || []).length])))))),
      h('p', { class: 'hint', 'aria-live': 'polite', text: rows.length + ' of ' + S.actions.length + ' actions shown.' }),
      table('Action log', ['Ref', 'Action', 'Owner', 'Forum', 'Due', 'State', 'Chases', 'Update'], body));
  }
  function redateDialog(a) {
    const d = inp('date', '', { id: 'rd' });
    const dlg = modal('Re-date ' + a.id, [h('p', { text: a.text }), field('New due date', d), h('p', { class: 'hint', text: 'This resets the chase ladder and adds to the count of re-dates.' })], [btn('Cancel', () => dlg.close()), btn('Re-date', () => { if (!d.value) { d.focus(); return; } const n = R.redate(a, d.value, T()); Object.assign(a, n); dlg.close(); commit(); toast(a.id + ' re-dated to ' + hd(d.value) + '.'); }, 'btn--small')]);
  }
  function blockDialog(a) {
    const w = inp('text', '', { id: 'bo' });
    const dlg = modal('Block ' + a.id, [h('p', { text: a.text }), field('Blocked on (a person or a decision)', w)], [btn('Cancel', () => dlg.close()), btn('Mark as blocked', () => { if (!w.value.trim()) { w.focus(); return; } a.status = 'Blocked'; a.blockedOn = w.value.trim(); dlg.close(); commit(); }, 'btn--small')]);
  }
  function dropDialog(a) {
    const w = inp('text', '', { id: 'dn' });
    const dlg = modal('Drop ' + a.id, [h('p', { text: a.text }), field('Why it is being dropped', w)], [btn('Cancel', () => dlg.close()), btn('Drop it', () => { a.status = 'Dropped'; a.note = w.value.trim(); dlg.close(); commit(); }, 'btn--small')]);
  }
  function addActionDialog() {
    const tx = inp('text', '', { id: 'aa' }); const ow = select(S.people.filter((p) => !p.group).map((p) => [p.id, p.name]), 'p-priya', { id: nid() }); const fm = select([['WG', 'Working Group'], ['FPG', 'Functional Group']], 'WG', { id: nid() }); const du = inp('date', '', { id: nid() });
    const dlg = modal('Add an action', [h('div', { class: 'form-grid' }, h('div', { class: 'wide' }, field('The action, starting with a verb', tx)), field('Owner', ow), field('Forum', fm), field('Due date', du))],
      [btn('Cancel', () => dlg.close()), btn('Add', () => { if (!tx.value.trim()) { tx.focus(); return; } const src = S.meetings.filter((m) => m.forum === fm.value && m.status === 'Held').sort((a, b) => a.date < b.date ? 1 : -1)[0]; S.actions.push({ id: nextId(S.actions, 'A-'), text: tx.value.trim(), owner: ow.value, forum: fm.value, source: src ? src.id : '', due: du.value || '', status: 'Open', chases: [] }); dlg.close(); commit(); toast('Action added.'); }, 'btn--small')]);
  }
  function forumMonthly() {
    const paper = h('div', { class: 'pack-wrap', style: 'padding: 0' }); paper.innerHTML = PR.onePager(S);
    return h('div', { class: 'stack' }, howto('How it runs', 'The monthly one-pager for the Head of Department is computed from the same register, action log and adoption data, so it cannot disagree with the forums. The Lead reads it before it goes. Hours are estimates and are never money.'), btn('Print the one-pager', () => printHTML(PR.onePager(S))), paper);
  }

  // ---- Network -------------------------------------------------------------
  function viewNetwork() {
    const t = T();
    const cov = R.coverage(S.champions, S.units);
    const champs = S.champions.map((c) => ({ c, f: R.championFlags(c, t) }));
    const po = R.proposedOrder(S);
    const checks = S.checkins.map((c) => ({ c, f: R.checkinFlag(c, t, holidays()) }));
    const ck = (c, key, label) => { const id = 'cl-' + c.id + key; const cb = h('input', { type: 'checkbox', id, 'aria-label': label + ' for ' + pname(c.person), onchange: (e) => { c.checklist[key] = e.target.checked; commit('#' + id); } }); if (c.checklist[key]) cb.checked = true; return cb; };
    const prio = (it) => { const i = inp('number', it.priority || '', { min: '1', 'aria-label': 'Lead priority for ' + it.id, style: 'width: 5em', onchange: (e) => { it.priority = e.target.value === '' ? null : Number(e.target.value); commit(); } }); i.removeAttribute('id'); return i; };
    return [
      h('div', { class: 'vpanel__head' }, h('h3', { text: 'Network' })),
      howto('How it runs', 'Champions come from every function and label, not only the technical ones, with the manager\'s sign-off and committed hours. The coverage map shows the gaps first. Check-ins keep every unit in conversation about where time goes, and each one can raise a request. A request with every field filled is ranked by addressable hours a month divided by effort; the Lead sets the final order.'),
      h('section', null, h('h4', { text: 'Coverage map' }), h('ul', { class: 'cover' }, cov.slice().sort((a, b) => (b.gap ? 1 : 0) - (a.gap ? 1 : 0)).map((u) => h('li', { class: u.gap ? 'gap' : '' }, h('span', { class: 'kind', text: u.kind }), h('b', { text: u.name }), u.gap ? tag('No champion yet', 'bad') : h('span', { text: u.champions.map((id) => pname(S.champions.find((c) => c.id === id).person)).join(', ') }))))),
      h('section', { class: 'stack' }, h('div', { class: 'vpanel__head' }, h('h4', { text: 'Champions directory' }), btn('Add a champion', () => championDialog(), 'btn--small')),
        table('Champions', ['Name', 'Unit', 'Manager sign-off', 'Hours a month', 'Last contact', 'Intro call', 'Training', 'First showcase', 'Flags'], champs.map(({ c, f }) => h('tr', null,
          h('th', { scope: 'row', text: pname(c.person) }), h('td', { text: c.unit }), h('td', { text: c.managerSignOff ? hd(c.managerSignOff, false) : 'Missing' }), h('td', { class: 'num', text: c.hoursPerMonth }), h('td', { text: hd(c.lastTouch, false) }),
          h('td', null, ck(c, 'intro', 'Intro call')), h('td', null, ck(c, 'training', 'Training')), h('td', null, ck(c, 'showcase', 'First showcase')), h('td', null, h('span', { class: 'tags' }, f.map((x) => tag(x.label, 'warn')))))))),
      h('section', { class: 'stack' }, h('h4', { text: 'Discovery check-ins' }), table('Check-ins', ['Unit', 'Last met', 'Next due', 'State', 'Raised', 'What came up', 'Update'], checks.map(({ c, f }) => h('tr', null,
        h('th', { scope: 'row', text: c.unit }), h('td', { text: c.lastMet ? hd(c.lastMet, false) : 'Not yet' }), h('td', { text: hd(c.nextDue, false) }), h('td', null, f ? tag(f.label, f.code === 'overdue' ? 'bad' : 'warn') : tag('On track', 'ok')), h('td', { text: c.raised.join(', ') }), h('td', { text: c.notes }), h('td', null, btn('Log it as held', () => logCheckin(c))))))),
      h('section', { class: 'stack' }, h('div', { class: 'vpanel__head' }, h('h4', { text: 'Backlog: order of requests' }), btn('Request a build', () => requestDialog({}), 'btn--small')),
        h('p', { class: 'muted', text: 'A proposal for the Lead. Addressable hours a month is how often the task happens multiplied by the minutes it takes today. Value divides that by effort: Low one, Medium two, High four. Where a similar tool is already live in another unit, the request could start from it. A Lead priority goes first, in the order given; the rest follow the proposal.' }),
        table('Order of requests', ['Order', 'Proposed', 'Request', 'Unit', 'Hours a month addressable', 'Effort', 'Value', 'Could start from', 'Lead priority'], po.ready.map((x) => h('tr', null, h('td', { class: 'num', text: x.finalRank + (x.overridden ? ' (Lead)' : '') }), h('td', { class: 'num', text: x.rank }), h('th', { scope: 'row', text: x.item.id + ' ' + x.item.title }), h('td', { text: x.item.function }), h('td', { class: 'num', text: x.hours }), h('td', { text: x.item.complexity }), h('td', { class: 'num', text: x.value }), h('td', { text: x.startsFrom.length ? x.startsFrom.map((r) => r.id + ' ' + r.title + ' (' + r.function + ')').join('; ') : 'Nothing similar live yet' }), h('td', null, prio(x.item))))),
        po.needs.length ? h('div', null, h('h4', { text: 'Needs more detail before it can be ranked' }), h('ul', null, po.needs.map((x) => h('li', { text: x.item.id + ' ' + x.item.title + ': ' + x.missing.join(', ') })))) : null),
      h('div', { class: 'cols' },
        h('section', { class: 'panel' }, h('h4', { text: 'Upskilling sessions, with L&D' }), h('ul', { class: 'steps' }, S.training.map((x) => h('li', null, h('span', { text: x.title }), h('span', { class: 'muted', text: hd(x.date) }), tag(x.seatsFree + ' seats free', x.seatsFree < 8 ? 'warn' : 'ok'))))),
        h('section', { class: 'panel' }, h('h4', { text: 'Events' }), S.events.map((e) => h('div', { class: 'stack' }, h('p', null, h('strong', { text: e.title }), ' ', tag(e.status, 'accent'), ' ', h('span', { class: 'muted', text: hd(e.date) })), h('div', { class: 'checks' }, e.logistics.map((l, i) => { const id = 'ev-' + e.id + i; const cb = h('input', { type: 'checkbox', id, onchange: (ev) => { l.done = ev.target.checked; commit('#' + id); } }); if (l.done) cb.checked = true; return h('label', { for: id }, cb, l.t); }))))))
    ];
  }
  function championDialog() {
    const taken = S.champions.map((c) => c.person);
    const sel = select(S.people.filter((p) => !p.group && !p.senior && p.id !== 'p-coord' && !taken.includes(p.id)).map((p) => [p.id, p.name + ', ' + p.unit]), '', { id: nid() });
    const hrs = inp('number', 4, { min: '0' }); const si = inp('date', '', { id: nid() });
    const dlg = modal('Add a champion', [h('div', { class: 'form-grid' }, field('Person', sel), field('Hours a month', hrs, 'Four is the expected minimum.'), field('Manager sign-off date (blank if not yet)', si))],
      [btn('Cancel', () => dlg.close()), btn('Add', () => { const p = S.people.find((x) => x.id === sel.value); if (!p) return; S.champions.push({ id: nextId(S.champions, 'C-'), person: p.id, unit: p.unit, managerSignOff: si.value || null, hoursPerMonth: Number(hrs.value), joined: T(), lastTouch: T(), checklist: { signOff: !!si.value, intro: false, training: false, showcase: false }, focus: '' }); dlg.close(); commit(); toast('Champion added.'); }, 'btn--small')]);
  }

  // ---- Front door (staff view) ---------------------------------------------
  function viewDoor() {
    const a = ui.door;
    const out = R.route({ unit: a.unit, function: a.unit, task: a.task, material: a.material }, S);
    const upd = (k) => (e) => { a[k] = e.target.value; commit('[data-k="d' + k + '"]'); };
    const radios = Object.keys(R.MATERIAL).map((k) => { const id = 'mat-' + k; const r = h('input', { type: 'radio', name: 'material', id, value: k, onchange: () => { a.material = k; commit('#' + id); } }); if (a.material === k) r.checked = true; return h('label', { for: id }, r, R.MATERIAL[k]); });
    const live = S.register.filter((r) => r.stage === 'Live');
    const li = [
      h('li', null, h('strong', { text: 'First, the rule' }), out.rule),
      h('li', null, h('strong', { text: 'A tool to start with' }), out.tools.length ? out.tools.map((t) => h('p', null, h('strong', { text: t.title }), ' (' + t.type + '). Use it for: ' + t.howToUse + ' Not for: ' + t.notFor)) : [h('span', { text: 'Nothing live yet for your team, for this kind of task with this kind of material.' }), out.elsewhere && out.elsewhere.length ? h('p', { class: 'muted', text: 'A similar tool is live in another team: ' + out.elsewhere.map((t) => t.title + ' (' + t.function + ')').join('; ') + '. Ask how it is used; the same pattern may fit yours, and the request can start from it.' }) : null]),
      h('li', null, h('strong', { text: 'Your champion' }), out.champion ? pname(out.champion.person) + ', ' + out.champion.unit + '. ' + out.champion.hoursPerMonth + ' hours a month set aside to help.' : 'There is no champion for ' + a.unit + ' yet. Ask the coordinator.'),
      h('li', null, h('strong', { text: 'Next session' }), out.training ? out.training.title + ', ' + hd(out.training.date) + ', ' + out.training.seatsFree + ' seats free.' : 'No session is booked.')
    ];
    return [
      h('div', { class: 'vpanel__head' }, h('h3', { text: 'Front door' }), tag('What colleagues see', 'accent')),
      howto('How it runs', 'This is the staff view. It answers "where do I start?" in a fixed order: the rule first, then a tool, then a person, then training. If nothing fits, the request goes to the register as an idea with the details the Lead needs to rank it.'),
      h('div', { class: 'door' },
        h('form', { class: 'panel', onsubmit: (e) => e.preventDefault() }, h('h4', { text: 'Where do I start?' }),
          field('Which team are you in?', select(S.units.map((u) => u.name), a.unit, { id: nid(), 'data-k': 'dunit', onchange: upd('unit') })),
          field('What do you want to do?', select(Object.keys(R.TASKS).map((k) => [k, R.TASKS[k]]), a.task, { id: nid(), 'data-k': 'dtask', onchange: upd('task') })),
          h('fieldset', null, h('legend', { class: 'label', text: 'What kind of material is it?' }), h('div', { class: 'stack--tight', style: 'display:grid;gap:4px' }, radios))),
        h('section', { class: 'answer', 'aria-live': 'polite' }, h('h4', { text: 'Your way in' }), h('ol', null, li), out.idea ? h('div', { class: 'cluster', style: 'margin-top: var(--space-4)' }, btn('Log it as an idea', () => requestDialog({ function: a.unit, task: a.task, dataClass: out.idea.dataClass }), 'btn--small')) : null)),
      h('section', { class: 'stack' }, h('h4', { text: 'What is live' }), h('div', { class: 'live-cards' }, live.map((r) => { const c = S.champions.find((x) => x.id === r.championId); return h('article', { class: 'live-card' }, h('h4', { text: r.title }), h('div', { class: 'tags' }, tag(r.type, 'accent'), tag(r.dataClass === R.CONF ? 'Confidential' : r.dataClass)), h('p', null, h('strong', { text: 'Use it for: ' }), r.howToUse), h('p', null, h('strong', { text: 'Not for: ' }), r.notFor), h('p', null, h('strong', { text: 'Ask: ' }), c ? pname(c.person) + ', ' + c.unit : pname(r.owner))); })))
    ];
  }

  // ---- tour buttons and boot ----------------------------------------------
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    ui.view = b.dataset.go; if (ui.view === 'forums') { ui.forumTab = 'sessions'; ui.forum = 'WG'; ui.mid = null; }
    render(); const d = document.getElementById('desk'); if (d) d.scrollIntoView({ behavior: 'auto' }); const t = $('#tab-' + ui.view, root); if (t) t.focus();
  }));
  render();
})();
