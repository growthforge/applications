// @ts-check
/**
 * Small pure helpers shared by the server, the tests and the browser walkthrough.
 * No Node or browser APIs beyond the language itself, so the same file runs everywhere.
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A month string as used everywhere in this toolkit: YYYY-MM. */
export const MONTH_PATTERN = '^(19[0-9]{2}|20[0-9]{2})-(0[1-9]|1[0-2])$';
const MONTH_RE = new RegExp(MONTH_PATTERN);

/**
 * Month string to a serial number of months (year * 12 + month index), or NaN.
 * @param {string} s
 */
export function monthSerial(s) {
  const m = typeof s === 'string' ? MONTH_RE.exec(s) : null;
  if (!m) return NaN;
  return Number(m[1]) * 12 + Number(m[2]) - 1;
}

/**
 * "2021-12" to "Dec 2021".
 * @param {string} s
 */
export function monthLabel(s) {
  const n = monthSerial(s);
  if (Number.isNaN(n)) return String(s);
  return `${MONTH_NAMES[n % 12]} ${Math.floor(n / 12)}`;
}

/**
 * Months between two month strings (b minus a).
 * @param {string} a
 * @param {string} b
 */
export function monthsBetween(a, b) {
  return monthSerial(b) - monthSerial(a);
}

/**
 * Round half away from zero to a number of decimal places, avoiding binary
 * artefacts such as 1.005 rounding down. Values stay well inside 1e12 here.
 * @param {number} n
 * @param {number} dp
 */
export function round(n, dp = 2) {
  if (!Number.isFinite(n)) return n;
  const sign = n < 0 ? -1 : 1;
  const shifted = Number(`${Math.abs(n)}e${dp}`);
  return sign * Number(`${Math.round(shifted)}e-${dp}`);
}

/**
 * Thousands separators on an integer string.
 * @param {string} digits
 */
function group(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Pounds sterling, e.g. gbp(2479.8685, 2) = "£2,479.87", gbp(2479.87) = "£2,480".
 * @param {number} n
 * @param {number} dp
 */
export function gbp(n, dp = 0) {
  const r = round(n, dp);
  const neg = r < 0;
  const [i, f] = Math.abs(r).toFixed(dp).split('.');
  return `${neg ? '-' : ''}£${group(i)}${f ? '.' + f : ''}`;
}

/**
 * Plain number with separators, e.g. num(8400) = "8,400", num(23.993, 2) = "23.99".
 * @param {number} n
 * @param {number} dp
 */
export function num(n, dp = 0) {
  const r = round(n, dp);
  const neg = r < 0;
  const [i, f] = Math.abs(r).toFixed(dp).split('.');
  return `${neg ? '-' : ''}${group(i)}${f ? '.' + f : ''}`;
}

/**
 * JSON with sorted object keys, so the same content always hashes the same.
 * @param {unknown} v
 * @returns {string}
 */
export function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = /** @type {Record<string, unknown>} */ (v);
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

/**
 * Deep copy of plain JSON data.
 * @template T
 * @param {T} v
 * @returns {T}
 */
export function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
