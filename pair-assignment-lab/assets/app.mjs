// The page's interactive parts. All data is local (data.mjs is generated from the files in data/ and runs/);
// nothing is sent anywhere.
import { DATA } from './data.mjs';
import { sampleButton, sampleDetail, briefCard, roleButtons, auditList, auditOut } from './render.mjs';

document.documentElement.classList.replace('no-js', 'js');

// ---- Marking lab ----
const RUNS = ['v2.4-sonnet-run1', 'v2.4-haiku-run1', 'v2.3-sonnet-run1', 'v2.3-haiku-run1', 'v2.2-sonnet-run1', 'v2.2-haiku-run1', 'v2.1-sonnet-run1', 'v2-sonnet-run1', 'v1-sonnet-run1'];
const list = document.getElementById('lab-list');
const detail = document.getElementById('lab-detail');
let run = RUNS[0];
let current = 'S13';
const labStatus = document.getElementById('lab-status');

function mark(id) { return DATA.runs[run].results[id]; }
function prompt() { return DATA.runs[run].prompt; }
function renderList() {
  list.innerHTML = DATA.samples.map((s) => sampleButton(s, mark(s.id), prompt(), s.id === current)).join('');
}
let wanted = current; // the sample the reader chose; kept when a run that lacks it is picked
function show(id, focus, chosen = true) {
  if (chosen) wanted = id;
  let note = '';
  if (!mark(id)) {
    const fallback = DATA.samples.find((x) => mark(x.id)).id;
    note = ` ${id} was written after this prompt version was tested, so this run has no mark for it; showing ${fallback}.`;
    id = fallback;
  }
  current = id;
  const s = DATA.samples.find((x) => x.id === id);
  detail.innerHTML = sampleDetail(s, DATA.rubrics[prompt()], mark(id), run, prompt(), RUNS);
  if (labStatus) labStatus.textContent = `Showing ${id}, marked with ${run.replace(/-run\d/, '').replace('-', ' on ')}.${note}`;
  for (const b of list.querySelectorAll('[data-id]')) {
    if (b.dataset.id === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  }
  if (focus) detail.focus();
}
if (list && detail) {
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) show(b.dataset.id, matchMedia('(max-width: 1000px)').matches);
  });
  detail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-run]');
    if (!b) return;
    run = b.dataset.run;
    renderList();
    show(wanted, false, false);
    detail.querySelector(`[data-run="${run}"]`).focus();
  });
  renderList();
  show(current);
}

// ---- Role versions of the brief ----
const roles = document.getElementById('roles');
const brief = document.getElementById('brief');
if (roles && brief) {
  roles.addEventListener('click', (e) => {
    const b = e.target.closest('[data-role]');
    if (!b) return;
    brief.innerHTML = briefCard(DATA.assignment, b.dataset.role);
    roles.innerHTML = roleButtons(DATA.assignment, b.dataset.role);
    roles.querySelector(`[data-role="${b.dataset.role}"]`).focus();
  });
}

// ---- Audit checklist ----
const auditForm = document.getElementById('audit-form');
const auditResult = document.getElementById('audit-out');
const presets = document.getElementById('audit-presets');
let auditState = Object.fromEntries(DATA.audit.standards.map((s) => [s.id, s.redesign]));
let auditLabel = 'This redesign';
function renderAudit() {
  auditForm.innerHTML = auditList(DATA.audit, auditState);
  auditResult.innerHTML = auditOut(DATA.audit, auditState, auditLabel);
}
if (auditForm && auditResult) {
  auditForm.addEventListener('change', (e) => {
    if (e.target.name) {
      auditState[e.target.name] = Number(e.target.value);
      auditLabel = 'Your assessment';
      auditResult.innerHTML = auditOut(DATA.audit, auditState, auditLabel);
    }
  });
  presets.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const key = b.dataset.preset;
    auditState = Object.fromEntries(DATA.audit.standards.map((s) => [s.id, key === 'clear' ? undefined : s[key]]));
    auditLabel = key === 'artefact' ? 'A typical artefact-based assignment' : key === 'redesign' ? 'This redesign' : 'Your assessment';
    renderAudit();
  });
  renderAudit();
}

// ---- Copy the marking prompt ----
const copyBtn = document.getElementById('copy-prompt');
const copyStatus = document.getElementById('copy-status');
if (copyBtn) {
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById('prompt-text').textContent);
      copyStatus.textContent = 'Copied. Paste it into Claude with a submission in place of the placeholder.';
    } catch {
      copyStatus.textContent = 'Copy failed: select the text in the box and copy it.';
    }
  });
}
