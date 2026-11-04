// Runs the agent's own code (core.mjs, the same file inlined into the n8n Code nodes) on the synthetic data,
// and lets the reader resolve the items that wait for a person. Nothing leaves the browser.
import { DEFAULT_CONFIG, runAgent } from './core.mjs';
import { ERP, INBOX } from './data.mjs';
import { itemButton, detail } from './view.mjs';

document.documentElement.classList.replace('no-js', 'js');

const FEATURED = ['E21', 'E07', 'E03', 'E10', 'CHASE-PO-24009', 'E19'];
const run = runAgent(structuredClone(ERP), INBOX, DEFAULT_CONFIG);
const items = run.results.map((r) => ({ ...r, audit: run.audit.filter((a) => a.itemId === r.id) }));
const byId = Object.fromEntries(items.map((r) => [r.id, r]));
const emails = Object.fromEntries(INBOX.emails.map((e) => [e.id, e]));
const resolved = {};

const list = document.getElementById('replay-list');
const panel = document.getElementById('replay-detail');
const status = document.getElementById('replay-status');
let view = 'featured';
let current = FEATURED[0];

function renderList() {
  const ids = view === 'featured' ? FEATURED : items.map((r) => r.id);
  list.innerHTML = ids.map((id) => itemButton(byId[id], id === current, resolved[id])).join('');
}

function show(id, { focus = false } = {}) {
  current = id;
  const r = byId[id];
  panel.innerHTML = detail(r, emails[id], resolved[id]);
  for (const b of list.querySelectorAll('[data-id]')) {
    if (b.dataset.id === id) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  }
  if (focus) panel.focus({ preventScroll: false });
}

list.addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) show(b.dataset.id, { focus: matchMedia('(max-width: 760px)').matches });
});

panel.addEventListener('click', (e) => {
  const link = e.target.closest('[data-id]');
  if (link) {
    if (view === 'featured' && !FEATURED.includes(link.dataset.id)) {
      view = 'all';
      syncTabs();
    }
    renderList();
    show(link.dataset.id, { focus: true });
    return;
  }
  const b = e.target.closest('[data-resolve]');
  if (!b) return;
  const r = byId[current];
  const option = r.options.find((o) => o.id === b.dataset.resolve);
  resolved[current] = option;
  r.audit = [...r.audit, { at: new Date().toISOString(), itemId: r.id, actor: 'you', step: 'human decision', detail: option.label }];
  renderList();
  show(current);
  panel.querySelector('.resolved').focus();
  status.textContent = `${r.id}: ${option.label}. ${Object.keys(resolved).length} of ${items.filter((x) => x.needsHuman).length} items for a person resolved.`;
});

const tabs = [...document.querySelectorAll('.case-tab')];
function syncTabs() {
  for (const t of tabs) t.setAttribute('aria-pressed', String(t.dataset.view === view));
}
for (const t of tabs) {
  t.addEventListener('click', () => {
    view = t.dataset.view;
    syncTabs();
    renderList();
    show(current);
  });
}

renderList();
show(current);
