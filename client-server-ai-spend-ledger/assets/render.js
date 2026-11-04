// render.js: HTML for every computed region of the two pages, as strings, from the view model.
// The same functions run in Node (tools/gen-pages.mjs writes the no-JS view into the HTML) and in the
// browser (assets/app.js redraws after the ledger has run on the data at load).
import { usd, signedUsd, unitUsd, pct, int, compact, ratio, monthName, longDate, shortDate, esc, words, fixed } from './fmt.js';

const DECISION_LABEL = { scale: 'Scale', fix: 'Fix', stop: 'Stop' };
const GRADE_CLASS = { measured: 'grade--measured', 'assumption-based': 'grade--assumption', 'Foundation prior': 'grade--prior' };
const STATUS_CLASS = { realised: 'status--realised', validated: 'status--validated', identified: 'status--identified', blocked: 'status--blocked', 'on hold': 'status--hold', recommended: 'status--validated', 'not yet': 'status--hold' };
const taskUsd = (x) => '$' + fixed(x, 3);
const modelLabel = (vm, id) => (vm.prices.models[id] ? vm.prices.models[id].label : id);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

export function dchip(decision) {
  return `<span class="dchip dchip--${decision}">${DECISION_LABEL[decision]}</span>`;
}

// ---- index.html: the decision memo --------------------------------------------------------
export function renderMemo(vm) {
  const m = monthName(vm.month);
  const prev = monthName(vm.previousMonth);
  const a = vm.ai;
  const al = Object.fromEntries(a.alerts.map((x) => [x.type + x.threshold, x]));
  const f = al.forecast1;
  const act = al.actual1;
  let alertLine;
  if (f && f.raisedOn && act && act.raisedOn) {
    alertLine = `The ledger's forecast alert (not Azure's) went out on ${longDate(f.raisedOn)}, ${words(daysBetween(f.raisedOn, act.raisedOn))} days before the actual-spend alert.`;
  } else if (f && f.raisedOn) {
    alertLine = `The forecast alert went out on ${longDate(f.raisedOn)}; actual spend did not reach the budget.`;
  } else alertLine = 'Neither the forecast nor actual spend reached the budget.';
  const over = a.pct >= 1;
  const lead = `<p class="memo__lead"><strong>AI spend landed at ${usd(a.actual)}, ${pct(a.pct)} of its ${usd(a.budget)} budget${over ? '' : ', inside it'}</strong> `
    + `(${pct(vm.budgetRules.multiple)} of the ${monthName(vm.months[0])} and ${prev} average). ${alertLine}</p>`;

  const v = vm.variance;
  const byVol = v.rows.slice().sort((x, y) => Math.abs(y.volume) - Math.abs(x.volume))[0];
  const byMix = v.rows.slice().sort((x, y) => Math.abs(y.mix) - Math.abs(x.mix))[0];
  const topFixed = v.otherByResource.filter((o) => o.kind === 'fixed')[0];
  const topUnattr = v.otherByResource.filter((o) => o.kind === 'unattributed')[0];
  const volNote = byVol && byVol.runsPrevious ? `mostly ${vm.useCases[byVol.useCase].name}, runs ${byVol.runsCurrent >= byVol.runsPrevious ? 'up' : 'down'} ${pct(Math.abs(byVol.runsCurrent / byVol.runsPrevious - 1))}` : '';
  const priceNote = vm.modelChanges.length
    ? vm.modelChanges.map((c) => `<code>${esc(c.deployment)}</code> moved from ${esc(modelLabel(vm, c.from))} to ${esc(modelLabel(vm, c.to))} on ${longDate(c.date)}, at list price`).join('; ')
    : 'no published price changed';
  const mixNote = byMix ? `largest in ${vm.useCases[byMix.useCase].name}: tokens and billed cost per run` : '';
  const fixedNote = topFixed ? `<code>${esc(topFixed.resource)}</code>, a fixed daily charge shared by its users` : 'none';
  const unattrNote = topUnattr ? `<code>${esc(topUnattr.resource)}</code>, billed AI with no use case${vm.reconciliation.bypass.includes(topUnattr.resource) ? ' and no gateway calls' : ''}` : 'none';
  const steps = [['Volume', v.volume, volNote], ['Unit price', v.price, priceNote], ['Mix and consumption', v.mix, mixNote], ['Fixed shared platform', v.fixedPlatform, fixedNote], ['Unattributed AI', v.unattributed, unattrNote]];
  const maxAbs = Math.max(...steps.map((s) => Math.abs(s[1])), 1);
  const bridge = `<table class="bridge">
  <caption>${prev} to ${m}, AI spend (${signedUsd(v.change)})</caption>
  <thead class="visually-hidden"><tr><th scope="col">Step</th><th scope="col">Amount</th><th scope="col">Driver</th></tr></thead>
  <tbody>
    <tr class="bridge__end"><th scope="row">${prev}</th><td class="num">${usd(v.previous)}</td><td></td></tr>
    ${steps.map(([k, x, note]) => `<tr><th scope="row">${k}</th><td class="num">${signedUsd(x)}</td><td><span class="bridge__bar${x < 0 ? ' bridge__bar--neg' : ''}" style="width:${fixed((Math.abs(x) / maxAbs) * 100, 1)}%" aria-hidden="true"></span><span class="bridge__note">${note}</span></td></tr>`).join('\n    ')}
    <tr class="bridge__end"><th scope="row">${m}</th><td class="num">${usd(v.current)}</td><td></td></tr>
  </tbody>
</table>`;

  const al2 = vm.allocation[vm.month];
  const rec = vm.reconciliation;
  const unGroups = Object.keys(al2.unallocatedGroups);
  const controls = `<ul class="memo__checks">
    <li><strong>${pct(al2.ownedPct)} of spend has a named owner</strong> (${al2.stage}; target ${pct(al2.targets.walk)}); ${unGroups.map((g) => `<code>${esc(g)}</code>`).join(', ')} ${unGroups.length === 1 ? 'has' : 'have'} none.</li>
    <li><strong>Gateway metering explains ${pct(rec.totals.coverage)} of token-billed AI cost;</strong> ${rec.bypass.map((b) => `<code>${esc(b)}</code>`).join(', ')} ${rec.bypass.length === 1 ? 'is' : 'are'} billed with no gateway calls.</li>
  </ul>`;

  const order = ['scale', 'fix', 'stop'];
  const ucs = Object.keys(vm.useCases).sort((x, y) => order.indexOf(vm.decisions[x].decision) - order.indexOf(vm.decisions[y].decision));
  const cards = ucs.map((uc) => {
    const d = vm.decisions[uc];
    const u = vm.ue[vm.month][uc];
    const meta = vm.useCases[uc];
    return `<li class="decision decision--${d.decision}" data-uc="${uc}">
      <div class="decision__top">${dchip(d.decision)}<h4>${esc(meta.name)}</h4></div>
      <p class="decision__nums"><span><b>${unitUsd(u.avoidableCostPerSuccess)}</b> avoidable per ${esc(meta.outcomeNoun)}</span><span>value ${unitUsd(d.valuePerSuccess)}</span>${u.fixedSharedSpend > 0.5 * u.spend ? `<span>${unitUsd(u.costPerSuccess)} with the shared tier</span>` : ''}<span>${pct(u.successRate)} succeed (bar ${pct(d.qualityBar)})</span></p>
      <p class="decision__why">${decisionWhy(vm, uc)}</p>
    </li>`;
  }).join('\n');

  return `${lead}
  <div class="memo__grid">
    <div class="memo__why"><h3>Why it moved</h3>${bridge}</div>
    <div class="memo__controls"><h3>Control checks</h3>${controls}</div>
  </div>
  <h3 class="memo__dh">Decisions</h3>
  <ol class="decisions">${cards}</ol>`;
}

export function decisionWhy(vm, uc) {
  const d = vm.decisions[uc];
  const u = vm.ue[vm.month][uc];
  const levers = vm.levers.filter((l) => l.useCase === uc && l.check && !['on hold', 'blocked'].includes(l.status));
  const target = levers.length ? levers[levers.length - 1].check.target : null;
  // A large fixed share is reported with where it would go: stopping would not remove it.
  const re = vm.reallocation && vm.reallocation[uc];
  const big = u.fixedSharedSpend > 0.5 * u.spend && re && re.to.length;
  const moves = big ? ` Stopping would shift its search-tier share to the ${re.to.map((t) => esc(vm.useCases[t.useCase].name.toLowerCase())).join(' and ')} (${re.to.map((t) => `${unitUsd(t.from)} to ${unitUsd(t.to)} per ${esc(vm.useCases[t.useCase].outcomeNoun)}`).join(', ')}).` : '';
  if (d.decision === 'stop') {
    return `Avoidable cost is at or above its value.${moves} Stop, and right-size the shared tier.`;
  }
  if (d.decision === 'fix') {
    const bits = [];
    if (u.successRate < d.qualityBar) bits.push(`${pct(u.failedShareOfCost)} of cost went on failed or rejected runs`);
    if (d.ratio < vm.decisionRules.scaleFromValueToCost) bits.push(`value is only ${ratio(d.ratio)} avoidable cost`);
    const next = vm.levers.find((l) => l.useCase === uc && !['blocked', 'on hold'].includes(l.status) && l.saving !== null);
    const action = next ? next.name.charAt(0).toLowerCase() + next.name.slice(1) : 'find the cause';
    return (big ? `${bits.join(' and ')}.${moves} Fix retrieval; right-size the tier.` : `${bits.join(' and ')}. Next: ${esc(action)}.`).replace(/^./, (c) => c.toUpperCase());
  }
  return `Value is ${ratio(d.ratio)} avoidable cost; bar met.${target ? ` Levers below take it to ${unitUsd(target)}.` : ''}`;
}

// ---- index.html: unit economics chart, detail and table -------------------------------------
const LOG_MIN = -3; const LOG_MAX = 2;
const xPos = (v) => Math.max(0, Math.min(100, ((Math.log10(Math.max(v, 1e-6)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100));
const labPos = (p) => Math.max(7, Math.min(93, p));

export function renderUnitChart(vm, month, focus) {
  const ue = vm.ue[month];
  const ticks = [0.001, 0.01, 0.1, 1, 10, 100];
  const tickLabel = (t) => (t < 1 ? '$' + String(t) : '$' + fixed(t, 0));
  const rows = Object.keys(vm.useCases).map((uc) => {
    const u = ue[uc];
    const value = vm.decisions[uc].valuePerSuccess;
    const cost = u.avoidableCostPerSuccess;
    const d = month === vm.month ? vm.decisions[uc].decision : null;
    const xc = xPos(cost); const xv = xPos(value);
    const lo = Math.min(xc, xv); const w = Math.abs(xv - xc);
    const losing = cost >= value;
    const loaded = u.fixedSharedSpend > 0 ? `<span class="db-loaded" style="left:${fixed(xPos(u.costPerSuccess), 2)}%" title=""></span>` : '';
    return `<div class="db-row${uc === focus ? ' is-focus' : ''}" data-uc="${uc}">
      <div class="db-name">${d ? dchip(d) : ''}<span>${esc(vm.useCases[uc].name)}</span></div>
      <div class="db-track">
        <span class="db-link${losing ? ' db-link--loss' : ''}" style="left:${fixed(lo, 2)}%;width:${fixed(w, 2)}%"></span>
        ${loaded}<span class="db-dot db-dot--value" style="left:${fixed(xv, 2)}%"></span>
        <span class="db-dot db-dot--cost${losing ? ' db-dot--loss' : ''}" style="left:${fixed(xc, 2)}%"></span>
        <span class="db-lab db-lab--value" style="left:${fixed(labPos(xv), 2)}%">value ${unitUsd(value)}</span>
        <span class="db-lab db-lab--cost" style="left:${fixed(labPos(xc), 2)}%">avoidable ${unitUsd(cost)}</span>
      </div>
      <div class="db-fail"><span class="db-fail__track"><span class="db-fail__bar" style="width:${fixed(u.failedShareOfCost * 100, 1)}%"></span></span><span class="db-fail__txt">${pct(u.failedShareOfCost)} failed or rejected</span></div>
    </div>`;
  }).join('\n');
  return `<div class="db-head" aria-hidden="true"><span>Use case</span><span>Avoidable cost and value per successful outcome (log scale)</span><span>Share of cost on failed or rejected runs</span></div>
  <div class="db-body">
    <div class="db-grid" aria-hidden="true">${ticks.map((t) => `<span class="db-tick" style="left:${fixed(xPos(t), 2)}%"><span>${tickLabel(t)}</span></span>`).join('')}</div>
    ${rows}
  </div>`;
}

export function renderUnitDetail(vm, month, focus) {
  const u = vm.ue[month][focus];
  const meta = vm.useCases[focus];
  const shared = u.fixedSharedSpend > 0
    ? `its share of the fixed search tier is ${usd(u.fixedSharedSpend)} (${pct(u.fixedSharedSpend / u.spend)} of allocated cost), which stays if it stops; `
    : '';
  return `<strong>${esc(meta.name)}, ${monthName(month)}:</strong> P50 ${unitUsd(u.p50)} and P90 ${unitUsd(u.p90)} of daily avoidable cost per ${esc(meta.outcomeNoun)}; `
    + `${pct(u.failedShareOfCost)} of cost on failed or rejected runs; ${shared}cache hit rate ${pct(u.cacheHitRate)}; ${compact(u.tokensPerSuccess)} tokens per ${esc(meta.outcomeNoun)}.`;
}

export function renderUnitTable(vm, month, focus) {
  const ue = vm.ue[month];
  const rows = Object.keys(vm.useCases).map((uc) => {
    const u = ue[uc];
    const meta = vm.useCases[uc];
    return `<tr${uc === focus ? ' class="is-focus"' : ''} data-uc="${uc}">
      <th scope="row" data-label="Use case">${esc(meta.name)}<span class="sub">${esc(meta.ownerName)}</span></th>
      <td class="num" data-label="Allocated AI spend">${usd(u.spend)}</td>
      <td class="num" data-label="Successful outcomes">${int(u.successful)}<span class="sub">${esc(meta.outcomePlural || meta.outcomeNoun)}</span></td>
      <td class="num" data-label="Avoidable cost per outcome"><b>${unitUsd(u.avoidableCostPerSuccess)}</b></td>
      <td class="num" data-label="With shared tier">${u.fixedSharedSpend > 0 ? unitUsd(u.costPerSuccess) : '<span class="muted">same</span>'}</td>
      <td class="num" data-label="Daily P50 to P90">${unitUsd(u.p50)} to ${unitUsd(u.p90)}</td>
      <td class="num" data-label="Value per outcome">${unitUsd(vm.decisions[uc].valuePerSuccess)}</td>
      <td class="num" data-label="Failed or rejected">${pct(u.failedShareOfCost)}</td>
      <td class="num" data-label="Cache hit rate">${pct(u.cacheHitRate)}</td>
    </tr>`;
  }).join('\n');
  const total = sum(Object.values(ue).map((u) => u.spend));
  const fixedShared = sum(Object.values(ue).map((u) => u.fixedSharedSpend));
  const unattributed = vm.aiTotals[month] - total;
  return `<caption id="ue-caption">Unit economics, ${monthName(month)}. Illustrative: a made-up organisation. Avoidable cost is what stops if the use case stops (model tokens and embeddings); every run counts, including failed, retried and discarded ones. The daily range is of avoidable cost.</caption>
  <thead><tr><th scope="col">Use case</th><th scope="col" class="num">Allocated AI spend</th><th scope="col" class="num">Successful outcomes</th><th scope="col" class="num">Avoidable cost per outcome</th><th scope="col" class="num">With shared tier</th><th scope="col" class="num">Daily P50 to P90</th><th scope="col" class="num">Value per outcome</th><th scope="col" class="num">Failed or rejected</th><th scope="col" class="num">Cache hit rate</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><th scope="row" data-label="Total">Use-case AI spend</th><td class="num" data-label="Allocated AI spend">${usd(total)}</td><td colspan="7" class="tfoot-note" data-label="Note">includes ${usd(fixedShared)} of fixed shared platform (the AI Search tier, split by retrieval calls); unattributed AI (no use case) ${usd(unattributed)}; all AI spend ${usd(vm.aiTotals[month])}</td></tr></tfoot>`;
}

// ---- index.html: the savings pipeline ------------------------------------------------------
export function renderPipelineTotals(vm) {
  const t = vm.leverTotals;
  return `<div class="pt"><span class="pt__k">Measured</span><span class="pt__v">${usd(t.measured)}</span></div>
    <div class="pt"><span class="pt__k">With assumption-based</span><span class="pt__v">${usd(t.measuredAndAssumption)}</span></div>
    <div class="pt"><span class="pt__k">With Foundation priors</span><span class="pt__v">${usd(t.all)}</span></div>
    <div class="pt pt--real"><span class="pt__k">Realised in ${monthName(vm.month)}</span><span class="pt__v">${usd(t.realised)}</span></div>`;
}

function leverRow(vm, l) {
  const grade = l.grade ? `<span class="grade ${GRADE_CLASS[l.grade]}">${esc(l.grade)}</span>` : '<span class="grade grade--none">not graded</span>';
  const status = `<span class="status ${STATUS_CLASS[l.status] || ''}">${esc(l.status)}</span>`;
  const saving = l.saving === null ? '<span class="muted">not priced</span>' : l.status === 'blocked' || l.status === 'on hold' ? '<span class="muted">not counted</span>' : usd(l.saving);
  const check = l.check ? `${esc(l.check.metric)}: ${unitUsd(l.check.current)} now, ${unitUsd(l.check.target)} or less next bill` : '<span class="muted">none until priced</span>';
  const ways = l.waysRound ? `<ul class="ways">${l.waysRound.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
  const caution = l.caution ? `<span class="caution">${esc(l.caution)}</span>` : '';
  return `<tr data-lever="${l.id}">
    <th scope="row" data-label="Lever">${esc(l.name)}<span class="sub">Owner: ${esc(ownerNames(vm, l.owner))}</span></th>
    <td class="num" data-label="Saving a month">${saving}</td>
    <td data-label="Evidence">${grade}</td>
    <td data-label="Method">${esc(l.method)}${ways}<span class="gate">Gate: ${esc(l.qualityGate)}</span>${caution}</td>
    <td data-label="Next-bill check">${check}</td>
    <td data-label="Status">${status}</td>
  </tr>`;
}
const ownerNames = (vm, s) => String(s).split(',').map((x) => vm.owners[x.trim()] || x.trim()).join(', ');

// The commitment is bought at discounted rates, so it is the pay-as-you-go floor times (1 - d).
export function commitmentText(c) {
  const base = `${c.baselineDays} days of baseline, past the 60 to 90 days the Foundation asks for before committing. Production compute never fell below ${usd(c.computeFloorPerDay)} a day at pay-as-you-go rates (${unitUsd(c.computeFloorPerHour)} an hour) after the rightsizing above, so commit to that floor, not the mean.`;
  return c.commitmentPerHour === null
    ? `${base} A savings plan commits a discounted hourly amount: ${unitUsd(c.computeFloorPerHour)} \u00d7 (1 \u2212 d), where d is the discount Microsoft's savings plan recommendation gives for this SKU mix. d is not in this pack's sources, so the commitment stays a formula, not a number.`
    : `${base} At a ${pct(c.savingsPlanDiscount)} discount from Microsoft's recommendation for this SKU mix, commit ${unitUsd(c.commitmentPerHour)} an hour.`;
}

export function renderPipelineBody(vm, whatifRow) {
  const groups = [];
  for (const uc of Object.keys(vm.useCases)) {
    const ls = vm.levers.filter((l) => l.useCase === uc);
    if (ls.length) groups.push({ title: `${vm.useCases[uc].name}`, decision: vm.decisions[uc].decision, ls, uc });
  }
  const platform = vm.levers.filter((l) => !l.useCase && l.group === 'platform');
  if (platform.length) groups.push({ title: 'Shared AI platform', ls: platform, uc: 'platform' });
  groups.push({ title: 'Cloud estate', ls: vm.levers.filter((l) => !l.useCase && l.group !== 'platform'), uc: null });
  const c = vm.commitment;
  const commitRows = `<tr data-lever="compute-commitment">
    <th scope="row" data-label="Lever">Savings plan for the steady compute floor<span class="sub">Owner: Engineering</span></th>
    <td class="num" data-label="Saving a month"><span class="muted">not priced</span></td>
    <td data-label="Evidence"><span class="grade grade--measured">measured floor</span></td>
    <td data-label="Method">${commitmentText(c)}<span class="gate">Gate: rightsizing done first, then size to the new floor</span></td>
    <td data-label="Next-bill check">effective cost per compute hour falls</td>
    <td data-label="Status"><span class="status status--validated">recommended</span></td>
  </tr>
  <tr data-lever="ptu">
    <th scope="row" data-label="Lever">Provisioned throughput (PTU) for AI<span class="sub">Owner: Engineering</span></th>
    <td class="num" data-label="Saving a month"><span class="muted">not priced</span></td>
    <td data-label="Evidence"><span class="grade grade--none">not graded</span></td>
    <td data-label="Method">Not yet. Daily production tokens swing ${ratio(c.tokensMaxToMin)} between the quietest and busiest day and AI volume is still moving; PTU sizing needs the Foundry capacity calculator, so it is not priced.<span class="gate">Gate: a stable 60 to 90 day token baseline</span></td>
    <td data-label="Next-bill check">none</td>
    <td data-label="Status"><span class="status status--hold">not yet</span></td>
  </tr>`;
  return groups.map((g) => {
    const head = `<tr class="grp"><th colspan="6" scope="colgroup">${g.decision ? dchip(g.decision) + ' ' : ''}${esc(g.title)}</th></tr>`;
    const body = g.ls.map((l) => leverRow(vm, l)).join('\n');
    const extra = g.uc === 'support-assistant' && whatifRow ? whatifRow : '';
    const cloudExtra = g.uc === null ? commitRows : '';
    return head + body + extra + cloudExtra;
  }).join('\n') + (vm.stopLine ? `<tr class="grp grp--note"><td colspan="6" data-label="Not counted">Not counted above: stopping the ${esc(vm.useCases[vm.stopLine.useCase].name.toLowerCase())} would remove ${usd(vm.stopLine.monthlyCost)} a month of avoidable cost, and its value; its share of the fixed search tier would move to the other users. That is a decision for the owner, not a saving.</td></tr>` : '');
}

// The what-if form: static markup (works as a description without JS) plus computed outputs.
export function renderWhatifForm(vm) {
  const d = vm.whatif.defaults;
  const opt = (id, sel) => `<option value="${id}"${id === sel ? ' selected' : ''}>${id === 'none' ? 'None' : esc(modelLabel(vm, id))}</option>`;
  const range = (id, label, min, max, step, value, unit) => `<div class="wi-field"><label for="wi-${id}">${label}</label><div class="wi-range"><input type="range" id="wi-${id}" name="${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-scale="${unit === '%' ? 100 : 1}"><output for="wi-${id}" id="wi-${id}-out">${unit === '%' ? fixed(value, 0) + '%' : value}</output></div></div>`;
  const number = (id, label, min, max, step, value) => `<div class="wi-field"><label for="wi-${id}">${label}</label><input type="number" inputmode="decimal" id="wi-${id}" name="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  return `<form class="wi-form" id="wi-form" novalidate>
    <fieldset><legend>Model per step</legend>
      <div class="wi-field"><label for="wi-triageModel">Triage step</label><select id="wi-triageModel" name="triageModel">${['none', 'gpt-5.4-nano', 'gpt-5.4-mini'].map((x) => opt(x, d.triageModel)).join('')}</select></div>
      <div class="wi-field"><label for="wi-draftModel">Draft step, most tickets</label><select id="wi-draftModel" name="draftModel">${['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4'].map((x) => opt(x, d.draftModel)).join('')}</select></div>
      ${range('hardShare', 'Hard cases sent to GPT-5.4', 0, 100, 1, Math.round(d.hardShare * 100), '%')}
    </fieldset>
    <fieldset><legend>Tokens per draft</legend>
      ${number('inputTokens', 'Input tokens', 500, 100000, 100, d.inputTokens)}
      ${number('outputTokens', 'Output tokens', 50, 8000, 10, d.outputTokens)}
      ${range('cacheHitRate', 'Cache hit rate', 0, 90, 1, Math.round(d.cacheHitRate * 100), '%')}
      ${range('batchShare', 'Share sent by batch', 0, 100, 1, Math.round(d.batchShare * 100), '%')}
    </fieldset>
    <fieldset><legend>People and volume</legend>
      ${range('failureRate', 'Drafts not accepted', 0, 60, 1, Math.round(d.failureRate * 100), '%')}
      ${number('reviewMinutes', 'Review minutes per draft', 0, 15, 0.1, d.reviewMinutes)}
      ${number('costPerMinute', 'Loaded cost per agent minute ($)', 0, 3, 0.05, d.costPerMinute)}
      ${number('volume', 'Accepted drafts a month', 0, 1000000, 1000, d.volume)}
    </fieldset>
    <div class="wi-actions"><button type="reset" class="btn btn--ghost" id="wi-reset">Back to the ${monthName(vm.month)} defaults</button></div>
  </form>`;
}

export function renderWhatifOut(vm, r) {
  const share = r.reviewShare;
  const msg = share >= 0.5
    ? `Review time is ${pct(share)} of the cost of an accepted draft: a minute saved in review is worth more than any model lever.`
    : `The model bill is ${pct(1 - share)} of the cost of an accepted draft here, so token levers matter most.`;
  const modelW = r.totalPerSuccess > 0 ? (r.modelPerSuccess / r.totalPerSuccess) * 100 : 0;
  return `<dl class="wi-out">
    <div><dt>Model cost per accepted draft</dt><dd data-out="model">${unitUsd(r.modelPerSuccess)}</dd></div>
    <div><dt>Review time per accepted draft</dt><dd data-out="review">${unitUsd(r.reviewPerSuccess)}</dd></div>
    <div class="wi-out__total"><dt>Total per accepted draft</dt><dd data-out="total">${unitUsd(r.totalPerSuccess)}</dd></div>
    <div><dt>Model bill a month at ${int(r.inputs.volume)} drafts</dt><dd data-out="monthlyModel">${usd(r.monthlyModel)}</dd></div>
    <div><dt>With review time</dt><dd data-out="monthlyTotal">${usd(r.monthlyTotal)}</dd></div>
  </dl>
  <div class="wi-split" aria-hidden="true"><span class="wi-split__model" style="width:${fixed(modelW, 2)}%"></span><span class="wi-split__review" style="width:${fixed(100 - modelW, 2)}%"></span></div>
  <p class="wi-split__key" aria-hidden="true"><span class="k k--model">model</span> <span class="k k--review">review time</span></p>
  <p class="wi-msg" data-out="msg">${msg}</p>`;
}

export function renderWhatifCheck(vm) {
  const w = vm.whatif;
  return `At the ${monthName(vm.month)} defaults the model cost is ${unitUsd(w.base.modelPerSuccess)} per accepted draft at list price. The ledger's billed model-token cost is ${unitUsd(w.ledgerTokenCostPerSuccess)} (hard cases use longer prompts, and the bill carries the negotiated discount), and ${unitUsd(w.ledgerCostPerSuccess)} once embeddings and the shared search tier are added.`;
}

// ---- build.html ---------------------------------------------------------------------------
export function renderSummary60(vm) {
  const a = vm.ai; const al = vm.allocation[vm.month]; const rec = vm.reconciliation; const t = vm.leverTotals;
  const dec = Object.entries(vm.decisions).map(([uc, d]) => `${vm.useCases[uc].name}: ${d.decision}`).join('; ');
  return `<li><strong>Bill first.</strong> ${int(vm.generatedFrom.billedRows)} illustrative rows shaped like an Azure FOCUS export (FOCUS 1.2 names, normalised to 1.4) are the only cost the ledger allocates; ${int(vm.generatedFrom.metricRows)} gateway estimate rows decide shares and check the bill.</li>
    <li><strong>Reconciled.</strong> Gateway metering explains ${pct(rec.totals.coverage)} of token-billed AI cost (${pct(rec.totals.coverageOfAllAi)} of all AI spend: the AI Search tier is not token-billed and is split by retrieval calls). The ${usd(rec.totals.gap)} gap is ${usd(rec.totals.unmetered)} of unmetered usage less a ${usd(rec.totals.discount)} negotiated discount. One bypass found.</li>
    <li><strong>Owned.</strong> ${pct(al.ownedPct)} of ${usd(al.billedTotal)} has a named owner (${al.stage}); the unallocated rest stays visible.</li>
    <li><strong>Budgeted.</strong> AI spend ${usd(a.actual)} against ${usd(a.budget)} (${pct(a.pct)}); forecast alert ${longDate((a.alerts.find((x) => x.type === 'forecast') || {}).raisedOn)}.</li>
    <li><strong>Decided on avoidable cost.</strong> ${esc(dec)}. Savings pipeline ${usd(t.measured)} measured, ${usd(t.all)} with assumptions and priors, ${usd(t.realised)} realised in ${monthName(vm.month)}.</li>`;
}

export function renderRecon(vm) {
  const r = vm.reconciliation; const t = r.totals;
  const steps = [
    ['List-price estimate from metered tokens', t.estimate, 'base'],
    ['Unmetered usage, at list price', t.unmetered, 'up'],
    ['Negotiated discount', -t.discount, 'down'],
    ['Rounding residual', t.residual, 'flat'],
  ];
  const billedPriced = t.estimate + t.unmetered - t.discount + t.residual;
  const max = Math.max(t.estimate + t.unmetered, billedPriced);
  let run = 0;
  const bars = steps.map(([k, x, kind]) => {
    const start = kind === 'base' ? 0 : Math.min(run, run + x);
    const w = Math.abs(x);
    run = kind === 'base' ? x : run + x;
    return `<div class="wf-row"><span class="wf-k">${k}</span><span class="wf-track"><span class="wf-bar wf-bar--${kind}" style="left:${fixed((start / max) * 100, 2)}%;width:${fixed(Math.max(0.3, (w / max) * 100), 2)}%"></span></span><span class="wf-v num">${kind === 'base' ? usd(x) : signedUsd(x)}</span></div>`;
  }).join('') + `<div class="wf-row wf-row--total"><span class="wf-k">Billed (priced lines)</span><span class="wf-track"><span class="wf-bar wf-bar--total" style="left:0;width:${fixed((billedPriced / max) * 100, 2)}%"></span></span><span class="wf-v num">${usd(billedPriced)}</span></div>`;
  const rows = r.lines.map((l) => `<tr class="${l.status !== 'covered' ? 'is-flag' : ''}">
      <th scope="row" data-label="Billed line"><code>${esc(l.label)}</code><span class="sub">${esc(l.models.map((m) => modelLabel(vm, m)).join(', ') || 'Claude Sonnet 5.5 (CCU)')}</span></th>
      <td class="num" data-label="Billed">${usd(l.billed)}</td>
      <td class="num" data-label="Estimate">${l.estimate === null ? '<span class="muted">no price</span>' : usd(l.estimate)}</td>
      <td class="num" data-label="Unmetered">${signedUsd(l.unmetered)}</td>
      <td class="num" data-label="Discount">${l.discount ? signedUsd(-l.discount) : '$0'}</td>
      <td class="num" data-label="Coverage">${pct(l.coverage)}</td>
      <td data-label="Check"><span class="status ${l.status === 'bypass' ? 'status--blocked' : l.status === 'partial' ? 'status--hold' : 'status--realised'}">${l.status}</span></td>
    </tr>`).join('\n');
  return { waterfall: bars, table: `<caption>Token-billed AI lines, ${monthName(vm.month)}. Illustrative. Coverage is billed tokens the gateway metered (for the CCU line, the estimate's share of the bill), over token-billed AI cost only.</caption>
    <thead><tr><th scope="col">Billed line</th><th scope="col" class="num">Billed</th><th scope="col" class="num">Estimate</th><th scope="col" class="num">Unmetered</th><th scope="col" class="num">Discount</th><th scope="col" class="num">Coverage</th><th scope="col">Check</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><th scope="row" data-label="Total">All token-billed lines</th><td class="num" data-label="Billed">${usd(t.billed)}</td><td class="num" data-label="Estimate">${usd(t.estimate)}</td><td class="num" data-label="Unmetered">${signedUsd(t.unmetered)}</td><td class="num" data-label="Discount">${signedUsd(-t.discount)}</td><td class="num" data-label="Coverage">${pct(t.coverage)}</td><td data-label="Check">${r.priceMismatches} price mismatches</td></tr></tfoot>` };
}

export function renderAllocation(vm) {
  const months = vm.months;
  const methods = ['gateway-token-share', 'gateway-cost-share', 'retrieval-call-share', 'resource-tag', 'inherited-tag', 'unallocated'];
  const a = vm.allocation[vm.month];
  const rows = methods.map((k) => `<tr><th scope="row" data-label="Rule"><code>${k}</code></th><td class="num" data-label="${monthName(vm.month)}">${usd(a.byMethod[k] || 0)}</td><td class="num" data-label="Share">${pct((a.byMethod[k] || 0) / a.allocatedTotal, 1)}</td></tr>`).join('');
  const trend = months.map((m) => `<tr><th scope="row" data-label="Month">${monthName(m)}</th><td class="num" data-label="Total">${usd(vm.allocation[m].billedTotal)}</td><td class="num" data-label="With an owner">${pct(vm.allocation[m].ownedPct, 1)}</td><td data-label="Stage">${vm.allocation[m].stage}</td></tr>`).join('');
  return { methods: `<caption>How ${monthName(vm.month)}'s bill was allocated. Illustrative.</caption><thead><tr><th scope="col">Rule (AllocatedMethodId)</th><th scope="col" class="num">Cost</th><th scope="col" class="num">Share</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row" data-label="Total">Total</th><td class="num" data-label="Cost">${usd(a.allocatedTotal)}</td><td class="num" data-label="Share">equals the bill</td></tr></tfoot>`,
    trend: `<caption>Share of spend with a named owner against Crawl ${pct(a.targets.crawl)}, Walk ${pct(a.targets.walk)} and Run (over ${pct(a.targets.run)}). Illustrative.</caption><thead><tr><th scope="col">Month</th><th scope="col" class="num">Total bill</th><th scope="col" class="num">With an owner</th><th scope="col">Stage</th></tr></thead><tbody>${trend}</tbody>` };
}

export function renderOwnerBudgets(vm) {
  const max = Math.max(...vm.ownerBudgets.map((o) => Math.max(o.actual, o.budget))) * 1.08;
  const bars = vm.ownerBudgets.map((o) => {
    const over = o.actual > o.budget;
    return `<div class="bb-row${over ? ' is-over' : ''}">
      <span class="bb-name">${esc(o.name)}${o.id === 'fincrime' ? '<span class="sub">budget at CCU meter scope</span>' : ''}</span>
      <span class="bb-track">
        <span class="bb-bar" style="width:${fixed((o.actual / max) * 100, 2)}%"></span>
        <span class="bb-tick bb-tick--80" style="left:${fixed(((o.budget * 0.8) / max) * 100, 2)}%"></span>
        <span class="bb-tick bb-tick--100" style="left:${fixed((o.budget / max) * 100, 2)}%"></span>
      </span>
      <span class="bb-val num">${usd(o.actual)} of ${usd(o.budget)}<b class="${over ? 'warn' : ''}">${pct(o.pct)}</b></span>
    </div>`;
  }).join('');
  const rows = vm.ownerBudgets.map((o) => {
    const a = Object.fromEntries(o.alerts.map((x) => [x.type + x.threshold, x]));
    return `<tr${o.actual > o.budget ? ' class="is-flag"' : ''}><th scope="row" data-label="Owner">${esc(o.name)}</th><td class="num" data-label="Baseline">${usd(o.baseline)}</td><td class="num" data-label="Budget">${usd(o.budget)}</td><td class="num" data-label="Actual">${usd(o.actual)}</td><td class="num" data-label="Of budget">${pct(o.pct)}</td><td data-label="Forecast 100%">${shortDate(a.forecast1 && a.forecast1.raisedOn)}</td><td data-label="Actual 80%">${shortDate(a['actual0.8'] && a['actual0.8'].raisedOn)}</td><td data-label="Actual 100%">${shortDate(a.actual1 && a.actual1.raisedOn)}</td></tr>`;
  }).join('');
  return { bars, table: `<caption>AI budgets by owner, ${monthName(vm.month)}: 115% of the two-month baseline, with the day each alert would be raised. Illustrative.</caption><thead><tr><th scope="col">Owner</th><th scope="col" class="num">Baseline</th><th scope="col" class="num">Budget</th><th scope="col" class="num">Actual</th><th scope="col" class="num">Of budget</th><th scope="col">Forecast 100%</th><th scope="col">Actual 80%</th><th scope="col">Actual 100%</th></tr></thead><tbody>${rows}</tbody>` };
}

function burnSvg(vm, o) {
  const { W, H, L, R, T, B, fs, id, short } = o;
  const p = vm.ai.path;
  const n = p.length;
  const budget = vm.ai.budget;
  const top = Math.max(budget, ...p.map((x) => Math.max(x[1], x[2], x[3])));
  const step = top > 40000 ? 10000 : top > 16000 ? 5000 : 2000;
  const ymax = Math.ceil((top * 1.18) / step) * step;
  const x = (i) => L + (i / (n - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / ymax) * (H - T - B);
  const f1 = (v) => fixed(v, 1).replace(/,/g, '');
  const line = (k) => p.map((row, i) => `${i ? 'L' : 'M'}${f1(x(i))},${f1(y(row[k]))}`).join(' ');
  const yt = []; for (let v = 0; v <= ymax + 1e-9; v += step) yt.push(v);
  const al = Object.fromEntries(vm.ai.alerts.map((a) => [a.type + a.threshold, a]));
  // Alert labels sit in the band above the lines, each with a guide down to its point.
  const marks = [[al.forecast1, short ? 'forecast' : 'forecast alert', 2], [al['actual0.8'], short ? '80%' : '80% actual', 1], [al.actual1, short ? '100%' : '100% actual', 1]]
    .filter(([a]) => a && a.crossedOn).map(([a, label, k]) => { const i = p.findIndex((row) => row[0] === a.crossedOn); return { i, label, px: x(i), py: y(p[i][k]) }; });
  const bandY = T + fs * 0.9;
  const wid = (t) => t.length * fs * 0.56;
  const gapOf = (m1, m2) => (wid(m1.label) + wid(m2.label)) / 2 + fs * 0.6;
  marks.sort((m1, m2) => m1.px - m2.px);
  marks.forEach((m, k) => { m.lx = Math.max(m.px, L + wid(m.label) / 2, k ? marks[k - 1].lx + gapOf(marks[k - 1], m) : -Infinity); });
  for (let k = marks.length - 1; k >= 0; k--) {
    const cap = k === marks.length - 1 ? W - R - wid(marks[k].label) / 2 : marks[k + 1].lx - gapOf(marks[k], marks[k + 1]);
    if (marks[k].lx > cap) marks[k].lx = cap;
  }
  const alerts = marks.map((m) => `<g class="burn__alert"><line x1="${f1(m.px)}" x2="${f1(m.px)}" y1="${f1(bandY + fs * 0.4)}" y2="${f1(m.py - 7)}"/><circle cx="${f1(m.px)}" cy="${f1(m.py)}" r="${f1(fs * 0.42)}"/><text x="${f1(m.lx)}" y="${f1(bandY)}" text-anchor="middle">${m.label}</text></g>`).join('');
  // End labels on the right, spread so they never overlap.
  const ends = [
    { cls: 'act', text: `actual ${usd(p[n - 1][1])}`, y: y(p[n - 1][1]) },
    { cls: 'budget', text: `budget ${usd(budget)}`, y: y(budget) },
    { cls: 'fc', text: 'forecast', y: y(p[n - 1][2]) },
    { cls: '80', text: `80% ${usd(budget * 0.8)}`, y: y(budget * 0.8) },
  ].sort((a, b) => a.y - b.y);
  const gap = fs * 1.25;
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < gap) ends[k].y = ends[k - 1].y + gap;
  const endLabels = ends.map((e) => `<text class="burn__lab burn__lab--${e.cls}" x="${W - R + 8}" y="${f1(e.y + fs * 0.35)}">${e.text}</text>`).join('');
  const xticks = n >= 31 ? [0, 9, 19, 30] : [0, Math.floor((n - 1) / 2), n - 1];
  return `<svg class="burn burn--${id}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="burn-title-${id} burn-desc-${id}" style="font-size:${fs}px">
    <title id="burn-title-${id}">Daily burn against budget, ${monthName(vm.month)}. Illustrative.</title>
    <desc id="burn-desc-${id}">Cumulative AI spend, the month-end forecast made each day from drivers, a trailing-mean cross-check, and the budget with its 80% line. The table after the chart has every value.</desc>
    ${yt.map((v) => `<g class="burn__grid"><line x1="${L}" x2="${W - R}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text x="${L - 6}" y="${f1(y(v) + fs * 0.35)}" text-anchor="end">${v === 0 ? '$0' : '$' + fixed(v / 1000, 0) + 'k'}</text></g>`).join('')}
    ${xticks.map((i) => `<text class="burn__xt" x="${f1(x(i))}" y="${H - B + fs * 1.4}" text-anchor="middle">${shortDate(p[i][0])}</text>`).join('')}
    <line class="burn__80" x1="${L}" x2="${W - R}" y1="${f1(y(budget * 0.8))}" y2="${f1(y(budget * 0.8))}"/>
    <line class="burn__budget" x1="${L}" x2="${W - R}" y1="${f1(y(budget))}" y2="${f1(y(budget))}"/>
    <path class="burn__tm" d="${line(3)}"/>
    <path class="burn__fc" d="${line(2)}"/>
    <path class="burn__act" d="${line(1)}"/>
    ${alerts}
    ${endLabels}
  </svg>`;
}

export function renderBurn(vm) {
  const p = vm.ai.path;
  const svg = burnSvg(vm, { W: 760, H: 330, L: 52, R: 142, T: 30, B: 30, fs: 13, id: 'wide' })
    + burnSvg(vm, { W: 380, H: 330, L: 40, R: 104, T: 30, B: 30, fs: 13, id: 'narrow', short: true });
  const legend = '<p class="burn__key" aria-hidden="true"><span class="k k--act">actual to date</span><span class="k k--fc">month-end forecast, as it stood each day</span><span class="k k--tm">trailing-mean cross-check</span><span class="k k--al">alert raised next day</span></p>';
  const rows = p.map((r) => `<tr><th scope="row" data-label="Day">${shortDate(r[0])}</th><td class="num" data-label="Actual to date">${usd(r[1])}</td><td class="num" data-label="Driver forecast">${usd(r[2])}</td><td class="num" data-label="Trailing-mean check">${usd(r[3])}</td></tr>`).join('');
  return { svg: svg + legend, table: `<caption>Daily values behind the chart. Illustrative.</caption><thead><tr><th scope="col">Day</th><th scope="col" class="num">Actual to date</th><th scope="col" class="num">Driver forecast</th><th scope="col" class="num">Trailing-mean check</th></tr></thead><tbody>${rows}</tbody>` };
}

export function renderVarianceTable(vm) {
  const v = vm.variance;
  const rows = v.rows.map((r) => `<tr><th scope="row" data-label="Use case">${esc(vm.useCases[r.useCase].name)}</th><td class="num" data-label="${monthName(vm.previousMonth)}">${usd(r.previous)}</td><td class="num" data-label="Volume">${signedUsd(r.volume)}</td><td class="num" data-label="Price">${signedUsd(r.price)}</td><td class="num" data-label="Mix">${signedUsd(r.mix)}</td><td class="num" data-label="${monthName(vm.month)}">${usd(r.current)}</td></tr>`).join('');
  const bucket = (kind) => v.otherByResource.filter((o) => o.kind === kind).map((o) => `<code>${esc(o.resource)}</code>`).join(', ') || 'none';
  return `<caption>Avoidable AI cost by use case (model tokens and embeddings), ${monthName(vm.previousMonth)} to ${monthName(vm.month)}, and the two buckets runs do not drive. Illustrative.</caption><thead><tr><th scope="col">Use case</th><th scope="col" class="num">${monthName(vm.previousMonth)}</th><th scope="col" class="num">Volume</th><th scope="col" class="num">Price</th><th scope="col" class="num">Mix</th><th scope="col" class="num">${monthName(vm.month)}</th></tr></thead><tbody>${rows}</tbody>
  <tfoot><tr><th scope="row" data-label="Bucket">Fixed shared platform</th><td class="num" data-label="${monthName(vm.previousMonth)}">${usd(v.fixedPrevious)}</td><td colspan="3" data-label="Change">${signedUsd(v.fixedPlatform)}: ${bucket('fixed')}, a fixed daily charge split by retrieval calls</td><td class="num" data-label="${monthName(vm.month)}">${usd(v.fixedCurrent)}</td></tr>
  <tr><th scope="row" data-label="Bucket">Unattributed AI</th><td class="num" data-label="${monthName(vm.previousMonth)}">${usd(v.unattributedPrevious)}</td><td colspan="3" data-label="Change">${signedUsd(v.unattributed)}: ${bucket('unattributed')}, billed AI with no use case</td><td class="num" data-label="${monthName(vm.month)}">${usd(v.unattributedCurrent)}</td></tr></tfoot>`;
}

export function renderCompare(vm) {
  const c = vm.compare;
  const max = Math.max(...c.rows.map((r) => r.costPerTask)) * 1.1;
  const bars = c.rows.map((r) => `<div class="cmp-row">
      <span class="cmp-name">${esc(r.label)}<span class="sub">${esc(r.host)}</span></span>
      <span class="cmp-track"><span class="cmp-bar" style="width:${fixed((r.costPerTask / max) * 100, 2)}%"></span></span>
      <span class="cmp-val num">${taskUsd(r.costPerTask)}</span>
    </div>`).join('');
  const rows = c.rows.map((r) => `<tr><th scope="row" data-label="Model">${esc(r.label)}</th><td class="num" data-label="Input per 1M">${unitUsd(r.inputPrice)}</td><td class="num" data-label="Output per 1M">${unitUsd(r.outputPrice)}</td><td class="num" data-label="Cost per task">${taskUsd(r.costPerTask)}</td><td data-label="Token counts">${r.measured ? 'measured on this model at the gateway' : 'Claude counts reused; to be metered on the same documents'}</td></tr>`).join('');
  return { bars, table: `<caption>Cost per ${esc(c.task.name)} at list prices, uncached, every model at the same counts: ${int(c.task.inputTokens)} input and ${int(c.task.outputTokens)} output tokens (October average on Claude). Illustrative; prices read 3 November 2026.</caption><thead><tr><th scope="col">Model</th><th scope="col" class="num">Input per 1M</th><th scope="col" class="num">Output per 1M</th><th scope="col" class="num">Cost per task</th><th scope="col">Token counts</th></tr></thead><tbody>${rows}</tbody>` };
}

export function renderCommitment(vm) {
  const c = vm.commitment;
  const moving = vm.variance.rows.filter((r) => r.runsPrevious).sort((a, b) => Math.abs(b.runsCurrent / b.runsPrevious - 1) - Math.abs(a.runsCurrent / a.runsPrevious - 1))[0];
  return `<li><strong>Baseline:</strong> ${c.baselineDays} days of daily cost, past the 60 to 90 days the Foundation asks for before committing.</li>
    <li><strong>Commit to the floor, not the mean, at discounted rates.</strong> Production compute (AKS and VMs, after the rightsizing lever) never fell below ${usd(c.computeFloorPerDay)} a day at pay-as-you-go rates (${unitUsd(c.computeFloorPerHour)} an hour), against a mean of ${usd(c.computeMeanPerDay)}. A savings plan commits a discounted hourly amount, so the commitment is ${unitUsd(c.computeFloorPerHour)} \u00d7 (1 \u2212 d)${c.commitmentPerHour === null ? ", where d is the discount Microsoft's savings plan recommendation gives for this SKU mix; it is not in this pack's sources, so it is a parameter in <code>org.json</code>, not a number here" : ` = ${unitUsd(c.commitmentPerHour)} an hour at d = ${pct(c.savingsPlanDiscount)}`}. Microsoft's own order is rightsize first, then reservations for stable workloads, then savings plans.</li>
    <li><strong>No PTU yet.</strong> Daily production tokens swing ${ratio(c.tokensMaxToMin)} between the quietest and busiest day (P90 ${ratio(c.tokensP90toP50)} the median)${moving ? `, and ${esc(vm.useCases[moving.useCase].name)} runs moved ${pct(Math.abs(moving.runsCurrent / moving.runsPrevious - 1))} in a month` : ''}. Provisioned throughput pays only when it is busy; sizing it needs the Foundry capacity calculator, so it is not priced here.</li>`;
}

export const _test = { xPos };

export function renderUnitCaption(vm, month) {
  return `Avoidable cost per successful outcome against its value, ${monthName(month)}. Log scale: each gridline is ten times the last. Decisions are for ${monthName(vm.month)}.`;
}

export function renderWhatifRow(vm) {
  return `<tr class="wi-row"><td colspan="6" data-label="What-if">
    <details class="wi" id="whatif">
      <summary>Try the support assistant's levers: what one accepted draft really costs</summary>
      <div class="wi__body">
        <p class="wi__note"><span class="badge badge--illus">Illustrative</span> Defaults are the support assistant as measured in ${monthName(vm.month)}; prices are <span data-src="S11">Azure list prices read on 3 November 2026 <a class="cite" href="build.html#src-S11">S11</a></span>.</p>
        <p class="nojs-note">Turn on JavaScript to change the inputs; the result below is for the ${monthName(vm.month)} defaults.</p>
        <div class="wi__grid">
          <div class="js-only">${renderWhatifForm(vm)}</div>
          <div class="wi__result" aria-live="polite" data-region="wi-out">${renderWhatifOut(vm, vm.whatif.base)}</div>
        </div>
        <p class="wi-check">${renderWhatifCheck(vm)}</p>
      </div>
    </details>
  </td></tr>`;
}

// Tables become cards on small screens (display: block), which can drop table semantics in some
// browsers, so every table part carries its ARIA role explicitly. Idempotent.
export function tableRoles(html) {
  return html
    .replace(/<table(?![^>]*\brole=)/g, '<table role="table"')
    .replace(/<(thead|tbody|tfoot)(?![^>]*\brole=)(?=[\s>])/g, '<$1 role="rowgroup"')
    .replace(/<tr(?![^>]*\brole=)(?=[\s>])/g, '<tr role="row"')
    .replace(/<th(?![^>]*\brole=)([^>]*\bscope="col")/g, '<th role="columnheader"$1')
    .replace(/<th(?![^>]*\brole=)([^>]*\bscope="(?:row|colgroup)")/g, '<th role="rowheader"$1')
    .replace(/<td(?![^>]*\brole=)(?=[\s>])/g, '<td role="cell"');
}

// Each labelled cell's content sits in one wrapper, so the card layout has exactly two columns:
// the label and the value. Idempotent.
export function wrapCells(html) {
  return html.replace(/<td([^>]*\bdata-label="(?!What-if")[^"]*"[^>]*)>(?!<div class="v">)([\s\S]*?)<\/td>/g, '<td$1><div class="v">$2</div></td>');
}

export function finish(html) { return tableRoles(wrapCells(html)); }
