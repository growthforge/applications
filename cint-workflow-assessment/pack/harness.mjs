// harness.mjs: the evidence-pack harness for map step 3 ("Screen flagged reversals").
//
// Synthetic data only. Prepared by Hemanth Vallamkonda as part of an application to Cint.
// Independent and illustrative; uses public information only.
//
// One file, three users:
//   run-evals.mjs imports it (offline evaluation, optional live call);
//   tools/build-pack.mjs copies it, minus the word "export", into the n8n Code nodes;
//   the page's evidence-pack figure shows what mockDraft returns for SYN-01 and SYN-02.
//
// The split of work is the whole design:
//   code checks   the reason code against the published list, coverage, counts, set-up changes;
//                 it fixes which readings and how much confidence a pack may state.
//   the model     drafts the pack in plain words inside those bounds (mock by default).
//   the validator rejects any pack that breaks the schema or the contract.
//   the analyst   decides. Nothing here changes a status, sends a message or moves money.
// No Node built-ins are used, so the same code runs in an n8n Code node.

export const HARNESS_VERSION = '1.0.0';

export const DEFAULT_CONFIG = {
  mode: 'mock',                 // 'mock' (no model, no key) or 'claude'
  reviewMode: 'queue',          // 'queue' (pack goes to the analyst queue) or 'wait' (execution pauses for the decision)
  model: 'claude-opus-5-5',
  effort: 'medium',
  maxTokens: 16000,
  minCoverage: 0.8,             // below this share of completes with evidence recorded: not enough evidence
  highConfidenceCoverage: 0.95, // high confidence needs nearly full coverage
  consistentShare: 0.75,        // signal share at or above this: consistent with the stated reason
  inconsistentShare: 0.2,       // signal share at or below this: not consistent with the stated reason
  speedFraction: 1 / 3,         // a complete is a speed signal when it took under a third of the target group's median
  maxClaims: 8,
  notifyHosts: [],              // wait mode: hosts the analyst notification may be posted to (allowlist)
};

export const READINGS = [
  'consistent_with_stated_reason',
  'partly_consistent_with_stated_reason',
  'not_consistent_with_stated_reason',
  'not_enough_evidence',
  'code_not_on_acceptable_list',
];
export const NO_CONFIDENCE_READINGS = ['not_enough_evidence', 'code_not_on_acceptable_list'];
const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };

export const DECISIONS = ['send_to_audit', 'no_audit', 'escalate_to_trust_and_safety_lead'];
export const PACK_FEEDBACK = ['accepted', 'edited', 'discarded'];

const RECOMMENDATION_WORDS = /\b(uphold\w*|upheld|overturn\w*|approv\w*|reject\w*|recommend\w*)\b/i;
const INSTRUCTION_LIKE = /\b(ignore (all |any |the )?(previous|prior|above) instructions?|automated (reviewer|system|agent)|system prompt|approve this|mark (this|it) as|you must (approve|uphold|accept))\b/i;

// ---------------------------------------------------------------- checks (deterministic)

export function sourcesIn(c) {
  const s = ['reconciliation_policy'];
  if (Array.isArray(c.completionLog) && c.completionLog.length) s.push('completion_log');
  if (Array.isArray(c.gridAnswers) && c.gridAnswers.length) s.push('grid_answers');
  s.push('target_group_history');
  if (c.supplierReport) s.push('supplier_report');
  if (c.buyerForm && c.buyerForm.received) s.push('buyer_form');
  return s;
}

function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function isStraightLined(row) {
  return Array.isArray(row) && row.length >= 5 && row.every((v) => v === row[0]);
}

// Returns everything the model may use, plus the bounds the validator enforces.
export function runChecks(c, codes, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const code = String(c.reasonCode);
  const list = codes.acceptable && codes.acceptable[code] ? 'acceptable'
    : codes.notAcceptable && codes.notAcceptable[code] ? 'not_acceptable' : 'unlisted';
  const label = (codes.acceptable && codes.acceptable[code]) || (codes.notAcceptable && codes.notAcceptable[code]) || 'not on the published list';
  const total = Number(c.completes) || 0;
  const reasons = [];
  const out = {
    caseId: c.caseId,
    reasonCode: code,
    code: { code, label, list },
    coverage: { kind: null, recorded: 0, total, ratio: 0 },
    signal: null,
    setup: { changedAfterLaunch: false, changes: [] },
    buyerForm: { received: !!(c.buyerForm && c.buyerForm.received), instructionLike: false },
    availableSources: sourcesIn(c),
    allowedReadings: [],
    maxConfidence: 'low',
    needsModel: true,
    reasons,
  };

  const changes = (c.setupHistory || []).filter((h) => h && h.afterLaunch);
  out.setup = { changedAfterLaunch: changes.length > 0, changes: changes.map((h) => h.change) };
  const comment = (c.buyerForm && c.buyerForm.comment) || '';
  out.buyerForm.instructionLike = INSTRUCTION_LIKE.test(comment);
  if (out.buyerForm.instructionLike) reasons.push('the buyer comment contains instruction-like text; it is treated as data');

  if (list !== 'acceptable') {
    out.allowedReadings = ['code_not_on_acceptable_list'];
    out.maxConfidence = 'not_applicable';
    out.needsModel = false;
    reasons.push(list === 'not_acceptable'
      ? `code ${code} (${label}) is on the published list of reasons that are not acceptable`
      : `code ${code} is not on the published list`);
    return out;
  }

  if (code === '933') {
    const log = c.completionLog || [];
    const times = log.map((e) => e && e.loiSec).filter((t) => typeof t === 'number' && t > 0);
    const med = Number(c.targetGroupMedianLoiSec) || median(times);
    const fast = times.filter((t) => med && t < med * cfg.speedFraction).length;
    out.coverage = { kind: 'completion_times', recorded: times.length, total, ratio: total ? times.length / total : 0 };
    out.signal = { kind: 'under_a_third_of_median', count: fast, of: times.length, share: times.length ? fast / times.length : 0 };
  } else if (code === '932') {
    const rows = (c.gridAnswers || []).map((e) => e && e.grid).filter((g) => Array.isArray(g));
    const flat = rows.filter(isStraightLined).length;
    out.coverage = { kind: 'grid_answers', recorded: rows.length, total, ratio: total ? rows.length / total : 0 };
    out.signal = { kind: 'identical_grid_answers', count: flat, of: rows.length, share: rows.length ? flat / rows.length : 0 };
  } else {
    // An acceptable code this harness has no evidence rule for: the analyst works it by hand.
    out.allowedReadings = ['not_enough_evidence'];
    out.maxConfidence = 'not_applicable';
    reasons.push(`no evidence rule is defined for code ${code}; the analyst works the case manually`);
    return out;
  }

  if (out.coverage.ratio < cfg.minCoverage) {
    out.allowedReadings = ['not_enough_evidence'];
    out.maxConfidence = 'not_applicable';
    reasons.push(`evidence recorded for ${out.coverage.recorded} of ${total} completes, below the coverage floor`);
    return out;
  }
  if (out.setup.changedAfterLaunch) {
    out.allowedReadings = ['not_enough_evidence'];
    out.maxConfidence = 'not_applicable';
    reasons.push('the target group set-up changed after launch, so a survey-side cause (not an acceptable reason) must be ruled out first');
    return out;
  }

  const share = out.signal.share;
  const clear = share >= cfg.consistentShare || share <= cfg.inconsistentShare;
  if (share >= cfg.consistentShare) out.allowedReadings = ['consistent_with_stated_reason'];
  else if (share <= cfg.inconsistentShare) out.allowedReadings = ['not_consistent_with_stated_reason'];
  else out.allowedReadings = ['partly_consistent_with_stated_reason', 'not_enough_evidence'];
  out.maxConfidence = clear && out.coverage.ratio >= cfg.highConfidenceCoverage ? 'high' : clear ? 'medium' : 'low';
  reasons.push(`signal in ${out.signal.count} of ${out.signal.of} completes with evidence`);
  return out;
}

// ---------------------------------------------------------------- the model request (Claude)

// What the model sees of a case: the recorded evidence only. The test fixture fields
// (title, expected) never leave the harness, so a live run cannot read the answers.
export function caseInput(c) {
  const { expected, title, ...rest } = c;
  return rest;
}

// The user message carries the case as data and the checks as bounds.
export function buildUserMessage(c, checks) {
  return JSON.stringify({ case: caseInput(c), checks }, null, 2);
}

export function buildClaudeRequest(c, checks, systemPrompt, schema, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    fallbacks: 'default',
    output_config: { effort: cfg.effort, format: { type: 'json_schema', schema } },
    system: systemPrompt,
    messages: [{ role: 'user', content: buildUserMessage(c, checks) }],
  };
}

// Turns an API response into a pack, or a reason the pack could not be read.
export function parseClaudeResponse(res) {
  if (!res || typeof res !== 'object') return { pack: null, error: 'no response' };
  if (res.type === 'error' || res.error) return { pack: null, error: 'API error: ' + ((res.error && res.error.message) || 'unknown') };
  if (res.stop_reason === 'refusal') return { pack: null, error: 'the model declined this request (refusal)' };
  if (res.stop_reason === 'max_tokens') return { pack: null, error: 'the reply was cut off (max_tokens)' };
  const text = (res.content || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('');
  try { return { pack: JSON.parse(text), error: null, model: res.model || null }; }
  catch (e) { return { pack: null, error: 'the reply was not valid JSON' }; }
}

// ---------------------------------------------------------------- the mock model

// A well-behaved stand-in for the model, used offline and by the n8n default mode.
// It writes the same sentences the page's evidence-pack figure shows.
export function mockDraft(c, checks) {
  const claims = [];
  const codeText = checks.code.list === 'acceptable'
    ? `Code ${checks.code.code} (${checks.code.label}): on the published acceptable list.`
    : checks.code.list === 'not_acceptable'
      ? `Code ${checks.code.code} (${checks.code.label}): on the published list of reasons that are not acceptable.`
      : `Code ${checks.code.code}: not on the published list.`;
  claims.push({ kind: 'code_check', text: codeText, source: 'reconciliation_policy' });

  const reading = checks.allowedReadings[0];
  const missing = [];
  if (checks.code.list === 'acceptable' && checks.signal) {
    const cov = checks.coverage;
    const sig = checks.signal;
    if (cov.kind === 'completion_times') {
      claims.push(cov.recorded < cov.total
        ? { kind: 'completion_times', text: `Completion times recorded for ${cov.recorded} of ${cov.total}.`, source: 'completion_log' }
        : { kind: 'completion_times', text: `Completion times: ${sig.count} of ${sig.of} finished in under a third of the target group's median.`, source: 'completion_log' });
      if (cov.recorded < cov.total && cov.recorded > 0 && reading !== 'not_enough_evidence') {
        claims.push({ kind: 'completion_times', text: `Of those, ${sig.count} of ${sig.of} finished in under a third of the target group's median.`, source: 'completion_log' });
      }
      if (cov.ratio < DEFAULT_CONFIG.minCoverage) missing.push('completion times for the completes without a recorded time');
    } else if (cov.kind === 'grid_answers') {
      if (cov.recorded === 0) {
        claims.push({ kind: 'grid_pattern', text: 'Grid answers: not in the export for any of these completes.', source: checks.availableSources.includes('completion_log') ? 'completion_log' : 'target_group_history' });
        missing.push('the grid answers for the reversed completes');
      } else {
        claims.push({ kind: 'grid_pattern', text: `Grid answers: ${sig.count} of ${sig.of} gave the same answer to every item.`, source: 'grid_answers' });
      }
    }
    claims.push(checks.setup.changedAfterLaunch
      ? { kind: 'setup_history', text: `Set-up: changed after launch (${checks.setup.changes.join('; ')}).`, source: 'target_group_history' }
      : { kind: 'setup_history', text: 'Set-up: unchanged since launch.', source: 'target_group_history' });
    if (checks.setup.changedAfterLaunch) missing.push('confirmation from the buyer that the set-up change did not cause the fast or flat completes');
  }
  if (checks.buyerForm.received) {
    claims.push({ kind: 'buyer_form', text: checks.buyerForm.instructionLike
      ? "Buyer form: received; its comment contains instruction-like text, treated as data."
      : 'Buyer form: received.', source: 'buyer_form' });
  }
  if (reading === 'not_enough_evidence' && !missing.length) missing.push('the evidence rule for this case, worked by hand');

  const words = {
    consistent_with_stated_reason: 'consistent with the stated reason',
    partly_consistent_with_stated_reason: 'partly consistent with the stated reason',
    not_consistent_with_stated_reason: 'not consistent with the stated reason',
    not_enough_evidence: 'not enough evidence',
    code_not_on_acceptable_list: 'the code is not on the acceptable list',
  };
  const confidence = NO_CONFIDENCE_READINGS.includes(reading) ? 'not_applicable' : checks.maxConfidence;
  const note = [];
  note.push(`Reading: ${words[reading]}.`);
  if (reading === 'not_enough_evidence') note.push("The analyst requests the buyer's evidence.");
  else if (reading === 'code_not_on_acceptable_list') note.push('No evidence reading was made; the analyst works the case from the policy.');
  else note.push(`Confidence: ${confidence}. The analyst decides.`);
  if (checks.buyerForm.instructionLike) note.push('The buyer comment carries an instruction aimed at an automated reviewer; it was ignored.');

  return {
    caseId: checks.caseId,
    reasonCode: checks.reasonCode,
    claims,
    reading,
    confidence,
    missingEvidence: missing,
    reviewerNote: note.join(' '),
  };
}

// ---------------------------------------------------------------- validation

// A small JSON Schema checker for the subset the schema file uses: type, properties,
// required, additionalProperties false, enum, items. Enough to reject drift; no dependencies.
export function schemaErrors(value, schema, path = '$') {
  const errs = [];
  const t = schema.type;
  const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v);
  if (t) {
    const actual = typeOf(value);
    const ok = Array.isArray(t) ? t.includes(actual) || (actual === 'integer' && t.includes('number'))
      : t === actual || (t === 'number' && actual === 'integer');
    if (!ok) { errs.push(`${path}: expected ${t}, got ${actual}`); return errs; }
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  if (t === 'object' && value && typeof value === 'object') {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${path}: missing ${k}`);
    for (const k of Object.keys(value)) {
      if (schema.properties && schema.properties[k]) errs.push(...schemaErrors(value[k], schema.properties[k], `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}: unexpected field ${k}`);
    }
  }
  if (t === 'array' && Array.isArray(value) && schema.items) value.forEach((v, i) => errs.push(...schemaErrors(v, schema.items, `${path}[${i}]`)));
  return errs;
}

// Every integer a pack may print, taken from the case and the checks. Anything else is invented.
function allowedNumbers(checks, codes) {
  const n = new Set([checks.reasonCode, checks.coverage.recorded, checks.coverage.total].map(String));
  for (const m of String(checks.caseId).matchAll(/\d+/g)) n.add(m[0]);
  if (checks.signal) { n.add(String(checks.signal.count)); n.add(String(checks.signal.of)); }
  for (const k of Object.keys(codes.acceptable || {})) n.add(k);
  for (const k of Object.keys(codes.notAcceptable || {})) n.add(k);
  return n;
}

export function validatePack(pack, checks, schema, codes, config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const errors = schemaErrors(pack, schema);
  if (errors.length) return { valid: false, errors };
  if (pack.caseId !== checks.caseId) errors.push('caseId does not match the case');
  if (pack.reasonCode !== checks.reasonCode) errors.push('reasonCode does not match the case');
  if (!checks.allowedReadings.includes(pack.reading)) errors.push(`reading ${pack.reading} is outside the bounds set by code (${checks.allowedReadings.join(', ')})`);
  if (NO_CONFIDENCE_READINGS.includes(pack.reading)) {
    if (pack.confidence !== 'not_applicable') errors.push(`a ${pack.reading} reading states no confidence`);
  } else if (pack.confidence === 'not_applicable' || CONFIDENCE_RANK[pack.confidence] > CONFIDENCE_RANK[checks.maxConfidence]) {
    errors.push(`confidence ${pack.confidence} is above the ceiling (${checks.maxConfidence})`);
  }
  if (pack.claims.length < 1 || pack.claims.length > cfg.maxClaims) errors.push(`a pack carries 1 to ${cfg.maxClaims} claims`);
  if (!pack.claims.length || pack.claims[0].kind !== 'code_check' || pack.claims[0].source !== 'reconciliation_policy') errors.push('the first claim is the code check against the published list');
  for (const cl of pack.claims) {
    if (!checks.availableSources.includes(cl.source)) errors.push(`claim cites ${cl.source}, which this case does not hold`);
  }
  if (checks.code.list === 'acceptable' && checks.signal) {
    const kinds = pack.claims.map((cl) => cl.kind);
    if (!kinds.includes('setup_history')) errors.push('the pack checks the set-up history before any reading');
    if (!kinds.includes('completion_times') && !kinds.includes('grid_pattern')) errors.push('the pack states the evidence behind the reading');
  }
  const allowed = allowedNumbers(checks, codes);
  const texts = pack.claims.map((cl) => cl.text).concat([pack.reviewerNote], pack.missingEvidence);
  for (const tx of texts) {
    for (const m of String(tx).matchAll(/\d+(?:[.,]\d+)?/g)) {
      if (!allowed.has(m[0])) errors.push(`number ${m[0]} is not in the case or the checks: "${tx}"`);
    }
    const r = String(tx).match(RECOMMENDATION_WORDS);
    if (r) errors.push(`recommendation language ("${r[0]}"): the analyst decides`);
  }
  if (pack.reading === 'not_enough_evidence' && !pack.missingEvidence.length) errors.push('not enough evidence names what is missing');
  if (checks.buyerForm.instructionLike && !/instruction/i.test(pack.reviewerNote)) errors.push('the reviewer note flags the instruction-like buyer text');
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------- the human gate and the log

export function reviewItem(c, checks, pack, validation, mode) {
  return {
    caseId: checks.caseId,
    status: validation.valid ? 'awaiting_analyst' : 'manual_route',
    pack: validation.valid ? pack : null,
    packErrors: validation.valid ? [] : validation.errors,
    draftedBy: checks.needsModel ? mode : 'code',
    options: DECISIONS.slice(),
    note: validation.valid
      ? 'The analyst decides. The pack is a draft; nothing has been sent or changed.'
      : "The pack failed validation and is withheld. The analyst works the case by today's manual route.",
  };
}

// The analyst's answer: { decision, analyst, reason, packFeedback, feedbackNote }.
export function recordDecision(item, body) {
  const b = body || {};
  const errors = [];
  if (!DECISIONS.includes(b.decision)) errors.push(`decision must be one of ${DECISIONS.join(', ')}`);
  if (!b.analyst || typeof b.analyst !== 'string') errors.push('analyst is required');
  if (!b.reason || typeof b.reason !== 'string') errors.push('a recorded reason is required');
  if (item.pack && !PACK_FEEDBACK.includes(b.packFeedback)) errors.push(`packFeedback must be one of ${PACK_FEEDBACK.join(', ')}`);
  if (errors.length) return { ...item, status: 'decision_rejected', decisionErrors: errors };
  return { ...item, status: 'decided', decision: b.decision, analyst: b.analyst, reason: b.reason,
    packFeedback: item.pack ? b.packFeedback : null, feedbackNote: b.feedbackNote || '' };
}

// FNV-1a, so the log can show the checks a pack was drafted against without storing the case.
export function digest(obj) {
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function auditEntry(item, checks, at) {
  return {
    at,
    caseId: item.caseId,
    checksDigest: digest(checks),
    draftedBy: item.draftedBy,
    reading: item.pack ? item.pack.reading : null,
    confidence: item.pack ? item.pack.confidence : null,
    packValid: !!item.pack,
    packErrors: item.packErrors || [],
    status: item.status,
    decision: item.decision || null,
    analyst: item.analyst || null,
    packFeedback: item.packFeedback || null,
  };
}

export function runSummary(entries) {
  const count = (f) => entries.filter(f).length;
  return {
    packs: entries.length,
    validPacks: count((e) => e.packValid),
    manualRoute: count((e) => !e.packValid),
    notEnoughEvidence: count((e) => e.reading === 'not_enough_evidence'),
    awaitingAnalyst: count((e) => e.status === 'awaiting_analyst'),
    decided: count((e) => e.status === 'decided'),
  };
}
