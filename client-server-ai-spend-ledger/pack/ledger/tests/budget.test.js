import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineOf, budgetOf, evaluateBudget, driverForecast, trailingMeanForecast, variance } from '../budget.js';
import { datesOfMonth } from '../dates.js';
import { org, prices } from './fixtures.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('baseline is the mean of the two prior months; budget is 115% of it', () => {
  const b = baselineOf({ '2026-08': 2000, '2026-09': 2600, '2026-10': 9999 }, '2026-10');
  close(b, 2300);
  close(budgetOf(b, 1.15), 2645);
  assert.equal(baselineOf({ '2026-09': 2600 }, '2026-10'), null);   // two months of history needed
  assert.equal(budgetOf(null, 1.15), null);
});

// October: $60 a day (6 runs) for ten days, then $120 a day (12 runs). Budget $2,645.
// One-day windows make the driver forecast easy to work by hand: forecast(d) = MTD(d) + days left x cost(d).
function stepSeries() {
  const total = {}; const cost = {}; const runs = {};
  for (const d of [...datesOfMonth('2026-09'), ...datesOfMonth('2026-10')]) {
    const high = d >= '2026-10-11';
    total[d] = high ? 120 : 60; cost[d] = total[d]; runs[d] = high ? 12 : 6;
  }
  return { total, byUc: { u: cost }, runs: { u: runs } };
}
const cfg = { thresholds: [0.8, 1.0], forecastThreshold: 1.0, dataLagDays: 1, trailingDaysForUnitCost: 1, trailingDaysForVolume: 1 };

test('driver forecast: runs x cost per run for the days left', () => {
  const s = stepSeries();
  close(driverForecast(s, '2026-10', '2026-10-10', cfg), 600 + 21 * 60);     // 1,860
  close(driverForecast(s, '2026-10', '2026-10-11', cfg), 720 + 20 * 120);    // 3,120
  close(trailingMeanForecast(s, '2026-10', '2026-10-11'), (720 / 11) * 31);  // 2,029.09
  close(driverForecast(s, '2026-10', '2026-10-31', cfg), 3120);              // month end = actual
});

test('alerts fire on the expected days (raised the day after the data crosses)', () => {
  const ev = evaluateBudget(stepSeries(), '2026-10', 2645, cfg);
  const by = Object.fromEntries(ev.alerts.map((a) => [a.type + a.threshold, a]));
  // forecast: 3,120 >= 2,645 first on 11 Oct
  assert.equal(by.forecast1.crossedOn, '2026-10-11'); assert.equal(by.forecast1.raisedOn, '2026-10-12');
  // 80% = 2,116: 600 + 120 x 12 = 2,040 on the 22nd, 2,160 on the 23rd
  assert.equal(by['actual0.8'].crossedOn, '2026-10-23'); assert.equal(by['actual0.8'].raisedOn, '2026-10-24');
  // 100% = 2,645: 2,640 on the 27th (just under), 2,760 on the 28th
  assert.equal(by.actual1.crossedOn, '2026-10-28'); assert.equal(by.actual1.raisedOn, '2026-10-29');
  close(ev.actual, 3120);
  close(ev.pctOfBudget, 3120 / 2645);
});

test('no alert when spend stays under budget', () => {
  const ev = evaluateBudget(stepSeries(), '2026-10', 10000, cfg);
  assert.ok(ev.alerts.every((a) => a.crossedOn === null && a.raisedOn === null));
});

test('variance: volume, price and mix add up to the change, with platform cost apart', () => {
  const row = (date, model, qty, cost, extra = {}) => ({ x_Date: date, x_Month: date.slice(0, 7), x_UseCase: 'support-assistant', ServiceCategory: 'AI and Machine Learning',
    AllocatedMethodId: 'gateway-token-share', x_ModelId: model, ConsumedUnit: 'Tokens', ResourceId: '/d/hard', x_Deployment: 'hard',
    x_TokenDirection: 'Input', x_TokenCacheAction: 'Uncached', ConsumedQuantity: qty, ListCost: cost, EffectiveCost: cost, ...extra });
  const search = (date, cost) => ({ x_Date: date, x_Month: date.slice(0, 7), x_UseCase: 'support-assistant', ServiceCategory: 'AI and Machine Learning',
    AllocatedMethodId: 'retrieval-call-share', x_ModelId: null, ConsumedUnit: 'Hours', ResourceId: '/s', x_Deployment: null, EffectiveCost: cost, ListCost: cost });
  const allocated = [
    row('2026-09-10', 'gpt-5.2', 1e6, 1.75),           // September: 1M input on GPT-5.2 at $1.75
    row('2026-10-05', 'gpt-5.2', 6e5, 1.05),           // October: 0.6M still on GPT-5.2
    row('2026-10-20', 'gpt-5.4', 8e5, 2.00),           // then 0.8M on GPT-5.4 at $2.50
    search('2026-09-10', 10), search('2026-10-10', 12),
  ];
  const outcomes = [{ date: '2026-09-10', use_case: 'support-assistant', runs: 100 }, { date: '2026-10-10', use_case: 'support-assistant', runs: 120 }];
  const o = { ...org, useCases: { 'support-assistant': org.useCases['support-assistant'] } };
  const v = variance({ allocated, gw: [], outcomes, prices, org: o, month: '2026-10' });
  const r = v.rows[0];
  close(r.volume, 20 * (1.75 / 100));                 // 0.35
  close(r.price, 0.8 * (2.50 - 1.75));                // 0.60: only the GPT-5.4 tokens changed price
  close(r.mix, (3.05 - 1.75) - 0.35 - 0.60);          // 0.35: 0.2M more tokens than volume explains, at $1.75
  close(v.platform, 2);
  close(v.change, 3.30);
  close(v.volume + v.price + v.mix + v.platform, v.change);
});
