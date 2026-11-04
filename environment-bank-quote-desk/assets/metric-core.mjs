// Reads a completed Statutory Biodiversity Metric workbook (v1.1.0 layout) through a small accessor, so the
// same code runs on exceljs in Node (mcp/metric.mjs) and on the browser reader (xlsx-lite.mjs).
//   book.has(sheet)          -> boolean
//   book.get(sheet, 'F11')   -> the cell's cached value (string, number or null)
//   book.maxRow(sheet)       -> last used row
// Every value read is checked against the label printed beside it (or above it, for the trading summary column),
// so a different layout fails loudly
// instead of returning wrong numbers. Applicant (Start F13) and author (Start F16) are never read.

export const SHEETS = { start: 'Start', headline: 'Headline Results', trading: 'Trading Summary Area Habitats', versions: 'Version History' };
const BAND_OF_SECTION = { 'Very High Distinctiveness': 'V.High', 'High Distinctiveness': 'High', 'Medium Distinctiveness': 'Medium', 'Low Distinctiveness': 'Low' };
const round2 = (x) => Math.round(x * 100) / 100;
const text = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const number = (v) => { if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };

function expectLabel(book, sheet, ref, starts) {
  const got = text(book.get(sheet, ref));
  if (!got.toLowerCase().startsWith(starts.toLowerCase())) {
    throw new Error(`Unexpected layout: ${sheet}!${ref} reads "${got.slice(0, 40)}", expected "${starts}". This reader knows the Statutory Biodiversity Metric 1.1.0 layout only.`);
  }
}

// Losses that the trading rules say must be compensated, from the trading summary rows (user guide, Table 3).
// High and very high: per habitat, because only the same habitat will do. Medium: netted within the broad
// habitat, then met from any surplus in a higher band. Low: netted across all low rows, then met from any
// surplus in medium or higher bands. Gains in a lower band never meet a higher band's loss.
export function deficitsFromRows(rows) {
  const out = [];
  let higher = 0; // surplus gains in high and very high habitats, usable for medium and low losses
  for (const x of rows.filter((r) => r.band === 'V.High' || r.band === 'High')) {
    if (x.units < 0) out.push({ label: x.label, band: x.band, units: round2(x.units) });
    else higher += x.units;
  }
  const medium = {};
  for (const x of rows.filter((r) => r.band === 'Medium')) (medium[x.group] ||= []).push(x);
  let mediumSurplus = 0;
  const mediumDeficits = [];
  for (const xs of Object.values(medium)) {
    const net = xs.reduce((a, x) => a + x.units, 0);
    if (net < 0) mediumDeficits.push({ label: xs.slice().sort((a, b) => a.units - b.units)[0].label, band: 'Medium', units: net });
    else mediumSurplus += net;
  }
  for (const d of mediumDeficits.sort((a, b) => a.units - b.units)) {
    const use = Math.min(higher, -d.units);
    higher -= use;
    d.units += use;
    if (d.units < -1e-9) out.push({ ...d, units: round2(d.units) });
  }
  const low = rows.filter((r) => r.band === 'Low');
  const lowNet = low.reduce((a, x) => a + x.units, 0) + mediumSurplus + higher;
  if (low.some((x) => x.units < 0) && lowNet < -1e-9) out.push({ label: low.slice().sort((a, b) => a.units - b.units)[0].label, band: 'Low', units: round2(lowNet) });
  return out;
}

export function readMetricFrom(book, { siteNca = '', file = '' } = {}) {
  const missing = Object.values(SHEETS).filter((n) => !book.has(n));
  if (missing.length) throw new Error('Not a Statutory Biodiversity Metric 1.1.0 workbook: missing ' + missing.join(', ') + '.');

  // Version: the last "Version x.y.z" row in Version History.
  let version = null;
  for (let r = 1; r <= book.maxRow(SHEETS.versions); r++) {
    const m = /^Version\s+(\d+\.\d+\.\d+)/.exec(text(book.get(SHEETS.versions, 'B' + r)));
    if (m) version = m[1];
  }
  if (version !== '1.1.0') throw new Error(`This workbook is metric version ${version || 'unknown'}. The reader is pinned to 1.1.0; re-save the metric in 1.1.0 or extend the reader and its tests.`);

  const S = SHEETS.start;
  expectLabel(book, S, 'D11', 'Planning authority');
  expectLabel(book, S, 'D12', 'Project name');
  expectLabel(book, S, 'D14', 'Application type');
  expectLabel(book, S, 'D22', 'Target % net gain');
  expectLabel(book, S, 'D23', 'Irreplaceable habitat present');
  const target = number(book.get(S, 'F22'));
  const site = { lpa: text(book.get(S, 'F11')), name: text(book.get(S, 'F12')), applicationType: text(book.get(S, 'F14')), nca: siteNca, target: target ?? 0.1, irreplaceable: /^yes/i.test(text(book.get(S, 'F23'))) };
  if (!site.lpa) throw new Error('The Start sheet has no planning authority (F11).');

  const H = SHEETS.headline;
  expectLabel(book, H, 'B8', 'On-site baseline');
  expectLabel(book, H, 'B12', 'On-site post-intervention');
  const headline = {};
  for (const [type, b, p, label] of [['Habitat', 8, 12, 'Area habitat units'], ['Hedgerow', 9, 13, 'Hedgerow units'], ['Watercourse', 10, 14, 'Watercourse units']]) {
    expectLabel(book, H, 'F' + b, label);
    expectLabel(book, H, 'F' + p, label);
    const baseline = number(book.get(H, 'H' + b));
    const post = number(book.get(H, 'H' + p));
    if (baseline !== null && post !== null && (baseline > 0 || post > 0)) headline[type] = { baseline, post };
  }

  // Off-site habitat already in the metric (Headline Results rows 24 to 26): flagged, because the shortfall above
  // uses the on-site rows.
  expectLabel(book, H, 'B24', 'Off-site post-intervention');
  const hasOffsite = [24, 25, 26].some((r) => (number(book.get(H, 'H' + r)) || 0) > 0);
  site.hasOffsite = hasOffsite;

  const T = SHEETS.trading;
  const rows = [];
  let band = null;
  let sections = 0;
  for (let r = 1; r <= book.maxRow(T); r++) {
    const b = text(book.get(T, 'B' + r));
    if (BAND_OF_SECTION[b]) { if (BAND_OF_SECTION[b] !== band) sections++; band = BAND_OF_SECTION[b]; continue; }
    if (b === 'Habitat group') { expectLabel(book, T, 'F' + r, 'Project'); continue; } // the column read below: project-wide unit change
    if (!band || !b.includes(' - ')) continue;
    const f = number(book.get(T, 'F' + r));
    if (f === null || f === 0) continue;
    rows.push({ row: r, label: b, group: text(book.get(T, 'C' + r)), band, units: f });
  }
  if (sections !== 4) throw new Error(`Unexpected layout: found ${sections} of the 4 distinctiveness sections in ${T}.`);

  return { site, headline, deficits: deficitsFromRows(rows), version, source: { file, sheetsRead: [S, H, T, SHEETS.versions] } };
}

// The page's synthetic sites: the same rows a workbook would hold, through the same netting.
export function scenarioToMetric(lookups, s) {
  const rows = Object.entries(s.changes || {}).map(([label, units]) => {
    const h = lookups.habitats.find((x) => x.label === label);
    if (!h) throw new Error(`"${label}" is not a habitat in the metric`);
    return { label, group: h.broad, band: h.distinctiveness, units };
  });
  return {
    site: { lpa: s.lpa, name: s.name, applicationType: s.applicationType || 'Full planning', nca: s.nca || '', target: s.target ?? 0.1, irreplaceable: !!s.irreplaceable, hasOffsite: false },
    headline: s.headline,
    deficits: deficitsFromRows(rows),
    version: '1.1.0',
    source: { file: s.file, sheetsRead: [] },
  };
}
