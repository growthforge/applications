// index.js: run the whole ledger from the raw files. Pure: pass the file contents in, get the report
// out. The pages call this in the browser at load; tools/gen-pages.mjs calls it in Node to prerender
// the no-JS view; the tests call it on the committed data.
import { parseCsv, num } from './csv.js';
import { normaliseExport, gatewayRows, requestIndex, priceOn } from './normalise.js';
import { allocate, allocationSummary, isAi, markAiSpend, FIXED_METHODS } from './allocate.js';
import { reconcile } from './reconcile.js';
import { unitEconomics, aiSpendByOwner, percentile, failureAnomalies } from './metrics.js';
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
  // Pool by pool: the search tier goes to the other retrieval users, the gateway to the other gateway users.
  const pools = [['searchShareSpend', 'search tier'], ['gatewayShareSpend', 'AI gateway']];
  const users = Object.values(ueMonth);
  const out = {};
  for (const u of users) {
    if (!(u.fixedSharedSpend > 0)) continue;
    const added = {};
    for (const [key] of pools) {
      const mine = u[key] !== undefined ? u[key] : (key === 'searchShareSpend' ? u.fixedSharedSpend : 0);
      if (!(mine > 0)) continue;
      const others = users.filter((x) => x.useCase !== u.useCase && (x[key] !== undefined ? x[key] : (key === 'searchShareSpend' ? x.fixedSharedSpend : 0)) > 0);
      const base = others.reduce((s, x) => s + (x[key] !== undefined ? x[key] : x.fixedSharedSpend), 0);
      for (const x of others) added[x.useCase] = (added[x.useCase] || 0) + (base ? mine * ((x[key] !== undefined ? x[key] : x.fixedSharedSpend) / base) : 0);
    }
    out[u.useCase] = {
      moved: u.fixedSharedSpend,
      to: Object.entries(added).map(([uc, add]) => {
        const x = ueMonth[uc];
        return { useCase: uc, added: add, from: x.costPerSuccess, to: x.successful ? (x.spend + add) / x.successful : null };
      }).sort((a, b) => b.added - a.added),
    };
  }
  return out;
}

// The commitment call: the priced savings-plan lever, plus why provisioned throughput waits.
export function commitmentCall({ gw, levers }) {
  const c = levers.levers.find((l) => l.id === 'compute-commitment') || {};
  const f = c.floor || { floorPerDay: null, days: 0, meanPerDay: null };
  const tok = {};
  for (const g of gw) if (g.x_Environment === 'prod' && g.x_ModelId !== 'text-embedding') tok[g.x_Date] = (tok[g.x_Date] || 0) + g.ConsumedQuantity;
  const t = Object.values(tok);
  const p50 = percentile(t, 0.5);
  const p90 = percentile(t, 0.9);
  const minT = Math.min(...t);
  const maxT = Math.max(...t);
  return {
    baselineDays: f.days, meetsBaselineRule: f.days >= 60, computeFloorPerDay: f.floorPerDay, computeFloorPerHour: f.floorPerDay / 24,
    savingsPlanDiscount: c.discount ?? null, commitmentPerHour: c.commitmentPerHour ?? null, monthlySaving: c.saving ?? null,
    computeMeanPerDay: f.meanPerDay,
    tokensP50: p50, tokensP90: p90, tokensP90toP50: p50 ? p90 / p50 : null, tokensMaxToMin: minT ? maxT / minT : null,
    ptuRecommended: false,
  };
}

// Knowledge assistant scenario: fix retrieval up to the owner's quality bar, then downsize the search
// tier. Same runs and avoidable cost per run; more useful answers; the tier's cost from the priced lever.
export function knowledgeScenario({ ue, decisions, levers, uc = 'knowledge-assistant' }) {
  const u = ue[uc]; const d = decisions[uc];
  const tier = levers.levers.find((l) => l.id === 'search-tier');
  if (!u || !d || !tier) return null;
  const usefulNow = u.successful;
  const usefulFixed = u.runs * Math.max(d.qualityBar, u.successRate);
  const tierShare = u.searchShareSpend;
  const tierAfterShare = tier.eligibleCost ? tierShare * (tier.costAfter / tier.eligibleCost) : tierShare;
  return {
    useCase: uc, value: d.valuePerSuccess, bar: d.qualityBar,
    now: { useful: usefulNow, avoidable: u.avoidableSpend / usefulNow, loaded: u.spend / usefulNow },
    fixed: { useful: usefulFixed, avoidable: u.avoidableSpend / usefulFixed, loaded: u.spend / usefulFixed },
    fixedAndDownsized: { useful: usefulFixed, avoidable: u.avoidableSpend / usefulFixed, loaded: (u.spend - tierShare + tierAfterShare) / usefulFixed },
  };
}

export function buildLedger(data) {
  const { prices, org, values } = data;
  const billed = markAiSpend(normaliseExport(rows(data.focus)), org);
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
  const anomalies = failureAnomalies({ outcomes, allocated, org, month, prior: [prevMonth(month, 1), prevMonth(month, 2)] });
  const levers = priceLevers({ levers: data.levers.levers, allocated, billed, gw, metrics, outcomes, prices, org, ue: ue[month], decisions, vmUtil, month, anomalies });
  const commitment = commitmentCall({ gw, levers });
  const scenario = knowledgeScenario({ ue: ue[month], decisions, levers });

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
    budget, variance: v, modelChanges: changes, levers, commitment, compare, anomalies, scenario,
    whatifDefaults, whatifBase,
    checks: {
      allocationSumsToBill: months.every((m) => Math.abs(allocation[m].allocatedTotal - allocation[m].billedTotal) < 1e-6 * Math.max(1, allocation[m].billedTotal)),
      priceRowsCited: prices.rows.every((r) => r.src && r.readOn),
      priceUsed: (model, cls, date) => priceOn(prices, model, cls, date),
    },
  };
}
