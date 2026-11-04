// pilot.js: the clickable mock-up. It imports the same engine as the build pack
// (pack/engine/clock.js, tested by clock.test.mjs), so every date shown here is the tool's own answer.
import * as clock from '../pack/engine/clock.js';
import { EMAILS } from './pilot-data.js';

const app = document.querySelector('[data-app]');
const live = document.querySelector('[data-live]');
const resetBtn = document.querySelector('[data-reset]');

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TYPES = {
  formal_complaint: 'Formal complaint',
  aftercare_item: 'Aftercare item for the customer portal',
  general_enquiry: 'General enquiry',
};
const STATUS = { 'on-track': 'On track', 'due-soon': 'Due soon', overdue: 'Overdue', met: 'Sent on time', 'met-late': 'Sent late' };

let H = new Set();
let TITLES = {};
let state;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parts = (iso) => iso.split('-').map(Number);
function fmt(iso) { if (!iso) return 'Not given'; const [y, m, d] = parts(iso); return `${DAYS[clock.dayOfWeek(iso)]} ${d} ${MONTHS[m - 1]} ${y}`; }
function fmtLong(iso) { const [y, m, d] = parts(iso); return `${LONG_DAYS[clock.dayOfWeek(iso)]} ${d} ${LONG_MONTHS[m - 1]} ${y}`; }
function say(msg) { if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); } }

function fresh() {
  return { id: null, type: null, reservation: '', completion: '', plot: '', confirmed: false, today: null, sent: {}, approvedOn: null, checked: false, letterText: null, concludedOn: null };
}

/* Why the clock starts when it does, in words. */
function startReason(received, initiation) {
  const short = (d) => fmt(d).replace(/ \d{4}$/, '');
  const notes = [];
  for (let d = clock.addDays(received, 1); d < initiation; d = clock.addDays(d, 1)) {
    const w = clock.dayOfWeek(d);
    if (H.has(d)) notes.push(`${short(d)} (${TITLES[d] || 'bank holiday'})`);
    else if (w === 6 && clock.addDays(d, 1) < initiation && !H.has(clock.addDays(d, 1))) { notes.push(`the weekend (${short(d)} and ${short(clock.addDays(d, 1))})`); d = clock.addDays(d, 1); }
    else if (w === 0 || w === 6) notes.push(`${short(d)} (weekend)`);
  }
  const first = `Received ${fmt(received)}.`;
  if (!notes.length) return `${first} The next day is a working day, so the clock starts ${fmt(initiation)}.`;
  const list = notes.join('; ');
  return `${first} Not working days: ${list}. So the clock starts ${fmt(initiation)}.`;
}

function dateIssue(e) {
  const r = state.reservation; const c = state.completion;
  if (r && r > e.received) return 'The reservation date is after the email arrived.';
  if (c && r && c < r) return 'The completion date is before the reservation date.';
  if (c && c > e.received) return 'The completion date is after the email arrived; check it against the sales records.';
  return '';
}

const refFor = (e) => e.ref || 'CMP-2026-015 (illustrative)';

/* The register row, listing enough 28-day updates to cover the date shown in the mock-up. */
function assessNow(e) {
  const input = { received: e.received, reservation: state.reservation, completion: state.completion, sent: state.sent, today: state.today || e.received };
  const day56 = clock.assess(input, H).rows.find((r) => r.key === 'nextSteps').due;
  const updates = input.today > day56 ? Math.ceil(clock.daysBetween(day56, input.today) / clock.UPDATE_EVERY) + 1 : 1;
  return clock.assess({ ...input, updates }, H);
}

/* The first letter: the prompt's own draft for a complaint, or a standard template when a person
   has overridden the first read. The date is filled from the register, never by the AI. */
function draftFor(e, a) {
  const s = e.suggestion;
  const first = (s.customer_name || e.from).split(' ')[0];
  const text = s.type === 'formal_complaint' ? s.draft_reply
    : `Dear ${first},\n\nThank you for your email. We have received your formal complaint and logged it with the Complaints Team.\n\nThe issues you have raised are: ${(s.issues && s.issues.length ? s.issues : ['the points in your email']).join('; ')}.\n\nThe team will set out its proposed pathway to resolution by [PATHWAY_DUE].\n\nKind regards,\n\nThe Complaints Team`;
  return text.replace(/\[PATHWAY_DUE\]/g, fmtLong(a.rows.find((r) => r.key === 'pathway').due));
}

/* Long-form dates written in a letter, e.g. "Friday 8 January 2027", as ISO dates (null if not a real date). */
function datesIn(text) {
  const re = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/g;
  const out = [];
  for (const m of text.matchAll(re)) {
    const iso = `${m[4]}-${String(LONG_MONTHS.indexOf(m[3]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    let ok = true;
    try { ok = LONG_DAYS[clock.dayOfWeek(iso)] === m[1]; } catch (err) { ok = false; }
    out.push({ text: m[0], iso: ok ? iso : null });
  }
  return out;
}

function letterState(e) {
  const a = assessNow(e);
  const pathway = a.rows.find((r) => r.key === 'pathway');
  const ack = a.rows.find((r) => r.key === 'ack');
  const text = (state.letterText || '').trim();
  const dates = datesIn(text);
  const pastDue = state.today > pathway.due;
  const pastPromise = pastDue && dates.some((d) => d.iso === pathway.due);
  let problem = '';
  if (pastPromise) problem = '';
  else if (text.length < 80) problem = 'The letter is empty or too short to send.';
  else if (/[\[\]]/.test(text)) problem = 'The letter still contains a square-bracket placeholder.';
  else if (!dates.length) problem = 'The letter must say when the proposed pathway will follow.';
  else if (dates.some((d) => !d.iso)) problem = `"${dates.find((d) => !d.iso).text}" is not a real date.`;
  else if (!pastDue && dates.some((d) => d.iso !== pathway.due)) problem = `The date in the letter must match the register: ${fmtLong(pathway.due)}.`;
  else if (pastDue && dates.some((d) => d.iso < state.today)) problem = 'A date in the letter has already passed.';
  const lateAck = state.today > ack.due;
  return { a, pathway, ack, pastPromise, problem, lateAck, canApprove: state.checked && !pastPromise && !problem };
}

function warnHtml(ls) {
  if (ls.problem) return `<p class="callout callout--caution late" role="note"><strong>Not ready to send.</strong> ${esc(ls.problem)}</p>`;
  if (ls.pastPromise) return `<p class="callout callout--caution late" role="note"><strong>Not ready to send.</strong> This draft promises the proposed pathway by ${esc(fmtLong(ls.pathway.due))}, which has already passed. Rewrite that line in the letter with a new date agreed with the team; approval unlocks once the past date is gone.</p>`;
  if (ls.lateAck) return `<p class="callout callout--caution late" role="note"><strong>This acknowledgement is late</strong> (it was due ${esc(fmt(ls.ack.due))}). Add a short apology for the delay in the letter before approving.</p>`;
  return '';
}

function render() {
  const email = EMAILS.find((e) => e.id === state.id);
  app.innerHTML = `
    <ol class="pilot__steps">
      <li class="pstep" aria-labelledby="ps1">
        <h3 class="pstep__title" id="ps1" tabindex="-1"><span class="pstep__num" data-ordinal>1</span> Inbox and first read</h3>
        <div class="inbox">
          <ul class="inbox__list" aria-label="Complaints mailbox, illustrative emails">
            ${EMAILS.map((e) => `<li><button type="button" class="inbox__btn" data-pick="${e.id}" aria-pressed="${e.id === state.id}">
              <span class="inbox__from">${esc(e.from)}</span><span class="inbox__subj">${esc(e.subject)}</span></button></li>`).join('')}
          </ul>
          <div>${email ? detail(email) : '<p class="hint">Pick an email to see what arrives and what Copilot reads in it.</p>'}</div>
        </div>
      </li>
      <li class="pstep" aria-labelledby="ps2" ${state.confirmed ? '' : 'aria-disabled="true"'}>
        <h3 class="pstep__title" id="ps2" tabindex="-1"><span class="pstep__num" data-ordinal>2</span> The register and the clock</h3>
        ${state.confirmed ? register(email) : '<p class="hint">Confirm a formal complaint in step one to see its row in the register.</p>'}
      </li>
      <li class="pstep" aria-labelledby="ps3" ${state.confirmed ? '' : 'aria-disabled="true"'}>
        <h3 class="pstep__title" id="ps3" tabindex="-1"><span class="pstep__num" data-ordinal>3</span> The letter, for a person to approve</h3>
        ${state.confirmed ? letter(email) : '<p class="hint">The acknowledgement appears here once a complaint is logged.</p>'}
      </li>
    </ol>`;
}

function detail(e) {
  const s = e.suggestion;
  const type = state.type || s.type;
  const outcome = {
    formal_complaint: '',
    aftercare_item: 'Not logged as a complaint. A reply pointing the customer to the online customer portal goes to a person for approval, and customer care is copied in.',
    general_enquiry: 'Not logged as a complaint. It is passed to the right person to answer.',
  }[type];
  return `
    <div class="mail" role="group" aria-label="Email from ${esc(e.from)}"><p class="mail__meta">From ${esc(e.from)} · received ${fmt(e.received)} · ${esc(e.subject)}</p>${esc(e.body)}</div>
    <div class="reading">
      <p class="label">The first read (Copilot's step in the pilot), for a person to check</p>
      <p><strong>${esc(TYPES[s.type])}</strong>, ${esc(s.confidence)} confidence. ${esc(s.reason)}</p>
      ${s.possible_emergency ? '<p><strong>Possible emergency flagged:</strong> a person calls the customer now.</p>' : ''}
      <div class="fields">
        <div class="field"><label for="f-type">Type</label>
          <select id="f-type" data-field="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="f-res">Reservation date</label><input id="f-res" type="date" data-field="reservation" value="${esc(state.reservation)}" aria-describedby="f-dates-hint"></div>
        <div class="field"><label for="f-comp">Completion date</label><input id="f-comp" type="date" data-field="completion" value="${esc(state.completion)}" aria-describedby="f-dates-hint"></div>
        <div class="field"><label for="f-plot">Plot</label><input id="f-plot" type="text" data-field="plot" value="${esc(state.plot)}"></div>
      </div>
      <p class="hint" id="f-dates-hint">Copilot only fills a date the email states in full. In the pilot, the coordinator checks dates against the sales records.</p>
      ${dateIssue(e) ? `<p class="callout callout--caution" role="note"><strong>Check the dates.</strong> ${esc(dateIssue(e))}</p>` : ''}
      ${type === 'formal_complaint'
        ? `<p><button type="button" class="btn" data-confirm ${dateIssue(e) ? 'disabled' : ''}>${state.confirmed ? 'Update the register' : 'Confirm and log'}</button></p>`
        : `<p class="callout" role="note">${esc(outcome)}</p>`}
      <p class="hint">Anything that might be a complaint is logged; only a person can decide it is not.</p>
    </div>`;
}

function register(e) {
  const a = assessNow(e);
  const next = a.next;
  const win = a.window.ok === null ? 'To confirm: dates needed' : a.window.ok ? `Inside the window, until ${fmt(a.window.end)}` : `Outside the window (ended ${fmt(a.window.end)}): a person decides`;
  const missed = a.rows.filter((r) => r.key.startsWith('update') && r.status === 'overdue');
  const hidden = missed.length > 3 ? missed.slice(0, missed.length - 3) : [];
  const shown = a.rows.filter((r) => !hidden.includes(r));
  const rows = shown.map((r) => `<tr>
      <th scope="row">${esc(r.label)}${r.key.startsWith('update') ? '' : ` <span class="muted">(day ${r.days})</span>`}</th>
      <td data-label="Due">${fmt(r.due)}</td><td data-label="Suggested send-by">${r.sendBy === r.due ? 'Same day' : fmt(r.sendBy)}</td>
      <td data-label="Status"><span class="status status--${r.status}">${STATUS[r.status]}</span>${r.sent ? ` <span class="muted">${fmt(r.sent)}</span>` : ''}</td></tr>`).join('');
  const remind = !state.concludedOn && next && (next.status === 'due-soon' || next.status === 'overdue');
  const day56 = a.rows.find((r) => r.key === 'nextSteps');
  const ombudsman = !state.concludedOn && state.today > day56.due && !day56.sent;
  return `
    <dl class="row-facts">
      <div><dt>Reference</dt><dd>${esc(refFor(e))}</dd></div>
      <div><dt>Customer</dt><dd>${esc(e.from)}, ${esc(state.plot || 'plot to confirm')}, ${esc(e.development)}</dd></div>
      <div><dt>Clock starts</dt><dd>${fmt(a.initiation)}</dd></div>
      <div><dt>Code</dt><dd>${esc(a.code.label)}</dd></div>
      <div><dt>Two-year window</dt><dd>${esc(win)}</dd></div>
      <div><dt>Next</dt><dd>${state.concludedOn ? `Concluded ${fmt(state.concludedOn)}; no further dates` : !next ? 'Nothing outstanding' : next.status === 'overdue' ? `${esc(next.label)}: overdue since ${fmt(clock.addDays(next.due, 1))}` : `${esc(next.label)} by ${fmt(next.sendBy)}`}</dd></div>
    </dl>
    <p class="why-date hint">${esc(startReason(e.received, a.initiation))}</p>
    <div class="table-wrap" role="region" aria-label="Commitments for ${esc(refFor(e))}" tabindex="0">
      <table class="table table--stack">
        <caption>Commitments and dates (illustrative)</caption>
        <thead><tr><th scope="col">Commitment</th><th scope="col">Due</th><th scope="col">Suggested send-by</th><th scope="col">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${hidden.length ? `<p class="hint">${hidden.length} earlier 28-day updates were also missed; the full list is in the register.</p>` : ''}
    <p class="hint">Suggested send-by is my addition: when a date falls on a weekend or bank holiday, the reminder aims for the working day before.</p>
    <div class="today" role="group" aria-label="Move the date in the mock-up">
      <span>Today in the mock-up:</span> <output aria-live="off">${fmt(state.today)}</output>
      <button type="button" class="btn btn--ghost" data-day="-1" ${state.today <= e.received ? 'disabled' : ''}>Previous day</button>
      <button type="button" class="btn btn--ghost" data-day="1">Next day</button>
      <button type="button" class="btn btn--ghost" data-jump>Jump to the first reminder</button>
      <label class="visually-hidden" for="f-today">Choose a date</label><input id="f-today" type="date" data-today min="${e.received}" value="${state.today}">
    </div>
    <p>${state.concludedOn ? `<span class="status status--met">Concluded</span> Closure letter recorded on ${fmt(state.concludedOn)}.` : '<button type="button" class="btn btn--ghost" data-conclude>Record the closure letter (concludes the complaint)</button>'}</p>
    ${ombudsman ? `<p class="callout callout--note" role="note">Day 56 (${fmt(day56.due)}) has passed with the complaint still open. From this point the customer may refer it to the New Homes Ombudsman Service, so the register flags it to the team lead.</p>` : ''}
    ${remind ? `<div class="card-preview" role="group" aria-label="Teams reminder preview">
      <p class="label">Teams reminder (preview)</p>
      <p><strong>${esc(refFor(e))}: ${esc(next.label.toLowerCase())}</strong></p>
      <p>${next.status === 'overdue' ? `Due ${fmt(next.due)} and not yet sent. The team lead has been copied in.` : `Due ${fmt(next.due)}. Suggested send-by ${fmt(next.sendBy)}.`}</p>
      <p class="hint">Sent by the daily clock flow to the complaint's owner.</p></div>` : ''}`;
}

function letter(e) {
  if (state.letterText === null) state.letterText = draftFor(e, assessNow(e));
  const ls = letterState(e);
  if (state.approvedOn) {
    const paras = state.letterText.split(/\n\s*\n|\n/).filter((p) => p.trim()).map((p) => `<p>${esc(p)}</p>`).join('');
    return `<div class="letter" role="group" aria-label="Approved acknowledgement">${paras}</div>
      <p class="approved"><span class="status status--met">Approved and sent</span> by you as the coordinator on ${fmt(state.approvedOn)}. The register records the date and who approved it.</p>`;
  }
  const source = e.suggestion.type === 'formal_complaint' ? 'Drafted from the prompt' : 'A standard acknowledgement, because the first read did not treat this as a complaint';
  return `
    <p class="hint">${source}. The date in it comes from the register, never from the AI. You can edit the letter before approving it.</p>
    <label class="visually-hidden" for="f-letter">Draft acknowledgement</label>
    <textarea id="f-letter" class="letter letter--edit" data-letter rows="14">${esc(state.letterText)}</textarea>
    <div data-warn>${warnHtml(ls)}</div>
    <label class="check"><input type="checkbox" data-check ${state.checked ? 'checked' : ''}> I have read and checked this letter</label>
    <p><button type="button" class="btn" data-approve ${ls.canApprove ? '' : 'disabled'}>Approve and send</button></p>`;
}

function pick(id) {
  const e = EMAILS.find((x) => x.id === id);
  state = fresh();
  state.id = id;
  state.type = e.suggestion.type;
  state.reservation = e.suggestion.reservation_date || '';
  state.completion = e.suggestion.completion_date || '';
  state.plot = e.suggestion.plot || '';
  render();
  document.querySelector(`[data-pick="${id}"]`)?.focus();
  say(`Opened the email from ${e.from}. Copilot reads it as: ${TYPES[e.suggestion.type]}.`);
}

app?.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.pick) return pick(t.dataset.pick);
  const e = EMAILS.find((x) => x.id === state.id);
  if ('confirm' in t.dataset) {
    const first = !state.confirmed;
    state.confirmed = true;
    if (first) state.today = e.received;
    render();
    document.getElementById('ps2')?.focus();
    const a = clock.assess({ received: e.received, reservation: state.reservation, completion: state.completion, sent: state.sent, today: state.today }, H);
    say(`Logged as ${refFor(e)}. The clock starts ${fmt(a.initiation)}. Acknowledgement due ${fmt(a.rows[0].due)}.`);
  } else if (t.dataset.day) {
    const moved = clock.addDays(state.today, Number(t.dataset.day));
    state.today = moved < e.received ? e.received : moved;
    render();
    document.querySelector(`[data-day="${t.dataset.day}"]`)?.focus();
    announceToday(e);
  } else if ('jump' in t.dataset) {
    let d = state.today;
    for (let i = 0; i < 400; i++) {
      const a = clock.assess({ received: e.received, reservation: state.reservation, completion: state.completion, sent: state.sent, today: d }, H);
      if (!a.next || a.next.status === 'due-soon' || a.next.status === 'overdue') break;
      d = clock.addDays(d, 1);
    }
    state.today = d;
    render();
    document.querySelector('[data-jump]')?.focus();
    announceToday(e);
  } else if ('conclude' in t.dataset) {
    state.concludedOn = state.today;
    render();
    say(`Concluded on ${fmt(state.today)}. The clock stops and no further reminders go out.`);
  } else if ('approve' in t.dataset && state.checked && !t.disabled) {
    state.sent = { ...state.sent, ack: state.today };
    state.approvedOn = state.today;
    render();
    document.getElementById('ps3')?.focus();
    say(`Approved and sent on ${fmt(state.today)}. The register now shows the acknowledgement as sent.`);
  }
});

app?.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.field) {
    state[t.dataset.field] = t.value;
    if (t.dataset.field === 'reservation' || t.dataset.field === 'completion') {
      const id = t.id;
      render();
      document.getElementById(id)?.focus();
      if (dateIssue(EMAILS.find((x) => x.id === state.id))) say('Check the dates before logging.');
    }
    if (t.dataset.field === 'type') {
      if (t.value !== 'formal_complaint') { state.confirmed = false; state.today = null; state.sent = {}; state.approvedOn = null; state.checked = false; }
      render();
      document.getElementById('f-type')?.focus();
    }
  } else if ('today' in t.dataset && t.value) {
    const e = EMAILS.find((x) => x.id === state.id);
    state.today = t.value < e.received ? e.received : t.value;
    render();
    document.getElementById('f-today')?.focus();
    announceToday(EMAILS.find((x) => x.id === state.id));
  } else if ('check' in t.dataset) {
    state.checked = t.checked;
    refreshApproval();
  }
});

function refreshApproval() {
  const e = EMAILS.find((x) => x.id === state.id);
  const ls = letterState(e);
  const btn = app.querySelector('[data-approve]');
  if (btn) btn.disabled = !ls.canApprove;
  const w = app.querySelector('[data-warn]');
  if (w) w.innerHTML = warnHtml(ls);
}

app?.addEventListener('input', (ev) => {
  if ('letter' in ev.target.dataset) {
    state.letterText = ev.target.value;
    if (state.checked) { state.checked = false; const cb = app.querySelector('[data-check]'); if (cb) cb.checked = false; }
    refreshApproval();
  }
});

function announceToday(e) {
  const a = assessNow(e);
  const n = a.next;
  say(`Today is ${fmt(state.today)}. ${n ? `${n.label}: ${STATUS[n.status]}, due ${fmt(n.due)}.` : 'Nothing outstanding.'}`);
}

resetBtn?.addEventListener('click', () => { pick(EMAILS[0].id); say('Started again with the first email.'); });

async function start() {
  try {
    const res = await fetch(new URL('../pack/engine/bank-holidays-england-wales.json', import.meta.url));
    const data = await res.json();
    H = clock.holidaySet(data.dates);
    TITLES = data.titles || {};
  } catch (err) {
    document.documentElement.classList.remove('js');
    return;
  }
  state = fresh();
  const first = EMAILS[0];
  state.id = first.id;
  state.type = first.suggestion.type;
  state.reservation = first.suggestion.reservation_date || '';
  state.completion = first.suggestion.completion_date || '';
  state.plot = first.suggestion.plot || '';
  render();
}
if (app) start();
