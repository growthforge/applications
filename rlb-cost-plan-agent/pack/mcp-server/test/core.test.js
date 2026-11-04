// Unit tests for the shared core: hand-computed figures, refusals and edge cases.
// Run: node --test test/core.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadData, loadToolkit } from '../server/load.js';
import { createToolkit } from '../core/toolkit.js';
import { sha256Hex } from '../core/sha256.js';
import { round, gbp, num, monthLabel, canonicalJson } from '../core/util.js';
import { planHash } from '../core/check.js';
import { ROOT } from './helpers.js';

const tk = loadToolkit();
const call = (name, args) => tk.call(name, args);
const ok = (name, args) => {
  const r = call(name, args);
  assert.equal(r.isError, false, r.text);
  return r.structured;
};
const refused = (name, args, code) => {
  const r = call(name, args);
  assert.equal(r.isError, true, `expected a refusal, got: ${r.text.slice(0, 200)}`);
  if (code) assert.equal(r.refusal.code, code, r.text);
  assert.match(r.text, /^Refused \(/);
  return r;
};
const REBASE = { rate: 2000, from_month: '2021-12', to_month: '2026-06', series: 'all_new_work', from_location_factor: 1, to_location_factor: 1 };

test('ONS data: values match the published workbook points recorded in research', () => {
  const ons = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/series/ons-opi.json'), 'utf8'));
  const anw = ons.series.all_new_work.values;
  assert.equal(anw['2021-12'], 121.7);
  assert.equal(anw['2022-12'], 134.9);
  assert.equal(anw['2023-06'], 140.5);
  assert.equal(anw['2024-06'], 143.9);
  assert.equal(anw['2025-06'], 147.7);
  assert.equal(anw['2026-06'], 150.9);
  assert.equal(ons.series.all_construction.values['2021-12'], 120.6);
  assert.equal(ons.series.all_construction.values['2026-06'], 146.4);
  assert.equal(ons.series.all_repair_maintenance.values['2026-06'], 138.2);
  assert.equal(ons.series.new_housing.values['2026-06'], 158.4);
  assert.equal(ons.series.infrastructure.values['2026-06'], 146.9);
  assert.equal(ons.series.private_industrial.values['2026-06'], 151.7);
  assert.equal(ons.month_count, 150);
  assert.equal(ons.first_month, '2014-01');
  assert.equal(ons.last_month, '2026-06');
  assert.equal(ons.released, '2026-08-13');
  assert.equal(ons.licence, 'Open Government Licence v3.0');
  assert.deepEqual(ons.series.public_non_housing.values, ons.series.private_commercial.values, 'the two series are identical in this release');
  assert.ok(ons.notes.some((n) => /identical/.test(n)));
});

test('rebase_rate: the worked ONS example, 2,000 per m² Dec 2021 to Jun 2026 on All new work', () => {
  const r = ok('rebase_rate', REBASE);
  // 2000 x 150.9 / 121.7 = 2479.8685...
  assert.equal(r.figure.value, 2479.87);
  assert.ok(Math.abs(r.figure.unrounded - 2479.8685291700904) < 1e-9);
  assert.equal(r.figure.display, '£2,480 per m² GIFA');
  assert.equal(r.index.from_value, 121.7);
  assert.equal(r.index.to_value, 150.9);
  assert.equal(r.index.percentage_change, 23.99);
  assert.equal(r.status, 'indicative');
  assert.match(r.basis, /All new work/);
  assert.match(r.basis, /not adjusted/);
  assert.equal(r.history.length, 4);
  assert.equal(r.source.licence, 'Open Government Licence v3.0');
  const text = call('rebase_rate', REBASE).text;
  assert.match(text, /£2,480 per m² GIFA/);
  assert.match(text, /Basis: /);
  assert.match(text, /Status: indicative/);
});

test('rebase_rate: series choice changes the answer (All construction gives 2,427.86)', () => {
  const r = ok('rebase_rate', { ...REBASE, series: 'all_construction' });
  // 2000 x 146.4 / 120.6 = 2427.8607
  assert.equal(r.figure.value, 2427.86);
  assert.equal(r.figure.display, '£2,428 per m² GIFA');
});

test('rebase_rate: location factors apply as a ratio; backwards and same-month rebasing', () => {
  const up = ok('rebase_rate', { ...REBASE, to_location_factor: 1.1 });
  assert.equal(up.figure.value, 2727.86); // 2479.8685 x 1.1 / 1.0
  assert.equal(up.location.ratio, 1.1);
  assert.match(up.location.note, /multiplied by 1\.10 \/ 1\.00/);
  assert.equal(ok('rebase_rate', { ...REBASE, from_location_factor: 1.25, to_location_factor: 1 }).figure.value, 1983.89); // 2479.8685 / 1.25
  const same = ok('rebase_rate', { ...REBASE, from_location_factor: 1.1, to_location_factor: 1.1 });
  assert.equal(same.figure.value, 2479.87);
  assert.match(same.location.note, /same factor at both ends/);
  assert.match(ok('rebase_rate', REBASE).location.note, /^1\.00 to 1\.00: not adjusted/);
  assert.equal(ok('rebase_rate', { ...REBASE, rate: 2479.87, from_month: '2026-06', to_month: '2021-12' }).figure.value, 2000); // 2479.87 x 121.7 / 150.9 = 2000.0011
  const sameMonth = ok('rebase_rate', { ...REBASE, from_month: '2026-06' });
  assert.equal(sameMonth.index.ratio, 1);
  assert.equal(sameMonth.figure.value, 2000);
  // The superstructure rate in PLAN-OFF-01: 960 x 150.9 / 121.7 = 1190.3369
  assert.equal(ok('rebase_rate', { rate: 960, from_month: '2021-12', to_month: '2026-06', from_location_factor: 1, to_location_factor: 1 }).figure.value, 1190.34);
});

test('rebase_rate: refuses percentage additions and non-construction groups', () => {
  refused('rebase_rate', { ...REBASE, rate: 14, unit: 'percent' }, 'percentage_addition');
  for (const g of [10, 13, 14]) refused('rebase_rate', { ...REBASE, nrm1_group: g }, 'percentage_addition');
  for (const g of [11, 12]) refused('rebase_rate', { ...REBASE, nrm1_group: g }, 'not_a_construction_price');
  refused('rebase_rate', { ...REBASE, nrm1_group: 9, unit: 'lump_sum' }, 'percentage_addition');
  const prelimsRate = ok('rebase_rate', { ...REBASE, rate: 300, nrm1_group: 9, unit: 'per_m2_gifa' });
  assert.match(prelimsRate.caveats[0], /Preliminaries shown as a rate/);
});

test('rebase_rate: refuses months outside the series and future months', () => {
  refused('rebase_rate', { ...REBASE, from_month: '2013-12' }, 'month_out_of_range');
  refused('rebase_rate', { ...REBASE, to_month: '2026-07' }, 'beyond_published_data');
  const far = refused('rebase_rate', { ...REBASE, to_month: '2030-01' }, 'beyond_published_data');
  assert.match(far.text, /group 14 inflation allowance/);
  refused('rebase_rate', { ...REBASE, to_month: '2010-01' }, 'month_out_of_range');
});

test('rebase_rate: input validation (missing location factors, bad months, bad numbers)', () => {
  const { from_location_factor, to_location_factor, ...noLf } = REBASE;
  const r = refused('rebase_rate', noLf, 'invalid_arguments');
  assert.match(r.text, /from_location_factor is required; to_location_factor is required/);
  assert.match(refused('rebase_rate', { ...noLf, from_location_factor: 1 }, 'invalid_arguments').text, /to_location_factor is required/);
  refused('rebase_rate', { ...REBASE, location_factor: 1 }, 'invalid_arguments');
  refused('rebase_rate', { ...REBASE, from_location_factor: 0.3 }, 'invalid_arguments');
  refused('rebase_rate', { ...REBASE, to_location_factor: 5 }, 'invalid_arguments');
  for (const m of ['2021-13', 'Dec 2021', '2021-1', '21-12', '']) refused('rebase_rate', { ...REBASE, from_month: m }, 'invalid_arguments');
  for (const rate of [-5, 0, 1e12, 'abc', '2000', Number.NaN, Number.POSITIVE_INFINITY, null]) refused('rebase_rate', { ...REBASE, rate }, 'invalid_arguments');
  refused('rebase_rate', { ...REBASE, series: 'rlb_tpi' }, 'invalid_arguments');
  refused('rebase_rate', { ...REBASE, approve: true }, 'invalid_arguments');
  refused('rebase_rate', undefined, 'invalid_arguments');
  refused('rebase_rate', 'not an object', 'invalid_arguments');
});

test('get_benchmark: synthetic range equals an independent recomputation from the projects', () => {
  const data = loadData();
  const idx = data.seriesCollections[0].series.all_new_work.values;
  const office = data.benchmarks.building_types.office;
  const rebased = office.projects.map((p) => p.rates['1'] * (idx['2026-06'] / idx[p.base_month])).sort((a, b) => a - b);
  const pct = (p) => { const h = (rebased.length - 1) * p; const lo = Math.floor(h); return rebased[lo] + (h - lo) * (rebased[Math.ceil(h)] - rebased[lo]); };
  const r = ok('get_benchmark', { building_type: 'office', nrm1_group: 1, location_factor: 1 });
  assert.equal(r.range.low, round(pct(0.1), 2));
  assert.equal(r.range.median, round(pct(0.5), 2));
  assert.equal(r.range.high, round(pct(0.9), 2));
  assert.equal(r.range.project_count, 12);
  assert.equal(r.status, 'synthetic');
  assert.equal(r.dataset.synthetic, true);
  assert.equal(r.rebased.applied, false);
  assert.match(call('get_benchmark', { building_type: 'office', nrm1_group: 1, location_factor: 1 }).text, /Status: synthetic/);
});

test('get_benchmark: rebased and location-adjusted range', () => {
  const base = ok('get_benchmark', { building_type: 'school', nrm1_group: 2, location_factor: 1 });
  const r = ok('get_benchmark', { building_type: 'school', nrm1_group: 2, location_factor: 1.08, to_month: '2025-12' });
  const idx = loadData().seriesCollections[0].series.all_new_work.values;
  const k = (idx['2025-12'] / idx['2026-06']) * 1.08;
  const ds = loadData().benchmarks.building_types.school.ranges['2'];
  assert.equal(r.range.median, round(ds.median * k, 2));
  assert.equal(r.rebased.applied, true);
  assert.ok(r.range.median !== base.range.median);
});

test('get_benchmark: refusals', () => {
  refused('get_benchmark', { building_type: 'office', nrm1_group: 9, location_factor: 1 }, 'not_an_element');
  refused('get_benchmark', { building_type: 'office', nrm1_group: 6, location_factor: 1 }, 'no_data');
  refused('get_benchmark', { building_type: 'office', nrm1_group: 2, location_factor: 1, to_month: '2027-01' }, 'beyond_published_data');
  refused('get_benchmark', { building_type: 'hospital', nrm1_group: 2, location_factor: 1 }, 'invalid_arguments');
  refused('get_benchmark', { building_type: 'office', nrm1_group: 2 }, 'invalid_arguments');
  refused('get_benchmark', { building_type: 'office', nrm1_group: 2.5, location_factor: 1 }, 'invalid_arguments');
});

test('check_cost_plan PLAN-OFF-01: the six planted items, in order, with hand-computed figures', () => {
  const r = ok('check_cost_plan', { plan_id: 'PLAN-OFF-01' });
  assert.equal(r.checked.line_count, 13);
  assert.equal(r.checked.source, 'store');
  assert.equal(r.checked.hash.length, 12);
  const got = r.flags.map((f) => `${f.id} ${f.severity} ${f.line_ref} ${f.check}`);
  assert.deepEqual(got, [
    'F01 check L01 arithmetic',
    'F02 check L03 inflation_double_count',
    'F03 check L09 percentage_base',
    'F04 review L02 base_date',
    'F05 review L05 basis',
    'F06 note L04 benchmark_range',
  ]);
  const f = Object.fromEntries(r.flags.map((x) => [x.id, x]));
  // 285 x 8,400 = 2,394,000 against a stated 2,349,000.
  assert.deepEqual(f.F01.figures, { stated: 2349000, expected: 2394000, difference: -45000 });
  // Jun 2026 to Jun 2027.
  assert.equal(f.F02.figures.months, 12);
  // Groups 1 to 8 = 22,425,000; groups 0 to 8 = 22,744,200; 14% of each = 3,139,500 and 3,184,188.
  assert.deepEqual(f.F03.figures, { stated: 3139500, expected: 3184188, difference: 44688 });
  assert.equal(f.F03.title, 'Percentage base to confirm');
  assert.match(f.F03.message, /leaving out group 0 \(facilitating works\)\. That is often deliberate/);
  // 960 x 150.9 / 121.7 = 1,190.34; Dec 2021 to Jun 2026 = 54 months.
  assert.deepEqual(f.F04.figures, { rate: 960, rebased_rate: 1190.34, months: 54 });
  assert.equal(f.F04.suggested_call.tool, 'rebase_rate');
  // No location factor is suggested: the agent has to ask for both.
  assert.deepEqual(JSON.parse(f.F04.suggested_call.arguments_json), { rate: 960, from_month: '2021-12', to_month: '2026-06', series: 'all_new_work', unit: 'per_m2_gifa', nrm1_group: 2 });
  assert.match(f.F04.message, /before any location adjustment/);
  // L02 rebased to Jun 2026 (1,190.34) sits inside the synthetic range, so no range note for it;
  // L03 (dated Jun 2027) cannot be brought back with the published index and is listed as not compared.
  assert.ok(!r.flags.some((x) => x.line_ref === 'L02' && x.check === 'benchmark_range'));
  assert.ok(r.skipped.some((x) => /L03/.test(x) && /not compared/.test(x)));
  for (const x of r.flags) assert.ok(!('location_factor' in JSON.parse(x.suggested_call.arguments_json || '{}')), `${x.id} suggests no location factor`);
  assert.match(f.F05.message, /"TBC"/);
  assert.equal(r.summary.items_for_review, 6);
  assert.deepEqual([r.summary.checks, r.summary.reviews, r.summary.notes], [3, 2, 1]);
  assert.equal(r.status, 'first_pass');
  assert.equal(r.build_up.preliminaries, 3139500);
  assert.equal(r.build_up.facilitating_works, 319200);
  assert.equal(r.build_up.building_works, 22425000);
  assert.equal(r.build_up.cost_limit_including_inflation, r.checked.stated_total);
  for (const x of r.flags) assert.doesNotMatch(x.message, /\bwrong\b/i);
});

test('check_cost_plan PLAN-SCH-02 and PLAN-WHS-03', () => {
  const s = ok('check_cost_plan', { plan_id: 'PLAN-SCH-02' });
  assert.deepEqual(s.flags.map((f) => `${f.severity} ${f.line_ref} ${f.check}`), [
    'check L09 percentage_rebased',
    'check L10 percentage_base',
    'review L14 inflation_period',
  ]);
  // Groups 0 to 8 = 30,840,000; with preliminaries 32,990,000; 5.5% = 1,696,200 and 1,814,450.
  assert.deepEqual(s.flags[1].figures, { stated: 1696200, expected: 1814450, difference: 118250 });
  assert.match(s.flags[1].message, /leaving out group 9 \(main contractor's preliminaries\)\. That can be deliberate/);
  assert.equal(s.flags[2].figures.months, 24);
  const w = ok('check_cost_plan', { plan_id: 'PLAN-WHS-03' });
  assert.equal(w.flags.length, 0);
  assert.match(call('check_cost_plan', { plan_id: 'PLAN-WHS-03' }).text, /still needs the cost manager's review/);
});

test('check_cost_plan: inline plan with the same content gives the same hash and result', () => {
  const stored = loadData().plans.find((p) => p.plan_id === 'PLAN-OFF-01');
  const a = ok('check_cost_plan', { plan_id: 'PLAN-OFF-01' });
  const b = ok('check_cost_plan', { lines: stored.lines, gifa_m2: stored.gifa_m2, estimate_base_date: stored.estimate_base_date, building_type: stored.building_type, stated_total: stored.stated_total });
  assert.equal(b.checked.source, 'inline');
  assert.equal(a.checked.hash, b.checked.hash);
  assert.deepEqual(a.flags, b.flags);
  // Change one rate: the hash changes.
  const lines = stored.lines.map((l) => (l.ref === 'L04' ? { ...l, rate_per_m2: 80, total: 80 * 8400 } : l));
  const c = ok('check_cost_plan', { lines, gifa_m2: 8400, estimate_base_date: '2026-06', building_type: 'office' });
  assert.notEqual(c.checked.hash, a.checked.hash);
  assert.ok(!c.flags.some((f) => f.line_ref === 'L04'), 'L04 at 80 per m² is inside the synthetic range');
});

test('check_cost_plan: edge cases are refused with a reason', () => {
  refused('check_cost_plan', {}, 'no_plan');
  refused('check_cost_plan', { lines: [], gifa_m2: 100, estimate_base_date: '2026-06' }, 'empty_plan');
  refused('check_cost_plan', { plan_id: 'PLAN-OFF-01', lines: [] }, 'ambiguous_input');
  refused('check_cost_plan', { plan_id: 'PLAN-OFF-01', gifa_m2: 10 }, 'ambiguous_input');
  const u = refused('check_cost_plan', { plan_id: 'PLAN-XYZ-99' }, 'unknown_plan');
  assert.match(u.text, /PLAN-OFF-01/);
  refused('check_cost_plan', { lines: [{ ref: 'A', nrm1_group: 1, unit: 'per_m2_gifa', rate_per_m2: 100, total: 100 }] }, 'missing_plan_details');
  const base = { gifa_m2: 100, estimate_base_date: '2026-06' };
  refused('check_cost_plan', { ...base, lines: [{ ref: 'A', nrm1_group: 1, unit: 'per_m2_gifa', total: 100 }] }, 'invalid_lines');
  refused('check_cost_plan', { ...base, lines: [{ ref: 'A', nrm1_group: 1, unit: 'per_m2_gifa', rate_per_m2: 1, total: 100 }, { ref: 'A', nrm1_group: 2, unit: 'lump_sum', total: 5 }] }, 'invalid_lines');
  refused('check_cost_plan', { ...base, lines: [{ ref: 'A', nrm1_group: 3, unit: 'percent', percentage: 5, applied_to: 'groups_0_to_2', total: 1 }] }, 'invalid_lines');
  refused('check_cost_plan', { ...base, lines: [{ ref: 'A', nrm1_group: 9, unit: 'percent', percentage: 5, applied_to: 'groups_0_to_9', total: 1 }] }, 'invalid_lines');
  // Huge, negative and non-numeric values never reach the checks.
  for (const rate of [1e7, -1, 'abc', '']) refused('check_cost_plan', { ...base, lines: [{ ref: 'A', nrm1_group: 1, unit: 'per_m2_gifa', rate_per_m2: rate, total: 1 }] }, 'invalid_arguments');
  refused('check_cost_plan', { ...base, lines: [{ ref: 'A', nrm1_group: 1, unit: 'lump_sum', total: 1e12 }] }, 'invalid_arguments');
  refused('check_cost_plan', { ...base, lines: Array.from({ length: 201 }, (_, i) => ({ ref: `L${i}`, nrm1_group: 1, unit: 'lump_sum', total: 1 })) }, 'invalid_arguments');
  refused('check_cost_plan', { ...base, gifa_m2: 0, lines: [{ ref: 'A', nrm1_group: 1, unit: 'lump_sum', total: 1 }] }, 'invalid_arguments');
  refused('check_cost_plan', { plan_id: 'plan-off-01' }, 'invalid_arguments');
});

test('check_cost_plan: a future estimate base date is checked, with rebasing suggestions withheld', () => {
  const r = ok('check_cost_plan', {
    gifa_m2: 1000, estimate_base_date: '2027-03', building_type: 'office',
    lines: [{ ref: 'A', nrm1_group: 2, unit: 'per_m2_gifa', rate_per_m2: 1200, total: 1200000, basis: 'Measured quantities priced at Jun 2026', status: 'measured_estimate', rate_base_date: '2026-06' }],
  });
  assert.equal(r.flags.length, 1);
  assert.equal(r.flags[0].check, 'base_date');
  assert.match(r.flags[0].message, /after the latest published month/);
  assert.equal(r.flags[0].suggested_call.tool, '');
  assert.ok(r.skipped.some((s) => /Benchmark range/.test(s)));
});

test('check_cost_plan: basis, status, missing dates and inflation without a period', () => {
  const r = ok('check_cost_plan', {
    gifa_m2: 1000, estimate_base_date: '2026-06',
    lines: [
      { ref: 'A', nrm1_group: 1, unit: 'per_m2_gifa', rate_per_m2: 200, total: 200000, basis: '', status: 'benchmark', rate_base_date: '2026-06' },
      { ref: 'B', nrm1_group: 2, unit: 'per_m2_gifa', rate_per_m2: 1000, total: 1000000, basis: 'Measured quantities priced at Jun 2026' },
      { ref: 'C', nrm1_group: 14, unit: 'percent', percentage: 3, applied_to: 'groups_0_to_13', total: 36000, basis: 'Inflation to the construction midpoint', status: 'allowance' },
    ],
  });
  const got = r.flags.map((f) => `${f.line_ref} ${f.check} ${f.title}`);
  assert.ok(got.includes('A basis No basis stated'));
  assert.ok(got.includes('B basis No status stated'));
  assert.ok(got.includes('B base_date No base date for this rate'));
  assert.ok(got.includes('C inflation_period No inflation period stated'));
  assert.ok(r.skipped.some((s) => /no building type/.test(s)));
});

test('check_cost_plan: a line total typed differently from the plan total is caught', () => {
  const line = { ref: 'A', nrm1_group: 1, unit: 'lump_sum', total: 100000, basis: 'Quotation from a groundworks contractor, Jun 2026', status: 'tendered', rate_base_date: '2026-06' };
  // Within the tolerance (£1 per line): no item. Two pounds over on one line: an item.
  assert.equal(ok('check_cost_plan', { gifa_m2: 100, estimate_base_date: '2026-06', stated_total: 100001, lines: [line] }).flags.length, 0);
  assert.equal(ok('check_cost_plan', { gifa_m2: 100, estimate_base_date: '2026-06', stated_total: 100002, lines: [line] }).flags[0].check, 'plan_total');
  // Two lines: £2 of rounding allowed in the plan total, £3 is not.
  const two = [line, { ...line, ref: 'B', total: 50000 }];
  assert.equal(ok('check_cost_plan', { gifa_m2: 100, estimate_base_date: '2026-06', stated_total: 150002, lines: two }).flags.length, 0);
  assert.equal(ok('check_cost_plan', { gifa_m2: 100, estimate_base_date: '2026-06', stated_total: 150003, lines: two }).flags[0].check, 'plan_total');
  const r = ok('check_cost_plan', { gifa_m2: 100, estimate_base_date: '2026-06', stated_total: 109000, lines: [line] });
  assert.equal(r.flags.length, 1);
  assert.equal(r.flags[0].check, 'plan_total');
  assert.deepEqual(r.flags[0].figures, { stated: 109000, expected: 100000, difference: 9000 });
  assert.equal(r.flags[0].line_ref, 'PLAN');
  assert.equal(r.flags[0].nrm1_group, -1);
});

test('arithmetic tolerance is absolute: the reviewer case (960 x 8,400 stated as 8,060,000) is caught, pound rounding is not', () => {
  const l = { ref: 'L02', nrm1_group: 2, unit: 'per_m2_gifa', rate_per_m2: 960, total: 8060000, basis: 'Measured quantities priced at Jun 2026', status: 'measured_estimate', rate_base_date: '2026-06' };
  const r = ok('check_cost_plan', { gifa_m2: 8400, estimate_base_date: '2026-06', lines: [l] });
  const a = r.flags.find((f) => f.check === 'arithmetic');
  assert.ok(a, 'a £4,000 error on an £8.06m line is raised');
  assert.deepEqual(a.figures, { stated: 8060000, expected: 8064000, difference: -4000 });
  // 333.33 x 3 = 999.99, stated as 1,000: rounding, not an error.
  const rounding = ok('check_cost_plan', { gifa_m2: 3, estimate_base_date: '2026-06', lines: [{ ...l, rate_per_m2: 333.33, total: 1000 }] });
  assert.ok(!rounding.flags.some((f) => f.check === 'arithmetic'));
  // Two pounds out on a percentage line is raised.
  const pct = ok('check_cost_plan', { gifa_m2: 1, estimate_base_date: '2026-06', lines: [{ ...l, rate_per_m2: 100000, total: 100000 }, { ref: 'P', nrm1_group: 9, unit: 'percent', percentage: 10, applied_to: 'groups_0_to_8', total: 10002, basis: 'Preliminaries at ten per cent of the works', status: 'allowance' }] });
  assert.ok(pct.flags.some((f) => f.check === 'arithmetic' && f.line_ref === 'P'));
});

test('benchmark range compares like with like in time, and cross-refers to the base date item', () => {
  const stored = loadData().plans.find((p) => p.plan_id === 'PLAN-OFF-01');
  const lines = stored.lines.map((l) => (l.ref === 'L02' ? { ...l, rate_per_m2: 500, total: 500 * 8400 } : l));
  const r = ok('check_cost_plan', { lines, gifa_m2: 8400, estimate_base_date: '2026-06', building_type: 'office' });
  const base = r.flags.find((f) => f.line_ref === 'L02' && f.check === 'base_date');
  const note = r.flags.find((f) => f.line_ref === 'L02' && f.check === 'benchmark_range');
  assert.ok(base && note);
  // 500 x 150.9 / 121.7 = 619.97, compared with the Jun 2026 range.
  assert.equal(note.figures.rebased_rate, 619.97);
  assert.match(note.message, new RegExp(`\\(see ${base.id}\\)`));
  assert.match(note.message, /becomes £619\.97/);
  assert.doesNotMatch(note.message, /\{\{ref:/);
});

test('determinism: the same call gives the same result', () => {
  assert.deepEqual(call('check_cost_plan', { plan_id: 'PLAN-OFF-01' }), call('check_cost_plan', { plan_id: 'PLAN-OFF-01' }));
  assert.deepEqual(call('rebase_rate', REBASE), call('rebase_rate', REBASE));
});

test('no network: tools run with fetch disabled, and the core never imports Node or network APIs', () => {
  const saved = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network call attempted'); };
  try {
    ok('check_cost_plan', { plan_id: 'PLAN-OFF-01' });
    ok('rebase_rate', REBASE);
    ok('get_benchmark', { building_type: 'warehouse', nrm1_group: 2, location_factor: 1, to_month: '2024-06' });
  } finally {
    globalThis.fetch = saved;
  }
  for (const f of fs.readdirSync(path.join(ROOT, 'core'))) {
    const src = fs.readFileSync(path.join(ROOT, 'core', f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|from 'node:|require\(/, `core/${f} must stay pure`);
  }
});

test('sha256: matches node:crypto, including non-ASCII text', () => {
  for (const s of ['', 'abc', '£2,479.87 per m² GIFA', 'x'.repeat(1000), canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] })]) {
    assert.equal(sha256Hex(s), createHash('sha256').update(s).digest('hex'));
  }
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  const plan = loadData().plans[0];
  assert.equal(planHash(plan), planHash({ ...plan, title: 'renamed', plan_id: 'X' }), 'hash covers content, not labels');
});

test('formatting helpers', () => {
  assert.equal(gbp(2479.8685, 2), '£2,479.87');
  assert.equal(gbp(2479.87), '£2,480');
  assert.equal(gbp(-45000), '-£45,000');
  assert.equal(num(1.005, 2), '1.01');
  assert.equal(round(1.005, 2), 1.01);
  assert.equal(round(-2.5, 0), -3);
  assert.equal(monthLabel('2021-12'), 'Dec 2021');
});

test('pluggable series: a firm can add its own index file', () => {
  const data = loadData();
  const months = Object.keys(data.seriesCollections[0].series.all_new_work.values);
  const values = Object.fromEntries(months.map((m, i) => [m, 100 + i * 0.5]));
  const custom = { id: 'example-tpi', kind: 'tender_price_index', publisher: 'Example firm (synthetic test series)', dataset: 'Synthetic tender price index', dataset_url: 'https://example.invalid/', released: '2026-10-01', licence: 'Internal', attribution: 'Synthetic test data', index_base: 'Jan 2014=100', first_month: months[0], last_month: months[months.length - 1], series: { example_tpi: { name: 'Synthetic tender price index', values } } };
  const tk2 = createToolkit({ ...data, seriesCollections: [...data.seriesCollections, custom] });
  assert.ok(tk2.schemas.rebaseInput.properties.series.enum.includes('example_tpi'));
  const r = tk2.call('rebase_rate', { rate: 1000, from_month: '2014-01', to_month: '2014-03', series: 'example_tpi', from_location_factor: 1, to_location_factor: 1 });
  assert.equal(r.structured.figure.value, 1010); // 1000 x 101 / 100
  assert.equal(r.structured.index.kind, 'tender_price_index');
  const broken = { ...custom, id: 'broken', series: { broken_series: { name: 'Broken', values: { [months[0]]: 100 } } } };
  assert.throws(() => createToolkit({ ...data, seriesCollections: [...data.seriesCollections, broken] }), /no positive value/);
});

test('generated data matches the generator (seed 20261104)', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['tools/generate_synthetic.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('docs: the Copilot Studio tool descriptions file carries each description verbatim', () => {
  const md = fs.readFileSync(path.join(ROOT, '..', 'copilot-studio', 'tool-descriptions.md'), 'utf8');
  for (const t of tk.tools) assert.ok(md.includes(t.description), `tool-descriptions.md is missing the current description of ${t.name}`);
});
