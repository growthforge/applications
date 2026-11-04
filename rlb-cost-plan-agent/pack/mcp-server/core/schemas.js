// @ts-check
/**
 * Tool input and output schemas, written as plain JSON Schema so that what Copilot Studio
 * receives in tools/list is exactly what is written here. Rules (tested in test/schema.test.js):
 * one type per property (no type arrays, no nullable unions), no $ref or $defs, no
 * exclusiveMinimum or exclusiveMaximum, enums only on string properties, every property described.
 */
import { MONTH_PATTERN } from './util.js';

/** @param {string} description */
const month = (description) => ({ type: 'string', pattern: MONTH_PATTERN, description });
const str = (/** @type {string} */ description) => ({ type: 'string', description });
const numb = (/** @type {string} */ description) => ({ type: 'number', description });
const int = (/** @type {string} */ description) => ({ type: 'integer', description });

const history = {
  type: 'array',
  description: 'How the figure was arrived at, step by step.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['step', 'event', 'detail'],
    properties: { step: int('Step number.'), event: str('What happened.'), detail: str('The figures and source for this step.') },
  },
};

const location = {
  type: 'object',
  additionalProperties: false,
  required: ['factor', 'note'],
  properties: { factor: numb('Location factor applied as a multiplier.'), note: str('What the factor means; 1.00 means not adjusted.') },
};

export const STATUS_VALUES = ['benchmark', 'measured_estimate', 'tendered', 'committed', 'actual', 'allowance'];

/**
 * @param {{ buildingTypes: string[], seriesIds: string[] }} opts
 */
export function buildSchemas({ buildingTypes, seriesIds }) {
  const line = {
    type: 'object',
    additionalProperties: false,
    required: ['ref', 'nrm1_group', 'unit', 'total'],
    properties: {
      ref: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,12}$', description: 'Line reference, unique within the plan, for example L02.' },
      nrm1_group: { type: 'integer', minimum: 0, maximum: 14, description: 'NRM 1 group element code, 0 (facilitating works) to 14 (inflation).' },
      description: { type: 'string', maxLength: 120, description: 'Short line description.' },
      unit: { type: 'string', enum: ['per_m2_gifa', 'lump_sum', 'percent'], description: 'How the line is priced: a rate per m² of gross internal floor area, a lump sum, or a percentage of other lines.' },
      rate_per_m2: { type: 'number', minimum: 0, maximum: 1000000, description: 'Rate in pounds per m² GIFA, for unit per_m2_gifa.' },
      percentage: { type: 'number', minimum: 0, maximum: 100, description: 'Percentage for unit percent, for example 14 for 14 per cent.' },
      applied_to: { type: 'string', pattern: '^groups_([0-9]|1[0-4])_to_([0-9]|1[0-4])$', description: 'For a percentage: the groups it is applied to, for example groups_0_to_8.' },
      total: { type: 'number', minimum: 0, maximum: 100000000000, description: 'Line total in pounds as stated in the plan.' },
      basis: { type: 'string', maxLength: 300, description: 'Where the figure came from and when, for example "Measured quantities priced at Jun 2026".' },
      status: { type: 'string', enum: STATUS_VALUES, description: 'Status of the figure: benchmark, measured_estimate, tendered, committed, actual or allowance.' },
      rate_base_date: month('Month the cost data relates to, as YYYY-MM.'),
      rebased_to: month('If the figure has been indexed, the month it was indexed to, as YYYY-MM.'),
      inflation_from: month('Group 14 only: first month of the inflation period, as YYYY-MM.'),
      inflation_to: month('Group 14 only: last month of the inflation period, as YYYY-MM.'),
    },
  };

  const checkInput = {
    type: 'object',
    additionalProperties: false,
    properties: {
      plan_id: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9-]{2,39}$', description: 'Reference of a stored cost plan, for example PLAN-OFF-01. Use this whenever the plan is stored; the server reads it and echoes what it checked.' },
      lines: { type: 'array', maxItems: 200, items: line, description: 'Only for a small ad hoc plan that is not stored, from clients that can send a list of line objects: the plan lines. Needs gifa_m2 and estimate_base_date too. Copilot Studio agents should use plan_id.' },
      gifa_m2: { type: 'number', minimum: 1, maximum: 1000000, description: 'Inline plans only: gross internal floor area in m².' },
      estimate_base_date: month('Inline plans only: the estimate base date of the cost plan, as YYYY-MM.'),
      building_type: { type: 'string', enum: buildingTypes, description: 'Inline plans only: building type, used for the soft benchmark comparison.' },
      stated_total: { type: 'number', minimum: 0, maximum: 100000000000, description: 'Inline plans only: the plan total as stated on its summary.' },
    },
  };

  const rebaseInput = {
    type: 'object',
    additionalProperties: false,
    required: ['rate', 'from_month', 'to_month', 'from_location_factor', 'to_location_factor'],
    properties: {
      rate: { type: 'number', minimum: 0.01, maximum: 10000000000, description: 'The rate or sum to rebase, in pounds (per m² GIFA unless unit says otherwise).' },
      from_month: month('Month the cost data relates to, as YYYY-MM.'),
      to_month: month('The estimate base date to rebase to, as YYYY-MM. It must be a published month: rebasing does not forecast.'),
      series: { type: 'string', enum: seriesIds, description: 'Index series. Default all_new_work (ONS construction output price index, all new work).' },
      from_location_factor: { type: 'number', minimum: 0.5, maximum: 2, description: 'Required. Location factor of the place the cost data comes from. State 1.00 at both ends for not adjusted. No free UK location factor series is published, so this is a recorded assumption: ask the user.' },
      to_location_factor: { type: 'number', minimum: 0.5, maximum: 2, description: 'Required. Location factor of the project. The rate is multiplied by to / from. State 1.00 at both ends for not adjusted.' },
      unit: { type: 'string', enum: ['per_m2_gifa', 'lump_sum', 'percent'], description: 'What the figure is. Default per_m2_gifa. A percent is refused: percentage additions are not rebased.' },
      nrm1_group: { type: 'integer', minimum: 0, maximum: 14, description: 'NRM 1 group element code of the figure, if known. Groups 10 to 14 are refused because they follow from other costs.' },
    },
  };

  const benchmarkInput = {
    type: 'object',
    additionalProperties: false,
    required: ['building_type', 'nrm1_group', 'location_factor'],
    properties: {
      building_type: { type: 'string', enum: buildingTypes, description: 'Building type in the synthetic benchmark set.' },
      nrm1_group: { type: 'integer', minimum: 0, maximum: 14, description: 'NRM 1 group element code, 0 to 8. Groups 9 to 14 are additions and are refused.' },
      to_month: month('Month to rebase the range to, as YYYY-MM, usually the estimate base date. Default: the dataset base month.'),
      location_factor: { type: 'number', minimum: 0.5, maximum: 2, description: 'Required. Location factor of the project relative to the national synthetic set, as a multiplier; state 1.00 for not adjusted.' },
    },
  };

  const rebaseOutput = {
    type: 'object',
    additionalProperties: false,
    required: ['figure', 'input', 'index', 'location', 'formula', 'rounding', 'caveats', 'basis', 'status', 'status_note', 'history', 'source'],
    properties: {
      figure: {
        type: 'object', additionalProperties: false, required: ['value', 'unrounded', 'display', 'unit', 'month'],
        properties: {
          value: numb('Rebased figure in pounds, to the penny.'),
          unrounded: numb('Rebased figure before rounding, for audit.'),
          display: str('Rebased figure as displayed, to the nearest pound.'),
          unit: str('Unit of the figure.'),
          month: str('Month the figure relates to, as YYYY-MM.'),
        },
      },
      input: {
        type: 'object', additionalProperties: false, required: ['rate', 'from_month', 'to_month', 'series', 'from_location_factor', 'to_location_factor', 'unit'],
        properties: {
          rate: numb('Input rate.'), from_month: str('Input month.'), to_month: str('Target month.'), series: str('Series used.'),
          from_location_factor: numb('Location factor of the cost data.'), to_location_factor: numb('Location factor of the project.'),
          unit: str('Unit of the input.'), nrm1_group: int('NRM 1 group, when given.'),
        },
      },
      index: {
        type: 'object', additionalProperties: false, required: ['series_id', 'series_name', 'kind', 'index_base', 'from_value', 'to_value', 'ratio', 'percentage_change'],
        properties: {
          series_id: str('Series id.'), series_name: str('Published series name.'), kind: str('Kind of index.'), index_base: str('Index base period.'),
          from_value: numb('Index value at the input month.'), to_value: numb('Index value at the target month.'),
          ratio: numb('to_value divided by from_value.'), percentage_change: numb('Percentage change between the two months, to two decimal places.'),
        },
      },
      location: {
        type: 'object', additionalProperties: false, required: ['from_factor', 'to_factor', 'ratio', 'note'],
        properties: { from_factor: numb('Location factor of the cost data.'), to_factor: numb('Location factor of the project.'), ratio: numb('to_factor divided by from_factor, applied to the rate.'), note: str('What the factors mean; 1.00 to 1.00 means not adjusted.') },
      },
      formula: str('Formula applied.'),
      rounding: str('How the figure is rounded.'),
      caveats: { type: 'array', items: { type: 'string' }, description: 'Limits of the index and the method.' },
      basis: str('The basis of the figure in words.'),
      status: { type: 'string', enum: ['indicative'], description: 'Status of the figure.' },
      status_note: str('What the status means.'),
      history,
      source: {
        type: 'object', additionalProperties: false, required: ['publisher', 'dataset', 'released', 'licence', 'url', 'attribution', 'index_base'],
        properties: {
          publisher: str('Publisher.'), dataset: str('Dataset title.'), released: str('Release date.'), licence: str('Licence.'),
          url: str('Dataset page.'), attribution: str('Attribution statement.'), index_base: str('Index base period.'),
        },
      },
    },
  };

  const benchmarkOutput = {
    type: 'object',
    additionalProperties: false,
    required: ['building_type', 'building_type_name', 'nrm1_group', 'group_name', 'unit', 'month', 'range', 'display', 'dataset', 'rebased', 'location', 'percentile_method', 'caveats', 'basis', 'status', 'status_note', 'history'],
    properties: {
      building_type: str('Building type id.'),
      building_type_name: str('Building type name.'),
      nrm1_group: int('NRM 1 group element code.'),
      group_name: str('NRM 1 group element name.'),
      unit: str('Unit of the range.'),
      month: str('Month the range relates to, as YYYY-MM.'),
      range: {
        type: 'object', additionalProperties: false, required: ['low', 'median', 'high', 'mean', 'project_count'],
        properties: { low: numb('Low (10th percentile).'), median: numb('Median.'), high: numb('High (90th percentile).'), mean: numb('Mean.'), project_count: int('Number of synthetic projects.') },
      },
      display: str('The range in words.'),
      dataset: {
        type: 'object', additionalProperties: false, required: ['id', 'name', 'synthetic', 'seed', 'generator', 'base_month'],
        properties: { id: str('Dataset id.'), name: str('Dataset name.'), synthetic: { type: 'boolean', description: 'Always true: the data is synthetic.' }, seed: int('Generator seed.'), generator: str('Script that made the data.'), base_month: str('Dataset base month.') },
      },
      rebased: {
        type: 'object', additionalProperties: false, required: ['applied', 'from_month', 'to_month', 'series_id', 'ratio'],
        properties: { applied: { type: 'boolean', description: 'Whether the range was rebased.' }, from_month: str('Dataset base month.'), to_month: str('Target month.'), series_id: str('Series used.'), ratio: numb('Index ratio applied (1 when not rebased).') },
      },
      location,
      percentile_method: str('How low, median and high are computed.'),
      caveats: { type: 'array', items: { type: 'string' }, description: 'Limits of the synthetic data.' },
      basis: str('The basis of the range in words.'),
      status: { type: 'string', enum: ['synthetic'], description: 'Status of the range.' },
      status_note: str('What the status means.'),
      history,
    },
  };

  const figures = {
    type: 'object',
    additionalProperties: false,
    description: 'The figures behind the item, where there are any.',
    properties: {
      stated: numb('Figure as stated in the plan.'), expected: numb('Figure recomputed by the check.'), difference: numb('Stated minus expected, or rate minus range edge.'),
      rate: numb('Rate per m² as stated.'), rebased_rate: numb('Rate rebased to the estimate base date.'), months: int('Months between the two dates.'),
      range_low: numb('Synthetic range low.'), range_high: numb('Synthetic range high.'),
    },
  };

  const checkOutput = {
    type: 'object',
    additionalProperties: false,
    required: ['checked', 'summary', 'flags', 'build_up', 'lines', 'skipped', 'basis', 'status', 'status_note', 'history'],
    properties: {
      checked: {
        type: 'object', additionalProperties: false,
        required: ['plan_id', 'title', 'source', 'source_ref', 'line_count', 'stated_total', 'lines_total', 'hash', 'gifa_m2', 'estimate_base_date', 'building_type'],
        description: 'Echo of exactly what was checked, so a transcription error is visible.',
        properties: {
          plan_id: str('Plan reference, or INLINE.'), title: str('Plan title.'), source: { type: 'string', enum: ['store', 'inline'], description: 'Where the plan came from.' },
          source_ref: str('Store path or "lines passed in the call".'), line_count: int('Number of lines checked.'), stated_total: numb('Plan total as stated.'),
          lines_total: numb('Sum of the line totals.'), hash: str('First 12 hex characters of the SHA-256 of the plan content.'),
          gifa_m2: numb('Gross internal floor area.'), estimate_base_date: str('Estimate base date.'), building_type: str('Building type, if given.'),
        },
      },
      summary: {
        type: 'object', additionalProperties: false, required: ['items_for_review', 'checks', 'reviews', 'notes'],
        properties: { items_for_review: int('All items.'), checks: int('Likely errors to confirm.'), reviews: int('Points needing a judgement.'), notes: int('Soft benchmark notes.') },
      },
      flags: {
        type: 'array',
        description: 'Items for review, most significant first: checks, then reviews, then soft notes.',
        items: {
          type: 'object', additionalProperties: false,
          required: ['id', 'line_ref', 'nrm1_group', 'group_name', 'check', 'severity', 'title', 'message', 'figures', 'line_basis', 'line_status', 'next_step', 'suggested_call'],
          properties: {
            id: str('Item id, F01 onwards.'), line_ref: str('Line reference, or PLAN for the whole plan.'), nrm1_group: { type: 'integer', minimum: -1, maximum: 14, description: 'NRM 1 group, or -1 for the whole plan.' },
            group_name: str('NRM 1 group name.'),
            check: { type: 'string', enum: ['arithmetic', 'basis', 'base_date', 'percentage_base', 'percentage_rebased', 'inflation_double_count', 'inflation_period', 'benchmark_range', 'plan_total'], description: 'Which check raised the item.' },
            severity: { type: 'string', enum: ['check', 'review', 'note'], description: 'check: a likely error to confirm; review: needs a judgement; note: soft context.' },
            title: str('Short title.'), message: str('The item in words, with the figures.'), figures,
            line_basis: str('The basis stated on the line.'), line_status: str('The status stated on the line.'), next_step: str('What a reviewer might do next.'),
            suggested_call: {
              type: 'object', additionalProperties: false, required: ['tool', 'arguments_json'],
              properties: { tool: str('A tool that helps with this item, or empty.'), arguments_json: str('Arguments for that tool as JSON text, or empty.') },
            },
          },
        },
      },
      build_up: {
        type: 'object', additionalProperties: false,
        description: 'The plan summarised in the Table 2.1 order, from the stated line totals.',
        required: ['facilitating_works', 'building_works', 'preliminaries', 'overheads_and_profit', 'works_cost_estimate', 'fees', 'other_project_costs', 'base_cost_estimate', 'risks', 'cost_limit_excluding_inflation', 'inflation', 'cost_limit_including_inflation', 'cost_per_m2_gifa', 'vat'],
        properties: {
          facilitating_works: numb('Group 0.'), building_works: numb('Groups 1 to 8.'), preliminaries: numb('Group 9.'), overheads_and_profit: numb('Group 10.'),
          works_cost_estimate: numb('Groups 0 to 10.'), fees: numb('Group 11.'), other_project_costs: numb('Group 12.'), base_cost_estimate: numb('Groups 0 to 12.'),
          risks: numb('Group 13.'), cost_limit_excluding_inflation: numb('Groups 0 to 13.'), inflation: numb('Group 14.'), cost_limit_including_inflation: numb('Groups 0 to 14.'),
          cost_per_m2_gifa: numb('Cost limit including inflation per m² GIFA.'), vat: str('VAT treatment.'),
        },
      },
      lines: {
        type: 'array',
        description: 'Each line as checked, with its basis, status and the items raised on it.',
        items: {
          type: 'object', additionalProperties: false,
          required: ['ref', 'nrm1_group', 'group_name', 'description', 'unit', 'total', 'basis', 'status', 'flag_ids'],
          properties: {
            ref: str('Line reference.'), nrm1_group: int('NRM 1 group.'), group_name: str('NRM 1 group name.'), description: str('Line description.'),
            unit: str('How the line is priced.'), total: numb('Line total as stated.'), basis: str('Basis as stated.'), status: str('Status as stated.'),
            rate_per_m2: numb('Rate per m² GIFA, when priced that way.'), percentage: numb('Percentage, when priced that way.'), applied_to: str('Base of a percentage.'),
            effective_month: str('Month the figure stands at (rebased month if indexed).'),
            flag_ids: { type: 'array', items: { type: 'string' }, description: 'Ids of items raised on this line.' },
          },
        },
      },
      skipped: { type: 'array', items: { type: 'string' }, description: 'Checks that could not run, and why.' },
      basis: str('What was checked, against what, in words.'),
      status: { type: 'string', enum: ['first_pass'], description: 'Status of the result.' },
      status_note: str('What the status means.'),
      history,
    },
  };

  return { line, checkInput, rebaseInput, benchmarkInput, checkOutput, rebaseOutput, benchmarkOutput };
}
