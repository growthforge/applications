import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStep, gradeOf, cacheLeverEffect, statusFor, promptTokensPerCall } from '../levers.js';
import { sharedReallocation } from '../index.js';
import { decide, valuePerOutcome } from '../decision.js';
import { compareTask, taskCost } from '../compare.js';
import { org, prices } from './fixtures.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('levers apply in sequence on the remaining base', () => {
  const r = { input: 600, output: 400, hard: { input: 200, output: 100 } };
  // routing: 40% of the $300 hard path is eligible ($120), 60% of it saved ($72), split 2:1 input:output
  const a = applyStep(r, 'hard-path', 0.4, 0.6);
  close(a.eligible, 120); close(a.saving, 72);
  close(r.input, 552); close(r.output, 376); close(r.hard.input, 152); close(r.hard.output, 76);
  // caching on what is left of input: 552 x 0.236
  const b = applyStep(r, 'input', 1, 0.236);
  close(b.eligible, 552); close(b.saving, 130.272);
  // output cap on what is left of output: 376 x 10%
  const c = applyStep(r, 'output', 1, 0.1);
  close(c.saving, 37.6);
  const sequential = a.saving + b.saving + c.saving;
  close(sequential, 239.872);
  // adding the levers independently would have claimed 72 + 600 x 0.236 + 400 x 0.1 = 253.6
  assert.ok(sequential < 72 + 600 * 0.236 + 400 * 0.1);
});

test('a saving never exceeds its eligible cost, and the pipeline never exceeds the base', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 500; k++) {
    const r = { input: rnd() * 1000, output: rnd() * 1000 };
    r.hard = { input: r.input * rnd(), output: r.output * rnd() };
    const base = r.input + r.output;
    let saved = 0;
    for (let s = 0; s < 6; s++) {
      const comp = ['input', 'output', 'all', 'hard-path'][Math.floor(rnd() * 4)];
      const before = comp === 'hard-path' ? r.hard.input + r.hard.output : comp === 'all' ? r.input + r.output : r[comp];
      const step = applyStep(r, comp, rnd() * 1.5 - 0.2, rnd() * 1.5 - 0.2);   // includes out-of-range inputs
      assert.ok(step.saving <= step.eligible + 1e-9);
      assert.ok(step.eligible <= before + 1e-9);
      assert.ok(step.saving >= 0);
      saved += step.saving;
      for (const v of [r.input, r.output, r.hard.input, r.hard.output]) assert.ok(v >= -1e-9);
      assert.ok(r.hard.input <= r.input + 1e-9 && r.hard.output <= r.output + 1e-9);
    }
    assert.ok(saved <= base + 1e-9);
  }
});

test('cache lever effect from the price sheet: 18% to 40% hit rate at a 90% read discount', () => {
  // 0.9 x (0.40 - 0.18) / (1 - 0.9 x 0.18) = 0.198 / 0.838
  close(cacheLeverEffect(0.18, 0.40, 0.9), 0.198 / 0.838);
  assert.equal(cacheLeverEffect(0.5, 0.4, 0.9), 0);     // a lower target never adds cost
  assert.ok(cacheLeverEffect(0, 1, 1) <= 1);
});

test('the achievable cache hit rate comes from the stable prefix share of the prompt', () => {
  const metrics = [
    { date: '2026-10-01', use_case: 'u', model: 'm', input_tokens: '120000', requests: '10' },   // 12,000 per call
    { date: '2026-10-02', use_case: 'u', model: 'm', input_tokens: '200000', requests: '10' },   // 20,000 per call
    { date: '2026-10-02', use_case: 'u', model: 'text-embedding', input_tokens: '9999', requests: '50' },
  ];
  // 320,000 prompt tokens over 20 calls = 16,000 per call; a 4,000-token prefix is 25% of it
  close(promptTokensPerCall(metrics, 'u', '2026-10'), 16000);
  close(4000 / promptTokensPerCall(metrics, 'u', '2026-10'), 0.25);
  // from 17.5% to 25% at a 90% read discount: 0.9 x 0.075 / (1 - 0.9 x 0.175)
  close(cacheLeverEffect(0.175, 0.25, 0.9), 0.0675 / 0.8425);
});

test('only measured levers can be validated or realised', () => {
  assert.equal(statusFor({ status: 'validated' }, 'assumption-based'), 'identified');
  assert.equal(statusFor({ status: 'realised' }, 'Foundation prior'), 'identified');
  assert.equal(statusFor({ status: 'realised' }, 'measured'), 'realised');
  assert.equal(statusFor({ status: 'blocked' }, null), 'blocked');
});

test('stopping a use case re-spreads its share of the fixed tier over the other users', () => {
  const ue = {
    a: { useCase: 'a', fixedSharedSpend: 30, spend: 50, successful: 100, costPerSuccess: 0.5 },
    b: { useCase: 'b', fixedSharedSpend: 10, spend: 20, successful: 40, costPerSuccess: 0.5 },
    c: { useCase: 'c', fixedSharedSpend: 0, spend: 9, successful: 9, costPerSuccess: 1 },
  };
  const r = sharedReallocation(ue);
  // if b stops, its $10 moves to a (the only other user): a's loaded cost becomes (50 + 10) / 100
  close(r.b.moved, 10); assert.equal(r.b.to.length, 1); close(r.b.to[0].to, 0.6);
  // if a stops, its $30 moves to b: (20 + 30) / 40
  close(r.a.to[0].to, 1.25);
  assert.equal(r.c, undefined);
});

test('evidence grades follow the weakest input', () => {
  assert.equal(gradeOf({ eligible: { kind: 'measured' }, effect: { kind: 'measured' } }), 'measured');
  assert.equal(gradeOf({ eligible: { kind: 'measured' }, effect: { kind: 'price-sheet' } }), 'measured');
  assert.equal(gradeOf({ eligible: { kind: 'assumption' }, effect: { kind: 'price-sheet' } }), 'assumption-based');
  assert.equal(gradeOf({ eligible: { kind: 'measured' }, effect: { kind: 'assumption' } }), 'assumption-based');
  assert.equal(gradeOf({ eligible: { kind: 'assumption' }, effect: { kind: 'prior' } }), 'Foundation prior');
  assert.equal(gradeOf({ eligible: { kind: 'none' }, effect: { kind: 'none' } }), null);
});

test('scale, fix or stop from cost per outcome against value per outcome', () => {
  const rules = org.decision;
  close(valuePerOutcome({ minutesSaved: 3, loadedCostPerMinute: 0.8 }), 2.4);
  assert.equal(decide({ costPerSuccess: 1, valuePerSuccess: 0.5, successRate: 0.9, qualityBar: 0.8 }, rules).decision, 'stop');
  assert.equal(decide({ costPerSuccess: 1, valuePerSuccess: 1, successRate: 0.9, qualityBar: 0.8 }, rules).decision, 'stop');
  assert.equal(decide({ costPerSuccess: 1, valuePerSuccess: 2, successRate: 0.9, qualityBar: 0.8 }, rules).decision, 'fix');
  assert.equal(decide({ costPerSuccess: 1, valuePerSuccess: 5, successRate: 0.7, qualityBar: 0.8 }, rules).decision, 'fix');
  const s = decide({ costPerSuccess: 1, valuePerSuccess: 5, successRate: 0.9, qualityBar: 0.8 }, rules);
  assert.equal(s.decision, 'scale'); close(s.ratio, 5);
  assert.equal(decide({ costPerSuccess: null, valuePerSuccess: 5, successRate: 0, qualityBar: 0.8 }, rules).decision, 'fix');
});

test('cost per task across providers at the same token counts (no tokenizer conversion)', () => {
  const task = { inputTokens: 52000, outputTokens: 2600, measuredOn: 'claude-new' };
  const rows = Object.fromEntries(compareTask({ prices, date: '2026-10-31', task, models: ['claude-sonnet-5.5', 'gpt-5.4', 'gpt-5.4-mini'] }).map((r) => [r.model, r]));
  // Sonnet 5.5: 52,000 x $2 + 2,600 x $10 per 1M = 0.104 + 0.026
  close(rows['claude-sonnet-5.5'].costPerTask, 0.130); assert.equal(rows['claude-sonnet-5.5'].measured, true);
  // GPT-5.4 at the same counts: 52,000 x $2.50 + 2,600 x $15 = 0.13 + 0.039
  close(rows['gpt-5.4'].costPerTask, 0.169); assert.equal(rows['gpt-5.4'].measured, false);
  assert.equal(rows['gpt-5.4'].inputTokens, 52000);
  // GPT-5.4 mini: 52,000 x $0.75 + 2,600 x $4.50 = 0.039 + 0.0117
  close(rows['gpt-5.4-mini'].costPerTask, 0.0507);
  assert.equal(taskCost(prices, 'no-such-model', '2026-10-31', 1, 1), null);
});
