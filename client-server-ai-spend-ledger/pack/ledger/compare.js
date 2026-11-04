// compare.js: the KYC summary task priced on each model at list prices.
//
// Every model is priced at the SAME token counts: the task's counts as metered on Claude at the
// gateway. That is a per-token comparison expressed at task size, not a forecast: each tokenizer
// counts the same document differently, and the only published figure (Claude 4.7 and later
// produce about 30% more tokens than Anthropic's previous tokenizer [S10]) compares Claude with
// Claude, not with OpenAI. Before switching, meter the same documents on each model. Uncached
// input and output at list price; caching and batch are left out so the models stand on the same footing.
import { priceOn } from './normalise.js';

export function taskCost(prices, model, date, inputTokens, outputTokens) {
  const i = priceOn(prices, model, 'input', date);
  const o = priceOn(prices, model, 'output', date);
  if (!i || !o) return null;
  return (inputTokens / 1e6) * i.usdPerMTok + (outputTokens / 1e6) * o.usdPerMTok;
}

export function compareTask({ prices, date, task, models }) {
  return models.map((model) => {
    const meta = prices.models[model];
    const i = priceOn(prices, model, 'input', date);
    const o = priceOn(prices, model, 'output', date);
    return {
      model, label: meta.label, host: meta.host, inputTokens: task.inputTokens, outputTokens: task.outputTokens,
      inputPrice: i ? i.usdPerMTok : null, outputPrice: o ? o.usdPerMTok : null,
      costPerTask: taskCost(prices, model, date, task.inputTokens, task.outputTokens),
      measured: meta.tokenizer === task.measuredOn,
    };
  });
}
