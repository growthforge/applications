/*
  clock.js: the complaint clock, written from Shanly Homes' published complaints process.

  Rules (source: https://www.shanlyhomes.com/buying-with-us/customer-care, read 3 Nov 2026):
  - The complaint initiation date is the first working day after a complaint is received.
    Weekends and public holidays are not working days.
  - From the initiation date, in calendar days: acknowledge within 5, proposed pathway within 10,
    full assessment within 30, next steps if unresolved after 56, then updates at least every 28.
  - A formal complaint can be raised for two years from the date of reservation or legal
    completion, whichever is later.
  Which code applies (source: https://www.shanlyhomes.com/buying-with-us/new-homes-quality-code):
  - reserved before 2 Aug 2023: Consumer Code for Home Builders
  - reserved 2 Aug 2023 to 1 Mar 2026: New Homes Quality Code, version 1
  - reserved on or after 2 Mar 2026: New Homes Quality Code, version 2

  All dates are ISO strings (YYYY-MM-DD) for the UK calendar day. Convert email timestamps to
  UK local time before calling initiationDate (the flow does this with convertFromUtc).
  Pure functions, no dependencies; runs in the browser and in Node.
*/

export const STAGES = [
  { key: 'ack', days: 5, label: 'Acknowledge the complaint' },
  { key: 'pathway', days: 10, label: 'Send the proposed pathway to resolution' },
  { key: 'assessment', days: 30, label: 'Send the full assessment' },
  { key: 'nextSteps', days: 56, label: 'If unresolved, send next steps and timescales' },
];
export const UPDATE_EVERY = 28;
export const NHQC_START = '2023-08-02';
export const NHQC_V2_START = '2026-03-02';
export const DUE_SOON_WORKING_DAYS = 2;

const DAY = 86400000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUTC(iso) {
  const m = ISO.exec(iso || '');
  if (!m) throw new Error('Expected a date as YYYY-MM-DD, got ' + JSON.stringify(iso));
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(t).toISOString().slice(0, 10) !== iso) throw new Error('Not a real date: ' + iso);
  return t;
}
function fromUTC(t) { return new Date(t).toISOString().slice(0, 10); }

export function addDays(iso, n) { return fromUTC(toUTC(iso) + n * DAY); }
export function daysBetween(fromIso, toIso) { return Math.round((toUTC(toIso) - toUTC(fromIso)) / DAY); }
/** 0 = Sunday ... 6 = Saturday, the same numbering as Power Automate's dayOfWeek(). */
export function dayOfWeek(iso) { return new Date(toUTC(iso)).getUTCDay(); }

/** Two years on; 29 February falls back to 28 February in a non-leap year. */
export function addYears(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const ty = y + n;
  const last = new Date(Date.UTC(ty, m, 0)).getUTCDate();
  return fromUTC(Date.UTC(ty, m - 1, Math.min(d, last)));
}

export function holidaySet(dates) { return new Set(dates || []); }
export function isWorkingDay(iso, holidays) {
  const w = dayOfWeek(iso);
  return w !== 0 && w !== 6 && !holidays.has(iso);
}

/** The first working day after the day the complaint was received. */
export function initiationDate(receivedIso, holidays) {
  let d = addDays(receivedIso, 1);
  while (!isWorkingDay(d, holidays)) d = addDays(d, 1);
  return d;
}

/** The latest working day on or before a date: when to send a letter due on a weekend. */
export function sendBy(dueIso, holidays) {
  let d = dueIso;
  while (!isWorkingDay(d, holidays)) d = addDays(d, -1);
  return d;
}

/** Working days from today until a date (0 if it is today, negative if past). */
export function workingDaysUntil(todayIso, targetIso, holidays) {
  if (targetIso === todayIso) return 0;
  const step = targetIso > todayIso ? 1 : -1;
  let n = 0;
  let d = todayIso;
  while (d !== targetIso) {
    d = addDays(d, step);
    if (isWorkingDay(d, holidays)) n += step;
  }
  return n;
}

export function codeFor(reservationIso) {
  if (!reservationIso) return { key: 'confirm', label: 'To confirm: reservation date needed' };
  toUTC(reservationIso);
  if (reservationIso < NHQC_START) return { key: 'cchb', label: 'Consumer Code for Home Builders' };
  if (reservationIso < NHQC_V2_START) return { key: 'nhqc1', label: 'New Homes Quality Code, version 1' };
  return { key: 'nhqc2', label: 'New Homes Quality Code, version 2' };
}

/** Last day a formal complaint can be raised: two years from the later of reservation and completion. */
export function windowEnd(reservationIso, completionIso) {
  const base = [reservationIso, completionIso].filter(Boolean).sort().pop();
  return base ? addYears(base, 2) : null;
}
export function withinWindow(receivedIso, reservationIso, completionIso) {
  const end = windowEnd(reservationIso, completionIso);
  if (!end) return { ok: null, end: null };
  return { ok: receivedIso <= end, end };
}

/**
  Every date the complaint team has promised, from one received date. After day 56 each update
  is due 28 days after the previous one actually went (or was due, if it has not gone yet).
*/
export function schedule(receivedIso, holidays, { updates = 3, sent = {} } = {}) {
  const initiation = initiationDate(receivedIso, holidays);
  const stages = STAGES.map((s) => {
    const due = addDays(initiation, s.days);
    return { ...s, due, sendBy: sendBy(due, holidays) };
  });
  const regular = [];
  let previous = sent.nextSteps || stages[stages.length - 1].due;
  for (let i = 1; i <= updates; i++) {
    const key = 'update' + i;
    const due = addDays(previous, UPDATE_EVERY);
    regular.push({ key, days: daysBetween(initiation, due), label: 'Update the customer (at least every 28 days)', due, sendBy: sendBy(due, holidays) });
    previous = sent[key] || due;
  }
  return { received: receivedIso, initiation, stages, updates: regular };
}

/** Status of one promise on a given day. sentIso is when the letter went, if it has. */
export function stageStatus(stage, sentIso, todayIso, holidays) {
  if (sentIso) return sentIso <= stage.due ? 'met' : 'met-late';
  if (todayIso > stage.due) return 'overdue';
  const left = workingDaysUntil(todayIso, stage.sendBy, holidays);
  if (left <= DUE_SOON_WORKING_DAYS) return 'due-soon';
  return 'on-track';
}

/** One call for the register row: dates, code, window, and the next thing due. `updates` sets how many 28-day updates to list. */
export function assess({ received, reservation, completion, sent = {}, today, updates = 3 }, holidays) {
  const plan = schedule(received, holidays, { sent, updates });
  const all = plan.stages.concat(plan.updates);
  const rows = all.map((s) => ({ ...s, sent: sent[s.key] || null, status: stageStatus(s, sent[s.key], today, holidays) }));
  const next = rows.find((r) => !r.sent) || null;
  return {
    received,
    initiation: plan.initiation,
    code: codeFor(reservation),
    window: withinWindow(received, reservation, completion),
    rows,
    next,
  };
}
