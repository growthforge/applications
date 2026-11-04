// @ts-check
/**
 * Pluggable index series. Every JSON file in data/series/ is a collection in the shape of
 * ons-opi.json (see data/series/README.md). A firm can drop in its own tender price index
 * as another collection; its series ids then appear in rebase_rate's series list.
 */
import { monthSerial } from './util.js';

/**
 * @typedef {{ id: string, name: string, kind: string, values: Record<string, number>, first_month: string,
 *   last_month: string, collection: string, source: { publisher: string, dataset: string, released: string,
 *   licence: string, url: string, attribution: string, index_base: string }, caveats: string[], notes: string[] }} Series
 */

/**
 * @param {any[]} collections parsed JSON documents
 * @param {string} [defaultId]
 */
export function createSeriesRegistry(collections, defaultId) {
  /** @type {Map<string, Series>} */
  const map = new Map();
  for (const doc of collections) {
    const problems = checkCollection(doc);
    if (problems.length) throw new Error(`index collection ${doc && doc.id}: ${problems.join('; ')}`);
    for (const [sid, s] of Object.entries(doc.series)) {
      if (map.has(sid)) throw new Error(`index series id ${sid} is defined twice`);
      map.set(sid, {
        id: sid,
        name: s.name,
        kind: doc.kind,
        values: s.values,
        first_month: doc.first_month,
        last_month: doc.last_month,
        collection: doc.id,
        source: {
          publisher: doc.publisher,
          dataset: doc.dataset,
          released: doc.released,
          licence: doc.licence,
          url: doc.dataset_url,
          attribution: doc.attribution,
          index_base: doc.index_base,
        },
        caveats: doc.caveats || [],
        notes: (doc.notes || []).filter((/** @type {string} */ n) => n.includes(s.name.replace(/^New work: /, ''))),
      });
    }
  }
  const def = defaultId || (collections[0] && collections[0].default_series) || [...map.keys()][0];
  if (!map.has(def)) throw new Error(`default index series ${def} is not loaded`);
  return {
    defaultId: def,
    ids: () => [...map.keys()],
    /** @param {string} id */
    get: (id) => map.get(id),
    list: () => [...map.values()].map((s) => ({ id: s.id, name: s.name, kind: s.kind, first_month: s.first_month, last_month: s.last_month, publisher: s.source.publisher })),
  };
}

/**
 * Shape check for a collection file, so a malformed custom series fails at start-up, not mid-call.
 * @param {any} doc
 * @returns {string[]}
 */
export function checkCollection(doc) {
  const p = [];
  if (!doc || typeof doc !== 'object') return ['not an object'];
  for (const f of ['id', 'kind', 'publisher', 'dataset', 'released', 'licence', 'index_base', 'first_month', 'last_month']) {
    if (typeof doc[f] !== 'string' || !doc[f]) p.push(`missing ${f}`);
  }
  if (!doc.series || typeof doc.series !== 'object') p.push('missing series');
  const a = monthSerial(doc.first_month);
  const b = monthSerial(doc.last_month);
  if (Number.isNaN(a) || Number.isNaN(b) || a > b) p.push('first_month and last_month must be YYYY-MM with first <= last');
  if (p.length) return p;
  for (const [sid, s] of Object.entries(doc.series)) {
    if (!/^[a-z0-9_]{2,60}$/.test(sid)) p.push(`series id ${sid} must be lower case letters, digits and underscores`);
    if (!s || typeof s.name !== 'string' || !s.values) { p.push(`series ${sid} needs name and values`); continue; }
    for (let m = a; m <= b; m++) {
      const key = `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
      const v = s.values[key];
      if (typeof v !== 'number' || !(v > 0)) { p.push(`series ${sid} has no positive value for ${key}`); break; }
    }
  }
  return p;
}
