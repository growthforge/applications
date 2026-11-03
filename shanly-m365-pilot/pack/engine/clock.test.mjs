// Tests for clock.js. Run: node --test clock.test.mjs
// Expected dates were worked out by hand from Shanly Homes' published rules and checked
// against a calendar; bank holidays are England and Wales (GOV.UK).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as c from './clock.js';

const bh = JSON.parse(fs.readFileSync(new URL('./bank-holidays-england-wales.json', import.meta.url)));
const H = c.holidaySet(bh.dates);

test('published example: received Monday, initiation Tuesday', () => {
  assert.equal(c.initiationDate('2026-11-02', H), '2026-11-03');
});
test('published example: received Saturday, initiation the next Monday', () => {
  assert.equal(c.initiationDate('2026-11-07', H), '2026-11-09');
});
test('received Sunday: initiation Monday', () => {
  assert.equal(c.initiationDate('2026-11-08', H), '2026-11-09');
});
test('received Friday: initiation Monday', () => {
  assert.equal(c.initiationDate('2026-11-13', H), '2026-11-16');
});
test('bank holiday Monday is skipped (Spring bank holiday 2026)', () => {
  assert.equal(c.initiationDate('2026-05-22', H), '2026-05-26');
});
test('Easter 2026: Good Friday and Easter Monday are skipped', () => {
  assert.equal(c.initiationDate('2026-04-02', H), '2026-04-07');
});
test('Christmas 2026: 25 Dec and the substitute Boxing Day (28 Dec) are skipped', () => {
  assert.equal(c.initiationDate('2026-12-24', H), '2026-12-29');
});
test('New Year 2027: received 31 Dec, 1 Jan is a bank holiday, initiation Monday 4 Jan', () => {
  assert.equal(c.initiationDate('2026-12-31', H), '2027-01-04');
});

test('all four stage dates from a Monday receipt', () => {
  const s = c.schedule('2026-11-09', H);
  assert.equal(s.initiation, '2026-11-10');
  assert.deepEqual(s.stages.map((x) => x.due), ['2026-11-15', '2026-11-20', '2026-12-10', '2027-01-05']);
});
test('a promise due on a Sunday must go by the Friday before', () => {
  const ack = c.schedule('2026-11-09', H).stages[0];
  assert.equal(ack.due, '2026-11-15');
  assert.equal(ack.sendBy, '2026-11-13');
});
test('a promise due on a working day can go that day', () => {
  const pathway = c.schedule('2026-11-09', H).stages[1];
  assert.equal(pathway.due, '2026-11-20');
  assert.equal(pathway.sendBy, '2026-11-20');
});
test('over Christmas: received 24 Dec, acknowledgement due Sun 3 Jan, send by Thu 31 Dec', () => {
  const ack = c.schedule('2026-12-24', H).stages[0];
  assert.equal(ack.due, '2027-01-03');
  assert.equal(ack.sendBy, '2026-12-31');
});
test('updates every 28 days after day 56, chained from the letter that actually went', () => {
  const planned = c.schedule('2026-11-09', H).updates.map((u) => u.due);
  assert.deepEqual(planned, ['2027-02-02', '2027-03-02', '2027-03-30']);
  const actual = c.schedule('2026-11-09', H, { sent: { nextSteps: '2026-12-31' } }).updates[0].due;
  assert.equal(actual, '2027-01-28');
});

test('code version: reserved 1 Aug 2023 is the Consumer Code for Home Builders', () => {
  assert.equal(c.codeFor('2023-08-01').key, 'cchb');
});
test('code version: reserved 2 Aug 2023 is NHQC version 1', () => {
  assert.equal(c.codeFor('2023-08-02').key, 'nhqc1');
});
test('code version: reserved 1 Mar 2026 is NHQC version 1', () => {
  assert.equal(c.codeFor('2026-03-01').key, 'nhqc1');
});
test('code version: reserved 2 Mar 2026 is NHQC version 2', () => {
  assert.equal(c.codeFor('2026-03-02').key, 'nhqc2');
});
test('code version: no reservation date means a person must confirm it', () => {
  assert.equal(c.codeFor('').key, 'confirm');
});

test('two-year window runs from the later of reservation and completion', () => {
  assert.equal(c.windowEnd('2024-05-10', '2025-01-17'), '2027-01-17');
  assert.equal(c.windowEnd('2025-01-17', ''), '2027-01-17');
});
test('two-year window: the last day is inside, the day after is outside', () => {
  assert.equal(c.withinWindow('2027-01-17', '2024-05-10', '2025-01-17').ok, true);
  assert.equal(c.withinWindow('2027-01-18', '2024-05-10', '2025-01-17').ok, false);
});
test('two-year window from 29 February ends on 28 February', () => {
  assert.equal(c.windowEnd('2024-02-29', ''), '2026-02-28');
});
test('no dates at all: window is unknown, not assumed', () => {
  assert.deepEqual(c.withinWindow('2026-11-09', '', ''), { ok: null, end: null });
});

test('status: due soon inside two working days of the send-by date', () => {
  const ack = c.schedule('2026-11-09', H).stages[0]; // send by Fri 13 Nov
  assert.equal(c.stageStatus(ack, null, '2026-11-10', H), 'on-track');
  assert.equal(c.stageStatus(ack, null, '2026-11-11', H), 'due-soon');
  assert.equal(c.stageStatus(ack, null, '2026-11-13', H), 'due-soon');
});
test('status: overdue the day after the due date; met when sent on or before it', () => {
  const ack = c.schedule('2026-11-09', H).stages[0]; // due Sun 15 Nov
  assert.equal(c.stageStatus(ack, null, '2026-11-16', H), 'overdue');
  assert.equal(c.stageStatus(ack, '2026-11-12', '2026-11-16', H), 'met');
  assert.equal(c.stageStatus(ack, '2026-11-16', '2026-11-16', H), 'met-late');
});
test('working days until: skips the weekend and counts down to zero', () => {
  assert.equal(c.workingDaysUntil('2026-11-12', '2026-11-16', H), 2);
  assert.equal(c.workingDaysUntil('2026-11-16', '2026-11-16', H), 0);
  assert.equal(c.workingDaysUntil('2026-11-17', '2026-11-16', H), -1);
});
test('assess: one call returns the register row, the next promise and its status', () => {
  const a = c.assess({ received: '2026-11-09', reservation: '2026-03-14', completion: '', sent: { ack: '2026-11-12' }, today: '2026-11-18' }, H);
  assert.equal(a.initiation, '2026-11-10');
  assert.equal(a.code.key, 'nhqc2');
  assert.equal(a.window.end, '2028-03-14');
  assert.equal(a.rows[0].status, 'met');
  assert.equal(a.next.key, 'pathway');
  assert.equal(a.next.status, 'due-soon');
});
test('bad input is refused rather than guessed', () => {
  assert.throws(() => c.initiationDate('09/11/2026', H));
  assert.throws(() => c.initiationDate('2026-02-30', H));
});
test('dayOfWeek uses the Power Automate numbering (0 = Sunday)', () => {
  assert.equal(c.dayOfWeek('2026-11-08'), 0);
  assert.equal(c.dayOfWeek('2026-11-07'), 6);
});
test('assess can list as many 28-day updates as the register needs', () => {
  const a = c.assess({ received: '2026-11-09', reservation: '', completion: '', today: '2028-01-10', updates: 12 }, H);
  const ups = a.rows.filter((r) => r.key.startsWith('update'));
  assert.equal(ups.length, 12);
  assert.equal(ups[0].due, '2027-02-02');
  assert.equal(ups[11].due, '2027-12-07');
  assert.equal(ups[11].status, 'overdue');
});

