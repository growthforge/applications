// compute.js: fetch the committed data files and run the ledger. Used by the worker, and on the main
// thread only if module workers are unavailable.
import { buildLedger } from '../pack/ledger/index.js';
import { viewModel } from './view.js';

export const FILES = ['focus_export.csv', 'token_metrics.csv', 'outcomes.csv', 'vm_utilisation.csv', 'prices.json', 'org.json', 'value.json', 'levers.json'];

export async function computeFromUrls(base) {
  const get = (f) => fetch(base + f).then((r) => {
    if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
    return f.endsWith('.json') ? r.json() : r.text();
  });
  const [focus, tokens, outcomes, vm, prices, org, values, levers] = await Promise.all(FILES.map(get));
  return viewModel(buildLedger({ focus, tokens, outcomes, vm, prices, org, values, levers }));
}
