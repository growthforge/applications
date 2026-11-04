// @ts-check
/**
 * The toolkit: three read-only tools and one resource, defined once and used by the MCP
 * server (server/tools.js), the tests and the browser walkthrough. Data is passed in, so
 * the same functions run on Node (data read from disk) and in a browser (data fetched).
 */
import { createSeriesRegistry } from './series.js';
import { buildSchemas } from './schemas.js';
import { validate } from './validate.js';
import { rebaseRate } from './rebase.js';
import { getBenchmark } from './benchmark.js';
import { checkCostPlan } from './check.js';
import { GROUP_ELEMENTS } from './nrm1.js';
import { refusalText, rebaseText, benchmarkText, checkText } from './text.js';

export const SERVER_NAME = 'cost-plan-check';
export const SERVER_VERSION = '1.0.0';

export const INSTRUCTIONS = [
  'Read-only tools for a first pass over UK elemental cost plans (NRM 1 group elements).',
  'Every result carries a basis, a status and a history. Nothing here approves, edits or sends a figure:',
  'present results as items for the cost manager to review, never as approved numbers.',
  'Use plan_id for stored plans. Ask for both location factors before a rebase (1.00 to 1.00 means not adjusted); never assume one.',
  'Benchmark ranges are synthetic and soft.',
].join(' ');

/** Behaviour hints for clients. Every tool here reads bundled data and changes nothing. */
const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });

export const DESCRIPTIONS = {
  check_cost_plan: 'Runs a first-pass check of an elemental cost plan (NRM 1 group elements) and returns items for the cost manager to review: line arithmetic, missing or vague basis, rate base dates against the estimate base date, percentage additions whose base needs confirming against the Table 2.1 order or that have been rebased, inflation counted twice, then a soft comparison with synthetic benchmark ranges at the same date. Use plan_id for a stored plan (the route for Copilot Studio); pass lines, a list of line objects, only from clients that need a small ad hoc plan. It echoes the line count, total and a hash of what it checked. Read-only: it does not approve, edit or send anything, and it does not decide whether a cost is right.',
  rebase_rate: 'Rebases one rate between two months with a published index (ONS construction output price indices by default) using Ra2 = Ra1 x (index2 / index1), then applies the location factors you state, from where the cost data comes from to where the project is (1.00 to 1.00 means not adjusted; ask the user rather than assume). Use it to bring a benchmark or older rate to the estimate base date. It refuses percentage additions (preliminaries, overheads and profit, fees, risk, inflation) and months outside the published series. It does not forecast inflation and it does not give tender prices.',
  get_benchmark: 'Returns a synthetic low, median and high range per m² GIFA for one building type and NRM 1 group element (0 to 8), rebased to a month if asked and multiplied by the location factor you state. The data is synthetic, made by a seeded generator to test the agent: it is not RLB, BCIS or market data, and the range is context for a reviewer, not a target or an approval.',
};

export const RESOURCE = {
  name: 'nrm1-group-elements',
  uri: 'nrm1://group-elements',
  title: 'NRM 1 group elements (codes and names)',
  description: 'The fifteen NRM 1 level 1 group elements, codes and names only (NRM 1 is copyright RICS; no text is reproduced). The same names appear in every tool result, because Copilot Studio reads resources only through tool output.',
  mimeType: 'application/json',
};

/**
 * @param {{ seriesCollections: any[], benchmarks: any, plans: any[] }} data
 */
export function createToolkit(data) {
  const registry = createSeriesRegistry(data.seriesCollections);
  /** @type {Record<string, any>} */
  const plans = {};
  for (const p of data.plans) plans[p.plan_id] = p;
  const benchmarks = data.benchmarks;
  const schemas = buildSchemas({ buildingTypes: Object.keys(benchmarks.building_types), seriesIds: registry.ids() });
  const ctx = { registry, benchmarks, plans };

  const tools = [
    {
      name: 'check_cost_plan',
      title: 'Check a cost plan (first pass)',
      description: DESCRIPTIONS.check_cost_plan,
      inputSchema: schemas.checkInput,
      outputSchema: schemas.checkOutput,
      annotations: { title: 'Check a cost plan (first pass)', ...READ_ONLY },
      impl: (/** @type {any} */ a) => checkCostPlan(ctx, a),
      text: checkText,
    },
    {
      name: 'rebase_rate',
      title: 'Rebase a rate to the estimate base date',
      description: DESCRIPTIONS.rebase_rate,
      inputSchema: schemas.rebaseInput,
      outputSchema: schemas.rebaseOutput,
      annotations: { title: 'Rebase a rate to the estimate base date', ...READ_ONLY },
      impl: (/** @type {any} */ a) => rebaseRate(registry, a),
      text: rebaseText,
    },
    {
      name: 'get_benchmark',
      title: 'Synthetic benchmark range (soft)',
      description: DESCRIPTIONS.get_benchmark,
      inputSchema: schemas.benchmarkInput,
      outputSchema: schemas.benchmarkOutput,
      annotations: { title: 'Synthetic benchmark range (soft)', ...READ_ONLY },
      impl: (/** @type {any} */ a) => getBenchmark(registry, benchmarks, a),
      text: benchmarkText,
    },
  ];

  /**
   * Run one tool with the same validation the server applies.
   * @param {string} name
   * @param {unknown} args
   * @returns {{ isError: boolean, text: string, structured?: any, refusal?: { code: string, reason: string, next_step: string } }}
   */
  function call(name, args) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) return { isError: true, text: `Unknown tool ${name}.`, refusal: { code: 'unknown_tool', reason: `Unknown tool ${name}.`, next_step: 'Use check_cost_plan, rebase_rate or get_benchmark.' } };
    const a = args === undefined || args === null ? {} : args;
    const problems = validate(/** @type {any} */ (tool.inputSchema), a);
    if (problems.length) {
      const refusal = { code: 'invalid_arguments', reason: `The arguments do not fit the tool: ${problems.join('; ')}.`, next_step: 'Correct the arguments and call again.' };
      return { isError: true, text: refusalText(refusal), refusal };
    }
    const out = tool.impl(a);
    if (!out.ok) return { isError: true, text: refusalText(out.refusal), refusal: out.refusal };
    return { isError: false, text: tool.text(out.result), structured: out.result };
  }

  function readResource() {
    return { uri: RESOURCE.uri, mimeType: RESOURCE.mimeType, text: JSON.stringify({ source: 'RICS NRM 1, 3rd edition (October 2021): level 1 group element codes and names only', groups: GROUP_ELEMENTS }, null, 2) };
  }

  return { name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools, call, readResource, resource: RESOURCE, registry, plans, benchmarks, schemas };
}
