// HTML string renderers for tool calls and results. Pure: used by the live page
// (walkthrough.js) and by the build-time prerender (tools/build_pages.mjs), so the
// first paint, the no-JS view, the PDF and the live page show the same markup.
import { gbp, num, monthLabel } from '../pack/mcp-server/core/util.js';

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One-line JSON with spaces after separators, for short values. */
function inlineJson(v) {
  if (Array.isArray(v)) return v.length ? `[${v.map(inlineJson).join(', ')}]` : '[]';
  if (v && typeof v === 'object') {
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inlineJson(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}

/** Compact pretty JSON: objects and arrays that fit in `width` stay on one line. Still valid JSON. */
export function prettyJson(v, width = 66, pad = '', lead = 0) {
  const one = inlineJson(v);
  if (v === null || typeof v !== 'object' || pad.length + lead + one.length <= width) return one;
  const inner = pad + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + prettyJson(x, width, inner, 0)).join(',\n')}\n${pad}]`;
  const e = Object.entries(v).filter(([, x]) => x !== undefined);
  return `{\n${e.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${prettyJson(x, width, inner, JSON.stringify(k).length + 2)}`).join(',\n')}\n${pad}}`;
}

/** JSON with light syntax colouring (keys, strings, numbers, literals). compact uses prettyJson. */
export function jsonHtml(value, compact = false) {
  const text = compact ? prettyJson(value) : JSON.stringify(value, null, 2);
  return text.replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m, str, colon, lit, n) => {
    if (str) return colon ? `<span class="j-k">${esc(str)}</span>${colon}` : `<span class="j-s">${esc(str)}</span>`;
    if (lit) return `<span class="j-l">${lit}</span>`;
    return `<span class="j-n">${n}</span>`;
  });
}

/** Compact one-line view of arguments; long arrays are summarised, the full JSON follows in a details. */
export function argsSummary(args) {
  const o = {};
  for (const [k, v] of Object.entries(args)) o[k] = Array.isArray(v) ? `[${v.length} lines]` : v;
  return o;
}

export function renderCall(call, { label = 'tools/call' } = {}) {
  const hasArray = Object.values(call.args).some(Array.isArray);
  return `<div class="call">
  <p class="call__head"><span class="call__label">${esc(label)}</span> <code class="call__tool">${esc(call.name)}</code></p>
  <pre class="code call__args" data-args="${esc(JSON.stringify(call.args))}"><code>${jsonHtml(hasArray ? argsSummary(call.args) : call.args, true)}</code></pre>${hasArray ? `
  <details class="more"><summary>All arguments as sent</summary><pre class="code"><code>${jsonHtml(call.args)}</code></pre></details>` : ''}
</div>`;
}

const SEVERITY = { check: 'To confirm', review: 'Needs a judgement', note: 'Soft note' };

function prov(r, statusLabel) {
  return `<dl class="prov">
    <div class="prov__row"><dt>Basis</dt><dd>${esc(r.basis)}</dd></div>
    <div class="prov__row"><dt>Status</dt><dd><span class="status">${esc(statusLabel)}</span> ${esc(r.status_note)}</dd></div>
    <div class="prov__row"><dt>History</dt><dd><ol class="history">${r.history.map((h) => `<li><span class="history__event">${esc(h.event)}</span> ${esc(h.detail)}</li>`).join('')}</ol></dd></div>
  </dl>`;
}

function rawResult(out) {
  return `<details class="more"><summary>Text the model reads</summary><pre class="code code--text"><code>${esc(out.text)}</code></pre></details>
  ${out.isError ? '' : `<details class="more"><summary>Full structured result (JSON)</summary><pre class="code result-json"><code>${jsonHtml(out.structured)}</code></pre></details>`}`;
}

export function renderRefusal(out) {
  return `<div class="result result--refusal" data-outcome="refusal">
  <p class="result__tag"><span class="tag tag--refusal">Refused</span> <code>${esc(out.refusal.code)}</code></p>
  <p class="result__reason">${esc(out.refusal.reason)}</p>
  <p class="result__next"><strong>Next step:</strong> ${esc(out.refusal.next_step)}</p>
  ${rawResult(out)}
</div>`;
}

export function renderRebase(out) {
  if (out.isError) return renderRefusal(out);
  const r = out.structured;
  const unit = r.figure.unit === 'lump_sum' ? '' : ' per m² GIFA';
  return `<div class="result" data-outcome="result">
  <p class="result__figure"><span class="result__value">${esc(gbp(r.figure.value, 0))}</span><span class="result__unit">${esc(unit)} at ${esc(monthLabel(r.figure.month))}</span></p>
  <p class="result__sub">${esc(gbp(r.figure.value, 2))} to the penny, from ${esc(gbp(r.input.rate, 2))} at ${esc(monthLabel(r.input.from_month))}: x ${esc(String(r.index.to_value))} / ${esc(String(r.index.from_value))} (${esc(r.index.series_name)}), location factors ${esc(r.location.from_factor.toFixed(2))} to ${esc(r.location.to_factor.toFixed(2))}${r.location.from_factor === r.location.to_factor ? ' (not adjusted)' : ''}.</p>
  ${prov(r, 'Indicative')}
  ${rawResult(out)}
</div>`;
}

export function renderBenchmark(out, compare) {
  if (out.isError) return renderRefusal(out);
  const r = out.structured;
  let cmp = '';
  if (compare && typeof compare.rate === 'number') {
    const where = compare.rate < r.range.low ? 'below the range' : compare.rate > r.range.high ? 'above the range' : 'inside the range';
    cmp = `<p class="result__compare">Compared on this page: the plan's ${esc(compare.ref)} rate, ${esc(gbp(compare.rate, Number.isInteger(compare.rate) ? 0 : 2))} per m², sits ${where}. A prompt to look at the line's basis, not a verdict.</p>`;
  }
  return `<div class="result" data-outcome="result">
  <p class="result__figure"><span class="result__value">${esc(gbp(r.range.low))} to ${esc(gbp(r.range.high))}</span><span class="result__unit"> per m² GIFA, median ${esc(gbp(r.range.median))}</span></p>
  <p class="result__sub">${esc(r.building_type_name)}, ${esc(r.group_name.toLowerCase())} (group ${esc(String(r.nrm1_group))}), ${esc(monthLabel(r.month))}; ${esc(String(r.range.project_count))} synthetic projects.</p>
  ${cmp}
  ${prov(r, 'Synthetic')}
  ${rawResult(out)}
</div>`;
}

export function renderCheck(out) {
  if (out.isError) return renderRefusal(out);
  const r = out.structured;
  const c = r.checked;
  const s = r.summary;
  const items = r.flags.map((f) => `<li class="item item--${f.severity}" data-flag="${esc(f.id)}" data-check="${esc(f.check)}" data-line="${esc(f.line_ref)}">
      <p class="item__head"><span class="tag tag--${f.severity}">${esc(SEVERITY[f.severity])}</span> <span class="item__id">${esc(f.id)}</span> <span class="item__line">${esc(f.line_ref === 'PLAN' ? 'Whole plan' : `${f.line_ref} ${f.group_name}`)}</span></p>
      <p class="item__title">${esc(f.title)}</p>
      <p class="item__msg">${esc(f.message)}</p>
      <p class="item__meta">Line basis: ${esc(f.line_basis || 'none stated')}. Line status: ${esc(f.line_status ? f.line_status.replace(/_/g, ' ') : 'none stated')}.</p>
    </li>`).join('');
  return `<div class="result" data-outcome="result">
  <p class="echo"><span class="echo__label">Checked</span> ${esc(c.source === 'store' ? c.plan_id : 'inline plan')}: ${esc(String(c.line_count))} lines, total ${esc(gbp(c.stated_total))}, hash <code>${esc(c.hash)}</code></p>
  <p class="result__figure"><span class="result__value">${esc(String(s.items_for_review))} item${s.items_for_review === 1 ? '' : 's'}</span><span class="result__unit">for review</span></p>
  <p class="result__sub">${esc(String(s.checks))} to confirm, ${esc(String(s.reviews))} needing a judgement, ${esc(String(s.notes))} soft note${s.notes === 1 ? '' : 's'}; checks first.</p>
  ${r.flags.length ? `<ol class="items">${items}</ol>` : '<p class="result__sub">No items raised. The plan still needs the cost manager\'s review.</p>'}
  <p class="result__sub">Cost limit including inflation ${esc(gbp(r.build_up.cost_limit_including_inflation))} (${esc(gbp(r.build_up.cost_per_m2_gifa))} per m² GIFA), VAT excluded, from the stated lines.</p>
  ${prov(r, 'First pass')}
  ${rawResult(out)}
</div>`;
}

/** The plan table. Rates of priced lines are text boxes; everything else is read-only. */
export function renderPlanTable(plan, flags = [], { disabled = false } = {}) {
  const byLine = {};
  for (const f of flags) (byLine[f.line_ref] = byLine[f.line_ref] || []).push(f);
  const rows = plan.lines.map((l) => {
    const marks = marksHtml(byLine[l.ref] || []);
    let rate;
    if (l.unit === 'per_m2_gifa') {
      const v = typeof l.rate_per_m2 === 'number' ? String(l.rate_per_m2) : String(l.rate_per_m2 ?? '');
      rate = `<label class="visually-hidden" for="rate-${esc(l.ref)}">Rate in pounds per m² for ${esc(l.ref)} ${esc(l.description)}</label><input class="rate" id="rate-${esc(l.ref)}" data-rate="${esc(l.ref)}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${esc(v)}"${disabled ? ' disabled' : ''}>`;
    } else if (l.unit === 'percent') {
      const m = /^groups_(\d+)_to_(\d+)$/.exec(l.applied_to);
      rate = `<span class="pct">${esc(num(l.percentage, l.percentage % 1 ? 1 : 0))}%</span><span class="pct__base">of groups ${esc(m ? `${m[1]} to ${m[2]}` : l.applied_to)}</span>`;
    } else {
      rate = '<span class="pct__base">lump sum</span>';
    }
    const total = typeof l.total === 'number' ? num(l.total) : '';
    return `<tr data-line="${esc(l.ref)}"><th scope="row">${esc(l.ref)}</th><td class="el"><span class="el__name">${esc(l.description)}</span><span class="marks" data-marks="${esc(l.ref)}">${marks}</span></td><td class="num rate-cell">${rate}</td><td class="num" data-total="${esc(l.ref)}">${esc(total)}</td></tr>`;
  }).join('\n');
  return `<table class="plan-table">
  <caption class="visually-hidden">Lines of the synthetic cost plan, with editable rates for priced lines</caption>
  <colgroup><col class="c-ref"><col class="c-el"><col class="c-rate"><col class="c-total"></colgroup>
  <thead><tr><th scope="col">Ref</th><th scope="col">Element</th><th scope="col" class="num">Rate <span class="unit">£/m²</span></th><th scope="col" class="num">Total £</th></tr></thead>
  <tbody>
${rows}
  </tbody>
  <tfoot><tr><th scope="row" colspan="3">Plan total</th><td class="num" data-total="PLAN">${esc(num(plan.stated_total))}</td></tr></tfoot>
</table>`;
}

/** The consultant review list: one choice per item; nothing here approves the plan. */
export const REVIEW_CHOICES = [
  ['', 'Not reviewed yet'],
  ['correct', 'Correct the plan'],
  ['accept', 'Accept as stated, with a note'],
  ['query', 'Query with the design team'],
];

export function renderReview(flags, choices = {}) {
  if (!flags.length) return '<p class="result__sub">No items to review. The cost manager still reviews the plan before it goes anywhere.</p>';
  const done = flags.filter((f) => choices[`${f.line_ref}:${f.check}`]).length;
  const rows = flags.map((f) => {
    const key = `${f.line_ref}:${f.check}`;
    const id = `rv-${f.id}`;
    return `<li class="review__row">
      <label for="${esc(id)}"><span class="tag tag--${f.severity}">${esc(SEVERITY[f.severity])}</span> <span class="item__id">${esc(f.id)}</span> ${esc(f.line_ref === 'PLAN' ? 'Whole plan' : f.line_ref)}: ${esc(f.title)}</label>
      <select id="${esc(id)}" data-review="${esc(key)}">${REVIEW_CHOICES.map(([v, t]) => `<option value="${v}"${(choices[key] || '') === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
    </li>`;
  }).join('');
  return `<ol class="review">${rows}</ol>
  <p class="review__summary" data-review-summary>${esc(String(done))} of ${esc(String(flags.length))} items reviewed by the cost manager on this page. The plan is approved in the cost system by a named person, not by the agent: the server has no approve, edit or send tool.</p>`;
}

/** Small item markers shown next to a plan line (id plus a severity shape). */
export function marksHtml(flags) {
  return flags.map((f) => `<span class="mark mark--${f.severity}" title="${esc(`${f.id}: ${f.title}`)}">${esc(f.id)}</span>`).join('');
}

/** One agent turn: the question, the call the agent makes, and what the tool returns. */
export function renderPanel(q, out) {
  const result = q.call.name === 'check_cost_plan' ? renderCheck(out) : q.call.name === 'get_benchmark' ? renderBenchmark(out, q.compare) : renderRebase(out);
  return `<div class="turn">
  <p class="turn__who">The cost manager asks</p>
  <p class="turn__ask">${esc(q.ask)}</p>
  <p class="turn__who">The agent calls</p>
  ${renderCall(q.call)}
  <p class="turn__who">The tool returns</p>
  ${result}
</div>`;
}

/** The line under the plan table: what the next check will be run on. */
export function echoHtml(out) {
  if (out.isError) return `The plan cannot be checked as it stands: ${esc(out.refusal.reason)}`;
  const c = out.structured.checked;
  return `The tool checks ${esc(c.source === 'store' ? c.plan_id : 'the edited plan, passed inline')}: ${esc(String(c.line_count))} lines, total ${esc(gbp(c.stated_total))}, hash <code>${esc(c.hash)}</code>.`;
}
