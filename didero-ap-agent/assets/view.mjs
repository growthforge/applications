// String renderers shared by the live replay (replay.mjs) and the build-time prerender (tools/prepare-page.mjs).
import { REASONS, ACTIONS } from './reasons.mjs';

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function status(r) {
  if (r.action === 'hold_fraud') return { cls: 'st--fraud', label: 'Possible payment fraud' };
  if (r.needsHuman) return { cls: 'st--person', label: 'Waiting for a person' };
  return { cls: 'st--agent', label: 'Agent acted' };
}

export function title(r) {
  if (r.kind === 'chase') return r.draft.subject;
  return r.subject;
}

export function itemButton(r, current) {
  const s = status(r);
  const why = REASONS[r.reasons[r.reasons.length - 1]] && r.action !== 'needs_approval' && r.action !== 'exception' && r.action !== 'hold_fraud'
    ? REASONS[r.reasons[r.reasons.length - 1]].label : (REASONS[r.reasons[0]] || { label: r.reasons[0] }).label;
  return `<li><button type="button" class="item-btn" data-id="${esc(r.id)}"${current ? ' aria-current="true"' : ''}>`
    + `<span class="item-btn__top"><span class="item-btn__id">${esc(r.id)}</span><span class="st ${s.cls}">${esc(s.label)}</span></span>`
    + `<span class="item-btn__subj">${esc(title(r))}</span><span class="item-btn__why">${esc(why)}</span></button></li>`;
}

function fields(doc) {
  if (!doc) return '';
  const rows = [
    ['Type', doc.document_type], ['Supplier', doc.supplier_name], ['Number', doc.document_number], ['PO', doc.po_number],
    ['Currency', doc.currency], ['Net', doc.net], ['VAT', doc.vat], ['Total', doc.total], ['Bank', [doc.bank_sort_code, doc.bank_account].filter(Boolean).join(' ')],
    ['Delivery date', doc.confirmed_delivery_date], ['Lines', (doc.lines || []).map((l) => l.qty + ' x ' + l.sku + ' at ' + l.unit_price).join('; ')], ['Confidence', doc.confidence],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
  return `<div><h4>What it read</h4><dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
}

export function detail(r, email, resolution) {
  const s = status(r);
  const verdict = ACTIONS[r.action] ? ACTIONS[r.action].label : r.action;
  const reasons = r.reasons.map((code) => {
    const x = REASONS[code];
    return `<li><strong>${esc(x ? x.label : code)}.</strong> ${esc(x ? x.means : '')} <span class="code">${esc(code)}</span></li>`;
  }).join('');
  const checks = (r.checks || []).length ? `<div><h4>Checks</h4><ul class="checks">${r.checks.map((c) => `<li>${esc(c.check)}: <span class="mono">${esc(c.detail)}</span></li>`).join('')}</ul></div>` : '';
  const draft = r.draft ? `<div><h4>${r.draft.to === 'buyer' ? 'Task for the buyer' : 'Draft to ' + esc(r.draft.to)}</h4><p class="draft"><strong>${esc(r.draft.subject)}</strong>\n\n${esc(r.draft.body)}</p></div>`
    : r.draftReply ? `<div><h4>Drafted reply</h4><p class="draft">${esc(r.draftReply)}</p></div>` : '';
  const paired = r.pairedWith ? `<p class="detail__summary">Paired with <button type="button" class="linklike" data-id="${esc(r.pairedWith)}">${esc(r.pairedWith)}</button>.</p>` : '';
  let act = '';
  if (r.needsHuman) {
    act = resolution
      ? `<p class="resolved" tabindex="-1"><strong>Resolved: ${esc(resolution.label)}.</strong> ${esc(resolution.effect)} (simulated).</p>`
      : `<div><h4>Resolve it</h4><div class="resolve" role="group" aria-label="Resolutions for ${esc(r.id)}">${(r.options || []).map((o) => `<button type="button" data-resolve="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div></div>`;
  }
  const audit = (r.audit || []).map((a) => `<li><span class="actor">${esc(a.actor)}</span><span>${esc(a.step)}: ${esc(a.detail)}</span></li>`).join('');
  const mail = email ? `<div><h4>The email</h4><pre class="email">${esc(email.body)}</pre></div>` : '';
  return `<div class="detail__head"><span class="st ${s.cls}">${esc(s.label)}</span><h3>${esc(title(r))}</h3>`
    + (email ? `<p class="detail__from">${esc(r.id)} from ${esc(email.from)}</p>` : `<p class="detail__from">${esc(r.id)}: the morning chase job</p>`) + `</div>`
    + `<p class="detail__verdict">${esc(verdict)}</p>`
    + (r.summary ? `<p class="detail__summary">${esc(r.summary)}</p>` : '') + paired
    + `<div><h4>Why</h4><ul class="reasons">${reasons}</ul></div>`
    + act + draft + checks + fields(r.doc) + mail
    + `<div><h4>Audit trail</h4><ul class="audit">${audit}</ul></div>`;
}

// A compact, print-only summary of one case: what the agent decided, why, and what a person can choose.
export function printCase(r) {
  const s = status(r);
  const verdict = ACTIONS[r.action] ? ACTIONS[r.action].label : r.action;
  const why = r.reasons.map((c) => (REASONS[c] || { label: c }).label).join('; ');
  const opts = (r.options || []).map((o) => o.label + ' (' + o.effect + ')').join('; ');
  return `<div class="detail-print"><p class="detail-print__head"><span class="st ${s.cls}">${esc(s.label)}</span> <span class="mono">${esc(r.id)}</span> ${esc(title(r))}</p>`
    + `<p><strong>${esc(verdict)}.</strong> ${esc(r.summary || '')}</p><p><strong>Why:</strong> ${esc(why)}</p>`
    + (opts ? `<p><strong>A person chooses:</strong> ${esc(opts)}</p>` : '') + `</div>`;
}

export function plan(PHASES) {
  const label = (p) => (p.from === p.to ? 'Day ' + p.to : p.from < 0 ? 'Two weeks before day 1' : 'Days ' + p.from + ' to ' + p.to);
  const scale = ['<span>before</span>', ...Array.from({ length: 18 }, (_, i) => `<span>${i + 1}</span>`), '<span>after</span>'].join('');
  const bars = PHASES.map((p) => {
    const start = p.from < 1 ? 1 : p.from + 1;
    const end = p.to > 18 ? 21 : p.to < 1 ? 2 : p.to + 2;
    const single = p.from === p.to;
    return `<a class="ruler__bar ruler__bar--${p.id}" href="#phase-${p.id}" style="grid-column:${start} / ${end}"${single ? ` aria-label="${esc(p.title)}"` : ''}>${esc(single ? String(p.to) : p.title.split(':')[0])}</a>`;
  }).join('');
  const cards = PHASES.map((p) => `<li class="phase phase--${p.id}" id="phase-${p.id}"><span class="phase__days">${esc(label(p))}</span><h3>${esc(p.title)}</h3><p>${esc(p.goal)}</p><p class="phase__who">${esc(p.who)}</p><ul>${p.outputs.map((o) => `<li>${esc(o)}</li>`).join('')}</ul><p class="phase__gate"><strong>Gate:</strong> ${esc(p.gate)}</p></li>`).join('');
  return `<div class="ruler"><div class="ruler__scale" aria-hidden="true">${scale}</div><nav class="ruler__bars" aria-label="Plan phases">${bars}</nav></div><ol class="phases">${cards}</ol>`;
}

export function staticCases(results) {
  const rows = results.map((r) => {
    const s = status(r);
    return `<tr><td class="mono">${esc(r.id)}</td><td>${esc(title(r))}</td><td>${esc(s.label)}: ${esc((ACTIONS[r.action] || {}).label || r.action)}</td><td>${esc(r.reasons.map((c) => (REASONS[c] || { label: c }).label).join('; '))}</td></tr>`;
  }).join('');
  return `<table class="tests"><caption>Illustrative: every item in the synthetic run and what the agent did with it</caption><thead><tr><th scope="col">Item</th><th scope="col">Email or task</th><th scope="col">Outcome</th><th scope="col">Why</th></tr></thead><tbody>${rows}</tbody></table>`;
}
