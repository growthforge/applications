import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whatIf, clampInputs, WHATIF_SPEC } from '../whatif.js';
import { prices } from './fixtures.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const D = '2026-10-31';
const base = { triageModel: 'none', draftModel: 'gpt-5.4-mini', hardShare: 0, inputTokens: 10000, outputTokens: 1000, cacheHitRate: 0,
  batchShare: 0, failureRate: 0, reviewMinutes: 0, costPerMinute: 0, volume: 1000 };

test('hand-computed fixture: one mini call per ticket', () => {
  const r = whatIf(base, prices, D);
  // 10,000 x $0.75 + 1,000 x $4.50 per 1M = 0.0075 + 0.0045
  close(r.perRun, 0.012); close(r.modelPerSuccess, 0.012); close(r.monthlyModel, 12);
  close(r.reviewPerSuccess, 0); close(r.reviewShare, 0);
});

test('failed attempts and review time are paid for by each accepted draft', () => {
  const r = whatIf({ ...base, failureRate: 0.2, reviewMinutes: 1, costPerMinute: 0.8 }, prices, D);
  close(r.modelPerSuccess, 0.012 / 0.8);        // 0.015
  close(r.reviewPerSuccess, 0.8 / 0.8);         // 1.00
  close(r.totalPerSuccess, 1.015);
  close(r.reviewShare, 1 / 1.015);
  assert.ok(r.reviewPerSuccess > r.modelPerSuccess);   // review time outweighs the model bill
});

test('cache, batch, hard-case share and triage move the cost the right way', () => {
  // 50% cache: input at (0.5 x 0.75 + 0.5 x 0.075) = 0.4125 per 1M
  close(whatIf({ ...base, cacheHitRate: 0.5 }, prices, D).perRun, 0.004125 + 0.0045);
  close(whatIf({ ...base, batchShare: 1 }, prices, D).perRun, 0.006);                     // Batch is 50% off
  close(whatIf({ ...base, hardShare: 1 }, prices, D).perRun, 0.025 + 0.015);              // all on GPT-5.4
  close(whatIf({ ...base, triageModel: 'gpt-5.4-nano' }, prices, D).perRun, 0.012 + 0.0005 + 0.000075);
});

test('inputs are clamped: no negative, infinite or NaN results at the extremes', () => {
  const x = clampInputs({ failureRate: 1.5, inputTokens: -5, outputTokens: 'abc', cacheHitRate: 2, batchShare: -1, volume: 1e12, draftModel: 'gpt-9', triageModel: '' });
  assert.equal(x.failureRate, WHATIF_SPEC.failureRate.max);
  assert.equal(x.inputTokens, WHATIF_SPEC.inputTokens.min);
  assert.equal(x.outputTokens, WHATIF_SPEC.outputTokens.default);
  assert.equal(x.cacheHitRate, WHATIF_SPEC.cacheHitRate.max);
  assert.equal(x.batchShare, 0);
  assert.equal(x.volume, WHATIF_SPEC.volume.max);
  assert.equal(x.draftModel, WHATIF_SPEC.draftModel.default);
  assert.equal(x.triageModel, WHATIF_SPEC.triageModel.default);
  const corners = [];
  for (const k of Object.keys(WHATIF_SPEC)) {
    const s = WHATIF_SPEC[k];
    if (s.options) for (const o of s.options) corners.push({ [k]: o });
    else corners.push({ [k]: s.min }, { [k]: s.max });
  }
  corners.push(Object.fromEntries(Object.entries(WHATIF_SPEC).map(([k, s]) => [k, s.options ? s.options[s.options.length - 1] : s.max])));
  corners.push(Object.fromEntries(Object.entries(WHATIF_SPEC).map(([k, s]) => [k, s.options ? s.options[0] : s.min])));
  for (const c of corners) {
    const r = whatIf(c, prices, D);
    for (const [k, v] of Object.entries(r)) {
      if (k === 'inputs') continue;
      assert.ok(Number.isFinite(v) && v >= 0, `${k}=${v} for ${JSON.stringify(c)}`);
    }
    assert.ok(r.reviewShare <= 1);
  }
});

test('defaults passed in replace missing or broken inputs', () => {
  const r = clampInputs({ inputTokens: '' }, { inputTokens: 16500 });
  assert.equal(r.inputTokens, 16500);
});
