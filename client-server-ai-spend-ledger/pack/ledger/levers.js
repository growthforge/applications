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
import { isAi, FIXED_METHODS } from './allocate.js';

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
  const rows = allocated.filter((r) => r.x_Month === month && r.x_UseCase === uc && isAi(r)
    && !FIXED_METHODS.includes(r.AllocatedMethodId) && r.x_ModelId !== 'text-embedding');
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

const retail = (prices, key) => ((prices.azureRetail && prices.azureRetail.rows) || []).find((r) => r.key === key) || null;
const NEXT_DOWN = { 'D16s v5': 'd8s-v5', 'D8s v5': 'd4s-v5' };
const SKU_KEY = { 'D16s v5': 'd16s-v5', 'D8s v5': 'd8s-v5', 'D4s v5': 'd4s-v5' };

// Routing effect from the price sheet: what the same hard-path tokens cost on the cheaper model.
export function routingEffect(gwRows, prices, from, to, date) {
  let a = 0; let b = 0;
  for (const g of gwRows) {
    const pf = priceOn(prices, from, g.x_TokenClass, date); const pt = priceOn(prices, to, g.x_TokenClass, date);
    if (!pf || !pt) continue;
    a += g.ConsumedQuantity * pf.usdPerMTok; b += g.ConsumedQuantity * pt.usdPerMTok;
  }
  return a ? 1 - b / a : 0;
}

// VMs whose P95 CPU stayed under the threshold in every month of the window.
export function rightsizeCandidates(vmUtil, months, threshold) {
  const names = [...new Set(vmUtil.map((v) => v.resource))];
  return names.filter((n) => months.every((m) => vmUtil.some((v) => v.resource === n && v.month === m && num(v.p95_cpu_pct) < threshold)));
}

// The steady production compute floor (lowest day, after rightsizing) and its savings-plan pricing.
export function computeFloor(billed, prices, vmUtil, months, rightsizeLever) {
  const low = new Set(rightsizeLever ? rightsizeCandidates(vmUtil, months, rightsizeLever.cpuThresholdPct) : []);
  const daily = {};
  const skuDaily = {};
  for (const r of billed) {
    if (r.ServiceCategory !== 'Compute' || !/prod$/.test(r.SubAccountId) || /nonprod/.test(r.SubAccountId)) continue;
    let sku = r.SkuMeter; let qty = r.PricingQuantity;
    if (low.has(r.ResourceName) && NEXT_DOWN[sku]) { const down = retail(prices, NEXT_DOWN[sku]); sku = down.meter; }
    const rate = retail(prices, SKU_KEY[sku]);
    const cost = rate ? qty * rate.usd : r.EffectiveCost;
    daily[r.x_Date] = (daily[r.x_Date] || 0) + cost;
    skuDaily[r.x_Date] ??= {};
    skuDaily[r.x_Date][sku] = (skuDaily[r.x_Date][sku] || 0) + qty;
  }
  const days = Object.keys(daily);
  const floorDay = days.reduce((a, d) => (daily[d] < daily[a] ? d : a), days[0]);
  return { floorPerDay: daily[floorDay], floorDay, days: days.length, meanPerDay: sum(Object.values(daily)) / days.length, mix: skuDaily[floorDay] || {} };
}

export function savingsPlanDiscount(prices, term = '1 Year') {
  const r = retail(prices, 'd16s-v5');
  return r && r.savingsPlan && r.savingsPlan[term] ? 1 - r.savingsPlan[term] / r.usd : null;
}

export function priceLevers({ levers, allocated, billed, gw, metrics = [], outcomes, prices, org, ue, decisions, vmUtil, month, anomalies = [] }) {
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
      } else if (l.type === 'routing') {
        share = l.eligible.value ?? 1;
        const hard = gw.filter((g) => g.x_Month === month && g.x_UseCase === l.useCase && g.x_Deployment === l.deployment);
        effect = routingEffect(hard, prices, l.effect.from, l.effect.to, datesOfMonth(month).slice(-1)[0]);
        row.priceRatio = 1 - effect;
      } else if (l.type === 'discard-avoid') {
        const now = outcomes.filter((o) => o.use_case === l.useCase && o.date.slice(0, 7) === month);
        const runs = sum(now.map((o) => num(o.runs)));
        share = runs ? sum(now.map((o) => num(o.discarded))) / runs : 0;  // measured
        effect = l.effect.value;  // assumption
        row.discardShare = share;
      } else if (l.type === 'prior' || l.type === 'batch') {
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
      } else if (l.type === 'guardrail') {
        // A guardrail against a repeat of an incident: its cost is shown, never counted as a monthly saving.
        const a = anomalies.find((x) => x.useCase === l.useCase);
        row.saving = null; row.guardrailCost = a ? a.excessCost : 0; row.anomaly = a || null; row.status = 'guardrail';
        row.method = a
          ? `Guardrail, not a recurring saving: the ${shortRange(a.from, a.to)} incident cost ${fmt(a.excessCost)} in failed runs above the normal rate (measured). A page-count pre-check and a two-retry cap stop a repeat.`
          : 'Guardrail, not a recurring saving: no incident this month.';
        out.push(row); continue;
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
      const low = new Set(rightsizeCandidates(vmUtil, org.months, l.cpuThresholdPct));
      const rows = billed.filter((r) => r.x_Month === month && low.has(r.ResourceName));
      const cost = sum(rows.map((r) => r.EffectiveCost));
      let after = 0;
      for (const r of rows) { const down = retail(prices, NEXT_DOWN[r.SkuMeter]); after += down ? r.PricingQuantity * down.usd : r.EffectiveCost; }
      row.eligibleCost = cost; row.saving = cost - after; row.effect = cost ? row.saving / cost : 0;
      row.resources = [...low];
      const n = Math.max(1, low.size); const days = datesOfMonth(month).length;
      row.check = { metric: 'cost per VM-day', current: cost / n / days, target: after / n / days };
      row.method = `Assumption-based: ${low.size} VMs (${[...low].join(', ')}) stayed under ${l.cpuThresholdPct}% P95 CPU all quarter (illustrative telemetry); one size down is priced from the Azure Retail Prices API, which halves the Dsv5 rate. Memory must fit too.`;
    } else if (l.type === 'storage-tier') {
      const hot = retail(prices, 'storage-hot-lrs'); const cool = retail(prices, 'storage-cool-lrs');
      const cost = sum(billed.filter((r) => r.x_Month === month && r.ResourceName === l.resource).map((r) => r.EffectiveCost));
      row.eligibleCost = cost * l.olderShare; row.effect = hot && cool ? 1 - cool.usd / hot.usd : 0; row.saving = row.eligibleCost * row.effect;
      row.check = { metric: 'storage cost per GB-month', current: hot.usd, target: hot.usd * (1 - l.olderShare * row.effect) };
      row.method = `Assumption-based: ${Math.round(l.olderShare * 100)}% of the data is older than 30 days (assumption); Cool LRS at ${unit(cool.usd)} against Hot at ${unit(hot.usd)} per GB-month (Azure Retail Prices API). Cool's higher operation charges and early-deletion charge are not priced.`;
    } else if (l.type === 'search-tier') {
      const from = retail(prices, l.fromSku); const to = retail(prices, l.toSku);
      const rows = billed.filter((r) => r.x_Month === month && r.ResourceName === l.resource);
      const cost = sum(rows.map((r) => r.EffectiveCost));
      const units = rows.length ? sum(rows.map((r) => r.PricingQuantity)) / rows.length / 24 : 0;
      const after = from && to && units ? cost * ((l.toUnits * to.usd) / (units * from.usd)) : cost;
      row.eligibleCost = cost; row.saving = cost - after; row.effect = cost ? row.saving / cost : 0;
      row.unitsNow = units; row.costAfter = after;
      row.check = { metric: 'search tier cost per day', current: cost / datesOfMonth(month).length, target: after / datesOfMonth(month).length };
      row.method = `Assumption-based: ${Math.round(units)} ${from.meter.replace(' Unit', '')} units today; ${l.toUnits} ${to.meter.replace(' Unit', '')} units (${unit(to.usd)} an hour each against ${unit(from.usd)}, Azure Retail Prices API) if the index and query load fit, which is the assumption to test.`;
    } else if (l.type === 'commitment') {
      const rs = levers.find((x) => x.type === 'rightsize');
      const f = computeFloor(billed, prices, vmUtil, org.months, rs);
      const d = org.commitment && Number.isFinite(org.commitment.savingsPlanDiscount) ? org.commitment.savingsPlanDiscount : savingsPlanDiscount(prices, l.term);
      const hours = datesOfMonth(month).length * 24;
      row.floor = f; row.discount = d;
      row.eligibleCost = (f.floorPerDay / 24) * hours;
      row.effect = d; row.saving = d === null ? null : row.eligibleCost * d;
      row.commitmentPerHour = d === null ? null : (f.floorPerDay / 24) * (1 - d);
      row.check = { metric: 'effective cost per production compute hour at the floor', current: f.floorPerDay / 24, target: row.commitmentPerHour ?? f.floorPerDay / 24 };
      row.method = `Measured floor, price-sheet discount: production compute never fell below ${fmt(f.floorPerDay)} a day at pay-as-you-go rates (${unit(f.floorPerDay / 24)} an hour) across ${f.days} days, after the rightsizing above. A ${l.term.toLowerCase().replace(" ", "-")} savings plan bills Dsv5 at ${pctTxt(1 - d)} of pay-as-you-go (Azure Retail Prices API), so commit ${unit(row.commitmentPerHour)} an hour: the floor times (1 \u2212 ${pctTxt(d)}).`;
    } else if (l.type === 'unpriced') {
      row.saving = null;
      row.method = 'Not priced: ' + l.effect.text + '.';
    }
    out.push(row);
  }
  const counted = out.filter((r) => r.saving !== null && !['on hold', 'blocked', 'guardrail'].includes(r.status));
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
function unit(x) { return '$' + (x >= 1 ? x.toFixed(2) : x >= 0.1 ? x.toFixed(3) : x.toFixed(4)); }
function pctTxt(x) { return (Math.round(x * 1000) / 10).toString().replace(/\.0$/, '') + '%'; }
function shortRange(a, b) { const d = (x) => Number(x.slice(8, 10)); return `${d(a)} to ${d(b)} ${monthLabel(a.slice(0, 7))}`; }
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
  if (l.type === 'routing') {
    return `Assumption-based: ${pct(l.eligible.value)} of hard-case tickets are simple enough (assumption); the price sheet puts the same tokens on GPT-5.4 mini at ${pct(row.priceRatio)} of GPT-5.4, so routing saves ${pct(row.effect)} of each routed ticket's cost.`;
  }
  if (l.type === 'discard-avoid') {
    return `Assumption-based: ${pct(row.discardShare)} of explanations were never used (measured); generating on open avoids them, assuming ${pct(l.effect.value)} of unused ones are on alerts nobody opens.`;
  }
  if (l.effect.kind === 'prior') {
    const share = l.eligible.value !== undefined ? `${pct(l.eligible.value)} of the path eligible (assumption); ` : '';
    return `Foundation prior: ${share}${pct(l.effect.range[0])} to ${pct(l.effect.range[1])} range, counted at ${pct(l.effect.point)}.`;
  }
  if (l.type === 'batch') return `Assumption-based: ${l.eligible.text}; ${l.effect.text}.`;
  return '';
}
