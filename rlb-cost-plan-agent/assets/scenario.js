// The walkthrough's script: which plan, which questions, and how an edited rate becomes the
// next tool call. Pure functions, imported by the page (walkthrough.js) and by the build-time
// prerender (tools/build_pages.mjs), so the no-JS page and the live page show the same calls.
import { gbp } from '../pack/mcp-server/core/util.js';

export const PLAN_ID = 'PLAN-OFF-01';

/** The call shown in the first viewport: a first pass over the stored synthetic plan. */
export const HERO_CALL = { name: 'check_cost_plan', args: { plan_id: PLAN_ID } };

/** The fields of the hero result shown on screen (the full result is one click away). */
export function heroExcerpt(r) {
  return {
    checked: { plan_id: r.checked.plan_id, line_count: r.checked.line_count, stated_total: r.checked.stated_total, hash: r.checked.hash },
    summary: r.summary,
    flags: r.flags.map((f) => `${f.id} ${f.severity} ${f.line_ref}: ${f.title}`),
    status: r.status,
  };
}

/** The one-line result above the hero code, built from the check result itself. */
export function heroLine(r) {
  const m = `£${(r.checked.stated_total / 1e6).toFixed(1)}m`;
  const n = r.summary.items_for_review;
  const a = r.flags.find((f) => f.check === 'arithmetic' && f.figures && typeof f.figures.difference === 'number');
  let tail = '';
  if (a) {
    const digits = (x) => String(Math.round(x)).split('').sort().join('');
    const transposed = digits(a.figures.stated) === digits(a.figures.expected);
    tail = `, including a ${gbp(Math.abs(a.figures.difference))} ${transposed ? 'transposed line total' : 'line total that does not match rate x GIFA'}`;
  }
  return `A first pass over a ${m} synthetic plan: ${n} item${n === 1 ? '' : 's'} for review${tail}.`;
}

/**
 * Parse what someone typed in a rate box. Numbers (commas allowed) come back as numbers;
 * anything else comes back as the text typed, so the tool's own validation answers it,
 * exactly as it would answer an agent that passed the same value.
 * @param {string} raw
 */
export function parseRate(raw) {
  const t = String(raw).trim();
  if (t === '') return '';
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : t;
}

/** The same bounds as the tool's schema for rate_per_m2. */
export const RATE_MIN = 0;
export const RATE_MAX = 1000000;
/** @param {unknown} v */
export function rateIsValid(v) {
  return typeof v === 'number' && v >= RATE_MIN && v <= RATE_MAX;
}

/**
 * Apply edited rates to the stored plan the way a spreadsheet would: a priced line's total
 * re-extends (rate x GIFA), each percentage line recomputes on the base it declares, and the
 * plan total is the sum of the lines. If any rate is not a valid number, nothing is
 * recomputed: the line keeps its old total, the plan is passed to the tool as typed, and the
 * page shows the tool's refusal instead of a total.
 * @param {any} stored the stored plan
 * @param {Record<string, string>} edits ref -> text typed
 */
export function applyEdits(stored, edits) {
  const plan = JSON.parse(JSON.stringify(stored));
  let changed = false;
  /** @type {string[]} */
  const invalid = [];
  for (const l of plan.lines) {
    if (l.unit !== 'per_m2_gifa' || edits[l.ref] === undefined) continue;
    const v = parseRate(edits[l.ref]);
    if (v === l.rate_per_m2) continue;
    changed = true;
    l.rate_per_m2 = v;
    if (rateIsValid(v)) l.total = Math.round(/** @type {number} */ (v) * plan.gifa_m2);
    else invalid.push(l.ref);
  }
  if (!changed) return { plan: stored, edited: false, invalid };
  if (invalid.length) return { plan, edited: true, invalid };
  const sum = (a, b) => plan.lines.filter((x) => x.nrm1_group >= a && x.nrm1_group <= b).reduce((s, x) => s + (typeof x.total === 'number' ? x.total : 0), 0);
  for (const l of plan.lines) {
    if (l.unit !== 'percent') continue;
    const m = /^groups_(\d+)_to_(\d+)$/.exec(l.applied_to);
    if (m) l.total = Math.round((l.percentage / 100) * sum(Number(m[1]), Number(m[2])));
  }
  plan.stated_total = plan.lines.reduce((s, l) => s + (typeof l.total === 'number' ? l.total : 0), 0);
  return { plan, edited: true, invalid };
}

/** The check_cost_plan call for the plan as it stands: by reference, or inline once edited. */
export function checkCall(plan, edited) {
  if (!edited) return { name: 'check_cost_plan', args: { plan_id: PLAN_ID } };
  return {
    name: 'check_cost_plan',
    args: { lines: plan.lines, gifa_m2: plan.gifa_m2, estimate_base_date: plan.estimate_base_date, building_type: plan.building_type, stated_total: plan.stated_total },
  };
}

/** The four agent questions, built from the plan as it stands. */
export function questions(plan, edited) {
  const l02 = plan.lines.find((l) => l.ref === 'L02');
  const l04 = plan.lines.find((l) => l.ref === 'L04');
  const rateWords = (v) => (typeof v === 'number' ? `${gbp(v, Number.isInteger(v) ? 0 : 2)} per m²` : `"${v}"`);
  return [
    {
      id: 'q-check',
      tab: 'Check the plan',
      ask: edited ? 'Check the edited plan before it goes to the client.' : `Check ${PLAN_ID} before it goes to the client.`,
      call: checkCall(plan, edited),
    },
    {
      id: 'q-rebase',
      tab: 'Rebase a rate',
      ask: `Bring the superstructure rate (${rateWords(l02.rate_per_m2)} at Dec 2021) to the estimate base date. No location adjustment at either end.`,
      call: { name: 'rebase_rate', args: { rate: l02.rate_per_m2, from_month: l02.rebased_to || l02.rate_base_date, to_month: plan.estimate_base_date, series: 'all_new_work', from_location_factor: 1, to_location_factor: 1, nrm1_group: 2 } },
    },
    {
      id: 'q-bench',
      tab: 'Benchmark',
      ask: `Is the furniture allowance (${rateWords(l04.rate_per_m2)}) reasonable for an office? No location adjustment.`,
      call: { name: 'get_benchmark', args: { building_type: plan.building_type, nrm1_group: 4, to_month: plan.estimate_base_date, location_factor: 1 } },
      compare: { ref: 'L04', rate: l04.rate_per_m2 },
    },
    {
      id: 'q-refuse',
      tab: 'A refusal',
      ask: 'Rebase the 14 per cent preliminaries to Jun 2026 as well.',
      call: { name: 'rebase_rate', args: { rate: 14, unit: 'percent', nrm1_group: 9, from_month: '2021-12', to_month: '2026-06', from_location_factor: 1, to_location_factor: 1 } },
    },
  ];
}
