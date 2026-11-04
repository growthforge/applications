// @ts-check
/**
 * NRM 1 (RICS, 3rd edition, October 2021) level 1 group elements: codes and names only.
 * NRM 1 is copyright RICS; no text or tables from it are reproduced here. The build-up
 * order below follows the published Table 2.1 sequence (works cost estimate, base cost
 * estimate, cost limit excluding and including inflation).
 */

/** @type {{ code: number, name: string, kind: 'element' | 'addition' }[]} */
export const GROUP_ELEMENTS = [
  { code: 0, name: 'Facilitating works', kind: 'element' },
  { code: 1, name: 'Substructure', kind: 'element' },
  { code: 2, name: 'Superstructure', kind: 'element' },
  { code: 3, name: 'Internal finishes', kind: 'element' },
  { code: 4, name: 'Fittings, furnishings and equipment', kind: 'element' },
  { code: 5, name: 'Services', kind: 'element' },
  { code: 6, name: 'Prefabricated buildings and building units', kind: 'element' },
  { code: 7, name: 'Work to existing buildings', kind: 'element' },
  { code: 8, name: 'External works', kind: 'element' },
  { code: 9, name: "Main contractor's preliminaries", kind: 'addition' },
  { code: 10, name: "Main contractor's overheads and profit", kind: 'addition' },
  { code: 11, name: 'Project and design team fees', kind: 'addition' },
  { code: 12, name: 'Other project costs', kind: 'addition' },
  { code: 13, name: 'Risks', kind: 'addition' },
  { code: 14, name: 'Inflation', kind: 'addition' },
];

/** @param {number} code */
export function groupName(code) {
  const g = GROUP_ELEMENTS.find((x) => x.code === code);
  return g ? g.name : `Group ${code}`;
}

/**
 * Where a percentage addition sits in the Table 2.1 build-up: the groups it is applied to.
 * Preliminaries go on facilitating plus building works; overheads and profit on that plus
 * preliminaries; fees on the works cost estimate; risk on the base cost estimate;
 * inflation on the cost limit excluding inflation.
 * @type {Record<number, [number, number]>}
 */
export const EXPECTED_BASE = {
  9: [0, 8],
  10: [0, 9],
  11: [0, 10],
  12: [0, 11],
  13: [0, 12],
  14: [0, 13],
};

/** @param {[number, number]} r */
export function baseLabel(r) {
  return `groups ${r[0]} to ${r[1]}`;
}

/** @param {[number, number]} r */
export function baseId(r) {
  return `groups_${r[0]}_to_${r[1]}`;
}

/**
 * Parse "groups_0_to_8" to [0, 8], or null.
 * @param {string | undefined} s
 * @returns {[number, number] | null}
 */
export function parseBase(s) {
  const m = typeof s === 'string' ? /^groups_(\d{1,2})_to_(\d{1,2})$/.exec(s) : null;
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a > b || b > 14) return null;
  return [a, b];
}
