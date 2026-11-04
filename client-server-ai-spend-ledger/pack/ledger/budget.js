// budget.js: budgets, forecasts, alerts and the month-on-month variance split.
//
// Baseline = mean of the two prior months. Budget = baseline x 1.15, inside the 110 to 120% band [S3].
// Alerts at 80% and 100% of budget on actual cost, and at 100% on forecast [S3]. Azure evaluates
// budgets about once a day [S8], so an alert is raised the day after the data crosses the line.
// Forecast from drivers: expected runs for each remaining day (trailing 14 days, same day type,
// weekday or weekend) x cost per run (trailing 7 days), plus a run rate for cost that no use case
// drives. A trailing-mean forecast (month to date / days elapsed x days in month) is kept only as a
// cross-check.
// Variance, September to October, for each use case's avoidable cost (model tokens and embeddings):
//   volume = change in runs x September cost per run
//   price  = October tokens x change in published list price (zero unless a price row changes)
//   mix    = the rest: tokens per run, model mix and success rates
// plus two buckets that runs do not drive, kept apart: the fixed shared platform (the AI Search
// tier, allocated by retrieval calls) and unattributed AI cost (billed AI with no use case).
import { datesOfMonth, prevMonth, isWeekend, addDays } from './dates.js';
import { priceOn } from './normalise.js';
import { num } from './csv.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);

export function baselineOf(monthTotals, month) {
  const a = monthTotals[prevMonth(month, 1)];
  const b = monthTotals[prevMonth(month, 2)];
  if (a === undefined || b === undefined) return null;
  return (a + b) / 2;
}

export function budgetOf(baseline, multiple) { return baseline === null ? null : baseline * multiple; }

// Series keyed by date for one scope: total cost, cost per use case, runs per use case.
export function scopeSeries(allocated, outcomes, scope) {
  const total = {}; const byUc = {}; const runs = {};
  for (const r of allocated) {
    if (!scope.filter(r)) continue;
    total[r.x_Date] = (total[r.x_Date] || 0) + r.EffectiveCost;
    if (r.x_UseCase && scope.useCases.includes(r.x_UseCase)) {
      byUc[r.x_UseCase] ??= {};
      byUc[r.x_UseCase][r.x_Date] = (byUc[r.x_UseCase][r.x_Date] || 0) + r.EffectiveCost;
    }
  }
  for (const o of outcomes) {
    if (!scope.useCases.includes(o.use_case)) continue;
    runs[o.use_case] ??= {};
    runs[o.use_case][o.date] = num(o.runs) || 0;
  }
  return { total, byUc, runs };
}

function window(endDate, days) { const out = []; for (let k = days - 1; k >= 0; k--) out.push(addDays(endDate, -k)); return out; }

// Month-end forecast with data through asOf (inclusive).
export function driverForecast(series, month, asOf, cfg) {
  const days = datesOfMonth(month);
  const mtd = sum(days.filter((d) => d <= asOf).map((d) => series.total[d] || 0));
  const remaining = days.filter((d) => d > asOf);
  const unitWin = window(asOf, cfg.trailingDaysForUnitCost);
  const volWin = window(asOf, cfg.trailingDaysForVolume);
  let driven = 0;
  let drivenToday = 0;
  for (const uc of Object.keys(series.byUc)) {
    const cost = sum(unitWin.map((d) => series.byUc[uc][d] || 0));
    const runs = sum(unitWin.map((d) => (series.runs[uc] || {})[d] || 0));
    const cpr = runs ? cost / runs : 0;
    const mean = (pred) => { const ds = volWin.filter(pred); return ds.length ? sum(ds.map((d) => (series.runs[uc] || {})[d] || 0)) / ds.length : 0; };
    const we = mean((d) => isWeekend(d)) || mean(() => true);
    const wd = mean((d) => !isWeekend(d)) || mean(() => true);
    for (const d of remaining) driven += (isWeekend(d) ? we : wd) * cpr;
    drivenToday += cost;
  }
  const totalWin = sum(unitWin.map((d) => series.total[d] || 0));
  const otherPerDay = Math.max(0, totalWin - drivenToday) / unitWin.length;
  return mtd + driven + otherPerDay * remaining.length;
}

export function trailingMeanForecast(series, month, asOf) {
  const days = datesOfMonth(month);
  const done = days.filter((d) => d <= asOf);
  const mtd = sum(done.map((d) => series.total[d] || 0));
  return done.length ? (mtd / done.length) * days.length : 0;
}

export function evaluateBudget(series, month, budget, cfg) {
  const days = datesOfMonth(month);
  let mtd = 0;
  const path = days.map((d) => {
    mtd += series.total[d] || 0;
    return { date: d, actualToDate: mtd, forecast: driverForecast(series, month, d, cfg), trailingMean: trailingMeanForecast(series, month, d) };
  });
  const alerts = [];
  if (budget) {
    for (const t of cfg.thresholds) {
      const hit = path.find((p) => p.actualToDate >= t * budget);
      alerts.push({ type: 'actual', threshold: t, crossedOn: hit ? hit.date : null, raisedOn: hit ? addDays(hit.date, cfg.dataLagDays) : null });
    }
    const f = path.find((p) => p.forecast >= cfg.forecastThreshold * budget);
    alerts.push({ type: 'forecast', threshold: cfg.forecastThreshold, crossedOn: f ? f.date : null, raisedOn: f ? addDays(f.date, cfg.dataLagDays) : null });
  }
  const last = path[path.length - 1];
  return { month, budget, actual: last.actualToDate, pctOfBudget: budget ? last.actualToDate / budget : null, path, alerts };
}

// The month-on-month variance split for AI cost.
export function variance({ allocated, gw, outcomes, prices, org, month }) {
  const prev = prevMonth(month, 1);
  const isToken = (r) => r.ServiceCategory === 'AI and Machine Learning' && r.AllocatedMethodId !== 'retrieval-call-share'
    && (r.ConsumedUnit === 'Tokens' || org.gateway.ccuLines[r.ResourceId]);
  const isFixed = (r) => r.ServiceCategory === 'AI and Machine Learning' && r.AllocatedMethodId === 'retrieval-call-share';
  const isAi = (r) => r.ServiceCategory === 'AI and Machine Learning';
  const cost = (m, pred) => sum(allocated.filter((r) => r.x_Month === m && pred(r)).map((r) => r.EffectiveCost));
  const runs = (m, uc) => sum(outcomes.filter((o) => o.date.slice(0, 7) === m && o.use_case === uc).map((o) => num(o.runs) || 0));
  // The model each deployment ran on the last day of the previous month: the reference price.
  const refModel = {};
  for (const r of allocated) if (r.x_Month === prev && r.x_Deployment && r.x_ModelId) refModel[r.x_Deployment] = r.x_ModelId;
  const refDate = datesOfMonth(prev).slice(-1)[0];
  const rows = [];
  for (const uc of Object.keys(org.useCases)) {
    const pred = (r) => r.x_UseCase === uc && isToken(r);
    const cPrev = cost(prev, pred); const cNow = cost(month, pred);
    const rPrev = runs(prev, uc); const rNow = runs(month, uc);
    const volume = rPrev ? (rNow - rPrev) * (cPrev / rPrev) : 0;
    let price = 0;
    for (const r of allocated) {
      if (r.x_Month !== month || !pred(r) || !r.x_ModelId || r.ConsumedUnit !== 'Tokens') continue;
      const cls = r.x_TokenDirection === 'Output' ? 'output' : r.x_TokenCacheAction === 'Read' ? 'cachedInput' : 'input';
      const now = priceOn(prices, r.x_ModelId, cls, r.x_Date);
      const ref = priceOn(prices, refModel[r.x_Deployment] || r.x_ModelId, cls, refDate);
      if (!now || !ref || !r.ListCost) continue;
      const netFactor = r.EffectiveCost / r.ListCost;
      price += (r.ConsumedQuantity / 1e6) * (now.usdPerMTok - ref.usdPerMTok) * netFactor;
    }
    // CCU-billed models: price effect from the gateway estimate rows (list prices per token class).
    for (const g of gw) {
      if (g.x_Month !== month || g.x_UseCase !== uc) continue;
      if (!Object.values(org.gateway.ccuLines).some((c) => c.models.includes(g.x_ModelId))) continue;
      const now = priceOn(prices, g.x_ModelId, g.x_TokenClass, g.x_Date);
      const ref = priceOn(prices, g.x_ModelId, g.x_TokenClass, refDate);
      if (now && ref) price += (g.ConsumedQuantity / 1e6) * (now.usdPerMTok - ref.usdPerMTok);
    }
    const change = cNow - cPrev;
    rows.push({ useCase: uc, previous: cPrev, current: cNow, change, volume, price, mix: change - volume - price, runsPrevious: rPrev, runsCurrent: rNow });
  }
  const aiPrev = cost(prev, isAi); const aiNow = cost(month, isAi);
  const tokenChange = sum(rows.map((r) => r.change));
  const fixedPrev = cost(prev, isFixed); const fixedNow = cost(month, isFixed);
  const fixedPlatform = fixedNow - fixedPrev;
  const unattributed = (aiNow - aiPrev) - tokenChange - fixedPlatform;
  const platform = fixedPlatform + unattributed;
  // What sits in the two buckets, by resource: fixed shared platform, and unattributed AI cost.
  const ucs = Object.keys(org.useCases);
  const other = {};
  for (const r of allocated) {
    if (!isAi(r) || (r.x_UseCase && ucs.includes(r.x_UseCase) && isToken(r))) continue;
    if (r.x_Month !== prev && r.x_Month !== month) continue;
    const o = other[r.ResourceName] ??= { resource: r.ResourceName, kind: isFixed(r) ? 'fixed' : 'unattributed', previous: 0, current: 0 };
    o[r.x_Month === prev ? 'previous' : 'current'] += r.EffectiveCost;
  }
  const otherByResource = Object.values(other).map((o) => ({ ...o, change: o.current - o.previous })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return {
    month, previousMonth: prev, previous: aiPrev, current: aiNow, change: aiNow - aiPrev, rows,
    volume: sum(rows.map((r) => r.volume)), price: sum(rows.map((r) => r.price)), mix: sum(rows.map((r) => r.mix)), platform, otherByResource,
    fixedPlatform, unattributed, fixedPrevious: fixedPrev, fixedCurrent: fixedNow,
    unattributedPrevious: aiPrev - fixedPrev - sum(rows.map((r) => r.previous)), unattributedCurrent: aiNow - fixedNow - sum(rows.map((r) => r.current)),
  };
}
