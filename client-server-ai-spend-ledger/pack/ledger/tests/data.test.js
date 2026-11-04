// Integration checks on the committed illustrative data: the same run the pages make at load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadData, DATA_DIR } from '../node-load.js';
import { buildLedger } from '../index.js';
import { num } from '../csv.js';
import { isAi } from '../allocate.js';

const L = buildLedger(loadData());
const sum = (a) => a.reduce((s, x) => s + x, 0);
const near = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));

test('the generator is reproducible: same seed, byte-identical files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const gen = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools', 'generate-data.mjs');
  execFileSync(process.execPath, [gen, '--out', dir], { env: { ...process.env, QUIET: '1' } });
  for (const f of ['focus_export.csv', 'token_metrics.csv', 'outcomes.csv', 'vm_utilisation.csv']) {
    assert.equal(fs.readFileSync(path.join(dir, f), 'utf8'), fs.readFileSync(path.join(DATA_DIR, f), 'utf8'), f);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('every price row is cited and dated', () => {
  for (const r of L.prices.rows) {
    assert.match(r.src, /^S1[012]$/);
    assert.match(r.readOn, /^2026-11-0[34]$/);
    assert.ok(L.prices.sources[r.src], 'source URL for ' + r.src);
    assert.ok(r.usdPerMTok > 0);
  }
});

test('outcomes add up: successful + failed + discarded = runs; retries are modelled on their own', () => {
  for (const o of L.outcomes) {
    assert.equal(num(o.successful) + num(o.failed) + num(o.discarded), num(o.runs), JSON.stringify(o));
    assert.ok(num(o.retried) <= num(o.runs));
  }
  const copies = L.outcomes.filter((o) => num(o.retried) === num(o.failed)).length;
  assert.ok(copies < L.outcomes.length / 10, `retried equals failed on ${copies} rows`);
});

test('the synthetic bill keeps one unit price per SKU and a unit that fits the service', () => {
  const prices = {};
  for (const r of L.billed) (prices[r.SkuId] ??= new Set()).add(r.ListUnitPrice);
  for (const [sku, set] of Object.entries(prices)) assert.equal(set.size, 1, sku);
  const unit = Object.fromEntries(L.billed.map((r) => [r.ServiceName, r.ConsumedUnit]));
  assert.equal(unit['Storage Accounts'], 'GB-Months');
  assert.equal(unit['Log Analytics'], 'GB');
  assert.equal(unit['Virtual Machines'], 'Hours');
  assert.equal(unit['Azure OpenAI'], 'Tokens');
});

test('allocation sums to 100% of billed cost in every month', () => {
  assert.equal(L.checks.allocationSumsToBill, true);
  for (const m of L.months) {
    const a = L.allocation[m];
    assert.ok(near(sum(Object.values(a.byOwner)), a.billedTotal), m);
    assert.ok(a.ownedPct > 0 && a.ownedPct < 1);
    assert.ok(a.unallocated > 0, 'unallocated stays visible');
  }
});

test('the invoice is the source of truth: allocated AI cost equals billed AI cost', () => {
  for (const m of L.months) {
    const billedAi = sum(L.billed.filter((r) => r.x_Month === m && isAi(r)).map((r) => r.EffectiveCost));
    assert.ok(near(L.aiTotals[m], billedAi), m);
  }
});

test('reconciliation gap is explained and the bypass is found', () => {
  const r = L.reconciliation[L.month];
  assert.ok(near(r.totals.gap, r.totals.unmetered - r.totals.discount + r.totals.residual, 1e-6));
  assert.ok(Math.abs(r.totals.residual) < 0.01, 'no stale price rows: the residual is only the bill rounding costs to six decimals');
  assert.equal(r.priceMismatches.length, 0);
  assert.ok(r.totals.coverage > 0 && r.totals.coverage < 1);
  assert.deepEqual(r.bypass.map((b) => b.label), ['gpt54-sandbox']);
  for (const l of r.lines) assert.ok(l.coverage >= 0 && l.coverage <= 1, l.label);
});

test('cost per successful outcome includes failed and discarded runs', () => {
  for (const u of Object.values(L.ue[L.month])) {
    assert.ok(u.costPerSuccess > u.costPerRun, u.useCase);
    assert.ok(near(u.costPerSuccess, u.spend / u.successful));
    assert.ok(u.p50 <= u.p90);
  }
});

test('October carries one dated price change and the variance adds up', () => {
  assert.deepEqual(L.modelChanges, [{ deployment: 'gpt-support-hard', from: 'gpt-5.2', to: 'gpt-5.4', date: '2026-10-08' }]);
  const v = L.variance;
  assert.ok(near(v.calendar + v.volume + v.mix + v.price + v.platform, v.change, 1e-9));
  assert.ok(near(v.fixedPlatform + v.unattributed, v.platform, 1e-9), 'the two buckets make up the rest');
  assert.ok(near(v.fixedCurrent + v.unattributedCurrent + v.rows.reduce((s, r) => s + r.current, 0), v.current, 1e-9));
  assert.equal(v.daysCurrent, 31); assert.equal(v.daysPrevious, 30);
  assert.ok(v.price > 0);
  assert.equal(v.rows.filter((r) => r.price !== 0).map((r) => r.useCase).join(), 'support-assistant');
});

test('budgets: 115% of baseline, alerts in a sensible order', () => {
  for (const b of L.budget) {
    assert.ok(near(b.budget, b.baseline * 1.15));
    const a = Object.fromEntries(b.alerts.map((x) => [x.type + x.threshold, x]));
    if (a['actual0.8'].crossedOn && a.actual1.crossedOn) assert.ok(a['actual0.8'].crossedOn <= a.actual1.crossedOn);
    if (a.actual1.crossedOn) assert.ok(b.actual >= b.budget);
    else assert.ok(b.actual < b.budget);
  }
  // Financial Crime is charged the metered part of the CCU line; the unmetered rest stays unallocated.
  const ccuIds = Object.keys(L.org.gateway.ccuLines);
  const ccuRows = L.allocated.filter((r) => r.x_Month === L.month && ccuIds.includes(r.ResourceId));
  const finCcu = sum(ccuRows.filter((r) => r.x_Owner === 'fincrime').map((r) => r.EffectiveCost));
  const held = sum(ccuRows.filter((r) => r.AllocatedMethodId === 'unmetered-remainder').map((r) => r.EffectiveCost));
  const ccu = L.budget.find((b) => b.id === 'ccu-meter');
  assert.ok(held > 0);
  assert.ok(near(finCcu + held, ccu.actual, 1e-9));
});

test('levers: savings never exceed eligible cost or the remaining base', () => {
  for (const l of L.levers.levers) {
    if (l.saving === null) continue;
    assert.ok(l.saving >= 0, l.id);
    if (l.eligibleCost !== null) assert.ok(l.saving <= l.eligibleCost + 1e-9, l.id);
    if (l.check) assert.ok(l.check.target <= l.check.current + 1e-12, l.id);
  }
  for (const [uc, s] of Object.entries(L.levers.scopes)) assert.ok(s.saved <= s.start, uc);
  const t = L.levers.totals;
  assert.ok(t.measured <= t.measuredAndAssumption && t.measuredAndAssumption <= t.all);
  for (const l of L.levers.levers.filter((x) => ['on hold', 'blocked'].includes(x.status))) assert.ok(!l.saving);
  for (const l of L.levers.levers.filter((x) => ['validated', 'realised'].includes(x.status))) assert.equal(l.grade, 'measured', l.id);
});

test('each decision follows the rule from its own avoidable cost, value and quality bar', () => {
  const r = L.org.decision;
  for (const [uc, d] of Object.entries(L.decisions)) {
    const u = L.ue[L.month][uc];
    assert.ok(near(d.avoidableCostPerSuccess, u.avoidableSpend / u.successful), uc);
    const ratio = d.valuePerSuccess / d.avoidableCostPerSuccess;
    const expected = ratio <= r.stopBelowValueToCost ? 'stop' : (u.successRate < d.qualityBar || ratio < r.scaleFromValueToCost) ? 'fix' : 'scale';
    assert.equal(d.decision, expected, uc);
    assert.ok(u.avoidableSpend <= u.spend + 1e-9);
  }
});

test('the what-if at the measured defaults is finite and shows review outweighing the model bill', () => {
  const w = L.whatifBase;
  assert.ok(Number.isFinite(w.totalPerSuccess) && w.totalPerSuccess > 0);
  assert.ok(w.reviewShare > 0.5);
});

test('unmetered usage is held as unallocated, never charged to a team', () => {
  for (const r of L.allocated.filter((x) => x.AllocatedMethodId === 'unmetered-remainder')) {
    assert.equal(r.x_Owner, 'unallocated'); assert.equal(r.x_UseCase, null);
  }
  assert.ok(L.allocation[L.month].unallocatedByCause.unmetered > 0);
});

test('the AI gateway is AI spend, split by gateway requests', () => {
  const g = L.allocated.filter((r) => r.x_Month === L.month && r.ResourceName === 'apim-ai-gateway');
  assert.ok(g.length > 0 && g.every((r) => r.AllocatedMethodId === 'gateway-request-share' && isAi(r)));
  const billed = sum(L.billed.filter((r) => r.x_Month === L.month && r.ResourceName === 'apim-ai-gateway').map((r) => r.EffectiveCost));
  assert.ok(near(sum(g.map((r) => r.EffectiveCost)), billed, 1e-9));
});

test('the KYC incident is found from the data and its retry cap is a guardrail, not a saving', () => {
  const a = L.anomalies.find((x) => x.useCase === 'kyc-review');
  assert.ok(a, 'incident found');
  assert.deepEqual(a.dates, ['2026-10-14', '2026-10-15', '2026-10-16']);
  assert.ok(a.rate > 3 * a.baselineRate);
  assert.ok(a.shareOfMonthExcess > 0.8);
  const g = L.levers.levers.find((l) => l.id === 'kyc-retry-cap');
  assert.equal(g.status, 'guardrail'); assert.equal(g.saving, null);
  assert.ok(Math.abs(g.guardrailCost - a.excessCost) < 1e-9);
});

test('commitment: pay-as-you-go floor times (1 - d), d from the savings plan price', () => {
  const c = L.commitment;
  const sku = L.prices.azureRetail.rows.find((r) => r.key === 'd16s-v5');
  assert.ok(near(c.savingsPlanDiscount, 1 - sku.savingsPlan['1 Year'] / sku.usd, 1e-12));
  assert.ok(near(c.commitmentPerHour, c.computeFloorPerHour * (1 - c.savingsPlanDiscount), 1e-12));
  assert.ok(c.commitmentPerHour < c.computeFloorPerHour);
});

test('routing is priced from the price sheet: GPT-5.4 mini at 30% of GPT-5.4', () => {
  const l = L.levers.levers.find((x) => x.id === 'support-routing');
  assert.ok(Math.abs(l.priceRatio - 0.3) < 1e-9);
  assert.equal(l.grade, 'assumption-based');
});
