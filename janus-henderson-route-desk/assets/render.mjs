// String renderers shared by the page (desk.mjs) and the build-time prerender (tools/prerender.mjs),
// so the no-JS view, the PDF and the live desk all show the same engine output.

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TYPE_LABEL = {
  process: 'Process first',
  'process-then-ai': 'Process first, then AI',
  automation: 'Automation, not AI',
  ai: 'AI fits',
};

export function fmtHours(h) {
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h a month`;
}

export function laneCounts(rules, results) {
  const counts = Object.fromEntries(rules.laneOrder.map((l) => [l, 0]));
  for (const r of results) counts[r.lane] += 1;
  return counts;
}

// The route line: seven destinations, one lit. Counts are optional.
export function renderRoute(rules, { selected = null, counts = null, label = 'Route to delivery' } = {}) {
  const stops = rules.laneOrder
    .map((lane) => {
      const on = lane === selected;
      const count = counts ? `<span class="route__count">${counts[lane]}</span>` : '';
      return `<li class="route__stop${on ? ' is-on' : ''}" data-lane="${lane}"${on ? ' aria-current="true"' : ''}>`
        + `<span class="route__mark" aria-hidden="true"></span>`
        + `<span class="route__name">${esc(rules.lanes[lane].name)}${on ? '<span class="visually-hidden"> (this idea)</span>' : ''}</span>${count}</li>`;
    })
    .join('');
  return `<ol class="route" aria-label="${esc(label)}">${stops}</ol>`;
}

export function renderForm(rules, answers) {
  return rules.questions
    .map((q) => {
      const id = `q-${q.id}`;
      const help = q.help ? `<span class="field__help" id="${id}-help">${esc(q.help)}</span>` : '';
      const described = q.help ? ` aria-describedby="${id}-help"` : '';
      let control;
      if (q.type === 'number') {
        control = `<input class="field__input" type="number" inputmode="decimal" min="${q.min}" max="${q.max}" step="0.5" id="${id}" name="${q.id}" value="${esc(answers[q.id])}"${described}>`;
      } else {
        const opts = q.options
          .map((o) => `<option value="${esc(o.value)}"${o.value === answers[q.id] ? ' selected' : ''}>${esc(o.label)}</option>`)
          .join('');
        control = `<select class="field__input" id="${id}" name="${q.id}"${described}>${opts}</select>`;
      }
      return `<div class="field"><label class="field__label" for="${id}">${esc(q.label)}</label>${help}${control}</div>`;
    })
    .join('');
}

export function renderVerdict(rules, idea, r) {
  const next = r.next
    ? `<div class="verdict__next"><h4>Once the process is in place</h4><p>${esc(r.next.laneName)}, tier ${r.next.tier}. ${esc(r.next.verdict)}. ${esc(r.next.platform)}</p></div>`
    : '';
  const controls = r.controls.length
    ? `<ul class="verdict__controls">${r.controls.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '';
  const hours = r.hours > 0
    ? `${esc(fmtHours(r.hours))} spent today. Not hours saved: those are measured in the pilot.`
    : 'No estimate entered yet. Add hours a month to weigh the value.';
  const fired = r.fired.map((f) => `<li><span class="rule-id">${esc(f.id)}</span> <span class="rule-area">${esc(f.area)}.</span> ${esc(f.text)}</li>`).join('');
  const row = (dt, dd) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`;
  const rows = {
    type: row('AI or process', `<strong>${esc(TYPE_LABEL[r.type])}.</strong> ${esc(r.fired[0].text)}`),
    platform: row('Platform', esc(r.platform)),
    control: row('Control', `<strong>${esc(r.tierLabel)}.</strong> ${esc(r.reviewers)}${controls}`),
    gate: row('Human gate', esc(r.gate)),
    measure: row('Measure', `<strong>${esc(r.measure.kpi)}.</strong> ${esc(r.measure.baseline)} ${esc(r.measure.pilot)}`),
    hours: row('Hours at stake', hours),
    environment: row('Environment and ownership', esc(r.environment)),
    scale: row('Scale', esc(r.scale)),
    people: row('People', esc(r.people)),
  };
  // Only ideas that are going ahead get a build plan in the main view.
  const active = !['existing', 'process'].includes(r.lane) && !['V6', 'V7'].includes(r.verdictId);
  let main;
  let later;
  if (active) {
    main = ['type', 'platform', 'control', 'gate', 'measure', 'hours'];
    later = { title: 'Ownership, scale and people', keys: ['environment', 'scale', 'people'] };
  } else if (r.lane === 'process') {
    main = ['type', 'measure', 'hours', 'people'];
    later = { title: 'Controls, once it is built', keys: ['control', 'gate'] };
  } else {
    if (r.lane !== 'existing') rows.people = row('People', 'The ATC logs it in the register and brings it back to the quarterly review; no build or training yet.');
    main = ['type', 'hours', 'people'];
    later = { title: 'If it moves forward', keys: ['platform', 'control', 'gate', 'measure', 'environment', 'scale'] };
  }
  return `
<div class="verdict__head">
  <p class="verdict__idea">${esc(idea.title || 'Your idea')}</p>
  <p class="verdict__call"><span class="verdict__label">Verdict</span> ${esc(r.verdict)}</p>
</div>
${renderRoute(rules, { selected: r.lane, label: 'Suggested route to delivery' })}
<p class="verdict__owner"><strong>${esc(r.laneName)}.</strong> ${esc(r.owner)}.</p>
<p class="verdict__rule">Decided by rule ${esc(r.routeRule.id)}: ${esc(r.routeRule.plain)}.</p>
${next}
<dl class="verdict__facts">${main.map((k) => rows[k]).join('')}</dl>
<details class="verdict__more"><summary>${later.title}</summary><dl class="verdict__facts">${later.keys.map((k) => rows[k]).join('')}</dl></details>
<details class="verdict__why"><summary>Rules that fired</summary><ul>${fired}</ul></details>`;
}

export function renderBoard(rules, ideas, results) {
  return rules.laneOrder
    .map((lane) => {
      const cards = ideas
        .map((idea, i) => ({ idea, r: results[i] }))
        .filter(({ r }) => r.lane === lane)
        .map(({ idea, r }) => `
<li><button type="button" class="board-card" data-idea="${esc(idea.id)}">
  <span class="board-card__title">${esc(idea.title)}</span>
  <span class="board-card__unit">${esc(idea.unit)}</span>
  <span class="board-card__meta">Tier ${r.tier}, ${esc(fmtHours(r.hours))} at stake</span>
  <span class="board-card__verdict">${esc(r.verdict)}</span>
</button></li>`)
        .join('');
      return `<section class="board__lane" aria-labelledby="lane-${lane}"><h3 id="lane-${lane}">${esc(rules.lanes[lane].name)}</h3><ul>${cards || '<li class="board__empty">None of the eight</li>'}</ul></section>`;
    })
    .join('');
}

export function renderStaticTable(rules, ideas, results) {
  const rows = ideas
    .map((idea, i) => {
      const r = results[i];
      const next = r.next ? ` Once the process is in place: ${r.next.laneName}, tier ${r.next.tier}.` : '';
      return `<tr><th scope="row" data-label="Idea">${esc(idea.title)}<span class="static-unit">${esc(idea.unit)}</span></th><td data-label="First view"><strong>${esc(r.laneName)}</strong>, tier ${r.tier}. ${esc(TYPE_LABEL[r.type])}.${esc(next)}</td><td data-label="Measure">${esc(r.measure.kpi)}</td><td data-label="Verdict">${esc(r.verdict)}</td></tr>`;
    })
    .join('');
  return `<table class="table table--stack static-table"><caption>Illustrative: the desk's first view for each of the eight ideas</caption><thead><tr><th scope="col">Idea</th><th scope="col">First view: route, tier, AI or process</th><th scope="col">Measure</th><th scope="col">Verdict</th></tr></thead><tbody>${rows}</tbody></table>`;
}
