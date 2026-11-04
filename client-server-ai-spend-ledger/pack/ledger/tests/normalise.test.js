import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv } from '../csv.js';
import { parseMeter, normaliseExport, gatewayRows, priceOn, deploymentOf } from '../normalise.js';
import { prices } from './fixtures.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('csv: quoted fields, doubled quotes and JSON tags survive a round trip', () => {
  const rows = [{ a: 'x,y', b: '{"owner":"engineering"}', c: 'say "hi"' }];
  const back = parseCsv(toCsv(rows));
  assert.deepEqual(back, rows);
});

test('meter names become FOCUS 1.5-shaped token columns', () => {
  assert.deepEqual(parseMeter('gpt 5.4 mini cached Input global Tokens'), { modelId: 'gpt-5.4-mini', direction: 'Input', cacheAction: 'Read' });
  assert.deepEqual(parseMeter('gpt 5.4 Output global Tokens'), { modelId: 'gpt-5.4', direction: 'Output', cacheAction: 'Uncached' });
  assert.deepEqual(parseMeter('gpt 5.2 Input global Tokens'), { modelId: 'gpt-5.2', direction: 'Input', cacheAction: 'Uncached' });
  assert.equal(parseMeter('D8s v5'), null);
  assert.equal(deploymentOf('/subscriptions/s/resourceGroups/r/providers/Microsoft.CognitiveServices/accounts/a/deployments/dep-1'), 'dep-1');
  assert.equal(deploymentOf('/subscriptions/s/resourceGroups/r/providers/Microsoft.Compute/virtualMachines/vm'), null);
});

test('FOCUS 1.2 export columns are renamed to FOCUS 1.4 and typed', () => {
  const csv = 'ProviderName,PublisherName,InvoiceIssuerName,ChargePeriodStart,BilledCost,EffectiveCost,ListCost,ConsumedQuantity,ConsumedUnit,SkuMeter,ResourceId,Tags\n'
    + 'Microsoft,Anthropic,Microsoft,2026-10-05T00:00:00Z,12.5,12.5,12.5,1250,CCU,Claude Consumption Unit,/x/ccu,"{}"\n'
    + 'Microsoft,Microsoft,Microsoft,2026-10-05T00:00:00Z,1.425,1.425,1.5,2000000,Tokens,gpt 5.4 mini Input global Tokens,/a/deployments/d1,"{""owner"":""engineering""}"\n';
  const [ccu, tok] = normaliseExport(parseCsv(csv));
  assert.equal(ccu.ServiceProviderName, 'Anthropic');
  assert.equal(ccu.HostProviderName, 'Microsoft');
  assert.equal(ccu.InvoiceIssuerName, 'Microsoft');
  assert.equal('ProviderName' in ccu, false);
  assert.equal('PublisherName' in ccu, false);
  assert.equal(ccu.BilledCost, 12.5);
  assert.equal(ccu.x_Date, '2026-10-05');
  assert.equal(ccu.x_TokenDirection, undefined);
  assert.equal(tok.x_ModelId, 'gpt-5.4-mini');
  assert.equal(tok.x_TokenDirection, 'Input');
  assert.equal(tok.x_TokenCacheAction, 'Uncached');
  assert.equal(tok.x_Deployment, 'd1');
  assert.deepEqual(tok.Tags, { owner: 'engineering' });
});

test('gateway metrics become estimate rows per token class at list price', () => {
  const rows = gatewayRows([{ date: '2026-10-05', team: 'fincrime', use_case: 'kyc-review', environment: 'prod', model: 'claude-sonnet-5.5', deployment: 'k',
    input_tokens: '100000', cached_input_tokens: '20000', cache_write_tokens: '10000', output_tokens: '5000', requests: '3' }], prices);
  const by = Object.fromEntries(rows.map((r) => [r.x_TokenClass, r]));
  // uncached = 100,000 - 20,000 - 10,000 = 70,000 at $2 per 1M = $0.14
  assert.equal(by.input.ConsumedQuantity, 70000); close(by.input.ListCost, 0.14);
  // cache read 20,000 at $0.10 = $0.002; cache write 10,000 at $2.50 = $0.025; output 5,000 at $10 = $0.05
  close(by.cachedInput.ListCost, 0.002); assert.equal(by.cachedInput.x_TokenCacheAction, 'Read');
  close(by.cacheWrite.ListCost, 0.025); assert.equal(by.cacheWrite.x_TokenCacheAction, 'Write');
  close(by.output.ListCost, 0.05); assert.equal(by.output.x_TokenDirection, 'Output');
  assert.equal(by.input.x_ModelDeveloper, 'Anthropic');
});

test('priceOn picks the latest row in effect on the date', () => {
  const p = { rows: [
    { model: 'm', tokenClass: 'input', usdPerMTok: 1, effectiveFrom: '2026-01-01' },
    { model: 'm', tokenClass: 'input', usdPerMTok: 2, effectiveFrom: '2026-10-08' },
  ] };
  assert.equal(priceOn(p, 'm', 'input', '2026-10-07').usdPerMTok, 1);
  assert.equal(priceOn(p, 'm', 'input', '2026-10-08').usdPerMTok, 2);
  assert.equal(priceOn(p, 'm', 'input', '2025-12-31'), null);
  assert.equal(priceOn(p, 'm', 'output', '2026-10-08'), null);
});
