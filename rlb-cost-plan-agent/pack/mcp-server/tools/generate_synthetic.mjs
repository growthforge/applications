#!/usr/bin/env node
/**
 * generate_synthetic.mjs: makes the synthetic benchmark set and the sample cost plans.
 *
 *   node tools/generate_synthetic.mjs           (writes data/benchmarks.json and data/plans/*.json)
 *   node tools/generate_synthetic.mjs --check   (regenerates in memory and fails if the files differ)
 *
 * Everything here is made up. The benchmark projects are drawn from a seeded random generator
 * around central rates chosen by hand; each project is dated to its own month, priced at that
 * month with the ONS All new work index, then rebased back to the dataset base month the way a
 * benchmark analysis is normally assembled. The plans are hand-written test cases with planted
 * issues (listed in data/plans/README.md). None of it is RLB, BCIS or market data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { round, monthSerial } from '../core/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = 20261104;
const BASE_MONTH = '2026-06';
const PROJECTS_PER_TYPE = 12;
const ons = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/series/ons-opi.json'), 'utf8'));
const idx = ons.series.all_new_work.values;

/** mulberry32: a small, well-known 32-bit PRNG, so the data can be regenerated exactly. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
function normal() {
  let u = 0; while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function monthFromSerial(n) {
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
}
/** Linear interpolation between order statistics (the common "type 7" percentile). */
function percentile(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

// Central rates (pounds per m2 GIFA at the base month) and spread, chosen by hand for the test set.
const TYPES = {
  office: { name: 'Office', code: 'OFF', gifa: [4000, 20000], central: { 0: 35, 1: 270, 2: 1180, 3: 240, 4: 65, 5: 920, 8: 150 } },
  school: { name: 'Secondary school', code: 'SCH', gifa: [6000, 16000], central: { 0: 30, 1: 230, 2: 980, 3: 210, 4: 120, 5: 760, 8: 260 } },
  residential: { name: 'Residential apartments', code: 'RES', gifa: [5000, 25000], central: { 0: 25, 1: 210, 2: 1050, 3: 280, 4: 45, 5: 640, 8: 120 } },
  warehouse: { name: 'Distribution warehouse', code: 'WHS', gifa: [10000, 60000], central: { 0: 30, 1: 180, 2: 620, 3: 40, 4: 10, 5: 210, 8: 240 } },
};
const SPREAD = { 0: 0.35, 1: 0.18, 2: 0.14, 3: 0.2, 4: 0.35, 5: 0.16, 8: 0.3 };
const FIRST = monthSerial('2019-01');
const LAST = monthSerial('2025-12');

function makeBenchmarks() {
  const building_types = {};
  for (const [key, t] of Object.entries(TYPES)) {
    const projects = [];
    for (let i = 1; i <= PROJECTS_PER_TYPE; i++) {
      const base = monthFromSerial(FIRST + Math.floor(rand() * (LAST - FIRST + 1)));
      const gifa = Math.round((t.gifa[0] + rand() * (t.gifa[1] - t.gifa[0])) / 50) * 50;
      const projectFactor = Math.exp(0.08 * normal());
      const rates = {};
      for (const [g, c] of Object.entries(t.central)) {
        // Price at the project's own month: central x project factor x element noise, deflated by the index.
        rates[g] = Math.round(c * projectFactor * Math.exp(SPREAD[g] * normal()) * (idx[base] / idx[BASE_MONTH]));
      }
      projects.push({ id: `SYN-${t.code}-P${String(i).padStart(2, '0')}`, base_month: base, gifa_m2: gifa, rates });
    }
    const ranges = {};
    for (const g of Object.keys(t.central)) {
      const rebased = projects.map((p) => p.rates[g] * (idx[BASE_MONTH] / idx[p.base_month])).sort((a, b) => a - b);
      ranges[g] = {
        n: rebased.length,
        low: round(percentile(rebased, 0.1), 2),
        median: round(percentile(rebased, 0.5), 2),
        high: round(percentile(rebased, 0.9), 2),
        mean: round(rebased.reduce((s, x) => s + x, 0) / rebased.length, 2),
      };
    }
    building_types[key] = { name: t.name, projects, ranges };
  }
  return {
    id: 'SYN-BENCH-2026',
    name: 'Synthetic elemental benchmark set',
    synthetic: true,
    statement: 'Made-up projects from a seeded generator, for testing the tools and the agent. Not RLB, BCIS or market data. Groups 6 and 7 are not applicable to these building types and have no range.',
    seed: SEED,
    generator: 'tools/generate_synthetic.mjs',
    base_month: BASE_MONTH,
    rebase_series: 'all_new_work',
    unit: 'GBP per m2 GIFA',
    percentile_method: 'Low and high are the 10th and 90th percentiles, linear interpolation between order statistics',
    derivation: 'Each synthetic project is dated to a month between Jan 2019 and Dec 2025 and priced at that month (central rate x project factor x element noise x ONS All new work index ratio). The ranges rebase every project to the base month with the same index, then take percentiles.',
    building_types,
  };
}

// ---- Sample plans (hand-written test cases; planted issues listed in data/plans/README.md) ----
function line(ref, g, description, unit, value, extra = {}) {
  const l = { ref, nrm1_group: g, description, unit };
  if (unit === 'per_m2_gifa') l.rate_per_m2 = value;
  if (unit === 'percent') l.percentage = value;
  if (unit === 'lump_sum') l.total = value;
  return Object.assign(l, extra);
}

function finishPlan(plan, overrides = {}) {
  const sum = (a, b) => plan.lines.filter((l) => l.nrm1_group >= a && l.nrm1_group <= b).reduce((s, l) => s + l.total, 0);
  for (const l of plan.lines) {
    if (l.unit === 'per_m2_gifa') l.total = Math.round(l.rate_per_m2 * plan.gifa_m2);
    if (l.unit === 'percent') {
      const [, a, b] = /^groups_(\d+)_to_(\d+)$/.exec(l.applied_to);
      l.total = Math.round((l.percentage / 100) * sum(Number(a), Number(b)));
    }
    if (overrides[l.ref] !== undefined) l.total = overrides[l.ref];
    // keep a fixed key order for readable files
    const ordered = {};
    for (const k of ['ref', 'nrm1_group', 'description', 'unit', 'rate_per_m2', 'percentage', 'applied_to', 'total', 'basis', 'status', 'rate_base_date', 'rebased_to', 'inflation_from', 'inflation_to']) if (l[k] !== undefined) ordered[k] = l[k];
    Object.keys(l).forEach((k) => delete l[k]);
    Object.assign(l, ordered);
  }
  plan.stated_total = plan.lines.reduce((s, l) => s + l.total, 0);
  return plan;
}

function makePlans() {
  const MEAS = (m) => `Measured approximate quantities priced at ${m} (synthetic)`;
  const off = finishPlan({
    plan_id: 'PLAN-OFF-01',
    title: 'Synthetic office scheme, Stage 2 cost plan',
    synthetic: true,
    building_type: 'office',
    gifa_m2: 8400,
    estimate_base_date: '2026-06',
    lines: [
      line('L00', 0, 'Facilitating works', 'per_m2_gifa', 38, { basis: 'Desk study allowance for site clearance, Jun 2026 (synthetic)', status: 'allowance', rate_base_date: '2026-06' }),
      line('L01', 1, 'Substructure', 'per_m2_gifa', 285, { basis: MEAS('Jun 2026'), status: 'measured_estimate', rate_base_date: '2026-06' }),
      line('L02', 2, 'Superstructure', 'per_m2_gifa', 960, { basis: 'Synthetic benchmark set, office median at Dec 2021', status: 'benchmark', rate_base_date: '2021-12' }),
      line('L03', 3, 'Internal finishes', 'per_m2_gifa', 235, { basis: 'Synthetic benchmark rate including forecast inflation to Jun 2027', status: 'benchmark', rate_base_date: '2026-06', rebased_to: '2027-06' }),
      line('L04', 4, 'Fittings, furnishings and equipment', 'per_m2_gifa', 140, { basis: 'Client brief allowance for loose furniture, Jun 2026 (synthetic)', status: 'allowance', rate_base_date: '2026-06' }),
      line('L05', 5, 'Services', 'per_m2_gifa', 905, { basis: 'TBC', status: 'measured_estimate', rate_base_date: '2026-06' }),
      line('L08', 8, 'External works', 'per_m2_gifa', 150, { basis: MEAS('Jun 2026'), status: 'measured_estimate', rate_base_date: '2026-06' }),
      line('L09', 9, "Main contractor's preliminaries", 'percent', 14, { applied_to: 'groups_1_to_8', basis: 'Preliminaries at 14 per cent of the works (synthetic assumption)', status: 'allowance' }),
      line('L10', 10, "Main contractor's overheads and profit", 'percent', 6, { applied_to: 'groups_0_to_9', basis: 'Overheads and profit at 6 per cent (synthetic assumption)', status: 'allowance' }),
      line('L11', 11, 'Project and design team fees', 'percent', 9, { applied_to: 'groups_0_to_10', basis: 'Consultant fees at 9 per cent of the works cost estimate (synthetic assumption)', status: 'allowance' }),
      line('L12', 12, 'Other project costs', 'lump_sum', 180000, { basis: 'Surveys, planning and legal costs, client schedule Jun 2026 (synthetic)', status: 'allowance' }),
      line('L13', 13, 'Risks', 'percent', 7.5, { applied_to: 'groups_0_to_12', basis: 'Design development and construction risk from the synthetic risk register', status: 'allowance' }),
      line('L14', 14, 'Inflation', 'percent', 4.5, { applied_to: 'groups_0_to_13', basis: 'Tender and construction inflation to the construction midpoint (synthetic forecast)', status: 'allowance', inflation_from: '2026-06', inflation_to: '2027-09' }),
    ],
  }, { L01: 2349000 });

  const sch = finishPlan({
    plan_id: 'PLAN-SCH-02',
    title: 'Synthetic secondary school, Stage 3 cost plan',
    synthetic: true,
    building_type: 'school',
    gifa_m2: 12000,
    estimate_base_date: '2026-03',
    lines: [
      line('L00', 0, 'Facilitating works', 'per_m2_gifa', 30, { basis: 'Site investigation report allowance, Mar 2026 (synthetic)', status: 'allowance', rate_base_date: '2026-03' }),
      line('L01', 1, 'Substructure', 'per_m2_gifa', 225, { basis: MEAS('Mar 2026'), status: 'measured_estimate', rate_base_date: '2026-03' }),
      line('L02', 2, 'Superstructure', 'per_m2_gifa', 975, { basis: MEAS('Mar 2026'), status: 'measured_estimate', rate_base_date: '2026-03' }),
      line('L03', 3, 'Internal finishes', 'per_m2_gifa', 205, { basis: MEAS('Mar 2026'), status: 'measured_estimate', rate_base_date: '2026-03' }),
      line('L04', 4, 'Fittings, furnishings and equipment', 'per_m2_gifa', 115, { basis: 'Department schedule of loose and fixed equipment, Mar 2026 (synthetic)', status: 'allowance', rate_base_date: '2026-03' }),
      line('L05', 5, 'Services', 'per_m2_gifa', 765, { basis: 'MEP consultant cost plan, Mar 2026 (synthetic)', status: 'measured_estimate', rate_base_date: '2026-03' }),
      line('L08', 8, 'External works', 'per_m2_gifa', 255, { basis: MEAS('Mar 2026'), status: 'measured_estimate', rate_base_date: '2026-03' }),
      line('L09', 9, "Main contractor's preliminaries", 'lump_sum', 2150000, { basis: 'Preliminaries from a 2024 tender, indexed to Mar 2026 (synthetic)', status: 'tendered', rate_base_date: '2024-03', rebased_to: '2026-03' }),
      line('L10', 10, "Main contractor's overheads and profit", 'percent', 5.5, { applied_to: 'groups_0_to_8', basis: 'Overheads and profit at 5.5 per cent (synthetic assumption)', status: 'allowance' }),
      line('L11', 11, 'Project and design team fees', 'percent', 8, { applied_to: 'groups_0_to_10', basis: 'Consultant fees at 8 per cent of the works cost estimate (synthetic assumption)', status: 'allowance' }),
      line('L13', 13, 'Risks', 'percent', 6, { applied_to: 'groups_0_to_12', basis: 'Risk allowance from the synthetic risk register, Mar 2026', status: 'allowance' }),
      line('L14', 14, 'Inflation', 'percent', 6.8, { applied_to: 'groups_0_to_13', basis: 'Inflation from the 2024 tender date to the construction midpoint (synthetic forecast)', status: 'allowance', inflation_from: '2024-03', inflation_to: '2027-06' }),
    ],
  });

  const whs = finishPlan({
    plan_id: 'PLAN-WHS-03',
    title: 'Synthetic distribution warehouse, Stage 2 cost plan',
    synthetic: true,
    building_type: 'warehouse',
    gifa_m2: 24000,
    estimate_base_date: '2026-06',
    lines: [
      line('L00', 0, 'Facilitating works', 'per_m2_gifa', 28, { basis: 'Earthworks allowance from the synthetic site appraisal, Jun 2026', status: 'allowance', rate_base_date: '2026-06' }),
      line('L01', 1, 'Substructure', 'per_m2_gifa', 182, { basis: MEAS('Jun 2026'), status: 'measured_estimate', rate_base_date: '2026-06' }),
      line('L02', 2, 'Superstructure', 'per_m2_gifa', 615, { basis: MEAS('Jun 2026'), status: 'measured_estimate', rate_base_date: '2026-06' }),
      line('L03', 3, 'Internal finishes', 'per_m2_gifa', 40, { basis: MEAS('Jun 2026'), status: 'measured_estimate', rate_base_date: '2026-06' }),
      line('L05', 5, 'Services', 'per_m2_gifa', 212, { basis: 'MEP consultant cost plan, Jun 2026 (synthetic)', status: 'measured_estimate', rate_base_date: '2026-06' }),
      line('L08', 8, 'External works', 'per_m2_gifa', 236, { basis: MEAS('Jun 2026'), status: 'measured_estimate', rate_base_date: '2026-06' }),
      line('L09', 9, "Main contractor's preliminaries", 'percent', 12, { applied_to: 'groups_0_to_8', basis: 'Preliminaries at 12 per cent of the works (synthetic assumption)', status: 'allowance' }),
      line('L10', 10, "Main contractor's overheads and profit", 'percent', 5, { applied_to: 'groups_0_to_9', basis: 'Overheads and profit at 5 per cent (synthetic assumption)', status: 'allowance' }),
      line('L11', 11, 'Project and design team fees', 'percent', 7, { applied_to: 'groups_0_to_10', basis: 'Consultant fees at 7 per cent of the works cost estimate (synthetic assumption)', status: 'allowance' }),
      line('L13', 13, 'Risks', 'percent', 5, { applied_to: 'groups_0_to_12', basis: 'Risk allowance from the synthetic risk register, Jun 2026', status: 'allowance' }),
      line('L14', 14, 'Inflation', 'percent', 3.8, { applied_to: 'groups_0_to_13', basis: 'Tender and construction inflation from Jun 2026 to the construction midpoint (synthetic forecast)', status: 'allowance', inflation_from: '2026-06', inflation_to: '2027-06' }),
    ],
  });
  return [off, sch, whs];
}

const files = {
  'data/benchmarks.json': JSON.stringify(makeBenchmarks(), null, 1) + '\n',
};
for (const p of makePlans()) files[`data/plans/${p.plan_id}.json`] = JSON.stringify(p, null, 1) + '\n';

if (process.argv.includes('--check')) {
  let bad = 0;
  for (const [f, content] of Object.entries(files)) {
    const now = fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '';
    if (now !== content) { console.error(`differs: ${f}`); bad++; }
  }
  console.log(bad ? `${bad} file(s) differ from the generator` : `all ${Object.keys(files).length} generated files match (seed ${SEED})`);
  process.exit(bad ? 1 : 0);
}
for (const [f, content] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, f), content);
  console.log(`wrote ${f}`);
}
