/*
  model.js: a rule checker for the billing rules written in the case file.
  It is NOT connected to Salesforce or Xero. It writes each rule down precisely enough to run the test cases
  against it, so two rules that contradict each other, or a requirement that cannot be tested, show up on paper
  before anything is built. It does not prove that a build works; the sandbox run with the client does that.
  Pure functions, no network. The Xero tax types and statuses come from the public Xero developer documentation.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BillingModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Salesforce VAT treatment to the Xero UK tax type (Xero Accounting API, types and codes).
  const TAX = { 'Standard': 'OUTPUT2', 'Zero rated': 'ZERORATEDOUTPUT', 'Exempt': 'EXEMPTOUTPUT', 'No VAT': 'NONE' };
  const ACCOUNT = { 'Planned maintenance': '200', 'Repairs': '210' };
  const REGIONS = ['North', 'South'];

  // ---- dates (UTC) ----------------------------------------------------------
  const DAY = 86400000;
  const ms = (iso) => { const p = iso.slice(0, 10).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const dow = (i) => new Date(ms(i)).getUTCDay();
  const working = (i, hol) => dow(i) !== 0 && dow(i) !== 6 && !(hol || []).includes(i);
  const addDays = (i, n) => iso(ms(i) + n * DAY);
  function workingAfter(i, n, hol) { let d = i, left = n; while (left > 0) { d = addDays(d, 1); if (working(d, hol)) left--; } return d; }
  const pence = (x) => Math.round(Math.round(x * 1000) / 10);   // half up to a whole penny, tolerant of float noise
  const pounds = (p) => Math.round(p) / 100;
  const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  // ---- when to invoice ------------------------------------------------------
  // Repairs: when the job is completed, not when the deal is won. Planned maintenance: from the billing schedule.
  function shouldInvoice(o) {
    if (o.stage !== 'Closed Won') return { create: false, reason: 'not-won' };
    if (o.billingType === 'Planned maintenance') return { create: false, reason: 'use-schedule' };
    if (!o.jobCompletedDate) return { create: false, reason: 'job-not-completed' };
    return { create: true, reason: 'job-completed', amount: o.finalAmount !== undefined ? o.finalAmount : o.quote };
  }
  // The deposit is a share of the quote. The balance is the final amount less the deposit, so the two always add up to
  // the final amount to the penny. If the job comes in below the deposit, a credit is due instead of a balance.
  function splitDeposit(i) {
    const quote = pence(i.total);
    const deposit = Math.round(quote * i.percent / 100);   // quote is already in pence
    const total = i.final !== undefined ? pence(i.final) : quote;
    const out = { deposit: pounds(deposit), balance: pounds(total - deposit), total: pounds(total) };
    if (total < deposit) out.creditNeeded = true;
    return out;
  }
  // The same day each month, or the last day of a shorter month. Each April (or the chosen month) after the start adds
  // one annual uplift, compounding.
  function scheduleAmounts(i) {
    const p = i.start.split('-').map(Number);
    const firstUpliftYear = p[1] < (i.upliftMonth || 99) ? p[0] : p[0] + 1;
    const out = [];
    for (let k = 0; k < i.months; k++) {
      const m0 = p[1] - 1 + k, y = p[0] + Math.floor(m0 / 12), m = m0 % 12;
      const day = Math.min(p[2], lastDay(y, m));
      const date = iso(Date.UTC(y, m, day));
      let n = 0;
      if (i.upliftMonth && (y > firstUpliftYear || (y === firstUpliftYear && m + 1 >= i.upliftMonth))) n = (y - firstUpliftYear) + (m + 1 >= i.upliftMonth ? 1 : 0);
      out.push({ date, line: date.slice(0, 7), amount: pounds(pence(i.monthly * Math.pow(1 + (i.upliftPercent || 0) / 100, n))) });
    }
    return out;
  }

  // ---- building the invoice -------------------------------------------------
  const taxType = (vat) => TAX[vat || 'Standard'] || null;
  function buildInvoice(i, opts) {
    const o = i.opp, a = i.account;
    if (o.vat === 'Reverse charge') return { ok: false, reason: 'needs-review' };      // never guessed
    if (!REGIONS.includes(a.region)) return { ok: false, reason: 'missing-region' };
    if (!taxType(o.vat)) return { ok: false, reason: 'unknown-vat-treatment' };
    if (a.poRequired && !o.po) return { ok: false, reason: 'po-required' };           // they send it straight back
    // The invoice's own key (job, then which invoice it is). It is stored on the Salesforce invoice record and sent as the
    // idempotency key, not written into the Reference, which finance can edit and housing association payables read.
    const key = (opts && opts.defect === 'key-per-job') ? o.number : o.number + ':' + (i.line || 'FINAL');
    const items = o.lines.map((l) => ({
      Description: l.description, Quantity: l.qty, UnitAmount: l.unit,
      AccountCode: l.accountCodeOverride || ACCOUNT[l.family],
      TaxType: taxType(o.vat),
      Tracking: [{ Name: 'Region', Option: a.region }]
    }));
    if (items.some((x) => !x.AccountCode)) return { ok: false, reason: 'unknown-product-family' };
    const billTo = a.billingContactId || a.xeroContactId;
    return {
      ok: true,
      key,
      idempotencyKey: key,
      payload: {
        Type: 'ACCREC',
        Contact: billTo ? { ContactID: billTo } : { Name: a.name },
        Reference: o.po ? 'PO ' + o.po : o.number,
        Date: i.invoiceDate || i.today,                     // the completion or schedule date, not the day the sync ran
        DueDate: addDays(i.invoiceDate || i.today, a.termsDays || 30),
        Status: 'DRAFT',                  // finance approves in Xero; the sync never authorises
        LineAmountTypes: 'Exclusive',
        LineItems: items                  // no InvoiceNumber: Xero generates a unique one for receivable invoices
      }
    };
  }
  function authorise(_input, opts) { return (opts && opts.defect === 'authorise-allowed') ? { allowed: true } : { allowed: false, reason: 'finance-approves-in-xero' }; }
  function approver(i) {
    if (!i.financeManagerAway) return { ok: true, approver: 'finance-manager' };
    return i.deputy ? { ok: true, approver: 'deputy' } : { ok: false, reason: 'no-approver' };
  }

  // ---- customers ------------------------------------------------------------
  const STOP = ['ltd', 'limited', 'the', 'and', '&', 'plc', 'llp'];
  const ABBR = { assoc: 'association', mgmt: 'management', svcs: 'services', co: 'company' };
  const tokens = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9& ]+/g, ' ').split(/\s+/).filter(Boolean).map((t) => ABBR[t] || t).filter((t) => !STOP.includes(t));
  function similar(a, b) {
    const A = tokens(a), B = tokens(b);
    if (!A.length || !B.length) return false;
    const inter = A.filter((t) => B.includes(t)).length;
    return inter / new Set(A.concat(B)).size >= 0.6;
  }
  function matchContact(i) {
    const a = i.account, cs = i.xeroContacts;
    if (a.xeroContactId) return cs.some((c) => c.id === a.xeroContactId) ? { action: 'use', contactId: a.xeroContactId, by: 'stored-id' } : { action: 'review', reason: 'stored-id-not-found' };
    if (a.email && a.sharedEmail) return { action: 'review', reason: 'shared-email' };          // a managing agent can serve several landlords
    const byEmail = a.email ? cs.filter((c) => (c.email || '').toLowerCase() === a.email.toLowerCase()) : [];
    if (byEmail.length === 1) return { action: 'use', contactId: byEmail[0].id, by: 'email' };
    if (byEmail.length > 1) return { action: 'review', reason: 'several-with-same-email' };
    if (cs.some((c) => similar(c.name, a.name))) return { action: 'review', reason: 'similar-name' };
    return { action: 'create' };
  }

  // ---- timing: by the end of the working day it was triggered; a trigger out of hours counts to the end of the next working day ----
  function slaMet(i) {
    const t = new Date(i.trigger + 'Z').getTime(), d = new Date(i.drafted + 'Z').getTime();
    const day = iso(t), hour = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
    const inHours = working(day, i.holidays) && hour >= 9 && hour < 17;
    const dueDay = inHours ? day : workingAfter(day, 1, i.holidays);
    return { met: d <= new Date(dueDay + 'T17:00:00Z').getTime() };
  }

  // ---- once an invoice exists -----------------------------------------------
  // A draft can be updated. After that the deal is locked in Salesforce and finance decides in Xero.
  function onAmountChange(i) {
    const st = i.invoiceStatus;
    if (!st) return { action: 'nothing-to-update', createsInvoice: false, editsInvoice: false, locked: false };
    if (st === 'DRAFT') return { action: 'update-draft', createsInvoice: false, editsInvoice: true, locked: false };
    const how = st === 'PAID' ? 'credit-note' : 'finance-decides';
    return { action: 'finance-task', createsInvoice: false, editsInvoice: false, locked: true, how };
  }
  function voidHandling(i) { return { paymentStatus: 'Void', createTask: i.oppStage === 'Closed Won' && !i.hasReplacement }; }

  // Xero's AUTHORISED means approved and awaiting payment OR partially paid, so part paid comes from the amounts.
  function paymentStatus(i, opts) {
    const v = i.invoice;
    if (v.status === 'VOIDED') return { status: 'Void' };
    if (v.status === 'DRAFT' || v.status === 'SUBMITTED') return { status: 'Draft' };
    if (v.status === 'PAID' || v.amountDue === 0) return { status: 'Paid' };
    const partly = v.amountPaid > 0 && !(opts && opts.defect === 'authorised-is-unpaid');
    if (v.dueDate < i.today) return { status: 'Overdue', partPaid: partly };
    return { status: partly ? 'Part paid' : 'Unpaid' };
  }
  function creditSummary(i) {
    const credited = pence((i.notes || []).reduce((s, n) => s + n.allocated, 0));
    return { credited: pounds(credited), net: pounds(pence(i.invoice.total) - credited) };
  }

  // ---- the log and the morning email ------------------------------------------
  function dailyDigest(i) {
    const now = new Date(i.now + 'Z').getTime();
    const failed = i.logs.filter((l) => l.result === 'Failed' && now - new Date(l.at + 'Z').getTime() <= 24 * 3600000 && new Date(l.at + 'Z').getTime() <= now);
    return { send: failed.length > 0, count: failed.length };
  }

  // ---- a retry never makes a second invoice ----------------------------------
  // The Salesforce invoice record holds the invoice's own key and, once known, the Xero InvoiceID. If the answer from Xero was
  // lost, the retry sends the same key, so Xero treats it as the same request. It never searches Xero and adopts a look-alike,
  // so a voided or deleted invoice cannot be taken for the live one, and one run at a time may touch a record.
  function resolveCreate(i, opts) {
    if (i.record.xeroInvoiceId) return { action: 'skip', invoiceId: i.record.xeroInvoiceId };
    if (i.record.inFlight) return { action: 'wait', reason: 'another-run-in-progress' };
    if (!i.idempotencySupported) return { action: 'hold-for-review', reason: 'no-idempotency-key' };
    const key = (opts && opts.defect === 'new-key-each-retry') ? i.record.key + ':retry' + (i.record.attempts || 0) : i.record.key;
    return { action: 'retry-with-key', key };
  }

  // ---- month end: the books close on the third working day, so anything still unapproved is chased the day before ----
  function closeReadiness(i) {
    const p = i.month.split('-').map(Number);
    const end = iso(Date.UTC(p[0], p[1], 0));                 // last day of the month
    const closes = workingAfter(end, 3, i.holidays);
    const warnFrom = workingAfter(end, 2, i.holidays);
    const inMonth = (x) => x.date.slice(0, 7) === i.month;
    const waiting = (i.invoices || []).filter((x) => inMonth(x) && (x.status === 'DRAFT' || x.status === 'SUBMITTED')).map((x) => x.id);
    const held = (i.held || []).filter(inMonth).map((x) => ({ id: x.id, reason: x.reason }));    // held in Salesforce, never reached Xero
    const open = waiting.concat(held.map((x) => x.id));
    return { closes, open, held, warn: open.length > 0 && i.today >= warnFrom && i.today <= closes, late: open.length > 0 && i.today > closes };
  }

  // ---- the start: nothing before the start month, and no go-live with unlinked customers ----
  function cutover(i) {
    if (i.invoiceDate.slice(0, 7) < i.startMonth) return { create: false, reason: 'before-start-month' };
    if (i.alreadyInXero) return { create: false, reason: 'already-invoiced' };      // typed by hand before go-live: link it, never repeat it
    return { create: true };
  }
  function goLive(i) { return { ready: i.unlinkedAccounts === 0 && !!i.rehearsalPassed }; }
  // A contract already running at go-live starts its schedule from the start month, not from its original start date.
  function remainingSchedule(i) { return scheduleAmounts(i).filter((x) => x.date.slice(0, 7) >= i.startMonth); }

  // ---- nothing goes missing: every won deal or completed job ends as a draft, a scheduled invoice or an exception ----
  function reconcile(i) {
    const handled = new Set((i.handled || []).map((h) => h.id));
    const missing = i.expected.filter((id) => !handled.has(id));
    const by = (k) => (i.handled || []).filter((h) => h.as === k).length;
    return { ok: missing.length === 0, missing, counts: { expected: i.expected.length, drafts: by('draft'), scheduled: by('scheduled'), exceptions: by('exception') } };
  }

  // ---- who sees what ----------------------------------------------------------
  const VIEW = { Finance: { payment: true, log: true, rerun: true }, Sales: { payment: true, log: false, rerun: false } };
  const canSee = (i) => !!(VIEW[i.profile] && VIEW[i.profile][i.item]);

  // ---- the runner used by the page and the Node tests -------------------------
  const FN = { shouldInvoice, splitDeposit, scheduleAmounts, buildInvoice, authorise, approver, matchContact, slaMet, onAmountChange, voidHandling, paymentStatus, creditSummary, dailyDigest, resolveCreate, closeReadiness, cutover, goLive, remainingSchedule, reconcile, canSee, taxType };
  function getPath(o, p) { return p.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce((x, k) => (x === undefined || x === null ? undefined : x[k]), o); }
  function runCase(fn, c, opts) {
    const out = FN[fn](c.input, opts);
    const misses = [];
    Object.keys(c.expect).forEach((path) => {
      const got = path === '$' ? out : getPath(out, path);
      if (JSON.stringify(got) !== JSON.stringify(c.expect[path])) misses.push({ path, expected: c.expect[path], actual: got });
    });
    return { name: c.name, pass: misses.length === 0, misses, output: out };
  }
  function runTest(t, opts) {
    const cases = t.cases.map((c) => runCase(t.fn, c, opts));
    return { id: t.id, pass: cases.every((c) => c.pass), cases };
  }
  return { TAX, ACCOUNT, FN, runTest, runCase, getPath, similar, pence, pounds };
});
