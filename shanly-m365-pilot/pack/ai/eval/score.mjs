#!/usr/bin/env node
// score.mjs: score any model's answers against the illustrative evaluation set.
// Usage: node score.mjs cases.jsonl outputs.jsonl [--md RESULTS.md]
// outputs.jsonl: one line per case, {"id":"E01","raw":"<the model's text>"} (or "output":{...}).
// No dependencies. The schema check mirrors ../output-schema.json.
import fs from 'node:fs';

const [casesPath, outputsPath, ...rest] = process.argv.slice(2);
if (!casesPath || !outputsPath) { console.error('Usage: node score.mjs cases.jsonl outputs.jsonl [--md RESULTS.md]'); process.exit(2); }
const mdPath = rest[0] === '--md' ? rest[1] : null;
const readJsonl = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const cases = readJsonl(casesPath);
const outputs = new Map(readJsonl(outputsPath).map((o) => [o.id, o]));

const TYPES = ['formal_complaint', 'aftercare_item', 'general_enquiry'];
const REQUIRED = ['type', 'possible_emergency', 'confidence', 'reason', 'customer_name', 'development', 'plot', 'reservation_date', 'completion_date', 'issues', 'previous_reference', 'draft_reply'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Anything that looks like a date or a day count in a reply the AI wrote is a failure:
// dates come from the register, never from the model.
const DATE_IN_TEXT = /\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\bwithin\s+\d+\s+(working\s+|calendar\s+)?days\b|\b(by|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

function parse(o) {
  if (!o) return { error: 'no output' };
  if (o.output && typeof o.output === 'object') return { value: o.output };
  let t = String(o.raw || '').trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1];
  try { return { value: JSON.parse(t), fenced: Boolean(fence) }; } catch (e) { return { error: 'not JSON: ' + e.message }; }
}
function schemaErrors(v) {
  const errs = [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ['not an object'];
  for (const k of REQUIRED) if (!(k in v)) errs.push('missing ' + k);
  for (const k of Object.keys(v)) if (!REQUIRED.includes(k)) errs.push('unexpected ' + k);
  if (!TYPES.includes(v.type)) errs.push('type');
  if (typeof v.possible_emergency !== 'boolean') errs.push('possible_emergency');
  if (!['high', 'medium', 'low'].includes(v.confidence)) errs.push('confidence');
  if (typeof v.reason !== 'string' || !v.reason) errs.push('reason');
  for (const k of ['customer_name', 'development', 'plot', 'previous_reference']) if (k in v && v[k] !== null && typeof v[k] !== 'string') errs.push(k);
  for (const k of ['reservation_date', 'completion_date']) if (k in v && v[k] !== null && !(typeof v[k] === 'string' && DATE.test(v[k]))) errs.push(k);
  if (!Array.isArray(v.issues) || v.issues.some((x) => typeof x !== 'string')) errs.push('issues');
  if (typeof v.draft_reply !== 'string' || !v.draft_reply) errs.push('draft_reply');
  return errs;
}
const norm = (s) => (s == null ? null : String(s).toLowerCase().replace(/[^a-z0-9]/g, ''));

const rows = [];
for (const c of cases) {
  const p = parse(outputs.get(c.id));
  const v = p.value;
  const errs = p.error ? [p.error] : schemaErrors(v);
  const e = c.expected;
  const r = { id: c.id, expectedType: e.type, gotType: v && v.type, valid: errs.length === 0, errs, fenced: Boolean(p.fenced) };
  r.typeOk = Boolean(v) && v.type === e.type;
  r.missedComplaint = e.type === 'formal_complaint' && (!v || v.type !== 'formal_complaint');
  r.emergencyExpected = e.possible_emergency;
  r.emergencyOk = Boolean(v) && v.possible_emergency === e.possible_emergency;
  r.missedEmergency = e.possible_emergency && !(v && v.possible_emergency === true);
  r.datesOk = Boolean(v) && (v.reservation_date ?? null) === (e.reservation_date ?? null) && (v.completion_date ?? null) === (e.completion_date ?? null);
  r.plotOk = Boolean(v) && norm(v.plot) === norm(e.plot);
  const reply = v && typeof v.draft_reply === 'string' ? v.draft_reply.replace(/\[PATHWAY_DUE\]/g, '') : '';
  r.dateInReply = DATE_IN_TEXT.test(reply);
  r.placeholderOk = !(v && v.type === 'formal_complaint') || /\[PATHWAY_DUE\]/.test(v.draft_reply || '');
  r.lowConfidence = v && v.confidence === 'low';
  rows.push(r);
}

const n = rows.length;
const count = (f) => rows.filter(f).length;
const complaints = count((r) => r.expectedType === 'formal_complaint');
const emergencies = count((r) => r.emergencyExpected);
const summary = {
  cases: n,
  validJson: count((r) => r.valid),
  typeCorrect: count((r) => r.typeOk),
  complaintsCaught: complaints - count((r) => r.missedComplaint),
  complaints,
  emergenciesFlagged: emergencies - count((r) => r.missedEmergency),
  emergencies,
  falseEmergencies: count((r) => !r.emergencyExpected && !r.emergencyOk),
  datesExact: count((r) => r.datesOk),
  plotExact: count((r) => r.plotOk),
  repliesWithADate: count((r) => r.dateInReply),
  complaintRepliesWithPlaceholder: count((r) => r.expectedType === 'formal_complaint' && r.gotType === 'formal_complaint' && r.placeholderOk),
  overCautious: count((r) => r.expectedType !== 'formal_complaint' && r.gotType === 'formal_complaint'),
};

const lines = [];
lines.push('| Measure | Result |', '|---|---|');
lines.push(`| Answers valid against the schema | ${summary.validJson} of ${n} |`);
lines.push(`| Possible emergencies flagged | ${summary.emergenciesFlagged} of ${summary.emergencies} |`);
lines.push(`| Formal complaints caught (the dangerous miss) | ${summary.complaintsCaught} of ${summary.complaints} |`);
lines.push(`| Drafts containing a date the AI wrote itself | ${summary.repliesWithADate} of ${n} |`);
lines.push(`| Type correct overall | ${summary.typeCorrect} of ${n} |`);
lines.push(`| Non-complaints sent to the register to be safe | ${summary.overCautious} |`);
lines.push(`| False emergency flags | ${summary.falseEmergencies} |`);
lines.push(`| Reservation and completion dates exactly right | ${summary.datesExact} of ${n} |`);
lines.push(`| Plot number exactly right | ${summary.plotExact} of ${n} |`);
const misses = rows.filter((r) => !r.typeOk || !r.emergencyOk || !r.datesOk || !r.valid || r.dateInReply);
const detail = ['', '| Case | Expected | Got | Notes |', '|---|---|---|---|'];
for (const r of misses) {
  const notes = [];
  if (!r.valid) notes.push('schema: ' + r.errs.join(', '));
  if (r.missedEmergency) notes.push('emergency missed');
  else if (!r.emergencyOk) notes.push('emergency flag differs');
  if (!r.datesOk) notes.push('dates differ');
  if (r.dateInReply) notes.push('date in draft');
  if (r.lowConfidence) notes.push('marked low confidence');
  detail.push(`| ${r.id} | ${r.expectedType} | ${r.gotType || 'none'} | ${notes.join('; ') || 'type differs'} |`);
}
const out = lines.concat(misses.length ? detail : ['', 'No misses.']).join('\n');
console.log(out);
console.log('\n' + JSON.stringify(summary));
if (mdPath) fs.writeFileSync(mdPath, out + '\n');
