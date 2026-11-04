// metrics.js: unit economics per use case and month.
//
// Cost per successful outcome = all allocated AI cost of the use case / runs that met the quality
// bar. Failed, retried and discarded runs are in the numerator because they were billed [S3].
// Two views of it: avoidable (the cost that stops if the use case stops: its model tokens and
// per-call embeddings) and fully loaded (adds its share of the fixed shared platform, the AI Search
// tier, which stays and is re-spread over the other users if this use case stops). Decisions use
// the avoidable view.
// Daily cost per outcome is reported as P50 and P90 across the days of the month (daily aggregates,
// so this is the spread of daily unit cost, not of individual runs).
// Cache hit rate = cache reads / (reads + writes + uncached input) [S4]. Cache cost efficiency =
// input cost avoided, net of any write premium, as a share of what the same input would cost with
// no caching. It goes negative when cache writes are not read back.
import { priceOn } from './normalise.js';
import { num } from './csv.js';
import { isAi, FIXED_METHODS } from './allocate.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);

// Linear interpolation between closest ranks (the usual spreadsheet PERCENTILE.INC).
export function percentile(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  if (v.length === 1) return v[0];
  const h = (v.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return v[lo] + (h - lo) * (v[hi] - v[lo]);
}

export function outcomeTotals(rows) {
  const t = { runs: 0, successful: 0, failed: 0, retried: 0, discarded: 0, reviewMinutes: 0 };
  for (const o of rows) {
    t.runs += num(o.runs) || 0;
    t.successful += num(o.successful) || 0;
    t.failed += num(o.failed) || 0;
    t.retried += num(o.retried) || 0;
    t.discarded += num(o.discarded) || 0;
    t.reviewMinutes += num(o.review_minutes) || 0;
  }
  return t;
}

export function costPerSuccess(cost, successful) { return successful > 0 ? cost / successful : null; }

// Share of cost spent on runs that did not succeed, assuming cost per run is even across outcomes.
export function failedShareOfCost(t) { return t.runs > 0 ? (t.failed + t.discarded) / t.runs : 0; }

export function cacheStats(gwRows, prices) {
  let cached = 0; let writes = 0; let uncached = 0; let actual = 0; let noCache = 0;
  for (const g of gwRows) {
    if (g.x_TokenDirection !== 'Input') continue;
    const base = priceOn(prices, g.x_ModelId, 'input', g.x_Date);
    if (!base) continue;
    const q = g.ConsumedQuantity;
    if (g.x_TokenCacheAction === 'Read') cached += q;
    else if (g.x_TokenCacheAction === 'Write') writes += q;
    else uncached += q;
    actual += g.ListCost || 0;
    noCache += (q / 1e6) * base.usdPerMTok;
  }
  const input = cached + writes + uncached;
  return {
    hitRate: input ? cached / input : 0,
    costEfficiency: noCache ? (noCache - actual) / noCache : 0,
    inputTokens: input, cachedTokens: cached, writeTokens: writes,
  };
}

export function unitEconomics({ allocated, gw, outcomes, prices, org, month }) {
  const out = {};
  for (const [uc, meta] of Object.entries(org.useCases)) {
    const rows = allocated.filter((r) => r.x_Month === month && r.x_UseCase === uc && isAi(r));
    const spend = sum(rows.map((r) => r.EffectiveCost));
    const fixedShared = sum(rows.filter((r) => FIXED_METHODS.includes(r.AllocatedMethodId)).map((r) => r.EffectiveCost));
    const searchShare = sum(rows.filter((r) => r.AllocatedMethodId === 'retrieval-call-share').map((r) => r.EffectiveCost));
    const gatewayShare = sum(rows.filter((r) => r.AllocatedMethodId === 'gateway-request-share').map((r) => r.EffectiveCost));
    const embeddings = sum(rows.filter((r) => r.x_ModelId === 'text-embedding').map((r) => r.EffectiveCost));
    const oc = outcomes.filter((o) => o.date.slice(0, 7) === month && o.use_case === uc);
    const t = outcomeTotals(oc);
    const g = gw.filter((x) => x.x_Month === month && x.x_UseCase === uc && x.x_ModelId !== 'text-embedding');
    const tokens = sum(g.map((x) => x.ConsumedQuantity));
    const daily = {};
    for (const r of rows) if (!FIXED_METHODS.includes(r.AllocatedMethodId)) daily[r.x_Date] = (daily[r.x_Date] || 0) + r.EffectiveCost;
    const dailyCps = oc.filter((o) => num(o.successful) > 0).map((o) => ({ date: o.date, value: (daily[o.date] || 0) / num(o.successful) }));
    const cache = cacheStats(g, prices);
    const cps = costPerSuccess(spend, t.successful);
    const avoidable = spend - fixedShared;
    out[uc] = {
      useCase: uc, name: meta.name, owner: meta.owner, month,
      spend, avoidableSpend: avoidable, fixedSharedSpend: fixedShared, searchShareSpend: searchShare, gatewayShareSpend: gatewayShare, embeddingSpend: embeddings, tokenSpend: avoidable - embeddings,
      ...t,
      successRate: t.runs ? t.successful / t.runs : 0,
      costPerRun: t.runs ? avoidable / t.runs : null,
      costPerSuccess: cps,
      avoidableCostPerSuccess: costPerSuccess(avoidable, t.successful),
      p50: percentile(dailyCps.map((x) => x.value), 0.5),
      p90: percentile(dailyCps.map((x) => x.value), 0.9),
      dailyCostPerSuccess: dailyCps,
      failedShareOfCost: failedShareOfCost(t),
      failedCost: avoidable * failedShareOfCost(t),
      cacheHitRate: cache.hitRate,
      cacheCostEfficiency: cache.costEfficiency,
      tokens,
      tokensPerSuccess: t.successful ? tokens / t.successful : null,
      costPerMTok: tokens ? ((avoidable - embeddings) / tokens) * 1e6 : null,
      reviewMinutesPerSuccess: t.successful ? t.reviewMinutes / t.successful : null,
    };
  }
  return out;
}

// AI spend for a month by owner (allocated), used by the memo and the budget view.
export function aiSpendByOwner(allocated, month) {
  const out = {};
  for (const r of allocated) {
    if (r.x_Month !== month || !isAi(r)) continue;
    out[r.x_Owner] = (out[r.x_Owner] || 0) + r.EffectiveCost;
  }
  return out;
}

// Failure anomalies: days whose failure rate is far above the two prior months' daily pattern.
// For each use case with such days: the run of days, failures a day, the failure rate against the
// baseline, the share of the month's excess failures those days explain, cost per successful outcome
// on those days against the month's normal days, and how far retries rose (the data's own pointer to
// a root cause).
export function failureAnomalies({ outcomes, allocated, org, month, prior }) {
  const cfg = org.anomaly || { sdMultiple: 4, minRatioToBaseline: 2 };
  const out = [];
  for (const uc of Object.keys(org.useCases)) {
    const base = outcomes.filter((o) => o.use_case === uc && prior.includes(o.date.slice(0, 7)) && num(o.runs) > 0);
    const now = outcomes.filter((o) => o.use_case === uc && o.date.slice(0, 7) === month && num(o.runs) > 0);
    if (!base.length || !now.length) continue;
    const rate = (o) => num(o.failed) / num(o.runs);
    const rates = base.map(rate);
    const mean = sum(rates) / rates.length;
    const sd = Math.sqrt(sum(rates.map((r) => (r - mean) ** 2)) / rates.length);
    const flagged = now.filter((o) => rate(o) > mean + cfg.sdMultiple * sd && rate(o) >= cfg.minRatioToBaseline * mean);
    if (!flagged.length) continue;
    const dayCost = {};
    for (const r of allocated) if (r.x_Month === month && r.x_UseCase === uc && isAi(r) && !FIXED_METHODS.includes(r.AllocatedMethodId)) dayCost[r.x_Date] = (dayCost[r.x_Date] || 0) + r.EffectiveCost;
    const excess = (o) => Math.max(0, num(o.failed) - mean * num(o.runs));
    const monthExcess = sum(now.map(excess));
    const flaggedDates = new Set(flagged.map((o) => o.date));
    const cps = (o) => (num(o.successful) ? (dayCost[o.date] || 0) / num(o.successful) : null);
    const normal = now.filter((o) => !flaggedDates.has(o.date)).map(cps).filter((x) => x !== null);
    const retryShare = (rows) => { const r = sum(rows.map((o) => num(o.runs))); return r ? sum(rows.map((o) => num(o.retried))) / r : 0; };
    out.push({
      useCase: uc,
      dates: flagged.map((o) => o.date),
      from: flagged[0].date, to: flagged[flagged.length - 1].date,
      failuresPerDay: sum(flagged.map((o) => num(o.failed))) / flagged.length,
      rate: sum(flagged.map((o) => num(o.failed))) / sum(flagged.map((o) => num(o.runs))),
      baselineRate: mean,
      shareOfMonthExcess: monthExcess ? sum(flagged.map(excess)) / monthExcess : 0,
      costPerSuccessRange: [Math.min(...flagged.map(cps)), Math.max(...flagged.map(cps))],
      normalCostPerSuccess: percentile(normal, 0.5),
      excessCost: sum(flagged.map((o) => excess(o) * ((dayCost[o.date] || 0) / num(o.runs)))),
      retryMultiple: retryShare(base) ? retryShare(flagged) / retryShare(base) : null,
    });
  }
  return out;
}
