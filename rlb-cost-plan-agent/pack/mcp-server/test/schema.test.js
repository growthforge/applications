// Schema tests: the JSON Schemas written in core/schemas.js, and the schemas the running
// server actually emits in tools/list, avoid every construct Copilot Studio's MCP connector is
// documented to mishandle; and every structured result conforms to its output schema.
// Run: node --test test/schema.test.js   (EMIT_DIR=<dir> also saves the emitted tools/list)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { loadToolkit, loadData } from '../server/load.js';
import { validate } from '../core/validate.js';
import { startServerProcess, schemaProblems, TOKEN } from './helpers.js';

const tk = loadToolkit();

for (const t of tk.tools) {
  test(`${t.name}: input schema has no $ref, exclusive bounds, type arrays or non-string enums`, () => {
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(t.inputSchema.additionalProperties, false);
    assert.deepEqual(schemaProblems(t.inputSchema, `${t.name}.input`, true), []);
  });
  test(`${t.name}: output schema has none of those constructs either`, () => {
    assert.equal(t.outputSchema.type, 'object');
    assert.deepEqual(schemaProblems(t.outputSchema, `${t.name}.output`, false), []);
  });
  test(`${t.name}: description says what the tool does not do`, () => {
    assert.ok(t.description.length > 120 && t.description.length < 1024);
    assert.match(t.description, /\bnot\b/);
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.annotations.destructiveHint, false);
  });
}

test('the checker itself catches the constructs it is meant to catch', () => {
  const bad = {
    type: 'object',
    properties: {
      a: { type: ['string', 'null'], description: 'x' },
      b: { type: 'integer', exclusiveMinimum: 0, description: 'x' },
      c: { $ref: '#/$defs/c', description: 'x' },
      d: { type: 'number', enum: [1, 2], description: 'x' },
      e: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'x' },
      f: { type: 'string' },
    },
  };
  const p = schemaProblems(bad).join('\n');
  for (const want of ['type is an array', 'exclusiveMinimum', '$ref', 'enum on a number', 'anyOf', 'f: no description']) assert.ok(p.includes(want), `missed: ${want}`);
});

// Sample calls whose structured results must each conform to the tool's output schema.
const plans = loadData().plans;
const SAMPLES = [
  ...plans.map((p) => ['check_cost_plan', { plan_id: p.plan_id }]),
  ['check_cost_plan', { gifa_m2: 1000, estimate_base_date: '2027-03', building_type: 'office', lines: [{ ref: 'A', nrm1_group: 2, unit: 'per_m2_gifa', rate_per_m2: 1200, total: 1200000, rate_base_date: '2026-06' }] }],
  ['check_cost_plan', { gifa_m2: 100, estimate_base_date: '2026-06', stated_total: 5, lines: [{ ref: 'A', nrm1_group: 1, unit: 'lump_sum', total: 1000 }] }],
  ['rebase_rate', { rate: 2000, from_month: '2021-12', to_month: '2026-06', from_location_factor: 1, to_location_factor: 1 }],
  ['rebase_rate', { rate: 2000, from_month: '2021-12', to_month: '2026-06', from_location_factor: 0.95, to_location_factor: 1.12, series: 'infrastructure', nrm1_group: 8 }],
  ['rebase_rate', { rate: 50000, from_month: '2019-06', to_month: '2026-06', from_location_factor: 1, to_location_factor: 1, unit: 'lump_sum', nrm1_group: 0 }],
  ['get_benchmark', { building_type: 'office', nrm1_group: 2, location_factor: 1 }],
  ['get_benchmark', { building_type: 'residential', nrm1_group: 5, location_factor: 0.95, to_month: '2023-01' }],
];

test('every structured result validates against its output schema (core validator)', () => {
  for (const [name, args] of SAMPLES) {
    const r = tk.call(name, args);
    assert.equal(r.isError, false, `${name}: ${r.text}`);
    const tool = tk.tools.find((t) => t.name === name);
    assert.deepEqual(validate(tool.outputSchema, r.structured), [], `${name} ${JSON.stringify(args).slice(0, 80)}`);
    for (const key of ['basis', 'status', 'history']) assert.ok(key in r.structured, `${name} result has ${key}`);
    assert.match(r.text, /Basis: /);
    assert.match(r.text, /Status: /);
  }
});

test('the running server emits exactly these schemas in tools/list, and they pass the same checks', async () => {
  const srv = await startServerProcess();
  try {
    const client = new Client({ name: 'schema-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
    await client.connect(new StreamableHTTPClientTransport(new URL(srv.url), { requestInit: { headers: { authorization: `Bearer ${TOKEN}` } } }));
    const listed = await client.listTools();
    await client.close();
    if (process.env.EMIT_DIR) fs.writeFileSync(path.join(process.env.EMIT_DIR, 'tools-list.json'), JSON.stringify(listed, null, 2) + '\n');
    assert.deepEqual(listed.tools.map((t) => t.name), tk.tools.map((t) => t.name));
    for (const emitted of listed.tools) {
      const mine = tk.tools.find((t) => t.name === emitted.name);
      assert.deepEqual(emitted.inputSchema, mine.inputSchema, `${emitted.name} input schema emitted unchanged`);
      assert.deepEqual(emitted.outputSchema, mine.outputSchema, `${emitted.name} output schema emitted unchanged`);
      assert.deepEqual(schemaProblems(emitted.inputSchema, `${emitted.name}.input`, true), []);
      assert.deepEqual(schemaProblems(emitted.outputSchema, `${emitted.name}.output`, false), []);
      const raw = JSON.stringify(emitted);
      for (const word of ['"$ref"', '"$defs"', 'exclusiveMinimum', 'exclusiveMaximum', '"anyOf"', '"oneOf"']) assert.ok(!raw.includes(word), `${emitted.name} contains ${word}`);
      assert.equal(emitted.annotations.readOnlyHint, true);
    }
  } finally {
    await srv.stop();
  }
});
