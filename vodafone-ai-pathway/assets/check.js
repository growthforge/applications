/*
  check.js: the "Would you send this?" skills check, the prompt card's default tab, and
  absolute links for print.
  Progressive enhancement only. Without this file every expected answer and its reason
  is in a native <details>, all three support levels show, and the page reads in full.
  No storage, no tracking, no network requests.
*/
(function () {
  'use strict';

  var LABELS = { send: 'Send it', fix: 'Fix it, then send', escalate: 'Stop and escalate' };

  function outcome(value) {
    var chip = document.createElement('span');
    chip.className = 'outcome out--' + value;
    var shape = document.createElement('span');
    shape.className = 'shape shape--' + value;
    shape.setAttribute('aria-hidden', 'true');
    chip.appendChild(shape);
    chip.appendChild(document.createTextNode(LABELS[value]));
    return chip;
  }

  function para(text, cls, label) {
    var p = document.createElement('p');
    if (cls) p.className = cls;
    if (label) {
      var b = document.createElement('span');
      b.className = 'fb-label';
      b.textContent = label + ' ';
      p.appendChild(b);
    }
    p.appendChild(document.createTextNode(text));
    return p;
  }

  function status(ok) {
    var s = document.createElement('span');
    s.className = 'status ' + (ok ? 'status--ok' : 'status--no');
    s.textContent = ok ? 'Matched' : 'Not this time';
    return s;
  }

  function initCheck() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.item[data-expected]'));
    if (!items.length) return;
    var summary = document.querySelector('.check__summary');
    var score = summary && summary.querySelector('.check__score');
    var count = summary && summary.querySelector('.check__n');
    var results = {};
    if (summary) summary.hidden = true;

    items.forEach(function (item, index) {
      var button = item.querySelector('.item__check');
      var out = item.querySelector('.item__feedback');
      var key = item.querySelector('.item__key');
      var expected = item.getAttribute('data-expected');
      if (!button || !out || !key) return;
      button.hidden = false;

      button.addEventListener('click', function () {
        var chosen = item.querySelector('input[type="radio"]:checked');
        out.textContent = '';
        if (!chosen) {
          out.style.removeProperty('--out-ink');
          out.appendChild(para('Choose one of the three options first, then check your answer.', 'verdict'));
          return;
        }
        var value = chosen.value;
        var match = value === expected;
        var verdict = document.createElement('p');
        verdict.className = 'verdict';
        verdict.appendChild(status(match));
        if (match) {
          verdict.appendChild(document.createTextNode('You chose the expected answer:'));
        } else {
          verdict.appendChild(document.createTextNode('You chose ' + LABELS[value] + '. Expected:'));
        }
        verdict.appendChild(outcome(expected));
        out.style.setProperty('--out-ink', 'var(--' + ({ send: 'ai-assist', fix: 'human-led', escalate: 'escalate' })[expected] + ')');
        out.appendChild(verdict);
        if (!match) {
          var mine = key.querySelector('[data-opt="' + value + '"] .fb__text');
          if (mine) out.appendChild(para(mine.textContent, '', 'Your choice:'));
        }
        var why = key.querySelector('[data-opt="' + expected + '"] .fb__text');
        if (why) out.appendChild(para(why.textContent, '', match ? 'Why:' : 'Why the expected answer:'));

        results[index] = match;
        var done = Object.keys(results).length;
        if (summary && done === items.length) {
          var n = 0;
          Object.keys(results).forEach(function (k) { if (results[k]) n += 1; });
          if (count) count.textContent = String(n);
          if (score) score.hidden = false;
          summary.hidden = false;
        }
      });
    });
  }

  // The prompt card opens on "Guided" (the support level of a stage two module).
  // components.js selects the first tab; this re-selects without moving focus.
  function selectDefaultTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tabs][data-default-tab]'), function (root) {
      var hash = window.location.hash.slice(1);
      if (hash && root.querySelector('[id="' + hash.replace(/"/g, '') + '"]')) return;
      var want = root.getAttribute('data-default-tab');
      var tabs = root.querySelectorAll('[role="tab"]');
      if (!tabs.length) return;
      Array.prototype.forEach.call(tabs, function (tab) {
        var id = tab.getAttribute('aria-controls');
        var on = id === want;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('tabindex', on ? '0' : '-1');
        var panel = document.getElementById(id);
        if (panel) panel.hidden = !on;
      });
    });
  }

  function tabsReady() {
    var roots = document.querySelectorAll('[data-tabs][data-default-tab]');
    return Array.prototype.every.call(roots, function (r) { return r.classList.contains('is-enhanced'); });
  }

  // This file is deferred, so the DOM is parsed when it runs. components.js (inlined in
  // the head) enhances the tabs on DOMContentLoaded and registered its listener first,
  // so a listener added here runs after it.
  // Print and the PDF: relative links (the pack files) become absolute links to the
  // published page, so a printed or forwarded PDF never points at a local preview server.
  // Restored after printing. In-page #fragments stay internal.
  var BASE = 'https://growthforge.github.io/applications/vodafone-ai-pathway/';
  function isRelative(href) {
    return href && !/^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
  }
  function absoluteLinks() {
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var href = a.getAttribute('href');
      if (!isRelative(href) || a.hasAttribute('data-rel-href')) return;
      a.setAttribute('data-rel-href', href);
      a.setAttribute('href', BASE + href.replace(/^\.\//, ''));
      // The label is the link: do not print the long URL after it.
      if (!a.classList.contains('no-url')) { a.classList.add('no-url'); a.setAttribute('data-added-no-url', ''); }
    });
  }
  function relativeLinks() {
    Array.prototype.forEach.call(document.querySelectorAll('a[data-rel-href]'), function (a) {
      a.setAttribute('href', a.getAttribute('data-rel-href'));
      a.removeAttribute('data-rel-href');
      if (a.hasAttribute('data-added-no-url')) { a.classList.remove('no-url'); a.removeAttribute('data-added-no-url'); }
    });
  }
  window.addEventListener('beforeprint', absoluteLinks);
  window.addEventListener('afterprint', relativeLinks);

  function start() {
    initCheck();
    if (tabsReady()) selectDefaultTabs();
    else document.addEventListener('DOMContentLoaded', selectDefaultTabs);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
