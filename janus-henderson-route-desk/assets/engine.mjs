// Route Desk engine: evaluates one idea's answers against route-rules.json.
// Deterministic and dependency-free, so the same file runs in the page and in node --test.

function holds(cond, ctx) {
  if (!cond) return false;
  if (cond.always) return true;
  if (cond.all) return cond.all.every((c) => holds(c, ctx));
  if (cond.any) return cond.any.some((c) => holds(c, ctx));
  if (cond.not) return !holds(cond.not, ctx);
  if (cond.q) return cond.in.includes(ctx.answers[cond.q]);
  if (cond.type) return cond.type.includes(ctx.type);
  if (cond.lane) return cond.lane.includes(ctx.lane);
  if (cond.tierAtMost != null) return ctx.tier <= cond.tierAtMost;
  if (cond.tierAtLeast != null) return ctx.tier >= cond.tierAtLeast;
  if (cond.hoursAtLeast != null) return ctx.hours >= cond.hoursAtLeast;
  if (cond.atLeast) return ctx[cond.atLeast[0]] >= cond.atLeast[1];
  if (cond.cmp) {
    const [left, op, right, plus] = cond.cmp;
    const a = ctx[left];
    const b = ctx[right] + (plus || 0);
    if (op === '>=') return a >= b;
    if (op === '>') return a > b;
    if (op === '<=') return a <= b;
    if (op === '<') return a < b;
    return a === b;
  }
  throw new Error('Unknown condition: ' + JSON.stringify(cond));
}

function first(list, ctx) {
  const hit = list.find((r) => holds(r.when, ctx));
  if (!hit) throw new Error('No rule matched');
  return hit;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function hoursAtStake(answers) {
  return Math.round(toNumber(answers.hours) * 2) / 2;
}

export function normalise(rules, answers) {
  const out = { ...rules.defaults, ...answers };
  for (const q of rules.questions) {
    if (q.type === 'choice' && !q.options.some((o) => o.value === out[q.id])) out[q.id] = rules.defaults[q.id];
    if (q.type === 'number') out[q.id] = Math.min(toNumber(out[q.id]), q.max ?? Infinity);
  }
  return out;
}

export function evaluate(rules, rawAnswers) {
  const answers = normalise(rules, rawAnswers);
  const ctx = { answers, hours: hoursAtStake(answers) };
  const fired = [];

  const pt = first(rules.problemType, ctx);
  ctx.type = pt.type;
  fired.push({ id: pt.id, area: 'AI or process', text: pt.why });

  const tr = first(rules.tiers, ctx);
  ctx.tier = tr.tier;
  fired.push({ id: tr.id, area: 'Control tier', text: tr.why });

  const rt = first(rules.routes, ctx);
  ctx.lane = rt.lane;
  fired.push({ id: rt.id, area: 'Route to delivery', text: rt.why });

  const p = rules.priority;
  const band = p.hoursBands.find((b) => b.below === null || ctx.hours < b.below);
  const consequence = p.consequenceBonus.benefits.includes(answers.benefit) && ctx.tier >= p.consequenceBonus.tier ? p.consequenceBonus.points : 0;
  ctx.value = band.points + p.reach[answers.reach] + p.benefit[answers.benefit] + consequence;
  const licenceCost = p.licenceEffort.when.includes(answers.licence) && p.licenceEffort.types.includes(ctx.type) ? p.licenceEffort.points : 0;
  ctx.effort = p.systems[answers.systems] + p.tierEffort[ctx.tier] + licenceCost - (answers.existing === 'pattern' ? p.patternDiscount : 0);
  const vd = first(p.verdicts, ctx);
  const parts = [`hours ${band.points}`, `reach ${p.reach[answers.reach]}`];
  if (p.benefit[answers.benefit]) parts.push(`${answers.benefit} ${p.benefit[answers.benefit]}`);
  if (consequence) parts.push(`tier 3 consequence ${consequence}`);
  const eparts = [`systems ${p.systems[answers.systems]}`];
  if (p.tierEffort[ctx.tier]) eparts.push(`tier ${ctx.tier} review ${p.tierEffort[ctx.tier]}`);
  if (licenceCost) eparts.push(`licences or capacity ${licenceCost}`);
  if (answers.existing === 'pattern') eparts.push(`existing pattern minus ${p.patternDiscount}`);
  fired.push({ id: vd.id, area: 'Worth pursuing', text: `Value ${ctx.value} (${parts.join(', ')}) against effort ${ctx.effort} (${eparts.join(', ')}).` });

  let gate = first(rules.gates, ctx).text;
  if (ctx.tier === 3) gate += ' ' + rules.tier3GateAddendum;

  const result = {
    answers,
    hours: ctx.hours,
    type: ctx.type,
    tier: ctx.tier,
    tierLabel: tr.label,
    reviewers: tr.reviewers,
    lane: ctx.lane,
    routeRule: { id: rt.id, plain: rt.plain || '' },
    laneName: rules.lanes[ctx.lane].name,
    owner: rules.lanes[ctx.lane].owner,
    platform: first(rules.platforms, ctx).text,
    environment: first(rules.environments, ctx).text,
    controls: rules.controlAddons.filter((a) => holds(a.when, ctx)).map((a) => a.text),
    value: ctx.value,
    effort: ctx.effort,
    verdict: vd.text,
    verdictId: vd.id,
    gate,
    people: first(rules.people, ctx).text,
    measure: rules.measures[answers.benefit],
    scale: rules.scale.shape[answers.work] + ' ' + rules.scale.path[answers.reach],
    fired,
    next: null,
  };

  // For process-first ideas, show where the idea goes once the process is fixed.
  if (ctx.lane === 'process' && rawAnswers && !rawAnswers.__fixed) {
    const fixed = evaluate(rules, { ...answers, cause: 'volume', __fixed: true });
    result.next = { lane: fixed.lane, laneName: fixed.laneName, tier: fixed.tier, platform: fixed.platform, verdict: fixed.verdict };
  }
  return result;
}

const LANE_SLUG = /[^a-z0-9]+/g;

export function record(rules, idea, result, today) {
  const label = (id) => {
    const q = rules.questions.find((x) => x.id === id);
    if (q.type === 'number') return String(result.answers[id]);
    return q.options.find((o) => o.value === result.answers[id]).label;
  };
  const lines = [
    `# Pattern record: ${idea.shapeTitle || idea.title}`,
    '',
    `- **Status:** triaged ${today}; ${result.verdict.toLowerCase()}`,
    `- **Problem shape:** ${idea.shape || idea.description || 'Not described'}`,
    `- **AI or process:** ${result.fired[0].text}`,
    `- **Route to delivery:** ${result.laneName}. ${result.owner}.`,
    result.next ? `- **Once the process is fixed:** ${result.next.laneName}, tier ${result.next.tier}. ${result.next.platform}` : null,
    `- **Platform:** ${result.platform}`,
    `- **Control tier:** ${result.tierLabel}. ${result.reviewers}`,
    ...result.controls.map((c) => `  - ${c}`),
    `- **Environment and ownership:** ${result.environment}`,
    `- **Human gate:** ${result.gate}`,
    `- **Measure:** ${result.measure.kpi}. Baseline: ${result.measure.baseline} Pilot: ${result.measure.pilot} ${result.measure.confirms}`,
    `- **Scale:** ${result.scale}`,
    `- **People:** ${result.people}`,
    `- **Hours at stake (not hours saved):** ${result.hours} a month`,
    '',
    '## Answers',
    ...rules.questions.map((q) => `- ${q.label} ${label(q.id)}`),
    '',
    '## Rules that fired',
    ...result.fired.map((f) => `- ${f.id} (${f.area}): ${f.text}`),
    '',
    '## Kill criteria',
    `- ${rules.killCriteria}`,
    '',
    '## Lessons learned',
    '- To be completed at go-live and at the first monthly benefit check.',
  ].filter((l) => l !== null);
  return lines.join('\n') + '\n';
}

export function slug(s) {
  return String(s).toLowerCase().replace(LANE_SLUG, '-').replace(/^-|-$/g, '');
}
