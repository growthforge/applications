// whatif.js: the support assistant's cost per accepted draft, one workflow, at list prices.
//
// Steps: an optional triage call, then the draft. Most tickets use the draft model; a share of hard
// cases uses GPT-5.4. Every input is clamped to a sensible range, so the result is never negative,
// never infinite and never NaN: a failure rate is capped below 100%, shares sit between 0 and 1.
//   model cost per run   = triage + (1 - hard share) x draft(model) + hard share x draft(GPT-5.4),
//                          with batch at 50% off on the batched share [S11]
//   per accepted draft   = cost per run / (1 - failure rate); every attempt is paid for [S3]
//   review per accepted  = review minutes x loaded cost per minute / (1 - failure rate)
import { priceOn } from './normalise.js';

export const TRIAGE_TOKENS = { input: 2500, output: 60 };   // illustrative size of a triage call
export const HARD_MODEL = 'gpt-5.4';
export const WHATIF_SPEC = {
  triageModel: { options: ['none', 'gpt-5.4-nano', 'gpt-5.4-mini'], default: 'none' },
  draftModel: { options: ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4'], default: 'gpt-5.4-mini' },
  hardShare: { min: 0, max: 1, default: 0.15 },
  inputTokens: { min: 500, max: 100000, default: 16000 },
  outputTokens: { min: 50, max: 8000, default: 1000 },
  cacheHitRate: { min: 0, max: 0.9, default: 0.18 },
  batchShare: { min: 0, max: 1, default: 0 },
  failureRate: { min: 0, max: 0.6, default: 0.16 },
  reviewMinutes: { min: 0, max: 15, default: 1 },
  costPerMinute: { min: 0, max: 3, default: 0.8 },
  volume: { min: 0, max: 1000000, default: 150000 },
};

export function clampInputs(raw, defaults = {}) {
  const out = {};
  for (const [k, spec] of Object.entries(WHATIF_SPEC)) {
    const fallback = defaults[k] !== undefined ? defaults[k] : spec.default;
    const v = raw ? raw[k] : undefined;
    if (spec.options) {
      out[k] = spec.options.includes(v) ? v : (spec.options.includes(fallback) ? fallback : spec.default);
    } else {
      const n = typeof v === 'number' ? v : (v === '' || v === null || v === undefined ? NaN : Number(v));
      const base = Number.isFinite(n) ? n : Number(fallback);
      out[k] = Math.min(spec.max, Math.max(spec.min, Number.isFinite(base) ? base : spec.default));
    }
  }
  return out;
}

function callCost(prices, model, date, input, output, hit) {
  const pIn = priceOn(prices, model, 'input', date).usdPerMTok;
  const pCached = priceOn(prices, model, 'cachedInput', date).usdPerMTok;
  const pOut = priceOn(prices, model, 'output', date).usdPerMTok;
  return (input * ((1 - hit) * pIn + hit * pCached) + output * pOut) / 1e6;
}

export function whatIf(raw, prices, date, defaults) {
  const x = clampInputs(raw, defaults);
  const batch = prices.rules.batchMultiplier.value;
  const triage = x.triageModel === 'none' ? 0 : callCost(prices, x.triageModel, date, TRIAGE_TOKENS.input, TRIAGE_TOKENS.output, 0);
  const draft = callCost(prices, x.draftModel, date, x.inputTokens, x.outputTokens, x.cacheHitRate);
  const hard = callCost(prices, HARD_MODEL, date, x.inputTokens, x.outputTokens, x.cacheHitRate);
  const perRunList = triage + (1 - x.hardShare) * draft + x.hardShare * hard;
  const perRun = perRunList * (1 - x.batchShare * (1 - batch));
  const attempts = 1 / (1 - x.failureRate);
  const model = perRun * attempts;
  const review = x.reviewMinutes * x.costPerMinute * attempts;
  const total = model + review;
  return {
    inputs: x,
    perRun,
    attemptsPerSuccess: attempts,
    modelPerSuccess: model,
    reviewPerSuccess: review,
    totalPerSuccess: total,
    reviewShare: total > 0 ? review / total : 0,
    monthlyModel: model * x.volume,
    monthlyTotal: total * x.volume,
  };
}
