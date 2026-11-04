// app.js: at load, run the ledger on the committed data (in a worker), redraw every computed region
// from the result, and wire the controls. Without JavaScript the prerendered October view stays.
import * as R from './render.js';
import { whatIf, WHATIF_SPEC } from '../pack/ledger/whatif.js';

const page = document.body.dataset.page;
const base = new URL('../pack/data/', import.meta.url).href;

function region(name) { return document.querySelector(`[data-region="${name}"]`); }
function setRegion(name, html) { const el = region(name); if (el) el.innerHTML = R.finish(html); }

function inWorker() {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL('./ledger-worker.js', import.meta.url), { type: 'module' }); } catch (e) { reject(e); return; }
    const timer = setTimeout(() => { w.terminate(); reject(new Error('worker timeout')); }, 20000);
    w.onmessage = (e) => { clearTimeout(timer); w.terminate(); if (e.data.ok) resolve(e.data); else reject(new Error(e.data.error)); };
    w.onerror = (e) => { clearTimeout(timer); w.terminate(); e.preventDefault(); reject(new Error(e.message || 'worker error')); };
    w.postMessage({ base });
  });
}

async function compute() {
  try { return await inWorker(); } catch (err) {
    const { computeFromUrls } = await import('./compute.js');
    const t0 = performance.now();
    return { vm: await computeFromUrls(base), ms: Math.round(performance.now() - t0), mainThread: true };
  }
}

// ---- index ----------------------------------------------------------------------------------
function wireIndex(vm) {
  const month = document.getElementById('ue-month');
  const focus = document.getElementById('ue-focus');
  const valid = (sel, list, fallback) => (list.includes(sel.value) ? sel.value : (sel.value = fallback));
  function drawUnit() {
    const m = valid(month, vm.months, vm.month);
    const f = valid(focus, Object.keys(vm.useCases), 'kyc-review');
    setRegion('unit-cap', R.renderUnitCaption(vm, m));
    setRegion('unit-chart', R.renderUnitChart(vm, m, f));
    setRegion('unit-detail', R.renderUnitDetail(vm, m, f));
    setRegion('unit-table', R.renderUnitTable(vm, m, f));
  }
  setRegion('memo', R.renderMemo(vm));
  drawUnit();
  month.addEventListener('change', drawUnit);
  focus.addEventListener('change', drawUnit);

  const wasOpen = document.getElementById('whatif') && document.getElementById('whatif').open;
  setRegion('pipe-totals', R.renderPipelineTotals(vm));
  setRegion('pipe-body', R.renderPipelineBody(vm, R.renderWhatifRow(vm)));
  const details = document.getElementById('whatif');
  if (details && wasOpen) details.open = true;
  wireWhatif(vm);
}

function readForm(form) {
  const raw = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.tagName === 'SELECT') raw[el.name] = el.value;
    else if (el.type === 'range') raw[el.name] = Number(el.value) / Number(el.dataset.scale || 1);
    else raw[el.name] = el.value === '' ? '' : Number(el.value);
  }
  return raw;
}

function wireWhatif(vm) {
  const form = document.getElementById('wi-form');
  if (!form) return;
  const date = vm.month + '-' + String(vm.daysInMonth).padStart(2, '0');
  const defaults = vm.whatif.defaults;
  function update(normalise) {
    const r = whatIf(readForm(form), vm.prices, date, defaults);
    for (const el of form.elements) {
      if (!el.name || !(el.name in WHATIF_SPEC)) continue;
      const v = r.inputs[el.name];
      if (el.type === 'range') {
        const out = document.getElementById(el.id + '-out');
        if (out) out.textContent = Math.round(v * 100) + '%';
      } else if (normalise && el.type === 'number' && Number(el.value) !== v) {
        el.value = String(v);                // show the clamped value once the reader leaves the field
      } else if (normalise && el.tagName === 'SELECT' && el.value !== v) {
        el.value = v;
      }
    }
    setRegion('wi-out', R.renderWhatifOut(vm, r));
    form.dataset.state = JSON.stringify(r.inputs);
  }
  form.addEventListener('input', () => update(false));
  form.addEventListener('change', () => update(true));
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('reset', () => setTimeout(() => update(true), 0));
  update(true);
}

// ---- build page -----------------------------------------------------------------------------
function wireBuild(vm) {
  setRegion('summary60', R.renderSummary60(vm));
  const rec = R.renderRecon(vm);
  setRegion('recon-waterfall', rec.waterfall);
  setRegion('recon-table', rec.table);
  const al = R.renderAllocation(vm);
  setRegion('alloc-methods', al.methods);
  setRegion('alloc-trend', al.trend);
  const ob = R.renderOwnerBudgets(vm);
  setRegion('owners-bars', ob.bars);
  setRegion('owners-table', ob.table);
  const burn = R.renderBurn(vm);
  setRegion('burn-svg', burn.svg);
  setRegion('burn-table', burn.table);
  setRegion('variance-table', R.renderVarianceTable(vm));
  const cmp = R.renderCompare(vm);
  setRegion('compare-bars', cmp.bars);
  setRegion('compare-table', cmp.table);
  setRegion('commitment', R.renderCommitment(vm));
}

compute().then(({ vm, ms, mainThread }) => {
  if (page === 'index') wireIndex(vm);
  if (page === 'build') wireBuild(vm);
  document.documentElement.dataset.ledger = 'live';
  document.documentElement.dataset.ledgerMs = String(ms);
  if (mainThread) document.documentElement.dataset.ledgerThread = 'main';
}).catch((err) => {
  document.documentElement.dataset.ledger = 'failed';
  const note = document.createElement('p');
  note.className = 'ledger-error';
  note.setAttribute('role', 'status');
  note.textContent = 'The live ledger could not run in this browser, so the figures shown are the prerendered October view.';
  const main = document.getElementById('main');
  if (main) main.prepend(note);
  console.warn('ledger:', err && err.message);
});
