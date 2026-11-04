// Runs the server side of every conversation in ../copilot-studio/evaluation.csv: the expected
// tool with the expected arguments must give the expected outcome (result, refusal or hand-off)
// and its text must contain the listed phrases. The agent side (did Copilot Studio pick this
// tool and word the reply well) is run in Copilot Studio's agent evaluation; see evaluation.md.
// Run: node --test test/evaluation.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadToolkit } from '../server/load.js';
import { ROOT } from './helpers.js';

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const tk = loadToolkit();
const rows = parseCsv(fs.readFileSync(path.join(ROOT, '..', 'copilot-studio', 'evaluation.csv'), 'utf8'));

test('evaluation set has about eight conversations with unique ids', () => {
  assert.ok(rows.length >= 8 && rows.length <= 12, `rows: ${rows.length}`);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

for (const r of rows) {
  test(`${r.id}: ${r.user_message.slice(0, 70)}`, () => {
    const args = JSON.parse(r.expected_arguments);
    const out = tk.call(r.expected_tool, args);
    if (r.expected_outcome === 'refusal') {
      assert.equal(out.isError, true, out.text);
      assert.equal(out.refusal.code, r.expected_refusal_code);
    } else {
      assert.equal(out.isError, false, out.text);
    }
    for (const phrase of r.tool_text_includes.split(';').filter(Boolean)) {
      assert.ok(out.text.includes(phrase), `${r.id}: tool text should include "${phrase}"\n${out.text}`);
    }
  });
}
