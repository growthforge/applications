// fmt.js: number and date formatting shared by the prerender (Node) and the page (browser).
// Deterministic: no locale APIs, so both sides print identical strings.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MINUS = '−';

function group(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

export function fixed(x, dp) {
  const v = Math.round(Math.abs(x) * 10 ** dp) / 10 ** dp;
  const [i, f] = v.toFixed(dp).split('.');
  return group(i) + (f ? '.' + f : '');
}

// Whole dollars for totals.
export function usd(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return (x < -0.5 ? MINUS : '') + '$' + fixed(x, 0);
}
export function signedUsd(x) {
  if (!Number.isFinite(x)) return 'n/a';
  const r = Math.round(x);
  return (r > 0 ? '+' : r < 0 ? MINUS : '') + '$' + fixed(x, 0);
}
// Unit costs: enough decimals to compare small numbers.
export function unitUsd(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  const a = Math.abs(x);
  if (a < 0.00005) return '$0';
  const dp = a >= 100 ? 0 : a >= 0.1 ? 2 : a >= 0.01 ? 3 : 4;
  return (x < 0 ? MINUS : '') + '$' + fixed(x, dp);
}
export function pct(x, dp = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return (x < 0 ? MINUS : '') + fixed(x * 100, dp) + '%';
}
export function int(x) { return Number.isFinite(x) ? (x < 0 ? MINUS : '') + fixed(x, 0) : 'n/a'; }
export function compact(x) {
  if (!Number.isFinite(x)) return 'n/a';
  if (Math.abs(x) >= 1e9) return fixed(x / 1e9, 1) + ' bn';
  if (Math.abs(x) >= 1e6) return fixed(x / 1e6, 1) + ' m';
  if (Math.abs(x) >= 1e4) return fixed(x / 1e3, 0) + 'k';
  return fixed(x, 0);
}
export function ratio(x) { return Number.isFinite(x) ? fixed(x, x >= 10 ? 0 : 1) + '×' : 'n/a'; }
export function monthName(m) { return MONTHS[Number(m.slice(5, 7)) - 1]; }
export function longDate(d) { return d ? Number(d.slice(8, 10)) + ' ' + monthName(d.slice(0, 7)) : 'not reached'; }
export function shortDate(d) { return d ? Number(d.slice(8, 10)) + ' ' + monthName(d.slice(0, 7)).slice(0, 3) : 'none'; }
export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const TENS = { 2: 'twenty', 3: 'thirty' };
export function words(n) {
  if (n >= 0 && n < WORDS.length) return WORDS[n];
  if (n > 20 && n < 40) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + WORDS[n % 10] : '');
  return String(n);
}
