// @ts-check
/**
 * check_cost_plan: a first pass over an elemental cost plan, in the order a cost manager
 * would want it: arithmetic, basis, base dates, percentage additions, inflation, then a soft
 * comparison with the synthetic benchmark ranges. Every item is for review; nothing is
 * approved, changed or called wrong.
 */
import { monthSerial, monthLabel, monthsBetween, round, gbp, num, canonicalJson } from './util.js';
import { sha256Hex } from './sha256.js';
import { groupName, EXPECTED_BASE, parseBase, baseLabel, baseId } from './nrm1.js';
import { indexRatio, refuse } from './rebase.js';
import { getBenchmark } from './benchmark.js';

export const RULESET = 'cost-plan-check rules 1.1';
/**
 * Absolute rounding tolerances only, so a real error on a large line is never absorbed:
 * a line total may differ from its recomputed figure by £1 (rounding to the pound), and the
 * plan total from the sum of the lines by £1 per line.
 */
export const TOLERANCE = Object.freeze({ perLine: 1, planPerLine: 1 });
/** Basis text that cannot be traced to a source. */
export const VAGUE_BASIS = /^(tbc|tba|tbd|n\/?a|-+|\?+|see above|as above|est\.?|estimate|allowance|assumed|assumption|various|misc\.?|other|budget|guess|pending)$/i;
export const MIN_BASIS_LENGTH = 12;
const SEVERITY_ORDER = { check: 0, review: 1, note: 2 };

/**
 * The content that identifies a plan (what was checked), independent of how it arrived.
 * @param {any} plan
 */
export function planContent(plan) {
  return {
    building_type: plan.building_type,
    gifa_m2: plan.gifa_m2,
    estimate_base_date: plan.estimate_base_date,
    stated_total: plan.stated_total,
    lines: plan.lines,
  };
}

/** @param {any} plan */
export function planHash(plan) {
  return sha256Hex(canonicalJson(planContent(plan))).slice(0, 12);
}

/**
 * @param {number} stated
 * @param {number} expected
 * @param {number} [allowed] pounds; default one line's rounding
 */
export function withinTolerance(stated, expected, allowed = TOLERANCE.perLine) {
  return Math.abs(stated - expected) <= allowed + 1e-9;
}

/**
 * Semantic checks on line shape that a JSON Schema cannot express. These are input
 * problems (the call is refused), not review items.
 * @param {any[]} lines
 * @returns {string[]}
 */
function lineProblems(lines) {
  const out = [];
  const seen = new Set();
  for (const l of lines) {
    if (seen.has(l.ref)) out.push(`${l.ref}: the line reference is used more than once`);
    seen.add(l.ref);
    if (l.unit === 'per_m2_gifa' && typeof l.rate_per_m2 !== 'number') out.push(`${l.ref}: priced per m² GIFA but has no rate_per_m2`);
    if (l.unit === 'percent') {
      if (typeof l.percentage !== 'number') out.push(`${l.ref}: a percentage line needs percentage`);
      const b = parseBase(l.applied_to);
      if (!b) out.push(`${l.ref}: a percentage line needs applied_to in the form groups_0_to_8`);
      else if (l.nrm1_group >= b[0] && l.nrm1_group <= b[1]) out.push(`${l.ref}: a percentage cannot be applied to a base that includes its own group`);
      if (l.nrm1_group <= 8) out.push(`${l.ref}: group elements 0 to 8 are priced as a rate per m² or a lump sum, not a percentage`);
    }
  }
  return out.slice(0, 6);
}

/**
 * @param {{ registry: any, benchmarks: any, plans: Record<string, any> }} ctx
 * @param {any} args
 * @returns {import('./rebase.js').Outcome}
 */
export function checkCostPlan(ctx, args) {
  const hasId = args.plan_id !== undefined;
  const hasLines = args.lines !== undefined;
  const inlineFields = ['building_type', 'gifa_m2', 'estimate_base_date', 'stated_total'].filter((f) => args[f] !== undefined);
  if (hasId && (hasLines || inlineFields.length)) {
    return refuse('ambiguous_input', 'Give either plan_id (a stored plan) or an inline plan (lines with gifa_m2 and estimate_base_date), not both.', 'Call again with plan_id only, or with the inline plan only.');
  }
  if (!hasId && !hasLines) {
    return refuse('no_plan', 'No plan was given.', 'Pass plan_id for a stored plan, or lines with gifa_m2 and estimate_base_date for a small ad hoc plan.');
  }

  /** @type {any} */
  let plan;
  /** @type {{ kind: string, ref: string }} */
  let source;
  if (hasId) {
    plan = ctx.plans[args.plan_id];
    if (!plan) {
      return refuse('unknown_plan', `There is no plan "${args.plan_id}" in the store. Stored plans: ${Object.keys(ctx.plans).sort().join(', ')}.`, 'Check the plan reference with the cost manager, or pass the lines inline.');
    }
    source = { kind: 'store', ref: `data/plans/${plan.plan_id}.json` };
  } else {
    if (args.gifa_m2 === undefined || args.estimate_base_date === undefined) {
      return refuse('missing_plan_details', 'An inline plan needs gifa_m2 and estimate_base_date as well as lines.', 'Add the gross internal floor area and the estimate base date, then call again.');
    }
    plan = {
      plan_id: 'INLINE',
      title: 'Plan passed inline',
      building_type: args.building_type,
      gifa_m2: args.gifa_m2,
      estimate_base_date: args.estimate_base_date,
      stated_total: args.stated_total,
      lines: args.lines,
    };
    source = { kind: 'inline', ref: 'lines passed in the call' };
  }
  if (!plan.lines.length) {
    return refuse('empty_plan', 'The plan has no lines to check.', 'Add the element and addition lines, then call again.');
  }
  const problems = lineProblems(plan.lines);
  if (problems.length) {
    return refuse('invalid_lines', `The plan cannot be checked as given: ${problems.join('; ')}.`, 'Correct these lines and call again.');
  }

  const gifa = plan.gifa_m2;
  const est = plan.estimate_base_date;
  const lines = plan.lines;
  const registry = ctx.registry;
  const seriesId = registry.defaultId;
  const seriesName = registry.get(seriesId).name;
  /** @param {number} a @param {number} b */
  const sumGroups = (a, b) => lines.filter((/** @type {any} */ l) => l.nrm1_group >= a && l.nrm1_group <= b).reduce((/** @type {number} */ s, /** @type {any} */ l) => s + l.total, 0);
  const inflationLine = lines.find((/** @type {any} */ l) => l.nrm1_group === 14);
  /** @type {any[]} */
  const flags = [];
  /** @type {string[]} */
  const skipped = [];

  /**
   * @param {any} l
   * @param {string} check
   * @param {'check'|'review'|'note'} severity
   * @param {string} title
   * @param {string} message
   * @param {Record<string, number>} figures
   * @param {string} next
   * @param {{ tool: string, arguments: any } | null} call
   */
  const flag = (l, check, severity, title, message, figures, next, call = null) => {
    flags.push({
      line_ref: l ? l.ref : 'PLAN',
      nrm1_group: l ? l.nrm1_group : -1,
      group_name: l ? groupName(l.nrm1_group) : 'Whole plan',
      check,
      severity,
      title,
      message,
      figures,
      line_basis: l ? (l.basis || '') : '',
      line_status: l ? (l.status || '') : '',
      next_step: next,
      suggested_call: call ? { tool: call.tool, arguments_json: JSON.stringify(call.arguments) } : { tool: '', arguments_json: '' },
      _order: lines.indexOf(l),
    });
  };

  for (const l of lines) {
    const g = l.nrm1_group;

    // 1. Arithmetic.
    if (l.unit === 'per_m2_gifa') {
      const expected = round(l.rate_per_m2 * gifa, 2);
      if (!withinTolerance(l.total, expected)) {
        flag(l, 'arithmetic', 'check', 'Line total does not match rate x GIFA',
          `Stated total ${gbp(l.total)}; ${gbp(l.rate_per_m2, 2)} x ${num(gifa)} m² gives ${gbp(expected)}, so the stated figure is ${gbp(Math.abs(l.total - expected))} ${l.total < expected ? 'lower' : 'higher'}.`,
          { stated: l.total, expected, difference: round(l.total - expected, 2) },
          'Check the extension and the floor area used on this line.');
      }
    } else if (l.unit === 'percent') {
      const b = /** @type {[number, number]} */ (parseBase(l.applied_to));
      const baseAmount = sumGroups(b[0], b[1]);
      const expected = round((l.percentage / 100) * baseAmount, 2);
      if (!withinTolerance(l.total, expected)) {
        flag(l, 'arithmetic', 'check', 'Percentage line does not match its own base',
          `Stated ${gbp(l.total)}; ${num(l.percentage, 2)}% of ${baseLabel(b)} (${gbp(baseAmount)}) gives ${gbp(expected)}, so the stated figure is ${gbp(Math.abs(l.total - expected))} ${l.total < expected ? 'lower' : 'higher'}.`,
          { stated: l.total, expected, difference: round(l.total - expected, 2) },
          'Check the percentage and the lines it is applied to.');
      }
    }

    // 2. Basis and status.
    const basis = (l.basis || '').trim();
    if (!basis || VAGUE_BASIS.test(basis) || basis.length < MIN_BASIS_LENGTH || !l.status) {
      const parts = [];
      if (!basis) parts.push('The line has no basis, so a reviewer cannot trace where the figure came from.');
      else if (VAGUE_BASIS.test(basis) || basis.length < MIN_BASIS_LENGTH) parts.push(`The basis reads "${basis}", which does not say where the figure came from or when.`);
      if (!l.status) parts.push('No status is recorded (benchmark, measured estimate, tendered, committed, actual or allowance).');
      const vague = !!basis && (VAGUE_BASIS.test(basis) || basis.length < MIN_BASIS_LENGTH);
      flag(l, 'basis', 'review', !basis ? 'No basis stated' : vague ? 'Basis too vague to trace' : 'No status stated',
        parts.join(' '), {}, 'State the source and its date (benchmark set, measured quantities, quotation or tender) and the status.');
    }

    // 3. Base dates of priced lines.
    const priced = g <= 8 || (g === 9 && l.unit === 'per_m2_gifa');
    if (priced) {
      if (!l.rate_base_date) {
        flag(l, 'base_date', 'review', 'No base date for this rate',
          'The rate has no base date, so it cannot be compared with the estimate base date.', {},
          'Add the month the cost data relates to.');
      } else {
        const eff = l.rebased_to || l.rate_base_date;
        const gap = monthsBetween(eff, est);
        if (gap > 0) {
          const r = indexRatio(registry, seriesId, eff, est);
          if (r.ok && l.unit === 'per_m2_gifa') {
            const rebased = round(l.rate_per_m2 * r.ratio, 2);
            flag(l, 'base_date', 'review', 'Rate is older than the estimate base date',
              `Rate dated ${monthLabel(eff)}; the estimate base date is ${monthLabel(est)}, ${gap} months later. The index alone (${seriesName}, ${r.i1} to ${r.i2}) takes ${gbp(l.rate_per_m2, 2)} to ${gbp(rebased, 2)} per m², before any location adjustment.`,
              { rate: l.rate_per_m2, rebased_rate: rebased, months: gap },
              'Rebase it with rebase_rate once the location factors are known (ask; 1.00 to 1.00 means not adjusted), or record why the older rate stands.',
              { tool: 'rebase_rate', arguments: { rate: l.rate_per_m2, from_month: eff, to_month: est, series: seriesId, unit: 'per_m2_gifa', nrm1_group: g } });
          } else {
            flag(l, 'base_date', 'review', 'Rate is older than the estimate base date',
              `Rate dated ${monthLabel(eff)}; the estimate base date is ${monthLabel(est)}, ${gap} months later.${r.ok ? '' : ` ${r.refusal.reason}`}`,
              { months: gap }, 'Bring the figure to the estimate base date, or record why the older figure stands.');
          }
        } else if (gap < 0) {
          if (inflationLine) {
            const from = inflationLine.inflation_from || est;
            flag(l, 'inflation_double_count', 'check', 'Inflation may be counted twice',
              `This rate carries prices to ${monthLabel(eff)}, ${-gap} months beyond the estimate base date (${monthLabel(est)}), and line ${inflationLine.ref} adds a group 14 inflation allowance of ${num(inflationLine.percentage || 0, 2)}% from ${monthLabel(from)}. The overlapping months are priced twice.`,
              { months: -gap },
              'Hold the rate at the estimate base date and carry inflation only in group 14.');
          } else {
            flag(l, 'base_date', 'review', 'Rate dated after the estimate base date',
              `Rate dated ${monthLabel(eff)}; the estimate base date is ${monthLabel(est)}. It may include forecast inflation.`,
              { months: -gap }, 'Confirm what the rate includes; if it carries inflation, bring it back to the estimate base date and show inflation in group 14.');
          }
        }
      }
    }

    // 4. Percentage additions.
    if (g >= 9) {
      if ((l.unit === 'percent' || l.unit === 'lump_sum') && l.rebased_to) {
        flag(l, 'percentage_rebased', 'check', 'Percentage addition has been rebased',
          `${groupName(g)} carries a figure indexed from ${monthLabel(l.rate_base_date || l.rebased_to)} to ${monthLabel(l.rebased_to)}. Percentage additions are not rebased (NRM 1 section 2.10); they follow from the updated rates.`,
          {}, 'Express it as a percentage and apply it to this plan\'s works.');
      }
      if (l.unit === 'percent' && EXPECTED_BASE[g]) {
        const stated = /** @type {[number, number]} */ (parseBase(l.applied_to));
        const want = EXPECTED_BASE[g];
        if (baseId(stated) !== baseId(want)) {
          const statedBase = sumGroups(stated[0], stated[1]);
          const wantBase = sumGroups(want[0], want[1]);
          const wantTotal = round((l.percentage / 100) * wantBase, 2);
          const left = [];
          const added = [];
          for (let k = Math.min(stated[0], want[0]); k <= Math.max(stated[1], want[1]); k++) {
            const inStated = k >= stated[0] && k <= stated[1];
            const inWant = k >= want[0] && k <= want[1];
            if (inWant && !inStated) left.push(`group ${k} (${groupName(k).toLowerCase()})`);
            if (inStated && !inWant) added.push(`group ${k} (${groupName(k).toLowerCase()})`);
          }
          const why = left.includes('group 0 (facilitating works)')
            ? 'That is often deliberate, for example when facilitating works are let as a separate contract with their own preliminaries.'
            : 'That can be deliberate; the basis does not say.';
          const diff = round(wantTotal - l.total, 2);
          flag(l, 'percentage_base', 'check', 'Percentage base to confirm',
            `${num(l.percentage, 2)}% is applied to ${baseLabel(stated)} (${gbp(statedBase)})${left.length ? `, leaving out ${left.join(' and ')}` : ''}${added.length ? `, including ${added.join(' and ')}` : ''}. ${why} If it is not intended, the Table 2.1 order (${baseLabel(want)}, ${gbp(wantBase)}) gives ${gbp(wantTotal)}, ${gbp(Math.abs(diff))} ${diff >= 0 ? 'more' : 'less'}.`,
            { stated: l.total, expected: wantTotal, difference: diff },
            'Confirm with the cost manager whether the base is intended, and say so in the basis.');
        }
      }
    }

    // 5. Inflation period.
    if (g === 14) {
      if (!l.inflation_from) {
        flag(l, 'inflation_period', 'review', 'No inflation period stated',
          'The allowance does not say which months it covers, so overlap with the rates cannot be ruled out.', {},
          'State the period, from the estimate base date to the construction midpoint (or the tender date for tender inflation).');
      } else {
        const gap = monthsBetween(l.inflation_from, est);
        if (gap > 0) {
          flag(l, 'inflation_period', 'review', 'Inflation period starts before the estimate base date',
            `The allowance runs from ${monthLabel(l.inflation_from)}, ${gap} months before the estimate base date (${monthLabel(est)}). Rates at ${monthLabel(est)} already include prices to that date, so those months may be counted twice.`,
            { months: gap }, 'Run the inflation period from the estimate base date.');
        } else if (gap < 0) {
          flag(l, 'inflation_period', 'review', 'Inflation period starts after the estimate base date',
            `The allowance runs from ${monthLabel(l.inflation_from)}, ${-gap} months after the estimate base date (${monthLabel(est)}); the months between are not covered.`,
            { months: -gap }, 'Run the inflation period from the estimate base date.');
        }
      }
    }
  }

  // 6. Soft range check against the synthetic benchmarks (listed last). The rate is first
  // brought to the estimate base date with the same index as the benchmark, so the comparison
  // is like for like in time; location is not adjusted (the plan does not state one).
  const bt = plan.building_type && ctx.benchmarks.building_types[plan.building_type];
  if (!bt) {
    skipped.push(plan.building_type ? `Benchmark range: the synthetic set has no "${plan.building_type}" building type.` : 'Benchmark range: no building type given.');
  } else {
    let skippedReason = '';
    for (const l of lines) {
      if (l.unit !== 'per_m2_gifa' || l.nrm1_group < 1 || l.nrm1_group > 8) continue;
      const b = getBenchmark(registry, ctx.benchmarks, { building_type: plan.building_type, nrm1_group: l.nrm1_group, location_factor: 1, to_month: est });
      if (!b.ok) { if (b.refusal.code !== 'no_data') skippedReason = b.refusal.reason; continue; }
      const eff = l.rebased_to || l.rate_base_date;
      if (!eff) { skipped.push(`Benchmark range for ${l.ref}: the rate has no base date, so it was not compared.`); continue; }
      let rate = l.rate_per_m2;
      let aligned = '';
      if (eff !== est) {
        const r = indexRatio(registry, seriesId, eff, est);
        if (!r.ok) { skipped.push(`Benchmark range for ${l.ref}: the rate is dated ${monthLabel(eff)} and cannot be brought to ${monthLabel(est)} with the published index, so it was not compared.`); continue; }
        rate = round(l.rate_per_m2 * r.ratio, 2);
        aligned = `Brought from ${monthLabel(eff)} to ${monthLabel(est)} with ${seriesName} (see {{ref:${l.ref}:${monthsBetween(eff, est) > 0 ? 'base_date' : 'inflation_double_count'}}}), ${gbp(l.rate_per_m2, 2)} per m² becomes ${gbp(rate, 2)}. `;
      }
      const { low, median, high } = b.result.range;
      if (rate < low || rate > high) {
        const edge = rate < low ? low : high;
        const diff = round(rate - edge, 2);
        /** @type {Record<string, number>} */
        const figures = { rate: l.rate_per_m2, range_low: low, range_high: high, difference: diff };
        if (aligned) figures.rebased_rate = rate;
        flag(l, 'benchmark_range', 'note', 'Outside the synthetic range (soft)',
          `${aligned}${aligned ? 'That is' : `${gbp(rate, 2)} per m² is`} ${rate < low ? 'below' : 'above'} the synthetic ${bt.name.toLowerCase()} range for ${groupName(l.nrm1_group).toLowerCase()} at ${monthLabel(est)} (${gbp(low)} to ${gbp(high)}, median ${gbp(median)}) by ${gbp(Math.abs(diff))} (${num(Math.abs(diff) / edge * 100, 1)}%). Location not adjusted. Synthetic data: context for a reviewer, not evidence of an error.`,
          figures,
          'Look at the basis of this line; check the range with get_benchmark if needed (it asks for the location factor).',
          { tool: 'get_benchmark', arguments: { building_type: plan.building_type, nrm1_group: l.nrm1_group, to_month: est } });
      }
    }
    if (skippedReason) skipped.push(`Benchmark range: ${skippedReason}`);
  }

  // 7. Plan total.
  const computedTotal = round(lines.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + l.total, 0), 2);
  if (typeof plan.stated_total === 'number' && !withinTolerance(plan.stated_total, computedTotal, TOLERANCE.planPerLine * lines.length)) {
    flag(null, 'plan_total', 'check', 'Plan total does not equal the sum of its lines',
      `Stated plan total ${gbp(plan.stated_total)}; the lines sum to ${gbp(computedTotal)}, so the stated total is ${gbp(Math.abs(plan.stated_total - computedTotal))} ${plan.stated_total < computedTotal ? 'lower' : 'higher'}.`,
      { stated: plan.stated_total, expected: computedTotal, difference: round(plan.stated_total - computedTotal, 2) },
      'Check the summary sheet against the lines.');
  }

  flags.sort((a, b) => (SEVERITY_ORDER[/** @type {'check'} */ (a.severity)] - SEVERITY_ORDER[/** @type {'check'} */ (b.severity)]) || (a._order - b._order));
  flags.forEach((f, i) => { f.id = `F${String(i + 1).padStart(2, '0')}`; delete f._order; });
  // Resolve cross-references between items ("see F04") now that ids are known.
  for (const f of flags) {
    f.message = f.message.replace(/\{\{ref:([^:}]+):([a-z_]+)\}\}/g, (/** @type {string} */ m, /** @type {string} */ line, /** @type {string} */ check) => {
      const t = flags.find((x) => x.line_ref === line && x.check === check);
      return t ? t.id : 'the base date item';
    });
  }
  const counts = { checks: 0, reviews: 0, notes: 0 };
  for (const f of flags) counts[f.severity === 'check' ? 'checks' : f.severity === 'review' ? 'reviews' : 'notes']++;

  const hash = planHash(plan);
  const s = (/** @type {number} */ a, /** @type {number} */ b) => round(sumGroups(a, b), 2);
  const buildUp = {
    facilitating_works: s(0, 0),
    building_works: s(1, 8),
    preliminaries: s(9, 9),
    overheads_and_profit: s(10, 10),
    works_cost_estimate: s(0, 10),
    fees: s(11, 11),
    other_project_costs: s(12, 12),
    base_cost_estimate: s(0, 12),
    risks: s(13, 13),
    cost_limit_excluding_inflation: s(0, 13),
    inflation: s(14, 14),
    cost_limit_including_inflation: s(0, 14),
    cost_per_m2_gifa: round(s(0, 14) / gifa, 2),
    vat: 'excluded',
  };

  const lineEcho = lines.map((/** @type {any} */ l) => {
    /** @type {any} */
    const e = { ref: l.ref, nrm1_group: l.nrm1_group, group_name: groupName(l.nrm1_group), description: l.description || groupName(l.nrm1_group), unit: l.unit, total: l.total, basis: l.basis || '', status: l.status || '' };
    if (typeof l.rate_per_m2 === 'number') e.rate_per_m2 = l.rate_per_m2;
    if (typeof l.percentage === 'number') e.percentage = l.percentage;
    if (l.applied_to) e.applied_to = l.applied_to;
    if (l.rate_base_date) e.effective_month = l.rebased_to || l.rate_base_date;
    e.flag_ids = flags.filter((f) => f.line_ref === l.ref).map((f) => f.id);
    return e;
  });

  const n = flags.length;
  const countWords = `${counts.checks} check${counts.checks === 1 ? '' : 's'}, ${counts.reviews} review${counts.reviews === 1 ? '' : 's'}, ${counts.notes} note${counts.notes === 1 ? '' : 's'}`;
  const result = {
    checked: {
      plan_id: plan.plan_id,
      title: plan.title,
      source: source.kind,
      source_ref: source.ref,
      line_count: lines.length,
      stated_total: typeof plan.stated_total === 'number' ? plan.stated_total : computedTotal,
      lines_total: computedTotal,
      hash,
      gifa_m2: gifa,
      estimate_base_date: est,
      building_type: plan.building_type || '',
    },
    summary: { items_for_review: n, checks: counts.checks, reviews: counts.reviews, notes: counts.notes },
    flags,
    build_up: buildUp,
    lines: lineEcho,
    skipped,
    basis: `Plan ${plan.plan_id} (${source.kind === 'store' ? source.ref : 'inline'}), ${lines.length} lines, hash ${hash}; ${RULESET}; benchmark comparison against the synthetic set ${ctx.benchmarks.id} at ${monthLabel(est)}; rebasing suggestions use ${seriesName} with location factor 1.00 (not adjusted).`,
    status: 'first_pass',
    status_note: 'Items for the cost manager to review. The tool has not approved, changed or sent anything, and a line it does not flag is not thereby confirmed.',
    history: [
      { step: 1, event: 'loaded', detail: `${source.kind === 'store' ? `Plan ${plan.plan_id} read from the sample store (${source.ref})` : 'Plan passed inline'}: ${lines.length} lines, stated total ${gbp(typeof plan.stated_total === 'number' ? plan.stated_total : computedTotal)}, hash ${hash}.` },
      { step: 2, event: 'checked', detail: `${RULESET}: arithmetic, basis, base dates, percentage additions, inflation, then the soft benchmark range.` },
      { step: 3, event: 'result', detail: n ? `${n} item${n === 1 ? '' : 's'} for review (${countWords}).` : 'No items raised. The plan still needs the cost manager\'s review.' },
    ],
  };
  return { ok: true, result };
}
