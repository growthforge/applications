// The desk, live: the same core the tests and n8n run, over recorded Claude drafts. Without this script the
// page shows the prerendered default (Sonnet run 1, question Q03).
import * as core from './core.mjs';
import * as R from './render.mjs';
import DATA from './desk-data.mjs';

const $ = (id) => document.getElementById(id);
const { library } = DATA;
const ctx = { library, index: core.buildIndex(library), today: library.today };
const libById = Object.fromEntries(library.entries.map((e) => [e.id, e]));
const state = { run: DATA.defaultRun, filter: 'all', id: DATA.defaultId, results: [], summary: null, working: null };

function compute() {
  const run = DATA.runs.find((r) => r.id === state.run);
  const out = core.answerAll(DATA.rows, ctx, (row) => run.drafts[row.id] || { error: 'not in this run' });
  state.results = out.results;
  state.summary = out.summary;
}
const current = () => state.results.find((r) => r.id === state.id);

function renderList() {
  $('qlist').innerHTML = R.questionList(state.results, state.id, state.filter);
  // Unsafe: marked ready where the hand-written expectation says a person must decide.
  const unsafe = state.results.filter((r) => r.route === 'ready' && DATA.expectedRoute[r.id] !== 'ready').length;
  $('counts').innerHTML = R.counts(state.summary, unsafe);
}

function renderDetail() {
  const r = current();
  const decision = state.run === 'sonnet-run1' ? DATA.decisions[r.id] : null;
  $('detail').innerHTML = R.detail(r, libById, decision);
  const t = $('tamper');
  t.hidden = r.route !== 'ready';
  if (r.route === 'ready') {
    state.working = JSON.parse(JSON.stringify(r.draft));
    $('t-answer').value = state.working.answer;
    $('t-out').innerHTML = '';
    const primary = libById[r.draft.citations[0].entry_id];
    const want = core.expectedStance(primary, r.question);
    for (const b of t.querySelectorAll('[data-tamper]')) {
      const ok = R.canTamper(r.draft, b.dataset.tamper, want);
      b.disabled = !ok;
      b.title = ok ? '' : b.dataset.tamper === 'stance' ? 'This question is not a yes or no question.' : 'This answer has no number with a unit.';
    }
  }
}

function check() {
  const r = current();
  const hits = core.retrieve(ctx.index, library, r.question);
  state.working.answer = $('t-answer').value;
  $('t-out').innerHTML = R.tamperResult(state.working, hits, r.question, ctx.today, hits[0].entry.owner, r.draft);
}

function select(id, focus) {
  state.id = id;
  for (const b of $('qlist').querySelectorAll('.q')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  renderDetail();
  if (focus && window.matchMedia('(max-width: 899px)').matches) $('detail').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function csv() {
  const head = ['id', 'section', 'question', 'response', 'answer', 'status', 'sources', 'owner'];
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [head.join(',')].concat(state.results.map(core.finalRow).map((f) => [f.id, f.section, f.question, f.response, f.answer, f.status, f.sources.join(' '), f.owner || ''].map(q).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' }));
  a.download = 'harwick-questionnaire-' + state.run + '.csv';
  document.body.append(a);
  a.click();
  a.remove();
}

function own() {
  const q = $('own-q').value.trim().slice(0, 2000);
  if (!q) { $('own-out').innerHTML = '<p>Type a question first.</p>'; return; }
  const hits = core.retrieve(ctx.index, library, q);
  const reasons = core.triage(q, hits, ctx.today);
  const request = core.buildDraftRequest(q, core.usableHits(hits, ctx.today), core.DEFAULT_CONFIG);
  $('own-out').innerHTML = R.ownResult(q, hits, reasons, request, ctx.today);
}

function screen() {
  const f = new FormData($('screen-form'));
  const a = Object.fromEntries(R.SCREEN.map((s) => [s.id, f.get(s.id)]));
  $('screen-out').innerHTML = R.screenOut(a);
}

// ---- Wire up ----
const sel = $('run');
sel.innerHTML = DATA.runs.map((r) => `<option value="${r.id}">${R.esc(r.label)}</option>`).join('');
sel.value = state.run;
compute();
renderList();
renderDetail();
$('tools').hidden = false;
$('own').hidden = false;
$('csv').hidden = false;

sel.addEventListener('change', () => { state.run = sel.value; compute(); renderList(); renderDetail(); });
for (const b of document.querySelectorAll('[data-filter]')) {
  b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    for (const x of document.querySelectorAll('[data-filter]')) x.setAttribute('aria-pressed', String(x === b));
    renderList();
  });
}
$('qlist').addEventListener('click', (e) => { const b = e.target.closest('.q'); if (b) select(b.dataset.id, true); });
for (const b of document.querySelectorAll('[data-tamper]')) {
  b.addEventListener('click', () => {
    const r = current();
    state.working = R.tamper(r.draft, b.dataset.tamper, library);
    $('t-answer').value = state.working.answer;
    check();
  });
}
$('t-check').addEventListener('click', check);
$('t-reset').addEventListener('click', () => { renderDetail(); });
$('own-run').addEventListener('click', own);
$('csv').addEventListener('click', csv);
$('screen-form').addEventListener('change', screen);
own();
