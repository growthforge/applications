// The live walkthrough. It loads the same core modules and the same data files as the MCP
// server, then answers each question by calling the tools in the browser. Without JavaScript
// the page shows the same results, prerendered at build time from the same code.
import { createToolkit } from '../pack/mcp-server/core/toolkit.js';
import { num, round } from '../pack/mcp-server/core/util.js';
import { jsonHtml, renderPanel, renderReview, marksHtml, echoHtml } from './render.js';
import { PLAN_ID, HERO_CALL, heroExcerpt, heroLine, applyEdits, questions } from './scenario.js';

const $ = (s) => document.querySelector(s);

async function getJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function main() {
  const manifest = await getJson('assets/data-manifest.json');
  const [seriesCollections, benchmarks, plans] = await Promise.all([
    Promise.all(manifest.series.map(getJson)),
    getJson(manifest.benchmarks),
    Promise.all(manifest.plans.map(getJson)),
  ]);
  const tk = createToolkit({ seriesCollections, benchmarks, plans });
  const stored = tk.plans[PLAN_ID];
  /** @type {Record<string, string>} */
  const edits = {};
  /** @type {Record<string, string>} */
  const reviews = {};
  let flags = [];
  let firstRun = true;

  // The first-viewport call, re-run live.
  const hero = tk.call(HERO_CALL.name, HERO_CALL.args);
  $('#hero-line').textContent = heroLine(hero.structured);
  $('#hero-result').innerHTML = jsonHtml(heroExcerpt(hero.structured), true);
  $('#hero-full').innerHTML = jsonHtml(hero.structured);

  /**
   * Totals as a spreadsheet would show them, except when a rate is invalid: then no total is
   * computed (the invalid line, every percentage line and the plan total read "not computed")
   * and the tool's own refusal is shown under the table.
   */
  function updateTable(plan, invalid, check) {
    const blocked = invalid.length > 0;
    for (const l of plan.lines) {
      const cell = document.querySelector(`[data-total="${l.ref}"]`);
      if (cell) cell.textContent = blocked && (invalid.includes(l.ref) || l.unit === 'percent') ? 'not computed' : (typeof l.total === 'number' ? num(l.total) : '');
      const marks = document.querySelector(`[data-marks="${l.ref}"]`);
      if (marks) marks.innerHTML = marksHtml(flags.filter((f) => f.line_ref === l.ref));
    }
    const total = document.querySelector('[data-total="PLAN"]');
    if (total) total.textContent = blocked ? 'not computed' : num(plan.stated_total);
    for (const input of document.querySelectorAll('[data-rate]')) {
      input.setAttribute('aria-invalid', invalid.includes(input.dataset.rate) ? 'true' : 'false');
    }
    $('#plan-error').textContent = check.isError ? check.text : '';
  }

  function render() {
    const { plan, edited, invalid } = applyEdits(stored, edits);
    const qs = questions(plan, edited);
    const outs = qs.map((q) => tk.call(q.call.name, q.call.args));
    qs.forEach((q, i) => { document.getElementById(`${q.id}-body`).innerHTML = renderPanel(q, outs[i]); });
    flags = outs[0].isError ? [] : outs[0].structured.flags;
    updateTable(plan, invalid, outs[0]);
    $('#plan-echo').innerHTML = echoHtml(outs[0]);
    $('#q-review-body').innerHTML = renderReview(flags, reviews);
    $('#plan-reset').hidden = !edited;
    if (!firstRun) {
      $('#wt-status').textContent = outs[0].isError
        ? 'The check refused the edited plan; the reason is shown under Check the plan.'
        : `Results updated: ${outs[0].structured.summary.items_for_review} items for review.`;
    }
    firstRun = false;
  }

  let timer = 0;
  document.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (!t.matches || !t.matches('[data-rate]')) return;
    edits[t.dataset.rate] = t.value;
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
  document.addEventListener('change', (e) => {
    const t = /** @type {HTMLSelectElement} */ (e.target);
    if (!t.matches || !t.matches('[data-review]')) return;
    reviews[t.dataset.review] = t.value;
    const done = flags.filter((f) => reviews[`${f.line_ref}:${f.check}`]).length;
    const summary = document.querySelector('[data-review-summary]');
    if (summary) summary.textContent = `${done} of ${flags.length} items reviewed by the cost manager on this page. The plan is approved in the cost system by a named person, not by the agent: the server has no approve, edit or send tool.`;
  });
  $('#plan-reset').addEventListener('click', () => {
    for (const k of Object.keys(edits)) delete edits[k];
    for (const input of document.querySelectorAll('[data-rate]')) {
      const l = stored.lines.find((x) => x.ref === input.dataset.rate);
      input.value = String(l.rate_per_m2);
    }
    render();
    $('#wt-status').textContent = 'Plan reset to the stored version.';
    document.querySelector('[data-rate]').focus();
  });

  for (const input of document.querySelectorAll('[data-rate]')) input.disabled = false;
  render();
  document.documentElement.classList.add('wt-ready');
  // Exposed for the end-to-end test, which compares page results with the server's core.
  window.__costPlanCheck = { version: tk.version, round };
}

main().catch((e) => {
  const s = document.getElementById('wt-status');
  if (s) { s.textContent = `The live walkthrough could not start (${e.message}); the results shown were produced by the same code at build time.`; s.classList.remove('visually-hidden'); }
  document.documentElement.classList.add('wt-failed');
});
