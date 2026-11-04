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
    const rows = allocated.filter((r) => r.x_Month === month && r.x_UseCase === uc && r.ServiceCategory === 'AI and Machine Learning');
    const spend = sum(rows.map((r) => r.EffectiveCost));
    const fixedShared = sum(rows.filter((r) => r.AllocatedMethodId === 'retrieval-call-share').map((r) => r.EffectiveCost));
    const embeddings = sum(rows.filter((r) => r.x_ModelId === 'text-embedding').map((r) => r.EffectiveCost));
    const oc = outcomes.filter((o) => o.date.slice(0, 7) === month && o.use_case === uc);
    const t = outcomeTotals(oc);
    const g = gw.filter((x) => x.x_Month === month && x.x_UseCase === uc && x.x_ModelId !== 'text-embedding');
    const tokens = sum(g.map((x) => x.ConsumedQuantity));
    const daily = {};
    for (const r of rows) if (r.AllocatedMethodId !== 'retrieval-call-share') daily[r.x_Date] = (daily[r.x_Date] || 0) + r.EffectiveCost;
    const dailyCps = oc.filter((o) => num(o.successful) > 0).map((o) => ({ date: o.date, value: (daily[o.date] || 0) / num(o.successful) }));
    const cache = cacheStats(g, prices);
    const cps = costPerSuccess(spend, t.successful);
    const avoidable = spend - fixedShared;
    out[uc] = {
      useCase: uc, name: meta.name, owner: meta.owner, month,
      spend, avoidableSpend: avoidable, fixedSharedSpend: fixedShared, embeddingSpend: embeddings, tokenSpend: avoidable - embeddings,
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
    if (r.x_Month !== month || r.ServiceCategory !== 'AI and Machine Learning') continue;
    out[r.x_Owner] = (out[r.x_Owner] || 0) + r.EffectiveCost;
  }
  return out;
}
