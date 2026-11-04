#!/usr/bin/env node
// run-evals.mjs: offline evaluation of the evidence-pack harness. No dependencies (Node 18 or later).
//
//   node run-evals.mjs           offline: deterministic checks, mock drafts, schema and contract,
//                                tampered packs, reply parsing, the analyst gate. Writes eval-results.md
//                                and eval-results.json next to this file. Exit 1 on any failure.
//   node run-evals.mjs --live    also calls Claude for each case that needs the model, but only when
//                                ANTHROPIC_API_KEY is set in your environment. Writes eval-results.live.md.
//
// Synthetic data only. Prepared by Hemanth Vallamkonda as part of an application to Cint.
// Independent and illustrative; uses public information only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');
const data = JSON.parse(read('synthetic-cases.json'));
const schema = JSON.parse(read('evidence-pack.schema.json'));
const prompt = read('evidence-pack.prompt.md');
const live = process.argv.includes('--live');

export function systemPromptFrom(md) {
  const m = md.match(/<!-- BEGIN SYSTEM PROMPT -->\s*```text\n([\s\S]*?)\n```\s*<!-- END SYSTEM PROMPT -->/);
  if (!m) throw new Error('system prompt block not found in evidence-pack.prompt.md');
  return m[1].trim();
}
const SYSTEM = systemPromptFrom(prompt);
const codes = data.publishedCodes;

const rows = [];   // { group, name, pass, detail }
function check(group, name, pass, detail = '') { rows.push({ group, name, pass: !!pass, detail }); }
const packText = (p) => [...p.claims.map((c) => c.text), p.reviewerNote, ...p.missingEvidence].join(' ');

// 1. Deterministic checks and mock drafts, case by case.
const packs = {};
const caseRows = [];
for (const c of data.cases) {
  const checks = H.runChecks(c, codes);
  const exp = c.expected;
  check('checks', `${c.caseId}: model called only when needed`, checks.needsModel === exp.modelCalled, `needsModel ${checks.needsModel}`);
  const okReadings = [exp.reading, ...(exp.alsoAllowed || [])];
  check('checks', `${c.caseId}: code bounds the reading`, okReadings.every((r) => checks.allowedReadings.includes(r)) && checks.allowedReadings.every((r) => okReadings.includes(r)),
    `allowed: ${checks.allowedReadings.join(', ')}`);
  const pack = H.mockDraft(c, checks);
  packs[c.caseId] = { pack, checks, c };
  const v = H.validatePack(pack, checks, schema, codes);
  check('mock pack', `${c.caseId}: valid against schema and contract`, v.valid, v.errors.join('; '));
  check('mock pack', `${c.caseId}: reading ${exp.reading}`, pack.reading === exp.reading, pack.reading);
  check('mock pack', `${c.caseId}: confidence ${exp.confidence}`, pack.confidence === exp.confidence, pack.confidence);
  const text = packText(pack);
  const missing = exp.mustMention.filter((s) => !text.toLowerCase().includes(s.toLowerCase()));
  check('mock pack', `${c.caseId}: states ${exp.mustMention.map((s) => `"${s}"`).join(' and ')}`, missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : '');
  const req = H.buildClaudeRequest(c, checks, SYSTEM, schema);
  check('request', `${c.caseId}: request carries the schema, no fixture fields`,
    req.output_config.format.schema === schema && req.fallbacks === 'default' && !req.messages[0].content.includes('"expected"') && !req.messages[0].content.includes('"title"'));
  caseRows.push({ caseId: c.caseId, title: c.title, code: checks.reasonCode, coverage: `${checks.coverage.recorded} of ${checks.coverage.total}`,
    signal: checks.signal ? `${checks.signal.count} of ${checks.signal.of}` : 'none', allowed: checks.allowedReadings.join(', '),
    ceiling: checks.maxConfidence, model: checks.needsModel ? 'yes' : 'no (code only)', expected: exp.reading, reading: pack.reading, confidence: pack.confidence, valid: v.valid,
    match: okReadings.includes(pack.reading) && pack.confidence === exp.confidence });
}

// 2. Tampered packs: the validator must reject every one, for the stated reason.
const clone = (o) => JSON.parse(JSON.stringify(o));
const tampers = [
  ['recommends an outcome', 'SYN-01', (p) => { p.reviewerNote += ' Uphold the reversal.'; }, 'recommendation language'],
  ['invents a count', 'SYN-01', (p) => { p.claims[1].text = p.claims[1].text.replace('34 of 40', '36 of 40'); }, 'number 36'],
  ['reads past the bounds', 'SYN-02', (p) => { p.reading = 'consistent_with_stated_reason'; p.confidence = 'high'; }, 'outside the bounds'],
  ['claims more confidence than the ceiling', 'SYN-08', (p) => { p.confidence = 'high'; }, 'above the ceiling'],
  ['cites a source the case does not hold', 'SYN-01', (p) => { p.claims[2].source = 'buyer_form'; }, 'does not hold'],
  ['adds a decision field', 'SYN-01', (p) => { p.decision = 'uphold'; }, 'unexpected field decision'],
  ['skips the set-up check', 'SYN-01', (p) => { p.claims = p.claims.filter((c) => c.kind !== 'setup_history'); }, 'set-up history'],
  ['misses the injected instruction', 'SYN-04', (p) => { p.reviewerNote = 'Reading: not consistent with the stated reason.'; }, 'instruction-like'],
  ['gives not enough evidence without saying what is missing', 'SYN-02', (p) => { p.missingEvidence = []; }, 'names what is missing'],
  ['puts the code check second', 'SYN-01', (p) => { p.claims.reverse(); }, 'first claim is the code check'],
  ['makes a reading on a code-only case', 'SYN-06', (p) => { p.reading = 'consistent_with_stated_reason'; p.confidence = 'high'; }, 'outside the bounds'],
  ['changes the case id', 'SYN-03', (p) => { p.caseId = 'SYN-09'; }, 'caseId does not match'],
];
for (const [name, id, mutate, expectErr] of tampers) {
  const { pack, checks } = packs[id];
  const p = clone(pack);
  mutate(p);
  const v = H.validatePack(p, checks, schema, codes);
  const hit = !v.valid && v.errors.some((e) => e.includes(expectErr));
  check('validator bites', `${id}: rejects a pack that ${name}`, hit, v.valid ? 'accepted (should be rejected)' : v.errors[0]);
}

// 3. Reading the model's reply: refusals, truncation and bad JSON fail safe.
const good = { stop_reason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(packs['SYN-01'].pack) }] };
check('reply parsing', 'a valid reply becomes a pack', H.parseClaudeResponse(good).pack !== null);
check('reply parsing', 'a refusal goes to the manual route', H.parseClaudeResponse({ stop_reason: 'refusal', content: [] }).error.includes('refusal'));
check('reply parsing', 'a cut-off reply goes to the manual route', H.parseClaudeResponse({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"caseId":' }] }).error.includes('max_tokens'));
check('reply parsing', 'a non-JSON reply goes to the manual route', H.parseClaudeResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is the pack.' }] }).error.includes('not valid JSON'));
check('reply parsing', 'an API error goes to the manual route', H.parseClaudeResponse({ type: 'error', error: { message: 'overloaded' } }).error.includes('API error'));

// 4. The analyst gate and the log.
{
  const { pack, checks, c } = packs['SYN-01'];
  const item = H.reviewItem(c, checks, pack, { valid: true, errors: [] }, 'mock');
  check('analyst gate', 'a valid pack waits for the analyst', item.status === 'awaiting_analyst' && item.options.length === 3);
  const bad = H.recordDecision(item, { decision: 'auto', analyst: 'A1', reason: 'x', packFeedback: 'accepted' });
  check('analyst gate', 'an answer outside the offered options is refused', bad.status === 'decision_rejected');
  const noReason = H.recordDecision(item, { decision: 'send_to_audit', analyst: 'A1', packFeedback: 'accepted' });
  check('analyst gate', 'a decision without a recorded reason is refused', noReason.status === 'decision_rejected');
  const ok = H.recordDecision(item, { decision: 'send_to_audit', analyst: 'A1', reason: 'Times support the code; audit notice to follow.', packFeedback: 'edited', feedbackNote: 'Tightened the note.' });
  check('analyst gate', 'a complete decision is recorded with the pack feedback', ok.status === 'decided' && ok.packFeedback === 'edited');
  const failed = H.reviewItem(c, checks, null, { valid: false, errors: ['x'] }, 'claude');
  check('analyst gate', 'a failed pack is withheld; the case goes to the manual route', failed.status === 'manual_route' && failed.pack === null);
  const e = H.auditEntry(ok, checks, '2026-11-03T09:00:00.000Z');
  check('audit log', 'the log entry records the checks digest, the reading and the decision', e.checksDigest.length === 8 && e.reading === pack.reading && e.decision === 'send_to_audit');
  check('audit log', 'the log stores no case evidence', !JSON.stringify(e).includes('loiSec') && !JSON.stringify(e).includes('SYN01-R'));
}

// 5. Optional live run.
let liveRows = null;
if (live) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.error('--live needs ANTHROPIC_API_KEY in your environment; offline results only.'); }
  else {
    liveRows = [];
    for (const { c, checks } of Object.values(packs)) {
      if (!checks.needsModel) { liveRows.push({ caseId: c.caseId, result: 'code only (no call)', pass: true, detail: '' }); continue; }
      const body = H.buildClaudeRequest(c, checks, SYSTEM, schema);
      let parsed;
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
          body: JSON.stringify(body),
        });
        parsed = H.parseClaudeResponse(await res.json());
      } catch (err) { parsed = { pack: null, error: 'request failed: ' + err.message }; }
      if (!parsed.pack) { liveRows.push({ caseId: c.caseId, result: 'manual route', pass: false, detail: parsed.error }); continue; }
      const v = H.validatePack(parsed.pack, checks, schema, codes);
      const okReading = [c.expected.reading, ...(c.expected.alsoAllowed || [])].includes(parsed.pack.reading);
      liveRows.push({ caseId: c.caseId, result: `${parsed.pack.reading} (${parsed.pack.confidence})`, pass: v.valid && okReading,
        detail: v.valid ? (okReading ? parsed.pack.reviewerNote : 'unexpected reading') : v.errors.join('; ') });
    }
  }
}

// Report.
const passed = rows.filter((r) => r.pass).length;
const failed = rows.length - passed;
const day = new Date().toISOString().slice(0, 10);
const md = [];
md.push('# Evaluation results (offline)', '');
md.push(`Run on ${day} with \`node run-evals.mjs\` (harness ${H.HARNESS_VERSION}, Node ${process.versions.node}). Model calls are mocked: \`mockDraft\` in \`harness.mjs\` stands in for Claude. Every case is synthetic.`, '');
md.push(`**${passed} of ${rows.length} checks passed${failed ? `, ${failed} failed` : ''}.**`, '');
md.push('## Readings per case', '');
md.push('What each case tests is in the README. This table holds the numbers only: what the code measured, what the case must return, and what the pack returned.', '');
md.push('| Case | Code | Evidence recorded | Signal | Model called | Expected reading | Pack reading | Confidence | Valid | Match |');
md.push('|---|---:|---:|---:|---|---|---|---|---|---|');
for (const r of caseRows) md.push(`| ${r.caseId} | ${r.code} | ${r.coverage} | ${r.signal} | ${r.model} | ${r.expected.replace(/_/g, ' ')} | ${r.reading.replace(/_/g, ' ')} | ${r.confidence.replace(/_/g, ' ')} | ${r.valid ? 'yes' : 'no'} | ${r.match ? 'yes' : 'no'} |`);
md.push('', 'Three cases (SYN-02, SYN-05, SYN-07) must return "not enough evidence"; SYN-06 never reaches the model because its code is not on the acceptable list; SYN-04 hides an instruction in the buyer comment. The readings the code allows and the confidence ceiling for each case are in `eval-results.json`.', '');
md.push('## Every check', '');
md.push('| Group | Check | Result | Detail |', '|---|---|---|---|');
for (const r of rows) md.push(`| ${r.group} | ${r.name} | ${r.pass ? 'pass' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '/').slice(0, 160)} |`);
md.push('', '## Not covered offline', '');
md.push('- **The live model.** The mock is a well-behaved stand-in. With `ANTHROPIC_API_KEY` set in your environment, `node run-evals.mjs --live` sends the same requests to Claude and validates the replies with the same rules; results go to `eval-results.live.md`.');
md.push('- **Real data.** Coverage floors and signal thresholds are set for these synthetic cases. In the pilot they are set from one baselined cycle with Trust and Safety, before any analyst sees a pack.');
fs.writeFileSync(path.join(here, 'eval-results.md'), md.join('\n') + '\n');
fs.writeFileSync(path.join(here, 'eval-results.json'), JSON.stringify({ day, harness: H.HARNESS_VERSION, passed, total: rows.length, cases: caseRows, checks: rows }, null, 2) + '\n');

if (liveRows) {
  const lm = ['# Evaluation results (live)', '', `Run on ${day} against \`claude-opus-5-5\`. Every case is synthetic.`, '',
    '| Case | Result | Pass | Detail |', '|---|---|---|---|',
    ...liveRows.map((r) => `| ${r.caseId} | ${r.result} | ${r.pass ? 'pass' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '/').slice(0, 200)} |`)];
  fs.writeFileSync(path.join(here, 'eval-results.live.md'), lm.join('\n') + '\n');
  console.log(`live: ${liveRows.filter((r) => r.pass).length} of ${liveRows.length} cases passed; see eval-results.live.md`);
}

for (const r of rows) if (!r.pass) console.log(`FAIL ${r.group}: ${r.name} (${r.detail})`);
console.log(`run-evals: ${passed} of ${rows.length} offline checks passed${failed ? `, ${failed} failed` : ''}. Report: eval-results.md`);
process.exit(failed ? 1 : 0);
