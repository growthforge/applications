// @ts-check
/**
 * get_benchmark: a soft range per m² GIFA from the synthetic benchmark set, optionally
 * rebased to a month and multiplied by a stated location factor.
 */
import { monthLabel, round, gbp } from './util.js';
import { groupName } from './nrm1.js';
import { indexRatio, locationNote, refuse } from './rebase.js';

/**
 * @param {ReturnType<typeof import('./series.js').createSeriesRegistry>} registry
 * @param {any} dataset parsed data/benchmarks.json
 * @param {{ building_type: string, nrm1_group: number, location_factor: number, to_month?: string }} args
 * @returns {import('./rebase.js').Outcome}
 */
export function getBenchmark(registry, dataset, args) {
  const bt = dataset.building_types[args.building_type];
  if (!bt) {
    return refuse('unknown_building_type', `The synthetic set has no building type "${args.building_type}". Available: ${Object.keys(dataset.building_types).join(', ')}.`, 'Choose one of the listed building types.');
  }
  const g = args.nrm1_group;
  if (g > 8) {
    return refuse('not_an_element', `${groupName(g)} (group ${g}) is an addition or allowance, not a group element with a rate per m². Benchmarks here cover groups 0 to 8.`, 'Check additions against the build-up in check_cost_plan instead.');
  }
  const range = bt.ranges[String(g)];
  if (!range) {
    return refuse('no_data', `The synthetic set has no ${groupName(g)} costs for ${bt.name.toLowerCase()} projects (treated as not applicable).`, 'Ask the cost manager for a project-specific basis for this element.');
  }
  const target = args.to_month || dataset.base_month;
  let ratio = 1;
  let rebased = false;
  /** @type {any} */
  let index = null;
  if (target !== dataset.base_month) {
    const r = indexRatio(registry, dataset.rebase_series, dataset.base_month, target);
    if (!r.ok) return r;
    ratio = r.ratio;
    rebased = true;
    index = r;
  }
  const lf = args.location_factor;
  const k = ratio * lf;
  const low = round(range.low * k, 2);
  const median = round(range.median * k, 2);
  const high = round(range.high * k, 2);
  const mean = round(range.mean * k, 2);
  const seriesName = registry.get(dataset.rebase_series)?.name || dataset.rebase_series;

  const history = [
    { step: 1, event: 'dataset', detail: `${dataset.name} (${dataset.id}), ${range.n} synthetic ${bt.name.toLowerCase()} projects, each rebased by the generator to ${monthLabel(dataset.base_month)} with ${seriesName}.` },
    { step: 2, event: 'range', detail: `${dataset.percentile_method}: low ${gbp(range.low, 2)}, median ${gbp(range.median, 2)}, high ${gbp(range.high, 2)} at ${monthLabel(dataset.base_month)}.` },
  ];
  if (rebased) history.push({ step: 3, event: 'rebased', detail: `x ${index.i2} / ${index.i1} (${seriesName}, ${monthLabel(dataset.base_month)} to ${monthLabel(target)}).` });
  history.push({ step: history.length + 1, event: 'location factor', detail: `x ${lf.toFixed(2)}${lf === 1 ? ' (not adjusted)' : ''}.` });

  const result = {
    building_type: args.building_type,
    building_type_name: bt.name,
    nrm1_group: g,
    group_name: groupName(g),
    unit: 'GBP per m2 GIFA',
    month: target,
    range: { low, median, high, mean, project_count: range.n },
    display: `${gbp(low)} to ${gbp(high)} per m² GIFA (median ${gbp(median)})`,
    dataset: {
      id: dataset.id,
      name: dataset.name,
      synthetic: true,
      seed: dataset.seed,
      generator: dataset.generator,
      base_month: dataset.base_month,
    },
    rebased: {
      applied: rebased,
      from_month: dataset.base_month,
      to_month: target,
      series_id: dataset.rebase_series,
      ratio,
    },
    location: { factor: lf, note: locationNote(lf) },
    percentile_method: dataset.percentile_method,
    caveats: [
      'Synthetic data made by a seeded generator to exercise the checks. It is not RLB, BCIS or market data, and it is not a target.',
      'A rate outside the range is a prompt for a reviewer to look at the basis, not evidence of an error.',
    ],
    basis: `${dataset.name} (${dataset.id}, seed ${dataset.seed}): ${range.n} synthetic projects, ${dataset.percentile_method.toLowerCase()}, at ${monthLabel(dataset.base_month)}${rebased ? `, rebased to ${monthLabel(target)} with ${seriesName}` : ''}; location factor ${lf.toFixed(2)}${lf === 1 ? ' (not adjusted)' : ''}.`,
    status: 'synthetic',
    status_note: 'Synthetic, soft range for context only; a cost manager decides what it means for this project.',
    history,
  };
  return { ok: true, result };
}
