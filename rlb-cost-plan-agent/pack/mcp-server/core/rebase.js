// @ts-check
/**
 * rebase_rate: Ra2 = Ra1 x (index2 / index1) x (to location factor / from location factor).
 * NRM 1 section 2.10 states the index adjustment (Ra2 = Ra1 + Ra1 x p, p from the two
 * index values); the location factor is a separate, stated assumption because no free UK
 * location factor series is published.
 */
import { monthSerial, monthLabel, round, gbp, num } from './util.js';
import { groupName } from './nrm1.js';

export const UNIT_LABEL = /** @type {const} */ ({
  per_m2_gifa: 'per m² GIFA',
  lump_sum: 'lump sum',
  percent: 'per cent',
});

/**
 * @typedef {{ ok: false, refusal: { code: string, reason: string, next_step: string } }} Refusal
 * @typedef {{ ok: true, result: any } | Refusal} Outcome
 */

/**
 * @param {string} code
 * @param {string} reason
 * @param {string} next
 * @returns {Refusal}
 */
export function refuse(code, reason, next) {
  return { ok: false, refusal: { code, reason, next_step: next } };
}

/**
 * Index ratio between two months, or a refusal.
 * @param {ReturnType<typeof import('./series.js').createSeriesRegistry>} registry
 * @param {string} seriesId
 * @param {string} from
 * @param {string} to
 */
export function indexRatio(registry, seriesId, from, to) {
  const s = registry.get(seriesId);
  if (!s) return refuse('unknown_series', `There is no index series called "${seriesId}". Available: ${registry.ids().join(', ')}.`, 'Choose one of the listed series; all_new_work is the default for new build.');
  const first = monthSerial(s.first_month);
  const last = monthSerial(s.last_month);
  const a = monthSerial(from);
  const b = monthSerial(to);
  if (a < first || a > last) {
    return refuse('month_out_of_range', `${s.name} runs from ${monthLabel(s.first_month)} to ${monthLabel(s.last_month)} (released ${s.source.released}); ${monthLabel(from)} is outside it.`, 'Use a cost data date inside the published series, or supply another series that covers it.');
  }
  if (b > last) {
    return refuse('beyond_published_data', `${monthLabel(to)} is after the latest published month of ${s.name} (${monthLabel(s.last_month)}, released ${s.source.released}). Rebasing does not forecast.`, 'Rebase to the latest published month and carry the remaining period as a group 14 inflation allowance, stated separately.');
  }
  if (b < first) {
    return refuse('month_out_of_range', `${monthLabel(to)} is before the start of ${s.name} (${monthLabel(s.first_month)}).`, 'Use a target month inside the published series.');
  }
  const i1 = s.values[from];
  const i2 = s.values[to];
  return /** @type {const} */ ({ ok: true, series: s, i1, i2, ratio: i2 / i1 });
}

/**
 * A single factor relative to a national baseline (used by get_benchmark).
 * @param {number} f
 */
export function locationNote(f) {
  return f === 1
    ? '1.00: not adjusted for location. No free UK location factor series is published (the ONS indices have no regional split); a licensed or in-house factor should be stated if location matters.'
    : `${f.toFixed(2)}: a location factor stated by the caller, applied as a multiplier. It is an assumption, not derived from the index.`;
}

/**
 * Two factors: where the cost data came from, and where the project is.
 * @param {number} from
 * @param {number} to
 */
export function locationPairNote(from, to) {
  if (from === 1 && to === 1) return '1.00 to 1.00: not adjusted for location. No free UK location factor series is published (the ONS indices have no regional split); licensed or in-house factors should be stated if location matters.';
  if (from === to) return `${from.toFixed(2)} to ${to.toFixed(2)}: the same factor at both ends, so no location adjustment.`;
  return `${from.toFixed(2)} to ${to.toFixed(2)}: multiplied by ${to.toFixed(2)} / ${from.toFixed(2)} = ${num(to / from, 4)}. Factors stated by the caller; an assumption, not derived from the index.`;
}

/**
 * @param {ReturnType<typeof import('./series.js').createSeriesRegistry>} registry
 * @param {{ rate: number, from_month: string, to_month: string, from_location_factor: number, to_location_factor: number, series?: string, unit?: string, nrm1_group?: number }} args
 * @returns {Outcome}
 */
export function rebaseRate(registry, args) {
  const unit = args.unit || 'per_m2_gifa';
  const group = args.nrm1_group;
  const seriesId = args.series || registry.defaultId;

  if (unit === 'percent') {
    return refuse('percentage_addition', 'A percentage is not rebased. Percentage additions (preliminaries, overheads and profit, fees, risk, inflation) update themselves when the percentage is applied to the rebased rates (NRM 1 section 2.10).', 'Rebase the element rates, then apply the same percentage to the new total.');
  }
  if (group === 10 || group === 13 || group === 14) {
    return refuse('percentage_addition', `${groupName(group)} (group ${group}) is set as a percentage of other costs in the Table 2.1 build-up, so it is not rebased on its own.`, 'Rebase the element rates and recompute this addition from them.');
  }
  if (group === 11 || group === 12) {
    return refuse('not_a_construction_price', `${groupName(group)} (group ${group}) is not a construction output price, so a construction price index is not the right basis for updating it.`, 'Update it from the fee or cost basis it was set on, and state that basis.');
  }
  if (group === 9 && unit === 'lump_sum') {
    return refuse('percentage_addition', "A preliminaries sum taken from another tender carries that tender's percentage of its own works. Indexing the sum rebases a percentage addition.", 'Express the preliminaries as a percentage of that tender\'s works and apply it to the rebased works in this plan.');
  }

  const r = indexRatio(registry, seriesId, args.from_month, args.to_month);
  if (!r.ok) return r;
  const { series, i1, i2, ratio } = r;
  const lfFrom = args.from_location_factor;
  const lfTo = args.to_location_factor;
  const lfRatio = lfTo / lfFrom;
  const notAdjusted = lfFrom === lfTo;
  const unrounded = args.rate * ratio * lfRatio;
  const value = round(unrounded, 2);
  const pct = round(((i2 - i1) / i1) * 100, 2);
  const suffix = unit === 'lump_sum' ? '' : ` ${UNIT_LABEL.per_m2_gifa}`;
  const caveats = [...series.caveats, ...series.notes];
  if (group === 9) caveats.unshift('Preliminaries shown as a rate per m² follow the works they sit on; if the plan applies them as a percentage, recompute instead of rebasing.');

  const result = {
    figure: {
      value,
      unrounded,
      display: `${gbp(value, 0)}${suffix}`,
      unit,
      month: args.to_month,
    },
    input: {
      rate: args.rate,
      from_month: args.from_month,
      to_month: args.to_month,
      series: series.id,
      from_location_factor: lfFrom,
      to_location_factor: lfTo,
      unit,
      ...(group === undefined ? {} : { nrm1_group: group }),
    },
    index: {
      series_id: series.id,
      series_name: series.name,
      kind: series.kind,
      index_base: series.source.index_base,
      from_value: i1,
      to_value: i2,
      ratio,
      percentage_change: pct,
    },
    location: { from_factor: lfFrom, to_factor: lfTo, ratio: lfRatio, note: locationPairNote(lfFrom, lfTo) },
    formula: 'Ra2 = Ra1 x (index2 / index1) x (to location factor / from location factor)',
    rounding: 'Displayed to the nearest pound; value held to the penny; unrounded kept for audit.',
    caveats,
    basis: `${series.source.publisher} ${series.name} index (${series.source.index_base}): ${monthLabel(args.from_month)} ${i1} to ${monthLabel(args.to_month)} ${i2}; location factors ${lfFrom.toFixed(2)} to ${lfTo.toFixed(2)}${notAdjusted ? ' (not adjusted)' : ''}; input ${gbp(args.rate, 2)}${suffix} at ${monthLabel(args.from_month)}.`,
    status: 'indicative',
    status_note: 'A first-pass figure for the cost manager to review. Not approved, and not a tender price.',
    history: [
      { step: 1, event: 'input', detail: `${gbp(args.rate, 2)}${suffix} at ${monthLabel(args.from_month)}, as supplied by the caller${group !== undefined ? ` for ${groupName(group)}` : ''}.` },
      { step: 2, event: 'index ratio', detail: `x ${i2} / ${i1} = x ${num(ratio, 6)} (${series.name}, released ${series.source.released}).` },
      { step: 3, event: 'location factors', detail: `x ${lfTo.toFixed(2)} / ${lfFrom.toFixed(2)}${notAdjusted ? ' (not adjusted)' : ` = x ${num(lfRatio, 4)}`}.` },
      { step: 4, event: 'result', detail: `${gbp(value, 2)}${suffix} at ${monthLabel(args.to_month)}; displayed as ${gbp(value, 0)}.` },
    ],
    source: series.source,
  };
  return { ok: true, result };
}
