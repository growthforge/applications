// HTML for the page, shared by the page script (live) and tools/prepare-page.mjs (first paint, no-JS, print).
// Pure functions of the data: nothing here reads the DOM.
import { verify, optionsFor, numberClaims, buyerAnswer, POLICY } from './core.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Every code core.mjs can return, in plain words. tests/page.test.mjs checks none is missing.
export const REASONS = {
  INSTRUCTION_IN_QUESTION: "The buyer's text contains an instruction aimed at AI tools. It is kept as data, and the Head of Security looks at the row.",
  BLOCKED_CONTRACT: 'Contract terms, audit rights and service levels are never answered from the library.',
  BLOCKED_PRICING: 'Prices and discounts are never answered from the library.',
  BLOCKED_INCIDENT: 'Incident history is answered by the Head of Security only.',
  BLOCKED_ROADMAP: 'Future commitments are never answered from the library.',
  NO_APPROVED_ANSWER: 'No approved entry covers this question.',
  ANSWER_NOT_APPROVED: 'The closest entry is still a draft.',
  ANSWER_PAST_REVIEW: 'The closest entry is past its review date.',
  AMBIGUOUS_MATCH: 'Two different topics match almost equally, so a person picks.',
  TERM_NOT_IN_LIBRARY: 'The question names a standard, product or place that no approved entry mentions.',
  MODEL_OUTPUT_UNUSABLE: 'The model returned nothing usable.',
  NO_CITATION: 'The draft cites no entry.',
  CITED_ENTRY_NOT_GIVEN: 'The draft cites an entry it was not given.',
  ENTRY_NOT_APPROVED: 'The draft cites an entry that is in draft or past review.',
  QUOTE_NOT_IN_ENTRY: 'A quote is not word for word in its entry.',
  STANCE_DIFFERS_FROM_ENTRY: "The draft's yes or no differs from the approved answer.",
  ANSWER_CONTRADICTS_STANCE: "Claude's wording says the opposite of its own yes or no, so it has misread something.",
  MIXED_YES_NO: 'Parts of the question need different answers, so a person writes it.',
  NUMBER_NOT_IN_SOURCE: 'The draft has a number, or a unit, its sources do not.',
  NUMBER_MOVED: 'A number from the sources is attached to a different subject.',
  LINK_NOT_IN_SOURCE: 'The draft has a link its sources do not.',
  TERM_NOT_IN_SOURCE: 'The draft names a standard, product or place its sources do not.',
  ANSWER_TOO_LONG: `The draft is over the ${POLICY.maxWords}-word limit.`,
  PARTS_NOT_COVERED: 'The model says part of the question is not covered.',
  PART_NOT_IN_SOURCE: 'The code finds part of the question the cited entries do not cover.',
  MODEL_NOT_SURE: 'The model marked the draft as unsure.',
  EVIDENCE_UNDER_NDA: 'Ready. The evidence is shared only under NDA.',
};

// The code checks a draft must pass, in the order verify() runs them.
export const CHECKS = [
  [['NO_CITATION', 'CITED_ENTRY_NOT_GIVEN', 'ENTRY_NOT_APPROVED'], 'Cites approved, in-date entries it was given'],
  [['QUOTE_NOT_IN_ENTRY'], 'Every quote is word for word'],
  [['STANCE_DIFFERS_FROM_ENTRY', 'ANSWER_CONTRADICTS_STANCE', 'MIXED_YES_NO'], 'Yes or no matches the approved answer'],
  [['NUMBER_NOT_IN_SOURCE', 'NUMBER_MOVED'], 'Every number keeps its unit and subject'],
  [['LINK_NOT_IN_SOURCE', 'TERM_NOT_IN_SOURCE'], 'No new names, standards or links'],
  [['ANSWER_TOO_LONG'], `At most ${POLICY.maxWords} words`],
  [['PARTS_NOT_COVERED', 'PART_NOT_IN_SOURCE'], 'Every part of the question is covered'],
  [['MODEL_NOT_SURE'], 'The model is sure'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const ICON = {
  ready: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  owner: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5L12.5 8 9 11.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stop: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};
export function pill(kind, text) {
  return `<span class="st st--${kind}">${ICON[kind]}<span>${esc(text)}</span></span>`;
}
const pillFor = (r) => (r.route === 'ready' ? pill('ready', 'Ready') : pill('owner', 'To ' + r.owner));

export function counts(summary, unsafe) {
  return `<span><strong>${summary.questions}</strong> questions</span><span><strong>${summary.ready}</strong> ready with sources</span><span><strong>${summary.toOwner}</strong> to a named owner</span><span><strong>${unsafe}</strong> unsafe</span>`;
}

// The question list (toggle buttons; a plain list without the script).
export function questionList(results, selected, filter = 'all') {
  const rows = results.filter((r) => filter === 'all' || (filter === 'ready' ? r.route === 'ready' : r.route !== 'ready'));
  return rows.map((r) => `<li><button type="button" class="q" data-id="${esc(r.id)}" aria-pressed="${r.id === selected}"><span class="q__id">${esc(r.id)}</span><span class="q__text">${esc(r.question)}</span>${pillFor(r)}</button></li>`).join('');
}

// Highlight the quoted words inside the full entry text (case and spacing tolerant, like the check).
export function highlight(answer, quotes) {
  let html = esc(answer);
  for (const q of quotes) {
    const words = String(q || '').trim().replace(/[.\s]+$/, '').split(/\s+/).map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (words.length < 2) continue;
    html = html.replace(new RegExp(words.join('\\s+'), 'i'), (m) => `<mark>${m}</mark>`);
  }
  return html;
}

export function entryCard(entry, quotes) {
  const ev = entry.evidence || {};
  const share = ev.share === 'nda' ? 'under NDA only' : 'shareable';
  return `<div class="src">
  <p class="src__head"><span class="src__id">${esc(entry.id)}</span> ${esc(entry.topic)}</p>
  <p class="src__text">${highlight(entry.answer, quotes)}</p>
  <dl class="src__meta">
    <div><dt>Owner</dt><dd>${esc(entry.owner)}</dd></div>
    <div><dt>Status</dt><dd>${esc(entry.status)}</dd></div>
    <div><dt>Review by</dt><dd>${fmtDate(entry.reviewBy)}</dd></div>
    <div><dt>Evidence</dt><dd>${esc(ev.doc || 'none')}, ${share}</dd></div>
  </dl>
</div>`;
}

export function checkList(fails) {
  return `<ul class="checks">${CHECKS.map(([codes, label]) => {
    const f = fails.filter((x) => codes.includes(x.code));
    return f.length
      ? `<li class="checks__item checks__item--fail"><span class="checks__mark">${ICON.stop}</span><span>${esc(label)}<span class="visually-hidden">: failed</span> ${f.map((x) => `<code>${esc(x.code)}</code>${x.detail ? ` <span class="checks__detail">${esc(x.detail)}</span>` : ''}`).join(' ')}</span></li>`
      : `<li class="checks__item"><span class="checks__mark">${ICON.ready}</span><span>${esc(label)}<span class="visually-hidden">: passed</span></span></li>`;
  }).join('')}</ul>`;
}

export function reasonList(reasons) {
  return `<ul class="reasons">${reasons.map((x) => `<li><code>${esc(x.code)}</code> ${esc(REASONS[x.code] || '')}${x.detail ? ` <span class="checks__detail">${esc(x.detail)}</span>` : ''}</li>`).join('')}</ul>`;
}

// Detail for one result. libById: entries by id. decision: what an owner chose in the live n8n test, if any.
export function detail(r, libById, decision) {
  const head = `<div class="d__head"><p class="d__q"><span class="q__id">${esc(r.id)}</span> ${esc(r.section)}</p>${pillFor(r)}</div>
<p class="d__question">${esc(r.question)}</p>`;
  const draft = r.draft && !r.draft.error ? r.draft : null;
  const quotesFor = (id) => (draft ? draft.citations.filter((c) => c.entry_id === id).map((c) => c.quote) : []);
  const cited = draft ? [...new Set(draft.citations.map((c) => c.entry_id))].filter((id) => libById[id]) : [];
  if (r.route === 'ready') {
    const nda = r.reasons.some((x) => x.code === 'EVIDENCE_UNDER_NDA');
    const b = r.buyer;
    return `${head}
<div class="d__answer"><p class="d__label">Answer sent to the buyer${b.response ? `: <strong>${b.response}</strong>` : ''}</p><p>${esc(b.text)}</p><p class="d__built">Built by code from the whole approved sentences Claude quoted. Claude's own wording is never sent.</p>${nda ? '<p class="d__nda">The evidence is shared only under NDA, through the trust centre.</p>' : ''}</div>
<p class="d__label">Quoted from the approved library</p>
${cited.map((id) => entryCard(libById[id], quotesFor(id))).join('')}
<p class="d__label">Code checks</p>
${checkList([])}
<details class="d__own"><summary>Claude's own wording (never sent)</summary><p>${esc(draft.answer)}</p></details>`;
  }
  const opts = optionsFor(r);
  return `${head}
<div class="d__route"><p class="d__label">Why it goes to ${esc(r.owner)}</p>${reasonList(r.reasons)}</div>
${draft ? `<div class="d__answer d__answer--held"><p class="d__label">Claude's draft, held back</p><p>${esc(draft.answer)}</p></div>` : '<p class="d__none">No draft: the rules stopped this question before any model saw it.</p>'}
<p class="d__label">What ${esc(r.owner)} can do</p>
<ul class="opts">${opts.map((o) => `<li><strong>${esc(o.label)}</strong>. ${esc(o.effect)}.</li>`).join('')}</ul>
${decision ? `<p class="d__live">${esc(decision.text)}</p>` : ''}`;
}

// A tampered copy of a ready draft. kind: 'stance' | 'quote' | 'number' | 'unit' | 'draft'.
const OTHER_UNIT = { hour: 'days', day: 'hours', month: 'weeks', week: 'months', year: 'months', minute: 'hours', '%': 'days', bit: 'days' };
export function canTamper(draft, kind, want) {
  if (kind === 'stance') return want === 'yes' || want === 'no';
  if (kind === 'unit') return numberClaims(draft.answer).some((c) => c.unit);
  return true;
}
export function tamper(draft, kind, library) {
  const d = JSON.parse(JSON.stringify(draft));
  if (kind === 'stance') {
    const flip = d.stance === 'no' ? 'yes' : 'no';
    d.stance = flip;
    const word = flip === 'yes' ? 'Yes' : 'No';
    d.answer = /^\s*(yes|no)\b/i.test(d.answer) ? d.answer.replace(/^\s*(yes|no)\b/i, word) : word + '. ' + d.answer;
  } else if (kind === 'quote') {
    const c = d.citations[0];
    const words = c.quote.split(' ');
    const i = words.findIndex((w, j) => j > 1 && /^[a-z]{4,}$/i.test(w));
    words.splice(i >= 0 ? i : 1, 0, 'fully');
    c.quote = words.join(' ');
  } else if (kind === 'number') {
    d.answer = d.answer.replace(/\s*$/, ' Security logs are kept for 400 days.');
  } else if (kind === 'unit') {
    const c = numberClaims(d.answer).find((x) => x.unit);
    d.answer = d.answer.replace(new RegExp('\\b' + c.n + '\\s*(%|per cent|-bit|[a-z]+)'), c.n + ' ' + OTHER_UNIT[c.unit]);
  } else if (kind === 'draft') {
    const e = library.entries.find((x) => x.status !== 'approved');
    d.citations.push({ entry_id: e.id, quote: e.answer.split(' ').slice(3, 15).join(' ') });
    d.answer = d.answer.replace(/\s*$/, ' Our AI provider is hosted in the EU.');
  }
  return d;
}

export function tamperResult(draft, hits, question, today, owner, original) {
  const fails = verify(draft, hits, question, today);
  const ok = !fails.length;
  const sent = ok ? buyerAnswer(draft, hits, question, today).text : '';
  const before = original ? buyerAnswer(original, hits, question, today).text : '';
  const q0 = original && original.citations[0] ? original.citations[0].quote : '';
  const q1 = draft.citations[0] ? draft.citations[0].quote : '';
  const quoteNote = q0 !== q1 ? `<p class="t__quote">Quote now reads: &ldquo;${esc(q1).replace(/\bfully\b/, '<ins>fully</ins>')}&rdquo;</p>` : '';
  const sentNote = ok ? `<p class="t__sent">${sent === before ? 'The buyer still gets exactly the approved sentences:' : 'The buyer would get:'} &ldquo;${esc(sent)}&rdquo;</p>` : '<p class="t__sent">Nothing is sent until the owner decides.</p>';
  return `<p class="t__verdict t__verdict--${ok ? 'ok' : 'stop'}">${ok ? 'Still ready: every check passes.' : `Stopped. It goes to ${esc(owner)} with the reason.`}</p>${quoteNote}${sentNote}${checkList(fails)}`;
}

// "Ask your own question": the search and the rules, live.
export function ownResult(question, hits, reasons, request, today) {
  const max = Math.max(1, ...hits.map((h) => h.score));
  const list = hits.length
    ? `<ul class="hits">${hits.map((h) => `<li><span><span class="src__id">${esc(h.id)}</span> ${esc(h.entry.topic)}${h.entry.status !== 'approved' || (h.entry.reviewBy && h.entry.reviewBy < today) ? ' <em>(not usable)</em>' : ''}</span><span class="hits__bar${h.score < POLICY.minScore ? ' hits__bar--low' : ''}" aria-hidden="true"><span style="width:${Math.round((h.score / max) * 100)}%"></span></span><span>${h.score.toFixed(2)}</span></li>`).join('')}</ul>`
    : '<p>No library entry shares a word with this question.</p>';
  const verdict = reasons.length
    ? `<p class="t__verdict t__verdict--stop">Goes to ${esc(reasons[0].owner)}. No model is asked.</p>${reasonList(reasons)}`
    : `<p class="t__verdict t__verdict--ok">Passes the rules.</p><p>In the workflow, Claude would now draft from the approved entries above, and the code checks would run on its draft.</p><details><summary>The exact request the workflow would send</summary><pre><code>${esc(JSON.stringify({ ...request, system: request.system.slice(0, 120) + '...', output_config: { format: { type: 'json_schema', schema: '(the output shape)' } } }, null, 2))}</code></pre></details>`;
  return `<p class="d__label">Closest library entries (match score; ${POLICY.minScore} is the threshold)</p>${list}${verdict}`;
}

// ---- Enablement ----
export const SCREEN = [
  { id: 'often', q: 'How often does the task come up?', a: [['weekly', 'Every week or more'], ['monthly', 'Every month'], ['rarely', 'A few times a year']] },
  { id: 'written', q: 'Are the right answers written down?', a: [['approved', 'Yes, approved by someone'], ['partly', 'Partly'], ['no', 'No, it is judgement']] },
  { id: 'data', q: 'What would the tool see?', a: [['public', 'Public information'], ['internal', 'Internal notes'], ['customer', 'Customer or personal data'], ['secrets', 'Secrets or security evidence']] },
  { id: 'checker', q: 'Who checks the output before it leaves?', a: [['owner', 'A named owner'], ['self', 'The person using it'], ['nobody', 'Nobody']] },
  { id: 'cost', q: 'What does a wrong answer cost?', a: [['redo', 'A redo'], ['awkward', 'An awkward conversation'], ['contract', 'A contract or security problem']] },
];
export const SCREEN_DEFAULT = { often: 'weekly', written: 'approved', data: 'customer', checker: 'owner', cost: 'contract' };

export function decide(a) {
  if (a.data === 'secrets') return ['Keep it out of AI tools', 'Secrets and security evidence never go into a model. Share evidence through the trust centre, under NDA.'];
  if (a.written === 'no') return ['Not yet: write the answers down first', 'A tool can only quote what exists. Start the library with its owner; the tool comes after.'];
  if (a.checker === 'nobody' && a.cost !== 'redo') return ['Not yet: name an owner first', 'Something that can go wrong in front of a customer needs a person who checks it.'];
  if (a.often === 'rarely') return ['Assist, do not build', 'For a task that comes up a few times a year, a shared prompt and a review habit cost less than a build.'];
  if (a.cost === 'contract' || a.data === 'customer') return ['Build a desk', 'It repeats, the answers exist and someone checks. A wrong answer is costly, so use the full pattern: approved sources, code checks, a named owner and a log.'];
  return ['Build a light assistant', 'It repeats and the answers exist, and a mistake is cheap: a workflow with a review step is enough.'];
}

export function screenForm(a = SCREEN_DEFAULT) {
  return SCREEN.map((s) => `<fieldset class="screen__q"><legend>${esc(s.q)}</legend>${s.a.map(([v, label]) => `<label><input type="radio" name="${s.id}" value="${v}"${a[s.id] === v ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</fieldset>`).join('');
}
export function screenOut(a = SCREEN_DEFAULT) {
  const [verdict, why] = decide(a);
  return `<p class="screen__verdict">${esc(verdict)}</p><p>${esc(why)}</p>`;
}
