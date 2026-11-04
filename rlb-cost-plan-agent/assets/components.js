/*
  Build Studio progressive enhancement. Load with <script defer>.
  Every component works without this file (all content visible, in order).

  [data-tabs]          link list + panels  ->  ARIA tabs (arrow keys, Home, End)
  [data-stepper]       ordered list        ->  one step at a time, Previous / Next,
                                               live status, focus moves to the step
  [data-theme-toggle]  button [hidden]     ->  shown, cycles system, light, dark on <html data-theme>
  beforeprint          opens every <details>, so print and PDF show everything

  Generated step counters ("Step 2 of 5") sit inside an element carrying
  data-ordinal, so factcheck.py treats them as ordinals, not claims.
*/
(function () {
  'use strict';

  function initTabs(root) {
    var list = root.querySelector('.tabs__list');
    if (!list) return;
    var links = Array.prototype.slice.call(list.querySelectorAll('a[href^="#"]'));
    var panels = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    if (!links.length || panels.some(function (p) { return !p; })) return;

    list.setAttribute('role', 'tablist');
    if (root.dataset.label) list.setAttribute('aria-label', root.dataset.label);
    Array.prototype.forEach.call(list.children, function (li) { li.setAttribute('role', 'presentation'); });

    links.forEach(function (tab, i) {
      var panel = panels[i];
      if (!tab.id) tab.id = panel.id + '-tab';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.setAttribute('tabindex', '0');
      tab.addEventListener('click', function (e) { e.preventDefault(); select(i, true); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % links.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + links.length) % links.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = links.length - 1;
        if (next !== null) { e.preventDefault(); select(next, true); }
      });
    });

    function select(index, focus) {
      links.forEach(function (tab, i) {
        var on = i === index;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('tabindex', on ? '0' : '-1');
        panels[i].hidden = !on;
      });
      if (focus) links[index].focus();
    }

    var start = 0;
    var hash = window.location.hash.slice(1);
    panels.forEach(function (p, i) { if (p.id === hash) start = i; });
    select(start, false);
    root.classList.add('is-enhanced');
  }

  function initStepper(root) {
    var steps = Array.prototype.slice.call(root.querySelectorAll('.stepper__step'));
    if (steps.length < 2) return;
    var label = root.dataset.label || 'Step';
    var current = 0;

    var bar = document.createElement('div');
    bar.className = 'stepper__bar';
    var prev = button('Previous', 'btn btn--ghost');
    var next = button('Next', 'btn');
    var status = document.createElement('p');
    status.className = 'stepper__status';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('data-ordinal', '');
    var dots = document.createElement('ol');
    dots.className = 'stepper__dots';
    dots.setAttribute('data-ordinal', '');
    steps.forEach(function (step, i) {
      var heading = step.querySelector('h2, h3, h4');
      var li = document.createElement('li');
      var dot = button('', 'stepper__dot');
      dot.setAttribute('aria-label', 'Go to ' + label.toLowerCase() + ' ' + (i + 1) + (heading ? ': ' + heading.textContent.trim() : ''));
      dot.addEventListener('click', function () { show(i, true); });
      li.appendChild(dot);
      dots.appendChild(li);
    });
    var controls = document.createElement('div');
    controls.className = 'cluster';
    controls.appendChild(prev);
    controls.appendChild(next);
    bar.appendChild(dots);
    bar.appendChild(status);
    bar.appendChild(controls);
    root.appendChild(bar);

    prev.addEventListener('click', function () { show(current - 1, true); });
    next.addEventListener('click', function () { show(current + 1, true); });

    function button(text, cls) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      if (text) b.textContent = text;
      return b;
    }

    function show(i, moveFocus) {
      current = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (s, k) { s.hidden = k !== current; });
      Array.prototype.forEach.call(dots.querySelectorAll('button'), function (d, k) {
        if (k === current) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
      });
      prev.disabled = current === 0;
      next.disabled = current === steps.length - 1;
      status.textContent = label + ' ' + (current + 1) + ' of ' + steps.length;
      if (moveFocus) {
        var h = steps[current].querySelector('h2, h3, h4') || steps[current];
        h.setAttribute('tabindex', '-1');
        h.focus({ preventScroll: false });
      }
    }

    root.classList.add('is-enhanced');
    show(0, false);
  }

  function initThemeToggle(btn) {
    var order = ['system', 'light', 'dark'];
    var html = document.documentElement;
    function state() { return html.getAttribute('data-theme') || 'system'; }
    function render() { btn.textContent = 'Theme: ' + state(); }
    btn.hidden = false;   // ship the button with [hidden]; it only works with JS
    btn.addEventListener('click', function () {
      var nextState = order[(order.indexOf(state()) + 1) % order.length];
      if (nextState === 'system') html.removeAttribute('data-theme'); else html.setAttribute('data-theme', nextState);
      render();
    });
    render();
  }

  var openedForPrint = [];
  window.addEventListener('beforeprint', function () {
    Array.prototype.forEach.call(document.querySelectorAll('details:not([open])'), function (d) { d.open = true; openedForPrint.push(d); });
  });
  window.addEventListener('afterprint', function () {
    openedForPrint.forEach(function (d) { d.open = false; });
    openedForPrint = [];
  });

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tabs]'), initTabs);
    Array.prototype.forEach.call(document.querySelectorAll('[data-stepper]'), initStepper);
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), initThemeToggle);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
