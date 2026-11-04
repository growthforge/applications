// levers.js: the optimisation pipeline, priced from the ledger.
//
// Each lever has an eligible cost (what it can touch), an effect (the share of that cost it
// removes), a method and an evidence grade:
//   measured           arithmetic on measured quantities only
//   assumption-based   price-sheet arithmetic on an assumed share or rate (the assumption is shown)
//   Foundation prior   the low end of a FinOps Foundation range [S3], until a test measures it
// Within a use case the levers run in order, each on the cost left by the ones before it, so the
// pipeline never adds independent percentages. A saving can never exceed its eligible cost, and the
// eligible cost can never exceed what remains. The next-bill check is on unit cost (cost per
// successful outcome), not the total bill, because volume moves the total for other reasons.
// A lever can be marked validated or realised only when its evidence is measured; anything priced
// on an assumption or a Foundation prior stays identified until a test measures it.
import { priceOn } from './normalise.js';
import { datesOfMonth, prevMonth } from './dates.js';
import { num } from './csv.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Automatic prompt caching: raising the hit rate from h to target, where cached input bills at
// (1 - disc) of the input price, saves this share of input cost.
export function cacheLeverEffect(h, target, disc) {
  const a = clamp01(h); const b = Math.max(a, clamp01(target)); const d = clamp01(disc);
  return 1 - d * a > 0 ? (d * (b - a)) / (1 - d * a) : 0;
}

export function gradeOf(lever) {
  const e = lever.effect.kind;
  const g = lever.eligible.kind;
  if (e === 'prior') return 'Foundation prior';
  if (e === 'none') return null;
  if ((e === 'measured' || e === 'price-sheet') && (g === 'measured')) return 'measured';
  return 'assumption-based';
}

// Apply one lever to the remaining components of a scope. Returns { eligible, saving }.
// remaining = { input, output, hard: { input, output } }, where hard is the part of input and output
// on the hard-case path (a subset). Components: 'input', 'output', 'all' or 'hard-path'.
export function applyStep(remaining, component, share, effect) {
  const s = clamp01(share);
  const f = clamp01(effect);
  remaining.hard ??= { input: 0, output: 0 };
  const cutFrom = (k, cut, onHard) => {
    const before = remaining[k];
    remaining[k] = Math.max(0, before - cut);
    if (onHard) remaining.hard[k] = Math.max(0, remaining.hard[k] - cut);
    else if (before > 0) remaining.hard[k] *= remaining[k] / before;   // the hard path shrinks in proportion
  };
  let eligible = 0;
  if (component === 'input' || component === 'output') {
    eligible = remaining[component] * s;
    cutFrom(component, eligible * f, false);
  } else {
    const onHard = component === 'hard-path';
    const pool = onHard ? remaining.hard : remaining;
    const base = pool.input + pool.output;
    eligible = base * s;
    const ki = base ? pool.input / base : 0;
    const cut = eligible * f;
    cutFrom('input', cut * ki, onHard);
    cutFrom('output', cut * (1 - ki), onHard);
  }
  return { eligible, saving: eligible * f };
}

// Token cost components of a use case in a month: input and output, and the part on the hard path.
function components(allocated, uc, month, hardDeployment) {
  const rows = allocated.filter((r) => r.x_Month === month && r.x_UseCase === uc && r.ServiceCategory === 'AI and Machine Learning'
    && r.AllocatedMethodId !== 'retrieval-call-share' && r.x_ModelId !== 'text-embedding');
  const tokenRows = rows.filter((r) => r.x_TokenDirection);
  const ccuRows = rows.filter((r) => !r.x_TokenDirection);
  const c = { input: 0, output: 0, hard: { input: 0, output: 0 } };
  for (const r of tokenRows) {
    const k = r.x_TokenDirection === 'Output' ? 'output' : 'input';
    c[k] += r.EffectiveCost;
    if (r.x_Deployment === hardDeployment) c.hard[k] += r.EffectiveCost;
  }
  return { c, ccu: sum(ccuRows.map((r) => r.EffectiveCost)) };
}

// For a CCU-billed use case, split its billed cost into input and output by the gateway estimate.
function ccuSplit(gw, uc, month, total) {
  const g = gw.filter((x) => x.x_Month === month && x.x_UseCase === uc);
  const inp = sum(g.filter((x) => x.x_TokenDirection === 'Input').map((x) => x.ListCost || 0));
  const out = sum(g.filter((x) => x.x_TokenDirection === 'Output').map((x) => x.ListCost || 0));
  const t = inp + out;
  return t ? { input: total * (inp / t), output: total * (out / t) } : { input: total, output: 0 };
}

export const PROVEN_STATUSES = ['validated', 'realised'];

export function statusFor(lever, grade) {
  return PROVEN_STATUSES.includes(lever.status) && grade !== 'measured' ? 'identified' : lever.status;
}

// Prompt tokens per call for a use case in a month, from the gateway metrics (embeddings excluded).
export function promptTokensPerCall(metrics, uc, month) {
  const rows = metrics.filter((m) => m.use_case === uc && m.date.slice(0, 7) === month && m.model !== 'text-embedding');
  const calls = sum(rows.map((m) => num(m.requests) || 0));
  return calls ? sum(rows.map((m) => num(m.input_tokens) || 0)) / calls : 0;
}

export function priceLevers({ levers, allocated, billed, gw, metrics = [], outcomes, prices, org, ue, decisions, vmUtil, month }) {
  const out = [];
  const byUc = {};
  for (const l of levers.slice().sort((a, b) => (a.useCase || a.resource || '').localeCompare(b.useCase || b.resource || '') || a.order - b.order)) {
    const grade = gradeOf(l);
    const row = { id: l.id, name: l.name, useCase: l.useCase || null, resource: l.resource || null, group: l.group || (l.useCase ? 'use-case' : 'cloud'),
      owner: l.owner, status: statusFor(l, grade), statusInData: l.status,
      qualityGate: l.qualityGate, caution: l.caution || null, grade, eligibleText: l.eligible.text, effectText: l.effect.text,
      effectSrc: l.effect.src || null, range: l.effect.range || null, saving: null, eligibleCost: null, effect: null, method: '', check: null, waysRound: l.waysRound || null };
    if (l.useCase) {
      const u = ue[l.useCase];
      if (!byUc[l.useCase]) {
        const { c, ccu } = components(allocated, l.useCase, month, 'gpt-support-hard');
        if (ccu) { const s = ccuSplit(gw, l.useCase, month, ccu); c.input += s.input; c.output += s.output; }
        byUc[l.useCase] = { remaining: c, start: c.input + c.output, saved: 0 };
      }
      const scope = byUc[l.useCase];
      const decision = decisions && decisions[l.useCase] ? decisions[l.useCase].decision : null;
      if (l.onlyIfDecision && decision && !l.onlyIfDecision.includes(decision)) {
        row.status = 'on hold';
        row.method = `On hold: the use case is marked ${decision}.`;
        out.push(row); continue;
      }
      let share = 1; let effect = 0;
      if (l.type === 'blocked') {
        row.saving = 0; row.method = 'Blocked: ' + l.effect.text + '.';
        out.push(row); continue;
      } else if (l.type === 'routing' || l.type === 'prior' || l.type === 'batch') {
        share = l.eligible.value ?? 1;
        effect = l.effect.point ?? l.effect.value;
      } else if (l.type === 'cache-azure') {
        // The achievable hit rate is bounded by the stable prefix: only the tokens that are identical
        // on every call can be served from cache.
        const h = clamp01(u.cacheHitRate);
        const perCall = promptTokensPerCall(metrics, l.useCase, month);
        const target = Math.max(h, clamp01(perCall ? l.stablePrefixTokens / perCall : 0));
        row.promptTokensPerCall = perCall; row.stablePrefixTokens = l.stablePrefixTokens;
        const miniIn = priceOn(prices, 'gpt-5.4-mini', 'input', datesOfMonth(month).slice(-1)[0]);
        const miniCached = priceOn(prices, 'gpt-5.4-mini', 'cachedInput', datesOfMonth(month).slice(-1)[0]);
        const disc = 1 - miniCached.usdPerMTok / miniIn.usdPerMTok;    // 0.9 on the GPT-5.4 family
        effect = cacheLeverEffect(h, target, disc);
        row.measuredHitRate = h; row.targetHitRate = target; row.cacheDiscount = disc;
      } else if (l.type === 'failure') {
        const base = outcomes.filter((o) => o.use_case === l.useCase && (o.date.slice(0, 7) === prevMonth(month, 1) || o.date.slice(0, 7) === prevMonth(month, 2)));
        const now = outcomes.filter((o) => o.use_case === l.useCase && o.date.slice(0, 7) === month);
        const f = (rows) => { const r = sum(rows.map((o) => num(o.runs))); return r ? sum(rows.map((o) => num(o.failed))) / r : 0; };
        const excess = Math.max(0, f(now) - f(base));
        share = excess;                                // share of remaining cost spent on excess failures
        effect = l.effect.value;
        row.failureRateBaseline = f(base); row.failureRateNow = f(now);
      }
      const step = applyStep(scope.remaining, l.component, share, effect);
      scope.saved += step.saving;
      row.eligibleCost = step.eligible; row.saving = step.saving; row.effect = effect;
      const after = (u.avoidableSpend - scope.saved) / u.successful;
      row.check = { metric: 'avoidable cost per ' + org.useCases[l.useCase].outcomeNoun, current: u.avoidableCostPerSuccess, target: after };
      row.method = methodText(l, row);
    } else if (l.type === 'schedule') {
      const lines = billed.filter((r) => r.ResourceName === l.resource);
      const days = datesOfMonth(month);
      const before = lines.filter((r) => r.x_Month === prevMonth(month, 1));
      const meanBefore = before.length ? sum(before.map((r) => r.EffectiveCost)) / before.length : 0;
      const afterRows = lines.filter((r) => r.x_Date >= l.changedOn && r.x_Month === month);
      const meanAfter = afterRows.length ? sum(afterRows.map((r) => r.EffectiveCost)) / afterRows.length : meanBefore;
      row.eligibleCost = meanBefore * days.length;
      row.saving = Math.max(0, meanBefore - meanAfter) * days.length;
      row.effect = row.eligibleCost ? row.saving / row.eligibleCost : 0;
      row.realised = sum(afterRows.map((r) => Math.max(0, meanBefore - r.EffectiveCost)));
      row.expectedOffShare = l.hoursOffPerWeek / 168;
      row.check = { metric: 'non-production cluster cost per day', current: meanBefore, target: meanAfter };
      row.method = `Measured from the bill: mean daily cost ${fmt(meanBefore)} in ${monthLabel(prevMonth(month, 1))}, ${fmt(meanAfter)} from the change; ${Math.round(row.expectedOffShare * 100)}% of hours are scheduled off.`;
    } else if (l.type === 'rightsize') {
      const low = new Set(vmUtil.filter((v) => v.month === month && num(v.p95_cpu_pct) < l.cpuThresholdPct).map((v) => v.resource));
      const cost = sum(billed.filter((r) => r.x_Month === month && low.has(r.ResourceName)).map((r) => r.EffectiveCost));
      row.eligibleCost = cost; row.effect = l.effect.value; row.saving = cost * l.effect.value;
      row.resources = [...low];
      row.check = { metric: 'cost per VM-day', current: cost / Math.max(1, low.size) / datesOfMonth(month).length, target: (cost * (1 - l.effect.value)) / Math.max(1, low.size) / datesOfMonth(month).length };
      row.method = `Assumption-based: ${low.size} VMs (${[...low].join(', ')}) under ${l.cpuThresholdPct}% P95 CPU all month; ${l.effect.text}.`;
    } else if (l.type === 'unpriced') {
      row.saving = null;
      row.method = 'Not priced: ' + l.effect.text + '.';
    }
    out.push(row);
  }
  const counted = out.filter((r) => r.saving !== null && !['on hold', 'blocked'].includes(r.status));
  const by = (g) => sum(counted.filter((r) => r.grade === g).map((r) => r.saving));
  const totals = {
    measured: by('measured'),
    assumption: by('assumption-based'),
    prior: by('Foundation prior'),
  };
  totals.measuredAndAssumption = totals.measured + totals.assumption;
  totals.all = totals.measuredAndAssumption + totals.prior;
  totals.realised = sum(out.filter((r) => r.status === 'realised').map((r) => r.realised || 0));
  const scopes = Object.fromEntries(Object.entries(byUc).map(([k, v]) => [k, { start: v.start, saved: v.saved }]));
  return { levers: out, totals, scopes };
}

function fmt(x) { return '$' + Math.round(x).toLocaleString('en-GB'); }
function monthLabel(m) { return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m.slice(5, 7)) - 1]; }

function methodText(l, row) {
  const pct = (x) => (Math.round(x * 1000) / 10).toString().replace(/\.0$/, '') + '%';
  if (l.type === 'cache-azure') {
    const n = (x) => Math.round(x).toLocaleString('en-GB');
    return `Assumption-based: hit rate ${pct(row.measuredHitRate)} measured; the stable ${n(row.stablePrefixTokens)}-token prefix is ${pct(row.targetHitRate)} of the average ${n(row.promptTokensPerCall)}-token prompt, so at most ${pct(row.targetHitRate)} of input can hit. Cached input at ${pct(1 - row.cacheDiscount)} of the input price then saves ${pct(row.effect)} of input cost.`;
  }
  if (l.type === 'failure') {
    return `Assumption-based: failure rate ${pct(row.failureRateNow)} against ${pct(row.failureRateBaseline)} in the two prior months (measured); ${l.effect.text}.`;
  }
  if (l.effect.kind === 'prior') {
    const share = l.eligible.value !== undefined ? `${pct(l.eligible.value)} of the path eligible (assumption); ` : '';
    return `Foundation prior: ${share}${pct(l.effect.range[0])} to ${pct(l.effect.range[1])} range, counted at ${pct(l.effect.point)}.`;
  }
  if (l.type === 'batch') return `Assumption-based: ${l.eligible.text}; ${l.effect.text}.`;
  return '';
}
