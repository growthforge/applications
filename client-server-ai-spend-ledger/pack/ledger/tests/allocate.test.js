import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, allocationSummary, ownerFromTags } from '../allocate.js';
import { reconcile } from '../reconcile.js';
import { org, prices, bill, gwRow, D, CCU_ID } from './fixtures.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const sum = (a) => a.reduce((s, x) => s + x, 0);

// One day of a small bill (total $250) and the gateway's view of it.
const billed = [
  bill({ dep: 'shared', model: 'gpt-5.4-mini', dir: 'Input', qty: 4e6, cost: 100, tags: { 'cost-pool': 'shared-ai-platform' } }),
  bill({ id: CCU_ID, name: 'ccu', service: 'Claude', unit: 'CCU', qty: 5000, cost: 50 }),
  bill({ name: 'search', service: 'Azure AI Search', cost: 30, tags: { 'cost-pool': 'shared-ai-platform' } }),
  bill({ name: 'vm-fraud', category: 'Compute', cost: 20, tags: { owner: 'fraud-analytics' }, rg: 'rg-platform' }),
  bill({ name: 'aks', category: 'Compute', cost: 40, rg: 'rg-platform' }),
  bill({ name: 'logs', category: 'Management and Governance', cost: 10, rg: 'rg-obs' }),
];
const gw = [
  gwRow({ dep: 'shared', model: 'gpt-5.4-mini', cls: 'input', qty: 3e6, team: 'customer-ops', uc: 'support-assistant', list: 2.25 }),
  gwRow({ dep: 'shared', model: 'gpt-5.4-mini', cls: 'input', qty: 1e6, team: 'engineering', uc: 'knowledge-assistant', list: 0.75 }),
  gwRow({ dep: 'kyc', model: 'claude-sonnet-5.5', cls: 'input', qty: 1e6, team: 'fincrime', uc: 'kyc-review', list: 40 }),
  gwRow({ dep: 'eval', model: 'claude-sonnet-5.5', cls: 'output', qty: 1e6, team: 'engineering', uc: 'knowledge-assistant', list: 10 }),
];
const requests = { [D + '|embed']: { 'support-assistant': 100, 'knowledge-assistant': 300 } };

test('every billed dollar is allocated once: the split sums to 100% of the bill', () => {
  const rows = allocate(billed, gw, requests, org);
  close(sum(rows.map((r) => r.EffectiveCost)), 250);
  for (let i = 0; i < billed.length; i++) close(sum(rows.filter((r) => r.x_SourceRow === i).map((r) => r.BilledCost)), billed[i].BilledCost);
});

test('gateway shares split a shared deployment by tokens of the same class', () => {
  const rows = allocate(billed, gw, requests, org).filter((r) => r.x_SourceRow === 0);
  // 3M and 1M tokens of $100: 75 and 25
  const by = Object.fromEntries(rows.map((r) => [r.x_UseCase, r]));
  close(by['support-assistant'].BilledCost, 75);
  close(by['knowledge-assistant'].BilledCost, 25);
  assert.equal(by['support-assistant'].AllocatedMethodId, 'gateway-token-share');
  assert.equal(by['support-assistant'].AllocatedResourceId, billed[0].ResourceId);
});

test('the aggregated CCU line is split by list-price estimate, not raw tokens', () => {
  const rows = allocate(billed, gw, requests, org).filter((r) => r.x_SourceRow === 1);
  // estimates $40 and $10 of $50: 40 and 10, although both teams used 1M tokens
  const by = Object.fromEntries(rows.map((r) => [r.x_Owner, r]));
  close(by.fincrime.BilledCost, 40);
  close(by.engineering.BilledCost, 10);
  assert.equal(by.fincrime.AllocatedMethodId, 'gateway-cost-share');
});

test('the shared platform is split by retrieval calls', () => {
  const rows = allocate(billed, gw, requests, org).filter((r) => r.x_SourceRow === 2);
  // 100 and 300 calls of $30: 7.5 and 22.5
  const by = Object.fromEntries(rows.map((r) => [r.x_UseCase, r]));
  close(by['support-assistant'].BilledCost, 7.5);
  close(by['knowledge-assistant'].BilledCost, 22.5);
  assert.equal(by['support-assistant'].AllocatedMethodId, 'retrieval-call-share');
});

test('tags: the resource tag wins over the inherited one; no tag stays unallocated', () => {
  assert.deepEqual(ownerFromTags(bill({ name: 'v', tags: { owner: 'fraud-analytics' }, rg: 'rg-platform' }), org), { owner: 'fraud-analytics', method: 'resource-tag' });
  assert.deepEqual(ownerFromTags(bill({ name: 'a', rg: 'rg-platform' }), org), { owner: 'engineering', method: 'inherited-tag' });
  assert.deepEqual(ownerFromTags(bill({ name: 'l', rg: 'rg-obs' }), org), { owner: 'unallocated', method: 'unallocated' });
});

test('a token line the gateway never saw falls back to its tags', () => {
  const rows = allocate([bill({ dep: 'sandbox', model: 'gpt-5.4', dir: 'Input', qty: 1e6, cost: 5, tags: { owner: 'engineering' } })], gw, requests, org);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].x_Owner, 'engineering');
  assert.equal(rows[0].AllocatedMethodId, 'resource-tag');
});

test('summary: owners, unallocated and the Crawl, Walk, Run stage', () => {
  const rows = allocate(billed, gw, requests, org);
  const s = allocationSummary(rows, billed, D.slice(0, 7), org);
  // customer-ops 75 + 7.5; engineering 25 + 10 + 22.5 + 40; fincrime 40; fraud 20; unallocated 10
  close(s.byOwner['customer-ops'], 82.5);
  close(s.byOwner.engineering, 97.5);
  close(s.byOwner.fincrime, 40);
  close(s.byOwner['fraud-analytics'], 20);
  close(s.unallocated, 10);
  close(s.ownedPct, 240 / 250);
  assert.equal(s.stage, 'Run');
  close(s.allocatedTotal, s.billedTotal);
  close(s.unallocatedGroups['rg-obs'], 10);
});

test('reconciliation: the gap is unmetered usage minus the discount, and the residual is zero', () => {
  const lines = [
    // 2M tokens billed at $0.75 per 1M: list $1.50, billed $1.425 after a 5% discount
    bill({ dep: 'mini', model: 'gpt-5.4-mini', dir: 'Input', qty: 2e6, unitPrice: 0.75, list: 1.5, cost: 1.425 }),
    bill({ id: CCU_ID, name: 'ccu', unit: 'CCU', qty: 1000, list: 10, cost: 10 }),
    bill({ dep: 'sandbox', model: 'gpt-5.4', dir: 'Input', qty: 2e6, unitPrice: 2.5, list: 5, cost: 4.75 }),
  ];
  const g = [
    gwRow({ dep: 'mini', model: 'gpt-5.4-mini', cls: 'input', qty: 1.8e6, team: 't', uc: 'u', list: 1.35 }),
    gwRow({ dep: 'kyc', model: 'claude-sonnet-5.5', cls: 'input', qty: 1e6, team: 'fincrime', uc: 'kyc-review', list: 2 }),
    gwRow({ dep: 'kyc', model: 'claude-sonnet-5.5', cls: 'output', qty: 7e5, team: 'fincrime', uc: 'kyc-review', list: 7 }),
  ];
  const r = reconcile(lines, g, prices, org, '2026-10');
  const by = Object.fromEntries(r.lines.map((x) => [x.label, x]));
  // mini: estimate 1.35; unmetered 0.2M x 0.75 = 0.15; discount 0.075; gap 1.425 - 1.35 = 0.075 = 0.15 - 0.075
  close(by.mini.estimate, 1.35); close(by.mini.unmetered, 0.15); close(by.mini.discount, 0.075); close(by.mini.residual, 0);
  close(by.mini.billed - by.mini.estimate, by.mini.unmetered - by.mini.discount + by.mini.residual);
  close(by.mini.coverage, 0.9); assert.equal(by.mini.status, 'partial');
  // CCU: estimate 2 + 7 = 9 of 10 billed: 1 unmetered, coverage 0.9
  const ccu = by['Claude (CCU line)'];
  close(ccu.estimate, 9); close(ccu.unmetered, 1); close(ccu.coverage, 0.9);
  // sandbox: billed with no metered calls at all
  assert.equal(by.sandbox.status, 'bypass');
  assert.equal(r.bypass.length, 1);
  close(r.totals.gap, r.totals.unmetered - r.totals.discount + r.totals.residual);
  assert.equal(r.priceMismatches.length, 0);
});

test('reconciliation: a stale price row shows up as a residual and a mismatch', () => {
  const lines = [bill({ dep: 'mini', model: 'gpt-5.4-mini', dir: 'Input', qty: 1e6, unitPrice: 0.80, list: 0.80, cost: 0.80 })];
  const g = [gwRow({ dep: 'mini', model: 'gpt-5.4-mini', cls: 'input', qty: 1e6, team: 't', uc: 'u', list: 0.75 })];
  const r = reconcile(lines, g, prices, org, '2026-10');
  // all tokens metered, so nothing unmetered; the $0.05 left is the bill disagreeing with the sheet
  close(r.lines[0].unmetered, 0); close(r.lines[0].residual, 0.05);
  assert.equal(r.priceMismatches.length, 1);
});

test('what the gateway did not meter stays unallocated', () => {
  // 5M tokens billed for $125, 4M metered (3M support, 1M knowledge): 80% split 3:1, 20% held
  const rows = allocate([bill({ dep: 'shared', model: 'gpt-5.4-mini', dir: 'Input', qty: 5e6, cost: 125 })], gw, requests, org);
  const by = (pred) => sum(rows.filter(pred).map((r) => r.BilledCost));
  close(by((r) => r.x_UseCase === 'support-assistant'), 75);
  close(by((r) => r.x_UseCase === 'knowledge-assistant'), 25);
  close(by((r) => r.AllocatedMethodId === 'unmetered-remainder' && r.x_Owner === 'unallocated'), 25);
  close(by(() => true), 125);
  // a CCU line of $60 against $50 of metered estimate: $10 held
  const ccu = allocate([bill({ id: CCU_ID, name: 'ccu', unit: 'CCU', qty: 6000, cost: 60 })], gw, requests, org);
  close(sum(ccu.filter((r) => r.AllocatedMethodId === 'unmetered-remainder').map((r) => r.BilledCost)), 10);
  close(sum(ccu.filter((r) => r.x_Owner === 'fincrime').map((r) => r.BilledCost)), 40);
});

test('the AI gateway pool is split by gateway requests across all deployments', () => {
  const o = { ...org, allocation: { ...org.allocation, pools: { ...org.allocation.pools, 'ai-gateway': { method: 'gateway-request-share' } } } };
  const req = { [D + '|embed']: { 'support-assistant': 100, 'knowledge-assistant': 300 }, [D + '|shared']: { 'support-assistant': 600 } };
  const rows = allocate([bill({ name: 'apim', category: 'Integration', cost: 10, tags: { 'cost-pool': 'ai-gateway' } })], gw, req, o);
  // 700 support requests and 300 knowledge requests of $10: 7 and 3
  const by = Object.fromEntries(rows.map((r) => [r.x_UseCase, r]));
  close(by['support-assistant'].BilledCost, 7);
  close(by['knowledge-assistant'].BilledCost, 3);
  assert.equal(by['support-assistant'].AllocatedMethodId, 'gateway-request-share');
});
