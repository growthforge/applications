// dates.js: calendar helpers on ISO dates (YYYY-MM-DD), always in UTC so Node and browsers agree.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function toDate(iso) { return new Date(iso.slice(0, 10) + 'T00:00:00Z'); }
export function iso(d) { return d.toISOString().slice(0, 10); }
export function addDays(isoDate, n) { const d = toDate(isoDate); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
export function monthOf(isoDate) { return isoDate.slice(0, 7); }
export function dayOf(isoDate) { return Number(isoDate.slice(8, 10)); }
export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function datesOfMonth(month) {
  const n = daysInMonth(month);
  const out = [];
  for (let d = 1; d <= n; d++) out.push(month + '-' + String(d).padStart(2, '0'));
  return out;
}
export function isWeekend(isoDate) { const w = toDate(isoDate).getUTCDay(); return w === 0 || w === 6; }
export function prevMonth(month, n = 1) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return iso(d).slice(0, 7);
}
export function monthName(month) { return MONTHS[Number(month.slice(5, 7)) - 1]; }
export function longDate(isoDate) { return dayOf(isoDate) + ' ' + monthName(monthOf(isoDate)); }
