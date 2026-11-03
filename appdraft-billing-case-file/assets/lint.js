/*
  lint.js: checks that the case file hangs together. Pure functions.
  A requirement needs an actor, a trigger, a rule, a Given/When/Then, a source line (or to be marked as an assumption
  with a question for the client), and no loose words such as "quick" or "etc". Every Must needs a test, and every test
  traces to a requirement. This checks the paperwork; it does not judge whether a requirement is right.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CaseLint = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LOOSE = ['fast', 'quick', 'quickly', 'easy', 'easily', 'user-friendly', 'simple', 'simply', 'etc', 'as needed', 'where possible', 'appropriate', 'appropriately', 'soon', 'efficient', 'efficiently', 'robust', 'seamless', 'flexible', 'various', 'some'];
  const UNIT = /\d|hour|day|minute|month|year|penny|morning|week/i;
  const PRI = ['Must', 'Should', 'Could'];

  function looseWords(text) {
    const t = ' ' + String(text).toLowerCase().replace(/[.,;:()]/g, ' ') + ' ';
    return LOOSE.filter((w) => t.includes(' ' + w + ' '));
  }
  // Loose words are flagged in a sentence that has no number or time unit to pin them down.
  function loose(text) {
    return String(text).split(/(?<=[.!?])\s+/).flatMap((s) => (UNIT.test(s) ? [] : looseWords(s)));
  }

  function lint(c) {
    const problems = [];
    const add = (id, msg) => problems.push({ id, msg });
    const lineIds = new Set(c.call.lines.map((l) => l.id));
    const reqIds = new Set(c.requirements.map((r) => r.id));
    const gapIds = new Set(c.gaps.map((g) => g.id));
    c.requirements.forEach((r) => {
      ['title', 'actor', 'trigger', 'rule', 'plain'].forEach((k) => { if (!String(r[k] || '').trim()) add(r.id, 'missing ' + k); });
      if (!PRI.includes(r.priority)) add(r.id, 'priority must be Must, Should or Could');
      if (!r.acceptance || !r.acceptance.length) add(r.id, 'needs at least one Given/When/Then');
      (r.acceptance || []).forEach((a, i) => { if (!a.given || !a.when || !a.then) add(r.id, 'acceptance ' + (i + 1) + ' is missing a Given, When or Then'); });
      if (!r.sources || !r.sources.length) add(r.id, 'needs a source line from the call');
      (r.sources || []).forEach((s) => { if (!lineIds.has(s)) add(r.id, 'source ' + s + ' is not a line of the call'); });
      if (r.status === 'assumption' && !(r.gaps && r.gaps.length)) add(r.id, 'an assumption needs a question for the client');
      (r.gaps || []).forEach((g) => { if (!gapIds.has(g)) add(r.id, 'question ' + g + ' does not exist'); });
      ['title', 'rule', 'plain'].forEach((k) => loose(r[k] || '').forEach((w) => add(r.id, 'loose word "' + w + '" in ' + k)));
      (r.acceptance || []).forEach((a) => loose([a.given, a.when, a.then].join('. ')).forEach((w) => add(r.id, 'loose word "' + w + '" in an acceptance criterion')));
    });
    c.gaps.forEach((g) => {
      ['question', 'why', 'default', 'decider'].forEach((k) => { if (!String(g[k] || '').trim()) add(g.id, 'missing ' + k); });
      (g.sources || []).forEach((s) => { if (!lineIds.has(s)) add(g.id, 'source ' + s + ' is not a line of the call'); });
      const refs = (g.blocks.match(/REQ-\d+/g) || []);
      if (!refs.length && !/none/i.test(g.blocks)) add(g.id, 'must name the requirement it blocks, or say none');
      refs.forEach((x) => { if (!reqIds.has(x)) add(g.id, 'blocks ' + x + ', which does not exist'); });
    });
    c.tests.forEach((t) => {
      if (!t.requirements || !t.requirements.length) add(t.id, 'traces to no requirement');
      (t.requirements || []).forEach((x) => { if (!reqIds.has(x)) add(t.id, 'traces to ' + x + ', which does not exist'); });
      if (!t.steps || !t.steps.length || !t.expected) add(t.id, 'needs steps and an expected result in the client\'s words');
    });
    return problems;
  }

  function coverage(c) {
    const rows = c.requirements.map((r) => ({ id: r.id, priority: r.priority, tests: c.tests.filter((t) => t.requirements.includes(r.id)).map((t) => t.id) }));
    const untested = rows.filter((r) => !r.tests.length);
    return {
      rows,
      untested: untested.map((r) => r.id),
      untestedMust: untested.filter((r) => r.priority === 'Must').map((r) => r.id),
      orphanTests: c.tests.filter((t) => !t.requirements.length).map((t) => t.id),
      counts: { requirements: c.requirements.length, must: c.requirements.filter((r) => r.priority === 'Must').length, gaps: c.gaps.length, tests: c.tests.length, cases: c.tests.reduce((n, t) => n + t.cases.length, 0) }
    };
  }
  return { lint, coverage, loose, LOOSE };
});
