// index.js: run the whole ledger from the raw files. Pure: pass the file contents in, get the report
// out. The pages call this in the browser at load; tools/gen-pages.mjs calls it in Node to prerender
// the no-JS view; the tests call it on the committed data.
import { parseCsv, num } from './csv.js';
import { normaliseExport, gatewayRows, requestIndex, priceOn } from './normalise.js';
import { allocate, allocationSummary } from './allocate.js';
import { reconcile } from './reconcile.js';
import { unitEconomics, aiSpendByOwner, percentile } from './metrics.js';
import { baselineOf, budgetOf, scopeSeries, evaluateBudget, variance } from './budget.js';
import { decideAll } from './decision.js';
import { priceLevers } from './levers.js';
import { compareTask } from './compare.js';
import { whatIf, WHATIF_SPEC } from './whatif.js';
import { datesOfMonth, prevMonth } from './dates.js';

export * as csv from './csv.js';
export * as dates from './dates.js';
export { whatIf, WHATIF_SPEC } from './whatif.js';
export { compareTask } from './compare.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const rows = (x) => (typeof x === 'string' ? parseCsv(x) : x);

// Deployments whose model version changed during a month (the price change the variance picks up).
export function modelChanges(billed, month) {
  const seen = {};
  const changes = [];
  for (const r of billed.slice().sort((a, b) => a.x_Date.localeCompare(b.x_Date))) {
    if (!r.x_Deployment || !r.x_ModelId || r.x_TokenDirection !== 'Input' || r.x_TokenCacheAction !== 'Uncached') continue;
    const prev = seen[r.x_Deployment];
    if (prev && prev !== r.x_ModelId && r.x_Month === month) changes.push({ deployment: r.x_Deployment, from: prev, to: r.x_ModelId, date: r.x_Date });
    seen[r.x_Deployment] = r.x_ModelId;
  }
  return changes;
}

// If a use case stopped, its share of the fixed shared tier would not go away: it would be spread
// over the other users of the pool in proportion to their own share. Returns, per use case with a
// fixed share, the cost that moves and each other user's fully loaded cost per outcome before and after.
export function sharedReallocation(ueMonth, allocated, month) {
  const out = {};
  const users = Object.values(ueMonth).filter((u) => u.fixedSharedSpend > 0);
  for (const u of users) {
    const others = users.filter((x) => x.useCase !== u.useCase);
    const base = others.reduce((s, x) => s + x.fixedSharedSpend, 0);
    out[u.useCase] = {
      moved: u.fixedSharedSpend,
      to: others.map((x) => {
        const add = base ? u.fixedSharedSpend * (x.fixedSharedSpend / base) : 0;
        return { useCase: x.useCase, added: add, from: x.costPerSuccess, to: x.successful ? (x.spend + add) / x.successful : null };
      }),
    };
  }
  return out;
}

export function commitmentCall({ billed, gw, levers, org, months }) {
  const discount = org.commitment && Number.isFinite(org.commitment.savingsPlanDiscount) ? org.commitment.savingsPlanDiscount : null;
  const rightsized = new Set((levers.levers.find((l) => l.id === 'vm-rightsize') || {}).resources || []);
  const effect = (levers.levers.find((l) => l.id === 'vm-rightsize') || {}).effect || 0;
  const daily = {};
  for (const r of billed) {
    if (r.ServiceCategory !== 'Compute' || !/prod$/.test(r.SubAccountId) || /nonprod/.test(r.SubAccountId)) continue;
    const c = rightsized.has(r.ResourceName) ? r.EffectiveCost * (1 - effect) : r.EffectiveCost;
    daily[r.x_Date] = (daily[r.x_Date] || 0) + c;
  }
  const values = Object.values(daily);
  const floor = Math.min(...values);
  const days = values.length;
  const tok = {};
  for (const g of gw) if (g.x_Environment === 'prod' && g.x_ModelId !== 'text-embedding') tok[g.x_Date] = (tok[g.x_Date] || 0) + g.ConsumedQuantity;
  const t = Object.values(tok);
  const p50 = percentile(t, 0.5);
  const p90 = percentile(t, 0.9);
  const minT = Math.min(...t);
  const maxT = Math.max(...t);
  return {
    baselineDays: days, meetsBaselineRule: days >= 60, computeFloorPerDay: floor, computeFloorPerHour: floor / 24,
    savingsPlanDiscount: discount, commitmentPerHour: discount === null ? null : (floor / 24) * (1 - discount),
    computeMeanPerDay: sum(values) / Math.max(1, days),
    tokensP50: p50, tokensP90: p90, tokensP90toP50: p50 ? p90 / p50 : null, tokensMaxToMin: minT ? maxT / minT : null,
    ptuRecommended: false,
  };
}

export function buildLedger(data) {
  const { prices, org, values } = data;
  const billed = normaliseExport(rows(data.focus));
  const metrics = rows(data.tokens);
  const outcomes = rows(data.outcomes);
  const vmUtil = rows(data.vm || []);
  const gw = gatewayRows(metrics, prices);
  const requests = requestIndex(metrics);
  const allocated = allocate(billed, gw, requests, org);
  const months = org.months;
  const month = org.reportMonth;

  const allocation = {}; const reconciliation = {}; const ue = {}; const aiTotals = {}; const aiByOwner = {}; const totals = {};
  for (const m of months) {
    allocation[m] = allocationSummary(allocated, billed, m, org);
    reconciliation[m] = reconcile(billed, gw, prices, org, m);
    ue[m] = unitEconomics({ allocated, gw, outcomes, prices, org, month: m });
    aiByOwner[m] = aiSpendByOwner(allocated, m);
    aiTotals[m] = sum(Object.values(aiByOwner[m]));
    totals[m] = allocation[m].allocatedTotal;
  }

  const decisions = decideAll(ue[month], values, org);
  const isAi = (r) => r.ServiceCategory === 'AI and Machine Learning';
  const ownersWithAi = Object.keys(org.owners).filter((o) => o !== 'unallocated');
  const ccuIds = Object.keys(org.gateway.ccuLines);
  const scopes = [
    { id: 'ai-total', label: 'All AI spend', kind: 'ledger', filter: isAi, useCases: Object.keys(org.useCases) },
    ...ownersWithAi.map((o) => ({ id: 'owner:' + o, owner: o, label: org.owners[o], kind: 'ledger', filter: (r) => isAi(r) && r.x_Owner === o,
      useCases: Object.keys(org.useCases).filter((u) => org.useCases[u].owner === o) })),
    { id: 'ccu-meter', label: 'Claude CCU line (meter scope)', kind: 'azure', filter: (r) => ccuIds.includes(r.ResourceId), useCases: ['kyc-review'] },
  ];
  const budget = scopes.map((s) => {
    const monthly = {};
    for (const m of months) monthly[m] = sum(allocated.filter((r) => r.x_Month === m && s.filter(r)).map((r) => r.EffectiveCost));
    const baseline = baselineOf(monthly, month);
    const b = budgetOf(baseline, org.budget.multiple);
    const ev = evaluateBudget(scopeSeries(allocated, outcomes, s), month, b, org.budget);
    return { id: s.id, label: s.label, kind: s.kind, owner: s.owner || null, monthly, baseline, budget: b, ...ev };
  });

  const v = variance({ allocated, gw, outcomes, prices, org, month });
  const changes = modelChanges(billed, month);
  const levers = priceLevers({ levers: data.levers.levers, allocated, billed, gw, metrics, outcomes, prices, org, ue: ue[month], decisions, vmUtil, month });
  const commitment = commitmentCall({ billed, gw, levers, org, months });

  // Cost per KYC summary task across providers, from the measured October token counts.
  const kyc = ue[month]['kyc-review'];
  const kycG = gw.filter((g) => g.x_Month === month && g.x_UseCase === 'kyc-review');
  const lastDay = datesOfMonth(month).slice(-1)[0];
  const task = {
    name: 'KYC document summary', measuredOn: 'claude-new',
    inputTokens: sum(kycG.filter((g) => g.x_TokenDirection === 'Input').map((g) => g.ConsumedQuantity)) / kyc.runs,
    outputTokens: sum(kycG.filter((g) => g.x_TokenDirection === 'Output').map((g) => g.ConsumedQuantity)) / kyc.runs,
  };
  const compare = { task, date: lastDay, rows: compareTask({ prices, date: lastDay, task, models: ['claude-sonnet-5.5', 'gpt-5.4', 'gpt-5.4-mini'] }) };

  // What-if defaults: the support assistant as measured in the report month.
  const sup = ue[month]['support-assistant'];
  const supG = gw.filter((g) => g.x_Month === month && g.x_UseCase === 'support-assistant' && g.x_ModelId !== 'text-embedding');
  const supM = metrics.filter((m) => m.date.slice(0, 7) === month && m.use_case === 'support-assistant' && m.model !== 'text-embedding');
  const hardReq = sum(supM.filter((m) => m.deployment === 'gpt-support-hard').map((m) => num(m.requests)));
  const allReq = sum(supM.map((m) => num(m.requests)));
  const whatifDefaults = {
    triageModel: 'none', draftModel: 'gpt-5.4-mini',
    hardShare: allReq ? Math.round((hardReq / allReq) * 100) / 100 : WHATIF_SPEC.hardShare.default,
    inputTokens: Math.round(sum(supG.filter((g) => g.x_TokenDirection === 'Input').map((g) => g.ConsumedQuantity)) / sup.runs / 100) * 100,
    outputTokens: Math.round(sum(supG.filter((g) => g.x_TokenDirection === 'Output').map((g) => g.ConsumedQuantity)) / sup.runs / 10) * 10,
    cacheHitRate: Math.round(sup.cacheHitRate * 100) / 100,
    batchShare: 0,
    failureRate: Math.round((1 - sup.successRate) * 100) / 100,
    reviewMinutes: Math.round((sup.reviewMinutes / sup.runs) * 10) / 10,
    costPerMinute: values.useCases['support-assistant'].loadedCostPerMinute,
    volume: Math.round(sup.successful / 1000) * 1000,
  };
  const whatifBase = whatIf(whatifDefaults, prices, lastDay, whatifDefaults);

  const reallocation = sharedReallocation(ue[month], allocated, month);

  return {
    org, prices, values, month, months, previousMonth: prevMonth(month, 1), reallocation,
    billed, gw, allocated, outcomes,
    allocation, reconciliation, ue, decisions, aiTotals, aiByOwner, totals,
    budget, variance: v, modelChanges: changes, levers, commitment, compare,
    whatifDefaults, whatifBase,
    checks: {
      allocationSumsToBill: months.every((m) => Math.abs(allocation[m].allocatedTotal - allocation[m].billedTotal) < 1e-6 * Math.max(1, allocation[m].billedTotal)),
      priceRowsCited: prices.rows.every((r) => r.src && r.readOn),
      priceUsed: (model, cls, date) => priceOn(prices, model, cls, date),
    },
  };
}
