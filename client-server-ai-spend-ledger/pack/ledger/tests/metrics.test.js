import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, outcomeTotals, costPerSuccess, failedShareOfCost, cacheStats, unitEconomics } from '../metrics.js';
import { org, prices, gwRow } from './fixtures.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('percentile interpolates between closest ranks', () => {
  close(percentile([4, 1, 3, 2], 0.5), 2.5);   // sorted 1 2 3 4, h = 1.5
  close(percentile([1, 2, 3, 4], 0.9), 3.7);   // h = 2.7: 3 + 0.7 x (4 - 3)
  assert.equal(percentile([5], 0.9), 5);
  assert.equal(percentile([], 0.5), null);
  close(percentile([2, NaN, 4], 0.5), 3);       // non-numbers are ignored
});

test('failed, retried and discarded runs are counted as cost', () => {
  const t = outcomeTotals([{ runs: '100', successful: '60', failed: '10', retried: '10', discarded: '30', review_minutes: '90' }]);
  // $120 over 60 successes is $2.00 each, not $1.20 per run
  close(costPerSuccess(120, t.successful), 2);
  close(120 / t.runs, 1.2);
  close(failedShareOfCost(t), 0.4);              // (10 + 30) / 100
  assert.equal(costPerSuccess(120, 0), null);    // no success: no unit cost, never infinity
});

test('cache hit rate and cache cost efficiency, including writes never read back', () => {
  const day = '2026-10-05';
  // Claude: 1M read at $0.10 and 1M written at $2.50; without caching 2M at $2.00 = $4.00
  const good = cacheStats([
    gwRow({ date: day, model: 'claude-sonnet-5.5', cls: 'cachedInput', qty: 1e6, list: 0.10 }),
    gwRow({ date: day, model: 'claude-sonnet-5.5', cls: 'cacheWrite', qty: 1e6, list: 2.50 }),
  ], prices);
  close(good.hitRate, 0.5);
  close(good.costEfficiency, (4 - 2.6) / 4);    // 0.35
  // Writes with no reads: $2.50 paid where uncached input would have cost $2.00
  const bad = cacheStats([gwRow({ date: day, model: 'claude-sonnet-5.5', cls: 'cacheWrite', qty: 1e6, list: 2.50 })], prices);
  close(bad.hitRate, 0);
  close(bad.costEfficiency, -0.25);
  assert.ok(bad.costEfficiency < 0);
  // Azure: 1M input with 200k cached on GPT-5.4 mini, no write charge
  const az = cacheStats([
    gwRow({ date: day, model: 'gpt-5.4-mini', cls: 'input', qty: 8e5, list: 0.6 }),
    gwRow({ date: day, model: 'gpt-5.4-mini', cls: 'cachedInput', qty: 2e5, list: 0.015 }),
  ], prices);
  close(az.hitRate, 0.2);
  close(az.costEfficiency, (0.75 - 0.615) / 0.75);   // 0.18
});

test('unit economics: monthly cost per success and P50, P90 of daily cost per success', () => {
  const mk = (date, cost) => ({ x_Date: date, x_Month: '2026-10', x_UseCase: 'kyc-review', ServiceCategory: 'AI and Machine Learning', EffectiveCost: cost, AllocatedMethodId: 'gateway-cost-share', x_ModelId: null });
  const allocated = [mk('2026-10-01', 10), mk('2026-10-02', 30), mk('2026-10-03', 8)];
  const outcomes = [
    { date: '2026-10-01', use_case: 'kyc-review', runs: 8, successful: 5, failed: 1, retried: 1, discarded: 2, review_minutes: 30 },
    { date: '2026-10-02', use_case: 'kyc-review', runs: 12, successful: 10, failed: 1, retried: 1, discarded: 1, review_minutes: 60 },
    { date: '2026-10-03', use_case: 'kyc-review', runs: 5, successful: 2, failed: 2, retried: 2, discarded: 1, review_minutes: 12 },
  ];
  const ue = unitEconomics({ allocated, gw: [], outcomes, prices, org, month: '2026-10' })['kyc-review'];
  close(ue.spend, 48);
  close(ue.costPerSuccess, 48 / 17);             // 2.8235...
  // daily: 10/5 = 2, 30/10 = 3, 8/2 = 4 -> P50 3, P90 3.8
  close(ue.p50, 3);
  close(ue.p90, 3.8);
  close(ue.failedShareOfCost, (4 + 4) / 25);    // failed 4 + discarded 4 of 25 runs
  close(ue.successRate, 17 / 25);
  close(ue.reviewMinutesPerSuccess, 102 / 17);
});
