// @ts-check
/**
 * The text content of every result. Copilot Studio may hand only text to the model, so the
 * figure, its basis and its status are always written out in words here, not left to the
 * structured content.
 */
import { gbp, num, monthLabel } from './util.js';

/** @param {{ code: string, reason: string, next_step: string }} r */
export function refusalText(r) {
  return `Refused (${r.code}): ${r.reason} Next step: ${r.next_step}`;
}

/** @param {any} r */
export function rebaseText(r) {
  const unitWords = r.figure.unit === 'lump_sum' ? '' : ' per m² GIFA';
  return [
    `Rebased figure: ${r.figure.display} at ${monthLabel(r.figure.month)} (${gbp(r.figure.value, 2)} to the penny), from ${gbp(r.input.rate, 2)}${unitWords} at ${monthLabel(r.input.from_month)}.`,
    `Basis: ${r.basis} Index ratio ${num(r.index.ratio, 6)}, a change of ${num(r.index.percentage_change, 2)} per cent. ${r.source.attribution} Released ${r.source.released}.`,
    `Status: ${r.status}. ${r.status_note}`,
    `Caveats: ${r.caveats.join(' ')}`,
  ].join('\n');
}

/** @param {any} r */
export function benchmarkText(r) {
  return [
    `Synthetic range for ${r.building_type_name.toLowerCase()}, ${r.group_name.toLowerCase()} (group ${r.nrm1_group}) at ${monthLabel(r.month)}: ${r.display}, from ${r.range.project_count} synthetic projects.`,
    `Basis: ${r.basis}`,
    `Status: ${r.status}. ${r.status_note}`,
    `Caveats: ${r.caveats.join(' ')}`,
  ].join('\n');
}

/** @param {any} r */
export function checkText(r) {
  const c = r.checked;
  const s = r.summary;
  const head = `First-pass check of ${c.plan_id === 'INLINE' ? 'an inline plan' : `${c.plan_id}, ${c.title}`}: ${c.line_count} lines, stated total ${gbp(c.stated_total)}, plan hash ${c.hash}, estimate base date ${monthLabel(c.estimate_base_date)}.`;
  const count = s.items_for_review
    ? `${s.items_for_review} item${s.items_for_review === 1 ? '' : 's'} for review: ${s.checks} to confirm, ${s.reviews} needing a judgement, ${s.notes} soft benchmark note${s.notes === 1 ? '' : 's'}.`
    : 'No items raised. A line the tool does not flag is not thereby confirmed; the plan still needs the cost manager\'s review.';
  const items = r.flags.map((/** @type {any} */ f) => `${f.id} [${f.severity}] ${f.line_ref === 'PLAN' ? 'Whole plan' : `${f.line_ref} ${f.group_name}`}: ${f.title}. ${f.message} Line basis: ${f.line_basis || 'none stated'}; line status: ${f.line_status || 'none stated'}.`);
  return [
    head,
    count,
    ...items,
    ...(r.skipped.length ? [`Not checked: ${r.skipped.join(' ')}`] : []),
    `Cost limit including inflation ${gbp(r.build_up.cost_limit_including_inflation)} (${gbp(r.build_up.cost_per_m2_gifa)} per m² GIFA), VAT excluded, from the stated line totals.`,
    `Basis: ${r.basis}`,
    `Status: first pass. ${r.status_note}`,
  ].join('\n');
}
