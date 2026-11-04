// String renderers shared by the page (app.mjs) and the build-time prerender (tools/prepare-page.mjs).

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CRIT_ORDER = ['insight', 'verification', 'nextStep', 'visual', 'evidence'];
export const RUN_LABELS = {
  'v2.4-sonnet-run1': 'Prompt v2.4, Sonnet',
  'v2.4-haiku-run1': 'Prompt v2.4, Haiku',
  'v2.3-sonnet-run1': 'Prompt v2.3, Sonnet',
  'v2.3-haiku-run1': 'Prompt v2.3, Haiku',
  'v2.2-sonnet-run1': 'Prompt v2.2, Sonnet',
  'v2.2-haiku-run1': 'Prompt v2.2, Haiku',
  'v2.1-sonnet-run1': 'Prompt v2.1, Sonnet',
  'v2-sonnet-run1': 'Prompt v2, Sonnet',
  'v1-sonnet-run1': 'Prompt v1, Sonnet',
};

// The marker scores criteria; code turns the scores into PAIR's grade bands. The gate: checking must score 2,
// an independent check of the figure the insight rests on, with a result that agrees with the data. The
// marker's own "passed" field is ignored. The same rule is applied to every prompt version on this page.
export function grade(scores) {
  const total = ['insight', 'verification', 'nextStep', 'visual', 'evidence'].reduce((a, k) => a + (scores[k] ?? 0), 0);
  const check = scores.verification ?? 0;
  if (total < 6 || check < 2) return 'Fail';
  if (total >= 9 && (scores.insight ?? 0) >= 3) return 'Distinction'; // complete is not the same as excellent
  return 'Pass';
}

// What the learner would see: flagged work is held for a person before any grade is released, and a gate
// failure says what is missing instead of showing a high total next to "Fail".
export function learnerView(scores, flags = []) {
  if ((flags || []).length) return 'Held for a person before a grade is released';
  const g = grade(scores);
  const total = ['insight', 'verification', 'nextStep', 'visual', 'evidence'].reduce((a, k) => a + (scores[k] ?? 0), 0);
  if (g === 'Fail' && total >= 6) return 'Not yet: an independent check of your key figure is needed to pass';
  return g === 'Fail' ? 'Not yet' : g;
}

// Each prompt version is scored against the reference for its rubric. References were fixed before each
// version's runs; v2.2 differs from v2.1 only where the rubric change moves the right answer (S4, S10).
// v2.3 and v2.4 move no reference, so they use v2.2's.
export function refFor(sample, prompt) {
  if (prompt === 'v2.2' || prompt === 'v2.3' || prompt === 'v2.4') return sample.referenceV22 || sample.referenceV21 || sample.reference;
  if (prompt === 'v2.1') return sample.referenceV21 || sample.reference;
  return sample.reference;
}

function agreeCount(sample, mark, prompt) {
  const ref = refFor(sample, prompt);
  return CRIT_ORDER.filter((k) => (mark.scores[k] ?? 0) === ref[k]).length;
}

export function sampleButton(sample, mark, prompt, current) {
  if (!mark) return `<li><button type="button" class="s-btn" data-id="${esc(sample.id)}" disabled><span class="s-btn__id">${esc(sample.id)}</span><span class="s-btn__label">${esc(sample.label)}</span><span class="s-btn__agree">Not in this run</span></button></li>`;
  const ref = refFor(sample, prompt);
  const n = agreeCount(sample, mark, prompt);
  const flagsOk = (ref.flags || []).every((f) => (mark.flags || []).includes(f));
  const all = n === CRIT_ORDER.length && grade(mark.scores) === grade(ref) && flagsOk;
  const note = all ? 'Marker agrees with reference' : !flagsOk && n === CRIT_ORDER.length ? 'Scores agree; missed a flag' : `Agrees on ${n} of ${CRIT_ORDER.length} criteria${flagsOk ? '' : '; missed a flag'}`;
  return `<li><button type="button" class="s-btn" data-id="${esc(sample.id)}"${current ? ' aria-current="true"' : ''}>`
    + `<span class="s-btn__id">${esc(sample.id)}${sample.heldOut ? ' (held out)' : ''}</span><span class="s-btn__label">${esc(sample.label.replace(/^Held out: /, ''))}</span>`
    + `<span class="s-btn__agree ${all ? 'agree-ok' : 'agree-diff'}">${note}</span></button></li>`;
}

export function runPicker(runKeys, current) {
  return `<div class="run-pick" role="group" aria-label="Which marking run to show"><span>Marked by</span>`
    + runKeys.map((k) => `<button type="button" data-run="${esc(k)}" aria-pressed="${k === current}">${esc(RUN_LABELS[k] || k)}</button>`).join('') + `</div>`;
}

export function sampleDetail(sample, rubric, mark, runKey, prompt, runKeys) {
  const ref = refFor(sample, prompt);
  const names = Object.fromEntries(rubric.criteria.map((c) => [c.id, c]));
  const rows = CRIT_ORDER.map((k) => {
    const c = names[k];
    const got = mark.scores[k] ?? 0;
    const diff = got !== ref[k];
    const quotes = (mark.evidence[k] || []).filter((q) => q && q.toLowerCase() !== 'none');
    const ev = quotes.length ? quotes.map((q) => `<q>${esc(q)}</q>`).join(' ') : (mark.evidence[k] ? '<span class="muted">No evidence quoted</span>' : '<span class="muted">v1 does not quote evidence</span>');
    return `<tr class="${c.gate ? 'is-gate ' : ''}${diff ? 'diff' : ''}"><th scope="row">${esc(c.name)}${c.gate ? ' (gate)' : ''}</th>`
      + `<td class="num">${ref[k]} / ${c.max}</td><td class="num">${got} / ${c.max}</td>`
      + `<td>${ev}${mark.reasons[k] ? `<br><span class="muted">${esc(mark.reasons[k])}</span>` : ''}</td></tr>`;
  }).join('');
  const flags = (mark.flags || []).map((f) => `<span class="pill pill--flag">Flag: ${esc(f.replace(/_/g, ' '))}</span>`).join('');
  const refFlags = (ref.flags || []).map((f) => f.replace(/_/g, ' ')).join(', ') || 'none';
  const note = sample.referenceNote ? `<p class="ref-note"><strong>Note on the reference:</strong> ${esc(sample.referenceNote)}</p>` : '';
  return `<div><span class="s-btn__id">${esc(sample.id)}${sample.heldOut ? ', held out: written and given reference marks before the v2.2 runs' : ''}</span><h3>${esc(sample.label.replace(/^Held out: /, ''))}</h3><p class="lab__tests">Tests: ${esc(sample.tests)}</p></div>`
    + `<div><h4 class="visually-hidden">What the learner submitted</h4><pre class="submission">${esc(sample.text)}</pre></div>`
    + (runKeys ? runPicker(runKeys, runKey) : '')
    + `<div class="table-wrap" role="region" aria-label="Marks for ${esc(sample.id)}" tabindex="0"><table class="marks"><caption class="visually-hidden">Reference marks and the marker's marks for ${esc(sample.id)}</caption><thead><tr><th scope="col">Criterion</th><th scope="col">Reference</th><th scope="col">Marker</th><th scope="col">Evidence the marker quoted, and its reason</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<div class="verdict"><span class="pill">Reference: ${ref.total}/10, ${grade(ref)}; flags ${esc(refFlags)}</span>`
    + `<span class="pill ${grade(mark.scores) === 'Fail' ? 'pill--fail' : 'pill--pass'}">Marker: ${mark.total}/10, ${grade(mark.scores)}</span>${flags}</div>`
    + `<p class="learner-view"><strong>The learner sees:</strong> ${esc(learnerView(mark.scores, mark.flags))}</p>`
    + note
    + `<div class="feedback"><p><strong>What the learner would read.</strong> ${esc(mark.feedback.strength || '')}</p><p>${esc(mark.feedback.next_step || '')}</p></div>`;
}

export function rubricTable(rubric, previous) {
  const prev = previous ? Object.fromEntries(previous.criteria.map((c) => [c.id, c])) : {};
  const rows = rubric.criteria.map((c) => {
    const cells = [0, 1, 2, 3].map((s) => {
      const l = c.levels.find((x) => x.score === s);
      if (!l) return '<td class="na">Not used</td>';
      const p = prev[c.id] && prev[c.id].levels.find((x) => x.score === s);
      const changed = p && p.descriptor !== l.descriptor;
      return `<td${changed ? ' class="changed"' : ''}>${esc(l.descriptor)}${l.example ? `<em>${esc(l.example)}</em>` : ''}${changed ? `<em>Changed in v${esc(rubric.version)}</em>` : ''}</td>`;
    }).join('');
    return `<tr${c.gate ? ' class="gate"' : ''}><th scope="row">${esc(c.name)}<small>Objective ${esc(c.objective.slice(1))}, up to ${c.max}${c.gate ? ', gate' : ''}</small></th>${cells}</tr>`;
  }).join('');
  return `<table class="rubric"><caption class="visually-hidden">Rubric v${esc(rubric.version)}: level descriptors and examples</caption><thead><tr><th scope="col">Criterion</th><th scope="col">0</th><th scope="col">1</th><th scope="col">2</th><th scope="col">3</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function briefCard(assignment, roleId) {
  const role = assignment.roles.find((r) => r.id === roleId) || assignment.roles[0];
  return `<div class="brief__card"><h3>The task, as every learner sees it</h3><ol>${assignment.brief.map((b) => `<li>${esc(b)}</li>`).join('')}</ol></div>`
    + `<div class="brief__card"><h3>${esc(role.name)}</h3><dl><dt>Data</dt><dd>${esc(role.data)}</dd><dt>Starter question</dt><dd>${esc(role.starterQuestion)}</dd><dt>The check that matters</dt><dd>${esc(role.check)}</dd><dt>The mistake it is built to surface</dt><dd class="trap">${esc(role.trap)}</dd></dl></div>`;
}

export function roleButtons(assignment, current) {
  return assignment.roles.map((r) => `<button type="button" data-role="${esc(r.id)}" aria-pressed="${r.id === current}">${esc(r.name)}</button>`).join('');
}

export function script(lesson) {
  return `<ol class="script">${lesson.scenes.map((s) => `<li class="scene"><div class="scene__time"><b>${esc(s.from)}</b>to ${esc(s.to)}</div>`
    + `<div><h3>${esc(s.title)}</h3><p class="vo">${esc(s.vo)}</p><p class="screen"><strong>On screen:</strong> ${esc(s.screen)}</p></div>`
    + `<p class="why"${s.src ? ` data-src="${esc(s.src)}"` : ''}><strong>Why this way:</strong> ${esc(s.why)}${s.src ? ` <a class="cite" href="#src-${esc(s.src)}">[${esc(s.src)}]</a>` : ''}</p></li>`).join('')}</ol>`;
}

export function auditList(audit, state) {
  return `<ol class="audit-list">${audit.standards.map((s) => {
    const v = state[s.id];
    const opt = (val, label) => `<label><input type="radio" name="${esc(s.id)}" value="${val}"${v === val ? ' checked' : ''}> ${label}</label>`;
    return `<li><div><span class="area">${esc(s.id)}, ${esc(s.area)}</span>${esc(s.text)}</div><fieldset><legend>${esc(s.id)}: does the assignment meet this?</legend>${opt(2, 'Yes')}${opt(1, 'Partly')}${opt(0, 'No')}</fieldset></li>`;
  }).join('')}</ol>`;
}

export function auditOut(audit, state, label) {
  const max = audit.standards.length * 2;
  const score = audit.standards.reduce((a, s) => a + (state[s.id] ?? 0), 0);
  const open = audit.standards.filter((s) => state[s.id] === undefined);
  const gaps = audit.standards.filter((s) => state[s.id] === 0);
  const partly = audit.standards.filter((s) => state[s.id] === 1);
  if (open.length === audit.standards.length) return `<h3>${esc(label)}</h3><p>Answer each standard to see a score and what to fix first.</p>`;
  return `<h3>${esc(label)}</h3><p class="audit-score">${score} / ${max}</p>`
    + (open.length ? `<p class="muted">${open.length} not answered yet (counted as 0).</p>` : '')
    + (gaps.length ? `<p><strong>Fix first (not met):</strong></p><ol>${gaps.slice(0, 5).map((g) => `<li>${esc(g.id)}: ${esc(g.text)}</li>`).join('')}</ol>${gaps.length > 5 ? `<p class="muted">and ${gaps.length - 5} more.</p>` : ''}` : '<p>Every answered standard is at least partly met.</p>')
    + (partly.length ? `<p class="muted">Partly met: ${partly.map((p) => esc(p.id)).join(', ')}.</p>` : '');
}
