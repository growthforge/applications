// Illustrative value model: the sum a deployment strategist puts in front of a sponsor before day 1, then
// replaces with the customer's own baseline. Shared by the page (live) and tools/prepare-page.mjs (prerender).

// Touchless defaults: Ardent Partners, AP Metrics that Matter in 2025 (average 32.6%, best-in-class 49.2%).
// Every other default is a placeholder for the customer's numbers.
export const VALUE_FIELDS = [
  ['invoices', 'Supplier invoices a month', 3000, 100],
  ['touchlessNow', 'Touchless today (%)', 33, 1],
  ['touchlessTarget', 'Touchless target (%)', 49, 1],
  ['minutesPerInvoice', 'Clerk minutes on an invoice that needs a person', 10, 1],
  ['chasesPerWeek', 'PO lines chased a week', 120, 10],
  ['minutesPerChase', 'Buyer minutes to chase by hand', 6, 1],
  ['minutesToApprove', 'Minutes to approve the agent’s draft', 1, 1],
  ['hourlyCost', 'Cost of an hour of clerk or buyer time (£)', 32, 1],
];
export const VALUE_DEFAULTS = Object.fromEntries(VALUE_FIELDS.map(([k, , v]) => [k, v]));

export function valueModel(v) {
  const pct = (x) => Math.min(100, Math.max(0, x));
  const moved = v.invoices * Math.max(0, pct(v.touchlessTarget) - pct(v.touchlessNow)) / 100;
  const invoiceHours = moved * v.minutesPerInvoice / 60;
  const chaseHours = v.chasesPerWeek * 52 / 12 * Math.max(0, v.minutesPerChase - v.minutesToApprove) / 60;
  const hours = invoiceHours + chaseHours;
  return { moved, invoiceHours, chaseHours, hours, yearly: Math.round(hours * v.hourlyCost * 12 / 100) * 100 };
}

const n = (x) => Math.round(x).toLocaleString('en-GB');
const gbp = (x) => '£' + n(x);

export function valueForm(values = VALUE_DEFAULTS) {
  return VALUE_FIELDS.map(([k, label, , step]) => `<label>${label}<input type="number" name="${k}" value="${values[k]}" min="0"${k.startsWith('touchless') ? ' max="100"' : ''} step="${step}" inputmode="decimal"></label>`).join('');
}

export function valueOut(v = VALUE_DEFAULTS) {
  const r = valueModel(v);
  return `<dl class="value__nums">`
    + `<div><dt>Invoices moved to touchless, a month</dt><dd>${n(r.moved)}</dd></div>`
    + `<div><dt>Clerk hours returned, a month</dt><dd>${n(r.invoiceHours)}</dd></div>`
    + `<div><dt>Buyer hours returned from chasing, a month</dt><dd>${n(r.chaseHours)}</dd></div>`
    + `<div class="value__total"><dt>Value of the time returned, a year</dt><dd>${gbp(r.yearly)}</dd></div></dl>`
    + `<p class="value__sum">${n(v.invoices)} invoices × (${v.touchlessTarget}% − ${v.touchlessNow}%) × ${v.minutesPerInvoice} min, plus ${n(v.chasesPerWeek)} chases a week × (${v.minutesPerChase} − ${v.minutesToApprove}) min, at ${gbp(v.hourlyCost)} an hour.</p>`;
}

// In the browser: recalculate as the reader changes an assumption.
if (typeof document !== 'undefined') {
  const form = document.getElementById('value-form');
  const out = document.getElementById('value-out');
  if (form && out) {
    form.addEventListener('input', () => {
      const v = { ...VALUE_DEFAULTS };
      for (const [k] of VALUE_FIELDS) {
        const raw = form.elements[k].value.trim();
        const x = Number(raw);
        // A blank or impossible entry keeps the default; percentages stay between 0 and 100.
        if (raw !== '' && Number.isFinite(x) && x >= 0) v[k] = k.startsWith('touchless') ? Math.min(100, x) : x;
      }
      out.innerHTML = valueOut(v);
    });
    form.addEventListener('submit', (e) => e.preventDefault());
  }
}
