// normalise.js: turn the three raw feeds into one FOCUS-aligned shape.
//
// 1. The cost export arrives with FOCUS 1.2 column names (Azure documents its FOCUS export up to
//    1.2-preview). The ledger works in FOCUS 1.4 names: ProviderName and PublisherName were removed
//    in 1.4; ServiceProviderName and HostProviderName (added in 1.3) carry the same facts.
// 2. Token lines get extension columns shaped like the draft FOCUS 1.5 additions (planned for
//    ratification on 3 Dec 2026, so they stay x_ columns for now): x_TokenDirection (Input, Output),
//    x_TokenCacheAction (Uncached, Read, Write), x_ModelDeveloper, x_ModelId.
// 3. Gateway metrics become FOCUS-aligned estimate rows: tokens times the published list price.
//    These rows are never added to the bill. They decide shares of billed lines and feed the
//    reconciliation only.
import { num } from './csv.js';
import { monthOf } from './dates.js';

export const RENAMES_1_2_TO_1_4 = { ProviderName: 'HostProviderName', PublisherName: 'ServiceProviderName' };
const NUMERIC = ['ConsumedQuantity', 'PricingQuantity', 'ListUnitPrice', 'ListCost', 'ContractedCost', 'BilledCost', 'EffectiveCost'];

// Azure OpenAI meter names follow the pattern "<model> [cached ]Input|Output global Tokens".
const METER = /^(gpt [\d.]+(?: mini| nano)?|text embedding)\s+(cached\s+)?(Input|Output)\s+global\s+Tokens$/i;
const MODEL_FROM_METER = { 'gpt 5.4': 'gpt-5.4', 'gpt 5.4 mini': 'gpt-5.4-mini', 'gpt 5.4 nano': 'gpt-5.4-nano', 'gpt 5.2': 'gpt-5.2', 'text embedding': 'text-embedding' };

export function parseMeter(meter) {
  const m = METER.exec(String(meter || '').trim());
  if (!m) return null;
  const modelId = MODEL_FROM_METER[m[1].toLowerCase()] || m[1].toLowerCase().replace(/\s+/g, '-');
  return {
    modelId,
    direction: m[3][0].toUpperCase() + m[3].slice(1).toLowerCase(),
    cacheAction: m[2] ? 'Read' : 'Uncached',
  };
}

export function deploymentOf(resourceId) {
  const m = /\/deployments\/([^/]+)$/.exec(resourceId || '');
  return m ? m[1] : null;
}

// tokenClass names used by prices.json.
export function tokenClassOf(direction, cacheAction) {
  if (direction === 'Output') return 'output';
  if (cacheAction === 'Read') return 'cachedInput';
  if (cacheAction === 'Write') return 'cacheWrite';
  return 'input';
}

export function normaliseExport(rows) {
  return rows.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) o[RENAMES_1_2_TO_1_4[k] || k] = v;
    for (const k of NUMERIC) o[k] = num(o[k]) ?? 0;
    o.Tags = typeof o.Tags === 'string' ? (o.Tags ? JSON.parse(o.Tags) : {}) : (o.Tags || {});
    o.x_Date = String(o.ChargePeriodStart).slice(0, 10);
    o.x_Month = monthOf(o.x_Date);
    o.x_Deployment = deploymentOf(o.ResourceId);
    o.x_CostPool = o.Tags['cost-pool'] || null;
    const meter = o.ConsumedUnit === 'Tokens' ? parseMeter(o.SkuMeter) : null;
    if (meter) {
      o.x_ModelId = meter.modelId;
      o.x_ModelDeveloper = meter.modelId.startsWith('gpt') || meter.modelId === 'text-embedding' ? 'OpenAI' : null;
      o.x_TokenDirection = meter.direction;
      o.x_TokenCacheAction = meter.cacheAction;
    }
    return o;
  });
}

// Price in effect for a model and token class on a date (latest effectiveFrom on or before it).
export function priceOn(prices, model, tokenClass, date) {
  let best = null;
  for (const p of prices.rows) {
    if (p.model !== model || p.tokenClass !== tokenClass) continue;
    if (p.effectiveFrom > date) continue;
    if (!best || p.effectiveFrom > best.effectiveFrom) best = p;
  }
  return best;
}

// One gateway metric row (a day, a team, a use case, a deployment) becomes up to four estimate rows,
// one per token class. Uncached input = input - cached - cache writes.
export function gatewayRows(metrics, prices) {
  const out = [];
  for (const m of metrics) {
    const input = num(m.input_tokens) || 0;
    const cached = num(m.cached_input_tokens) || 0;
    const write = num(m.cache_write_tokens) || 0;
    const output = num(m.output_tokens) || 0;
    const parts = [
      ['Input', 'Uncached', 'input', input - cached - write],
      ['Input', 'Read', 'cachedInput', cached],
      ['Input', 'Write', 'cacheWrite', write],
      ['Output', 'Uncached', 'output', output],
    ];
    for (const [direction, cacheAction, cls, qty] of parts) {
      if (!qty) continue;
      const p = priceOn(prices, m.model, cls, m.date);
      const model = prices.models[m.model];
      out.push({
        ChargePeriodStart: m.date + 'T00:00:00Z',
        x_Date: m.date,
        x_Month: monthOf(m.date),
        ServiceCategory: 'AI and Machine Learning',
        ConsumedQuantity: qty,
        ConsumedUnit: 'Tokens',
        x_TokenDirection: direction,
        x_TokenCacheAction: cacheAction,
        x_TokenClass: cls,
        x_ModelId: m.model,
        x_ModelDeveloper: model ? model.developer : null,
        x_Deployment: m.deployment,
        x_Team: m.team,
        x_UseCase: m.use_case,
        x_Environment: m.environment,
        x_ApimSubscription: m.apim_subscription,
        ListUnitPrice: p ? p.usdPerMTok : null,
        ListCost: p ? (qty / 1e6) * p.usdPerMTok : null,
        x_PriceSource: p ? p.src : null,
      });
    }
  }
  return out;
}

// Requests per use case and deployment per day, from the raw metrics (one count per metric row).
export function requestIndex(metrics) {
  const idx = {};
  for (const m of metrics) {
    const key = m.date + '|' + m.deployment;
    idx[key] ??= {};
    idx[key][m.use_case] = (idx[key][m.use_case] || 0) + (num(m.requests) || 0);
  }
  return idx;
}
