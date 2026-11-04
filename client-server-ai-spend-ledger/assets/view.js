// view.js: reduce the ledger report to the plain data the pages draw. Runs in the worker (browser)
// and in tools/gen-pages.mjs (Node), so the prerendered no-JS view and the live page show the same
// numbers from the same code.
import { datesOfMonth } from '../pack/ledger/dates.js';

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const UE_KEYS = ['useCase', 'name', 'owner', 'month', 'spend', 'avoidableSpend', 'fixedSharedSpend', 'searchShareSpend', 'gatewayShareSpend', 'embeddingSpend', 'tokenSpend', 'avoidableCostPerSuccess', 'runs', 'successful', 'failed', 'retried', 'discarded',
  'reviewMinutes', 'successRate', 'costPerRun', 'costPerSuccess', 'p50', 'p90', 'failedShareOfCost', 'failedCost', 'cacheHitRate', 'cacheCostEfficiency',
  'tokens', 'tokensPerSuccess', 'costPerMTok', 'reviewMinutesPerSuccess'];

// The first use case marked stop, if any, with its avoidable cost (what stopping would save).
function stopOf(L) {
  const uc = Object.keys(L.decisions).find((k) => L.decisions[k].decision === 'stop');
  if (!uc) return null;
  const u = L.ue[L.month][uc];
  return { useCase: uc, monthlyCost: u.avoidableSpend, fixedShare: u.fixedSharedSpend };
}

export function viewModel(L) {
  const org = L.org;
  const useCases = Object.fromEntries(Object.entries(org.useCases).map(([id, u]) => [id, { ...u, id, ownerName: org.owners[u.owner] }]));
  const ue = {};
  for (const m of L.months) {
    ue[m] = {};
    for (const [uc, u] of Object.entries(L.ue[m])) {
      ue[m][uc] = { ...pick(u, UE_KEYS), daily: u.dailyCostPerSuccess.map((d) => [d.date, d.value]) };
    }
  }
  const ai = L.budget.find((b) => b.id === 'ai-total');
  const owners = L.budget.filter((b) => b.id.startsWith('owner:')).map((b) => ({ id: b.owner, name: b.label, baseline: b.baseline, budget: b.budget, actual: b.actual,
    pct: b.pctOfBudget, alerts: b.alerts, forecastEnd: b.path[b.path.length - 1].forecast, monthly: b.monthly }));
  const ccu = L.budget.find((b) => b.id === 'ccu-meter');
  const allocation = Object.fromEntries(L.months.map((m) => [m, pick(L.allocation[m], ['billedTotal', 'allocatedTotal', 'byOwner', 'byMethod', 'unallocated', 'owned', 'ownedPct', 'stage', 'targets', 'unallocatedGroups', 'unallocatedByCause'])]));
  const rec = L.reconciliation[L.month];
  return {
    generatedFrom: { billedRows: L.billed.length, metricRows: L.gw.length, outcomeRows: L.outcomes.length, allocatedRows: L.allocated.length },
    month: L.month, previousMonth: L.previousMonth, months: L.months, daysInMonth: datesOfMonth(L.month).length,
    owners: org.owners, useCases, decisionRules: org.decision, budgetRules: { multiple: org.budget.multiple, thresholds: org.budget.thresholds, lag: org.budget.dataLagDays },
    totals: L.totals, aiTotals: L.aiTotals, aiByOwner: L.aiByOwner,
    ai: { baseline: ai.baseline, budget: ai.budget, actual: ai.actual, pct: ai.pctOfBudget, alerts: ai.alerts, monthly: ai.monthly,
      path: ai.path.map((p) => [p.date, p.actualToDate, p.forecast, p.trailingMean]) },
    ownerBudgets: owners,
    ccu: { budget: ccu.budget, actual: ccu.actual, pct: ccu.pctOfBudget, alerts: ccu.alerts, baseline: ccu.baseline },
    variance: L.variance, modelChanges: L.modelChanges,
    ue, decisions: L.decisions, values: L.values.useCases,
    allocation,
    reconciliation: { lines: rec.lines, totals: rec.totals, bypass: rec.bypass.map((b) => b.label), partial: rec.partial.map((b) => b.label), priceMismatches: rec.priceMismatches.length },
    levers: L.levers.levers, leverTotals: L.levers.totals,
    stopLine: stopOf(L),
    anomalies: L.anomalies, scenario: L.scenario,
    reallocation: L.reallocation,
    commitment: L.commitment,
    compare: L.compare,
    whatif: { defaults: L.whatifDefaults, base: L.whatifBase, ledgerCostPerSuccess: L.ue[L.month]['support-assistant'].costPerSuccess,
      ledgerTokenCostPerSuccess: L.ue[L.month]['support-assistant'].tokenSpend / L.ue[L.month]['support-assistant'].successful },
    coverageOfAllAi: rec.totals.coverageOfAllAi,
    prices: { rows: L.prices.rows, rules: L.prices.rules, models: L.prices.models, readOn: L.prices.readOn, retail: L.prices.azureRetail.rows.map((r) => ({ key: r.key, sku: r.sku, meter: r.meter, usd: r.usd, unit: r.unit, savingsPlan: r.savingsPlan || null, readOn: r.readOn })) },
  };
}
