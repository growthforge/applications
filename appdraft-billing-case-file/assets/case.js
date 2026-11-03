/*
  case.js: the small amount of interaction on the case file. Plain JavaScript, no network, no tracking.
  1. Pick a requirement or a question to highlight the lines of the call it came from.
  2. Filter the requirements by priority.
  3. Run the checks in the rule checker.
  Everything is readable without it.
*/
(function () {
  'use strict';
  const M = window.BillingModel;
  const $ = (s, r) => (r || document).querySelector(s);

  // 1. Highlight the source lines
  const status = $('#hl-status');
  let active = null;
  function clear() {
    document.querySelectorAll('.line.hl').forEach((l) => l.classList.remove('hl'));
    document.querySelectorAll('.pick[aria-pressed="true"]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  }
  const grid = $('.callgrid'), callBtn = $('#call-toggle');
  function setCall(open) { if (!grid) return; grid.classList.toggle('is-collapsed', !open); if (callBtn) callBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  if (callBtn) callBtn.addEventListener('click', () => setCall(grid.classList.contains('is-collapsed')));
  const qBtn = $('#q-toggle'), qMore = $('#q-more');
  if (qBtn && qMore) qBtn.addEventListener('click', () => { const on = !qMore.classList.contains('is-open'); qMore.classList.toggle('is-open', on); qBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); qBtn.textContent = on ? 'Hide the other questions' : 'Show the other ' + qMore.querySelectorAll('.qcard').length + ' questions'; });
  function pick(id, lines) {
    const same = active === id;
    clear();
    if (same) { active = null; status.textContent = 'Nothing chosen yet.'; return; }
    active = id;
    setCall(true);
    lines.forEach((l) => { const el = document.getElementById(l); if (el) el.classList.add('hl'); });
    document.querySelectorAll('.pick[data-pick="' + id + '"]').forEach((b) => b.setAttribute('aria-pressed', 'true'));
    status.textContent = id + ' comes from line' + (lines.length > 1 ? 's ' : ' ') + lines.join(', ') + '.';
    const first = document.getElementById(lines[0]);
    if (first) first.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b && b.dataset.lines) pick(b.dataset.pick, b.dataset.lines.split(' '));
  });

  // 2. Filter the requirements
  document.querySelectorAll('input[name="pri"]').forEach((r) => r.addEventListener('change', () => {
    document.querySelectorAll('#reqlist .req').forEach((li) => { li.hidden = r.value !== 'all' && li.dataset.priority !== r.value; });
  }));

  // 3. The rule checker
  const data = $('#case-tests');
  const tests = data ? JSON.parse(data.textContent) : [];
  const run = $('#run');
  if (run && M) {
    const tbody = $('#results tbody');
    const out = $('#run-status');
    run.addEventListener('click', () => {
      const opts = {};
      tbody.textContent = '';
      let passed = 0;
      const failing = [];
      tests.forEach((t) => {
        const r = M.runTest(t, opts);
        if (r.pass) passed++; else failing.push(t.id);
        const tr = document.createElement('tr');
        const a = document.createElement('th'); a.scope = 'row'; a.textContent = t.id + ' ' + t.title;
        const b = document.createElement('td'); b.textContent = r.cases.filter((c) => c.pass).length + ' of ' + r.cases.length;
        const c = document.createElement('td'); c.className = r.pass ? 'pass' : 'fail';
        c.textContent = r.pass ? 'Passes' : 'Fails: ' + r.cases.filter((x) => !x.pass).map((x) => x.name).join('; ');
        tr.append(a, b, c); tbody.append(tr);
      });
      out.textContent = passed + ' of ' + tests.length + ' checks pass.' + (failing.length ? ' Failing: ' + failing.join(', ') + '.' : '');
    });
  }
})();
