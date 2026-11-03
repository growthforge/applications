// Route Desk: browser glue. The page is fully pre-rendered; this file makes it interactive.
import rules from './rules.mjs';
import { IDEAS } from './ideas.mjs';
import { evaluate, record, slug } from './engine.mjs';
import { renderVerdict, renderForm } from './render.mjs';

document.documentElement.classList.replace('no-js', 'js');

const form = document.getElementById('desk-form');
const verdict = document.getElementById('verdict');
const list = document.getElementById('idea-list');
const own = document.getElementById('own-idea');
const ownTitle = document.getElementById('own-title');
const ownDesc = document.getElementById('own-desc');
const status = document.getElementById('desk-status');
const today = new Date().toISOString().slice(0, 10);

const CUSTOM = {
  id: 'custom',
  title: '',
  unit: 'Your team',
  description: '',
  answers: { ...rules.defaults },
};

let current = IDEAS[0];
let answers = { ...current.answers };

function readForm() {
  const out = {};
  for (const q of rules.questions) {
    const el = form.elements[q.id];
    out[q.id] = q.type === 'number' ? Number(el.value) : el.value;
  }
  return out;
}

function activeIdea() {
  if (current.id !== 'custom') return current;
  const title = ownTitle.value.trim() || 'Your idea';
  const description = ownDesc.value.trim();
  return { ...CUSTOM, title, shapeTitle: title, shape: description, description };
}

function update(announce) {
  const idea = activeIdea();
  const r = evaluate(rules, answers);
  verdict.innerHTML = renderVerdict(rules, idea, r);
  if (announce) status.textContent = `${idea.title}: ${r.verdict}. Route: ${r.laneName}, tier ${r.tier}.`;
  return { idea, r };
}

function select(id, { focusDesk = false } = {}) {
  current = id === 'custom' ? CUSTOM : IDEAS.find((i) => i.id === id);
  answers = { ...current.answers };
  form.querySelector('.desk__fields').innerHTML = renderForm(rules, answers);
  for (const b of list.querySelectorAll('[data-idea]')) b.setAttribute('aria-pressed', String(b.dataset.idea === id));
  own.hidden = id !== 'custom';
  const note = document.getElementById('idea-note');
  const idea = activeIdea();
  note.textContent = idea.id === 'custom' ? 'Describe the idea, then answer the questions. Data starts at "Not sure", which is treated as tier 3.' : `${idea.description}${idea.note ? ' ' + idea.note : ''}`;
  update(true);
  if (focusDesk) document.getElementById('desk').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

list.addEventListener('click', (e) => {
  const b = e.target.closest('[data-idea]');
  if (b) select(b.dataset.idea);
});

document.getElementById('board').addEventListener('click', (e) => {
  const b = e.target.closest('[data-idea]');
  if (b) {
    select(b.dataset.idea, { focusDesk: true });
    list.querySelector(`[data-idea="${b.dataset.idea}"]`).focus({ preventScroll: true });
  }
});

form.addEventListener('input', (e) => {
  if (e.target === ownTitle || e.target === ownDesc) {
    update(false);
    return;
  }
  answers = readForm();
  update(true);
});
form.addEventListener('submit', (e) => e.preventDefault());

function currentRecord() {
  const { idea, r } = update(false);
  return { idea, md: record(rules, idea, r, today) };
}

document.getElementById('copy-record').addEventListener('click', async () => {
  const { md } = currentRecord();
  try {
    await navigator.clipboard.writeText(md);
    status.textContent = 'Record copied as Markdown.';
  } catch {
    status.textContent = 'Copying is blocked in this browser. Use Download record instead.';
  }
});

document.getElementById('download-record').addEventListener('click', () => {
  const { idea, md } = currentRecord();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
  a.download = `pattern-record-${slug(idea.title) || 'idea'}.md`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  status.textContent = 'Record downloaded.';
});

select(current.id);
status.textContent = '';
