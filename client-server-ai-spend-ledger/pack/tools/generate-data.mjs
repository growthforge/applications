#!/usr/bin/env node
// generate-data.mjs: writes the illustrative data set in pack/data/ from a fixed seed.
// The organisation is made up. Volumes, outcomes and the cloud bill are synthetic; token prices
// come from src/pack/data/prices.json (published list prices, cited per row).
// Same seed, same files: run it twice and git shows no change.
//
//   node tools/generate-data.mjs                 (from the pack folder; rewrites data/)
//   node tools/generate-data.mjs --out <dir>     (writes the four generated files to <dir>)
//
// Outputs: focus_export.csv (shaped like an Azure Cost Management FOCUS export, FOCUS 1.2 names),
//          token_metrics.csv (daily gateway metric aggregates), outcomes.csv, vm_utilisation.csv
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCsv } from '../ledger/csv.js';
import { addDays, monthOf, isWeekend, daysInMonth } from '../ledger/dates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : DATA;
fs.mkdirSync(OUT, { recursive: true });
const prices = JSON.parse(fs.readFileSync(path.join(DATA, 'prices.json'), 'utf8'));

// ---- seeded randomness (mulberry32) -------------------------------------------------------
let seed = 20261103;
function rand() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function gauss() { const u = Math.max(rand(), 1e-12); const v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const jitter = (sigma) => Math.exp(sigma * gauss() - (sigma * sigma) / 2);
const round = (x, dp = 6) => Math.round(x * 10 ** dp) / 10 ** dp;

function price(model, tokenClass) {
  const row = prices.rows.find((r) => r.model === model && r.tokenClass === tokenClass);
  if (!row) throw new Error(`no price for ${model} ${tokenClass}`);
  return row.usdPerMTok;
}

// ---- the calendar -------------------------------------------------------------------------
const START = '2026-08-01';
const END = '2026-10-31';
const dates = [];
for (let d = START; d <= END; d = addDays(d, 1)) dates.push(d);
const dayIndex = (d) => dates.indexOf(d);
const growth = (d, perMonth) => (1 + perMonth) ** (dayIndex(d) / 30.4);

// ---- illustrative scenario parameters (named so a reader can change them) ------------------
const P = {
  support: { weekday: 5800, weekend: 2500, growth: 0.04, hardShare: 0.15,
    mini: { input: 14000, inputFromOct: 15600, cached: 0.18, output: 900 },
    hard: { input: 22000, cached: 0.15, output: 1600 },
    hardModelSwitch: '2026-10-08',            // the hard-case deployment moves from GPT-5.2 to GPT-5.4
    outcome: { failed: 0.04, discarded: 0.12, retryFailed: 0.85, retryDiscarded: 0.30 }, reviewMinutes: 1.1, retrievalPerHardRun: 1,
    stablePrefixTokens: 4000 },                // system prompt and tool definitions, identical on every call
  kyc: { weekday: 1450, weekend: 170, campaignFrom: '2026-10-12', campaignUplift: 1.45,
    tokens: { uncached: 46000, cacheRead: 5000, cacheWrite: 1000, output: 2600 },
    outcome: { failed: 0.11, discarded: 0.19, retryFailed: 0.80, retryDiscarded: 0.45 }, reviewMinutes: 6,
    storm: { from: '2026-10-14', to: '2026-10-16', failed: 0.36, discarded: 0.17, extraRuns: 0.35, retryFailed: 0.95, retryDiscarded: 0.45 },
    playgroundShare: { '2026-08': 0.05, '2026-09': 0.05, '2026-10': 0.09 } },
  fraud: { daily: 23000, weekendFactor: 0.85, growth: 0.03,
    tokens: { input: 12000, cached: 0.30, output: 450 }, outcome: { failed: 0.02, discarded: 0.52, retryFailed: 0.50, retryDiscarded: 0 }, reviewMinutes: 0.3 },
  knowledge: { weekday: 950, weekend: 80, growth: -0.06,
    tokens: { input: 38000, cached: 0.05, output: 800 }, outcome: { failed: 0.03, discarded: 0.59, retryFailed: 0.60, retryDiscarded: 0.22 }, retrievalPerRun: 3 },
  embedTokensPerCall: 350,
  embedUsdPerMTok: 0.13,                      // text-embedding-3-large, global (prices.json)
  miniUnmeteredShare: 0.015,                  // an internal job calls the shared deployment directly
  sandbox: { from: '2026-09-15', sepInput: 2.0e6, sepOutput: 1.5e5, octInput: 1.8e7, octOutput: 1.2e6 },
  aoaiDiscount: 0.05,                         // illustrative negotiated discount on Azure OpenAI meters
  // Cloud estate. Unit rates are the Azure Retail Prices API's UK South pay-as-you-go prices, read
  // on 4 Nov 2026 (prices.json, azureRetail). One rate per SKU for the whole window: quantities move
  // from day to day, unit prices do not.
  rates: Object.fromEntries([
    ['d16s-v5', 'Hours'], ['d8s-v5', 'Hours'], ['d4s-v5', 'Hours'], ['sql-gp-vcore', 'vCore Hours'],
    ['storage-hot-lrs', 'GB-Months'], ['log-analytics-ingest', 'GB'], ['apim-standard-v2', 'Unit Hours'], ['search-s2', 'Search Unit Hours'],
  ].map(([key, unit]) => {
    const r = prices.azureRetail.rows.find((x) => x.key === key);
    return [key, { usd: r.usd, unit, meter: r.meter }];
  })),
  cloud: {
    aksProdWeekdayNodes: 42, aksProdWeekendNodes: 36, aksNonprodNodes: 20, aksNonprodSystemNodes: 2, scheduleFrom: '2026-10-13',
    sqlVcores: 8, storageGb: 42000, storageGrowth: 0.06, logGbPerDay: 55, appInsightsGbPerDay: 8, apimUnits: 2, searchUnits: 6,
  },
};

// ---- outcomes and gateway metrics ---------------------------------------------------------
const metrics = [];
const outcomes = [];
const meter = {};   // deployment -> date -> { uncached, cached, output } metered tokens
const addMeter = (dep, d, k, v) => { meter[dep] ??= {}; meter[dep][d] ??= { uncached: 0, cached: 0, output: 0, input: 0 }; meter[dep][d][k] += v; };

// Every run ends as successful, failed or discarded. Retried counts the runs that were themselves a
// retry of an earlier failed or discarded attempt, modelled on its own rate, so it is not a copy of failed.
function split(runs, o) {
  const failed = Math.round(runs * o.failed * jitter(0.08));
  const discarded = Math.round(runs * o.discarded * jitter(0.05));
  const successful = Math.max(0, runs - failed - discarded);
  const retried = Math.min(runs, Math.round((failed * o.retryFailed + discarded * o.retryDiscarded) * jitter(0.12)));
  return { successful, failed, discarded, retried };
}
function metricRow(d, team, useCase, env, model, deployment, t) {
  metrics.push({
    date: d, apim_subscription: `${team}.${useCase}.${env}`, team, use_case: useCase, environment: env,
    model, deployment, input_tokens: Math.round(t.input), cached_input_tokens: Math.round(t.cached || 0),
    cache_write_tokens: Math.round(t.write || 0), output_tokens: Math.round(t.output || 0),
    requests: Math.round(t.requests), batch_requests: 0,
  });
}

let ccuDaily = {};
for (const d of dates) {
  const we = isWeekend(d);
  const m = monthOf(d);

  // Support assistant: two paths through one gateway subscription.
  {
    const s = P.support;
    const runs = Math.round((we ? s.weekend : s.weekday) * growth(d, s.growth) * jitter(0.06));
    const hardRuns = Math.round(runs * s.hardShare * jitter(0.05));
    const miniRuns = runs - hardRuns;
    const miniIn = (d >= '2026-10-01' ? s.mini.inputFromOct : s.mini.input) * jitter(0.03);
    const miniInput = miniRuns * miniIn;
    const miniCached = miniInput * s.mini.cached * jitter(0.04);
    const miniOut = miniRuns * s.mini.output * jitter(0.03);
    const hardInput = hardRuns * s.hard.input * jitter(0.03);
    const hardCached = hardInput * s.hard.cached * jitter(0.04);
    const hardOut = hardRuns * s.hard.output * jitter(0.03);
    const hardModel = d >= s.hardModelSwitch ? 'gpt-5.4' : 'gpt-5.2';
    metricRow(d, 'customer-ops', 'support-assistant', 'prod', 'gpt-5.4-mini', 'gpt54mini-shared', { input: miniInput, cached: miniCached, output: miniOut, requests: miniRuns });
    metricRow(d, 'customer-ops', 'support-assistant', 'prod', hardModel, 'gpt-support-hard', { input: hardInput, cached: hardCached, output: hardOut, requests: hardRuns });
    const calls = hardRuns * s.retrievalPerHardRun;
    metricRow(d, 'customer-ops', 'support-assistant', 'prod', 'text-embedding', 'embed-shared', { input: calls * P.embedTokensPerCall * jitter(0.02), requests: calls });
    const o = split(runs, s.outcome);
    outcomes.push({ date: d, use_case: 'support-assistant', runs, ...o, review_minutes: Math.round((o.successful + o.discarded) * s.reviewMinutes) });
  }

  // KYC document review on Claude through Foundry (one aggregated CCU line on the bill).
  {
    const k = P.kyc;
    let runs = (we ? k.weekend : k.weekday) * (d >= k.campaignFrom ? k.campaignUplift : 1) * jitter(0.06);
    const storm = d >= k.storm.from && d <= k.storm.to;
    if (storm) runs *= 1 + k.storm.extraRuns;
    runs = Math.round(runs);
    const t = k.tokens;
    const unc = runs * t.uncached * jitter(0.03);
    const read = runs * t.cacheRead * jitter(0.05);
    const write = runs * t.cacheWrite * jitter(0.05);
    const out = runs * t.output * jitter(0.03);
    metricRow(d, 'fincrime', 'kyc-review', 'prod', 'claude-sonnet-5.5', 'claude-sonnet-55-kyc', { input: unc + read + write, cached: read, write, output: out, requests: runs });
    const metered = (unc * price('claude-sonnet-5.5', 'input') + read * price('claude-sonnet-5.5', 'cachedInput')
      + write * price('claude-sonnet-5.5', 'cacheWrite') + out * price('claude-sonnet-5.5', 'output')) / 1e6;
    ccuDaily[d] = metered * (1 + k.playgroundShare[m] * jitter(0.15));
    const o = split(runs, storm ? k.storm : k.outcome);
    outcomes.push({ date: d, use_case: 'kyc-review', runs, ...o, review_minutes: Math.round((o.successful + o.discarded) * k.reviewMinutes) });
  }

  // Fraud alert explanations on GPT-5.4 nano, every day of the week.
  {
    const f = P.fraud;
    const runs = Math.round(f.daily * (we ? f.weekendFactor : 1) * growth(d, f.growth) * jitter(0.05));
    const input = runs * f.tokens.input * jitter(0.03);
    metricRow(d, 'fraud-analytics', 'fraud-explain', 'prod', 'gpt-5.4-nano', 'gpt54nano-fraud', { input, cached: input * f.tokens.cached * jitter(0.03), output: runs * f.tokens.output * jitter(0.03), requests: runs });
    const o = split(runs, f.outcome);
    outcomes.push({ date: d, use_case: 'fraud-explain', runs, ...o, review_minutes: Math.round(o.successful * f.reviewMinutes) });
  }

  // Internal knowledge assistant: GPT-5.4 mini on the shared deployment, plus retrieval.
  {
    const q = P.knowledge;
    const runs = Math.round((we ? q.weekend : q.weekday) * growth(d, q.growth) * jitter(0.07));
    const input = runs * q.tokens.input * jitter(0.04);
    metricRow(d, 'engineering', 'knowledge-assistant', 'prod', 'gpt-5.4-mini', 'gpt54mini-shared', { input, cached: input * q.tokens.cached * jitter(0.05), output: runs * q.tokens.output * jitter(0.03), requests: runs });
    const calls = runs * q.retrievalPerRun;
    metricRow(d, 'engineering', 'knowledge-assistant', 'prod', 'text-embedding', 'embed-shared', { input: calls * P.embedTokensPerCall * jitter(0.02), requests: calls });
    const o = split(runs, q.outcome);
    outcomes.push({ date: d, use_case: 'knowledge-assistant', runs, ...o, review_minutes: 0 });
  }
}
for (const r of metrics) {
  addMeter(r.deployment, r.date, 'uncached', r.input_tokens - r.cached_input_tokens - r.cache_write_tokens);
  addMeter(r.deployment, r.date, 'cached', r.cached_input_tokens);
  addMeter(r.deployment, r.date, 'output', r.output_tokens);
  addMeter(r.deployment, r.date, 'input', r.input_tokens);
}

// ---- the bill: FOCUS 1.2 rows, shaped like an Azure Cost Management FOCUS export -------------
const COLS = ['BillingAccountId', 'BillingCurrency', 'BillingPeriodStart', 'BillingPeriodEnd', 'ChargePeriodStart', 'ChargePeriodEnd',
  'ChargeCategory', 'PricingCategory', 'ProviderName', 'PublisherName', 'InvoiceIssuerName', 'SubAccountId', 'RegionId',
  'ServiceCategory', 'ServiceName', 'ResourceId', 'ResourceName', 'SkuId', 'SkuMeter', 'ConsumedQuantity', 'ConsumedUnit',
  'PricingQuantity', 'PricingUnit', 'ListUnitPrice', 'ListCost', 'ContractedCost', 'BilledCost', 'EffectiveCost',
  'CommitmentDiscountId', 'Tags', 'x_ResourceGroupName'];
const bill = [];
const monthStart = (d) => monthOf(d) + '-01T00:00:00Z';
const monthEnd = (d) => { const m = monthOf(d); const n = daysInMonth(m); return addDays(m + '-' + String(n).padStart(2, '0'), 1) + 'T00:00:00Z'; };

function line(d, o) {
  const listCost = round(o.listCost, 6);
  const billed = round(o.billed ?? listCost, 6);
  bill.push({
    BillingAccountId: 'illustrative-ea-0001', BillingCurrency: 'USD',
    BillingPeriodStart: monthStart(d), BillingPeriodEnd: monthEnd(d),
    ChargePeriodStart: d + 'T00:00:00Z', ChargePeriodEnd: addDays(d, 1) + 'T00:00:00Z',
    ChargeCategory: 'Usage', PricingCategory: 'Standard',
    ProviderName: 'Microsoft', PublisherName: o.publisher || 'Microsoft', InvoiceIssuerName: 'Microsoft',
    SubAccountId: o.sub, RegionId: 'uksouth', ServiceCategory: o.category, ServiceName: o.service,
    ResourceId: o.id, ResourceName: o.id.split('/').pop(), SkuId: o.sku, SkuMeter: o.meter,
    ConsumedQuantity: o.qty, ConsumedUnit: o.unit, PricingQuantity: round(o.pricingQty, 6), PricingUnit: o.pricingUnit,
    ListUnitPrice: o.unitPrice, ListCost: listCost, ContractedCost: billed, BilledCost: billed, EffectiveCost: billed,
    CommitmentDiscountId: '', Tags: JSON.stringify(o.tags || {}), x_ResourceGroupName: o.rg,
  });
}
const aoaiId = (sub, rg, acct, dep) => `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.CognitiveServices/accounts/${acct}/deployments/${dep}`;
const METER_LABEL = { 'gpt-5.4': 'gpt 5.4', 'gpt-5.4-mini': 'gpt 5.4 mini', 'gpt-5.4-nano': 'gpt 5.4 nano', 'gpt-5.2': 'gpt 5.2' };
function tokenLines(d, { sub, rg, acct, dep, model, tags, qty }) {
  const id = aoaiId(sub, rg, acct, dep);
  const classes = [['uncached', 'input', 'Input'], ['cached', 'cachedInput', 'cached Input'], ['output', 'output', 'Output']];
  for (const [k, cls, label] of classes) {
    const tokens = Math.round(qty[k]);
    if (!tokens) continue;
    const unit = price(model, cls);
    const list = (tokens / 1e6) * unit;
    line(d, { sub, rg, id, category: 'AI and Machine Learning', service: 'Azure OpenAI', sku: `${model}-global-${cls}`,
      meter: `${METER_LABEL[model]} ${label} global Tokens`, qty: tokens, unit: 'Tokens', pricingQty: tokens / 1e6,
      pricingUnit: '1M Tokens', unitPrice: unit, listCost: list, billed: list * (1 - P.aoaiDiscount), tags });
  }
}
// A cloud line: a quantity of one SKU at that SKU's constant rate.
function cloudLine(d, o) {
  const r = P.rates[o.rate];
  const qty = round(o.qty, 4);
  line(d, { ...o, sku: o.rate, meter: r.meter, qty, unit: r.unit, pricingQty: qty, pricingUnit: r.unit, unitPrice: r.usd, listCost: qty * r.usd });
}

for (const d of dates) {
  const we = isWeekend(d);
  const m = monthOf(d);
  // Shared GPT-5.4 mini deployment: metered traffic plus a small unmetered share.
  const mm = meter['gpt54mini-shared'][d];
  const up = 1 + P.miniUnmeteredShare * jitter(0.1);
  tokenLines(d, { sub: 'sub-ai-prod', rg: 'rg-ai-prod', acct: 'aoai-prod-uks', dep: 'gpt54mini-shared', model: 'gpt-5.4-mini',
    tags: { 'cost-pool': 'shared-ai-platform', environment: 'prod' }, qty: { uncached: mm.uncached * up, cached: mm.cached * up, output: mm.output * up } });
  // Support hard cases: GPT-5.2 until the switch, then GPT-5.4 at its list price.
  const hm = meter['gpt-support-hard'][d];
  tokenLines(d, { sub: 'sub-ai-prod', rg: 'rg-ai-prod', acct: 'aoai-prod-uks', dep: 'gpt-support-hard', model: d >= P.support.hardModelSwitch ? 'gpt-5.4' : 'gpt-5.2',
    tags: { owner: 'customer-ops', environment: 'prod' }, qty: hm });
  // Fraud explanations.
  tokenLines(d, { sub: 'sub-ai-prod', rg: 'rg-ai-prod', acct: 'aoai-prod-uks', dep: 'gpt54nano-fraud', model: 'gpt-5.4-nano',
    tags: { owner: 'fraud-analytics', environment: 'prod' }, qty: meter['gpt54nano-fraud'][d] });
  // A sandbox deployment in the non-production subscription, called directly (no gateway).
  if (d >= P.sandbox.from) {
    const oct = m === '2026-10';
    const f = (we ? 0.25 : 1) * jitter(0.2);
    const input = (oct ? P.sandbox.octInput : P.sandbox.sepInput) * f;
    tokenLines(d, { sub: 'sub-ai-nonprod', rg: 'rg-ai-nonprod', acct: 'aoai-dev-uks', dep: 'gpt54-sandbox', model: 'gpt-5.4',
      tags: { owner: 'engineering', environment: 'nonprod' }, qty: { uncached: input, cached: 0, output: (oct ? P.sandbox.octOutput : P.sandbox.sepOutput) * f } });
  }
  // Embeddings (shared platform). No published price in this pack: the billed rate is illustrative.
  const em = meter['embed-shared'][d].input;
  line(d, { sub: 'sub-ai-prod', rg: 'rg-ai-prod', id: aoaiId('sub-ai-prod', 'rg-ai-prod', 'aoai-prod-uks', 'embed-shared'), category: 'AI and Machine Learning',
    service: 'Azure OpenAI', sku: 'text-embedding-global-input', meter: 'text embedding Input global Tokens', qty: Math.round(em), unit: 'Tokens',
    pricingQty: em / 1e6, pricingUnit: '1M Tokens', unitPrice: P.embedUsdPerMTok, listCost: (em / 1e6) * P.embedUsdPerMTok,
    billed: (em / 1e6) * P.embedUsdPerMTok * (1 - P.aoaiDiscount), tags: { 'cost-pool': 'shared-ai-platform', environment: 'prod' } });
  // AI Search behind the knowledge assistant and the support assistant's hard cases: a fixed tier.
  cloudLine(d, { sub: 'sub-ai-prod', rg: 'rg-ai-prod', id: '/subscriptions/sub-ai-prod/resourceGroups/rg-ai-prod/providers/Microsoft.Search/searchServices/srch-shared-uks',
    category: 'AI and Machine Learning', service: 'Azure AI Search', rate: 'search-s2', qty: P.cloud.searchUnits * 24, tags: { 'cost-pool': 'shared-ai-platform', environment: 'prod' } });
  // Claude through Microsoft Foundry: one aggregated CCU line, no resource tags.
  const ccu = Math.round(ccuDaily[d] / prices.rules.ccuUsd.value);
  line(d, { sub: 'sub-ai-prod', rg: 'rg-ai-prod', id: '/subscriptions/sub-ai-prod/resourceGroups/rg-ai-prod/providers/Microsoft.CognitiveServices/accounts/foundry-prod-uks',
    category: 'AI and Machine Learning', service: 'Claude models in Microsoft Foundry', publisher: 'Anthropic', sku: 'claude-ccu', meter: 'Claude Consumption Unit',
    qty: ccu, unit: 'CCU', pricingQty: ccu, pricingUnit: '1 CCU', unitPrice: prices.rules.ccuUsd.value, listCost: ccu * prices.rules.ccuUsd.value, tags: {} });

  // Cloud estate.
  const C = P.cloud;
  const prodNodes = Math.max(30, Math.round((we ? C.aksProdWeekendNodes : C.aksProdWeekdayNodes) * growth(d, 0.01) + gauss()));
  cloudLine(d, { sub: 'sub-platform-prod', rg: 'rg-platform-prod', id: '/subscriptions/sub-platform-prod/resourceGroups/rg-platform-prod/providers/Microsoft.ContainerService/managedClusters/aks-prod-uks',
    category: 'Compute', service: 'Azure Kubernetes Service', rate: 'd16s-v5', qty: prodNodes * 24, tags: { environment: 'prod' } });
  // Non-production: a 2-node system pool always on; the user pool scales to zero at night and at
  // weekends from the schedule date (on 07:00 to 19:00 on working days).
  const scheduled = d >= C.scheduleFrom;
  const userNodes = C.aksNonprodNodes - C.aksNonprodSystemNodes;
  const nonprodHours = C.aksNonprodSystemNodes * 24 + (scheduled ? (we ? 0 : userNodes * 12) : userNodes * 24);
  cloudLine(d, { sub: 'sub-platform-nonprod', rg: 'rg-platform-nonprod', id: '/subscriptions/sub-platform-nonprod/resourceGroups/rg-platform-nonprod/providers/Microsoft.ContainerService/managedClusters/aks-nonprod-uks',
    category: 'Compute', service: 'Azure Kubernetes Service', rate: 'd8s-v5', qty: nonprodHours, tags: { environment: 'nonprod' } });
  for (const [name, rate, owner, rg] of [['vm-fraud-scoring-01', 'd16s-v5', 'fraud-analytics', 'rg-data-prod'], ['vm-kyc-ocr-01', 'd8s-v5', 'fincrime', 'rg-data-prod'], ['vm-batch-etl-01', 'd8s-v5', 'engineering', 'rg-data-prod']]) {
    cloudLine(d, { sub: 'sub-platform-prod', rg, id: `/subscriptions/sub-platform-prod/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/${name}`,
      category: 'Compute', service: 'Virtual Machines', rate, qty: 24, tags: { owner, environment: 'prod' } });
  }
  cloudLine(d, { sub: 'sub-platform-prod', rg: 'rg-data-prod', id: '/subscriptions/sub-platform-prod/resourceGroups/rg-data-prod/providers/Microsoft.Sql/servers/sql-ledger-prod/databases/ledger',
    category: 'Databases', service: 'Azure SQL Database', rate: 'sql-gp-vcore', qty: C.sqlVcores * 24, tags: { owner: 'engineering', environment: 'prod' } });
  // Storage is billed per GB-month; a daily row carries that day's share of the month.
  cloudLine(d, { sub: 'sub-platform-prod', rg: 'rg-data-prod', id: '/subscriptions/sub-platform-prod/resourceGroups/rg-data-prod/providers/Microsoft.Storage/storageAccounts/stexportsuks',
    category: 'Storage', service: 'Storage Accounts', rate: 'storage-hot-lrs', qty: (C.storageGb * growth(d, C.storageGrowth)) / daysInMonth(m), tags: { owner: 'engineering', environment: 'prod', data: 'logs-and-exports' } });
  for (const [name, provider, service, category, rate, qty] of [
    ['log-shared-uks', 'Microsoft.OperationalInsights/workspaces', 'Log Analytics', 'Management and Governance', 'log-analytics-ingest', C.logGbPerDay * jitter(0.08)],
    ['appi-shared-uks', 'Microsoft.Insights/components', 'Application Insights', 'Management and Governance', 'log-analytics-ingest', C.appInsightsGbPerDay * jitter(0.1)],
    ['apim-ai-gateway', 'Microsoft.ApiManagement/service', 'API Management', 'Integration', 'apim-standard-v2', C.apimUnits * 24]]) {
    // The gateway and the Application Insights it reports to carry the AI gateway pool tag; the
    // shared Log Analytics workspace has no owner and no pool.
    const tags = name === 'log-shared-uks' ? { environment: 'prod' } : { 'cost-pool': 'ai-gateway', environment: 'prod' };
    cloudLine(d, { sub: 'sub-shared', rg: 'rg-shared-observability', id: `/subscriptions/sub-shared/resourceGroups/rg-shared-observability/providers/${provider}/${name}`,
      category, service, rate, qty, tags });
  }
}

const vmUtil = [];
for (const m of ['2026-08', '2026-09', '2026-10']) {
  for (const [name, cpu, mem] of [['vm-fraud-scoring-01', 6, 22], ['vm-kyc-ocr-01', 9, 31], ['vm-batch-etl-01', 58, 64]]) {
    vmUtil.push({ month: m, resource: name, p95_cpu_pct: round(cpu * jitter(0.1), 1), p99_memory_pct: round(mem * jitter(0.05), 1) });
  }
}

fs.writeFileSync(path.join(OUT, 'focus_export.csv'), toCsv(bill, COLS));
fs.writeFileSync(path.join(OUT, 'token_metrics.csv'), toCsv(metrics));
fs.writeFileSync(path.join(OUT, 'outcomes.csv'), toCsv(outcomes, ['date', 'use_case', 'runs', 'successful', 'failed', 'retried', 'discarded', 'review_minutes']));
fs.writeFileSync(path.join(OUT, 'vm_utilisation.csv'), toCsv(vmUtil));
if (!process.env.QUIET) console.log(`focus_export.csv ${bill.length} rows; token_metrics.csv ${metrics.length}; outcomes.csv ${outcomes.length}; vm_utilisation.csv ${vmUtil.length}`);
