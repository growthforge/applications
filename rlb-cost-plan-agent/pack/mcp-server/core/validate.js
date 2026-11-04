// @ts-check
/**
 * A deliberately small JSON Schema validator for the flat subset this toolkit uses:
 * type (one type, never an array), properties, required, additionalProperties: false,
 * items, minItems, maxItems, enum (strings), minimum, maximum, minLength, maxLength, pattern.
 *
 * The MCP SDK validates tool arguments against the same schemas on the server (AJV);
 * this copy lets the browser walkthrough give exactly the core's own answer, and lets
 * the tests check every structured result against its output schema.
 */

/**
 * @typedef {{ type?: string, description?: string, properties?: Record<string, Schema>, required?: string[],
 *   additionalProperties?: boolean, items?: Schema, minItems?: number, maxItems?: number, enum?: string[],
 *   minimum?: number, maximum?: number, minLength?: number, maxLength?: number, pattern?: string }} Schema
 */

/**
 * @param {unknown} v
 * @returns {string}
 */
function kind(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isFinite(v) ? 'number' : 'non-finite number';
  return typeof v;
}

/**
 * Validate a value; returns a list of readable problems (empty when valid).
 * @param {Schema} schema
 * @param {unknown} value
 * @param {string} [path]
 * @returns {string[]}
 */
export function validate(schema, value, path = '') {
  const where = path || 'arguments';
  /** @type {string[]} */
  const out = [];
  const t = schema.type;
  const k = kind(value);

  if (t === 'object') {
    if (k !== 'object') return [`${where} must be an object (got ${k})`];
    const obj = /** @type {Record<string, unknown>} */ (value);
    for (const req of schema.required || []) {
      if (obj[req] === undefined) out.push(`${path ? path + '.' : ''}${req} is required`);
    }
    for (const [key, v] of Object.entries(obj)) {
      const sub = schema.properties && schema.properties[key];
      if (!sub) {
        if (schema.additionalProperties === false) out.push(`${path ? path + '.' : ''}${key} is not a recognised field`);
        continue;
      }
      if (v === undefined) continue;
      out.push(...validate(sub, v, path ? `${path}.${key}` : key));
    }
    return out;
  }
  if (t === 'array') {
    if (k !== 'array') return [`${where} must be a list (got ${k})`];
    const arr = /** @type {unknown[]} */ (value);
    if (schema.minItems !== undefined && arr.length < schema.minItems) out.push(`${where} must have at least ${schema.minItems} item(s)`);
    if (schema.maxItems !== undefined && arr.length > schema.maxItems) out.push(`${where} must have at most ${schema.maxItems} items (got ${arr.length})`);
    if (schema.items) arr.forEach((item, i) => out.push(...validate(/** @type {Schema} */ (schema.items), item, `${where}[${i}]`)));
    return out;
  }
  if (t === 'number' || t === 'integer') {
    if (k !== 'number') return [`${where} must be a number (got ${k === 'string' ? 'text' : k})`];
    const n = /** @type {number} */ (value);
    if (t === 'integer' && !Number.isInteger(n)) out.push(`${where} must be a whole number`);
    if (schema.minimum !== undefined && n < schema.minimum) out.push(`${where} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && n > schema.maximum) out.push(`${where} must be at most ${schema.maximum}`);
    return out;
  }
  if (t === 'string') {
    if (k !== 'string') return [`${where} must be text (got ${k})`];
    const s = /** @type {string} */ (value);
    if (schema.enum && !schema.enum.includes(s)) out.push(`${where} must be one of: ${schema.enum.join(', ')}`);
    if (schema.minLength !== undefined && s.length < schema.minLength) out.push(`${where} must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && s.length > schema.maxLength) out.push(`${where} must be at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(s)) out.push(`${where} is not in the expected format`);
    return out;
  }
  if (t === 'boolean') {
    return k === 'boolean' ? [] : [`${where} must be true or false (got ${k})`];
  }
  return out;
}
